package stodd.core.mc;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraftforge.registries.ForgeRegistries;
import stodd.core.StoddCore;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** Block ids and block-state strings from the config ("minecraft:cherry_leaves[persistent=true]", "#minecraft:leaves"). */
final class Blocks2 {
    private Blocks2() { }

    private static final Map<String, BlockState> STATES = new ConcurrentHashMap<>();
    private static final Map<String, Object> MATCHERS = new ConcurrentHashMap<>();

    /** A block state; air when the block does not exist (logged once). */
    static BlockState state(String text) {
        return STATES.computeIfAbsent(text, Blocks2::parse);
    }

    private static BlockState parse(String text) {
        String id = text, props = null;
        int b = text.indexOf('[');
        if (b >= 0 && text.endsWith("]")) { id = text.substring(0, b); props = text.substring(b + 1, text.length() - 1); }
        ResourceLocation rl = ResourceLocation.tryParse(id.trim());
        Block block = rl == null ? null : ForgeRegistries.BLOCKS.getValue(rl);
        if (block == null || (block == Blocks.AIR && !"minecraft:air".equals(id.trim()))) {
            StoddCore.LOG.warn("[STODD Core] unknown block '{}' in the world rules, using air", text);
            return Blocks.AIR.defaultBlockState();
        }
        BlockState s = block.defaultBlockState();
        if (props != null) {
            for (String kv : props.split(",")) {
                int eq = kv.indexOf('=');
                if (eq < 0) continue;
                Property<?> p = block.getStateDefinition().getProperty(kv.substring(0, eq).trim());
                if (p != null) s = with(s, p, kv.substring(eq + 1).trim());
            }
        }
        return s;
    }

    private static <T extends Comparable<T>> BlockState with(BlockState s, Property<T> p, String value) {
        Optional<T> v = p.getValue(value);
        return v.isPresent() ? s.setValue(p, v.get()) : s;
    }

    /** Does this state match "minecraft:grass_block" or "#minecraft:leaves"? */
    static boolean matches(BlockState s, String what) {
        Object m = MATCHERS.computeIfAbsent(what, w -> {
            if (w.startsWith("#")) {
                ResourceLocation rl = ResourceLocation.tryParse(w.substring(1));
                return rl == null ? Boolean.FALSE : TagKey.create(Registries.BLOCK, rl);
            }
            ResourceLocation rl = ResourceLocation.tryParse(w);
            Block bl = rl == null ? null : ForgeRegistries.BLOCKS.getValue(rl);
            return bl == null ? Boolean.FALSE : bl;
        });
        if (m instanceof Block) return s.is((Block) m);
        if (m instanceof TagKey) {
            @SuppressWarnings("unchecked")
            TagKey<Block> tag = (TagKey<Block>) m;
            return s.is(tag);
        }
        return false;
    }
}
