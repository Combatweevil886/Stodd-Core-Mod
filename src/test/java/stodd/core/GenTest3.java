package stodd.core;

import stodd.core.config.Json;
import stodd.core.config.StoddConfig;
import stodd.core.config.Toml;
import stodd.core.gen.CityPlanner;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslandIndex;
import stodd.core.gen.LogPoseBrain;
import stodd.core.gen.WorldRules;
import stodd.core.gen.MiniJson;
import stodd.core.gen.SkyField;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests of STODD Core 3.1: the TOML reader / writer, the config files (written, read back, edited, migrated, handed to the scripts)
 * and the lifted sky islands (SkyField). usage: java -cp <classes + resources> stodd.core.GenTest3
 */
public final class GenTest3 {
    static int pass, fail;

    static void ok(boolean c, String m) { if (c) pass++; else { fail++; System.out.println("  FAIL: " + m); } }

    static void section(String s) { System.out.println("\n== " + s); }

    static boolean same(Object a, Object b) {
        if (a instanceof Number && b instanceof Number) return Math.abs(((Number) a).doubleValue() - ((Number) b).doubleValue()) < 1e-12;
        if (a instanceof List && b instanceof List) {
            List<?> x = (List<?>) a, y = (List<?>) b;
            if (x.size() != y.size()) return false;
            for (int i = 0; i < x.size(); i++) if (!same(x.get(i), y.get(i))) return false;
            return true;
        }
        if (a instanceof Map && b instanceof Map) {
            Map<?, ?> x = (Map<?, ?>) a, y = (Map<?, ?>) b;
            if (!x.keySet().equals(y.keySet())) return false;
            for (Object k : x.keySet()) if (!same(x.get(k), y.get(k))) return false;
            return true;
        }
        if (a == null) return b == null || "".equals(b);
        return a.equals(b);
    }

    public static void main(String[] args) throws Exception {
        toml();
        config();
        sky();
        deep();
        deepFinding();
        System.out.println("\nGenTest3: " + pass + " passed, " + fail + " failed");
        if (fail > 0) System.exit(1);
    }

    // ---------------------------------------------------------------- TOML

    static void toml() throws Exception {
        section("TOML: reading");
        String doc = String.join("\n",
            "# a comment",
            "maxLevel = 20   # trailing",
            "xpGrowth = 1.3",
            "big = 1_000",
            "hex = 0x1F",
            "neg = -0.5",
            "exp = 1e3",
            "on = true",
            "name = \"Sky \\\"Isle\\\"\\tx\\u00e9\"",
            "re = '/^(jujutsucraft|jjk_addon)$/i'",
            "re2 = '(^|[_\\/])rct'",
            "list = [1, 2,",
            "  3, # three",
            "]",
            "nested = [[\"a\", 1], [\"b\", 2]]",
            "tbl = { min = -0.5, max = 0.9 }",
            "",
            "[logPose]",
            "dwellTicks = 600",
            "modes.next.name = \"Next island\"",
            "",
            "[islandThemes.city]",
            "chance = 0.125",
            "multi = \"\"\"",
            "two",
            "lines\"\"\"",
            "lit = '''raw \\ text'''");
        Map<String, Object> m = Toml.parse(doc);
        ok(Long.valueOf(20).equals(m.get("maxLevel")), "integer");
        ok(Double.valueOf(1.3).equals(m.get("xpGrowth")), "float");
        ok(Long.valueOf(1000).equals(m.get("big")), "underscores");
        ok(Long.valueOf(31).equals(m.get("hex")), "hex");
        ok(Double.valueOf(-0.5).equals(m.get("neg")), "negative float");
        ok(Double.valueOf(1000).equals(m.get("exp")), "exponent");
        ok(Boolean.TRUE.equals(m.get("on")), "boolean");
        ok("Sky \"Isle\"\tx\u00e9".equals(m.get("name")), "basic string escapes: " + m.get("name"));
        ok("/^(jujutsucraft|jjk_addon)$/i".equals(m.get("re")), "literal string keeps the regex");
        ok("(^|[_\\/])rct".equals(m.get("re2")), "literal string keeps backslashes");
        ok(Arrays.asList(1L, 2L, 3L).equals(m.get("list")), "multi-line list with a comment");
        ok(same(Arrays.asList(Arrays.asList("a", 1L), Arrays.asList("b", 2L)), m.get("nested")), "nested lists");
        ok(m.get("tbl") instanceof Map && same(((Map<?, ?>) m.get("tbl")).get("max"), 0.9), "inline table");
        ok(Long.valueOf(600).equals(m.get("logPose.dwellTicks")), "table key");
        ok("Next island".equals(m.get("logPose.modes.next.name")), "dotted key in a table");
        ok(Double.valueOf(0.125).equals(m.get("islandThemes.city.chance")), "dotted table name");
        ok("two\nlines".equals(m.get("islandThemes.city.multi")), "multi-line basic string");
        ok("raw \\ text".equals(m.get("islandThemes.city.lit")), "multi-line literal string");

        section("TOML: mistakes are reported with their line");
        String[][] bad = {
            { "a = 1\nb = \n", "2" }, { "a = 1\nname = sky\n", "2" }, { "x = \"open\n", "1" }, { "[t]\na = 1\n[t]\n", "3" },
            { "a = [1, 2\n", "2" }, { "a = 1\na = 2\n", "2" }, { "a = \"\\q\"\n", "1" }, { "a = 1 b\n", "1" } };
        for (String[] b : bad) {
            try { Toml.parse(b[0]); ok(false, "should fail: " + b[0].replace("\n", "\\n")); }
            catch (Toml.TomlException e) { ok(String.valueOf(e.line).equals(b[1]), "line of the mistake in " + b[0].replace("\n", "\\n") + ": " + e.getMessage()); }
        }

        section("TOML: what is written reads back the same");
        List<Object> values = new ArrayList<>(Arrays.asList(0L, -7L, 1.5, 1e-9, 3.0e20, 0.125, true, false, "", "plain", "with \"quotes\"", "back\\slash",
            "both \\ and '", "line\nbreak", "/^malum$/i", "(^|[_\\/])(ken)([_\\/]|$)", Arrays.asList(), Arrays.asList("a", "b"),
            Arrays.asList(Arrays.asList("minecraft:oak", 3L)), new LinkedHashMap<String, Object>()));
        Map<String, Object> inl = new LinkedHashMap<>();
        inl.put("stage", 2L); inl.put("match", "/simple_?domain/");
        values.add(inl);
        values.add(Arrays.asList(inl, inl));
        for (Object v : values) {
            String text = Toml.format(v);
            Object back = Toml.parseValue(text);
            ok(same(v, back), "round trip of " + text);
            Object back2 = Toml.parse("k = " + Toml.formatBlock(v, 10)).get("k");
            ok(same(v, back2), "round trip over several lines of " + text);
        }
        ok(Toml.format(600.0).equals("600"), "whole numbers are written without .0");
        ok(Toml.key("one_piece").equals("one_piece") && Toml.key("a b").equals("\"a b\""), "keys quoted only when needed");
        ok(Json.write(MiniJson.parse("{\"a\":[1,2.5,\"x\\\"y\"],\"b\":null,\"c\":true}")).equals("{\"a\":[1,2.5,\"x\\\"y\"],\"b\":null,\"c\":true}"), "JSON writer");
    }

    // ---------------------------------------------------------------- the config files

    static Path tempGame() throws Exception { return Files.createTempDirectory("stodd-config-test"); }

    static void config() throws Exception {
        section("config: the files are written with every setting, and read back as the defaults");
        Path game = tempGame();
        StoddConfig c = StoddConfig.load(game);
        ok(c.notes().isEmpty(), "no problems on a fresh start: " + c.notes());
        for (String f : c.files()) ok(Files.exists(game.resolve("config/stodd/" + f + ".toml")), f + ".toml written");
        ok(c.files().equals(Arrays.asList("world", "origins", "progression", "general")), "four files: " + c.files());
        ok(c.settings().size() > 300, "every setting is in a file: " + c.settings().size());
        int bad = 0;
        for (String f : c.files()) {
            Map<String, Object> flat = Toml.parse(new String(Files.readAllBytes(game.resolve("config/stodd/" + f + ".toml")), StandardCharsets.UTF_8));
            for (StoddConfig.Setting st : c.settings().values()) {
                if (!st.file.equals(f)) continue;
                if (!flat.containsKey(st.path)) { bad++; System.out.println("    missing " + st.path); continue; }
                if (!same(st.def, flat.get(st.path))) { bad++; System.out.println("    differs " + st.path + ": " + Toml.format(st.def) + " vs " + Toml.format(flat.get(st.path))); }
            }
        }
        ok(bad == 0, "every default reads back from the files as it was written (" + bad + " differ)");
        StoddConfig c2 = StoddConfig.load(game);
        ok(c2.notes().isEmpty(), "reading the written files again: no problems " + c2.notes());
        long t0 = Files.getLastModifiedTime(game.resolve("config/stodd/world.toml")).toMillis();
        ok(!StoddConfig.get().isSet("skyIslands.rarity") || StoddConfig.get().str("skyIslands.rarity", "").equals("normal"), "the default rarity");
        ok(Math.abs(c2.skyChance() - 0.18) < 1e-9, "normal rarity lifts 18% of the islands: " + c2.skyChance());

        section("config: edits are read, kept and checked");
        Path world = game.resolve("config/stodd/world.toml");
        String text = new String(Files.readAllBytes(world), StandardCharsets.UTF_8);
        text = text.replace("rarity = \"normal\"", "rarity = \"rare\"");             // first is skyIslands.rarity
        text = text.replace("height = 190", "height = 200");
        text = text.replace("[islandThemes.city]\n", "[islandThemes.city]\nbogus = 1\n");
        text = text.replace("dwellTicks = 600", "dwellTicks = \"soon\"");
        // a setting deleted: the default comes back, and the file is completed again
        text = text.replace("heightVariation = 12", "");
        Files.write(world, text.getBytes(StandardCharsets.UTF_8));
        StoddConfig c3 = StoddConfig.load(game);
        ok("rare".equals(c3.str("skyIslands.rarity", "")), "edited text value");
        ok(Math.abs(c3.skyChance() - 0.1) < 1e-9, "rare = 10%");
        ok(c3.integer("skyIslands.height", 0) == 200, "edited number");
        ok(c3.integer("logPose.dwellTicks", 0) == 600, "a wrong type falls back to the default");
        boolean warnedType = false, warnedUnknown = false;
        for (String n : c3.notes()) { if (n.contains("dwellTicks")) warnedType = true; if (n.contains("islandThemes.city.bogus")) warnedUnknown = true; }
        ok(warnedType && warnedUnknown, "both problems are reported: " + c3.notes());
        String after = new String(Files.readAllBytes(world), StandardCharsets.UTF_8);
        ok(after.contains("heightVariation = 12"), "a deleted setting is written back with its default");
        ok(after.contains("height = 200") && after.contains("rarity = \"rare\""), "the owner's values survive the rewrite");
        ok(after.contains("# islandThemes.city.bogus = 1"), "an unknown setting is kept as a comment");
        ok(c3.integer("skyIslands.heightVariation", 0) == 12, "deleted setting = default");

        section("config: a file with a mistake is left alone");
        Path prog = game.resolve("config/stodd/progression.toml");
        String ptext = new String(Files.readAllBytes(prog), StandardCharsets.UTF_8).replace("maxLevel = 20", "maxLevel = 25\nbroken = [1, 2");
        Files.write(prog, ptext.getBytes(StandardCharsets.UTF_8));
        StoddConfig c4 = StoddConfig.load(game);
        ok(c4.integer("maxLevel", 0) == 20, "its settings keep their defaults");
        ok(new String(Files.readAllBytes(prog), StandardCharsets.UTF_8).equals(ptext), "the broken file is not overwritten");
        boolean told = false;
        for (String n : c4.notes()) if (n.startsWith("progression.toml could not be read") && n.contains("line")) told = true;
        ok(told, "the mistake is reported with its line: " + c4.notes());
        try { StoddConfig.set("maxLevel", "30"); ok(false, "set refuses a broken file"); } catch (IllegalArgumentException e) { ok(true, ""); }
        Files.write(prog, ptext.replace("broken = [1, 2", "").getBytes(StandardCharsets.UTF_8));

        section("config: /stodd config set");
        StoddConfig.load(game);
        ok(StoddConfig.set("skyIslands.rarity", "very_common").contains("very_common"), "plain words are text");
        ok(Math.abs(StoddConfig.get().skyChance() - 0.45) < 1e-9, "very_common = 45%");
        StoddConfig.set("skyIslands.chance", "0.5");
        ok(Math.abs(StoddConfig.get().skyChance() - 0.5) < 1e-9, "an exact chance wins over the rarity");
        StoddConfig.set("city.rarity", "1.5");
        ok(Double.valueOf(1.5).equals(StoddConfig.get().value("city.rarity")), "a number where the default is text");
        StoddConfig.set("logPose.searchRadii", "[500, 1000]");
        ok(same(Arrays.asList(500L, 1000L), StoddConfig.get().value("logPose.searchRadii")), "a list");
        try { StoddConfig.set("maxLevel", "lots"); ok(false, "a word for a number is refused"); } catch (IllegalArgumentException e) { ok(true, ""); }
        try { StoddConfig.set("noSuchSetting", "1"); ok(false, "an unknown setting is refused"); } catch (IllegalArgumentException e) { ok(true, ""); }
        StoddConfig.set("jjk.purgeNamespaces", "^(jujutsucraft)$");
        ok("/^(jujutsucraft)$/".equals(StoddConfig.get().value("jjk.purgeNamespaces")), "a regular expression without slashes gets them");
        StoddConfig.reset("skyIslands.chance");
        ok(Math.abs(StoddConfig.get().skyChance() - 0.45) < 1e-9, "reset puts the default back");
        List<String> probs = StoddConfig.setAll(new LinkedHashMap<String, String>() {{ put("maxLevel", "22"); put("xpBase", "nope"); }});
        ok(probs.size() == 1 && StoddConfig.get().integer("maxLevel", 0) == 22, "the screen's Save: good values go in, bad ones are reported " + probs);

        section("config: the scripts get every value, shaped like their settings");
        Map<String, Object> js = MiniJson.obj(MiniJson.parse(StoddConfig.get().scriptJson()));
        ok(MiniJson.num(MiniJson.obj(MiniJson.obj(js.get("islandThemes")).get("city")).get("chance"), -1) == 0.125, "islandThemes.city.chance");
        ok("very_common".equals(MiniJson.obj(js.get("skyIslands")).get("rarity")), "skyIslands.rarity");
        ok(MiniJson.num(js.get("maxLevel"), 0) == 22, "maxLevel");
        ok(MiniJson.obj(MiniJson.obj(js.get("detect")).get("fruit")).get("items") instanceof String, "regular expressions as text");
        ok(!js.containsKey("sky") && !MiniJson.obj(js.get("city")).containsKey("styles"), "derived / content settings are not in the files");

        section("config: 3.0's stodd_islands.properties moves into world.toml");
        Path g2 = tempGame();
        Files.createDirectories(g2.resolve("config"));
        Files.write(g2.resolve("config/stodd_islands.properties"), "preset = wide\nislandSize = 160   # bigger\ncoastA.max = 1.1\n".getBytes(StandardCharsets.UTF_8));
        StoddConfig m = StoddConfig.load(g2);
        ok("wide".equals(m.str("spawnIslands.preset", "")) && m.num("spawnIslands.islandSize", 0) == 160, "preset and size moved");
        ok(same(0.9 + 0.2, ((Map<?, ?>) m.value("spawnIslands.coastA")).get("max")), "coastA.max moved");
        ok(!Files.exists(g2.resolve("config/stodd_islands.properties")), "the old file is renamed");
        IslandConfig.Values v = IslandConfig.parse(IslandConfig.propertiesOf(m));
        ok(v.sep == 900 && v.size == 160.0 && Math.abs(v.aMax - 1.1) < 1e-9, "Survival Island gets them: size " + v.size + ", separation " + v.sep);
        Path g3 = tempGame();
        IslandConfig.Values d = IslandConfig.parse(IslandConfig.propertiesOf(StoddConfig.load(g3)));
        ok(d.sep == 680 && d.size == 140.0 && d.notes.isEmpty(), "defaults: the default preset");
        StoddConfig.load(game);
    }

    // ---------------------------------------------------------------- sky islands

    static void sky() {
        section("sky islands: some islands are lifted, the rest stay");
        // a grid of cone islands (like the island noise: one per 700 blocks), one at the spawn
        final List<int[]> isl = new ArrayList<>();
        for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) isl.add(new int[] { i * 700 + ((i * 37 + j * 11) % 90), j * 700 + ((i * 13 - j * 29) % 90), 150 + Math.abs((i * 7 + j * 3) % 60) });
        SkyField.Raw raw = (x, z) -> {
            double v = -1;
            for (int[] g : isl) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - g[0], z - g[1]) / g[2]);
            return v;
        };
        SkyField.Params p = new SkyField.Params();
        p.chance = 0.4;
        p.minSpawnDistance = 300;
        p.deepChance = 0;
        SkyField f = new SkyField(12345L, p, raw, (x, z) -> Math.sin(x * 0.05) * Math.cos(z * 0.05));
        int lifted = 0, kept = 0;
        boolean spawnKept = true, consistent = true, groundOk = true, skyOk = true, bottomOk = true;
        for (int[] g : isl) {
            IslandFinder.Island a = f.rawIslands().islandAt(g[0], g[1]);
            boolean up = f.isLifted(a);
            if (up) lifted++; else kept++;
            if (Math.hypot(g[0], g[1]) < 300 && up) spawnKept = false;
            // every point of the island agrees
            for (int k = 0; k < 8; k++) {
                double ang = k * Math.PI / 4, r = g[2] * 0.6;
                int x = (int) (g[0] + r * Math.cos(ang)), z = (int) (g[1] + r * Math.sin(ang));
                boolean sky = f.mask(x, z) > 0;
                if (sky != up) consistent = false;
                double gr = f.ground(x, z, raw.at(x, z));
                if (up && gr >= p.landThreshold) groundOk = false;
                if (!up && gr != raw.at(x, z)) groundOk = false;
                if (up && (f.continents(x, z) != raw.at(x, z) || f.lift(x, z) <= 0)) skyOk = false;
                if (up && !(f.bottom(x, z) < f.levelOf(a) - 3)) bottomOk = false;
            }
        }
        ok(lifted > 0 && kept > 0, "some lifted (" + lifted + "), some kept (" + kept + ")");
        ok(Math.abs(lifted / (double) isl.size() - 0.4) < 0.25, "about the chance: " + lifted + " of " + isl.size());
        ok(spawnKept, "the island at the spawn stays on the ground");
        ok(consistent, "every point of an island agrees whether it is lifted");
        ok(groundOk, "the ground loses exactly the lifted islands (just under the coast: a shallow sea)");
        ok(skyOk, "the sky gets the island's own continentalness, raised");
        ok(bottomOk, "the underside hangs below the coast");
        // the sea between islands has no sky island
        ok(f.mask(350, 350) < 0 && f.bottom(350, 350) >= 999, "no sky island over the open sea");

        section("sky islands: heights, climate, determinism");
        IslandFinder.Island one = null;
        for (int[] g : isl) { IslandFinder.Island a = f.rawIslands().islandAt(g[0], g[1]); if (f.isLifted(a)) { one = a; break; } }
        int cx = one.cx, cz = one.cz;
        double lv = f.levelOf(one);
        ok(lv >= p.height - p.heightVariation && lv <= p.height + p.heightVariation, "coast height within the variation: " + lv);
        double bot = f.bottom(cx, cz);
        ok(f.skyClimate(cx, (int) bot + 2, cz) && f.skyClimate(cx, 300, cz) && !f.skyClimate(cx, 64, cz), "the island's climate from just under its underside up, not at sea level");
        ok(bot >= p.lowestBottom(), "the underside never below lowestBottom: " + bot + " >= " + p.lowestBottom());

        section("sky islands: no ocean or beach biome up there (nothing for shipwrecks and buried treasure to look for)");
        // walk out from the middle of a lifted island to the open sea
        double coastC = 99, fringeC = 99;
        boolean fringeSky = false, fringeLow = true, seaFar = true;
        for (int d = 0; d < 400; d += 2) {
            int x = cx + d, z = cz;
            double r = raw.at(x, z);
            if (f.mask(x, z) > 0 && r < p.landThreshold + 0.03) coastC = Math.min(coastC, f.climateContinents(x, z));
            if (f.mask(x, z) < 0 && r >= p.landThreshold - 0.07 && r < p.landThreshold) {
                fringeC = Math.min(fringeC, f.climateContinents(x, z));
                if (f.skyClimate(x, 250, z)) fringeSky = true;
                if (f.skyClimate(x, 64, z)) fringeLow = false;
            }
            if (r < p.landThreshold - 0.2 && f.skyClimate(x, 250, z)) seaFar = false;
        }
        ok(coastC >= -0.10 - 1e-12, "the rim of a sky island is an inland biome, not a beach: " + coastC);
        ok(fringeSky && fringeC >= -0.10 - 1e-12, "the air just off its coast is land climate too: " + fringeC);
        ok(fringeLow, "...but not down at the sea, where the sea stays sea");
        ok(seaFar, "open sea far from any sky island keeps its ocean climate up high");
        SkyField.Params pb = new SkyField.Params();
        pb.chance = 0.4; pb.minSpawnDistance = 300; pb.beaches = true; pb.deepChance = 0;
        SkyField fb = new SkyField(12345L, pb, raw, (x, z) -> Math.sin(x * 0.05) * Math.cos(z * 0.05));
        double beachC = 99;
        for (int d = 0; d < 400; d += 2) if (fb.mask(cx + d, cz) > 0 && raw.at(cx + d, cz) < pb.landThreshold + 0.03) beachC = Math.min(beachC, fb.climateContinents(cx + d, cz));
        ok(beachC < -0.11 && beachC >= pb.landThreshold, "skyIslands.beaches = true: a beach round the rim, still never ocean: " + beachC);
        SkyField f2 = new SkyField(12345L, p, raw, (x, z) -> Math.sin(x * 0.05) * Math.cos(z * 0.05));
        boolean det = true;
        for (int k = 0; k < 300; k++) {
            int x = -3000 + k * 20 + 7, z = 2900 - k * 19;
            if (f.mask(x, z) != f2.mask(x, z) || f.bottom(x, z) != f2.bottom(x, z)) det = false;
        }
        ok(det, "the same seed gives the same sky, column by column");
        SkyField other = new SkyField(99L, p, raw, (x, z) -> 0);   // (p: sky islands only)
        int diff = 0;
        for (int[] g : isl) { IslandFinder.Island a = other.rawIslands().islandAt(g[0], g[1]); if (other.isLifted(a) != f.isLifted(f.rawIslands().islandAt(g[0], g[1]))) diff++; }
        ok(diff > 0, "another seed lifts other islands (" + diff + " differ)");
        SkyField.Params off = new SkyField.Params();
        off.chance = 0;
        off.deepChance = 0;
        SkyField none = new SkyField(12345L, off, raw, null);
        boolean allGround = true;
        for (int[] g : isl) if (none.mask(g[0], g[1]) > 0 || none.ground(g[0], g[1], raw.at(g[0], g[1])) != raw.at(g[0], g[1])) allGround = false;
        ok(allGround, "rarity none: every island stays on the ground, untouched");

        section("sky islands: weirdness moved off the river band");
        boolean push = true;
        for (double w = -1; w <= 1; w += 0.001) {
            double q = SkyField.pushRidges(w);
            if (Math.abs(q) < 0.07 - 1e-9) push = false;
            if (Math.abs(w) >= 0.25 && q != w) push = false;
            if (Math.signum(q) != (w < 0 ? -1 : 1)) push = false;
        }
        ok(push, "no weirdness in the river band, unchanged outside it, sign kept");
        ok(Math.abs(SkyField.pushRidges(0.2499999) - 0.25) < 1e-5, "continuous where it joins");
    }

    // ---------------------------------------------------------------- sunken islands under bubble domes

    static void deep() {
        section("sunken islands: some islands sink, inside a dome that stays under the sea");
        final List<int[]> isl = new ArrayList<>();
        for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) isl.add(new int[] { i * 700 + ((i * 37 + j * 11) % 90), j * 700 + ((i * 13 - j * 29) % 90), 150 + Math.abs((i * 7 + j * 3) % 60) });
        SkyField.Raw raw = (x, z) -> {
            double v = -1;
            for (int[] g : isl) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - g[0], z - g[1]) / g[2]);
            return v;
        };
        SkyField.Params p = new SkyField.Params();
        p.chance = 0.25;
        p.deepChance = 0.4;
        p.minSpawnDistance = 300;
        SkyField f = new SkyField(777L, p, raw, (x, z) -> 0);
        int sunk = 0, lifted = 0, both = 0;
        boolean spawn = true, covers = true, groundGone = true, domeUnder = true, othersFree = true, apron = true, climate = true;
        for (int[] g : isl) {
            IslandFinder.Island a = f.rawIslands().islandAt(g[0], g[1]);
            boolean dn = f.isSunk(a), up = f.isLifted(a);
            if (dn) sunk++;
            if (up) lifted++;
            if (dn && up) both++;
            if (!dn) continue;
            if (Math.hypot(g[0], g[1]) < 300) spawn = false;
            SkyField.Dome d = f.domeOf(a);
            if (!(d.base + d.up < p.seaLevel - 3)) domeUnder = false;
            // every point of the island's land is under the dome, and the ground lost it
            for (int k = 0; k < 16; k++) {
                double ang = k * Math.PI / 8;
                for (double rr = 0; rr < g[2] * 1.4; rr += 12) {
                    int x = (int) (g[0] + rr * Math.cos(ang)), z = (int) (g[1] + rr * Math.sin(ang));
                    double r = raw.at(x, z);
                    if (r < p.landThreshold) continue;
                    if (f.domeAt(x, z) != d) covers = false;
                    if (f.ground(x, z, r) >= p.landThreshold) groundGone = false;
                    if (f.deepContinents(x, z) != r || !(f.deepLift(x, z) < 0)) apron = false;
                    if (!(f.deepCeiling(x, z) <= d.base + d.up - 3 + 1e-9)) apron = false;
                    if (!f.domeClimate(x, (int) d.base + 2, z) || f.domeClimate(x, p.seaLevel, z)) climate = false;
                }
            }
            // the sea just inside the wall is still under the dome; just outside it is not
            int ex = (int) Math.round(d.cx + (d.r - 3)), ox = (int) Math.round(d.cx + d.r + 3);
            if (f.domeAt(ex, (int) d.cz) != d || f.domeAt(ox, (int) d.cz) != null) covers = false;
            // no other island under it
            for (int[] h : isl) if (h != g && d.covers(h[0], h[1])) othersFree = false;
        }
        ok(sunk > 0 && sunk < isl.size(), "some islands sink (" + sunk + " of " + isl.size() + ")");
        ok(both == 0 && lifted > 0, "never one island both lifted and sunk (" + lifted + " lifted)");
        ok(spawn, "the island at the spawn stays where it is");
        ok(covers, "the dome covers all of the island and the sea round it, and ends at its wall");
        ok(groundGone, "the sea floor no longer has the island");
        ok(domeUnder, "the top of every dome is under the sea");
        ok(othersFree, "no other island under a dome");
        ok(apron, "under the dome: the island's own terrain, lowered, its hills kept under the roof");
        ok(climate, "the island's climate inside the dome, the sea's above it");

        section("sunken islands: the dome's wall is closed for water");
        IslandFinder.Island one = null;
        for (int[] g : isl) { IslandFinder.Island a = f.rawIslands().islandAt(g[0], g[1]); if (f.isSunk(a)) { one = a; break; } }
        SkyField.Dome d = f.domeOf(one);
        // water moves along the six faces: from any outside block, a step into the dome lands on the wall
        int bad = 0, cells = 0;
        int y0 = (int) Math.floor(d.base - d.down) - 2, y1 = (int) Math.ceil(d.base + d.up) + 2;
        for (int x = (int) (d.cx - d.r - 2); x <= d.cx + d.r + 2; x += 3) for (int z = (int) d.cz - 6; z <= d.cz + 6; z++) for (int y = y0; y <= y1; y++) {
            if (d.f(x, y, z) <= 1) continue;
            int[][] nb = { { 1, 0, 0 }, { -1, 0, 0 }, { 0, 1, 0 }, { 0, -1, 0 }, { 0, 0, 1 }, { 0, 0, -1 } };
            for (int[] n : nb) {
                int qx = x + n[0], qy = y + n[1], qz = z + n[2];
                if (d.f(qx, qy, qz) > 1) continue;
                cells++;
                boolean wall = false;
                for (int[] n2 : nb) if (d.f(qx + n2[0], qy + n2[1], qz + n2[2]) > 1) wall = true;
                if (!wall) bad++;
            }
        }
        ok(cells > 100 && bad == 0, "every block of the dome water can reach from outside is part of the wall (" + cells + " checked)");
        ok(d.f(d.cx, d.base + d.up - 0.5, d.cz) < 1 && d.f(d.cx, d.base + d.up + 1, d.cz) > 1 && d.f(d.cx, d.base - d.down + 0.5, d.cz) < 1, "the roof and the bottom where they should be");
        ok(f.domesTouching((int) (d.cx + d.r - 10), (int) d.cz, (int) (d.cx + d.r + 30), (int) d.cz + 40).size() == 1
            && f.domesTouching((int) (d.cx + d.r + 20), (int) d.cz, (int) (d.cx + d.r + 60), (int) d.cz + 40).isEmpty(), "the cells a dome reaches into are found, the next ones are not");

        section("sunken islands: settings and determinism");
        SkyField f2 = new SkyField(777L, p, raw, (x, z) -> 0);
        boolean det = true;
        for (int[] g : isl) if (f.isSunk(f.rawIslands().islandAt(g[0], g[1])) != f2.isSunk(f2.rawIslands().islandAt(g[0], g[1]))) det = false;
        ok(det, "the same seed sinks the same islands");
        SkyField.Params off = new SkyField.Params();
        off.chance = 0; off.deepChance = 0;
        SkyField none = new SkyField(777L, off, raw, null);
        boolean untouched = true;
        for (int[] g : isl) if (none.domeAt(g[0], g[1]) != null || none.ground(g[0], g[1], raw.at(g[0], g[1])) != raw.at(g[0], g[1]) || none.deepMask(g[0], g[1]) > 0) untouched = false;
        ok(untouched, "rarity none: no domes, the world untouched");
        ok(p.domeTop() == p.seaLevel - p.deepWaterAbove, "the top of the dome is waterAbove under the sea");
    }

    // ---------------------------------------------------------------- finding sunken islands, and their villages

    static void deepFinding() {
        section("sunken islands: the Log Pose and /stodd locate find them");
        final List<int[]> isl = new ArrayList<>();
        for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) isl.add(new int[] { i * 700 + ((i * 37 + j * 11) % 90), j * 700 + ((i * 13 - j * 29) % 90), 150 + Math.abs((i * 7 + j * 3) % 60) });
        SkyField.Raw raw = (x, z) -> {
            double v = -1;
            for (int[] g : isl) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - g[0], z - g[1]) / g[2]);
            return v;
        };
        SkyField.Params p = new SkyField.Params();
        p.chance = 0.2; p.deepChance = 0.35; p.minSpawnDistance = 300;
        SkyField f = new SkyField(4242L, p, raw, (x, z) -> 0);
        WorldRules rules = WorldRules.builtIn();
        IslandFinder ground = new IslandFinder(f.groundOnly(raw::at), p.landThreshold, rules.peakStep, rules.cell);
        IslandFinder sky = new IslandFinder(f.skyOnly(), p.landThreshold, rules.peakStep, rules.cell);
        IslandFinder deep = new IslandFinder(f.deepOnly(), p.landThreshold, rules.peakStep, rules.cell);
        IslandIndex idx = new IslandIndex(ground, sky, deep, 0, p.lowestSurface() - 24);
        IslandIndex.Result res = idx.near(0, 0, 3200, 10000, IslandIndex.DEEP);
        int want = 0;
        for (int[] g : isl) if (Math.hypot(g[0], g[1]) <= 3200 - 30 && f.isSunk(f.rawIslands().islandAt(g[0], g[1]))) want++;
        ok(res.complete && res.list.size() >= want && want > 0, "the index lists the sunken islands (" + res.list.size() + ", " + want + " expected)");
        boolean allDeep = true, sameCentre = true;
        for (IslandIndex.Hit h : res.list) {
            if (!h.deep || h.sky) allDeep = false;
            IslandFinder.Island r = f.rawIslands().islandAt(h.island.cx, h.island.cz);
            if (r == null || !r.key().equals(h.island.key()) || !f.isSunk(r)) sameCentre = false;
        }
        ok(allDeep && sameCentre, "...only sunken ones, with the same centres the domes are built round");
        ok(idx.near(0, 0, 3200, 10000, IslandIndex.GROUND).list.stream().noneMatch(h -> f.isSunk(f.rawIslands().islandAt(h.island.cx, h.island.cz))), "and they are not ground islands any more");

        LogPoseBrain brain = new LogPoseBrain(rules, idx, 7, 10000);
        int deepMode = -1;
        for (int i = 0; i < rules.lpModes.size(); i++) if (rules.lpModes.get(i).kind.equals("deep")) deepMode = i;
        ok(deepMode >= 0, "the Log Pose has a sunken-island mode");
        LogPoseBrain.Out o = brain.tick(new LogPoseBrain.State(), 350, 63, 350, 100, deepMode, new ArrayList<>());
        IslandIndex.Hit first = res.list.isEmpty() ? null : idx.near(350, 350, 3200, 10000, IslandIndex.DEEP).list.get(0);
        ok(o.hasTarget && o.target.deep && first != null && o.target.x == first.island.cx && o.target.z == first.island.cz, "in that mode it points at the nearest sunken island");
        // a diver deep in the open sea, in "next island" mode: the next sunken island
        LogPoseBrain.Out o2 = brain.tick(new LogPoseBrain.State(), 350, 40, 350, 100, 0, new ArrayList<>());
        ok(o2.hasTarget && o2.target.deep, "next island, deep under the sea: a sunken island");
        LogPoseBrain.Out o3 = brain.tick(new LogPoseBrain.State(), 350, 64, 350, 100, 0, new ArrayList<>());
        ok(o3.hasTarget && !o3.target.deep && !o3.target.sky, "next island, at the surface: a ground island");
        IslandFinder.Island one = first.island;
        LogPoseBrain.Info here = brain.here(one.cx, 20, one.cz);
        ok(here != null && here.deep && here.name.equals(rules.deepName(one.cx, one.cz, 7)), "inside the dome you are on the sunken island: " + (here == null ? null : here.name));
        ok(brain.here(one.cx, 70, one.cz) == null, "...and over it, at the surface, on the open sea");

        section("sunken villages: under the roof, never through it");
        SkyField.Dome d = f.domeOf(f.rawIslands().islandAt(one.cx, one.cz));
        CityPlanner cp = new CityPlanner(rules);
        int lo = (int) d.base + 1, hi = (int) (d.base + d.up * 0.45);
        CityPlanner.Plan plan = cp.planDeep(deep, one, (x, z) -> (int) d.base + 4, 7, rules.deepVillageStyle, rules.deepVillageRadius, lo, hi,
            (cx0, cz0, cell2, street) -> {
                double low = Double.MAX_VALUE;
                int[][] pts = { { cx0, cz0 }, { cx0 + cell2 - 1, cz0 }, { cx0, cz0 + cell2 - 1 }, { cx0 + cell2 - 1, cz0 + cell2 - 1 } };
                for (int[] pt : pts) low = Math.min(low, d.ceiling(pt[0], pt[1]));
                return (int) Math.floor(low) - street - 3;
            });
        ok(plan != null && !plan.cells.isEmpty(), "a sunken island gets a village (" + (plan == null ? 0 : plan.cells.size()) + " blocks, style " + rules.deepVillageStyle + ")");
        boolean fitsRoof = true, inside = true;
        for (CityPlanner.Cell c : plan.cells) {
            double low = Math.min(Math.min(d.ceiling(c.x, c.z), d.ceiling(c.x + 47, c.z)), Math.min(d.ceiling(c.x, c.z + 47), d.ceiling(c.x + 47, c.z + 47)));
            if (plan.street + c.height > low - 3) fitsRoof = false;
            if (!d.covers(c.x, c.z) || !d.covers(c.x + 47, c.z + 47)) inside = false;
        }
        ok(fitsRoof, "every building fits under the roof with room to spare");
        ok(inside, "every block is inside the dome");
        ok(plan.street >= lo && plan.street <= hi, "the street is on the island's floor: y " + plan.street);
        CityPlanner.Plan again = cp.planDeep(deep, one, (x, z) -> (int) d.base + 4, 7, rules.deepVillageStyle, rules.deepVillageRadius, lo, hi, (a, b, c, e) -> 99);
        ok(again == plan, "planned once per island");
        ok(rules.villagers > 0 && rules.waystonesWorldgen && rules.waystoneStyles.containsKey("deep"), "villagers in the cities, waystones generated with the world, a style for sunken ones");
    }
}
