// New in 3.1: the config files laid over the scripts' defaults (00_config.js), the rarities, and the sky-island settings the
// scripts derive. The Java side hands the scripts every value as JSON (StoddConfig.scriptJson); here that JSON is built from the
// schema's defaults the same way, so the test also proves the files' defaults change nothing.
const fs = require('fs'), path = require('path'), vm = require('vm')
const H = require('./harness.js')
const { ok, section } = H
const DIR = process.argv[2]
const SCHEMA = path.join(__dirname, '../src/main/resources/stodd_config/schema.json')
const SRC = fs.readFileSync(path.join(DIR, '00_config.js'), 'utf8')

// a fresh 00_config.js, with a mock Java side that hands over `json` (null: no Java side)
function load(json, version) {
  const ctx = { console: { info() {}, warn() {}, log() {} } }
  ctx.global = ctx
  if (json !== null) {
    ctx.Java = { loadClass: () => ({ version: () => version || 4, configJson: () => (typeof json === 'string' ? json : JSON.stringify(json)), configDir: () => 'config/stodd' }) }
  }
  vm.createContext(ctx)
  vm.runInContext(SRC, ctx)
  return ctx.stodd.cfg
}
function isRe(v) { return Object.prototype.toString.call(v) === '[object RegExp]' }
function deepEq(a, b, p, out) {
  if (isRe(a) || isRe(b)) { if (!(isRe(a) && isRe(b) && a.source === b.source && a.flags === b.flags)) out.push(p); return }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!(Array.isArray(a) && Array.isArray(b)) || a.length !== b.length) { out.push(p); return }
    a.forEach((x, i) => deepEq(x, b[i], p + '[' + i + ']', out)); return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
    if (ka.join() !== kb.join()) { out.push(p + ' keys ' + ka.filter(k => kb.indexOf(k) < 0).concat(kb.filter(k => ka.indexOf(k) < 0))); return }
    ka.forEach(k => deepEq(a[k], b[k], p + '.' + k, out)); return
  }
  if (a !== b) out.push(p + ': ' + a + ' vs ' + b)
}
// what StoddConfig.scriptJson() gives with untouched files
function defaultsJson() {
  const s = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'))
  const root = {}
  s.files.forEach(f => f.items.forEach(it => {
    if (it.t !== 'key') return
    const parts = it.path.split('.')
    let at = root
    for (let i = 0; i < parts.length - 1; i++) at = at[parts[i]] = at[parts[i]] || {}
    at[parts[parts.length - 1]] = it.def
  }))
  return root
}

section('config: the files\' defaults change nothing')
const plain = load(null)
const viaFiles = load(defaultsJson())
const diffs = []
deepEq(viaFiles, plain, 'C', diffs)
// the one difference that is meant: the Java side is there
ok(diffs.length === 1 && diffs[0].indexOf('C.sky.lifted') === 0, 'defaults through the files = the defaults (' + diffs.slice(0, 6).join(' | ') + ')')
ok(plain.sky.lifted === false && viaFiles.sky.lifted === true, 'lifted sky islands only with the 3.1 Java side')
ok(load(defaultsJson(), 3).sky.lifted === false, 'an older jar: the old sky islands')
ok(load('{not json').maxLevel === 20, 'a broken hand-over: the defaults')

section('config: values from the files')
const C = load({
  maxLevel: 25,
  islandThemes: { city: { chance: 0.3 }, wild: { mods: '/wildmod/i' }, newtheme: { name: 'New' } },
  jjk: { purgeNamespaces: '/^(jujutsucraft)$/' },
  slots: { human: { charm: 9 } },
  logPose: { searchRadii: [500, 900], modes: { extra: { name: 'Extra', kind: 'any' } } },
  powerMastery: { unlock: { sorcery: { advancements: [{ stage: 1, match: '/black_?flash/' }] } } },
  detect: { fruit: { items: '' } },
  skyIslands: { rarity: 'none' }
})
ok(C.maxLevel === 25, 'a number')
const city = C.islandThemes.filter(t => t.id === 'city')[0]
ok(Math.abs(city.chance - 0.3) < 1e-12, 'a theme changed by its id')
ok(isRe(C.islandThemes.filter(t => t.id === 'wild')[0].mods) && C.islandThemes.filter(t => t.id === 'wild')[0].mods.test('WildMod'), 'a regular expression where the default was empty')
ok(C.islandThemes.filter(t => t.id === 'newtheme').length === 1, 'a new id is added')
ok(isRe(C.jjk.purgeNamespaces) && C.jjk.purgeNamespaces.test('jujutsucraft') && !C.jjk.purgeNamespaces.test('malum'), 'regular expressions from text')
ok(C.slots.human.charm === 9 && C.slots.human.ring === 4, 'part of a table changes only that part')
ok(C.logPose.searchRadii.join() === '500,900', 'a list replaces the list')
ok(C.logPose.modes.length === 6 && C.logPose.modes[5].id === 'extra' && C.logPose.modes[0].id === 'next', 'a new Log Pose mode is appended')
const adv = C.powerMastery.unlock.sorcery.advancements
ok(adv.length === 1 && isRe(adv[0].match) && adv[0].match.test('blackflash'), 'regular expressions inside a list of tables')
ok(C.detect.fruit.items === null, 'an empty regular expression = none')
ok(C.sky.enabled === false && C.makeover.sky.enabled === false, 'rarity none: no sky islands, nothing for the scripts to find')

section('config: rarities')
function chances(cfg) { const o = {}; cfg.islandThemes.forEach(t => { if (t.chance) o[t.id] = t.chance }); return o }
const base = chances(plain)
const rare = chances(load({ city: { rarity: 'rare' }, makeover: { rarity: 'common' } }))
ok(Math.abs(rare.city - base.city * 0.5) < 1e-12 && Math.abs(rare.city_future - base.city_future * 0.5) < 1e-12, 'rare cities: half as often')
ok(Math.abs(rare.ember - base.ember * 1.75) < 1e-12, 'common dressed islands: 1.75 times as often')
const num = chances(load({ city: { rarity: 2 } }))
ok(Math.abs(num.city - base.city * 2) < 1e-12, 'a number as the rarity')
ok(!('city' in chances(load({ city: { rarity: 'none' } }))), 'no cities at all')
const lots = chances(load({ city: { rarity: 'very_common' }, makeover: { rarity: 'very_common' } }))
const total = Object.keys(lots).reduce((a, k) => a + lots[k], 0)
ok(Math.abs(total - 0.95) < 1e-9, 'together never more than the whole roll: ' + total)
ok(Math.abs(lots.city / lots.ember - base.city / base.ember) < 1e-9, '...and the proportions are kept')

section('config: sky islands for the scripts')
const sk = load({ skyIslands: { rarity: 'common', height: 200, heightVariation: 10, biome: 'stodd:sky_meadow', extraPlants: 4, landmarks: false } })
ok(sk.sky.enabled === true && sk.sky.minY === 200 - 10 - 28, 'on, and found from just under their height: ' + sk.sky.minY)
ok(sk.makeover.sky.biome === 'stodd:sky_meadow' && sk.makeover.sky.perCell === 4 && sk.makeover.sky.enabled === false, 'biome, extra plants, landmarks off')
ok(plain.makeover.sky.biome === '' && plain.makeover.sky.perCell === 0 && plain.makeover.sky.enabled === true, 'by default: natural biomes, no extra plants, the odd landmark')
const ex = load({ skyIslands: { rarity: 'none', chance: 0.25 } })
ok(ex.sky.enabled === true, 'an exact chance wins over the rarity')
