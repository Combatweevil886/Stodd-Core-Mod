package stodd.core.mc;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.DensityFunctions;
import stodd.core.StoddCore;
import stodd.core.config.StoddConfig;
import stodd.core.gen.SkyField;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * stodd_core:sky - the density functions of the lifted sky islands (see {@link SkyField}). One type with a "mode":
 *   ground              the ground's continentalness: the raw value, with lifted islands pulled under the coast
 *   mask                0..1 inside a sky island (coast .. middle), -1 elsewhere
 *   continents          the continentalness the sky terrain is made from (-1 where there is no sky island)
 *   ridges              "argument" (the weirdness) moved off the river band
 *   lift / relief       how far the sky terrain is raised (depth units) and how tall its hills are kept
 *   bottom / ceiling    the underside of the island here (1000 where there is none) and the highest block a sky island may have
 *   climate_continents  the continentalness the biomes are chosen with: "argument" (the ground's), or the island's up in the sky
 *   climate_ridges      the same for the weirdness
 *   deep_mask           > 0 where a sunken island's bubble dome covers the column, -1 elsewhere
 *   dome                the dome's shape at the point (< 1 inside, 1000 where there is none)
 *   deep_continents / deep_lift / deep_relief   the sunken island's terrain (its own continentalness, lowered)
 *   deep_ceiling / deep_apron                   the roof the terrain stays under, and the flat floor of the dome
 * "raw" is the raw continentalness (Survival Island's function), "noise" the underside noise. The settings are read from the STODD
 * config when the world is created (when its RandomState wires the functions), so a new world picks up a changed config.
 */
public final class SkyDensity implements DensityFunction {
    static final String[] MODES = { "ground", "mask", "continents", "ridges", "lift", "relief", "bottom", "ceiling", "climate_continents", "climate_ridges",
        "deep_mask", "dome", "deep_continents", "deep_lift", "deep_relief", "deep_ceiling", "deep_apron" };
    static final int GROUND = 0, MASK = 1, CONT = 2, RIDGES = 3, LIFT = 4, RELIEF = 5, BOTTOM = 6, CEILING = 7, CLIMATE_CONT = 8, CLIMATE_RIDGES = 9,
        DEEP_MASK = 10, DOME = 11, DEEP_CONT = 12, DEEP_LIFT = 13, DEEP_RELIEF = 14, DEEP_CEILING = 15, DEEP_APRON = 16;

    public static final MapCodec<SkyDensity> MAP_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
        Codec.STRING.fieldOf("mode").forGetter(s -> s.mode),
        DensityFunction.HOLDER_HELPER_CODEC.fieldOf("raw").forGetter(s -> s.raw),
        DensityFunction.HOLDER_HELPER_CODEC.optionalFieldOf("argument", DensityFunctions.zero()).forGetter(s -> s.argument),
        DensityFunction.NoiseHolder.CODEC.fieldOf("noise").forGetter(s -> s.noise)
    ).apply(i, (m, r, a, n) -> new SkyDensity(m, r, a, n, null)));
    public static final KeyDispatchDataCodec<SkyDensity> CODEC = KeyDispatchDataCodec.of(MAP_CODEC);

    final String mode;
    final int m;
    final DensityFunction raw, argument;
    final DensityFunction.NoiseHolder noise;
    final SkyField field;

    SkyDensity(String mode, DensityFunction raw, DensityFunction argument, DensityFunction.NoiseHolder noise, SkyField field) {
        this.mode = mode;
        int k = 0;
        for (int i = 0; i < MODES.length; i++) if (MODES[i].equals(mode)) k = i;
        this.m = k;
        this.raw = raw;
        this.argument = argument;
        this.noise = noise;
        this.field = field;
    }

    /** The sky field of a wired function (null before the world's RandomState wired it). */
    public SkyField field() { return field; }

    @Override
    public double compute(FunctionContext c) {
        SkyField f = field;
        if (f == null) {
            switch (m) {
                case GROUND: return raw.compute(c);
                case CLIMATE_CONT: case CLIMATE_RIDGES: case RIDGES: return argument.compute(c);
                case MASK: case CONT: case DEEP_MASK: case DEEP_CONT: return -1;
                case DOME: return 1000;
                case DEEP_CEILING: case DEEP_APRON: return -64;
                case RELIEF: case DEEP_RELIEF: return 1;
                case BOTTOM: return 1000;
                case CEILING: return 316;
                default: return 0;
            }
        }
        int x = c.blockX(), z = c.blockZ();
        switch (m) {
            case GROUND: return f.ground(x, z, raw.compute(c));
            case MASK: return f.mask(x, z);
            case CONT: return f.continents(x, z);
            case RIDGES: return SkyField.pushRidges(argument.compute(c));
            case LIFT: return f.lift(x, z);
            case RELIEF: return f.relief();
            case BOTTOM: return f.bottom(x, z);
            case CEILING: return f.ceiling();
            case CLIMATE_CONT: {
                int y = c.blockY();
                return f.skyClimate(x, y, z) || f.domeClimate(x, y, z) ? f.climateContinents(x, z) : argument.compute(c);
            }
            case CLIMATE_RIDGES: {
                double w = argument.compute(c);
                int y = c.blockY();
                return f.skyClimate(x, y, z) || f.domeClimate(x, y, z) ? SkyField.pushRidges(w) : w;
            }
            case DEEP_MASK: return f.deepMask(x, z);
            case DOME: return f.domeShape(x, c.blockY(), z);
            case DEEP_CONT: return f.deepContinents(x, z);
            case DEEP_LIFT: return f.deepLift(x, z);
            case DEEP_RELIEF: return f.deepRelief();
            case DEEP_CEILING: return f.deepCeiling(x, z);
            case DEEP_APRON: return f.deepApron(x, z);
            default: return 0;
        }
    }

    @Override
    public void fillArray(double[] values, ContextProvider provider) { provider.fillAllDirectly(values, this); }

    @Override
    public DensityFunction mapAll(Visitor visitor) {
        DensityFunction r2 = raw.mapAll(visitor);
        DensityFunction a2 = argument.mapAll(visitor);
        DensityFunction.NoiseHolder n2 = visitor.visitNoise(noise);
        SkyField f = field;
        // the world's RandomState is the visitor that seeds the noises: the moment to build the field (once per world)
        if (f == null && n2.noise() != null) f = fieldFor(visitor, r2, n2);
        return visitor.apply(new SkyDensity(mode, r2, a2, n2, f));
    }

    @Override
    public double minValue() {
        switch (m) {
            case GROUND: return raw.minValue();
            case MASK: case CONT: return -1;
            case RIDGES: return -1;
            case LIFT: return -1;
            case RELIEF: return 0;
            case BOTTOM: return -64;
            case CEILING: return 0;
            case CLIMATE_CONT: return Math.min(-1, argument.minValue());
            case CLIMATE_RIDGES: return Math.min(-1, argument.minValue());
            case DEEP_MASK: case DEEP_CONT: return -1;
            case DOME: return 0;
            case DEEP_LIFT: return -3;
            case DEEP_RELIEF: return 0;
            case DEEP_CEILING: case DEEP_APRON: return -64;
            default: return -1;
        }
    }

    @Override
    public double maxValue() {
        switch (m) {
            case GROUND: return raw.maxValue();
            case MASK: return 1;
            case CONT: return Math.max(1.5, raw.maxValue());
            case RIDGES: return 1;
            case LIFT: return 3;
            case RELIEF: return 2;
            case BOTTOM: return 1000;
            case CEILING: return 400;
            case CLIMATE_CONT: return Math.max(argument.maxValue(), Math.max(1.5, raw.maxValue()));
            case CLIMATE_RIDGES: return Math.max(1, argument.maxValue());
            case DEEP_MASK: return 1;
            case DOME: return 1000;
            case DEEP_CONT: return Math.max(1.5, raw.maxValue());
            case DEEP_LIFT: return 1;
            case DEEP_RELIEF: return 2;
            case DEEP_CEILING: case DEEP_APRON: return 320;
            default: return 1;
        }
    }

    @Override
    public KeyDispatchDataCodec<? extends DensityFunction> codec() { return CODEC; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SkyDensity)) return false;
        SkyDensity s = (SkyDensity) o;
        return m == s.m && field == s.field && raw.equals(s.raw) && argument.equals(s.argument) && noise.equals(s.noise);
    }

    @Override
    public int hashCode() { return Objects.hash(m, raw, argument, noise, System.identityHashCode(field)); }

    // ---------------------------------------------------------------- one field per world

    private static final Map<String, SkyField> FIELDS = new LinkedHashMap<String, SkyField>() {
        @Override protected boolean removeEldestEntry(Map.Entry<String, SkyField> e) { return size() > 8; }
    };

    private static SkyField fieldFor(Visitor visitor, DensityFunction wiredRaw, DensityFunction.NoiseHolder n) {
        long seed = seedOf(visitor, n);
        SkyField.Params p = StoddConfig.get().skyParams();
        String key = seed + "|" + p.key();
        synchronized (FIELDS) {
            SkyField f = FIELDS.get(key);
            if (f != null) return f;
            final DensityFunction rawFn = wiredRaw;
            final DensityFunction.NoiseHolder nh = n;
            f = new SkyField(seed, p,
                (x, z) -> rawFn.compute(new DensityFunction.SinglePointContext(x, 0, z)),
                (x, z) -> nh.getValue(x, 0, z));
            FIELDS.put(key, f);
            StoddCore.LOG.info("[STODD Core] sky islands: {} ({} of the islands lifted to about y {}); sunken islands: {} ({} of the islands under bubble domes, floor at y {}, top at y {}); settings from config/stodd/world.toml",
                p.enabled && p.chance > 0 ? "on" : "off", p.chance, p.height, p.deepEnabled && p.deepChance > 0 ? "on" : "off", p.deepChance, p.deepCoast, p.domeTop());
            return f;
        }
    }

    /** The world seed: Survival Island's seed hook on the wiring helper, else the helper's own captured seed, else one made from the seeded noise. */
    static long seedOf(Visitor v, DensityFunction.NoiseHolder n) {
        try {
            for (Class<?> c = v.getClass(); c != null; c = c.getSuperclass()) {
                for (Class<?> i : c.getInterfaces()) {
                    if (i.getName().endsWith("SeedStealer")) {
                        Method mm = i.getMethod("steal");
                        Object r = mm.invoke(v);
                        if (r instanceof Long) return (Long) r;
                    }
                }
            }
        } catch (Throwable ignored) { }
        try {
            for (Field fl : v.getClass().getDeclaredFields()) {
                if (fl.getType() == long.class) { fl.setAccessible(true); return fl.getLong(v); }
            }
        } catch (Throwable ignored) { }
        double a = n.getValue(1234.567, 0, -765.432), b = n.getValue(-98.76, 0, 4321.01), c = n.getValue(55.5, 0, 66.6);
        return Double.doubleToLongBits(a) * 31L ^ Double.doubleToLongBits(b) * 17L ^ Double.doubleToLongBits(c);
    }
}
