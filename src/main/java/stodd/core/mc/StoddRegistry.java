package stodd.core.mc;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacementType;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import stodd.core.StoddCore;

/** Everything STODD Core registers: three structure types, their pieces, the cell-grid placement and the Log Pose. */
public final class StoddRegistry {
    private StoddRegistry() { }

    public static final DeferredRegister<StructureType<?>> STRUCTURE_TYPES = DeferredRegister.create(Registries.STRUCTURE_TYPE, StoddCore.MOD_ID);
    public static final DeferredRegister<StructurePieceType> PIECES = DeferredRegister.create(Registries.STRUCTURE_PIECE, StoddCore.MOD_ID);
    public static final DeferredRegister<StructurePlacementType<?>> PLACEMENTS = DeferredRegister.create(Registries.STRUCTURE_PLACEMENT, StoddCore.MOD_ID);
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, StoddCore.MOD_ID);

    public static final RegistryObject<StructureType<CityStructure>> CITY = STRUCTURE_TYPES.register("city_block", () -> () -> CityStructure.CODEC);
    public static final RegistryObject<StructureType<IsleStructure>> ISLE = STRUCTURE_TYPES.register("isle_block", () -> () -> IsleStructure.CODEC);

    public static final RegistryObject<StructurePieceType> GROUND_PIECE = piece("cell_ground", CellGroundPiece::new);
    public static final RegistryObject<StructurePieceType> TEMPLATE_PIECE = piece("cell_template", CellTemplatePiece::new);
    public static final RegistryObject<StructurePieceType> FEATURE_PIECE = piece("cell_features", CellFeaturePiece::new);

    public static final RegistryObject<StructurePlacementType<CellGridPlacement>> CELL_GRID = PLACEMENTS.register("cell_grid", () -> () -> CellGridPlacement.CODEC);

    public static final RegistryObject<Item> LOG_POSE = ITEMS.register("log_pose", () -> new LogPoseItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    private static RegistryObject<StructurePieceType> piece(String name, StructurePieceType type) {
        return PIECES.register(name, () -> type);
    }

    public static void register(IEventBus modBus) {
        STRUCTURE_TYPES.register(modBus);
        PIECES.register(modBus);
        PLACEMENTS.register(modBus);
        ITEMS.register(modBus);
    }

    public static void onCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) event.accept(LOG_POSE.get());
    }
}
