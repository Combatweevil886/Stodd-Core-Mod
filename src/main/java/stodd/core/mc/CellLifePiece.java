package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.npc.VillagerProfession;
import net.minecraft.world.entity.npc.VillagerType;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import stodd.core.gen.Hash;

/**
 * The people of one 48 x 48 city block (cities and sunken villages): a few villagers, some with a trade they keep (they have
 * traded a little, so they keep it without a workstation), some looking for a job, and now and then an iron golem. Each one has a
 * fixed spot in the block, decided when the block is planned; each chunk adds the ones whose spot it holds, standing on the
 * ground the block was built on, once the block's buildings stand (this piece comes after them).
 */
public final class CellLifePiece extends StructurePiece {
    static final VillagerProfession[] JOBS = {
        VillagerProfession.FARMER, VillagerProfession.LIBRARIAN, VillagerProfession.ARMORER, VillagerProfession.BUTCHER,
        VillagerProfession.CARTOGRAPHER, VillagerProfession.CLERIC, VillagerProfession.FLETCHER, VillagerProfession.FISHERMAN,
        VillagerProfession.LEATHERWORKER, VillagerProfession.MASON, VillagerProfession.SHEPHERD, VillagerProfession.TOOLSMITH,
        VillagerProfession.WEAPONSMITH };

    final int x0, z0, size, street, height, villagers, golems, salt;

    CellLifePiece(int x0, int z0, int size, int street, int height, int villagers, int golems, int salt) {
        super(StoddRegistry.LIFE_PIECE.get(), 0, new BoundingBox(x0, street - 4, z0, x0 + size - 1, street + height + 4, z0 + size - 1));
        this.x0 = x0; this.z0 = z0; this.size = size; this.street = street; this.height = height; this.villagers = villagers; this.golems = golems; this.salt = salt;
    }

    public CellLifePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.LIFE_PIECE.get(), tag);
        x0 = tag.getInt("X0"); z0 = tag.getInt("Z0"); size = tag.getInt("Size"); street = tag.getInt("Street"); height = tag.getInt("H");
        villagers = tag.getInt("V"); golems = tag.getInt("G"); salt = tag.getInt("Salt");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        tag.putInt("X0", x0); tag.putInt("Z0", z0); tag.putInt("Size", size); tag.putInt("Street", street); tag.putInt("H", height);
        tag.putInt("V", villagers); tag.putInt("G", golems); tag.putInt("Salt", salt);
    }

    static boolean open(BlockState s) { return s.isAir() || (!s.blocksMotion() && s.getFluidState().isEmpty() && s.canBeReplaced()); }

    static boolean stand(BlockState s) { return s.blocksMotion() && s.getFluidState().isEmpty() && !(s.getBlock() instanceof BubbleBlock); }

    /** A spot a mob can stand on in column (x, z), from the top of the block's buildings down to just under the street, or -999. */
    int floor(WorldGenLevel level, int x, int z) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int y = street + height + 2; y >= street - 3; y--) {
            m.set(x, y - 1, z);
            if (!stand(level.getBlockState(m))) continue;
            m.set(x, y, z);
            if (!open(level.getBlockState(m))) continue;
            m.set(x, y + 1, z);
            if (!open(level.getBlockState(m))) continue;
            return y;
        }
        return -999;
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        int total = villagers + golems;
        for (int k = 0; k < total; k++) {
            long h = Hash.hash3(x0 + k * 31, z0 - k * 17, salt);                    // 32 bits: where
            long h2 = Hash.hash3(x0 - k * 53, z0 + k * 7, salt ^ 0x7f4a7c15);        // 32 bits: who
            int x = x0 + 4 + (int) (h % (size - 8)), z = z0 + 4 + (int) ((h >>> 16) % (size - 8));
            if (x < box.minX() || x > box.maxX() || z < box.minZ() || z > box.maxZ()) continue;
            // the spot itself, else the nearest open one around it within this chunk
            int fx = x, fz = z, y = floor(level, x, z);
            for (int r = 1; r <= 4 && y == -999; r++) {
                for (int a = -r; a <= r && y == -999; a++) for (int b = -r; b <= r && y == -999; b++) {
                    int qx = x + a, qz = z + b;
                    if (qx < box.minX() || qx > box.maxX() || qz < box.minZ() || qz > box.maxZ()) continue;
                    int qy = floor(level, qx, qz);
                    if (qy != -999) { y = qy; fx = qx; fz = qz; }
                }
            }
            if (y == -999) continue;
            BlockPos pos = new BlockPos(fx, y, fz);
            float yaw = (float) (h2 % 360);
            try {
                if (k < villagers) {
                    Villager v = EntityType.VILLAGER.create(level.getLevel());
                    if (v == null) continue;
                    v.moveTo(fx + 0.5, y, fz + 0.5, yaw, 0.0F);
                    v.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.STRUCTURE, null, null);
                    int pick = (int) ((h2 >>> 9) % 100);
                    VillagerProfession job = pick < 70 ? JOBS[(int) ((h2 >>> 16) % JOBS.length)] : VillagerProfession.NONE;
                    v.setVillagerData(v.getVillagerData().setType(VillagerType.byBiome(level.getBiome(pos))).setProfession(job).setLevel(1));
                    // a little trading done already, so the trade is kept without a workstation
                    if (job != VillagerProfession.NONE) v.setVillagerXp(1);
                    v.setPersistenceRequired();
                    level.addFreshEntityWithPassengers(v);
                } else {
                    IronGolem g = EntityType.IRON_GOLEM.create(level.getLevel());
                    if (g == null) continue;
                    g.moveTo(fx + 0.5, y, fz + 0.5, yaw, 0.0F);
                    g.setPersistenceRequired();
                    level.addFreshEntityWithPassengers(g);
                }
            } catch (Throwable t) {
                // a mod's villager hook failing must never break the world's generation
            }
        }
    }
}
