// Behavioural tests for the STODD KubeJS scripts, run in Node against a mock Minecraft world.
// node harness.js <server_scripts/stodd dir>
const fs = require('fs'), path = require('path'), vm = require('vm')
const DIR = process.argv[2]
let pass = 0, fail = 0
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg) } }
function section(t) { console.log('\n== ' + t) }

// ------------------------------------------------------------------ Java / KubeJS mocks
class MockList {
  constructor() { this.a = [] }
  add(x) { this.a.push(x); return true }
  size() { return this.a.length }
  getString(i) { return this.a[i].s }
}
class MockStr { constructor(s) { this.s = s } static valueOf(s) { return new MockStr(s) } }
class MockCompound {
  constructor() { this.m = new Map() }
  contains(k) { return this.m.has(k) }
  put(k, v) { this.m.set(k, v); return v }
  putString(k, v) { this.m.set(k, String(v)) }
  putInt(k, v) { this.m.set(k, v | 0) }
  putBoolean(k, v) { this.m.set(k, !!v) }
  getString(k) { return this.m.has(k) ? this.m.get(k) : '' }
  getInt(k) { return this.m.has(k) ? this.m.get(k) : 0 }
  getBoolean(k) { return this.m.has(k) ? this.m.get(k) : false }
  getCompound(k) { return this.m.has(k) ? this.m.get(k) : new MockCompound() }
  getList(k) { if (!this.m.has(k)) this.m.set(k, new MockList()); return this.m.get(k) }
}
function chain() { // anything callable, returns itself
  const f = function () { return p }
  const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => 'chain' : p), apply: () => p })
  return p
}
const JAVA = {
  'net.minecraft.world.level.levelgen.DensityFunction$SinglePointContext': class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z } },
  'net.minecraft.nbt.ListTag': MockList,
  'net.minecraft.nbt.StringTag': MockStr,
  'net.minecraft.nbt.CompoundTag': MockCompound,
  'net.minecraft.world.level.levelgen.Heightmap$Types': { OCEAN_FLOOR_WG: 'OCEAN_FLOOR_WG', OCEAN_FLOOR: 'OCEAN_FLOOR', WORLD_SURFACE: 'WORLD_SURFACE', MOTION_BLOCKING_NO_LEAVES: 'MBNL' },
  'net.minecraft.nbt.TagParser': { parseTag: s => new MockCompound() }
}
let WAYSTONES = []
JAVA['net.blay09.mods.waystones.core.WaystoneManager'] = { get: () => ({ getWaystones: () => ({ toArray: () => WAYSTONES.slice() }), updateWaystone() { } }) }
global.Java = { loadClass: n => JAVA[n] || chain() }
let HANDLERS = []
function evt() { return new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: String(k), fn: fn }) }) }) }
function resetEvents() { global.PlayerEvents = evt(); global.ServerEvents = evt(); global.EntityEvents = evt(); global.ItemEvents = evt(); global.BlockEvents = evt(); global.ForgeEvents = chain(); global.Text = textMock }
global.PlayerEvents = evt(); global.ServerEvents = evt(); global.EntityEvents = evt(); global.ItemEvents = evt(); global.BlockEvents = evt(); global.ForgeEvents = chain()
global.Commands = chain(); global.NBT = chain(); global.Block = chain()
const textMock = new Proxy({}, { get: (t, k) => (s => { const o = { s: String(s), append(x) { o.s += x.s; return o } }; return o }) })
global.Text = textMock
global.Item = chain(); global.console = console
global.JsonIO = { read: p => (global.__files && global.__files[p] !== undefined ? global.__files[p] : null) }
global.global = global

function loadScript(name) {
  HANDLERS = []
  const src = fs.readFileSync(path.join(DIR, name), 'utf8')
  vm.runInThisContext(src, { filename: name })
  const h = HANDLERS
  HANDLERS = []
  return h
}

// ------------------------------------------------------------------ the mock world
function mkWorld(cfg) {
  const W = { ground: cfg.ground, sky: cfg.sky, overrides: new Map(), cmds: [], cmdFail: null, players: [], tick: 0, loadedRadius: 12 }
  W.continents = (x, z) => { let v = -1; for (const i of W.ground) v = Math.max(v, 0.6 - 0.79 * Math.hypot(x - i.x, z - i.z) / i.r); return v }
  W.groundH = (x, z) => (W.continents(x, z) >= -0.19 ? 68 + Math.floor((W.continents(x, z) + 0.19) * 5) : 50)
  W.skyAt = (x, z) => { for (const s of W.sky) if (Math.hypot(x - s.x, z - s.z) <= s.r) return s; return null }
  W.density = (x, y, z) => { const s = W.skyAt(x, z); if (s && y >= 222 && y <= 233) return 1; return y <= W.groundH(x, z) ? 1 : -1 }
  W.loadedSet = null   // tests may set a Set of 'cx,cz' strings: then exactly these chunks are loaded
  W.loaded = (cx, cz) => W.loadedSet ? W.loadedSet.has(cx + ',' + cz) : W.players.some(p => Math.abs((p.x >> 4) - cx) <= W.loadedRadius && Math.abs((p.z >> 4) - cz) <= W.loadedRadius)
  W.block = (x, y, z) => {
    const k = x + ',' + y + ',' + z
    let id = 'minecraft:air'
    if (W.overrides.has(k)) id = W.overrides.get(k)
    else {
      const s = W.skyAt(x, z)
      if (s && y >= 222 && y <= 232) id = y === 232 ? 'minecraft:grass_block' : 'minecraft:stone'
      else if (y <= W.groundH(x, z)) id = y === W.groundH(x, z) ? 'minecraft:grass_block' : 'minecraft:stone'
    }
    return { id: id, blockState: { canBeReplaced: () => id === 'minecraft:air', getFluidState: () => ({ isEmpty: () => true }) }, entity: null }
  }
  W.topFree = (x, z) => { const s = W.skyAt(x, z); for (let y = 320; y > -60; y--) { if (W.block(x, y, z).id !== 'minecraft:air') return y + 1 } return 64 }
  const server = {
    persistentData: new MockCompound(),
    runCommandSilent(cmd) {
      W.cmds.push(cmd)
      const m = /place feature (waystones:\S+) (-?\d+) (-?\d+) (-?\d+)/.exec(cmd)
      if (m) {
        const x = +m[2], y = +m[3], z = +m[4]
        W.overrides.set(x + ',' + y + ',' + z, 'waystones:waystone'); W.overrides.set(x + ',' + (y + 1) + ',' + z, 'waystones:waystone')
        WAYSTONES.push({ getDimension: () => ({ location: () => 'minecraft:overworld' }), getPos: () => ({ getX: () => x, getY: () => y, getZ: () => z }) })
      }
      const sb = /setblock (-?\d+) (-?\d+) (-?\d+) minecraft:air/.exec(cmd)
      if (sb) W.overrides.set(sb[1] + ',' + sb[2] + ',' + sb[3], 'minecraft:air')
      if (W.cmdFail && W.cmdFail(cmd)) return 0
      return 1
    },
    getPlayerList() { return { getPlayers: () => ({ toArray: () => W.players.slice() }) } },
    getTickCount() { return W.tick },
    scheduleInTicks() { },
    overworld() { return W.level },
    getResourceManager() { return { getResourceStack: () => ({ toArray: () => (W.providers || []).map(id => ({ sourcePackId: () => id })) }) } }
  }
  W.server = server
  W.level = {
    dimension: 'minecraft:overworld', server: server, isClientSide: () => false,
    getSeed: () => 987654321,
    getChunkSource: () => ({
      randomState: () => ({ router: () => ({ continents: () => ({ compute: c => W.continents(c.x, c.z) }), finalDensity: () => ({ compute: c => W.density(c.x, c.y, c.z) }) }) }),
      getGenerator: () => ({ getBaseHeight: (x, z) => W.groundH(x, z) + 1 })
    }),
    hasChunk: (a, b) => W.loaded(a, b),
    getHeight: (type, x, z) => W.topFree(x, z),
    getBlock: (x, y, z) => W.block(x, y, z),
    getSharedSpawnPos: () => ({ getX: () => 0, getZ: () => 0 }),
    getGameTime: () => W.tick
  }
  W.player = (x, y, z, name) => {
    const p = { x: x, y: y, z: z, age: 500, username: name || 'Tester', level: W.level, server: server, isSpectator: () => false, isOnGround: () => true, isInWater: () => false, tell() { }, getTags: () => ({ contains: () => false }) }
    W.players.push(p)
    return p
  }
  return W
}

// ------------------------------------------------------------------ boot the scripts
function boot(world, mutate, api) {
  WAYSTONES = []
  vm.runInThisContext(fs.readFileSync(path.join(DIR, '00_config.js'), 'utf8'), { filename: '00_config.js' })
  vm.runInThisContext(fs.readFileSync(path.join(DIR, '01_content.js'), 'utf8'), { filename: '01_content.js' })
  const S = global.stodd
  if (mutate) mutate(S.cfg)
  S.ready = true
  S.J = { CompoundTag: MockCompound, ResourceLocation: class { constructor(a, b) { this.a = a; this.b = b } } }
  S.log = () => { }
  S.run = (server, cmd) => { try { server.runCommandSilent(cmd) } catch (e) { } }
  S.ns = id => id.split(':')[0]
  S.uuidOf = p => p.username
  S.data = p => { p.__d = p.__d || new MockCompound(); return p.__d }
  S.API = api || null
  S.apiFlag = name => { if (S.API == null) return false; try { return !!S.API[name]() } catch (e) { return false } }
  S.activeThemes = S.cfg.islandThemes
  S.themeMods = {}
  const out = {}
  out.islands = loadScript('40_islands.js')
  out.waystones = loadScript('45_waystones.js')
  out.logpose = loadScript('48_logpose.js')
  out.city = loadScript('49_city.js')
  out.makeover = loadScript('52_makeover.js')
  out.locate = loadScript('53_locate.js')
  out.world = loadScript('54_world.js')
  return { S: S, h: out }
}
module.exports = { ok, section, mkWorld, boot, MockCompound, chain, resetEvents, summary: () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0) } }
