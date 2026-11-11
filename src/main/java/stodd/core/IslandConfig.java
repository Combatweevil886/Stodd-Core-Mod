package stodd.core;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * [spawnIslands] in config/stodd/world.toml  ->  config/survivalisland.json
 *
 * Survival Island reads its own json once, when it initialises. This turns the spawn-island settings of the STODD config into that
 * json on every start (the Installer runs before Survival Island: see the mod ordering in mods.toml), checks the numbers so a typo cannot
 * produce a broken world, and returns a one-line report for the log. (3.0 kept them in config/stodd_islands.properties; the
 * config moves them over the first time.)
 *
 * Only the JDK is used. A bad value never throws: it is reported and the preset's value is used instead.
 */
final class IslandConfig {
    static final String PROPS = "config/stodd_islands.properties";
    static final String JSON = "config/survivalisland.json";
    static final String MARK = "_stodd";

    /** name, islandSize, islandSeparation.  The numbers next to them in the properties file come from tools/islandsim.py. */
    static final Object[][] PRESETS = {
        {"packed", 110.0, 520},
        {"snug", 140.0, 560},
        {"default", 140.0, 680},
        {"wide", 140.0, 900},
        {"remote", 140.0, 1200},
        {"lonely", 140.0, 1700},
        {"large", 200.0, 800},
        {"grand", 300.0, 1300},
    };
    static final String DEFAULT_PRESET = "default";

    /** Survival Island's own limits are none; these keep the sums in IslandContinentalNoise sane (it divides by the nearest-island distance). */
    static final double MIN_SIZE = 40, MAX_SIZE = 800;
    static final int MIN_SEP = 160, MAX_SEP = 6000;
    static final double MIN_RATIO = 2.5;

    private IslandConfig() { }

    static final class Values {
        String preset = DEFAULT_PRESET;
        double size = 140.0;
        int sep = 680;
        double under = 9.0;
        double aMin = -0.5, aMax = 0.9, bMin = -1.0, bMax = 1.4;
        final List<String> notes = new ArrayList<>();

        String json() {
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append("  \"").append(MARK).append("\": \"written by STODD Core from config/stodd_islands.properties on every start; edit that file, not this one\",\n");
            sb.append("  \"").append(MARK).append("_preset\": \"").append(preset).append("\",\n");
            sb.append("  \"islandSize\": ").append(Double.toString(size)).append(",\n");
            sb.append("  \"islandSeperation\": ").append(sep).append(",\n");
            sb.append("  \"islandUnderwaterFalloffDistanceMultiplier\": ").append(Double.toString(under)).append(",\n");
            sb.append("  \"continentalTargetRangeA\": { \"min\": ").append(Double.toString(aMin)).append(", \"max\": ").append(Double.toString(aMax)).append(" },\n");
            sb.append("  \"continentalTargetRangeB\": { \"min\": ").append(Double.toString(bMin)).append(", \"max\": ").append(Double.toString(bMax)).append(" }\n");
            sb.append("}\n");
            return sb.toString();
        }
    }

    private static Object[] preset(String name) {
        for (Object[] p : PRESETS) if (((String) p[0]).equalsIgnoreCase(name)) return p;
        return null;
    }

    private static String clean(String v) {
        if (v == null) return null;
        int hash = v.indexOf(" #");
        if (hash >= 0) v = v.substring(0, hash);
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    private static Double number(Properties p, Values out, double fallback, double lo, double hi, String... keys) {
        for (String k : keys) {
            String raw = clean(p.getProperty(k));
            if (raw == null) continue;
            try {
                double d = Double.parseDouble(raw);
                if (Double.isNaN(d) || Double.isInfinite(d)) throw new NumberFormatException(raw);
                if (d < lo || d > hi) {
                    double c = Math.max(lo, Math.min(hi, d));
                    out.notes.add(k + " = " + raw + " is outside " + lo + ".." + hi + ", using " + c);
                    return c;
                }
                return d;
            } catch (NumberFormatException e) {
                out.notes.add(k + " = \"" + raw + "\" is not a number (use a dot for decimals), using " + fallback);
                return null;
            }
        }
        return null;
    }

    /** Pure function of the file's text, so it can be tested without touching the disk. */
    static Values parse(String text) {
        Values v = new Values();
        Properties p = new Properties();
        if (text != null) {
            try { p.load(new StringReader(text)); } catch (IOException | IllegalArgumentException e) { v.notes.add("could not read the file (" + e + "), using the default preset"); }
        }
        Object[] first = preset(DEFAULT_PRESET);
        v.size = (Double) first[1]; v.sep = (Integer) first[2];
        String name = clean(p.getProperty("preset"));
        if (name != null) {
            Object[] pr = preset(name);
            if (pr == null) v.notes.add("preset = " + name + " is not one of the presets; using " + DEFAULT_PRESET);
            else { v.preset = (String) pr[0]; v.size = (Double) pr[1]; v.sep = (Integer) pr[2]; }
        }

        Double d = number(p, v, v.size, MIN_SIZE, MAX_SIZE, "islandSize");
        if (d != null) { v.size = d; v.preset = "custom"; }
        d = number(p, v, v.sep, MIN_SEP, MAX_SEP, "islandSeparation", "islandSeperation");
        if (d != null) { v.sep = (int) Math.round(d); v.preset = "custom"; }
        d = number(p, v, v.under, 1, 30, "underwaterFalloff");
        if (d != null) v.under = d;

        Double a0 = number(p, v, v.aMin, -3, 0, "coastA.min"), a1 = number(p, v, v.aMax, 0, 3, "coastA.max");
        Double b0 = number(p, v, v.bMin, -3, 0, "coastB.min"), b1 = number(p, v, v.bMax, 0, 3, "coastB.max");
        if (a0 != null) v.aMin = a0;
        if (a1 != null) v.aMax = a1;
        if (b0 != null) v.bMin = b0;
        if (b1 != null) v.bMax = b1;
        // the coast maths needs min < 0 < max at both ends
        if (v.aMin >= 0 || v.aMax <= 0) { v.notes.add("coastA must have min below 0 and max above 0, using -0.5 / 0.9"); v.aMin = -0.5; v.aMax = 0.9; }
        if (v.bMin >= 0 || v.bMax <= 0) { v.notes.add("coastB must have min below 0 and max above 0, using -1.0 / 1.4"); v.bMin = -1.0; v.bMax = 1.4; }

        if (v.sep < v.size * MIN_RATIO) {
            int fixed = (int) Math.ceil(v.size * MIN_RATIO);
            v.notes.add("islandSeparation " + v.sep + " is less than " + MIN_RATIO + " x islandSize " + v.size + " (islands would melt into each other), using " + fixed);
            v.sep = fixed;
        }
        return v;
    }

    /** The spawn-island settings of the STODD config, in the properties form parse() checks. */
    static String propertiesOf(stodd.core.config.StoddConfig c) {
        StringBuilder b = new StringBuilder();
        b.append("preset=").append(c.str("spawnIslands.preset", DEFAULT_PRESET)).append('\n');
        double size = c.num("spawnIslands.islandSize", 0), sep = c.num("spawnIslands.islandSeparation", 0);
        if (size > 0) b.append("islandSize=").append(size).append('\n');
        if (sep > 0) b.append("islandSeparation=").append(sep).append('\n');
        b.append("underwaterFalloff=").append(c.num("spawnIslands.underwaterFalloff", 9)).append('\n');
        for (String end : new String[] { "coastA", "coastB" }) {
            Object v = c.value("spawnIslands." + end);
            if (v instanceof java.util.Map) {
                java.util.Map<?, ?> m = (java.util.Map<?, ?>) v;
                if (m.get("min") instanceof Number) b.append(end).append(".min=").append(((Number) m.get("min")).doubleValue()).append('\n');
                if (m.get("max") instanceof Number) b.append(end).append(".max=").append(((Number) m.get("max")).doubleValue()).append('\n');
            }
        }
        return b.toString();
    }

    /** Runs at every start. Returns the line for the log. */
    static String sync(Path root) throws IOException {
        Path json = root.resolve(JSON);
        Values v = parse(propertiesOf(stodd.core.config.StoddConfig.get()));
        String body = v.json();
        String cur = Files.exists(json) ? new String(Files.readAllBytes(json), StandardCharsets.UTF_8) : null;
        StringBuilder msg = new StringBuilder("islands: " + (v.preset.equals("custom") ? "custom" : "preset '" + v.preset + "'")
            + " (islandSize " + v.size + ", islandSeparation " + v.sep + ")");
        for (String n : v.notes) msg.append("\n[STODD Core] WARNING in config/stodd/world.toml [spawnIslands]: ").append(n.replace("islandSeparation", "spawnIslands.islandSeparation").replace("islandSize", "spawnIslands.islandSize"));
        if (body.equals(cur)) return msg.append(" - ").append(JSON).append(" is already current.").toString();
        Files.createDirectories(json.getParent());
        boolean legacy = cur != null && !cur.contains("\"" + MARK + "\"");
        if (legacy) Files.write(json.resolveSibling("survivalisland.json.stodd-old"), cur.getBytes(StandardCharsets.UTF_8));
        Path tmp = json.resolveSibling("survivalisland.json.stodd-tmp");
        Files.write(tmp, body.getBytes(StandardCharsets.UTF_8));
        Files.move(tmp, json, StandardCopyOption.REPLACE_EXISTING);
        msg.append(" - wrote ").append(JSON);
        if (legacy) msg.append(" (replaced a hand-written file, a copy is in survivalisland.json.stodd-old; from now on edit [spawnIslands] in config/stodd/world.toml)");
        else if (cur != null) msg.append(". The layout CHANGED: chunks that already exist keep the old islands, so use a NEW world for the new spacing.");
        return msg.toString();
    }
}
