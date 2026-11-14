package stodd.chrome;

import net.minecraftforge.fml.common.Mod;

/**
 * STODD Chrome: endgame and midgame implants for Project: Edgerunner. Everything it adds is data, read by the mods it builds on:
 *   addon/stodd_chrome/items              the implant items (Palladium addon items, like Edgerunner's own)
 *   data/stodd_chrome/kubejs_scripts      registers them with Edgerunner's Ripperdoc (load, body slot, power) and runs their
 *                                         special effects; Palladium loads these scripts from every mod jar
 *   data/stodd_chrome/recipes             their assembly at Edgerunner's tailoring bench, from Edgerunner's components
 *   data/project_edgerunner/tags          lets the Ripperdoc's slots take them
 * This class only makes the jar a mod.
 */
@Mod("stodd_chrome")
public final class StoddChrome {
    public StoddChrome() { }
}
