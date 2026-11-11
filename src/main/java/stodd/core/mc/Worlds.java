package stodd.core.mc;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.RandomState;
import stodd.core.gen.CityPlanner;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.IslandIndex;
import stodd.core.gen.IslePlanner;
import stodd.core.gen.WorldRules;

import java.util.Map;
import java.util.WeakHashMap;

/**
 * One set of island tools per world (per RandomState: the object that holds the world's noise, shared by the chunk generator and
 * the server level). The island finder reads the continentalness function the terrain is made from, the sky finder the world's
 * final density at the sky islands' probe height, so the answers are exactly what the generator builds. Rebuilt when the rules change.
 */
public final class Worlds {
    private Worlds() { }

    public static final class Tools {
        public final WorldRules rules;
        public final IslandFinder ground, sky;
        public final IslandIndex index;
        public final CityPlanner cities;
        public final IslePlanner isles;
        Tools(WorldRules rules, IslandFinder ground, IslandFinder sky) {
            this.rules = rules; this.ground = ground; this.sky = sky;
            this.index = new IslandIndex(ground, sky, rules.skyMinRadius);
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
            IslandFinder sky = rules.skyEnabled
                ? new IslandFinder((x, z) -> density.compute(new DensityFunction.SinglePointContext(x, probeY, z)), 1e-6, rules.peakStep, rules.cell, true)
                : null;
            t = new Tools(rules, ground, sky);
            TOOLS.put(rs, t);
            return t;
        }
    }

    public static Tools of(ServerLevel level) { return of(level.getChunkSource().randomState()); }

    /** The scripts' seed for a level (see WorldRules.scriptSeed). */
    public static int seed(ServerLevel level) { return WorldRules.scriptSeed(level.getSeed()); }
}
