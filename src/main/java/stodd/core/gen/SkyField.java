package stodd.core.gen;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sky islands are ordinary islands that were lifted into the sky.
 *
 * The world's islands come from Survival Island's continentalness (the "raw" field), on the spacing set in the STODD config. Every
 * island is looked at as a whole (IslandFinder: the same island, with the same centre, from any of its points); a share of them
 * (skyIslands.rarity / chance) is chosen, by a hash of the island's centre and the world seed, to be a sky island. For those:
 *   - the ground loses the island: its continentalness is pulled just under the coast, so a shallow sea is left where it stood;
 *   - the sky gets it back: the same continentalness, so the same outline, the same terrain shapes (the world's own terrain
 *     splines, lifted by {@link #lift}) and the same biomes (the climate is given the island's continentalness up there);
 *   - an underside is cut below it, deepest in the middle, with a ragged noise edge and the odd stalactite.
 * Nothing is saved: everything is a pure function of the seed, the settings and the raw field, so every thread and every restart
 * agrees. The density functions (stodd_core:sky, mc/SkyDensity) read this class.
 */
public final class SkyField {
    /** Raw continentalness of a column. Thread-safe. */
    public interface Raw { double at(int x, int z); }

    /** A 2D noise in about [-1, 1]. Thread-safe. */
    public interface Noise { double at(double x, double z); }

    /** The settings (config/stodd/world.toml, [skyIslands]); see 00_config.js for what each one does. */
    public static final class Params {
        public boolean enabled = true;
        public double chance = 0.2;
        public int minSpawnDistance = 700;
        public int minRadius = 40;
        public int height = 190, heightVariation = 12;
        public double thickness = 48, spikes = 10, relief = 0.85;
        public int maxHeight = 316;
        public double landThreshold = -0.19;
        public double centreContinents = 0.9;
        public int cell = 48, peakStep = 32;

        public String key() {
            return enabled + "|" + chance + "|" + minSpawnDistance + "|" + minRadius + "|" + height + "|" + heightVariation + "|" + thickness + "|"
                + spikes + "|" + relief + "|" + maxHeight + "|" + landThreshold + "|" + centreContinents + "|" + cell + "|" + peakStep;
        }

        /** the lowest a sky island's surface can be (the rim of the lowest island) */
        public int lowestSurface() { return height - heightVariation - 4; }

        /** the lowest a sky island's underside can reach */
        public int lowestBottom() { return (int) Math.floor(height - heightVariation - 3 - thickness * 1.3 * 1.1 * 1.05 - spikes) - 2; }
    }

    /** One column. */
    public static final class Column {
        public final boolean sky;          // part of a lifted island
        public final double raw;           // raw continentalness
        public final double t;             // 0 at the coast .. 1 in the middle (sky columns only)
        public final double level;         // the island's coast height (sky columns only)
        public final double bottom;        // lowest solid block of the island here (sky columns only; 1000 elsewhere)
        public final IslandFinder.Island island;
        Column(boolean sky, double raw, double t, double level, double bottom, IslandFinder.Island island) {
            this.sky = sky; this.raw = raw; this.t = t; this.level = level; this.bottom = bottom; this.island = island;
        }
    }

    private static final Object NONE = new Object();

    public final long seed;
    public final Params p;
    private final Raw raw;
    private final Noise under;
    private final IslandFinder islands;
    private final int hseed;
    private final Map<Long, Object> cells = new ConcurrentHashMap<>();
    private final Map<String, Boolean> lifted = new ConcurrentHashMap<>();

    public SkyField(long seed, Params p, Raw raw, Noise under) {
        this.seed = seed;
        this.p = p;
        this.raw = raw;
        this.under = under == null ? (x, z) -> 0 : under;
        this.islands = new IslandFinder(raw::at, p.landThreshold, p.peakStep, p.cell);
        this.hseed = (int) (seed ^ (seed >>> 32)) ^ 0x51e7_1f7d;
    }

    /** The island finder over the raw field (ground and sky islands alike, before any is lifted). */
    public IslandFinder rawIslands() { return islands; }

    private double unit(IslandFinder.Island isl, int salt) {
        return (Hash.hash3(isl.cx + salt * 7919, isl.cz - salt * 104729, hseed ^ (salt * 0x9e3779b9)) & 0xffffff) / (double) 0x1000000;
    }

    /** true when this island of the raw field is a sky island */
    public boolean isLifted(IslandFinder.Island isl) {
        if (isl == null || !p.enabled || p.chance <= 0) return false;
        Boolean b = lifted.get(isl.key());
        if (b != null) return b;
        boolean v = isl.radius >= p.minRadius
            && Math.hypot(isl.cx, isl.cz) >= p.minSpawnDistance
            && !isl.contains(0, 0)
            && unit(isl, 1) < p.chance;
        if (lifted.size() > 200_000) lifted.clear();
        lifted.put(isl.key(), v);
        return v;
    }

    /** The coast height of a sky island. */
    public double levelOf(IslandFinder.Island isl) {
        return p.height + Math.round((unit(isl, 2) * 2 - 1) * p.heightVariation);
    }

    /** How deep the underside of a sky island reaches below its coast, in the middle. */
    public double thicknessOf(IslandFinder.Island isl) {
        double s = Math.max(0.7, Math.min(1.3, isl.radius / 160.0));
        return p.thickness * s * (0.9 + 0.2 * unit(isl, 3));
    }

    /** The island of the raw field that the land column (x, z) belongs to (looked up once per 32 x 32 lattice cell). */
    IslandFinder.Island islandOfLand(int x, int z) {
        int L = IslandFinder.LATTICE;
        int ix = Math.floorDiv(x, L), iz = Math.floorDiv(z, L);
        long key = ((long) ix << 32) ^ (iz & 0xffffffffL);
        Object v = cells.get(key);
        if (v == null) {
            IslandFinder.Island found = null;
            // the cell's own corners first, then the ring around it (a thin point of land between lattice points)
            outer:
            for (int r = 0; r <= 1; r++) {
                for (int a = -r; a <= 1 + r; a++) for (int b = -r; b <= 1 + r; b++) {
                    if (r > 0 && a >= 0 && a <= 1 && b >= 0 && b <= 1) continue;
                    int lx = (ix + a) * L, lz = (iz + b) * L;
                    if (raw.at(lx, lz) >= p.landThreshold) {
                        found = islands.islandAt(lx, lz);
                        if (found != null) break outer;
                    }
                }
            }
            v = found == null ? NONE : found;
            if (cells.size() > 2_000_000) cells.clear();
            cells.put(key, v);
        }
        return v == NONE ? null : (IslandFinder.Island) v;
    }

    // a small per-thread cache of the last columns (biomes ask the same column at many heights)
    private static final int CACHE = 256;
    private static final class Cache { final long[] keys = new long[CACHE]; final Column[] cols = new Column[CACHE]; final SkyField[] owners = new SkyField[CACHE]; }
    private static final ThreadLocal<Cache> TL = ThreadLocal.withInitial(Cache::new);

    public Column column(int x, int z) { return column(x, z, Double.NaN); }

    /** @param knownRaw the raw continentalness here if the caller has it (NaN: work it out) */
    public Column column(int x, int z, double knownRaw) {
        long key = ((long) x << 32) ^ (z & 0xffffffffL);
        int slot = (int) ((key * 0x9E3779B97F4A7C15L) >>> 56) & (CACHE - 1);
        Cache c = TL.get();
        if (c.owners[slot] == this && c.keys[slot] == key) return c.cols[slot];
        Column col = compute(x, z, knownRaw);
        c.owners[slot] = this; c.keys[slot] = key; c.cols[slot] = col;
        return col;
    }

    private Column compute(int x, int z, double knownRaw) {
        double r = Double.isNaN(knownRaw) ? raw.at(x, z) : knownRaw;
        if (!p.enabled || p.chance <= 0 || r < p.landThreshold) return new Column(false, r, 0, 0, 1000, null);
        IslandFinder.Island isl = islandOfLand(x, z);
        if (isl == null || !isLifted(isl)) return new Column(false, r, 0, 0, 1000, isl);
        double t = Math.max(1e-4, Math.min(1, (r - p.landThreshold) / (p.centreContinents - p.landThreshold)));
        double level = levelOf(isl);
        double st = Math.sqrt(t);
        double n1 = clamp(under.at(x, z), -1, 1);
        double n2 = Math.max(0, clamp(under.at(x * 2.3 + 517.3, z * 2.3 - 381.7), -1, 1));
        double bottom = level - 3 - thicknessOf(isl) * st * (0.8 + 0.25 * n1) - p.spikes * n2 * n2 * st;
        return new Column(true, r, t, level, bottom, isl);
    }

    private static double clamp(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------------------------------------------------------------- what the density functions read

    /** The ground's continentalness: a lifted island is pulled just under the coast (a shallow sea where it stood). */
    public double ground(int x, int z, double groundValue) {
        Column c = column(x, z, groundValue);
        return c.sky ? Math.min(groundValue, p.landThreshold - 0.04) : groundValue;
    }

    /** > 0 inside a sky island (0..1 from coast to middle), -1 elsewhere. */
    public double mask(int x, int z) { Column c = column(x, z); return c.sky ? c.t : -1; }

    /** The continentalness the sky terrain is made from: the island's own, -1 where there is none. */
    public double continents(int x, int z) { Column c = column(x, z); return c.sky ? c.raw : -1; }

    /** How far the island's terrain is lifted, in the terrain's depth units (128 blocks = 1). */
    public double lift(int x, int z) { Column c = column(x, z); return c.sky ? (c.level - 64) / 128.0 : 0; }

    public double relief() { return p.relief; }

    public double bottom(int x, int z) { return column(x, z).bottom; }

    public double ceiling() { return p.maxHeight; }

    /** Moves weirdness away from the river band (|w| < 0.05), so the lifted terrain has no dry river beds cut across it. */
    public static double pushRidges(double w) {
        double a = Math.abs(w);
        if (a >= 0.25) return w;
        double s = w < 0 ? -1 : 1;
        return s * (0.07 + a * (0.18 / 0.25));
    }

    /** true when the climate at (x, y, z) is the sky island's: inside one, from a little under its underside up. */
    public boolean skyClimate(int x, int y, int z) {
        if (!p.enabled || y < p.lowestBottom() - 8) return false;
        Column c = column(x, z);
        return c.sky && y >= c.bottom - 8;
    }

    /** The sky island that covers column (x, z), or null. */
    public IslandFinder.Island skyIslandAt(int x, int z) {
        Column c = column(x, z);
        return c.sky ? c.island : null;
    }

    /** A field for an IslandFinder that sees only the sky islands: the raw continentalness on them, -1 elsewhere. */
    public IslandFinder.Field skyOnly() { return (x, z) -> { Column c = column(x, z); return c.sky ? c.raw : -1; }; }

    /** A field for an IslandFinder that sees only the ground islands. */
    public IslandFinder.Field groundOnly(IslandFinder.Field ground) { return (x, z) -> ground(x, z, ground.at(x, z)); }
}
