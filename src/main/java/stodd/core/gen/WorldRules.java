package stodd.core.gen;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything the Java side shares with the KubeJS scripts: island themes and their rolls, names, the city styles with their
 * templates and districts, the dressed-island themes with their landmarks, the sky islands and the Log Pose settings.
 *
 * Built from the object 02_rules.js makes out of 00_config.js / 01_content.js. The jar carries a copy (stodd_world.json, made at
 * build time with the same function); when KubeJS loads, 49_city.js hands over the live one (StoddApi.configure). Immutable;
 * replaced as a whole.
 */
public final class WorldRules {
    // ------------------------------------------------------------------ pieces
    public static final class Theme {
        public final String id, name, color;
        public final double weight, chance;
        public final boolean hidden, active;
        public final Double minOriginDistance;
        Theme(Map<String, Object> m) {
            id = MiniJson.str(m.get("id"), "?"); name = MiniJson.str(m.get("name"), id); color = MiniJson.str(m.get("color"), "white");
            weight = MiniJson.num(m.get("weight"), 0); chance = MiniJson.num(m.get("chance"), 0);
            hidden = MiniJson.bool(m.get("hidden"), false); active = MiniJson.bool(m.get("active"), true);
            Object o = m.get("minOriginDistance");
            minOriginDistance = o instanceof Number ? ((Number) o).doubleValue() : null;
        }
        public boolean isCity() { return id.startsWith("city"); }
    }

    public static final class Band {
        public final String id;
        public final double lo, hi;
        public final Double minOriginDistance;
        public final boolean on;
        Band(Map<String, Object> b) {
            id = MiniJson.str(b.get("id"), "?"); lo = MiniJson.num(b.get("lo"), 0); hi = MiniJson.num(b.get("hi"), 0);
            Object mod = b.get("minOriginDistance");
            minOriginDistance = mod instanceof Number ? ((Number) mod).doubleValue() : null;
            on = MiniJson.bool(b.get("on"), true);
        }
    }

    public static final class Template {
        public final String id, kind;
        public final double weight;
        public final int height;
        Template(Map<String, Object> m) {
            id = MiniJson.str(m.get("id"), "?"); kind = MiniJson.str(m.get("kind"), ""); weight = MiniJson.num(m.get("weight"), 1); height = (int) MiniJson.num(m.get("height"), 30);
        }
    }

    public static final class Zone {
        public final double upTo;
        public final Map<String, Double> kind;
        Zone(Map<String, Object> m) {
            upTo = MiniJson.num(m.get("upTo"), 9.99);
            Map<String, Double> k = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : MiniJson.obj(m.get("kind")).entrySet()) k.put(e.getKey(), MiniJson.num(e.getValue(), 1));
            kind = Collections.unmodifiableMap(k);
        }
    }

    public static final class Style {
        public final String id;
        public final List<String> plazas;
        public final Map<String, Integer> plazaHeights;
        public final int plazaHeight;
        public final String foundation, biome;
        public final List<Template> templates;
        public final List<Zone> zones;
        Style(String id, Map<String, Object> s) {
            this.id = id;
            List<String> pl = new ArrayList<>();
            for (Object p : MiniJson.arr(s.get("plazas"))) if (p instanceof String) pl.add((String) p);
            plazas = Collections.unmodifiableList(pl);
            Map<String, Integer> ph = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : MiniJson.obj(s.get("plazaHeights")).entrySet()) ph.put(e.getKey(), (int) MiniJson.num(e.getValue(), 8));
            plazaHeights = Collections.unmodifiableMap(ph);
            plazaHeight = (int) MiniJson.num(s.get("plazaHeight"), 8);
            foundation = MiniJson.str(s.get("foundation"), "minecraft:stone_bricks");
            biome = MiniJson.str(s.get("biome"), "stodd:metropolis");
            List<Template> tl = new ArrayList<>();
            for (Object t : MiniJson.arr(s.get("templates"))) tl.add(new Template(MiniJson.obj(t)));
            templates = Collections.unmodifiableList(tl);
            List<Zone> zl = new ArrayList<>();
            for (Object z : MiniJson.arr(s.get("zones"))) zl.add(new Zone(MiniJson.obj(z)));
            zones = Collections.unmodifiableList(zl);
        }
        public int plazaHeightOf(String id) { Integer h = plazaHeights.get(id); return h != null ? h : plazaHeight; }
    }

    public static final class Weighted {
        public final String id;
        public final double weight;
        Weighted(String id, double weight) { this.id = id; this.weight = weight; }
    }

    public static final class Landmark {
        public final String id;
        public final int sx, sy, sz, foot;
        Landmark(String id, Map<String, Object> m) {
            this.id = id;
            List<Object> s = MiniJson.arr(m.get("size"));
            sx = s.size() > 0 ? (int) MiniJson.num(s.get(0), 15) : 15;
            sy = s.size() > 1 ? (int) MiniJson.num(s.get(1), 10) : 10;
            sz = s.size() > 2 ? (int) MiniJson.num(s.get(2), 15) : 15;
            foot = (int) MiniJson.num(m.get("foot"), 3);
        }
    }

    public static final class IsleTheme {
        public final String id, biome, foundation;
        public final double density;
        public final List<String[]> paint;
        public final List<String> center;
        public final int centerRot;
        public final List<Weighted> scatter;
        IsleTheme(String id, Map<String, Object> m) {
            this.id = id;
            biome = MiniJson.str(m.get("biome"), null);
            foundation = MiniJson.str(m.get("foundation"), "minecraft:stone_bricks");
            density = MiniJson.num(m.get("density"), 1);
            List<String[]> p = new ArrayList<>();
            for (Object r : MiniJson.arr(m.get("paint"))) {
                List<Object> rr = MiniJson.arr(r);
                if (rr.size() >= 2) p.add(new String[] { MiniJson.str(rr.get(0), ""), MiniJson.str(rr.get(1), "minecraft:air") });
            }
            paint = Collections.unmodifiableList(p);
            List<String> c = new ArrayList<>();
            for (Object o : MiniJson.arr(m.get("center"))) if (o instanceof String) c.add((String) o);
            center = Collections.unmodifiableList(c);
            centerRot = (int) MiniJson.num(m.get("centerRot"), -1);
            scatter = weighted(m.get("scatter"));
        }
    }

    public static final class SkyStyle {
        public final String name;
        public final List<Weighted> features;
        SkyStyle(Map<String, Object> m) {
            name = MiniJson.str(m.get("name"), "meadow");
            List<Weighted> f = new ArrayList<>();
            for (Object o : MiniJson.arr(m.get("features"))) {
                List<Object> r = MiniJson.arr(o);
                if (r.size() >= 2) f.add(new Weighted(MiniJson.str(r.get(0), ""), MiniJson.num(r.get(1), 1)));
            }
            features = Collections.unmodifiableList(f);
        }
    }

    public static final class Mode {
        public final String id, name, kind;
        public final List<String> themes;
        Mode(Map<String, Object> m) {
            id = MiniJson.str(m.get("id"), "next"); name = MiniJson.str(m.get("name"), "Next island"); kind = MiniJson.str(m.get("kind"), "next");
            List<String> t = new ArrayList<>();
            for (Object o : MiniJson.arr(m.get("themes"))) if (o instanceof String) t.add((String) o);
            themes = Collections.unmodifiableList(t);
        }
    }

    static List<Weighted> weighted(Object o) {
        List<Weighted> out = new ArrayList<>();
        for (Object x : MiniJson.arr(o)) {
            Map<String, Object> m = MiniJson.obj(x);
            out.add(new Weighted(MiniJson.str(m.get("id"), "?"), MiniJson.num(m.get("weight"), 1)));
        }
        return Collections.unmodifiableList(out);
    }

    // ------------------------------------------------------------------ the rules
    public final String source;
    public final double landThreshold;
    public final int peakStep;
    public final String oceanTheme;
    public final List<Theme> themes;
    public final Map<String, Theme> themeById;
    public final List<Theme> rolled;          // ordinary themes in roll order (active, not hidden, no chance)
    public final List<Band> bands;
    public final Map<String, List<String>> names;
    public final List<String> syllables;
    // cities
    public final boolean cityEnabled;
    public final double cityMinOriginDistance;
    public final int cell, radius, baseMin, baseMax, sampleStep, foundationMax, floorMin, cutCap, biomeBelow, biomeAbove;
    public final double landMargin;
    public final double villagers, golems;                 // per 48 x 48 city block, on average
    public final double deepVillages;                      // share of sunken islands with a village
    public final String deepVillageStyle;
    public final int deepVillageRadius;
    public final boolean waystonesWorldgen;
    public final Map<String, String> waystoneStyles;
    public final Map<String, Style> styles;
    // dressed islands and sky-island dressing
    public final boolean isleEnabled;
    public final int isleRadius, isleCutCap, isleBiomeBelow, isleBiomeAbove, maxLandmarks, isleFoundationMax;
    public final double isleLandMargin, landmarkDensity;
    public final Map<String, IsleTheme> isles;
    public final Map<String, Landmark> landmarks;
    public final boolean skyDress;
    public final String skyBiome, skyFoundation;
    public final int skyBiomeLow, skyBiomeHigh, skyPerCell;
    public final double skyDensity;
    public final List<SkyStyle> skyStyles;
    public final List<Weighted> skyScatter;
    // sky islands
    public final boolean skyEnabled;
    public final int skyMinY, skyProbeY, skyScanStep, skyMinRadius;
    // log pose
    public final int lpDwell, lpCenterTicks, lpCenterRadius, lpArriveRadius, lpMaxRecorded, lpSkyMinY;
    public final boolean lpGive;
    public final List<Integer> lpRadii;
    public final List<Mode> lpModes;
    // origins and the power systems
    public final OriginRules origins;

    private WorldRules(Map<String, Object> m, String source) {
        this.source = source;
        landThreshold = MiniJson.num(m.get("landThreshold"), -0.19);
        peakStep = (int) MiniJson.num(m.get("peakStep"), 32);
        oceanTheme = MiniJson.str(m.get("oceanTheme"), "one_piece");
        List<Theme> tl = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("themes"))) tl.add(new Theme(MiniJson.obj(o)));
        themes = Collections.unmodifiableList(tl);
        Map<String, Theme> tb = new LinkedHashMap<>();
        List<Theme> ro = new ArrayList<>();
        for (Theme t : tl) {
            tb.put(t.id, t);
            if (t.active && t.chance <= 0 && !t.hidden) ro.add(t);
        }
        themeById = Collections.unmodifiableMap(tb);
        rolled = Collections.unmodifiableList(ro);
        List<Band> bl = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("bands"))) bl.add(new Band(MiniJson.obj(o)));
        bands = Collections.unmodifiableList(bl);
        Map<String, List<String>> nm = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("names")).entrySet()) {
            List<String> l = new ArrayList<>();
            for (Object o : MiniJson.arr(e.getValue())) if (o instanceof String) l.add((String) o);
            nm.put(e.getKey(), Collections.unmodifiableList(l));
        }
        names = Collections.unmodifiableMap(nm);
        List<String> sy = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("syllables"))) if (o instanceof String) sy.add((String) o);
        if (sy.isEmpty()) sy.add("ka");
        syllables = Collections.unmodifiableList(sy);

        Map<String, Object> c = MiniJson.obj(m.get("city"));
        cityEnabled = MiniJson.bool(c.get("enabled"), true);
        cityMinOriginDistance = MiniJson.num(c.get("minOriginDistance"), 900);
        cell = (int) MiniJson.num(c.get("cell"), 48);
        radius = (int) MiniJson.num(c.get("radius"), 300);
        landMargin = MiniJson.num(c.get("landMargin"), 0.04);
        baseMin = (int) MiniJson.num(c.get("baseMin"), 66);
        baseMax = (int) MiniJson.num(c.get("baseMax"), 78);
        sampleStep = Math.max(8, (int) MiniJson.num(c.get("sampleStep"), 28));
        foundationMax = (int) MiniJson.num(c.get("foundationMax"), 40);
        floorMin = (int) MiniJson.num(c.get("floorMin"), -58);
        cutCap = (int) MiniJson.num(c.get("cutCap"), 148);
        biomeBelow = (int) MiniJson.num(c.get("biomeBelow"), 8);
        biomeAbove = (int) MiniJson.num(c.get("biomeAbove"), 104);
        villagers = Math.max(0, MiniJson.num(c.get("villagers"), 0.4));
        golems = Math.max(0, MiniJson.num(c.get("golems"), 0.04));
        Map<String, Object> dp = MiniJson.obj(m.get("deep"));
        deepVillages = Math.max(0, Math.min(1, MiniJson.num(dp.get("villages"), 0.6)));
        deepVillageStyle = MiniJson.str(dp.get("villageStyle"), "city_primitive");
        deepVillageRadius = Math.max(48, (int) MiniJson.num(dp.get("villageRadius"), 140));
        Map<String, Object> wsj = MiniJson.obj(m.get("waystones"));
        waystonesWorldgen = MiniJson.bool(wsj.get("worldgen"), true);
        Map<String, String> wst = new java.util.HashMap<>();
        String[][] defs = { { "one_piece", "waystones:sandy_waystone" }, { "jujutsu", "waystones:blackstone_waystone" }, { "cyberpunk", "waystones:deepslate_waystone" },
            { "arcane", "waystones:waystone" }, { "wild", "waystones:mossy_waystone" }, { "city", "waystones:deepslate_waystone" }, { "sky", "waystones:waystone" },
            { "city_future", "waystones:waystone" }, { "city_primitive", "waystones:sandy_waystone" }, { "ember", "waystones:blackstone_waystone" },
            { "sakura", "waystones:waystone" }, { "ruins", "waystones:mossy_waystone" }, { "crystal", "waystones:deepslate_waystone" }, { "skull", "waystones:sandy_waystone" },
            { "deep", "waystones:deepslate_waystone" } };
        for (String[] d : defs) wst.put(d[0], d[1]);
        for (Map.Entry<String, Object> e : MiniJson.obj(wsj.get("styles")).entrySet()) if (e.getValue() instanceof String) wst.put(e.getKey(), (String) e.getValue());
        waystoneStyles = Collections.unmodifiableMap(wst);
        Map<String, Style> sm = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(c.get("styles")).entrySet()) sm.put(e.getKey(), new Style(e.getKey(), MiniJson.obj(e.getValue())));
        styles = Collections.unmodifiableMap(sm);

        Map<String, Object> mo = MiniJson.obj(m.get("makeover"));
        isleEnabled = MiniJson.bool(mo.get("enabled"), true);
        isleRadius = (int) MiniJson.num(mo.get("radius"), 330);
        isleLandMargin = MiniJson.num(mo.get("landMargin"), 0.06);
        isleCutCap = (int) MiniJson.num(mo.get("cutCap"), 148);
        isleBiomeBelow = (int) MiniJson.num(mo.get("biomeBelow"), 12);
        isleBiomeAbove = (int) MiniJson.num(mo.get("biomeAbove"), 60);
        landmarkDensity = MiniJson.num(mo.get("landmarkDensity"), 0.15);
        maxLandmarks = (int) MiniJson.num(mo.get("maxLandmarks"), 40);
        isleFoundationMax = (int) MiniJson.num(mo.get("foundationMax"), 14);
        Map<String, IsleTheme> im = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(mo.get("themes")).entrySet()) im.put(e.getKey(), new IsleTheme(e.getKey(), MiniJson.obj(e.getValue())));
        isles = Collections.unmodifiableMap(im);
        Map<String, Landmark> lm = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(mo.get("landmarks")).entrySet()) lm.put(e.getKey(), new Landmark(e.getKey(), MiniJson.obj(e.getValue())));
        landmarks = Collections.unmodifiableMap(lm);
        Map<String, Object> sk = MiniJson.obj(mo.get("sky"));
        skyDress = MiniJson.bool(sk.get("enabled"), true);
        skyBiome = MiniJson.str(sk.get("biome"), "");   // "" = the natural biomes (3.1)
        skyBiomeLow = (int) MiniJson.num(sk.get("biomeLow"), 146);
        skyBiomeHigh = (int) MiniJson.num(sk.get("biomeHigh"), 262);
        skyPerCell = (int) MiniJson.num(sk.get("perCell"), 5);
        skyDensity = MiniJson.num(sk.get("density"), 0.9);
        skyFoundation = MiniJson.str(sk.get("foundation"), "minecraft:stone");
        List<SkyStyle> ss = new ArrayList<>();
        for (Object o : MiniJson.arr(sk.get("styles"))) ss.add(new SkyStyle(MiniJson.obj(o)));
        skyStyles = Collections.unmodifiableList(ss);
        skyScatter = weighted(sk.get("scatter"));

        Map<String, Object> sky = MiniJson.obj(m.get("sky"));
        skyEnabled = MiniJson.bool(sky.get("enabled"), true);
        skyMinY = (int) MiniJson.num(sky.get("minY"), 200);
        skyProbeY = (int) MiniJson.num(sky.get("probeY"), 227);
        skyScanStep = Math.max(16, (int) MiniJson.num(sky.get("scanStep"), 64));
        skyMinRadius = (int) MiniJson.num(sky.get("minRadius"), 48);

        Map<String, Object> lp = MiniJson.obj(m.get("logPose"));
        lpDwell = (int) MiniJson.num(lp.get("dwellTicks"), 600);
        lpCenterTicks = (int) MiniJson.num(lp.get("centerTicks"), 60);
        lpCenterRadius = (int) MiniJson.num(lp.get("centerRadius"), 40);
        lpArriveRadius = (int) MiniJson.num(lp.get("arriveRadius"), 24);
        lpGive = MiniJson.bool(lp.get("giveOnFirstJoin"), true);
        lpMaxRecorded = (int) MiniJson.num(lp.get("maxRecorded"), 96);
        lpSkyMinY = (int) MiniJson.num(lp.get("skyMinY"), 200);
        List<Integer> rr = new ArrayList<>();
        for (Object o : MiniJson.arr(lp.get("searchRadii"))) rr.add((int) MiniJson.num(o, 1000));
        if (rr.isEmpty()) { rr.add(800); rr.add(1500); rr.add(3000); rr.add(5000); }
        lpRadii = Collections.unmodifiableList(rr);
        List<Mode> ml = new ArrayList<>();
        for (Object o : MiniJson.arr(lp.get("modes"))) {
            Mode md = new Mode(MiniJson.obj(o));
            if (md.kind.equals("sky") && !skyEnabled) continue;
            ml.add(md);
        }
        if (ml.isEmpty()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", "next"); d.put("name", "Next island"); d.put("kind", "next");
            ml.add(new Mode(d));
        }
        lpModes = Collections.unmodifiableList(ml);
        origins = new OriginRules(MiniJson.obj(m.get("origins")));
    }

    public static WorldRules fromJson(String json, String source) {
        return new WorldRules(MiniJson.obj(MiniJson.parse(json)), source);
    }

    private static volatile WorldRules current;

    /** The rules in force: the live copy KubeJS handed over, otherwise the copy built into the jar. */
    public static WorldRules get() {
        WorldRules r = current;
        if (r == null) {
            synchronized (WorldRules.class) {
                if (current == null) current = builtIn();
                r = current;
            }
        }
        return r;
    }

    public static void set(WorldRules r) { current = r; }

    public static WorldRules builtIn() {
        try (InputStream in = WorldRules.class.getResourceAsStream("/stodd_world.json")) {
            if (in == null) throw new IOException("stodd_world.json is missing from the jar");
            return fromJson(new String(in.readAllBytes(), StandardCharsets.UTF_8), "built-in");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The scripts' seed: Number(level.getSeed() % 2147483647) (a Java long turned into a JS double first), then ToInt32 in hash3. */
    public static int scriptSeed(long seed) {
        double s = (double) seed;
        return (int) (s % 2147483647.0);
    }

    private double roll(int cx, int cz, int seed) {
        return (Hash.hash3(cx - 31337, cz + 4177, seed ^ 0x2c1b3c6d) % 10000) / 10000.0;
    }

    /** The theme of the island centred on (cx, cz): the same decision as infoOf in 40_islands.js (for islands registered from 2.0 on). */
    public Theme themeAt(int cx, int cz, int seed) {
        Theme th = pickRolled(Hash.hash3(cx, cz, seed));
        double r = roll(cx, cz, seed);
        double dist = Math.sqrt((double) cx * cx + (double) cz * cz);
        for (Band b : bands) {
            if (r < b.lo || r >= b.hi) continue;
            Theme t = themeById.get(b.id);
            double min = b.minOriginDistance != null ? b.minOriginDistance : cityMinOriginDistance;
            if (t != null && b.on && dist >= min) th = t;
            break;
        }
        return th;
    }

    private Theme pickRolled(long h) {
        if (rolled.isEmpty()) return themeById.containsKey("wild") ? themeById.get("wild") : themes.get(0);
        double total = 0;
        for (Theme t : rolled) total += t.weight;
        double r = h % Math.max(1L, Math.round(total));
        for (Theme t : rolled) { r -= t.weight; if (r < 0) return t; }
        return rolled.get(0);
    }

    /** The city style of an island centred on (cx, cz), or null when it is not a city island. */
    public Style cityStyleAt(int cx, int cz, int seed) {
        if (!cityEnabled) return null;
        Theme t = themeAt(cx, cz, seed);
        return t.isCity() ? styles.get(t.id) : null;
    }

    /** The dressed-island theme of an island centred on (cx, cz), or null. */
    public IsleTheme isleAt(int cx, int cz, int seed) {
        if (!isleEnabled) return null;
        Theme t = themeAt(cx, cz, seed);
        return isles.get(t.id);
    }

    /** "Kamiro Atoll": the scripts' islandName (40_islands.js). */
    public String islandName(String themeId, long h) {
        int n = syllables.size();
        String a = syllables.get((int) (h % n)), b = syllables.get((int) ((h >>> 5) % n));
        String c = ((h >>> 10) % 3) == 0 ? syllables.get((int) ((h >>> 13) % n)) : "";
        String w = a + b + c;
        String word = Character.toUpperCase(w.charAt(0)) + w.substring(1);
        List<String> list = names.get(themeId);
        if (list == null || list.isEmpty()) list = names.get("wild");
        if (list == null || list.isEmpty()) return word;
        return word + " " + list.get((int) ((h >>> 18) % list.size()));
    }

    /** The name of the ground island centred on (cx, cz), without the theme in brackets. */
    public String groundName(Theme t, int cx, int cz, int seed) {
        return islandName(t.id, Hash.hash3(cx + 7919, cz - 104729, seed ^ 0x5bd1e995));
    }

    /** The name of the sky island centred on (cx, cz). */
    public String skyName(int cx, int cz, int seed) {
        return islandName("sky", Hash.hash3(cx + 5, cz - 9, seed ^ 0x1f3d5b79));
    }

    /** The name of the sunken island centred on (cx, cz). */
    public String deepName(int cx, int cz, int seed) {
        return islandName("deep", Hash.hash3(cx - 11, cz + 3, seed ^ 0x2545f491));
    }
}
