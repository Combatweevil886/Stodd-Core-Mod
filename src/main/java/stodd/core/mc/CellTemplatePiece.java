package stodd.core.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.TemplateStructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager;

/**
 * One building / landmark template (data/stodd/structures/city/*.nbt or isle/*.nbt), rotated about its own corner, exactly as
 * /place template placed it before. Vanilla's template piece does the rest: it builds only the part inside the chunk that is
 * generating, so a 48 x 48 block shows up whole once its chunks are there.
 */
public final class CellTemplatePiece extends TemplateStructurePiece {
    CellTemplatePiece(StructureTemplateManager templates, ResourceLocation template, Rotation rotation, BlockPos origin) {
        super(StoddRegistry.TEMPLATE_PIECE.get(), 0, templates, template, template.toString(), settings(rotation), origin);
    }

    public CellTemplatePiece(StructurePieceSerializationContext context, CompoundTag tag) {
        super(StoddRegistry.TEMPLATE_PIECE.get(), tag, context.structureTemplateManager(), rl -> settings(rotationOf(tag)));
    }

    private static Rotation rotationOf(CompoundTag tag) {
        try { return Rotation.valueOf(tag.getString("Rot")); } catch (IllegalArgumentException e) { return Rotation.NONE; }
    }

    static StructurePlaceSettings settings(Rotation rotation) {
        return new StructurePlaceSettings().setRotation(rotation);
    }

    static Rotation rotation(int r) {
        switch (r & 3) {
            case 1: return Rotation.CLOCKWISE_90;
            case 2: return Rotation.CLOCKWISE_180;
            case 3: return Rotation.COUNTERCLOCKWISE_90;
            default: return Rotation.NONE;
        }
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
        super.addAdditionalSaveData(context, tag);
        tag.putString("Rot", this.placeSettings.getRotation().name());
    }

    @Override
    protected void handleDataMarker(String marker, BlockPos pos, ServerLevelAccessor level, RandomSource random, BoundingBox box) { }
}
