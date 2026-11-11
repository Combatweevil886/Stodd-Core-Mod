package stodd.core.gen;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * What a player's Log Pose points at, once a second: the island in the chosen mode, recording the island the player stands on,
 * "you have arrived". No Minecraft classes, so the whole behaviour is tested here; the item and the client needle only display it.
 *
 * Modes (00_config.js logPose.modes): next = nearest island not recorded yet (sky islands while the player is up high),
 * any = nearest island, themes = nearest island of the listed themes (the cities), sky = nearest sky island.
 */
public final class LogPoseBrain {
    /** What the Log Pose remembers for one player between seconds (not saved: rebuilt after a relog). */
    public static final class State {
        String cur;
        long since, nearSince = -1, last = -9999;
        String target;
        int tx, tz;
        Info tinfo;
        boolean up;
        int mode = -1;
        String arrived = "";
        int empty;
    }

    /** An island as the Log Pose shows it. */
    public static final class Info {
        public final String key, name, kind, color;
        public final int x, z;
        public final boolean sky;
        Info(String key, String name, String kind, String color, int x, int z, boolean sky) { this.key = key; this.name = name; this.kind = kind; this.color = color; this.x = x; this.z = z; this.sky = sky; }
    }

    /** One second's outcome. */
    public static final class Out {
        public boolean hasTarget, pending;
        public int tx, tz;
        public Info target, here, recorded, arrived;
        public double dist;
        public int dwellLeft = -1, dwellTotal;
        public boolean hereRecorded;
        public String modeName = "";
        public boolean changed;      // the target changed this second (the needle should update)
    }

    private final WorldRules rules;
    private final IslandIndex index;
    private final int seed;
    private final int budget;

    public LogPoseBrain(WorldRules rules, IslandIndex index, int seed, int budget) { this.rules = rules; this.index = index; this.seed = seed; this.budget = budget; }

    public Info info(IslandFinder.Island isl, boolean sky) {
        if (sky) return new Info("sky:" + isl.key(), rules.skyName(isl.cx, isl.cz, seed), "Sky", "aqua", isl.cx, isl.cz, true);
        WorldRules.Theme t = rules.themeAt(isl.cx, isl.cz, seed);
        return new Info(isl.key(), rules.groundName(t, isl.cx, isl.cz, seed), t.name, t.color, isl.cx, isl.cz, false);
    }

    private static final class Pick { Info info; double d; boolean pending; }

    private boolean matches(WorldRules.Mode m, Info i) {
        if (!m.kind.equals("themes")) return true;
        if (i.sky) return false;
        WorldRules.Theme t = rules.themeAt(i.x, i.z, seed);
        return m.themes.contains(t.id);
    }

    /** Nearest island that is not excluded; the current target is kept unless something is clearly (15%) nearer. */
    private Pick next(double x, double z, Set<String> excl, String prefKey, boolean sky, WorldRules.Mode mode) {
        for (int R : rules.lpRadii) {
            IslandIndex.Result res = index.near((int) Math.floor(x), (int) Math.floor(z), R, budget, sky);
            Pick best = null, pref = null;
            for (IslandIndex.Hit h : res.list) {
                Info i = info(h.island, h.sky);
                if (excl.contains(i.key)) continue;
                if (mode != null && !matches(mode, i)) continue;
                Pick p = new Pick();
                p.info = i; p.d = Math.hypot(i.x - x, i.z - z);
                if (best == null || p.d < best.d) best = p;
                if (i.key.equals(prefKey)) pref = p;
            }
            if (best != null) {
                Pick pk = (pref != null && pref.d <= best.d * 1.15) ? pref : best;
                pk.pending = !res.complete;
                return pk;
            }
            if (!res.complete) { Pick p = new Pick(); p.pending = true; return p; }
        }
        return null;
    }

    /** The island under a player: the sky island when up high over one, else the ground island (null over the sea). */
    public Info here(double x, double y, double z) {
        boolean high = y >= index.skyMinY();
        if (high && index.sky() != null && rules.skyEnabled) {
            int ix = (int) Math.floor(x), iz = (int) Math.floor(z);
            IslandFinder.Island s = index.sky().isLand(ix, iz) ? index.sky().islandAt(ix, iz) : null;
            if (s != null && s.radius >= index.skyMinRadius()) return info(s, true);
        }
        IslandFinder.Island g = index.ground().islandAt((int) Math.floor(x), (int) Math.floor(z));
        return g == null ? null : info(g, false);
    }

    /**
     * @param seen the player's recorded islands (keys), oldest first; a newly recorded island is appended (and the oldest dropped)
     */
    public Out tick(State s, double x, double y, double z, long now, int modeIdx, List<String> seen) {
        Out o = new Out();
        List<WorldRules.Mode> modes = rules.lpModes;
        int mi = modeIdx >= 0 && modeIdx < modes.size() ? modeIdx : 0;
        WorldRules.Mode mode = modes.get(mi);
        o.modeName = mode.name;
        if (s.mode != mi) { s.mode = mi; s.target = null; s.tinfo = null; }
        // up in the sky: above the sky islands' height (logPose.skyMinY, 0 = from the sky-island settings) and not standing on high
        // ground of a ground island
        int upY = rules.lpSkyMinY > 0 ? rules.lpSkyMinY : index.skyMinY();
        boolean up = rules.skyEnabled && index.sky() != null && y >= upY
            && (index.sky().isLand((int) Math.floor(x), (int) Math.floor(z)) || !index.ground().isLand((int) Math.floor(x), (int) Math.floor(z)));
        if (up != s.up) { s.up = up; if (mode.kind.equals("next")) { s.target = null; s.tinfo = null; } }
        boolean wantSky = mode.kind.equals("sky") || (mode.kind.equals("next") && up);
        Info here = here(x, up ? y : 0, z);
        o.here = here;
        Set<String> seenSet = new HashSet<>(seen);
        if (here != null) {
            if (!here.key.equals(s.cur) || now - s.last > 200) { s.cur = here.key; s.since = now; s.nearSince = -1; }
            s.last = now;
            double cd = Math.hypot(here.x - x, here.z - z);
            boolean near = cd <= rules.lpCenterRadius;
            if (near) { if (s.nearSince < 0) s.nearSince = now; } else s.nearSince = -1;
            if (!seenSet.contains(here.key)) {
                long left = rules.lpDwell - (now - s.since);
                if (s.nearSince >= 0) left = Math.min(left, rules.lpCenterTicks - (now - s.nearSince));
                if (left <= 0) {
                    seen.add(here.key);
                    while (seen.size() > rules.lpMaxRecorded) seen.remove(0);
                    seenSet.add(here.key);
                    o.recorded = here;
                } else { o.dwellLeft = (int) left; o.dwellTotal = s.nearSince >= 0 ? rules.lpCenterTicks : rules.lpDwell; }
            } else o.hereRecorded = true;
        }
        Set<String> excl = new HashSet<>();
        if (mode.kind.equals("next")) excl.addAll(seenSet);
        if (here != null) excl.add(here.key);
        Pick nx = next(x, z, excl, s.target, wantSky, mode.kind.equals("themes") ? mode : null);
        // "next island" with everything nearby recorded: the nearest island that is not the one underfoot
        if (mode.kind.equals("next") && nx != null && nx.info == null && !nx.pending) nx = null;
        if (mode.kind.equals("next") && nx == null) {
            Set<String> ex2 = new HashSet<>();
            if (here != null) ex2.add(here.key);
            nx = next(x, z, ex2, s.target, wantSky, null);
        }
        o.pending = nx != null && nx.info == null && nx.pending;
        String before = s.target;
        if (nx != null && nx.info != null) {
            if (!nx.info.key.equals(s.target)) { s.target = nx.info.key; s.arrived = ""; }
            s.tinfo = nx.info; s.tx = nx.info.x; s.tz = nx.info.z;
            s.empty = 0;
        } else if (nx == null) { s.empty++; if (s.empty > 2) { s.target = null; s.tinfo = null; } }
        o.changed = before == null ? s.target != null : !before.equals(s.target);
        if (s.target != null && s.tinfo != null) {
            o.hasTarget = true;
            o.tx = s.tx; o.tz = s.tz; o.target = s.tinfo;
            o.dist = Math.hypot(s.tx - x, s.tz - z);
            if (o.dist <= rules.lpArriveRadius) {
                if (!s.target.equals(s.arrived) && !mode.kind.equals("next")) o.arrived = s.tinfo;
                s.arrived = s.target;
            }
        }
        return o;
    }

    /** The eight arrows the action bar uses, relative to where the player is facing (yaw in degrees, Minecraft's convention). */
    public static String arrow(double px, double pz, float yaw, double tx, double tz) {
        String[] a = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };
        double want = Math.atan2(-(tx - px), tz - pz) * 180 / Math.PI;
        double rel = (((want - yaw) % 360) + 540) % 360 - 180;
        return a[(int) ((Math.round(rel / 45) % 8 + 8) % 8)];
    }

    /** A recording bar, 8 segments. */
    public static String bar(int done, int total) {
        int n = 8, f = Math.max(0, Math.min(n, (int) Math.round(n * done / (double) Math.max(1, total))));
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) b.append(i < f ? '▮' : '▯');
        return b.toString();
    }

    /**
     * The needle: the value of the item's "angle" property, as vanilla's compass computes it (0 = the needle points straight ahead).
     * yaw in degrees, Minecraft's convention (0 = facing +Z).
     */
    public static float angle(double px, double pz, double yawDeg, double tx, double tz) {
        double d1 = pmod(yawDeg / 360.0, 1.0);
        double d2 = Math.atan2(tz + 0.5 - pz, tx + 0.5 - px) / (Math.PI * 2);
        return (float) pmod(0.5 - (d1 - 0.25 - d2), 1.0);
    }

    static double pmod(double a, double b) { double r = a % b; return r < 0 ? r + b : r; }

    /** Copy helper for callers that keep the recorded list elsewhere. */
    public static List<String> copy(List<String> l) { return new ArrayList<>(l); }
}
