package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.ConfiguredFeature;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import stodd.core.StoddCore;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * The waystone of one island, at its centre, generated with the island's middle chunk: every island gets one, on the ground, in
 * the sky or under a dome. It is Waystones' own world-generation feature (so the stone is registered and works like any other),
 * styled after the island's theme and renamed after the island. It stands on the best open, flat ground in the middle chunk
 * nearest the centre; if there is none (a lake, a forest, a building), the ground at the centre is cleared and, over water,
 * paved, and it stands there anyway. Runs last (top_layer_modification), after the island's buildings and trees.
 */
public final class CellWaystonePiece extends StructurePiece {
    public static final int GROUND = 0, SKY = 1, DEEP = 2;

    final int cx, cz, kind;
    final String style, name;
    final double dcx, dcz, dr, dbase, dup;   // the dome of a sunken island

    CellWaystonePiece(int cx, int cz, int kind, String style, String name, double dcx, double dcz, double dr, double dbase, double dup, int yMin, int yMax) {
        super(StoddRegistry.WAYSTONE_PIECE.get(), 0, chunkBox(cx, cz, yMin, yMax));
        this.cx = cx; this.cz = cz; this.kind = kind; this.style = style; this.name = name;
        this.dcx = dcx; this.dcz = dcz; this.dr = dr; this.dbase = dbase; this.dup = dup;
    }

    static BoundingBox chunkBox(int cx, int cz, int yMin, int yMax) {
        int x0 = Math.floorDiv(cx, 16) * 16, z0 = Math.floorDiv(cz, 16) * 16;
        return new BoundingBox(x0, yMin, z0, x0 + 15, yMax, z0 + 15);
    }

    public CellWaystonePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.WAYSTONE_PIECE.get(), tag);
        cx = tag.getInt("CX"); cz = tag.getInt("CZ"); kind = tag.getInt("Kind"); style = tag.getString("Style"); name = tag.getString("Name");
        dcx = tag.getDouble("DCX"); dcz = tag.getDouble("DCZ"); dr = tag.getDouble("DR"); dbase = tag.getDouble("DBase"); dup = tag.getDouble("DUp");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("CX", cx); tag.putInt("CZ", cz); tag.putInt("Kind", kind); tag.putString("Style", style); tag.putString("Name", name);
        tag.putDouble("DCX", dcx); tag.putDouble("DCZ", dcz); tag.putDouble("DR", dr); tag.putDouble("DBase", dbase); tag.putDouble("DUp", dup);
    }

    /** air, plants, snow layers, light: what the stone may stand in */
    static boolean soft(BlockState s) {
        if (s.isAir() || s.is(Blocks.LIGHT)) return true;
        if (!s.getFluidState().isEmpty()) return false;
        if (s.getBlock() instanceof BubbleBlock) return false;
        return s.canBeReplaced() || !s.blocksMotion() && !s.is(BlockTags.LEAVES);
    }

    /** ground a stone may stand on */
    static boolean goodGround(BlockState s) {
        return s.blocksMotion() && s.getFluidState().isEmpty() && !s.is(BlockTags.LEAVES) && !s.is(BlockTags.LOGS) && !s.is(Blocks.BEDROCK)
            && !(s.getBlock() instanceof BubbleBlock) && !s.is(Blocks.ICE) && !s.is(Blocks.PACKED_ICE) && !s.is(Blocks.BLUE_ICE) && !s.is(Blocks.MAGMA_BLOCK)
            && !String.valueOf(net.minecraftforge.registries.ForgeRegistries.BLOCKS.getKey(s.getBlock())).startsWith("waystones:");
    }

    /** where the scan for the ground starts: the top of the island here (under the dome's roof for a sunken one) */
    int top(WorldGenLevel level, int x, int z) {
        if (kind == DEEP) {
            double h = ((x - dcx) * (x - dcx) + (z - dcz) * (z - dcz)) / (dr * dr);
            return h >= 1 ? (int) dbase : (int) Math.floor(dbase + dup * Math.sqrt(1 - h)) - 1;
        }
        return level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
    }

    /** the first block that is not soft, scanning down from the top (its y), or Integer.MIN_VALUE */
    int ground(WorldGenLevel level, int x, int z) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        int t = top(level, x, z), lo = Math.max(level.getMinBuildHeight() + 1, t - 80);
        for (int y = t; y >= lo; y--) {
            m.set(x, y, z);
            if (!soft(level.getBlockState(m))) return y;
        }
        return Integer.MIN_VALUE;
    }

    boolean fits(WorldGenLevel level, int x, int y, int z, boolean strict) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        m.set(x, y, z);
        if (!goodGround(level.getBlockState(m))) return false;
        for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
            for (int dy = 1; dy <= (strict ? 3 : 2); dy++) {
                if (!strict && (dx != 0 || dz != 0) && dy > 2) continue;
                m.set(x + dx, y + dy, z + dz);
                if (!soft(level.getBlockState(m))) return false;
            }
            if (strict) { m.set(x + dx, y, z + dz); if (!goodGround(level.getBlockState(m))) return false; }
        }
        return true;
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int x0 = box.minX() + 1, x1 = box.maxX() - 1, z0 = box.minZ() + 1, z1 = box.maxZ() - 1;
        if (x0 > x1 || z0 > z1) return;
        int ccx = Math.max(x0, Math.min(x1, cx)), ccz = Math.max(z0, Math.min(z1, cz));
        // the columns of this chunk (1 block in from its edges), the centre first, then outwards
        List<int[]> spots = new ArrayList<>();
        for (int x = x0; x <= x1; x++) for (int z = z0; z <= z1; z++) spots.add(new int[] { x, z, (x - ccx) * (x - ccx) + (z - ccz) * (z - ccz) });
        spots.sort((a, b) -> a[2] != b[2] ? Integer.compare(a[2], b[2]) : a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
        int px = Integer.MIN_VALUE, py = 0, pz = 0;
        for (int pass = 0; pass < 2 && px == Integer.MIN_VALUE; pass++) {
            for (int[] sp : spots) {
                int y = ground(level, sp[0], sp[1]);
                if (y == Integer.MIN_VALUE) continue;
                if (fits(level, sp[0], y, sp[1], pass == 0)) { px = sp[0]; py = y; pz = sp[1]; break; }
            }
        }
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        if (px == Integer.MIN_VALUE) {
            // nothing open and flat: make room at the centre (no exceptions)
            px = ccx; pz = ccz;
            int y = ground(level, px, pz);
            if (y == Integer.MIN_VALUE) y = kind == DEEP ? (int) dbase : level.getHeight(Heightmap.Types.OCEAN_FLOOR, px, pz) - 1;
            BlockState pave = Blocks.STONE_BRICKS.defaultBlockState();
            for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
                m.set(px + dx, y, pz + dz);
                if (!goodGround(level.getBlockState(m))) level.setBlock(m, pave, 2);
                for (int dy = 1; dy <= 3; dy++) {
                    m.set(px + dx, y + dy, pz + dz);
                    BlockState s = level.getBlockState(m);
                    if (!s.isAir() && !(s.getBlock() instanceof BubbleBlock)) level.setBlock(m, Blocks.AIR.defaultBlockState(), 2);
                }
            }
            py = y;
        }
        BlockPos pos = new BlockPos(px, py + 1, pz);
        // clear plants where the two-block stone stands
        for (int dy = 0; dy <= 1; dy++) {
            BlockPos q = pos.above(dy);
            if (!level.getBlockState(q).isAir()) level.setBlock(q, Blocks.AIR.defaultBlockState(), 2);
        }
        if (!placeFeature(level, generator, random, pos)) return;
        rename(level, pos);
    }

    boolean placeFeature(WorldGenLevel level, ChunkGenerator generator, RandomSource random, BlockPos pos) {
        ResourceLocation id = ResourceLocation.tryParse(style);
        if (id == null) id = new ResourceLocation("waystones", "waystone");
        try {
            var reg = level.registryAccess().registryOrThrow(Registries.CONFIGURED_FEATURE);
            ConfiguredFeature<?, ?> f = reg.get(id);
            if (f == null) f = reg.get(new ResourceLocation("waystones", "waystone"));
            if (f == null) {
                if (WARNED.add("feature")) StoddCore.LOG.warn("[STODD Core] the Waystones feature {} is not there (is Waystones installed?): islands get no waystone", style);
                return false;
            }
            f.place(level, generator, random, pos);
            return true;
        } catch (Throwable t) {
            if (WARNED.add("place")) StoddCore.LOG.warn("[STODD Core] could not place an island waystone", t);
            return false;
        }
    }

    /** Waystones names a new stone at random; it is named after the island instead. */
    void rename(WorldGenLevel level, BlockPos pos) {
        if (name == null || name.isEmpty()) return;
        try {
            BlockEntity be = level.getBlockEntity(pos);
            if (be == null) return;
            Method gw = be.getClass().getMethod("getWaystone");
            Object w = gw.invoke(be);
            if (w == null) return;
            boolean done = false;
            for (Method mm : w.getClass().getMethods()) {
                if (!mm.getName().equals("setName") || mm.getParameterCount() != 1) continue;
                Class<?> pt = mm.getParameterTypes()[0];
                if (pt == String.class) { mm.invoke(w, name); done = true; break; }
                if (pt.isAssignableFrom(net.minecraft.network.chat.Component.class)) { mm.invoke(w, net.minecraft.network.chat.Component.literal(name)); done = true; break; }
            }
            if (!done) return;
            try {
                Class<?> wm = Class.forName("net.blay09.mods.waystones.core.WaystoneManager");
                Object mgr = wm.getMethod("get", net.minecraft.server.MinecraftServer.class).invoke(null, level.getServer());
                for (Method mm : wm.getMethods()) {
                    if (mm.getName().equals("updateWaystone") && mm.getParameterCount() == 1) { mm.invoke(mgr, w); break; }
                }
            } catch (Throwable ignored) { }
            be.setChanged();
        } catch (Throwable t) {
            if (WARNED.add("rename")) StoddCore.LOG.info("[STODD Core] island waystones keep Waystones' own names ({})", t.toString());
        }
    }

    static final java.util.Set<String> WARNED = java.util.concurrent.ConcurrentHashMap.newKeySet();
}
