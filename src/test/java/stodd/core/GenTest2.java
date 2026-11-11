package stodd.core;

import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslandIndex;
import stodd.core.gen.IslePlanner;
import stodd.core.gen.LogPoseBrain;
import stodd.core.gen.MiniJson;
import stodd.core.gen.OriginRules;
import stodd.core.gen.WorldRules;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tests of the add-on rules (origins against the power systems), the dressed-island and sky-island planner, the island index and the
 * Log Pose. usage: java -cp <classes> stodd.core.GenTest2 <vectors.json>
 */
public final class GenTest2 {
    static int pass, fail;

    static void ok(boolean c, String m) { if (c) pass++; else { fail++; System.out.println("  FAIL: " + m); } }

    static void section(String s) { System.out.println("\n== " + s); }

    static IslandFinder.Field cones(final int[][] g) {
        return (x, z) -> {
            double v = -1;
            for (int[] i : g) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - i[0], z - i[1]) / i[2]);
            return v;
        };
    }

    /** a sky field: discs of solid density */
    static IslandFinder.Field discs(final int[][] g) {
        return (x, z) -> {
            for (int[] i : g) if (Math.hypot(x - i[0], z - i[1]) <= i[2]) return 1;
            return -1;
        };
    }

    public static void main(String[] args) throws Exception {
        Map<String, Object> vec = MiniJson.obj(MiniJson.parse(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8)));
        WorldRules rules = WorldRules.builtIn();
        int seed = (int) MiniJson.num(vec.get("themeSeed"), 0);

        section("themes: Java and the scripts agree on every island");
        int agree = 0, total = 0;
        Set<String> seenThemes = new HashSet<>();
        for (Object o : MiniJson.arr(vec.get("themes"))) {
            List<Object> r = MiniJson.arr(o);
            int x = (int) MiniJson.num(r.get(0), 0), z = (int) MiniJson.num(r.get(1), 0);
            String js = (String) r.get(2);
            String java = rules.themeAt(x, z, seed).id;
            total++;
            if (java.equals(js)) agree++;
            seenThemes.add(java);
        }
        ok(agree == total, "the theme of all " + total + " island centres matches 40_islands.js (" + (total - agree) + " differ)");
        ok(seenThemes.containsAll(Arrays.asList("one_piece", "jujutsu", "cyberpunk", "arcane", "wild", "city", "city_future", "city_primitive", "ember", "sakura", "ruins", "crystal", "skull")),
            "all 13 themes occur " + seenThemes);
        ok(rules.islandName("city", 12345L).matches("[A-Z][a-z]+ [A-Za-z ]+"), "island names look like 'Kamiro Skyline' (" + rules.islandName("city", 12345L) + ")");

        section("origins and the power systems");
        OriginRules or = rules.origins;
        ok(or.origins.size() == 10, "ten origins");
        // the rules as the README states them (an independent oracle, not read from the config)
        String[][] want = {
            // origin, fruit, sorcery, magic, cyber
            { "human", "no", "no", "no", "yes" }, { "devil_fruit_user", "yes", "no", "no", "yes" }, { "cyberware_user", "yes", "no", "no", "yes" },
            { "swordsman", "path", "path", "no", "yes" }, { "sorcerer", "no", "yes", "no", "no" }, { "dark_magician", "yes", "no", "yes", "no" },
            { "weakling", "no", "no", "no", "yes" }, { "marksman", "path", "path", "no", "yes" }, { "brawler", "no", "yes", "no", "yes" },
            { "skyborn", "no", "no", "no", "no" } };
        String[] sys = { OriginRules.FRUIT, OriginRules.SORCERY, OriginRules.MAGIC, OriginRules.CYBER };
        int bad = 0;
        for (String[] w : want) for (int k = 0; k < 4; k++) {
            OriginRules.Verdict none = or.verdict(w[0], "", sys[k]);
            OriginRules.Verdict onIt = or.verdict(w[0], sys[k], sys[k]);
            OriginRules.Verdict onOther = or.verdict(w[0], k == 0 ? OriginRules.SORCERY : OriginRules.FRUIT, sys[k]);
            boolean okk;
            if (w[k + 1].equals("yes")) okk = none == OriginRules.Verdict.ALLOW && onIt == OriginRules.Verdict.ALLOW;
            else if (w[k + 1].equals("no")) okk = none == OriginRules.Verdict.DENY && onIt == OriginRules.Verdict.DENY;
            else okk = none == OriginRules.Verdict.ALLOW_AND_LOCK && onIt == OriginRules.Verdict.ALLOW && onOther == OriginRules.Verdict.DENY;
            if (!okk) { bad++; System.out.println("    " + w[0] + " " + sys[k] + ": " + none + " / " + onIt + " / " + onOther); }
        }
        ok(bad == 0, "every origin x system verdict matches the README table, including the one-path rule");
        ok(or.verdict(null, "", OriginRules.FRUIT) == OriginRules.Verdict.NO_ORIGIN, "no origin yet: blocked until one is chosen");
        ok(or.denyText("swordsman", OriginRules.FRUIT).contains("another path") && or.denyText("human", OriginRules.FRUIT).contains("Devil Fruit")
            && or.denyText("sorcerer", OriginRules.CYBER).contains("chrome"), "the refusal texts");
        List<String[]> mods = new ArrayList<>();
        mods.add(new String[] { "trueprimepiece", "True | Prime Piece" });
        mods.add(new String[] { "tppgears", "True Prime Piece: Gears 4 & 5" });
        mods.add(new String[] { "malum", "Malum" });
        mods.add(new String[] { "malum_vestis", "Malum: Vestis" });
        mods.add(new String[] { "jujutsucraft", "Jujutsu Craft" });
        mods.add(new String[] { "minecraft", "Minecraft" });
        or.resolveMods(mods);
        ok(or.fruitNamespaces().containsAll(Arrays.asList("trueprimepiece", "tppgears")), "both True Prime Piece jars are Devil Fruit mods " + or.fruitNamespaces());
        ok(or.magicNamespaces().equals(new HashSet<>(Collections.singletonList("malum"))), "only Malum itself is the dark-magic mod (not Malum: Vestis) " + or.magicNamespaces());
        List<String> none = Collections.emptyList();
        ok(OriginRules.FRUIT.equals(or.systemOfItem("trueprimepiece:gomu_gomu_no_mi", "Gomu Gomu no Mi", none)), "a no_mi item of True Prime Piece is a Devil Fruit");
        ok(or.systemOfItem("trueprimepiece:marine_sword", "Marine Sword", none) == null, "...its swords are not");
        ok(OriginRules.MAGIC.equals(or.systemOfItem("malum:crude_scythe", "Crude Scythe", none)), "Malum's scythe is dark magic");
        ok(or.systemOfItem("malum:soul_stained_steel_ingot", "", none) == null, "Malum's ingots are not");
        ok(OriginRules.SORCERY.equals(or.systemOfItem("jujutsucraft:skill_selection_book", "", none)), "Jujutsu Craft's skill selection book is Cursed Energy");
        ok(OriginRules.SORCERY.equals(or.systemOfItem("jujutsucraft:mystery_item", "Cursed Technique Book", none)), "...also when only its name says so");
        ok(or.systemOfItem("jujutsucraft:cursed_ore", "Cursed Ore", none) == null, "...its ores are not");
        ok(OriginRules.FRUIT.equals(or.systemOfItem("othermod:thing", "", Collections.singletonList("stodd:devil_fruits"))), "anything in the tag stodd:devil_fruits is a fruit");
        ok(or.systemOfItem("minecraft:apple", "Apple", none) == null, "an apple is nothing");
        ok(OriginRules.MAGIC.equals(or.systemOfBlock("malum:spirit_altar", none)) && OriginRules.CYBER.equals(or.systemOfBlock("project_edgerunner:ripperdoc", none))
            && or.systemOfBlock("malum:runewood_planks", none) == null, "Malum's altar and the Ripperdoc are gated blocks, planks are not");
        ok(or.ripperdocEntity("project_edgerunner:ripperdoc_vic", "") && or.ripperdocEntity("minecraft:villager", "nightcity:ripperdoc") && !or.ripperdocEntity("minecraft:villager", "minecraft:farmer"),
            "ripperdoc NPCs by type or profession");
        Map<String, Integer> w1 = or.slotsAt("weakling", 1), w35 = or.slotsAt("weakling", 35), h1 = or.slotsAt("human", 1);
        int t1 = 0, t35 = 0, th = 0;
        for (int v : w1.values()) t1 += v;
        for (int v : w35.values()) t35 += v;
        for (int v : h1.values()) th += v;
        ok(t1 == 1 && t35 == 24 && th == 24 && or.slotRow("weakling", 20) == 4 && or.slotRow("human", 20) == -1, "Weakling slots: 1 at L1, 24 at L35 (= a Human's); only the Weakling grows");
        ok(or.cyberCapacityAt("cyberware_user", 20) == 980 && or.cyberCapacityAt("sorcerer", 20) == 0 && or.cyberCapacityAt("brawler", 20) == 275,
            "cyberware tolerance: Cyberware User 980 at L20, Sorcerer 0, Brawler 275");

        section("dressed islands");
        int[] isle = null;
        WorldRules.IsleTheme th0 = null;
        for (int t = 0; t < 4000 && isle == null; t++) {
            int cx = 3000 + (t % 60) * 480, cz = 3000 + (t / 60) * 480;
            IslandFinder ff = new IslandFinder(cones(new int[][] { { cx, cz, 230 } }), -0.19, 32, 48);
            IslandFinder.Island i = ff.islandAt(cx, cz);
            if (i == null) continue;
            WorldRules.IsleTheme it = rules.isleAt(i.cx, i.cz, seed);
            if (it != null && it.id.equals("ember")) { isle = new int[] { cx, cz }; th0 = it; }
        }
        ok(isle != null, "an Ember Isle exists among the test islands");
        if (isle != null) {
            IslandFinder ff = new IslandFinder(cones(new int[][] { { isle[0], isle[1], 230 } }), -0.19, 32, 48);
            IslandFinder.Island i = ff.islandAt(isle[0], isle[1]);
            IslePlanner.Plan p = new IslePlanner(rules).ground(ff, i, seed);
            ok(p != null && p.theme.equals("ember") && !p.sky, "the plan is Ember's");
            IslePlanner.Cell mid = p.cellAt(i.cx - 24, i.cz - 24);
            ok(mid != null && mid.mark != null && mid.mark.centre && th0.center.contains(mid.mark.id), "the middle cell carries one of Ember's centrepieces (" + (mid == null || mid.mark == null ? "-" : mid.mark.id) + ")");
            boolean adj = false, inside = true, fromList = true, aligned = true;
            List<IslePlanner.Cell> marked = new ArrayList<>();
            Set<String> scatterIds = new HashSet<>();
            for (WorldRules.Weighted wt : th0.scatter) scatterIds.add(wt.id);
            for (IslePlanner.Cell c : p.cells) {
                if (Math.floorMod(c.x, 48) != 0 || Math.floorMod(c.z, 48) != 0) aligned = false;
                if (c.mark == null) continue;
                for (IslePlanner.Cell o : marked) if (Math.max(Math.abs(o.i - c.i), Math.abs(o.j - c.j)) <= 1) adj = true;
                marked.add(c);
                IslePlanner.Mark m = c.mark;
                if (m.fx < c.x || m.fz < c.z || m.fx + m.fw > c.x + 48 || m.fz + m.fd > c.z + 48) inside = false;
                if (!m.centre && !scatterIds.contains(m.id)) fromList = false;
                WorldRules.Landmark lm = rules.landmarks.get(m.id);
                int fw = (m.rot & 1) != 0 ? lm.sz : lm.sx;
                if (fw != m.fw) inside = false;
            }
            ok(aligned, "cells are on the 48-block grid (chunk-aligned)");
            ok(!adj, "no two landmarks side by side");
            ok(inside, "every footprint (rotated) lies inside its cell");
            ok(fromList, "scatter landmarks come from Ember's own list");
            ok(marked.size() >= 3, marked.size() + " landmarks on " + p.cells.size() + " cells");
            // rotation origin: rotating the template about its corner must cover exactly the footprint
            boolean rotOk = true;
            for (IslePlanner.Cell c : marked) {
                IslePlanner.Mark m = c.mark;
                WorldRules.Landmark lm = rules.landmarks.get(m.id);
                int[] o = m.origin(lm);
                int minX = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, minZ = Integer.MAX_VALUE, maxZ = Integer.MIN_VALUE;
                for (int dx = 0; dx < lm.sx; dx += Math.max(1, lm.sx - 1)) for (int dz = 0; dz < lm.sz; dz += Math.max(1, lm.sz - 1)) {
                    int[] r = GenTest.rotate(dx, dz, m.rot);
                    minX = Math.min(minX, o[0] + r[0]); maxX = Math.max(maxX, o[0] + r[0]); minZ = Math.min(minZ, o[1] + r[1]); maxZ = Math.max(maxZ, o[1] + r[1]);
                }
                if (minX != m.fx || minZ != m.fz || maxX != m.fx + m.fw - 1 || maxZ != m.fz + m.fd - 1) rotOk = false;
            }
            ok(rotOk, "every landmark's rotated template covers exactly its footprint");
            IslePlanner.Plan again = new IslePlanner(rules).ground(ff, i, seed);
            ok(again.landmarks() == p.landmarks() && again.cells.size() == p.cells.size(), "planning again gives the same island");
        }

        section("sky islands");
        IslandFinder sky = new IslandFinder(discs(new int[][] { { 5000, 5000, 170 }, { 5600, 5000, 60 }, { 6200, 5200, 30 } }), 1e-6, 32, 48, true);
        IslandFinder.Island s1 = sky.islandAt(5100, 5050), s1b = sky.islandAt(4900, 4950);
        ok(s1 != null && s1b != null && s1.key().equals(s1b.key()), "two points of one sky island give one centre");
        ok(s1 != null && Math.abs(s1.cx - 5000) <= 24 && Math.abs(s1.cz - 5000) <= 24 && Math.abs(s1.radius - 170) < 20, "centre in the middle, radius about right (" + (s1 == null ? "-" : s1.key() + " r" + s1.radius) + ")");
        IslePlanner.Plan sp = new IslePlanner(rules).sky(sky, s1, seed);
        ok(sp != null && sp.sky && sp.skyStyle != null, "a sky plan with a style (" + (sp == null || sp.skyStyle == null ? "-" : sp.skyStyle.name) + ")");
        boolean onIsland = true, awayFromMiddle = true;
        int feats = 0;
        for (IslePlanner.Cell c : sp.cells) {
            if (c.mark != null) {
                IslePlanner.Mark m = c.mark;
                for (int a = -3; a <= m.fw + 2; a += Math.max(1, m.fw + 5)) for (int b = -3; b <= m.fd + 2; b += Math.max(1, m.fd + 5))
                    if (!(sky.sample(m.fx + a, m.fz + b) > 0)) onIsland = false;
            }
            for (int[] f : c.features) {
                feats++;
                if (!(sky.sample(f[0], f[1]) > 0)) onIsland = false;
                if (Math.abs(f[0] - sp.cx) < 7 && Math.abs(f[1] - sp.cz) < 7) awayFromMiddle = false;
            }
        }
        ok(onIsland, "landmarks (with a 3-block margin) and every tree stand on the island");
        ok(awayFromMiddle && feats > 10, feats + " trees / flowers, none in the middle where the waystone goes");
        ok(new IslePlanner(rules).sky(sky, sky.islandAt(6200, 5200), seed) == null, "a floating rock smaller than the minimum radius is not dressed");

        section("island index and the Log Pose");
        int[][] ground = new int[40][];
        for (int k = 0; k < 40; k++) ground[k] = new int[] { 2000 + (k % 8) * 700, 2000 + (k / 8) * 700 + (k % 2) * 200, 170 };
        IslandFinder gf = new IslandFinder(cones(ground), -0.19, 32, 48);
        IslandFinder sf = new IslandFinder(discs(new int[][] { { 2350, 2350, 120 } }), 1e-6, 32, 48, true);
        IslandIndex idx = new IslandIndex(gf, sf, 48);
        IslandIndex.Result r1 = idx.near(2000, 2000, 1500, 2, false);
        ok(!r1.complete, "a wide search is spread over several calls");
        IslandIndex.Result r2 = null;
        for (int k = 0; k < 40 && (r2 == null || !r2.complete); k++) r2 = idx.near(2000, 2000, 1500, 4, false);
        ok(r2 != null && r2.complete && r2.list.size() >= 6, "...and completes, finding " + (r2 == null ? 0 : r2.list.size()) + " islands");
        boolean sorted = true;
        for (int k = 1; r2 != null && k < r2.list.size(); k++) if (r2.list.get(k).d < r2.list.get(k - 1).d) sorted = false;
        ok(sorted, "nearest first");
        LogPoseBrain brain = new LogPoseBrain(rules, idx, seed, 64);
        LogPoseBrain.State st = new LogPoseBrain.State();
        List<String> seen = new ArrayList<>();
        // standing on the first island: "next" points elsewhere, never at the island underfoot
        LogPoseBrain.Out o1 = null;
        for (int k = 0; k < 5; k++) o1 = brain.tick(st, 2000, 70, 2000, 100 + k * 20, 0, seen);
        ok(o1.here != null && o1.hasTarget && !o1.target.key.equals(o1.here.key), "next island: points at another island, not the one you stand on");
        ok(Math.abs(o1.dist - Math.hypot(o1.tx - 2000, o1.tz - 2000)) < 1, "distance is to the target's centre");
        // recording: 3 s near the middle
        LogPoseBrain.State st2 = new LogPoseBrain.State();
        List<String> seen2 = new ArrayList<>();
        IslandFinder.Island home = gf.islandAt(2000, 2000);
        LogPoseBrain.Out rec = null;
        for (int k = 0; k <= 4 && rec == null; k++) { LogPoseBrain.Out o = brain.tick(st2, home.cx, 70, home.cz, 1000 + k * 20, 0, seen2); if (o.recorded != null) rec = o; }
        ok(rec != null && seen2.contains(home.key()), "3 seconds at an island's middle records it");
        LogPoseBrain.Out after = brain.tick(st2, home.cx + 200, 70, home.cz, 1200, 0, seen2);
        ok(after.hasTarget && !seen2.contains(after.target.key), "next island skips recorded islands");
        // walking from island to island with the needle: every target is new
        LogPoseBrain.State st3 = new LogPoseBrain.State();
        List<String> seen3 = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        double px = 2000, pz = 2000;
        long now = 5000;
        boolean repeat = false;
        for (int hop = 0; hop < 6; hop++) {
            LogPoseBrain.Out o = null;
            for (int k = 0; k < 6; k++) { o = brain.tick(st3, px, 70, pz, now, 0, seen3); now += 20; }
            if (!o.hasTarget) break;
            if (visited.contains(o.target.key)) repeat = true;
            visited.add(o.target.key);
            px = o.tx; pz = o.tz;
            for (int k = 0; k < 5; k++) { brain.tick(st3, px, 70, pz, now, 0, seen3); now += 20; }
        }
        ok(!repeat && visited.size() >= 5, "following the needle leads to " + visited.size() + " different islands, never back");
        // nearest mode includes recorded islands
        LogPoseBrain.Out near = brain.tick(new LogPoseBrain.State(), home.cx + 260, 70, home.cz + 10, 9000, 1, new ArrayList<>(seen2));
        ok(near.hasTarget && near.modeName.equals("Nearest island"), "mode 2 is Nearest island (" + near.modeName + ")");
        // city mode: only city islands
        int cityMode = -1;
        for (int k = 0; k < rules.lpModes.size(); k++) if (rules.lpModes.get(k).kind.equals("themes")) cityMode = k;
        LogPoseBrain.Out cityO = null;
        for (int k = 0; k < 8; k++) cityO = brain.tick(new LogPoseBrain.State(), 3500, 70, 3500, 9100 + k, cityMode, new ArrayList<>());
        boolean anyCity = false;
        for (int[] g : ground) { IslandFinder.Island gi = gf.islandAt(g[0], g[1]); if (gi != null && rules.themeAt(gi.cx, gi.cz, seed).isCity()) anyCity = true; }
        if (anyCity) ok(cityO.hasTarget && rules.themeAt(cityO.tx, cityO.tz, seed).isCity(), "nearest city mode points at a city island");
        else ok(cityO == null || !cityO.hasTarget, "no city among the test islands: nothing to point at");
        // up in the air, next mode looks for sky islands
        LogPoseBrain.Out up = null;
        for (int k = 0; k < 4; k++) up = brain.tick(new LogPoseBrain.State(), 2100, 260, 2100, 9500 + k * 20, 0, new ArrayList<>());
        ok(up.hasTarget && up.target.sky, "high up, next island points at the sky island");
        // the needle
        float a0 = LogPoseBrain.angle(0, 0, 0, 0, 100);       // facing +Z, target straight ahead
        float a1 = LogPoseBrain.angle(0, 0, 90, 0, 100);      // facing -X, target on the left
        ok(a0 < 0.02 || a0 > 0.98, "target ahead: needle straight up (" + a0 + ")");
        ok(Math.abs(a1 - 0.25) < 0.02 || Math.abs(a1 - 0.75) < 0.02, "target to the side: needle a quarter turn (" + a1 + ")");
        ok(LogPoseBrain.arrow(0, 0, 0, 0, 100).equals("↑") && LogPoseBrain.arrow(0, 0, 0, 100, 0).equals("←"), "action-bar arrows");

        System.out.println("\n" + pass + " passed, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }
}
