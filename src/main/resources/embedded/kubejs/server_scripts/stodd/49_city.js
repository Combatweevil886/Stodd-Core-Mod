// priority: 420
// CITY ISLANDS: an island whose theme is a city style ('city' = modern, 'city_future' = Neo City, 'city_primitive' = tribal
// town; 40_islands.js rolls them, about one island in five all together) is turned into a city.
//
//   * GENERATION MODE (default, cfg.city.generate): the city is built while the island's chunks are generated, like a structure.
//     The startup script forwards Forge's "a chunk was generated for the first time" event; this file finds out which city
//     blocks that chunk belongs to and, as soon as all the chunks of a block exist, queues it. Blocks go up at the edge of the
//     view distance, long before a player walks in, in whatever order the world is explored, and they are saved with the chunks.
//   * Building is spread out: at most cfg.city.budgetMs milliseconds of commands per server tick (a block is 6-12 commands),
//     and the clearing / foundation work is cut down to what the terrain actually needs, so exploring does not stutter.
//   * FALLBACK (cfg.city.approachFallback): land that was generated BEFORE this version, or while the server was down, never
//     fires the "new chunk" event; when a player comes within triggerRadius of such an island its missing blocks are built too.
//   * A city is a grid of 48 x 48 block city blocks over the island, starting with a plaza on the island's centre (the central
//     waystone is built in the middle of that plaza by 45_waystones.js) and spreading outwards over land only. Each block:
//       1. clear what rises above street level   2. fill a stone-brick foundation where the ground is lower (a sea wall at the coast)
//       3. move any animals / villagers out of the volume   4. /place template stodd:city/<id>   5. /fillbiome the style's biome
//   * Only chunks that are loaded are touched, and a block is never started while a player stands inside it, so nobody
//     is buried. What was built is saved per island (persistent data 'stodd_city'); a finished block is never rebuilt.
//   * It is still built by commands after the chunks exist (a real structure cannot know which islands are city islands), so
//     back up before first use on a world that already has things on its city-themed islands: the blocks replace what is there.
//
//   /stodd city            progress of the island you stand on
//   /stodd city rebuild    (operator) forget what was built here, so it is built again (overwrites player builds!)
//   (finding city islands: /stodd locate city, in 53_locate.js)
//
//   Every style has its own template list, districts, biome and plaza in cfg.city.styles (00_config.js).
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.islandAt || !S.islandsNear || !S.landSampler) { console.error('[STODD] islands not loaded - 49_city.js disabled'); return }
  let C = S.cfg
  let CC = C.city || {}
  // 45_waystones.js asks this before it places a city island's waystone
  S.cityPlazaDone = function () { return true }
  if (!CC.enabled) return
  // STODD Core 3 generates the city islands with their chunks (structures stodd:city_block): nothing is left for this script to
  // build, so it only answers /stodd city. city.scriptBuilder = true brings the old builder back (for land generated before 3.0).
  if (S.apiFlag('worldgenActive') && !CC.scriptBuilder) {
    ServerEvents.commandRegistry(event => {
      let Commands = event.commands
      event.register(Commands.literal('stodd').then(Commands.literal('city').executes(ctx => {
        let p = ctx.source.getPlayerOrException()
        ctx.source.sendSystemMessage(Text.gold('[City] ').append(Text.white(String(S.API.islandReport(p.level, p.x, p.y, p.z)))))
        return 1
      })))
    })
    console.info('[STODD] city islands are world generation (STODD Core 3); 49_city.js only answers /stodd city')
    return
  }

  let HM = null
  try { HM = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types') } catch (e) { }
  let CompoundTag = S.J.CompoundTag
  let CELL = CC.cell || 48
  let RADIUS = CC.radius || 300
  let THR = C.islandLandThreshold + (CC.landMargin == null ? 0.04 : CC.landMargin)
  let BASE_MIN = CC.baseMin || 66, BASE_MAX = CC.baseMax || 78
  let FOUND_MAX = CC.foundationMax || 40
  let FLOOR_MIN = CC.floorMin == null ? -58 : CC.floorMin
  let TRIG = CC.triggerRadius || 200
  let STEP_EVERY = Math.max(1, CC.stepEvery || 2)
  let STEPS = Math.max(1, CC.stepsPerTick || 1)
  let GEN = CC.generate !== false                       // build while the island's chunks are generated
  let FALLBACK = CC.approachFallback !== false          // ...and, for land that already exists, when a player comes near
  let BUDGET = CC.budgetMs == null ? 8 : CC.budgetMs    // ms of commands per tick; 0 = the old pace (stepsPerTick every stepEvery ticks)
  let GEN_PER_TICK = CC.chunksPerTick || 24             // new chunks looked at per tick
  let QMAX = CC.queueMax || 4000
  let LEAN = CC.lean !== false                          // clear only down to the real surface, found only where the ground is lower
  let SCAN_EVERY = CC.scanEvery || 40
  let STYLES = CC.styles || {}
  let BIO_BELOW = CC.biomeBelow == null ? 8 : CC.biomeBelow
  let BIO_ABOVE = CC.biomeAbove == null ? 104 : CC.biomeAbove
  let MAX_FAILS = CC.maxTemplateFailures || 3
  let CUT_CAP = CC.cutCap || 148        // never clear above this: sky islands start just above it
  let SLAB = 14                      // 48 x 48 x 14 = 32,256 blocks: just under the 32,768 limit of /fill and /fillbiome
  let clock = function () { return Date.now() }
  S.cityClock = function (fn) { clock = fn }
  let IN = 'execute in minecraft:overworld run '
  let ROT = ['none', 'clockwise_90', '180', 'counterclockwise_90']
  let KEEP = ['player', 'item', 'experience_orb', 'item_frame', 'glow_item_frame', 'painting', 'armor_stand', 'marker', 'area_effect_cloud',
    'leash_knot', 'falling_block', 'interaction', 'text_display', 'block_display', 'item_display']
  let NOT_KEEP = KEEP.map(k => 'type=!minecraft:' + k).join(',')
  function styleOf(themeId) { return STYLES[themeId] || null }

  function toArr(x) {
    if (x == null) return []
    try { if (typeof x.toArray === 'function') return Array.prototype.slice.call(x.toArray()) } catch (e) { }
    try { if (typeof x.length === 'number') return Array.prototype.slice.call(x) } catch (e) { }
    return []
  }
  function playersOf(server) {
    let list = []
    try { list = toArr(server.getPlayerList().getPlayers()) } catch (e) { }
    if (list.length === 0) { try { list = toArr(server.players) } catch (e) { } }
    return list
  }
  function seedOf(level) { return Number(level.getSeed() % 2147483647) }

  // ---------------------------------------------------------------- saved plans
  // root['stodd_city'][islandKey] = { g, x0, z0, done: ';i,j;i,j', fin }
  function rootTag(level) {
    let pd = level.server.persistentData
    let raw = String(level.getSeed())
    let t = pd.contains('stodd_city') ? pd.getCompound('stodd_city') : null
    if (t == null || String(t.getString('seed')) !== raw) {
      t = new CompoundTag()
      t.putString('seed', raw)
      pd.put('stodd_city', t)
    }
    return t
  }
  let plans = new Map()
  let plansSeed = null
  function parseDone(str) {
    let set = new Set()
    String(str || '').split(';').forEach(s => { if (/^-?\d+,-?\d+$/.test(s)) set.add(s) })
    return set
  }
  function saveDone(pl) {
    let arr = []
    pl.done.forEach(k => { arr.push(k) })
    pl.tag.putString('done', arr.join(';'))
    pl.tag.putBoolean('fin', !!pl.fin)
  }

  // ---------------------------------------------------------------- street level and the grid
  // Typical ground height of the island (median of generator height samples over its land), held between baseMin and baseMax.
  // Columns under a sky island report the sky island's height, so anything above 190 is not ground and is ignored.
  function streetLevel(level, sample, cx, cz) {
    let hs = []
    try {
      let src = level.getChunkSource()
      let gen = src.getGenerator(), rs = src.randomState()
      let R = Math.min(RADIUS, 240), step = CC.sampleStep || 28
      for (let dx = -R; dx <= R; dx += step) for (let dz = -R; dz <= R; dz += step) {
        if (dx * dx + dz * dz > R * R) continue
        let x = cx + dx, z = cz + dz
        if (sample != null && sample(x, z) < THR) continue
        let h = Number(gen.getBaseHeight(x, z, HM.OCEAN_FLOOR_WG, level, rs)) - 1
        if (h > 40 && h < 190) hs.push(h)
      }
    } catch (e) { S.log('city street level: ' + e) }
    if (hs.length === 0) return Math.round((BASE_MIN + BASE_MAX) / 2)
    hs.sort((a, b) => a - b)
    return Math.max(BASE_MIN, Math.min(BASE_MAX, hs[Math.floor(hs.length / 2)]))
  }
  // Which grid cells belong to the island: the centre and four corners of the cell are land, the cell is within RADIUS
  // of the island's centre and sits on THIS island (not a neighbour's coast).
  function buildCells(level, sample, pl) {
    let N = Math.ceil(RADIUS / CELL) + 1
    let cells = []
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      let x = pl.x0 + i * CELL, z = pl.z0 + j * CELL
      let mx = x + CELL / 2, mz = z + CELL / 2
      let dx = mx - pl.cx, dz = mz - pl.cz
      let d = Math.sqrt(dx * dx + dz * dz)
      if (!(i === 0 && j === 0)) {
        if (d > RADIUS) continue
        if (sample != null) {
          let pts = [[mx, mz], [x, z], [x + CELL - 1, z], [x, z + CELL - 1], [x + CELL - 1, z + CELL - 1]]
          let ok = true
          for (let k = 0; k < pts.length; k++) if (sample(pts[k][0], pts[k][1]) < THR) { ok = false; break }
          if (!ok) continue
        }
        let isl = S.islandAt(level, Math.floor(mx), Math.floor(mz))
        if (isl == null || isl.ocean || isl.key !== pl.key) continue
      }
      cells.push({ i: i, j: j, x: x, z: z, d: d, id: i + ',' + j, tries: 0, hold: 0, queued: false })
    }
    return cells
  }
  function planFor(level, info) {
    let seed = seedOf(level)
    if (plansSeed !== seed) { plans.clear(); plansSeed = seed }
    let key = info.key
    let pl = plans.get(key)
    if (pl != null) return pl
    let sample = S.landSampler(level)
    if (sample == null || HM == null) return null
    let root = rootTag(level)
    let tag = root.contains(key) ? root.getCompound(key) : null
    let fresh = tag == null
    if (fresh) {
      tag = new CompoundTag()
      tag.putInt('g', streetLevel(level, sample, info.peakX, info.peakZ))
      tag.putInt('x0', info.peakX - CELL / 2)
      tag.putInt('z0', info.peakZ - CELL / 2)
      tag.putString('done', '')
      tag.putBoolean('fin', false)
      root.put(key, tag)
    }
    pl = {
      key: key, style: styleOf(info.theme.id), label: info.label, seed: seed, cx: info.peakX, cz: info.peakZ, g: tag.getInt('g'), x0: tag.getInt('x0'), z0: tag.getInt('z0'),
      tag: tag, done: parseDone(tag.getString('done')), fin: !!tag.getBoolean('fin'), cells: [], bad: new Set(), fails: {}, broken: false
    }
    pl.cells = buildCells(level, sample, pl)
    pl.cellMap = new Map()
    for (let k = 0; k < pl.cells.length; k++) pl.cellMap.set(pl.cells[k].id, pl.cells[k])
    // how far out this island's city reaches: the districts (downtown / middle / outskirts) are scaled to it
    pl.extent = CELL
    for (let k = 0; k < pl.cells.length; k++) if (pl.cells[k].d > pl.extent) pl.extent = pl.cells[k].d
    plans.set(key, pl)
    S.log('city plan for ' + pl.label + ': street level ' + pl.g + ', ' + pl.cells.length + ' blocks')
    return pl
  }

  S.cityPlazaDone = function (isl, level) {
    try {
      if (isl == null || !isl.theme || styleOf(isl.theme.id) == null) return true
      let pl = plans.get(isl.key)
      if (pl != null) return pl.broken || pl.done.has('0,0')
      let root = rootTag(level)
      if (!root.contains(isl.key)) return false
      return parseDone(root.getCompound(isl.key).getString('done')).has('0,0')
    } catch (e) { return true }
  }

  // ---------------------------------------------------------------- choosing what to put on a block
  function pickTemplate(pl, cell) {
    let ST = pl.style
    if (cell.i === 0 && cell.j === 0) {
      // the centre block is always a plaza (45_waystones.js builds the island's waystone in its middle); a style may list
      // several, and each island keeps the one its seed picks - falling back to the others if that one keeps failing
      let ps = (ST.plazas && ST.plazas.length > 0) ? ST.plazas : (ST.plaza ? [ST.plaza] : [])
      if (ps.length === 0) return null
      let start = S.hash3(pl.cx + 31, pl.cz - 17, pl.seed ^ 0x2c1b3c6d) % ps.length
      for (let k = 0; k < ps.length; k++) {
        let id = ps[(start + k) % ps.length]
        if (pl.bad.has(id)) continue
        let h = (ST.plazaHeights && ST.plazaHeights[id]) || ST.plazaHeight || 8
        return { id: id, rot: 0, h: h }
      }
      return null
    }
    let ZONES = ST.zones || [{ upTo: 9.99, kind: {} }], TEMPLATES = ST.templates || []
    let t = Math.min(1, cell.d / (pl.extent || RADIUS))
    let zone = ZONES[ZONES.length - 1]
    for (let z = 0; z < ZONES.length; z++) if (t <= ZONES[z].upTo) { zone = ZONES[z]; break }
    let list = [], total = 0
    for (let k = 0; k < TEMPLATES.length; k++) {
      let tp = TEMPLATES[k]
      if (pl.bad.has(tp.id)) continue
      let m = zone.kind[tp.kind]
      let w = tp.weight * (m == null ? 1 : m)
      if (w <= 0) continue
      list.push([tp, w]); total += w
    }
    if (list.length === 0) return null
    let r = (S.hash3(cell.i * 7919 + 13, cell.j * 104729 - 7, (pl.seed ^ 0x3a7e1f5d) + cell.tries) % 100000) / 100000 * total
    let pick = list[list.length - 1][0]
    for (let k = 0; k < list.length; k++) { r -= list[k][1]; if (r < 0) { pick = list[k][0]; break } }
    let rot = (S.hash3(cell.i + 101, cell.j - 57, pl.seed ^ 0x51ed270b) >>> 7) & 3
    return { id: pick.id, rot: rot, h: pick.height }
  }
  // The world position /place template needs so that the rotated template fills exactly [x, x+47] x [z, z+47]
  // (the template is rotated about its own origin corner, so each rotation shifts the origin).
  function placeAt(cell, rot) {
    let a = CELL - 1
    if (rot === 1) return [cell.x + a, cell.z]
    if (rot === 2) return [cell.x + a, cell.z + a]
    if (rot === 3) return [cell.x, cell.z + a]
    return [cell.x, cell.z]
  }
  S.cityPlaceAt = placeAt

  // Highest block in the cell right now (trees included); chunks must be loaded. Lean mode looks every 2 blocks, so a tree is not missed.
  function maxSurface(level, cell) {
    let m = -64
    let st = LEAN ? 2 : 6
    try {
      for (let a = 0; a <= CELL; a += st) for (let b = 0; b <= CELL; b += st) {
        let h = Number(level.getHeight(HM.WORLD_SURFACE, Math.min(cell.x + a, cell.x + CELL - 1), Math.min(cell.z + b, cell.z + CELL - 1)))
        if (h > m) m = h
      }
    } catch (e) { return null }
    return m
  }
  // Lowest solid ground in the cell (water ignored) on a 3 x 3 grid: the foundation only has to reach down to here.
  function minGround(level, cell) {
    let m = 1000
    try {
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        let h = Number(level.getHeight(HM.OCEAN_FLOOR, cell.x + a * 23 + (a === 0 ? 0 : 1), cell.z + b * 23 + (b === 0 ? 0 : 1))) - 1
        if (h < m) m = h
      }
    } catch (e) { return null }
    return m === 1000 ? null : m
  }
  // steps of one block. surf = highest block now; floorY = lowest solid ground in the block (null = unknown: fill the whole foundation)
  function stepsFor(pl, cell, tpl, surf, floorY) {
    let g = pl.g
    let x1 = cell.x, z1 = cell.z, x2 = cell.x + CELL - 1, z2 = cell.z + CELL - 1
    let lo = Math.max(FLOOR_MIN, g - FOUND_MAX)
    let want = g + tpl.h + 1
    // The volume that must be empty is the template's height plus anything natural that rises above it (a hill, tall trees), up to CUT_CAP.
    // Lean mode clears only down to what is really there: air above the surface needs no clearing, and a short building on a flat
    // island then costs one fill instead of seven.
    let cutTop, top
    if (LEAN && surf != null) { cutTop = Math.min(surf + 4, CUT_CAP); top = Math.max(want, cutTop) }
    else { top = Math.max(want, Math.min((surf == null ? 0 : surf) + 1, CUT_CAP)); cutTop = top }
    cell.top = top
    let steps = []
    for (let y = g + 1; y <= cutTop; y += SLAB) steps.push({ k: 'cut', cmd: IN + 'fill ' + x1 + ' ' + y + ' ' + z1 + ' ' + x2 + ' ' + Math.min(y + SLAB - 1, cutTop) + ' ' + z2 + ' minecraft:air' })
    let fLo = LEAN && floorY != null ? Math.max(lo, floorY - 2) : lo
    for (let y = fLo; y <= g - 1; y += SLAB) steps.push({ k: 'found', cmd: IN + 'fill ' + x1 + ' ' + y + ' ' + z1 + ' ' + x2 + ' ' + Math.min(y + SLAB - 1, g - 1) + ' ' + z2 + ' ' + (pl.style.foundation || 'minecraft:stone_bricks') })
    steps.push({ k: 'tp', cmd: IN + 'execute as @e[x=' + x1 + ',y=' + lo + ',z=' + z1 + ',dx=' + (CELL - 1) + ',dy=' + (top - lo) + ',dz=' + (CELL - 1) + ',' + NOT_KEEP + '] run tp @s ' + (x1 + 1.5) + ' ' + (g + 1) + ' ' + (z1 + 1.5) })
    let at = placeAt(cell, tpl.rot)
    steps.push({ k: 'place', cmd: IN + 'place template stodd:city/' + tpl.id + ' ' + at[0] + ' ' + g + ' ' + at[1] + ' ' + ROT[tpl.rot] })
    let bioTop = LEAN ? g + Math.min(BIO_ABOVE, tpl.h + 8) : g + BIO_ABOVE
    for (let y = g - BIO_BELOW; y <= bioTop; y += SLAB) steps.push({ k: 'biome', cmd: IN + 'fillbiome ' + x1 + ' ' + y + ' ' + z1 + ' ' + x2 + ' ' + Math.min(y + SLAB - 1, bioTop) + ' ' + z2 + ' ' + (pl.style.biome || 'stodd:metropolis') })
    return steps
  }
  S.cityStepsFor = stepsFor

  // ---------------------------------------------------------------- guards
  function chunksLoaded(level, cell) {
    let c0 = cell.x >> 4, c1 = (cell.x + CELL - 1) >> 4, d0 = cell.z >> 4, d1 = (cell.z + CELL - 1) >> 4
    for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) {
      try { if (!level.hasChunk(a, b)) return false } catch (e) { return false }
    }
    return true
  }
  function playerInside(server, cell, lo, hi) {
    let ps = playersOf(server)
    for (let i = 0; i < ps.length; i++) {
      let p = ps[i]
      try {
        if (String(p.level.dimension).indexOf('minecraft:overworld') < 0) continue
        if (p.x >= cell.x - 2 && p.x <= cell.x + CELL + 2 && p.z >= cell.z - 2 && p.z <= cell.z + CELL + 2 && p.y >= lo - 3 && p.y <= hi + 3) return true
      } catch (e) { }
    }
    return false
  }

  // ---------------------------------------------------------------- the work queue
  let active = new Map()   // island key -> { pl, level, until }   (the approach fallback: islands a player is near)
  let genQ = []            // chunks that were just generated: { level, x, z }
  let buildQ = []          // city blocks whose chunks all exist and that wait their turn: { pl, cell, level }
  let work = null          // { pl, cell, tpl, steps, idx, level, wait }
  let nextLook = 0
  let notified = {}

  function activate(level, info, now) {
    if (info == null || info.theme == null || styleOf(info.theme.id) == null) return
    let pl = planFor(level, info)
    if (pl == null || pl.fin || pl.broken) return
    let a = active.get(pl.key)
    if (a == null) active.set(pl.key, { pl: pl, level: level, until: now + 2400 })
    else a.until = now + 2400
  }
  function pending(pl, now) {
    let out = []
    for (let k = 0; k < pl.cells.length; k++) {
      let c = pl.cells[k]
      if (pl.done.has(c.id) || c.tries >= 6 || c.hold > now || c.queued) continue
      out.push(c)
    }
    return out
  }

  // ---- generation mode: a chunk was generated for the first time
  // Called by the startup script's ChunkEvent$Load hook. Only remembers the chunk; nothing else is touched inside the event.
  global.stoddChunkLoad = function (e) {
    if (!GEN) return
    try {
      if (!e.isNewChunk()) return
      let level = e.getLevel()
      if (level.isClientSide()) return
      let pos = e.getChunk().getPos()
      if (genQ.length >= QMAX) genQ.shift()
      genQ.push({ level: level, x: Number(pos.x), z: Number(pos.z) })
    } catch (err) { }
  }
  // the city blocks (not yet built) that overlap chunk (cx, cz)
  function cellsTouching(pl, cx, cz) {
    let bx = cx * 16, bz = cz * 16
    let i0 = Math.floor((bx - pl.x0) / CELL), i1 = Math.floor((bx + 15 - pl.x0) / CELL)
    let j0 = Math.floor((bz - pl.z0) / CELL), j1 = Math.floor((bz + 15 - pl.z0) / CELL)
    let out = []
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      let c = pl.cellMap.get(i + ',' + j)
      if (c != null) out.push(c)
    }
    return out
  }
  function queueIfReady(level, pl, c) {
    if (pl.done.has(c.id) || c.queued || c.tries >= 6) return false
    if (!chunksLoaded(level, c)) return false
    c.queued = true
    if (c.i === 0 && c.j === 0) buildQ.unshift({ pl: pl, cell: c, level: level })
    else buildQ.push({ pl: pl, cell: c, level: level })
    return true
  }
  function drainGen() {
    let n = 0
    while (genQ.length > 0 && n < GEN_PER_TICK) {
      let g = genQ.shift()
      n++
      try {
        let level = g.level
        if (String(level.dimension).indexOf('minecraft:overworld') < 0) continue
        let info = S.islandAt(level, g.x * 16 + 8, g.z * 16 + 8)
        if (info == null || info.ocean || styleOf(info.theme.id) == null) continue
        let pl = planFor(level, info)
        if (pl == null || pl.fin || pl.broken) continue
        let cells = cellsTouching(pl, g.x, g.z)
        for (let k = 0; k < cells.length; k++) queueIfReady(level, pl, cells[k])
      } catch (err) { S.log('city chunk ' + err) }
    }
  }
  // queue every block of an island whose chunks are loaded now (rebuild, and islands a player is standing on)
  function queueAllReady(level, pl) {
    let n = 0
    for (let k = 0; k < pl.cells.length; k++) if (queueIfReady(level, pl, pl.cells[k])) n++
    return n
  }

  function startWork(pl, cell, level) {
    let tpl = pickTemplate(pl, cell)
    if (tpl == null) {
      pl.broken = true
      if (!notified[pl.key]) { notified[pl.key] = true; console.error('[STODD] city ' + pl.label + ': no template could be placed; check that stodd_core is loaded. The island keeps its natural terrain.') }
      return null
    }
    return { pl: pl, cell: cell, tpl: tpl, steps: stepsFor(pl, cell, tpl, maxSurface(level, cell), LEAN ? minGround(level, cell) : null), idx: 0, level: level, wait: 0 }
  }
  function fromQueue(now) {
    let tries = Math.min(buildQ.length, 12)
    for (let n = 0; n < tries; n++) {
      let q = buildQ.shift()
      let pl = q.pl, c = q.cell
      if (pl.fin || pl.broken || pl.done.has(c.id) || c.tries >= 6) { c.queued = false; continue }
      if (c.hold > now) { buildQ.push(q); continue }
      // a chunk of the block has unloaded again: forget it here, the approach fallback will build it when someone comes back
      if (!chunksLoaded(q.level, c)) { c.queued = false; continue }
      c.queued = false
      let w = startWork(pl, c, q.level)
      if (w != null) { c.queued = true; return w }
    }
    return null
  }
  // the approach fallback: the nearest unbuilt block, among the blocks of the islands a player came close to
  function fromActive(server, now) {
    let players = playersOf(server)
    let cand = [], finished = [], expired = []
    active.forEach((a, key) => {
      let pl = a.pl
      if (pl.fin || pl.broken || a.until < now) { expired.push(key); return }
      let list = pending(pl, now)
      if (list.length === 0) {
        // nothing left to do unless blocks are only waiting (held / queued / being retried): then keep the plan alive
        let waiting = false
        for (let k = 0; k < pl.cells.length; k++) { let c = pl.cells[k]; if (!pl.done.has(c.id) && c.tries < 6) waiting = true }
        if (!waiting) finished.push(pl)
        return
      }
      for (let k = 0; k < list.length; k++) {
        let c = list[k]
        let score = 1e12
        for (let q = 0; q < players.length; q++) {
          let p = players[q]
          let dx = p.x - (c.x + CELL / 2), dz = p.z - (c.z + CELL / 2), d = Math.sqrt(dx * dx + dz * dz)
          if (d < score) score = d
        }
        if (score > 420) continue          // nothing that far can be loaded: no need to ask the chunk map
        if (c.i === 0 && c.j === 0) score -= 1e6
        cand.push({ pl: pl, cell: c, level: a.level, score: score })
      }
    })
    for (let k = 0; k < expired.length; k++) active.delete(expired[k])
    for (let k = 0; k < finished.length; k++) {
      finished[k].fin = true
      saveDone(finished[k])
      active.delete(finished[k].key)
      S.log('city finished: ' + finished[k].label)
    }
    cand.sort((a, b) => a.score - b.score)
    for (let k = 0; k < cand.length; k++) {
      if (!chunksLoaded(cand[k].level, cand[k].cell)) continue
      let w = startWork(cand[k].pl, cand[k].cell, cand[k].level)
      if (w != null) { cand[k].cell.queued = true; return w }
      return null
    }
    return null
  }
  function nextWork(server, now, allowScan) {
    let w = buildQ.length > 0 ? fromQueue(now) : null
    if (w == null && allowScan && active.size > 0) w = fromActive(server, now)
    return w
  }
  function run(server, cmd) {
    try {
      let rc = server.runCommandSilent(cmd)
      return rc === 0 || rc === false ? 0 : 1
    } catch (e) { return 0 }
  }
  function drop(w, now, holdTicks) {
    w.cell.hold = now + holdTicks
  }
  function release(w) { w.cell.queued = false }
  // back into the line (generation mode) or just released (the approach fallback finds it again once its hold is over)
  function requeue(w) {
    if (GEN) { w.cell.queued = true; buildQ.push({ pl: w.pl, cell: w.cell, level: w.level }) }
    else w.cell.queued = false
  }
  // One command of the current block. Returns true when the next one may follow at once, false when this tick is done with it.
  function stepOnce(server, now) {
    let w = work
    if (!w.pl || w.pl.broken) { release(w); work = null; return false }
    if (!chunksLoaded(w.level, w.cell)) { drop(w, now, 100); release(w); work = null; return false }
    let g = w.pl.g
    if (playerInside(server, w.cell, Math.max(FLOOR_MIN, g - FOUND_MAX), Math.max(g + w.tpl.h + 1, w.cell.top || 0))) {
      // someone stands where the block goes. Before the first command: leave it for a few seconds and build the next block meanwhile.
      // In the middle of a block: wait for them (up to ten seconds), then start that block again later.
      w.wait++
      if (w.idx === 0 || w.wait > 200) { drop(w, now, w.idx === 0 ? 100 : 1200); requeue(w); work = null }
      return false
    }
    w.wait = 0
    let st = w.steps[w.idx]
    let rc = run(server, st.cmd)
    if (st.k === 'place' && rc === 0) {
      // chunks were loaded and nobody was inside, so this is the template's fault
      w.pl.fails[w.tpl.id] = (w.pl.fails[w.tpl.id] || 0) + 1
      w.cell.tries++
      console.warn('[STODD] city: /place template stodd:city/' + w.tpl.id + ' failed (' + w.pl.fails[w.tpl.id] + '/' + MAX_FAILS + ')')
      if (w.pl.fails[w.tpl.id] >= MAX_FAILS) w.pl.bad.add(w.tpl.id)
      release(w)
      if (w.cell.tries < 6) requeue(w)
      work = null
      return false
    }
    w.idx++
    if (w.idx >= w.steps.length) {
      w.pl.done.add(w.cell.id)
      release(w)
      if (w.pl.done.size >= w.pl.cells.length) w.pl.fin = true
      saveDone(w.pl)
      S.log('city block ' + w.cell.id + ' (' + w.tpl.id + ' rot ' + w.tpl.rot + ') built on ' + w.pl.label + ' [' + w.pl.done.size + '/' + w.pl.cells.length + ']')
      work = null
      return false
    }
    return true
  }
  function pump(server, now) {
    let t0 = clock()
    let limit = BUDGET > 0 ? 500 : STEPS
    let looked = false
    for (let n = 0; n < limit; n++) {
      if (work == null) {
        if (now < nextLook) return
        work = nextWork(server, now, !looked && FALLBACK)
        looked = true
        if (work == null) { nextLook = buildQ.length > 0 ? now + 5 : now + 20; return }
      }
      let more = stepOnce(server, now)
      if (BUDGET > 0 && clock() - t0 >= BUDGET) return
      if (!more && work != null) return
    }
  }

  // ---------------------------------------------------------------- which islands are being built (approach fallback)
  function scan(p, now) {
    let level = p.level
    if (String(level.dimension).indexOf('minecraft:overworld') < 0) return
    if (p.isSpectator()) return
    let here = S.islandAt(level, Math.floor(p.x), Math.floor(p.z))
    if (here != null && !here.ocean && styleOf(here.theme.id) != null) activate(level, here, now)
    let res = S.islandsNear(level, p.x, p.z, TRIG + 60, 1, false)
    for (let k = 0; k < res.list.length; k++) {
      let it = res.list[k]
      if (it.e.sky || it.d > TRIG) continue
      let info = S.islandInfo(level, it.e)
      if (styleOf(info.theme.id) != null) activate(level, info, now)
    }
  }
  let lastPump = -1
  PlayerEvents.tick(event => {
    let p = event.player
    let now = Number(p.server.getTickCount())
    if (FALLBACK && p.age % SCAN_EVERY === 23) { try { scan(p, now) } catch (e) { S.log('city scan ' + e) } }
    if (now === lastPump) return
    if (BUDGET <= 0 && now % STEP_EVERY !== 0) return
    lastPump = now
    try { if (GEN) drainGen() } catch (e) { S.log('city chunks ' + e) }
    try { pump(p.server, now) } catch (e) { S.log('city pump ' + e); if (work != null) release(work); work = null }
  })
  S.cityQueue = function () { return { chunks: genQ.length, blocks: buildQ.length, active: active.size, working: work != null } }

  // ---------------------------------------------------------------- commands
  function describe(src, level, info) {
    let pl = planFor(level, info)
    if (pl == null) { src.sendSystemMessage(Text.red('City plan unavailable (no noise router).')); return 0 }
    let waiting = 0
    buildQ.forEach(q => { if (q.pl === pl) waiting++ })
    let msg = info.label + ': ' + pl.done.size + ' of ' + pl.cells.length + ' city blocks built, street level y=' + pl.g + (pl.fin ? ' (finished)' : '') + (pl.broken ? ' (templates failed, see the log)' : '') +
      (waiting > 0 ? ', ' + waiting + ' waiting their turn' : '') + (GEN ? '' : ' [generation mode is off]')
    src.sendSystemMessage(Text.gold('[City] ').append(Text.white(msg)))
    return 1
  }
  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    event.register(Commands.literal('stodd')
      .then(Commands.literal('city')
        .executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          let here = S.islandAt(p.level, Math.floor(p.x), Math.floor(p.z))
          if (here == null || here.ocean || styleOf(here.theme.id) == null) { ctx.source.sendSystemMessage(Text.yellow('You are not on a city island.')); return 0 }
          return describe(ctx.source, p.level, here)
        })
        .then(Commands.literal('rebuild').requires(src => src.hasPermission(2)).executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          let here = S.islandAt(p.level, Math.floor(p.x), Math.floor(p.z))
          if (here == null || here.ocean || styleOf(here.theme.id) == null) { ctx.source.sendSystemMessage(Text.yellow('You are not on a city island.')); return 0 }
          let pl = planFor(p.level, here)
          if (pl == null) return 0
          pl.done.clear(); pl.fin = false; pl.broken = false; pl.bad.clear(); pl.fails = {}
          buildQ = buildQ.filter(q => q.pl !== pl)
          if (work != null && work.pl === pl) work = null
          pl.cells.forEach(c => { c.tries = 0; c.hold = 0; c.queued = false })
          saveDone(pl)
          queueAllReady(p.level, pl)
          activate(p.level, here, Number(p.server.getTickCount()))
          ctx.source.sendSystemMessage(Text.gold('[City] ').append(Text.white('Forgot everything built on ' + here.label + '. It will be built again while you are near (this overwrites anything players built there).')))
          return 1
        }))))
  })

})()
