package stodd.core.mc;

import net.minecraft.client.renderer.ItemBlockRenderTypes;
import net.minecraft.client.renderer.RenderType;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import stodd.core.StoddCore;

/** Client only: the sky fluids are drawn see-through, like water. */
@Mod.EventBusSubscriber(modid = StoddCore.MOD_ID, value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.MOD)
public final class StoddFluidsClient {
    private StoddFluidsClient() { }

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        event.enqueueWork(() -> {
            ItemBlockRenderTypes.setRenderLayer(StoddFluids.CLOUD.get(), RenderType.translucent());
            ItemBlockRenderTypes.setRenderLayer(StoddFluids.CLOUD_FLOWING.get(), RenderType.translucent());
            ItemBlockRenderTypes.setRenderLayer(StoddFluids.STREAM.get(), RenderType.translucent());
            ItemBlockRenderTypes.setRenderLayer(StoddFluids.STREAM_FLOWING.get(), RenderType.translucent());
        });
    }
}
