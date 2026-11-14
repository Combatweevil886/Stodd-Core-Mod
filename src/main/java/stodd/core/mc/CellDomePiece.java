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
 * formula, so the parts always meet). The sea fills the dome when the terrain is made; this piece turns it into an island in an air
 * bubble with its own sea round it:
 *   - the wall above the inner sea: every block of the dome's surface that is not firm ground becomes stodd_core:bubble (water
 *     cannot pass it; the surface is closed for water, which only flows sideways and down). Below the inner sea's surface there is
 *     water on both sides, so no wall is needed there;
 *   - above the inner sea: every water block becomes air (caves in the island too), waterlogged blocks are drained;
 *   - the inner sea: open water from its surface (the island's coast height) down to its floor, one level, no dry holes;
 *   - the island's top above the water, made under water (dirt, gravel, clay), becomes grass again; sand stays sand;
 *   - invisible light blocks on a grid a few blocks over the ground and the water, because daylight does not reach that deep;
 *   - its knock up stream, if it has one: an upright column of stodd_core:sky_stream from just under the inner sea, up through the
 *     roof, to the outer sea's surface, so ships (and swimmers) that came down get back up;
 *   - its bubble tube, if it has one: an open shaft of air as wide as the stream, walled with bubble, from the outer sea's
 *     surface down through the roof, so a ship sails into it and drops into the sea inside (daylight comes down it too).
 * It runs late in the decoration (fluid_springs): until then the dome is full of sea water, so geodes, dungeons, mineshafts, fossils
 * and lakes (which all refuse water) are not built into its open air; then it is drained, before the trees, flowers and grass
 * (vegetal_decoration) and the animals, which see a dry island.
 */
public final class CellDomePiece extends StructurePiece {
    final int x0, z0, size, lightEvery;
    final double cx, cz, r, base, up, down;
    final int[] stream;   // x, z, r, yLow, yTop, or empty
    final int[] tube;     // x, z, r, yLow, yTop, or empty

    CellDomePiece(int x0, int z0, int size, double cx, double cz, double r, double base, double up, double down, int lightEvery, int[] stream, int[] tube, int yMin, int yMax) {
        super(StoddRegistry.DOME_PIECE.get(), 0, new BoundingBox(x0, yMin, z0, x0 + size - 1,
            Math.max(yMax, Math.max(stream.length == 5 ? stream[4] : yMax, tube.length == 5 ? tube[4] : yMax)), z0 + size - 1));
        this.x0 = x0; this.z0 = z0; this.size = size; this.cx = cx; this.cz = cz; this.r = r; this.base = base; this.up = up; this.down = down;
        this.lightEvery = lightEvery; this.stream = stream; this.tube = tube;
    }

    public CellDomePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.DOME_PIECE.get(), tag);
        x0 = tag.getInt("X0"); z0 = tag.getInt("Z0"); size = tag.getInt("Size"); lightEvery = tag.getInt("Light");
        cx = tag.getDouble("CX"); cz = tag.getDouble("CZ"); r = tag.getDouble("R"); base = tag.getDouble("Base"); up = tag.getDouble("Up"); down = tag.getDouble("Down");
        stream = tag.getIntArray("Stream");   // empty in domes saved by 3.1.0 / 3.1.1
        tube = tag.getIntArray("Tube");       // empty in domes saved before 3.4.0
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("X0", x0); tag.putInt("Z0", z0); tag.putInt("Size", size); tag.putInt("Light", lightEvery);
        tag.putDouble("CX", cx); tag.putDouble("CZ", cz); tag.putDouble("R", r); tag.putDouble("Base", base); tag.putDouble("Up", up); tag.putDouble("Down", down);
        tag.putIntArray("Stream", stream);
        tag.putIntArray("Tube", tube);
    }

    /** the dome's shape (SkyField.Dome.f): a half ellipsoid above base, an upright cylinder below it */
    double f(double x, double y, double z) {
        double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
        if (y >= base) { double v = (y - base) / up; return h + v * v; }
        return Math.max(h, (base - y) / down);
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

    /** the floor of the open sea: something solid that is not part of the water (sea grass and kelp are part of it) */
    static boolean seaFloor(BlockState s) { return s.getFluidState().isEmpty() && !s.isAir() && !s.canBeReplaced(); }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int ax = Math.max(box.minX(), x0), bx = Math.min(box.maxX(), x0 + size - 1);
        int az = Math.max(box.minZ(), z0), bz = Math.min(box.maxZ(), z0 + size - 1);
        if (ax > bx || az > bz) return;
        BlockState bubble = StoddRegistry.BUBBLE.get().defaultBlockState();
        BlockState air = Blocks.AIR.defaultBlockState();
        BlockState water = Blocks.WATER.defaultBlockState();
        BlockState grass = Blocks.GRASS_BLOCK.defaultBlockState();
        BlockState light = Blocks.LIGHT.defaultBlockState().setValue(LightBlock.LEVEL, 15);
        int minY = level.getMinBuildHeight() + 1, maxY = level.getMaxBuildHeight() - 1;
        int sea = (int) Math.floor(base);
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
            double h = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
            if (h > 1.0001) continue;
            double s = Math.sqrt(Math.max(0, 1 - h));
            int yTop = Math.min(maxY, (int) Math.ceil(base + up * s) + 1), yBot = Math.max(minY, (int) Math.floor(base - down) - 1);
            int ground = Integer.MIN_VALUE;
            // the open sea: from its surface down, while nothing solid is in the way (a column under the island's land is not sea)
            boolean open = false;
            for (int y = yTop; y >= yBot; y--) {
                if (!inside(x, y, z)) {
                    if (y == sea + 1) open = true;    // the outer sea over the dome's rim: the water below is the open sea
                    continue;
                }
                m.set(x, y, z);
                BlockState st = level.getBlockState(m);
                if (y > sea) {
                    if (wall(x, y, z)) {
                        if (!firm(st)) { level.setBlock(m, bubble, 2); st = bubble; }
                    } else if (!st.getFluidState().isEmpty()) {
                        if (st.hasProperty(BlockStateProperties.WATERLOGGED)) st = st.setValue(BlockStateProperties.WATERLOGGED, false);
                        else st = air;
                        level.setBlock(m, st, 2);
                    }
                    if (y == sea + 1) open = st.isAir() || st.getBlock() instanceof BubbleBlock;
                    if (ground == Integer.MIN_VALUE && !st.isAir() && !(st.getBlock() instanceof BubbleBlock)) ground = y;
                    continue;
                }
                // the inner sea, one water level: holes the aquifers left are filled, down to the floor
                if (open) {
                    if (seaFloor(st)) open = false;
                    else if (st.isAir() || (st.getFluidState().isEmpty() && st.canBeReplaced())) { level.setBlock(m, water, 2); st = water; }
                }
                if (ground == Integer.MIN_VALUE && !st.isAir()) ground = y;
                if (!open && y < sea) break;
            }
            if (ground == Integer.MIN_VALUE) continue;
            // the island's top above the water was made under water: grass again (sand stays sand)
            if (ground > sea) {
                m.set(x, ground, z);
                BlockState top = level.getBlockState(m);
                if (underwaterTop(top) && level.getBlockState(m.above()).isAir()) level.setBlock(m, grass, 2);
            }
            // light, since the daylight does not come down this deep (over the water too)
            if (lightEvery > 0 && Math.floorMod(x, lightEvery) == 0 && Math.floorMod(z, lightEvery) == 0) {
                int ly = Math.max(ground, sea) + 3;
                if (inside(x, ly, z) && !wall(x, ly, z)) {
                    m.set(x, ly, z);
                    if (level.getBlockState(m).isAir()) level.setBlock(m, light, 2);
                }
            }
        }
        // the knock up stream: up from the inner sea, through the roof, to the outer sea's surface
        if (stream.length == 5) {
            BlockState sk = StoddRegistry.SKY_STREAM.get().defaultBlockState();
            double rr = stream[2] + 0.5;
            for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
                double dx = x - stream[0], dz = z - stream[1];
                if (dx * dx + dz * dz <= rr * rr) CellCloudPiece.stream(level, m, x, z, stream[3], stream[4], sk);
            }
        }
        // the bubble tube: air inside, a wall of bubble round it, from the surface down to where it opens into the dome
        if (tube.length == 5) {
            double tr = tube[2] + 0.5, shell = tube[2] + 2.0;
            for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
                double dx = x - tube[0], dz = z - tube[1], dd = Math.sqrt(dx * dx + dz * dz);
                if (dd > shell) continue;
                boolean in = dd <= tr;
                for (int y = Math.min(maxY, tube[4]); y > tube[3]; y--) {
                    // down to the dome's open inside (the shell stops on the dome's own wall, so the two walls meet)
                    if (inside(x, y, z) && !wall(x, y, z)) break;
                    m.set(x, y, z);
                    BlockState st = level.getBlockState(m);
                    if (in) {
                        if (!st.isAir() && !firm(st)) level.setBlock(m, air, 2);
                    } else if (!firm(st) && !(st.getBlock() instanceof BubbleBlock)) {
                        level.setBlock(m, bubble, 2);
                    }
                }
            }
        }
    }
}
