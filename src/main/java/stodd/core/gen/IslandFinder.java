package stodd.core.gen;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Which island a point is on, and where that island's centre is - the same answer from any point of the island, on any thread,
 * after any restart, without saving anything.
 *
 * The scripts used to climb the continentalness field from wherever a player happened to be and record the first summit they
 * reached; two starting points could reach two different bumps of one island. Here the island is first found as a whole: a flood
 * fill over a fixed 32-block lattice of land points, which is the same set whichever land point it starts from. Its highest
 * lattice point is climbed to the real summit, and the summit is snapped to the middle of its 48-block city cell, so that a city's
 * plaza, the waystone and the Log Pose target are the same spot and every city block lines up with the chunk grid.
 */
public final class IslandFinder {
    /** Continentalness at a block column. Must be safe to call from several threads. */
    public interface Field { double at(int x, int z); }

    public static final int LATTICE = 32;
    static final int MAX_POINTS = 6000;     // a lattice island this big is about 2.8 km across: larger than any preset makes
    static final int MAX_REACH = 1800;      // ...and nothing further than this from the start is followed

    public static final class Island {
        public final int cx, cz;            // the centre (snapped summit)
        public final int peakX, peakZ;      // the summit itself (sky islands: the middle of the area)
        public final int radius;            // radius of a disc with the island's area
        final Set<Long> lattice;            // the land lattice points of this island
        Island(int cx, int cz, int px, int pz, Set<Long> lattice) {
            this.cx = cx; this.cz = cz; this.peakX = px; this.peakZ = pz; this.lattice = lattice;
            this.radius = (int) Math.round(Math.sqrt(lattice.size() * (double) LATTICE * LATTICE / Math.PI));
        }

        public String key() { return cx + "," + cz; }

        public int latticeSize() { return lattice.size(); }

        /** true when (x, z) belongs to this island: one of the lattice points around it is part of the island */
        public boolean contains(int x, int z) {
            int lx = Math.floorDiv(x, LATTICE) * LATTICE, lz = Math.floorDiv(z, LATTICE) * LATTICE;
            return lattice.contains(pack(lx, lz)) || lattice.contains(pack(lx + LATTICE, lz)) || lattice.contains(pack(lx, lz + LATTICE)) || lattice.contains(pack(lx + LATTICE, lz + LATTICE));
        }
    }

    private final Field field;
    private final double thr;
    private final int peakStep, cell;
    private final Map<Long, Island> byLattice = new ConcurrentHashMap<>();

    private final boolean centroid;

    /** Ground islands: the centre is the summit of the continentalness field. */
    public IslandFinder(Field field, double landThreshold, int peakStep, int cell) { this(field, landThreshold, peakStep, cell, false); }

    /**
     * @param centroid true for sky islands: the field is the world's density at the probe height (solid > 0) and the centre is the
     *                 middle of the island's area instead of a summit
     */
    public IslandFinder(Field field, double landThreshold, int peakStep, int cell, boolean centroid) {
        this.field = field;
        this.thr = landThreshold;
        this.peakStep = Math.max(8, peakStep);
        this.cell = cell;
        this.centroid = centroid;
    }

    static long pack(int x, int z) { return ((long) x << 32) ^ (z & 0xffffffffL); }

    public double sample(int x, int z) { return field.at(x, z); }

    public boolean isLand(int x, int z) { return field.at(x, z) >= thr; }

    /** How far above the land threshold a point must be to count as well inside the island (sky islands: off the beach). */
    public volatile double innerMargin = 0;

    /** true when (x, z) is land and at least innerMargin above the threshold */
    public boolean inner(int x, int z) { return field.at(x, z) >= thr + innerMargin; }

    /** The scripts' climb (40_islands.js), unchanged: greedy steps that halve from `step` down to 8 blocks. */
    public int[] climb(int x, int z, int step) {
        int bx = x, bz = z;
        double bv = field.at(x, z);
        for (int iter = 0; iter < 200; iter++) {
            boolean moved = false;
            for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
                if (dx == 0 && dz == 0) continue;
                double v = field.at(bx + dx * step, bz + dz * step);
                if (v > bv + 1e-5) { bv = v; bx += dx * step; bz += dz * step; moved = true; }
            }
            if (!moved) { if (step <= 8) break; step = step / 2; }
        }
        return new int[] { bx, bz };
    }

    /** The island (x, z) stands on, or null over the sea. */
    public Island islandAt(int x, int z) {
        if (!isLand(x, z)) return null;
        if (centroid) {
            // sky islands have no summit to climb towards: start from the nearest solid lattice point
            int bx = Math.floorDiv(x, LATTICE) * LATTICE, bz = Math.floorDiv(z, LATTICE) * LATTICE;
            for (int a = 0; a <= 1; a++) for (int b = 0; b <= 1; b++) {
                long k = pack(bx + a * LATTICE, bz + b * LATTICE);
                Island kn = byLattice.get(k);
                if (kn != null) return kn;
            }
            for (int r = 0; r <= 2; r++) for (int a = -r; a <= r + 1; a++) for (int b = -r; b <= r + 1; b++) {
                int qx = bx + a * LATTICE, qz = bz + b * LATTICE;
                if (field.at(qx, qz) >= thr) {
                    long st = pack(qx, qz);
                    Island kn = byLattice.get(st);
                    if (kn != null) return kn;
                    Island isl = flood(st);
                    if (byLattice.size() > 400_000) byLattice.clear();
                    for (Long k : isl.lattice) byLattice.putIfAbsent(k, isl);
                    Island won = byLattice.get(st);
                    return won != null ? won : isl;
                }
            }
            return null;
        }
        int lx = Math.round(x / (float) LATTICE) * LATTICE, lz = Math.round(z / (float) LATTICE) * LATTICE;
        Island known = byLattice.get(pack(lx, lz));
        if (known != null) return known;
        // a lattice point that is land and reachable from (x, z): the nearest one, else the summit the scripts' climb reaches
        long start = Long.MIN_VALUE;
        if (field.at(lx, lz) >= thr) start = pack(lx, lz);
        else {
            int[] p = climb(x, z, peakStep);
            int px = Math.round(p[0] / (float) LATTICE) * LATTICE, pz = Math.round(p[1] / (float) LATTICE) * LATTICE;
            outer:
            for (int r = 0; r <= 2; r++) for (int a = -r; a <= r; a++) for (int b = -r; b <= r; b++) {
                int qx = px + a * LATTICE, qz = pz + b * LATTICE;
                if (field.at(qx, qz) >= thr) { start = pack(qx, qz); break outer; }
            }
            if (start == Long.MIN_VALUE) return null;   // a sliver of land too thin for the lattice
            known = byLattice.get(start);
            if (known != null) return known;
        }
        Island isl = flood(start);
        if (byLattice.size() > 400_000) byLattice.clear();
        for (Long k : isl.lattice) byLattice.putIfAbsent(k, isl);
        Island won = byLattice.get(start);
        return won != null ? won : isl;
    }

    private Island flood(long start) {
        int sx = (int) (start >> 32), sz = (int) start;
        Set<Long> seen = new HashSet<>();
        Map<Long, Double> val = new HashMap<>();
        ArrayDeque<Long> q = new ArrayDeque<>();
        seen.add(start);
        q.add(start);
        long best = start;
        double bestV = field.at(sx, sz);
        val.put(start, bestV);
        Set<Long> land = new HashSet<>();
        int[][] nb = { { LATTICE, 0 }, { -LATTICE, 0 }, { 0, LATTICE }, { 0, -LATTICE } };
        while (!q.isEmpty() && land.size() < MAX_POINTS) {
            long k = q.poll();
            land.add(k);
            int x = (int) (k >> 32), z = (int) k;
            double v = val.get(k);
            int bx = (int) (best >> 32), bz = (int) best;
            if (v > bestV || (v == bestV && (x < bx || (x == bx && z < bz)))) { bestV = v; best = k; }
            for (int[] d : nb) {
                int nx = x + d[0], nz = z + d[1];
                if (Math.abs(nx - sx) > MAX_REACH || Math.abs(nz - sz) > MAX_REACH) continue;
                long nk = pack(nx, nz);
                if (!seen.add(nk)) continue;
                double nv = field.at(nx, nz);
                if (nv < thr) continue;
                val.put(nk, nv);
                q.add(nk);
            }
        }
        int half = cell / 2;
        int[] peak;
        if (centroid) {
            long sumX = 0, sumZ = 0;
            for (long k : land) { sumX += (int) (k >> 32); sumZ += (int) k; }
            int mx = (int) Math.round(sumX / (double) land.size()), mz = (int) Math.round(sumZ / (double) land.size());
            // the middle of a crescent can be off the island: then the solid lattice point nearest to it
            if (field.at(mx, mz) < thr) {
                long near = start; double bd = Double.MAX_VALUE;
                for (long k : land) {
                    double dx = (int) (k >> 32) - mx, dz = (int) k - mz, d = dx * dx + dz * dz;
                    if (d < bd || (d == bd && k < near)) { bd = d; near = k; }
                }
                mx = (int) (near >> 32); mz = (int) near;
            }
            peak = new int[] { mx, mz };
        } else peak = climb((int) (best >> 32), (int) best, 16);
        int cx = Math.floorDiv(peak[0], cell) * cell + half, cz = Math.floorDiv(peak[1], cell) * cell + half;
        return new Island(cx, cz, peak[0], peak[1], land);
    }
}
