package stodd.core.mc;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.client.renderer.item.ItemPropertyFunction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ModelEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import stodd.core.StoddCore;
import stodd.core.gen.LogPoseBrain;

/**
 * The needle (client only). The item model has 32 needle positions picked by the "stodd_core:angle" property; this works the
 * property out from the target the server wrote into the stack, like vanilla's compass does for a lodestone, with the same gentle
 * swing. With no target (searching, another dimension) the needle wanders, as a Log Pose with no island to lock on to would.
 */
@Mod.EventBusSubscriber(modid = StoddCore.MOD_ID, value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.MOD)
public final class LogPoseClient {
    private LogPoseClient() { }

    @SubscribeEvent
    public static void onBake(ModelEvent.ModifyBakingResult event) {
        ItemProperties.register(StoddRegistry.LOG_POSE.get(), new ResourceLocation(StoddCore.MOD_ID, "angle"), new Needle());
    }

    static final class Needle implements ItemPropertyFunction {
        private double rotation, rota;
        private long lastTick;
        private double wander, wanderSpeed;
        private long wanderTick;

        @Override
        public float call(ItemStack stack, ClientLevel world, LivingEntity holder, int seed) {
            Entity e = holder != null ? holder : stack.getFrame();
            if (e == null) return 0f;
            if (world == null && e.level() instanceof ClientLevel) world = (ClientLevel) e.level();
            if (world == null) return 0f;
            CompoundTag t = stack.getTag();
            boolean ok = t != null && t.getBoolean("LpOk") && Level.OVERWORLD.equals(world.dimension());
            if (!ok) return (float) wander(world);
            double yaw = holder != null ? e.getYRot() : frameYaw(e);
            double target = LogPoseBrain.angle(e.getX(), e.getZ(), yaw, t.getInt("LpX"), t.getInt("LpZ"));
            if (holder instanceof Player && ((Player) holder).isLocalPlayer()) return (float) swing(world, target);
            return (float) target;
        }

        private static double frameYaw(Entity frame) {
            return Mth.wrapDegrees(180 + frame.getDirection().get2DDataValue() * 90);
        }

        private double swing(Level world, double target) {
            if (world.getGameTime() != lastTick) {
                lastTick = world.getGameTime();
                double delta = target - rotation;
                delta = Mth.positiveModulo(delta + 0.5, 1.0) - 0.5;
                rota += delta * 0.1;
                rota *= 0.8;
                rotation = Mth.positiveModulo(rotation + rota, 1.0);
            }
            return rotation;
        }

        private double wander(Level world) {
            if (world.getGameTime() != wanderTick) {
                wanderTick = world.getGameTime();
                wanderSpeed += (Math.random() - 0.5) * 0.02;
                wanderSpeed *= 0.92;
                wander = Mth.positiveModulo(wander + wanderSpeed, 1.0);
            }
            return wander;
        }
    }
}
