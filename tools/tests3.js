// New in 2.1.0: power mastery (22_mastery.js): the level opens Haki, Devil Fruit, Cursed Energy and Dark Magic, and level 20 opens everything.
const fs = require('fs'), path = require('path'), vm = require('vm')
const H = require('./harness.js')
const { ok, section } = H
const DIR = process.argv[2]
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9)

function load(name) { vm.runInThisContext(fs.readFileSync(path.join(DIR, name), 'utf8'), { filename: name }) }
function mkText() {
  const mk = s => { const o = { s: String(s), append(x) { o.s += x.s; return o }, color() { return o } }; return o }
  return new Proxy({}, { get: () => mk })
}
const ADVS = ['jujutsucraft:simple_domain', 'jujutsucraft:reverse_cursed_technique', 'jujutsucraft:domain_expansion', 'jujutsucraft:black_flash', 'jujutsucraft:story/root',
  'true_prime_piece:haki/ken', 'true_prime_piece:haki/buso', 'true_prime_piece:haki/hao', 'true_prime_piece:awakening_gura', 'true_prime_piece:token_collector',
  'malum:story/root', 'minecraft:story/mine_stone']

// a fresh copy of the scripts: config, util, stubs for what the real level/origin scripts provide, then 22_mastery.js
function setup(opts) {
  opts = opts || {}
  const HANDLERS = []
  global.PlayerEvents = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: 'P.' + String(k), fn: fn }) }) })
  global.ServerEvents = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: 'S.' + String(k), fn: fn }) }) })
  global.EntityEvents = global.PlayerEvents; global.BlockEvents = global.PlayerEvents; global.ItemEvents = global.PlayerEvents
  global.Text = mkText()
  global.stodd = undefined
  load('00_config.js')
  const S = global.stodd, C = S.cfg
  if (opts.mutate) opts.mutate(C)
  load('05_util.js')
  S.log = () => { }
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  S.isBoss = e => !!e.__boss
  S.typeObj = e => ({ getCategory: () => e.__cat || 'creature' })
  S.capFor = (lvl, o) => 100 + 400 * (Math.min(lvl, 20) - 1) / 19
  const cmds = []
  const server = {
    runCommandSilent(c) { cmds.push(c); return 1 }, scheduleInTicks(n, fn) { fn() }, tell() { },
    getAdvancements: () => ({ getAllAdvancements: () => ADVS.map(id => ({ getId: () => id })) })
  }
  S.applied = 0
  if (!opts.noStubs) {
    S.applyStats = function (p) { S.applied++ }
    S.lockPath = function (p, sys) { S.data(p).putString('path', sys) }
  }
  if (opts.before) opts.before(S)
  load('22_mastery.js')
  const find = n => HANDLERS.filter(h => h.name === n)
  function player(origin, level, o) {
    o = o || {}
    const msgs = []
    const p = {
      username: o.name || 'Tester', age: 100, server: server, msgs: msgs,
      getTags: () => ({ contains: t => origin != null && t === 'stodd_o_' + origin }),
      isPlayer: () => true, isCreative: () => !!o.creative, isSpectator: () => false, isLiving: () => true,
      tell: m => msgs.push(m.s), setStatusMessage: m => msgs.push('status:' + m.s),
      getMaxHealth: () => o.maxHealth || 100, getHealth: () => 20, setHealth() { }, getAttributeValue: () => o.armor || 0
    }
    S.data(p).putInt('lvl', level)
    if (o.path) S.data(p).putString('path', o.path)
    return p
  }
  return { S: S, C: C, M: C.powerMastery, cmds: cmds, server: server, find: find, player: player, handlers: HANDLERS }
}
const grants = cmds => cmds.filter(c => /^advancement grant /.test(c)).map(c => c.split(' ').pop())
const jjc = cmds => grants(cmds).filter(g => /^jujutsucraft:/.test(g))

// ================================================================ the table itself
section('mastery: configuration')
{
  const T = setup()
  const { C, M } = T
  ok(M.stageLevels.length === M.stageNames.length && M.stageLevels.length === 5, 'five stages, five names')
  ok(M.stageLevels.every((l, i) => i === 0 || l > M.stageLevels[i - 1]), 'stage levels strictly increase')
  ok(M.stageLevels[0] === 1, 'the first stage is open from level 1')
  const full = M.stageLevels[M.stageLevels.length - 1]
  ok(full === C.maxLevel, 'the last stage opens at the normal level cap (' + full + ')')
  ok(C.origins.every(o => T.S.maxLevelOf(o) >= full), 'every origin can reach the full level (the Weakling too)')
  const last = M.stageLevels.length - 1
  ok(M.haki.observation.fromStage >= 1 && M.haki.observation.fromStage <= last, 'Observation starts inside the stages')
  ok(M.haki.armament.fromStage >= 1 && M.haki.armament.fromStage <= last, 'Armament starts inside the stages')
  ok(M.haki.conqueror.fromStage === last, "Conqueror's opens at the last stage only")
  ok(M.haki.observation.dodgeMax > 0 && M.haki.observation.dodgeMax < 0.5, 'dodge chance is modest')
  ok(M.haki.armament.reductionMax > 0 && M.haki.armament.reductionMax < 0.5, 'hardening is modest')
  ok(Object.keys(M.systems).every(k => k === 'haki' || C.systems.indexOf(k) >= 0), 'every mastery system is haki or a power system the rules know')
  ok(C.systems.every(k => M.systems[k] != null), 'every power system has a mastery entry')
  ok(Object.keys(M.systems).every(k => ['all', 'rule'].indexOf(M.systems[k].who) >= 0), 'who is "all" or "rule"')
  let good = true
  Object.keys(M.unlock).forEach(sys => {
    const U = M.unlock[sys]
    if (!(U.namespaces instanceof RegExp) || M.systems[sys] == null) good = false
    ;['advancements', 'commands', 'variables'].forEach(k => { if (!Array.isArray(U[k])) good = false })
    U.advancements.forEach(a => { if (!(a.match instanceof RegExp) || a.stage < 0 || a.stage > last) good = false })
    U.commands.forEach(c => { if (typeof c.run !== 'string' || c.stage < 0 || c.stage > last) good = false })
    U.variables.forEach(v => { if (!v.name || !(v.atLeast >= 0) || v.stage < 0 || v.stage > last) good = false })
  })
  ok(good, 'every unlock entry is well formed')
  // the patterns accept what they are meant for and refuse look-alikes
  const sor = M.unlock.sorcery.advancements, hk = M.unlock.haki.advancements
  const hit = (list, stage, s) => list.some(a => a.stage === stage && a.match.test(s))
  ok(hit(sor, 2, 'simple_domain') && hit(sor, 3, 'reverse_cursed_technique') && hit(sor, 3, 'rct') && hit(sor, 4, 'domain_expansion') && hit(sor, 4, 'black_flash'), 'cursed-energy patterns match their advancements')
  ok(!hit(sor, 3, 'secret_tech') && !hit(sor, 4, 'story/root'), 'cursed-energy patterns refuse look-alikes')
  ok(hit(hk, 1, 'haki/ken') && hit(hk, 1, 'ken_ability') && hit(hk, 2, 'haki/buso') && hit(hk, 4, 'haki/hao'), 'Haki patterns match')
  ok(!hit(hk, 1, 'token_collector') && !hit(hk, 1, 'broken_arrow') && !hit(hk, 4, 'chao'), 'Haki patterns do not match words that merely contain ken / hao')
}

// ================================================================ stages and who has what
section('mastery: stages and ownership')
{
  const T = setup(), { S, C, M } = T
  const expect = { 1: 0, 4: 0, 5: 1, 9: 1, 10: 2, 14: 2, 15: 3, 19: 3, 20: 4, 21: 4, 35: 4 }
  Object.keys(expect).forEach(l => ok(S.masteryStage(+l) === expect[l], 'level ' + l + ' is stage ' + expect[l] + ' (got ' + S.masteryStage(+l) + ')'))
  const has = (o, path) => T.S.masterySystems(T.player(o, 20, { path: path })).join(',')
  ok(has('human') === 'haki', 'Standard Human: Haki only')
  ok(has('devil_fruit_user') === 'haki,fruit', 'Devil Fruit User: Haki, Devil Fruit')
  ok(has('cyberware_user') === 'haki,fruit', 'Cyberware User: Haki, Devil Fruit')
  ok(has('sorcerer') === 'haki,sorcery', 'Sorcerer: Haki, Cursed Energy')
  ok(has('brawler') === 'haki,sorcery', 'Brawler: Haki, Cursed Energy')
  ok(has('dark_magician') === 'haki,fruit,magic', 'Dark Magician: Haki, Devil Fruit, Dark Magic')
  ok(has('weakling') === 'haki', 'Weakling: Haki only')
  ok(has('skyborn') === 'haki', 'Skyborn: Haki only')
  ok(has('swordsman') === 'haki' && has('marksman') === 'haki', 'a path origin holds no path system before it chooses one')
  ok(has('swordsman', 'fruit') === 'haki,fruit' && has('swordsman', 'sorcery') === 'haki,sorcery', 'the Swordsman has exactly the path it chose')
  ok(has('marksman', 'sorcery') === 'haki,sorcery', 'the Marksman has exactly the path it chose')
  ok(T.S.masterySystems(T.player(null, 20)).length === 0, 'no origin chosen: nothing')
  ok(C.origins.every(o => T.S.masteryHas(T.player(o, 1), 'haki')), 'every origin has Haki')
}

// ================================================================ level 20 opens everything, for everybody
section('mastery: level 20 is full access')
{
  const T = setup(), { S, C, M } = T
  const PATHS = { swordsman: ['fruit', 'sorcery'], marksman: ['fruit', 'sorcery'] }
  C.origins.forEach(o => {
    const variants = PATHS[o] || [null]
    variants.forEach(path => {
      ;[20, 35].forEach(lvl => {
        if (lvl > S.maxLevelOf(o)) return
        const p = T.player(o, lvl, { path: path })
        const sys = S.masterySystems(p)
        ok(sys.length >= 1 && sys.every(k => S.masteryStageOf(p) === 4), o + (path ? '/' + path : '') + ' at level ' + lvl + ': every system is at the last stage')
        ok(S.hakiFrac(p, 'observation') === 1 && S.hakiFrac(p, 'armament') === 1 && S.hakiFrac(p, 'conqueror') === 1, o + ' at level ' + lvl + ': all three Haki strengths at 100 %')
      })
    })
  })
  const w19 = T.player('weakling', 19), w20 = T.player('weakling', 20)
  ok(S.hakiFrac(w19, 'conqueror') === 0 && S.hakiFrac(w20, 'conqueror') === 1, "the Weakling gets Conqueror's at level 20, not at 19")
  ok(S.maxLevelOf('weakling') === 35, 'the Weakling still has its own cap of 35 (levels 21-35 are stats only)')
  // below the full level, Haki grows in equal steps
  const f = (lvl, k) => S.hakiFrac(T.player('human', lvl), k)
  ok(f(1, 'observation') === 0 && f(4, 'observation') === 0, 'Observation sleeps before level 5')
  ok(near(f(5, 'observation'), 0.25) && near(f(10, 'observation'), 0.5) && near(f(15, 'observation'), 0.75) && f(20, 'observation') === 1, 'Observation: a quarter at level 5, half at 10, three quarters at 15, all at 20')
  ok(f(5, 'armament') === 0 && f(9, 'armament') === 0, 'Armament sleeps before level 10')
  ok(near(f(10, 'armament'), 1 / 3) && near(f(15, 'armament'), 2 / 3) && f(20, 'armament') === 1, 'Armament: a third at level 10, two thirds at 15, all at 20')
  ok(f(19, 'conqueror') === 0 && f(20, 'conqueror') === 1, "Conqueror's only at the last stage")
  // each trait line that grows with level reaches its maximum exactly at the full level (the Weakling keeps growing)
  C.origins.forEach(o => {
    const a = S.traitLines(o, 1).join('|'), b = S.traitLines(o, 20).join('|'), c = S.traitLines(o, 35).join('|')
    if (C.traits[o] && (C.traits[o].allPerLevel || C.traits[o].allQuad || C.traits[o].swordPerLevel || C.traits[o].projectilePerLevel || C.traits[o].unarmedFlatPerLevel || C.traits[o].divePerLevel)) {
      ok(a !== b, o + ': its mastery traits have grown by level 20 (' + b + ')')
      ok(o === 'weakling' ? (b !== c && S.maxLevelOf(o) === 35) : S.maxLevelOf(o) === 20, o + ': ' + (o === 'weakling' ? 'its traits keep growing past 20, up to its own cap of 35' : 'its level stops at 20, so its traits peak exactly at the full level'))
    }
  })
}

// ================================================================ native Haki in combat
section('mastery: Observation (dodge)')
{
  const T = setup(), { S, M } = T
  const mon = { isPlayer: () => false }
  function attack(p, att, rnd) {
    S.rand = () => rnd
    let canceled = false
    const ev = { getEntity: () => p, getSource: () => ({ getActual: () => att, getImmediate: () => att }), setCanceled: () => { canceled = true } }
    global.stoddAttacked(ev)
    return canceled
  }
  const chance = { 5: 0.03, 10: 0.06, 15: 0.09, 20: 0.12 }
  Object.keys(chance).forEach(l => {
    const p = T.player('human', +l)
    ok(attack(p, mon, chance[l] - 0.004) === true, 'level ' + l + ': a roll just under ' + chance[l] + ' dodges')
    ok(attack(p, mon, chance[l] + 0.004) === false, 'level ' + l + ': a roll just over ' + chance[l] + ' does not')
  })
  ok(attack(T.player('human', 4), mon, 0) === false, 'level 4: no dodging at all, even on the luckiest roll')
  ok(attack(T.player('human', 20), null, 0) === false, 'falling, fire, the void (no attacker) cannot be dodged')
  const self = T.player('human', 20)
  ok(attack(self, self, 0) === false, 'your own damage is not dodged')
  ok(attack(T.player('human', 20, { creative: true }), mon, 0) === false, 'creative players are left alone')
  ok(attack(T.player(null, 20), mon, 0) === false, 'no origin: no Haki')
  // a dodge tells the player
  const p = T.player('human', 20)
  attack(p, mon, 0)
  ok(p.msgs.some(m => /slipped/.test(m)), 'a dodge says so')
  ok(T.cmds.some(c => /playsound/.test(c)), 'a dodge plays a sound')
  // over many rolls the dodge rate is the configured one
  S.rand = Math.random
  let n = 0, N = 20000
  const q = T.player('human', 20)
  for (let i = 0; i < N; i++) { const ev = { getEntity: () => q, getSource: () => ({ getActual: () => mon, getImmediate: () => mon }), setCanceled: () => { n++ } }; global.stoddAttacked(ev) }
  ok(Math.abs(n / N - 0.12) < 0.012, 'at level 20 about 12 % of hits are slipped (' + (100 * n / N).toFixed(1) + ' %)')
}

section('mastery: Armament (hardening and armour piercing)')
{
  const T = setup(), { S } = T
  const mob = armor => ({ isPlayer: () => false, isLiving: () => true, getMaxHealth: () => 20, getAttributeValue: () => armor })
  function hurt(victim, att, direct, amount) {
    const ev = { amount: amount, getEntity: () => victim, getSource: () => ({ getActual: () => att, getImmediate: () => direct }), getAmount: () => ev.amount, setAmount: a => { ev.amount = a } }
    S.hakiOnHurt(ev)
    return ev.amount
  }
  const z = mob(0)
  ;[[9, 100], [10, 96], [15, 92], [20, 88]].forEach(c => ok(near(hurt(T.player('human', c[0]), z, z, 100), c[1], 1e-6), 'level ' + c[0] + ': a 100 damage hit from a creature becomes ' + c[1]))
  ok(hurt(T.player('human', 20), null, null, 100) === 100, 'damage with no creature behind it is not softened')
  const e = T.player('human', 20)
  ok(hurt(e, e, e, 100) === 100, 'your own damage is not softened')
  // offence: melee only
  const atk = T.player('human', 20)
  ok(near(hurt(mob(10), atk, atk, 10), 13), 'level 20 melee against armour 10: +3 (10 -> 13)')
  ok(near(hurt(mob(30), atk, atk, 10), 16), 'armour above 20 counts as 20: +6 (10 -> 16)')
  ok(hurt(mob(10), atk, mob(0), 10) === 10, 'a projectile (the direct attacker is not the player) does not pierce')
  const pet = { isPlayer: () => false, getOwner: () => atk }
  ok(hurt(mob(10), pet, pet, 10) === 10, 'pets and summons do not pierce')
  const lv10 = T.player('human', 10)
  ok(near(hurt(mob(10), lv10, lv10, 10), 11), 'level 10: a third of the piercing (+1 against armour 10)')
  const lv9 = T.player('human', 9)
  ok(hurt(mob(10), lv9, lv9, 10) === 10, 'level 9: no piercing yet')
  ok(hurt(mob(0), atk, atk, 10) === 10, 'against no armour nothing is added')
}

section('mastery: the hurt hook runs after the traits')
{
  const T = setup(), { S } = T
  load('30_combat.js')
  const mob = armor => ({ isPlayer: () => false, isLiving: () => true, getMaxHealth: () => 20, getAttributeValue: () => armor, getPersistentData: () => new H.MockCompound() })
  function hurt(victim, att, direct, amount) {
    const ev = { amount: amount, getEntity: () => victim, getSource: () => ({ getActual: () => att, getImmediate: () => direct }), getAmount: () => ev.amount, setAmount: a => { ev.amount = a } }
    global.stoddHurt(ev)
    return ev.amount
  }
  const human = T.player('human', 20)
  ok(near(hurt(mob(10), human, human, 10), 13), 'stoddHurt: the Human (no traits) still gets Armament piercing')
  const sorc = T.player('sorcerer', 20)
  const traits = 10 * (1 + 0.015 * 19)
  ok(near(hurt(mob(10), sorc, sorc, 10), traits + 3, 1e-6), 'stoddHurt: the Sorcerer gets the trait multiplier, then the piercing on top (' + (traits + 3).toFixed(2) + ')')
  const victim = T.player('human', 20)
  ok(near(hurt(victim, mob(0), mob(0), 50), 44), 'stoddHurt: a Haki user takes 12 % less from a creature')
  S.hakiOnHurt = function () { throw new Error('boom') }
  ok(hurt(mob(0), human, human, 10) >= 10, 'a failing Haki hook never breaks damage')
}

section("mastery: Conqueror's aura")
{
  const T = setup(), { S } = T
  const eff = []
  const ent = (cat, hp, boss) => ({ isPlayer: () => false, isLiving: () => true, __cat: cat, __boss: !!boss, getMaxHealth: () => hp, potionEffects: { add: (id, t, a) => eff.push(id + '@' + hp + cat + (boss ? 'B' : '')) } })
  const zombie = ent('monster', 20), skel = ent('monster', 40), cow = ent('creature', 10), boss = ent('monster', 20, true), tough = ent('monster', 80), villager = ent('misc', 10)
  const other = { isPlayer: () => true, isLiving: () => true, potionEffects: { add: () => eff.push('PLAYER') } }
  function me(level) {
    const p = T.player('human', level)
    p.level = { getEntitiesWithin: () => [p, zombie, skel, cow, boss, tough, villager, other] }
    p.boundingBox = { inflate: () => ({}) }
    return p
  }
  const p20 = me(20)
  ok(S.conquerPulse(p20) === 2, "two weak hostile mobs are caught (max health 20 and 40 against a limit of 50)")
  ok(eff.indexOf('minecraft:weakness@20monster') >= 0 && eff.indexOf('minecraft:slowness@40monster') >= 0, 'they get Weakness and Slowness')
  ok(!eff.some(e => /creature|misc|B$|PLAYER|@80/.test(e)), 'animals, villagers, bosses, other players and strong mobs are left alone')
  // through the tick handler
  eff.length = 0
  const tick = T.find('P.tick')
  p20.age = 49; tick.forEach(h => h.fn({ player: p20 }))
  ok(eff.length === 4, 'the tick handler pulses on its beat (' + eff.length + ' effects)')
  eff.length = 0
  p20.age = 50; tick.forEach(h => h.fn({ player: p20 }))
  ok(eff.length === 0, 'and not between beats')
  const p19 = me(19)
  p19.age = 49; tick.forEach(h => h.fn({ player: p19 }))
  ok(eff.length === 0, "level 19: no aura yet")
  // a target cap
  const crowd = []
  for (let i = 0; i < 60; i++) crowd.push(ent('monster', 10))
  const pc = T.player('human', 20)
  pc.level = { getEntitiesWithin: () => crowd }; pc.boundingBox = { inflate: () => ({}) }
  eff.length = 0
  ok(S.conquerPulse(pc) === T.M.haki.conqueror.maxTargets, 'at most ' + T.M.haki.conqueror.maxTargets + ' mobs are touched per pulse')
  // no entity query available: quiet failure
  const px = T.player('human', 20)
  const warns = []
  const realWarn = console.warn
  console.warn = m => warns.push(String(m))
  ok(S.conquerPulse(px) === 0, 'without an entity query the pulse does nothing and does not throw')
  S.conquerPulse(px); S.conquerPulse(px)
  console.warn = realWarn
  ok(warns.length === 1 && /Conqueror/.test(warns[0]), 'and the log says so, once')
}

// ================================================================ opening the other mods' powers
section('mastery: unlocking through advancements')
{
  const T = setup(), { S, M } = T
  const sorc = T.player('sorcerer', 1)
  S.syncMastery(sorc, false)
  ok(grants(T.cmds).length === 0, 'level 1: nothing is granted')
  const lvl = l => { S.data(sorc).putInt('lvl', l); T.cmds.length = 0; return S.syncMastery(sorc, false) }
  lvl(5)
  ok(jjc(T.cmds).length === 0, 'level 5 (Awakened): the Cursed Energy advancements start at Honed')
  lvl(10)
  ok(jjc(T.cmds).join() === 'jujutsucraft:simple_domain', 'level 10 (Honed): Simple Domain (' + jjc(T.cmds).join() + ')')
  ok(/advancement grant Tester only jujutsucraft:simple_domain/.test(T.cmds.join('\n')), 'the grant is a plain advancement command for the player')
  lvl(15)
  ok(jjc(T.cmds).join() === 'jujutsucraft:reverse_cursed_technique', 'level 15 (Refined): Reverse Cursed Technique')
  lvl(20)
  ok(jjc(T.cmds).sort().join() === 'jujutsucraft:black_flash,jujutsucraft:domain_expansion', 'level 20 (Mastered): Domain Expansion and Black Flash')
  ok(!grants(T.cmds).some(g => /story\/root|minecraft:/.test(g)), 'unrelated advancements are never granted')
  // a player who is already high gets every earlier stage in one go, and hears about it once
  const late = T.player('sorcerer', 20, { name: 'Late' })
  T.cmds.length = 0
  S.syncMastery(late, false)
  ok(jjc(T.cmds).sort().join() === ['jujutsucraft:black_flash', 'jujutsucraft:domain_expansion', 'jujutsucraft:reverse_cursed_technique', 'jujutsucraft:simple_domain'].join(), 'a level 20 player with no record gets all four Cursed Energy unlocks')
  const said = late.msgs.filter(m => /Mastered/.test(m))
  ok(said.length === 2, 'one Mastered line each for Haki and Cursed Energy (' + said.length + ')')
  ok(late.msgs.filter(m => /fully open/.test(m)).length === 1, 'and one "every power you hold is now fully open" line')
  ok(late.msgs.some(m => /Simple Domain/.test(m) && /Domain Expansion/.test(m)), 'the Cursed Energy line names what it unlocked')
  const before = late.msgs.length, cb = T.cmds.length
  S.syncMastery(late, false)
  ok(late.msgs.length === before && T.cmds.length === cb, 'a second sync changes nothing and says nothing')
  // force repeats the safe grants only
  T.cmds.length = 0
  S.syncMastery(late, true)
  ok(jjc(T.cmds).length === 4 && late.msgs.length === before, 'a forced sync repeats the four grants silently')
  // not for origins that do not hold the system
  const hum = T.player('human', 20, { name: 'Hum' })
  T.cmds.length = 0
  S.syncMastery(hum, true)
  ok(!grants(T.cmds).some(g => /jujutsucraft/.test(g)), 'a Human is granted no Cursed Energy unlocks')
  ok(!grants(T.cmds).some(g => /awakening/.test(g)), 'and no Devil Fruit unlocks')
  // Haki's own mod unlocks (True Prime Piece)
  const g = grants(T.cmds)
  ok(['true_prime_piece:haki/ken', 'true_prime_piece:haki/buso', 'true_prime_piece:haki/hao'].every(x => g.indexOf(x) >= 0), 'Haki also grants the matching True Prime Piece advancements')
  ok(g.indexOf('true_prime_piece:token_collector') < 0, 'but not look-alike advancements')
  // devil fruit awakening at the last stage only
  const dfu = T.player('devil_fruit_user', 15, { name: 'Dfu' })
  T.cmds.length = 0; S.syncMastery(dfu, false)
  ok(grants(T.cmds).indexOf('true_prime_piece:awakening_gura') < 0, 'level 15: no Devil Fruit awakening yet')
  S.data(dfu).putInt('lvl', 20); T.cmds.length = 0; S.syncMastery(dfu, false)
  ok(grants(T.cmds).indexOf('true_prime_piece:awakening_gura') >= 0, 'level 20: the Devil Fruit awakening is granted')
  // creative players and no origin
  T.cmds.length = 0
  ok(S.syncMastery(T.player(null, 20), true) === 0 && T.cmds.length === 0, 'no origin: nothing happens')
}

section('mastery: paths')
{
  const T = setup(), { S } = T
  const sw = T.player('swordsman', 20, { name: 'Sw' })
  S.syncMastery(sw, false)
  ok(grants(T.cmds).filter(g => /jujutsucraft|awakening/.test(g)).length === 0, 'an undecided Swordsman gets neither Cursed Energy nor Devil Fruit unlocks')
  T.cmds.length = 0
  S.lockPath(sw, 'fruit')
  ok(grants(T.cmds).indexOf('true_prime_piece:awakening_gura') >= 0, 'choosing the Devil Fruit path opens its stages at once')
  ok(grants(T.cmds).filter(g => /jujutsucraft/.test(g)).length === 0, 'the other path stays closed')
  const mk = T.player('marksman', 20, { name: 'Mk' })
  T.cmds.length = 0
  S.lockPath(mk, 'sorcery')
  ok(grants(T.cmds).length >= 4, 'the Marksman who chooses Cursed Energy gets its unlocks')
}

section('mastery: commands run once')
{
  const T = setup({ mutate: C => { C.powerMastery.unlock.sorcery.commands.push({ stage: 3, run: 'say hello {p}' }); C.powerMastery.unlock.sorcery.commands.push({ stage: 0, run: 'say first {p}' }) } })
  const { S } = T
  const p = T.player('sorcerer', 15, { name: 'Cmd' })
  S.syncMastery(p, false)
  ok(T.cmds.filter(c => c === 'say hello Cmd').length === 1 && T.cmds.filter(c => c === 'say first Cmd').length === 1, 'stage commands run, with the player name filled in')
  S.syncMastery(p, false); S.syncMastery(p, true); S.syncMastery(p, true)
  ok(T.cmds.filter(c => c === 'say hello Cmd').length === 1, 'and never again, not even on a forced sync')
  S.data(p).putInt('lvl', 20); S.syncMastery(p, false)
  ok(T.cmds.filter(c => c === 'say hello Cmd').length === 1, 'a later stage does not repeat an earlier stage command')
}

section('mastery: hooks and catch-up')
{
  const T = setup(), { S } = T
  const p = T.player('sorcerer', 1, { name: 'Hook' })
  S.applyStats(p)
  ok(S.applied === 1, 'the original applyStats still runs')
  ok(p.msgs.some(m => /Dormant/.test(m)), 'applyStats opens stage 0 (Dormant) for a new player')
  S.data(p).putInt('lvl', 5); S.applyStats(p)
  ok(p.msgs.some(m => /Awakened/.test(m)), 'a level change announces the new stage')
  // catch-up tick
  const q = T.player('sorcerer', 20, { name: 'Catch' })
  const tick = T.find('P.tick')
  q.age = 13; tick.forEach(h => h.fn({ player: q }))
  ok(q.msgs.length === 0, 'between beats the catch-up does nothing')
  q.age = 211; tick.forEach(h => h.fn({ player: q }))
  ok(q.msgs.some(m => /Mastered/.test(m)), 'on its beat the catch-up brings a player who is behind their level up to date')
  // login repeats the safe grants
  const r = T.player('sorcerer', 20, { name: 'Login' })
  S.syncMastery(r, false)
  T.cmds.length = 0
  T.find('P.loggedIn').forEach(h => h.fn({ player: r, server: T.server }))
  ok(grants(T.cmds).length >= 4, 'logging in repeats the grants')
}

section('mastery: with the real level, origin and power scripts')
{
  const T = setup({
    noStubs: true,
    before: S => {
      S.typeObj = e => ({ getCategory: () => e.__cat || 'creature' })
      load('10_origins.js'); load('15_powers.js'); load('20_levels.js')
      S.typeObj = e => ({ getCategory: () => e.__cat || 'creature' })
      S.isBoss = e => !!e.__boss
    }
  })
  const { S, C } = T
  ok(typeof S.setLevel === 'function' && typeof S.addXp === 'function', 'the real level script loaded')
  // a sorcerer climbs from 1 to 20 on kill XP alone
  const p = T.player('sorcerer', 1, { name: 'Real' })
  p.getAttribute = () => null; p.getPersistentData = () => new H.MockCompound(); p.getInventory = () => ({ getContainerSize: () => 0 })
  S.addXp(p, 1)
  const stage = () => S.data(p).getInt('mst_haki')
  ok(S.data(p).getInt('lvl') === 1, 'one point of XP does not level')
  S.addXp(p, S.totalToReach(5, 'sorcerer'))
  ok(S.getLevel(p) === 5 && stage() === 1 && S.data(p).getInt('mst_sorcery') === 1, 'real XP to level 5 reaches stage 1 in both systems')
  S.addXp(p, S.need(5, 'sorcerer') + S.need(6, 'sorcerer') + S.need(7, 'sorcerer') + S.need(8, 'sorcerer') + S.need(9, 'sorcerer'))
  ok(S.getLevel(p) === 10 && stage() === 2, 'level 10 is stage 2 (Honed)')
  ok(grants(T.cmds).indexOf('jujutsucraft:simple_domain') >= 0, 'and Simple Domain was granted on the way')
  S.setLevel(p, 20, 0)
  ok(S.getLevel(p) === 20 && stage() === 4 && S.data(p).getInt('mst_sorcery') === 4, 'setlevel 20 opens everything')
  ok(S.data(p).getBoolean('mst_full'), 'and records that the player is fully open')
  ok(grants(T.cmds).indexOf('jujutsucraft:domain_expansion') >= 0, 'Domain Expansion is granted')
  // the Weakling reaches full access at 20, not at 35
  const w = T.player('weakling', 1, { name: 'Weak' })
  w.getAttribute = () => null; w.getPersistentData = () => new H.MockCompound(); w.getInventory = () => ({ getContainerSize: () => 0 })
  S.setLevel(w, 20, 0)
  ok(S.data(w).getInt('mst_haki') === 4 && S.hakiFrac(w, 'conqueror') === 1, 'the Weakling is fully open at level 20')
  S.setLevel(w, 35, 0)
  ok(S.getLevel(w) === 35 && S.data(w).getInt('mst_haki') === 4, 'and stays so up to 35')
  // /stodd and /stodd mastery
  const hs = T.find('S.commandRegistry')
  ok(hs.length >= 2, 'level and mastery commands register (' + hs.length + ')')
}

section('mastery: Jujutsu Craft variables')
{
  const T = setup({
    mutate: C => {
      C.powerMastery.unlock.sorcery.variables.push({ stage: 3, name: 'PlayerCursePowerMAX', atLeast: 500 })
      C.powerMastery.unlock.sorcery.variables.push({ stage: 3, name: 'NoSuchVariable', atLeast: 9 })
    },
    before: S => {
      S.canUse = () => true; S.denyText = () => ''
      load('15_powers.js')
    }
  })
  const { S } = T
  function mk(max) {
    const cap = { PlayerCursePowerMAX: max, synced: 0, syncPlayerVariables() { cap.synced++ } }
    const p = T.player('sorcerer', 15, { name: 'Jjc' })
    p.getCapability = () => ({ resolve: () => ({ isPresent: () => true, get: () => cap }) })
    p.cap = cap
    return p
  }
  const a = mk(100)
  S.syncMastery(a, false)
  ok(a.cap.PlayerCursePowerMAX === 500 && a.cap.synced === 1, 'a low cursed energy pool is raised to the stage floor and synced')
  ok(a.cap.NoSuchVariable === undefined, 'a variable the mod does not have is not invented')
  ok(a.msgs.some(m => /PlayerCursePowerMAX/.test(m)), 'the raise is named in the announcement')
  const b = mk(900)
  S.syncMastery(b, false)
  ok(b.cap.PlayerCursePowerMAX === 900 && b.cap.synced === 0, 'a bigger pool is never lowered')
  const names = S.jjcVarNames(Object.assign(mk(1), { getCapability: () => ({ resolve: () => ({ isPresent: () => true, get: () => ({ getClass: () => ({ getFields: () => [{ getName: () => 'PlayerCurseTechnique' }, { getName: () => 'PlayerCursePowerMAX' }] }) }) }) }) }))
  ok(names && names.join() === 'PlayerCurseTechnique,PlayerCursePowerMAX', 'the scan can list the mod variable names')
}

// ================================================================ what the player sees
section('mastery: /stodd mastery output')
{
  const T = setup({ before: S => { S.cfg.cyberCapacity = S.cfg.cyberCapacity } })
  const { S, C } = T
  const text = ls => ls.map(l => l.s).join('\n')
  C.origins.forEach(o => {
    ;[1, 7, 12, 17, 20].forEach(lvl => {
      const p = T.player(o, lvl, { path: o === 'swordsman' || o === 'marksman' ? 'fruit' : null })
      const t = text(S.masteryLines(p))
      if (!/Haki: /.test(t) || !/Power cap/.test(t)) ok(false, o + ' lv' + lvl + ': the readout shows Haki and the power cap')
      if (lvl === 20 && !(/fully open/.test(t) && /Mastered/.test(t))) ok(false, o + ': the level 20 readout says fully open')
      if (lvl === 1 && !/next: Awakened at level 5/.test(t)) ok(false, o + ': the level 1 readout names the next stage')
    })
  })
  ok(true, 'readouts for all origins at five levels contain Haki, the power cap, and the right next stage')
  const dfu = text(S.masteryLines(T.player('devil_fruit_user', 12)))
  ok(/Devil Fruit: Honed 3\/5   next: Refined at level 15/.test(dfu), 'the Devil Fruit line names its stage and the next one')
  ok(/dodge 6%/.test(dfu) && /hardening 4%/.test(dfu), 'level 12: dodge 6 %, hardening 4 % (' + (dfu.match(/dodge[^\n]*/) || [''])[0] + ')')
  ok(/Cyberware: tolerance 50/.test(dfu), 'the Cyberware tolerance is shown')
  ok(/Choose an origin first/.test(text(S.masteryLines(T.player(null, 1)))), 'no origin: the readout asks for one')
  ok(!/Cyberware/.test(text(S.masteryLines(T.player('sorcerer', 5)))), 'a Sorcerer (no chrome) has no Cyberware line')
  ok(/sword damage \+38%/.test(text(S.masteryLines(T.player('swordsman', 20, { path: 'fruit' })))), 'the Swordsman line shows +38 % sword damage at level 20')
  // commands
  let regs = []
  T.find('S.commandRegistry').forEach(h => h.fn({ commands: H.chain(), arguments: H.chain(), register: r => regs.push(r) }))
  ok(regs.length === 1, 'the mastery command registers once')
  // scan lines
  const op = T.player('sorcerer', 20, { name: 'Op' })
  op.getNbt = () => ({ getCompound: () => ({ getAllKeys: () => ({ toArray: () => ['true_prime_piece:player', 'curios:inventory'] }), get: k => 'data of ' + k }) })
  const scan = text(S.masteryScanLines(op))
  ok(/Cursed Energy: 5 advancement/.test(scan), 'scan: counts the Cursed Energy advancements it found')
  ok(/Capability true_prime_piece:player/.test(scan), 'scan: shows a power mod capability and hides unrelated ones')
  ok(!/curios:inventory/.test(scan), 'scan: other capabilities are not listed')
  ok(/stage 2 \/simple_\?domain\/ -> jujutsucraft:simple_domain/.test(scan), 'scan: shows which advancement each pattern hit')
}

section('mastery: switched off')
{
  const T = setup({ mutate: C => { C.powerMastery.enabled = false } })
  ok(T.S.syncMastery === undefined && T.S.hakiOnHurt === undefined, 'enabled:false leaves no hooks behind')
}
