package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraftforge.client.extensions.common.IClientFluidTypeExtensions;
import net.minecraftforge.fluids.FluidType;
import net.minecraftforge.fluids.ForgeFlowingFluid;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import stodd.core.StoddCore;

import java.util.function.Consumer;

/**
 * The two sky fluids:
 *   dense_cloud  the cloud sea round sky islands. Boats float on it (a fluid that supports boating), Valkyrien Skies / Eureka ships
 *                too (it is a liquid to their physics, three times as dense as water: data/stodd_core/vs_mass); you swim in it,
 *                cannot drown in it, and a fall into it does no damage; a Devil Fruit User sinks in it (CloudBlock). Its own
 *                fluffy cloud texture, slowly drifting.
 *   sky_stream   a knock up stream: a column that lifts whatever is in it. Ships float up through it (it is eight times as dense as
 *                water to their physics), players, mobs, boats and items are carried up (SkyStreamBlock).
 * Neither ever flows: a cloud sea hangs in the sky and a stream stands in the sea, so they never pour out, and nothing else's
 * flow can wash them away.
 */
public final class StoddFluids {
    private StoddFluids() { }

    public static final DeferredRegister<FluidType> FLUID_TYPES = DeferredRegister.create(ForgeRegistries.Keys.FLUID_TYPES, StoddCore.MOD_ID);
    public static final DeferredRegister<Fluid> FLUIDS = DeferredRegister.create(ForgeRegistries.FLUIDS, StoddCore.MOD_ID);

    /** what a sky fluid looks like: its textures (still, flowing, the side seen through glass), tinted */
    static final class Look implements IClientFluidTypeExtensions {
        final int tint;
        final ResourceLocation still, flow, overlay;
        Look(int tint, ResourceLocation still, ResourceLocation flow, ResourceLocation overlay) {
            this.tint = tint; this.still = still; this.flow = flow; this.overlay = overlay;
        }
        @Override public ResourceLocation getStillTexture() { return still; }
        @Override public ResourceLocation getFlowingTexture() { return flow; }
        @Override public ResourceLocation getOverlayTexture() { return overlay; }
        @Override public int getTintColor() { return tint; }
    }
    static ResourceLocation mc(String p) { return new ResourceLocation("minecraft", p); }
    static ResourceLocation own(String p) { return new ResourceLocation(StoddCore.MOD_ID, p); }

    public static final RegistryObject<FluidType> CLOUD_TYPE = FLUID_TYPES.register("dense_cloud", () -> new FluidType(FluidType.Properties.create()
        .descriptionId("block.stodd_core.dense_cloud")
        .canSwim(true).canDrown(false).supportsBoating(true).canExtinguish(true).canHydrate(false).canConvertToSource(false)
        .canPushEntity(false).fallDistanceModifier(0F).motionScale(0.012D).density(3000).viscosity(1500)) {
        @Override
        public void initializeClient(Consumer<IClientFluidTypeExtensions> consumer) { consumer.accept(new Look(0xFFFFFFFF,
            own("block/dense_cloud_still"), own("block/dense_cloud_flow"), own("block/dense_cloud_still"))); }
    });

    public static final RegistryObject<FluidType> STREAM_TYPE = FLUID_TYPES.register("sky_stream", () -> new FluidType(FluidType.Properties.create()
        .descriptionId("block.stodd_core.sky_stream")
        .canSwim(true).canDrown(false).supportsBoating(false).canExtinguish(true).canHydrate(false).canConvertToSource(false)
        .canPushEntity(false).fallDistanceModifier(0F).motionScale(0.014D).density(8000).viscosity(800).lightLevel(6)) {
        @Override
        public void initializeClient(Consumer<IClientFluidTypeExtensions> consumer) { consumer.accept(new Look(0xC8A6E2FF,
            mc("block/water_still"), mc("block/water_flow"), mc("block/water_overlay"))); }
    });

    /** A sky fluid's source: it never spreads, and no other fluid takes its place. */
    static final class Still extends ForgeFlowingFluid.Source {
        Still(ForgeFlowingFluid.Properties p) { super(p); }
        @Override public void tick(Level level, BlockPos pos, FluidState state) { }
        @Override protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, Fluid fluid, Direction direction) { return false; }
    }

    /** Only there because a fluid needs a flowing form; it never spreads either. */
    static final class Moving extends ForgeFlowingFluid.Flowing {
        Moving(ForgeFlowingFluid.Properties p) { super(p); }
        @Override public void tick(Level level, BlockPos pos, FluidState state) { }
        @Override protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, Fluid fluid, Direction direction) { return false; }
    }

    static ForgeFlowingFluid.Properties cloudProps() {
        return new ForgeFlowingFluid.Properties(CLOUD_TYPE, CLOUD, CLOUD_FLOWING).block(StoddRegistry.DENSE_CLOUD).bucket(StoddRegistry.DENSE_CLOUD_BUCKET)
            .slopeFindDistance(1).levelDecreasePerBlock(4).tickRate(20);
    }

    static ForgeFlowingFluid.Properties streamProps() {
        return new ForgeFlowingFluid.Properties(STREAM_TYPE, STREAM, STREAM_FLOWING).block(StoddRegistry.SKY_STREAM).bucket(StoddRegistry.SKY_STREAM_BUCKET)
            .slopeFindDistance(1).levelDecreasePerBlock(4).tickRate(20);
    }

    public static final RegistryObject<FlowingFluid> CLOUD = FLUIDS.register("dense_cloud", () -> new Still(cloudProps()));
    public static final RegistryObject<FlowingFluid> CLOUD_FLOWING = FLUIDS.register("flowing_dense_cloud", () -> new Moving(cloudProps()));
    public static final RegistryObject<FlowingFluid> STREAM = FLUIDS.register("sky_stream", () -> new Still(streamProps()));
    public static final RegistryObject<FlowingFluid> STREAM_FLOWING = FLUIDS.register("flowing_sky_stream", () -> new Moving(streamProps()));
}
