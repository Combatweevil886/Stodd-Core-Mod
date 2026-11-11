package stodd.core.addon;

import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.npc.VillagerDataHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingEntityUseItemEvent;
import net.minecraftforge.event.entity.player.AttackEntityEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.entity.player.PlayerInteractEvent;
import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.EventPriority;
import stodd.core.StoddCore;
import stodd.core.gen.OriginRules;
import stodd.core.gen.WorldRules;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The origin rules, enforced in Java on the events the power mods actually use: eating / using an item, right-clicking an item,
 * a block (Malum's altars, the Ripperdoc) or an NPC (ripperdocs), hitting with a magic weapon, equipping a curio. One decision
 * (OriginRules.verdict, the same table as 00_config.js rules) for every route, the first allowed use of a 'path' system closes the
 * other paths, and creative players are never stopped.
 *
 * Also keeps each origin's numbers in step with the level: the Curios slots of origins whose slots grow (the Weakling) and the
 * Edgerunner cyberware tolerance, through the mods' own commands, marked in the same player data the scripts use so the two never
 * repeat each other.
 *
 * This is the third layer under the data powers (Apoli prevent_item_use, which stop most uses before any event) and the scripts;
 * while it runs, the scripts' own gate stands down (StoddApi.gateActive) so a player is told once.
 */
public final class OriginGate {
    private OriginGate() { }

    private static final Map<UUID, Long> LAST_DENY = new HashMap<>();
    private static boolean curiosHooked;

    public static void install() {
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onRightClickItem);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onRightClickBlock);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onEntityInteract);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onEntityInteractSpecific);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onUseStart);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onUseTick);
        MinecraftForge.EVENT_BUS.addListener(OriginGate::onUseFinish);
        MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, OriginGate::onAttack);
        MinecraftForge.EVENT_BUS.addListener(OriginGate::onTick);
        MinecraftForge.EVENT_BUS.addListener(OriginGate::onLogin);
        MinecraftForge.EVENT_BUS.addListener(OriginGate::onRespawn);
        hookCurios();
    }

    // ------------------------------------------------------------------ the player's origin and saved data
    /** The scripts' per-player data: persistent data "stodd" (level 'lvl', chosen path 'path', markers). */
    public static CompoundTag data(Player p) {
        CompoundTag pd = p.getPersistentData();
        if (!pd.contains("stodd")) pd.put("stodd", new CompoundTag());
        return pd.getCompound("stodd");
    }

    /** The origin, published by the Origins power stodd:<origin>/marker as the entity tag stodd_o_<origin>; null before choosing. */
    public static String originOf(Entity p) {
        OriginRules r = WorldRules.get().origins;
        for (String o : r.origins) if (p.getTags().contains("stodd_o_" + o)) return o;
        return null;
    }

    public static int levelOf(Player p) { int l = data(p).getInt("lvl"); return l < 1 ? 1 : l; }

    // ------------------------------------------------------------------ what a stack / block is
    static List<String> tagsOf(ItemStack s) {
        List<String> out = new ArrayList<>();
        s.getTags().forEach(t -> out.add(t.location().toString()));
        return out;
    }

    public static String systemOf(ItemStack s) {
        if (s == null || s.isEmpty()) return null;
        ResourceLocation id = BuiltInRegistries.ITEM.getKey(s.getItem());
        return WorldRules.get().origins.systemOfItem(id.toString(), s.getHoverName().getString(), tagsOf(s));
    }

    static String systemOf(BlockState b) {
        List<String> tags = new ArrayList<>();
        b.getTags().forEach(t -> tags.add(t.location().toString()));
        return WorldRules.get().origins.systemOfBlock(BuiltInRegistries.BLOCK.getKey(b.getBlock()).toString(), tags);
    }

    // ------------------------------------------------------------------ the decision
    /** true = blocked (the player is told why). `lock` closes the other paths when the use is allowed. */
    public static boolean blocked(Player p, String system, boolean lock) {
        if (system == null || p == null || p.isCreative() || p.isSpectator()) return false;
        if (p.level().isClientSide) return false;
        OriginRules r = WorldRules.get().origins;
        String origin = originOf(p);
        String path = data(p).getString("path");
        OriginRules.Verdict v = r.verdict(origin, path, system);
        if (v == OriginRules.Verdict.DENY || v == OriginRules.Verdict.NO_ORIGIN) {
            if (origin == null && !PowerMods.of("origins").present()) return false;   // no Origins mod: there are no origins to enforce
            tell(p, r.denyText(origin, system));
            return true;
        }
        if (v == OriginRules.Verdict.ALLOW_AND_LOCK && lock) lockPath(p, origin, system);
        return false;
    }

    static void tell(Player p, String msg) {
        long now = System.currentTimeMillis();
        Long last = LAST_DENY.get(p.getUUID());
        if (last != null && now - last < 500) return;
        LAST_DENY.put(p.getUUID(), now);
        p.displayClientMessage(Component.literal(msg).withStyle(ChatFormatting.RED), true);
        if (p instanceof ServerPlayer) ((ServerPlayer) p).playNotifySound(SoundEvents.VILLAGER_NO, SoundSource.PLAYERS, 1f, 0.9f);
    }

    public static void lockPath(Player p, String origin, String system) {
        CompoundTag d = data(p);
        if (!d.getString("path").isEmpty()) return;
        d.putString("path", system);
        OriginRules r = WorldRules.get().origins;
        String sys = r.systemNames.containsKey(system) ? r.systemNames.get(system) : system;
        p.sendSystemMessage(Component.literal("[" + r.nameOf(origin) + "] ").withStyle(ChatFormatting.YELLOW)
            .append(Component.literal("You have walked the path of the ").withStyle(ChatFormatting.WHITE))
            .append(Component.literal(sys).withStyle(ChatFormatting.GOLD))
            .append(Component.literal(". The other paths are now closed to you.").withStyle(ChatFormatting.WHITE)));
        if (p instanceof ServerPlayer) ((ServerPlayer) p).playNotifySound(SoundEvents.ANVIL_USE, SoundSource.PLAYERS, 1f, 0.6f);
    }

    // ------------------------------------------------------------------ events
    static void onRightClickItem(PlayerInteractEvent.RightClickItem e) {
        if (blocked(e.getEntity(), systemOf(e.getItemStack()), true)) { e.setCanceled(true); e.setCancellationResult(InteractionResult.FAIL); }
    }

    static void onRightClickBlock(PlayerInteractEvent.RightClickBlock e) {
        Player p = e.getEntity();
        String bs = systemOf(e.getLevel().getBlockState(e.getPos()));
        if (bs != null && blocked(p, bs, false)) { e.setCanceled(true); e.setCancellationResult(InteractionResult.FAIL); return; }
        if (blocked(p, systemOf(e.getItemStack()), false)) { e.setCanceled(true); e.setCancellationResult(InteractionResult.FAIL); }
    }

    static boolean ripperdoc(Entity t) {
        String id = BuiltInRegistries.ENTITY_TYPE.getKey(t.getType()).toString();
        String prof = "";
        if (t instanceof VillagerDataHolder) {
            try { prof = String.valueOf(BuiltInRegistries.VILLAGER_PROFESSION.getKey(((VillagerDataHolder) t).getVillagerData().getProfession())); } catch (Throwable ignored) { }
        }
        return WorldRules.get().origins.ripperdocEntity(id, prof);
    }

    static void onEntityInteract(PlayerInteractEvent.EntityInteract e) {
        if (ripperdoc(e.getTarget()) && blocked(e.getEntity(), OriginRules.CYBER, false)) { e.setCanceled(true); e.setCancellationResult(InteractionResult.FAIL); }
    }

    static void onEntityInteractSpecific(PlayerInteractEvent.EntityInteractSpecific e) {
        if (ripperdoc(e.getTarget()) && blocked(e.getEntity(), OriginRules.CYBER, false)) { e.setCanceled(true); e.setCancellationResult(InteractionResult.FAIL); }
    }

    static void onUseStart(LivingEntityUseItemEvent.Start e) {
        if (e.getEntity() instanceof Player && blocked((Player) e.getEntity(), systemOf(e.getItem()), false)) e.setCanceled(true);
    }

    static void onUseTick(LivingEntityUseItemEvent.Tick e) {
        if (e.getEntity() instanceof Player && blocked((Player) e.getEntity(), systemOf(e.getItem()), false)) e.setCanceled(true);
    }

    static void onUseFinish(LivingEntityUseItemEvent.Finish e) {
        if (!(e.getEntity() instanceof Player)) return;
        Player p = (Player) e.getEntity();
        String sys = systemOf(e.getItem());
        if (sys == null || p.level().isClientSide) return;
        String origin = originOf(p);
        if (origin != null && WorldRules.get().origins.verdict(origin, data(p).getString("path"), sys) == OriginRules.Verdict.ALLOW_AND_LOCK) lockPath(p, origin, sys);
    }

    static void onAttack(AttackEntityEvent e) {
        Player p = e.getEntity();
        String sys = systemOf(p.getMainHandItem());
        // only weapons that are themselves dark magic; other systems' items are not weapons
        if (OriginRules.MAGIC.equals(sys) && blocked(p, sys, false)) e.setCanceled(true);
    }

    /** Curios' CurioEquipEvent (a Forge event with a result), hooked by name so Curios is not needed to build this mod. */
    @SuppressWarnings({ "unchecked", "rawtypes" })
    static void hookCurios() {
        if (curiosHooked) return;
        try {
            Class<?> c = Class.forName("top.theillusivec4.curios.api.event.CurioEquipEvent");
            if (!Event.class.isAssignableFrom(c)) return;
            final Method getStack = c.getMethod("getStack");
            Class ev = c;
            MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGH, false, ev, (java.util.function.Consumer) o -> {
                try {
                    Event event = (Event) o;
                    Entity ent = (Entity) o.getClass().getMethod("getEntity").invoke(o);
                    if (!(ent instanceof Player)) return;
                    ItemStack s = (ItemStack) getStack.invoke(o);
                    if (blocked((Player) ent, systemOf(s), false)) event.setResult(Event.Result.DENY);
                } catch (Throwable ignored) { }
            });
            curiosHooked = true;
        } catch (ClassNotFoundException e) {
            // Curios is not installed
        } catch (Throwable t) {
            StoddCore.LOG.warn("[STODD Core] Curios equip gate not installed: {}", t.toString());
        }
    }

    // ------------------------------------------------------------------ keeping the numbers in step
    static void onTick(TickEvent.PlayerTickEvent e) {
        if (e.phase != TickEvent.Phase.END || !(e.player instanceof ServerPlayer)) return;
        if (e.player.tickCount % 200 != 37) return;
        apply((ServerPlayer) e.player, false);
    }

    static void onLogin(PlayerEvent.PlayerLoggedInEvent e) {
        if (e.getEntity() instanceof ServerPlayer) apply((ServerPlayer) e.getEntity(), true);
    }

    static void onRespawn(PlayerEvent.PlayerRespawnEvent e) {
        if (e.getEntity() instanceof ServerPlayer) apply((ServerPlayer) e.getEntity(), true);
    }

    /** Slots of a growing origin and the cyberware tolerance, sent only when they changed (or `force`). */
    public static void apply(ServerPlayer p, boolean force) {
        try {
            String origin = originOf(p);
            if (origin == null) return;
            OriginRules r = WorldRules.get().origins;
            CompoundTag d = data(p);
            int level = levelOf(p);
            MinecraftServer server = p.getServer();
            if (server == null) return;
            if (PowerMods.of("curios").present()) {
                int row = r.slotRow(origin, level);
                if (row >= 0 && (force || !d.contains("slotRow") || d.getInt("slotRow") != row)) {
                    d.putInt("slotRow", row);
                    Map<String, Integer> m = r.slotsAt(origin, level);
                    for (String id : r.slotIds) if (m.containsKey(id)) run(server, "curios set " + id + " " + p.getGameProfile().getName() + " " + m.get(id));
                }
            }
            if (PowerMods.of("edgerunner").present()) {
                int cap = r.cyberCapacityAt(origin, level);
                if (cap >= 0 && (force || !d.contains("cyberCap") || d.getInt("cyberCap") != cap)) {
                    d.putInt("cyberCap", cap);
                    for (String c : r.cyberCommands) run(server, c.replace("{p}", p.getGameProfile().getName()).replace("{v}", String.valueOf(cap)));
                }
            }
        } catch (Throwable t) {
            StoddCore.LOG.debug("[STODD Core] origin apply: {}", t.toString());
        }
    }

    static void run(MinecraftServer server, String cmd) {
        try { server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), cmd); } catch (Throwable ignored) { }
    }
}
