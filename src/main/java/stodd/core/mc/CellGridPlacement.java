package stodd.core.mc;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.chunk.ChunkGeneratorStructureState;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacementType;

import java.util.Optional;

/**
 * Offers every chunk that starts a 48 x 48 cell of the island grid (chunk x and z both multiples of 3): one structure start per
 * cell. Whether the cell is part of a city, a dressed island or a sky island is decided by the structure itself, from the island
 * the cell lies on, so most offers are turned down after one look at the terrain function.
 */
public final class CellGridPlacement extends StructurePlacement {
    public static final Codec<CellGridPlacement> CODEC = RecordCodecBuilder.create(i -> i.group(
        Codec.intRange(1, 16).optionalFieldOf("cell_chunks", 3).forGetter(p -> p.cellChunks)
    ).apply(i, CellGridPlacement::new));

    private final int cellChunks;

    public CellGridPlacement(int cellChunks) {
        super(Vec3i.ZERO, FrequencyReductionMethod.DEFAULT, 1f, 0, Optional.empty());
        this.cellChunks = cellChunks;
    }

    @Override
    protected boolean isPlacementChunk(ChunkGeneratorStructureState state, int chunkX, int chunkZ) {
        return Math.floorMod(chunkX, cellChunks) == 0 && Math.floorMod(chunkZ, cellChunks) == 0;
    }

    @Override
    public StructurePlacementType<?> type() {
        return StoddRegistry.CELL_GRID.get();
    }
}
