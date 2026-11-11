#!/usr/bin/env node
// Builds the schema of the STODD config files (src/main/resources/stodd_config/schema.json) from 00_config.js: every setting with
// its default and the comments written next to it, sorted into the four files. The Java side (stodd.core.config.StoddConfig)
// writes config/stodd/<file>.toml from it and reads them back; 00_config.js lays the values over its defaults.
// usage: node tools/gen_config.js [00_config.js] [schema.json]
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const SRC = process.argv[2] || path.join(__dirname, '../src/main/resources/embedded/kubejs/server_scripts/stodd/00_config.js')
const OUT = process.argv[3] || path.join(__dirname, '../src/main/resources/stodd_config/schema.json')

// ---------------------------------------------------------------- which setting goes in which file
const FILES = [
  {
    name: 'world', title: 'the island world',
    intro: [
      'The island world: the spawn islands and their spacing, the sky islands (normal islands lifted into the sky), how often an',
      'island is a city or a dressed island, island themes and names, waystones, the Log Pose and /stodd locate.',
      'World generation settings apply to worlds created afterwards (spawnIslands needs a game restart first); the rest after /reload.'
    ],
    keys: ['spawnIslands', 'skyIslands', 'city', 'makeover', 'islandThemes', 'islandNames', 'islandSyllables', 'oceanTheme',
      'islandLandThreshold', 'islandPeakStep', 'islandMergeRadius', 'islandLinkRadius', 'islandScanStep', 'islandThemeCell',
      'waystones', 'logPose', 'locate', 'world']
  },
  {
    name: 'origins', title: 'origins and the power systems',
    intro: [
      'The ten origins: their names, Curios slots, who may use which power system (Devil Fruits, Cursed Energy, Dark Magic,',
      'cyberware), cyberware capacity, how each system\'s items are recognised, and the Jujutsu starter-kit purge. Apply with /reload.'
    ],
    keys: ['origins', 'originNames', 'rules', 'systems', 'systemNames', 'slotsFromJar', 'slotIds', 'slots', 'slotsByMilestone',
      'slotMilestoneEvery', 'cyberCapacity', 'cyberCapacityCommands', 'giveKiroshiItem', 'cyberStarterKit', 'kiroshiInstallCommands',
      'skyborn', 'detect', 'sorceryItems', 'sorceryNamespaces', 'sorceryBookIdPattern', 'sorceryBookNamePattern', 'sorceryItemPattern',
      'jjcVariablesClass', 'hold', 'holdSweepTicks', 'ripperdocBlocks', 'ripperdocEntityPattern', 'jjk']
  },
  {
    name: 'progression', title: 'levels, powers and balance',
    intro: [
      'Levels and XP, per-origin growth and damage traits, the power cap, power mastery (what opens at which level), the level links',
      'to True Prime Piece / Jujutsu Craft, boss scaling and the ore tiers. Apply with /reload.'
    ],
    keys: ['maxLevel', 'xpBase', 'xpGrowth', 'xpPerMobHealth', 'xpBossMultiplier', 'xpPassiveMultiplier', 'xpMaxPerKill',
      'xpBossShareRadius', 'xpOre', 'capAtLevel1', 'capAtMaxLevel', 'originLevels', 'perLevel', 'mastery', 'traits', 'powerMastery',
      'levelLinks', 'bossMinHealth', 'bossScanRadius', 'bossHealthPerLevel', 'bossDamagePerLevel', 'bossLevelInName', 'bossMaxLevel',
      'oreBonusChance', 'oreBonusBlocks', 'terramityNetheriteOres', 'antarchyPickaxes', 'antarchyGatedBlocks']
  },
  {
    name: 'general', title: 'general',
    intro: ['Debug logging and crash guards. Apply with /reload.'],
    keys: ['debug', 'blockedEntities', 'cullOnJoin']
  }
]
// filled in by other scripts, or set from other settings (see the end of 00_config.js): not in the files
const HIDDEN = ['city.styles', 'makeover.landmarks', 'makeover.sky', 'sky']

// ---------------------------------------------------------------- the defaults
const text = fs.readFileSync(SRC, 'utf8')
const sandbox = { console: { info() {}, warn() {}, log() {} } }
sandbox.global = sandbox
vm.createContext(sandbox)
vm.runInContext(text, sandbox)
// the values as written in the file, before the derived settings at the end changed some of them
const sandbox2 = { console: sandbox.console }
sandbox2.global = sandbox2
vm.createContext(sandbox2)
vm.runInContext(text.slice(0, text.indexOf(';(function () {\n  function plain(')), sandbox2)
const C = sandbox2.stodd.cfg

// ---------------------------------------------------------------- the comments: a small tokenizer over the object literal
function comments(src) {
  const start = src.indexOf('global.stodd.cfg = {')
  if (start < 0) throw new Error('no "global.stodd.cfg = {" in ' + SRC)
  let i = src.indexOf('{', start)
  let line = src.slice(0, i).split('\n').length
  const info = {}            // path -> { pre: [], note: '' }
  const keysOnLine = {}      // line -> [paths]
  let buf = []               // full-line comments waiting for the next key
  let lastCodeLine = 0
  const stack = []           // { kind: 'obj' | 'arr', path: [], idx, key }
  let prevSig = '='          // last significant character (decides whether '/' starts a regular expression)
  function cur() { return stack[stack.length - 1] }
  function pathOf(k) { const f = cur(); return f.path.concat([k]) }
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') { line++; i++; continue }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue }
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = src.length
      const t = src.slice(i + 2, j).trim()
      if (lastCodeLine === line) {
        (keysOnLine[line] || []).forEach(p => { const e = info[p]; if (e && !e.note) e.note = t })
      } else {
        // a blank line between a comment block and the next key breaks the block
        buf.push({ t: t, line: line })
      }
      i = j
      continue
    }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); line += src.slice(i, j).split('\n').length - 1; i = j + 2; continue }
    lastCodeLine = line
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++ }
      const str = src.slice(i + 1, j)
      i = j + 1
      if (maybeKey(str)) continue
      prevSig = 'v'
      continue
    }
    if (c === '/' && '=:,([{!&|?;'.indexOf(prevSig) >= 0) {
      // a regular expression literal
      let j = i + 1, cls = false
      while (j < src.length) {
        const d = src[j]
        if (d === '\\') { j += 2; continue }
        if (d === '[') cls = true
        else if (d === ']') cls = false
        else if (d === '/' && !cls) break
        j++
      }
      j++
      while (/[a-z]/.test(src[j])) j++
      i = j; prevSig = 'v'
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++
      const word = src.slice(i, j)
      i = j
      if (maybeKey(word)) continue
      prevSig = 'v'
      continue
    }
    if (/[0-9.\-+]/.test(c)) { let j = i + 1; while (j < src.length && /[0-9.eE_xa-fA-F]/.test(src[j])) j++; i = j; prevSig = 'v'; continue }
    if (c === '{' || c === '[') {
      const f = cur()
      let p
      if (!f) p = []
      else if (f.kind === 'obj') p = f.key == null ? f.path.concat(['?']) : pathOf(f.key)
      else p = f.path.concat([String(f.idx)])
      stack.push({ kind: c === '{' ? 'obj' : 'arr', path: p, idx: 0, key: null })
      prevSig = c; i++
      continue
    }
    if (c === '}' || c === ']') {
      stack.pop()
      if (stack.length === 0) break
      prevSig = 'v'; i++
      continue
    }
    if (c === ',') {
      const f = cur()
      if (f.kind === 'arr') f.idx++
      else f.key = null
      prevSig = ','; i++
      continue
    }
    prevSig = c; i++
  }
  function maybeKey(word) {
    const f = cur()
    if (!f || f.kind !== 'obj') return false
    let j = i
    while (src[j] === ' ' || src[j] === '\t') j++
    if (src[j] !== ':') return false
    f.key = word
    const p = pathOf(word).join('.')
    // the block of comment lines right above the key (no blank line or code between)
    const pre = []
    let want = line - 1
    for (let k = buf.length - 1; k >= 0 && buf[k].line === want; k--, want--) pre.unshift(buf[k].t)
    info[p] = { pre: pre, note: '', line: line }
    ;(keysOnLine[line] = keysOnLine[line] || []).push(p)
    buf = []
    i = j + 1
    prevSig = ':'
    return true
  }
  return info
}
const INFO = comments(text)

// ---------------------------------------------------------------- the schema
function isPlain(o) { return o != null && typeof o === 'object' && !Array.isArray(o) && !(o instanceof RegExp) && Object.prototype.toString.call(o) !== '[object RegExp]' }
function isRe(o) { return o != null && Object.prototype.toString.call(o) === '[object RegExp]' }
function jsonValue(v) {
  if (isRe(v)) return '/' + v.source + '/' + v.flags
  if (Array.isArray(v)) return v.map(jsonValue)
  if (isPlain(v)) { const o = {}; Object.keys(v).forEach(k => { o[k] = jsonValue(v[k]) }); return o }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || v === null) return v
  if (v === undefined) return null
  throw new Error('a setting cannot be written to TOML: ' + typeof v)
}
function idList(a) { return Array.isArray(a) && a.length > 0 && a.every(e => isPlain(e) && typeof e.id === 'string') }
// an object written on one line in 00_config.js ({ min: -0.5, max: 0.9 }) stays one value: an inline table
function oneLine(cpath, v) {
  const me = INFO[cpath]
  if (!me) return false
  return Object.keys(v).every(k => {
    const c = INFO[cpath + '.' + k]
    return c && c.line === me.line && !isPlain(v[k]) && !idList(v[k])
  })
}
function isTable(v, cpath) { return idList(v) || (isPlain(v) && Object.keys(v).length > 0 && !oneLine(cpath, v)) }
function bareKey(k) { if (!/^[A-Za-z0-9_-]+$/.test(k)) throw new Error('not a bare TOML key: ' + k); return k }
function clean(lines) {
  return lines.map(t => t.replace(/^-{3,}\s*/, '---- ').replace(/\s*-{3,}$/, '')).filter((t, k, a) => !(t === '' && (k === 0 || a[k - 1] === '')))
}
function infoOf(cpath) { return INFO[cpath] || { pre: [], note: '' } }

function emitTable(items, tpath, cpaths, value, pre) {
  // tpath: the TOML path of the table; cpaths: the 00_config.js path (with array indexes) for the comments
  items.push({ t: 'table', path: tpath, pre: clean(pre) })
  const keys = Object.keys(value)
  const tables = []
  keys.forEach(k => {
    if (k === 'id' && cpaths.isElement) return
    const full = tpath + '.' + bareKey(k)
    if (HIDDEN.indexOf(full) >= 0) return
    const v = value[k]
    const ci = infoOf(cpaths.c + '.' + k)
    if (isTable(v, cpaths.c + '.' + k)) { tables.push([k, v, ci]); return }
    if (isPlain(v) && Object.keys(v).length === 0) return   // an empty object: filled in by another script
    items.push({ t: 'key', path: full, key: k, def: jsonValue(v), re: isRe(v), note: ci.note, pre: clean(ci.pre) })
  })
  tables.forEach(([k, v, ci]) => sub(items, tpath + '.' + k, cpaths.c + '.' + k, v, ci.pre.concat(ci.note ? [ci.note] : [])))
}
function sub(items, tpath, cpath, v, pre) {
  if (idList(v)) {
    v.forEach((e, n) => {
      const ei = infoOf(cpath + '.' + n + '.id')
      emitTable(items, tpath + '.' + bareKey(e.id), { c: cpath + '.' + n, isElement: true }, e, (n === 0 ? pre : []).concat(ei.pre))
    })
  } else emitTable(items, tpath, { c: cpath, isElement: false }, v, pre)
}

const seen = new Set()
const schema = { version: 1, made: 'tools/gen_config.js from 00_config.js', files: [] }
let keyCount = 0
FILES.forEach(f => {
  const items = []
  f.keys.forEach(k => {
    if (!(k in C)) throw new Error('00_config.js has no setting ' + k + ' (listed for ' + f.name + '.toml)')
    seen.add(k)
  })
  // TOML wants the plain keys before the first table
  f.keys.filter(k => !isTable(C[k], k)).forEach(k => {
    const ci = infoOf(k)
    items.push({ t: 'key', path: k, key: k, def: jsonValue(C[k]), re: isRe(C[k]), note: ci.note, pre: clean(ci.pre) })
  })
  f.keys.filter(k => isTable(C[k], k)).forEach(k => {
    if (HIDDEN.indexOf(k) >= 0) return
    const ci = infoOf(k)
    sub(items, k, k, C[k], ci.pre.concat(ci.note ? [ci.note] : []))
  })
  keyCount += items.filter(x => x.t === 'key').length
  schema.files.push({ name: f.name, title: f.title, intro: f.intro, items: items })
})
Object.keys(C).forEach(k => { if (!seen.has(k) && HIDDEN.indexOf(k) < 0) throw new Error('setting ' + k + ' of 00_config.js is in no config file: add it to FILES in tools/gen_config.js') })

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(schema, null, 1) + '\n')
console.log('config schema: ' + schema.files.length + ' files, ' + keyCount + ' settings -> ' + path.relative(process.cwd(), OUT))
