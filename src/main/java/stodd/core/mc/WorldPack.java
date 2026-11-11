package stodd.core.mc;

import net.minecraft.SharedConstants;
import net.minecraft.network.chat.Component;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.repository.PackSource;
import net.minecraft.world.flag.FeatureFlagSet;
import net.minecraftforge.event.AddPackFindersEvent;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.resource.PathPackResources;
import stodd.core.StoddCore;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The island world as a built-in data pack ("STODD island world", packs/stodd_world inside this jar), required and placed at the
 * TOP of the pack list: above every mod's own data, so the overworld's terrain (noise settings, the Survival Island world preset
 * that is also the default world type, the climate and sky-island functions) can no longer be replaced by another mod, an old
 * STODD jar or whichever mod happens to load last. This is what makes a dedicated server generate islands too.
 * The same files stay in the jar's own data and in kubejs/data as before; they are identical, so nothing changes where those won.
 */
public final class WorldPack {
    private WorldPack() { }

    public static final String ID = "stodd_core/island_world";

    public static void onAddPackFinders(AddPackFindersEvent event) {
        if (event.getPackType() != PackType.SERVER_DATA) return;
        try {
            Path root = ModList.get().getModFileById(StoddCore.MOD_ID).getFile().findResource("packs/stodd_world");
            if (root == null || !Files.isDirectory(root)) {
                StoddCore.LOG.error("[STODD Core] packs/stodd_world is missing from the jar: the island world cannot be guaranteed");
                return;
            }
            PathPackResources res = new PathPackResources(ModList.get().getModFileById(StoddCore.MOD_ID).getFile().getFileName() + ":" + root, true, root);
            int format = SharedConstants.getCurrentVersion().getPackVersion(PackType.SERVER_DATA);
            Pack.Info info = new Pack.Info(Component.literal("Survival Island terrain, STODD climate and sky islands"), format, format, FeatureFlagSet.of(), res.isHidden());
            Pack pack = Pack.create(ID, Component.literal("STODD island world"), true, name -> res, info, PackType.SERVER_DATA, Pack.Position.TOP, false, PackSource.BUILT_IN);
            event.addRepositorySource(consumer -> consumer.accept(pack));
        } catch (Throwable t) {
            StoddCore.LOG.error("[STODD Core] could not add the island world pack", t);
        }
    }
}
