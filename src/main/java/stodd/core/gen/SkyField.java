package stodd.core.gen;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
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
        /** false: no beach / stony-shore biome up there (sandy rims would invite beached shipwrecks and buried treasure) */
        public boolean beaches = false;
        public int cell = 48, peakStep = 32;
        // sunken islands under bubble domes ([deepIslands])
        public boolean deepEnabled = true;
        public double deepChance = 0.1;
        public int seaLevel = 63, deepCoast = 16, deepWaterAbove = 10, deepDown = 20, deepMargin = 24, deepLighting = 8;
        public double deepRelief = 0.6;
        /** how far from a point the middle of a dome over it can be: about an island's radius + the margin (from the spawn-island size) */
        public int deepReach = 420;

        public String key() {
            return enabled + "|" + chance + "|" + minSpawnDistance + "|" + minRadius + "|" + height + "|" + heightVariation + "|" + thickness + "|"
                + spikes + "|" + relief + "|" + maxHeight + "|" + landThreshold + "|" + centreContinents + "|" + cell + "|" + peakStep + "|" + beaches
                + "|" + deepEnabled + "|" + deepChance + "|" + seaLevel + "|" + deepCoast + "|" + deepWaterAbove + "|" + deepDown + "|" + deepMargin
                + "|" + deepLighting + "|" + deepRelief + "|" + deepReach;
        }

        /** the highest block of a bubble dome (always under the sea) */
        public int domeTop() { return seaLevel - deepWaterAbove; }

        boolean deepOn() { return deepEnabled && deepChance > 0; }

        /** the lowest a sky island's surface can be (the rim of the lowest island) */
        public int lowestSurface() { return height - heightVariation - 4; }

        /** the lowest a sky island's underside can reach */
        public int lowestBottom() { return (int) Math.floor(height - heightVariation - 3 - thickness * 1.3 * 1.1 * 1.05 - spikes) - 2; }
    }

    /** One column. */
    public static final class Column {
        public final boolean sky;          // part of a lifted island
        public final boolean fringe;       // open sea within a few dozen blocks of a lifted island's coast
        public final double raw;           // raw continentalness
        public final double t;             // 0 at the coast .. 1 in the middle (sky columns only)
        public final double level;         // the island's coast height (sky columns only)
        public final double bottom;        // lowest solid block of the island here (sky columns only; 1000 elsewhere)
        public final IslandFinder.Island island;
        public final boolean sunk;         // land of a sunken island (gone from the sea floor)
        public final Dome dome;            // the bubble dome over this column, or null
        Column(boolean sky, double raw, double t, double level, double bottom, IslandFinder.Island island) { this(sky, false, raw, t, level, bottom, island, false, null); }
        Column(boolean sky, boolean fringe, double raw, double t, double level, double bottom, IslandFinder.Island island, boolean sunk, Dome dome) {
            this.sky = sky; this.fringe = fringe; this.raw = raw; this.t = t; this.level = level; this.bottom = bottom; this.island = island;
            this.sunk = sunk; this.dome = dome;
        }
        Column with(boolean sunk, Dome dome) { return sunk == this.sunk && dome == this.dome ? this : new Column(sky, fringe, raw, t, level, bottom, island, sunk, dome); }
    }

    /**
     * The bubble dome of a sunken island: a flattened ellipsoid round the island, its floor (the island's coast) at base, rising
     * `up` blocks to the top (always under the sea) and reaching `down` blocks into the ground underneath.
     */
    public static final class Dome {
        public final IslandFinder.Island island;
        public final double cx, cz, r, base, up, down;
        Dome(IslandFinder.Island island, double cx, double cz, double r, double base, double up, double down) {
            this.island = island; this.cx = cx; this.cz = cz; this.r = r; this.base = base; this.up = up; this.down = down;
        }

        /** < 1 inside, 1 on the surface, > 1 outside */
        public double f(double x, double y, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            double v = y >= base ? (y - base) / up : (base - y) / down;
            return h + v * v;
        }

        /** the inner surface of the roof over (x, z) (base where the dome does not reach) */
        public double ceiling(double x, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            return h >= 1 ? base : base + up * Math.sqrt(1 - h);
        }

        public double floor(double x, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            return h >= 1 ? base : base - down * Math.sqrt(1 - h);
        }

        public boolean covers(double x, double z) { return (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r; }

        /** true when the dome reaches into the rectangle */
        public boolean touches(int x0, int z0, int x1, int z1) {
            double nx = Math.max(x0, Math.min(x1, cx)), nz = Math.max(z0, Math.min(z1, cz));
            return (nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) <= (r + 1) * (r + 1);
        }

        public String key() { return island.key(); }
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
    private final Map<String, Object> domes = new ConcurrentHashMap<>();
    private final Map<Long, List<Dome>> domeCells = new ConcurrentHashMap<>();

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

    /** true when this island of the raw field is sunk deep under the sea, inside a bubble dome */
    public boolean isSunk(IslandFinder.Island isl) { return domeOf(isl) != null; }

    /** The bubble dome of a sunken island (null: the island is not sunken). */
    public Dome domeOf(IslandFinder.Island isl) {
        if (isl == null || !p.deepOn()) return null;
        Object o = domes.get(isl.key());
        if (o != null) return o == NONE ? null : (Dome) o;
        Dome d = null;
        if (isl.radius >= p.minRadius && Math.hypot(isl.cx, isl.cz) >= p.minSpawnDistance && !isl.contains(0, 0)
            && !isLifted(isl) && unit(isl, 5) < p.deepChance) {
            // round the whole island: its farthest land lattice point (+ the lattice step, land reaches past it) + the margin
            double far = 0;
            for (long k : isl.lattice) far = Math.max(far, Math.hypot((int) (k >> 32) - isl.cx, (int) k - isl.cz));
            double r = far + IslandFinder.LATTICE + p.deepMargin;
            double base = p.deepCoast, up = Math.max(8, p.domeTop() - base), down = Math.max(4, p.deepDown);
            // every point under the dome must be able to find it (domesTouching looks this far): a bigger island (two grown into
            // one) stays where it is
            boolean fits = r <= Math.max(p.deepReach, p.deepMargin + 4 * IslandFinder.LATTICE) - 16;
            // no other island's land under the dome
            for (int a = 0; a < 64 && fits; a++) {
                double ang = a * Math.PI / 32;
                for (double rr : new double[] { r + 4, r * 0.75 }) {
                    int x = (int) Math.round(isl.cx + rr * Math.cos(ang)), z = (int) Math.round(isl.cz + rr * Math.sin(ang));
                    if (raw.at(x, z) >= p.landThreshold) {
                        IslandFinder.Island o2 = islands.islandAt(x, z);
                        if (o2 != null && !o2.key().equals(isl.key())) { fits = false; break; }
                    }
                }
            }
            if (fits) d = new Dome(isl, isl.cx, isl.cz, r, base, up, down);
        }
        if (domes.size() > 200_000) domes.clear();
        domes.put(isl.key(), d == null ? NONE : d);
        return d;
    }

    /** The domes that may reach into the rectangle (the islands with land within reach of it). */
    public List<Dome> domesTouching(int x0, int z0, int x1, int z1) {
        if (!p.deepOn()) return Collections.emptyList();
        // the middle of an island is land, so every dome over the rectangle has land within reach of it; islands are wider than
        // two lattice steps, so a coarse look finds them
        int L = IslandFinder.LATTICE * 2, reach = Math.max(p.deepReach, p.deepMargin + 4 * IslandFinder.LATTICE);
        List<Dome> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int lx = Math.floorDiv(x0 - reach, L) * L; lx <= x1 + reach; lx += L)
            for (int lz = Math.floorDiv(z0 - reach, L) * L; lz <= z1 + reach; lz += L) {
                if (raw.at(lx, lz) < p.landThreshold) continue;
                IslandFinder.Island isl = islands.islandAt(lx, lz);
                if (isl == null || !seen.add(isl.key())) continue;
                Dome d = domeOf(isl);
                if (d != null && d.touches(x0, z0, x1, z1)) out.add(d);
            }
        return out;
    }

    /** The dome over column (x, z), or null (looked up once per 32 x 32 lattice cell). */
    public Dome domeAt(int x, int z) {
        if (!p.deepOn()) return null;
        int L = IslandFinder.LATTICE;
        int ix = Math.floorDiv(x, L), iz = Math.floorDiv(z, L);
        long key = ((long) ix << 32) ^ (iz & 0xffffffffL);
        List<Dome> l = domeCells.get(key);
        if (l == null) {
            l = domesTouching(ix * L, iz * L, ix * L + L - 1, iz * L + L - 1);
            if (domeCells.size() > 2_000_000) domeCells.clear();
            domeCells.put(key, l);
        }
        for (Dome d : l) if (d.covers(x, z)) return d;
        return null;
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
        Column c = computeSky(x, z, r);
        if (!p.deepOn()) return c;
        Dome d = domeAt(x, z);
        boolean sunk = d != null && r >= p.landThreshold && c.island != null && d.island.key().equals(c.island.key());
        if (!sunk && r >= p.landThreshold && d == null && c.island == null) {
            IslandFinder.Island own = islandOfLand(x, z);
            sunk = own != null && isSunk(own);
        }
        return c.with(sunk, d);
    }

    private Column computeSky(int x, int z, double r) {
        if (!p.enabled || p.chance <= 0) {
            if (r >= p.landThreshold && p.deepOn()) return new Column(false, false, r, 0, 0, 1000, islandOfLand(x, z), false, null);
            return new Column(false, r, 0, 0, 1000, null);
        }
        if (r < p.landThreshold) {
            // the sea just off a lifted island's coast: its air up at the island's height must not count as ocean either, or a
            // structure that looks for the highest ground in an ocean (a shipwreck) could land on the island's edge
            if (r < p.landThreshold - FRINGE) return new Column(false, r, 0, 0, 1000, null);
            IslandFinder.Island near = islandOfLand(x, z);
            boolean f = near != null && isLifted(near);
            return new Column(false, f, r, 0, 0, 1000, f ? near : null, false, null);
        }
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

    static final double FRINGE = 0.08;
    /** the lowest continentalness of the near-inland band: above the coast (beach / stony shore) band of the biome table */
    static final double INLAND = -0.10;

    private static double clamp(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------------------------------------------------------------- what the density functions read

    /** The ground's continentalness: a lifted island is pulled just under the coast (a shallow sea where it stood). */
    public double ground(int x, int z, double groundValue) {
        Column c = column(x, z, groundValue);
        if (c.sky) return Math.min(groundValue, p.landThreshold - 0.04);
        if (c.sunk) return Math.min(groundValue, p.landThreshold - 0.12);   // the sea floor where a sunken island stood (its dome replaces it)
        return groundValue;
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

    /** true when the climate at (x, y, z) is the sky island's: inside one from a little under its underside up, and in the air just off its coast. */
    public boolean skyClimate(int x, int y, int z) {
        if (!p.enabled || y < p.lowestBottom() - 8) return false;
        Column c = column(x, z);
        return c.sky ? y >= c.bottom - 8 : c.fringe;
    }

    /**
     * The continentalness the biomes up there are chosen with: the island's own; never an ocean, and (unless skyIslands.beaches)
     * never the coast band, so a sky island has no ocean or beach biome for sea structures to look for.
     */
    public double climateContinents(int x, int z) {
        Column c = column(x, z);
        double v = c.sky || c.dome != null ? c.raw : INLAND;
        return p.beaches ? Math.max(v, p.landThreshold + 0.005) : Math.max(v, INLAND);
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

    // ---------------------------------------------------------------- sunken islands: what the density functions read

    /** > 0 where a bubble dome covers the column, -1 elsewhere */
    public double deepMask(int x, int z) { return column(x, z).dome != null ? 1 : -1; }

    /** the dome's shape value at a point (< 1 inside), 1000 where no dome is */
    public double domeShape(int x, int y, int z) { Dome d = column(x, z).dome; return d == null ? 1000 : d.f(x, y, z); }

    /** the continentalness the sunken terrain is made from (the island's own; -1 where no dome is) */
    public double deepContinents(int x, int z) { Column c = column(x, z); return c.dome != null ? c.raw : -1; }

    public double deepLift(int x, int z) { Column c = column(x, z); return c.dome != null ? (c.dome.base - 64) / 128.0 : 0; }

    public double deepRelief() { return p.deepRelief; }

    /** the highest the island's terrain may reach under the roof (3 blocks of air under it at least) */
    public double deepCeiling(int x, int z) { Column c = column(x, z); return c.dome != null ? c.dome.ceiling(x, z) - 3 : -64; }

    /** the flat floor of the dome, one block under the island's coast */
    public double deepApron(int x, int z) { Column c = column(x, z); return c.dome != null ? c.dome.base - 1 : -64; }

    /** true when the climate at (x, y, z) is the sunken island's: inside its dome */
    public boolean domeClimate(int x, int y, int z) {
        if (!p.deepOn() || y > p.domeTop() + 2) return false;
        Dome d = column(x, z).dome;
        return d != null && d.f(x, y, z) < 1.05;
    }
}
