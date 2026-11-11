package stodd.core;

import stodd.core.gen.CityPlanner;
import stodd.core.gen.Hash;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.MiniJson;
import stodd.core.gen.WorldRules;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Tests of the Minecraft-free part of the world generation: parity with the scripts (hash, seed, theme rolls), the island finder
 * (same centre from every point of an island, also from several threads) and the city planner (plaza, grid, rotations, districts).
 * usage: java -cp <classes> stodd.core.GenTest <vectors.json from tools/gen_vectors.js>
 */
public final class GenTest {
    static int pass, fail;

    static void ok(boolean c, String m) { if (c) pass++; else { fail++; System.out.println("  FAIL: " + m); } }

    static void section(String s) { System.out.println("\n== " + s); }

    /** The mock world of tools/harness.js: cone-shaped islands, continentalness 0.6 at the centre falling 0.79 per radius. */
    static IslandFinder.Field cones(final int[][] g) {
        return (x, z) -> {
            double v = -1;
            for (int[] i : g) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - i[0], z - i[1]) / i[2]);
            return v;
        };
    }

    public static void main(String[] args) throws Exception {
        Map<String, Object> vec = MiniJson.obj(MiniJson.parse(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8)));

        section("parity with the scripts");
        int bad = 0, n = 0;
        for (Object o : MiniJson.arr(vec.get("hash"))) {
            List<Object> r = MiniJson.arr(o);
            long want = (long) MiniJson.num(r.get(3), -1);
            long got = Hash.hash3((int) MiniJson.num(r.get(0), 0), (int) MiniJson.num(r.get(1), 0), (int) MiniJson.num(r.get(2), 0));
            n++;
            if (got != want) bad++;
        }
        ok(bad == 0 && n == 400, "hash3 equals the script's hash3 on " + n + " vectors (" + bad + " differ)");
        bad = 0;
        for (Object o : MiniJson.arr(vec.get("seed"))) {
            List<Object> r = MiniJson.arr(o);
            int got = WorldRules.scriptSeed(Long.parseLong((String) r.get(0)));
            if (got != (int) MiniJson.num(r.get(1), 0)) { bad++; System.out.println("    seed " + r.get(0) + " java " + got + " js " + r.get(1)); }
        }
        ok(bad == 0, "the script seed (Number(seed % 2147483647)) is reproduced for huge and negative seeds");
        WorldRules rules = WorldRules.builtIn();
        int seed = (int) MiniJson.num(vec.get("themeSeed"), 0);
        int cities = 0, agree = 0, total = 0;
        Map<String, Integer> count = new HashMap<>();
        for (Object o : MiniJson.arr(vec.get("themes"))) {
            List<Object> r = MiniJson.arr(o);
            int x = (int) MiniJson.num(r.get(0), 0), z = (int) MiniJson.num(r.get(1), 0);
            String js = (String) r.get(2);
            WorldRules.Style st = rules.cityStyleAt(x, z, seed);
            boolean jsCity = js.startsWith("city");
            total++;
            if ((st == null && !jsCity) || (st != null && st.id.equals(js))) agree++;
            if (st != null) { cities++; count.merge(st.id, 1, Integer::sum); }
        }
        ok(agree == total, "Java picks exactly the scripts' city style (or no city) for " + total + " island centres (" + (total - agree) + " differ)");
        ok(cities > total * 0.12 && cities < total * 0.26, "about a fifth of far-out islands are cities (" + cities + " of " + total + ": " + count + ")");
        ok(rules.styles.size() == 3 && rules.styles.get("city").templates.size() == 42 && rules.styles.get("city_future").templates.size() == 33
            && rules.styles.get("city_primitive").templates.size() == 46, "the three styles and all 121 block templates are in the built-in rules");
        ok(rules.cityStyleAt(24, 24, seed) == null, "no city right at the world's origin");

        section("island finder");
        int[][] ground = { { 300, 300, 170 }, { -450, 150, 200 }, { 150, -500, 160 }, { 1500, 1400, 260 }, { 1900, 1400, 90 } };
        IslandFinder.Field f = cones(ground);
        IslandFinder fd = new IslandFinder(f, -0.19, 32, 48);
        for (int[] g : ground) {
            Set<String> keys = new HashSet<>();
            int samples = 0;
            for (int a = -g[2]; a <= g[2]; a += 23) for (int b = -g[2]; b <= g[2]; b += 29) {
                int x = g[0] + a, z = g[1] + b;
                if (f.at(x, z) < -0.19) continue;
                IslandFinder.Island isl = new IslandFinder(f, -0.19, 32, 48).islandAt(x, z);   // a fresh finder: no cache helps
                samples++;
                keys.add(isl == null ? "null" : isl.key());
            }
            ok(keys.size() == 1 && !keys.contains("null"), "every one of " + samples + " points of the island at " + g[0] + "," + g[1] + " gives the same centre " + keys);
        }
        IslandFinder.Island a = fd.islandAt(300, 300), b = fd.islandAt(-450, 150);
        ok(a != null && b != null && !a.key().equals(b.key()), "two islands get two centres");
        ok(a != null && Math.abs(a.cx - 300) <= 24 && Math.abs(a.cz - 300) <= 24 && (a.cx - 24) % 48 == 0 && (a.cz - 24) % 48 == 0,
            "the centre is the summit snapped to the middle of its 48-block cell (" + (a == null ? "-" : a.key()) + ")");
        ok(fd.islandAt(0, 2000) == null, "open sea is no island");
        ok(a != null && a.contains(300, 300) && !a.contains(-450, 150), "an island knows its own land");
        IslandFinder.Island big = fd.islandAt(1500, 1400), small = fd.islandAt(1900, 1400);
        ok(big != null && small != null, "two islands that touch (" + (big == null ? "-" : big.key()) + " / " + (small == null ? "-" : small.key()) + ") are found");
        // threads: the structure generator calls from several worker threads at once
        ExecutorService ex = Executors.newFixedThreadPool(8);
        final IslandFinder shared = new IslandFinder(f, -0.19, 32, 48);
        List<Future<String>> fs = new ArrayList<>();
        for (int t = 0; t < 400; t++) {
            final int k = t;
            fs.add(ex.submit(() -> { IslandFinder.Island i = shared.islandAt(-450 + (k % 20) * 9 - 90, 150 + (k / 20) * 9 - 90); return i == null ? "null" : i.key(); }));
        }
        Set<String> tk = new HashSet<>();
        for (Future<String> fu : fs) tk.add(fu.get());
        ex.shutdown();
        ok(tk.size() == 1, "400 lookups from 8 threads agree " + tk);

        section("city planner");
        // a large island far from the origin whose centre rolls a city
        int[] found = null;
        WorldRules.Style style = null;
        for (int t = 0; t < 4000 && found == null; t++) {
            int cx = 3000 + (t % 60) * 480, cz = 3000 + (t / 60) * 480;
            IslandFinder ff = new IslandFinder(cones(new int[][] { { cx, cz, 220 } }), -0.19, 32, 48);
            IslandFinder.Island isl = ff.islandAt(cx, cz);
            if (isl == null) continue;
            WorldRules.Style st = rules.cityStyleAt(isl.cx, isl.cz, seed);
            if (st != null && st.id.equals("city")) { found = new int[] { cx, cz }; style = st; }
        }
        ok(found != null, "a modern-city island exists among the test islands");
        if (found != null) {
            IslandFinder ff = new IslandFinder(cones(new int[][] { { found[0], found[1], 220 } }), -0.19, 32, 48);
            IslandFinder.Island isl = ff.islandAt(found[0], found[1]);
            CityPlanner cp = new CityPlanner(rules);
            CityPlanner.Plan p = cp.plan(ff, isl, (x, z) -> 70, seed);
            ok(p != null && p.style.equals("city"), "the plan has the island's style");
            ok(p.street == 69, "street level is the median ground height (69)");
            CityPlanner.Cell plaza = p.cellAt(isl.cx - 24, isl.cz - 24);
            ok(plaza != null && plaza.plaza && style.plazas.contains(plaza.template) && plaza.rot == 0, "the plaza is the cell on the island's centre");
            boolean aligned = true, inside = true, tpl = true;
            Set<String> ids = new HashSet<>();
            for (CityPlanner.Cell c : p.cells) {
                if (Math.floorMod(c.x, 48) != 0 || Math.floorMod(c.z, 48) != 0) aligned = false;
                if (Math.hypot(c.x + 24 - isl.cx, c.z + 24 - isl.cz) > rules.radius) inside = false;
                boolean known = c.plaza ? style.plazas.contains(c.template) : style.templates.stream().anyMatch(t -> t.id.equals(c.template));
                if (!known) tpl = false;
                ids.add(c.template);
            }
            ok(aligned, "every cell starts on a multiple of 48, i.e. on a 3 x 3 chunk boundary (one structure start per cell)");
            ok(inside, "no cell further than the city radius");
            ok(tpl, "every cell uses one of its style's templates");
            ok(p.cells.size() > 20 && ids.size() > 10, p.cells.size() + " cells with " + ids.size() + " different templates");
            CityPlanner.Plan again = new CityPlanner(rules).plan(ff, isl, (x, z) -> 70, seed);
            boolean same = again.cells.size() == p.cells.size();
            for (int k = 0; same && k < p.cells.size(); k++) same = p.cells.get(k).template.equals(again.cells.get(k).template) && p.cells.get(k).rot == again.cells.get(k).rot;
            ok(same, "planning again (after a restart) gives the identical city");
            // rotation: the rotated 48 x 48 template must cover exactly the cell (same maths as /place template about the origin)
            boolean rotOk = true;
            for (int rot = 0; rot < 4; rot++) {
                CityPlanner.Cell c = new CityPlanner.Cell(0, 0, 96, 144, 0, "t", rot, 10, false);
                int[] o = c.origin(48);
                int minX = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, minZ = Integer.MAX_VALUE, maxZ = Integer.MIN_VALUE;
                for (int dx = 0; dx < 48; dx += 47) for (int dz = 0; dz < 48; dz += 47) {
                    int[] w = rotate(dx, dz, rot);
                    minX = Math.min(minX, o[0] + w[0]); maxX = Math.max(maxX, o[0] + w[0]);
                    minZ = Math.min(minZ, o[1] + w[1]); maxZ = Math.max(maxZ, o[1] + w[1]);
                }
                if (minX != 96 || maxX != 143 || minZ != 144 || maxZ != 191) rotOk = false;
            }
            ok(rotOk, "every rotation fills exactly its cell");
            double near = 0, far = 0; int nn = 0, nf = 0;
            for (CityPlanner.Cell c : p.cells) {
                if (c.plaza) continue;
                if (c.d < p.extent * 0.35) { near += c.height; nn++; }
                else if (c.d > p.extent * 0.7) { far += c.height; nf++; }
            }
            ok(nn > 0 && nf > 0 && near / nn > far / nf, "downtown is taller than the outskirts (" + (nn == 0 ? 0 : (int) (near / nn)) + " vs " + (nf == 0 ? 0 : (int) (far / nf)) + ")");
            // two islands with the same style get different layouts
            int diff = 0;
            for (int t = 0; t < 4000; t++) {
                int cx = 3000 + (t % 60) * 480, cz = 3000 + (t / 60) * 480;
                if (cx == found[0] && cz == found[1]) continue;
                IslandFinder f2 = new IslandFinder(cones(new int[][] { { cx, cz, 220 } }), -0.19, 32, 48);
                IslandFinder.Island i2 = f2.islandAt(cx, cz);
                if (i2 == null) continue;
                CityPlanner.Plan p2 = cp.plan(f2, i2, (x, z) -> 70, seed);
                if (p2 == null || !p2.style.equals("city")) continue;
                CityPlanner.Cell c1 = p.cellAt(isl.cx - 24 + 48, isl.cz - 24), c2 = p2.cellAt(i2.cx - 24 + 48, i2.cz - 24);
                if (c1 != null && c2 != null && (!c1.template.equals(c2.template) || c1.rot != c2.rot)) diff++;
                if (diff > 0) break;
            }
            ok(diff > 0, "two city islands are laid out differently");
        }
        System.out.println("\n" + pass + " passed, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }

    /** Minecraft's StructureTemplate rotation about the origin: NONE, CLOCKWISE_90, CLOCKWISE_180, COUNTERCLOCKWISE_90. */
    static int[] rotate(int x, int z, int rot) {
        switch (rot) {
            case 1: return new int[] { -z, x };
            case 2: return new int[] { -x, -z };
            case 3: return new int[] { z, -x };
            default: return new int[] { x, z };
        }
    }
}
