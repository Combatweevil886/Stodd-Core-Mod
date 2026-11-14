// New in 2.0.0: island dressing (52_makeover.js), locate (53_locate.js), Log Pose modes, the Jujutsu starter purge (15_powers.js).
const fs = require('fs'), path = require('path'), vm = require('vm')
const H = require('./harness.js')
const { ok, section, mkWorld, boot, chain } = H
const DIR = process.argv[2]

function groundGrid() {
  const g = [{ x: 300, z: 300, r: 170 }, { x: -450, z: 150, r: 200 }, { x: 150, z: -500, r: 160 }]
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.push({ x: 1100 + i * 650, z: 1100 + j * 650 + (i % 2) * 220, r: 150 + ((i * 7 + j * 3) % 5) * 25 })
  return g
}
function ring(c, r, n) { const out = []; for (let i = 0; i < n; i++) out.push([Math.round(c.x + r * Math.cos(i * 2 * Math.PI / n)), Math.round(c.z + r * Math.sin(i * 2 * Math.PI / n))]); return out }

// ================================================================ island dressing
const PLACE = /place template stodd:isle\/(\w+) (-?\d+) (-?\d+) (-?\d+) (\w+)/
function footprint(S, cmd) {
  const m = PLACE.exec(cmd)
  const lm = S.cfg.makeover.landmarks[m[1]]
  const ox = +m[2], oz = +m[4], rot = m[5]
  const sx = lm.size[0], sz = lm.size[2]
  const pts = []
  ;[0, sx - 1].forEach(lx => [0, sz - 1].forEach(lz => {
    if (rot === 'none') pts.push([ox + lx, oz + lz])
    else if (rot === 'clockwise_90') pts.push([ox - lz, oz + lx])
    else if (rot === '180') pts.push([ox - lx, oz - lz])
    else pts.push([ox + lz, oz - lx])
  }))
  return { id: m[1], y0: +m[3], rot: rot, size: lm.size, x0: Math.min.apply(null, pts.map(q => q[0])), x1: Math.max.apply(null, pts.map(q => q[0])), z0: Math.min.apply(null, pts.map(q => q[1])), z1: Math.max.apply(null, pts.map(q => q[1])) }
}
function guardCmds(W, viol) {
  W.cmdFail = cmd => {
    const f = /(?:fill|fillbiome) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)/.exec(cmd)
    if (f) {
      const v = (Math.abs(+f[4] - +f[1]) + 1) * (Math.abs(+f[5] - +f[2]) + 1) * (Math.abs(+f[6] - +f[3]) + 1)
      if (v > 32768) viol.push('volume ' + v + ' ' + cmd)
      if (Math.min(+f[2], +f[5]) < -64 || Math.max(+f[2], +f[5]) > 319) viol.push('y range ' + cmd)
      for (const cx of [(+f[1]) >> 4, (+f[4]) >> 4]) for (const cz of [(+f[3]) >> 4, (+f[6]) >> 4]) if (!W.loaded(cx, cz)) viol.push('unloaded chunk ' + cmd)
    }
    return false
  }
}
function runMakeover(W, B, path, ticks, y) {
  const tick = B.h.makeover.find(x => x.name === 'tick')
  const p = W.players[0]
  for (const stop of path) {
    p.x = stop[0]; p.z = stop[1]; p.y = stop[2] == null ? (y == null ? 80 : y) : stop[2]
    for (let t = 0; t < ticks; t++) { W.tick++; p.age = W.tick; tick.fn({ player: p }) }
  }
}
const skyNear = (W, g, pad) => W.sky.some(s => Math.hypot(s.x - g.x, s.z - g.z) < s.r + g.r + pad)

section('island dressing: landmark config')
{
  const W = mkWorld({ ground: groundGrid(), sky: [] }), B = boot(W), S = B.S
  const MK = S.cfg.makeover
  ok(MK.enabled && Object.keys(MK.themes).join() === 'ember,sakura,ruins,crystal,skull', 'five dressed themes configured')
  let n = 0
  Object.keys(MK.themes).forEach(t => { n += MK.themes[t].scatter.length + MK.themes[t].center.ids.length })
  ok(n >= 55 - 4 - 1, 'every theme has many landmarks (' + n + ')')
  ok(S.cfg.makeover.landmarks.ember_volcano != null, 'landmark sizes come from 01_content.js')
}

section('island dressing: ground themes')
;['ember', 'sakura', 'ruins', 'crystal', 'skull'].forEach(theme => {
  const W = mkWorld({ ground: groundGrid(), sky: [{ x: -700, z: 300, r: 110 }, { x: 515, z: 517, r: 90 }, { x: 1500, z: 1500, r: 140 }] }), B = boot(W), S = B.S, level = W.level
  const cand = W.ground.map(g => ({ g: g, info: S.islandAt(level, g.x, g.z) })).filter(c => c.info.theme.id === theme && !skyNear(W, c.g, 120)).sort((a, b) => b.g.r - a.g.r)
  if (cand.length === 0) { ok(false, 'the test world has no free ' + theme + ' island'); return }
  const isl = cand[0].info, MK = S.cfg.makeover, TH = MK.themes[theme]
  const viol = []
  guardCmds(W, viol)
  W.player(isl.peakX + 100, 80, isl.peakZ)
  ok(S.centerReady(isl, level) === false, theme + ': the middle landmark is not built before anything happens')
  const path = [[isl.peakX + 100, isl.peakZ]].concat(ring({ x: isl.peakX, z: isl.peakZ }, 110, 12)).concat(ring({ x: isl.peakX, z: isl.peakZ }, 220, 16)).concat(ring({ x: isl.peakX, z: isl.peakZ }, 110, 8))
  runMakeover(W, B, path, 700)
  const places = W.cmds.filter(c => PLACE.test(c))
  const fps = places.map(c => footprint(S, c))
  console.log('  ' + theme + ': ' + isl.label + ' - ' + fps.length + ' landmark placements, ' + new Set(fps.map(f => f.id)).size + ' different, ' + W.cmds.length + ' commands')
  ok(viol.length === 0, theme + ': no command breaks the /fill volume limit, y range or touches an unloaded chunk' + (viol.length ? ': ' + viol[0] : ''))
  ok(fps.length >= 3, theme + ': a good number of landmarks (' + fps.length + ')')
  const allowed = new Set(TH.center.ids.concat(TH.scatter.map(s => s.id)))
  ok(fps.every(f => allowed.has(f.id)), theme + ': only its own landmarks are used')
  ok(fps.length > 0 && TH.center.ids.indexOf(fps[0].id) >= 0, theme + ': the first landmark is one of the centrepieces (' + (fps[0] && fps[0].id) + ')')
  ok(new Set(fps.map(f => f.id)).size >= 4, theme + ': at least four different landmarks (' + new Set(fps.map(f => f.id)).size + ')')
  // the centrepiece stands in the middle of the middle cell
  const x0 = isl.peakX - 24, z0 = isl.peakZ - 24
  if (fps.length) {
    const f = fps[0]
    ok(Math.abs((f.x0 + f.x1) / 2 - isl.peakX) <= 2 && Math.abs((f.z0 + f.z1) / 2 - isl.peakZ) <= 2, theme + ': the centrepiece is centred on the island (' + ((f.x0 + f.x1) / 2) + ',' + ((f.z0 + f.z1) / 2) + ' vs ' + isl.peakX + ',' + isl.peakZ + ')')
  }
  ok(fps.every(f => Math.floor((f.x0 - x0) / 48) === Math.floor((f.x1 - x0) / 48) && Math.floor((f.z0 - z0) / 48) === Math.floor((f.z1 - z0) / 48)), theme + ': every landmark stays inside one 48 x 48 cell')
  let overlap = 0
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
    const a = fps[i], b = fps[j]
    if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1) overlap++
  }
  ok(overlap === 0 || fps.length - new Set(fps.map(f => f.x0 + ',' + f.z0)).size >= overlap, theme + ': landmarks do not overlap each other (' + overlap + ')')
  // every footprint is on land
  const THR = S.cfg.islandLandThreshold
  ok(fps.every(f => [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]].every(q => W.continents(q[0], q[1]) >= THR - 0.02)), theme + ': landmarks stand on land')
  // step order: paint -> biome -> cut -> found -> tp -> place, and the foundation never reaches far below the landmark
  let last = null, lowest = null, bad = 0, deep = 0
  W.cmds.forEach(c => {
    const f = /fill (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (\S+)( replace (\S+))?$/.exec(c)
    if (/fillbiome/.test(c)) return
    if (f && f[9] === 'minecraft:air' && f[7] === TH.foundation) { lowest = lowest == null ? +f[2] : Math.min(lowest, +f[2]) }
    const m = PLACE.exec(c)
    if (m) { if (lowest != null && lowest < +m[3] - (MK.foundationMax || 14)) deep++; lowest = null }
  })
  ok(deep === 0, theme + ': landmark foundations never reach more than ' + MK.foundationMax + ' blocks under the landmark (' + deep + ' too deep)')
  ok(W.cmds.some(c => new RegExp('fillbiome .* ' + TH.biome + '$').test(c)), theme + ': the biome ' + TH.biome + ' is painted')
  ok(W.cmds.some(c => /fill .* replace minecraft:grass_block/.test(c)) || TH.paint.length === 0, theme + ': the ground is repainted')
  ok(S.centerReady(isl, level) === true, theme + ': the middle landmark is done afterwards')
  const st = S.isleStatus(level, isl)
  ok(st != null && st.done > 20, theme + ': the status command sees the work (' + (st && st.done) + ' cells)')
  // reload: nothing is built again
  const n0 = W.cmds.filter(c => PLACE.test(c)).length
  const B2 = boot(W)
  runMakeover(W, B2, ring({ x: isl.peakX, z: isl.peakZ }, 110, 8), 400)
  ok(W.cmds.filter(c => PLACE.test(c)).length === n0, theme + ': after a reload nothing is rebuilt')
  // the waystone goes up after the middle landmark
  const wp = W.player(isl.peakX + 40, 80, isl.peakZ); wp.age = 431
  const wtick = B2.h.waystones.find(x => x.name === 'tick')
  wtick.fn({ player: wp })
  ok(W.cmds.filter(c => /place feature waystones:/.test(c)).length === 1, theme + ': the island waystone is built once the middle landmark stands')
})

section('island dressing: missing / failing templates')
{
  const W = mkWorld({ ground: groundGrid(), sky: [] }), B = boot(W), S = B.S, level = W.level
  const isl = W.ground.map(g => S.islandAt(level, g.x, g.z)).filter(i => i.theme.id === 'ember')[0]
  W.player(isl.peakX + 100, 80, isl.peakZ)
  W.cmdFail = cmd => PLACE.test(cmd)
  runMakeover(W, B, [[isl.peakX + 100, isl.peakZ]].concat(ring({ x: isl.peakX, z: isl.peakZ }, 110, 6)), 500)
  const tried = W.cmds.filter(c => PLACE.test(c))
  const centre = tried.filter(c => S.cfg.makeover.themes.ember.center.ids.some(id => c.indexOf('stodd:isle/' + id + ' ') >= 0))
  ok(centre.length === 3, 'a centrepiece that cannot be placed is tried 3 times (' + centre.length + ')')
  ok(S.centerReady(isl, level) === true, 'and then the waystone is allowed to use ordinary placement')
}
{
  // a player standing where a landmark goes: held back, built once they step away
  const W = mkWorld({ ground: groundGrid(), sky: [] }), B = boot(W), S = B.S, level = W.level
  const isl = W.ground.map(g => S.islandAt(level, g.x, g.z)).filter(i => i.theme.id === 'ember')[0]
  W.player(isl.peakX, 80, isl.peakZ)
  runMakeover(W, B, [[isl.peakX, isl.peakZ, 72]], 900)
  ok(W.cmds.filter(c => PLACE.test(c) && S.cfg.makeover.themes.ember.center.ids.some(id => c.indexOf('stodd:isle/' + id + ' ') >= 0)).length === 0, 'nothing is built on top of a player')
  runMakeover(W, B, [[isl.peakX + 120, isl.peakZ, 72]], 1500)
  ok(W.cmds.filter(c => PLACE.test(c) && S.cfg.makeover.themes.ember.center.ids.some(id => c.indexOf('stodd:isle/' + id + ' ') >= 0)).length === 1, 'the centrepiece goes up once the player steps away')
}

section('island dressing: sky islands')
{
  const SKYI = [{ x: -700, z: 300, r: 110 }, { x: 515, z: 517, r: 90 }, { x: 1500, z: 1500, r: 140 }, { x: 2002, z: -902, r: 60 }]
  // 3.1 keeps a sky island's natural biomes and plants; the old sky-meadow dressing is skyIslands.biome / extraPlants
  const meadow = C => { C.makeover.sky.biome = 'stodd:sky_meadow'; C.makeover.sky.perCell = 5 }
  const W = mkWorld({ ground: groundGrid(), sky: SKYI }), B = boot(W, meadow), S = B.S, level = W.level
  const MK = S.cfg.makeover
  const viol = []
  guardCmds(W, viol)
  const target = SKYI[2]
  W.player(target.x + 60, 240, target.z)
  const sk = S.skyIslandHere(level, target.x, 240, target.z)
  ok(sk != null, 'the test sky island is found')
  const info = S.skyInfo(level, sk)
  const path = [[sk.x + 60, sk.z, 240]].concat(ring({ x: sk.x, z: sk.z }, 50, 8)).concat(ring({ x: sk.x, z: sk.z }, 100, 10))
  runMakeover(W, B, path, 600, 240)
  const places = W.cmds.filter(c => PLACE.test(c))
  const fps = places.map(c => footprint(S, c)).filter(f => Math.hypot((f.x0 + f.x1) / 2 - sk.x, (f.z0 + f.z1) / 2 - sk.z) < sk.rad + 40)
  console.log('  sky island ' + info.label + ' radius ' + sk.rad + ': ' + fps.length + ' landmarks, ' + W.cmds.filter(c => /place feature minecraft:/.test(c)).length + ' trees/flowers')
  ok(viol.length === 0, 'sky: no command breaks the /fill volume limit, y range or touches an unloaded chunk' + (viol.length ? ': ' + viol[0] : ''))
  ok(fps.length >= 1, 'sky: the island gets landmarks (' + fps.length + ')')
  const skyIds = new Set(MK.sky.scatter.map(s => s.id))
  ok(fps.every(f => skyIds.has(f.id)), 'sky: only sky landmarks are used (' + Array.from(new Set(fps.map(f => f.id))).join(',') + ')')
  // the whole footprint (and a 3 block margin) lies on the island
  const inside = (x, z) => Math.hypot(x - target.x, z - target.z) <= target.r
  ok(fps.every(f => [[f.x0 - 3, f.z0 - 3], [f.x1 + 3, f.z0 - 3], [f.x0 - 3, f.z1 + 3], [f.x1 + 3, f.z1 + 3]].every(q => inside(q[0], q[1]))), 'sky: no landmark hangs over the rim')
  ok(W.cmds.some(c => /fillbiome .* stodd:sky_meadow$/.test(c)), 'sky: the sky meadow biome is painted')
  const feats = W.cmds.filter(c => /place feature minecraft:/.test(c))
  ok(feats.length > 5, 'sky: trees, flowers and rocks are scattered (' + feats.length + ')')
  ok(feats.every(c => { const m = /(-?\d+) (-?\d+) (-?\d+)$/.exec(c); return inside(+m[1], +m[3]) && Math.hypot(+m[1] - sk.x, +m[3] - sk.z) >= 6 }), 'sky: features stay on the island and off its middle')
  ok(!W.cmds.some(c => /place feature waystones:/.test(c)), 'sky: dressing places no waystone (45_waystones.js does)')
  // the cut above a sky landmark reaches above the usual cap
  const cuts = W.cmds.filter(c => /fill .* minecraft:air$/.test(c) && !/replace/.test(c))
  ok(cuts.length === 0 || cuts.some(c => { const m = /fill (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)/.exec(c); return +m[2] >= 200 }), 'sky: landmark clearing happens up at the island, not at the usual ground cap')
  // a sky island too small for any landmark just gets biome + features
  const W2 = mkWorld({ ground: groundGrid(), sky: [{ x: 2002, z: -902, r: 56 }] }), B2 = boot(W2, meadow), S2 = B2.S
  W2.player(2002 + 40, 240, -902)
  const sk2 = S2.skyIslandHere(W2.level, 2002, 240, -902)
  ok(sk2 != null, 'small sky island found')
  runMakeover(W2, B2, [[2002 + 40, -902, 240]].concat(ring({ x: 2002, z: -902 }, 40, 6)), 500, 240)
  const f2 = W2.cmds.filter(c => PLACE.test(c)).map(c => footprint(S2, c))
  ok(f2.every(f => [[f.x0 - 3, f.z0 - 3], [f.x1 + 3, f.z1 + 3]].every(q => Math.hypot(q[0] - 2002, q[1] + 902) <= 56)), 'small sky island: landmarks (if any) fit on it')
}

// ================================================================ locate
section('locate')
{
  const SKYI = [{ x: -700, z: 300, r: 110 }, { x: 515, z: 517, r: 90 }, { x: 2002, z: -902, r: 60 }]
  const W = mkWorld({ ground: groundGrid(), sky: SKYI }), B = boot(W), S = B.S, level = W.level
  const msgs = []
  const p = W.player(0, 70, 0, 'Finder'); p.tell = m => msgs.push(m.s)
  const tick = B.h.locate.find(x => x.name === 'tick')
  function search(name, mode) {
    msgs.length = 0
    const rc = S.locateStart(p, name, mode || 'find')
    for (let i = 0; i < 3000 && msgs.filter(m => !/Searching/.test(m)).length === 0 && rc; i++) { W.tick++; p.age = W.tick; tick.fn({ player: p }) }
    return msgs.filter(m => !/Searching/.test(m))
  }
  const T = S.locateTargets
  ;['city', 'modern', 'neocity', 'future', 'tribal', 'primitive', 'ember', 'sakura', 'ruins', 'crystal', 'skull', 'onepiece', 'jujutsu', 'cyberpunk', 'arcane', 'wild', 'island', 'sky'].forEach(k => ok(T[k] != null, 'locate target ' + k + ' exists'))
  const known = W.ground.map(g => S.islandAt(level, g.x, g.z))
  Object.keys(T).filter(k => k !== 'sky').forEach(k => {
    const t = T[k]
    const matches = known.filter(i => t.themes == null || t.themes.indexOf(i.theme.id) >= 0)
    const r = search(k)
    if (matches.length === 0) { ok(r.length === 1 && /No /.test(r[0]), 'locate ' + k + ' with none in range says so'); return }
    const nearest = matches.map(i => ({ i: i, d: Math.hypot(i.peakX, i.peakZ) })).sort((a, b) => a.d - b.d)[0]
    const m = r.length ? /at (-?\d+), (-?\d+)/.exec(r[0]) : null
    ok(m != null && Math.hypot(+m[1] - nearest.i.peakX, +m[2] - nearest.i.peakZ) < 40, 'locate ' + k + ' finds the nearest one (' + (r[0] || 'nothing') + ' vs ' + nearest.i.peakX + ',' + nearest.i.peakZ + ')')
  })
  let r = search('sky')
  const mm = /at (-?\d+), (-?\d+)/.exec(r[0] || '')
  ok(mm != null && SKYI.some(s => Math.hypot(+mm[1] - s.x, +mm[2] - s.z) < 25) && /up in the sky/.test(r[0]), 'locate sky finds a floating island (' + r[0] + ')')
  r = search('city', 'list')
  ok(r.length === 5, 'list shows five results (' + r.length + ')')
  const ds = r.map(x => +/(\d+) blocks/.exec(x)[1])
  ok(ds.every((d, i) => i === 0 || d >= ds[i - 1]), 'and they are sorted by distance (' + ds.join(',') + ')')
  W.cmds.length = 0
  r = search('ember', 'tp')
  ok(W.cmds.some(c => /tp Finder -?\d+ \d+ -?\d+$/.test(c)) && W.cmds.some(c => /slow_falling/.test(c)), 'tp mode teleports with slow falling')
  r = search('nonsense')
  ok(msgs.length === 1 && /Unknown target/.test(msgs[0]), 'an unknown target is explained')
  // registers its commands
  let regs = 0
  B.h.locate.filter(h => h.name === 'commandRegistry').forEach(h => { h.fn({ commands: chain(), register: () => { regs++ } }) })
  ok(regs === 1, 'the locate commands register')
}

// ================================================================ log pose
section('log pose: modes')
{
  const SKYI = [{ x: -700, z: 300, r: 110 }, { x: 515, z: 517, r: 90 }]
  const W = mkWorld({ ground: groundGrid(), sky: SKYI }), B = boot(W), S = B.S, level = W.level
  const nbt = new H.MockCompound(); nbt.putBoolean('stodd_logpose', true)
  const pose = { isEmpty: () => false, id: 'minecraft:compass', getNbt: () => nbt }
  const p = W.player(0, 70, 0, 'Sailor')
  p.getInventory = () => ({ getContainerSize: () => 1, getItem: () => pose })
  p.getMainHandItem = () => pose; p.getOffhandItem = () => ({ isEmpty: () => true, id: 'minecraft:air' }); p.getYRot = () => 0
  const MODES = S.cfg.logPose.modes
  ok(MODES.map(m => m.id).join() === 'next,nearest,city,sky,sunken', 'five modes: next, nearest, city, sky, sunken')
  function target(modeIdx, x, z, y) {
    S.data(p).putInt('lp_mode', modeIdx)
    p.x = x; p.z = z; p.y = y == null ? 70 : y
    for (let i = 0; i < 60; i++) { W.tick += 20; p.age = 11; S.logPoseTick(p) }
    const lp = nbt.getCompound('LodestonePos')
    return { x: lp.getInt('X'), z: lp.getInt('Z') }
  }
  const infos = W.ground.map(g => S.islandAt(level, g.x, g.z))
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
  // standing on open sea between islands (0,0 is sea in the mock), nearest island
  const here = { x: 0, z: 0 }
  const nearestAny = infos.map(i => ({ i: i, d: dist(here, { x: i.peakX, z: i.peakZ }) })).sort((a, b) => a.d - b.d)[0].i
  let t = target(1, 0, 0)
  ok(dist(t, { x: nearestAny.peakX, z: nearestAny.peakZ }) < 40, 'nearest mode points at the closest island (' + t.x + ',' + t.z + ' vs ' + nearestAny.peakX + ',' + nearestAny.peakZ + ')')
  const cities = infos.filter(i => ['city', 'city_future', 'city_primitive'].indexOf(i.theme.id) >= 0)
  const nearestCity = cities.map(i => ({ i: i, d: dist(here, { x: i.peakX, z: i.peakZ }) })).sort((a, b) => a.d - b.d)[0].i
  t = target(2, 0, 0)
  ok(dist(t, { x: nearestCity.peakX, z: nearestCity.peakZ }) < 40, 'city mode points at the closest city island of any style (' + nearestCity.theme.id + ')')
  t = target(3, 0, 0, 70)
  ok(SKYI.some(s => dist(t, s) < 25), 'sky mode points at a sky island even from the ground')
  t = target(0, 0, 0)
  ok(infos.some(i => dist(t, { x: i.peakX, z: i.peakZ }) < 40), 'next mode points at an island')
  // recording: stand in the middle of the island for 3 seconds
  const isl = infos[0]
  S.data(p).putInt('lp_mode', 0)
  p.x = isl.peakX + 5; p.z = isl.peakZ; p.y = 70
  for (let i = 0; i < 8; i++) { W.tick += 20; p.age = 11; S.logPoseTick(p) }
  const seen = S.data(p).getList('lp_seen', 8)
  ok(seen.size() === 1 && seen.getString(0) === isl.key, 'standing at an island\'s middle records it')
  t = target(0, isl.peakX + 5, isl.peakZ)
  ok(dist(t, { x: isl.peakX, z: isl.peakZ }) > 100, 'next island then points somewhere else')
  const cyc = S.logPoseCycle(p, false)
  ok(cyc.id === 'nearest', 'right-click cycles to the next mode (' + cyc.id + ')')
  ok(S.logPoseCycle(p, true).id === 'next', 'shift + right-click goes back')
  S.data(p).putInt('lp_mode', MODES.length - 1)
  ok(S.logPoseCycle(p, false).id === 'next', 'the cycle wraps round')
  // /stodd logpose registers
  let regs = 0
  B.h.logpose.filter(h => h.name === 'commandRegistry').forEach(h => { h.fn({ commands: chain(), register: () => { regs++ } }) })
  ok(regs === 1, 'log pose commands register')
}

// ================================================================ Jujutsu starter purge
section('jujutsu starter purge')
{
  global.stodd = undefined
  vm.runInThisContext(fs.readFileSync(path.join(DIR, '00_config.js'), 'utf8'), { filename: '00_config.js' })
  const S = global.stodd, C = S.cfg
  S.ready = true; S.log = () => { }
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  S.getOrigin = p => p.__origin == null ? null : p.__origin
  S.canUse = (p, sys) => { const r = C.rules[p.__origin]; return r != null && r[sys] === true }
  S.denyText = () => ''
  S.onOriginChanged = function () { }
  // 15_powers.js reads the handlers
  let HANDLERS = []
  const handlersOf = name => HANDLERS.filter(h => h.name === name)
  global.PlayerEvents = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: String(k), fn: fn }) }) })
  global.Text = new Proxy({}, { get: () => (s => { const o = { s: String(s), append(x) { o.s += x.s; return o } }; return o }) })
  vm.runInThisContext(fs.readFileSync(path.join(DIR, '15_powers.js'), 'utf8'), { filename: '15_powers.js' })
  let clock = 1000
  function mk(origin, stacks, tech) {
    const cap = { PlayerCurseTechnique: tech, syncPlayerVariables() { } }
    const msgs = []
    const items = stacks.map(id => ({ id: id, isEmpty: () => false, getHoverName: () => ({ getString: () => '' }) }))
    const p = {
      username: 'Newbie', age: 3, __origin: origin, level: { getGameTime: () => clock }, server: { scheduleInTicks: (n, fn) => fn() }, isCreative: () => false,
      getInventory: () => ({ getContainerSize: () => items.length, getItem: i => items[i] || { isEmpty: () => true, id: 'minecraft:air' }, removeItemNoUpdate: i => { items[i] = null } }),
      getCapability: () => ({ resolve: () => ({ isPresent: () => true, get: () => cap }) }),
      tell: m => msgs.push(m.s), setStatusMessage: () => { }
    }
    // null the removed slots as "empty"
    const inv = p.getInventory
    p.getInventory = () => { const i = inv(); const gi = i.getItem; i.getItem = k => (items[k] == null ? { isEmpty: () => true, id: 'minecraft:air' } : items[k]); return i }
    p.left = () => items.filter(x => x != null).map(x => x.id)
    p.cap = cap; p.msgs = msgs
    return p
  }
  const STARTER = ['jujutsucraft:cursed_technique_book', 'jujutsucraft:skill_selection_book', 'jujutsucraft:sukuna_finger', 'jujutsucraft:cursed_tool_blade', 'jujutsucraft:black_flash_charm']
  const KEEP = ['jujutsucraft:cursed_ore', 'jujutsucraft:cursed_ingot', 'minecraft:bread']
  {
    // a Devil Fruit User keeps the Jujutsu resources (cursed fingers, cursed tools, charms) but not the technique items
    const p = mk('devil_fruit_user', STARTER.concat(KEEP), 7)
    S.onOriginChanged(p, 'devil_fruit_user', '')
    for (let a = 3; a < 200; a += 20) { p.age = a; handlersOf('tick').forEach(h => h.fn({ player: p })) }
    const left = p.left()
    ok(left.indexOf('jujutsucraft:cursed_technique_book') < 0 && left.indexOf('jujutsucraft:skill_selection_book') < 0, 'devil_fruit_user: the technique items are taken back (' + left.join(',') + ')')
    ok(['jujutsucraft:sukuna_finger', 'jujutsucraft:cursed_tool_blade', 'jujutsucraft:black_flash_charm'].every(id => left.indexOf(id) >= 0), 'devil_fruit_user: keeps the cursed finger and the other Jujutsu resources')
    ok(KEEP.every(id => left.indexOf(id) >= 0), 'devil_fruit_user: materials and vanilla items stay')
    ok(p.cap.PlayerCurseTechnique === 0, 'devil_fruit_user: the random cursed technique is reset')
    ok(p.msgs.filter(m => /may keep and trade Jujutsu resources/.test(m)).length === 1, 'devil_fruit_user: told what they may keep')
    const finger = { id: 'jujutsucraft:sukuna_finger', isEmpty: () => false, getHoverName: () => ({ getString: () => 'Sukuna Finger' }) }
    ok(S.isSorceryStack(finger) && S.isSorceryResource(finger), 'a cursed finger is a Cursed Energy resource')
    ok(S.canUse(p, 'sorcery') === false, 'devil_fruit_user: may hold a finger but not use (eat) it: no Cursed Energy')
    // well after the starter window the finger is still kept, a technique book still goes
    clock += 100000
    const book = { id: 'jujutsucraft:cursed_technique_book', isEmpty: () => false, getHoverName: () => ({ getString: () => '' }) }
    const q = mk('devil_fruit_user', [], 0)
    const items2 = [finger, book]
    q.getInventory = () => ({ getContainerSize: () => items2.length, getItem: i => items2[i] || { isEmpty: () => true, id: 'minecraft:air' }, removeItemNoUpdate: i => { const x = items2[i]; items2[i] = null; return x } })
    S.stripSorceryItems(q)
    ok(items2[0] === finger && items2[1] == null, 'devil_fruit_user later on: the finger stays, the technique book goes')
    // Jujutsu armor in an armor slot goes back into the inventory
    const armor = { id: 'jujutsucraft:jujutsu_high_uniform_chestplate', isEmpty: () => false, getHoverName: () => ({ getString: () => '' }) }
    const slots = []; for (let i = 0; i < 41; i++) slots.push(null)
    slots[38] = armor
    const added = []
    const r = mk('devil_fruit_user', [], 0)
    r.getInventory = () => ({ getContainerSize: () => 41, getItem: i => slots[i] || { isEmpty: () => true, id: 'minecraft:air' },
      removeItemNoUpdate: i => { const x = slots[i]; slots[i] = null; return x }, add: st => { added.push(st); return true } })
    ok(S.mustNotWearJjkArmor(r) && S.takeOffJjkArmor(r) === 1 && slots[38] == null && added[0] === armor, 'devil_fruit_user: Jujutsu armor comes off into the inventory')
    const sor = mk('sorcerer', [], 0)
    ok(!S.mustNotWearJjkArmor(sor) && !S.mayHoldJjkResources(mk('human', [], 0)), 'a sorcerer may wear it; a human still may not keep the resources')
  }
  {
    // the Cyberware User's Kiroshi Optics go straight in through Edgerunner's cyberware data (no items)
    let stored = JSON.stringify({ current_load: 5, installed_body_slots: { legs: 'project_edgerunner:fortified_ankles' } })
    const bridge = {
      hasInstalledItem: (pl, id) => { const d = JSON.parse(stored); return Object.values(d.installed_body_slots || {}).indexOf(id) >= 0 },
      toCyberwareJson: () => stored, replaceCyberwareJson: (pl, j) => { stored = j; return true }
    }
    const orig = global.Java.loadClass
    global.Java.loadClass = n => n === 'com.edgerunner.cyberware.CyberwareScriptBridge' ? bridge : orig(n)
    global.getCyberwareInstallComponentConfig = id => id === 'project_edgerunner:basic_kiroshi_optics'
      ? { item: id, body_slot: 'face', legacy_slot_key: 'face', activation_mode: 'passive', load_cost: 8, palladium_power: id } : null
    global.resolveCyberwarePhysicalSlotForBodySlot = slot => slot === 'face' ? 4 : -1
    S.run = () => true
    vm.runInThisContext(fs.readFileSync(path.join(DIR, '12_chrome.js'), 'utf8'), { filename: '12_chrome.js' })
    const q = mk('cyberware_user', [], 0)
    ok(S.installImplant(q, 'project_edgerunner:basic_kiroshi_optics') === 'installed', 'the Kiroshi Optics are installed')
    const d = JSON.parse(stored)
    ok(d.installed_body_slots.face === 'project_edgerunner:basic_kiroshi_optics' && d.installed_physical.slot_4 === 'project_edgerunner:basic_kiroshi_optics'
      && d.installed_components.face === 'project_edgerunner:basic_kiroshi_optics', '...in the face slot, its physical slot and the old component key')
    ok(d.current_load === 13 && d.installed_body_slots.legs === 'project_edgerunner:fortified_ankles', '...their load added, the other chrome left alone')
    ok(S.installImplant(q, 'project_edgerunner:basic_kiroshi_optics') === 'had', 'never twice')
    ok(S.installImplant(q, 'project_edgerunner:unknown') === null, 'an implant Edgerunner does not know: not installed (the item is given instead)')
    ok(S.cfg.cyberStarterImplants.join() === 'project_edgerunner:basic_kiroshi_optics' && S.cfg.cyberStarterKit.indexOf('project_edgerunner:ripperdoc') < 0, 'no Ripperdoc handed out any more')
    global.Java.loadClass = orig
    delete global.getCyberwareInstallComponentConfig; delete global.resolveCyberwarePhysicalSlotForBodySlot
  }
  ;['human', 'weakling', 'swordsman', 'cyberware_user', 'marksman', 'skyborn', 'dark_magician'].forEach(o => {
    const p = mk(o, STARTER.concat(KEEP), 7)
    S.onOriginChanged(p, o, '')
    for (let a = 3; a < 200; a += 20) { p.age = a; handlersOf('tick').forEach(h => h.fn({ player: p })) }
    ok(p.left().every(id => KEEP.indexOf(id) >= 0), o + ': every Jujutsu starter item is taken back (' + p.left().join(',') + ')')
    ok(KEEP.every(id => p.left().indexOf(id) >= 0), o + ': materials and vanilla items stay')
    ok(p.cap.PlayerCurseTechnique === 0, o + ': the random cursed technique is reset')
    ok(p.msgs.filter(m => /Jujutsu/.test(m)).length === 1, o + ': told once')
  })
  ;['sorcerer', 'brawler'].forEach(o => {
    const p = mk(o, STARTER.concat(KEEP), 7)
    S.onOriginChanged(p, o, '')
    for (let a = 3; a < 200; a += 20) { p.age = a; handlersOf('tick').forEach(h => h.fn({ player: p })) }
    ok(C.rules[o].sorcery !== false && p.left().length === STARTER.length + KEEP.length, o + ': keeps the starter kit (' + p.left().length + ' items)')
    ok(p.cap.PlayerCurseTechnique === 7, o + ': keeps the technique')
  })
  {
    // before any origin is chosen nothing is touched (the origin screen has not been answered yet)
    const p = mk(null, STARTER, 7)
    for (let a = 3; a < 100; a += 20) { p.age = a; handlersOf('tick').forEach(h => h.fn({ player: p })) }
    ok(p.left().length === STARTER.length, 'before an origin is chosen the items are left alone')
    // a late handout inside the window is also taken
    p.__origin = 'human'
    S.onOriginChanged(p, 'human', '')
    for (let a = 3; a < 100; a += 20) { p.age = a; handlersOf('tick').forEach(h => h.fn({ player: p })) }
    ok(p.left().length === 0, 'once the origin is chosen everything goes')
    // an item arriving 2 minutes later, inside the window
    const extra = { id: 'jujutsucraft:cursed_technique_book', isEmpty: () => false, getHoverName: () => ({ getString: () => '' }) }
    clock += 2400
    const inv = p.getInventory()
    // simulate a handout into slot 0 by a fresh player-like stack list
    const q = mk('human', ['jujutsucraft:skill_selection_book'], 0)
    q.__d = p.__d
    q.age = 3; handlersOf('tick').forEach(h => h.fn({ player: q }))
    ok(q.left().length === 0, 'a late handout inside the 5 minute window is taken too')
    // ...and long after the window, only the permanent sorcery-book rule applies (books go, plain items stay)
    clock += 20000
    const r = mk('human', ['jujutsucraft:cursed_tool_blade'], 0)
    r.__d = p.__d
    r.age = 3; handlersOf('tick').forEach(h => h.fn({ player: r }))
    ok(r.left().length === 1, 'long after the window an item you earned in play is not taken')
  }
}
