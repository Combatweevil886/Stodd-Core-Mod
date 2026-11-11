package stodd.core.gen;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Who may use which power system: the ten origins against Devil Fruits (True Prime Piece), Cursed Energy (Jujutsu Craft), dark magic
 * (Malum) and chrome (Project: Edgerunner), with the one-path rule of the Swordsman and the Marksman. The same table and the same
 * item rules as 10_origins.js / 06_discover.js (00_config.js: rules, detect, sorcery*, ripperdoc*), so the Java gate and the scripts
 * always agree. No Minecraft classes: the caller passes ids, names and tags.
 */
public final class OriginRules {
    public static final String FRUIT = "fruit", SORCERY = "sorcery", MAGIC = "magic", CYBER = "cyber";
    public static final List<String> SYSTEMS = Collections.unmodifiableList(java.util.Arrays.asList(FRUIT, SORCERY, MAGIC, CYBER));

    /** The answer of the gate. */
    public enum Verdict { ALLOW, DENY, ALLOW_AND_LOCK, NO_ORIGIN }

    public final List<String> origins;
    public final Map<String, String> names;
    final Map<String, Map<String, Object>> table;   // origin -> system -> Boolean or "path"
    public final Map<String, String> systemNames;
    final Pattern fruitNames, fruitIds, fruitItems, magicNames, magicIds, magicItems, magicBlocks;
    final Pattern sorcNs, sorcBookId, sorcBookName, sorcItem, ripEntity;
    final Set<String> sorceryItems, ripperdocBlocks;
    public final List<String> slotIds;
    public final Map<String, Map<String, Integer>> slots;
    public final Map<String, List<Map<String, Integer>>> slotsByMilestone;
    public final int slotMilestoneEvery;
    public final Map<String, int[]> cyberCapacity;    // origin -> {base, perLevel}
    public final List<String> cyberCommands;
    public final String jjcVariablesClass;

    // mod namespaces of each system, resolved from the installed mods (resolveMods)
    private volatile Set<String> fruitNs = Collections.emptySet(), magicNs = Collections.emptySet();

    static Pattern re(Object o) {
        Map<String, Object> m = MiniJson.obj(o);
        String src = MiniJson.str(m.get("src"), null);
        if (src == null) return null;
        try { return Pattern.compile(src, MiniJson.bool(m.get("i"), false) ? Pattern.CASE_INSENSITIVE : 0); } catch (RuntimeException e) { return null; }
    }

    static boolean find(Pattern p, String s) { return p != null && s != null && p.matcher(s).find(); }

    public OriginRules(Map<String, Object> m) {
        List<String> ol = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("list"))) if (o instanceof String) ol.add((String) o);
        origins = Collections.unmodifiableList(ol);
        Map<String, String> nm = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("names")).entrySet()) nm.put(e.getKey(), MiniJson.str(e.getValue(), e.getKey()));
        names = Collections.unmodifiableMap(nm);
        Map<String, Map<String, Object>> t = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("rules")).entrySet()) t.put(e.getKey(), MiniJson.obj(e.getValue()));
        table = t;
        Map<String, String> sn = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("systemNames")).entrySet()) sn.put(e.getKey(), MiniJson.str(e.getValue(), e.getKey()));
        if (!sn.containsKey(CYBER)) sn.put(CYBER, "Chrome");
        systemNames = Collections.unmodifiableMap(sn);
        Map<String, Object> det = MiniJson.obj(m.get("detect"));
        Map<String, Object> f = MiniJson.obj(det.get("fruit")), g = MiniJson.obj(det.get("magic"));
        fruitNames = re(f.get("names")); fruitIds = re(f.get("ids")); fruitItems = re(f.get("items"));
        magicNames = re(g.get("names")); magicIds = re(g.get("ids")); magicItems = re(g.get("items")); magicBlocks = re(g.get("blocks"));
        Map<String, Object> so = MiniJson.obj(m.get("sorcery"));
        Set<String> si = new HashSet<>();
        for (Object o : MiniJson.arr(so.get("items"))) if (o instanceof String) si.add((String) o);
        sorceryItems = si;
        sorcNs = re(so.get("namespaces")); sorcBookId = re(so.get("bookId")); sorcBookName = re(so.get("bookName")); sorcItem = re(so.get("itemPattern"));
        Set<String> rb = new HashSet<>();
        for (Object o : MiniJson.arr(m.get("ripperdocBlocks"))) if (o instanceof String) rb.add((String) o);
        ripperdocBlocks = rb;
        ripEntity = re(m.get("ripperdocEntity"));
        List<String> ids = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("slotIds"))) if (o instanceof String) ids.add((String) o);
        slotIds = Collections.unmodifiableList(ids);
        Map<String, Map<String, Integer>> sl = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("slots")).entrySet()) sl.put(e.getKey(), ints(e.getValue()));
        slots = Collections.unmodifiableMap(sl);
        Map<String, List<Map<String, Integer>>> sm = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("slotsByMilestone")).entrySet()) {
            List<Map<String, Integer>> rows = new ArrayList<>();
            for (Object r : MiniJson.arr(e.getValue())) rows.add(ints(r));
            sm.put(e.getKey(), Collections.unmodifiableList(rows));
        }
        slotsByMilestone = Collections.unmodifiableMap(sm);
        slotMilestoneEvery = Math.max(1, (int) MiniJson.num(m.get("slotMilestoneEvery"), 5));
        Map<String, int[]> cc = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(m.get("cyberCapacity")).entrySet()) {
            Map<String, Object> c = MiniJson.obj(e.getValue());
            cc.put(e.getKey(), new int[] { (int) MiniJson.num(c.get("base"), 0), (int) MiniJson.num(c.get("perLevel"), 0) });
        }
        cyberCapacity = Collections.unmodifiableMap(cc);
        List<String> cmds = new ArrayList<>();
        for (Object o : MiniJson.arr(m.get("cyberCapacityCommands"))) if (o instanceof String) cmds.add((String) o);
        cyberCommands = Collections.unmodifiableList(cmds);
        jjcVariablesClass = MiniJson.str(m.get("jjcVariablesClass"), null);
    }

    private static Map<String, Integer> ints(Object o) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : MiniJson.obj(o).entrySet()) out.put(e.getKey(), (int) MiniJson.num(e.getValue(), 0));
        return Collections.unmodifiableMap(out);
    }

    /** Which installed mods are the Devil Fruit / dark magic mods (by id or display name, as 06_discover.js does). Each entry {id, name}. */
    public void resolveMods(Collection<String[]> mods) {
        Set<String> fr = new HashSet<>(), mg = new HashSet<>();
        for (String[] m : mods) {
            if (find(fruitIds, m[0]) || find(fruitNames, m[1])) fr.add(m[0]);
            if (find(magicIds, m[0]) || find(magicNames, m[1])) mg.add(m[0]);
        }
        fruitNs = Collections.unmodifiableSet(fr);
        magicNs = Collections.unmodifiableSet(mg);
    }

    public Set<String> fruitNamespaces() { return fruitNs; }

    public Set<String> magicNamespaces() { return magicNs; }

    static String ns(String id) { int i = id.indexOf(':'); return i < 0 ? "minecraft" : id.substring(0, i); }

    static String path(String id) { int i = id.indexOf(':'); return i < 0 ? id : id.substring(i + 1); }

    /**
     * The power system an item belongs to, or null.
     * @param tags the item's tags as "namespace:path" (stodd:devil_fruits, stodd:magic_items, stodd:sorcery_items count)
     */
    public String systemOfItem(String id, String hoverName, Collection<String> tags) {
        if (id == null) return null;
        if (tags != null) {
            if (tags.contains("stodd:devil_fruits")) return FRUIT;
            if (tags.contains("stodd:magic_items")) return MAGIC;
            if (tags.contains("stodd:sorcery_items")) return SORCERY;
        }
        String n = ns(id), p = path(id);
        if (fruitNs.contains(n) && find(fruitItems, p)) return FRUIT;
        if (magicNs.contains(n) && magicItems != null && magicItems.matcher(p).find()) return MAGIC;
        if (sorceryItems.contains(id) || find(sorcItem, id)) return SORCERY;
        if (find(sorcNs, id)) {
            if (find(sorcBookId, p)) return SORCERY;
            if (hoverName != null && !hoverName.isEmpty() && find(sorcBookName, hoverName)) return SORCERY;
        }
        return null;
    }

    /** The power system a block belongs to (Malum's altars and machines, the Ripperdoc), or null. */
    public String systemOfBlock(String id, Collection<String> tags) {
        if (id == null) return null;
        if (ripperdocBlocks.contains(id) || (tags != null && tags.contains("stodd:cyberware_stations"))) return CYBER;
        if (tags != null && tags.contains("stodd:magic_machines")) return MAGIC;
        if (magicNs.contains(ns(id)) && find(magicBlocks, path(id))) return MAGIC;
        return null;
    }

    /** Is this entity a ripperdoc (an NPC that installs chrome)? */
    public boolean ripperdocEntity(String typeId, String profession) {
        return find(ripEntity, typeId) || find(ripEntity, profession);
    }

    /** The rule of an origin for a system: Boolean.TRUE, Boolean.FALSE or "path". Unknown = FALSE. */
    public Object rule(String origin, String system) {
        Map<String, Object> r = table.get(origin);
        if (r == null) return Boolean.FALSE;
        Object v = r.get(system);
        if ("path".equals(v)) return "path";
        return Boolean.TRUE.equals(v) ? Boolean.TRUE : Boolean.FALSE;
    }

    /** May this origin (with this chosen path, "" = none) use the system? */
    public Verdict verdict(String origin, String path, String system) {
        if (origin == null) return Verdict.NO_ORIGIN;
        Object r = rule(origin, system);
        if (Boolean.TRUE.equals(r)) return Verdict.ALLOW;
        if (Boolean.FALSE.equals(r)) return Verdict.DENY;
        if (path == null || path.isEmpty()) return Verdict.ALLOW_AND_LOCK;
        return path.equals(system) ? Verdict.ALLOW : Verdict.DENY;
    }

    /** What the player is told (the scripts' denyText). */
    public String denyText(String origin, String system) {
        if (origin == null) return "Choose an origin first.";
        if ("path".equals(rule(origin, system))) return "You have already chosen another path.";
        switch (system) {
            case FRUIT: return "Your body rejects the Devil Fruit.";
            case SORCERY: return "You have no Cursed Energy to channel.";
            case CYBER: return "Your body rejects all chrome.";
            case MAGIC: return "The dark arts will not answer you.";
            default: return "Your origin cannot use that.";
        }
    }

    public String nameOf(String origin) { String n = names.get(origin); return n == null ? origin : n; }

    /** The exact Curios counts for an origin at a level: the milestone row if it grows with level, else the level-1 table. */
    public Map<String, Integer> slotsAt(String origin, int level) {
        List<Map<String, Integer>> rows = slotsByMilestone.get(origin);
        if (rows != null && !rows.isEmpty()) return rows.get(Math.min(rows.size() - 1, Math.max(0, level) / slotMilestoneEvery));
        return slots.get(origin);
    }

    /** Index of the milestone row (for origins that grow), else -1. */
    public int slotRow(String origin, int level) {
        List<Map<String, Integer>> rows = slotsByMilestone.get(origin);
        return rows == null || rows.isEmpty() ? -1 : Math.min(rows.size() - 1, Math.max(0, level) / slotMilestoneEvery);
    }

    /** Cyberware capacity (Max Load) for an origin at a level: base + perLevel x (level - 1). */
    public int cyberCapacityAt(String origin, int level) {
        int[] c = cyberCapacity.get(origin);
        return c == null ? -1 : c[0] + c[1] * Math.max(0, level - 1);
    }
}
