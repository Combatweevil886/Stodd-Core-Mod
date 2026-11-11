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
import stodd.core.gen.Hash;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.SkyField;
import stodd.core.gen.WorldRules;

import java.util.Optional;

/**
 * stodd:city_block - one 48 x 48 block of a city island, generated with its chunks like any structure.
 *
 * The cell-grid placement offers each cell's first chunk; this looks up the island the cell is on (IslandFinder), whether that
 * island is a city and of which style (WorldRules, the same rule the scripts use), and the island's plan (CityPlanner: street level,
 * which template goes on which cell, rotation). It then adds the cell's ground work (clear above the street, foundation below,
 * the style's biome), the template and the block's villagers. A sunken island may get a village the same way, from one style's
 * templates that fit under its dome's roof (the clearing never touches the roof). No commands, no ticking, nothing built while a
 * player watches.
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
        int seed = WorldRules.scriptSeed(ctx.seed());
        CityPlanner.Heights heights = (x, z) -> ctx.chunkGenerator().getBaseHeight(x, z, Heightmap.Types.OCEAN_FLOOR_WG, ctx.heightAccessor(), ctx.randomState());
        if (tools.ground.sample(mx, mz) >= rules.landThreshold) {
            IslandFinder.Island isl = tools.ground.islandAt(mx, mz);
            if (isl != null && rules.cityStyleAt(isl.cx, isl.cz, seed) != null) {
                CityPlanner.Plan plan = tools.cities.plan(tools.ground, isl, heights, seed);
                if (plan != null) {
                    CityPlanner.Cell c = plan.cellAt(x0, z0);
                    if (c != null) return Optional.of(stub(ctx, rules, plan, c, x0, z0, mx, mz, seed, null));
                }
            }
        }
        // a sunken island's village, under its dome
        if (tools.deep != null && tools.skyField != null && rules.deepVillages > 0 && tools.deep.isLand(mx, mz)) {
            IslandFinder.Island isl = tools.deep.islandAt(mx, mz);
            final SkyField.Dome d = tools.skyField.domeAt(mx, mz);
            if (isl == null || d == null) return Optional.empty();
            double u = (Hash.hash3(isl.cx - 77, isl.cz + 91, seed ^ 0x6d2b79f5) & 0xffffff) / (double) 0x1000000;
            if (u >= rules.deepVillages) return Optional.empty();
            int lo = (int) d.base + 1, hi = (int) (d.base + d.up * 0.45);
            CityPlanner.Plan plan = tools.cities.planDeep(tools.deep, isl, heights, seed, rules.deepVillageStyle, rules.deepVillageRadius, lo, Math.max(lo, hi),
                (cx0, cz0, cell2, street) -> {
                    // the lowest roof over the cell's four corners, 3 blocks of air kept under it
                    double low = Double.MAX_VALUE;
                    int[][] pts = { { cx0, cz0 }, { cx0 + cell2 - 1, cz0 }, { cx0, cz0 + cell2 - 1 }, { cx0 + cell2 - 1, cz0 + cell2 - 1 } };
                    for (int[] pt : pts) low = Math.min(low, d.ceiling(pt[0], pt[1]));
                    return (int) Math.floor(low) - street - 3;
                });
            if (plan == null) return Optional.empty();
            CityPlanner.Cell c = plan.cellAt(x0, z0);
            if (c == null) return Optional.empty();
            return Optional.of(stub(ctx, rules, plan, c, x0, z0, mx, mz, seed, d));
        }
        return Optional.empty();
    }

    private GenerationStub stub(GenerationContext ctx, WorldRules rules, CityPlanner.Plan plan, CityPlanner.Cell c, int x0, int z0, int mx, int mz, int seed, SkyField.Dome dome) {
        int cell = rules.cell;
        WorldRules.Style st = rules.styles.get(plan.style);
        int g = plan.street;
        int foundLo = Math.max(rules.floorMin, g - rules.foundationMax);
        int bioHi = g + Math.min(rules.biomeAbove, c.height + 8);
        int cutCap = dome == null ? rules.cutCap : (int) (dome.base + dome.up) - 2;
        int top = Math.max(g + c.height + 1, cutCap);
        // a sunken village keeps the island's own biome
        String biome = dome == null ? st.biome : "";
        final CellGroundPiece ground = new CellGroundPiece(CellGroundPiece.CITY, x0, z0, cell, g, c.height, cutCap, foundLo, g, g,
            st.foundation, biome, g - rules.biomeBelow, bioHi, java.util.Collections.emptyList(),
            0, 0, 0, 0, 0, 0, 0, 0, foundLo, top);
        if (dome != null) ground.underRoof(dome.cx, dome.cz, dome.r, dome.base, dome.up);
        int[] o = c.origin(cell);
        final ResourceLocation tpl = new ResourceLocation("stodd", "city/" + c.template);
        final BlockPos origin = new BlockPos(o[0], g, o[1]);
        final int rot = c.rot;
        // the block's people: villagers per block on average (two more on the plaza), now and then an iron golem
        double u = (Hash.hash3(x0 + 13, z0 - 29, seed ^ 0x1d872b41) & 0xffffff) / (double) 0x1000000;
        double u2 = (Hash.hash3(x0 - 41, z0 + 7, seed ^ 0x3c6ef372) & 0xffffff) / (double) 0x1000000;
        int villagers = (int) Math.floor(rules.villagers) + (u < rules.villagers - Math.floor(rules.villagers) ? 1 : 0) + (c.plaza && rules.villagers > 0 ? 2 : 0);
        int golems = (int) Math.floor(rules.golems) + (u2 < rules.golems - Math.floor(rules.golems) ? 1 : 0);
        final CellLifePiece life = villagers + golems > 0
            ? new CellLifePiece(x0, z0, cell, g, Math.max(6, c.height), villagers, golems, seed ^ (int) Hash.hash3(x0, z0, 0x2f1a))
            : null;
        return new GenerationStub(new BlockPos(mx, g, mz), builder -> {
            builder.addPiece(ground);
            builder.addPiece(new CellTemplatePiece(ctx.structureTemplateManager(), tpl, CellTemplatePiece.rotation(rot), origin));
            if (life != null) builder.addPiece(life);
        });
    }

    @Override
    public StructureType<?> type() { return StoddRegistry.CITY.get(); }
}
