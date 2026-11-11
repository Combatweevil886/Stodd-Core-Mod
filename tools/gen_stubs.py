#!/usr/bin/env python3
"""Writes compile-only stubs of the Minecraft 1.20.1 / Forge 47 / DFU / Brigadier / slf4j API surface STODD Core uses (mod/stubs),
so `javac` can type-check the mod in a workspace that cannot download Minecraft. Every signature here was checked against the
Forge 1.20.1 sources, Forge's patches or real 1.20.1 mods (The Aether, Twilight Forest); the stubs are never shipped. The real
build (Gradle + ForgeGradle, see build.gradle / .github/workflows) compiles against the real game.
usage: gen_stubs.py <out dir>"""
import os, sys, textwrap

S = {}


def c(fq, body, imports=''):
    S[fq] = (imports, body)


# ---------------------------------------------------------------- slf4j, mojang logging, brigadier, DFU
c('org.slf4j.Logger', 'public interface Logger { void info(String m, Object... a); void warn(String m, Object... a); void error(String m, Object... a); void error(String m, Throwable t); void debug(String m, Object... a); }')
c('com.mojang.logging.LogUtils', 'public final class LogUtils { public static org.slf4j.Logger getLogger() { return null; } }')
c('com.mojang.brigadier.Command', 'public interface Command<S> { int run(com.mojang.brigadier.context.CommandContext<S> c) throws com.mojang.brigadier.exceptions.CommandSyntaxException; }')
c('com.mojang.brigadier.exceptions.CommandSyntaxException', 'public class CommandSyntaxException extends Exception { }')
c('com.mojang.brigadier.context.CommandContext', 'public class CommandContext<S> { public S getSource() { return null; } }')
c('com.mojang.brigadier.tree.LiteralCommandNode', 'public class LiteralCommandNode<S> { }')
c('com.mojang.brigadier.CommandDispatcher', 'public class CommandDispatcher<S> { public com.mojang.brigadier.tree.LiteralCommandNode<S> register(com.mojang.brigadier.builder.LiteralArgumentBuilder<S> b) { return null; } }')
c('com.mojang.brigadier.builder.ArgumentBuilder', '''public abstract class ArgumentBuilder<S, T extends ArgumentBuilder<S, T>> {
    public T then(ArgumentBuilder<S, ?> a) { return null; }
    public T executes(com.mojang.brigadier.Command<S> c) { return null; }
    public T requires(java.util.function.Predicate<S> p) { return null; }
}''')
c('com.mojang.brigadier.builder.LiteralArgumentBuilder', 'public class LiteralArgumentBuilder<S> extends ArgumentBuilder<S, LiteralArgumentBuilder<S>> { }')
c('com.mojang.brigadier.builder.RequiredArgumentBuilder', 'public class RequiredArgumentBuilder<S, T> extends ArgumentBuilder<S, RequiredArgumentBuilder<S, T>> { public RequiredArgumentBuilder<S, T> suggests(com.mojang.brigadier.suggestion.SuggestionProvider<S> p) { return null; } }')
c('com.mojang.brigadier.suggestion.Suggestions', 'public class Suggestions { }')
c('com.mojang.brigadier.suggestion.SuggestionsBuilder', 'public class SuggestionsBuilder { public SuggestionsBuilder suggest(String s) { return this; } public java.util.concurrent.CompletableFuture<Suggestions> buildFuture() { return null; } }')
c('com.mojang.brigadier.suggestion.SuggestionProvider', 'public interface SuggestionProvider<S> { java.util.concurrent.CompletableFuture<Suggestions> getSuggestions(com.mojang.brigadier.context.CommandContext<S> c, SuggestionsBuilder b) throws com.mojang.brigadier.exceptions.CommandSyntaxException; }')
c('com.mojang.brigadier.arguments.ArgumentType', 'public interface ArgumentType<T> { }')
c('com.mojang.brigadier.arguments.StringArgumentType', 'public class StringArgumentType implements ArgumentType<String> { public static StringArgumentType word() { return null; } public static String getString(com.mojang.brigadier.context.CommandContext<?> c, String n) { return null; } }')
c('com.mojang.datafixers.kinds.K1', 'public interface K1 { }')
c('com.mojang.datafixers.kinds.App', 'public interface App<F extends K1, A> { }')
c('com.mojang.datafixers.kinds.Applicative', 'public interface Applicative<F extends K1, Mu extends Applicative.Mu> { interface Mu { } }')
c('com.mojang.datafixers.Products', '''public interface Products {
    final class P1<F extends com.mojang.datafixers.kinds.K1, T1> { public <R> com.mojang.datafixers.kinds.App<F, R> apply(com.mojang.datafixers.kinds.Applicative<F, ?> i, java.util.function.Function<T1, R> f) { return null; } }
    final class P2<F extends com.mojang.datafixers.kinds.K1, T1, T2> { public <R> com.mojang.datafixers.kinds.App<F, R> apply(com.mojang.datafixers.kinds.Applicative<F, ?> i, java.util.function.BiFunction<T1, T2, R> f) { return null; } }
}''')
c('com.mojang.serialization.MapCodec', 'public abstract class MapCodec<A> { public <O> com.mojang.serialization.codecs.RecordCodecBuilder<O, A> forGetter(java.util.function.Function<O, A> g) { return null; } }')
c('com.mojang.serialization.Codec', '''public interface Codec<A> {
    Codec<Integer> INT = null;
    Codec<String> STRING = null;
    static Codec<Integer> intRange(int a, int b) { return null; }
    default MapCodec<A> optionalFieldOf(String name, A def) { return null; }
    default MapCodec<A> fieldOf(String name) { return null; }
}''')
c('com.mojang.serialization.codecs.RecordCodecBuilder', '''public final class RecordCodecBuilder<O, F> implements com.mojang.datafixers.kinds.App<RecordCodecBuilder.Mu<O>, F> {
    public static final class Mu<O> implements com.mojang.datafixers.kinds.K1 { }
    public static <O> com.mojang.serialization.Codec<O> create(java.util.function.Function<Instance<O>, ? extends com.mojang.datafixers.kinds.App<Mu<O>, O>> b) { return null; }
    public static final class Instance<O> implements com.mojang.datafixers.kinds.Applicative<RecordCodecBuilder.Mu<O>, RecordCodecBuilder.Instance.Mu<O>> {
        public static final class Mu<O> implements com.mojang.datafixers.kinds.Applicative.Mu { }
        public <T1> com.mojang.datafixers.Products.P1<RecordCodecBuilder.Mu<O>, T1> group(com.mojang.datafixers.kinds.App<RecordCodecBuilder.Mu<O>, T1> t1) { return null; }
        public <T1, T2> com.mojang.datafixers.Products.P2<RecordCodecBuilder.Mu<O>, T1, T2> group(com.mojang.datafixers.kinds.App<RecordCodecBuilder.Mu<O>, T1> t1, com.mojang.datafixers.kinds.App<RecordCodecBuilder.Mu<O>, T2> t2) { return null; }
    }
}''')

# ---------------------------------------------------------------- minecraft: basics
c('net.minecraft.ChatFormatting', '''public enum ChatFormatting { BLACK, DARK_BLUE, DARK_GREEN, DARK_AQUA, DARK_RED, DARK_PURPLE, GOLD, GRAY, DARK_GRAY, BLUE, GREEN, AQUA, RED, LIGHT_PURPLE, YELLOW, WHITE;
    public static ChatFormatting getByName(String n) { return null; } public boolean isColor() { return true; } }''')
c('net.minecraft.WorldVersion', 'public interface WorldVersion { int getPackVersion(net.minecraft.server.packs.PackType t); }')
c('net.minecraft.SharedConstants', 'public class SharedConstants { public static net.minecraft.WorldVersion getCurrentVersion() { return null; } }')
c('net.minecraft.util.Mth', 'public class Mth { public static double positiveModulo(double a, double b) { return 0; } public static double wrapDegrees(double d) { return 0; } public static float wrapDegrees(float d) { return 0; } }')
c('net.minecraft.util.RandomSource', 'public interface RandomSource { }')
c('net.minecraft.util.StringRepresentable', 'public interface StringRepresentable { }')
c('net.minecraft.resources.ResourceLocation', '''public class ResourceLocation implements Comparable<ResourceLocation> {
    public ResourceLocation(String a, String b) { } public ResourceLocation(String a) { }
    public static ResourceLocation tryParse(String s) { return null; }
    public String getNamespace() { return null; } public String getPath() { return null; }
    public int compareTo(ResourceLocation o) { return 0; } }''')
c('net.minecraft.resources.ResourceKey', '''public class ResourceKey<T> {
    public static <T> ResourceKey<T> create(ResourceKey<? extends net.minecraft.core.Registry<T>> r, net.minecraft.resources.ResourceLocation l) { return null; }
    public net.minecraft.resources.ResourceLocation location() { return null; } }''')
c('net.minecraft.core.Vec3i', 'public class Vec3i { public static final Vec3i ZERO = null; public int getX() { return 0; } public int getY() { return 0; } public int getZ() { return 0; } }')
c('net.minecraft.core.BlockPos', '''public class BlockPos extends net.minecraft.core.Vec3i {
    public static final BlockPos ZERO = null;
    public BlockPos(int x, int y, int z) { }
    public static class MutableBlockPos extends BlockPos { public MutableBlockPos() { super(0, 0, 0); } public MutableBlockPos set(int x, int y, int z) { return this; } } }''')
c('net.minecraft.core.Direction', 'public enum Direction { DOWN, UP, NORTH, SOUTH, WEST, EAST; public int get2DDataValue() { return 0; } }')
c('net.minecraft.core.QuartPos', 'public final class QuartPos { public static int fromBlock(int b) { return 0; } }')
c('net.minecraft.core.Holder', 'public interface Holder<T> { T value(); interface Reference<T> extends Holder<T> { } }')
c('net.minecraft.core.HolderSet', 'public interface HolderSet<T> { }')
c('net.minecraft.core.Registry', '''public interface Registry<T> {
    java.util.Optional<net.minecraft.core.Holder.Reference<T>> getHolder(net.minecraft.resources.ResourceKey<T> k);
    boolean containsKey(net.minecraft.resources.ResourceLocation l);
    net.minecraft.resources.ResourceLocation getKey(T t);
    T get(net.minecraft.resources.ResourceLocation l); }''')
c('net.minecraft.core.DefaultedRegistry', 'public interface DefaultedRegistry<T> extends Registry<T> { }')
c('net.minecraft.core.RegistryAccess', '''public interface RegistryAccess {
    <E> net.minecraft.core.Registry<E> registryOrThrow(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<? extends E>> k);
    interface Frozen extends RegistryAccess { } }''')
c('net.minecraft.core.registries.Registries', '''public final class Registries {
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.levelgen.structure.StructureType<?>>> STRUCTURE_TYPE = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType>> STRUCTURE_PIECE = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.levelgen.structure.placement.StructurePlacementType<?>>> STRUCTURE_PLACEMENT = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.levelgen.structure.StructureSet>> STRUCTURE_SET = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.biome.Biome>> BIOME = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.block.Block>> BLOCK = null;
    public static final net.minecraft.resources.ResourceKey<net.minecraft.core.Registry<net.minecraft.world.level.levelgen.feature.ConfiguredFeature<?, ?>>> CONFIGURED_FEATURE = null; }''')
c('net.minecraft.core.registries.BuiltInRegistries', '''public final class BuiltInRegistries {
    public static final net.minecraft.core.DefaultedRegistry<net.minecraft.world.level.block.Block> BLOCK = null;
    public static final net.minecraft.core.DefaultedRegistry<net.minecraft.world.item.Item> ITEM = null;
    public static final net.minecraft.core.DefaultedRegistry<net.minecraft.world.entity.EntityType<?>> ENTITY_TYPE = null;
    public static final net.minecraft.core.DefaultedRegistry<net.minecraft.world.entity.npc.VillagerProfession> VILLAGER_PROFESSION = null; }''')
c('net.minecraft.tags.TagKey', '''public final class TagKey<T> {
    public static <T> TagKey<T> create(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<T>> r, net.minecraft.resources.ResourceLocation l) { return null; }
    public net.minecraft.resources.ResourceLocation location() { return null; } }''')

# ---------------------------------------------------------------- nbt
c('net.minecraft.nbt.Tag', '''public interface Tag {
    int TAG_END = 0, TAG_BYTE = 1, TAG_SHORT = 2, TAG_INT = 3, TAG_LONG = 4, TAG_FLOAT = 5, TAG_DOUBLE = 6, TAG_STRING = 8, TAG_LIST = 9, TAG_COMPOUND = 10;
    byte getId(); Tag copy(); }''')
c('net.minecraft.nbt.NumericTag', 'public abstract class NumericTag implements Tag { public abstract double getAsDouble(); }')
c('net.minecraft.nbt.StringTag', 'public class StringTag implements Tag { public static StringTag valueOf(String s) { return null; } public byte getId() { return 8; } public Tag copy() { return this; } }')
c('net.minecraft.nbt.ListTag', '''public class ListTag extends java.util.AbstractList<Tag> implements Tag {
    public ListTag() { } public Tag get(int i) { return null; } public int size() { return 0; } public boolean add(Tag t) { return true; }
    public String getString(int i) { return null; } public byte getId() { return 9; } public ListTag copy() { return this; } }''')
c('net.minecraft.nbt.CompoundTag', '''public class CompoundTag implements Tag {
    public CompoundTag() { }
    public byte getId() { return 10; } public CompoundTag copy() { return this; }
    public java.util.Set<String> getAllKeys() { return null; }
    public boolean contains(String k) { return false; } public boolean contains(String k, int type) { return false; }
    public Tag get(String k) { return null; } public Tag put(String k, Tag t) { return null; }
    public int getInt(String k) { return 0; } public void putInt(String k, int v) { }
    public void putByte(String k, byte v) { } public void putShort(String k, short v) { } public void putLong(String k, long v) { }
    public void putFloat(String k, float v) { } public void putDouble(String k, double v) { }
    public String getString(String k) { return null; } public void putString(String k, String v) { }
    public boolean getBoolean(String k) { return false; } public void putBoolean(String k, boolean v) { }
    public int[] getIntArray(String k) { return null; } public void putIntArray(String k, int[] v) { }
    public CompoundTag getCompound(String k) { return null; } public ListTag getList(String k, int type) { return null; }
    public CompoundTag merge(CompoundTag o) { return this; } }''')

# ---------------------------------------------------------------- chat, packets, sounds
c('net.minecraft.network.chat.Component', '''public interface Component {
    static MutableComponent literal(String s) { return null; } String getString(); }''')
c('net.minecraft.network.chat.MutableComponent', '''public class MutableComponent implements Component {
    public MutableComponent withStyle(net.minecraft.ChatFormatting f) { return this; } public MutableComponent append(Component c) { return this; } public String getString() { return null; } }''')
c('net.minecraft.network.protocol.Packet', 'public interface Packet<T> { }')
for n in ('ClientboundSetSubtitleTextPacket', 'ClientboundSetTitleTextPacket'):
    c('net.minecraft.network.protocol.game.' + n, 'public class %s implements net.minecraft.network.protocol.Packet<Object> { public %s(net.minecraft.network.chat.Component c) { } }' % (n, n))
c('net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket', 'public class ClientboundSetTitlesAnimationPacket implements net.minecraft.network.protocol.Packet<Object> { public ClientboundSetTitlesAnimationPacket(int a, int b, int c) { } }')
c('net.minecraft.server.network.ServerGamePacketListenerImpl', 'public class ServerGamePacketListenerImpl { public void send(net.minecraft.network.protocol.Packet<?> p) { } }')
c('net.minecraft.sounds.SoundEvent', 'public class SoundEvent { }')
c('net.minecraft.sounds.SoundSource', 'public enum SoundSource { MASTER, PLAYERS, BLOCKS }')
c('net.minecraft.sounds.SoundEvents', '''public class SoundEvents {
    public static final SoundEvent AMETHYST_BLOCK_RESONATE = null, ANVIL_USE = null, EXPERIENCE_ORB_PICKUP = null, VILLAGER_NO = null;
    public static final net.minecraft.core.Holder.Reference<SoundEvent> NOTE_BLOCK_BASS = null; }''')

# ---------------------------------------------------------------- commands
c('net.minecraft.commands.CommandSourceStack', '''public class CommandSourceStack {
    public net.minecraft.server.level.ServerPlayer getPlayerOrException() throws com.mojang.brigadier.exceptions.CommandSyntaxException { return null; }
    public net.minecraft.server.MinecraftServer getServer() { return null; }
    public net.minecraft.server.level.ServerLevel getLevel() { return null; }
    public net.minecraft.world.phys.Vec3 getPosition() { return null; }
    public boolean hasPermission(int l) { return false; }
    public void sendSuccess(java.util.function.Supplier<net.minecraft.network.chat.Component> c, boolean b) { }
    public CommandSourceStack withSuppressedOutput() { return this; } }''')
c('net.minecraft.commands.Commands', '''public class Commands {
    public static com.mojang.brigadier.builder.LiteralArgumentBuilder<CommandSourceStack> literal(String s) { return null; }
    public static <T> com.mojang.brigadier.builder.RequiredArgumentBuilder<CommandSourceStack, T> argument(String n, com.mojang.brigadier.arguments.ArgumentType<T> t) { return null; }
    public int performPrefixedCommand(CommandSourceStack s, String cmd) { return 0; } }''')
c('net.minecraft.commands.arguments.EntityArgument', '''public class EntityArgument implements com.mojang.brigadier.arguments.ArgumentType<Object> {
    public static EntityArgument player() { return null; }
    public static net.minecraft.server.level.ServerPlayer getPlayer(com.mojang.brigadier.context.CommandContext<net.minecraft.commands.CommandSourceStack> c, String n) throws com.mojang.brigadier.exceptions.CommandSyntaxException { return null; } }''')

# ---------------------------------------------------------------- packs, resources, server
c('net.minecraft.server.packs.PackType', 'public enum PackType { CLIENT_RESOURCES, SERVER_DATA }')
c('net.minecraft.server.packs.PackResources', 'public interface PackResources { }')
c('net.minecraft.server.packs.repository.PackSource', 'public interface PackSource { PackSource BUILT_IN = null; }')
c('net.minecraft.server.packs.repository.RepositorySource', 'public interface RepositorySource { void loadPacks(java.util.function.Consumer<Pack> c); }')
c('net.minecraft.server.packs.repository.Pack', '''public class Pack {
    public enum Position { TOP, BOTTOM }
    public interface ResourcesSupplier { net.minecraft.server.packs.PackResources open(String id); }
    public static class Info { public Info(net.minecraft.network.chat.Component d, int data, int res, net.minecraft.world.flag.FeatureFlagSet f, boolean hidden) { } }
    public static Pack create(String id, net.minecraft.network.chat.Component title, boolean required, ResourcesSupplier s, Info info, net.minecraft.server.packs.PackType t, Position p, boolean fixed, PackSource src) { return null; } }''')
c('net.minecraft.server.packs.repository.PackRepository', 'public class PackRepository { public java.util.Collection<String> getSelectedIds() { return null; } }')
c('net.minecraft.server.packs.resources.Resource', 'public class Resource { public String sourcePackId() { return null; } }')
c('net.minecraft.server.packs.resources.ResourceManager', 'public interface ResourceManager { java.util.List<Resource> getResourceStack(net.minecraft.resources.ResourceLocation l); }')
c('net.minecraft.server.MinecraftServer', '''public abstract class MinecraftServer {
    public net.minecraft.server.level.ServerLevel overworld() { return null; }
    public net.minecraft.server.packs.repository.PackRepository getPackRepository() { return null; }
    public net.minecraft.server.packs.resources.ResourceManager getResourceManager() { return null; }
    public net.minecraft.core.RegistryAccess.Frozen registryAccess() { return null; }
    public net.minecraft.commands.Commands getCommands() { return null; }
    public net.minecraft.commands.CommandSourceStack createCommandSourceStack() { return null; } }''')
c('net.minecraft.server.level.ServerChunkCache', '''public class ServerChunkCache {
    public net.minecraft.world.level.levelgen.RandomState randomState() { return null; }
    public net.minecraft.world.level.chunk.ChunkGenerator getGenerator() { return null; } }''')
c('net.minecraft.server.level.ServerLevel', '''public class ServerLevel extends net.minecraft.world.level.Level implements net.minecraft.world.level.WorldGenLevel {
    public net.minecraft.server.level.ServerChunkCache getChunkSource() { return null; }
    public long getSeed() { return 0; }
    public int getHeight(net.minecraft.world.level.levelgen.Heightmap.Types t, int x, int z) { return 0; }
    public net.minecraft.world.level.block.state.BlockState getBlockState(net.minecraft.core.BlockPos p) { return null; }
    public boolean setBlock(net.minecraft.core.BlockPos p, net.minecraft.world.level.block.state.BlockState s, int f) { return false; }
    public net.minecraft.world.level.chunk.ChunkAccess getChunk(int x, int z) { return null; } }''')
c('net.minecraft.server.level.ServerPlayer', '''public class ServerPlayer extends net.minecraft.world.entity.player.Player {
    public net.minecraft.server.network.ServerGamePacketListenerImpl connection;
    public void playNotifySound(net.minecraft.sounds.SoundEvent s, net.minecraft.sounds.SoundSource c, float v, float p) { }
    public net.minecraft.world.entity.item.ItemEntity drop(net.minecraft.world.item.ItemStack s, boolean b) { return null; }
    public net.minecraft.server.MinecraftServer getServer() { return null; } }''')

# ---------------------------------------------------------------- entities, items
c('net.minecraft.world.InteractionHand', 'public enum InteractionHand { MAIN_HAND, OFF_HAND }')
c('net.minecraft.world.InteractionResult', 'public enum InteractionResult { SUCCESS, CONSUME, PASS, FAIL }')
c('net.minecraft.world.InteractionResultHolder', 'public class InteractionResultHolder<T> { public static <T> InteractionResultHolder<T> sidedSuccess(T t, boolean client) { return null; } }')
c('net.minecraft.world.entity.EntityType', 'public class EntityType<T> { }')
c('net.minecraft.world.entity.Entity', '''public abstract class Entity extends net.minecraftforge.common.capabilities.CapabilityProvider<Entity> {
    public int tickCount;
    public net.minecraft.world.level.Level level() { return null; }
    public double getX() { return 0; } public double getY() { return 0; } public double getZ() { return 0; }
    public float getYRot() { return 0; }
    public net.minecraft.core.Direction getDirection() { return null; }
    public java.util.UUID getUUID() { return null; }
    public java.util.Set<String> getTags() { return null; }
    public net.minecraft.nbt.CompoundTag getPersistentData() { return null; }
    public boolean isShiftKeyDown() { return false; }
    public boolean isSpectator() { return false; }
    public void sendSystemMessage(net.minecraft.network.chat.Component c) { }
    public EntityType<?> getType() { return null; } }''')
c('net.minecraft.world.entity.item.ItemEntity', 'public class ItemEntity extends net.minecraft.world.entity.Entity { }')
c('net.minecraft.world.entity.decoration.ItemFrame', 'public class ItemFrame extends net.minecraft.world.entity.Entity { }')
c('net.minecraft.world.entity.LivingEntity', '''public abstract class LivingEntity extends net.minecraft.world.entity.Entity {
    public net.minecraft.world.item.ItemStack getMainHandItem() { return null; } public net.minecraft.world.item.ItemStack getOffhandItem() { return null; }
    public net.minecraft.world.item.ItemStack getItemInHand(net.minecraft.world.InteractionHand h) { return null; } }''')
c('net.minecraft.world.entity.npc.VillagerProfession', 'public class VillagerProfession { }')
c('net.minecraft.world.entity.npc.VillagerData', 'public class VillagerData { public net.minecraft.world.entity.npc.VillagerProfession getProfession() { return null; } }')
c('net.minecraft.world.entity.npc.VillagerDataHolder', 'public interface VillagerDataHolder { net.minecraft.world.entity.npc.VillagerData getVillagerData(); }')
c('net.minecraft.world.entity.player.Inventory', '''public class Inventory {
    public int getContainerSize() { return 0; } public net.minecraft.world.item.ItemStack getItem(int i) { return null; }
    public void setItem(int i, net.minecraft.world.item.ItemStack s) { } public boolean add(net.minecraft.world.item.ItemStack s) { return false; } }''')
c('com.mojang.authlib.GameProfile', 'public class GameProfile { public String getName() { return null; } }')
c('net.minecraft.world.entity.player.Player', '''public abstract class Player extends net.minecraft.world.entity.LivingEntity {
    public static final String PERSISTED_NBT_TAG = "PlayerPersisted";
    public net.minecraft.world.entity.player.Inventory getInventory() { return null; }
    public void displayClientMessage(net.minecraft.network.chat.Component c, boolean actionBar) { }
    public boolean isCreative() { return false; }
    public boolean isLocalPlayer() { return false; }
    public com.mojang.authlib.GameProfile getGameProfile() { return null; } }''')
c('net.minecraft.world.level.ItemLike', 'public interface ItemLike { net.minecraft.world.item.Item asItem(); }')
c('net.minecraft.world.item.Rarity', 'public enum Rarity { COMMON, UNCOMMON, RARE, EPIC }')
c('net.minecraft.world.item.TooltipFlag', 'public interface TooltipFlag { }')
c('net.minecraft.world.item.CreativeModeTab', 'public class CreativeModeTab { }')
c('net.minecraft.world.item.CreativeModeTabs', 'public class CreativeModeTabs { public static final net.minecraft.resources.ResourceKey<net.minecraft.world.item.CreativeModeTab> TOOLS_AND_UTILITIES = null; }')
c('net.minecraft.world.item.Item', '''public class Item implements net.minecraft.world.level.ItemLike {
    public Item(Properties p) { }
    public static class Properties { public Properties stacksTo(int n) { return this; } public Properties rarity(net.minecraft.world.item.Rarity r) { return this; } }
    public net.minecraft.world.item.Item asItem() { return this; }
    public net.minecraft.world.InteractionResultHolder<ItemStack> use(net.minecraft.world.level.Level l, net.minecraft.world.entity.player.Player p, net.minecraft.world.InteractionHand h) { return null; }
    public boolean isFoil(ItemStack s) { return false; }
    public void appendHoverText(ItemStack s, net.minecraft.world.level.Level l, java.util.List<net.minecraft.network.chat.Component> t, net.minecraft.world.item.TooltipFlag f) { } }''')
c('net.minecraft.world.item.Items', 'public class Items { public static final Item COMPASS = null; }')
c('net.minecraft.world.item.ItemStack', '''public final class ItemStack {
    public ItemStack(net.minecraft.world.level.ItemLike i) { }
    public boolean isEmpty() { return false; } public boolean is(Item i) { return false; } public Item getItem() { return null; }
    public net.minecraft.nbt.CompoundTag getTag() { return null; } public net.minecraft.nbt.CompoundTag getOrCreateTag() { return null; }
    public net.minecraft.world.entity.decoration.ItemFrame getFrame() { return null; }
    public net.minecraft.network.chat.Component getHoverName() { return null; }
    public java.util.stream.Stream<net.minecraft.tags.TagKey<Item>> getTags() { return null; } }''')
c('net.minecraft.world.flag.FeatureFlagSet', 'public final class FeatureFlagSet { public static FeatureFlagSet of() { return null; } }')
c('net.minecraft.world.phys.Vec3', 'public class Vec3 { public final double x = 0, y = 0, z = 0; public Vec3(double x, double y, double z) { } }')

# ---------------------------------------------------------------- level, blocks, biomes
c('net.minecraft.world.level.LevelHeightAccessor', 'public interface LevelHeightAccessor { int getMinBuildHeight(); }')
c('net.minecraft.world.level.ChunkPos', 'public class ChunkPos { public final int x = 0, z = 0; public int getMinBlockX() { return 0; } public int getMinBlockZ() { return 0; } }')
c('net.minecraft.world.level.Level', '''public abstract class Level implements net.minecraft.world.level.LevelHeightAccessor {
    public static final net.minecraft.resources.ResourceKey<Level> OVERWORLD = null;
    public final boolean isClientSide = false;
    public net.minecraft.resources.ResourceKey<Level> dimension() { return null; }
    public long getGameTime() { return 0; }
    public net.minecraft.core.RegistryAccess registryAccess() { return null; }
    public net.minecraft.world.level.block.state.BlockState getBlockState(net.minecraft.core.BlockPos p) { return null; }
    public int getMinBuildHeight() { return 0; } }''')
c('net.minecraft.world.level.ServerLevelAccessor', 'public interface ServerLevelAccessor { }')
c('net.minecraft.world.level.StructureManager', 'public class StructureManager { }')
c('net.minecraft.world.level.WorldGenLevel', '''public interface WorldGenLevel extends ServerLevelAccessor, net.minecraft.world.level.LevelHeightAccessor {
    int getHeight(net.minecraft.world.level.levelgen.Heightmap.Types t, int x, int z);
    net.minecraft.world.level.block.state.BlockState getBlockState(net.minecraft.core.BlockPos p);
    boolean setBlock(net.minecraft.core.BlockPos p, net.minecraft.world.level.block.state.BlockState s, int f);
    net.minecraft.core.RegistryAccess registryAccess();
    net.minecraft.world.level.chunk.ChunkAccess getChunk(int x, int z); }''')
c('net.minecraft.world.level.biome.Biome', 'public final class Biome { }')
c('net.minecraft.world.level.biome.Climate', 'public class Climate { public interface Sampler { } public static Sampler empty() { return null; } }')
c('net.minecraft.world.level.biome.BiomeResolver', 'public interface BiomeResolver { net.minecraft.core.Holder<net.minecraft.world.level.biome.Biome> getNoiseBiome(int x, int y, int z, net.minecraft.world.level.biome.Climate.Sampler s); }')
c('net.minecraft.world.level.block.Block', '''public class Block implements net.minecraft.world.level.ItemLike {
    public net.minecraft.world.level.block.state.BlockState defaultBlockState() { return null; }
    public net.minecraft.world.level.block.state.StateDefinition<Block, net.minecraft.world.level.block.state.BlockState> getStateDefinition() { return null; }
    public net.minecraft.world.item.Item asItem() { return null; } }''')
c('net.minecraft.world.level.block.Blocks', 'public class Blocks { public static final Block AIR = null; }')
c('net.minecraft.world.level.block.Rotation', 'public enum Rotation { NONE, CLOCKWISE_90, CLOCKWISE_180, COUNTERCLOCKWISE_90 }')
c('net.minecraft.world.level.block.state.StateDefinition', 'public class StateDefinition<O, S> { public net.minecraft.world.level.block.state.properties.Property<?> getProperty(String n) { return null; } }')
c('net.minecraft.world.level.block.state.properties.Property', 'public abstract class Property<T extends Comparable<T>> { public abstract java.util.Optional<T> getValue(String v); }')
c('net.minecraft.world.level.material.FluidState', 'public class FluidState { public boolean isEmpty() { return true; } }')
c('net.minecraft.world.level.block.state.BlockState', '''public class BlockState {
    public boolean isAir() { return false; } public boolean is(net.minecraft.world.level.block.Block b) { return false; }
    public boolean is(net.minecraft.tags.TagKey<net.minecraft.world.level.block.Block> t) { return false; }
    public net.minecraft.world.level.material.FluidState getFluidState() { return null; }
    public net.minecraft.world.level.block.Block getBlock() { return null; }
    public java.util.stream.Stream<net.minecraft.tags.TagKey<net.minecraft.world.level.block.Block>> getTags() { return null; }
    public <T extends Comparable<T>, V extends T> BlockState setValue(net.minecraft.world.level.block.state.properties.Property<T> p, V v) { return this; } }''')
c('net.minecraft.world.level.chunk.ChunkAccess', '''public abstract class ChunkAccess {
    public void fillBiomesFromNoise(net.minecraft.world.level.biome.BiomeResolver r, net.minecraft.world.level.biome.Climate.Sampler s) { }
    public net.minecraft.core.Holder<net.minecraft.world.level.biome.Biome> getNoiseBiome(int x, int y, int z) { return null; }
    public void setUnsaved(boolean u) { } }''')
c('net.minecraft.world.level.chunk.ChunkGenerator', '''public abstract class ChunkGenerator {
    public int getBaseHeight(int x, int z, net.minecraft.world.level.levelgen.Heightmap.Types t, net.minecraft.world.level.LevelHeightAccessor h, net.minecraft.world.level.levelgen.RandomState r) { return 0; } }''')
c('net.minecraft.world.level.chunk.ChunkGeneratorStructureState', 'public class ChunkGeneratorStructureState { }')

# ---------------------------------------------------------------- worldgen
c('net.minecraft.world.level.levelgen.Heightmap', 'public class Heightmap { public enum Types { WORLD_SURFACE_WG, WORLD_SURFACE, OCEAN_FLOOR_WG, OCEAN_FLOOR, MOTION_BLOCKING, MOTION_BLOCKING_NO_LEAVES } }')
c('net.minecraft.world.level.levelgen.DensityFunction', '''public interface DensityFunction {
    double compute(FunctionContext c);
    interface FunctionContext { int blockX(); int blockY(); int blockZ(); }
    record SinglePointContext(int blockX, int blockY, int blockZ) implements FunctionContext { } }''')
c('net.minecraft.world.level.levelgen.NoiseRouter', 'public record NoiseRouter(DensityFunction continents, DensityFunction finalDensity) { }')
c('net.minecraft.world.level.levelgen.RandomState', 'public final class RandomState { public net.minecraft.world.level.levelgen.NoiseRouter router() { return null; } }')
c('net.minecraft.world.level.levelgen.WorldgenRandom', 'public class WorldgenRandom implements net.minecraft.util.RandomSource { }')
c('net.minecraft.world.level.levelgen.feature.ConfiguredFeature', '''public record ConfiguredFeature<FC, F>(F feature, FC config) {
    public boolean place(net.minecraft.world.level.WorldGenLevel l, net.minecraft.world.level.chunk.ChunkGenerator g, net.minecraft.util.RandomSource r, net.minecraft.core.BlockPos p) { return false; } }''')
c('net.minecraft.world.level.levelgen.structure.BoundingBox', '''public class BoundingBox {
    public BoundingBox(int a, int b, int c, int d, int e, int f) { }
    public int minX() { return 0; } public int minY() { return 0; } public int minZ() { return 0; } public int maxX() { return 0; } public int maxY() { return 0; } public int maxZ() { return 0; } }''')
c('net.minecraft.world.level.levelgen.structure.StructureSet', 'public record StructureSet() { }')
c('net.minecraft.world.level.levelgen.structure.StructureType', 'public interface StructureType<S extends Structure> { com.mojang.serialization.Codec<S> codec(); }')
c('net.minecraft.world.level.levelgen.structure.Structure', '''public abstract class Structure {
    protected Structure(StructureSettings s) { }
    public static <S extends Structure> com.mojang.serialization.codecs.RecordCodecBuilder<S, StructureSettings> settingsCodec(com.mojang.serialization.codecs.RecordCodecBuilder.Instance<S> i) { return null; }
    protected abstract java.util.Optional<GenerationStub> findGenerationPoint(GenerationContext c);
    public abstract StructureType<?> type();
    public static record StructureSettings(net.minecraft.core.HolderSet<net.minecraft.world.level.biome.Biome> biomes) { }
    public static record GenerationContext(net.minecraft.core.RegistryAccess registryAccess, net.minecraft.world.level.chunk.ChunkGenerator chunkGenerator,
        net.minecraft.world.level.levelgen.RandomState randomState, net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager structureTemplateManager,
        net.minecraft.world.level.levelgen.WorldgenRandom random, long seed, net.minecraft.world.level.ChunkPos chunkPos, net.minecraft.world.level.LevelHeightAccessor heightAccessor) { }
    public static record GenerationStub(net.minecraft.core.BlockPos position, java.util.function.Consumer<net.minecraft.world.level.levelgen.structure.pieces.StructurePiecesBuilder> generator) { } }''')
c('net.minecraft.world.level.levelgen.structure.StructurePiece', '''public abstract class StructurePiece {
    protected BoundingBox boundingBox;
    protected StructurePiece(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType t, int depth, BoundingBox b) { }
    public StructurePiece(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType t, net.minecraft.nbt.CompoundTag tag) { }
    protected abstract void addAdditionalSaveData(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext c, net.minecraft.nbt.CompoundTag t);
    public abstract void postProcess(net.minecraft.world.level.WorldGenLevel l, net.minecraft.world.level.StructureManager m, net.minecraft.world.level.chunk.ChunkGenerator g,
        net.minecraft.util.RandomSource r, BoundingBox b, net.minecraft.world.level.ChunkPos c, net.minecraft.core.BlockPos p); }''')
c('net.minecraft.world.level.levelgen.structure.TemplateStructurePiece', '''public abstract class TemplateStructurePiece extends StructurePiece {
    protected final net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings placeSettings = null;
    public TemplateStructurePiece(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType t, int depth,
        net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager m, net.minecraft.resources.ResourceLocation l, String name,
        net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings s, net.minecraft.core.BlockPos p) { super(t, depth, null); }
    public TemplateStructurePiece(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType t, net.minecraft.nbt.CompoundTag tag,
        net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager m,
        java.util.function.Function<net.minecraft.resources.ResourceLocation, net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings> f) { super(t, tag); }
    protected void addAdditionalSaveData(net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext c, net.minecraft.nbt.CompoundTag t) { }
    protected abstract void handleDataMarker(String m, net.minecraft.core.BlockPos p, net.minecraft.world.level.ServerLevelAccessor l, net.minecraft.util.RandomSource r, BoundingBox b);
    public void postProcess(net.minecraft.world.level.WorldGenLevel l, net.minecraft.world.level.StructureManager m, net.minecraft.world.level.chunk.ChunkGenerator g,
        net.minecraft.util.RandomSource r, BoundingBox b, net.minecraft.world.level.ChunkPos c, net.minecraft.core.BlockPos p) { } }''')
c('net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType', '''public interface StructurePieceType {
    net.minecraft.world.level.levelgen.structure.StructurePiece load(StructurePieceSerializationContext c, net.minecraft.nbt.CompoundTag t); }''')
c('net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext', '''public record StructurePieceSerializationContext(net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager structureTemplateManager) { }''')
c('net.minecraft.world.level.levelgen.structure.pieces.StructurePiecesBuilder', 'public class StructurePiecesBuilder { public void addPiece(net.minecraft.world.level.levelgen.structure.StructurePiece p) { } }')
c('net.minecraft.world.level.levelgen.structure.placement.StructurePlacementType', 'public interface StructurePlacementType<SP extends StructurePlacement> { com.mojang.serialization.Codec<SP> codec(); }')
c('net.minecraft.world.level.levelgen.structure.placement.StructurePlacement', '''public abstract class StructurePlacement {
    public enum FrequencyReductionMethod { DEFAULT, LEGACY_TYPE_1, LEGACY_TYPE_2, LEGACY_TYPE_3 }
    public static record ExclusionZone(int chunkCount) { }
    protected StructurePlacement(net.minecraft.core.Vec3i o, FrequencyReductionMethod m, float f, int salt, java.util.Optional<ExclusionZone> e) { }
    protected abstract boolean isPlacementChunk(net.minecraft.world.level.chunk.ChunkGeneratorStructureState s, int x, int z);
    public abstract StructurePlacementType<?> type(); }''')
c('net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager', 'public class StructureTemplateManager { }')
c('net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings', '''public class StructurePlaceSettings {
    public StructurePlaceSettings setRotation(net.minecraft.world.level.block.Rotation r) { return this; }
    public net.minecraft.world.level.block.Rotation getRotation() { return null; } }''')

# ---------------------------------------------------------------- client
c('net.minecraft.client.multiplayer.ClientLevel', 'public class ClientLevel extends net.minecraft.world.level.Level { }')
c('net.minecraft.client.renderer.item.ItemPropertyFunction', '''public interface ItemPropertyFunction {
    float call(net.minecraft.world.item.ItemStack s, net.minecraft.client.multiplayer.ClientLevel l, net.minecraft.world.entity.LivingEntity e, int seed); }''')
c('net.minecraft.client.renderer.item.ItemProperties', '''public class ItemProperties {
    public static void register(net.minecraft.world.item.Item i, net.minecraft.resources.ResourceLocation n, ItemPropertyFunction f) { } }''')

# ---------------------------------------------------------------- forge
c('net.minecraftforge.api.distmarker.Dist', 'public enum Dist { CLIENT, DEDICATED_SERVER }')
c('net.minecraftforge.eventbus.api.Event', '''public class Event {
    public enum Result { DENY, DEFAULT, ALLOW }
    public void setCanceled(boolean c) { } public void setResult(Result r) { } }''')
c('net.minecraftforge.eventbus.api.EventPriority', 'public enum EventPriority { HIGHEST, HIGH, NORMAL, LOW, LOWEST }')
c('net.minecraftforge.eventbus.api.SubscribeEvent', '@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) public @interface SubscribeEvent { }')
c('net.minecraftforge.eventbus.api.IEventBus', '''public interface IEventBus {
    <T extends Event> void addListener(java.util.function.Consumer<T> c);
    <T extends Event> void addListener(EventPriority p, java.util.function.Consumer<T> c);
    <T extends Event> void addListener(EventPriority p, boolean receiveCanceled, Class<T> type, java.util.function.Consumer<T> c); }''')
c('net.minecraftforge.fml.event.IModBusEvent', 'public interface IModBusEvent { }')
c('net.minecraftforge.common.MinecraftForge', 'public class MinecraftForge { public static final net.minecraftforge.eventbus.api.IEventBus EVENT_BUS = null; }')
c('net.minecraftforge.common.util.INBTSerializable', 'public interface INBTSerializable<T extends net.minecraft.nbt.Tag> { T serializeNBT(); void deserializeNBT(T t); }')
c('net.minecraftforge.common.capabilities.CapabilityDispatcher', 'public final class CapabilityDispatcher { }')
c('net.minecraftforge.common.capabilities.CapabilityProvider', 'public abstract class CapabilityProvider<B> { protected final CapabilityDispatcher getCapabilities() { return null; } }')
c('net.minecraftforge.event.AddPackFindersEvent', '''public class AddPackFindersEvent extends net.minecraftforge.eventbus.api.Event implements net.minecraftforge.fml.event.IModBusEvent {
    public void addRepositorySource(net.minecraft.server.packs.repository.RepositorySource s) { } public net.minecraft.server.packs.PackType getPackType() { return null; } }''')
c('net.minecraftforge.event.BuildCreativeModeTabContentsEvent', '''public class BuildCreativeModeTabContentsEvent extends net.minecraftforge.eventbus.api.Event implements net.minecraftforge.fml.event.IModBusEvent {
    public net.minecraft.resources.ResourceKey<net.minecraft.world.item.CreativeModeTab> getTabKey() { return null; } public void accept(net.minecraft.world.level.ItemLike i) { } }''')
c('net.minecraftforge.event.RegisterCommandsEvent', 'public class RegisterCommandsEvent extends net.minecraftforge.eventbus.api.Event { public com.mojang.brigadier.CommandDispatcher<net.minecraft.commands.CommandSourceStack> getDispatcher() { return null; } }')
c('net.minecraftforge.event.TickEvent', '''public class TickEvent extends net.minecraftforge.eventbus.api.Event {
    public enum Phase { START, END }
    public final Phase phase = null;
    public static class PlayerTickEvent extends TickEvent { public final net.minecraft.world.entity.player.Player player = null; } }''')
c('net.minecraftforge.event.entity.player.PlayerEvent', '''public class PlayerEvent extends net.minecraftforge.eventbus.api.Event {
    public net.minecraft.world.entity.player.Player getEntity() { return null; }
    public static class PlayerLoggedInEvent extends PlayerEvent { }
    public static class PlayerLoggedOutEvent extends PlayerEvent { }
    public static class PlayerRespawnEvent extends PlayerEvent { } }''')
c('net.minecraftforge.event.entity.player.PlayerInteractEvent', '''public class PlayerInteractEvent extends net.minecraftforge.event.entity.player.PlayerEvent {
    public net.minecraft.world.item.ItemStack getItemStack() { return null; } public net.minecraft.world.level.Level getLevel() { return null; }
    public net.minecraft.core.BlockPos getPos() { return null; } public void setCancellationResult(net.minecraft.world.InteractionResult r) { }
    public static class RightClickItem extends PlayerInteractEvent { }
    public static class RightClickBlock extends PlayerInteractEvent { }
    public static class EntityInteract extends PlayerInteractEvent { public net.minecraft.world.entity.Entity getTarget() { return null; } }
    public static class EntityInteractSpecific extends PlayerInteractEvent { public net.minecraft.world.entity.Entity getTarget() { return null; } } }''')
c('net.minecraftforge.event.entity.player.AttackEntityEvent', 'public class AttackEntityEvent extends net.minecraftforge.event.entity.player.PlayerEvent { public net.minecraft.world.entity.Entity getTarget() { return null; } }')
c('net.minecraftforge.event.entity.living.LivingEntityUseItemEvent', '''public class LivingEntityUseItemEvent extends net.minecraftforge.eventbus.api.Event {
    public net.minecraft.world.entity.LivingEntity getEntity() { return null; } public net.minecraft.world.item.ItemStack getItem() { return null; }
    public static class Start extends LivingEntityUseItemEvent { } public static class Tick extends LivingEntityUseItemEvent { }
    public static class Finish extends LivingEntityUseItemEvent { } }''')
c('net.minecraftforge.event.server.ServerStartedEvent', 'public class ServerStartedEvent extends net.minecraftforge.eventbus.api.Event { public net.minecraft.server.MinecraftServer getServer() { return null; } }')
c('net.minecraftforge.client.event.ModelEvent', 'public abstract class ModelEvent extends net.minecraftforge.eventbus.api.Event { public static class ModifyBakingResult extends ModelEvent implements net.minecraftforge.fml.event.IModBusEvent { } }')
c('net.minecraftforge.fml.common.Mod', '''@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @java.lang.annotation.Target(java.lang.annotation.ElementType.TYPE)
public @interface Mod { String value();
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @java.lang.annotation.Target(java.lang.annotation.ElementType.TYPE)
    @interface EventBusSubscriber { String modid() default ""; net.minecraftforge.api.distmarker.Dist[] value() default {}; Bus bus() default Bus.FORGE; enum Bus { FORGE, MOD } } }''')
c('net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext', 'public class FMLJavaModLoadingContext { public net.minecraftforge.eventbus.api.IEventBus getModEventBus() { return null; } }')
c('net.minecraftforge.forgespi.language.IModInfo', 'public interface IModInfo { String getModId(); String getDisplayName(); }')
c('net.minecraftforge.forgespi.locating.IModFile', 'public interface IModFile { java.nio.file.Path findResource(String... p); String getFileName(); }')
c('net.minecraftforge.forgespi.language.IModFileInfo', 'public interface IModFileInfo { net.minecraftforge.forgespi.locating.IModFile getFile(); }')
c('net.minecraftforge.fml.ModList', '''public class ModList {
    public static ModList get() { return null; } public boolean isLoaded(String id) { return false; }
    public java.util.List<net.minecraftforge.forgespi.language.IModInfo> getMods() { return null; }
    public net.minecraftforge.forgespi.language.IModFileInfo getModFileById(String id) { return null; } }''')
c('net.minecraftforge.registries.IForgeRegistry', 'public interface IForgeRegistry<V> { V getValue(net.minecraft.resources.ResourceLocation l); }')
c('net.minecraftforge.registries.ForgeRegistries', '''public class ForgeRegistries {
    public static final IForgeRegistry<net.minecraft.world.level.block.Block> BLOCKS = null;
    public static final IForgeRegistry<net.minecraft.world.item.Item> ITEMS = null; }''')
c('net.minecraftforge.registries.RegistryObject', 'public final class RegistryObject<T> implements java.util.function.Supplier<T> { public T get() { return null; } }')
c('net.minecraftforge.registries.DeferredRegister', '''public class DeferredRegister<T> {
    public static <B> DeferredRegister<B> create(IForgeRegistry<B> r, String modid) { return null; }
    public static <B> DeferredRegister<B> create(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<B>> k, String modid) { return null; }
    public <I extends T> RegistryObject<I> register(String name, java.util.function.Supplier<? extends I> s) { return null; }
    public void register(net.minecraftforge.eventbus.api.IEventBus bus) { } }''')
c('net.minecraftforge.resource.PathPackResources', '''public class PathPackResources implements net.minecraft.server.packs.PackResources {
    public PathPackResources(String id, boolean builtin, java.nio.file.Path p) { } public boolean isHidden() { return false; } }''')


def main(out):
    n = 0
    for fq, (imp, body) in sorted(S.items()):
        pkg, cls = fq.rsplit('.', 1)
        d = os.path.join(out, *pkg.split('.'))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, cls + '.java'), 'w') as f:
            f.write('package %s;\n%s\n%s\n' % (pkg, imp, body))
        n += 1
    print('wrote', n, 'stub classes to', out)


if __name__ == '__main__':
    main(sys.argv[1])
