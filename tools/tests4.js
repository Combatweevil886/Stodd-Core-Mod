// New in 2.2.0: level links (24_links.js): True Prime Piece stats and the Jujutsu grade climb in tandem with the STODD level.
const fs = require('fs'), path = require('path'), vm = require('vm')
const H = require('./harness.js')
const { ok, section } = H
const DIR = process.argv[2]

function load(name) { vm.runInThisContext(fs.readFileSync(path.join(DIR, name), 'utf8'), { filename: name }) }
function mkText() {
  const mk = s => { const o = { s: String(s), append(x) { o.s += x.s; return o }, color() { return o } }; return o }
  return new Proxy({}, { get: () => mk })
}

// ------------------------------------------------------------------ a mock of the NBT the scripts walk through
class NNum { constructor(v) { this.v = v } getId() { return 6 } getAsDouble() { return this.v } }
class NStr { getId() { return 8 } }
class NComp {
  constructor() { this.m = new Map() }
  getId() { return 10 }
  getAllKeys() { return { toArray: () => Array.from(this.m.keys()) } }
  get(k) { return this.m.has(k) ? this.m.get(k) : null }
  getCompound(k) { return this.m.get(k) instanceof NComp ? this.m.get(k) : new NComp() }
  set(k, v) { this.m.set(k, v); return this }
}
function fromJs(o) {
  const c = new NComp()
  Object.keys(o).forEach(k => { const v = o[k]; c.set(k, typeof v === 'number' ? new NNum(v) : typeof v === 'string' ? new NStr() : fromJs(v)) })
  return c
}
function merge(c, o, clamp) {
  Object.keys(o).forEach(k => {
    const v = o[k]
    if (typeof v === 'number') c.set(k, new NNum(clamp != null ? Math.min(clamp, v) : v))
    else { if (!(c.get(k) instanceof NComp)) c.set(k, new NComp()); merge(c.get(k), v, clamp) }
  })
}

const TPP_KEY = 'true_prime_piece:stats'
function tppTree(s) { return { [TPP_KEY]: { Level: 40, Stats: { Agility: s, Strength: s, Health: s, Toughness: s }, Berries: 99 }, 'curios:inventory': { Unrelated: 7 } } }

let NAMES = 0
function setup(opts) {
  opts = opts || {}
  const HANDLERS = []
  global.PlayerEvents = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: 'P.' + String(k), fn: fn }) }) })
  global.ServerEvents = new Proxy({}, { get: (t, k) => (fn => { HANDLERS.push({ name: 'S.' + String(k), fn: fn }) }) })
  global.Text = mkText()
  global.stodd = undefined
  load('00_config.js')
  const S = global.stodd, C = S.cfg
  if (opts.mutate) opts.mutate(C)
  load('05_util.js')
  S.log = () => { }
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  const cmds = []
  const server = { runCommandSilent(c) { cmds.push(c); return 1 }, scheduleInTicks(n, fn) { fn() }, tell() { } }
  S.run = (srv, c) => srv.runCommandSilent(c)
  S.uuidOf = p => p.username
  // the pieces of the level and mastery scripts the link depends on, behaving like the real ones
  S.applied = 0
  S.applyStats = function (p) { S.applied++ }
  S.setLevel = function (p, lvl, xp) {
    const max = S.maxLevelOf(S.getOrigin(p))
    S.data(p).putInt('lvl', Math.max(1, Math.min(max, lvl)))
    S.applyStats(p)
  }
  // the Jujutsu variables: a plain map per player
  S.jjcVarNames = p => p.jjc == null ? null : Object.keys(p.jjc)
  S.jjcVarGet = (p, n) => (p.jjc != null && typeof p.jjc[n] === 'number' ? p.jjc[n] : null)
  S.jjcVarSet = (p, n, v) => { if (p.jjcRefuse || S.jjcVarGet(p, n) == null) return false; p.jjc[n] = v; p.jjcWrites = (p.jjcWrites || 0) + 1; return true }
  S.masteryHas = (p, sys) => {
    const o = S.getOrigin(p); if (o == null) return false
    const r = C.rules[o][sys]
    return r === true || (r === 'path' && String(S.data(p).getString('path')) === sys)
  }
  if (opts.before) opts.before(S)
  load('24_links.js')
  const find = n => HANDLERS.filter(h => h.name === n)
  function player(origin, level, o) {
    o = o || {}
    const msgs = []
    const p = {
      username: o.name || ('Tester' + (++NAMES)), age: 100, server: server, msgs: msgs, merges: 0, clamp: o.clamp,
      caps: fromJs(o.caps === undefined ? tppTree(o.stat != null ? o.stat : 1) : o.caps),
      jjc: o.jjc === undefined ? null : o.jjc,
      getTags: () => ({ contains: t => origin != null && t === 'stodd_o_' + origin }),
      isPlayer: () => true, isCreative: () => false,
      tell: m => msgs.push(m.s), setStatusMessage: m => msgs.push('status:' + m.s),
      getNbt() { const root = new NComp(); root.set('ForgeCaps', p.caps); return root },
      mergeNbt(obj) { p.merges++; if (o.refuse) return; merge(p.caps, obj.ForgeCaps, p.clamp) }
    }
    S.data(p).putInt('lvl', level)
    if (o.path) S.data(p).putString('path', o.path)
    return p
  }
  // helpers on a tpp player
  const stat = (p, f) => p.caps.getCompound(TPP_KEY).getCompound('Stats').get(f).v
  const setStat = (p, f, v) => { p.caps.getCompound(TPP_KEY).getCompound('Stats').set(f, new NNum(v)) }
  const stats = p => ['Agility', 'Strength', 'Health', 'Toughness'].map(f => stat(p, f))
  const lvl = p => S.getLevel(p)
  const text = ls => ls.map(l => l.s).join('\n')
  return { S, C, LK: C.levelLinks, cmds, server, find, player, stat, setStat, stats, lvl, text, handlers: HANDLERS }
}

// ================================================================ the configuration
section('links: configuration')
{
  const { C, LK, S } = setup()
  ok(LK.enabled === true && Object.keys(LK.links).length === 2, 'two links are configured and on')
  const g = LK.links.jjcGrade, t = LK.links.tppStats
  const stageLevels = C.powerMastery.stageLevels
  ok(g.table.length === stageLevels.length && g.table.every((r, i) => r.level === stageLevels[i]), 'the grade table has one row per mastery stage, at the same levels')
  ok(g.table.every((r, i) => i === 0 || r.value > g.table[i - 1].value), 'the Fame needed for each grade strictly increases')
  ok(g.labels.length === g.table.length, 'one grade name per table row')
  ok(g.table[g.table.length - 1].level === C.maxLevel, 'the top grade is reached at the normal level cap')
  ok(t.fields.length === 4 && t.perLevel > 0, 'four stats, each worth a positive amount per level')
  ok(LK.maxStep >= 1 && LK.everyTicks >= 20, 'the step limit and the check interval are sane')
  ok(['min', 'max'].indexOf(t.combine) >= 0 && ['min', 'max'].indexOf(g.combine) >= 0, 'combine is min or max')
  ok(typeof S.syncLinks === 'function' && typeof S.linkLines === 'function' && typeof S.linkScanLines === 'function' && typeof S.linkMute === 'function', 'the script exports its functions')
}

// ================================================================ True Prime Piece stats
section('links: stats follow the level')
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 8, { stat: 3 })
  ok(S.syncLinks(p) === 0 && T.stats(p).join() === '3,3,3,3' && T.lvl(p) === 8, 'first look: the current stats are declared equal to the current level, nothing changes')
  ok(p.merges === 0, 'no write when nothing needs raising')
  S.setLevel(p, 10, 0)
  ok(T.stats(p).join() === '5,5,5,5', 'level 8 -> 10 raised every stat by two (' + T.stats(p) + ')')
  ok(T.stat(p, 'Agility') === 5 && p.caps.getCompound(TPP_KEY).get('Berries').v === 99 && p.caps.getCompound(TPP_KEY).get('Level').v === 40, 'unrelated numbers in the same capability are untouched')
  ok(p.caps.getCompound('curios:inventory').get('Unrelated').v === 7, 'other capabilities are untouched')
  S.applyStats(p)
  ok(p.merges === 1, 'a second look with everything in order writes nothing more')
  S.setLevel(p, 11, 0); S.setLevel(p, 12, 0)
  ok(T.stats(p).join() === '7,7,7,7', 'two single level-ups add two to each stat')
  ok(p.msgs.some(m => /True Prime Piece stats raised to match level 10/.test(m)), 'the player is told what happened')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 8, { stat: 3 })
  S.syncLinks(p)
  ;['Agility', 'Strength', 'Health', 'Toughness'].forEach(f => T.setStat(p, f, 7))
  S.syncLinks(p)
  ok(T.lvl(p) === 12, 'training every stat by 4 raises the STODD level by 4 (' + T.lvl(p) + ')')
  ok(T.stats(p).join() === '7,7,7,7', 'and the stats are not changed by it')
  ok(S.syncLinks(p) === 0 && T.lvl(p) === 12, 'a settled pair stays settled')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 8, { stat: 3 })
  S.syncLinks(p)
  T.setStat(p, 'Strength', 11)
  S.syncLinks(p)
  ok(T.lvl(p) === 8, 'one stat alone does not raise the level (combine = min)')
  S.setLevel(p, 10, 0)
  ok(T.stats(p).join() === '5,11,5,5', 'a level-up lifts the lagging stats and never lowers the strong one (' + T.stats(p) + ')')
}
{
  const T = setup({ mutate: C => { C.levelLinks.links.tppStats.combine = 'max' } })
  const { S } = T
  const p = T.player('human', 8, { stat: 3 })
  S.syncLinks(p)
  T.setStat(p, 'Strength', 9)
  S.syncLinks(p)
  ok(T.lvl(p) === 13 && T.stats(p).join() === '8,9,8,8', 'combine = max: the best stat decides (8 + 6 levels, limited to 5 per check) and the others are lifted to match (' + T.lvl(p) + ' / ' + T.stats(p) + ')')
  S.syncLinks(p)
  ok(T.lvl(p) === 14 && T.stats(p).join() === '9,9,9,9', 'the next check finishes the job (' + T.lvl(p) + ' / ' + T.stats(p) + ')')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 3, { stat: 1 })
  S.syncLinks(p)
  ;['Agility', 'Strength', 'Health', 'Toughness'].forEach(f => T.setStat(p, f, 30))
  S.syncLinks(p)
  ok(T.lvl(p) === 8, 'a huge jump in the mod moves the level by at most maxStep per check (3 -> ' + T.lvl(p) + ')')
  for (let i = 0; i < 10; i++) S.syncLinks(p)
  ok(T.lvl(p) === 20, 'and catches up over a few checks, stopping at the origin cap (' + T.lvl(p) + ')')
  ok(T.stats(p).join() === '30,30,30,30', 'without lowering a single stat')
}
{
  const T = setup()
  const { S } = T
  const w = T.player('weakling', 20, { stat: 1 })
  S.syncLinks(w)
  ;['Agility', 'Strength', 'Health', 'Toughness'].forEach(f => T.setStat(w, f, 60))
  for (let i = 0; i < 20; i++) S.syncLinks(w)
  ok(T.lvl(w) === 35, 'the Weakling can be carried all the way to level 35 (' + T.lvl(w) + ')')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 12, { stat: 7 })
  S.syncLinks(p)
  S.setLevel(p, 5, 0)
  ok(T.lvl(p) === 5 && T.stats(p).join() === '7,7,7,7', 'an operator lowering the level lowers nothing in the mod and the mod does not drag the level back (' + T.lvl(p) + ')')
  for (let i = 0; i < 3; i++) S.syncLinks(p)
  ok(T.lvl(p) === 5, 'the level stays where the operator put it')
  S.setLevel(p, 6, 0)
  ok(T.stats(p).join() === '8,8,8,8', 'counting restarts from the new level: one level up, one stat up')
}
{
  const T = setup({ mutate: C => { C.levelLinks.links.tppStats.perLevel = 2 } })
  const { S } = T
  const p = T.player('human', 4, { stat: 10 })
  S.syncLinks(p)
  S.setLevel(p, 7, 0)
  ok(T.stats(p).join() === '16,16,16,16', 'perLevel 2: three levels are worth six points')
  T.setStat(p, 'Agility', 19); T.setStat(p, 'Strength', 19); T.setStat(p, 'Health', 19); T.setStat(p, 'Toughness', 19)
  S.syncLinks(p)
  ok(T.lvl(p) === 8, 'perLevel 2: three extra points are one whole level (7 -> ' + T.lvl(p) + ')')
}

section('links: stats - what can go wrong')
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 6, { caps: { 'curios:inventory': { Unrelated: 7 } } })
  ok(S.syncLinks(p) === 0 && p.merges === 0, 'the mod is not there: nothing happens')
  const t = T.text(S.linkLines(p))
  ok(/True Prime Piece stats: NOT LINKED/.test(t) && /no player capability matches/.test(t), 'the readout says NOT LINKED and why')
  p.caps.set(TPP_KEY, fromJs({ Stats: { Agility: 2, Strength: 2, Health: 2, Toughness: 2 } }))
  S.syncLinks(p)
  ok(T.stats(p).join() === '2,2,2,2', 'when the mod shows up later, the next look links it and calibrates (2 stays 2)')
  S.setLevel(p, 8, 0)
  ok(T.stats(p).join() === '4,4,4,4', 'and then it follows the level')
  ok(/linked/.test(T.text(S.linkLines(p))) && !/NOT LINKED/.test(T.text(S.linkLines(p))), 'the readout says linked')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 6, { caps: { [TPP_KEY]: { Stats: { Agility: 2, Strength: 2 } } } })
  S.syncLinks(p)
  S.setLevel(p, 9, 0)
  ok(T.stat(p, 'Agility') === 5 && T.stat(p, 'Strength') === 5, 'only two of the four stats exist: those two follow, the missing ones are ignored')
  ok(/\(missing\)/.test(T.text(S.linkLines(p))), 'the readout names the missing ones')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 10, { caps: { 'mod:other': { Agility: 4 } } })
  ok(S.syncLinks(p) === 0 && /NOT LINKED/.test(T.text(S.linkLines(p))), 'a number named Agility in some other mod is not mistaken for ours')
}
{
  // the mod clamps what is written
  const T = setup()
  const { S } = T
  const p = T.player('human', 1, { stat: 1, clamp: 10 })
  S.syncLinks(p)
  S.setLevel(p, 20, 0)
  ok(T.stats(p).join() === '10,10,10,10', 'the mod clamps at 10: the value it keeps is the one it accepted')
  const w = p.merges
  for (let i = 0; i < 12; i++) S.syncLinks(p)
  ok(p.merges - w <= 3, 'a refused target is tried at most three times (' + (p.merges - w) + ' more writes)')
  ok(/read-only/.test(T.text(S.linkLines(p))), 'the readout reports the link as read-only')
  ok(T.lvl(p) === 20, 'the level is untouched by a refusing mod')
  p.clamp = null
  S.syncLinks(p)
  ok(T.stats(p).join() === '10,10,10,10', 'a link that gave up stays quiet by itself ...')
  S.linkRetry(p)
  ok(T.stats(p).join() === '20,20,20,20' && !/read-only/.test(T.text(S.linkLines(p))), '... and /stodd link sync gives it another go (' + T.stats(p) + ')')
}
{
  // the write is refused outright
  const T = setup()
  const { S } = T
  const p = T.player('human', 1, { stat: 1, refuse: true })
  S.syncLinks(p)
  S.setLevel(p, 5, 0)
  for (let i = 0; i < 8; i++) S.syncLinks(p)
  ok(p.merges <= 4 && T.lvl(p) === 5 && T.stats(p).join() === '1,1,1,1', 'a mod that ignores writes ends in read-only, nothing breaks (' + p.merges + ' writes)')
  S.setLevel(p, 6, 0)
  ok(p.merges >= 4, 'a new level is a new target and gets a fresh try')
}
{
  // a retry works once the mod accepts again
  const T = setup()
  const { S } = T
  const p = T.player('human', 1, { stat: 1, refuse: true })
  S.syncLinks(p)
  S.setLevel(p, 5, 0)
  S.syncLinks(p)
  const o = p.mergeNbt
  p.mergeNbt = function (obj) { p.merges++; merge(p.caps, obj.ForgeCaps, null) }
  S.syncLinks(p)
  ok(T.stats(p).join() === '5,5,5,5', 'when the mod starts accepting writes the target is reached on the next look (' + T.stats(p) + ')')
}
{
  // configured write commands replace the NBT write
  const T = setup({ mutate: C => { C.levelLinks.links.tppStats.writeCommands = ['tpp set {p} {field} {v}'] } })
  const { S } = T
  const p = T.player('human', 4, { stat: 2 })
  S.syncLinks(p)
  S.setLevel(p, 6, 0)
  ok(p.merges === 0 && T.cmds.filter(c => /^tpp set Tester\d+ \d 4$/.test(c)).length === 4, 'writeCommands: four commands, one per stat, {p} {field} {v} filled in (' + T.cmds.join(' | ') + ')')
}

// ================================================================ the Jujutsu grade
section('links: Jujutsu grade')
function jsorc(o) { return Object.assign({ PlayerFame: 0, PlayerCurseTechnique: 3, PlayerCursePower: 10 }, o || {}) }
{
  const T = setup()
  const { S, LK } = T
  const rows = LK.links.jjcGrade.table, lab = LK.links.jjcGrade.labels
  const p = T.player('sorcerer', 12, { caps: {}, jjc: jsorc() })
  S.syncLinks(p)
  ok(p.jjc.PlayerFame === rows[2].value, 'level 12 on a Fame of 0: raised to the level-10 grade (' + p.jjc.PlayerFame + ')')
  ok(p.msgs.some(m => m.indexOf(lab[2]) >= 0), 'the message names the grade: ' + lab[2])
  S.setLevel(p, 15, 0)
  ok(p.jjc.PlayerFame === rows[3].value, 'level 15: Grade 1 (' + p.jjc.PlayerFame + ')')
  S.setLevel(p, 20, 0)
  ok(p.jjc.PlayerFame === rows[4].value, 'level 20: Special Grade (' + p.jjc.PlayerFame + ')')
  ok(p.jjc.PlayerCurseTechnique === 3 && p.jjc.PlayerCursePower === 10, 'no other Jujutsu variable is touched')
}
{
  const T = setup()
  const { S, LK } = T
  const rows = LK.links.jjcGrade.table
  const p = T.player('sorcerer', 12, { caps: {}, jjc: jsorc({ PlayerFame: rows[3].value + 10 }) })
  S.syncLinks(p)
  ok(T.lvl(p) === 15, 'a Fame worth Grade 1 lifts a level-12 sorcerer to level 15 (' + T.lvl(p) + ')')
  ok(p.jjc.PlayerFame === rows[3].value + 10 && p.jjcWrites === undefined, 'and the Fame is not written')
  p.jjc.PlayerFame = rows[4].value
  S.syncLinks(p)
  ok(T.lvl(p) === 20, 'Fame for Special Grade: level 20')
  ok(p.msgs.some(m => /your level rose to 20/.test(m)), 'the player is told the level rose')
}
{
  const T = setup()
  const { S, LK } = T
  const rows = LK.links.jjcGrade.table
  const p = T.player('sorcerer', 15, { caps: {}, jjc: jsorc({ PlayerFame: rows[3].value }) })
  S.syncLinks(p)
  S.setLevel(p, 3, 0)
  ok(T.lvl(p) === 3 && p.jjc.PlayerFame === rows[3].value, 'an operator lowering the level lowers neither Fame nor lets it pull the level back')
  for (let i = 0; i < 4; i++) S.syncLinks(p)
  ok(T.lvl(p) === 3, 'it stays at 3 over several checks')
  p.jjc.PlayerFame = rows[4].value
  for (let i = 0; i < 6; i++) S.syncLinks(p)
  ok(T.lvl(p) === 20, 'Fame rising past what it showed before the drop counts again (' + T.lvl(p) + ')')
}
{
  const T = setup()
  const { S } = T
  const h = T.player('human', 10, { caps: {}, jjc: jsorc() })
  S.syncLinks(h)
  ok(h.jjc.PlayerFame === 0 && /Jujutsu grade: not for your origin/.test(T.text(S.linkLines(h))), 'a Human has no grade link and Fame is left alone')
  const sw = T.player('swordsman', 10, { caps: {}, jjc: jsorc() })
  S.syncLinks(sw)
  ok(sw.jjc.PlayerFame === 0, 'a Swordsman who has not chosen Cursed Energy is not linked')
  const sw2 = T.player('swordsman', 10, { caps: {}, jjc: jsorc(), path: 'sorcery' })
  S.syncLinks(sw2)
  ok(sw2.jjc.PlayerFame > 0, 'once the path of Cursed Energy is chosen the link applies')
}
{
  const T = setup()
  const { S } = T
  const p = T.player('sorcerer', 12, { caps: {}, jjc: { SomethingElse: 1 } })
  ok(S.syncLinks(p) === 0 && /Jujutsu grade: NOT LINKED/.test(T.text(S.linkLines(p))), 'no Fame variable: NOT LINKED, no crash')
  const q = T.player('sorcerer', 12, { caps: {}, jjc: null })
  ok(S.syncLinks(q) === 0 && /cannot be read/.test(T.text(S.linkLines(q))), 'Jujutsu Craft missing: NOT LINKED with the reason')
  const r = T.player('sorcerer', 12, { caps: {}, jjc: jsorc(), })
  r.jjcRefuse = true
  S.syncLinks(r)
  for (let i = 0; i < 5; i++) S.syncLinks(r)
  ok(r.jjc.PlayerFame === 0 && T.lvl(r) === 12, 'a variable that refuses writes changes nothing')
  const t2 = T.player('sorcerer', 12, { caps: {}, jjc: jsorc({ PlayerFame: 12 }) })
  t2.jjc.OtherFame = 99
  S.syncLinks(t2)
  ok(t2.jjc.PlayerFame === 5000 && t2.jjc.OtherFame === 99, 'the exact name PlayerFame wins over a looser match')
}
{
  // both links at once
  const T = setup()
  const { S } = T
  const p = T.player('sorcerer', 10, { jjc: jsorc(), stat: 2 })
  S.syncLinks(p)
  S.setLevel(p, 15, 0)
  ok(T.stats(p).join() === '7,7,7,7' && p.jjc.PlayerFame > 0, 'both links move with one level-up')
  const before = S.applied
  S.syncLinks(p)
  ok(S.applied === before, 'a settled player triggers no further level changes')
}

// ================================================================ plumbing
section('links: plumbing')
{
  const T = setup()
  const { S } = T
  const p = T.player('human', 5, { stat: 1 })
  S.syncLinks(p)
  // a level-up that goes through applyStats only (as addXp does)
  S.data(p).putInt('lvl', 9)
  S.applyStats(p)
  ok(T.stats(p).join() === '5,5,5,5', 'a level-up that only calls applyStats still moves the stats')
  const ticks = T.find('P.tick')
  ok(ticks.length === 1, 'one tick handler')
  const q = T.player('human', 5, { stat: 1 }); q.age = 100
  S.syncLinks(q)
  S.data(q).putInt('lvl', 7)
  q.age = 117 + 100 * 3
  ticks[0].fn({ player: q })
  ok(T.stats(q).join() === '3,3,3,3', 'the tick catch-up (age % everyTicks == 17) brings a player in line')
  q.age = 118; S.data(q).putInt('lvl', 9)
  ticks[0].fn({ player: q })
  ok(T.stats(q).join() === '3,3,3,3', 'other ticks do nothing')
  const li = T.find('P.loggedIn'); li[0].fn({ player: q, server: T.server })
  ok(T.stats(q).join() === '5,5,5,5', 'logging in schedules a look that applies the level')
  const lo = T.find('P.loggedOut'); lo[0].fn({ player: q })
  ok(T.stats(q).join() === '5,5,5,5', 'logging out is harmless')
  // calibration survives a relog (it is stored with the player)
  q.merges = 0
  S.syncLinks(q)
  ok(q.merges === 0 && T.stats(q).join() === '5,5,5,5', 'after a relog the stored calibration is used: nothing is re-declared or rewritten')
  // no origin chosen
  const n = T.player(null, 1, { stat: 1 })
  ok(S.syncLinks(n) === 0 && /Choose an origin first/.test(T.text(S.linkLines(n))), 'before an origin is chosen nothing is linked')
}
{
  // recursion guard: the level change a link makes must not start another sync
  const T = setup()
  const { S } = T
  let depth = 0, maxDepth = 0
  const base = S.syncLinks
  const p = T.player('human', 3, { stat: 1 })
  base(p)
  ;['Agility', 'Strength', 'Health', 'Toughness'].forEach(f => T.setStat(p, f, 6))
  const ap = S.applyStats
  S.applyStats = function (x) { depth++; maxDepth = Math.max(maxDepth, depth); try { ap(x) } finally { depth-- } }
  S.syncLinks(p)
  ok(maxDepth <= 2 && T.lvl(p) === 8, 'a level raised by a link ends in one pass, no runaway recursion (depth ' + maxDepth + ', level ' + T.lvl(p) + ')')
}
{
  const T = setup({ mutate: C => { C.levelLinks.enabled = false } })
  ok(T.S.syncLinks === undefined, 'enabled:false leaves no hooks behind')
}

section('links: /stodd link output and commands')
{
  const T = setup()
  const { S } = T
  const p = T.player('sorcerer', 10, { jjc: jsorc({ PlayerFame: 700 }), stat: 4 })
  S.syncLinks(p)
  const t = T.text(S.linkLines(p))
  ok(/True Prime Piece stats: linked/.test(t) && /Jujutsu grade: linked/.test(t), 'the readout lists both links as linked')
  ok(/true_prime_piece:stats > Stats\/Agility, Stats\/Strength, Stats\/Health, Stats\/Toughness/.test(t), 'the readout shows where each stat was found')
  ok(/variable PlayerFame/.test(t), 'and which Jujutsu variable')
  ok(/now 4 \/ 4 \/ 4 \/ 4 = level 10/.test(t), 'and the value as a level')
  const scan = T.text(S.linkScanLines(p))
  ok(/Capability true_prime_piece:stats/.test(scan) && /Stats\/Agility = 4/.test(scan) && /Level = 40/.test(scan), 'scan: lists the numbers inside a matching capability')
  ok(!/curios:inventory/.test(scan), 'scan: unrelated capabilities are not listed')
  ok(/PlayerFame = /.test(scan) && /Jujutsu Craft variables: 3/.test(scan), 'scan: lists the Jujutsu variables that look like progress')
  ok(/---- STODD link scan ----/.test(scan) && /==== Level links ====/.test(scan), 'scan ends with the normal readout')
  const regs = []
  T.find('S.commandRegistry').forEach(h => h.fn({ commands: H.chain(), arguments: H.chain(), register: r => regs.push(r) }))
  ok(regs.length === 1, 'the link command registers once')
  const q = T.player('human', 5, { caps: { 'x:y': { A: 1 } } })
  const s2 = T.text(S.linkScanLines(q))
  ok(/None of them belongs to True Prime Piece or Jujutsu Craft/.test(s2), 'scan: says so when no capability belongs to the two mods')
  // reset
  const r = T.player('human', 6, { stat: 2 })
  S.syncLinks(r)
  S.setLevel(r, 9, 0)
  ok(T.stats(r).join() === '5,5,5,5', 'before reset: stats follow')
  S.linkReset(r)
  S.data(r).putInt('lvl', 4)
  S.syncLinks(r)
  ok(T.lvl(r) === 4 && T.stats(r).join() === '5,5,5,5', 'reset re-declares the pair equal at the current level: nothing is pulled back up')
}

// ================================================================ the real 15_powers helpers
section('links: Jujutsu variable helpers (15_powers.js)')
{
  const HANDLERS = []
  global.PlayerEvents = new Proxy({}, { get: () => (fn => { HANDLERS.push(fn) }) })
  global.ServerEvents = global.PlayerEvents
  global.Text = mkText()
  global.stodd = undefined
  load('00_config.js')
  const S = global.stodd
  load('05_util.js')
  S.data = p => { p.__d = p.__d || new H.MockCompound(); return p.__d }
  const savedJava = global.Java
  const vars = { PlayerFame: 120, PlayerCurseTechnique: 4, Label: 'x', Bad: NaN, syncs: 0 }
  vars.syncPlayerVariables = function () { vars.syncs++ }
  global.Java = { loadClass: n => ({ PLAYER_VARIABLES_CAPABILITY: 'CAP' }) }
  load('15_powers.js')
  global.Java = savedJava
  const player = { getCapability: (cap, side) => ({ resolve: () => ({ isPresent: () => true, get: () => vars }) }) }
  ok(S.jjcVarGet(player, 'PlayerFame') === 120, 'jjcVarGet reads a number')
  ok(S.jjcVarGet(player, 'Missing') === null && S.jjcVarGet(player, 'Bad') === null, 'jjcVarGet gives null for a missing or non-finite variable')
  ok(S.jjcVarSet(player, 'PlayerFame', 500) === true && vars.PlayerFame === 500 && vars.syncs === 1, 'jjcVarSet writes and syncs to the client')
  ok(S.jjcVarSet(player, 'Missing', 5) === false && vars.Missing === undefined, 'jjcVarSet never invents a variable')
  const none = { getCapability: () => ({ resolve: () => ({ isPresent: () => false }) }) }
  ok(S.jjcVarGet(none, 'PlayerFame') === null && S.jjcVarSet(none, 'PlayerFame', 1) === false, 'without the capability both are harmless')
}
