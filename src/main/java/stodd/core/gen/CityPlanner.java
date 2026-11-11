package stodd.core.gen;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The plan of a city island: its street level and, for every 48 x 48 cell of the island, the template, its rotation and where
 * the template's origin goes. The same decisions 49_city.js made at runtime (land test, district zones, weights, rotation, the
 * plaza in the middle), now made once per island while the world generates, and the same every time they are asked for.
 */
public final class CityPlanner {
    /** Ground height of a column as the generator will make it (ChunkGenerator#getBaseHeight with OCEAN_FLOOR_WG). */
    public interface Heights { int base(int x, int z); }

    public static final class Cell {
        public final int i, j, x, z, rot, height;
        public final double d;
        public final String template;
        public final boolean plaza;
        public Cell(int i, int j, int x, int z, double d, String template, int rot, int height, boolean plaza) {
            this.i = i; this.j = j; this.x = x; this.z = z; this.d = d; this.template = template; this.rot = rot; this.height = height; this.plaza = plaza;
        }
        /** Where /place template (or a template piece) must put the origin so the rotated template fills [x, x+cell-1] x [z, z+cell-1]. */
        public int[] origin(int cell) {
            int a = cell - 1;
            if (rot == 1) return new int[] { x + a, z };
            if (rot == 2) return new int[] { x + a, z + a };
            if (rot == 3) return new int[] { x, z + a };
            return new int[] { x, z };
        }
    }

    public static final class Plan {
        public final String key, style, label;
        public final int cx, cz, street;
        public final double extent;
        public final List<Cell> cells;
        private final Map<Long, Cell> byOrigin;
        Plan(String key, String style, int cx, int cz, int street, double extent, List<Cell> cells) {
            this.key = key; this.style = style; this.label = style + " at " + key; this.cx = cx; this.cz = cz; this.street = street; this.extent = extent;
            this.cells = Collections.unmodifiableList(cells);
            Map<Long, Cell> m = new HashMap<>();
            for (Cell c : cells) m.put(IslandFinder.pack(c.x, c.z), c);
            this.byOrigin = m;
        }
        /** The cell whose north-west corner is (x, z), or null when that cell is not part of this city. */
        public Cell cellAt(int x, int z) { return byOrigin.get(IslandFinder.pack(x, z)); }
    }

    private final WorldRules rules;
    private final Map<String, Plan> plans = new ConcurrentHashMap<>();

    public CityPlanner(WorldRules rules) { this.rules = rules; }

    public WorldRules rules() { return rules; }

    /** The plan for a city island (null when the island is not a city). Computed once and remembered. */
    public Plan plan(IslandFinder finder, IslandFinder.Island isl, Heights heights, int seed) {
        WorldRules.Style st = rules.cityStyleAt(isl.cx, isl.cz, seed);
        if (st == null) return null;
        String k = seed + ":" + isl.key();
        Plan p = plans.get(k);
        if (p != null) return p;
        p = build(finder, isl, st, heights, seed);
        if (plans.size() > 2000) plans.clear();
        Plan old = plans.putIfAbsent(k, p);
        return old != null ? old : p;
    }

    private Plan build(IslandFinder f, IslandFinder.Island isl, WorldRules.Style st, Heights heights, int seed) {
        int CELL = rules.cell, R = rules.radius;
        double THR = rules.landThreshold + rules.landMargin;
        int half = CELL / 2;
        int x0 = isl.cx - half, z0 = isl.cz - half;
        int street = streetLevel(f, isl, heights, THR);
        int N = (int) Math.ceil(R / (double) CELL) + 1;
        List<int[]> keep = new ArrayList<>();
        List<Double> dist = new ArrayList<>();
        for (int i = -N; i <= N; i++) for (int j = -N; j <= N; j++) {
            int x = x0 + i * CELL, z = z0 + j * CELL;
            int mx = x + half, mz = z + half;
            double d = Math.hypot(mx - isl.cx, mz - isl.cz);
            if (!(i == 0 && j == 0)) {
                if (d > R) continue;
                int[][] pts = { { mx, mz }, { x, z }, { x + CELL - 1, z }, { x, z + CELL - 1 }, { x + CELL - 1, z + CELL - 1 } };
                boolean ok = true;
                for (int[] pt : pts) if (f.sample(pt[0], pt[1]) < THR) { ok = false; break; }
                if (!ok) continue;
                if (!isl.contains(mx, mz)) continue;
            }
            keep.add(new int[] { i, j, x, z });
            dist.add(d);
        }
        double extent = CELL;
        for (double d : dist) if (d > extent) extent = d;
        List<Cell> cells = new ArrayList<>();
        for (int n = 0; n < keep.size(); n++) {
            int[] c = keep.get(n);
            double d = dist.get(n);
            Cell cell = pick(st, isl, c[0], c[1], c[2], c[3], d, extent, seed);
            if (cell != null) cells.add(cell);
        }
        return new Plan(isl.key(), st.id, isl.cx, isl.cz, street, extent, cells);
    }

    /** Median ground height over the island's land (columns under a sky island read high and are left out), held in [baseMin, baseMax]. */
    private int streetLevel(IslandFinder f, IslandFinder.Island isl, Heights heights, double thr) {
        List<Integer> hs = new ArrayList<>();
        int R = Math.min(rules.radius, 240), step = rules.sampleStep;
        for (int dx = -R; dx <= R; dx += step) for (int dz = -R; dz <= R; dz += step) {
            if (dx * dx + dz * dz > R * R) continue;
            int x = isl.cx + dx, z = isl.cz + dz;
            if (f.sample(x, z) < thr || !isl.contains(x, z)) continue;
            int h = heights.base(x, z) - 1;
            if (h > 40 && h < 190) hs.add(h);
        }
        if (hs.isEmpty()) return (rules.baseMin + rules.baseMax) / 2;
        Collections.sort(hs);
        return Math.max(rules.baseMin, Math.min(rules.baseMax, hs.get(hs.size() / 2)));
    }

    private Cell pick(WorldRules.Style st, IslandFinder.Island isl, int i, int j, int x, int z, double d, double extent, int seed) {
        if (i == 0 && j == 0) {
            if (st.plazas.isEmpty()) return null;
            int start = (int) (Hash.hash3(isl.cx + 31, isl.cz - 17, seed ^ 0x2c1b3c6d) % st.plazas.size());
            String id = st.plazas.get(start);
            return new Cell(i, j, x, z, d, id, 0, st.plazaHeightOf(id), true);
        }
        List<WorldRules.Zone> zones = st.zones;
        double t = Math.min(1, d / (extent > 0 ? extent : rules.radius));
        WorldRules.Zone zone = zones.isEmpty() ? null : zones.get(zones.size() - 1);
        for (WorldRules.Zone zz : zones) if (t <= zz.upTo) { zone = zz; break; }
        double total = 0;
        List<WorldRules.Template> list = new ArrayList<>();
        List<Double> w = new ArrayList<>();
        for (WorldRules.Template tp : st.templates) {
            Double m = zone == null ? null : zone.kind.get(tp.kind);
            double wt = tp.weight * (m == null ? 1 : m);
            if (wt <= 0) continue;
            list.add(tp); w.add(wt); total += wt;
        }
        if (list.isEmpty()) return null;
        // every island gets its own layout: the island's centre is mixed into the seed (the scripts reused one layout for all)
        int isle = (int) Hash.hash3(isl.cx, isl.cz, seed ^ 0x1b873593);
        double r = (Hash.hash3(i * 7919 + 13, j * 104729 - 7, seed ^ 0x3a7e1f5d ^ isle) % 100000) / 100000.0 * total;
        WorldRules.Template pick = list.get(list.size() - 1);
        for (int k = 0; k < list.size(); k++) { r -= w.get(k); if (r < 0) { pick = list.get(k); break; } }
        int rot = (int) ((Hash.hash3(i + 101, j - 57, seed ^ 0x51ed270b ^ isle) >>> 7) & 3);
        return new Cell(i, j, x, z, d, pick.id, rot, pick.height, false);
    }
}
