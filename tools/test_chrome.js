// STODD Chrome: the addon's files hold together, and its script registers the implants with a mock of Project: Edgerunner's
// Ripperdoc registry, builds their powers, reads its config, and runs the dodge and the cheat death.
//   node tools/test_chrome.js
const fs = require('fs'), path = require('path'), vm = require('vm')
const RES = path.join(__dirname, '../chrome/src/main/resources')
let pass = 0, fail = 0
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL: ' + m) } }
function section(s) { console.log('== ' + s) }
const read = p => JSON.parse(fs.readFileSync(path.join(RES, p), 'utf8'))

// what Project: Edgerunner 1.1.2 and Palladium have (read from the jar and from Edgerunner's own recipes)
const PE = ['apogee_overdrive_kernel_t5', 'arms_actuator_matrix_t4', 'arms_power_core_t4', 'ballistic_spine_plate_t3', 'bio_monitor_t2',
  'cooldown_optimizer_t4', 'falcon_overclocker_t4', 'hemo_chamber_t2', 'iconic_skeletal_chassis_t5', 'joint_servo_t1', 'kinetic_actuator_t1',
  'kinetic_damper_frame_t3', 'latency_shunt_t4', 'myofiber_bundle_t2', 'neural_matrix_t4', 'optic_fusion_controller_t4', 'os_core_t5',
  'phase_stabilizer_t3', 'quantum_sync_lattice_t5', 'regen_nanite_scaffold_t5', 'scarab_shell_plate_t2', 'spring_recoil_array_t3',
  'temporal_regulator_t2', 'trauma_booster_module_t4', 'soldering_iron'].map(x => 'project_edgerunner:' + x)
const PALLADIUM = ['heart_shaped_herb', 'lead_circuit', 'quartz_circuit', 'titanium_ingot', 'vibranium_circuit', 'vibranium_flux_capacitor', 'vibranium_ingot']
  .map(x => 'palladium:' + x)
const VANILLA = ['gold_ingot', 'diamond', 'iron_ingot', 'glistering_melon_slice', 'rabbit_foot', 'nether_star', 'echo_shard', 'netherite_ingot',
  'totem_of_undying', 'dragon_breath', 'phantom_membrane'].map(x => 'minecraft:' + x)
const KNOWN = new Set(PE.concat(PALLADIUM, VANILLA))
const BODY_SLOTS = ['os', 'supresors', 'frontal_cortex', 'arms', 'face', 'hands', 'skeleton', 'nervous_system', 'circulatory_system', 'integumentary_system', 'legs']

section('files')
const items = fs.readdirSync(path.join(RES, 'addon/stodd_chrome/items')).map(f => f.replace('.json', ''))
const lang = read('assets/stodd_chrome/lang/en_us.json')
ok(items.length === 11, 'eleven implants: ' + items.length)
items.forEach(id => {
  const it = read('addon/stodd_chrome/items/' + id + '.json')
  ok(it.type === 'palladium:default' && it.max_stack_size === 1 && it.creative_mode_tab === 'project_edgerunner:cyberpunk', id + ': a Palladium item in Edgerunner\'s tab')
  ok(fs.existsSync(path.join(RES, 'assets/stodd_chrome/textures/item/' + id + '.png')), id + ': its icon')
  ok(read('assets/stodd_chrome/models/item/' + id + '.json').textures.layer0 === 'stodd_chrome:item/' + id, id + ': its model')
  ok(typeof lang['item.stodd_chrome.' + id] === 'string' && typeof lang['tailoring.stodd_chrome.' + id] === 'string', id + ': its names')
  const r = read('data/stodd_chrome/recipes/' + id + '_tailoring.json')
  ok(r.type === 'palladium:item_tailoring' && r.tool.item === 'project_edgerunner:soldering_iron' && r.results.chest === 'stodd_chrome:' + id, id + ': assembled at the tailoring bench')
  const unknown = r.ingredients.map(i => i.ingredient.item).filter(x => !KNOWN.has(x))
  ok(unknown.length === 0, id + ': every ingredient exists (' + unknown.join(', ') + ')')
  ok(r.ingredients.length <= 6 && r.ingredients.every(i => i.count >= 1), id + ': at most six kinds of ingredient')
})
const tagged = {}
fs.readdirSync(path.join(RES, 'data/project_edgerunner/tags/items/cyberware')).forEach(f => {
  const t = read('data/project_edgerunner/tags/items/cyberware/' + f)
  ok(t.replace === false, f + ': adds to Edgerunner\'s tag, never replaces it')
  t.values.forEach(v => { tagged[v] = f.replace('.json', '') })
})
ok(items.every(id => tagged['stodd_chrome:' + id]), 'every implant fits a Ripperdoc slot')
const toml = fs.readFileSync(path.join(RES, 'META-INF/mods.toml'), 'utf8')
ok(/modId="stodd_chrome"/.test(toml) && /logoFile="logo.png"/.test(toml) && /modId="project_edgerunner"\s*\nmandatory=true/.test(toml), 'mods.toml: the id, the logo, needs Edgerunner')
ok(fs.statSync(path.join(RES, 'logo.png')).size > 1000, 'a logo')

// ------------------------------------------------------------------ the script, against a mock Edgerunner
const SRC = fs.readFileSync(path.join(RES, 'data/stodd_chrome/kubejs_scripts/stodd_chrome.js'), 'utf8')
function world(opts) {
  opts = opts || {}
  const registered = {}, handlers = {}, files = { ...(opts.files || {}) }, commands = []
  const ctx = {
    console: { info() {}, warn() {}, error(m) { (ctx.errors = ctx.errors || []).push(m) } },
    global: {},
    JsonIO: {
      read: p => files[p] === undefined ? null : JSON.parse(JSON.stringify(files[p])),
      write: (p, o) => { files[p] = JSON.parse(JSON.stringify(o)) }
    },
    Text: { aqua: s => s, red: s => s },
    Java: { loadClass: n => { if (n === 'com.edgerunner.cyberware.CyberwareScriptBridge') return { hasInstalledItem: (e, id) => (e.chrome || []).indexOf(id) >= 0 }; throw new Error(n) } },
    ServerEvents: { highPriorityData: f => (handlers.data = f), loaded: f => (handlers.loaded = f) },
    EntityEvents: { hurt: f => (handlers.hurt = f), death: f => (handlers.death = f) },
    Math: Object.create(Math), Date: { now: () => ctx.now }, JSON, Number, Object, String, isFinite, Error
  }
  ctx.now = 1000000
  ctx.Math.random = () => ctx.rand === undefined ? 0 : ctx.rand
  if (!opts.noRegistry) {
    ctx.global.registerCyberwareInstallComponent = e => {
      if (BODY_SLOTS.indexOf(e.body_slot) < 0) throw new Error('bad body slot ' + e.body_slot)
      if (registered[e.item]) throw new Error('duplicate ' + e.item)
      registered[e.item] = e
    }
    ctx.global.getCyberwareInstallComponentConfig = id => registered[id] || null
  }
  vm.createContext(ctx)
  vm.runInContext(SRC, ctx)
  const added = {}
  if (handlers.data) handlers.data({ addJson: (id, o) => { added[id] = o } })
  return { ctx, registered, handlers, files, added, commands }
}
function player(installed) {
  const pd = {}
  return {
    chrome: installed.map(x => 'stodd_chrome:' + x), username: 'Steve', health: 0, msgs: [], cmds: [],
    isPlayer: () => true,
    persistentData: { getLong: k => pd[k] || 0, putLong: (k, v) => { pd[k] = v } },
    setHealth(h) { this.health = h }, setStatusMessage(m) { this.msgs.push(String(m)) },
    get server() { const self = this; return { runCommandSilent: c => self.cmds.push(c) } }
  }
}
function event(entity, attacker) {
  return { entity, cancelled: false, cancel() { this.cancelled = true },
    source: { getEntity: () => attacker || null, getDirectEntity: () => attacker || null } }
}

section('the Ripperdoc registry')
{
  const w = world()
  const ids = Object.keys(w.registered)
  ok(ids.length === 11, 'all eleven registered: ' + ids.length)
  ids.forEach(id => {
    const e = w.registered[id]
    ok(e.palladium_power === id && e.activation_mode === 'passive' && e.load_cost > 0 && tagged[id] === e.body_slot,
      id + ': the power named like the item, passive, a load, the body slot of its tag')
  })
  const end = ids.filter(id => /kerenzikov|titan|monowire|second_heart|neocortex|apex/.test(id)), mid = ids.filter(id => end.indexOf(id) < 0)
  ok(end.length === 6 && mid.length === 5, 'six endgame, five midgame')
  ok(Math.min(...end.map(id => w.registered[id].load_cost)) > Math.max(...mid.map(id => w.registered[id].load_cost)), 'every endgame implant takes more load than any midgame one')
  ok(Math.max(...end.map(id => w.registered[id].load_cost)) > 90, 'the top ones above Edgerunner\'s Apogee (90)')
  w.handlers.loaded({})
  ok(Object.keys(w.registered).length === 11 && !w.ctx.errors, 'registering again (a /reload) adds no duplicates and no errors')
  const late = world({ noRegistry: true })
  ok(Object.keys(late.registered).length === 0, 'without the registry: nothing, no crash')
}

section('the powers')
{
  const w = world()
  const powers = Object.keys(w.added)
  ok(powers.length === 11 && powers.every(p => /^stodd_chrome:palladium\/powers\//.test(p)), 'one Palladium power per implant')
  const uuids = []
  powers.forEach(p => {
    const pw = w.added[p], abs = Object.values(pw.abilities)
    ok(abs.length > 0 && abs.every(a => a.conditions.enabling[0].type === 'palladium:true'), p + ': abilities, always on')
    abs.filter(a => a.type === 'palladium:attribute_modifier').forEach(a => {
      uuids.push(a.uuid)
      ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(a.uuid) && [0, 1, 2].indexOf(a.operation) >= 0 && a.amount > 0, p + ': a valid modifier ' + a.attribute)
    })
  })
  ok(new Set(uuids).size === uuids.length, 'every modifier has its own UUID (' + uuids.length + ')')
  const neo = w.added['stodd_chrome:palladium/powers/apex_sprint_actuators']
  ok(Object.values(neo.abilities).some(a => a.type === 'palladium:damage_immunity' && a.damage_sources[0] === 'minecraft:is_fall'), 'Apex Sprint Actuators: no fall damage')
  ok(Object.values(w.added['stodd_chrome:palladium/powers/second_heart'].abilities).some(a => a.type === 'palladium:healing'), 'Second Heart: heals')
}

section('the config')
{
  const w = world()
  const f = w.files['config/stodd/chrome.json']
  ok(f && f.implants && Object.keys(f.implants).length === 11 && f.dodgeChance === 0.2, 'written with the defaults the first time')
  const w2 = world({ files: { 'config/stodd/chrome.json': { dodgeChance: 0.5, implants: { monowire_grips: { strength: 2, load: 120 }, grip_servos: { enabled: false }, lynx_tendons: { load: 'lots' } } } } })
  ok(w2.registered['stodd_chrome:monowire_grips'].load_cost === 120, 'a load from the file')
  ok(!w2.registered['stodd_chrome:grip_servos'], 'an implant switched off cannot be installed')
  ok(w2.registered['stodd_chrome:lynx_tendons'].load_cost === 20, 'a value of the wrong kind: the default')
  const dmg = Object.values(w2.added['stodd_chrome:palladium/powers/monowire_grips'].abilities).filter(a => a.attribute === 'minecraft:generic.attack_damage')
  ok(dmg[0].amount === 12, 'strength 2 doubles what it gives: ' + dmg[0].amount)
  ok(w2.files['config/stodd/chrome.json'].dodgeChance === 0.5, 'a file someone edited is left alone')
}

section('Kerenzikov dodge')
{
  const w = world()
  const p = player(['kerenzikov_reflex_core']), zombie = { id: 'zombie' }
  w.ctx.rand = 0.1
  let e = event(p, zombie); w.handlers.hurt(e)
  ok(e.cancelled && p.msgs.length === 1 && p.cmds.some(c => /playsound/.test(c) && /Steve/.test(c)), 'a hit slipped (20% chance rolled), with a sound')
  e = event(p, zombie); w.handlers.hurt(e)
  ok(!e.cancelled, 'not again within 3 s')
  w.ctx.now += 3100
  e = event(p, zombie); w.handlers.hurt(e)
  ok(e.cancelled, 'again after 3 s')
  w.ctx.now += 5000; w.ctx.rand = 0.5
  e = event(p, zombie); w.handlers.hurt(e)
  ok(!e.cancelled, 'not when the roll misses')
  w.ctx.rand = 0.1
  e = event(p, null); w.handlers.hurt(e)
  ok(!e.cancelled, 'not against a fall or fire (no attacker)')
  e = event(player([]), zombie); w.handlers.hurt(e)
  ok(!e.cancelled, 'not without the implant')
}

section('Second Heart')
{
  const w = world()
  const p = player(['second_heart'])
  let e = event(p); w.handlers.death(e)
  ok(e.cancelled && p.health === 8 && p.cmds.filter(c => /^effect give Steve/.test(c)).length === 3, 'a killing blow: standing at 8 health, resistance, regeneration, absorption')
  e = event(p); w.handlers.death(e)
  ok(!e.cancelled, 'not twice within 3 minutes')
  w.ctx.now += 181000
  e = event(p); w.handlers.death(e)
  ok(e.cancelled, 'again after 3 minutes')
  e = event(player([])); w.handlers.death(e)
  ok(!e.cancelled, 'not without it')
}

console.log('STODD Chrome: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
