package stodd.core.mc;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import it.unimi.dsi.fastutil.objects.ObjectArrayList;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.level.storage.loot.predicates.LootItemCondition;
import net.minecraftforge.common.loot.IGlobalLootModifier;
import net.minecraftforge.common.loot.LootModifier;
import net.minecraftforge.registries.ForgeRegistries;
import stodd.core.addon.OriginGate;
import stodd.core.config.StoddConfig;
import stodd.core.gen.OriginRules;
import stodd.core.gen.WorldRules;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Devil Fruit luck (fruitLuck in config/stodd/origins.toml): the origins listed there find Devil Fruits more often. On top of
 * whatever True Prime Piece itself puts in the loot, a chest they open, a monster or boss they kill and a catch they fish each
 * have a chance to hold one more random Devil Fruit. A Devil Fruit is what the origin rules already call one (the fruit mod's
 * items named like a fruit, or the #stodd:devil_fruits tag), less fruitLuck.exclude.
 */
public final class FruitLuck extends LootModifier {
    public static final Codec<FruitLuck> CODEC = RecordCodecBuilder.create(inst -> codecStart(inst).apply(inst, FruitLuck::new));

    public FruitLuck(LootItemCondition[] conditions) { super(conditions); }

    @Override
    public Codec<? extends IGlobalLootModifier> codec() { return CODEC; }

    private static volatile List<Item> fruits;
    private static volatile long fruitsAt;
    private static volatile Object fruitsRules;

    /** Every Devil Fruit there is (looked up again when the rules change, at most once a minute). */
    static List<Item> fruits() {
        Object rules = WorldRules.get();
        long now = System.currentTimeMillis();
        List<Item> l = fruits;
        if (l != null && rules == fruitsRules && now - fruitsAt < 60_000) return l;
        OriginRules r = WorldRules.get().origins;
        Pattern ex = pattern(StoddConfig.get().str("fruitLuck.exclude", ""));
        List<Item> out = new ArrayList<>();
        for (Map.Entry<ResourceKey<Item>, Item> e : ForgeRegistries.ITEMS.getEntries()) {
            ResourceLocation id = e.getKey().location();
            Item it = e.getValue();
            if (ex != null && ex.matcher(id.getPath()).find()) continue;
            List<String> tags = new ArrayList<>();
            try { it.builtInRegistryHolder().tags().forEach(t -> tags.add(t.location().toString())); } catch (Throwable ignored) { }
            if (OriginRules.FRUIT.equals(r.systemOfItem(id.toString(), "", tags))) out.add(it);
        }
        fruits = Collections.unmodifiableList(out);
        fruitsAt = now;
        fruitsRules = rules;
        return fruits;
    }

    /** "/abc/i" or "abc" as a pattern; empty: none */
    static Pattern pattern(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            if (s.startsWith("/") && s.lastIndexOf('/') > 0) {
                int end = s.lastIndexOf('/');
                String flags = s.substring(end + 1);
                return Pattern.compile(s.substring(1, end), flags.contains("i") ? Pattern.CASE_INSENSITIVE : 0);
            }
            return Pattern.compile(s);
        } catch (Exception e) { return null; }
    }

    static boolean lucky(Player p) {
        String origin = OriginGate.originOf(p);
        if (origin == null) return false;
        Object v = StoddConfig.get().value("fruitLuck.origins");
        if (v instanceof List) { for (Object o : (List<?>) v) if (origin.equals(String.valueOf(o))) return true; return false; }
        return "devil_fruit_user".equals(origin);
    }

    static Player playerOf(LootContext ctx) {
        for (Entity e : new Entity[] { ctx.getParamOrNull(LootContextParams.LAST_DAMAGE_PLAYER), ctx.getParamOrNull(LootContextParams.KILLER_ENTITY),
                ctx.getParamOrNull(LootContextParams.THIS_ENTITY) }) {
            if (e instanceof Player) return (Player) e;
        }
        return null;
    }

    @Override
    protected ObjectArrayList<ItemStack> doApply(ObjectArrayList<ItemStack> loot, LootContext ctx) {
        try {
            ResourceLocation table = ctx.getQueriedLootTableId();
            if (table == null) return loot;
            String path = table.getPath();
            Player p = playerOf(ctx);
            if (p == null || p.level().isClientSide || p.isSpectator() || !lucky(p)) return loot;
            StoddConfig c = StoddConfig.get();
            double chance;
            if (path.startsWith("chests/")) chance = c.num("fruitLuck.chests", 0.08);
            else if (path.startsWith("gameplay/fishing")) chance = c.num("fruitLuck.fishing", 0.03);
            else if (path.startsWith("entities/")) {
                Entity dead = ctx.getParamOrNull(LootContextParams.THIS_ENTITY);
                if (!(dead instanceof LivingEntity) || dead instanceof Player) return loot;
                LivingEntity le = (LivingEntity) dead;
                boolean boss = le.getMaxHealth() >= c.num("bossMinHealth", 250);
                if (boss) chance = c.num("fruitLuck.bosses", 0.25);
                else if (le instanceof Enemy) chance = c.num("fruitLuck.monsters", 0.004);
                else return loot;
            } else return loot;
            if (!(chance > 0) || ctx.getRandom().nextDouble() >= chance) return loot;
            List<Item> all = fruits();
            if (all.isEmpty()) return loot;
            loot.add(new ItemStack(all.get(ctx.getRandom().nextInt(all.size()))));
        } catch (Throwable t) {
            // a loot hook must never break a chest, a kill or a catch
        }
        return loot;
    }
}
