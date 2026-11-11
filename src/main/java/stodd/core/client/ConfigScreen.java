package stodd.core.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import stodd.core.config.StoddConfig;
import stodd.core.config.Toml;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The STODD config in the game (Mods > STODD Core > Config): one page of settings at a time from one of the four files, a search
 * box, each value in a text field written as in the file (hover a field for what the setting does), Save writes the files.
 * It edits the files on this computer: in single player that is the world's config; a server keeps its own (/stodd config set).
 */
public final class ConfigScreen extends Screen {
    private static final int ROW = 22, TOP = 72;

    private final Screen parent;
    private String file = "world";
    private String filter = "";
    private int page = 0;
    private final Map<String, String> pending = new LinkedHashMap<>();
    private String status = "";
    private int statusColor = 0xA0A0A0;

    private EditBox search;
    private Button prev, next;
    private final List<EditBox> rowBoxes = new ArrayList<>();
    private final List<String> rowPaths = new ArrayList<>();
    private int pages = 1;

    public ConfigScreen(Screen parent) {
        super(Component.literal("STODD Core settings"));
        this.parent = parent;
    }

    private int rowsPerPage() { return Math.max(3, (this.height - TOP - 64) / ROW); }

    @Override
    protected void init() {
        StoddConfig cfg = StoddConfig.refresh();
        List<String> files = cfg.files();
        int gap = 4, w = this.width - 20;
        int tw = Math.min(110, (w - gap * (files.size() - 1)) / files.size());
        int tx = (this.width - (tw * files.size() + gap * (files.size() - 1))) / 2;
        for (String f : files) {
            Button b = Button.builder(Component.literal(f.equals(file) ? "> " + f + " <" : f), bt -> { file = f; page = 0; rebuildWidgets(); })
                .bounds(tx, 22, tw, 20).build();
            b.active = !f.equals(file);
            addRenderableWidget(b);
            tx += tw + gap;
        }
        search = new EditBox(this.font, 10, 48, w, 16, Component.literal("Search"));
        search.setMaxLength(200);
        search.setValue(filter);
        search.setResponder(s -> { if (!s.equals(filter)) { filter = s; page = 0; layoutRows(); } });
        addRenderableWidget(search);

        int by = this.height - 26;
        prev = addRenderableWidget(Button.builder(Component.literal("<"), b -> { page = Math.max(0, page - 1); layoutRows(); }).bounds(10, by, 20, 20).build());
        next = addRenderableWidget(Button.builder(Component.literal(">"), b -> { page = Math.min(pages - 1, page + 1); layoutRows(); }).bounds(84, by, 20, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Save"), b -> save(false)).bounds(this.width - 274, by, 80, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Save & close"), b -> save(true)).bounds(this.width - 190, by, 90, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Cancel"), b -> onClose()).bounds(this.width - 96, by, 86, 20).build());
        layoutRows();
    }

    private List<StoddConfig.Setting> visible(StoddConfig cfg) {
        List<StoddConfig.Setting> out = new ArrayList<>();
        String f = filter.trim().toLowerCase(Locale.ROOT);
        for (StoddConfig.Setting st : cfg.settings().values()) {
            if (!st.file.equals(file)) continue;
            if (!f.isEmpty() && !st.path.toLowerCase(Locale.ROOT).contains(f) && !st.help().toLowerCase(Locale.ROOT).contains(f)) continue;
            out.add(st);
        }
        return out;
    }

    private void layoutRows() {
        for (EditBox b : rowBoxes) removeWidget(b);
        rowBoxes.clear();
        rowPaths.clear();
        StoddConfig cfg = StoddConfig.get();
        List<StoddConfig.Setting> list = visible(cfg);
        int per = rowsPerPage();
        pages = Math.max(1, (list.size() + per - 1) / per);
        page = Math.max(0, Math.min(page, pages - 1));
        int w = this.width - 20, labelW = Math.max(120, (int) (w * 0.42));
        int y = TOP;
        for (int i = page * per; i < Math.min(list.size(), (page + 1) * per); i++) {
            StoddConfig.Setting st = list.get(i);
            final String path = st.path;
            final String original = Toml.format(cfg.value(path));
            EditBox box = new EditBox(this.font, 10 + labelW, y, w - labelW, 18, Component.literal(path));
            box.setMaxLength(32767);
            box.setValue(pending.getOrDefault(path, original));
            box.setCursorPosition(0);
            box.setHighlightPos(0);
            String help = st.help();
            box.setTooltip(Tooltip.create(Component.literal(path + (help.isEmpty() ? "" : "\n" + help) + "\nDefault: " + Toml.format(st.def))));
            box.setResponder(s -> { if (s.equals(original)) pending.remove(path); else pending.put(path, s); });
            addRenderableWidget(box);
            rowBoxes.add(box);
            rowPaths.add(path);
            y += ROW;
        }
        if (prev != null) prev.active = page > 0;
        if (next != null) next.active = page < pages - 1;
    }

    private void save(boolean close) {
        if (pending.isEmpty()) {
            if (close) onClose();
            else { status = "Nothing to save."; statusColor = 0xA0A0A0; }
            return;
        }
        int n = pending.size();
        boolean world = false;
        for (String k : pending.keySet()) if (k.startsWith("skyIslands.") || k.startsWith("spawnIslands.")) world = true;
        List<String> bad = StoddConfig.setAll(new LinkedHashMap<>(pending));
        if (bad.isEmpty()) {
            pending.clear();
            status = "Saved " + n + " setting(s) in " + StoddConfig.get().dir() + ". " + (world
                ? "World settings apply to worlds created from now on (spawnIslands after a restart)."
                : "In a world, /reload applies them.");
            statusColor = 0x80FF80;
            if (close) { onClose(); return; }
        } else {
            status = bad.size() + " problem(s): " + String.join("; ", bad);
            statusColor = 0xFF8080;
            // what went in is no longer pending; the rest stays yellow so it can be fixed
            StoddConfig cfg = StoddConfig.get();
            for (String k : new ArrayList<>(pending.keySet())) if (Toml.format(cfg.value(k)).equals(pending.get(k))) pending.remove(k);
        }
        layoutRows();
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g);
        g.drawCenteredString(this.font, this.title, this.width / 2, 8, 0xFFD27F);
        StoddConfig cfg = StoddConfig.get();
        int w = this.width - 20, labelW = Math.max(120, (int) (w * 0.42));
        for (int i = 0; i < rowPaths.size(); i++) {
            String path = rowPaths.get(i);
            int color = pending.containsKey(path) ? 0xFFFF55 : (cfg.isSet(path) && !Toml.format(cfg.value(path)).equals(Toml.format(cfg.setting(path).def)) ? 0xFFFFFF : 0xA8A8A8);
            String label = this.font.plainSubstrByWidth(path, labelW - 8);
            g.drawString(this.font, label, 12, TOP + i * ROW + 5, color);
        }
        g.drawString(this.font, (page + 1) + " / " + pages, 36, this.height - 20, 0xFFFFFF);
        if (!status.isEmpty()) g.drawString(this.font, this.font.plainSubstrByWidth(status, this.width - 20), 10, this.height - 40, statusColor);
        else g.drawString(this.font, this.font.plainSubstrByWidth("Yellow = changed, not saved yet. White = set in the file. Hover a field for help. On a server use /stodd config set.", this.width - 20), 10, this.height - 40, 0x808080);
        super.render(g, mouseX, mouseY, partialTick);
        if (search != null && search.getValue().isEmpty() && !search.isFocused()) g.drawString(this.font, "search settings (name or explanation)", 14, 52, 0x707070);
    }

    @Override
    public void onClose() {
        if (this.minecraft != null) this.minecraft.setScreen(parent);
    }
}
