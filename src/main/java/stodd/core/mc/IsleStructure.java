package stodd.core.mc;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslePlanner;
import stodd.core.gen.WorldRules;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * stodd:isle_block (kind "ground") - one 48 x 48 cell of a dressed island (Ember, Sakura, Overgrown Ruins, Crystal, Skull Cove):
 * the surface repainted by the theme's rules, the theme's biome and, on some cells, a landmark (the big centrepiece in the middle).
 * stodd:sky_block (kind "sky") - one cell of a floating sky island: the sky biome, trees / flowers / boulders and the odd ruin.
 * Both are generated with their chunks; IslePlanner decides the layout once per island.
 */
public final class IsleStructure extends Structure {
    public static final Codec<IsleStructure> CODEC = RecordCodecBuilder.create(i -> i.group(
        settingsCodec(i),
        Codec.STRING.optionalFieldOf("kind", "ground").forGetter(s -> s.kind)
    ).apply(i, IsleStructure::new));

    private final String kind;

    public IsleStructure(StructureSettings settings, String kind) {
        super(settings);
        this.kind = kind;
    }

    @Override
    public Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        WorldRules rules = WorldRules.get();
        ChunkPos cp = ctx.chunkPos();
        int cell = rules.cell, half = cell / 2;
        int x0 = cp.getMinBlockX(), z0 = cp.getMinBlockZ();
        if (Math.floorMod(x0, cell) != 0 || Math.floorMod(z0, cell) != 0) return Optional.empty();
        Worlds.Tools tools = Worlds.of(ctx.randomState());
        int mx = x0 + half, mz = z0 + half;
        int seed = WorldRules.scriptSeed(ctx.seed());
        Heights h = (x, z) -> ctx.chunkGenerator().getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, ctx.heightAccessor(), ctx.randomState());
        if ("sky".equals(kind)) {
            if (tools.sky == null || !rules.skyDress) return Optional.empty();
            if (!(tools.sky.sample(mx, mz) > 0)) {
                // a cell whose middle is open air may still be the edge of an island: look at its corners
                boolean any = false;
                for (int a = 4; a < cell && !any; a += cell - 9) for (int b = 4; b < cell && !any; b += cell - 9) any = tools.sky.sample(x0 + a, z0 + b) > 0;
                if (!any) return Optional.empty();
            }
            IslandFinder.Island isl = tools.sky.islandAt(mx, mz);
            if (isl == null) {
                for (int a = 4; a < cell && isl == null; a += cell - 9) for (int b = 4; b < cell && isl == null; b += cell - 9)
                    if (tools.sky.sample(x0 + a, z0 + b) > 0) isl = tools.sky.islandAt(x0 + a, z0 + b);
            }
            if (isl == null) return Optional.empty();
            IslePlanner.Plan plan = tools.isles.sky(tools.sky, isl, seed);
            if (plan == null) return Optional.empty();
            IslePlanner.Cell c = plan.cellAt(x0, z0);
            if (c == null) return Optional.empty();
            return Optional.of(stub(ctx, rules, c, true, null, rules.skyFoundation, rules.skyBiome, rules.skyBiomeLow, rules.skyBiomeHigh, h, plan, mx, mz));
        }
        if (!rules.isleEnabled || rules.isles.isEmpty()) return Optional.empty();
        if (tools.ground.sample(mx, mz) < rules.landThreshold) return Optional.empty();
        IslandFinder.Island isl = tools.ground.islandAt(mx, mz);
        if (isl == null) return Optional.empty();
        WorldRules.IsleTheme th = rules.isleAt(isl.cx, isl.cz, seed);
        if (th == null) return Optional.empty();
        IslePlanner.Plan plan = tools.isles.ground(tools.ground, isl, seed);
        if (plan == null) return Optional.empty();
        IslePlanner.Cell c = plan.cellAt(x0, z0);
        if (c == null) return Optional.empty();
        return Optional.of(stub(ctx, rules, c, false, th, th.foundation, th.biome, 0, 0, h, plan, mx, mz));
    }

    interface Heights { int at(int x, int z); }

    private GenerationStub stub(GenerationContext ctx, WorldRules rules, IslePlanner.Cell c, boolean sky, WorldRules.IsleTheme th, String foundation,
                                String biome, int bioLo, int bioHi, Heights h, IslePlanner.Plan plan, int mx, int mz) {
        int cell = rules.cell;
        // how high the ground is in this cell (3 x 3 samples; columns of a sky island overhead are left out on the ground)
        int lo = Integer.MAX_VALUE, hi = Integer.MIN_VALUE;
        for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) {
            int y = h.at(c.x + 1 + a * 23, c.z + 1 + b * 23);
            if (!sky && y > 190) continue;
            if (sky && y < 140) continue;
            lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
        if (lo > hi) { lo = sky ? rules.skyMinY : 64; hi = lo; }
        if (!sky) { bioLo = lo - rules.isleBiomeBelow; bioHi = hi + rules.isleBiomeAbove; }
        // the landmark (if any)
        int fx = 0, fz = 0, fw = 0, fd = 0, y0 = 0, clr = 0, top = 0, fLo = 0;
        ResourceLocation tpl = null;
        BlockPos origin = null;
        int rot = 0;
        IslePlanner.Mark mk = c.mark;
        WorldRules.Landmark lm = mk == null ? null : rules.landmarks.get(mk.id);
        if (lm != null) {
            int[] hs = new int[9];
            int n = 0;
            for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) hs[n++] = h.at(mk.fx + (mk.fw - 1) * a / 2, mk.fz + (mk.fd - 1) * b / 2);
            Arrays.sort(hs);
            int ground = hs[4];
            y0 = ground - lm.foot;
            clr = ground;
            top = Math.min(sky ? 318 : rules.isleCutCap, ground + lm.sy - lm.foot + 1 + 14);   // + room for trees on the footprint
            fLo = Math.max(rules.floorMin, y0 - rules.isleFoundationMax);
            fx = mk.fx; fz = mk.fz; fw = mk.fw; fd = mk.fd;
            tpl = new ResourceLocation("stodd", "isle/" + mk.id);
            int[] o = mk.origin(lm);
            origin = new BlockPos(o[0], y0, o[1]);
            rot = mk.rot;
        }
        List<String[]> paint = sky || th == null ? Collections.emptyList() : th.paint;
        int yMin = Math.max(rules.floorMin, Math.min(lo - 4, lm == null ? lo : fLo));
        int yMax = Math.max(hi + 2, lm == null ? hi : top);
        final CellGroundPiece ground = new CellGroundPiece(sky ? CellGroundPiece.SKY : CellGroundPiece.ISLE, c.x, c.z, cell, 0, 0, 0, 0, lo, hi,
            foundation, biome, bioLo, bioHi, paint, fx, fz, fw, fd, y0, clr, top, fLo, yMin, yMax);
        final ResourceLocation ftpl = tpl;
        final BlockPos forigin = origin;
        final int frot = rot;
        final CellFeaturePiece feats;
        if (sky && !c.features.isEmpty() && plan.skyStyle != null) {
            List<String> ids = new ArrayList<>();
            for (WorldRules.Weighted w : plan.skyStyle.features) ids.add(w.id);
            feats = new CellFeaturePiece(c.x, c.z, cell, rules.skyMinY, 318, new ArrayList<>(c.features), ids);
        } else feats = null;
        return new GenerationStub(new BlockPos(mx, Math.max(lo, ctx.heightAccessor().getMinBuildHeight() + 1), mz), builder -> {
            builder.addPiece(ground);
            if (ftpl != null) builder.addPiece(new CellTemplatePiece(ctx.structureTemplateManager(), ftpl, CellTemplatePiece.rotation(frot), forigin));
            if (feats != null) builder.addPiece(feats);
        });
    }

    @Override
    public StructureType<?> type() { return StoddRegistry.ISLE.get(); }
}
