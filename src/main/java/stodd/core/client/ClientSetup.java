package stodd.core.client;

import net.minecraftforge.client.ConfigScreenHandler;
import net.minecraftforge.fml.ModLoadingContext;

/** Client-only start-up (called only on the client, so the screen classes never load on a server). */
public final class ClientSetup {
    private ClientSetup() { }

    public static void init() {
        // Mods > STODD Core > Config
        ModLoadingContext.get().registerExtensionPoint(ConfigScreenHandler.ConfigScreenFactory.class,
            () -> new ConfigScreenHandler.ConfigScreenFactory((mc, parent) -> new ConfigScreen(parent)));
    }
}
