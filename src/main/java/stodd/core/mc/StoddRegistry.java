package stodd.core.mc;

import com.mojang.serialization.Codec;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacementType;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import stodd.core.StoddCore;

/** Everything STODD Core registers: the sky-island density function, three structure types, their pieces, the cell-grid placement and the Log Pose. */
public final class StoddRegistry {
    private StoddRegistry() { }

    public static final DeferredRegister<StructureType<?>> STRUCTURE_TYPES = DeferredRegister.create(Registries.STRUCTURE_TYPE, StoddCore.MOD_ID);
    public static final DeferredRegister<StructurePieceType> PIECES = DeferredRegister.create(Registries.STRUCTURE_PIECE, StoddCore.MOD_ID);
    public static final DeferredRegister<StructurePlacementType<?>> PLACEMENTS = DeferredRegister.create(Registries.STRUCTURE_PLACEMENT, StoddCore.MOD_ID);
    public static final DeferredRegister<Codec<? extends DensityFunction>> DENSITY_TYPES = DeferredRegister.create(Registries.DENSITY_FUNCTION_TYPE, StoddCore.MOD_ID);
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, StoddCore.MOD_ID);
    public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(ForgeRegistries.BLOCKS, StoddCore.MOD_ID);

    /** the wall of a sunken island's dome (BubbleBlock); its light and toughness come from [deepIslands] in the config */
    public static final RegistryObject<Block> BUBBLE = BLOCKS.register("bubble", () -> {
        stodd.core.config.StoddConfig c = stodd.core.config.StoddConfig.get();
        final int light = Math.max(0, Math.min(15, c.integer("deepIslands.bubbleLight", 7)));
        boolean breakable = c.bool("deepIslands.bubbleBreakable", false);
        BlockBehaviour.Properties p = BlockBehaviour.Properties.of()
            .mapColor(MapColor.WATER)
            .noCollission()
            .noOcclusion()
            // not "solid": ships (Valkyrien Skies / Eureka) take a solid block's outline as its collision, and must sail through
            // (water still cannot flow into it or wash it away: BubbleBlock refuses every liquid)
            .forceSolidOff()
            .pushReaction(PushReaction.BLOCK)
            .sound(SoundType.GLASS)
            .lightLevel(s -> light)
            .isValidSpawn((s, l, pos, e) -> false)
            .isRedstoneConductor((s, l, pos) -> false)
            .isSuffocating((s, l, pos) -> false)
            .isViewBlocking((s, l, pos) -> false);
        p = breakable ? p.strength(0.6F) : p.strength(-1.0F, 3600000.0F).noLootTable();
        return new BubbleBlock(p);
    });

    /** the cloud sea round sky islands (StoddFluids.CLOUD): boats and ships sail on it */
    public static final RegistryObject<LiquidBlock> DENSE_CLOUD = BLOCKS.register("dense_cloud", () -> new LiquidBlock(StoddFluids.CLOUD,
        BlockBehaviour.Properties.copy(Blocks.WATER).mapColor(MapColor.SNOW)));
    /** a knock up stream (StoddFluids.STREAM): carries everything up */
    public static final RegistryObject<LiquidBlock> SKY_STREAM = BLOCKS.register("sky_stream", () -> new SkyStreamBlock(StoddFluids.STREAM,
        BlockBehaviour.Properties.copy(Blocks.WATER).mapColor(MapColor.COLOR_LIGHT_BLUE).lightLevel(s -> 6)));

    public static final RegistryObject<Codec<? extends DensityFunction>> SKY_DENSITY = DENSITY_TYPES.register("sky", () -> SkyDensity.CODEC.codec());

    public static final RegistryObject<StructureType<CityStructure>> CITY = STRUCTURE_TYPES.register("city_block", () -> () -> CityStructure.CODEC);
    public static final RegistryObject<StructureType<IsleStructure>> ISLE = STRUCTURE_TYPES.register("isle_block", () -> () -> IsleStructure.CODEC);

    public static final RegistryObject<StructurePieceType> GROUND_PIECE = piece("cell_ground", CellGroundPiece::new);
    public static final RegistryObject<StructurePieceType> TEMPLATE_PIECE = piece("cell_template", CellTemplatePiece::new);
    public static final RegistryObject<StructurePieceType> FEATURE_PIECE = piece("cell_features", CellFeaturePiece::new);
    public static final RegistryObject<StructurePieceType> DOME_PIECE = piece("cell_dome", CellDomePiece::new);
    public static final RegistryObject<StructurePieceType> LIFE_PIECE = piece("cell_life", CellLifePiece::new);
    public static final RegistryObject<StructurePieceType> WAYSTONE_PIECE = piece("cell_waystone", CellWaystonePiece::new);
    public static final RegistryObject<StructurePieceType> CLOUD_PIECE = piece("cell_cloud", CellCloudPiece::new);

    public static final RegistryObject<StructurePlacementType<CellGridPlacement>> CELL_GRID = PLACEMENTS.register("cell_grid", () -> () -> CellGridPlacement.CODEC);

    public static final RegistryObject<Item> BUBBLE_ITEM = ITEMS.register("bubble", () -> new BlockItem(BUBBLE.get(), new Item.Properties()));
    public static final RegistryObject<Item> DENSE_CLOUD_BUCKET = ITEMS.register("dense_cloud_bucket",
        () -> new BucketItem(StoddFluids.CLOUD, new Item.Properties().craftRemainder(Items.BUCKET).stacksTo(1)));
    public static final RegistryObject<Item> SKY_STREAM_BUCKET = ITEMS.register("sky_stream_bucket",
        () -> new BucketItem(StoddFluids.STREAM, new Item.Properties().craftRemainder(Items.BUCKET).stacksTo(1)));
    public static final RegistryObject<Item> LOG_POSE = ITEMS.register("log_pose", () -> new LogPoseItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    private static RegistryObject<StructurePieceType> piece(String name, StructurePieceType type) {
        return PIECES.register(name, () -> type);
    }

    public static void register(IEventBus modBus) {
        DENSITY_TYPES.register(modBus);
        StoddFluids.FLUID_TYPES.register(modBus);
        StoddFluids.FLUIDS.register(modBus);
        BLOCKS.register(modBus);
        STRUCTURE_TYPES.register(modBus);
        PIECES.register(modBus);
        PLACEMENTS.register(modBus);
        ITEMS.register(modBus);
    }

    public static void onCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) {
            event.accept(LOG_POSE.get());
            event.accept(DENSE_CLOUD_BUCKET.get());
            event.accept(SKY_STREAM_BUCKET.get());
        }
        if (event.getTabKey() == CreativeModeTabs.FUNCTIONAL_BLOCKS) event.accept(BUBBLE_ITEM.get());
    }
}
