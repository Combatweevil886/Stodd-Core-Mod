// priority: 670
// LEVEL LINKS: the STODD level and the other mods' own progression climb in tandem, in both directions.
//   True Prime Piece stat levels   <->   STODD level      (linear: each STODD level is worth perLevel of every stat)
//   Jujutsu Craft Fame (the grade) <->   STODD level      (table: Grade 4 / 3 / 2 / 1 / Special at levels 1 / 5 / 10 / 15 / 20)
// Rules, whatever the link: nothing is ever lowered by the other side, a link counts only what it did not write itself, a value
// the mod clamps is respected, three failed writes in a row make a link read-only, and a link that cannot find its fields says so
// (/stodd link) instead of guessing. See cfg.levelLinks in 00_config.js.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 24_links.js disabled'); return }
  let C = S.cfg
  let LK = C.levelLinks
  if (!LK || LK.enabled === false) return
  let ids = Object.keys(LK.links)
  let mem = {}      // player uuid -> link id -> { res, note, fails, lastTargets }
  let busy = {}     // player uuid -> true while a sync runs, so a level change made by a link does not start another
  let warned = {}
  let EPS = 1e-9

  function memOf(player, id) {
    let u = S.uuidOf(player)
    if (!mem[u]) mem[u] = {}
    if (!mem[u][id]) mem[u][id] = { res: null, note: '', fails: 0, lastTargets: '' }
    return mem[u][id]
  }
  function warnOnce(key, msg) { if (!warned[key]) { warned[key] = true; console.warn('[STODD] ' + msg) } }

  // ------------------------------------------------------------------ reading numbers out of NBT
  function isNum(tag) { try { let t = Number(tag.getId()); return t >= 1 && t <= 6 } catch (e) { return false } }
  function isCompound(tag) { try { return Number(tag.getId()) === 10 } catch (e) { return false } }
  function keysOf(c) { return c.getAllKeys().toArray() }
  // First numeric tag (at most 4 compounds deep) whose NAME matches re; returns the key path, or null
  function findLeaf(c, re, depth) {
    let ks = keysOf(c)
    for (let i = 0; i < ks.length; i++) {
      let k = String(ks[i])
      if (re.test(k) && isNum(c.get(k))) return [k]
    }
    if (depth >= 4) return null
    for (let i = 0; i < ks.length; i++) {
      let k = String(ks[i])
      if (isCompound(c.get(k))) {
        let p = findLeaf(c.getCompound(k), re, depth + 1)
        if (p != null) return [k].concat(p)
      }
    }
    return null
  }
  function walk(c, path) {
    let cur = c
    for (let i = 0; i < path.length - 1; i++) cur = cur.getCompound(path[i])
    let t = cur.get(path[path.length - 1])
    return isNum(t) ? Number(t.getAsDouble()) : null
  }
  function leaves(c, prefix, out, depth) {
    let ks = keysOf(c)
    for (let i = 0; i < ks.length && out.length < 40; i++) {
      let k = String(ks[i]), t = c.get(k)
      if (isNum(t)) out.push(prefix + k + ' = ' + String(t.getAsDouble()))
      else if (isCompound(t) && depth < 4) leaves(c.getCompound(k), prefix + k + '/', out, depth + 1)
    }
  }

  // ------------------------------------------------------------------ the two kinds of source
  // resolve -> { res } or { error }; read -> array of numbers (null = this field is not present) or null when the value is gone
  // The mods' saved data: with STODD Core 3 read live from each capability (and written back into it); else a copy of the player NBT.
  function capsOf(player) {
    if (S.API != null) {
      try {
        let out = new S.J.CompoundTag()
        let ks = S.API.capKeys(player)
        for (let i = 0; i < ks.length; i++) { let t = S.API.capRead(player, ks[i]); if (t != null) out.put(String(ks[i]), t) }
        return out
      } catch (e) { }
    }
    return player.getNbt().getCompound('ForgeCaps')
  }
  S.capsOf = capsOf
  let adapters = {
    nbt: {
      resolve: function (player, L) {
        let caps = capsOf(player)
        let ks = keysOf(caps), best = null, keyFound = false
        for (let i = 0; i < ks.length; i++) {
          let key = String(ks[i])
          if (!L.capKey.test(key)) continue
          keyFound = true
          let root = caps.getCompound(key)
          let paths = L.fields.map(re => findLeaf(root, re, 0))
          let n = paths.filter(p => p != null).length
          if (n > 0 && (best == null || n > best.n)) best = { n: n, key: key, paths: paths }
        }
        if (best == null) {
          return { error: keyFound ? 'a capability matching ' + String(L.capKey) + ' exists but none of its numbers is named like ' + L.fields.map(String).join(' ')
            : 'no player capability matches ' + String(L.capKey) + ' (is the mod installed? run /stodd link scan)' }
        }
        return { res: { key: best.key, paths: best.paths, desc: best.key + ' > ' + best.paths.map(p => p == null ? '(missing)' : p.join('/')).join(', ') } }
      },
      read: function (player, res) {
        let root = capsOf(player).getCompound(res.key)
        let out = []
        for (let i = 0; i < res.paths.length; i++) {
          if (res.paths[i] == null) { out.push(null); continue }
          let v = walk(root, res.paths[i])
          if (v == null || isNaN(v) || !isFinite(v)) return null
          out.push(v)
        }
        return out
      },
      write: function (player, res, values, L) {
        if (L.writeCommands && L.writeCommands.length > 0) {
          for (let i = 0; i < values.length; i++) {
            if (values[i] == null) continue
            L.writeCommands.forEach(cmd => S.run(player.server, String(cmd).replace(/\{p\}/g, player.username).replace(/\{field\}/g, String(i)).replace(/\{v\}/g, String(values[i]))))
          }
          return true
        }
        if (S.API != null) {
          // straight into the mod's live data, each number keeping its own type
          let all = true
          for (let i = 0; i < values.length; i++) {
            if (values[i] == null || res.paths[i] == null) continue
            try { if (!S.API.capSetNumber(player, res.key, res.paths[i].join('/'), values[i])) all = false } catch (e) { all = false }
          }
          return all
        }
        let patch = {}
        for (let i = 0; i < values.length; i++) {
          if (values[i] == null) continue
          let path = res.paths[i], cur = patch
          for (let j = 0; j < path.length - 1; j++) { if (!cur[path[j]]) cur[path[j]] = {}; cur = cur[path[j]] }
          cur[path[path.length - 1]] = values[i]
        }
        let out = { ForgeCaps: {} }
        out.ForgeCaps[res.key] = patch
        player.mergeNbt(out)
        return true
      }
    },
    jjc: {
      resolve: function (player, L) {
        let names = S.jjcVarNames ? S.jjcVarNames(player) : null
        if (names == null) return { error: 'the Jujutsu Craft player variables cannot be read (mod missing, or cfg.jjcVariablesClass is wrong)' }
        for (let r = 0; r < L.fields.length; r++) {
          for (let i = 0; i < names.length; i++) {
            if (L.fields[r].test(names[i]) && S.jjcVarGet(player, names[i]) != null) return { res: { name: names[i], desc: 'variable ' + names[i] } }
          }
        }
        return { error: 'no numeric Jujutsu Craft variable is named like ' + L.fields.map(String).join(' ') + ' (run /stodd link scan)' }
      },
      read: function (player, res) { let v = S.jjcVarGet(player, res.name); return v == null ? null : [v] },
      write: function (player, res, values) { return values[0] == null ? true : S.jjcVarSet(player, res.name, values[0]) }
    }
  }

  // ------------------------------------------------------------------ the mapping between a level and a mod value
  function perLevel(L) { return L.perLevel > 0 ? L.perLevel : 1 }
  function ck(id, what, i) { return 'lk_' + id + '_' + what + i }
  function calibrate(d, id, i, level, value) {
    if (String(d.getString(ck(id, 'b', i))) === '') {
      d.putString(ck(id, 'b', i), String(value))
      d.putString(ck(id, 'l', i), String(level))
    }
  }
  function cal(d, id, i) { return { b: Number(d.getString(ck(id, 'b', i))), l: Number(d.getString(ck(id, 'l', i))) } }
  function valueAt(L, d, id, i, level) {
    if (L.mode === 'table') {
      let v = L.table[0].value
      for (let r = 0; r < L.table.length; r++) if (L.table[r].level <= level) v = L.table[r].value
      return v
    }
    let c = cal(d, id, i)
    return c.b + perLevel(L) * (level - c.l)
  }
  function levelOf(L, d, id, i, value) {
    if (L.mode === 'table') {
      let lv = 1
      for (let r = 0; r < L.table.length; r++) if (L.table[r].value <= value + EPS) lv = L.table[r].level
      return lv
    }
    let c = cal(d, id, i)
    return c.l + Math.floor((value - c.b) / perLevel(L) + EPS)
  }
  function labelAt(L, level) {
    if (L.mode !== 'table' || !L.labels) return ''
    let idx = 0
    for (let r = 0; r < L.table.length; r++) if (L.table[r].level <= level) idx = r
    return L.labels[idx] || ''
  }
  function appliesTo(player, L) {
    if (L.who == null || L.who === 'all') return true
    if (S.masteryHas) return S.masteryHas(player, L.who)
    return S.canUse ? S.canUse(player, L.who) : false
  }
  function equivalent(L, d, id, vals) {
    let eqs = []
    for (let i = 0; i < vals.length; i++) if (vals[i] != null) eqs.push(levelOf(L, d, id, i, vals[i]))
    if (eqs.length === 0) return 1
    return L.combine === 'max' ? Math.max.apply(null, eqs) : Math.min.apply(null, eqs)
  }
  function resolveFor(player, id, L, m) {
    if (m.res != null) return true
    let r = adapters[L.type].resolve(player, L)
    if (r.error) { m.note = r.error; return false }
    m.res = r.res
    m.note = ''
    return true
  }
  function say(player, text) {
    if (LK.announce === false) return
    try { player.tell(Text.gold('[Link] ').append(Text.white(text))) } catch (e) { }
  }

  // ------------------------------------------------------------------ one link, one player
  function syncOne(player, id) {
    let L = LK.links[id], m = memOf(player, id), d = S.data(player), ad = adapters[L.type]
    if (!appliesTo(player, L)) { m.note = 'not for your origin'; return 0 }
    if (!resolveFor(player, id, L, m)) return 0
    let vals = null
    try { vals = ad.read(player, m.res) } catch (e) { S.log('link read ' + id + ' ' + e) }
    if (vals == null) { m.res = null; m.note = 'the value disappeared, looking for it again'; return 0 }
    let changed = 0
    // linear links: the first time a field is seen it is declared equal to the current level
    if (L.mode !== 'table') for (let i = 0; i < vals.length; i++) if (vals[i] != null) calibrate(d, id, i, S.getLevel(player), vals[i])

    // the mod is ahead: raise the STODD level (a few levels per check at most, never past the origin's cap)
    let cur = S.getLevel(player), eq = equivalent(L, d, id, vals)
    let mute = d.getInt('lk_' + id + '_mute')
    if (eq <= mute) eq = 0
    if (eq > cur) {
      let lvl = Math.min(S.maxLevelOf(S.getOrigin(player)), cur + Math.min(eq - cur, LK.maxStep || 5))
      if (lvl > cur) {
        S.setLevel(player, lvl, 0)
        d.putInt('lk_' + id + '_mute', 0)
        say(player, L.name + ' ' + (labelAt(L, S.getLevel(player)) || 'rose') + ', so your level rose to ' + S.getLevel(player) + '.')
        changed++
      }
    }

    // the STODD level is ahead: raise whatever is behind it
    let lvl2 = S.getLevel(player), out = [], need = false
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) { out.push(null); continue }
      let t = valueAt(L, d, id, i, lvl2)
      if (vals[i] < t - EPS) { out.push(t); need = true } else out.push(null)
    }
    if (!need) { m.lastTargets = ''; return changed }
    // a new target (the level moved) gets a fresh start; the same target refused three times in a row stops being tried
    let key = out.join(',')
    if (m.lastTargets !== key) { m.fails = 0; m.lastTargets = key }
    if (m.fails >= 3) { m.note = 'read-only: the mod did not accept 3 writes in a row'; return changed }
    try { ad.write(player, m.res, out, L) } catch (e) { S.log('link write ' + id + ' ' + e) }
    let after = LK.verifyWrites === false ? null : (function () { try { return ad.read(player, m.res) } catch (e) { return null } })()
    let reached = LK.verifyWrites === false
    if (after != null) {
      reached = true
      for (let i = 0; i < out.length; i++) if (out[i] != null && (after[i] == null || after[i] < out[i] - 1e-6)) reached = false
    }
    if (reached) {
      m.fails = 0; m.lastTargets = ''; m.note = ''
      say(player, L.name + ' raised to match level ' + lvl2 + (labelAt(L, lvl2) ? ': ' + labelAt(L, lvl2) : '') + '.')
      changed++
    } else {
      m.fails++
      warnOnce(id + ':' + m.fails + ':' + S.uuidOf(player), 'level link "' + id + '": the mod did not take the new value (' + (m.res.desc || '') + '), attempt ' + m.fails + ' of 3')
    }
    return changed
  }

  // Brings every link up to date for one player. Returns how many things changed.
  S.syncLinks = function (player) {
    if (player == null || S.getOrigin(player) == null) return 0
    let u = S.uuidOf(player)
    if (busy[u]) return 0
    busy[u] = true
    let n = 0
    try { ids.forEach(id => { try { n += syncOne(player, id) } catch (e) { S.log('link ' + id + ' ' + e) } }) } finally { busy[u] = false }
    return n
  }

  // An operator lowered the STODD level on purpose: do not let the mod side drag it straight back.
  //   linear links start counting from here again; table links ignore what the mod already shows until it rises further.
  S.linkMute = function (player) {
    let d = S.data(player)
    ids.forEach(id => {
      let L = LK.links[id], m = memOf(player, id)
      try {
        if (L.mode !== 'table') { for (let i = 0; i < 8; i++) { d.putString(ck(id, 'b', i), ''); d.putString(ck(id, 'l', i), '') }; return }
        if (!appliesTo(player, L) || !resolveFor(player, id, L, m)) return
        let vals = adapters[L.type].read(player, m.res)
        if (vals != null) d.putInt('lk_' + id + '_mute', equivalent(L, d, id, vals))
      } catch (e) { S.log('link mute ' + id + ' ' + e) }
    })
  }
  // Gives every link that gave up on a refused write another go (the /stodd link sync command).
  S.linkRetry = function (player) {
    ids.forEach(id => { let m = memOf(player, id); m.fails = 0; m.lastTargets = ''; m.note = '' })
    return S.syncLinks(player)
  }
  S.linkReset = function (player) {
    let d = S.data(player)
    ids.forEach(id => {
      for (let i = 0; i < 8; i++) { d.putString(ck(id, 'b', i), ''); d.putString(ck(id, 'l', i), '') }
      d.putInt('lk_' + id + '_mute', 0)
      let m = memOf(player, id)
      m.res = null; m.fails = 0; m.lastTargets = ''; m.note = ''
    })
  }

  // Every level change goes through S.applyStats; an operator lowering the level goes through S.setLevel.
  let baseApply = S.applyStats
  if (typeof baseApply === 'function') {
    S.applyStats = function (player) {
      baseApply(player)
      try { S.syncLinks(player) } catch (e) { S.log('links ' + e) }
    }
  }
  let baseSet = S.setLevel
  if (typeof baseSet === 'function') {
    S.setLevel = function (player, lvl, xp) {
      try { if (Math.max(1, lvl) < S.getLevel(player)) S.linkMute(player) } catch (e) { S.log('links mute ' + e) }
      baseSet(player, lvl, xp)
    }
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % (LK.everyTicks || 100) !== 17) return
    try { S.syncLinks(p) } catch (e) { S.log('links tick ' + e) }
  })
  PlayerEvents.loggedIn(event => {
    // give the other mods time to load their data into the player before the first look
    event.server.scheduleInTicks(160, () => { try { S.syncLinks(event.player) } catch (e) { S.log('links login ' + e) } })
  })
  PlayerEvents.loggedOut(event => {
    try { let u = S.uuidOf(event.player); delete mem[u]; delete busy[u] } catch (e) { }
  })

  // ------------------------------------------------------------------ what a player (and an operator) sees
  S.linkLines = function (player) {
    let out = [Text.gold('==== Level links ====')]
    if (S.getOrigin(player) == null) { out.push(Text.red('Choose an origin first.')); return out }
    let d = S.data(player), lvl = S.getLevel(player)
    ids.forEach(id => {
      let L = LK.links[id], m = memOf(player, id)
      if (!appliesTo(player, L)) { out.push(Text.gray(L.name + ': not for your origin')); return }
      if (!resolveFor(player, id, L, m)) { out.push(Text.yellow(L.name + ': NOT LINKED ').append(Text.gray(m.note))); return }
      let vals = null
      try { vals = adapters[L.type].read(player, m.res) } catch (e) { }
      if (vals == null) { out.push(Text.yellow(L.name + ': ').append(Text.gray('linked, but the value cannot be read right now'))); return }
      let shown = vals.filter(v => v != null).map(v => String(Math.round(v * 100) / 100)).join(' / ')
      let eq = equivalent(L, d, id, vals)
      let line = Text.green(L.name + ': linked ').append(Text.gray(m.res.desc + '   now ' + shown + ' = level ' + eq + (labelAt(L, eq) ? ' (' + labelAt(L, eq) + ')' : '') + ', your level ' + lvl))
      out.push(line)
      if (m.fails >= 3) out.push(Text.red('   read-only: the mod did not accept the values the script wrote'))
    })
    return out
  }
  S.linkScanLines = function (player) {
    let out = [Text.gold('---- STODD link scan ----')]
    try {
      let caps = player.getNbt().getCompound('ForgeCaps')
      let ks = keysOf(caps), n = 0
      out.push(Text.gray(ks.length + ' capability key(s) on you'))
      for (let i = 0; i < ks.length; i++) {
        let key = String(ks[i])
        let wanted = ids.some(id => LK.links[id].capKey && LK.links[id].capKey.test(key)) || /(prime|tpp|jujutsu|haki)/i.test(key)
        if (!wanted) continue
        n++
        let ls = []
        leaves(caps.getCompound(key), '', ls, 0)
        out.push(Text.aqua('Capability ' + key).append(Text.gray(ls.length === 0 ? ': no numbers found' : ':')))
        ls.forEach(l => out.push(Text.darkGray('   ' + l)))
      }
      if (n === 0) out.push(Text.gray('None of them belongs to True Prime Piece or Jujutsu Craft.'))
    } catch (e) { out.push(Text.red('Could not read your capability data: ' + e)) }
    if (S.jjcVarNames) {
      let names = S.jjcVarNames(player)
      if (names == null) out.push(Text.gray('Jujutsu Craft variables: not readable'))
      else {
        let rel = names.filter(nm => /(fame|grade|rank|level|exp|stat|power|tech)/i.test(nm))
        out.push(Text.gray('Jujutsu Craft variables: ' + names.length + ', of which ' + rel.length + ' look like progress:'))
        rel.slice(0, 20).forEach(nm => out.push(Text.darkGray('   ' + nm + ' = ' + String(S.jjcVarGet(player, nm)))))
      }
    }
    return out.concat(S.linkLines(player))
  }

  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    let Arguments = event.arguments
    function sendAll(ctx, lines) { lines.forEach(l => ctx.source.sendSystemMessage(l)); return 1 }
    function forTarget(label, fn) {
      return Commands.literal(label).requires(src => src.hasPermission(2))
        .executes(ctx => { let p = ctx.source.getPlayerOrException(); fn(p); ctx.source.sendSystemMessage(Text.green('Level links: ' + label + ' done for ' + p.username)); return 1 })
        .then(Commands.argument('target', Arguments.PLAYER.create(event)).executes(ctx => {
          let p = Arguments.PLAYER.getResult(ctx, 'target'); fn(p)
          ctx.source.sendSystemMessage(Text.green('Level links: ' + label + ' done for ' + p.username)); return 1
        }))
    }
    event.register(Commands.literal('stodd')
      .then(Commands.literal('link')
        .executes(ctx => sendAll(ctx, S.linkLines(ctx.source.getPlayerOrException())))
        .then(Commands.literal('scan').requires(src => src.hasPermission(2)).executes(ctx => sendAll(ctx, S.linkScanLines(ctx.source.getPlayerOrException()))))
        .then(forTarget('sync', p => { S.linkRetry(p) }))
        .then(forTarget('reset', p => { S.linkReset(p); S.syncLinks(p) }))))
  })
})()
