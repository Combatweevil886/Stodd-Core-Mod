package stodd.core.mc;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.SimpleBitStorage;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraftforge.event.level.ChunkEvent;
import stodd.core.gen.SkyField;

import java.util.EnumSet;

/**
 * The heightmaps of a chunk under a bubble dome. The trees, grass, flowers and animals of a biome are placed from the top of the
 * chunk down (its heightmaps), and over a dome the top is the sea: from there the island is under 30 blocks of water, so nothing
 * grew on it. While the chunk generates, the dome piece points the heightmaps at the island inside the dome instead (its ground,
 * or the water round it), so everything is placed on the island as on any island, and the animals spawn there. Once the chunk is
 * finished (ChunkEvent.Load of a new chunk) they are worked out again from the blocks, so the rain stops at the sea's surface.
 */
public final class DomeHeightmaps {
    private DomeHeightmaps() { }

    static final Heightmap.Types[] ALL = { Heightmap.Types.WORLD_SURFACE_WG, Heightmap.Types.WORLD_SURFACE, Heightmap.Types.OCEAN_FLOOR_WG,
        Heightmap.Types.OCEAN_FLOOR, Heightmap.Types.MOTION_BLOCKING, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES };
    static final EnumSet<Heightmap.Types> FINAL = EnumSet.of(Heightmap.Types.WORLD_SURFACE, Heightmap.Types.OCEAN_FLOOR,
        Heightmap.Types.MOTION_BLOCKING, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES);

    /**
     * Points every heightmap of column (lx, lz) of the chunk at the island inside the dome: ground = the top block (land, or the
     * water round the island), floor = the top solid block. Both are block y values.
     */
    static void set(ChunkAccess chunk, int lx, int lz, int ground, int floor) {
        int minY = chunk.getMinBuildHeight();
        int bits = Mth.ceillog2(chunk.getHeight() + 1);
        for (Heightmap.Types t : ALL) {
            try {
                if (!chunk.hasPrimedHeightmap(t)) Heightmap.primeHeightmaps(chunk, EnumSet.of(t));
                Heightmap h = chunk.getOrCreateHeightmapUnprimed(t);
                // the heightmap's own storage, written through a view of the same array
                SimpleBitStorage view = new SimpleBitStorage(bits, 256, h.getRawData());
                boolean onFloor = t == Heightmap.Types.OCEAN_FLOOR_WG || t == Heightmap.Types.OCEAN_FLOOR;
                int top = (onFloor ? floor : ground) + 1 - minY;
                view.set(lx + lz * 16, Mth.clamp(top, 0, chunk.getHeight()));
            } catch (Throwable ignored) {
                // a heightmap that cannot be pointed at the island keeps the sea's surface: only the plants there are missing
            }
        }
    }

    /** A finished chunk under a dome: its heightmaps from the blocks again (the sea's surface on top). */
    public static void onChunkLoad(ChunkEvent.Load event) {
        try {
            if (!event.isNewChunk() || !(event.getLevel() instanceof ServerLevel)) return;
            ServerLevel level = (ServerLevel) event.getLevel();
            if (level.dimension() != net.minecraft.world.level.Level.OVERWORLD) return;
            ChunkAccess chunk = event.getChunk();
            SkyField f = Worlds.skyField(level.getChunkSource().randomState());
            if (f == null || !f.p.deepOn()) return;
            int x0 = chunk.getPos().getMinBlockX(), z0 = chunk.getPos().getMinBlockZ();
            boolean dome = false;
            for (int dx = 0; dx < 16 && !dome; dx += 5) for (int dz = 0; dz < 16 && !dome; dz += 5) dome = f.domeAt(x0 + dx, z0 + dz) != null;
            if (dome) Heightmap.primeHeightmaps(chunk, FINAL);
        } catch (Throwable ignored) {
            // never break a chunk load
        }
    }
}
