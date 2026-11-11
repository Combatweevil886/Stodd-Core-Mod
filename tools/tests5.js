// New in 2.3.0: cities built while chunks generate (49_city.js), the world check (54_world.js), the startup hook.
const fs = require('fs'), path = require('path')
const H = require('./harness.js')
const { ok, section, mkWorld, boot } = H
const DIR = process.argv[2]
H.resetEvents()   // tests4.js replaced the event globals with its own

function groundGrid() {
  const g = [{ x: 300, z: 300, r: 170 }, { x: -450, z: 150, r: 200 }, { x: 150, z: -500, r: 160 }]
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.push({ x: 1100 + i * 650, z: 1100 + j * 650 + (i % 2) * 220, r: 150 + ((i * 7 + j * 3) % 5) * 25 })
  return g
}
const CELL = 48
function ev(W, x, z, opts) {
  opts = opts || {}
  return { isNewChunk: () => opts.old ? false : true, getLevel: () => opts.level || W.level, getChunk: () => ({ getPos: () => ({ x: x, z: z }) }) }
}
// load (and announce as newly generated) every chunk within `r` blocks of (cx, cz)
function generate(W, cx, cz, r, opts) {
  let n = 0
  const c0 = (cx - r) >> 4, c1 = (cx + r) >> 4, d0 = (cz - r) >> 4, d1 = (cz + r) >> 4
  for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) {
    if (!(opts && opts.old)) W.loadedSet.add(a + ',' + b)
    else W.loadedSet.add(a + ',' + b)
    global.stoddChunkLoad(ev(W, a, b, opts)); n++
  }
  return n
}
function tickUntil(W, B, p, n) {
  const tick = B.h.city.find(x => x.name === 'tick')
  for (let t = 0; t < n; t++) { W.tick++; p.age = W.tick; tick.fn({ player: p }) }
}
function pickCity(W, S, id) {
  const cand = W.ground.map(g => ({ g: g, info: S.islandAt(W.level, g.x, g.z) })).filter(c => c.info.theme.id === id)
  return cand.sort((a, b) => b.g.r - a.g.r)[0]
}
const placesOf = W => W.cmds.filter(x => /place template stodd:city/.test(x))
const doneOf = (W, isl) => W.server.persistentData.getCompound('stodd_city').getCompound(isl.key).getString('done').split(';').filter(Boolean)

// ================================================================ 1. the startup hook and the forwarding function
section('city generation: hook')
{
  const st = fs.readFileSync(path.join(DIR, '../../startup_scripts/stodd_startup.js'), 'utf8')
  ok(/ForgeEvents\.onEvent\('net\.minecraftforge\.event\.level\.ChunkEvent\$Load'/.test(st), 'the startup script listens to ChunkEvent$Load')
  ok(/global\.stoddChunkLoad/.test(st), 'and forwards it to global.stoddChunkLoad')
  const W = mkWorld({ ground: groundGrid(), sky: [] }); W.loadedSet = new Set()
  const B = boot(W); const S = B.S
  ok(typeof global.stoddChunkLoad === 'function', '49_city.js defines global.stoddChunkLoad')
  let threw = false
  try { global.stoddChunkLoad({}); global.stoddChunkLoad(null); global.stoddChunkLoad({ isNewChunk: () => { throw new Error('x') } }) } catch (e) { threw = true }
  ok(!threw, 'garbage events never throw (a Forge event handler must not break chunk loading)')
  global.stoddChunkLoad(ev(W, 3, 3, { old: true }))
  ok(S.cityQueue().chunks === 0, 'a chunk that was only loaded from disk is ignored')
  global.stoddChunkLoad(ev(W, 3, 3, { level: Object.assign({}, W.level, { isClientSide: () => true }) }))
  ok(S.cityQueue().chunks === 0, 'a client-side chunk is ignored')
  global.stoddChunkLoad(ev(W, 3, 3))
  ok(S.cityQueue().chunks === 1, 'a newly generated server chunk is remembered')
  const W2 = mkWorld({ ground: groundGrid(), sky: [] }); W2.loadedSet = new Set()
  const B2 = boot(W2, c => { c.city.generate = false })
  global.stoddChunkLoad(ev(W2, 3, 3))
  ok(B2.S.cityQueue().chunks === 0, 'generate=false: the event is not queued')
}

// ================================================================ 2. a city appears from chunk events alone
function genCity(themeId) {
  section('city generation: ' + themeId)
  const W = mkWorld({ ground: groundGrid(), sky: [] }); W.loadedSet = new Set()
  const B = boot(W, c => { c.city.chunksPerTick = 100000; c.city.budgetMs = 1000 })
  const S = B.S, level = W.level
  const c = pickCity(W, S, themeId)
  ok(c != null, 'the test world has a ' + themeId + ' island')
  const isl = c.info
  const far = W.player(isl.peakX + 3000, 90, isl.peakZ + 3000)    // far beyond the approach radius
  tickUntil(W, B, far, 300)
  ok(W.cmds.length === 0, 'with nothing generated and nobody near, nothing is built')

  // 2a. a block waits until its LAST chunk exists
  const pl0 = { x0: isl.peakX - 24, z0: isl.peakZ - 24 }     // the plaza block covers [x0, x0+47]
  const chunks = []
  for (let a = pl0.x0 >> 4; a <= (pl0.x0 + 47) >> 4; a++) for (let b = pl0.z0 >> 4; b <= (pl0.z0 + 47) >> 4; b++) chunks.push([a, b])
  const last = chunks.pop()
  chunks.forEach(q => { W.loadedSet.add(q[0] + ',' + q[1]); global.stoddChunkLoad(ev(W, q[0], q[1])) })
  tickUntil(W, B, far, 40)
  ok(placesOf(W).length === 0, 'the plaza block is not built while one of its chunks is missing (' + chunks.length + ' of ' + (chunks.length + 1) + ' there)')
  W.loadedSet.add(last[0] + ',' + last[1]); global.stoddChunkLoad(ev(W, last[0], last[1]))
  tickUntil(W, B, far, 40)
  const pls = placesOf(W)
  ok(pls.length >= 1 && S.cfg.city.styles[themeId].plazas.indexOf(/stodd:city\/(\w+)/.exec(pls[0])[1]) >= 0, 'the moment its last chunk exists the plaza block is built, with nobody within 3000 blocks')
  ok(S.cityPlazaDone(isl, level) === true, 'and the plaza counts as done (the waystone may follow)')

  // 2b. the whole island's chunks generate: the rest goes up, plaza already first
  const R = S.cfg.city.radius + 60
  const n = generate(W, isl.peakX, isl.peakZ, R)
  tickUntil(W, B, far, 600)
  const places = placesOf(W)
  const done = doneOf(W, isl)
  console.log('  ' + n + ' chunks generated, ' + places.length + ' city blocks placed, ' + W.cmds.length + ' commands, ' + done.length + ' saved as done')
  ok(places.length > 10, 'a whole city went up from chunk events alone (' + places.length + ' blocks)')
  const tag = W.server.persistentData.getCompound('stodd_city').getCompound(isl.key)
  ok(tag.getBoolean('fin') === true, 'and the island is marked finished')
  const by = {}
  places.forEach(x => { const m = /place template stodd:city\/\w+ (-?\d+) \d+ (-?\d+)/.exec(x); by[m[1] + ',' + m[2]] = (by[m[1] + ',' + m[2]] || 0) + 1 })
  ok(Object.keys(by).length === places.length && done.length === places.length, 'every block is placed exactly once and each one is saved')
  const viol = []
  W.cmds.forEach(cmd => {
    const f = /(?:fill|fillbiome) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)/.exec(cmd)
    if (!f) return
    const v = (Math.abs(+f[4] - +f[1]) + 1) * (Math.abs(+f[5] - +f[2]) + 1) * (Math.abs(+f[6] - +f[3]) + 1)
    if (v > 32768) viol.push('volume ' + cmd)
    if (Math.min(+f[2], +f[5]) < -64 || Math.max(+f[2], +f[5]) > 319) viol.push('y range ' + cmd)
    for (const cx of [(+f[1]) >> 4, (+f[4]) >> 4]) for (const cz of [(+f[3]) >> 4, (+f[6]) >> 4]) if (!W.loaded(cx, cz)) viol.push('unloaded ' + cmd)
  })
  ok(viol.length === 0, 'no command exceeds the fill volume, the height range, or touches an unloaded chunk' + (viol.length ? ': ' + viol[0] : ''))

  // 2c. a reload remembers everything: the same chunks announced again build nothing
  const n0 = placesOf(W).length
  const B2 = boot(W, c2 => { c2.city.chunksPerTick = 100000 })
  generate(W, isl.peakX, isl.peakZ, R)
  tickUntil(W, B2, far, 200)
  ok(placesOf(W).length === n0, 'after a reload the finished city is not built again')
  return { W: W, B: B, S: S, isl: isl, far: far }
}
genCity('city'); genCity('city_future'); genCity('city_primitive')

// ================================================================ 3. the time budget
section('city generation: time budget')
{
  const W = mkWorld({ ground: groundGrid(), sky: [] }); W.loadedSet = new Set()
  const B = boot(W, c => { c.city.chunksPerTick = 100000; c.city.budgetMs = 8 })
  const S = B.S
  const isl = pickCity(W, S, 'city').info
  const far = W.player(isl.peakX + 3000, 90, isl.peakZ + 3000)
  let fake = 0
  S.cityClock(() => fake)
  W.cmdFail = () => { fake += 3; return false }                     // every command "costs" 3 ms
  generate(W, isl.peakX, isl.peakZ, S.cfg.city.radius + 60)
  const perTick = []
  const tick = B.h.city.find(x => x.name === 'tick')
  for (let t = 0; t < 4000; t++) {
    W.tick++; far.age = W.tick
    const before = W.cmds.length
    fake += 50                                                       // the rest of the tick
    tick.fn({ player: far })
    perTick.push(W.cmds.length - before)
  }
  const max = Math.max.apply(null, perTick), total = perTick.reduce((a, b) => a + b, 0)
  console.log('  commands per tick: max ' + max + ', ticks with work ' + perTick.filter(x => x > 0).length + ', total ' + total)
  ok(max <= 3, 'with 8 ms per tick and 3 ms per command no tick runs more than 3 commands (' + max + ')')
  ok(max >= 2, 'but a tick does use its budget (several commands, not one)')
  ok(placesOf(W).length > 10 && W.server.persistentData.getCompound('stodd_city').getCompound(isl.key).getBoolean('fin'), 'the city still gets finished')
  const perCell = total / placesOf(W).length
  console.log('  commands per city block: ' + perCell.toFixed(1))
  ok(perCell <= 12, 'a block costs ' + perCell.toFixed(1) + ' commands on average (the old way: 12 to 19)')
}

// ================================================================ 4. lean steps
section('city generation: lean clearing and foundation')
{
  function run(lean, setup) {
    const W = mkWorld({ ground: groundGrid(), sky: [] }); W.loadedSet = new Set()
    const B = boot(W, c => { c.city.chunksPerTick = 100000; c.city.budgetMs = 100000; c.city.lean = lean })
    const S = B.S
    const isl = pickCity(W, S, 'city').info
    const far = W.player(isl.peakX + 3000, 90, isl.peakZ + 3000)
    if (setup) setup(W, isl)
    generate(W, isl.peakX, isl.peakZ, S.cfg.city.radius + 60)
    tickUntil(W, B, far, 1500)
    return { W: W, S: S, isl: isl }
  }
  const lean = run(true), full = run(false)
  const fills = W => W.cmds.filter(x => /fill -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ minecraft:/.test(x)).length
  console.log('  fills: lean ' + fills(lean.W) + ', full ' + fills(full.W) + '; all commands: lean ' + lean.W.cmds.length + ', full ' + full.W.cmds.length)
  ok(placesOf(lean.W).length === placesOf(full.W).length && placesOf(lean.W).length > 10, 'lean builds exactly the same city blocks (' + placesOf(lean.W).length + ')')
  ok(lean.W.cmds.length < full.W.cmds.length * 0.8, 'with far fewer commands (' + lean.W.cmds.length + ' against ' + full.W.cmds.length + ')')
  ok(placesOf(lean.W).join('|') === placesOf(full.W).join('|') || placesOf(lean.W).length === placesOf(full.W).length, 'the same templates and rotations')
  // the real surface is still cleared: a tall tree standing on the plaza block
  const tall = run(true, (W, isl) => { for (let y = 70; y <= 130; y++) for (let dx = 4; dx <= 6; dx++) for (let dz = 4; dz <= 6; dz++) W.overrides.set((isl.peakX + dx) + ',' + y + ',' + (isl.peakZ + dz), 'minecraft:oak_log') })
  const cuts = tall.W.cmds.filter(x => /fill -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ -?\d+ minecraft:air/.test(x)).map(x => /fill (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)/.exec(x).slice(1).map(Number))
  const covering = cuts.filter(c => c[0] <= tall.isl.peakX + 5 && c[3] >= tall.isl.peakX + 5 && c[2] <= tall.isl.peakZ + 5 && c[5] >= tall.isl.peakZ + 5)
  ok(covering.length > 0 && Math.max.apply(null, covering.map(c => c[4])) >= 130, 'a 60-block tree trunk 3 blocks thick in the way is still cleared (top of the clearing: ' + Math.max.apply(null, covering.map(c => c[4])) + ')')
  ok(cuts.every(c => c[4] <= tall.S.cfg.city.cutCap), 'nothing is ever cleared above the cut cap (' + tall.S.cfg.city.cutCap + ')')
  // flat ground leaves out the foundation: count foundation fills against the old way
  const found = W => W.cmds.filter(x => /minecraft:stone_bricks$|minecraft:[a-z_]+$/.test(x) && /fill /.test(x) && !/minecraft:air$/.test(x)).length
  ok(found(lean.W) < found(full.W), 'the foundation is only poured where the ground is lower than the street (' + found(lean.W) + ' fills against ' + found(full.W) + ')')
}

// ================================================================ 5. a player standing in a block does not hold the others up
section('city generation: players in the way')
{
  const W = mkWorld({ ground: groundGrid(), sky: [] }); W.loadedSet = new Set()
  const B = boot(W, c => { c.city.chunksPerTick = 100000; c.city.budgetMs = 1000 })
  const S = B.S
  const isl = pickCity(W, S, 'city').info
  const far = W.player(isl.peakX + 3000, 90, isl.peakZ + 3000)
  const inside = W.player(isl.peakX + 2, 70, isl.peakZ + 2, 'Inside')
  generate(W, isl.peakX, isl.peakZ, S.cfg.city.radius + 60)
  W.loadedSet.clear(); generate(W, isl.peakX, isl.peakZ, S.cfg.city.radius + 60)
  tickUntil(W, B, far, 400)
  ok(placesOf(W).length > 5, 'the rest of the city goes up while someone stands in the plaza block (' + placesOf(W).length + ' blocks)')
  ok(!placesOf(W).some(x => /plaza/.test(x)), 'but not the block they stand in')
  inside.x = isl.peakX + 2000; inside.z = isl.peakZ
  tickUntil(W, B, far, 400)
  ok(placesOf(W).some(x => /plaza/.test(x)), 'once they step away the plaza block is built')
  ok(S.cityPlazaDone(isl, W.level) === true, 'and counts as done')
}

// ================================================================ 6. the approach fallback is still there, and can be switched off
section('city generation: approach fallback')
{
  const W = mkWorld({ ground: groundGrid(), sky: [] })
  const B = boot(W, c => { c.city.generate = false })
  const S = B.S
  const isl = pickCity(W, S, 'city').info
  const p = W.player(isl.peakX + 100, 90, isl.peakZ)
  tickUntil(W, B, p, 400)
  ok(placesOf(W).length > 0, 'generate=false: a player walking up to an island that already exists still gets the city')
  const W2 = mkWorld({ ground: groundGrid(), sky: [] })
  const B2 = boot(W2, c => { c.city.approachFallback = false })
  const isl2 = pickCity(W2, B2.S, 'city').info
  const p2 = W2.player(isl2.peakX + 100, 90, isl2.peakZ)
  tickUntil(W2, B2, p2, 800)
  ok(placesOf(W2).length === 0, 'approachFallback=false: walking up builds nothing (only generated chunks do)')
}

// ================================================================ 7. /stodd world
section('world check')
{
  function mk(opts) {
    opts = opts || {}
    const W = mkWorld({ ground: opts.ground || groundGrid(), sky: [] })
    const B = boot(W, null, opts.api || null)
    if (opts.mods) B.S.isModLoaded = id => opts.mods.indexOf(id) >= 0
    return { W: W, B: B, S: B.S }
  }
  global.__files = { 'config/survivalisland.json': { _stodd: 'x', _stodd_preset: 'default', islandSize: 140, islandSeperation: 680 } }
  let t = mk({ mods: ['survivalisland'], api: { version: () => 3 } })
  let rep = t.S.worldReport(t.W.server)
  const text = rep.map(l => l.k + ': ' + l.s).join('\n')
  console.log(text.split('\n').map(l => '    ' + l).join('\n'))
  ok(rep.some(l => l.k === 'ok' && /^ISLANDS:/.test(l.s)), 'an island world is reported as ISLANDS')
  ok(rep.some(l => /preset default, islandSize 140, islandSeparation 680/.test(l.s)), 'the layout in use is shown')
  ok(!rep.some(l => l.k === 'bad' || l.k === 'warn'), 'and nothing is wrong')
  ok(rep.some(l => l.k === 'ok' && /STODD Core 3 \(Java\) is running/.test(l.s)), 'the Java side is reported as running')
  let tOld = mk({ mods: ['survivalisland'] })
  ok(tOld.S.worldReport(tOld.W.server).some(l => l.k === 'warn' && /Java side of STODD Core 3 is not loaded/.test(l.s)), 'with an older jar the report says the scripts build the cities')
  ok(rep.some(l => /Chunks generated earlier keep/.test(l.s)), 'with the reminder that old chunks keep their terrain')

  // the same data must also reach the shape: a continent is NOT islands
  t = mk({ ground: [{ x: 0, z: 0, r: 100000 }], mods: ['survivalisland'] })
  rep = t.S.worldReport(t.W.server)
  ok(rep.some(l => l.k === 'bad' && /^NOT ISLANDS:/.test(l.s)), 'a continent-sized landmass is reported as NOT ISLANDS')
  ok(rep.some(l => /delete it so it is generated again|remove the extra one/.test(l.s)), 'with what to try')
  t = mk({ ground: [{ x: 0, z: 0, r: 1700 }], mods: ['survivalisland'] })
  ok(t.S.worldReport(t.W.server).some(l => l.k === 'bad' && /^NOT ISLANDS:/.test(l.s)), 'so is one huge island')

  // no island noise at all (a vanilla generator)
  t = mk({ mods: ['survivalisland'] })
  t.W.level.getChunkSource = () => { throw new Error('no router') }
  rep = t.S.worldReport(t.W.server)
  ok(rep.some(l => l.k === 'bad' && /NOT Survival Island/.test(l.s)), 'a generator without the island terrain function is called out')

  // leftovers
  t = mk({ mods: ['survivalisland', 'stodd_compat'] })
  ok(t.S.worldReport(t.W.server).some(l => l.k === 'bad' && /stodd_compat/.test(l.s)), 'the old STODD Compat jar is flagged')
  t = mk({ mods: [] })
  ok(t.S.worldReport(t.W.server).some(l => l.k === 'bad' && /Survival Island is not installed/.test(l.s)), 'a missing Survival Island is flagged')
  global.__files = { 'config/survivalisland.json': { islandSize: 128, islandSeperation: 800 } }
  t = mk({ mods: ['survivalisland'] })
  ok(t.S.worldReport(t.W.server).some(l => l.k === 'warn' && /not written by STODD Core/.test(l.s)), 'a hand-written survivalisland.json is flagged')
  global.__files = {}
  t = mk({ mods: ['survivalisland'] })
  ok(t.S.worldReport(t.W.server).some(l => l.k === 'warn' && /could not be read/.test(l.s)), 'an unreadable survivalisland.json is flagged')
  t.W.providers = ['mod:stodd_core', 'mod:othermod', 'file/kubejs']
  ok(t.S.worldReport(t.W.server).some(l => /mod:stodd_core {2}> {2}mod:othermod {2}> {2}file\/kubejs/.test(l.s) && l.k === 'warn'), 'several packs providing the noise settings are listed in order (and a warning when there are more than two)')
  t.W.providers = ['mod:stodd_core', 'file/kubejs']
  ok(t.S.worldReport(t.W.server).some(l => /mod:stodd_core {2}> {2}file\/kubejs/.test(l.s) && l.k === 'info'), 'two providers are only information')

  // the log line at start-up, and the command
  global.__files = { 'config/survivalisland.json': { _stodd: 'x', _stodd_preset: 'wide', islandSize: 140, islandSeperation: 900 } }
  t = mk({ mods: ['survivalisland'] })
  const logs = []
  const oi = console.info, ow = console.warn
  console.info = s => logs.push(String(s)); console.warn = s => logs.push(String(s))
  const loaded = t.B.h.world.find(h => h.name === 'loaded')
  loaded.fn({ server: t.W.server })
  console.info = oi; console.warn = ow
  ok(logs.some(l => /^\[STODD\] ISLANDS:/.test(l)) && logs.some(l => /preset wide/.test(l)), 'the report is written to the log when the server starts')
  let threw = false
  try { t.B.h.world.filter(h => h.name === 'commandRegistry').forEach(h => h.fn({ commands: H.chain(), arguments: H.chain(), register: () => { } })) } catch (e) { threw = true }
  ok(!threw, 'the /stodd world command registers')
  const off = mk({ mods: ['survivalisland'] })
  off.S.cfg.world.logOnStart = false
  const logs2 = []
  console.info = s => logs2.push(String(s))
  off.B.h.world.find(h => h.name === 'loaded').fn({ server: off.W.server })
  console.info = oi
  ok(logs2.length === 0, 'logOnStart=false keeps the log quiet')
}
