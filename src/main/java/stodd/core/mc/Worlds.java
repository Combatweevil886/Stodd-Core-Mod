package stodd.core.mc;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.RandomState;
import stodd.core.gen.CityPlanner;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslandIndex;
import stodd.core.gen.IslePlanner;
import stodd.core.gen.SkyField;
import stodd.core.gen.WorldRules;

import java.util.Map;
import java.util.WeakHashMap;

/**
 * One set of island tools per world (per RandomState: the object that holds the world's noise, shared by the chunk generator and
 * the server level). The island finder reads the continentalness function the ground terrain is made from (lifted islands are no
 * longer in it), the sky finder the sky islands of the world's SkyField (the lifted ones), so the answers are exactly what the
 * generator builds. Worlds without the STODD sky functions (another world type) fall back to probing the final density.
 * Rebuilt when the rules change.
 */
public final class Worlds {
    private Worlds() { }

    public static final class Tools {
        public final WorldRules rules;
        public final IslandFinder ground, sky, deep;   // deep: the sunken islands (null: none)
        public final SkyField skyField;          // null: not an island world of this mod
        public final int skyMinY, skyMinRadius;  // a player above skyMinY over a sky island is on it; smaller islands are not listed
        public final IslandIndex index;
        public final CityPlanner cities;
        public final IslePlanner isles;
        Tools(WorldRules rules, IslandFinder ground, IslandFinder sky, SkyField field) {
            this.rules = rules; this.ground = ground; this.sky = sky; this.skyField = field;
            this.deep = field != null && field.p.deepEnabled && field.p.deepChance > 0
                ? new IslandFinder(field.deepOnly(), field.p.landThreshold, rules.peakStep, rules.cell) : null;
            this.skyMinY = field != null ? field.p.lowestSurface() - 24 : rules.skyMinY;
            this.skyMinRadius = field != null ? 0 : rules.skyMinRadius;
            this.index = new IslandIndex(ground, sky, deep, skyMinRadius, skyMinY);
            this.cities = new CityPlanner(rules);
            this.isles = new IslePlanner(rules);
        }
    }

    private static final Map<RandomState, Tools> TOOLS = new WeakHashMap<>();

    public static Tools of(RandomState rs) {
        WorldRules rules = WorldRules.get();
        synchronized (TOOLS) {
            Tools t = TOOLS.get(rs);
            if (t != null && t.rules == rules) return t;
            final DensityFunction continents = rs.router().continents();
            final DensityFunction density = rs.router().finalDensity();
            final int probeY = rules.skyProbeY;
            IslandFinder ground = new IslandFinder((x, z) -> continents.compute(new DensityFunction.SinglePointContext(x, 64, z)), rules.landThreshold, rules.peakStep, rules.cell);
            SkyField field = skyField(rs);
            IslandFinder sky;
            if (field != null) {
                sky = field.p.enabled && field.p.chance > 0 && rules.skyEnabled ? new IslandFinder(field.skyOnly(), field.p.landThreshold, rules.peakStep, rules.cell) : null;
                if (sky != null) sky.innerMargin = 0.05;   // off the beach: where a lifted island is solid and level enough to build on
            }
            else sky = rules.skyEnabled
                ? new IslandFinder((x, z) -> density.compute(new DensityFunction.SinglePointContext(x, probeY, z)), 1e-6, rules.peakStep, rules.cell, true)
                : null;
            t = new Tools(rules, ground, sky, field);
            TOOLS.put(rs, t);
            return t;
        }
    }

    /** The SkyField the world's density functions were wired with, or null. */
    public static SkyField skyField(RandomState rs) {
        try {
            DensityFunction c = rs.router().continents();
            if (c instanceof SkyDensity && ((SkyDensity) c).field() != null) return ((SkyDensity) c).field();
            final SkyField[] found = { null };
            rs.router().finalDensity().mapAll(f -> {
                if (found[0] == null && f instanceof SkyDensity && ((SkyDensity) f).field() != null) found[0] = ((SkyDensity) f).field();
                return f;
            });
            return found[0];
        } catch (Throwable t) {
            return null;
        }
    }

    public static Tools of(ServerLevel level) { return of(level.getChunkSource().randomState()); }

    /** The scripts' seed for a level (see WorldRules.scriptSeed). */
    public static int seed(ServerLevel level) { return WorldRules.scriptSeed(level.getSeed()); }
}
