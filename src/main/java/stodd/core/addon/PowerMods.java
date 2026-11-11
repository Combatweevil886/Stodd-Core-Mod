package stodd.core.addon;

import net.minecraftforge.fml.ModList;
import net.minecraftforge.forgespi.language.IModInfo;
import stodd.core.gen.OriginRules;
import stodd.core.gen.WorldRules;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The power-system mods STODD Core is an add-on to, and what it does with each. Detected by mod id or name at run time, so a renamed
 * or re-packaged jar still counts; nothing here needs the mod at compile time.
 */
public final class PowerMods {
    private PowerMods() { }

    public static final class Entry {
        public final String key, title, system, role;
        final Pattern match;
        public final List<String> found = new ArrayList<>();
        Entry(String key, String title, String system, String regex, String role) {
            this.key = key; this.title = title; this.system = system; this.match = Pattern.compile(regex, Pattern.CASE_INSENSITIVE); this.role = role;
        }
        public boolean present() { return !found.isEmpty(); }
    }

    private static List<Entry> entries;

    public static synchronized List<Entry> all() {
        if (entries != null) return entries;
        List<Entry> l = new ArrayList<>();
        l.add(new Entry("tpp", "True Prime Piece", OriginRules.FRUIT, "(true_?prime|prime_?piece|^tpp)",
            "Devil Fruits: only the Devil Fruit User, Cyberware User, Dark Magician and a Swordsman / Marksman on the fruit path may eat one; stats linked to the STODD level"));
        l.add(new Entry("jjk", "Jujutsu Craft", OriginRules.SORCERY, "(jujutsu|sorcery_?fight|jjk)",
            "Cursed Energy: only the Sorcerer, the Brawler and a Swordsman / Marksman on the sorcery path keep a technique; grade linked to the level"));
        l.add(new Entry("malum", "Malum", OriginRules.MAGIC, "^malum",
            "Dark magic: altars, machines, scythes, staves and spirit curios answer only the Dark Magician"));
        l.add(new Entry("edgerunner", "Project: Edgerunner", OriginRules.CYBER, "(edgerunner|night_?city|cyberpunk)",
            "Chrome: ripperdocs refuse the Sorcerer, the Dark Magician and the Skyborn; each origin's cyberware tolerance (Max Load)"));
        l.add(new Entry("curios", "Curios", null, "^curios$", "each origin's exact accessory slots (the Weakling's grow with its level)"));
        l.add(new Entry("origins", "Origins (Fabric, via Connector)", null, "^(origins|apoli|calio)$", "the ten STODD origins"));
        l.add(new Entry("survivalisland", "Survival Island", null, "^survivalisland$", "the island terrain"));
        l.add(new Entry("waystones", "Waystones", null, "^waystones$", "one waystone at the centre of every island"));
        l.add(new Entry("kubejs", "KubeJS", null, "^kubejs$", "levels, mastery, combat, the starter-kit purge and the island waystones run as scripts"));
        for (IModInfo m : ModList.get().getMods()) {
            String id = m.getModId(), name = m.getDisplayName();
            for (Entry e : l) if (e.match.matcher(id).find() || e.match.matcher(name == null ? "" : name.toLowerCase(Locale.ROOT).replace(' ', '_')).find()) e.found.add(id);
        }
        entries = l;
        // the origin rules learn which namespaces hold the fruits and the magic
        List<String[]> mods = new ArrayList<>();
        for (IModInfo m : ModList.get().getMods()) mods.add(new String[] { m.getModId(), m.getDisplayName() == null ? "" : m.getDisplayName() });
        WorldRules.get().origins.resolveMods(mods);
        return l;
    }

    /** Re-resolves the item namespaces after the rules were replaced (StoddApi.configure). */
    public static void refresh() {
        List<String[]> mods = new ArrayList<>();
        for (IModInfo m : ModList.get().getMods()) mods.add(new String[] { m.getModId(), m.getDisplayName() == null ? "" : m.getDisplayName() });
        WorldRules.get().origins.resolveMods(mods);
    }

    public static Entry of(String key) {
        for (Entry e : all()) if (e.key.equals(key)) return e;
        return null;
    }
}
