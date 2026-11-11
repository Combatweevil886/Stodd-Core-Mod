package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FallingBlock;
import net.minecraft.world.level.block.LightBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

/**
 * One 48 x 48 cell of a sunken island's bubble dome, done while its chunks generate (each chunk does its own part; the dome is a
 * formula, so the parts always meet):
 *   - the wall: every block of the dome's surface that is not firm ground becomes stodd_core:bubble (water cannot pass it; the
 *     surface is closed for water, which only flows sideways and down);
 *   - inside: every water block becomes air (also in caves under the island), waterlogged blocks are drained;
 *   - the island's top, made under water (dirt, gravel, clay), becomes grass again; sand stays sand;
 *   - invisible light blocks on a grid a few blocks over the ground, because daylight does not reach that deep.
 * It runs first of all the decoration steps (raw_generation), so trees, flowers and animals then see a dry island.
 */
public final class CellDomePiece extends StructurePiece {
    final int x0, z0, size, lightEvery;
    final double cx, cz, r, base, up, down;

    CellDomePiece(int x0, int z0, int size, double cx, double cz, double r, double base, double up, double down, int lightEvery, int yMin, int yMax) {
        super(StoddRegistry.DOME_PIECE.get(), 0, new BoundingBox(x0, yMin, z0, x0 + size - 1, yMax, z0 + size - 1));
        this.x0 = x0; this.z0 = z0; this.size = size; this.cx = cx; this.cz = cz; this.r = r; this.base = base; this.up = up; this.down = down;
        this.lightEvery = lightEvery;
    }

    public CellDomePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.DOME_PIECE.get(), tag);
        x0 = tag.getInt("X0"); z0 = tag.getInt("Z0"); size = tag.getInt("Size"); lightEvery = tag.getInt("Light");
        cx = tag.getDouble("CX"); cz = tag.getDouble("CZ"); r = tag.getDouble("R"); base = tag.getDouble("Base"); up = tag.getDouble("Up"); down = tag.getDouble("Down");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("X0", x0); tag.putInt("Z0", z0); tag.putInt("Size", size); tag.putInt("Light", lightEvery);
        tag.putDouble("CX", cx); tag.putDouble("CZ", cz); tag.putDouble("R", r); tag.putDouble("Base", base); tag.putDouble("Up", up); tag.putDouble("Down", down);
    }

    double f(double x, double y, double z) {
        double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
        double v = y >= base ? (y - base) / up : (base - y) / down;
        return h + v * v;
    }

    boolean inside(int x, int y, int z) { return f(x, y, z) <= 1.0; }

    /** a block of the dome's surface: inside, with a neighbour outside (closed for water, which moves along the six faces) */
    boolean wall(int x, int y, int z) {
        return !inside(x + 1, y, z) || !inside(x - 1, y, z) || !inside(x, y + 1, z) || !inside(x, y - 1, z) || !inside(x, y, z + 1) || !inside(x, y, z - 1);
    }

    /** ground that holds water back by itself: solid, and not sand or gravel that could fall into the dome */
    static boolean firm(BlockState s) {
        return !s.isAir() && s.getFluidState().isEmpty() && !s.canBeReplaced() && s.blocksMotion() && !(s.getBlock() instanceof FallingBlock);
    }

    static boolean underwaterTop(BlockState s) {
        return s.is(Blocks.DIRT) || s.is(Blocks.GRAVEL) || s.is(Blocks.CLAY) || s.is(Blocks.MUD) || s.is(Blocks.COARSE_DIRT);
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int ax = Math.max(box.minX(), x0), bx = Math.min(box.maxX(), x0 + size - 1);
        int az = Math.max(box.minZ(), z0), bz = Math.min(box.maxZ(), z0 + size - 1);
        if (ax > bx || az > bz) return;
        BlockState bubble = StoddRegistry.BUBBLE.get().defaultBlockState();
        BlockState air = Blocks.AIR.defaultBlockState();
        BlockState grass = Blocks.GRASS_BLOCK.defaultBlockState();
        BlockState light = Blocks.LIGHT.defaultBlockState().setValue(LightBlock.LEVEL, 15);
        int minY = level.getMinBuildHeight() + 1, maxY = level.getMaxBuildHeight() - 1;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            if (h > 1.0001) continue;
            double s = Math.sqrt(Math.max(0, 1 - h));
            int yTop = Math.min(maxY, (int) Math.ceil(base + up * s) + 1), yBot = Math.max(minY, (int) Math.floor(base - down * s) - 1);
            int ground = Integer.MIN_VALUE;
            for (int y = yTop; y >= yBot; y--) {
                if (!inside(x, y, z)) continue;
                m.set(x, y, z);
                BlockState st = level.getBlockState(m);
                if (wall(x, y, z)) {
                    if (!firm(st)) level.setBlock(m, bubble, 2);
                    continue;
                }
                if (!st.getFluidState().isEmpty()) {
                    if (st.hasProperty(BlockStateProperties.WATERLOGGED)) st = st.setValue(BlockStateProperties.WATERLOGGED, false);
                    else st = air;
                    level.setBlock(m, st, 2);
                }
                if (ground == Integer.MIN_VALUE && !st.isAir()) ground = y;
            }
            if (ground == Integer.MIN_VALUE) continue;
            // the island's top was made under water: grass again (sand stays sand)
            m.set(x, ground, z);
            BlockState top = level.getBlockState(m);
            if (underwaterTop(top) && level.getBlockState(m.above()).isAir()) level.setBlock(m, grass, 2);
            // light, since the daylight does not come down this deep
            if (lightEvery > 0 && Math.floorMod(x, lightEvery) == 0 && Math.floorMod(z, lightEvery) == 0) {
                int ly = ground + 3;
                if (inside(x, ly, z) && !wall(x, ly, z)) {
                    m.set(x, ly, z);
                    if (level.getBlockState(m).isAir()) level.setBlock(m, light, 2);
                }
            }
        }
    }
}
