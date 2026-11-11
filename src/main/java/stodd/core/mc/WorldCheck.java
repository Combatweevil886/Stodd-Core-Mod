package stodd.core.mc;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.resources.Resource;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.fml.ModList;
import stodd.core.StoddCore;
import stodd.core.gen.IslandFinder;
import stodd.core.gen.WorldRules;

import java.util.ArrayList;
import java.util.List;

/**
 * "Is this server really generating the STODD islands?" - asked of the world's own terrain function at start-up (written to the log)
 * and with /stodd core world. Samples the continentalness on a 3 km square around 0,0 and counts land and separate landmasses.
 */
public final class WorldCheck {
    private WorldCheck() { }

    public static final class Line {
        public final char kind;    // 'o' ok, 'w' warning, 'b' bad, 'i' info
        public final String text;
        Line(char kind, String text) { this.kind = kind; this.text = text; }
    }

    public static void onServerStarted(ServerStartedEvent event) {
        try {
            for (Line l : report(event.getServer())) {
                if (l.kind == 'b' || l.kind == 'w') StoddCore.LOG.warn("[STODD Core] {}", l.text);
                else StoddCore.LOG.info("[STODD Core] {}", l.text);
            }
        } catch (Throwable t) {
            StoddCore.LOG.warn("[STODD Core] world check failed: {}", t.toString());
        }
    }

    public static List<Line> report(MinecraftServer server) {
        List<Line> out = new ArrayList<>();
        WorldRules rules = WorldRules.get();
        out.add(new Line('i', "STODD world check (rules: " + rules.source + ")"));
        if (ModList.get().isLoaded("stodd_compat")) out.add(new Line('b', "The old STODD Compat mod is installed. Delete mods/stodd_compat-*.jar."));
        if (!ModList.get().isLoaded("survivalisland")) out.add(new Line('b', "Survival Island is not installed: there can be no islands."));
        boolean packOn = server.getPackRepository().getSelectedIds().contains(WorldPack.ID);
        out.add(new Line(packOn ? 'o' : 'b', packOn ? "The STODD island world pack is enabled (it sits above every other mod's data)."
            : "The STODD island world pack is NOT enabled; another mod may be replacing the terrain."));
        try {
            List<String> prov = new ArrayList<>();
            for (Resource r : server.getResourceManager().getResourceStack(new ResourceLocation("minecraft", "worldgen/noise_settings/overworld.json"))) prov.add(r.sourcePackId());
            if (!prov.isEmpty()) out.add(new Line('i', "Overworld terrain files, lowest priority first: " + String.join("  >  ", prov) + "  (the last one is used)"));
        } catch (Throwable t) { /* informative only */ }
        ServerLevel ow = server.overworld();
        out.add(new Line('i', "Overworld generator: " + ow.getChunkSource().getGenerator().getClass().getSimpleName()));
        Worlds.Tools tools = Worlds.of(ow);
        IslandFinder f = tools.ground;
        int half = 12, step = 128, n = half * 2 + 1;
        boolean[][] land = new boolean[n][n];
        int cells = 0;
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
            double v = f.sample((i - half) * step, (j - half) * step);
            land[i][j] = v > rules.landThreshold;
            if (land[i][j]) cells++;
        }
        boolean[][] seen = new boolean[n][n];
        int blobs = 0, biggest = 0;
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
            if (!land[i][j] || seen[i][j]) continue;
            blobs++;
            int size = 0;
            java.util.ArrayDeque<int[]> st = new java.util.ArrayDeque<>();
            st.push(new int[] { i, j });
            seen[i][j] = true;
            while (!st.isEmpty()) {
                int[] c = st.pop();
                size++;
                int[][] nb = { { c[0] + 1, c[1] }, { c[0] - 1, c[1] }, { c[0], c[1] + 1 }, { c[0], c[1] - 1 } };
                for (int[] q : nb) {
                    if (q[0] < 0 || q[1] < 0 || q[0] >= n || q[1] >= n || !land[q[0]][q[1]] || seen[q[0]][q[1]]) continue;
                    seen[q[0]][q[1]] = true;
                    st.push(q);
                }
            }
            biggest = Math.max(biggest, size);
        }
        double frac = cells / (double) (n * n);
        boolean islands = frac <= 0.4 && biggest <= 80;
        out.add(new Line(islands ? 'o' : 'b', (islands ? "ISLANDS: " : "NOT ISLANDS: ") + n * n + " samples over " + (n * step / 1000.0) + " km: "
            + Math.round(frac * 1000) / 10.0 + "% land, " + blobs + " separate landmasses, the biggest " + biggest + " samples."));
        if (!islands) out.add(new Line('i', "New chunks will not be islands. If this world was created before STODD Core 3, or while another world type was forced, delete the world folder and start again."));
        boolean cities = server.registryAccess().registryOrThrow(Registries.STRUCTURE_SET).containsKey(new ResourceLocation("stodd", "city_blocks"));
        out.add(new Line(cities ? 'o' : 'w', cities ? "Cities, dressed islands and sky-island dressing are generated with the chunks (structure sets stodd:city_blocks, stodd:isle_blocks, stodd:sky_blocks)."
            : "The structure set stodd:city_blocks is missing: cities will not generate."));
        return out;
    }
}
