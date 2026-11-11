package stodd.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Copies /embedded/** out of the jar into the game folder.
 *
 * embedded/index.txt has one line per file: "S<TAB>path" for a script (always kept in step with the jar), "C<TAB>path" for a
 * config (written when missing, and replaced only when the mod version changes, so a server owner's edits survive restarts) or
 * "K<TAB>path" for a file that belongs to the owner (written only when missing, never replaced).
 * Whenever a file is replaced, the old one is kept next to it as "<name>.stodd-old".
 *
 * After the copy the STODD config (config/stodd/*.toml, stodd.core.config.StoddConfig) is read, and written where settings are
 * missing, and {@link IslandConfig} turns its [spawnIslands] into config/survivalisland.json (Survival Island reads its json when
 * it initialises, which is after this).
 */
public final class Installer {
    private static final String TAG = "[STODD Core] ";
    private static final String STAMP = "config/stodd_core.stamp";

    private Installer() { }

    /** Game folder: Forge's FMLPaths.GAMEDIR by reflection, else the working directory (what Survival Island itself uses). */
    public static Path gameDir() {
        String forced = System.getProperty("stodd_core.gamedir");
        if (forced != null && !forced.isEmpty()) return Paths.get(forced).toAbsolutePath().normalize();
        try {
            Class<?> paths = Class.forName("net.minecraftforge.fml.loading.FMLPaths");
            Object gameDir = null;
            for (Object c : paths.getEnumConstants()) if ("GAMEDIR".equals(String.valueOf(c))) gameDir = c;
            if (gameDir != null) {
                Method get = paths.getMethod("get");
                Object p = get.invoke(gameDir);
                if (p instanceof Path) return ((Path) p).toAbsolutePath().normalize();
            }
        } catch (Throwable ignored) { }
        return Paths.get("").toAbsolutePath().normalize();
    }

    private static byte[] resource(String name) throws IOException {
        try (InputStream in = Installer.class.getResourceAsStream(name)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** The mod version written into the jar at build time ("?" when missing). */
    static String version() {
        try {
            byte[] v = resource("/embedded/version.txt");
            return v == null ? "?" : new String(v, StandardCharsets.UTF_8).trim();
        } catch (IOException e) { return "?"; }
    }

    static void run() throws IOException {
        byte[] idx = resource("/embedded/index.txt");
        byte[] ver = resource("/embedded/version.txt");
        if (idx == null || ver == null) {
            System.out.println(TAG + "no embedded files in this jar, nothing to install.");
            return;
        }
        String version = new String(ver, StandardCharsets.UTF_8).trim();
        Path root = gameDir();
        Path stamp = root.resolve(STAMP);
        String old = Files.exists(stamp) ? new String(Files.readAllBytes(stamp), StandardCharsets.UTF_8).trim() : "";
        boolean newVersion = !old.equals(version);
        int wrote = 0, kept = 0, own = 0, same = 0, failed = 0;
        for (String line : new String(idx, StandardCharsets.UTF_8).split("\\R")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            int tab = line.indexOf('\t');
            if (tab != 1) continue;
            char policy = line.charAt(0);
            String rel = line.substring(2);
            try {
                Path target = root.resolve(rel).normalize();
                if (!target.startsWith(root) || rel.contains("..")) throw new IOException("refusing a path outside the game folder: " + rel);
                byte[] data = resource("/embedded/" + rel);
                if (data == null) throw new IOException("listed but missing from the jar: " + rel);
                if (Files.exists(target)) {
                    byte[] cur = Files.readAllBytes(target);
                    if (java.util.Arrays.equals(cur, data)) { same++; continue; }
                    if (policy == 'K') { own++; continue; }
                    if (policy == 'C' && !newVersion) { kept++; continue; }
                    Files.copy(target, target.resolveSibling(target.getFileName() + ".stodd-old"), StandardCopyOption.REPLACE_EXISTING);
                } else {
                    Files.createDirectories(target.getParent());
                }
                Path tmp = target.resolveSibling(target.getFileName() + ".stodd-tmp");
                Files.write(tmp, data);
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
                wrote++;
            } catch (IOException e) {
                failed++;
                System.err.println(TAG + "could not install " + rel + ": " + e);
            }
        }
        if (newVersion && failed == 0) {
            Files.createDirectories(stamp.getParent());
            Files.write(stamp, (version + "\n").getBytes(StandardCharsets.UTF_8));
        }
        System.out.println(TAG + "version " + version + " in " + root + ": " + wrote + " file(s) written, " + same + " already current, "
            + kept + " edited config(s) kept" + (own > 0 ? ", " + own + " owner file(s) left alone" : "") + (failed > 0 ? ", " + failed + " FAILED" : "") + (newVersion && old.length() > 0 ? " (updated from " + old + ")" : ""));
        if (kept > 0) System.out.println(TAG + "kept configs that differ from the jar's; delete them (or config/stodd_core.stamp) to get the defaults back.");
        try {
            stodd.core.config.StoddConfig cfg = stodd.core.config.StoddConfig.load(root);
            System.out.println(TAG + "settings: " + cfg.dir() + " (" + String.join(", ", cfg.files()) + ".toml, " + cfg.settings().size() + " settings)");
            for (String n : cfg.notes()) System.out.println(TAG + "config: " + n);
        } catch (Throwable t) {
            System.err.println(TAG + "could not read the config in config/stodd: " + t);
        }
        try {
            System.out.println(TAG + IslandConfig.sync(root));
        } catch (Throwable t) {
            System.err.println(TAG + "could not apply the spawn-island settings: " + t);
        }
        warnAboutOldJars(root);
    }

    /** The data jars of earlier versions carry the same files under another mod id: both loaded would fight over them. */
    private static void warnAboutOldJars(Path root) {
        try {
            Path mods = root.resolve("mods");
            if (!Files.isDirectory(mods)) return;
            List<String> found = new ArrayList<>();
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(mods, "stodd_compat*")) {
                for (Path p : ds) found.add(p.getFileName().toString());
            }
            if (!found.isEmpty()) System.err.println(TAG + "WARNING: delete the old STODD Compat jar(s) from the mods folder, STODD Core replaces them (they carry older copies of the world files that can win over this mod's): " + found);
        } catch (Throwable ignored) { }
    }
}
