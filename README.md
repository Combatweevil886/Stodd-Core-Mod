# STODD Core 3.1.0: the core mod of *mods 4 stodd (season 2)*, as a real Forge mod

Forge 1.20.1 / Forge 47.4.20. **One jar, `mods/stodd_core-3.1.0.jar`.** A **compiled Forge mod** (Java, built with ForgeGradle) and an **add-on to the pack's power-system mods**: True Prime Piece (Devil Fruits), Jujutsu Craft (Cursed Energy), Malum (dark magic), Project: Edgerunner (chrome) and Curios. It holds the **ten origins** and their rules, the **Survival Island world** (guaranteed on servers too) with **sky islands that are normal islands lifted into the sky**, **city islands and dressed islands generated with the terrain like any structure**, the **Log Pose as a real item with its own needle**, the levels, power caps, mastery, level links, waystones, ore tiers and Downgrade Template that run as KubeJS scripts the mod installs for you, and **every setting in `config/stodd/*.toml`** (section 0).

## Getting the jar

The mod is built on GitHub, in the repository **Combatweevil886/Stodd-Core-Mod**: every push compiles it against the real Minecraft 1.20.1 and Forge 47.4.20, runs all the tests, and puts the game-ready jar on the `dist` branch: **https://github.com/Combatweevil886/Stodd-Core-Mod/raw/dist/stodd_core-3.1.0.jar** (also attached to each run under Actions as the artifact `stodd_core`).

To build it yourself instead: a Java 17 JDK, then `gradlew build` in the project folder; the game-ready jar is the `...-renamed.jar` in `build/libs` (rename it to `stodd_core-3.1.0.jar`). Not the `-unobfuscated` one: that one has development names and does not run in the game.

## How the mod is put together

| Part | What it is |
|---|---|
| Java, `stodd.core.gen` | The logic, plain Java so it is tested on its own: which island a point is on and where its centre is, the theme rolls (identical to the scripts'), the city planner, the dressed-island and sky-island planner, the origin rules, the Log Pose |
| Java, `stodd.core.mc` | The Minecraft side: the sky-island density function `stodd_core:sky`, the structure types `stodd_core:city_block` and `stodd_core:isle_block`, their pieces and the 48-block cell grid placement; the **island world pack**; the Log Pose item and needle; `/stodd core ...`, `/stodd logpose` and `/stodd config` |
| Java, `stodd.core.config` | **The settings**: `config/stodd/*.toml`, read, checked and (re)written; handed to the scripts as one object (section 0) |
| Java, `stodd.core.client` | The settings screen (Mods > STODD Core > Config) |
| Java, `stodd.core.addon` | The **add-on to the power mods**: the origin gate on Forge's events, and live access to the other mods' player data (section 7) |
| Java, `stodd.core.api` | What the KubeJS scripts call (`StoddApi`) |
| Data (`data/`, `assets/`) | Everything an origin IS (the ten origins, Curios slots, health, cyberware capacity, the Apoli locks), the 9 biomes, the 126 city block templates and 55 landmark templates, the three cell structures, the Log Pose model and recipe, +15% Ancient Debris |
| `packs/stodd_world` | The island world (overworld noise settings, the default world preset, climate and sky-island functions) as a built-in data pack that sits **above every mod** |
| `embedded/` | The KubeJS scripts and the other mods' configs; on start-up the mod copies them into `kubejs/` and `config/` (scripts, `00_config.js` included, follow the jar; the other mods' configs survive your edits) |
| `stodd_config/schema.json` | Every setting with its default and its explanation, made from `00_config.js` when the jar is built (`tools/gen_config.js`); the config files are written from it |

* **Every setting is in `config/stodd/*.toml`** (section 0). `00_config.js` only holds the defaults and their explanations now, and is replaced on every start.
* **If KubeJS fails, the ten origins still appear with their health, slots, starter kit and locks** (data), the origin rules are still enforced (Java), and the cities, dressed islands and the Log Pose still work (Java). Levels, mastery and the waystones need the scripts.
* **With an older jar the new scripts still work**: they look for the Java side and, without it, build the cities and drive the compass Log Pose themselves as in 2.3.0.

## Install

* Put **`stodd_core-3.1.0.jar`** in `mods/`. **Delete every `stodd_compat-*.jar` and every older `stodd_core-*.jar`.** Start once, stop, start again (the first start installs the scripts; KubeJS and Survival Island read them on the next).
* **Start a new world.** The cities, dressed islands and sky dressing are generated with new chunks, and the island terrain only applies to new chunks. **On a server, delete (or rename) the world folder** (`level-name` in `server.properties`) before the first start. In an existing world, land that was already generated keeps what it had; set `city.scriptBuilder = true` and `makeover.scriptBuilder = true` in `config/stodd/world.toml` to let the scripts build on that old land the 2.3.0 way.
* The overrides zip and full-pack zip of earlier versions are not needed any more: the jar installs everything.
* Same mods as before: Survival Island, Origins, Curios, KubeJS, Waystones, True Prime Piece, Jujutsu Craft, Malum, Project: Edgerunner.

## What changed in 3.1.0

* **Sky islands are normal islands, lifted into the sky** (section 4c). A share of the world's islands, on the normal island spacing, is generated up in the air instead of in the sea: the same outline, the same terrain (hills, cliffs, beaches round the rim), the same biomes with their trees, grass, flowers, animals and ores, with a rocky underside hanging below. Where the island would have stood there is a shallow sea. How many: `skyIslands.rarity` (none, very_rare, rare, normal, common, very_common, or an exact `chance`). The island at the world spawn always stays on the ground. The old fixed sky islands (flat meadows over the gaps between islands) are gone; `skyIslands.biome` and `extraPlants` bring their look back if you want it.
* **Every setting in one place: `config/stodd/`** (section 0). `world.toml`, `origins.toml`, `progression.toml` and `general.toml` list all 420 settings of the mod with their explanations: the spawn islands and their spacing, the sky islands, city and dressed-island rarity, island themes and names, waystones, the Log Pose, the origins and their slots and rules, the power systems, levels, mastery, level links, boss scaling, ore tiers and the crash guards. Edit them in the file, with `/stodd config set`, or in the game under **Mods > STODD Core > Config**.
* **Rarity for cities and dressed islands**: `city.rarity` and `makeover.rarity` (none, very_rare, rare, normal, common, very_common, or a number), on top of each kind's own `chance` under `[islandThemes.<kind>]`.
* `config/stodd_islands.properties` moves into `[spawnIslands]` of `world.toml` by itself (the old file is renamed `...moved-to-stodd-world-toml`). Edits you made to `00_config.js` are kept as `00_config.js.stodd-old`; copy them into the new files.
* **Upgrading from 3.0.0:** replace the jar and **start a new world** (the sky islands and the ground under them are generated differently).

## What changed in 3.0.0

* **STODD Core is a real Forge mod now.** The parts that suffered from being scripts (anything that had to happen while the world generates, the Log Pose needle, the origin locks) are Java. Everything else keeps working as before.
* **Servers get islands, and it no longer depends on luck.** The island world is a built-in data pack, required and placed **at the top of the pack list, above every other mod's data**, so no other mod, leftover jar or load order can replace the Survival Island terrain (also not BCLib forcing its own preset: that preset takes its shape from the same overworld noise settings). At start-up the log says `[STODD Core] ISLANDS: ...` or `NOT ISLANDS: ...`, measured on the terrain function the server really uses; `/stodd core world` (operator) shows the same with which packs provide the terrain. A world folder that was created without islands stays that way: delete it once.
* **Cities are generated like normal structures** (section 4b). A city island is a grid of structures, one per 48 x 48 block, built **by the world generator, in the same pass as the chunk**: no commands, no queue, no server time spent while you watch, nothing appearing when you walk in. The ground under each block is cleared, the foundation poured and the style's biome set at generation. Every city island also gets **its own layout** now (before, every island of a style had the same pattern around its plaza).
* **Dressed islands (Ember, Sakura, Ruins, Crystal, Skull Cove) and the sky-island dressing are structures too** (sections 4c, 4d): repainted ground, biome, landmarks, centrepiece, and on sky islands the trees, flowers and ruins, all generated with the chunks.
* **The Log Pose is a real item and its needle points** (section 4a). The 2.x Log Pose was a vanilla compass whose lodestone data a script rewrote every second; a compass with no lodestone position spins, and that is what you saw whenever the script had no target to write (most likely its island search never finished: on a server that was not generating islands it climbs the terrain for kilometres; I could not watch it in the game to be sure). Now the server works the target out in Java and stores it in the item, and the item's own needle turns towards it, with vanilla's gentle swing. While it is still searching the bar says so; outside the overworld the needle wanders on purpose. **Old Log Poses in inventories are swapped for the new item automatically**; the recipe is the same.
* **One centre per island.** The island a point belongs to is found as a whole (a flood fill over a fixed lattice of the terrain function), so every point of an island gives the same centre, in every chunk, on every thread, after every restart. The centre is snapped to the middle of its city cell, so the plaza, the waystone and the Log Pose target are one spot. The scripts register new islands by this centre, so the scripts and the generator always agree on which island is a city (checked on 3,000 island centres: identical themes for all 13 themes).
* **An add-on to the power mods** (section 7). The origin rules are enforced in Java on the events those mods really use (eating, right-clicking items, Malum's altars and machines, ripperdocs and ripperdoc NPCs, hitting with a magic weapon, equipping a curio), and the mods' **live player data** (True Prime Piece's stats, Jujutsu Craft's MCreator variables, any mod's capability) is read and written directly, so the level links and the Jujutsu starter purge work on the real values and the mods' own HUDs update at once. New: **`/stodd addons`** (what is installed and what STODD does with it, your origin's rules) and **`/stodd addons scan [player]`** (operator: every piece of mod data on a player, to tune the link names).
* The scripts' city builder, makeover builder, compass Log Pose and item gate **stand down automatically** when the Java side is present (one refusal message, not two; nothing built twice).
* **Upgrading from 2.3.0:** replace the jar, delete `stodd_compat-*.jar` and older `stodd_core-*.jar`, **start a new world** for the generated cities and islands. `00_config.js` is replaced because the version changed (yours is kept as `00_config.js.stodd-old`). `config/stodd_islands.properties` is kept.

## What changed in 2.3.0

* **A server generating a normal world: what I found, and what is different now (section 4f).** I could not start Minecraft here, so I cannot promise this is the whole story, but reading the sources of your pack's mods shows a very likely cause. Your `server.properties` says `level-type=bclib\:normal`, and your pack's `config/bclib/server.json` has `forceBetterXPreset: true`, which makes BCLib force its own preset (`bclib:normal`) on a dedicated server whatever `level-type` says. That preset takes its overworld shape from the `minecraft:overworld` noise settings, so STODD's copy of that file has to win; but a data file in a mod jar competes with every other mod's copy of the same file (and with a leftover **`stodd_compat-1.3.0.jar`**, which is still in the `mods/` folder of your final pack), and Forge does not promise who wins. **So the world files are now also installed in `kubejs/data/`, which KubeJS adds as the last, highest-priority pack, and no other mod's copy can override them.** I did not touch the BCLib preset or its `forceBetterXPreset` switch (that would also break Better End / Better Nether).
* **New: `/stodd world`** (operator) and the same report **in the server log at start-up** (look for `[STODD] ISLANDS:` or `[STODD] NOT ISLANDS:`). It samples the terrain function the server really uses, over a 3 km square around 0,0, and says **ISLANDS** or **NOT ISLANDS**; it lists which packs provide the overworld noise settings (the last one wins); and it flags a leftover `stodd_compat` jar, a missing Survival Island, and a hand-edited `survivalisland.json`. **If a new server world is still not islands, send me that output and the `[STODD]` and `[STODD Core]` lines of `logs/latest.log`**: it will name the cause instead of me guessing.
* **Cities are now built while the island's chunks are generated, like a structure** (section 4b). The startup script passes Forge's "chunk generated for the first time" event on; `49_city.js` queues each 48 x 48 city block the moment **all** of its chunks exist, so blocks go up at the edge of the view distance, long before anyone walks in, and nothing waits for a player to come close. A real world-generation structure was not possible (a structure cannot know which islands are city islands, and the jigsaw reach is capped at 128 blocks); this was the closest I could do as a script, still done with commands after the chunks existed. (3.0 makes it a real structure: see "What changed in 3.0.0".)
* **Cities are much lighter on the server.** Per tick at most `city.budgetMs` (8) milliseconds of building commands; the clearing only goes down to the real surface (it used to clear the template's whole height) and the foundation is only poured where the ground is lower than the street. In the mock-world test that is **about 8 commands per city block instead of about 17** (371 against 783 commands for the same city), and never more than 3 in one tick under an 8 ms budget.
* **Land that was generated before this version is still built** when a player comes within 200 blocks (the old way, now with the same limits): old worlds and chunks that were loaded from disk never fire the "new chunk" event. Settings: `city.generate`, `city.approachFallback`, `city.budgetMs`, `city.lean` in `00_config.js`.
* **A player standing in a city block no longer holds the others up**: that block is postponed for five seconds and the next one is built.
* **Island spacing without asking me: `config/stodd_islands.properties`** (section 4). One commented file with eight presets (`packed`, `snug`, `default`, `wide`, `remote`, `lonely`, `large`, `grand`) and plain `islandSize` / `islandSeparation` lines. The loader turns it into `config/survivalisland.json` on every start, checks the numbers (a typo is reported in the log and replaced by the preset's value, it never stops the game), and never overwrites your edits to the properties file. The preset sizes and gaps come from a simulation of the mod's own placement code, which reproduces the figures I gave you earlier for the default.
* **Upgrading from 2.2.0:** delete `stodd_compat-1.3.0.jar` **and** `stodd_core-2.2.0.jar` from `mods/` and put in `stodd_core-2.3.0.jar`. The balance file `00_config.js` is replaced because the version changed (your copy is kept as `00_config.js.stodd-old`; copy your edits across). The old hand-written `config/survivalisland.json` is saved as `survivalisland.json.stodd-old` and replaced by the generated one (same values, the default preset). The startup script changed (the chunk hook), so **restart the game or server once**; `/reload` is not enough for that part. **For the island fix itself, start a new world** (delete the server's world folder first).

## What changed in 2.2.0

* **The level and the other mods' levels now climb together, both ways** (section 2b). When your **STODD level** goes up, your **True Prime Piece stats** (Agility, Strength, Health, Toughness) and your **Jujutsu Craft grade** (its Fame) are raised to match. When one of those goes up on its own, your STODD level follows. Nothing is ever lowered by the link.
* **Grades follow the mastery stages:** Grade 4 at level 1, Grade 3 at 5, Grade 2 at 10, Grade 1 at 15 and Special Grade at 20 (for origins that hold Cursed Energy).
* **It finds the mods' numbers by itself** and says so when it cannot: `/stodd link` shows what is linked and where, `/stodd link scan` (operator) lists every number inside the two mods' data so the names in `00_config.js` can be corrected. **The names and the Fame thresholds are best guesses** (I could not read the mods here); see section 2b before relying on it.
* New commands: `/stodd link`, `/stodd link scan`, `/stodd link sync [player]`, `/stodd link reset [player]`.
* **Upgrading from 2.1.0:** `00_config.js` is replaced because the version changed (your copy is kept as `00_config.js.stodd-old`; copy your edits across). The new script `24_links.js` is added and `15_powers.js` has two small additions. The startup script did not change, so a **`/reload` is enough** (a restart is fine too).

## What changed in 2.1.0

* **Power mastery: the level opens every power system.** Haki, Devil Fruit, Cursed Energy and Dark Magic each open in five stages (levels 1 / 5 / 10 / 15 / 20), and **at level 20 everything an origin holds is fully open, for every origin, the Weakling included** (section 2a).
* **Haki is now real.** The pack's own Haki: **Observation** (slip some hits, up to 12%), **Armament** (up to 12% less damage from creatures, melee that bites through armour) and **Conqueror's** (an aura at level 20). It grows with the stages and stacks with True Prime Piece's own Haki.
* **Unlocks in the power mods.** A stage can grant advancements, run commands or raise a Jujutsu Craft variable. Defaults are in `powerMastery.unlock`; they are **educated guesses** (ids could not be read from the mods here), so `/stodd mastery scan` (operator) shows what the mods really have and which pattern hit.
* **`/stodd mastery`** shows your stages, the next one, your Haki numbers, your cyberware tolerance, your origin's trait bonuses and your power cap, each with its level-20 value. `/stodd` has a one-line Mastery summary too.
* **Upgrading from 2.0.0:** the balance file `00_config.js` is replaced because the version changed (your copy is kept as `00_config.js.stodd-old`; copy your edits across). The startup script changed (the Observation hook), so **restart the game once**; `/reload` is not enough for that part.

## What changed in 2.0.0

* **Everything is one core mod** (above).
* **Survival Island is the default world type.** The create-world screen opens on it, and a dedicated server's default (`level-type=minecraft\:normal`) generates it. How: the jar overrides the vanilla **Default** world preset (`data/minecraft/worldgen/world_preset/normal.json`) to the Survival Island generator that was already wired into the overworld noise settings, and relabels it **"Survival Island (Default)"**. Survival Island's own list entry (`survivalisland:survivalisland`) is overridden the same way, but which copy wins depends on mod load order, so **pick the one labelled "Survival Island (Default)"**. It only changes **new worlds**; an existing world keeps the generator it was made with. *Not tested in the real game:* I could not open the create-world screen here, so if it still opens on plain "Default" labelled differently, tell me what the list shows. (The preset ids are those of the 1.21 build of Survival Island; I could not read the 1.20.1 jar here, so if that build uses different ids the Default override still does the job on its own.)
* **Floating sky islands now float over open ocean**, in the gaps between ground islands, where a ground island would otherwise be. They no longer sit above land (section 4c).
* **Three kinds of city island**, each with its own block list, plaza, districts and biome: the modern **City** (42 blocks), the futuristic **Neo City** (33 blocks, towers up to 110 blocks tall, domes, landing pads, a stadium, a solar farm), and the primitive **Tribal Town** (46 blocks: huts, long halls, farms, pens, shaman and burial grounds, a market, an arena) (section 4b).
* **Five new whole-island themes**, each with its own biome, ground repaint, 2 or 3 centrepieces and 8 scatter landmarks: **Ember Isle**, **Sakura Isle**, **Overgrown Ruins**, **Crystal Isle**, **Skull Cove** (section 4d). Sky islands get their own landmarks and trees too.
* **Many more options for big islands.** 126 city block templates (was 15) and 55 island landmarks, picked per cell by weight and district, rotated at random, and the dressed islands choose one of several centrepieces per island.
* **`/stodd locate <what>`** finds islands by kind for testing; `list` shows five, `tp` (operator) teleports there (section 4e).
* **A better Log Pose**: four modes (next island / nearest island / nearest city / sky island), right-click to cycle, shift + right-click to go back, a tooltip that names the target, an arrow, distance and recording progress on the action bar, and a notice when you arrive (section 4a).
* **Non-sorcerers no longer start with the Jujutsu kit.** From the moment the first origin is chosen, and for 5 minutes afterwards, the random cursed technique is reset and every item from the Jujutsu mods (not only books) is taken back, unless the origin may use Cursed Energy (Sorcerer, Brawler). Ores, planks, ingots and the like are left alone (section 1b).
* **Island theme chances.** Specials are rolled separately, so the weights of One Piece / Jujutsu / Night City / Arcane / Wild are unchanged: City 12.5%, Neo City 5%, Tribal Town 4%, and 4% for each of the five dressed themes, so about 41.5% of islands are special and about 58.5% are ordinary. None appears within 600 to 900 blocks of 0,0 (the first island you meet is ordinary).
* **Upgrading an existing world:** every island the world had already recorded before 2.0.0 keeps the rule it had (no new special themes, and islands registered before 1.3.0 are never cities), so a base on one is safe. **Back the world up first anyway.** A new world is the cleanest way to get the full effect.

## 0. Settings: `config/stodd/`

STODD Core writes four files the first time it starts, each with every setting it controls and the explanation next to it:

| File | What is in it | When a change applies |
|---|---|---|
| `world.toml` | `[spawnIslands]` (island size and spacing, presets), `[skyIslands]` (rarity, height, thickness, hills, biomes, landmarks), `[city]` and `[makeover]` (incl. `rarity`), `[islandThemes.<id>]` (each theme's weight / chance / where it may be), island names, the world spawn search, waystones, the Log Pose, `/stodd locate`, the world check | spawn islands: restart, then a new world; sky islands, cities, dressed islands, themes: worlds (chunks) generated afterwards; the rest after `/reload` |
| `origins.toml` | the origin list and names, Curios slots per origin and per level, who may use which power system, cyberware capacity, how each system's items, blocks and NPCs are recognised, the Jujutsu starter purge | `/reload` |
| `progression.toml` | levels and XP, per-origin growth and damage traits, the power cap, power mastery, level links, boss scaling, ore bonus and tiers | `/reload` |
| `general.toml` | debug logging, crash guards | `/reload` |

* **Editing.** Change a value and save; text goes in quotes (`rarity = "rare"`), regular expressions in single quotes (`'/^malum$/i'`), lists in brackets (`[500, 1000]`), small tables in braces (`{ min = -0.5, max = 0.9 }`). Delete a line, or the whole file, to get the default back. When a new version adds settings, STODD Core rewrites the file **keeping your values** (comments you wrote yourself are not kept).
* **In the game** (operators): `/stodd config` (where the files are, what is changed, any problems), `/stodd config get <setting>`, `/stodd config find <word>`, `/stodd config set <setting> <value>` (plain words count as text: `/stodd config set skyIslands.rarity common`), `/stodd config reset <setting>`, `/stodd config reload` (reads the files and runs `/reload`). Setting names are suggested as you type.
* **The settings screen**: Mods > STODD Core > Config. The four files as tabs, a search box, one field per setting (hover for its explanation and default), Save. It edits the files on that computer: in single player that is the game's config; a server keeps its own (use `/stodd config set` there).
* **Mistakes never stop the game.** A value of the wrong kind falls back to the default; a file that cannot be read keeps all its settings at their defaults and is left as it is so you can fix it. Both are written to the log (`[STODD Core] config: ...`) and listed by `/stodd config`.
* **Rarities.** `skyIslands.rarity`: the share of islands lifted into the sky, none 0, very_rare 5 %, rare 10 %, normal 18 %, common 30 %, very_common 45 % (or `skyIslands.chance` for an exact share). `city.rarity` and `makeover.rarity`: none, very_rare (x0.25), rare (x0.5), normal, common (x1.75), very_common (x2.5), or a number, multiplying each kind's `chance`; together the special themes never take more than 95 % of the islands (the proportions are kept).

## 1. Origins (the only ten on the selection screen)

| Origin | Health | Combat | Curios slots | Cyber capacity | Powers |
|---|---|---|---|---|---|
| Skyborn | 12.5 hearts, +8% speed | **No fall damage**, Jump Boost I, glide (hold sneak while falling), **+35% damage on hits landed while falling** (+1%/level) | 4/3/3/2 + 2 back + all 6 others = **20** | **0, ripperdocs refuse** | none; **no chrome, no Devil Fruit, no Cursed Energy, no dark magic** |
| Brawler | **22.5 hearts**, +2 armor | empty-handed hits **+4 damage (+0.35/level) and +20%**, swings 20% faster; **-30% with arrows, bolts and bullets** | 3/4/2/1 + 2 bracelets + head/belt/body/feet = **16** | 180 (+5/level) | Cursed Energy; chrome. **No Devil Fruit, no dark magic** |
| Weakling | **7 hearts**, grows to ~75 HP at L20 and ~151 HP at L35 | scales harder than anyone after L20 (+69% damage at L35) | **1** (a ring) at L1, +1 row every 5 levels, **24 = a Human's** at L35 | 100 (+6/level) | none; chrome allowed |
| Cyberware User | 15 hearts | n/a | 3/2/2/0, no bracelet/curio = **12** | **600** (+20/level) | Devil Fruit; chrome |
| Devil Fruit User | 20 hearts | +15% damage, +15% non-melee | 4/2/2/1, no back/bracelet/curio = 13 | 50 | Devil Fruit |
| Sorcerer | 20 hearts | +2 attack | 4/2/2/1, no bracelet/curio = 14 | **0, ripperdocs refuse** | Cursed Energy |
| Marksman | 17.5 hearts | +5% speed, **+25% projectile damage** | 4/3/3/1 + all 7 = 18 | 220 (+6/level) | ONE of Fruit / Cursed Energy |
| Dark Magician | 15 hearts | +20% non-melee (spells) | 4/2/4/2, no bracelet = 18 | **0, ripperdocs refuse** | Devil Fruit **and** Malum dark magic |
| Swordsman | 17.5 hearts | +10% speed, **+25% sword damage** | 5/4/4/1 + all 7 = 21 | 60 | ONE of Fruit / Cursed Energy |
| Standard Human | 15 hearts | n/a | **7/4/4/2** + all 7 basics = **24** | 140 | none |

Every origin keeps Haki. Slot totals run Weakling (1) < Cyberware 12 < Devil Fruit 13 < Sorcerer 14 < Brawler 16 < Marksman = Dark Magician 18 < Skyborn 20 < Swordsman 21 < Human 24, so the origins with the strongest special power carry the least, and the origin with no power carries the most.

**Who may use what** (everything not marked is blocked):

| | Devil Fruit | Malum dark magic | Cursed Energy | Chrome |
|---|---|---|---|---|
| Human | | | | yes |
| Devil Fruit User | yes | | | yes |
| Cyberware User | yes | | | yes |
| Swordsman | path | | path | yes |
| Marksman | path | | path | yes |
| Sorcerer | | | yes | no |
| Dark Magician | yes | **yes** | | no |
| Weakling | | | | yes |
| Brawler | | | **yes** | yes |
| Skyborn | | | | no |

"path" = one-path rule: the first of those powers an origin takes closes the other (shown in `/stodd`; admins clear it with `/stodd resetpath <player>`).

**The Weakling in detail.**
* Starts with 7 hearts (14 HP), one ring slot, 100 chrome capacity and a power cap of 100.
* Personal cap **level 35** (everyone else stops at 20). Levels 1 to 20 cost the same XP as everyone (48,398 total); levels 21 to 35 each cost 14% more than the last, 689,340 XP in total.
* Health is quadratic: it starts far below a Human (74 HP vs 87 at L20) and ends far above (151 HP at L35). Damage: +22% at L20 and +69% at L35 on top of the normal +0.25 attack/level. Power cap 100 to 750.
* Slots by level: L1 **1**, L5 **6**, L10 **9**, L15 **12**, L20 **16**, L25 **19**, L30 **22**, L35 **24** (`slotsByMilestone.weakling` in `config/stodd/origins.toml`).
* A Weakling who changes to another origin drops to that origin's cap.

**How it works.** Each origin is a set of Origins/Apoli powers inside the jar: `marker` (entity tag `stodd_o_<origin>`), attribute/damage powers, `slots` (`/curios set` for every slot on choosing the origin, login, respawn and once a minute), `cyber` (`/projectedgerunner cyberware capacity set`), `kit` (Cyberware User's Kiroshi Optics and Ripperdoc), `fists` / `iron_skin` / `poor_aim` (Brawler), `swift` (Skyborn), and the locks `no_fruit`, `no_sorcery`, `no_magic`, `no_magic_block`, `no_chrome`.

## 1a. Finding the other mods' items (read this)

No item id of True Prime Piece could be read here, so none is hard-coded. `06_discover.js` runs at load, matches the installed mods by name or id (`cfg.detect`: *prime piece* for fruits, exactly *Malum* for dark magic), walks the item registry and puts each mod's matching items (fruits: `no_mi`, `nomi`, `fruit`) in the tags the jar's locks read (`stodd:devil_fruits`, `stodd:magic_items`). Only island themes whose mod is installed are used.

**Malum is exact**, not guessed: its 92 magic items and 14 machines were read from Malum's own source. The Curios equip veto and a magic-weapon attack veto keep everyone but the Dark Magician from equipping or swinging them.

**`/stodd scan`** (anyone) prints what it matched. **`/stodd check`** prints your origin, which systems are allowed, what the item in your hand counts as, and whether the commands the limits rely on exist. If a fruit is missed or a wrong item is caught, paste the output and the patterns in `cfg.detect` / `cfg.hold` are what to correct.

## 1c. Restrictions, layer by layer

| Limit | 1. Data (Apoli, works even if KubeJS fails) | 2. Java gate (STODD Core 3) | 3. Scripts / backstop |
|---|---|---|---|
| Devil Fruit | `<origin>/no_fruit`: `prevent_item_use` on tag `stodd:devil_fruits` | right-click on the fruit, starting to eat it, holding it while using a block; the first allowed fruit closes a Swordsman's / Marksman's other path | every 5 s a player who may not hold a fruit is checked (live capability data) and it is removed with the first working command of `cfg.hold.fruit.clearCommands` |
| Dark magic | `no_magic` (items) and `no_magic_block` (altars, machines) | right-click on Malum items and on altars / machines (`stodd:magic_machines` or Malum's block list), swinging a Malum weapon, equipping a Malum curio (Curios' equip event) | |
| Cursed Energy | `no_sorcery` on `stodd:sorcery_items` | right-click and use of technique books and selection items | the Cursed Technique book is removed and the technique reset (section 1b), with the Java side writing Jujutsu Craft's variables directly |
| Ripperdoc | `no_chrome` on block tag `stodd:cyberware_stations` | the Ripperdoc block and ripperdoc NPCs (by entity type or villager profession) | capacity 0 |
| Cyberware tolerance | `<origin>/cyber` on choosing the origin and on respawn | re-sent on login, respawn and whenever the level changes it (every 10 s check) | as 2.x |
| Curios slots | `<origin>/slots` sets the level-1 counts | the Weakling's slots follow its level (a new row every 5 levels) | as 2.x |

The Java gate and the scripts use one table (`rules` in `config/stodd/origins.toml`, handed to Java at start-up) and the same item rules (`detect`, `sorcery*`, `ripperdoc*`), so they cannot disagree; creative players are never stopped; before an origin is chosen every power item is refused (as in 2.x). While the Java gate runs, the scripts' own event handlers stand down, so a refused player is told once.

Honest limits:
* **A power that is not an item cannot be blocked at the item.** A fruit eaten from an NPC or granted by a command can only be caught by the sweep, and only with a working removal command (`/stodd addons scan` shows the real data names).
* **Tolerance is Project: Edgerunner's own Load / Max Load system.** The capacity command only sets Max Load; installing more chrome than that is the mod's own Cyberpsychosis.
* The Cursed Technique book's real item id is unknown, so it is caught by namespace + name patterns. If one slips through, hold it and type `/stodd itemid`.

## 1b. The Cursed Technique book and the Jujutsu starter kit

Origins that cannot use Cursed Energy (every origin except the Sorcerer, and a Swordsman or Marksman on the fruit path) **lose any cursed-technique item the moment it enters their inventory**. Before an origin is chosen the book is left alone; a Sorcerer keeps it; a Swordsman or Marksman keeps it while their path is open. If one slips through, `/stodd itemid` prints its id; add it to `sorceryItems` in `config/stodd/origins.toml`.

**Starter kit purge (new in 2.0.0).** Jujutsu Craft hands every new player a random cursed technique and a kit of items. For every origin that may not use Cursed Energy, the scripts reset the technique and take back **every item from the Jujutsu mods** (`jujutsucraft`, `jjk_addon`, `sorceryfight`, `jujutsucrafts`), starting when the very first origin is chosen and for 5 minutes afterwards (`jjk.starterWindowTicks`) in case the mod hands things out late. Materials (`*_ore`, `*_ingot`, `*_planks` and similar, `jjk.keep`) are never taken, and the Sorcerer and the Brawler keep everything. After the 5 minutes only the Cursed Technique / selection book rule above applies, so something you earned later is not taken. Switch it off with `jjk.purgeStarter = false`. *Limit:* before the origin screen is answered nothing is removed (the script cannot know the origin yet), so the kit may sit in your inventory for the few seconds you spend choosing, and it goes the moment you choose.

## 2. Level system (Power XP, separate from vanilla XP)

* **Levels:** 1 to 20 (Weakling: 1 to 35). Level 1 to 2 costs 100 PXP, each later level 30% more; level 20 takes about 48,400 PXP. See `/stodd curve`.
* **Earning PXP:** kills give half the mob's max health; bosses 4x that, scaled by the boss level, shared within 64 blocks; passive mobs 20%; spawner mobs 25%; ores 3.
* **Every level:** +2 max health and +0.25 attack damage.
* **Origin mastery, per level:** Human +1 health, +0.4 armor, +0.2 toughness · Devil Fruit User +0.5 health, +1.5% damage · Cyberware User +0.5 armor, +0.5% speed, +20 cyber capacity · Swordsman +2% sword damage, +1% attack speed, +0.5% speed · Sorcerer +0.5 health, +0.15 attack, +1.5% damage · Dark Magician +0.3 health, +0.1 attack, +1% damage · Marksman +0.4 health, +1.2% projectile damage, +0.2% speed, +6 cyber capacity · Brawler +0.8 health, +0.3 armor, +0.4% attack speed, +0.35 fist damage, +0.8% damage, +5 cyber capacity · Skyborn +0.25 health, +0.4% speed, +1% dive damage · Weakling +0.3 armor, +0.1 toughness, then the quadratic growth above.
* **Commands:** `/stodd` (your info), `/stodd level <player>`, `/stodd setlevel` and `/stodd addxp` (operator), `/stodd refresh`, `/stodd check`, `/stodd mastery` (and `/stodd mastery scan` / `sync`, operator), `/stodd link` (and `scan` / `sync` / `reset`, operator), `/stodd scan`, `/stodd unstick`, `/stodd curve`, `/stodd city` and `/stodd isle` (progress of the city / dressed island you stand on), `/stodd locate <what>` (find islands, section 4e), `/stodd logpose` (section 4a), `/stodd world` (operator: is this really generating islands? section 4f).

## 2a. Power mastery (new in 2.1.0)

**The level is the key to every power.** Each power system you hold opens in five stages: **Dormant** (level 1), **Awakened** (5), **Honed** (10), **Refined** (15) and **Mastered** (20). **At level 20 everything you hold is fully open, whatever your origin** (the Weakling too: its levels 21 to 35 only add stats, accessory slots and a higher power cap). Mastery only ever grants; nothing is taken away, and a power a mod already gave you stays yours.

| Origin | Systems that open with the level |
|---|---|
| Standard Human, Weakling, Skyborn | Haki |
| Devil Fruit User, Cyberware User | Haki, Devil Fruit |
| Dark Magician | Haki, Devil Fruit, Dark Magic |
| Sorcerer, Brawler | Haki, Cursed Energy |
| Swordsman, Marksman | Haki, plus Devil Fruit **or** Cursed Energy once the path is chosen |

The other things that scale with level already reach their full value at level 20 and are listed by `/stodd mastery`: cyberware tolerance (each origin's own ceiling), your origin's trait bonuses (sword, projectile, fist, dive and all-damage lines) and the power cap (500, Weakling 750 at 35).

**Haki, built in** (`powerMastery.haki`). It scales in equal steps and is the pack's own, so it works whatever True Prime Piece does; the two stack.

| Haki | From | Level 5 / 10 / 15 / 20 |
|---|---|---|
| **Observation** (Kenbunshoku) | level 5 | slip 3% / 6% / 9% / 12% of hits from creatures (falling, fire and the void cannot be seen coming) |
| **Armament** (Busoshoku) | level 10 | hits from creatures hurt 4% / 8% / 12% less (from level 10); your melee blows add 0.1 / 0.2 / 0.3 x the target's armour (armour counted up to 20) |
| **Conqueror's** (Haoshoku) | level 20 | every 2 seconds, hostile non-boss mobs within 10 blocks whose max health is at most half of yours get Weakness and Slowness for 4 seconds (up to 24 at a time) |

**Opening things in the power mods** (`powerMastery.unlock`). A stage can grant advancements (found by name at run time), run commands (once) or raise a Jujutsu Craft variable (never lowers it). Defaults: Cursed Energy opens Simple Domain at Honed, Reverse Cursed Technique at Refined, Domain Expansion and Black Flash at Mastered; Devil Fruit opens awakening advancements at Mastered; Haki opens True Prime Piece's Ken / Buso / Hao advancements at Awakened / Honed / Mastered. **These ids are guesses**: the mods' advancement ids could not be read here. As an operator run **`/stodd mastery scan`**: it lists how many advancements each mod has, some of their ids, and for every pattern which advancement it hit or `NO MATCH`. Correct the patterns in `config/stodd/progression.toml` (`[powerMastery.unlock...]`) and `/reload`. A pattern that matches nothing simply opens nothing; the built-in Haki above always works.

**What it does not do.** It does not lock a mod's abilities below level 20 (nothing outside the mods' own data can do that reliably), and it does not touch True Prime Piece's own EXP or Haki EXP. The stat levels and the Jujutsu grade are tied to the level by the level links below. `/stodd mastery sync [player]` (operator) re-applies everything; logging in repeats the advancement grants, so a pattern fixed later reaches players who are already high.

**Commands.** `/stodd mastery` (yours), `/stodd mastery scan` and `/stodd mastery sync [player]` (operator).

## 2b. Level links: stats and grade in step with the level (new in 2.2.0)

**What it does.** Two things in the other mods are tied to the STODD level, and each follows the other:

| Link | Moves with the STODD level like this |
|---|---|
| **True Prime Piece stats** (Agility, Strength, Health, Toughness) | every STODD level is worth **+1 of each stat** (`perLevel`). Level up and all four stats are lifted by one; raise **all four** yourself and your STODD level rises by the same amount |
| **Jujutsu Craft grade** (its Fame, for origins that hold Cursed Energy: Sorcerer, Brawler, and a Swordsman or Marksman who chose it) | level 1 = **Grade 4**, level 5 = **Grade 3**, level 10 = **Grade 2**, level 15 = **Grade 1**, level 20 = **Special Grade**. Earn the Fame for a higher grade and your level rises to that grade's level; level up and your Fame is lifted to the grade's minimum |

**The rules.**
* **Nothing is ever lowered by a link.** If your stats or Fame are already above what your level asks for, they are left alone. The STODD level is only raised by the mod side, never lowered, and an operator lowering your level (`/stodd setlevel`) does not lower the mod values and does not get dragged back up by them.
* **The first time a stat is seen, it is declared equal to your current level** (it is your starting point). From then on one STODD level is worth `perLevel` stat points. A player who joins with a high True Prime Piece stat is not catapulted to level 20.
* **Which stat counts.** `combine: 'min'`: the STODD level follows your **weakest** stat, so training one stat alone does not level you up, but a level-up lifts every lagging stat. Change it to `'max'` in `levelLinks.links.tppStats` if you prefer the best stat to decide.
* **At most 5 levels per check** (`maxStep`), checks every 5 seconds and whenever you level, never past your origin's cap (20; Weakling 35).
* **If the mod refuses the write** (clamps or ignores it), the script tries the same target at most three times, then leaves that link read-only until your level changes or an operator runs `/stodd link sync`. It never loops.
* **It tells you** with a short `[Link]` message when it raises something; set `levelLinks.announce = false` to silence it.

**Please read: this part is based on guesses.** I could not read True Prime Piece's or Jujutsu Craft's files here, so:
1. The script **looks for the numbers by name** inside the player data: a capability whose name matches `tpp` / `true_prime` / `prime_piece` holding numbers called Agility / Strength / Health (or Vitality) / Toughness, and a Jujutsu Craft variable called `PlayerFame`. If the real names differ, the link says **NOT LINKED** in `/stodd link` (with the reason) and does nothing; it never writes to something it did not find.
2. **The Fame values for each grade (0 / 1,000 / 5,000 / 20,000 / 50,000) are placeholders.** Jujutsu Craft's real grade thresholds could not be read here. Until they are corrected the grade shown by this link may not match the grade the mod itself shows.
3. Writing into True Prime Piece's data is done through the player's saved data; the **client's HUD may not show the new numbers until the next relog** (the server value is the real one). A mod that keeps its own copy and overwrites ours would show as a refused write (`/stodd link` reports it read-only).

**How to correct it (about two minutes).** In the game, as an operator, run **`/stodd link scan`** and send me the output (or edit it yourself): it lists every capability that looks like True Prime Piece or Jujutsu Craft with the numbers inside it (`Stats/Agility = 12`) and the Jujutsu variables that look like progress. Then set `capKey` and the field patterns for `tppStats`, the `fields` for `jjcGrade` and the real Fame values in `levelLinks` in `config/stodd/progression.toml`, and `/reload`. A mod that has no numbers to find stays unlinked and harmless. If the stats are not NBT at all (a command-based system), `writeCommands` (`{p}`, `{field}`, `{v}`) can set them instead.

**Commands.** `/stodd link` shows what is linked, where it was found and the value as a level. Operator: `/stodd link scan`, `/stodd link sync [player]` (retry a link that gave up), `/stodd link reset [player]` (re-declare stats and level equal from now on; use it after hand-editing a player's numbers).

## 3. Power cap and boss scaling

* **Max single hit** from a player (or pet/summon) is **100 at level 1, rising to 500 at level 20** (the Weakling's rises to **750 at level 35**), applied last.
* **Boss levels.** A boss takes the level of the strongest player within 96 blocks (up to 35). A boss is in `#forge:bosses` or has 250+ max health. Health +15% per level, damage +6% per level, name shows `[Lv N]`. This stacks on Multiplayer Bosses' own scaling.

## 4. Island world: Survival Island

* **What is used.** The *Survival Island* mod (Jasmine) adds a terrain function, `survivalisland:islandcont`, that turns the world into separate islands in open ocean. STODD Core swaps that function into the **overworld** (`minecraft:overworld` noise settings, with private copies of the terrain functions that read the continents: `stodd:overworld/*`) and makes it the **default world type** (see "What changed"). **The Survival Island mod must stay installed**: the data refers to its function type, and without it the world cannot be created.
* **Island size and spacing: `[spawnIslands]` in `config/stodd/world.toml`.** Change one word, save, restart, make a **new world**:

  ```toml
  [spawnIslands]
  preset = "default"      # packed | snug | default | wide | remote | lonely | large | grand
  islandSize = 0          # fine control: 0 = from the preset
  islandSeparation = 0
  ```
  STODD Core copies the values into `config/survivalisland.json` every time the game or server starts, so **never edit `survivalisland.json` yourself** (it is overwritten). The numbers below come from a Python port of Survival Island's own placement and falloff code (`IslandContinentalNoise`, run over 14 x 14 km maps, 3 seeds each, land = the terrain that stands above the sea including its beach). **They are estimates**: the mod's 28-block domain-warp noise is left out, so real islands wobble by some tens of blocks. Sky islands take some of these islands up with them (section 4c), so the sea between the islands that stay is a little wider.

| Preset | islandSize | islandSeparation | Island across | Sea between coasts, typical (closest .. farthest) | Islands per 100 km2 |
|---|---|---|---|---|---|
| `packed` | 110 | 520 | ~290 | ~350 (230 .. 740) | 122 |
| `snug` | 140 | 560 | ~370 | ~320 (190 .. 740) | 106 |
| `default` | 140 | 680 | ~370 | ~480 (310 .. 960) | 74 |
| `wide` | 140 | 900 | ~370 | ~730 (530 .. 1260) | 43 |
| `remote` | 140 | 1200 | ~380 | ~1050 (830 .. 1570) | 25 |
| `lonely` | 140 | 1700 | ~380 | ~1770 (1430 .. 2320) | 12 |
| `large` | 200 | 800 | ~530 | ~470 (270 .. 1040) | 53 |
| `grand` | 300 | 1300 | ~790 | ~770 (510 .. 1510) | 21 |

  * `packed`: small islands close together; `snug`: normal islands, a bit closer; `default`: what STODD has shipped with so far (existing worlds use it); `wide` / `remote` / `lonely`: ever longer sails; `large` and `grand`: bigger islands (more room for towns and the city; `grand` is about 800 blocks across).
  * **`islandSize`** is the radius of an island's core (40 to 800); the island you walk on is about 2.6 times that across. **`islandSeparation`** is the smallest distance between two island *centres* (160 to 6000). Keep it at least **4 x islandSize**: at 3.2 x the simulation shows coasts nearly touching, and below 2.5 x the loader raises it and says so in the log.
  * Advanced settings: `underwaterFalloff` (how gently the sea floor slopes, 1 to 30, default 9) and `coastA` / `coastB` (the two continentalness ranges the generator blends; min below 0 and max above 0).
  * **A typo never stops the game**: the log (`[STODD Core]`) names the setting, says what it used instead, and the file still produces a valid `survivalisland.json`. The log also says `islands: preset 'wide' (islandSize 140.0, islandSeparation 900)` on every start, and `/stodd world` shows what is active.
  * **Changing the spacing needs a new world.** Chunks that already exist keep their islands, so changing the spacing in an old world gives seams where old and new terrain meet. The log warns about this each time the values change.
  * Cities, sky islands and themed islands adapt to whatever land they are given (a small island gets a smaller city); for the full-size city keep `islandSize` at 140 or more.
* **Climate on every island.** Temperature and humidity are stepped per island (cold / temperate / warm / hot, arid to wet). **There is no frozen band**: no frozen oceans, ice sheets or icebergs. High peaks can still be snowy and a biome mod may add icy biomes.
* **Spawn.** On a new world the spawn is moved onto the **nearest island** (inland). Operators can redo it with `/stodd spawn`.
* **Island centre registry.** The first time an island is seen its centre is recorded in the world and kept forever, so its name, theme, waystone and Log Pose target never change.
* **Themes (the anime mods stay apart).** Each island gets exactly one theme. The ordinary ones are picked by weight from the mods that are installed (One Piece 24, Jujutsu 18, Night City 18, Arcane (Malum) 10, Wild 22); the special ones (City, Neo City, Tribal Town and the five dressed themes) are rolled first, from one number per island, so adding a theme never reshuffles the others. Mobs from a power-system mod only spawn on islands of their theme (City and Neo City also allow Night City's; the dressed themes and the tribal town have only vanilla and ordinary modded mobs), and **nothing themed spawns on a sky island**. Open sea counts as One Piece water. A message shows the island's name when you arrive.
* **Waystones: one per island, at the centre.** Every island's Waystone stands **at the island's centre**, the same point the Log Pose points at.
  * It is built the first time a player comes within 192 blocks of the centre. If the exact centre is a lake, a cliff or a forest, it goes on the nearest good ground within 60 blocks. It is never closer than 10 blocks to a player or 12 to the world spawn, needs a clear 3x3 patch of open ground, and nothing is placed during the first 20 seconds after joining or while airborne or swimming.
  * One per island. Styled to the theme (sandy One Piece, Tribal Town and Skull Cove, blackstone Jujutsu and Ember, deepslate Night City, City and Crystal, plain stone Arcane, Neo City, Sakura and Sky, mossy Wild and Ruins), named after the island, and the message gives its coordinates.
  * Activate it to be able to warp back. Waystones' own random worldgen is off. An operator can re-place a broken one with `/stodd waystone`. A player stuck inside a stone is moved out automatically or with `/stodd unstick`.
  * *Limit:* waystones appear when a player approaches, not at world creation.
  * **City islands** get theirs in the middle of the plaza and **dressed islands** in the yard of the centrepiece (both are generated with the island, so the stone can go up the first time you come near); **sky islands** get theirs when a player standing on the island is within 112 blocks of its centre, on the sky island, never on the ground below.

## 4a. The Log Pose

* **Get one.** Every player gets a **Log Pose** the first time they join. `/stodd logpose` gives a new one if it is lost. Craft one from **compass + amethyst shard + glass pane** (shapeless). It is the item `stodd_core:log_pose` (also in the Tools & Utilities creative tab); older compass Log Poses turn into it by themselves.
* **The needle points at the target**, turning as you turn, like a compass on a lodestone; in an item frame it points too. The target is the island's **centre**, where its waystone stands.
* **Four modes.** **Right-click** for the next mode, **Shift + right-click** to go back (or `/stodd logpose mode <next|nearest|city|sky>`):
  * **Next island**: the nearest island you have not recorded yet. Up in the air (height 200+) it looks for sky islands instead.
  * **Nearest island**: the nearest island of any kind, recorded or not.
  * **Nearest city**: the nearest city island (modern, Neo City or tribal).
  * **Nearest sky island**: the nearest floating island, even from the ground.
* **What you see.** Hold it: the bar above the hotbar shows an arrow relative to where you face, the island's name and kind, the distance, the mode, and a recording bar while you record. The tooltip names the mode and the target. A title and a chime mark each recorded island, and a message says "You have arrived".
* **Record islands.** Stand near an island's middle (within 40 blocks) for **3 seconds**, or anywhere on it for **30 seconds**. "Next island" then skips it, so following the needle takes you from island to island and never back (tested: six hops, six different islands). The last 96 islands are remembered (saved with the player, kept through death); `/stodd logpose reset` forgets them.
* **How it finds islands.** The map is cut into 512-block cells; each cell is looked at once (the terrain function, every 64 blocks) and the islands found are remembered for everyone, so a search spreads over a few seconds the first time an area is asked about and is instant afterwards. Reach: 800, 1,500, 3,000 and then 5,000 blocks. Settings: `[logPose]` in `config/stodd/world.toml`.
* *Not tested in Minecraft:* the needle's look (the model uses vanilla's 32 compass pictures with a glass-and-amethyst overlay) and its feel. The direction maths is vanilla's and was tested on its own.

## 4b. City islands

Three styles, each rolled as its own theme, each built block by block around a plaza on the island's centre (the waystone stands in the plaza's open middle). Every block is **48 x 48**, has a road on each edge, and is placed with a random rotation; districts decide what goes where (downtown = middle third, outskirts = outer third).

| Style | Chance | Biome | Blocks | What is in it |
|---|---|---|---|---|
| **City** (modern) | 12.5% | Metropolis | 42 (+1 plaza) | 12 tower designs up to 104 blocks, 8 quad blocks of four mid-rises, 7 rows of townhouses, 4 shopping streets, 5 parks, 3 industrial yards, 3 markets (striped, white-and-blue with a fountain, night market) |
| **Neo City** (futuristic) | 5% | Neo City | 33 (+2 plazas) | 10 towers (spires, ring tower, helix up to 110 blocks), 6 habitat blocks, 2 domes, 3 industry (reactors, cargo yard), 2 landing pads, 2 parks, 2 transit hubs, 3 low-rise, a market, a stadium, a solar farm; sunset / violet / verdant / rose palettes |
| **Tribal Town** (primitive) | 4% | Tribal | 46 (+2 plazas) | 11 hut clusters (plain, jungle, savanna, dusk), 4 long halls, 4 farms, 4 animal pens, 5 craft yards (smithies, a drying yard), 6 sacred sites (shaman, burial ground, big fire, stone ring), 4 markets, 4 watchtowers, 3 groves, an arena |

* **One street level per island** (the typical ground height of the island, held between y=66 and 78). Terrain above it inside a block is cleared (up to y=148) and a **foundation** reaches down to the real ground, at most 40 blocks below (stone bricks for the City, light grey concrete for Neo City, stone for the Tribal Town); at the coast that makes a sea wall.
* **How it is generated (new in 3.0).** Each 48 x 48 block is a structure, `stodd:city_block` (structure set `stodd:city_blocks`): the world generator offers it the first chunk of every block on a fixed 48-block grid, it looks up the island (and whether that island is a city, and of which style) and the island's plan (street level, which design goes where, rotation), and adds two pieces, the ground work and the building. **Each chunk then builds its own part while it is being generated**, in the last step of decoration (after trees, so none stand on the roofs), and the block's biome is set in the same pass. Nothing is built afterwards, nothing waits for a player, and the server does no work for a city while you play.
* **Every city island has its own layout**: the plaza design, the districts (downtown = inner third, outskirts = outer third) and the weights are the style's, but which design lands on which block and how it is turned now also depends on the island.
* **Commands.** `/stodd city` (or `/stodd core island`) tells you which city you are on, how many blocks it has, its street level and which design you stand on. To find cities: `/stodd locate city` or the Log Pose in "Nearest city".
* **Settings**: `[city]` in `config/stodd/world.toml` (rarity, radius, street-level range, foundation depth, land margin) and each kind's `chance` under `[islandThemes.city]`, `[islandThemes.city_future]`, `[islandThemes.city_primitive]`; the template lists, weights and district multipliers are content in `01_content.js`. They reach the generator when the server starts; chunks generated before keep what they got.
* **Honest limits.**
  * **New chunks only.** Land that was generated before 3.0 keeps its natural terrain; `city.scriptBuilder = true` brings the 2.3.0 command builder back for such worlds.
  * **It replaces the ground inside its blocks** (trees, ores, caves, villages): it is world generation, so there are no player builds to lose in a new world.
  * The buildings are **hollow shells** with a few loot chests and props, vanilla blocks only.
  * **Not tested in Minecraft**: the planner (plaza on the centre, every block on the grid and inside the radius, rotations filling their block exactly, downtown taller than the outskirts, the same city after a restart) is tested in plain Java; the structure code compiles against the models of the real classes, but nobody has walked through one yet. If a design's template were missing, its block is cleared and left empty (`/stodd core island` names the design).

## 4c. Sky islands: normal islands, lifted

* **What they are.** Some of the world's islands are generated up in the sky instead of in the sea. A sky island is **the island that would have been there**: the same outline from the island noise, the same terrain (the world's own terrain functions, read with the island's continentalness and raised to `skyIslands.height`, 190 by default, give or take `heightVariation`), so it has beaches round the rim, hills, cliffs and sometimes a mountain, **and the same biomes**: plains, forests, taigas, deserts, jungles, cherry groves... chosen the way the ground's are, with their own grass, trees, flowers, animals and ores. Below hangs a rocky underside, deepest in the middle (`thickness`, more for big islands), ragged at the edge, with stalactite-like spikes (`spikes`). Where the island would have stood there is a **shallow sea**.
* **How many.** `skyIslands.rarity` in `config/stodd/world.toml`: none, very_rare (5 % of the islands), rare (10 %), **normal (18 %)**, common (30 %), very_common (45 %), or an exact `skyIslands.chance`. Which islands is decided by the world seed and the island's position, so a world always lifts the same ones. The island at the world spawn, islands within `minSpawnDistance` (700) of 0,0 and islands smaller than `minRadius` always stay on the ground.
* **Their spacing is the normal island spacing**: they take the place of normal islands, so `[spawnIslands]` sets their size and spacing too.
* **Hills.** `relief` (0.85) is how tall the hills are compared with the same island on the ground; nothing goes above `maxHeight` (316). The terrain up there has no dry river beds cut across it (the river band of the terrain noise is moved aside for sky islands).
* **Their look.** `biome = "natural"` keeps the island's own biomes. A biome id (for example `"stodd:sky_meadow"`) gives every sky island that biome instead; `extraPlants` adds trees, flowers and rocks per 48 x 48 cell on top of the biome's own (the old sky-meadow dressing used 5). `landmarks` and `landmarkDensity`: the odd ruin, shrine, obelisk or hut, each checked so its footprint plus a 3-block margin lies on the island.
* **No sea up there.** The biomes over and just around a sky island are always land biomes, so nothing that looks for an ocean (shipwrecks, ocean ruins, sea creatures) ends up on one, which happened with 3.0's sky islands. By default the rim is the island's inland biome rather than a beach, which also keeps beached shipwrecks and buried treasure off it; `skyIslands.beaches = true` gives them sandy beaches like on the ground (and lets those two come back). Land structures (villages, outposts, temples, igloos, huts) generate on sky islands as on any island.
* **Finding them.** `/stodd locate sky`, or the Log Pose in "sky" mode (or in "next" mode once you are up at their height and not on a ground island). `/stodd core island` says "Sky island ... (a lifted island)" up there and "Open sea, under a sky island (look up)" below one.
* **Getting up there.** Nothing in this pack lifts a player 130 blocks by default. Use your own flight, or `/stodd locate sky tp` (operator), which teleports you above the island with slow falling.
* **Waystone and mobs.** Each sky island gets a plain waystone on its top the first time a player stands on it near its centre. Themed (anime-mod) mobs do not spawn there; the biome's own animals do.
* **Changing the settings** applies to worlds created afterwards (new chunks of an old world would not match the old ones).
* **Honest limits.** Not walked in Minecraft yet. A village on a sky island may reach over the rim. The sea under a sky island has no kelp or seagrass (the game puts sea plants on the highest solid ground, which is the island). If something looks wrong, send me a screenshot and the `skyIslands` lines of your `world.toml`.

## 4d. Dressed island themes

Five themes that change a whole island, **generated with the island's chunks** (structure `stodd:isle_block`, set `stodd:isle_blocks`; new in 3.0): every 48 x 48 cell of the island has its ground repainted (e.g. grass to basalt or moss, leaves to cherry) and the theme's biome, and about 20% of the cells get a landmark (never two next to each other), picked by weight from the theme's list and turned at random. The middle cell gets one of the theme's **centrepieces**, chosen per island, and the island's waystone stands in its yard.

| Theme | Biome | Centrepieces (one per island) | Scatter landmarks (8) |
|---|---|---|---|
| **Ember Isle** | Ember (grass to basalt, dirt to blackstone, trees burnt away) | volcano, caldera, burning peak | vents, forge, spires, henge, lava lake, watchtower (two of them in a second variant) |
| **Sakura Isle** | Sakura (leaves to cherry, grass to moss) | shrine, garden | torii gate, giant blossom tree, tea house, bamboo grove, zen garden, dojo, bridge |
| **Overgrown Ruins** | Overgrown (grass to moss, sand to mossy cobblestone) | ruined temple, rotunda | arches, pillar fields, shrine, colonnade, well, statue, gate |
| **Crystal Isle** | Crystal (grass to calcite, leaves to azalea) | crystal heart, crystal garden | spires, geodes, pool, arch, crystal field, altar |
| **Skull Cove** | Skull Cove (grass to coarse dirt, trees cleared) | bone fort, harbour | wreck, cave mouth, giant ribs, gallows, camp, totems, bone piles |

Centrepieces are 47 x 47 and 19 to 43 blocks tall; scatter landmarks 15 to 37 wide and 8 to 26 tall. Each landmark stands on a 3-block ground base at the footprint's typical height, its footprint is cleared first and gaps underneath are filled with the theme's foundation, never more than 14 blocks down (no pillars into the sea). Settings: `[makeover]` in `config/stodd/world.toml` (rarity, density, foundation depth, paint rules per theme) and `01_content.js` (the lists). `/stodd isle` (or `/stodd core island`) names the island, its theme, its cells and landmarks.

**Sky islands** keep their own biomes; the structure `stodd:sky_block` only adds the odd ruin, shrine, obelisk or hut whose footprint plus 3 blocks lies wholly on the island (and, if `skyIslands.biome` / `extraPlants` ask for it, a fixed biome and extra trees, flowers and boulders in one of four styles: meadow, blossom, grove, pines).

*Limits:* new chunks only (`makeover.scriptBuilder = true` for land generated before 3.0); hollow templates of vanilla blocks; the planner is tested in plain Java (centrepiece in the middle, no two landmarks side by side, every footprint inside its cell, rotations exact, sky landmarks and trees on the island), the structure itself has not been seen in the game yet.

## 4e. Finding islands: `/stodd locate`

`/stodd locate <what>` (every player; `everyone = false` in `locate` makes it operator-only) searches the same terrain function that shaped the world, a few map cells per tick, so it needs no exploring and never freezes the server. The answer arrives in chat: the island's name, its coordinates, the distance and the compass direction.

* `<what>`: `city` (any style), `modern`, `neocity` / `future`, `tribal` / `primitive`, `ember`, `sakura`, `ruins`, `crystal`, `skull`, `sky`, `onepiece`, `jujutsu`, `cyberpunk`, `arcane`, `wild`, `island` (anything). Typing `/stodd locate` alone lists what is available in this pack.
* `... list` shows the nearest five. `... tp` (operator) teleports you there (to y=262 over a sky island, 200 over a ground island) with 90 seconds of slow falling so the chunks load before you land.
* The search reaches 1,000, 2,000, 4,000, then 8,000 blocks from where you stood. `/stodd find city` and `/stodd find sky` still work as short forms.

## 4f. Checking a server: `/stodd world`

Run it as an operator (or read the same lines in `logs/latest.log` after start-up). The output looks like this (the numbers are an example):

```
[STODD] Island layout: preset default, islandSize 140.0, islandSeparation 680 (from config/stodd/world.toml).
[STODD] Overworld noise settings come from: mod:stodd_core  >  file/kubejs   (the last one wins)
[STODD] ISLANDS: sampling 625 points over 3.2 km: 7.5% land, 9 separate landmasses, the biggest is 11 points (about 480 blocks across).
```

* **ISLANDS** = the terrain function the server uses to generate chunks from now on makes islands (under 40% land, no landmass bigger than 80 samples). It says nothing about chunks generated earlier: those keep their terrain.
* **NOT ISLANDS** = new chunks will be an ordinary world. The line under it says what to try; the lines above it name the cause when it is one of the known ones: a leftover `stodd_compat` jar, Survival Island missing, or a third pack providing the noise settings.
* The sampling answers for the server's *current* generator, so after fixing something restart and run it again; then delete the world folder so it is generated again.
* If it says NOT ISLANDS and you cannot see why, send me this output and the `[STODD]` / `[STODD Core]` lines of `logs/latest.log`.
* Settings (`[world]` in `config/stodd/world.toml`): `logOnStart`, `gridHalf`, `gridStep`, `maxLandFraction`, `maxBlobCells`.

## 5. Ore progression

* **Vanilla to Terramity.** Terramity's mid and late ores are added to `forge:needs_netherite_tool`; a diamond pickaxe no longer mines them.
* **Terramity to Antarchy.** Antarchy uranium and titanium ores, raw uranium blocks and blood crystals need a **Tier 3 Terramity pickaxe**: Exodium, Nyxium or Reverium (or the Antarchy Ultimate Pickaxe). Add more tools to the item tag `stodd:antarchy_tier`.
* **+15% supply.** Ancient Debris gets 15% extra veins in the Nether; iridium, Profanum, Antarchy uranium and titanium, Mekanism osmium and uranium, necoium, nihilite, radrock uranium and kairoseki get a 15% chance to drop their loot one extra time.

## 6. Downgrade Smithing Template

* **Recipe:** shaped `CFC / CIC / CCC` (C cobblestone, F flint, I copper ingot), makes 2 templates.
* **Use:** template + any upgraded item on a crafting grid gives back the item before its upgrade. Enchantments, name and damage are kept; the upgrade material and template are refunded.
* Recipes are generated from every `smithing_transform` recipe in the pack.

## 7. STODD Core as an add-on to the power mods

STODD Core 3 is built as an add-on to the pack's power-system mods: it does not need any of them to build or to start (a missing mod simply switches its part off), and it reaches into the ones that are installed at run time. `/stodd addons` lists what was found.

| Mod | What STODD Core does with it |
|---|---|
| **True Prime Piece** (+ Gears 4 & 5) | Devil Fruits only for the Devil Fruit User, the Cyberware User, the Dark Magician and a Swordsman / Marksman on the fruit path (eating, right-click, use on blocks; the first fruit closes the other path). The level links read and write its stats **in its live player data**, keeping each number's own type. |
| **Jujutsu Craft** | Cursed Energy only for the Sorcerer, the Brawler and a Swordsman / Marksman on the sorcery path. Its MCreator player variables (technique, cursed energy, Fame) are found on the player and written directly, then synced to the player, so the purge of the starter technique and the grade link take effect in its own HUD at once. |
| **Malum** | Altars, machines, scythes, staves, spirits and spirit curios answer only the Dark Magician (right-click, block use, attacks with a Malum weapon, equipping a curio). Malum: Vestis is not counted as Malum. |
| **Project: Edgerunner** | Ripperdoc blocks and NPCs refuse the Sorcerer, the Dark Magician and the Skyborn; each origin's cyberware tolerance (Max Load) follows its level. |
| **Curios** | The Weakling's slots grow with its level; equipping a magic curio is refused to everyone but the Dark Magician. |
| **Origins** (Fabric, via Sinytra Connector) | The ten STODD origins; the origin is read from the marker tag each origin's power sets, so nothing depends on Origins' Java classes. |

**`/stodd addons scan [player]`** (operator) prints every piece of mod data on a player: each capability by name with the numbers inside it (`Stats/Agility = 12`), and which of them are MCreator variables. That is exactly what the level links (`levelLinks` in `config/stodd/progression.toml`) and the fruit sweep (`hold`) need to be set to the real names: run it once in the game and send me the output, or edit the patterns yourself.

*Honest limit:* none of these mods' data names could be read here (their jars are not reachable from this workspace). The Java side finds the data by looking (capabilities by name, MCreator variables by their sync method), never by a hard-coded class, so a wrong guess makes a link say NOT LINKED rather than break anything.

## Tests that were run (and what was not)

Every push to the GitHub repository runs all of these; the jar on the `dist` branch only exists if they all passed.

* **Compiled against the real Minecraft 1.20.1 and Forge 47.4.20** by ForgeGradle, and renamed to the game's runtime names (only deprecation warnings).
* **216 plain-Java tests** of the logic. 3.0's 83 (the hash, seed and theme roll bit-identical to the scripts', the island finder, the city planner, the dressed-island and sky-island planner, the origin rules, the island index and the Log Pose), plus 133 new ones for 3.1: the TOML reader and writer (every kind of value, mistakes reported with their line, everything written reads back the same); **the config files** (written with all 422 settings, every default reads back exactly as written, edits kept when a file is completed again, a wrong value falls back to its default and is reported, an unknown setting is kept as a comment, a broken file is left alone, `/stodd config set` / `reset` / the screen's Save, the values handed to the scripts, `stodd_islands.properties` moved over and handed on to Survival Island); and **the lifted sky islands** (about the share asked for, the spawn island never lifted, every point of an island agrees, the ground keeps a shallow sea where a lifted island stood, the sky gets the island's own continentalness raised, the underside below the coast and above the sea, the island's climate only up there, the same seed gives the same sky, another seed other islands, rarity none leaves the world untouched, the river band moved aside).
* **898 script tests** in Node against a mock world: 3.0's, plus the config overlay (the files' defaults change nothing, values replace defaults, themes changed by id, regular expressions from text, part of a table changes only that part, new Log Pose modes), the rarities (half, x1.75, a number, none, never more than 95 % together with the proportions kept) and the sky-island settings the scripts use. Plus a lint for Rhino-incompatible syntax.
* **Generated files checked**: the config schema, the sky-island world files (written three times into the jar) and the jar's built-in world rules are regenerated and must equal what is committed.

**Not run, because it needs the game:** a world generating its lifted sky islands, cities and dressed islands, the settings screen on screen, the needle on screen, and the real names inside True Prime Piece's and Jujutsu Craft's data (`/stodd addons scan`).

## Known crash: Royal Variations Spectral Anvil

The server crash `... provides no component of type apoli:powers` (`Ticking entity`) is **not caused by STODD**: Royal Variations' `SpectralAnvil` calls `Entity.isInWall()` every tick and Apoli's Connector mixin on that method assumes every entity has the `apoli:powers` component. `07_guards.js` removes every `royalvariations:spectral_anvil` as it is added to the world (also those saved in the world). More ids can be added to `blockedEntities` in `config/stodd/general.toml`. The permanent fix is removing Royal Variations or updating Apoli / Sinytra Connector.

## If the Origin screen does not appear

1. Search `logs/latest.log` for `STODD Core` (it says what the loader copied) and for `origin`; a line like `There was a problem reading origin file ... stodd` names the broken file.
2. Check `config/origins_server.json` turns the stock Origins off (`"enabled": false`).
3. Make sure **only one `stodd_core-*.jar`** (the newest) is in `mods/` (delete every `stodd_compat-*`), and that `jjk_addon` (Jujutsucraft Revamped) is removed.
4. The island, climate and spawn changes need a **new world**; existing chunks keep their terrain. The origins also work in an old world.

## Verify in your first test world

1. **The log at start-up** shows `[STODD Core] 3.1.0 loaded`, `settings: ...config/stodd`, `The STODD island world pack is enabled` and `ISLANDS: ...`. On a server run `/stodd core world` (operator). Then `/stodd addons`: every mod you have should say `[found]`.
2. Create a world: the world type already shows **Survival Island (Default)**. The Origin screen shows only the ten origins. A Weakling starts with 14 HP and one ring slot; a Brawler has 45 HP and 4 hand slots; a Skyborn takes no fall damage. A non-Sorcerer has no Jujutsu items after a few seconds.
3. As a Human, right-click a Devil Fruit: refused once, with one message. As a Dark Magician, a Malum altar and scythe work; anyone else is refused. A Sorcerer cannot use the Ripperdoc. As a Swordsman eat a fruit: the message says the other path is closed.
4. **The Log Pose:** you start with one. The needle points; walk around and it keeps pointing at the same island. Right-click to cycle the modes. Stand in the middle of an island for 3 seconds: "Island recorded", and the needle moves on to the next island.
5. **A city:** `/stodd locate city tp` (operator), then look around: the whole city should already be there as the chunks load, with no blocks appearing afterwards. `/stodd city` names the design you stand on. Do the same with `neocity`, `tribal`, `ember`, `sakura`, `ruins`, `crystal`, `skull` and `sky`.
6. `/stodd setlevel @s 20` (Weakling `@s 35`), then hit something big. No hit goes over 500 (Weakling 750).
7. **Mastery and links:** `/stodd mastery`, `/stodd link`, and as an operator `/stodd addons scan`; send me the scan output if a link says NOT LINKED.
8. Island sizes, gaps and climates (no ice): fly around and check against section 4. Send me a screenshot of the world map if something is off.
