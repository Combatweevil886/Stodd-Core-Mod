package stodd.core.gen;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The plan of a dressed island (Ember, Sakura, Overgrown Ruins, Crystal, Skull Cove) or of a floating sky island: which 48 x 48 cells
 * are dressed, which of them carry a landmark (the theme's big centrepiece in the middle, then scattered ones, never two side by
 * side), where each landmark's footprint lies and, on a sky island, where the trees and flowers go. The rules of 52_makeover.js,
 * decided once per island while the world generates.
 */
public final class IslePlanner {
    public static final class Mark {
        public final String id;
        public final int rot, fx, fz, fw, fd;   // rotation 0-3 and the footprint (world x/z of its north-west corner, width, depth)
        public final boolean centre;
        Mark(String id, int rot, int fx, int fz, int fw, int fd, boolean centre) { this.id = id; this.rot = rot; this.fx = fx; this.fz = fz; this.fw = fw; this.fd = fd; this.centre = centre; }

        /** Where the template's origin goes so the rotated template covers the footprint (rotation is about the template's own corner). */
        public int[] origin(WorldRules.Landmark lm) {
            if (rot == 1) return new int[] { fx + lm.sz - 1, fz };
            if (rot == 2) return new int[] { fx + lm.sx - 1, fz + lm.sz - 1 };
            if (rot == 3) return new int[] { fx, fz + lm.sx - 1 };
            return new int[] { fx, fz };
        }
    }

    public static final class Cell {
        public final int i, j, x, z;
        public final double d;
        public Mark mark;
        public final List<int[]> features = new ArrayList<>();   // sky islands: {x, z, feature index}
        Cell(int i, int j, int x, int z, double d) { this.i = i; this.j = j; this.x = x; this.z = z; this.d = d; }
    }

    public static final class Plan {
        public final String key, theme;      // theme = the dressed theme id, or "sky"
        public final boolean sky;
        public final int cx, cz;
        public final WorldRules.SkyStyle skyStyle;
        public final List<Cell> cells;
        private final Map<Long, Cell> byOrigin = new HashMap<>();
        Plan(String key, String theme, boolean sky, int cx, int cz, WorldRules.SkyStyle style, List<Cell> cells) {
            this.key = key; this.theme = theme; this.sky = sky; this.cx = cx; this.cz = cz; this.skyStyle = style;
            this.cells = Collections.unmodifiableList(cells);
            for (Cell c : cells) byOrigin.put(IslandFinder.pack(c.x, c.z), c);
        }
        public Cell cellAt(int x, int z) { return byOrigin.get(IslandFinder.pack(x, z)); }
        public int landmarks() { int n = 0; for (Cell c : cells) if (c.mark != null) n++; return n; }
    }

    private final WorldRules rules;
    private final Map<String, Plan> plans = new ConcurrentHashMap<>();

    public IslePlanner(WorldRules rules) { this.rules = rules; }

    static long h2(int a, int b, int salt, int seed) { return Hash.hash3(a * 7919 + 13, b * 104729 - 7, seed ^ salt); }

    /** The plan of a dressed ground island, or null when the island has no dressed theme. */
    public Plan ground(IslandFinder f, IslandFinder.Island isl, int seed) {
        WorldRules.IsleTheme th = rules.isleAt(isl.cx, isl.cz, seed);
        if (th == null) return null;
        String k = "g" + seed + ":" + isl.key();
        Plan p = plans.get(k);
        if (p != null) return p;
        p = buildGround(f, isl, th, seed);
        return remember(k, p);
    }

    /** The plan of a sky island (the probe field says where the island is solid), or null when sky islands are not dressed. */
    public Plan sky(IslandFinder probe, IslandFinder.Island isl, int seed) {
        if (!rules.skyDress || !rules.skyEnabled || isl.radius < rules.skyMinRadius) return null;
        String k = "s" + seed + ":" + isl.key();
        Plan p = plans.get(k);
        if (p != null) return p;
        p = buildSky(probe, isl, seed);
        return remember(k, p);
    }

    private Plan remember(String k, Plan p) {
        if (plans.size() > 2000) plans.clear();
        Plan old = plans.putIfAbsent(k, p);
        return old != null ? old : p;
    }

    private Plan buildGround(IslandFinder f, IslandFinder.Island isl, WorldRules.IsleTheme th, int seed) {
        int CELL = rules.cell, half = CELL / 2, R = rules.isleRadius;
        double THR = rules.landThreshold + rules.isleLandMargin;
        int x0 = isl.cx - half, z0 = isl.cz - half;
        int N = (int) Math.ceil(R / (double) CELL) + 1;
        List<Cell> cells = new ArrayList<>();
        for (int i = -N; i <= N; i++) for (int j = -N; j <= N; j++) {
            int x = x0 + i * CELL, z = z0 + j * CELL, mx = x + half, mz = z + half;
            double d = Math.hypot(mx - isl.cx, mz - isl.cz);
            if (!(i == 0 && j == 0)) {
                if (d > R) continue;
                int[][] pts = { { mx, mz }, { x, z }, { x + CELL - 1, z }, { x, z + CELL - 1 }, { x + CELL - 1, z + CELL - 1 } };
                boolean ok = true;
                for (int[] pt : pts) if (f.sample(pt[0], pt[1]) < THR) { ok = false; break; }
                if (!ok || !isl.contains(mx, mz)) continue;
            }
            cells.add(new Cell(i, j, x, z, d));
        }
        int isle = (int) Hash.hash3(isl.cx, isl.cz, seed ^ 0x1b873593);
        // the centrepiece
        List<Cell> taken = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (String id : th.center) if (rules.landmarks.containsKey(id)) ids.add(id);
        if (!ids.isEmpty()) {
            String cid = ids.get((int) (h2(isl.cx, isl.cz, 0x4c8a1b37, seed) % ids.size()));
            int rot = th.centerRot >= 0 ? th.centerRot & 3 : (int) ((h2(0, 0, 0x6d2b79f5, seed ^ isle) >>> 9) & 3);
            for (Cell c : cells) if (c.i == 0 && c.j == 0) {
                c.mark = footprint(c, rules.landmarks.get(cid), rot, true, seed ^ isle);
                taken.add(c);
            }
        }
        scatter(cells, taken, th.scatter, th.density, false, null, seed ^ isle);
        return new Plan(isl.key(), th.id, false, isl.cx, isl.cz, null, cells);
    }

    private Plan buildSky(IslandFinder probe, IslandFinder.Island isl, int seed) {
        int CELL = rules.cell, half = CELL / 2;
        int rad = isl.radius + 24;
        int x0 = isl.cx - half, z0 = isl.cz - half;
        int N = (int) Math.ceil(rad / (double) CELL) + 1;
        List<Cell> cells = new ArrayList<>();
        for (int i = -N; i <= N; i++) for (int j = -N; j <= N; j++) {
            int x = x0 + i * CELL, z = z0 + j * CELL, mx = x + half, mz = z + half;
            double d = Math.hypot(mx - isl.cx, mz - isl.cz);
            if (!(i == 0 && j == 0)) {
                if (d > rad) continue;
                if (!(probe.sample(mx, mz) > 0)) continue;
                if (!isl.contains(mx, mz)) continue;
            }
            cells.add(new Cell(i, j, x, z, d));
        }
        WorldRules.SkyStyle style = rules.skyStyles.isEmpty() ? null : rules.skyStyles.get((int) (h2(isl.cx, isl.cz, 0x1f3d5b79, seed) % rules.skyStyles.size()));
        int isle = (int) Hash.hash3(isl.cx, isl.cz, seed ^ 0x1b873593);
        scatter(cells, new ArrayList<>(), rules.skyScatter, rules.skyDensity, true, probe, seed ^ isle);
        // trees, flowers and boulders: a few spots per cell, well inside the island, never near the middle (the waystone) or a landmark
        if (style != null && !style.features.isEmpty()) {
            double total = 0;
            for (WorldRules.Weighted w : style.features) total += w.weight;
            for (Cell c : cells) {
                for (int k = 0; k < rules.skyPerCell; k++) {
                    long hx = h2(c.i * 31 + k, c.j, 0x2c1b3c6d, seed ^ isle), hz = h2(c.j * 31 + k, c.i, 0x1b56c4e9, seed ^ isle);
                    int x = c.x + 2 + (int) (hx % (CELL - 4)), z = c.z + 2 + (int) (hz % (CELL - 4));
                    if (Math.abs(x - isl.cx) < 7 && Math.abs(z - isl.cz) < 7) continue;
                    Mark m = c.mark;
                    if (m != null && x >= m.fx - 2 && x <= m.fx + m.fw + 2 && z >= m.fz - 2 && z <= m.fz + m.fd + 2) continue;
                    if (!(probe.sample(x, z) > 0) || !(probe.sample(x + 3, z) > 0) || !(probe.sample(x - 3, z) > 0) || !(probe.sample(x, z + 3) > 0) || !(probe.sample(x, z - 3) > 0)) continue;
                    double r = (h2(x, z, 0x3d4e5f61, seed) % 100000) / 100000.0 * total;
                    int pick = 0;
                    for (int q = 0; q < style.features.size(); q++) { r -= style.features.get(q).weight; if (r < 0) { pick = q; break; } }
                    c.features.add(new int[] { x, z, pick });
                }
            }
        }
        return new Plan(isl.key(), "sky", true, isl.cx, isl.cz, style, cells);
    }

    /** The landmark's footprint in its cell: centred for the centrepiece, otherwise somewhere inside the cell with a 1-block border. */
    private Mark footprint(Cell c, WorldRules.Landmark lm, int rot, boolean centre, int seed) {
        int fw = (rot & 1) != 0 ? lm.sz : lm.sx, fd = (rot & 1) != 0 ? lm.sx : lm.sz;
        int CELL = rules.cell, ox, oz;
        if (centre) { ox = CELL / 2 - (fw - 1) / 2; oz = CELL / 2 - (fd - 1) / 2; }
        else {
            int room = CELL - fw - 1, roomZ = CELL - fd - 1;
            ox = room > 0 ? 1 + (int) ((h2(c.i, c.j, 0x1b873593, seed) >>> 3) % room) : 0;
            oz = roomZ > 0 ? 1 + (int) ((h2(c.j, c.i, 0x2f0b3c6d, seed) >>> 5) % roomZ) : 0;
        }
        ox = Math.max(0, Math.min(ox, CELL - fw));
        oz = Math.max(0, Math.min(oz, CELL - fd));
        return new Mark(lm.id, rot, c.x + ox, c.z + oz, fw, fd, centre);
    }

    /** a sky-island landmark must stand wholly on the island, with 3 blocks to spare at every corner */
    private static boolean onSky(IslandFinder probe, Mark m) {
        for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) {
            int x = m.fx + (m.fw - 1) * a / 2, z = m.fz + (m.fd - 1) * b / 2;
            if (!(probe.sample(x, z) > 0)) return false;
        }
        int g = 3;
        int[][] ex = { { m.fx - g, m.fz - g }, { m.fx + m.fw - 1 + g, m.fz - g }, { m.fx - g, m.fz + m.fd - 1 + g }, { m.fx + m.fw - 1 + g, m.fz + m.fd - 1 + g } };
        for (int[] e : ex) if (!(probe.sample(e[0], e[1]) > 0)) return false;
        return true;
    }

    private void scatter(List<Cell> cells, List<Cell> taken, List<WorldRules.Weighted> list, double density, boolean sky, IslandFinder probe, int seed) {
        double total = 0;
        for (WorldRules.Weighted w : list) if (rules.landmarks.containsKey(w.id)) total += w.weight;
        if (total <= 0) return;
        int want = Math.min(rules.maxLandmarks, Math.max(sky ? 1 : 2, (int) Math.round(cells.size() * rules.landmarkDensity * density)));
        List<Cell> cand = new ArrayList<>();
        for (Cell c : cells) if (!(c.i == 0 && c.j == 0) && Math.max(Math.abs(c.i), Math.abs(c.j)) >= (sky ? 1 : 2)) cand.add(c);
        final int s = seed;
        cand.sort(Comparator.comparingLong((Cell c) -> h2(c.i, c.j, 0x5bd1e995, s)).thenComparingInt(c -> c.i).thenComparingInt(c -> c.j));
        int got = 0;
        for (Cell c : cand) {
            if (got >= want) break;
            boolean clash = false;
            for (Cell t : taken) if (Math.max(Math.abs(t.i - c.i), Math.abs(t.j - c.j)) <= 1) { clash = true; break; }
            if (clash) continue;
            int rot = (int) ((h2(c.j, c.i, 0x3c6ef372, seed) >>> 11) & 3);
            Mark pick = null;
            for (int tr = 0; tr < 3 && pick == null; tr++) {
                double r = (h2(c.i + 5 + tr * 977, c.j - 3 - tr * 613, 0x7a3c91d5, seed) % 100000) / 100000.0 * total;
                WorldRules.Weighted cw = null;
                for (WorldRules.Weighted w : list) {
                    if (!rules.landmarks.containsKey(w.id)) continue;
                    r -= w.weight;
                    cw = w;
                    if (r < 0) break;
                }
                if (cw == null) break;
                Mark m = footprint(c, rules.landmarks.get(cw.id), rot, false, seed);
                if (sky && probe != null && !onSky(probe, m)) continue;
                pick = m;
            }
            if (pick == null) continue;
            c.mark = pick;
            taken.add(c);
            got++;
        }
    }
}
