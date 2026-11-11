// ISLAND WAYSTONES: every island gets ONE Waystone (the block that Warp Stones, Warp Scrolls and the Waystones
// menu teleport to), standing at the CENTRE of the island (the summit of the island's own terrain function, the same
// point the Log Pose points at). It is built the first time a player comes within placeDistance of the centre, using
// Waystones' own world-generation feature (so the block is registered and named like any other waystone), styled to
// match the island's theme, and renamed after the island. Waystones' random world generation is switched off in
// config/waystones-common.toml (frequency = 0).
//
// Safety rules (kept from 1.0.5):
//   * never closer than 10 blocks to any player or 12 blocks to the world spawn point (it is then built on the
//     nearest good ground instead of exactly on the centre)
//   * the stone needs a clear 3x3 patch of open ground around it, so it can never wall anything in
//   * nothing is placed during the first 20 seconds after a player joins, or while they are airborne / swimming
//   * an island whose centre already has a waystone (ours, or one a player built there) never gets a second one
//   * a player who still ends up inside a waystone block is moved out automatically; /stodd unstick does the same
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.islandAt) { console.error('[STODD] islands/util not loaded - 45_waystones.js disabled'); return }
  let C = S.cfg
  let WS = C.waystones || {}
  let STYLE = WS.styleByTheme || {
    one_piece: 'waystones:sandy_waystone', jujutsu: 'waystones:blackstone_waystone',
    cyberpunk: 'waystones:deepslate_waystone', arcane: 'waystones:waystone', wild: 'waystones:mossy_waystone',
    city: 'waystones:deepslate_waystone', sky: 'waystones:waystone', city_future: 'waystones:waystone', city_primitive: 'waystones:sandy_waystone',
    ember: 'waystones:blackstone_waystone', sakura: 'waystones:waystone', ruins: 'waystones:mossy_waystone', crystal: 'waystones:deepslate_waystone', skull: 'waystones:sandy_waystone'
  }
  let MIN_PLAYER = WS.minPlayerDistance || 10
  let MIN_SPAWN = WS.minSpawnDistance || 12
  let ARRIVAL = WS.arrivalTicks || 400
  let MAX_ATTEMPTS = WS.maxAttempts || 40
  let PLACE_DIST = WS.placeDistance || 192
  let SEARCH = WS.centerSearch || 60
  let SKY_Y = (C.sky && C.sky.minY) || 200       // at or above this height a waystone belongs to a sky island
  // lifted sky islands (STODD Core 3.1) never hang over a ground island, so a ground island's stone may stand as high as its hills go
  let LIFTED = !!(C.sky && C.sky.lifted)
  let GROUND_CAP = LIFTED ? 318 : SKY_Y - 50
  let SKY_PLACE = WS.skyPlaceDistance || 112
  let AIR = /^minecraft:(air|cave_air|void_air)$/
  // Fallback list for modded plants when the block state cannot tell us it is replaceable
  let SOFT_ID = /:(short_grass|grass|tall_grass|fern|large_fern|dead_bush|snow|glow_lichen|dandelion|poppy|allium|azure_bluet|cornflower|lilac|peony|sunflower|rose_bush|pink_petals|moss_carpet|sweet_berry_bush|seagrass|tall_seagrass|kelp|sugar_cane|fire|spore_blossom|hanging_roots|[a-z_]*(flower|flowers|sapling|mushroom|tulip|orchid|vine|vines|bush|carpet|reeds|weeds|tallgrass))$/
  let BAD_GROUND = /(water|lava|leaves|_log$|_wood$|_stem$|(^|:)(ice|packed_ice|blue_ice|frosted_ice)$|bubble_column|cobweb|magma|powder_snow|slime|honey|bedrock|waystones:)/
  // Air, plants, snow layers: things the waystone may replace / stand next to
  function soft(b) {
    let id = String(b.id)
    if (AIR.test(id)) return true
    try { let st = b.blockState; if (st.canBeReplaced() && st.getFluidState().isEmpty()) return true } catch (e) { }
    return SOFT_ID.test(id)
  }
  let WaystoneManager = null
  try { WaystoneManager = Java.loadClass('net.blay09.mods.waystones.core.WaystoneManager') } catch (e) { console.warn('[STODD] Waystones classes not found, island waystones disabled') }
  if (WaystoneManager == null) return

  function store(server) {
    let pd = server.persistentData
    if (!pd.contains('stodd_ws')) pd.put('stodd_ws', new S.J.CompoundTag())
    return pd.getCompound('stodd_ws')
  }
  function islandKey(isl) { return isl.key || (isl.peakX + ',' + isl.peakZ) }
  function toArr(x) {
    if (x == null) return []
    try { if (typeof x.toArray === 'function') return Array.prototype.slice.call(x.toArray()) } catch (e) { }
    try { if (typeof x.length === 'number') return Array.prototype.slice.call(x) } catch (e) { }
    return []
  }
  // BlockPos coordinate, whichever way the binding exposes it
  function cx(b) { return typeof b.getX === 'function' ? Number(b.getX()) : Number(b.x) }
  function cz(b) { return typeof b.getZ === 'function' ? Number(b.getZ()) : Number(b.z) }

  // ---------- who / where is "too close" ----------
  function onlinePlayers(server, level) {
    let list = []
    try { list = toArr(server.getPlayerList().getPlayers()) } catch (e) { }
    if (list.length === 0) { try { list = toArr(server.players) } catch (e) { } }
    if (list.length === 0) { try { list = toArr(level.getPlayers()) } catch (e) { } }
    return list
  }
  function worldSpawn(level) {
    try { let sp = level.getSharedSpawnPos(); return [cx(sp), cz(sp)] } catch (e) { return [0, 0] }
  }
  function tooClose(x, z, y, avoid) {
    for (let i = 0; i < avoid.length; i++) {
      let a = avoid[i], dx = x - a.x, dz = z - a.z
      if (dx * dx + dz * dz < a.r * a.r && (a.anyY || Math.abs(y - a.y) < 12)) return true
    }
    return false
  }

  // ---------- terrain tests ----------
  let HM = null
  try { HM = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types') } catch (e) { }
  // y of the first free block above the ground (leaves ignored); falls back to scanning down from the build limit
  // `ground` = true for a ground island: a sky island overhead (its top is the heightmap) is skipped, so the stone is
  // built on the real ground underneath.
  function surfaceY(level, x, z, ground) {
    let cap = ground ? GROUND_CAP - 2 : 318
    try {
      if (HM != null) { let h = Number(level.getHeight(HM.MOTION_BLOCKING_NO_LEAVES, x, z)); if (h > -60 && h < (ground ? cap + 1 : 320)) return h }
    } catch (e) { }
    for (let y = cap; y > -60; y--) if (!soft(level.getBlock(x, y, z))) return y + 1
    return 64
  }
  // Highest solid ground in a column near fromY, or null when the column is a tree, water, a cave, etc.
  function groundY(level, x, z, fromY) {
    let top = Math.min(fromY + 24, 318), bottom = Math.max(fromY - 48, -60)
    for (let y = top; y >= bottom; y--) {
      let blk = level.getBlock(x, y, z)
      if (soft(blk)) continue
      if (BAD_GROUND.test(String(blk.id))) return null
      // open sky (or only soft plants) above this block?
      for (let k = 1; k <= 2; k++) {
        if (!soft(level.getBlock(x, y + k, z))) return null
      }
      return y
    }
    return null
  }
  // The stone is 1x2. Strict: the 3x3 patch around it is flat, solid underneath and open for 3 blocks up.
  // Relaxed: the 8 neighbours only have to be open where the stone itself stands (y and y+1).
  function roomFor(level, x, y, z, strict) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue
      if (!soft(level.getBlock(x + dx, y, z + dz)) || !soft(level.getBlock(x + dx, y + 1, z + dz))) return false
      if (strict) {
        if (!soft(level.getBlock(x + dx, y + 2, z + dz))) return false
        let g = level.getBlock(x + dx, y - 1, z + dz)
        if (soft(g) || BAD_GROUND.test(String(g.id))) return false
      }
    }
    return true
  }

  function rename(server, level, x, y, z, name) {
    try {
      let be = level.getBlock(x, y, z).entity
      if (be == null) return
      let w = be.getWaystone()
      if (w != null && typeof w.setName === 'function') {
        w.setName(name)
        try { WaystoneManager.get(server).updateWaystone(w) } catch (e) { }
        try { be.setChanged() } catch (e) { }
      }
    } catch (e) { S.log('waystone rename ' + e) }
  }

  // ---------- "does this island already have one?" ----------
  // Every waystone we know about in the overworld: Waystones' own registry (includes ones players built).
  function knownWaystones(server) {
    let out = []
    try {
      toArr(WaystoneManager.get(server).getWaystones()).forEach(w => {
        try {
          if (String(w.getDimension().location()).indexOf('overworld') < 0) return
          let p = w.getPos()
          let py = typeof p.getY === 'function' ? Number(p.getY()) : Number(p.y)
          out.push([cx(p), cz(p), py])
        } catch (e) { }
      })
    } catch (e) { }
    return out
  }
  // A waystone within `r` blocks of (x, z) (horizontal), or null. `sky` = true only counts waystones up on a sky island,
  // false only counts ground ones (a sky island is often right above a ground island's centre).
  S.waystoneNear = function (server, x, z, r, sky) {
    let list = knownWaystones(server)
    for (let i = 0; i < list.length; i++) {
      let dx = list[i][0] - x, dz = list[i][1] - z
      if (sky != null && !LIFTED && (list[i][2] >= SKY_Y) !== !!sky) continue
      if (dx * dx + dz * dz <= r * r) return list[i]
    }
    return null
  }

  // ---------- placing ----------
  // Candidate columns around the island centre, the centre itself first, then widening rings.
  function centreSpots(x0, z0, radius) {
    let spots = [[x0, z0]]
    for (let r = 3; r <= radius; r += 3) {
      let n = Math.max(6, Math.round(2 * Math.PI * r / 5))
      let off = (Math.abs(x0 * 31 + z0 * 17 + r) % 12) * Math.PI / 12
      for (let a = 0; a < n; a++) spots.push([x0 + Math.round(r * Math.cos(off + a * 2 * Math.PI / n)), z0 + Math.round(r * Math.sin(off + a * 2 * Math.PI / n))])
    }
    return spots
  }
  // Builds the island's waystone at its centre (or on the nearest good ground). `near` is the player who triggered it
  // (used only to keep the stone off people). Returns [x, y, z], or null when no suitable ground was found.
  S.placeCenterWaystone = function (level, server, isl, near) {
    let style = STYLE[isl.theme.id] || STYLE.wild
    let avoid = []
    onlinePlayers(server, level).forEach(q => {
      try { avoid.push({ x: Math.floor(q.x), z: Math.floor(q.z), y: Math.floor(q.y), r: MIN_PLAYER }) } catch (e) { }
    })
    let sp = worldSpawn(level)
    avoid.push({ x: sp[0], z: sp[1], y: 64, r: MIN_SPAWN, anyY: true })
    let isSky = !!isl.sky
    let spots = centreSpots(isl.peakX, isl.peakZ, isSky ? Math.min(SEARCH, Math.max(8, (isl.rad || 40) - 8)) : SEARCH)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < spots.length; i++) {
        let x = spots[i][0], z = spots[i][1]
        let sy = surfaceY(level, x, z, !isSky)
        if (tooClose(x, z, sy, avoid)) continue
        let gy = groundY(level, x, z, sy - 22)
        if (gy == null) continue
        // a sky island's stone must really stand on the sky island, a ground island's on the ground
        if (isSky ? gy < SKY_Y : gy >= GROUND_CAP) continue
        let y = gy + 1
        if (!roomFor(level, x, y, z, pass === 0)) continue
        // clear soft plants where the two-block stone will stand
        ;[y, y + 1].forEach(yy => { if (!AIR.test(String(level.getBlock(x, yy, z).id))) S.run(server, 'setblock ' + x + ' ' + yy + ' ' + z + ' minecraft:air') })
        S.run(server, 'execute in minecraft:overworld run place feature ' + style + ' ' + x + ' ' + y + ' ' + z)
        if (String(level.getBlock(x, y, z).id).indexOf('waystones:') !== 0) continue
        // record first, then dress it up
        try { store(server).putString(islandKey(isl), x + ',' + y + ',' + z) } catch (e) { }
        rename(server, level, x, y, z, isl.label.replace(/\s*\(.*\)\s*$/, ''))
        S.log('island waystone for ' + isl.label + ' at ' + x + ' ' + y + ' ' + z + ' (centre ' + isl.peakX + ',' + isl.peakZ + ')')
        return [x, y, z]
      }
    }
    return null
  }

  // ---------- keeping players out of the stone ----------
  function inWaystone(p) {
    try {
      let x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z)
      return String(p.level.getBlock(x, y, z).id).indexOf('waystones:') === 0 || String(p.level.getBlock(x, y + 1, z).id).indexOf('waystones:') === 0
    } catch (e) { return false }
  }
  // Moves the player to the nearest open ground within a few blocks (or on top of whatever they are stuck in).
  S.unstick = function (p) {
    let level = p.level, server = p.server
    let px = Math.floor(p.x), pz = Math.floor(p.z), py = Math.floor(p.y)
    let dest = null
    for (let r = 2; r <= 8 && dest == null; r += 2) {
      for (let a = 0; a < 8 && dest == null; a++) {
        let x = px + Math.round(r * Math.cos(a * Math.PI / 4)), z = pz + Math.round(r * Math.sin(a * Math.PI / 4))
        let gy = groundY(level, x, z, py)
        if (gy != null && Math.abs(gy - py) <= 6) dest = [x, gy + 1, z]
      }
    }
    for (let y = py; y <= py + 40 && dest == null; y++) {
      if (soft(level.getBlock(px, y, pz)) && soft(level.getBlock(px, y + 1, pz)) && !soft(level.getBlock(px, y - 1, pz))) dest = [px, y, pz]
    }
    if (dest == null) return false
    S.run(server, 'execute as ' + p.username + ' at @s run tp @s ' + (dest[0] + 0.5) + ' ' + dest[1] + ' ' + (dest[2] + 0.5))
    return true
  }

  function grounded(p) {
    try { if (typeof p.isOnGround === 'function') return !!p.isOnGround() } catch (e) { }
    try { if (typeof p.onGround === 'boolean') return p.onGround } catch (e) { }
    return true
  }
  function swimming(p) {
    try { if (typeof p.isInWater === 'function') return !!p.isInWater() } catch (e) { }
    return false
  }

  let attempts = new Map()
  let lastTry = new Map()
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % 20 === 7 && inWaystone(p)) {
      if (S.unstick(p)) p.tell(Text.yellow('[STODD] You were inside a waystone, so you were moved out.'))
    }
    if (p.age % 100 !== 31) return
    if (p.age < ARRIVAL) return
    if (p.isSpectator()) return
    if (!grounded(p) || swimming(p)) return
    let isl = S.islandOrSkyAt(p.level, p.x, p.y, p.z)
    if (isl == null || isl.ocean) return
    let key = islandKey(isl)
    let st = store(p.server)
    if (st.contains(key)) return
    // a city island's stone stands in the middle of its plaza, so it waits until 49_city.js has built the plaza
    if (S.cityPlazaDone && !S.cityPlazaDone(isl, p.level)) return
    // ...and a dressed island's stone stands in the yard of its middle landmark (52_makeover.js)
    if (S.centerReady && !S.centerReady(isl, p.level)) return
    // only once the player is near enough that the centre is (about) in loaded range
    let dx = isl.peakX - p.x, dz = isl.peakZ - p.z
    let reach = isl.sky ? SKY_PLACE : PLACE_DIST
    if (dx * dx + dz * dz > reach * reach) return
    let n = attempts.get(key) || 0
    if (n >= MAX_ATTEMPTS) return
    // after a failed search wait until the player has moved on, so a bad patch of ground is not re-checked forever
    let lt = lastTry.get(key)
    if (lt != null && Math.abs(p.x - lt[0]) + Math.abs(p.z - lt[1]) < 16) return
    // a waystone already stands at the centre (a player built it, or the record was lost)
    let have = S.waystoneNear(p.server, isl.peakX, isl.peakZ, 24, !!isl.sky)
    if (have != null) { st.putString(key, 'known:' + have[0] + ',' + have[1]); return }
    attempts.set(key, n + 1)
    lastTry.set(key, [p.x, p.z])
    let pos = S.placeCenterWaystone(p.level, p.server, isl, p)
    if (pos != null) {
      let name = isl.label.replace(/\s*\(.*\)\s*$/, '')
      p.tell(Text.gold('[Island] ').append(Text.white('The central waystone of ')).append(Text.yellow(name)).append(Text.white(' stands at ')).append(Text.aqua(pos[0] + ', ' + pos[1] + ', ' + pos[2])).append(Text.white('. Activate it to warp back.')))
    }
  })

  // Operators can re-place the waystone of the island they are standing on (e.g. after it was broken).
  S.forceIslandWaystone = function (player) {
    let isl = S.islandOrSkyAt(player.level, player.x, player.y, player.z)
    if (isl == null || isl.ocean) return 'You are not on an island.'
    if (S.cityPlazaDone && !S.cityPlazaDone(isl, player.level)) return 'This city island has no plaza yet; its waystone is built in the plaza once the city reaches the centre (/stodd city).'
    if (S.centerReady && !S.centerReady(isl, player.level)) return 'This island has not been dressed up yet; its waystone is built in the yard of its central landmark once the makeover reaches the middle (/stodd isle).'
    let have = S.waystoneNear(player.server, isl.peakX, isl.peakZ, 24, !!isl.sky)
    if (have != null) return 'This island already has its central waystone near ' + have[0] + ', ' + have[1] + '.'
    let pos = S.placeCenterWaystone(player.level, player.server, isl, player)
    return pos == null ? 'No suitable ground found near the centre (' + isl.peakX + ', ' + isl.peakZ + '). Try again later.' : ('Waystone placed at ' + pos.join(', '))
  }
})()
