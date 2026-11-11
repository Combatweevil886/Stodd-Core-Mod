// priority: 430
// LOG POSE: a compass that points at an island, like the One Piece Log Pose.
//
//   * It is a vanilla compass carrying the NBT a lodestone compass uses (LodestonePos / LodestoneDimension /
//     LodestoneTracked:0b), so the needle works in the vanilla client with no extra mod; this script moves the
//     target every second.
//   * HOLD it: the action bar names the island it points at, what kind of island it is, the direction (an arrow relative to
//     where you are facing) and the distance. Its tooltip shows the same.
//   * RIGHT-CLICK it to change what it looks for (Shift + right-click goes back):
//         Next island      nearest island you have not recorded yet (sky islands when you are up in the air)
//         Nearest island   nearest island of any kind, recorded or not
//         Nearest city     nearest city island (modern, Neo City or tribal)
//         Nearest sky island
//     /stodd logpose mode <next|nearest|city|sky> does the same from chat.
//   * RECORD an island by walking to its middle (where the waystone stands: 3 seconds) or by staying anywhere on it (30 s).
//     "Next island" skips recorded islands. /stodd logpose reset forgets them all.
//   * Every player gets one the first time they join; /stodd logpose gives another if it is lost; it can be crafted
//     (compass + amethyst shard + glass pane).
//   * The target is the island's CENTRE - where its central waystone stands (45_waystones.js).
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.islandsNear) { console.error('[STODD] islands not loaded - 48_logpose.js disabled'); return }
  let C = S.cfg
  let LP = C.logPose || {}
  let DWELL = LP.dwellTicks || 600
  let CENTER_TICKS = LP.centerTicks || 60
  let CENTER_R = LP.centerRadius || 40
  let ARRIVE_R = LP.arriveRadius || 24
  let MAXREC = LP.maxRecorded || 96
  let RADII = LP.searchRadii || [800, 1500, 3000, 5000]
  let BUDGET = LP.scanBudget || 4
  let SKY_Y = LP.skyMinY || 200
  let SKY_ON = !!(C.sky && C.sky.enabled)
  let MODES = (LP.modes || [{ id: 'next', name: 'Next island', kind: 'next' }]).filter(m => m.kind !== 'sky' || SKY_ON)
  // STODD Core 3: the Log Pose is a real item (stodd_core:log_pose) with its own needle, driven by the Java side (the same modes,
  // recording and messages as below, and the same settings in logPose). Old compass Log Poses are swapped for it automatically.
  if (S.apiFlag('logPoseActive')) {
    S.newLogPose = function () { return Item.of('stodd_core:log_pose') }
    console.info('[STODD] the Log Pose is the STODD Core item; 48_logpose.js stands down')
    return
  }
  let TagParser = Java.loadClass('net.minecraft.nbt.TagParser')
  let ListTag = Java.loadClass('net.minecraft.nbt.ListTag')
  let StringTag = Java.loadClass('net.minecraft.nbt.StringTag')
  let SNBT = '{stodd_logpose:1b,LodestoneTracked:0b,LodestoneDimension:"minecraft:overworld",display:{Name:\'{"text":"Log Pose","color":"gold","italic":false}\',' +
    'Lore:[\'{"text":"Mode: Next island","color":"yellow","italic":false}\',' +
    '\'{"text":"Right-click: change what it looks for","color":"gray","italic":false}\',' +
    '\'{"text":"Reach the middle of an island to record it.","color":"dark_gray","italic":false}\']}}'

  // KubeJS exposes ItemStack.getTag()/setTag() as getNbt()/setNbt() in some builds; accept either
  function nbtOf(stack) {
    try { if (typeof stack.getNbt === 'function') return stack.getNbt() } catch (e) { }
    try { if (typeof stack.getTag === 'function') return stack.getTag() } catch (e) { }
    return null
  }
  function putNbt(stack, tag) {
    try { if (typeof stack.setNbt === 'function') { stack.setNbt(tag); return } } catch (e) { }
    try { if (typeof stack.setTag === 'function') stack.setTag(tag) } catch (e) { }
  }
  function isPose(stack) {
    try {
      if (stack == null || stack.isEmpty()) return false
      if (String(stack.id) !== 'minecraft:compass') return false
      let t = nbtOf(stack)
      return t != null && t.getBoolean('stodd_logpose')
    } catch (e) { return false }
  }
  S.newLogPose = function () {
    let st = Item.of('minecraft:compass')
    putNbt(st, TagParser.parseTag(SNBT))
    return st
  }
  function posesOf(p) {
    let out = []
    try {
      let inv = p.getInventory()
      let n = inv.getContainerSize()
      for (let i = 0; i < n; i++) { let st = inv.getItem(i); if (isPose(st)) out.push(st) }
    } catch (e) { }
    return out
  }
  function safe(text) { return String(text).replace(/[\\"']/g, '') }
  // the tooltip shows the mode and the current target; rewritten only when one of them changes
  function setLore(stack, modeName, targetText) {
    try {
      let tag = nbtOf(stack)
      if (tag == null) return
      let src = '{display:{Name:\'{"text":"Log Pose","color":"gold","italic":false}\',Lore:[' +
        '\'{"text":"Mode: ' + safe(modeName) + '","color":"yellow","italic":false}\',' +
        '\'{"text":"Pointing at: ' + safe(targetText) + '","color":"aqua","italic":false}\',' +
        '\'{"text":"Right-click: next mode. Shift + right-click: previous.","color":"gray","italic":false}\']}}'
      let parsed = TagParser.parseTag(src)
      let d = parsed.get('display')
      if (d != null) tag.put('display', d)
    } catch (e) { }
  }

  // ---------------------------------------------------------------- recipe
  ServerEvents.recipes(event => {
    try {
      let ing = (LP.recipe || ['minecraft:compass', 'minecraft:amethyst_shard', 'minecraft:glass_pane'])
      event.shapeless(S.newLogPose(), ing).id('stodd:log_pose')
    } catch (e) { console.error('[STODD] log pose recipe: ' + e) }
  })

  // ---------------------------------------------------------------- recorded islands (per player, saved)
  function readSeen(d) {
    let map = {}, arr = []
    try {
      let lt = d.getList('lp_seen', 8)
      for (let i = 0; i < lt.size(); i++) { let k = String(lt.getString(i)); map[k] = true; arr.push(k) }
    } catch (e) { }
    return { map: map, arr: arr }
  }
  function addSeen(d, key) {
    let lt = d.getList('lp_seen', 8)
    if (!d.contains('lp_seen')) { lt = new ListTag(); d.put('lp_seen', lt) }
    lt.add(StringTag.valueOf(key))
    if (lt.size() > MAXREC) {   // forget the oldest (rebuild the list: ListTag.remove() is overloaded and unreliable from JS)
      let nl = new ListTag()
      for (let i = lt.size() - MAXREC; i < lt.size(); i++) nl.add(StringTag.valueOf(String(lt.getString(i))))
      d.put('lp_seen', nl)
    }
  }
  function modeIndex(d) {
    let i = d.getInt('lp_mode')
    return i >= 0 && i < MODES.length ? i : 0
  }

  // ---------------------------------------------------------------- picking the island
  // Nearest island that is not excluded. `prefKey` (the current target) is kept unless something is clearly nearer,
  // so the needle does not flip between two islands of nearly equal distance.
  // `sky` = true looks for floating islands only, false for ground islands only. `pred(entry)` narrows it further.
  S.nextIsland = function (level, x, z, excl, prefKey, sky, pred) {
    for (let r = 0; r < RADII.length; r++) {
      let res = S.islandsNear(level, x, z, RADII[r], BUDGET, !!sky)
      let best = null, pref = null
      for (let i = 0; i < res.list.length; i++) {
        let it = res.list[i]
        if (!!it.e.sky !== !!sky) continue
        if (excl[it.e.key]) continue
        if (pred != null && !pred(it.e)) continue
        if (best == null) best = it
        if (it.e.key === prefKey) pref = it
      }
      if (best != null) {
        let pick = (pref != null && pref.d <= best.d * 1.15) ? pref : best
        return { e: pick.e, d: pick.d, pending: !res.complete }
      }
      if (!res.complete) return { e: null, d: 0, pending: true }
    }
    return null
  }

  function aim(stack, tx, tz) {
    let tag = nbtOf(stack)
    if (tag == null) return false
    let lp = tag.contains('LodestonePos') ? tag.getCompound('LodestonePos') : null
    if (lp != null && lp.getInt('X') === tx && lp.getInt('Z') === tz && String(tag.getString('LodestoneDimension')) === 'minecraft:overworld') return false
    let c = new S.J.CompoundTag()
    c.putInt('X', tx); c.putInt('Y', 64); c.putInt('Z', tz)
    tag.put('LodestonePos', c)
    tag.putString('LodestoneDimension', 'minecraft:overworld')
    tag.putBoolean('LodestoneTracked', false)
    return true
  }

  let ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
  function arrow(p, tx, tz) {
    try {
      let yaw = Number(typeof p.getYRot === 'function' ? p.getYRot() : p.yaw)
      let want = Math.atan2(-(tx - p.x), tz - p.z) * 180 / Math.PI
      let rel = ((want - yaw) % 360 + 540) % 360 - 180
      return ARROWS[((Math.round(rel / 45) % 8) + 8) % 8]
    } catch (e) { return '' }
  }
  function actionbar(p, parts) {
    let extra = parts.map(x => '{"text":"' + safe(x[0]) + '","color":"' + x[1] + '"}').join(',')
    S.run(p.server, 'title ' + p.username + ' actionbar {"text":"","extra":[' + extra + ']}')
  }
  function bigTitle(p, title, sub, color) {
    S.run(p.server, 'title ' + p.username + ' times 8 50 14')
    S.run(p.server, 'title ' + p.username + ' subtitle {"text":"' + safe(sub) + '","color":"gray"}')
    S.run(p.server, 'title ' + p.username + ' title {"text":"' + safe(title) + '","color":"' + color + '"}')
  }
  function bar(done, total) {
    let n = 8, f = Math.max(0, Math.min(n, Math.round(n * done / total))), s = ''
    for (let i = 0; i < n; i++) s += i < f ? '▮' : '▯'
    return s
  }
  function plainName(label) { return String(label).replace(/\s*\(.*\)\s*$/, '') }

  // ---------------------------------------------------------------- per-player loop
  let states = new Map()
  function stateOf(p) {
    let id = S.uuidOf(p)
    let s = states.get(id)
    if (s == null) { s = { cur: null, since: 0, nearSince: -1, last: -9999, target: null, tx: 0, tz: 0, tinfo: null, up: false, mode: -1, loreKey: '', arrived: '', empty: 0 }; states.set(id, s) }
    return s
  }
  S.logPoseTick = function (p) {
    let level = p.level
    if (String(level.dimension).indexOf('minecraft:overworld') < 0) return
    let poses = posesOf(p)
    if (poses.length === 0) return
    let s = stateOf(p)
    let now = Number(level.getGameTime())
    let d = S.data(p)
    let mi = modeIndex(d), mode = MODES[mi]
    if (s.mode !== mi) { s.mode = mi; s.target = null; s.tinfo = null }
    // high up, "next island" looks for floating islands; on the ground, for ordinary ones
    let up = SKY_ON && p.y >= SKY_Y
    if (up !== s.up) { s.up = up; if (mode.kind === 'next') { s.target = null; s.tinfo = null } }
    let wantSky = mode.kind === 'sky' || (mode.kind === 'next' && up)
    let here
    if (up) {
      let sk = S.skyIslandHere(level, p.x, p.y, p.z)
      here = sk == null ? null : S.skyInfo(level, sk)
    } else here = S.islandAt(level, Math.floor(p.x), Math.floor(p.z))
    let onIsland = here != null && !here.ocean
    let seen = readSeen(d)
    let dwell = null, recorded = null, near = false
    if (onIsland) {
      if (s.cur !== here.key || now - s.last > 200) { s.cur = here.key; s.since = now; s.nearSince = -1 }
      s.last = now
      let cd = Math.sqrt((here.peakX - p.x) * (here.peakX - p.x) + (here.peakZ - p.z) * (here.peakZ - p.z))
      near = cd <= CENTER_R
      if (near) { if (s.nearSince < 0) s.nearSince = now } else s.nearSince = -1
      if (!seen.map[here.key]) {
        let left = DWELL - (now - s.since)
        if (s.nearSince >= 0) left = Math.min(left, CENTER_TICKS - (now - s.nearSince))
        if (left <= 0) {
          addSeen(d, here.key)
          seen = readSeen(d)
          recorded = here
        } else dwell = { left: left, total: s.nearSince >= 0 ? CENTER_TICKS : DWELL }
      }
    }
    let excl = {}
    if (mode.kind === 'next') for (let k in seen.map) excl[k] = true
    if (onIsland) excl[here.key] = true
    let pred = null
    if (mode.kind === 'themes') {
      let ids = mode.themes || []
      pred = e => { let i = S.islandInfo(level, e); return i != null && ids.indexOf(i.theme.id) >= 0 }
    }
    let nx = S.nextIsland(level, p.x, p.z, excl, s.target, wantSky, pred)
    // "next island" with everything nearby recorded: fall back to the nearest island that is not the one we stand on
    if (mode.kind === 'next' && nx != null && nx.e == null && !nx.pending) nx = null
    if (mode.kind === 'next' && nx == null) {
      let ex2 = {}
      if (onIsland) ex2[here.key] = true
      nx = S.nextIsland(level, p.x, p.z, ex2, s.target, wantSky, null)
    }
    let pending = nx != null && nx.e == null && nx.pending
    if (nx != null && nx.e != null) {
      if (s.target !== nx.e.key) { s.target = nx.e.key; s.tinfo = S.islandInfo(level, nx.e); s.arrived = '' }
      s.tx = nx.e.x; s.tz = nx.e.z
      s.empty = 0
    } else if (nx == null) { s.empty++; if (s.empty > 2) { s.target = null; s.tinfo = null } }
    if (s.target != null) {
      poses.forEach(st => aim(st, s.tx, s.tz))
      let lk = mode.id + '|' + s.target
      if (lk !== s.loreKey) {
        s.loreKey = lk
        let txt = s.tinfo ? plainName(s.tinfo.label) + ' (' + s.tinfo.theme.name + ')' : 'an island'
        poses.forEach(st => setLore(st, mode.name, txt))
      }
    }
    // messages
    if (recorded != null) {
      p.tell(Text.gold('[Log Pose] ').append(Text.white('Recorded ')).append(Text.yellow(plainName(recorded.label))).append(Text.gray(' (' + recorded.theme.name + ')')).append(Text.white('.')))
      bigTitle(p, plainName(recorded.label), 'Island recorded', recorded.theme.color || 'gold')
      S.run(p.server, 'playsound minecraft:block.amethyst_block.resonate player ' + p.username + ' ~ ~ ~ 1 1.3')
    }
    if (s.target != null && s.tinfo != null) {
      let ddx = s.tx - p.x, ddz = s.tz - p.z
      if (Math.sqrt(ddx * ddx + ddz * ddz) <= ARRIVE_R && s.arrived !== s.target && mode.kind !== 'next') {
        s.arrived = s.target
        p.tell(Text.gold('[Log Pose] ').append(Text.white('You have arrived at ')).append(Text.yellow(plainName(s.tinfo.label))).append(Text.white('.')))
      } else if (Math.sqrt(ddx * ddx + ddz * ddz) <= ARRIVE_R) s.arrived = s.target
    }
    // text above the hotbar while a pose is in hand
    let holding = isPose(p.getMainHandItem()) || isPose(p.getOffhandItem())
    if (!holding) return
    if (s.target == null) {
      let msg = pending ? 'searching for islands...' : (mode.kind === 'next' ? 'no unrecorded island within ' + RADII[RADII.length - 1] + ' blocks' : 'nothing of that kind within ' + RADII[RADII.length - 1] + ' blocks')
      actionbar(p, [['Log Pose ', 'gold'], [msg, 'gray'], ['   [' + mode.name + ']', 'dark_gray']])
      return
    }
    let dist = Math.round(Math.sqrt((s.tx - p.x) * (s.tx - p.x) + (s.tz - p.z) * (s.tz - p.z)))
    let col = (s.tinfo && s.tinfo.theme.color) || 'yellow'
    let parts = [[arrow(p, s.tx, s.tz) + ' ', 'gold'], [plainName(s.tinfo ? s.tinfo.label : 'island'), col], [' (' + (s.tinfo ? s.tinfo.theme.name : '') + ')', 'gray'], ['  ' + dist + ' blocks', 'white']]
    if (dwell != null) {
      parts.push(['   recording ' + bar(dwell.total - dwell.left, dwell.total) + ' ' + Math.ceil(dwell.left / 20) + ' s', 'aqua'])
    } else if (onIsland && seen.map[here.key]) parts.push(['   recorded', 'green'])
    parts.push(['   [' + mode.name + ']', 'dark_gray'])
    actionbar(p, parts)
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % 20 !== 11) return
    try { S.logPoseTick(p) } catch (e) { S.log('log pose: ' + e) }
  })

  // ---------------------------------------------------------------- changing the mode
  function setMode(p, idx) {
    let d = S.data(p)
    d.putInt('lp_mode', idx)
    let s = stateOf(p)
    s.mode = -1; s.target = null; s.tinfo = null
    let m = MODES[idx]
    S.run(p.server, 'title ' + p.username + ' actionbar {"text":"Log Pose: ' + safe(m.name) + '","color":"gold"}')
    S.run(p.server, 'playsound minecraft:block.note_block.chime player ' + p.username + ' ~ ~ ~ 0.6 ' + (0.8 + 0.2 * idx))
    try { S.logPoseTick(p) } catch (e) { }
  }
  S.logPoseCycle = function (p, back) {
    let i = modeIndex(S.data(p)) + (back ? -1 : 1)
    i = ((i % MODES.length) + MODES.length) % MODES.length
    setMode(p, i)
    return MODES[i]
  }
  let lastCycle = new Map()
  ItemEvents.rightClicked(event => {
    let p = event.player
    if (p == null) return
    if (!isPose(event.item)) return
    try { if (event.hand != null && String(event.hand).indexOf('OFF') >= 0 && isPose(p.getMainHandItem())) return } catch (e) { }
    let now = Number(p.level.getGameTime()), id = S.uuidOf(p)
    if (now - (lastCycle.get(id) || -99) < 4) return
    lastCycle.set(id, now)
    let back = false
    try { back = !!p.isShiftKeyDown() } catch (e) { try { back = !!p.crouching } catch (x) { } }
    S.logPoseCycle(p, back)
  })

  // ---------------------------------------------------------------- first join + commands
  PlayerEvents.loggedIn(event => {
    if (!LP.giveOnFirstJoin) return
    let p = event.player
    event.server.scheduleInTicks(80, () => {
      try {
        let d = S.data(p)
        if (d.getBoolean('lp_given')) return
        d.putBoolean('lp_given', true)
        if (posesOf(p).length === 0) p.give(S.newLogPose())
        p.tell(Text.gold('[Log Pose] ').append(Text.white('You have a Log Pose. Hold it: it shows the island it points at, the direction and the distance.')))
        p.tell(Text.gold('[Log Pose] ').append(Text.white('Right-click it to switch between next island / nearest island / nearest city / sky island. Walk to an island\'s middle to record it.')))
      } catch (e) { S.log('log pose gift: ' + e) }
    })
  })
  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    let mode = Commands.literal('mode').executes(ctx => {
      let p = ctx.source.getPlayerOrException()
      ctx.source.sendSystemMessage(Text.gold('[Log Pose] ').append(Text.white('Mode: ' + MODES[modeIndex(S.data(p))].name + '.  Options: ' + MODES.map(m => m.id).join(', '))))
      return 1
    })
    MODES.forEach((m, idx) => {
      mode = mode.then(Commands.literal(m.id).executes(ctx => {
        setMode(ctx.source.getPlayerOrException(), idx)
        ctx.source.sendSystemMessage(Text.gold('[Log Pose] ').append(Text.white('Mode: ' + m.name + '.')))
        return 1
      }))
    })
    event.register(Commands.literal('stodd')
      .then(Commands.literal('logpose')
        .executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          if (posesOf(p).length > 0) { ctx.source.sendSystemMessage(Text.yellow('You already carry a Log Pose.')); return 0 }
          p.give(S.newLogPose())
          ctx.source.sendSystemMessage(Text.green('Here is a new Log Pose.'))
          return 1
        })
        .then(mode)
        .then(Commands.literal('reset').executes(ctx => {
          let p = ctx.source.getPlayerOrException()
          let d = S.data(p)
          d.put('lp_seen', new ListTag())
          states.delete(S.uuidOf(p))
          ctx.source.sendSystemMessage(Text.green('Your Log Pose forgot every recorded island.'))
          return 1
        }))))
  })
})()
