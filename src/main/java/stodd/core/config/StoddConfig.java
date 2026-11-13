package stodd.core.config;

import stodd.core.gen.MiniJson;
import stodd.core.gen.SkyField;

import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The STODD config: every setting of the mod, in config/stodd/world.toml, origins.toml, progression.toml and general.toml.
 *
 * The settings, their defaults and their explanations come from 00_config.js (the scripts' defaults), turned into
 * /stodd_config/schema.json when the jar is built (tools/gen_config.js). On every start (and whenever a file changed) the files
 * are read; a missing file, or one that lacks settings a newer version added, is (re)written with the values it had, so the files
 * always list every setting with its explanation. A file that cannot be read is left alone (its settings keep their defaults and
 * the log says why).
 *   - the Java side reads its settings here (the sky islands, the spawn islands, ...);
 *   - the scripts get every value as JSON (StoddApi.configJson) and lay it over their defaults at the end of 00_config.js.
 * Only the JDK is used, so the tests run it as it is.
 */
public final class StoddConfig {
    public static final String DIR = "config/stodd";
    static final String SCHEMA = "/stodd_config/schema.json";
    static final String OLD_ISLANDS = "config/stodd_islands.properties";

    /** One setting. */
    public static final class Setting {
        public final String path, key, file, note;
        public final Object def;
        public final boolean regex;
        public final List<String> pre;
        Setting(String path, String key, String file, Object def, boolean regex, String note, List<String> pre) {
            this.path = path; this.key = key; this.file = file; this.def = def; this.regex = regex; this.note = note; this.pre = pre;
        }

        /** What the setting is for, in one piece of text (the comments next to it). */
        public String help() {
            StringBuilder b = new StringBuilder();
            for (String p : pre) { if (b.length() > 0) b.append(' '); b.append(p); }
            if (note != null && !note.isEmpty()) { if (b.length() > 0) b.append(' '); b.append(note); }
            return b.toString().trim();
        }
    }

    static final class Spec {
        final String name, title;
        final List<String> intro;
        final List<Object> items = new ArrayList<>();   // String[] {"table", path, pre...} or Setting
        Spec(String name, String title, List<String> intro) { this.name = name; this.title = title; this.intro = intro; }
    }

    static final class Schema {
        final List<Spec> specs = new ArrayList<>();
        final Map<String, Setting> settings = new LinkedHashMap<>();
        final Map<String, List<String>> tablePre = new LinkedHashMap<>();
    }

    private static volatile StoddConfig current;
    private static Schema schemaCache;

    private final Path root, dir;
    private final Schema schema;
    private final Map<String, Object> user = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> unknown = new LinkedHashMap<>();
    private final List<String> notes = new ArrayList<>();
    private final Map<String, Long> stamps = new LinkedHashMap<>();
    private final java.util.Set<String> broken = new java.util.HashSet<>();

    // ---------------------------------------------------------------- the current config

    /** The config of this game (read the first time it is asked for). */
    public static StoddConfig get() {
        StoddConfig c = current;
        if (c == null) {
            synchronized (StoddConfig.class) {
                if (current == null) load(stodd.core.Installer.gameDir());
                c = current;
            }
        }
        return c;
    }

    /** Reads (and where needed writes) the files under root/config/stodd and makes them the current config. */
    public static synchronized StoddConfig load(Path root) {
        StoddConfig c = new StoddConfig(root, schema());
        c.read(true);
        current = c;
        return c;
    }

    /** The current config, read again first if a file changed since it was read. */
    public static StoddConfig refresh() {
        StoddConfig c = get();
        if (c.changedOnDisk()) {
            synchronized (StoddConfig.class) {
                if (current == c) load(c.root);
                c = current;
            }
        }
        return c;
    }

    StoddConfig(Path root, Schema schema) {
        this.root = root;
        this.dir = root.resolve(DIR);
        this.schema = schema;
    }

    static synchronized Schema schema() {
        if (schemaCache == null) {
            try (InputStream in = StoddConfig.class.getResourceAsStream(SCHEMA)) {
                if (in == null) throw new IllegalStateException("the jar has no " + SCHEMA);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                schemaCache = parseSchema(new String(out.toByteArray(), StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new IllegalStateException("could not read " + SCHEMA, e);
            }
        }
        return schemaCache;
    }

    static Schema parseSchema(String json) {
        Schema s = new Schema();
        for (Object fo : MiniJson.arr(MiniJson.obj(MiniJson.parse(json)).get("files"))) {
            Map<String, Object> f = MiniJson.obj(fo);
            List<String> intro = strings(f.get("intro"));
            Spec spec = new Spec(MiniJson.str(f.get("name"), "?"), MiniJson.str(f.get("title"), ""), intro);
            for (Object io : MiniJson.arr(f.get("items"))) {
                Map<String, Object> it = MiniJson.obj(io);
                String t = MiniJson.str(it.get("t"), "");
                String path = MiniJson.str(it.get("path"), "");
                List<String> pre = strings(it.get("pre"));
                if (t.equals("table")) {
                    spec.items.add(new String[] { "table", path });
                    s.tablePre.put(path, pre);
                } else {
                    Setting st = new Setting(path, MiniJson.str(it.get("key"), path), spec.name, it.get("def"), MiniJson.bool(it.get("re"), false),
                        MiniJson.str(it.get("note"), ""), pre);
                    spec.items.add(st);
                    s.settings.put(path, st);
                }
            }
            s.specs.add(spec);
        }
        return s;
    }

    static List<String> strings(Object o) {
        List<String> out = new ArrayList<>();
        for (Object x : MiniJson.arr(o)) out.add(String.valueOf(x));
        return out;
    }

    // ---------------------------------------------------------------- reading the files

    Path fileOf(String name) { return dir.resolve(name + ".toml"); }

    boolean changedOnDisk() {
        for (Spec sp : schema.specs) {
            Path f = fileOf(sp.name);
            long now = Files.exists(f) ? lastModified(f) : -1;
            Long then = stamps.get(sp.name);
            if (then == null || then != now) return true;
        }
        return false;
    }

    static long lastModified(Path f) {
        try { return Files.getLastModifiedTime(f).toMillis() ^ Files.size(f) * 31; } catch (IOException e) { return -2; }
    }

    void read(boolean writeMissing) {
        Map<String, String> imported = new LinkedHashMap<>();
        for (Spec sp : schema.specs) {
            Path f = fileOf(sp.name);
            unknown.put(sp.name, new LinkedHashMap<>());
            boolean exists = Files.exists(f);
            boolean needWrite = !exists;
            if (exists) {
                try {
                    Map<String, Object> flat = expand(Toml.parse(new String(Files.readAllBytes(f), StandardCharsets.UTF_8)));
                    for (Map.Entry<String, Object> e : flat.entrySet()) {
                        Setting st = schema.settings.get(e.getKey());
                        if (st == null || !st.file.equals(sp.name)) {
                            unknown.get(sp.name).put(e.getKey(), e.getValue());
                            notes.add(sp.name + ".toml: " + e.getKey() + " is not a setting of this version (left out)");
                            continue;
                        }
                        String why = accepts(st, e.getValue());
                        if (why != null) { notes.add(sp.name + ".toml: " + e.getKey() + " " + why + ", using the default " + Toml.format(st.def)); continue; }
                        if (retired(e.getKey(), e.getValue())) {
                            // the default of an earlier version, written there by that version: the new default instead
                            notes.add(sp.name + ".toml: " + e.getKey() + " = " + Toml.format(e.getValue()) + " was the old default, using the new default " + Toml.format(st.def));
                            needWrite = true;
                            continue;
                        }
                        user.put(e.getKey(), normalise(st, e.getValue()));
                    }
                    for (Setting st : schema.settings.values()) if (st.file.equals(sp.name) && !flat.containsKey(st.path)) needWrite = true;
                } catch (Toml.TomlException | IOException e) {
                    broken.add(sp.name);
                    notes.add(sp.name + ".toml could not be read (" + e.getMessage() + "): its settings keep their defaults until it is fixed");
                }
            } else if (sp.name.equals("world")) {
                // STODD Core 3.0 kept the island spacing in config/stodd_islands.properties
                importIslands(imported);
                if (!imported.isEmpty()) needWrite = true;
            }
            if (writeMissing && needWrite && !broken.contains(sp.name)) {
                try { write(sp); } catch (IOException e) { notes.add("could not write " + f + ": " + e); }
            }
            stamps.put(sp.name, Files.exists(f) ? lastModified(f) : -1);
        }
    }

    /** Defaults that a newer version changed: a file still holding one gets the new default (3.1.1: the sunken islands' new look). */
    static final Map<String, double[]> RETIRED = new LinkedHashMap<>();
    static {
        RETIRED.put("deepIslands.coastDepth", new double[] { 16 });
        RETIRED.put("deepIslands.waterAbove", new double[] { 10 });
        RETIRED.put("deepIslands.margin", new double[] { 24 });
        RETIRED.put("deepIslands.depthBelow", new double[] { 20 });
        RETIRED.put("deepIslands.villages", new double[] { 0.6 });   // 3.3.1: a village on a quarter of them, not most
        RETIRED.put("deepIslands.lighting", new double[] { 8 });     // 3.4.0: brighter domes
        RETIRED.put("deepIslands.bubbleLight", new double[] { 7 });
        RETIRED.put("deepIslands.streamRadius", new double[] { 8 }); // 3.4.0: as wide as the sky islands' streams
    }

    static boolean retired(String path, Object v) {
        double[] old = RETIRED.get(path);
        if (old == null || !(v instanceof Number)) return false;
        for (double o : old) if (((Number) v).doubleValue() == o) return true;
        return false;
    }

    /** Inline tables under a table path ("islandThemes.city = { chance = 0.2 }") count as that table's settings. */
    Map<String, Object> expand(Map<String, Object> flat) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : flat.entrySet()) expandInto(out, e.getKey(), e.getValue());
        return out;
    }

    private void expandInto(Map<String, Object> out, String path, Object v) {
        if (v instanceof Map && !schema.settings.containsKey(path)) {
            String pre = path + ".";
            boolean table = false;
            for (String k : schema.settings.keySet()) if (k.startsWith(pre)) { table = true; break; }
            if (table) {
                for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) expandInto(out, pre + e.getKey(), e.getValue());
                return;
            }
        }
        out.put(path, v);
    }

    /** null when the value fits the setting, else why not. */
    static String accepts(Setting st, Object v) {
        Object d = st.def;
        if (d == null) return null;
        if (d instanceof Number) return v instanceof Number ? null : "should be a number";
        if (d instanceof Boolean) return v instanceof Boolean || v instanceof String ? null : "should be true or false";
        if (d instanceof String) return v instanceof List || v instanceof Map ? "should be a single value" : null;
        if (d instanceof List) return v instanceof List ? null : "should be a list [ ... ]";
        if (d instanceof Map) return v instanceof Map ? null : "should be a table { ... }";
        return null;
    }

    static Object normalise(Setting st, Object v) {
        if (st.regex && v instanceof String) {
            String s = (String) v;
            if (!s.isEmpty() && !(s.startsWith("/") && s.lastIndexOf('/') > 0)) return "/" + s + "/";
        }
        return v;
    }

    private void importIslands(Map<String, String> imported) {
        Path old = root.resolve(OLD_ISLANDS);
        if (!Files.exists(old)) return;
        try {
            java.util.Properties p = new java.util.Properties();
            p.load(new java.io.StringReader(new String(Files.readAllBytes(old), StandardCharsets.UTF_8)));
            String[][] map = {
                { "preset", "spawnIslands.preset" }, { "islandSize", "spawnIslands.islandSize" }, { "islandSeparation", "spawnIslands.islandSeparation" },
                { "islandSeperation", "spawnIslands.islandSeparation" }, { "underwaterFalloff", "spawnIslands.underwaterFalloff" } };
            for (String[] m : map) {
                String raw = clean(p.getProperty(m[0]));
                if (raw == null) continue;
                Setting st = schema.settings.get(m[1]);
                if (st == null) continue;
                Object v = raw;
                if (st.def instanceof Number) { try { v = Double.parseDouble(raw); } catch (NumberFormatException e) { continue; } }
                user.put(m[1], v);
                imported.put(m[0], raw);
            }
            String[][] coast = { { "coastA", "spawnIslands.coastA" }, { "coastB", "spawnIslands.coastB" } };
            for (String[] m : coast) {
                Setting st = schema.settings.get(m[1]);
                if (st == null || !(st.def instanceof Map)) continue;
                Map<String, Object> v = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : ((Map<?, ?>) st.def).entrySet()) v.put(String.valueOf(e.getKey()), e.getValue());
                boolean any = false;
                for (String end : new String[] { "min", "max" }) {
                    String raw = clean(p.getProperty(m[0] + "." + end));
                    if (raw == null) continue;
                    try { v.put(end, Double.parseDouble(raw)); any = true; } catch (NumberFormatException ignored) { }
                }
                if (any) { user.put(m[1], v); imported.put(m[0], "set"); }
            }
            Files.move(old, old.resolveSibling("stodd_islands.properties.moved-to-stodd-world-toml"), StandardCopyOption.REPLACE_EXISTING);
            notes.add("moved the island spacing from " + OLD_ISLANDS + " into " + DIR + "/world.toml " + imported);
        } catch (IOException | IllegalArgumentException e) {
            notes.add("could not read " + OLD_ISLANDS + " (" + e + ")");
        }
    }

    private static String clean(String v) {
        if (v == null) return null;
        int hash = v.indexOf(" #");
        if (hash >= 0) v = v.substring(0, hash);
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    // ---------------------------------------------------------------- writing the files

    String render(Spec sp) {
        StringBuilder b = new StringBuilder();
        String bar = "# " + "=".repeat(118) + "\n";
        b.append(bar).append("#  STODD Core - ").append(sp.title).append("   (config/stodd/").append(sp.name).append(".toml)\n");
        for (String l : sp.intro) b.append("#  ").append(l).append('\n');
        b.append("#\n");
        b.append("#  STODD Core writes this file from its defaults and keeps your values when a new version adds settings (it rewrites the\n");
        b.append("#  file then, so keep your own notes elsewhere). Delete a line, or the whole file, to get the default back.\n");
        b.append("#  Text goes in quotes: \"text\". Regular expressions go in single quotes: '/^malum$/i'. Lists: [1, 2]. Tables: { a = 1 }.\n");
        b.append("#  In the game: /stodd config set <setting> <value>, /stodd config get <setting>, /stodd config reload,\n");
        b.append("#  or Mods > STODD Core > Config.\n");
        b.append(bar);
        String table = "";
        boolean firstInTable = true;
        for (Object o : sp.items) {
            if (o instanceof String[]) {
                table = ((String[]) o)[1];
                b.append('\n');
                List<String> pre = schema.tablePre.getOrDefault(table, Collections.emptyList());
                for (String l : pre) b.append(comment(l));
                b.append('[').append(tablePath(table)).append("]\n");
                firstInTable = true;
                continue;
            }
            Setting st = (Setting) o;
            String rel = !table.isEmpty() && st.path.startsWith(table + ".") ? st.path.substring(table.length() + 1) : st.path;
            if (!st.pre.isEmpty()) {
                if (!firstInTable) b.append('\n');
                for (String l : st.pre) b.append(comment(l));
            }
            firstInTable = false;
            Object v = user.containsKey(st.path) ? user.get(st.path) : st.def;
            String val = Toml.formatBlock(v, 110);
            String line = tablePath(rel) + " = " + val;
            String note = st.note == null ? "" : st.note.trim();
            if (!note.isEmpty() && (val.contains("\n") || line.length() + note.length() > 150)) { b.append(comment(note)); note = ""; }
            b.append(line);
            if (!note.isEmpty()) b.append("   # ").append(note);
            b.append('\n');
        }
        Map<String, Object> unk = unknown.get(sp.name);
        if (unk != null && !unk.isEmpty()) {
            b.append("\n# ---- settings this version of STODD Core does not know: not used, kept here as a reminder ----\n");
            for (Map.Entry<String, Object> e : unk.entrySet()) b.append("# ").append(e.getKey()).append(" = ").append(Toml.format(e.getValue())).append('\n');
        }
        return b.toString();
    }

    static String tablePath(String p) {
        StringBuilder b = new StringBuilder();
        for (String part : p.split("\\.")) { if (b.length() > 0) b.append('.'); b.append(Toml.key(part)); }
        return b.toString();
    }

    static String comment(String l) { return l.isEmpty() ? "#\n" : "# " + l + "\n"; }

    void write(Spec sp) throws IOException {
        Path f = fileOf(sp.name);
        Files.createDirectories(f.getParent());
        String text = render(sp);
        if (Files.exists(f) && new String(Files.readAllBytes(f), StandardCharsets.UTF_8).equals(text)) return;
        Path tmp = f.resolveSibling(sp.name + ".toml.tmp");
        Files.write(tmp, text.getBytes(StandardCharsets.UTF_8));
        Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING);
    }

    // ---------------------------------------------------------------- reading values

    public Path dir() { return dir; }

    public List<String> notes() { return Collections.unmodifiableList(notes); }

    public Map<String, Setting> settings() { return Collections.unmodifiableMap(schema.settings); }

    public Setting setting(String path) { return schema.settings.get(path); }

    public List<String> files() {
        List<String> out = new ArrayList<>();
        for (Spec sp : schema.specs) out.add(sp.name);
        return out;
    }

    /** true when the file sets this setting itself (it is not the default) */
    public boolean isSet(String path) { return user.containsKey(path); }

    public Object value(String path) {
        if (user.containsKey(path)) return user.get(path);
        Setting st = schema.settings.get(path);
        return st == null ? null : st.def;
    }

    public double num(String path, double def) { Object v = value(path); return v instanceof Number ? ((Number) v).doubleValue() : def; }

    public int integer(String path, int def) { return (int) Math.round(num(path, def)); }

    public boolean bool(String path, boolean def) { Object v = value(path); return v instanceof Boolean ? (Boolean) v : def; }

    public String str(String path, String def) { Object v = value(path); return v == null ? def : String.valueOf(v); }

    /** Every value (the files' or the default) as one JSON object shaped like the scripts' settings. */
    public String scriptJson() {
        Map<String, Object> rootMap = new LinkedHashMap<>();
        for (Setting st : schema.settings.values()) {
            String[] parts = st.path.split("\\.");
            Map<String, Object> at = rootMap;
            for (int i = 0; i < parts.length - 1; i++) {
                Object sub = at.get(parts[i]);
                if (!(sub instanceof Map)) { sub = new LinkedHashMap<String, Object>(); at.put(parts[i], sub); }
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) sub;
                at = m;
            }
            at.put(parts[parts.length - 1], value(st.path));
        }
        return Json.write(rootMap);
    }

    // ---------------------------------------------------------------- changing values

    /** Sets a setting from text as it would be written in the file (plain words count as text) and saves its file. */
    public static synchronized String set(String path, String text) throws IllegalArgumentException {
        StoddConfig c = refresh();
        Setting st = c.setting(path);
        if (st == null) throw new IllegalArgumentException("there is no setting " + path);
        if (c.broken.contains(st.file)) throw new IllegalArgumentException(st.file + ".toml has a mistake in it; fix it first (see /stodd config)");
        Object v;
        try {
            v = Toml.parseValue(text);
        } catch (Toml.TomlException e) {
            if (st.def instanceof String || st.def == null) v = text.trim();
            else throw new IllegalArgumentException("'" + text + "' is not a value: " + e.getMessage().replaceFirst("^line \\d+: ", ""));
        }
        String why = accepts(st, v);
        if (why != null) throw new IllegalArgumentException(path + " " + why);
        c.user.put(path, normalise(st, v));
        try {
            for (Spec sp : c.schema.specs) if (sp.name.equals(st.file)) c.write(sp);
        } catch (IOException e) {
            throw new IllegalArgumentException("could not save " + st.file + ".toml: " + e);
        }
        load(c.root);
        return path + " = " + Toml.format(get().value(path)) + " (saved in " + DIR + "/" + st.file + ".toml)";
    }

    /** Puts a setting back to its default and saves its file. */
    public static synchronized String reset(String path) throws IllegalArgumentException {
        StoddConfig c = refresh();
        Setting st = c.setting(path);
        if (st == null) throw new IllegalArgumentException("there is no setting " + path);
        if (c.broken.contains(st.file)) throw new IllegalArgumentException(st.file + ".toml has a mistake in it; fix it first (see /stodd config)");
        c.user.remove(path);
        try {
            for (Spec sp : c.schema.specs) if (sp.name.equals(st.file)) c.write(sp);
        } catch (IOException e) {
            throw new IllegalArgumentException("could not save " + st.file + ".toml: " + e);
        }
        load(c.root);
        return path + " = " + Toml.format(st.def) + " (the default)";
    }

    /** Sets several settings at once (the config screen's Save) and saves the files once. Returns the problems, empty when all went in. */
    public static synchronized List<String> setAll(Map<String, String> changes) {
        StoddConfig c = refresh();
        List<String> bad = new ArrayList<>();
        java.util.Set<String> files = new java.util.HashSet<>();
        for (Map.Entry<String, String> e : changes.entrySet()) {
            Setting st = c.setting(e.getKey());
            if (st == null) { bad.add("there is no setting " + e.getKey()); continue; }
            if (c.broken.contains(st.file)) { bad.add(st.file + ".toml has a mistake in it; fix it first"); continue; }
            Object v;
            try { v = Toml.parseValue(e.getValue()); }
            catch (Toml.TomlException x) {
                if (st.def instanceof String || st.def == null) v = e.getValue().trim();
                else { bad.add(e.getKey() + ": " + x.getMessage().replaceFirst("^line \\d+: ", "")); continue; }
            }
            String why = accepts(st, v);
            if (why != null) { bad.add(e.getKey() + " " + why); continue; }
            c.user.put(e.getKey(), normalise(st, v));
            files.add(st.file);
        }
        for (Spec sp : c.schema.specs) {
            if (!files.contains(sp.name)) continue;
            try { c.write(sp); } catch (IOException x) { bad.add("could not save " + sp.name + ".toml: " + x); }
        }
        load(c.root);
        return bad;
    }

    // ---------------------------------------------------------------- the Java side's own settings

    static final String[] SKY_RARITY_NAMES = { "none", "very_rare", "rare", "normal", "common", "very_common" };
    static final double[] SKY_RARITY = { 0, 0.05, 0.1, 0.18, 0.3, 0.45 };

    /** The share of islands lifted into the sky (00_config.js global.stoddSkyChance does the same for the scripts). */
    public double skyChance() {
        if (!bool("skyIslands.enabled", true)) return 0;
        double ch = num("skyIslands.chance", -1);
        if (ch >= 0) return Math.min(1, ch);
        Object r = value("skyIslands.rarity");
        if (r instanceof Number) return Math.max(0, Math.min(1, ((Number) r).doubleValue()));
        String s = String.valueOf(r).toLowerCase(Locale.ROOT);
        for (int i = 0; i < SKY_RARITY_NAMES.length; i++) if (SKY_RARITY_NAMES[i].equals(s)) return SKY_RARITY[i];
        notes.add("skyIslands.rarity = " + r + " is not one of " + String.join(", ", SKY_RARITY_NAMES) + ", using normal");
        return SKY_RARITY[3];
    }

    static final double[] DEEP_RARITY = { 0, 0.03, 0.06, 0.1, 0.18, 0.3 };

    /** The share of islands sunk under bubble domes. */
    public double deepChance() {
        if (!bool("deepIslands.enabled", true)) return 0;
        double ch = num("deepIslands.chance", -1);
        if (ch >= 0) return Math.min(1, ch);
        Object r = value("deepIslands.rarity");
        if (r instanceof Number) return Math.max(0, Math.min(1, ((Number) r).doubleValue()));
        String s = String.valueOf(r).toLowerCase(Locale.ROOT);
        for (int i = 0; i < SKY_RARITY_NAMES.length; i++) if (SKY_RARITY_NAMES[i].equals(s)) return DEEP_RARITY[i];
        notes.add("deepIslands.rarity = " + r + " is not one of " + String.join(", ", SKY_RARITY_NAMES) + ", using normal");
        return DEEP_RARITY[3];
    }

    private double clampNote(String path, double v, double lo, double hi) {
        if (v < lo || v > hi) {
            double c = Math.max(lo, Math.min(hi, v));
            notes.add(path + " = " + Toml.number(v) + " is outside " + Toml.number(lo) + ".." + Toml.number(hi) + ", using " + Toml.number(c));
            return c;
        }
        return v;
    }

    /** The sky-island settings, checked. */
    public SkyField.Params skyParams() {
        SkyField.Params p = new SkyField.Params();
        p.chance = skyChance();
        p.enabled = p.chance > 0;
        p.height = (int) Math.round(clampNote("skyIslands.height", num("skyIslands.height", 190), 110, 290));
        p.heightVariation = (int) Math.round(clampNote("skyIslands.heightVariation", num("skyIslands.heightVariation", 12), 0, 60));
        p.thickness = clampNote("skyIslands.thickness", num("skyIslands.thickness", 48), 6, 160);
        p.spikes = clampNote("skyIslands.spikes", num("skyIslands.spikes", 10), 0, 60);
        p.relief = clampNote("skyIslands.relief", num("skyIslands.relief", 0.85), 0.1, 1.5);
        p.maxHeight = (int) Math.round(clampNote("skyIslands.maxHeight", num("skyIslands.maxHeight", 316), p.height + 16, 319));
        p.minSpawnDistance = (int) Math.round(clampNote("skyIslands.minSpawnDistance", num("skyIslands.minSpawnDistance", 700), 0, 1_000_000));
        p.minRadius = (int) Math.round(clampNote("skyIslands.minRadius", num("skyIslands.minRadius", 40), 0, 4000));
        p.beaches = bool("skyIslands.beaches", false);
        // sunken islands
        p.deepChance = deepChance();
        p.deepEnabled = p.deepChance > 0;
        p.deepWaterAbove = (int) Math.round(clampNote("deepIslands.waterAbove", num("deepIslands.waterAbove", 6), 4, 50));
        p.deepCoast = (int) Math.round(clampNote("deepIslands.coastDepth", num("deepIslands.coastDepth", 24), -30, p.seaLevel - p.deepWaterAbove - 16));
        p.deepRelief = clampNote("deepIslands.relief", num("deepIslands.relief", 0.6), 0.1, 1.5);
        p.deepMargin = (int) Math.round(clampNote("deepIslands.margin", num("deepIslands.margin", 40), 6, 200));
        p.deepDown = (int) Math.round(clampNote("deepIslands.depthBelow", num("deepIslands.depthBelow", 24), 20, 60));
        p.deepRing = (int) Math.round(clampNote("deepIslands.slope", num("deepIslands.slope", 64), 0, 200));
        p.deepStream = bool("deepIslands.stream", true);
        p.deepStreamRadius = (int) Math.round(clampNote("deepIslands.streamRadius", num("deepIslands.streamRadius", 10), 2, 32));
        p.deepTube = bool("deepIslands.tube", true);
        p.cloudSea = bool("skyIslands.cloudSea", true);
        p.cloudWidth = (int) Math.round(clampNote("skyIslands.cloudWidth", num("skyIslands.cloudWidth", 56), 8, 200));
        p.cloudDepth = (int) Math.round(clampNote("skyIslands.cloudDepth", num("skyIslands.cloudDepth", 6), 1, 24));
        p.streams = (int) Math.round(clampNote("skyIslands.streams", num("skyIslands.streams", 1), 0, 8));
        p.streamRadius = (int) Math.round(clampNote("skyIslands.streamRadius", num("skyIslands.streamRadius", 10), 2, 32));
        if (p.deepCoast - p.deepDown < -58) { p.deepDown = p.deepCoast + 58; notes.add("deepIslands.depthBelow reaches the lava at the bottom of the world, using " + p.deepDown); }
        // an island's land reaches about 1.35 x islandSize from its middle (the size of the spawn islands, preset or set)
        double isize = num("spawnIslands.islandSize", 0);
        if (isize <= 0) {
            String pr = str("spawnIslands.preset", "default").toLowerCase(Locale.ROOT);
            isize = pr.equals("packed") ? 110 : pr.equals("large") ? 200 : pr.equals("grand") ? 300 : 140;
        }
        p.deepReach = (int) Math.round(isize * 1.6 + p.deepMargin + 96 + p.deepRing);
        p.deepLighting = (int) Math.round(clampNote("deepIslands.lighting", num("deepIslands.lighting", 4), 0, 64));
        p.landThreshold = num("islandLandThreshold", -0.19);
        p.peakStep = Math.max(8, integer("islandPeakStep", 32));
        p.cell = Math.max(16, integer("city.cell", 48));
        // the underside must stay well clear of the sea (and of the ground islands' sea level, where the island finder looks)
        double before = p.thickness;
        while (p.lowestBottom() < 90 && p.thickness > 6) p.thickness -= 1;
        if (p.thickness < before) notes.add("skyIslands.thickness " + Toml.number(before) + " would let the lowest islands hang down to the sea, using " + Toml.number(p.thickness));
        return p;
    }
}
