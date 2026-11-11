package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.LiquidBlockContainer;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;

/**
 * stodd_core:bubble - the wall of a sunken island's dome. Players, mobs and items pass through it (no collision) and can breathe in
 * it, but water and lava cannot flow into it or replace it, so the air inside the dome stays dry. Translucent, faintly glowing,
 * and by default it cannot be broken (deepIslands.bubbleBreakable), so nobody floods a dome by accident.
 */
public final class BubbleBlock extends HalfTransparentBlock implements LiquidBlockContainer {
    public BubbleBlock(Properties properties) { super(properties); }

    // water asks every block it could flow into whether it may hold a liquid: never
    @Override
    public boolean canPlaceLiquid(BlockGetter level, BlockPos pos, BlockState state, Fluid fluid) { return false; }

    @Override
    public boolean placeLiquid(LevelAccessor level, BlockPos pos, BlockState state, FluidState fluid) { return false; }

    @Override
    public boolean propagatesSkylightDown(BlockState state, BlockGetter level, BlockPos pos) { return true; }

    @Override
    public float getShadeBrightness(BlockState state, BlockGetter level, BlockPos pos) { return 1.0F; }
}
