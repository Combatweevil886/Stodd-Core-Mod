package stodd.core.mc;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;
import stodd.core.gen.CityPlanner;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.WorldRules;

import java.util.Optional;

/**
 * stodd:city_block - one 48 x 48 block of a city island, generated with its chunks like any structure.
 *
 * The cell-grid placement offers each cell's first chunk; this looks up the island the cell is on (IslandFinder), whether that
 * island is a city and of which style (WorldRules, the same rule the scripts use), and the island's plan (CityPlanner: street level,
 * which template goes on which cell, rotation). It then adds the cell's ground work (clear above the street, foundation below,
 * the style's biome) and the template. No commands, no ticking, nothing built while a player watches.
 */
public final class CityStructure extends Structure {
    public static final Codec<CityStructure> CODEC = RecordCodecBuilder.create(i -> i.group(settingsCodec(i)).apply(i, CityStructure::new));

    public CityStructure(StructureSettings settings) { super(settings); }

    @Override
    public Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        WorldRules rules = WorldRules.get();
        if (!rules.cityEnabled || rules.styles.isEmpty()) return Optional.empty();
        ChunkPos cp = ctx.chunkPos();
        int cell = rules.cell, half = cell / 2;
        int x0 = cp.getMinBlockX(), z0 = cp.getMinBlockZ();
        if (Math.floorMod(x0, cell) != 0 || Math.floorMod(z0, cell) != 0) return Optional.empty();
        Worlds.Tools tools = Worlds.of(ctx.randomState());
        int mx = x0 + half, mz = z0 + half;
        if (tools.ground.sample(mx, mz) < rules.landThreshold) return Optional.empty();
        IslandFinder.Island isl = tools.ground.islandAt(mx, mz);
        if (isl == null) return Optional.empty();
        int seed = WorldRules.scriptSeed(ctx.seed());
        if (rules.cityStyleAt(isl.cx, isl.cz, seed) == null) return Optional.empty();
        CityPlanner.Plan plan = tools.cities.plan(tools.ground, isl,
            (x, z) -> ctx.chunkGenerator().getBaseHeight(x, z, Heightmap.Types.OCEAN_FLOOR_WG, ctx.heightAccessor(), ctx.randomState()), seed);
        if (plan == null) return Optional.empty();
        CityPlanner.Cell c = plan.cellAt(x0, z0);
        if (c == null) return Optional.empty();
        WorldRules.Style st = rules.styles.get(plan.style);
        int g = plan.street;
        int foundLo = Math.max(rules.floorMin, g - rules.foundationMax);
        int bioHi = g + Math.min(rules.biomeAbove, c.height + 8);
        int top = Math.max(g + c.height + 1, rules.cutCap);
        final CellGroundPiece ground = new CellGroundPiece(CellGroundPiece.CITY, x0, z0, cell, g, c.height, rules.cutCap, foundLo, g, g,
            st.foundation, st.biome, g - rules.biomeBelow, bioHi, java.util.Collections.emptyList(),
            0, 0, 0, 0, 0, 0, 0, 0, foundLo, top);
        int[] o = c.origin(cell);
        final ResourceLocation tpl = new ResourceLocation("stodd", "city/" + c.template);
        final BlockPos origin = new BlockPos(o[0], g, o[1]);
        final int rot = c.rot;
        return Optional.of(new GenerationStub(new BlockPos(mx, g, mz), builder -> {
            builder.addPiece(ground);
            builder.addPiece(new CellTemplatePiece(ctx.structureTemplateManager(), tpl, CellTemplatePiece.rotation(rot), origin));
        }));
    }

    @Override
    public StructureType<?> type() { return StoddRegistry.CITY.get(); }
}
