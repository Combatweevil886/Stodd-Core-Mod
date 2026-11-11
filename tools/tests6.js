// New in 3.0.0: the scripts with STODD Core's Java side present (a mock of stodd.core.api.StoddApi): the rules handed over, island
// centres from Java, the city / dressing / Log Pose scripts standing down, the origin gate standing down, live mod data for the links.
const fs = require('fs'), path = require('path'), vm = require('vm')
const H = require('./harness.js')
const { ok, section, mkWorld, boot } = H
const DIR = process.argv[2]
H.resetEvents()

function load(name) { vm.runInThisContext(fs.readFileSync(path.join(DIR, name), 'utf8'), { filename: name }) }

// a mock Java side: island centres = the cone's summit snapped to the 48-block cell middle (what IslandFinder does for a cone)
function mockApi(W, over) {
  const calls = { configure: [], centre: 0, capSet: [], varSet: [] }
  const api = Object.assign({
    version: () => 3,
    configure: json => { calls.configure.push(json); return null },
    worldgenActive: () => true, logPoseActive: () => true, gateActive: () => true,
    centre: (level, x, z) => {
      calls.centre++
      let best = null, bv = -2
      for (const g of W.ground) { const v = 0.6 - 0.79 * Math.hypot(x - g.x, z - g.z) / g.r; if (v > bv) { bv = v; best = g } }
      if (bv < -0.19) return null
      return [Math.floor(best.x / 48) * 48 + 24, Math.floor(best.z / 48) * 48 + 24]
    },
    skyIsland: () => null,
    islandReport: () => 'Kamiro Skyline (City), centre 1128, 1128: a city of 41 blocks',
    capKeys: () => [], capRead: () => null, capSetNumber: (p, k, path, v) => { calls.capSet.push([k, path, v]); return true },
    varNames: () => null, varGet: () => null, varSet: (p, m, n, v) => { calls.varSet.push([m, n, v]); return true }
  }, over || {})
  return { api: api, calls: calls }
}

function grid() {
  const g = [{ x: 300, z: 300, r: 170 }]
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) g.push({ x: 1100 + i * 650, z: 1100 + j * 650 + (i % 2) * 220, r: 160 + ((i * 7 + j * 3) % 5) * 25 })
  return g
}

// ================================================================ 1. rules handed over, centres from Java
section('Java side: rules and island centres')
{
  const W = mkWorld({ ground: grid(), sky: [] }); W.loadedSet = new Set()
  load('02_rules.js')
  const m = mockApi(W)
  const B = boot(W, null, m.api)
  const S = B.S
  ok(m.calls.configure.length === 1, '40_islands.js hands the rules to the Java side once')
  const r = JSON.parse(m.calls.configure[0])
  ok(r.version === 3 && r.bands.length === 8 && Object.keys(r.city.styles).length === 3 && Object.keys(r.makeover.themes).length === 5, 'with the bands, city styles and dressed themes')
  ok(r.origins.list.length === 10 && r.origins.rules.swordsman.fruit === 'path' && r.origins.detect.fruit.items.src === '(no_mi|nomi|fruit)', 'and the origin rules, regexes included')
  ok(r.logPose.modes.length === 5 && r.logPose.searchRadii.length === 4, 'and the Log Pose settings')
  // the jar's built-in copy is the same function's output
  const cands = [process.env.STODD_WORLD_JSON, path.join(__dirname, '../src/main/resources/stodd_world.json'), path.join(__dirname, '../mod/src/main/resources/stodd_world.json')].filter(Boolean)
  const builtPath = cands.find(f => fs.existsSync(f))
  const built = JSON.parse(fs.readFileSync(builtPath, 'utf8'))
  ok(JSON.stringify(built.bands) === JSON.stringify(r.bands) && JSON.stringify(built.city) === JSON.stringify(r.city) && JSON.stringify(built.origins) === JSON.stringify(r.origins),
    "the jar's built-in rules equal what the scripts hand over")
  const isl = S.islandAt(W.level, 1110, 1120)
  ok(isl != null && !isl.ocean && (isl.peakX - 24) % 48 === 0 && (isl.peakZ - 24) % 48 === 0, 'an island is registered at the centre the Java side gives (' + (isl && isl.key) + ')')
  ok(m.calls.centre > 0, 'the Java side was asked')
  const isl2 = S.islandAt(W.level, 1200, 1050)
  ok(isl2.key === isl.key, 'another point of the same island gives the same island')
}

// ================================================================ 2. the builders stand down
section('Java side: cities, dressed islands and the Log Pose are not built by the scripts')
{
  const W = mkWorld({ ground: grid(), sky: [] }); W.loadedSet = new Set()
  const m = mockApi(W)
  const B = boot(W, null, m.api)
  const S = B.S
  ok(B.h.city.filter(h => h.name === 'tick').length === 0, '49_city.js registers no tick handler')
  ok(B.h.city.filter(h => h.name === 'commandRegistry').length === 1, '...only /stodd city')
  ok(B.h.makeover.filter(h => h.name === 'tick').length === 0 && B.h.makeover.filter(h => h.name === 'commandRegistry').length === 1, '52_makeover.js likewise (only /stodd isle)')
  ok(B.h.logpose.length === 0, '48_logpose.js registers nothing: the Java item does it all')
  global.Item = { of: id => ({ id: id }) }
  ok(S.newLogPose().id === 'stodd_core:log_pose', 'a Log Pose handed out by any script is the Java item')
  // generate chunks of a city island and tick: no command may build anything
  for (let a = 60; a < 80; a++) for (let b = 60; b < 80; b++) { W.loadedSet.add(a + ',' + b); if (global.stoddChunkLoad) global.stoddChunkLoad({ isNewChunk: () => true, getLevel: () => W.level, getChunk: () => ({ getPos: () => ({ x: a, z: b }) }) }) }
  ok(!W.cmds.some(c => /place template|fillbiome|fill /.test(c)), 'no /fill, /fillbiome or /place template from the scripts')
  ok(S.cityPlazaDone({}, W.level) === true && S.centerReady({}, W.level) === true, 'waystones do not wait for a script-built plaza / centrepiece')
  // /stodd city answers from Java
  let reg = null
  const ev = { commands: { literal: n => { const o = { n: n, kids: [], then(k) { o.kids.push(k); return o }, executes(f) { o.f = f; return o }, requires() { return o } }; return o } }, register: n => { reg = n } }
  B.h.city.find(h => h.name === 'commandRegistry').fn(ev)
  let said = ''
  const ctx = { source: { getPlayerOrException: () => ({ level: W.level, x: 1, y: 70, z: 1 }), sendSystemMessage: t => { said = t.s || String(t) } } }
  reg.kids[0].f(ctx)
  ok(reg.n === 'stodd' && reg.kids[0].n === 'city', '/stodd city is registered')
  // with scriptBuilder the old builder comes back
  const W2 = mkWorld({ ground: grid(), sky: [] }); W2.loadedSet = new Set()
  const B2 = boot(W2, c => { c.city.scriptBuilder = true }, mockApi(W2).api)
  ok(B2.h.city.some(h => h.name === 'tick'), 'city.scriptBuilder = true brings the script builder back')
  // and without the Java side everything is as before
  const W3 = mkWorld({ ground: grid(), sky: [] }); W3.loadedSet = new Set()
  const B3 = boot(W3)
  ok(B3.h.city.some(h => h.name === 'tick') && B3.h.makeover.some(h => h.name === 'tick') && B3.h.logpose.some(h => h.name === 'tick'), 'without the Java side the scripts build and drive the Log Pose as before')
}

// ================================================================ 3. the origin gate stands down
section('Java side: the origin gate')
{
  const HANDLERS = []
  const ev = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: String(k), fn: fn }) }) })
  global.PlayerEvents = ev; global.ServerEvents = ev; global.EntityEvents = ev; global.BlockEvents = ev; global.ItemEvents = ev
  const mk = s => { const o = { s: String(s), append(x) { o.s += x.s; return o }, color() { return o } }; return o }
  global.Text = new Proxy({}, { get: () => mk })
  global.stodd = undefined
  const W = mkWorld({ ground: grid(), sky: [] })
  const m = mockApi(W)
  const save = global.Java.loadClass
  global.Java = { loadClass: n => n === 'stodd.core.api.StoddApi' ? m.api : save(n) }
  load('00_config.js')
  load('05_util.js')
  const S = global.stodd
  ok(S.API === m.api, '05_util.js finds the Java side')
  S.log = () => { }
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  S.itemSystem = { 'trueprimepiece:gomu_gomu_no_mi': 'fruit' }
  S.blockSystem = {}
  S.systemOfItem = id => S.itemSystem[id] || null
  S.systemOfBlock = () => null
  load('10_origins.js')
  global.Java = { loadClass: save }
  ok(S.javaGate === true, '10_origins.js sees the Java gate')
  let cancelled = false
  const p = { username: 'T', getTags: () => ({ contains: t => t === 'stodd_o_human' }), isCreative: () => false, isPlayer: () => true, setStatusMessage() { }, server: { runCommandSilent() { return 1 } }, tell() { } }
  const rc = HANDLERS.find(h => h.name === 'rightClicked')
  rc.fn({ player: p, item: { id: 'trueprimepiece:gomu_gomu_no_mi', isEmpty: () => false, hasTag: () => false }, cancel() { cancelled = true } })
  ok(!cancelled, 'a Human right-clicking a fruit is left to the Java gate (no second refusal from the script)')
  ok(global.stoddUseGate(p, { id: 'trueprimepiece:gomu_gomu_no_mi', isEmpty: () => false }) === false && global.stoddAttackGate(p, {}) === false && global.stoddEquipGate(p, {}) === false,
    'the Forge-event gates in the startup script stand down too')
  ok(S.canUse(p, 'fruit') === false && S.canUse(p, 'cyber') === true, "the scripts' own rule (used by sweeps and /stodd check) is unchanged")
  H.resetEvents()
}

// ================================================================ 4. live mod data for the level links
section('Java side: the level links write into the live capability')
{
  const HANDLERS = []
  const ev = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: String(k), fn: fn }) }) })
  global.PlayerEvents = ev; global.ServerEvents = ev
  const mk = s => { const o = { s: String(s), append(x) { o.s += x.s; return o }, color() { return o } }; return o }
  global.Text = new Proxy({}, { get: () => mk })
  global.stodd = undefined
  class NNum { constructor(v) { this.v = v } getId() { return 6 } getAsDouble() { return this.v } }
  class NComp {
    constructor() { this.m = new Map() }
    getId() { return 10 }
    getAllKeys() { return { toArray: () => Array.from(this.m.keys()) } }
    get(k) { return this.m.has(k) ? this.m.get(k) : null }
    getCompound(k) { return this.m.get(k) instanceof NComp ? this.m.get(k) : new NComp() }
    put(k, v) { this.m.set(k, v); return v }
    contains(k) { return this.m.has(k) }
  }
  const live = { Stats: { Agility: 3, Strength: 3, Health: 3, Toughness: 3 } }
  const tree = () => { const c = new NComp(), s = new NComp(); Object.keys(live.Stats).forEach(k => s.put(k, new NNum(live.Stats[k]))); c.put('Stats', s); return c }
  const W = mkWorld({ ground: grid(), sky: [] })
  const m = mockApi(W, {
    capKeys: () => ['trueprimepiece:player_stats', 'curios:inventory'],
    capRead: (p, k) => k === 'trueprimepiece:player_stats' ? tree() : new NComp(),
    capSetNumber: (p, k, pth, v) => { m.calls.capSet.push([k, pth, v]); live.Stats[pth.split('/')[1]] = v; return true }
  })
  const save = global.Java.loadClass
  global.Java = { loadClass: n => n === 'stodd.core.api.StoddApi' ? m.api : save(n) }
  load('00_config.js')
  const C = global.stodd.cfg
  C.levelLinks.links.tppStats.capKey = /trueprimepiece/
  load('05_util.js')
  global.Java = { loadClass: save }
  const S = global.stodd
  S.J.CompoundTag = NComp
  S.log = () => { }
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  S.run = () => { }
  S.uuidOf = p => p.username
  S.applyStats = () => { }
  S.setLevel = (p, lvl) => { S.data(p).putInt('lvl', lvl) }
  S.jjcVarNames = () => null
  S.masteryHas = () => false
  load('24_links.js')
  const p = { username: 'L', getTags: () => ({ contains: t => t === 'stodd_o_human' }), tell() { }, server: { runCommandSilent() { return 1 } }, getNbt: () => { throw new Error('the copy must not be used') }, isPlayer: () => true }
  S.data(p).putInt('lvl', 3)
  let threw = false
  try { S.syncLinks(p) } catch (e) { threw = e }
  ok(typeof S.capsOf === 'function' && S.capsOf(p).getCompound('trueprimepiece:player_stats').getCompound('Stats').get('Agility').getAsDouble() === 3, 'the mod data is read live through the Java side (not from a copy of the player NBT)')
  S.data(p).putInt('lvl', 6)
  try { S.syncLinks(p) } catch (e) { threw = e }
  ok(!threw, 'syncing never touches the NBT copy (' + threw + ')')
  ok(m.calls.capSet.length === 4 && m.calls.capSet.every(c => c[0] === 'trueprimepiece:player_stats' && /^Stats\//.test(c[1]) && c[2] === 6),
    'a level-up writes each stat straight into the live capability (' + JSON.stringify(m.calls.capSet) + ')')
  H.resetEvents()
}


