package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import stodd.core.StoddCore;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The ground work of one 48 x 48 cell, done while its chunks generate (each chunk does its own part):
 *   CITY  clear everything above the street level (trees, hills) and lay the foundation under it, down to the real ground (a sea
 *         wall at the coast), then give the cell the style's biome;
 *   ISLE  repaint the surface by the theme's rules (grass -> basalt, leaves -> cherry leaves ...) and give the cell the theme's biome;
 *   SKY   give the cell the sky biome.
 * When the cell carries a landmark, its footprint is cleared and, where the ground is lower, filled underneath.
 * The template that stands on it is a separate piece, added after this one so it is built on the prepared ground.
 */
public final class CellGroundPiece extends StructurePiece {
    public static final int CITY = 0, ISLE = 1, SKY = 2;

    final int mode, x0, z0, size;
    final int street, height, cutCap, foundLo, surfLo, surfHi;
    final String foundation, biome;
    final int bioLo, bioHi;
    final List<String[]> paint;
    // landmark footprint (fw = 0: none)
    final int fx, fz, fw, fd, my0, mClear, mTop, mFoundLo;   // template base, clear from, clear to, foundation floor

    CellGroundPiece(int mode, int x0, int z0, int size, int street, int height, int cutCap, int foundLo, int surfLo, int surfHi,
                    String foundation, String biome, int bioLo, int bioHi, List<String[]> paint,
                    int fx, int fz, int fw, int fd, int my0, int mClear, int mTop, int mFoundLo, int yMin, int yMax) {
        super(StoddRegistry.GROUND_PIECE.get(), 0, new BoundingBox(x0, yMin, z0, x0 + size - 1, yMax, z0 + size - 1));
        this.mode = mode; this.x0 = x0; this.z0 = z0; this.size = size; this.street = street; this.height = height; this.cutCap = cutCap;
        this.foundLo = foundLo; this.surfLo = surfLo; this.surfHi = surfHi; this.foundation = foundation; this.biome = biome; this.bioLo = bioLo; this.bioHi = bioHi;
        this.paint = paint;
        this.fx = fx; this.fz = fz; this.fw = fw; this.fd = fd; this.my0 = my0; this.mClear = mClear; this.mTop = mTop; this.mFoundLo = mFoundLo;
    }

    public CellGroundPiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.GROUND_PIECE.get(), tag);
        mode = tag.getInt("Mode"); x0 = tag.getInt("X0"); z0 = tag.getInt("Z0"); size = tag.getInt("Size");
        street = tag.getInt("Street"); height = tag.getInt("H"); cutCap = tag.getInt("Cap"); foundLo = tag.getInt("FLo");
        surfLo = tag.getInt("SLo"); surfHi = tag.getInt("SHi");
        foundation = tag.getString("Found"); biome = tag.getString("Biome"); bioLo = tag.getInt("BLo"); bioHi = tag.getInt("BHi");
        List<String[]> p = new ArrayList<>();
        ListTag pl = tag.getList("Paint", Tag.TAG_STRING);
        for (int i = 0; i + 1 < pl.size(); i += 2) p.add(new String[] { pl.getString(i), pl.getString(i + 1) });
        paint = p;
        fx = tag.getInt("FX"); fz = tag.getInt("FZ"); fw = tag.getInt("FW"); fd = tag.getInt("FD");
        my0 = tag.getInt("MY0"); mClear = tag.getInt("MCl"); mTop = tag.getInt("MTop"); mFoundLo = tag.getInt("MFLo");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("Mode", mode); tag.putInt("X0", x0); tag.putInt("Z0", z0); tag.putInt("Size", size);
        tag.putInt("Street", street); tag.putInt("H", height); tag.putInt("Cap", cutCap); tag.putInt("FLo", foundLo);
        tag.putInt("SLo", surfLo); tag.putInt("SHi", surfHi);
        tag.putString("Found", foundation); tag.putString("Biome", biome == null ? "" : biome); tag.putInt("BLo", bioLo); tag.putInt("BHi", bioHi);
        ListTag pl = new ListTag();
        for (String[] r : paint) { pl.add(StringTag.valueOf(r[0])); pl.add(StringTag.valueOf(r[1])); }
        tag.put("Paint", pl);
        tag.putInt("FX", fx); tag.putInt("FZ", fz); tag.putInt("FW", fw); tag.putInt("FD", fd);
        tag.putInt("MY0", my0); tag.putInt("MCl", mClear); tag.putInt("MTop", mTop); tag.putInt("MFLo", mFoundLo);
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int ax = Math.max(box.minX(), x0), bx = Math.min(box.maxX(), x0 + size - 1);
        int az = Math.max(box.minZ(), z0), bz = Math.min(box.maxZ(), z0 + size - 1);
        if (ax > bx || az > bz) return;
        BlockState air = Blocks.AIR.defaultBlockState();
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        if (mode == CITY) {
            BlockState found = Blocks2.state(foundation);
            int want = street + height + 1;
            for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
                int top = level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) - 1;
                int cut = Math.min(cutCap, Math.max(top, want));
                for (int y = street + 1; y <= cut; y++) {
                    m.set(x, y, z);
                    if (!level.getBlockState(m).isAir()) level.setBlock(m, air, 2);
                }
                int floor = level.getHeight(Heightmap.Types.OCEAN_FLOOR, x, z) - 1;
                int lo = Math.max(foundLo, Math.min(street - 1, floor - 2));
                for (int y = lo; y <= street - 1; y++) { m.set(x, y, z); level.setBlock(m, found, 2); }
            }
        } else if (mode == ISLE && !paint.isEmpty()) {
            for (int x = ax; x <= bx; x++) for (int z = az; z <= bz; z++) {
                int top = level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) - 1;
                if (top > 190) continue;    // the column of a sky island overhead: leave it alone
                int floor = level.getHeight(Heightmap.Types.OCEAN_FLOOR, x, z) - 1;
                int lo = Math.min(floor, surfLo) - 2;
                for (int y = top; y >= lo; y--) {
                    m.set(x, y, z);
                    BlockState s = level.getBlockState(m);
                    if (s.isAir()) continue;
                    for (String[] r : paint) {
                        if (Blocks2.matches(s, r[0])) { level.setBlock(m, Blocks2.state(r[1]), 2); break; }
                    }
                }
            }
        }
        // the landmark's footprint: clear it from the ground up, fill gaps under it with the theme's foundation (air only)
        if (fw > 0) {
            int lx0 = Math.max(ax, fx), lx1 = Math.min(bx, fx + fw - 1), lz0 = Math.max(az, fz), lz1 = Math.min(bz, fz + fd - 1);
            BlockState found = Blocks2.state(foundation);
            for (int x = lx0; x <= lx1; x++) for (int z = lz0; z <= lz1; z++) {
                for (int y = mClear; y <= mTop; y++) {
                    m.set(x, y, z);
                    if (!level.getBlockState(m).isAir()) level.setBlock(m, air, 2);
                }
                for (int y = my0 - 1; y >= mFoundLo; y--) {
                    m.set(x, y, z);
                    BlockState s = level.getBlockState(m);
                    if (s.isAir() || !s.getFluidState().isEmpty()) level.setBlock(m, found, 2);
                    else break;
                }
            }
        }
        paintBiome(level, chunkPos);
    }

    /** Give the part of the cell in this chunk the cell's biome between bioLo and bioHi (cells are chunk-aligned: whole chunks). */
    private void paintBiome(WorldGenLevel level, ChunkPos chunkPos) {
        if (biome == null || biome.isEmpty()) return;
        int cx0 = chunkPos.getMinBlockX(), cz0 = chunkPos.getMinBlockZ();
        if (cx0 < x0 || cz0 < z0 || cx0 + 15 > x0 + size - 1 || cz0 + 15 > z0 + size - 1) return;
        ResourceLocation rl = ResourceLocation.tryParse(biome);
        if (rl == null) return;
        Optional<? extends Holder<Biome>> h = level.registryAccess().registryOrThrow(Registries.BIOME).getHolder(ResourceKey.create(Registries.BIOME, rl));
        if (h.isEmpty()) {
            if (WARNED.add(biome)) StoddCore.LOG.warn("[STODD Core] biome {} is not registered; cells keep their natural biome", biome);
            return;
        }
        final Holder<Biome> b = h.get();
        final int qlo = QuartPos.fromBlock(bioLo), qhi = QuartPos.fromBlock(bioHi);
        final ChunkAccess chunk = level.getChunk(chunkPos.x, chunkPos.z);
        chunk.fillBiomesFromNoise((qx, qy, qz, sampler) -> (qy >= qlo && qy <= qhi) ? b : chunk.getNoiseBiome(qx, qy, qz), Climate.empty());
        chunk.setUnsaved(true);
    }

    private static final java.util.Set<String> WARNED = java.util.concurrent.ConcurrentHashMap.newKeySet();
}
