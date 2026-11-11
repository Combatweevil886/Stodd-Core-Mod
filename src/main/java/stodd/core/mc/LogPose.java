package stodd.core.mc;

import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import stodd.core.gen.LogPoseBrain;
import stodd.core.gen.WorldRules;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The server half of the Log Pose: once a second, for every player who carries one in the overworld, LogPoseBrain works out the
 * target in the player's mode and the result is written into each Log Pose they carry (the needle reads it), plus the action bar
 * while one is held and the messages when an island is recorded or reached.
 *
 * Saved per player (in the part of the player data that survives death): the mode, the recorded islands, "was given one".
 * Older Log Poses (the vanilla compass with STODD's NBT from 1.x / 2.x) are swapped for this item automatically.
 */
public final class LogPose {
    private LogPose() { }

    static final String KEY = "stodd_logpose";
    private static final Map<UUID, LogPoseBrain.State> STATES = new HashMap<>();
    private static final Map<UUID, Long> LAST_CYCLE = new HashMap<>();

    // ------------------------------------------------------------------ saved data
    static CompoundTag data(Player p) {
        CompoundTag root = p.getPersistentData();
        CompoundTag keep = root.getCompound(Player.PERSISTED_NBT_TAG);
        CompoundTag d = keep.getCompound(KEY);
        keep.put(KEY, d);
        root.put(Player.PERSISTED_NBT_TAG, keep);
        return d;
    }

    static List<String> seen(CompoundTag d) {
        List<String> out = new ArrayList<>();
        ListTag l = d.getList("Seen", Tag.TAG_STRING);
        for (int i = 0; i < l.size(); i++) out.add(l.getString(i));
        return out;
    }

    static void saveSeen(CompoundTag d, List<String> seen) {
        ListTag l = new ListTag();
        for (String s : seen) l.add(StringTag.valueOf(s));
        d.put("Seen", l);
    }

    public static ItemStack newStack() { return new ItemStack(StoddRegistry.LOG_POSE.get()); }

    static boolean isPose(ItemStack s) { return !s.isEmpty() && s.is(StoddRegistry.LOG_POSE.get()); }

    /** the Log Pose of STODD 1.x / 2.x: a compass carrying stodd_logpose:1b */
    static boolean isOldPose(ItemStack s) { return !s.isEmpty() && s.is(Items.COMPASS) && s.getTag() != null && s.getTag().getBoolean("stodd_logpose"); }

    static List<ItemStack> poses(Player p) {
        List<ItemStack> out = new ArrayList<>();
        Inventory inv = p.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (isPose(s)) out.add(s);
        }
        return out;
    }

    /** Swaps old compass Log Poses for the item; returns how many. */
    static int upgradeOld(Player p) {
        int n = 0;
        Inventory inv = p.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            if (isOldPose(inv.getItem(i))) { inv.setItem(i, newStack()); n++; }
        }
        return n;
    }

    public static boolean give(ServerPlayer p) {
        ItemStack s = newStack();
        if (!p.getInventory().add(s)) p.drop(s, false);
        return true;
    }

    // ------------------------------------------------------------------ events
    public static void onLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer)) return;
        ServerPlayer p = (ServerPlayer) event.getEntity();
        WorldRules rules = WorldRules.get();
        upgradeOld(p);
        CompoundTag d = data(p);
        if (rules.lpGive && !d.getBoolean("Given")) {
            d.putBoolean("Given", true);
            // a player who already got the old compass one from the scripts has had it swapped above
            if (poses(p).isEmpty()) give(p);
            p.sendSystemMessage(Component.literal("[Log Pose] ").withStyle(ChatFormatting.GOLD).append(Component.literal(
                "You have a Log Pose. Hold it: the needle points at an island, the bar above your hotbar names it and gives the distance.").withStyle(ChatFormatting.WHITE)));
            p.sendSystemMessage(Component.literal("[Log Pose] ").withStyle(ChatFormatting.GOLD).append(Component.literal(
                "Right-click it to switch between next island / nearest island / nearest city / sky island. Walk to an island's middle to record it.").withStyle(ChatFormatting.WHITE)));
        }
    }

    public static void onLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        STATES.remove(event.getEntity().getUUID());
        LAST_CYCLE.remove(event.getEntity().getUUID());
    }

    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END || !(event.player instanceof ServerPlayer)) return;
        ServerPlayer p = (ServerPlayer) event.player;
        if (p.tickCount % 20 != 11) return;
        try {
            if (p.tickCount % 100 == 11) upgradeOld(p);
            tick(p);
        } catch (Throwable t) {
            stodd.core.StoddCore.LOG.debug("[STODD Core] log pose: {}", t.toString());
        }
    }

    // ------------------------------------------------------------------ the second
    static void tick(ServerPlayer p) {
        List<ItemStack> poses = poses(p);
        if (poses.isEmpty()) return;
        if (!(p.level() instanceof ServerLevel)) return;
        ServerLevel level = (ServerLevel) p.level();
        if (!Level.OVERWORLD.equals(level.dimension())) {
            for (ItemStack s : poses) write(s, false, 0, 0, "", modeName(p));
            if (holding(p)) p.displayClientMessage(Component.literal("Log Pose ").withStyle(ChatFormatting.GOLD)
                .append(Component.literal("the needle only works in the overworld").withStyle(ChatFormatting.GRAY)), true);
            return;
        }
        WorldRules rules = WorldRules.get();
        Worlds.Tools tools = Worlds.of(level);
        LogPoseBrain brain = new LogPoseBrain(rules, tools.index, Worlds.seed(level), 4);
        LogPoseBrain.State st = STATES.computeIfAbsent(p.getUUID(), k -> new LogPoseBrain.State());
        CompoundTag d = data(p);
        List<String> seen = seen(d);
        int before = seen.size();
        LogPoseBrain.Out o = brain.tick(st, p.getX(), p.getY(), p.getZ(), level.getGameTime(), d.getInt("Mode"), seen);
        if (seen.size() != before || o.recorded != null) saveSeen(d, seen);
        String label = o.hasTarget ? o.target.name + " (" + o.target.kind + ")" : "";
        for (ItemStack s : poses) write(s, o.hasTarget, o.tx, o.tz, label, o.modeName);
        if (o.recorded != null) {
            p.sendSystemMessage(Component.literal("[Log Pose] ").withStyle(ChatFormatting.GOLD).append(Component.literal("Recorded ").withStyle(ChatFormatting.WHITE))
                .append(Component.literal(o.recorded.name).withStyle(ChatFormatting.YELLOW)).append(Component.literal(" (" + o.recorded.kind + ").").withStyle(ChatFormatting.GRAY)));
            p.connection.send(new ClientboundSetTitlesAnimationPacket(8, 50, 14));
            p.connection.send(new ClientboundSetSubtitleTextPacket(Component.literal("Island recorded").withStyle(ChatFormatting.GRAY)));
            p.connection.send(new ClientboundSetTitleTextPacket(Component.literal(o.recorded.name).withStyle(color(o.recorded.color))));
            p.playNotifySound(SoundEvents.AMETHYST_BLOCK_RESONATE, SoundSource.PLAYERS, 1f, 1.3f);
        }
        if (o.arrived != null) {
            p.sendSystemMessage(Component.literal("[Log Pose] ").withStyle(ChatFormatting.GOLD).append(Component.literal("You have arrived at ").withStyle(ChatFormatting.WHITE))
                .append(Component.literal(o.arrived.name).withStyle(ChatFormatting.YELLOW)).append(Component.literal(".").withStyle(ChatFormatting.WHITE)));
        }
        if (!holding(p)) return;
        MutableComponent bar;
        if (!o.hasTarget) {
            int far = rules.lpRadii.get(rules.lpRadii.size() - 1);
            String msg = o.pending ? "searching for islands..." : ("nothing of that kind within " + far + " blocks");
            bar = Component.literal("Log Pose ").withStyle(ChatFormatting.GOLD).append(Component.literal(msg).withStyle(ChatFormatting.GRAY));
        } else {
            bar = Component.literal(LogPoseBrain.arrow(p.getX(), p.getZ(), p.getYRot(), o.tx, o.tz) + " ").withStyle(ChatFormatting.GOLD)
                .append(Component.literal(o.target.name).withStyle(color(o.target.color)))
                .append(Component.literal(" (" + o.target.kind + ")").withStyle(ChatFormatting.GRAY))
                .append(Component.literal("  " + Math.round(o.dist) + " blocks").withStyle(ChatFormatting.WHITE));
            if (o.dwellLeft >= 0)
                bar.append(Component.literal("   recording " + LogPoseBrain.bar(o.dwellTotal - o.dwellLeft, o.dwellTotal) + " " + (int) Math.ceil(o.dwellLeft / 20.0) + " s").withStyle(ChatFormatting.AQUA));
            else if (o.hereRecorded) bar.append(Component.literal("   recorded").withStyle(ChatFormatting.GREEN));
        }
        bar.append(Component.literal("   [" + o.modeName + "]").withStyle(ChatFormatting.DARK_GRAY));
        p.displayClientMessage(bar, true);
    }

    static boolean holding(Player p) { return isPose(p.getMainHandItem()) || isPose(p.getOffhandItem()); }

    static ChatFormatting color(String name) {
        ChatFormatting f = ChatFormatting.getByName(name);
        return f == null || !f.isColor() ? ChatFormatting.YELLOW : f;
    }

    /** writes the target into a stack only when something changed, so the inventory is not re-sent every second */
    static void write(ItemStack s, boolean ok, int x, int z, String name, String mode) {
        CompoundTag t = s.getOrCreateTag();
        if (t.getBoolean("LpOk") == ok && t.getInt("LpX") == x && t.getInt("LpZ") == z && t.getString("LpName").equals(name) && t.getString("LpMode").equals(mode)) return;
        t.putBoolean("LpOk", ok);
        t.putInt("LpX", x);
        t.putInt("LpZ", z);
        t.putString("LpName", name);
        t.putString("LpMode", mode);
    }

    static String modeName(Player p) {
        List<WorldRules.Mode> modes = WorldRules.get().lpModes;
        int i = data(p).getInt("Mode");
        return modes.get(i >= 0 && i < modes.size() ? i : 0).name;
    }

    // ------------------------------------------------------------------ modes
    public static void cycle(ServerPlayer p, boolean back) {
        long now = p.level().getGameTime();
        Long last = LAST_CYCLE.get(p.getUUID());
        if (last != null && now - last < 4) return;
        LAST_CYCLE.put(p.getUUID(), now);
        List<WorldRules.Mode> modes = WorldRules.get().lpModes;
        CompoundTag d = data(p);
        int i = d.getInt("Mode") + (back ? -1 : 1);
        i = ((i % modes.size()) + modes.size()) % modes.size();
        setMode(p, i);
    }

    public static boolean setMode(ServerPlayer p, String id) {
        List<WorldRules.Mode> modes = WorldRules.get().lpModes;
        for (int i = 0; i < modes.size(); i++) if (modes.get(i).id.equalsIgnoreCase(id)) { setMode(p, i); return true; }
        return false;
    }

    static void setMode(ServerPlayer p, int i) {
        List<WorldRules.Mode> modes = WorldRules.get().lpModes;
        data(p).putInt("Mode", i);
        LogPoseBrain.State st = STATES.get(p.getUUID());
        if (st != null) STATES.remove(p.getUUID());
        p.displayClientMessage(Component.literal("Log Pose: " + modes.get(i).name).withStyle(ChatFormatting.GOLD), true);
        p.playNotifySound(SoundEvents.EXPERIENCE_ORB_PICKUP, SoundSource.PLAYERS, 0.6f, 0.8f + 0.2f * i);
        for (ItemStack s : poses(p)) write(s, false, 0, 0, "", modes.get(i).name);
        try { tick(p); } catch (Throwable ignored) { }
    }

    public static void reset(ServerPlayer p) {
        saveSeen(data(p), new ArrayList<>());
        STATES.remove(p.getUUID());
    }

    public static String describe(ServerPlayer p) {
        List<WorldRules.Mode> modes = WorldRules.get().lpModes;
        StringBuilder b = new StringBuilder();
        for (WorldRules.Mode m : modes) b.append(b.length() == 0 ? "" : ", ").append(m.id);
        return "Mode: " + modeName(p) + ". Recorded islands: " + seen(data(p)).size() + ". Modes: " + b;
    }
}
