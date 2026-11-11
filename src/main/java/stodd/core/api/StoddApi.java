package stodd.core.api;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import stodd.core.addon.Caps;
import stodd.core.addon.OriginGate;
import stodd.core.addon.PowerMods;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.WorldRules;
import stodd.core.mc.LogPose;
import stodd.core.mc.ModCommands;
import stodd.core.mc.Worlds;

/**
 * What the KubeJS scripts ask the Java side (Java.loadClass('stodd.core.api.StoddApi')). Every method is safe to call with
 * anything: a wrong argument gives null / false, never an exception into a script.
 */
public final class StoddApi {
    private StoddApi() { }

    /** 3 = this API; the scripts check it before relying on anything here. */
    public static int version() { return 3; }

    /** Hands the live world rules (02_rules.js, as JSON) to the generator; returns null on success, else the reason. */
    public static String configure(String json) {
        try {
            WorldRules.set(WorldRules.fromJson(json, "00_config.js"));
            PowerMods.refresh();
            return null;
        } catch (Throwable t) {
            return String.valueOf(t);
        }
    }

    /** true: cities, dressed islands and sky-island dressing are world generation (the scripts' builders stand down). */
    public static boolean worldgenActive() {
        WorldRules r = WorldRules.get();
        return r.cityEnabled || r.isleEnabled;
    }

    /** true: the Log Pose is the Java item (the scripts' compass version stands down). */
    public static boolean logPoseActive() { return true; }

    /** The centre {x, z} of the ground island (x, z) is on, or null over the sea. The scripts register islands by this. */
    public static int[] centre(Level level, int x, int z) {
        if (!(level instanceof ServerLevel)) return null;
        try {
            IslandFinder.Island i = Worlds.of((ServerLevel) level).ground.islandAt(x, z);
            return i == null ? null : new int[] { i.cx, i.cz };
        } catch (Throwable t) { return null; }
    }

    /** The sky island over (x, z): {cx, cz, radius}, or null. */
    public static int[] skyIsland(Level level, int x, int z) {
        if (!(level instanceof ServerLevel)) return null;
        try {
            Worlds.Tools t = Worlds.of((ServerLevel) level);
            if (t.sky == null || !(t.sky.sample(x, z) > 0)) return null;
            IslandFinder.Island i = t.sky.islandAt(x, z);
            return i == null || i.radius < t.rules.skyMinRadius ? null : new int[] { i.cx, i.cz, i.radius };
        } catch (Throwable t) { return null; }
    }

    /** The theme id the generator gives the island centred on (cx, cz). */
    public static String themeAt(Level level, int cx, int cz) {
        if (!(level instanceof ServerLevel)) return null;
        return WorldRules.get().themeAt(cx, cz, Worlds.seed((ServerLevel) level)).id;
    }

    /** One line about the island at a position (what /stodd core island prints). */
    public static String islandReport(Level level, double x, double y, double z) {
        if (!(level instanceof ServerLevel)) return "";
        try { return ModCommands.islandReport((ServerLevel) level, new Vec3(x, y, z)); } catch (Throwable t) { return String.valueOf(t); }
    }

    // ------------------------------------------------------------------ the add-on side: origins and the power mods' data
    /** true: the Java gate enforces the origin rules on items, blocks, NPCs, attacks and curios (the scripts' gate stands down). */
    public static boolean gateActive() { return true; }

    /** The player's origin id, or null. */
    public static String originOf(Entity p) { return p == null ? null : OriginGate.originOf(p); }

    /** The power system of a stack ("fruit", "sorcery", "magic"), or null. */
    public static String systemOf(Object stack) { return stack instanceof net.minecraft.world.item.ItemStack ? OriginGate.systemOf((net.minecraft.world.item.ItemStack) stack) : null; }

    /** Re-applies slots and cyberware tolerance now (after a level or origin change). */
    public static void applyOrigin(Entity p) { if (p instanceof ServerPlayer) OriginGate.apply((ServerPlayer) p, true); }

    /** Names of every mod capability on an entity ("trueprimepiece:...", "jujutsucraft:player_variables" ...). */
    public static String[] capKeys(Entity e) { return Caps.keys(e).toArray(new String[0]); }

    /** The first capability whose name contains `part`, or null. */
    public static String capFind(Entity e, String part) { return Caps.find(e, part); }

    /** A copy of one mod's data on the entity. */
    public static CompoundTag capRead(Entity e, String key) { return Caps.read(e, key); }

    /** Merges a change into one mod's live data (and syncs an MCreator mod's variables to the client). */
    public static boolean capWrite(Entity e, String key, CompoundTag patch) { return Caps.write(e, key, patch); }

    /** Sets one number inside a mod's live data, path "Stats/Agility", keeping its type. */
    public static boolean capSetNumber(Entity e, String key, String path, double value) { return Caps.setNumber(e, key, path, value); }

    /** Every number in one mod's data, as "path=value" lines. */
    public static String[] capNumbers(Entity e, String key) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (java.util.Map.Entry<String, Double> en : Caps.numbers(e, key).entrySet()) out.add(en.getKey() + "=" + en.getValue());
        return out.toArray(new String[0]);
    }

    /** Names of an MCreator mod's player variables (modid e.g. "jujutsucraft"), or null when it has none on this player. */
    public static String[] varNames(Entity e, String modid) {
        Object v = Caps.variables(e, modid);
        return v == null ? null : Caps.fields(v).keySet().toArray(new String[0]);
    }

    /** One MCreator player variable (a Number, String or Boolean), or null. */
    public static Object varGet(Entity e, String modid, String name) { return Caps.get(Caps.variables(e, modid), name); }

    /** Sets an MCreator player variable and syncs it to the player's client. */
    public static boolean varSet(Entity e, String modid, String name, Object value) { return Caps.set(e, Caps.variables(e, modid), name, value); }

    /** Is one of the known power-system mods installed? key: tpp, jjk, malum, edgerunner, curios, origins */
    public static boolean modPresent(String key) { PowerMods.Entry m = PowerMods.of(key); return m != null && m.present(); }

    /** A new Log Pose stack (the Java item). */
    public static Object newLogPose() { return LogPose.newStack(); }
}
