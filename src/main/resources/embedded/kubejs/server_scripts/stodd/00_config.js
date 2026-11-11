// priority: 1000
// ============================================================================
//  STODD COMPAT — central balance config
//  Every number that matters for balance lives here. Edit, then /reload.
// ============================================================================
global.stodd = {} // fresh on every load/reload
global.stodd.cfg = {
  debug: false,

  // ---------------------------------------------------------------- ISLAND WAYSTONES (45_waystones.js)
  waystones: {
    minPlayerDistance: 10,   // never build the stone closer than this to any player
    minSpawnDistance: 12,    // ...or to the world spawn point
    arrivalTicks: 400,       // wait this long after a player joins before the first island waystone is placed
    placeDistance: 192,      // the central waystone is built once a player is within this many blocks of the island's centre
    centerSearch: 60,        // if the exact centre is a lake / cliff / forest, look for the nearest good ground within this radius
    maxAttempts: 40,         // placement tries per island per session
    skyPlaceDistance: 112,   // a sky island's waystone is built when a player standing on it is this close to its centre
    // block used for each island theme (any waystones:* worldgen feature id)
    styleByTheme: {
      one_piece: 'waystones:sandy_waystone', jujutsu: 'waystones:blackstone_waystone', cyberpunk: 'waystones:deepslate_waystone',
      arcane: 'waystones:waystone', wild: 'waystones:mossy_waystone', city: 'waystones:deepslate_waystone', sky: 'waystones:waystone',
      city_future: 'waystones:waystone', city_primitive: 'waystones:sandy_waystone',
      ember: 'waystones:blackstone_waystone', sakura: 'waystones:waystone', ruins: 'waystones:mossy_waystone',
      crystal: 'waystones:deepslate_waystone', skull: 'waystones:sandy_waystone'
    }
  },

  // ---------------------------------------------------------------- LOG POSE (48_logpose.js)
  // A compass that points at an island, like the One Piece Log Pose. Hold it to see the island's name, kind, direction and
  // distance. Right-click it to change what it looks for (next unrecorded island / nearest island / nearest city / sky island).
  // Walk to an island's middle (its waystone) and the pose records it within a few seconds; anywhere else on the island it
  // takes dwellTicks. A recorded island is skipped by the "next island" mode.
  logPose: {
    dwellTicks: 600,         // time to stand anywhere on an island before it is recorded (30 s)
    centerTicks: 60,         // ...or standing near its middle (3 s)
    centerRadius: 40,        // "near the middle" = within this many blocks of the island's centre / waystone
    arriveRadius: 24,        // "You have arrived" message inside this distance of the target
    giveOnFirstJoin: true,   // every player gets one the first time they join
    maxRecorded: 96,         // how many recorded islands a player remembers (oldest are forgotten, so far-away islands become targets again)
    searchRadii: [800, 1500, 3000, 5000],
    scanBudget: 4,           // map cells (512 x 512 blocks) scanned per second per player while looking for islands
    skyMinY: 200,            // in "next island" mode a player at or above this height is "up in the sky": the pose then points at the next unrecorded SKY island
    // right-click cycles these in order. kind: 'next' = nearest unrecorded, 'any' = nearest of all, 'themes' = nearest island of those themes, 'sky' = sky islands
    modes: [
      { id: 'next',    name: 'Next island',      kind: 'next' },
      { id: 'nearest', name: 'Nearest island',   kind: 'any' },
      { id: 'city',    name: 'Nearest city',     kind: 'themes', themes: ['city', 'city_future', 'city_primitive'] },
      { id: 'sky',     name: 'Nearest sky island', kind: 'sky' }
    ],
    recipe: ['minecraft:compass', 'minecraft:amethyst_shard', 'minecraft:glass_pane']
  },

  // ---------------------------------------------------------------- LOCATE (53_locate.js)
  // /stodd locate <city|neocity|tribal|sky|ember|sakura|ruins|crystal|skull|island|<theme>> [list|tp]
  // Finds the nearest matching island by reading the world's terrain function (nothing has to be explored first).
  // Meant for testing: set `everyone` to false to make it operator-only.
  locate: {
    everyone: true,          // true = every player may use /stodd locate; false = operators only (/stodd locate ... tp is always operators only)
    radii: [1000, 2000, 4000, 8000],   // search radius steps, in blocks
    cellsPerTick: 3,         // map cells (512 x 512 blocks) scanned per server tick while a search runs
    listCount: 5,            // how many results "list" shows
    tpHeight: 262,           // /stodd locate ... tp puts you this high with slow falling, so the chunks load before you land
    // names accepted after /stodd locate (each maps to island themes; 'sky' is special)
    groups: {
      city: ['city', 'city_future', 'city_primitive'], modern: ['city'], neocity: ['city_future'], future: ['city_future'],
      tribal: ['city_primitive'], primitive: ['city_primitive'], ember: ['ember'], sakura: ['sakura'], ruins: ['ruins'],
      crystal: ['crystal'], skull: ['skull'], onepiece: ['one_piece'], jujutsu: ['jujutsu'], cyberpunk: ['cyberpunk'], arcane: ['arcane'], wild: ['wild']
    }
  },

  // ---------------------------------------------------------------- JUJUTSU STARTER ITEMS (15_powers.js)
  // Jujutsu Craft hands every new player a random cursed technique and its starter items. Only origins whose rule is
  // sorcery:true (Sorcerer, Brawler) keep them. For everybody else the technique is reset and EVERYTHING that comes from a
  // Jujutsu mod (not just books) is removed from the inventory when the origin is chosen, and again for starterWindowTicks.
  jjk: {
    purgeStarter: true,
    starterWindowTicks: 6000,     // after choosing an origin, keep sweeping for this long (5 minutes) in case the mod hands items out late
    sweepEveryTicks: 20,
    purgeNamespaces: /^(jujutsucraft|jjk_addon|sorceryfight|jujutsucrafts)$/,
    // ids that are always allowed to stay even in those namespaces (ores / building blocks you may want to craft with)
    keep: /(_ore|_block|_planks|_log|_stairs|_slab|_wall|_fence|_door|_button|_sapling|_leaves|raw_|_ingot|_nugget)$/
  },


  // ---------------------------------------------------------------- CITY ISLANDS (49_city.js)
  // Three kinds of city island. The first time a player comes near one, the script builds a grid of 48 x 48 block city
  // blocks over the whole island, one block at a time, starting from a central plaza (where the island's waystone stands) and
  // working outwards over land only. The middle gets the showpieces, the outskirts get farms / warehouses / pads.
  //     city            modern metropolis (Metropolis biome)       - 14 block types
  //     city_future     NEO CITY: spires, domes, maglev, hab stacks - 33 block types, several colour schemes
  //     city_primitive  TRIBAL TOWN: huts, longhouses, totems       - 38 block types, three wood / wall styles
  // The lists of block templates, their weights and the zone multipliers are in 01_content.js (generated by the structure
  // generators, so edit them there or re-run the generators); everything else is here.
  city: {
    enabled: true,
    minOriginDistance: 900,     // islands closer than this to 0,0 are never cities, so the first island you meet is an ordinary one
    cell: 48,                   // the templates are 48 x 48; do not change this unless you redraw the templates
    radius: 300,                // city blocks are built up to this far from the island's centre (the island's own coast cuts it earlier)
    landMargin: 0.04,           // a block is built only if its centre and four corners are this far above the shore line (continentalness)
    baseMin: 66, baseMax: 78,   // street level is the typical ground height of the island, held between these
    sampleStep: 28,             // spacing of the ground-height samples used to pick the street level
    foundationMax: 40,          // the slab under a block reaches down at most this far (so the coast is a sea wall)
    floorMin: -58,              // never fill below this
    generate: true,             // build a city block as soon as all its chunks have been GENERATED (like a structure), long before a player walks in
    approachFallback: true,     // ...and also, for land that was generated earlier, when a player comes within triggerRadius of the island's centre
    budgetMs: 8,                // at most this many milliseconds of commands per server tick while building (0 = the old pace below)
    chunksPerTick: 24,          // newly generated chunks examined per tick
    queueMax: 4000,             // newly generated chunks remembered while waiting to be examined
    lean: true,                 // clear only down to the real surface and found only where the ground is lower (fewer, smaller /fill commands)
    triggerRadius: 200,         // approach fallback: building starts when a player is this close to the island's centre
    stepEvery: 2,               // old pace (budgetMs 0): one /fill, /place or /fillbiome command every this many ticks (a city block takes 6-15 of them)
    stepsPerTick: 1,            // ...and this many at a time
    cutCap: 148,                // clearing for a city block never reaches above this height (sky islands begin just above it)
    scanEvery: 40,              // ticks between checks for a city island near each player
    maxRingsAhead: 99,          // how many city blocks out from the plaza may be queued at a time (99 = whole island)
    biomeBelow: 8,              // the style's biome is applied from this far under street level...
    biomeAbove: 104,            // ...to this far above it
    maxTemplateFailures: 3,     // a template that fails to place this many times is dropped from the draw
    styles: {}                  // filled in by 01_content.js: { <theme id>: { plaza(s), plazaHeight, foundation, biome, templates, zones } }
  },

  // ---------------------------------------------------------------- WORLD CHECK (54_world.js)
  // /stodd world measures what the world function really generates and says ISLANDS or NOT ISLANDS; the same report is written to the log at start-up.
  world: {
    logOnStart: true,
    gridHalf: 12,               // samples each way from 0,0 ...
    gridStep: 128,              // ... this many blocks apart (12 x 128 = a 3 km square)
    maxLandFraction: 0.4,       // more land than this, or one landmass bigger than maxBlobCells samples: NOT ISLANDS
    maxBlobCells: 80
  },

  // ---------------------------------------------------------------- DRESSED ISLANDS (52_makeover.js)
  // Five themes that are not cities are dressed up the same slow way: Ember Isle (volcano), Sakura Isle (shrine garden),
  // Overgrown Ruins (jungle temple), Crystal Isle (amethyst spires) and Skull Cove (a giant skull and a pirate camp). Each island
  // gets (1) its ground repainted with `paint`, (2) its own biome, (3) a centrepiece landmark around the waystone and
  // (4) a scatter of smaller landmarks, chosen from a big list so no two islands look alike. Sky islands get a meadow biome,
  // trees / flowers / rocks, and a few small ruins.
  makeover: {
    enabled: true,
    cell: 48,
    radius: 330,                // dressed up to this far from the island's centre (the coast cuts it earlier)
    landMargin: 0.06,
    triggerRadius: 220,         // dressing starts when a player is this close to the island's centre
    stepEvery: 2,
    stepsPerTick: 2,
    scanEvery: 40,
    cutCap: 148,
    biomeBelow: 12,
    biomeAbove: 60,
    landmarkDensity: 0.2,       // about this share of an island's 48 x 48 cells gets a landmark (never two side by side)
    maxLandmarks: 40,
    maxTemplateFailures: 3,
    foundationMax: 14,          // landmark foundations reach no further down than this
    // per theme: biome, paint rules [from, to] (/fill ... replace), density multiplier. The landmark lists (center, scatter) are
    // added by 01_content.js.
    themes: {
      ember: { biome: 'stodd:ember', foundation: 'minecraft:blackstone', density: 1.0,
               paint: [['minecraft:grass_block', 'minecraft:basalt'], ['minecraft:dirt', 'minecraft:blackstone'], ['minecraft:sand', 'minecraft:smooth_basalt'], ['#minecraft:leaves', 'minecraft:air']] },
      sakura: { biome: 'stodd:sakura', foundation: 'minecraft:stone_bricks', density: 1.0,
                paint: [['#minecraft:leaves', 'minecraft:cherry_leaves[persistent=true]'], ['minecraft:grass_block', 'minecraft:moss_block']] },
      ruins: { biome: 'stodd:overgrown', foundation: 'minecraft:mossy_stone_bricks', density: 1.1,
               paint: [['minecraft:grass_block', 'minecraft:moss_block'], ['minecraft:sand', 'minecraft:mossy_cobblestone']] },
      crystal: { biome: 'stodd:crystal', foundation: 'minecraft:smooth_basalt', density: 1.0,
                 paint: [['minecraft:grass_block', 'minecraft:calcite'], ['#minecraft:leaves', 'minecraft:flowering_azalea_leaves[persistent=true]'], ['minecraft:sand', 'minecraft:calcite']] },
      skull: { biome: 'stodd:skullcove', foundation: 'minecraft:stone', density: 1.0,
               paint: [['minecraft:grass_block', 'minecraft:coarse_dirt'], ['#minecraft:leaves', 'minecraft:air']] }
    },
    landmarks: {},              // sizes of every landmark template, filled in by 01_content.js
    sky: {
      biome: 'stodd:sky_meadow', biomeLow: 146, biomeHigh: 262, perCell: 5, density: 0.9, foundation: 'minecraft:stone',
      styles: [
        { name: 'meadow', features: [['minecraft:oak', 3], ['minecraft:birch', 2], ['minecraft:fancy_oak', 1], ['minecraft:flower_default', 5], ['minecraft:patch_grass', 6], ['minecraft:forest_rock', 1]] },
        { name: 'blossom', features: [['minecraft:cherry', 4], ['minecraft:flower_cherry', 5], ['minecraft:patch_grass', 4], ['minecraft:flower_flower_forest', 2]] },
        { name: 'grove', features: [['minecraft:azalea_tree', 3], ['minecraft:oak', 2], ['minecraft:patch_tall_grass', 3], ['minecraft:flower_default', 3], ['minecraft:forest_rock', 2]] },
        { name: 'pines', features: [['minecraft:spruce', 5], ['minecraft:patch_grass', 3], ['minecraft:forest_rock', 3], ['minecraft:flower_default', 1]] }
      ]
    }
  },

  // ---------------------------------------------------------------- SKY ISLANDS (40_islands.js, 45_waystones.js)
  // The islands themselves are world generation (data/stodd/worldgen/*, see the README) and they float over OPEN OCEAN, in the
  // gaps between the ground islands (roughly half as many as there are ground islands, mostly 250-550 blocks across, a few
  // much bigger); the scripts only FIND them so they get a name, a waystone and a Log Pose entry. Keep probeY / minRadius in step with the jar if you retune the noise.
  sky: {
    enabled: true,
    minY: 200,                  // above this height a player / mob counts as being on a sky island (when it is over one)
    probeY: 227,                // height at which the world's density function is sampled to see whether an island is overhead
    scanStep: 64,               // spacing of that sampling when searching a map cell (islands are big: about 270 blocks across or more)
    minRadius: 48               // smaller floating rocks are ignored
  },

  // ---------------------------------------------------------------- CRASH GUARDS (07_guards.js)
  // Entities that are removed the moment they are added to the world because they crash this pack's server.
  // royalvariations:spectral_anvil calls Entity.isInWall every tick, and Apoli's Connector mixin on isInWall
  // assumes every entity has the apoli:powers component (projectiles do not) -> "Ticking entity" crash.
  blockedEntities: ['royalvariations:spectral_anvil'],

  // ---------------------------------------------------------------- ORIGINS
  // Order shown on the selection screen.
  origins: ['human', 'devil_fruit_user', 'cyberware_user', 'swordsman', 'sorcerer', 'dark_magician', 'weakling', 'marksman', 'brawler', 'skyborn'],

  // Names shown in chat and on the selection screen's tooltips (also read by the Java side).
  originNames: {
    human: 'Standard Human', devil_fruit_user: 'Devil Fruit User', cyberware_user: 'Cyberware User',
    swordsman: 'Swordsman', sorcerer: 'Sorcerer', dark_magician: 'Dark Magician',
    weakling: 'Weakling', marksman: 'Marksman', brawler: 'Brawler', skyborn: 'Skyborn'
  },

  // Exact Curios slot counts per origin (absolute totals, not deltas) at level 1.
  // Ranking by total: human 24 > swordsman 21 > skyborn 20 > marksman 18 = dark magician 18 > brawler 16 >
  //                   sorcerer 14 > devil fruit 13 > cyberware 12 > weakling 1 (grows to 24 at level 35, see slotsByMilestone)
  // The data jar owns the level-1 counts (powers stodd:<origin>/slots, run via /curios set).
  // Leave this true unless you remove the jar's slot powers; the scripts then only verify.
  slotsFromJar: true,
  slotIds: ['charm', 'hands', 'ring', 'necklace', 'head', 'back', 'belt', 'body', 'bracelet', 'feet', 'curio'],
  slots: {
    human:            { charm: 7, hands: 4, ring: 4, necklace: 2, head: 1, back: 1, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 1 },
    swordsman:        { charm: 5, hands: 4, ring: 4, necklace: 1, head: 1, back: 1, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 1 },
    sorcerer:         { charm: 4, hands: 2, ring: 2, necklace: 1, head: 1, back: 1, belt: 1, body: 1, bracelet: 0, feet: 1, curio: 0 },
    devil_fruit_user: { charm: 4, hands: 2, ring: 2, necklace: 1, head: 1, back: 0, belt: 1, body: 1, bracelet: 0, feet: 1, curio: 0 },
    cyberware_user:   { charm: 3, hands: 2, ring: 2, necklace: 0, head: 1, back: 1, belt: 1, body: 1, bracelet: 0, feet: 1, curio: 0 },
    dark_magician:    { charm: 4, hands: 2, ring: 4, necklace: 2, head: 1, back: 1, belt: 1, body: 1, bracelet: 0, feet: 1, curio: 1 },
    marksman:         { charm: 4, hands: 3, ring: 3, necklace: 1, head: 1, back: 1, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 1 },
    weakling:         { charm: 0, hands: 0, ring: 1, necklace: 0, head: 0, back: 0, belt: 0, body: 0, bracelet: 0, feet: 0, curio: 0 },
    brawler:          { charm: 3, hands: 4, ring: 2, necklace: 1, head: 1, back: 0, belt: 1, body: 1, bracelet: 2, feet: 1, curio: 0 },
    skyborn:          { charm: 4, hands: 3, ring: 3, necklace: 2, head: 1, back: 2, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 1 }
  },
  // Origins whose slots grow with level. Index = floor(level / 5): a new row every 5 levels (5, 10 ... 35).
  // Row 7 (level 35) equals the Standard Human, so a fully grown Weakling is exactly as roomy as a human.
  slotsByMilestone: {
    weakling: [
      { charm: 0, hands: 0, ring: 1, necklace: 0, head: 0, back: 0, belt: 0, body: 0, bracelet: 0, feet: 0, curio: 0 },   // L1-4    1 slot
      { charm: 1, hands: 1, ring: 2, necklace: 1, head: 1, back: 0, belt: 0, body: 0, bracelet: 0, feet: 0, curio: 0 },   // L5      6
      { charm: 2, hands: 2, ring: 2, necklace: 1, head: 1, back: 0, belt: 0, body: 0, bracelet: 0, feet: 1, curio: 0 },   // L10     9
      { charm: 3, hands: 2, ring: 3, necklace: 1, head: 1, back: 0, belt: 1, body: 0, bracelet: 0, feet: 1, curio: 0 },   // L15     12
      { charm: 4, hands: 3, ring: 3, necklace: 2, head: 1, back: 0, belt: 1, body: 1, bracelet: 0, feet: 1, curio: 0 },   // L20     16
      { charm: 5, hands: 3, ring: 4, necklace: 2, head: 1, back: 0, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 0 },   // L25     19
      { charm: 6, hands: 4, ring: 4, necklace: 2, head: 1, back: 1, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 0 },   // L30     22
      { charm: 7, hands: 4, ring: 4, necklace: 2, head: 1, back: 1, belt: 1, body: 1, bracelet: 1, feet: 1, curio: 1 }    // L35     24 = human
    ]
  },
  slotMilestoneEvery: 5,

  // Project: Edgerunner cyberware capacity ("Max Load"). Mod default rolls 160-320.
  // perLevel is added for each level above 1.
  cyberCapacity: {
    human:            { base: 140, perLevel: 4 },   // low threshold
    devil_fruit_user: { base: 50,  perLevel: 0 },   // extremely low
    swordsman:        { base: 60,  perLevel: 0 },   // extremely low
    cyberware_user:   { base: 600, perLevel: 20 },  // extremely high (980 at Lv20)
    sorcerer:         { base: 0,   perLevel: 0 },   // none, and ripperdocs refuse them
    dark_magician:    { base: 0,   perLevel: 0 },   // none, and ripperdocs refuse them
    marksman:         { base: 220, perLevel: 6 },   // moderate: a gunslinger can take a few implants
    weakling:         { base: 100, perLevel: 6 },   // light at first, 304 at level 35
    brawler:          { base: 180, perLevel: 5 },   // street chrome: a few implants, 275 at Lv20
    skyborn:          { base: 0,   perLevel: 0 }    // none, and ripperdocs refuse them
  },
  // Commands tried (silently) to set capacity. {p} = player name, {v} = value.
  // Project: Edgerunner 1.1.2 (the version in the pack) documents `/projectedgerunner cyberware capacity get|set|roll [target]`,
  // an operator command. The argument order of `set` is not documented, so both orders are tried; the wrong one
  // simply fails to parse. /stodd check shows whether the command exists and what the capacity reads back as.
  cyberCapacityCommands: [
    'projectedgerunner cyberware capacity set {p} {v}',
    'projectedgerunner cyberware capacity set {v} {p}'
  ],
  // Cyberware User starting kit (given once). If you find a direct install command, add it to
  // kiroshiInstallCommands and set giveKiroshiItem to false.
  giveKiroshiItem: false,   // the jar's stodd:cyberware_user/kit power already gives the starter kit
  cyberStarterKit: ['project_edgerunner:basic_kiroshi_optics', 'project_edgerunner:ripperdoc'],
  kiroshiInstallCommands: [],

  // Who may use what.  true = yes, false = never, 'path' = only ONE of that origin's 'path' systems, chosen by first use.
  // Systems: fruit (True Prime Piece devil fruits), sorcery (Jujutsu Craft cursed energy), magic (Malum dark magic),
  //          cyber (Edgerunner chrome)
  rules: {
    human:            { fruit: false,  sorcery: false,  magic: false, cyber: true },
    devil_fruit_user: { fruit: true,   sorcery: false,  magic: false, cyber: true },
    cyberware_user:   { fruit: true,   sorcery: false,  magic: false, cyber: true },
    swordsman:        { fruit: 'path',  sorcery: 'path', magic: false, cyber: true },
    sorcerer:         { fruit: false,  sorcery: true,   magic: false, cyber: false },
    dark_magician:    { fruit: true,   sorcery: false,  magic: true,  cyber: false },
    weakling:         { fruit: false,  sorcery: false,  magic: false, cyber: true },
    marksman:         { fruit: 'path',  sorcery: 'path', magic: false, cyber: true },
    brawler:          { fruit: false,  sorcery: true,   magic: false, cyber: true },
    skyborn:          { fruit: false,  sorcery: false,  magic: false, cyber: false }
  },
  // Power systems the scripts watch (item gate, sweeps). cyber is a block rule (Ripperdoc) and is handled separately.
  systems: ['fruit', 'sorcery', 'magic'],
  systemNames: { fruit: 'Devil Fruit', sorcery: 'Cursed Energy', magic: 'Dark Magic' },

  // Skyborn movement perks (35_skyborn.js). jumpAmplifier 0 = Jump Boost I.
  skyborn: { jumpAmplifier: 0 },

  // ----------------------------------------------------------- POWER-SYSTEM ITEMS
  // How each system's items are found.  Mods are located at load time by the name or id they report, so a renamed
  // jar still works; /stodd scan lists what was found.  An item is "a fruit" etc. when it lives in one of the
  // system's mods AND its path matches `items`.
  detect: {
    // True Prime Piece (+ the Gears 4 & 5 addon). Replaces Mine Mine no Mi.
    fruit:  { names: /prime ?piece/i, ids: /(true_?prime|prime_?piece|^tpp$)/i,
              items: /(no_mi|nomi|fruit)/ },
    // Malum: ids come from the mod's own source (1.20.1 branch). Anything not matched stays usable by everyone
    // (ores, soul stained steel tools, building blocks).
    magic:  { names: /^malum$/i, ids: /^malum$/i,
              items: /^(totemic_staff|mnemonic_hex_staff|staff_of_the_auric_flame|erosion_scepter|crude_scythe|soul_stained_steel_scythe|edge_of_deliverance|weight_of_worlds|tyrving|creative_scythe|catalyst_lobber|lamplighters_tongs|spirit_pouch|poppet|spectral_lens|spectral_optic|the_device|the_vessel|void_tablet|soul_hunter_(cloak|robe|leggings|boots)|malignant_stronghold_(helmet|chestplate|leggings|boots)|(sacred|wicked|arcane|eldritch|aerial|aqueous|earthen|infernal|umbral)_spirit|encyclopedia_(arcana|esoterica)|rune_of_[a-z_]+|ring_of_[a-z_]+|necklace_of_[a-z_]+|belt_of_[a-z_]+|gilded_(ring|belt)|ornate_(ring|necklace)|(runic|elaborate|glass|gluttonous)_brooch)$/,
              blocks: /^(spirit_altar|runic_workbench|spirit_crucible|spirit_catalyzer|repair_pylon|runewood_totem_base|soulwood_totem_base|ritual_plinth|weavers_workbench|spirit_jar|mending_diffuser|impurity_stabilizer|shielding_apparatus|warping_engine|accelerating_inlay|void_conduit|void_depot|runewood_obelisk|brilliant_obelisk)$/ }
  },
  // Items that grant a cursed technique (Jujutsu Craft).
  sorceryItems: [],
  // The Cursed Technique book: any item in a Jujutsu mod's namespace whose id looks like a book / scroll / tome /
  // technique item, or whose displayed name says so.  Origins that cannot use Cursed Energy have these removed from
  // their inventory the moment they appear (login, pickup, crafting, a mod handing it out on spawn).
  // If your book is still not caught, hold it and type /stodd itemid, then add the id to sorceryItems.
  sorceryNamespaces: /^(jujutsucraft|jjk_addon|sorceryfight|jujutsucrafts):/,
  sorceryBookIdPattern: /(book|tome|scroll|grimoire|manual|technique|skill_select|selection|reroll)/,
  sorceryBookNamePattern: /(cursed technique|technique (book|scroll|tome|selection)|(book|scroll|tome) of .*technique|skill selection)/i,
  // Jujutsu Craft's Skill Selection Book / Cursed Technique Changer and addon equivalents
  sorceryItemPattern: /^(jujutsucraft|jjk_addon|jujutsucrafts|sorceryfight):[a-z0-9_]*(technique|skill_selection|selection_book|skill_book|sukuna_finger|sorcerer_shard|reroll)[a-z0-9_]*$/,
  // Jujutsu Craft (MCreator) player variables. PlayerCurseTechnique 0 = non-sorcerer, -1 = Heavenly Restriction.
  jjcVariablesClass: 'net.mcreator.jujutsucraft.network.JujutsucraftModVariables',
  // A power a player already HOLDS (it arrived some way other than an item the gate could stop, e.g. a fruit eaten
  // before the origin was chosen) is looked for in the player's mod capability data, which Forge saves under ForgeCaps.
  // holdKey = regex on the capability key (which mod's data), holdValue = regex on the serialized data that means "has it".
  // clearCommands = tried in order until one reports success; a line for a command the pack lacks fails harmlessly.
  // Both are unverified against the real mods: run /stodd scan, then correct them from its output.
  hold: {
    fruit:  { holdKey: /(prime|tpp)/i,   holdValue: /([a-z0-9_]+_no_mi|"[a-z_]*[Ff]ruit[A-Za-z]*":"[^"]+")/,
              clearCommands: ['tpp removefruit {p}', 'execute as {p} run tpp removefruit', 'removedf {p}', 'execute as {p} run removedf self'] }
  },
  // How often (ticks) a player is checked for a power their origin may not hold.  0 turns the sweep off.
  holdSweepTicks: 100,
  ripperdocBlocks: ['project_edgerunner:ripperdoc'],
  ripperdocEntityPattern: /ripperdoc/,

  // ----------------------------------------------------------------- LEVELS
  maxLevel: 20,         // everyone's cap unless originLevels below says otherwise
  xpBase: 100,          // XP from level 1 -> 2
  xpGrowth: 1.30,       // each next level needs 30% more (exponential). Total 1->20 = ~48,400 XP
  xpPerMobHealth: 0.5,  // kill XP = maxHealth * this
  xpBossMultiplier: 4,
  xpPassiveMultiplier: 0.2,
  xpMaxPerKill: 5000,
  xpBossShareRadius: 64,
  xpOre: 3,             // per ore block mined (#forge:ores)

  // Origins with their OWN level cap. Past level 20 the XP needed per level grows by overGrowth instead of xpGrowth
  // (1.30 per level would put level 35 out of reach: 5.8 million XP). Reaching 35 takes about 690,000 XP in total.
  // capAtMax = the power cap (max single hit) at that origin's final level; it rises in a straight line from capAtLevel1.
  originLevels: {
    weakling: { maxLevel: 35, overGrowth: 1.14, capAtMax: 750 }
  },

  // Base growth for everyone, per level above 1
  perLevel: { health: 2.0, attack: 0.25 },
  // Origin mastery growth, per level above 1.  A "...Quad" term is multiplied by (level - 1) squared, so it
  // grows slowly at first and fast later (the Weakling's way of being the weakest early and the strongest late).
  mastery: {
    human:            { health: 1.0, armor: 0.4, toughness: 0.2 },
    devil_fruit_user: { health: 0.5 },
    cyberware_user:   { armor: 0.5, speedPct: 0.005 },
    swordsman:        { attackSpeedPct: 0.01, speedPct: 0.005 },
    sorcerer:         { health: 0.5, attack: 0.15 },
    dark_magician:    { health: 0.3, attack: 0.10 },
    marksman:         { health: 0.4, speedPct: 0.002 },
    // 14 HP at level 1 (7 hearts). Level 20: 74 HP (below a human's 87). Level 35: 151 HP and a 750 power cap.
    weakling:         { armor: 0.3, toughness: 0.1, healthQuad: 0.06, attackQuad: 0.004 },
    brawler:          { health: 0.8, armor: 0.3, attackSpeedPct: 0.004 },
    skyborn:          { health: 0.25, speedPct: 0.004 }
  },
  // Damage traits, applied in KubeJS so they cover ability damage too.
  //   all/allPerLevel/allQuad = every hit the player causes        nonMelee = hits that are not a direct melee swing
  //   sword/swordPerLevel     = main hand is a sword (the jar adds the flat +25% on top for the Swordsman)
  //   projectile/projectilePerLevel = arrows, bolts, thrown weapons, bullets
  traits: {
    devil_fruit_user: { nonMelee: 1.15, allPerLevel: 0.015 },   // melee already gets +15% through an Origins attribute
    sorcerer:         { allPerLevel: 0.015 },
    swordsman:        { swordPerLevel: 0.02 },
    dark_magician:    { nonMelee: 1.20, allPerLevel: 0.010 },
    marksman:         { projectilePerLevel: 0.012 },              // the jar adds the flat +25%
    weakling:         { allQuad: 0.0006 },                      // +22% at level 20, +69% at level 35
    // Empty-handed melee: + unarmedFlat (+ unarmedFlatPerLevel per level) damage first, then x unarmed. Bare fists do 1 damage,
    // so a multiplier alone would be meaningless. Lv1: (1+4)*1.2 = 6, Lv20: about 17 with the per-level bonus.
    brawler:          { unarmedFlat: 4, unarmedFlatPerLevel: 0.35, unarmed: 1.2, allPerLevel: 0.008 },
    // Hits made while falling more than diveMinFall blocks: x dive (+ divePerLevel per level)
    skyborn:          { dive: 1.35, divePerLevel: 0.01, diveMinFall: 2.5 }
  },

  // -------------------------------------------------------------- POWER CAP
  // Max damage a single hit from a player (or their pet/summon) can deal. Scales with level.
  capAtLevel1: 100,
  capAtMaxLevel: 500,

  // -------------------------------------------------------------- POWER MASTERY (22_mastery.js)
  // The level is the key to every power system. Each system a player HAS opens in five stages, at levels 1 / 5 / 10 / 15 / 20:
  //   Haki          every origin
  //   Devil Fruit   origins whose rule is true, or a 'path' origin that chose it   (same for Cursed Energy and Dark Magic)
  // LEVEL 20 = EVERYTHING IS OPEN, for every origin, the Weakling included (its levels 21-35 only add stats, slots and the power cap).
  // Mastery only ever grants. Nothing is taken away, and a power a mod already gave you stays.
  //
  // What a stage does:
  //   * Haki is built in (the `haki` block below): Observation (dodge), Armament (hardening + armour piercing), Conqueror's (aura).
  //   * Every system can also open things in its own mod through `unlock`: advancements (found by name at run time), commands
  //     and, for Jujutsu Craft, player variables. Those patterns are best guesses: an operator runs /stodd mastery scan to see the
  //     advancement ids the installed mods really have and corrects the patterns here.
  powerMastery: {
    enabled: true,
    stageLevels: [1, 5, 10, 15, 20],                                          // level at which stage 0..4 opens; the last one is the full level
    stageNames: ['Dormant', 'Awakened', 'Honed', 'Refined', 'Mastered'],
    catchUpTicks: 200,                                                        // every 10 s each player is checked once, so nobody stays behind their level
    announce: true,
    systems: {
      haki:    { name: 'Haki',          color: 'red',          who: 'all' },
      fruit:   { name: 'Devil Fruit',   color: 'light_purple', who: 'rule' },
      sorcery: { name: 'Cursed Energy', color: 'dark_purple',  who: 'rule' },
      magic:   { name: 'Dark Magic',    color: 'dark_aqua',    who: 'rule' }
    },
    // Native Haki. Each strength scales in equal steps from `fromStage` (a quarter of the maximum at Awakened) to the maximum at Mastered.
    haki: {
      native: true,
      observation: { fromStage: 1, dodgeMax: 0.12 },                           // chance to slip a hit from a creature: 3 / 6 / 9 / 12 %
      armament:    { fromStage: 2, reductionMax: 0.12, pierceMax: 0.30 },      // hits from creatures hurt 12 % less at most; melee hits add 0.30 x the target's armour (capped at 20) at most
      conqueror:   { fromStage: 4, radius: 10, healthShare: 0.5, effectTicks: 80, everyTicks: 40, maxTargets: 24 }  // hostile non-boss mobs within `radius` whose max health is at most `healthShare` of yours are weakened and slowed
    },
    // Opens things in the power systems' own mods. stage = the stage at which the entry opens (0..4).
    //   advancements: { stage, match }   every advancement in `namespaces` whose path matches is granted to the player
    //   commands:     { stage, run }     run once as the server, {p} = the player's name
    //   variables:    { stage, name, atLeast }   Jujutsu Craft player variable raised to at least this value (never lowered)
    unlock: {
      sorcery: {
        namespaces: /^(jujutsucraft|jjk_addon|sorceryfight|jujutsucrafts)$/,
        advancements: [
          { stage: 2, match: /simple_?domain/ },
          { stage: 3, match: /(reverse_?cursed|reverse_?technique|(^|[_\/])rct([_\/]|$))/ },
          { stage: 4, match: /(domain_?expansion|black_?flash|maximum_?output)/ }
        ],
        commands: [],
        variables: []
      },
      fruit: {
        namespaces: /^(true_?prime_?piece|prime_?piece|tpp|ompworld|mineminenomi)$/,
        advancements: [ { stage: 4, match: /awaken/ } ],
        commands: [],
        variables: []
      },
      magic: {
        namespaces: /^malum$/,
        advancements: [],
        commands: [],
        variables: []
      },
      haki: {
        namespaces: /^(true_?prime_?piece|prime_?piece|tpp|ompworld|mineminenomi)$/,
        advancements: [
          { stage: 1, match: /(^|[_\/])(ken|kenbunshoku|observation)([_\/]|$)/ },
          { stage: 2, match: /(^|[_\/])(buso|busoshoku|armament)([_\/]|$)/ },
          { stage: 4, match: /(^|[_\/])(hao|haoshoku|conqueror)([_\/]|$)/ }
        ],
        commands: [],
        variables: []
      }
    }
  },

  // -------------------------------------------------------------- LEVEL LINKS (24_links.js)
  // Ties the STODD level to the other mods' own progression so the two climb in tandem, in BOTH directions:
  //     STODD level up  ->  True Prime Piece stat levels / Jujutsu Craft Fame (and so the grade) are raised to match
  //     mod stat / Fame up  ->  the STODD level is raised to match
  // Neither side is ever lowered by the other, nothing is applied twice, and a mod that clamps a value is respected.
  // The mods' storage could not be read when this was written, so the names below are GUESSES that the script checks at run time:
  // /stodd link says per link whether it found its fields, and /stodd link scan (operator) lists what the mods really keep on
  // the player so the patterns can be corrected here.
  //   type 'nbt'  a number inside the player's capability data (Forge saves it under ForgeCaps): capKey = regex on the capability
  //               key, fields = one regex per value, matched against the tag name. Written with entity.mergeNbt (or writeCommands).
  //   type 'jjc'  a Jujutsu Craft player variable (first variable whose name matches one of `fields`)
  //   mode 'linear'  each STODD level is worth perLevel of the mod's value. The first time the script sees you it treats your
  //                  current STODD level and mod value as equal, and keeps them in step from then on.
  //   mode 'table'   absolute values from `table` (the mod value at each STODD level; a level between two rows uses the lower row)
  //   combine        with several fields: 'min' = the mod side only counts when ALL of them have risen (safe), 'max' = when ANY has
  //   who            'all', or a power system (fruit / sorcery / magic): only origins that hold it
  levelLinks: {
    enabled: true,
    everyTicks: 100,            // every 5 s each player is checked (and at once on every STODD level change)
    maxStep: 5,                 // the mod can raise your STODD level by at most this many levels per check
    verifyWrites: true,         // after writing, read the value back; 3 failed writes in a row turns that link read-only
    announce: true,
    links: {
      tppStats: {
        name: 'True Prime Piece stats',
        who: 'all', type: 'nbt',
        capKey: /(true_?prime|prime_?piece|tpp)/i,
        fields: [/^(agility|agi)$/i, /^(strength|str)$/i, /^(health|vitality|vit)$/i, /^(toughness|tough|defen[cs]e)$/i],
        mode: 'linear', perLevel: 1, combine: 'min',
        writeCommands: []       // optional: commands run instead of mergeNbt, {p} = player, {field} = index, {v} = new value
      },
      jjcGrade: {
        name: 'Jujutsu grade',
        who: 'sorcery', type: 'jjc',
        fields: [/^PlayerFame$/i, /^Fame$/i, /fame/i],
        mode: 'table', combine: 'min',
        // The Fame needed for each grade is not published; these are placeholders (Grade 4 -> Special Grade at STODD levels 1 / 5 / 10 / 15 / 20).
        // Correct them from what /stodd link scan shows for your Fame once you know the real thresholds.
        table: [
          { level: 1,  value: 0 },
          { level: 5,  value: 1000 },
          { level: 10, value: 5000 },
          { level: 15, value: 20000 },
          { level: 20, value: 50000 }
        ],
        labels: ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Special Grade']
      }
    }
  },

  // ----------------------------------------------------------- BOSS SCALING
  bossMinHealth: 250,           // anything this tough (or tagged #forge:bosses) is a "boss"
  bossScanRadius: 96,
  bossHealthPerLevel: 0.15,     // Lv20 boss = 3.85x health
  bossDamagePerLevel: 0.06,     // Lv20 boss = 2.14x damage
  bossLevelInName: true,
  bossMaxLevel: 35,             // bosses follow the highest level any origin can reach

  // ------------------------------------------------------------ ORE / TIERS
  // +15% on high-value modded ores: each mined block has this chance to drop its loot one extra time.
  // (Ancient Debris gets a real +15% worldgen boost instead, see data/stodd/worldgen.)
  oreBonusChance: 0.15,
  oreBonusBlocks: /^(terramity:(deepslate_|nether_|end_)iridium_ore|terramity:profaned_ore|terramity:daemonium_ore|terramity:cosmic_ore|terramity:(bedrock|decayed)_black_matter_ore|terramity:deepslate_dimlite_ore|terramity:gaianite_cluster_ore|antarchy:([a-z]+_)?(uranium|titanium)_ore|mekanism:(deepslate_)?(osmium|uranium)_ore|mythicupgrades:(deepslate_)?necoium_ore|alexscaves:radrock_uranium_ore)$/,
  // Vanilla -> Terramity: Terramity's mid/late ores need at least a netherite-tier pickaxe.
  terramityNetheriteOres: ['terramity:deepslate_dimlite_ore', 'terramity:gaianite_cluster_ore', 'terramity:stellar_remnant', 'terramity:daemonium_ore',
    'terramity:deepslate_iridium_ore', 'terramity:nether_iridium_ore', 'terramity:end_iridium_ore', 'terramity:brimslag',
    'terramity:bedrock_black_matter_ore', 'terramity:decayed_black_matter_ore', 'terramity:profaned_ore', 'terramity:cosmic_ore'],
  // Terramity -> Antarchy: Antarchy uranium (and its other rare resources) need a Tier 3 Terramity pickaxe.
  // Exodium, Nyxium and Reverium are Terramity's three parallel top-tier pickaxes.
  antarchyPickaxes: ['terramity:exodium_pickaxe', 'terramity:nyxium_pickaxe', 'terramity:reverium_pickaxe', 'antarchy:ultimate_pickaxe'],
  antarchyGatedBlocks: /^antarchy:(([a-z]+_)?(uranium|titanium)_ore|raw_uranium_block|blood_crystal_cluster|budding_blood_crystal)$/,

  // ---------------------------------------------------------------- ISLANDS
  // Each theme's mobs may ONLY spawn on islands of that theme. A theme is used only when its mod is actually installed
  // (found by `mods`, a regex on the mod's name or id; `namespaces` are extra entity namespaces to claim).
  // 'wild' is always on and carries no power-system mobs, so it is the "ordinary island".
  islandThemes: [
    { id: 'one_piece', name: 'One Piece',    color: 'gold',         weight: 24, mods: /prime ?piece|true_?prime/i,                    namespaces: ['ompworld'] },
    { id: 'jujutsu',   name: 'Jujutsu',      color: 'dark_purple',  weight: 18, mods: /jujutsu|sorcery ?fight/i,                      namespaces: ['jjk_addon', 'sorceryfight'] },
    { id: 'cyberpunk', name: 'Night City',   color: 'aqua',         weight: 18, mods: /edgerunner|night ?city|cyberpunk/i,            namespaces: ['edgerunner_nightcity_mobs', 'cyberpunk_armor', 'nightcity', 'project_edgerunner', 'edgerunner_extras'] },
    { id: 'arcane',    name: 'Arcane',       color: 'blue',         weight: 10, mods: /^malum/i,                                      namespaces: ['malum'] },
    { id: 'wild',      name: 'Wild',         color: 'green',        weight: 22, mods: null,                                           namespaces: [] },
    // Special themes: each owns a slice of one extra roll per island (city 0.000-0.125, Neo City 0.125-0.175, ...), `chance` is
    // the share of ALL islands. New themes are appended so existing worlds never reshuffle; islands that were already
    // registered keep the theme they had. Night City's mobs also walk the modern city's streets (hosts).
    { id: 'city',           name: 'City',        color: 'gray',         chance: 0.125, mods: null, namespaces: [], hosts: ['cyberpunk'] },
    { id: 'city_future',    name: 'Neo City',    color: 'aqua',         chance: 0.05,  mods: null, namespaces: [], hosts: ['cyberpunk'], minOriginDistance: 900 },
    { id: 'city_primitive', name: 'Tribal Town', color: 'gold',         chance: 0.04,  mods: null, namespaces: [], minOriginDistance: 700 },
    { id: 'ember',          name: 'Ember Isle',  color: 'red',          chance: 0.04,  mods: null, namespaces: [], minOriginDistance: 600 },
    { id: 'sakura',         name: 'Sakura Isle', color: 'light_purple', chance: 0.04,  mods: null, namespaces: [], minOriginDistance: 600 },
    { id: 'ruins',          name: 'Overgrown Ruins', color: 'dark_green', chance: 0.04, mods: null, namespaces: [], minOriginDistance: 600 },
    { id: 'crystal',        name: 'Crystal Isle', color: 'dark_purple', chance: 0.04,  mods: null, namespaces: [], minOriginDistance: 600 },
    { id: 'skull',          name: 'Skull Cove',  color: 'white',        chance: 0.04,  mods: null, namespaces: [], minOriginDistance: 600 }
  ],
  // Island names: a made-up word from these syllables plus a word that fits the theme (40_islands.js, and the Java Log Pose).
  islandNames: {
    one_piece: ['Isle', 'Atoll', 'Reef', 'Harbor', 'Cove', 'Key'],
    jujutsu: ['Domain', 'Shrine', 'Barrier', 'Veil', 'Precinct', 'Grounds'],
    cyberpunk: ['Sprawl', 'Grid', 'District', 'Arcology', 'Block', 'Zone'],
    arcane: ['Grove', 'Hollow', 'Sanctum', 'Spire', 'Cairn', 'Altar'],
    wild: ['Wilds', 'Holm', 'Skerry', 'Thicket', 'Highland', 'Wilderness'],
    city: ['City', 'Metropolis', 'Downtown', 'Skyline', 'Megacity', 'Borough'],
    city_future: ['Nexus', 'Arcology', 'Helix', 'Orbital', 'Prime', 'Vector'],
    city_primitive: ['Camp', 'Hollow', 'Moot', 'Kraal', 'Tribe', 'Hearth'],
    ember: ['Caldera', 'Cinder', 'Forge', 'Pyre', 'Ashfall', 'Magma'],
    sakura: ['Blossom', 'Grove', 'Hanami', 'Petal', 'Shrine', 'Garden'],
    ruins: ['Ruins', 'Temple', 'Overgrowth', 'Lost Court', 'Vault', 'Citadel'],
    crystal: ['Spires', 'Geode', 'Prism', 'Lode', 'Shard', 'Cluster'],
    skull: ['Cove', 'Bay', 'Wreck', 'Skull Rock', 'Gallows', 'Deadwater'],
    sky: ['Drift', 'Perch', 'Aerie', 'Cloudhold', 'Float', 'Eyrie']
  },
  islandSyllables: ['ka', 'ro', 'mi', 'ze', 'tsu', 'na', 'vel', 'dor', 'shi', 'ra', 'ku', 'lo', 'bel', 'yu', 'gan', 'te', 'mor', 'ai'],
  // Ocean counts as One Piece water (Sea Kings, marine ships), nothing else.
  oceanTheme: 'one_piece',
  islandPeakStep: 32,      // hill-climb step (blocks) used to find an island's centre; it is refined down to 8
  islandMergeRadius: 170,  // two hill-tops closer than this are the same island
  islandLinkRadius: 460,    // ...or this close AND joined by land
  islandScanStep: 48,      // sample spacing when looking for island centres (islands are 280+ blocks across)
  islandThemeCell: 1400,   // only used when the world has no noise router (flat worlds): coarse themed regions
  islandLandThreshold: -0.19,   // continentalness above this is land/coast
  cullOnJoin: true              // also remove themed hostile mobs spawned by mods' custom spawners
}
