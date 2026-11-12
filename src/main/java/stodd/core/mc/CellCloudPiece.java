package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

/**
 * One 48 x 48 cell of the cloud sea round a sky island (SkyField.cloudCell), done while its chunks generate, last of the decoration
 * steps so it only fills what is still open sky:
 *   - the cloud sea: in every column open to the sky, `depth` blocks of dense cloud (stodd_core:dense_cloud) down from one under
 *     the island's coast, filling only air (an island's valley under that height becomes a cloud lake; caves and the underside of
 *     the island are left alone);
 *   - the knock up streams that reach into the cell: an upright column of stodd_core:sky_stream from under the sea's surface up to
 *     the cloud's, through water and air (never through solid ground).
 */
public final class CellCloudPiece extends StructurePiece {
    final int x0, z0, size, depth;
    final byte[] top;
    final int[] streams;   // x, z, r, yLow, yTop per stream

    CellCloudPiece(int x0, int z0, int size, int depth, byte[] top, int[] streams, int yMin, int yMax) {
        super(StoddRegistry.CLOUD_PIECE.get(), 0, new BoundingBox(x0, yMin, z0, x0 + size - 1, yMax, z0 + size - 1));
        this.x0 = x0; this.z0 = z0; this.size = size; this.depth = depth; this.top = top; this.streams = streams;
    }

    public CellCloudPiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.CLOUD_PIECE.get(), tag);
        x0 = tag.getInt("X0"); z0 = tag.getInt("Z0"); size = tag.getInt("Size"); depth = tag.getInt("Depth");
        top = tag.getByteArray("Top"); streams = tag.getIntArray("Streams");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("X0", x0); tag.putInt("Z0", z0); tag.putInt("Size", size); tag.putInt("Depth", depth);
        tag.putByteArray("Top", top); tag.putIntArray("Streams", streams);
    }

    /** water, air, sea grass and the like: what a stream may take the place of */
    static boolean open(BlockState s) {
        return s.isAir() || (!s.getFluidState().isEmpty() && !s.blocksMotion()) || (s.canBeReplaced() && !s.blocksMotion());
    }

    /** the column of a stream at (x, z): every open block from its bottom to its top */
    static void stream(WorldGenLevel level, BlockPos.MutableBlockPos m, int x, int z, int yLow, int yTop, BlockState stream) {
        int lo = Math.max(level.getMinBuildHeight() + 1, yLow), hi = Math.min(level.getMaxBuildHeight() - 1, yTop);
        for (int y = lo; y <= hi; y++) {
            m.set(x, y, z);
            BlockState st = level.getBlockState(m);
            if (st.getBlock() == stream.getBlock()) continue;
            if (open(st) || st.getBlock() instanceof BubbleBlock) level.setBlock(m, stream, 2);
        }
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int ax = Math.max(box.minX(), x0), bx = Math.min(box.maxX(), x0 + size - 1);
        int az = Math.max(box.minZ(), z0), bz = Math.min(box.maxZ(), z0 + size - 1);
        if (ax > bx || az > bz || top.length != size * size) return;
        BlockState cloud = StoddRegistry.DENSE_CLOUD.get().defaultBlockState();
        BlockState stream = StoddRegistry.SKY_STREAM.get().defaultBlockState();
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
            boolean inStream = false;
            for (int k = 0; k + 4 < streams.length; k += 5) {
                double dx = x - streams[k], dz = z - streams[k + 1], r = streams[k + 2] + 0.5;
                if (dx * dx + dz * dz > r * r) continue;
                stream(level, m, x, z, streams[k + 3], streams[k + 4], stream);
                inStream = true;
            }
            if (inStream) continue;
            int t = top[(z - z0) * size + (x - x0)] & 0xff;
            if (t == 0) continue;
            int ct = t + 64;
            // only a column open to the sky over the cloud's height (not the island, not under its underside)
            int surface = level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z) - 1;
            if (surface >= ct) continue;
            for (int y = ct; y > ct - depth && y > surface; y--) {
                m.set(x, y, z);
                if (level.getBlockState(m).isAir()) level.setBlock(m, cloud, 2);
            }
        }
    }
}
