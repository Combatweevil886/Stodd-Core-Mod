package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.ConfiguredFeature;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** The trees, flowers and boulders of a sky-island cell: configured features (minecraft:oak ...), each placed by the chunk it falls in. */
public final class CellFeaturePiece extends StructurePiece {
    private final List<int[]> spots;          // x, z, index into features
    private final List<String> features;
    private final int minY;

    CellFeaturePiece(int x0, int z0, int size, int minY, int maxY, List<int[]> spots, List<String> features) {
        super(StoddRegistry.FEATURE_PIECE.get(), 0, new BoundingBox(x0, minY, z0, x0 + size - 1, maxY, z0 + size - 1));
        this.spots = spots;
        this.features = features;
        this.minY = minY;
    }

    public CellFeaturePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.FEATURE_PIECE.get(), tag);
        spots = new ArrayList<>();
        int[] raw = tag.getIntArray("Spots");
        for (int i = 0; i + 2 < raw.length; i += 3) spots.add(new int[] { raw[i], raw[i + 1], raw[i + 2] });
        features = new ArrayList<>();
        ListTag fl = tag.getList("Features", Tag.TAG_STRING);
        for (int i = 0; i < fl.size(); i++) features.add(fl.getString(i));
        minY = tag.getInt("MinY");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        int[] raw = new int[spots.size() * 3];
        for (int i = 0; i < spots.size(); i++) { raw[i * 3] = spots.get(i)[0]; raw[i * 3 + 1] = spots.get(i)[1]; raw[i * 3 + 2] = spots.get(i)[2]; }
        tag.putIntArray("Spots", raw);
        ListTag fl = new ListTag();
        for (String f : features) fl.add(net.minecraft.nbt.StringTag.valueOf(f));
        tag.put("Features", fl);
        tag.putInt("MinY", minY);
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box, ChunkPos chunkPos, BlockPos pivot) {
        for (int[] s : spots) {
            if (s[0] < box.minX() || s[0] > box.maxX() || s[1] < box.minZ() || s[1] > box.maxZ()) continue;
            if (s[2] < 0 || s[2] >= features.size()) continue;
            int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, s[0], s[1]);
            if (y < minY) continue;
            ResourceLocation rl = ResourceLocation.tryParse(features.get(s[2]));
            if (rl == null) continue;
            Optional<? extends Holder<ConfiguredFeature<?, ?>>> f = level.registryAccess().registryOrThrow(Registries.CONFIGURED_FEATURE).getHolder(ResourceKey.create(Registries.CONFIGURED_FEATURE, rl));
            if (f.isEmpty()) continue;
            f.get().value().place(level, generator, random, new BlockPos(s[0], y, s[1]));
        }
    }
}
