package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.phys.Vec3;

import java.util.function.Supplier;

/**
 * stodd_core:sky_stream - the block of a knock up stream. Everything in it is carried up, quickly, like a bubble column but all
 * the way to the top: players, mobs, items and boats (ships are lifted by its weight to their physics, see StoddFluids). At the
 * top of the column the lift eases off, so you come out on the cloud (or the sea) instead of being thrown into the air.
 */
public final class SkyStreamBlock extends LiquidBlock {
    static final double RISE = 0.7, TOP_RISE = 0.22, PUSH = 0.1;

    public SkyStreamBlock(Supplier<? extends FlowingFluid> fluid, Properties properties) { super(fluid, properties); }

    @Override
    public void entityInside(BlockState state, Level level, BlockPos pos, Entity entity) {
        boolean top = !(level.getBlockState(pos.above()).getBlock() instanceof SkyStreamBlock);
        double want = top ? TOP_RISE : RISE;
        Vec3 v = entity.getDeltaMovement();
        if (v.y < want) entity.setDeltaMovement(v.x, Math.min(want, v.y + PUSH), v.z);
        entity.resetFallDistance();
    }
}
