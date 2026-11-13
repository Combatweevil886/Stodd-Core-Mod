package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.phys.Vec3;
import stodd.core.addon.OriginGate;
import stodd.core.config.StoddConfig;

import java.util.List;
import java.util.function.Supplier;

/**
 * stodd_core:dense_cloud - the cloud sea round sky islands. It behaves like water (you swim in it, boats and ships float on it,
 * it breaks a fall) except that you cannot drown in it, and that a Devil Fruit User sinks in it as in the sea: the origins in
 * skyIslands.cloudSinkers cannot swim in it, are slowed, and sink through and out of the bottom.
 */
public final class CloudBlock extends LiquidBlock {
    static final double SINK = -0.12;

    public CloudBlock(Supplier<? extends FlowingFluid> fluid, Properties properties) { super(fluid, properties); }

    static boolean sinks(ServerPlayer p) {
        if (p.isCreative() || p.isSpectator() || p.isPassenger()) return false;
        String origin = OriginGate.originOf(p);
        if (origin == null) return false;
        Object v = StoddConfig.get().value("skyIslands.cloudSinkers");
        if (v instanceof List) { for (Object o : (List<?>) v) if (origin.equals(String.valueOf(o))) return true; return false; }
        return "devil_fruit_user".equals(origin);
    }

    @Override
    public void entityInside(BlockState state, Level level, BlockPos pos, Entity entity) {
        // the server decides (the origin is only known there) and sends the player's new motion along
        if (level.isClientSide || !(entity instanceof ServerPlayer)) return;
        ServerPlayer p = (ServerPlayer) entity;
        try {
            if (!sinks(p)) return;
            Vec3 v = p.getDeltaMovement();
            if (v.y > SINK) {
                p.setDeltaMovement(v.x * 0.6, SINK, v.z * 0.6);
                p.hurtMarked = true;
            }
            p.setSwimming(false);
            if (p.tickCount % 10 == 0) p.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 30, 1, false, false, true));
        } catch (Throwable ignored) {
            // never break a tick
        }
    }
}
