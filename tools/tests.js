const H = require('./harness.js')
const { ok, section, mkWorld, boot, chain } = H

function groundGrid() {
  const g = [{ x: 300, z: 300, r: 170 }, { x: -450, z: 150, r: 200 }, { x: 150, z: -500, r: 160 }]
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.push({ x: 1100 + i * 650, z: 1100 + j * 650 + (i % 2) * 220, r: 150 + ((i * 7 + j * 3) % 5) * 25 })
  return g
}
const SKY = [{ x: -700, z: 300, r: 110 }, { x: 515, z: 517, r: 90 }, { x: 2000, z: -900, r: 60 }, { x: 300, z: -300, r: 25 }, { x: 1500, z: 1500, r: 140 }]

// ================================================================ 1. themes
section('island themes')
let W = mkWorld({ ground: groundGrid(), sky: SKY })
let B = boot(W)
let S = B.S, level = W.level
const counts = {}, cityIsl = []
W.ground.forEach(g => {
  const info = S.islandAt(level, g.x, g.z)
  ok(info != null && !info.ocean, 'island at ' + g.x + ',' + g.z + ' is land')
  const t = info.theme.id
  counts[t] = (counts[t] || 0) + 1
  if (t === 'city') cityIsl.push({ g: g, info: info })
  const again = S.islandAt(level, g.x + 5, g.z - 5)
  ok(again.key === info.key && again.theme.id === t, 'stable theme/key across the island')
})
console.log('  themes over ' + W.ground.length + ' islands:', JSON.stringify(counts))
ok((counts.city || 0) >= 3 && (counts.city || 0) <= 17, 'about one island in eight is a city (' + (counts.city || 0) + ')')
;['one_piece', 'jujutsu', 'cyberpunk', 'arcane', 'wild'].forEach(t => ok((counts[t] || 0) > 0, 'theme ' + t + ' still appears'))
cityIsl.forEach(c => ok(Math.hypot(c.info.peakX, c.info.peakZ) >= 900, 'city island ' + c.info.label + ' is at least 900 blocks from 0,0'))
ok(S.islandAt(level, 300, 300).theme.id !== 'city' && S.islandAt(level, -450, 150).theme.id !== 'city' && S.islandAt(level, 150, -500).theme.id !== 'city', 'islands near the origin are never cities')
ok(S.cfg.islandThemes.filter(t => !t.chance).reduce((a, t) => a + t.weight, 0) === 92, 'the ordinary theme weights are unchanged (92); the special themes are rolled separately')
{
  const sp = S.cfg.islandThemes.filter(t => t.chance)
  ok(sp.length === 8 && sp.map(t => t.id).join() === 'city,city_future,city_primitive,ember,sakura,ruins,crystal,skull', 'eight special themes in a stable order (' + sp.map(t => t.id).join() + ')')
  ok(sp.reduce((a, t) => a + t.chance, 0) < 0.5, 'special themes together take under half the islands')
  ok(sp[0].chance === 0.125, 'the modern city keeps the 1.3.0 chance (0.125), so its band never moves')
  ;['ember', 'sakura', 'ruins', 'crystal', 'skull'].forEach(t => ok((counts[t] || 0) > 0, 'dressed theme ' + t + ' appears'))
  ok((counts.city_future || 0) > 0 && (counts.city_primitive || 0) > 0, 'Neo City and tribal city islands appear')
}

// city hosts Night City mobs
if (cityIsl.length) {
  const c = cityIsl[0].info
  ok(S.allowedAt(level, c.peakX, c.peakZ, 'project_edgerunner', 70), 'city island hosts Night City mobs')
  ok(!S.allowedAt(level, c.peakX, c.peakZ, 'malum', 70), 'city island does not host Malum mobs')
  ok(!S.allowedAt(level, c.peakX, c.peakZ, 'ompworld', 70), 'city island does not host One Piece mobs')
  ok(S.allowedAt(level, c.peakX, c.peakZ, 'minecraft', 70), 'vanilla mobs unaffected')
}
// disabled -> no cities
{
  const W2 = mkWorld({ ground: groundGrid(), sky: [] }), B2 = boot(W2, c => { c.city.enabled = false })
  let n = 0
  W2.ground.forEach(g => { if (B2.S.islandAt(W2.level, g.x, g.z).theme.id === 'city') n++ })
  ok(n === 0, 'city.enabled=false rolls no city islands')
}

// islands registered before the update (an existing world) never become cities
{
  const WA = mkWorld({ ground: groundGrid(), sky: [] }), BA = boot(WA)
  const before = WA.ground.map(g => BA.S.islandAt(WA.level, g.x, g.z))
  const WB = mkWorld({ ground: groundGrid(), sky: [] })
  const seedTag = new H.MockCompound(); seedTag.putString('seed', '987654321')
  const lst = seedTag.getList('list')
  before.forEach(i => lst.add({ s: i.peakX + ',' + i.peakZ }))
  WB.server.persistentData.put('stodd_isles', seedTag)
  const BB = boot(WB)
  const after = WB.ground.map(g => BB.S.islandAt(WB.level, g.x, g.z))
  ok(after.every(i => i.theme.id !== 'city'), 'islands registered before 1.3.0 are never turned into cities (' + after.filter(i => i.theme.id === 'city').length + ' cities)')
  const SPECIAL_IDS = new Set(BA.S.cfg.islandThemes.filter(t => t.chance).map(t => t.id))
  const same = after.filter((a, i) => !SPECIAL_IDS.has(before[i].theme.id) && a.theme.id === before[i].theme.id).length
  ok(same === before.filter(b => !SPECIAL_IDS.has(b.theme.id)).length, 'and their ordinary themes do not change')
  ok(after.every(i => !SPECIAL_IDS.has(i.theme.id)), 'no old island picks up a Neo City / tribal / dressed theme either')
  ok(seedTag.getInt('legacy') === before.length, 'the number of old islands is remembered (' + seedTag.getInt('legacy') + ')')
}

// ================================================================ 2. sky islands
section('sky islands')
W = mkWorld({ ground: groundGrid(), sky: SKY })
B = boot(W); S = B.S; level = W.level
let res = S.islandsNear(level, 0, 0, 3600, 9999, true)
let found = res.list.filter(it => it.e.sky)
console.log('  found sky islands:', found.map(f => f.e.x + ',' + f.e.z + ' r' + f.e.rad).join(' | '))
ok(res.complete, 'scan complete')
ok(found.length === 4, 'four sky islands found, the 25-block rock ignored (' + found.length + ')')
SKY.filter(s => s.r >= 40).forEach(s => {
  const f = found.filter(it => Math.hypot(it.e.x - s.x, it.e.z - s.z) <= 16)
  ok(f.length === 1, 'sky island ' + s.x + ',' + s.z + ' found exactly once')
  if (f.length) ok(f[0].e.rad >= s.r - 14 && f[0].e.rad <= s.r + 4, 'radius ' + f[0].e.rad + ' close to ' + s.r)
})
ok(S.skyIslandHere(level, 515, 235, 517) != null && S.skyIslandHere(level, 515, 235, 517).sky === true, 'standing on the island that straddles a map-cell border finds it')
ok(S.skyIslandHere(level, 515, 100, 517) == null, 'below minY there is no sky island')
ok(S.skyIslandHere(level, 0, 235, 0) == null, 'nothing over open ground')
ok(S.islandOrSkyAt(level, 515, 235, 517).sky === true && S.islandOrSkyAt(level, 515, 235, 517).label.indexOf('(Sky)') > 0, 'islandOrSkyAt names it as a sky island')
ok(S.allowedAt(level, 515, 517, 'malum', 235) === false, 'themed mobs never spawn on sky islands')
ok(S.allowedAt(level, 515, 517, 'minecraft', 235) === true, 'vanilla mobs may')
// persistence: reload the scripts with the same world save
{
  const saved = W.server.persistentData.getCompound('stodd_isles')
  ok(saved.getList('sky').size() === 4, 'sky registry saved (' + saved.getList('sky').size() + ')')
  const B3 = boot(W); const S3 = B3.S
  const r3 = S3.islandsNear(W.level, 0, 0, 3600, 9999, true)
  ok(r3.list.filter(it => it.e.sky).length === 4, 'same four after a reload, no duplicates')
  S = S3
}
// ground scan without sky does not return sky entries
ok(S.islandsNear(level, 1000, 1000, 800, 50, false).list.every(it => !it.e.sky), 'sky entries only when asked for')

// ================================================================ 3. waystones
section('waystones')
{
  W = mkWorld({ ground: groundGrid(), sky: SKY.concat([{ x: 1100, z: 1100, r: 120 }]) })
  B = boot(W); S = B.S; level = W.level
  const p = W.player(0, 80, 0)
  // ground island whose centre has a sky island right above it
  const isl = S.islandAt(level, 1100, 1100)
  const at = S.placeCenterWaystone(level, W.server, isl, p)
  ok(at != null && at[1] < 120, 'ground waystone is on the ground even with a sky island overhead (y=' + (at && at[1]) + ')')
  ok(S.waystoneNear(W.server, isl.peakX, isl.peakZ, 24, false) != null && S.waystoneNear(W.server, isl.peakX, isl.peakZ, 24, true) == null, 'ground and sky waystones are told apart')
  // the sky island above it
  const sk = S.skyIslandHere(level, 1100, 235, 1100)
  ok(sk != null, 'sky island found over the same spot')
  const skInfo = S.skyInfo(level, sk)
  const at2 = S.placeCenterWaystone(level, W.server, skInfo, p)
  ok(at2 != null && at2[1] >= 200 && Math.hypot(at2[0] - sk.x, at2[2] - sk.z) <= sk.rad, 'sky waystone is on the sky island (y=' + (at2 && at2[1]) + ')')
  // never off the edge: a tiny island with a big search ring
  W.sky.push({ x: -3000, z: -3000, r: 60 })
  const sk2 = S.skyIslandHere(level, -3000, 235, -3000)
  ok(sk2 != null, 'small sky island found on demand')
  W.overrides.clear()
  const at3 = S.placeCenterWaystone(level, W.server, S.skyInfo(level, sk2), p)
  ok(at3 != null && at3[1] >= 200 && Math.hypot(at3[0] + 3000, at3[2] + 3000) <= 60, 'small sky island waystone stays on it')
  // the per-player tick places it once
  W.overrides.clear(); WAYSTONES_RESET()
  const pl = W.player(515, 233, 517, 'Flyer'); pl.age = 431
  const tick = B.h.waystones.find(x => x.name === 'tick')
  const before = W.cmds.filter(c => /place feature/.test(c)).length
  tick.fn({ player: pl }); pl.age += 100; tick.fn({ player: pl })
  const placed = W.cmds.filter(c => /place feature/.test(c)).length - before
  ok(placed === 1, 'standing on a sky island builds its waystone exactly once (' + placed + ')')
}
function WAYSTONES_RESET() { /* the mock registry is rebuilt per boot */ }

// ================================================================ 4. log pose
section('log pose')
{
  W = mkWorld({ ground: groundGrid(), sky: SKY })
  B = boot(W); S = B.S; level = W.level
  const g = S.nextIsland(level, 300, 300, {}, null, false)
  ok(g && g.e && !g.e.sky, 'ground pose targets a ground island')
  const s = S.nextIsland(level, 515, 517, { 'sky:515,517': true }, null, true)
  ok(s && s.e && s.e.sky, 'sky pose targets a sky island (' + (s && s.e && s.e.key) + ')')
  // full tick: a pose in the inventory
  const nbt = new H.MockCompound(); nbt.putBoolean('stodd_logpose', true)
  const pose = { isEmpty: () => false, id: 'minecraft:compass', getNbt: () => nbt }
  const p = W.player(515, 235, 517, 'Pilot')
  p.getInventory = () => ({ getContainerSize: () => 1, getItem: () => pose })
  p.getMainHandItem = () => pose; p.getOffhandItem = () => ({ isEmpty: () => true, id: 'minecraft:air' }); p.getYRot = () => 0
  p.age = 11
  for (let i = 0; i < 40; i++) S.logPoseTick(p)
  const lp = nbt.getCompound('LodestonePos')
  const dTo = (x, z) => Math.hypot(lp.getInt('X') - x, lp.getInt('Z') - z)
  ok(nbt.contains('LodestonePos') && SKY.filter(q => q.r >= 40).some(q => dTo(q.x, q.z) < 20), 'in the air the needle points at a sky island')
  ok(dTo(515, 517) > 100, 'not at the sky island it is standing on')
  p.y = 70; p.x = 300; p.z = 300
  for (let i = 0; i < 40; i++) S.logPoseTick(p)
  const lp2 = nbt.getCompound('LodestonePos')
  ok(W.ground.some(q => Math.hypot(lp2.getInt('X') - q.x, lp2.getInt('Z') - q.z) < 25), 'back on the ground it points at a ground island')
}

// ================================================================ 5. city
section('city')
const CELL = 48
function rect(cmd) {
  const m = /place template stodd:city\/(\w+) (-?\d+) (-?\d+) (-?\d+) (\w+)/.exec(cmd)
  const x = +m[2], z = +m[4], rot = m[5]
  const pts = []
  ;[0, 47].forEach(lx => [0, 47].forEach(lz => {
    if (rot === 'none') pts.push([x + lx, z + lz])
    else if (rot === 'clockwise_90') pts.push([x - lz, z + lx])
    else if (rot === '180') pts.push([x - lx, z - lz])
    else pts.push([x + lz, z - lx])
  }))
  return { id: m[1], y: +m[3], rot: rot, x0: Math.min.apply(null, pts.map(q => q[0])), x1: Math.max.apply(null, pts.map(q => q[0])), z0: Math.min.apply(null, pts.map(q => q[1])), z1: Math.max.apply(null, pts.map(q => q[1])) }
}
function runCity(W, B, isl, path, ticksPerStop) {
  const tick = B.h.city.find(x => x.name === 'tick')
  const p = W.players[0]
  for (const stop of path) {
    p.x = stop[0]; p.z = stop[1]; p.y = stop[2] == null ? 90 : stop[2]
    for (let t = 0; t < ticksPerStop; t++) { W.tick++; p.age = W.tick; tick.fn({ player: p }) }
  }
}
function ring(c, r, n) { const out = []; for (let i = 0; i < n; i++) out.push([Math.round(c.x + r * Math.cos(i * 2 * Math.PI / n)), Math.round(c.z + r * Math.sin(i * 2 * Math.PI / n))]); return out }
function cityRun(themeId) {
  section('city: ' + themeId)
  const grid = groundGrid()
  W = mkWorld({ ground: grid, sky: [{ x: 2300, z: 2300, r: 90 }] })
  B = boot(W); S = B.S; level = W.level
  const cand = W.ground.map(g => ({ g: g, info: S.islandAt(level, g.x, g.z) })).filter(c => c.info.theme.id === themeId)
  ok(cand.length > 0, 'the test world has a ' + themeId + ' island')
  const ST = S.cfg.city.styles[themeId], PL = ST.plazas
  const WSTY = { city: 'deepslate_waystone', city_future: 'waystone', city_primitive: 'sandy_waystone' }
  const c = cand.sort((a, b) => b.g.r - a.g.r)[0]
  const isl = c.info
  console.log('  using ' + isl.label + ' radius ' + c.g.r + ' centre ' + isl.peakX + ',' + isl.peakZ)
  const viol = []
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
  const p = W.player(isl.peakX + 130, 90, isl.peakZ)
  ok(S.cityPlazaDone(isl, level) === false, 'plaza not done before anything is built')
  // walk around the island so every part is in range
  const path = [[isl.peakX + 130, isl.peakZ]].concat(ring({ x: isl.peakX, z: isl.peakZ }, 110, 12)).concat(ring({ x: isl.peakX, z: isl.peakZ }, 230, 16)).concat(ring({ x: isl.peakX, z: isl.peakZ }, 110, 12))
  runCity(W, B, isl, path, 700)
  const places = W.cmds.filter(x => /place template stodd:city/.test(x))
  const rects = places.map(rect)
  console.log('  placed ' + places.length + ' city blocks, ' + W.cmds.length + ' commands')
  ok(viol.length === 0, 'no command breaks the /fill volume limit, y range or touches an unloaded chunk' + (viol.length ? ': ' + viol[0] : ''))
  ok(places.length > 10, 'a city block count that fills an island (' + places.length + ')')
  const x0 = isl.peakX - 24, z0 = isl.peakZ - 24
  ok(rects.every(r => r.x1 - r.x0 === 47 && r.z1 - r.z0 === 47 && (r.x0 - x0) % CELL === 0 && (r.z0 - z0) % CELL === 0), 'every rotation fills exactly one grid cell')
  {
    // a block that was interrupted (its chunks unloaded) is simply redone: it must get the same template and rotation again
    const by = {}
    rects.forEach(r => { (by[r.x0 + ',' + r.z0] = by[r.x0 + ',' + r.z0] || []).push(r.id + '/' + r.rot) })
    ok(Object.keys(by).every(k => new Set(by[k]).size === 1), 'a block that is redone gets the same template and rotation')
    ok(Object.keys(by).length >= rects.length - 6, 'few blocks are redone (' + (rects.length - Object.keys(by).length) + ')')
  }
  ok(rects.length && PL.indexOf(rects[0].id) >= 0 && rects[0].x0 === x0 && rects[0].z0 === z0 && rects[0].rot === 'none', 'the plaza is built first, centred on the island centre')
  ok(rects.every(r => r.y >= 66 && r.y <= 78), 'street level held in 66..78 (' + Array.from(new Set(rects.map(r => r.y))).join(',') + ')')
  ok(new Set(rects.map(r => r.y)).size === 1, 'one street level for the whole island')
  const THR = S.cfg.islandLandThreshold + S.cfg.city.landMargin
  ok(rects.every(r => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].every(q => W.continents(q[0], q[1]) >= THR) || PL.indexOf(r.id) >= 0), 'every block has land under all four corners')
  ok(rects.every(r => Math.hypot(r.x0 + 24 - isl.peakX, r.z0 + 24 - isl.peakZ) <= S.cfg.city.radius + 1), 'no block beyond the configured radius')
  // step order inside each block
  const order = { cut: 0, found: 1, tp: 2, place: 3, biome: 4 }
  const byCell = {}
  W.cmds.forEach(cmd => {
    let k = null, m
    if ((m = new RegExp('fill (-?\\d+) (-?\\d+) (-?\\d+) (-?\\d+) (-?\\d+) (-?\\d+) minecraft:(air|' + ST.foundation.replace('minecraft:', '') + ')$').exec(cmd))) { k = [m[1], m[3], m[7] === 'air' ? 'cut' : 'found'] }
    else if ((m = /fillbiome (-?\d+) (-?\d+) (-?\d+) /.exec(cmd))) k = [m[1], m[3], 'biome']
    else if ((m = /@e\[x=(-?\d+),y=-?\d+,z=(-?\d+),/.exec(cmd))) k = [m[1], m[2], 'tp']
    if (k) (byCell[k[0] + ',' + k[1]] = byCell[k[0] + ',' + k[1]] || []).push(k[2])
  })
  rects.forEach((r, i) => {
    // find the cell key for this rect: its min corner
    const seq = byCell[r.x0 + ',' + r.z0] || []
    let last = -1, good = seq.length > 0
    seq.forEach(s => { if (s === 'cut' && last > 0) last = -1; if (order[s] < last) good = false; last = order[s] })   // 'cut' after later steps = the block was redone from the start
    if (!good) ok(false, 'block order broken at ' + r.x0 + ',' + r.z0 + ': ' + seq.join(' '))
  })
  ok(Object.keys(byCell).length >= new Set(rects.map(r => r.x0 + ',' + r.z0)).size, 'every block has its clear/foundation/biome steps')
  // districts: taller on average near the middle
  const tall = {}
  ST.templates.forEach(t => { tall[t.id] = t.height }); PL.forEach(id => { tall[id] = ST.plazaHeights[id] })
  const R = Math.max.apply(null, rects.map(r => Math.hypot(r.x0 + 24 - isl.peakX, r.z0 + 24 - isl.peakZ)))
  const near = rects.filter(r => PL.indexOf(r.id) < 0 && Math.hypot(r.x0 + 24 - isl.peakX, r.z0 + 24 - isl.peakZ) < 0.4 * R)
  const far = rects.filter(r => Math.hypot(r.x0 + 24 - isl.peakX, r.z0 + 24 - isl.peakZ) > 0.65 * R)
  const avg = a => a.reduce((s, r) => s + tall[r.id], 0) / Math.max(1, a.length)
  console.log('  average height near the middle ' + avg(near).toFixed(1) + ' (' + near.length + ' blocks), outskirts ' + avg(far).toFixed(1) + ' (' + far.length + ' blocks)')
  ok(near.length < 3 || far.length < 3 || avg(near) > avg(far), 'downtown is taller than the outskirts')
  ok(new Set(rects.filter(r => PL.indexOf(r.id) < 0).map(r => r.id)).size >= 8, 'at least eight different templates used')
  const tally = {}; rects.forEach(r => { if (PL.indexOf(r.id) < 0) tally[r.id] = (tally[r.id] || 0) + 1 })
  global.COMMON = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0]
  ok(new Set(rects.map(r => r.rot)).size >= 3, 'rotations vary')
  ok(S.cityPlazaDone(isl, level) === true, 'plaza done afterwards')
  // finished island is remembered
  const tag = W.server.persistentData.getCompound('stodd_city').getCompound(isl.key)
  console.log('  saved: street level ' + tag.getInt('g') + ', ' + tag.getString('done').split(';').filter(Boolean).length + ' blocks, finished=' + tag.getBoolean('fin'))
  ok(tag.getString('done').split(';').filter(Boolean).length === new Set(rects.map(r => r.x0 + ',' + r.z0)).size, 'saved block list matches the blocks that were built')
  // reload: nothing is built again
  const n0 = W.cmds.filter(x => /place template/.test(x)).length
  const B2 = boot(W); const S2 = B2.S
  runCity(W, B2, isl, ring({ x: isl.peakX, z: isl.peakZ }, 110, 8), 400)
  ok(W.cmds.filter(x => /place template/.test(x)).length === n0, 'after a reload nothing is rebuilt')
  ok(S2.cityPlazaDone(isl, W.level) === true, 'plaza still done after a reload')
  // waystone waits for the plaza, then goes in its middle
  const W3 = mkWorld({ ground: groundGrid(), sky: [] }); const B3 = boot(W3); const S3 = B3.S
  const isl3 = S3.islandAt(W3.level, c.g.x, c.g.z)
  const pl3 = W3.player(isl3.peakX + 60, 80, isl3.peakZ); pl3.age = 431
  const wtick = B3.h.waystones.find(x => x.name === 'tick')
  wtick.fn({ player: pl3 })
  ok(W3.cmds.filter(x => /place feature/.test(x)).length === 0, 'no waystone on a city island before its plaza exists')
  runCity(W3, B3, isl3, [[isl3.peakX + 120, isl3.peakZ]], 400)
  ok(S3.cityPlazaDone(isl3, W3.level), 'plaza built in the second world too')
  pl3.age = 531; pl3.x = isl3.peakX + 60; pl3.z = isl3.peakZ
  wtick.fn({ player: pl3 })
  const wp = W3.cmds.filter(x => /place feature/.test(x))
  ok(wp.length === 1 && new RegExp('place feature waystones:' + WSTY[themeId] + ' ').test(wp[0]), 'city waystone is built once the plaza stands, in its style (' + WSTY[themeId] + ')')
  if (wp.length) { const m = /(-?\d+) (-?\d+) (-?\d+)$/.exec(wp[0]); ok(Math.hypot(+m[1] - isl3.peakX, +m[3] - isl3.peakZ) <= 8, 'and in the middle of the plaza') }
}
cityRun('city_future'); cityRun('city_primitive'); cityRun('city')

// ---- player inside a block / unloaded chunks / template failures
{
  const W4 = mkWorld({ ground: groundGrid(), sky: [] }); const B4 = boot(W4); const S4 = B4.S
  const cand = W4.ground.map(g => ({ g: g, info: S4.islandAt(W4.level, g.x, g.z) })).filter(c => c.info.theme.id === 'city')
  const isl = cand[0].info
  const p = W4.player(isl.peakX, 80, isl.peakZ)         // standing in the plaza
  runCity(W4, B4, isl, [[isl.peakX, isl.peakZ, 72]], 900)
  const pl1 = W4.cmds.filter(x => /place template stodd:city\/plaza/.test(x)).length
  ok(pl1 === 0, 'nothing is built on top of a player (plaza held while standing in it)')
  ok(W4.cmds.filter(x => /place template/.test(x)).length > 0, 'other blocks are built meanwhile')
  runCity(W4, B4, isl, [[isl.peakX + 100, isl.peakZ, 72]], 1500)
  ok(W4.cmds.filter(x => /place template stodd:city\/plaza/.test(x)).length === 1, 'plaza is built once the player steps away')
}
{
  const W5 = mkWorld({ ground: groundGrid(), sky: [] }); const B5 = boot(W5); const S5 = B5.S
  const isl = W5.ground.map(g => S5.islandAt(W5.level, g.x, g.z)).filter(i => i.theme.id === 'city')[0]
  W5.player(isl.peakX + 100, 80, isl.peakZ)
  W5.cmdFail = cmd => new RegExp('place template stodd:city/' + global.COMMON + ' ').test(cmd)
  runCity(W5, B5, isl, ring({ x: isl.peakX, z: isl.peakZ }, 110, 12), 500)
  const tg = W5.cmds.filter(x => new RegExp('place template stodd:city/' + global.COMMON + ' ').test(x)).length
  ok(tg === 3, 'a template that keeps failing is tried 3 times, then dropped (' + tg + ')')
  ok(W5.cmds.filter(x => /place template/.test(x) && !new RegExp('stodd:city/' + global.COMMON + ' ').test(x)).length > 5, 'the rest of the city still goes up')
}
{
  const W6 = mkWorld({ ground: groundGrid(), sky: [] }); const B6 = boot(W6); const S6 = B6.S
  const isl = W6.ground.map(g => S6.islandAt(W6.level, g.x, g.z)).filter(i => i.theme.id === 'city')[0]
  W6.player(isl.peakX + 100, 80, isl.peakZ)
  W6.cmdFail = cmd => /place template stodd:city\/plaza/.test(cmd)
  runCity(W6, B6, isl, ring({ x: isl.peakX, z: isl.peakZ }, 110, 6), 600)
  ok(W6.cmds.filter(x => /stodd:city\/plaza/.test(x)).length === 3, 'a plaza that cannot be placed is tried 3 times')
  ok(S6.cityPlazaDone(isl, W6.level) === true, 'and then the waystone is allowed to use ordinary placement')
  ok(W6.cmds.filter(x => /place template/.test(x) && !/plaza/.test(x)).length === 0, 'the island is left alone (no half-built city) once the plaza fails')
}

// ================================================================ 6. commands register without errors
section('commands')
{
  W = mkWorld({ ground: groundGrid(), sky: [] }); B = boot(W)
  let n = 0
  ;['islands', 'waystones', 'logpose', 'city'].forEach(k => B.h[k].filter(h => h.name === 'commandRegistry').forEach(h => { try { h.fn({ commands: chain(), arguments: chain(), register: () => { } }); n++ } catch (e) { ok(false, k + ' command registration threw ' + e) } }))
  ok(n >= 2, 'command registration runs (' + n + ' handlers)')
}
