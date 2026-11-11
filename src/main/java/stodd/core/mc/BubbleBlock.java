package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.LiquidBlockContainer;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.pathfinder.BlockPathTypes;
import org.jetbrains.annotations.Nullable;

/**
 * stodd_core:bubble - the wall of a sunken island's dome. Everything passes through it (no collision): players, mobs, items, boats
 * and Valkyrien Skies / Eureka ships (it is not "solid", so their physics see no block there; a vs_mass entry says so as well),
 * and you can breathe in it, but water and lava cannot flow into it or replace it, so the air inside the dome stays dry.
 * Mobs do not plan their walks through it (the animals and villagers inside stay in, the fish outside stay out), though a push
 * still takes them across. Translucent, faintly glowing, and by default it cannot be broken (deepIslands.bubbleBreakable), so
 * nobody floods a dome by accident.
 */
public final class BubbleBlock extends HalfTransparentBlock implements LiquidBlockContainer {
    public BubbleBlock(Properties properties) { super(properties); }

    // water asks every block it could flow into whether it may hold a liquid: never
    @Override
    public boolean canPlaceLiquid(BlockGetter level, BlockPos pos, BlockState state, Fluid fluid) { return false; }

    @Override
    public boolean placeLiquid(LevelAccessor level, BlockPos pos, BlockState state, FluidState fluid) { return false; }

    // mobs treat it as a wall when they plan where to walk (they would leave the dome into the sea and drown)
    @Override
    public @Nullable BlockPathTypes getBlockPathType(BlockState state, BlockGetter level, BlockPos pos, @Nullable Mob mob) { return BlockPathTypes.BLOCKED; }

    @Override
    public boolean propagatesSkylightDown(BlockState state, BlockGetter level, BlockPos pos) { return true; }

    @Override
    public float getShadeBrightness(BlockState state, BlockGetter level, BlockPos pos) { return 1.0F; }
}
