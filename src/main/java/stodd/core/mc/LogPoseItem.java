package stodd.core.mc;

import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * The Log Pose: a needle in a glass globe that points at an island. The server works out the target once a second (LogPose) and
 * writes it into the stack (LpX / LpZ, LpOk); the client turns it into the needle (LogPoseClient). Right-click: next mode,
 * shift + right-click: previous mode.
 */
public final class LogPoseItem extends Item {
    public LogPoseItem(Properties properties) { super(properties); }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide && player instanceof ServerPlayer) LogPose.cycle((ServerPlayer) player, player.isShiftKeyDown());
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
    }

    @Override
    public boolean isFoil(ItemStack stack) { return false; }

    @Override
    public void appendHoverText(ItemStack stack, Level level, List<Component> tooltip, TooltipFlag flag) {
        CompoundTag t = stack.getTag();
        String mode = t != null && t.contains("LpMode") ? t.getString("LpMode") : "Next island";
        tooltip.add(Component.literal("Mode: " + mode).withStyle(ChatFormatting.YELLOW));
        if (t != null && t.getBoolean("LpOk")) tooltip.add(Component.literal("Pointing at: " + t.getString("LpName")).withStyle(ChatFormatting.AQUA));
        else tooltip.add(Component.literal("Searching for an island...").withStyle(ChatFormatting.GRAY));
        tooltip.add(Component.literal("Right-click: next mode. Shift + right-click: previous.").withStyle(ChatFormatting.DARK_GRAY));
        tooltip.add(Component.literal("Reach the middle of an island to record it.").withStyle(ChatFormatting.DARK_GRAY));
    }
}
