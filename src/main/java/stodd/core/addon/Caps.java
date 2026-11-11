package stodd.core.addon;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NumericTag;
import net.minecraft.nbt.Tag;
import net.minecraft.world.entity.Entity;
import net.minecraftforge.common.capabilities.CapabilityDispatcher;
import net.minecraftforge.common.capabilities.CapabilityProvider;
import net.minecraftforge.common.util.INBTSerializable;
import stodd.core.StoddCore;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Direct access to the data other mods attach to a player (Forge capabilities): True Prime Piece's stats, Jujutsu Craft's player
 * variables, Edgerunner's cyberware ... read AND written on the live object, not on a copy of the player's NBT.
 *
 * Every mod's capability is reached the same way Forge saves it: the entity's capability dispatcher holds each mod's provider under
 * the name it registered ("trueprimepiece:player_variables" ...). Reading = the provider's serializeNBT; writing = merge a change
 * into that and hand it back to deserializeNBT, which is exactly what loading the player from disk does. MCreator mods (Jujutsu Craft
 * and others) keep a PlayerVariables object with public fields and a syncPlayerVariables(Entity) method: that object is found on the
 * provider and synced after a write, so the mod's own HUD shows the new value at once.
 *
 * Only Forge's own classes are named here (their member names are the same in development and in the game); everything belonging
 * to the other mods is looked up at run time, so a mod that is missing or changes simply gives nothing.
 */
public final class Caps {
    private Caps() { }

    private static Method getCaps;
    private static Field writersF, namesF;
    private static boolean broken;

    private static synchronized boolean init() {
        if (broken) return false;
        if (getCaps != null) return true;
        try {
            getCaps = CapabilityProvider.class.getDeclaredMethod("getCapabilities");
            getCaps.setAccessible(true);
            writersF = CapabilityDispatcher.class.getDeclaredField("writers");
            writersF.setAccessible(true);
            namesF = CapabilityDispatcher.class.getDeclaredField("names");
            namesF.setAccessible(true);
            return true;
        } catch (Throwable t) {
            broken = true;
            StoddCore.LOG.warn("[STODD Core] cannot reach entity capabilities ({}); the mod links fall back to the scripts", t.toString());
            return false;
        }
    }

    /** name -> the mod's provider (the object that saves and loads that mod's data) */
    @SuppressWarnings("unchecked")
    public static Map<String, INBTSerializable<Tag>> providers(Entity e) {
        Map<String, INBTSerializable<Tag>> out = new LinkedHashMap<>();
        if (e == null || !init()) return out;
        try {
            Object disp = getCaps.invoke(e);
            if (disp == null) return out;
            Object[] w = (Object[]) writersF.get(disp);
            String[] n = (String[]) namesF.get(disp);
            for (int i = 0; i < Math.min(w.length, n.length); i++) out.put(n[i], (INBTSerializable<Tag>) w[i]);
        } catch (Throwable t) {
            StoddCore.LOG.debug("[STODD Core] capability list: {}", t.toString());
        }
        return out;
    }

    public static List<String> keys(Entity e) { return new ArrayList<>(providers(e).keySet()); }

    /** The first capability whose name contains `part` (case-insensitive), or null. */
    public static String find(Entity e, String part) {
        String p = part.toLowerCase(java.util.Locale.ROOT);
        for (String k : providers(e).keySet()) if (k.toLowerCase(java.util.Locale.ROOT).contains(p)) return k;
        return null;
    }

    /** A copy of one mod's data, or null. */
    public static CompoundTag read(Entity e, String key) {
        INBTSerializable<Tag> w = providers(e).get(key);
        if (w == null) return null;
        try {
            Tag t = w.serializeNBT();
            return t instanceof CompoundTag ? (CompoundTag) t : null;
        } catch (Throwable t) { return null; }
    }

    /** Merges `patch` into one mod's data and loads it back into the live object; then syncs it if the mod can. */
    public static boolean write(Entity e, String key, CompoundTag patch) {
        INBTSerializable<Tag> w = providers(e).get(key);
        if (w == null || patch == null) return false;
        try {
            Tag t = w.serializeNBT();
            if (!(t instanceof CompoundTag)) return false;
            CompoundTag cur = ((CompoundTag) t).copy();
            cur.merge(patch);
            w.deserializeNBT(cur);
            sync(e, w);
            return true;
        } catch (Throwable t) {
            StoddCore.LOG.debug("[STODD Core] capability write {}: {}", key, t.toString());
            return false;
        }
    }

    /**
     * Sets one number inside a mod's data ("Stats/Agility"), keeping the number's own type (int stays int, double stays double).
     * Returns false when the path does not lead to a number.
     */
    public static boolean setNumber(Entity e, String key, String path, double value) {
        INBTSerializable<Tag> w = providers(e).get(key);
        if (w == null) return false;
        try {
            Tag t = w.serializeNBT();
            if (!(t instanceof CompoundTag)) return false;
            CompoundTag root = ((CompoundTag) t).copy();
            String[] parts = path.split("/");
            CompoundTag cur = root;
            for (int i = 0; i < parts.length - 1; i++) {
                if (!cur.contains(parts[i], Tag.TAG_COMPOUND)) return false;
                cur = cur.getCompound(parts[i]);
            }
            String last = parts[parts.length - 1];
            Tag old = cur.get(last);
            if (!(old instanceof NumericTag)) return false;
            switch (old.getId()) {
                case Tag.TAG_BYTE: cur.putByte(last, (byte) Math.round(value)); break;
                case Tag.TAG_SHORT: cur.putShort(last, (short) Math.round(value)); break;
                case Tag.TAG_INT: cur.putInt(last, (int) Math.round(value)); break;
                case Tag.TAG_LONG: cur.putLong(last, Math.round(value)); break;
                case Tag.TAG_FLOAT: cur.putFloat(last, (float) value); break;
                default: cur.putDouble(last, value);
            }
            w.deserializeNBT(root);
            sync(e, w);
            return true;
        } catch (Throwable t) {
            StoddCore.LOG.debug("[STODD Core] capability number {} {}: {}", key, path, t.toString());
            return false;
        }
    }

    /** Every number in one mod's data, as "path" -> value (for /stodd addons scan and the level links). */
    public static Map<String, Double> numbers(Entity e, String key) {
        Map<String, Double> out = new LinkedHashMap<>();
        CompoundTag t = read(e, key);
        if (t != null) flatten("", t, out, 0);
        return out;
    }

    private static void flatten(String pre, CompoundTag t, Map<String, Double> out, int depth) {
        if (depth > 6 || out.size() > 400) return;
        for (String k : t.getAllKeys()) {
            Tag v = t.get(k);
            String p = pre.isEmpty() ? k : pre + "/" + k;
            if (v instanceof NumericTag) out.put(p, ((NumericTag) v).getAsDouble());
            else if (v instanceof CompoundTag) flatten(p, (CompoundTag) v, out, depth + 1);
        }
    }

    // ------------------------------------------------------------------ MCreator player variables
    /** The MCreator PlayerVariables object behind a provider, or null: a field whose type has syncPlayerVariables(Entity). */
    static Object variablesOf(Object provider) {
        for (Class<?> c = provider.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                if (syncMethod(f.getType()) == null) continue;
                try {
                    f.setAccessible(true);
                    Object v = f.get(provider);
                    if (v != null) return v;
                } catch (Throwable ignored) { }
            }
        }
        return null;
    }

    static Method syncMethod(Class<?> c) {
        try {
            for (Method m : c.getMethods()) {
                if (m.getName().equals("syncPlayerVariables") && m.getParameterCount() == 1 && m.getParameterTypes()[0].isAssignableFrom(Entity.class)) return m;
            }
        } catch (Throwable ignored) { }
        return null;
    }

    static void sync(Entity e, Object provider) {
        Object v = variablesOf(provider);
        if (v == null) return;
        Method m = syncMethod(v.getClass());
        if (m == null) return;
        try { m.invoke(v, e); } catch (Throwable ignored) { }
    }

    /** capability name -> its MCreator variables object, for every MCreator mod on this entity */
    public static Map<String, Object> variables(Entity e) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, INBTSerializable<Tag>> en : providers(e).entrySet()) {
            Object v = variablesOf(en.getValue());
            if (v != null) out.put(en.getKey(), v);
        }
        return out;
    }

    /** The variables object of the MCreator mod whose capability name starts with `modid`, or null. */
    public static Object variables(Entity e, String modid) {
        for (Map.Entry<String, Object> en : variables(e).entrySet()) if (en.getKey().startsWith(modid + ":") || en.getKey().startsWith(modid)) return en.getValue();
        return null;
    }

    /** Reads a public field (a variable) of an MCreator variables object: Number, String, Boolean, or null. */
    public static Object get(Object vars, String name) {
        if (vars == null) return null;
        try {
            Field f = vars.getClass().getField(name);
            return f.get(vars);
        } catch (Throwable t) { return null; }
    }

    /** Sets a variable (converting a number to the field's own type) and syncs it to the player's client. */
    public static boolean set(Entity e, Object vars, String name, Object value) {
        if (vars == null) return false;
        try {
            Field f = vars.getClass().getField(name);
            Class<?> t = f.getType();
            if (value instanceof Number) {
                Number n = (Number) value;
                if (t == double.class || t == Double.class) f.set(vars, n.doubleValue());
                else if (t == float.class || t == Float.class) f.set(vars, n.floatValue());
                else if (t == int.class || t == Integer.class) f.set(vars, n.intValue());
                else if (t == long.class || t == Long.class) f.set(vars, n.longValue());
                else if (t == boolean.class || t == Boolean.class) f.set(vars, n.doubleValue() != 0);
                else if (t == String.class) f.set(vars, String.valueOf(n));
                else return false;
            } else if (value instanceof Boolean && (t == boolean.class || t == Boolean.class)) f.set(vars, value);
            else if (value != null && t == String.class) f.set(vars, String.valueOf(value));
            else return false;
            Method m = syncMethod(vars.getClass());
            if (m != null) m.invoke(vars, e);
            return true;
        } catch (Throwable t) { return false; }
    }

    /** Names and values of an MCreator variables object's simple fields. */
    public static Map<String, Object> fields(Object vars) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (vars == null) return out;
        for (Field f : vars.getClass().getFields()) {
            if (Modifier.isStatic(f.getModifiers())) continue;
            Class<?> t = f.getType();
            if (!(t.isPrimitive() || t == String.class || Number.class.isAssignableFrom(t) || t == Boolean.class)) continue;
            try { out.put(f.getName(), f.get(vars)); } catch (Throwable ignored) { }
        }
        return out;
    }
}
