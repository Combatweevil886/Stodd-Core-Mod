package stodd.core.mc;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.RegisterCommandsEvent;
import stodd.core.addon.Caps;
import stodd.core.addon.OriginGate;
import stodd.core.addon.PowerMods;
import stodd.core.gen.CityPlanner;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslePlanner;
import stodd.core.gen.WorldRules;

/**
 * Commands from the Java side, merged into the scripts' /stodd tree:
 *   /stodd logpose                    a new Log Pose if you have none
 *   /stodd logpose mode [next|nearest|city|sky]
 *   /stodd logpose reset              forget every recorded island
 *   /stodd core world                 (operators) is this world really islands? which pack provides the terrain?
 *   /stodd core island                the island you stand on: centre, theme, and what the generator made of it
 *   /stodd addons                     the power-system mods STODD Core is an add-on to, found or not, and what it does with each
 *   /stodd addons scan [player]       (operators) every piece of mod data on a player: capability names, their numbers, and
 *                                     MCreator variables - what the level links and the purge can use
 *   /stodd config ...                 the settings in config/stodd/*.toml (see ConfigCommands)
 */
public final class ModCommands {
    private ModCommands() { }

    public static void onRegisterCommands(RegisterCommandsEvent event) {
        register(event.getDispatcher());
    }

    static void ok(CommandSourceStack s, String msg) {
        s.sendSuccess(() -> Component.literal("[STODD] ").withStyle(ChatFormatting.GOLD).append(Component.literal(msg).withStyle(ChatFormatting.WHITE)), false);
    }

    static void register(CommandDispatcher<CommandSourceStack> d) {
        d.register(Commands.literal("stodd")
            .then(Commands.literal("logpose")
                .executes(c -> {
                    ServerPlayer p = c.getSource().getPlayerOrException();
                    if (!LogPose.poses(p).isEmpty()) { ok(c.getSource(), "You already carry a Log Pose."); return 0; }
                    LogPose.give(p);
                    ok(c.getSource(), "Here is a new Log Pose.");
                    return 1;
                })
                .then(Commands.literal("mode")
                    .executes(c -> { ok(c.getSource(), LogPose.describe(c.getSource().getPlayerOrException())); return 1; })
                    .then(Commands.argument("mode", StringArgumentType.word())
                        .suggests((c, b) -> { for (WorldRules.Mode m : WorldRules.get().lpModes) b.suggest(m.id); return b.buildFuture(); })
                        .executes(c -> {
                            String id = StringArgumentType.getString(c, "mode");
                            if (!LogPose.setMode(c.getSource().getPlayerOrException(), id)) { ok(c.getSource(), "No such mode: " + id); return 0; }
                            return 1;
                        })))
                .then(Commands.literal("reset").executes(c -> {
                    LogPose.reset(c.getSource().getPlayerOrException());
                    ok(c.getSource(), "Your Log Pose forgot every recorded island.");
                    return 1;
                })))
            .then(Commands.literal("addons")
                .executes(c -> { addons(c.getSource()); return 1; })
                .then(Commands.literal("scan").requires(s -> s.hasPermission(2))
                    .executes(c -> { scan(c.getSource(), c.getSource().getPlayerOrException()); return 1; })
                    .then(Commands.argument("player", EntityArgument.player())
                        .executes(c -> { scan(c.getSource(), EntityArgument.getPlayer(c, "player")); return 1; }))))
            .then(ConfigCommands.tree())
            .then(Commands.literal("core")
                .then(Commands.literal("world").requires(s -> s.hasPermission(2)).executes(c -> {
                    for (WorldCheck.Line l : WorldCheck.report(c.getSource().getServer())) {
                        ChatFormatting f = l.kind == 'o' ? ChatFormatting.GREEN : l.kind == 'b' ? ChatFormatting.RED : l.kind == 'w' ? ChatFormatting.YELLOW : ChatFormatting.GRAY;
                        c.getSource().sendSuccess(() -> Component.literal(l.text).withStyle(f), false);
                    }
                    return 1;
                }))
                .then(Commands.literal("island").executes(c -> {
                    ok(c.getSource(), islandReport(c.getSource().getLevel(), c.getSource().getPosition()));
                    return 1;
                }))));
    }

    static void line(CommandSourceStack s, String text, ChatFormatting f) {
        s.sendSuccess(() -> Component.literal(text).withStyle(f), false);
    }

    static void addons(CommandSourceStack s) {
        line(s, "STODD Core is an add-on to:", ChatFormatting.GOLD);
        for (PowerMods.Entry e : PowerMods.all()) {
            line(s, (e.present() ? "  [found] " : "  [missing] ") + e.title + (e.present() ? " (" + String.join(", ", e.found) + ")" : ""), e.present() ? ChatFormatting.GREEN : ChatFormatting.GRAY);
            line(s, "      " + e.role, ChatFormatting.DARK_GRAY);
        }
        WorldRules r = WorldRules.get();
        line(s, "Devil Fruit namespaces: " + r.origins.fruitNamespaces() + ", dark magic namespaces: " + r.origins.magicNamespaces(), ChatFormatting.GRAY);
        try {
            ServerPlayer p = s.getPlayerOrException();
            String o = OriginGate.originOf(p);
            line(s, "Your origin: " + (o == null ? "none chosen yet" : r.origins.nameOf(o)) + ", level " + OriginGate.levelOf(p)
                + (OriginGate.data(p).getString("path").isEmpty() ? "" : ", path: " + OriginGate.data(p).getString("path")), ChatFormatting.YELLOW);
            if (o != null) {
                StringBuilder b = new StringBuilder("  ");
                for (String sys : stodd.core.gen.OriginRules.SYSTEMS) {
                    Object v = r.origins.rule(o, sys);
                    String name = r.origins.systemNames.containsKey(sys) ? r.origins.systemNames.get(sys) : sys;
                    b.append(name).append(": ").append(Boolean.TRUE.equals(v) ? "yes" : "path".equals(v) ? "one path" : "no").append("   ");
                }
                line(s, b.toString(), ChatFormatting.GRAY);
            }
        } catch (Exception ignored) { }
    }

    static void scan(CommandSourceStack s, ServerPlayer p) {
        line(s, "Mod data on " + p.getGameProfile().getName() + ":", ChatFormatting.GOLD);
        java.util.Map<String, Object> vars = Caps.variables(p);
        for (String key : Caps.keys(p)) {
            java.util.Map<String, Double> nums = Caps.numbers(p, key);
            line(s, "  " + key + (vars.containsKey(key) ? "  [MCreator variables]" : "") + "  (" + nums.size() + " numbers)", ChatFormatting.YELLOW);
            int n = 0;
            StringBuilder b = new StringBuilder();
            for (java.util.Map.Entry<String, Double> e : nums.entrySet()) {
                if (n++ >= 40) { b.append(" ..."); break; }
                double v = e.getValue();
                b.append(e.getKey()).append('=').append(v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(Math.round(v * 1000) / 1000.0)).append("  ");
                if (b.length() > 220) { line(s, "    " + b, ChatFormatting.GRAY); b.setLength(0); }
            }
            if (b.length() > 0) line(s, "    " + b, ChatFormatting.GRAY);
        }
        stodd.core.StoddCore.LOG.info("[STODD Core] addon scan of {}: {}", p.getGameProfile().getName(), Caps.keys(p));
    }

    public static String islandReport(ServerLevel level, Vec3 pos) {
        Worlds.Tools t = Worlds.of(level);
        int seed = Worlds.seed(level);
        int x = (int) Math.floor(pos.x), z = (int) Math.floor(pos.z);
        if (t.sky != null && t.sky.isLand(x, z)) {
            IslandFinder.Island s = t.sky.islandAt(x, z);
            if (s != null && (pos.y >= t.skyMinY || !t.ground.isLand(x, z))) {
                IslePlanner.Plan p = t.isles.sky(t.sky, s, seed, t.skyMinRadius);
                String lvl = t.skyField == null ? "" : ", coast at y " + (int) t.skyField.levelOf(s);
                return "Sky island " + t.rules.skyName(s.cx, s.cz, seed) + " (a lifted island), centre " + s.cx + ", " + s.cz + ", about " + (2 * s.radius) + " blocks across" + lvl
                    + (p == null ? "" : ", " + p.cells.size() + " cells, " + p.landmarks() + " landmarks" + (p.skyStyle == null ? "" : " (" + p.skyStyle.name + ")")) + ".";
            }
        }
        if (t.skyField != null) {
            stodd.core.gen.SkyField.Dome d = t.skyField.domeAt(x, z);
            if (d != null) {
                String where = pos.y > d.base + d.up + 1 ? "below you" : pos.y < d.base - d.down ? "above you" : "around you";
                return "Sunken island " + t.rules.deepName(d.island.cx, d.island.cz, seed) + ", under a bubble dome " + where
                    + ": centre " + d.island.cx + ", " + d.island.cz + ", dome " + (int) (2 * d.r) + " blocks across, its coast and inner sea at y " + (int) d.base + ", top at y " + (int) (d.base + d.up) + ".";
            }
        }
        IslandFinder.Island isl = t.ground.islandAt(x, z);
        if (isl == null) return t.sky != null && t.sky.isLand(x, z) ? "Open sea, under a sky island (look up)." : "Open sea.";
        WorldRules.Theme th = t.rules.themeAt(isl.cx, isl.cz, seed);
        StringBuilder b = new StringBuilder(t.rules.groundName(th, isl.cx, isl.cz, seed) + " (" + th.name + "), centre " + isl.cx + ", " + isl.cz);
        if (t.rules.cityStyleAt(isl.cx, isl.cz, seed) != null) {
            CityPlanner.Plan p = t.cities.plan(t.ground, isl, (a, c) -> level.getChunkSource().getGenerator().getBaseHeight(a, c,
                net.minecraft.world.level.levelgen.Heightmap.Types.OCEAN_FLOOR_WG, level, level.getChunkSource().randomState()), seed);
            if (p != null) {
                b.append(": a city of ").append(p.cells.size()).append(" blocks at street level y=").append(p.street);
                CityPlanner.Cell c = p.cellAt(Math.floorDiv(x, t.rules.cell) * t.rules.cell, Math.floorDiv(z, t.rules.cell) * t.rules.cell);
                if (c != null) b.append("; you stand on ").append(c.plaza ? "the plaza " : "").append(c.template);
            }
        } else {
            IslePlanner.Plan p = t.isles.ground(t.ground, isl, seed);
            if (p != null) b.append(": dressed as ").append(p.theme).append(", ").append(p.cells.size()).append(" cells, ").append(p.landmarks()).append(" landmarks");
        }
        b.append(". Generated with the chunks (new chunks only).");
        return b.toString();
    }
}
