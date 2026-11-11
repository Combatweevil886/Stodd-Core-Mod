package stodd.core.gen;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Finding islands nobody has visited: the map is cut into 512 x 512 block cells; a cell is looked at once (a sample every 64
 * blocks, each land sample asks the IslandFinder which island it is on) and the islands found are remembered. A search widens
 * cell by cell, at most `budget` new cells per call, so it never stalls the server; it says when it has seen everything in reach.
 */
public final class IslandIndex {
    public static final int CELL = 512;
    static final int STEP = 64;

    /** the three kinds of island: on the ground, lifted into the sky, sunk under a bubble dome */
    public static final int GROUND = 0, SKY = 1, DEEP = 2;

    public static final class Hit {
        public final IslandFinder.Island island;
        public final boolean sky, deep;
        public final int layer;
        public final double d;
        Hit(IslandFinder.Island island, int layer, double d) { this.island = island; this.layer = layer; this.sky = layer == SKY; this.deep = layer == DEEP; this.d = d; }
    }

    public static final class Result {
        public final List<Hit> list;
        public final boolean complete;
        Result(List<Hit> list, boolean complete) { this.list = list; this.complete = complete; }
    }

    private final IslandFinder ground, sky, deep;
    private final int skyMinRadius, skyMinY;
    private final Map<Long, List<IslandFinder.Island>> groundCells = new ConcurrentHashMap<>(), skyCells = new ConcurrentHashMap<>(), deepCells = new ConcurrentHashMap<>();

    /** @param sky may be null (no sky islands in this world) */
    public IslandIndex(IslandFinder ground, IslandFinder sky, int skyMinRadius) { this(ground, sky, skyMinRadius, 200); }

    public IslandIndex(IslandFinder ground, IslandFinder sky, int skyMinRadius, int skyMinY) { this(ground, sky, null, skyMinRadius, skyMinY); }

    /** @param deep the sunken islands (null: none in this world) */
    public IslandIndex(IslandFinder ground, IslandFinder sky, IslandFinder deep, int skyMinRadius, int skyMinY) {
        this.ground = ground; this.sky = sky; this.deep = deep; this.skyMinRadius = skyMinRadius; this.skyMinY = skyMinY;
    }

    public IslandFinder deep() { return deep; }

    /** smaller sky islands are left out */
    public int skyMinRadius() { return skyMinRadius; }

    /** a player at or above this height over a sky island is on it */
    public int skyMinY() { return skyMinY; }

    public IslandFinder ground() { return ground; }

    public IslandFinder sky() { return sky; }

    private List<IslandFinder.Island> scan(IslandFinder f, int ix, int iz, boolean isSky) {
        Map<String, IslandFinder.Island> found = new LinkedHashMap<>();
        int x0 = ix * CELL, z0 = iz * CELL;
        for (int a = STEP / 2; a < CELL; a += STEP) for (int b = STEP / 2; b < CELL; b += STEP) {
            int x = x0 + a, z = z0 + b;
            if (!f.isLand(x, z)) continue;
            IslandFinder.Island isl = f.islandAt(x, z);
            if (isl == null) continue;
            if (isSky && isl.radius < skyMinRadius) continue;
            found.putIfAbsent(isl.key(), isl);
        }
        return new ArrayList<>(found.values());
    }

    /** Islands whose centre is within R of (x, z), nearest first. */
    public Result near(int x, int z, int R, int budget, boolean wantSky) { return near(x, z, R, budget, wantSky ? SKY : GROUND); }

    /** Islands of one kind (GROUND, SKY, DEEP) whose centre is within R of (x, z), nearest first. */
    public Result near(int x, int z, int R, int budget, int layer) {
        IslandFinder f = layer == SKY ? sky : layer == DEEP ? deep : ground;
        boolean wantSky = layer == SKY;
        if (f == null) return new Result(new ArrayList<>(), true);
        Map<Long, List<IslandFinder.Island>> cells = layer == SKY ? skyCells : layer == DEEP ? deepCells : groundCells;
        int i0 = Math.floorDiv(x - R, CELL), i1 = Math.floorDiv(x + R, CELL), j0 = Math.floorDiv(z - R, CELL), j1 = Math.floorDiv(z + R, CELL);
        List<long[]> todo = new ArrayList<>();
        for (int i = i0; i <= i1; i++) for (int j = j0; j <= j1; j++) {
            if (cells.containsKey(IslandFinder.pack(i, j))) continue;
            long dx = (long) ((i + 0.5) * CELL - x), dz = (long) ((j + 0.5) * CELL - z);
            todo.add(new long[] { i, j, dx * dx + dz * dz });
        }
        todo.sort(Comparator.comparingLong(t -> t[2]));
        int n = Math.min(Math.max(0, budget), todo.size());
        for (int k = 0; k < n; k++) {
            int i = (int) todo.get(k)[0], j = (int) todo.get(k)[1];
            cells.put(IslandFinder.pack(i, j), scan(f, i, j, wantSky));
        }
        if (cells.size() > 60_000) cells.clear();
        Map<String, Hit> out = new LinkedHashMap<>();
        // an island is listed by every cell it reaches into, so a margin of one cell is enough for every centre within R
        for (int i = i0 - 1; i <= i1 + 1; i++) for (int j = j0 - 1; j <= j1 + 1; j++) {
            List<IslandFinder.Island> l = cells.get(IslandFinder.pack(i, j));
            if (l == null) continue;
            for (IslandFinder.Island isl : l) {
                double d = Math.hypot(isl.cx - x, isl.cz - z);
                if (d <= R) out.putIfAbsent(isl.key(), new Hit(isl, layer, d));
            }
        }
        List<Hit> list = new ArrayList<>(out.values());
        list.sort(Comparator.comparingDouble((Hit h) -> h.d).thenComparing(h -> h.island.key()));
        return new Result(list, todo.size() <= n);
    }
}
