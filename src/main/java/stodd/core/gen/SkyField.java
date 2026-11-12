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
        /** deepCoast: the island's coast inside the dome, and the level of the sea round it in there (the dome's equator) */
        public int seaLevel = 63, deepCoast = 24, deepWaterAbove = 6, deepDown = 24, deepMargin = 40, deepLighting = 8;
        public double deepRelief = 0.6;
        /** the slope round a dome: the sea floor is lowered to the dome's foot and rises back to the normal floor over this many blocks */
        public int deepRing = 64;
        /** how far from a point the middle of a dome over it can be: an island's radius + the margin + the ring (from the spawn-island size) */
        public int deepReach = 484;
        // the cloud sea round sky islands and the knock up streams ([skyIslands]); one up through every dome ([deepIslands])
        public boolean cloudSea = true;
        public int cloudWidth = 56, cloudDepth = 6, streams = 1, streamRadius = 10;
        public boolean deepStream = true;
        public int deepStreamRadius = 8;

        public String key() {
            return enabled + "|" + chance + "|" + minSpawnDistance + "|" + minRadius + "|" + height + "|" + heightVariation + "|" + thickness + "|"
                + spikes + "|" + relief + "|" + maxHeight + "|" + landThreshold + "|" + centreContinents + "|" + cell + "|" + peakStep + "|" + beaches
                + "|" + deepEnabled + "|" + deepChance + "|" + seaLevel + "|" + deepCoast + "|" + deepWaterAbove + "|" + deepDown + "|" + deepMargin
                + "|" + deepLighting + "|" + deepRelief + "|" + deepReach + "|" + deepRing
                + "|" + cloudSea + "|" + cloudWidth + "|" + cloudDepth + "|" + streams + "|" + streamRadius + "|" + deepStream + "|" + deepStreamRadius;
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
        public final double carve;         // the highest the sea floor may reach here (round a dome: its foot, then the slope; NO_CARVE elsewhere)
        Column(boolean sky, double raw, double t, double level, double bottom, IslandFinder.Island island) { this(sky, false, raw, t, level, bottom, island, false, null, NO_CARVE); }
        Column(boolean sky, boolean fringe, double raw, double t, double level, double bottom, IslandFinder.Island island, boolean sunk, Dome dome) {
            this(sky, fringe, raw, t, level, bottom, island, sunk, dome, NO_CARVE);
        }
        Column(boolean sky, boolean fringe, double raw, double t, double level, double bottom, IslandFinder.Island island, boolean sunk, Dome dome, double carve) {
            this.sky = sky; this.fringe = fringe; this.raw = raw; this.t = t; this.level = level; this.bottom = bottom; this.island = island;
            this.sunk = sunk; this.dome = dome; this.carve = carve;
        }
        Column with(boolean sunk, Dome dome, double carve) {
            return sunk == this.sunk && dome == this.dome && carve == this.carve ? this : new Column(sky, fringe, raw, t, level, bottom, island, sunk, dome, carve);
        }
    }

    /** NO_CARVE: the sea floor is left as it is */
    public static final double NO_CARVE = 10000;

    /**
     * The bubble dome of a sunken island. Above base (the island's coast, and the level of the sea round it inside) a flattened
     * half ellipsoid rising `up` blocks to the top (always under the sea); below base an upright cylinder of the same width reaching
     * `down` blocks into the ground, which holds the inner sea and the island's roots. Round it the sea floor is lowered to its
     * foot and rises back over `ring` blocks, so the dome stands free on the sea floor.
     */
    public static final class Dome {
        public final IslandFinder.Island island;
        public final double cx, cz, r, base, up, down, ring;
        Dome(IslandFinder.Island island, double cx, double cz, double r, double base, double up, double down, double ring) {
            this.island = island; this.cx = cx; this.cz = cz; this.r = r; this.base = base; this.up = up; this.down = down; this.ring = ring;
        }

        /** < 1 inside, 1 on the surface, > 1 outside */
        public double f(double x, double y, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            if (y >= base) { double v = (y - base) / up; return h + v * v; }
            return Math.max(h, (base - y) / down);
        }

        /** the inner sea's surface (water up to this block inside the dome, air above) */
        public int sea() { return (int) Math.floor(base); }

        /** the highest the sea floor may reach at (x, z): the dome's foot under and next to it, rising over the ring, NO_CARVE beyond */
        public double carve(double x, double z) {
            double dd = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
            double foot = base - 3;
            if (dd <= r) return foot;
            if (dd >= r + ring) return NO_CARVE;
            double t = (dd - r) / ring, s = t * t * (3 - 2 * t);
            return foot + 80 * s;
        }

        /** true when the dome or the slope round it reaches into the rectangle */
        public boolean nearRect(int x0, int z0, int x1, int z1) {
            double nx = Math.max(x0, Math.min(x1, cx)), nz = Math.max(z0, Math.min(z1, cz));
            return (nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) <= (r + ring + 1) * (r + ring + 1);
        }

        /** the inner surface of the roof over (x, z) (base where the dome does not reach) */
        public double ceiling(double x, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            return h >= 1 ? base : base + up * Math.sqrt(1 - h);
        }

        public double floor(double x, double z) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            return h >= 1 ? base : base - down;
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
    private final Map<Long, List<Dome>> domeCells = new ConcurrentHashMap<>();   // the domes whose slope reaches each lattice cell

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
            double base = p.deepCoast, up = Math.max(8, p.domeTop() - base), down = Math.max(4, p.deepDown), ring = Math.max(0, p.deepRing);
            // every point under the dome and its slope must be able to find it (domesNear looks this far): a bigger island (two grown
            // into one) stays where it is
            boolean fits = r + ring <= reach() - 16;
            // no other island's land under the dome or on the slope round it (the slope would cut it down)
            for (int a = 0; a < 64 && fits; a++) {
                double ang = a * Math.PI / 32;
                for (double rr : new double[] { r + ring + 4, r + ring * 0.5, r + 4, r * 0.75 }) {
                    int x = (int) Math.round(isl.cx + rr * Math.cos(ang)), z = (int) Math.round(isl.cz + rr * Math.sin(ang));
                    if (raw.at(x, z) >= p.landThreshold) {
                        IslandFinder.Island o2 = islands.islandAt(x, z);
                        if (o2 != null && !o2.key().equals(isl.key())) { fits = false; break; }
                    }
                }
            }
            if (fits) d = new Dome(isl, isl.cx, isl.cz, r, base, up, down, ring);
        }
        if (domes.size() > 200_000) domes.clear();
        domes.put(isl.key(), d == null ? NONE : d);
        return d;
    }

    int reach() { return Math.max(p.deepReach, p.deepMargin + 4 * IslandFinder.LATTICE + Math.max(0, p.deepRing)); }

    /** The domes that may reach into the rectangle (the islands with land within reach of it). */
    public List<Dome> domesTouching(int x0, int z0, int x1, int z1) { return domes(x0, z0, x1, z1, false); }

    /** The domes whose slope round them (or the dome itself) may reach into the rectangle. */
    public List<Dome> domesNear(int x0, int z0, int x1, int z1) { return domes(x0, z0, x1, z1, true); }

    private List<Dome> domes(int x0, int z0, int x1, int z1, boolean withRing) {
        if (!p.deepOn()) return Collections.emptyList();
        // the middle of an island is land, so every dome over the rectangle has land within reach of it; islands are wider than
        // two lattice steps, so a coarse look finds them
        int L = IslandFinder.LATTICE * 2, reach = reach();
        List<Dome> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int lx = Math.floorDiv(x0 - reach, L) * L; lx <= x1 + reach; lx += L)
            for (int lz = Math.floorDiv(z0 - reach, L) * L; lz <= z1 + reach; lz += L) {
                if (raw.at(lx, lz) < p.landThreshold) continue;
                IslandFinder.Island isl = islands.islandAt(lx, lz);
                if (isl == null || !seen.add(isl.key())) continue;
                Dome d = domeOf(isl);
                if (d != null && (withRing ? d.nearRect(x0, z0, x1, z1) : d.touches(x0, z0, x1, z1))) out.add(d);
            }
        return out;
    }

    /** The domes whose slope reaches the lattice cell of column (x, z) (looked up once per 32 x 32 lattice cell). */
    private List<Dome> domesOfCell(int x, int z) {
        int L = IslandFinder.LATTICE;
        int ix = Math.floorDiv(x, L), iz = Math.floorDiv(z, L);
        long key = ((long) ix << 32) ^ (iz & 0xffffffffL);
        List<Dome> l = domeCells.get(key);
        if (l == null) {
            l = domesNear(ix * L, iz * L, ix * L + L - 1, iz * L + L - 1);
            if (domeCells.size() > 2_000_000) domeCells.clear();
            domeCells.put(key, l);
        }
        return l;
    }

    /** The dome over column (x, z), or null. */
    public Dome domeAt(int x, int z) {
        if (!p.deepOn()) return null;
        for (Dome d : domesOfCell(x, z)) if (d.covers(x, z)) return d;
        return null;
    }

    /** The highest the sea floor may reach at (x, z): lowered under and round a dome, NO_CARVE elsewhere. */
    public double carveAt(int x, int z) {
        if (!p.deepOn()) return NO_CARVE;
        double v = NO_CARVE;
        for (Dome d : domesOfCell(x, z)) v = Math.min(v, d.carve(x, z));
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
        Column c = computeSky(x, z, r);
        if (!p.deepOn()) return c;
        Dome d = domeAt(x, z);
        boolean sunk = d != null && r >= p.landThreshold && c.island != null && d.island.key().equals(c.island.key());
        if (!sunk && r >= p.landThreshold && d == null && c.island == null) {
            IslandFinder.Island own = islandOfLand(x, z);
            sunk = own != null && isSunk(own);
        }
        return c.with(sunk, d, carveAt(x, z));
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
        // inside a dome: the island's own, ocean and beach included (the sea round it in there is a real sea)
        if (c.dome != null && !c.sky) return c.raw;
        double v = c.sky ? c.raw : INLAND;
        return p.beaches ? Math.max(v, p.landThreshold + 0.005) : Math.max(v, INLAND);
    }

    /** The sky island that covers column (x, z), or null. */
    public IslandFinder.Island skyIslandAt(int x, int z) {
        Column c = column(x, z);
        return c.sky ? c.island : null;
    }

    /** A field for an IslandFinder that sees only the sky islands: the raw continentalness on them, -1 elsewhere. */
    public IslandFinder.Field skyOnly() { return (x, z) -> { Column c = column(x, z); return c.sky ? c.raw : -1; }; }

    /** A field for an IslandFinder that sees only the sunken islands: the raw continentalness on their land, -1 elsewhere. */
    public IslandFinder.Field deepOnly() { return (x, z) -> { Column c = column(x, z); return c.sunk ? c.raw : -1; }; }

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

    /** the deepest the sea inside the dome gets: solid ground from here down (at most 18 blocks of water, above the dome's bottom) */
    public double deepApron(int x, int z) { Column c = column(x, z); return c.dome != null ? c.dome.base - Math.min(c.dome.down - 2, 18) : -64; }

    /** the highest the sea floor may reach here (round a dome it is lowered, so the dome stands free); NO_CARVE elsewhere */
    public double deepCarve(int x, int z) { return column(x, z).carve; }

    /** true when the climate at (x, y, z) is the sunken island's: inside its dome */
    public boolean domeClimate(int x, int y, int z) {
        if (!p.deepOn() || y > p.domeTop() + 2) return false;
        Dome d = column(x, z).dome;
        return d != null && d.f(x, y, z) < 1.05;
    }

    // ---------------------------------------------------------------- the cloud sea round sky islands, and the knock up streams

    /** A knock up stream: an upright column of rising sky_stream fluid, radius r, from yLow up to yTop (both included). */
    public static final class Stream {
        public final int x, z, r, yLow, yTop;
        Stream(int x, int z, int r, int yLow, int yTop) { this.x = x; this.z = z; this.r = r; this.yLow = yLow; this.yTop = yTop; }
        public boolean covers(int px, int pz) { double dx = px - x, dz = pz - z; return dx * dx + dz * dz <= (r + 0.5) * (r + 0.5); }
        public boolean nearRect(int x0, int z0, int x1, int z1, int margin) {
            double nx = Math.max(x0, Math.min(x1, x)), nz = Math.max(z0, Math.min(z1, z));
            return (nx - x) * (nx - x) + (nz - z) * (nz - z) <= (double) (r + margin) * (r + margin);
        }
        public int[] array() { return new int[] { x, z, r, yLow, yTop }; }
    }

    /** One cell's cloud sea: the top of the cloud over each column (y - 64; 0 = no cloud) and the streams that reach into it. */
    public static final class CloudCell {
        public final byte[] top;
        public final List<Stream> streams;
        public final int yMin, yMax;
        CloudCell(byte[] top, List<Stream> streams, int yMin, int yMax) { this.top = top; this.streams = streams; this.yMin = yMin; this.yMax = yMax; }
        public int topAt(int i) { int t = top[i] & 0xff; return t == 0 ? Integer.MIN_VALUE : t + 64; }
        public int[] streamArray() {
            int[] a = new int[streams.size() * 5];
            for (int i = 0; i < streams.size(); i++) System.arraycopy(streams.get(i).array(), 0, a, i * 5, 5);
            return a;
        }
    }

    private final Map<String, List<Stream>> skyStreams = new ConcurrentHashMap<>();
    private final Map<String, Object> deepStreams = new ConcurrentHashMap<>();
    private final Map<Long, List<IslandFinder.Island>> liftedRegions = new ConcurrentHashMap<>();

    /** The cloud sea's surface round a sky island: one under its coast, as the sea is one under a ground island's. */
    public int cloudTop(IslandFinder.Island isl) { return (int) Math.round(levelOf(isl)) - 1; }

    boolean cloudOn() { return p.enabled && p.chance > 0 && (p.cloudSea || p.streams > 0); }

    /** no land at all on a disc (sea, at the ground and up in the sky) */
    boolean clearDisc(int x, int z, double rr) {
        if (raw.at(x, z) >= p.landThreshold - 0.01) return false;
        for (int a = 0; a < 16; a++) {
            double ang = a * Math.PI / 8;
            for (double f : new double[] { 1, 0.5 }) {
                if (raw.at((int) Math.round(x + rr * f * Math.cos(ang)), (int) Math.round(z + rr * f * Math.sin(ang))) >= p.landThreshold - 0.01) return false;
            }
        }
        return true;
    }

    /** about how far (x, z) is from the island's coast (its nearest land lattice point, less half a lattice step) */
    public double distanceToLand(IslandFinder.Island isl, int x, int z) {
        double best = Double.MAX_VALUE;
        for (long k : isl.lattice) {
            double dx = (int) (k >> 32) - x, dz = (int) k - z;
            best = Math.min(best, dx * dx + dz * dz);
        }
        return Math.sqrt(best) - IslandFinder.LATTICE / 2.0;
    }

    /** The knock up streams of a sky island: in its cloud sea just off the coast, rising from under the sea's surface to the cloud's. */
    public List<Stream> skyStreams(IslandFinder.Island isl) {
        if (isl == null || !cloudOn() || p.streams <= 0 || !isLifted(isl)) return Collections.emptyList();
        List<Stream> c = skyStreams.get(isl.key());
        if (c != null) return c;
        int sr = Math.max(2, p.streamRadius), n = Math.min(8, p.streams);
        List<Stream> out = new ArrayList<>();
        double a0 = unit(isl, 21) * 2 * Math.PI;
        for (int k = 0; k < n; k++) {
            for (int t = 0; t < 16; t++) {
                double ang = a0 + k * 2 * Math.PI / n + (t % 2 == 0 ? 1 : -1) * ((t + 1) / 2) * 0.3;
                double cs = Math.cos(ang), sn = Math.sin(ang);
                double lastLand = 0, maxT = isl.radius * 2.4 + 96;
                for (double s2 = 0; s2 <= maxT; s2 += 6) if (raw.at((int) Math.round(isl.cx + s2 * cs), (int) Math.round(isl.cz + s2 * sn)) >= p.landThreshold) lastLand = s2;
                double d = lastLand + sr + 10;
                int x = (int) Math.round(isl.cx + d * cs), z = (int) Math.round(isl.cz + d * sn);
                if (!clearDisc(x, z, sr + 3)) continue;
                if (distanceToLand(isl, x, z) > Math.max(sr + 12, p.cloudWidth - sr)) continue;
                boolean apart = true;
                for (Stream o : out) if (Math.hypot(o.x - x, o.z - z) < 2 * sr + 24) apart = false;
                if (!apart) continue;
                out.add(new Stream(x, z, sr, p.seaLevel - 12, cloudTop(isl)));
                break;
            }
        }
        out = Collections.unmodifiableList(out);
        if (skyStreams.size() > 100_000) skyStreams.clear();
        skyStreams.put(isl.key(), out);
        return out;
    }

    /** The knock up stream of a sunken island: over the sea inside its dome, from just under the inner sea up to the outer sea's surface. */
    public Stream deepStream(Dome d) {
        if (d == null || !p.deepStream || p.deepStreamRadius <= 0) return null;
        Object o = deepStreams.get(d.key());
        if (o != null) return o == NONE ? null : (Stream) o;
        int sr = Math.max(2, p.deepStreamRadius);
        Stream found = null;
        double a0 = unit(d.island, 25) * 2 * Math.PI;
        outer:
        for (int t = 0; t < 16; t++) {
            double ang = a0 + t * Math.PI / 8;
            for (double dist = d.r - sr - 8; dist >= Math.max(sr + 4, d.r * 0.35); dist -= 6) {
                int x = (int) Math.round(d.cx + dist * Math.cos(ang)), z = (int) Math.round(d.cz + dist * Math.sin(ang));
                if (Math.hypot(x - d.cx, z - d.cz) + sr > d.r - 6) continue;
                if (!clearDisc(x, z, sr + 3)) continue;
                found = new Stream(x, z, sr, d.sea() - 6, p.seaLevel - 1);
                break outer;
            }
        }
        if (deepStreams.size() > 100_000) deepStreams.clear();
        deepStreams.put(d.key(), found == null ? NONE : found);
        return found;
    }

    /** The sky islands whose cloud sea may reach the rectangle (looked up per 256 x 256 region). */
    public List<IslandFinder.Island> liftedNear(int x0, int z0, int x1, int z1) {
        if (!cloudOn()) return Collections.emptyList();
        final int R = 256;
        List<IslandFinder.Island> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int rx = Math.floorDiv(x0, R); rx <= Math.floorDiv(x1, R); rx++)
            for (int rz = Math.floorDiv(z0, R); rz <= Math.floorDiv(z1, R); rz++) {
                long key = ((long) rx << 32) ^ (rz & 0xffffffffL);
                List<IslandFinder.Island> l = liftedRegions.get(key);
                if (l == null) {
                    l = new ArrayList<>();
                    java.util.Set<String> s2 = new java.util.HashSet<>();
                    int reach = reach() + p.cloudWidth + 64, L = IslandFinder.LATTICE * 2;
                    for (int lx = Math.floorDiv(rx * R - reach, L) * L; lx <= rx * R + R + reach; lx += L)
                        for (int lz = Math.floorDiv(rz * R - reach, L) * L; lz <= rz * R + R + reach; lz += L) {
                            if (raw.at(lx, lz) < p.landThreshold) continue;
                            IslandFinder.Island isl = islands.islandAt(lx, lz);
                            if (isl != null && s2.add(isl.key()) && isLifted(isl)) l.add(isl);
                        }
                    if (liftedRegions.size() > 200_000) liftedRegions.clear();
                    liftedRegions.put(key, l);
                }
                for (IslandFinder.Island isl : l) if (seen.add(isl.key())) out.add(isl);
            }
        return out;
    }

    /** The cloud sea and knock up streams of one cell (null: none reach it). */
    public CloudCell cloudCell(int x0, int z0, int size) {
        if (!cloudOn()) return null;
        List<IslandFinder.Island> near = liftedNear(x0, z0, x0 + size - 1, z0 + size - 1);
        if (near.isEmpty()) return null;
        byte[] top = new byte[size * size];
        List<Stream> streams = new ArrayList<>();
        int yMin = Integer.MAX_VALUE, yMax = Integer.MIN_VALUE;
        boolean any = false;
        double W = Math.max(0, p.cloudWidth);
        for (IslandFinder.Island isl : near) {
            int ct = cloudTop(isl);
            if (ct - 64 < 1 || ct - 64 > 255) continue;
            List<Stream> ss = new ArrayList<>();
            for (Stream st : skyStreams(isl)) if (st.nearRect(x0, z0, x0 + size - 1, z0 + size - 1, 12)) ss.add(st);
            // the island's land lattice points near enough to the cell
            List<int[]> pts = new ArrayList<>();
            if (p.cloudSea) {
                double m = W * 1.05 + IslandFinder.LATTICE;
                for (long k : isl.lattice) {
                    int lx = (int) (k >> 32), lz = (int) k;
                    double nx = Math.max(x0, Math.min(x0 + size - 1, lx)), nz = Math.max(z0, Math.min(z0 + size - 1, lz));
                    if ((nx - lx) * (nx - lx) + (nz - lz) * (nz - lz) <= m * m) pts.add(new int[] { lx, lz });
                }
            }
            if (pts.isEmpty() && ss.isEmpty()) continue;
            double ph1 = unit(isl, 23) * 2 * Math.PI, ph2 = unit(isl, 24) * 2 * Math.PI;
            for (int dz = 0; dz < size; dz++) for (int dx = 0; dx < size; dx++) {
                int x = x0 + dx, z = z0 + dz;
                boolean in = false;
                if (!pts.isEmpty()) {
                    double best = Double.MAX_VALUE;
                    for (int[] q : pts) { double ax = q[0] - x, az = q[1] - z; best = Math.min(best, ax * ax + az * az); }
                    double ang = Math.atan2(z - isl.cz, x - isl.cx);
                    double lim = W * (0.8 + 0.14 * Math.sin(5 * ang + ph1) + 0.08 * Math.sin(13 * ang + ph2)) + IslandFinder.LATTICE / 2.0;
                    in = best <= lim * lim;
                }
                // the cloud always reaches round the top of a stream
                for (Stream st : ss) { double ax = st.x - x, az = st.z - z; if (ax * ax + az * az <= (st.r + 12.0) * (st.r + 12.0)) in = true; }
                if (!in) continue;
                int i = dz * size + dx, cur = top[i] & 0xff, v = ct - 64;
                if (cur == 0 || v > cur) top[i] = (byte) v;
                any = true;
            }
            if (any) { yMin = Math.min(yMin, ct - p.cloudDepth); yMax = Math.max(yMax, ct); }
            for (Stream st : ss) { streams.add(st); yMin = Math.min(yMin, st.yLow); yMax = Math.max(yMax, st.yTop); }
        }
        if (!any && streams.isEmpty()) return null;
        return new CloudCell(top, streams, yMin, yMax);
    }
}
