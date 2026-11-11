// priority: 410
// ISLAND MAKEOVERS: five island themes (Ember, Sakura, Overgrown Ruins, Crystal, Skull Cove) and the floating sky islands
// are dressed up the first time a player comes near them, by the same slow command-by-command method as the cities.
//
//   * The island is cut into the same 48 x 48 block grid the cities use (centred on the island's middle, land cells only).
//   * Each cell gets, in this order:
//       1. PAINT     /fill ... replace  (grass -> basalt, leaves -> cherry leaves, ...)      theme.paint
//       2. BIOME     /fillbiome  with the theme's own biome (colours, particles, which mobs spawn)
//       3. LANDMARK  (some cells) clear the footprint, fill any gap under it, /place template stodd:isle/<id>
//     The middle cell gets the theme's big landmark (a volcano, a pagoda, a temple ...) with an open yard in the middle for
//     the island's waystone (45_waystones.js waits for it, like it does for a city plaza).
//   * Sky islands get the sky biome and a scatter of trees / flowers / boulders (with /place feature) plus a few small ruins.
//   * Only chunks that are loaded are touched, nothing is built on a player, and what was done is saved per island
//     (persistent data 'stodd_dress'), so a finished cell is never repeated.
//   * This is NOT world generation: it happens as chunks load around players, nearest first. A base that stands on one of these
//     islands before the makeover reaches it loses blocks that match the paint rules, and is built over where a landmark lands.
//
//   /stodd isle            what island you are on and how far its makeover is
//   /stodd isle rebuild    (operator) forget the makeover of this island so it is done again
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.islandAt || !S.islandsNear || !S.landSampler) { console.error('[STODD] islands not loaded - 52_makeover.js disabled'); return }
  let C = S.cfg
  let MC = C.makeover || {}
  S.centerReady = function () { return true }
  if (!MC.enabled) return
  // STODD Core 3 dresses these islands (and the sky islands) with their chunks (structures stodd:isle_block / stodd:sky_block);
  // this script only answers /stodd isle. makeover.scriptBuilder = true brings the old builder back.
  if (S.apiFlag('worldgenActive') && !MC.scriptBuilder) {
    ServerEvents.commandRegistry(event => {
      let Commands = event.commands
      event.register(Commands.literal('stodd').then(Commands.literal('isle').executes(ctx => {
        let p = ctx.source.getPlayerOrException()
        ctx.source.sendSystemMessage(Text.gold('[Isle] ').append(Text.white(String(S.API.islandReport(p.level, p.x, p.y, p.z)))))
        return 1
      })))
    })
    console.info('[STODD] dressed islands and sky islands are world generation (STODD Core 3); 52_makeover.js only answers /stodd isle')
    return
  }

  let HM = null
  try { HM = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types') } catch (e) { }
  let CompoundTag = S.J.CompoundTag
  let CELL = MC.cell || 48
  let RADIUS = MC.radius || 330
  let THR = C.islandLandThreshold + (MC.landMargin == null ? 0.06 : MC.landMargin)
  let TRIG = MC.triggerRadius || 220
  let STEP_EVERY = Math.max(1, MC.stepEvery || 2)
  let STEPS = Math.max(1, MC.stepsPerTick || 2)
  let SCAN_EVERY = MC.scanEvery || 40
  let SLAB_BLOCKS = 32000                  // /fill and /fillbiome refuse more than 32,768 blocks
  let CUT_CAP = MC.cutCap || 148
  let FLOOR_MIN = -58
  let BIO_BELOW = MC.biomeBelow == null ? 12 : MC.biomeBelow
  let BIO_ABOVE = MC.biomeAbove == null ? 40 : MC.biomeAbove
  let DENSITY = MC.landmarkDensity == null ? 0.15 : MC.landmarkDensity
  let MAX_LM = MC.maxLandmarks || 40
  let FOUND_MAX = MC.foundationMax || 14      // a landmark's foundation never reaches further down than this (a pillar into the sea looks silly)
  let MAX_FAILS = MC.maxTemplateFailures || 3
  let SKY = MC.sky || {}
  let SKY_ON = !!(C.sky && C.sky.enabled) && SKY.biome != null
  let LM = MC.landmarks || {}
  let THEMES = MC.themes || {}
  let IN = 'execute in minecraft:overworld run '
  let ROT = ['none', 'clockwise_90', '180', 'counterclockwise_90']
  let KEEP = ['player', 'item', 'experience_orb', 'item_frame', 'glow_item_frame', 'painting', 'armor_stand', 'marker', 'area_effect_cloud',
    'leash_knot', 'falling_block', 'interaction', 'text_display', 'block_display', 'item_display']
  let NOT_KEEP = KEEP.map(k => 'type=!minecraft:' + k).join(',')

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
  function h2(a, b, salt, seed) { return S.hash3(a * 7919 + 13, b * 104729 - 7, (seed ^ salt) | 0) }

  // ---------------------------------------------------------------- saved progress
  // root['stodd_dress'][islandKey] = { done: ';i,j;i,j', fin }
  function rootTag(level) {
    let pd = level.server.persistentData
    let raw = String(level.getSeed())
    let t = pd.contains('stodd_dress') ? pd.getCompound('stodd_dress') : null
    if (t == null || String(t.getString('seed')) !== raw) {
      t = new CompoundTag()
      t.putString('seed', raw)
      pd.put('stodd_dress', t)
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

  // ---------------------------------------------------------------- what an island is dressed with
  function cfgOf(info) {
    if (info.sky) return SKY_ON ? SKY : null
    return THEMES[info.theme.id] || null
  }

  // ---------------------------------------------------------------- cells
  function buildCells(level, pl) {
    let cells = []
    let sample = pl.kind === 'ground' ? S.landSampler(level) : null
    let probe = pl.kind === 'sky' ? S.skyProbe(level) : null
    if (pl.kind === 'ground' && sample == null) return null
    if (pl.kind === 'sky' && probe == null) return null
    let rad = pl.kind === 'sky' ? pl.rad + 24 : RADIUS
    let N = Math.ceil(rad / CELL) + 1
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      let x = pl.x0 + i * CELL, z = pl.z0 + j * CELL
      let mx = x + CELL / 2, mz = z + CELL / 2
      let dx = mx - pl.cx, dz = mz - pl.cz
      let d = Math.sqrt(dx * dx + dz * dz)
      if (!(i === 0 && j === 0)) {
        if (d > rad) continue
        if (pl.kind === 'ground') {
          let pts = [[mx, mz], [x, z], [x + CELL - 1, z], [x, z + CELL - 1], [x + CELL - 1, z + CELL - 1]]
          let ok = true
          for (let k = 0; k < pts.length; k++) if (sample(pts[k][0], pts[k][1]) < THR) { ok = false; break }
          if (!ok) continue
          let isl = S.islandAt(level, Math.floor(mx), Math.floor(mz))
          if (isl == null || isl.ocean || isl.key !== pl.key) continue
        } else {
          if (!(probe(mx, mz) > 0)) continue
        }
      }
      cells.push({ i: i, j: j, x: x, z: z, d: d, id: i + ',' + j, tries: 0, hold: 0, lm: null })
    }
    return cells
  }

  // Which cells get a landmark: the middle one gets the theme's big landmark, then roughly one cell in nine gets a small one,
  // never two next to each other, chosen by hash so the same island always gets the same layout.
  function lmInfo(id) { return LM[id] || null }
  function placeFootprint(c, lm, rot, centre, pl) {
    let sx = lm.size[0], sz = lm.size[2]
    let fw = (rot & 1) ? sz : sx, fd = (rot & 1) ? sx : sz
    let ox, oz
    if (centre) { ox = 24 - Math.floor((fw - 1) / 2); oz = 24 - Math.floor((fd - 1) / 2) }
    else {
      let room = CELL - fw - 1, roomZ = CELL - fd - 1
      ox = room > 0 ? 1 + (h2(c.i, c.j, 0x1b873593, pl.seed) >>> 3) % room : 0
      oz = roomZ > 0 ? 1 + (h2(c.j, c.i, 0x2f0b3c6d, pl.seed) >>> 5) % roomZ : 0
    }
    return { fx: c.x + ox, fz: c.z + oz, fw: fw, fd: fd }
  }
  // does the whole footprint of a landmark sit on the sky island (not hanging over its rim)?  9 probe points + a margin
  function skyFootprintOk(probe, c, lm, rot, pl) {
    let fp = placeFootprint(c, lm, rot, false, pl)
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let x = fp.fx + Math.floor((fp.fw - 1) * a / 2), z = fp.fz + Math.floor((fp.fd - 1) * b / 2)
      if (!(probe(x, z) > 0)) return false
    }
    // the four corners pushed 3 blocks outwards, so a landmark does not sit right on the rim
    let m = 3
    let ex = [[fp.fx - m, fp.fz - m], [fp.fx + fp.fw - 1 + m, fp.fz - m], [fp.fx - m, fp.fz + fp.fd - 1 + m], [fp.fx + fp.fw - 1 + m, fp.fz + fp.fd - 1 + m]]
    for (let k = 0; k < ex.length; k++) if (!(probe(ex[k][0], ex[k][1]) > 0)) return false
    return true
  }
  // the theme's big middle landmark: one of cfg.center.ids (chosen by hash, so an island always gets the same one), or cfg.center.id
  function centreId(pl) {
    let c = pl.cfg.center
    if (!c) return null
    let ids = (c.ids && c.ids.length > 0 ? c.ids : (c.id ? [c.id] : [])).filter(id => lmInfo(id))
    if (ids.length === 0) return null
    return ids[h2(pl.cx, pl.cz, 0x4c8a1b37, pl.seed) % ids.length]
  }
  function assignLandmarks(pl, probe) {
    let cfg = pl.cfg
    let list = cfg.scatter || []
    let total = 0
    list.forEach(t => { if (lmInfo(t.id)) total += t.weight || 1 })
    let taken = []
    let cid = pl.kind === 'ground' ? centreId(pl) : null
    if (cid != null) {
      for (let k = 0; k < pl.cells.length; k++) if (pl.cells[k].i === 0 && pl.cells[k].j === 0) {
        pl.cells[k].lm = { id: cid, rot: cfg.center.rot == null ? (h2(0, 0, 0x6d2b79f5, pl.seed) >>> 9) & 3 : cfg.center.rot, centre: true }
        taken.push(pl.cells[k])
      }
    }
    if (total <= 0) return
    let want = Math.min(MAX_LM, Math.max(pl.kind === 'sky' ? 1 : 2, Math.round(pl.cells.length * DENSITY * (cfg.density == null ? 1 : cfg.density))))
    let cand = pl.cells.filter(c => !(c.i === 0 && c.j === 0) && Math.max(Math.abs(c.i), Math.abs(c.j)) >= (pl.kind === 'ground' ? 2 : 1))
    cand.sort((a, b) => h2(a.i, a.j, 0x5bd1e995, pl.seed) - h2(b.i, b.j, 0x5bd1e995, pl.seed))
    let got = 0
    for (let n = 0; n < cand.length && got < want; n++) {
      let c = cand[n], clash = false
      for (let t = 0; t < taken.length; t++) if (Math.max(Math.abs(taken[t].i - c.i), Math.abs(taken[t].j - c.j)) <= 1) { clash = true; break }
      if (clash) continue
      let rot = (h2(c.j, c.i, 0x3c6ef372, pl.seed) >>> 11) & 3
      // up to three tries at a landmark that fits (on a sky island the footprint has to be wholly on the island)
      let pick = null
      for (let tr = 0; tr < 3 && pick == null; tr++) {
        let r = (h2(c.i + 5 + tr * 977, c.j - 3 - tr * 613, 0x7a3c91d5, pl.seed) % 100000) / 100000 * total
        let cand2 = null
        for (let k = 0; k < list.length; k++) {
          if (!lmInfo(list[k].id)) continue
          r -= list[k].weight || 1
          cand2 = list[k]
          if (r < 0) break
        }
        if (cand2 == null) break
        if (pl.kind === 'sky' && probe != null && !skyFootprintOk(probe, c, lmInfo(cand2.id), rot, pl)) continue
        pick = cand2
      }
      if (pick == null) continue
      c.lm = { id: pick.id, rot: rot, centre: false }
      taken.push(c); got++
    }
  }

  function planFor(level, info) {
    let seed = seedOf(level)
    if (plansSeed !== seed) { plans.clear(); plansSeed = seed }
    let key = info.key
    let pl = plans.get(key)
    if (pl != null) return pl
    let cfg = cfgOf(info)
    if (cfg == null || HM == null) return null
    let root = rootTag(level)
    let tag = root.contains(key) ? root.getCompound(key) : null
    if (tag == null) {
      tag = new CompoundTag()
      tag.putString('done', '')
      tag.putBoolean('fin', false)
      root.put(key, tag)
    }
    pl = {
      key: key, kind: info.sky ? 'sky' : 'ground', cfg: cfg, label: info.label, seed: seed, cx: info.peakX, cz: info.peakZ, rad: info.rad || 0,
      x0: info.peakX - CELL / 2, z0: info.peakZ - CELL / 2, themeId: info.theme.id,
      tag: tag, done: parseDone(tag.getString('done')), fin: !!tag.getBoolean('fin'), cells: [], bad: new Set(), fails: {}, broken: false
    }
    if (pl.kind === 'sky') {
      let styles = cfg.styles || [{ name: 'meadow', features: [] }]
      pl.style = styles[h2(info.peakX, info.peakZ, 0x1f3d5b79, seed) % styles.length]
    }
    let cells = buildCells(level, pl)
    if (cells == null) return null
    pl.cells = cells
    assignLandmarks(pl, pl.kind === 'sky' ? S.skyProbe(level) : null)
    plans.set(key, pl)
    S.log('makeover plan for ' + pl.label + ': ' + pl.cells.length + ' cells, ' + pl.cells.filter(c => c.lm).length + ' landmarks')
    return pl
  }

  // 45_waystones.js asks this before it places a dressed island's waystone, so the stone stands in the middle landmark's yard
  S.centerReady = function (isl, level) {
    try {
      if (isl == null || isl.sky || !isl.theme || !THEMES[isl.theme.id] || !THEMES[isl.theme.id].center) return true
      let pl = plans.get(isl.key)
      if (pl != null) return pl.broken || pl.done.has('0,0')
      let root = rootTag(level)
      if (!root.contains(isl.key)) return false
      return parseDone(root.getCompound(isl.key).getString('done')).has('0,0')
    } catch (e) { return true }
  }

  // ---------------------------------------------------------------- geometry helpers
  // rotation about the template's own corner -> the corner to hand /place template so the footprint starts at (fx, fz)
  function originFor(fx, fz, sx, sz, rot) {
    if (rot === 1) return [fx + sz - 1, fz]
    if (rot === 2) return [fx + sx - 1, fz + sz - 1]
    if (rot === 3) return [fx, fz + sx - 1]
    return [fx, fz]
  }
  S.makeoverOrigin = originFor
  // /fill and /fillbiome need <= 32,768 blocks: split a box into slabs of whole rows
  function slabCmds(verb, x1, z1, x2, z2, y1, y2, tail) {
    let out = []
    y1 = Math.max(-64, y1); y2 = Math.min(319, y2)
    if (y2 < y1) return out
    let per = Math.max(1, Math.floor(SLAB_BLOCKS / ((x2 - x1 + 1) * (z2 - z1 + 1))))
    for (let y = y1; y <= y2; y += per) out.push(IN + verb + ' ' + x1 + ' ' + y + ' ' + z1 + ' ' + x2 + ' ' + Math.min(y + per - 1, y2) + ' ' + z2 + ' ' + tail)
    return out
  }
  function hgt(level, type, x, z) { return Number(level.getHeight(type, x, z)) }
  function surfaceStats(level, cell, sky) {
    let lo = 1e9, hi = -1e9
    for (let a = 0; a <= CELL - 1; a += 8) for (let b = 0; b <= CELL - 1; b += 8) {
      let h = hgt(level, HM.WORLD_SURFACE, cell.x + a, cell.z + b)
      if (!sky && h > 190) continue
      if (sky && h < 140) continue
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
    if (lo > hi) return null
    return { lo: lo, hi: hi }
  }
  function median(a) { a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)] }

  // ---------------------------------------------------------------- the steps of one cell
  function landmarkSteps(level, pl, cell, steps) {
    let lm = lmInfo(cell.lm.id)
    if (lm == null) return
    let rot = cell.lm.rot & 3
    let fp = placeFootprint(cell, lm, rot, cell.lm.centre, pl)
    let hs = [], hi = -1e9, lo = 1e9
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let x = fp.fx + Math.floor((fp.fw - 1) * a / 2), z = fp.fz + Math.floor((fp.fd - 1) * b / 2)
      let h = hgt(level, HM.MOTION_BLOCKING_NO_LEAVES, x, z)
      hs.push(h)
      let s = hgt(level, HM.WORLD_SURFACE, x, z)
      if (s > hi) hi = s
      if (h < lo) lo = h
    }
    let h = median(hs.slice())
    let foot = lm.foot == null ? 3 : lm.foot
    let y0 = h - foot                              // world y of template row 0
    let top = Math.min(pl.kind === 'sky' ? 300 : CUT_CAP, Math.max(h + lm.size[1] - foot + 1, hi + 1))   // (sky islands are above the usual cut cap)
    let x2 = fp.fx + fp.fw - 1, z2 = fp.fz + fp.fd - 1
    cell.top = top; cell.fp = fp; cell.lo = Math.max(FLOOR_MIN, y0)
    slabCmds('fill', fp.fx, fp.fz, x2, z2, h, top, 'minecraft:air').forEach(c => steps.push({ k: 'cut', guard: true, cmd: c }))
    if (lo < y0 + 1) slabCmds('fill', fp.fx, fp.fz, x2, z2, Math.max(FLOOR_MIN, lo - 2, y0 - FOUND_MAX), y0 - 1, (pl.cfg.foundation || 'minecraft:stone_bricks') + ' replace minecraft:air').forEach(c => steps.push({ k: 'found', guard: true, cmd: c }))
    steps.push({ k: 'tp', guard: true, cmd: IN + 'execute as @e[x=' + fp.fx + ',y=' + y0 + ',z=' + fp.fz + ',dx=' + (fp.fw - 1) + ',dy=' + (top - y0) + ',dz=' + (fp.fd - 1) + ',' + NOT_KEEP + '] run tp @s ' + (fp.fx - 2) + ' ' + (h + 1) + ' ' + (fp.fz + Math.floor(fp.fd / 2)) })
    let at = originFor(fp.fx, fp.fz, lm.size[0], lm.size[2], rot)
    steps.push({ k: 'place', guard: true, tpl: cell.lm.id, cmd: IN + 'place template stodd:isle/' + cell.lm.id + ' ' + at[0] + ' ' + y0 + ' ' + at[1] + ' ' + ROT[rot] })
  }

  function groundSteps(level, pl, cell) {
    let st = surfaceStats(level, cell, false)
    let steps = []
    if (st == null) return steps
    let x2 = cell.x + CELL - 1, z2 = cell.z + CELL - 1
    ;(pl.cfg.paint || []).forEach(rule => {
      slabCmds('fill', cell.x, cell.z, x2, z2, st.lo - 2, st.hi, rule[1] + ' replace ' + rule[0]).forEach(c => steps.push({ k: 'paint', cmd: c }))
    })
    if (pl.cfg.biome) slabCmds('fillbiome', cell.x, cell.z, x2, z2, st.lo - BIO_BELOW, st.hi + BIO_ABOVE, pl.cfg.biome).forEach(c => steps.push({ k: 'biome', cmd: c }))
    if (cell.lm) landmarkSteps(level, pl, cell, steps)
    return steps
  }

  function skySteps(level, pl, cell) {
    let steps = []
    let x2 = cell.x + CELL - 1, z2 = cell.z + CELL - 1
    let probe = S.skyProbe(level)
    if (probe == null) return steps
    slabCmds('fillbiome', cell.x, cell.z, x2, z2, SKY.biomeLow || 146, SKY.biomeHigh || 262, SKY.biome).forEach(c => steps.push({ k: 'biome', cmd: c }))
    if (cell.lm) landmarkSteps(level, pl, cell, steps)
    // trees, flowers, boulders: a few spots per cell, only where the island is solid, never close to the middle (the waystone)
    let feats = (pl.style && pl.style.features) || []
    let total = 0
    feats.forEach(f => { total += f[1] })
    if (total > 0) {
      let n = SKY.perCell == null ? 5 : SKY.perCell
      for (let k = 0; k < n; k++) {
        let hx = h2(cell.i * 31 + k, cell.j, 0x2c1b3c6d, pl.seed), hz = h2(cell.j * 31 + k, cell.i, 0x1b56c4e9, pl.seed)
        let x = cell.x + 2 + hx % (CELL - 4), z = cell.z + 2 + hz % (CELL - 4)
        if (Math.abs(x - pl.cx) < 7 && Math.abs(z - pl.cz) < 7) continue
        if (cell.fp && x >= cell.fp.fx - 2 && x <= cell.fp.fx + cell.fp.fw + 2 && z >= cell.fp.fz - 2 && z <= cell.fp.fz + cell.fp.fd + 2) continue
        if (!(probe(x, z) > 0) || !(probe(x + 3, z) > 0) || !(probe(x - 3, z) > 0) || !(probe(x, z + 3) > 0) || !(probe(x, z - 3) > 0)) continue   // well inside the island, not on its rim
        let y = hgt(level, HM.MOTION_BLOCKING_NO_LEAVES, x, z)
        if (y < (C.sky.minY || 200)) continue
        let r = (h2(x, z, 0x3d4e5f61, pl.seed) % 100000) / 100000 * total, pick = feats[0][0]
        for (let q = 0; q < feats.length; q++) { r -= feats[q][1]; if (r < 0) { pick = feats[q][0]; break } }
        steps.push({ k: 'feature', cmd: IN + 'place feature ' + pick + ' ' + x + ' ' + y + ' ' + z })
      }
    }
    return steps
  }

  // ---------------------------------------------------------------- guards
  function chunksLoaded(level, cell) {
    let c0 = cell.x >> 4, c1 = (cell.x + CELL - 1) >> 4, d0 = cell.z >> 4, d1 = (cell.z + CELL - 1) >> 4
    for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) {
      try { if (!level.hasChunk(a, b)) return false } catch (e) { return false }
    }
    return true
  }
  function playerInside(server, fp, lo, hi) {
    let ps = playersOf(server)
    for (let i = 0; i < ps.length; i++) {
      let p = ps[i]
      try {
        if (String(p.level.dimension).indexOf('minecraft:overworld') < 0) continue
        if (p.x >= fp.fx - 2 && p.x <= fp.fx + fp.fw + 2 && p.z >= fp.fz - 2 && p.z <= fp.fz + fp.fd + 2 && p.y >= lo - 3 && p.y <= hi + 3) return true
      } catch (e) { }
    }
    return false
  }

  // ---------------------------------------------------------------- the work queue
  let active = new Map()   // island key -> { pl, level, until }
  let work = null          // { pl, cell, steps, idx, level, wait }
  let nextLook = 0
  let notified = {}

  function activate(level, info, now) {
    if (info == null || info.theme == null) return
    if (!info.sky && !THEMES[info.theme.id]) return
    if (info.sky && !SKY_ON) return
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
      if (pl.done.has(c.id) || c.tries >= 6 || c.hold > now) continue
      out.push(c)
    }
    return out
  }
  function nextWork(server, now) {
    let players = playersOf(server)
    let best = null, bestScore = 1e18, finished = [], expired = []
    active.forEach((a, key) => {
      let pl = a.pl
      if (pl.fin || pl.broken || a.until < now) { expired.push(key); return }
      let list = pending(pl, now)
      if (list.length === 0) {
        let waiting = false
        for (let k = 0; k < pl.cells.length; k++) { let c = pl.cells[k]; if (!pl.done.has(c.id) && c.tries < 6) waiting = true }
        if (!waiting) finished.push(pl)
        return
      }
      for (let k = 0; k < list.length; k++) {
        let c = list[k]
        if (!chunksLoaded(a.level, c)) continue
        let score = 1e12
        for (let q = 0; q < players.length; q++) {
          let p = players[q]
          let dx = p.x - (c.x + CELL / 2), dz = p.z - (c.z + CELL / 2), d = Math.sqrt(dx * dx + dz * dz)
          if (d < score) score = d
        }
        if (c.i === 0 && c.j === 0) score -= 1e6
        if (score < bestScore) { bestScore = score; best = { pl: pl, cell: c, level: a.level } }
      }
    })
    for (let k = 0; k < expired.length; k++) active.delete(expired[k])
    for (let k = 0; k < finished.length; k++) {
      finished[k].fin = true
      saveDone(finished[k])
      active.delete(finished[k].key)
      S.log('makeover finished: ' + finished[k].label)
    }
    if (best == null) return null
    let steps
    try { steps = best.pl.kind === 'sky' ? skySteps(best.level, best.pl, best.cell) : groundSteps(best.level, best.pl, best.cell) } catch (e) { S.log('makeover steps ' + e); steps = [] }
    if (steps.length === 0) {
      // nothing to do here (no surface found): count it as done so it never blocks the island
      best.pl.done.add(best.cell.id); saveDone(best.pl)
      return null
    }
    return { pl: best.pl, cell: best.cell, steps: steps, idx: 0, level: best.level, wait: 0 }
  }
  function run(server, cmd) {
    try {
      let rc = server.runCommandSilent(cmd)
      return rc === 0 || rc === false ? 0 : 1
    } catch (e) { return 0 }
  }
  function pump(server, now) {
    if (work == null) {
      if (now < nextLook) return
      work = nextWork(server, now)
      if (work == null) { nextLook = now + 10; return }
    }
    let w = work
    for (let n = 0; n < STEPS; n++) {
      if (!w.pl || w.pl.broken) { work = null; return }
      if (!chunksLoaded(w.level, w.cell)) { w.cell.hold = now + 100; work = null; return }
      let st = w.steps[w.idx]
      if (st.guard && w.cell.fp && playerInside(server, w.cell.fp, w.cell.lo == null ? 0 : w.cell.lo, w.cell.top || 0)) {
        w.wait++
        if (w.wait > 200) { w.cell.hold = now + 1200; work = null }
        return
      }
      w.wait = 0
      let rc = run(server, st.cmd)
      if (st.k === 'place' && rc === 0) {
        // chunks were loaded and nobody was inside, so this is the template's fault
        w.pl.fails[st.tpl] = (w.pl.fails[st.tpl] || 0) + 1
        w.cell.tries++
        console.warn('[STODD] makeover: /place template stodd:isle/' + st.tpl + ' failed (' + w.pl.fails[st.tpl] + '/' + MAX_FAILS + ')')
        if (w.pl.fails[st.tpl] >= MAX_FAILS) {
          // drop this template: this cell goes on without a landmark
          w.cell.lm = null
          w.cell.tries = 0
          if (w.cell.i === 0 && w.cell.j === 0 && w.pl.kind === 'ground' && w.pl.cfg.center) {
            w.pl.broken = true
            if (!notified[w.pl.key]) { notified[w.pl.key] = true; console.error('[STODD] makeover ' + w.pl.label + ': the central landmark cannot be placed; check that stodd_core is loaded. The island keeps its natural terrain.') }
          }
        }
        work = null
        return
      }
      w.idx++
      if (w.idx >= w.steps.length) {
        w.pl.done.add(w.cell.id)
        saveDone(w.pl)
        S.log('makeover cell ' + w.cell.id + ' done on ' + w.pl.label + ' [' + w.pl.done.size + '/' + w.pl.cells.length + ']')
        work = null
        return
      }
    }
  }

  // ---------------------------------------------------------------- which islands are being dressed
  function scan(p, now) {
    let level = p.level
    if (String(level.dimension).indexOf('minecraft:overworld') < 0) return
    if (p.isSpectator()) return
    let here = S.islandAt(level, Math.floor(p.x), Math.floor(p.z))
    if (here != null && !here.ocean && THEMES[here.theme.id]) activate(level, here, now)
    let res = S.islandsNear(level, p.x, p.z, TRIG + 340, 1, SKY_ON)
    for (let k = 0; k < res.list.length; k++) {
      let it = res.list[k]
      if (it.e.sky) {
        if (!SKY_ON || it.d > TRIG + 0.6 * (it.e.rad || 100)) continue
        activate(level, S.islandInfo(level, it.e), now)
        continue
      }
      if (it.d > TRIG) continue
      let info = S.islandInfo(level, it.e)
      if (THEMES[info.theme.id]) activate(level, info, now)
    }
  }
  let lastPump = -1
  PlayerEvents.tick(event => {
    let p = event.player
    let now = Number(p.server.getTickCount())
    if (p.age % SCAN_EVERY === 29) { try { scan(p, now) } catch (e) { S.log('makeover scan ' + e) } }
    if (now === lastPump || now % STEP_EVERY !== 0) return
    lastPump = now
    try { pump(p.server, now) } catch (e) { S.log('makeover pump ' + e); work = null }
  })

  // ---------------------------------------------------------------- commands
  S.isleStatus = function (level, info) {
    let pl = planFor(level, info)
    if (pl == null) return null
    return { done: pl.done.size, total: pl.cells.length, fin: pl.fin, broken: pl.broken, landmarks: pl.cells.filter(c => c.lm).length }
  }
  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    event.register(Commands.literal('stodd')
      .then(Commands.literal('isle')
        .executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          let here = S.islandOrSkyAt(p.level, p.x, p.y, p.z)
          if (here == null || here.ocean) { ctx.source.sendSystemMessage(Text.yellow('You are on open sea. Walk onto an island (or up onto a sky island).')); return 0 }
          let dx = here.peakX - p.x, dz = here.peakZ - p.z
          let msg = here.label + '  -  centre ' + here.peakX + ', ' + here.peakZ + ' (' + Math.round(Math.sqrt(dx * dx + dz * dz)) + ' blocks away)'
          ctx.source.sendSystemMessage(Text.gold('[Island] ').append(Text.white(msg)))
          if (S.cityPlazaDone && S.themeKind && S.isCityTheme(here.theme)) ctx.source.sendSystemMessage(Text.gray('City islands: /stodd city shows how much is built.'))
          if (here.sky ? SKY_ON : !!THEMES[here.theme.id]) {
            let st = S.isleStatus(p.level, here)
            if (st != null) ctx.source.sendSystemMessage(Text.gray('Makeover: ' + st.done + ' of ' + st.total + ' cells done, ' + st.landmarks + ' landmarks' + (st.fin ? ' (finished)' : '') + (st.broken ? ' (landmark failed, see the log)' : '')))
          }
          return 1
        })
        .then(Commands.literal('rebuild').requires(src => src.hasPermission(2)).executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          let here = S.islandOrSkyAt(p.level, p.x, p.y, p.z)
          if (here == null || here.ocean || !(here.sky ? SKY_ON : !!THEMES[here.theme.id])) { ctx.source.sendSystemMessage(Text.yellow('This island has no makeover.')); return 0 }
          let pl = planFor(p.level, here)
          if (pl == null) return 0
          pl.done.clear(); pl.fin = false; pl.broken = false; pl.bad.clear(); pl.fails = {}
          pl.cells.forEach(c => { c.tries = 0; c.hold = 0 })
          saveDone(pl)
          activate(p.level, here, Number(p.server.getTickCount()))
          ctx.source.sendSystemMessage(Text.gold('[Island] ').append(Text.white('Forgot the makeover of ' + here.label + '. It is done again while you are near.')))
          return 1
        }))))
  })
})()
