package stodd.core;

import com.mojang.logging.LogUtils;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import stodd.core.addon.OriginGate;
import stodd.core.mc.LogPose;
import stodd.core.mc.ModCommands;
import stodd.core.mc.StoddRegistry;
import stodd.core.mc.WorldCheck;
import stodd.core.mc.WorldPack;

/**
 * STODD Core: the one mod for the "mods 4 stodd" pack.
 *
 *  - World generation in Java: city islands, dressed islands and the dressing of sky islands are real structures, generated with
 *    the chunks (mc.CityStructure / mc.IsleStructure, placed by mc.CellGridPlacement).
 *  - The island world itself: the world files ship in a built-in data pack placed above every other mod (mc.WorldPack), so no
 *    other mod or leftover jar can replace the Survival Island terrain; mc.WorldCheck says at start-up whether the overworld really
 *    is islands.
 *  - The Log Pose is a real item with its own needle (mc.LogPose).
 *  - An add-on to the power-system mods (stodd.core.addon): the origin rules are enforced on the events True Prime Piece,
 *    Jujutsu Craft, Malum, Project: Edgerunner and Curios really use, and the other mods' player data (stats, cursed technique,
 *    grade, tolerance) is read and written on the live objects (addon.Caps), so the level links and the starter purge are exact.
 *  - Everything else the pack does (origins, levels, powers, waystones, locks ...) is data in this jar plus the KubeJS scripts in
 *    /embedded, which Installer copies into the game folder on start-up, exactly as before.
 */
@Mod(StoddCore.MOD_ID)
public final class StoddCore {
    public static final String MOD_ID = "stodd_core";
    public static final Logger LOG = LogUtils.getLogger();

    public StoddCore(FMLJavaModLoadingContext context) {
        try {
            Installer.run();
        } catch (Throwable t) {
            LOG.error("[STODD Core] could not install the embedded scripts/configs", t);
        }
        IEventBus mod = context.getModEventBus();
        StoddRegistry.register(mod);
        mod.addListener(WorldPack::onAddPackFinders);
        mod.addListener(StoddRegistry::onCreativeTab);
        MinecraftForge.EVENT_BUS.addListener(WorldCheck::onServerStarted);
        MinecraftForge.EVENT_BUS.addListener(ModCommands::onRegisterCommands);
        MinecraftForge.EVENT_BUS.addListener(LogPose::onPlayerTick);
        MinecraftForge.EVENT_BUS.addListener(LogPose::onLoggedIn);
        MinecraftForge.EVENT_BUS.addListener(LogPose::onLoggedOut);
        OriginGate.install();
        LOG.info("[STODD Core] {} loaded: island world pack, world-generated cities / dressed islands / sky-island dressing, Log Pose item", Installer.version());
    }
}
