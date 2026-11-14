// priority: 800
// ORIGINS: applies Curios slots, cyberware capacity, starter kits, and enforces which power
// systems each origin may use (Devil Fruits, Cursed Energy, Dark Magic, Cyberware).
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 10_origins.js disabled'); return }
  let C = S.cfg
  let CuriosApi = null
  try { CuriosApi = Java.loadClass('top.theillusivec4.curios.api.CuriosApi') } catch (e) { console.warn('[STODD] Curios API not found, slot control disabled') }

  // ----------------------------------------------------------------- Curios
  function curiosHandler(player) {
    if (CuriosApi == null) return null
    try { let o = CuriosApi.getCuriosInventory(player).resolve(); if (o.isPresent()) return o.get() } catch (e) { }
    try { let o = CuriosApi.getCuriosHelper().getCuriosHandler(player).resolve(); if (o.isPresent()) return o.get() } catch (e) { }
    return null
  }
  function slotBase(id, player) {
    try { let o = CuriosApi.getSlot(id, player.level); if (o.isPresent()) return o.get().getSize() } catch (e) { }
    try { let o = CuriosApi.getSlot(id); if (o.isPresent()) return o.get().getSize() } catch (e) { }
    return null
  }
  S.applySlots = function (player, origin) {
    if (C.slotsFromJar) return // the data jar sets exact counts with /curios set
    let handler = curiosHandler(player)
    if (handler == null) return
    let target = C.slots[origin]
    C.slotIds.forEach(id => {
      let want = target[id]
      if (want == null) return
      let opt = handler.getStacksHandler(id)
      if (opt == null || !opt.isPresent()) return
      let stacks = opt.get()
      let uuid = S.J.UUID.fromString(S.UUIDS.slot[id])
      let mods = stacks.getModifiers()
      let ours = mods.containsKey(uuid) ? mods.get(uuid).getAmount() : 0
      let base = slotBase(id, player)
      if (base == null) base = stacks.getSlots() - ours
      let delta = want - base
      if (mods.containsKey(uuid) && Math.abs(ours - delta) < 1e-6) return
      if (mods.containsKey(uuid)) stacks.removeModifier(uuid)
      if (delta !== 0) stacks.addPermanentModifier(new S.J.AttributeModifier(uuid, 'stodd_origin_' + id, delta, S.J.Operation.ADDITION))
      S.log(player.username + ' slot ' + id + ' base ' + base + ' -> ' + want)
    })
  }

  // -------------------------------------------------------------- Cyberware
  S.applyCyberCapacity = function (player, origin, force) {
    let cc = C.cyberCapacity[origin]
    if (cc == null) return
    let value = Math.round(cc.base + cc.perLevel * (S.getLevel(player) - 1))
    let d = S.data(player)
    if (!force && d.contains('cyberCap') && d.getInt('cyberCap') === value) return
    d.putInt('cyberCap', value)
    C.cyberCapacityCommands.forEach(t => S.run(player.server, t.replace('{p}', player.username).replace('{v}', String(value))))
  }

  // The Cyberware User's starting chrome: installed, not handed out. Edgerunner may still be settling in right after the origin is
  // chosen, so it is tried a few times; whatever cannot be installed is given as an item (giveKiroshiItem).
  function giveCyberKit(player) {
    let d = S.data(player)
    if (d.getBoolean('cyberKit')) return
    d.putBoolean('cyberKit', true)
    C.kiroshiInstallCommands.forEach(t => S.run(player.server, t.replace('{p}', player.username)))
    let todo = (C.cyberStarterImplants || []).slice()
    let tries = 0
    function attempt() {
      tries++
      let left = []
      todo.forEach(id => {
        let r = S.installImplant(player, id)
        if (r === 'installed') player.tell(Text.aqua('[Cyberware] ').append(Text.white('Your ' + S.itemName(id) + ' are already installed. Open your cyberware to use them.')))
        else if (r !== 'had') left.push(id)
      })
      todo = left
      if (todo.length === 0) return
      if (tries < 4) { player.server.scheduleInTicks(40, () => { try { attempt() } catch (e) { } }); return }
      if (C.giveKiroshiItem) {
        todo.forEach(id => { try { player.give(Item.of(id)) } catch (e) { } })
        player.tell(Text.aqua('[Cyberware] ').append(Text.white('Your starting chrome could not be installed here, so it came with you: install it at a Ripperdoc.')))
      }
    }
    player.server.scheduleInTicks(20, () => { try { attempt() } catch (e) { } })
  }

  // ------------------------------------------------------------ Path rules
  // Returns true / false. system: 'fruit' | 'sorcery' | 'magic' | 'cyber'
  S.canUse = function (player, system) {
    let origin = S.getOrigin(player)
    if (origin == null) return false
    let rule = C.rules[origin][system]
    if (rule === true) return true
    if (rule === false) return false
    let path = String(S.data(player).getString('path'))
    return path === '' || path === system
  }
  S.lockPath = function (player, system) {
    let origin = S.getOrigin(player)
    if (origin == null || C.rules[origin][system] !== 'path') return
    let d = S.data(player)
    if (String(d.getString('path')) !== '') return
    d.putString('path', system)
    player.tell(Text.yellow('[' + S.ORIGIN_NAMES[origin] + '] ').append(Text.white('You have walked the path of the ')).append(Text.gold(C.systemNames[system])).append(Text.white('. The other paths are now closed to you.')))
    player.server.runCommandSilent('playsound minecraft:block.anvil.use player ' + player.username + ' ~ ~ ~ 1 0.6')
  }
  function deny(player, msg) {
    player.setStatusMessage(Text.red(msg))
    player.server.runCommandSilent('playsound minecraft:block.note_block.bass player ' + player.username + ' ~ ~ ~ 1 0.5')
  }
  S.deny = deny

  function denyText(player, system) {
    let origin = S.getOrigin(player)
    if (origin == null) return 'Choose an origin first.'
    if (C.rules[origin][system] === 'path') return 'You have already chosen another path.'
    let t = {
      fruit: 'Your body rejects the Devil Fruit.', sorcery: 'You have no Cursed Energy to channel.',
      cyber: 'Your body rejects all chrome.', magic: 'The dark arts will not answer you.'
    }
    return t[system]
  }
  S.denyText = denyText

  // ------------------------------------------------------------- Item gate
  // ONE decision point for "may this player use this item?", used by every layer:
  //   1. the data jar          Apoli prevent_item_use / prevent_block_use powers (stodd:<origin>/no_*)
  //   2. KubeJS                right-click on an item, right-click on a block (below)
  //   3. Forge                 LivingEntityUseItemEvent Start / Tick (hooks in startup_scripts, call stoddUseGate)
  //   4. sweeps                S.sweepHeld / S.enforceSystems remove a power that got through anyway
  function systemOfStack(stack) {
    if (stack == null) return null
    try { if (stack.isEmpty()) return null } catch (e) { }
    let system = S.systemOfItem(String(stack.id))
    if (system == null) {
      try {
        if (stack.hasTag('stodd:devil_fruits')) system = 'fruit'
        else if (stack.hasTag('stodd:magic_items')) system = 'magic'
      } catch (e) { }
    }
    if (system == null && S.isSorceryStack && S.isSorceryStack(stack)) system = 'sorcery'
    return system
  }
  S.systemOfStack = systemOfStack
  let lastDeny = new Map()
  // true = the player may NOT use this stack. Tells them why (at most twice a second). lock = close the other
  // Swordsman paths when the use is allowed.
  S.itemBlocked = function (player, stack, lock) {
    if (player == null) return false
    try { if (player.isCreative()) return false } catch (e) { }
    let system = systemOfStack(stack)
    if (system == null) return false
    if (!S.canUse(player, system)) {
      let k = String(S.uuidOf(player)), now = Date.now()
      if ((lastDeny.get(k) || 0) + 500 < now) { lastDeny.set(k, now); deny(player, denyText(player, system)); S.log(player.username + ' blocked from ' + system + ' item ' + String(stack.id)) }
      return true
    }
    if (lock) S.lockPath(player, system)
    return false
  }
  // Right click on an item (air or block)
  // With STODD Core 3 the Java gate enforces these on Forge's own events (and tells the player once); the script handlers stand down.
  let JAVA_GATE = S.apiFlag('gateActive')
  S.javaGate = JAVA_GATE
  ItemEvents.rightClicked(event => { if (JAVA_GATE) return; if (S.itemBlocked(event.player, event.item, true)) event.cancel() })
  // Forge-level hook: called by the startup script for LivingEntityUseItemEvent Start / Tick. true = cancel the use.
  global.stoddUseGate = function (entity, stack) {
    if (JAVA_GATE) return false
    try {
      if (entity == null || !entity.isPlayer()) return false
      return S.itemBlocked(entity, stack, false)
    } catch (e) { return false }
  }

  // Ripperdocs (block) refuse origins that may not wear chrome; Malum's altars and machines refuse everyone but the
  // Dark Magician; holding a forbidden power item blocks block use too
  BlockEvents.rightClicked(event => {
    if (JAVA_GATE) return
    let player = event.player
    if (player == null || player.isCreative()) return
    let id = String(event.block.id)
    if (C.ripperdocBlocks.indexOf(id) >= 0) {
      if (!S.canUse(player, 'cyber')) { deny(player, denyText(player, 'cyber')); event.cancel() }
      return
    }
    let bsys = S.systemOfBlock(id)
    if (bsys != null && !S.canUse(player, bsys)) { deny(player, denyText(player, bsys)); event.cancel(); return }
    if (S.itemBlocked(player, event.item, false)) event.cancel()
  })
  // Ripperdoc NPCs (Night City villagers etc.)
  ItemEvents.entityInteracted(event => {
    if (JAVA_GATE) return
    let player = event.player
    if (player == null || player.isCreative()) return
    let tid = S.typeId(event.target)
    let prof = ''
    try { prof = String(event.target.getVillagerData().getProfession()) } catch (e) { }
    if (!(C.ripperdocEntityPattern.test(tid) || C.ripperdocEntityPattern.test(prof))) return
    if (!S.canUse(player, 'cyber')) { deny(player, denyText(player, 'cyber')); event.cancel() }
  })

  // ----------------------------------------------- Powers a player already holds
  // Some powers reach a player without an item the gate could stop (a fruit can come from an NPC or a command). Forge saves each mod's per-player data under ForgeCaps, so a held power is
  // found by looking there (cfg.hold[system]). This is the backstop behind the item gate, not the primary lock.
  S.heldPower = function (player, system) {
    let h = C.hold[system]
    if (h == null) return null
    try {
      let caps = player.getNbt().getCompound('ForgeCaps')
      let keys = caps.getAllKeys().toArray()
      for (let i = 0; i < keys.length; i++) {
        let k = String(keys[i])
        if (!h.holdKey.test(k)) continue
        let m = h.holdValue.exec(String(caps.get(k)))
        if (m) return m[0]
      }
    } catch (e) { }
    return null
  }
  // Takes the power away. Returns true when one of the configured commands reported success.
  S.clearPower = function (player, system) {
    let h = C.hold[system]
    if (h == null) return false
    let ok = false
    h.clearCommands.forEach(t => {
      if (ok) return
      try {
        let r = player.server.runCommandSilent(t.replace('{p}', player.username))
        if (Number(r) > 0) ok = true
      } catch (e) { }
    })
    return ok
  }
  let lastHoldTell = new Map()
  // For each tracked system the origin may NOT hold: remove a power that got through. For a 'path' origin with no
  // path chosen yet, holding the power simply locks that path.
  S.sweepHeld = function (player) {
    try {
      if (player.isCreative() || player.isSpectator()) return false
      let origin = S.getOrigin(player)
      if (origin == null) return false
      let acted = false
      Object.keys(C.hold).forEach(system => {
        if (C.rules[origin][system] === true) return
        let held = S.heldPower(player, system)
        if (held == null) return
        if (S.canUse(player, system)) { S.lockPath(player, system); return }
        let cleared = S.clearPower(player, system)
        acted = true
        let k = String(S.uuidOf(player)) + system, now = Date.now()
        if ((lastHoldTell.get(k) || 0) + 60000 < now) {
          lastHoldTell.set(k, now)
          if (cleared) player.tell(Text.red('[Origin] ').append(Text.white(denyText(player, system) + ' The power leaves you.')))
          else player.tell(Text.red('[Origin] ').append(Text.white(denyText(player, system) + ' The power could not be removed automatically - ask an admin to run /stodd scan.')))
          console.warn('[STODD] ' + player.username + ' (' + origin + ') holds a ' + system + ' power (' + held + '); removal ' + (cleared ? 'succeeded' : 'FAILED - no command in cfg.hold.' + system + '.clearCommands worked'))
        }
      })
      return acted
    } catch (e) { S.log('sweepHeld ' + e); return false }
  }
  
  // --------------------------------------------- Level-grown slots (Weakling)
  // slotsByMilestone[origin][floor(level / 5)] -> exact Curios counts. Sent as /curios set commands, like the jar does.
  function milestoneRow(origin, level) {
    let rows = C.slotsByMilestone[origin]
    if (rows == null) return null
    let idx = Math.min(rows.length - 1, Math.floor(level / C.slotMilestoneEvery))
    return { idx: idx, row: rows[idx] }
  }
  S.hasGrowingSlots = function (origin) { return C.slotsByMilestone[origin] != null }
  S.applyMilestoneSlots = function (player, origin, force) {
    let m = milestoneRow(origin, S.getLevel(player))
    if (m == null) return false
    let d = S.data(player)
    if (!force && d.contains('slotRow') && d.getInt('slotRow') === m.idx) return false
    d.putInt('slotRow', m.idx)
    C.slotIds.forEach(id => {
      if (m.row[id] == null) return
      S.run(player.server, 'curios set ' + id + ' ' + player.username + ' ' + m.row[id])
    })
    return true
  }
  S.slotTotalAt = function (origin, level) {
    let m = milestoneRow(origin, level), t = 0
    if (m == null) return null
    C.slotIds.forEach(id => { t += m.row[id] || 0 })
    return t
  }

  // ---------------------------------------------------------- Diagnostics
  // /stodd check: shows which layer of each restriction is in place for the player who runs it.
  S.hasCommand = function (server, root) {
    try { return server.getCommands().getDispatcher().getRoot().getChild(root) != null } catch (e) { return null }
  }
  S.diagnose = function (player) {
    let out = []
    let origin = S.getOrigin(player)
    if (origin == null) {
      out.push(Text.red('Origin: none found. The origin marker power has not run (no stodd_o_* tag). Pick an origin, or check that stodd_core is in mods/.'))
      return out
    }
    out.push(Text.gold('Origin: ').append(Text.yellow(S.ORIGIN_NAMES[origin])).append(Text.gray('   level ' + S.getLevel(player))))
    let rules = C.rules[origin]
    let word = v => v === true ? 'allowed' : (v === false ? 'BLOCKED' : 'one path only')
    let parts = []
    C.systems.forEach(sys => { parts.push(C.systemNames[sys] + ': ' + word(rules[sys])) })
    parts.push('Cyberware: ' + (rules.cyber ? 'allowed' : 'BLOCKED'))
    out.push(Text.gray(parts.join('   ')))
    let cc = C.cyberCapacity[origin]
    out.push(Text.gray('Cyberware tolerance (capacity) target: ' + Math.round(cc.base + cc.perLevel * (S.getLevel(player) - 1))))
    let paths = C.systems.filter(sys => rules[sys] === 'path')
    if (paths.length > 0) out.push(Text.gray('Path (' + paths.map(x => C.systemNames[x]).join(' / ') + '): ' + (String(S.data(player).getString('path')) || 'none chosen yet')))
    if (S.hasGrowingSlots(origin)) out.push(Text.gray('Accessory slots now: ' + S.slotTotalAt(origin, S.getLevel(player)) + '  (grows every ' + C.slotMilestoneEvery + ' levels)'))
    // the item in hand
    try {
      let held = player.getMainHandItem()
      let sys = systemOfStack(held)
      if (sys != null) out.push(Text.gray('Held item ' + String(held.id) + ' counts as: ' + sys + ' -> ' + (S.canUse(player, sys) ? 'allowed' : 'BLOCKED')))
    } catch (e) { }
    // powers currently held, as far as they can be seen
    Object.keys(C.hold).forEach(sys => {
      let h = S.heldPower(player, sys)
      out.push(Text.gray(C.systemNames[sys] + ' power found on you: ' + (h == null ? 'none' : h)))
    })
    // mods behind each system
    C.systems.forEach(sys => {
      if (sys === 'sorcery') return
      let mods = S.systemMods[sys] || []
      out.push(mods.length > 0 ? Text.green('OK   ' + C.systemNames[sys] + ' mod found: ' + mods.join(', ') + ' (' + S.systemItems[sys].length + ' items gated)')
        : Text.yellow('NONE ' + C.systemNames[sys] + ': no matching mod installed, so nothing to gate yet'))
    })
    // the commands the restrictions depend on
    let cmds = [['projectedgerunner', 'Project: Edgerunner capacity command'], ['curios', 'Curios slot command']]
    cmds.forEach(c => {
      let has = S.hasCommand(player.server, c[0])
      out.push(has === true ? Text.green('OK   /' + c[0] + ' exists (' + c[1] + ')') : Text.red((has === false ? 'MISSING   /' : 'UNKNOWN   /') + c[0] + ' (' + c[1] + ')'))
    })
    return out
  }


  // /stodd scan (operators): what discovery found, and where the running player's mods keep their per-player data.
  // Paste this output back to correct the detection patterns in 00_config.js (cfg.detect, cfg.hold).
  S.scanLines = function (player) {
    let out = []
    out.push(Text.gold('---- STODD scan ----'))
    C.systems.forEach(sys => {
      if (sys === 'sorcery') return
      let mods = S.systemMods[sys] || []
      out.push(Text.yellow(C.systemNames[sys]).append(Text.gray(': mods [' + mods.join(', ') + ']  items ' + S.systemItems[sys].length + '  blocks ' + S.systemBlocks[sys].length)))
      if (S.systemItems[sys].length > 0) out.push(Text.gray('   e.g. ' + S.systemItems[sys].slice(0, 8).join(', ')))
    })
    out.push(Text.yellow('Island themes in use: ').append(Text.gray(S.activeThemes.map(t => t.id).join(', '))))
    // the player's mod capability data: keys, and a short peek where a tracked mod is involved
    try {
      let caps = player.getNbt().getCompound('ForgeCaps')
      let keys = caps.getAllKeys().toArray(), tracked = []
      Object.keys(C.hold).forEach(sys => { tracked.push(C.hold[sys].holdKey) })
      let n = 0
      for (let i = 0; i < keys.length; i++) {
        let k = String(keys[i]), hit = false
        for (let j = 0; j < tracked.length; j++) if (tracked[j].test(k)) hit = true
        if (!hit) continue
        n++
        let txt = String(caps.get(k))
        out.push(Text.aqua('Capability ' + k).append(Text.gray(' (' + txt.length + ' chars): ' + txt.substring(0, 220))))
      }
      if (n === 0) out.push(Text.gray('No capability data matched the tracked mods (' + keys.length + ' capability keys on you).'))
    } catch (e) { out.push(Text.red('Could not read your capability data: ' + e)) }
    return out
  }

  // ------------------------------------------------------- Origin lifecycle
  S.onOriginChanged = function (player, origin, previous) {
    let d = S.data(player)
    d.putString('origin', origin)
    if (previous !== '' && previous !== origin) {
      d.putString('path', '') // a fresh start for path rules
      // Leaving an origin for one that cannot hold a power the player has removes it
      if (S.sweepHeld) S.sweepHeld(player)
      // A level above the new origin's cap comes down to it
      let cap = S.maxLevelOf(origin)
      if (S.getLevel(player) > cap && S.setLevel) S.setLevel(player, cap, 0)
    }
    S.applySlots(player, origin)
    if (S.hasGrowingSlots(origin)) S.applyMilestoneSlots(player, origin, true)
    S.applyCyberCapacity(player, origin, true)
    if (origin === 'cyberware_user') giveCyberKit(player)
    if (S.applyStats) S.applyStats(player)
    if (S.enforceSystems) S.enforceSystems(player, origin)
    player.tell(Text.gold('[Origin] ').append(Text.white('You are a ')).append(Text.yellow(S.ORIGIN_NAMES[origin])).append(Text.white('. Type ')).append(Text.aqua('/stodd')).append(Text.white(' to see your level and limits.')))
  }

  S.refreshOrigin = function (player, force) {
    let origin = S.getOrigin(player)
    if (origin == null) return
    let d = S.data(player)
    let prev = String(d.getString('origin'))
    if (force || prev !== origin) {
      if (prev !== origin) S.onOriginChanged(player, origin, prev)
      else {
        S.applySlots(player, origin)
        if (S.hasGrowingSlots(origin)) S.applyMilestoneSlots(player, origin, true)
        S.applyCyberCapacity(player, origin, true)
        if (S.applyStats) S.applyStats(player)
      }
    }
  }

  PlayerEvents.tick(event => {
    let player = event.player
    if (C.holdSweepTicks > 0 && player.age % C.holdSweepTicks === 53) S.sweepHeld(player)
    if (player.age % 6000 === 2999) { let o = S.getOrigin(player); if (o != null) S.applyCyberCapacity(player, o, true) }
    if (player.age % 40 !== 7) return
    S.refreshOrigin(player, false)
    // slow safety pass: re-assert slots and enforce restrictions every ~30s
    if (player.age % 600 === 7) {
      let origin = S.getOrigin(player)
      if (origin != null) {
        S.applySlots(player, origin)
        if (S.hasGrowingSlots(origin)) S.applyMilestoneSlots(player, origin, true)
        if (S.enforceSystems) S.enforceSystems(player, origin)
      }
    }
  })
  PlayerEvents.loggedIn(event => {
    event.server.scheduleInTicks(40, () => { try { S.refreshOrigin(event.player, true) } catch (e) { console.error(e) } })
  })
  PlayerEvents.respawned(event => {
    event.server.scheduleInTicks(20, () => { try { S.refreshOrigin(event.player, true) } catch (e) { console.error(e) } })
  })

  // Called from the startup script when any item finishes being used (eating a fruit etc.)
  global.stoddOnUseFinish = function (entity, stack) {
    try {
      if (!entity.isPlayer()) return
      let system = S.systemOfItem(String(stack.id))
      if (system != null) S.lockPath(entity, system)
    } catch (e) { S.log('useFinish ' + e) }
  }

  // ----------------------------------------------------------- Forge vetoes
  // Equipping a magic curio (Curios' CurioEquipEvent) and swinging a magic weapon (AttackEntityEvent) are not "item use",
  // so the Apoli lock cannot see them. The startup script forwards both events here; true = deny.
  global.stoddEquipGate = function (entity, stack) {
    if (JAVA_GATE) return false
    try {
      if (entity == null || !entity.isPlayer()) return false
      return S.itemBlocked(entity, stack, false)
    } catch (e) { return false }
  }
  global.stoddAttackGate = function (player, stack) {
    if (JAVA_GATE) return false
    try {
      if (player == null || !player.isPlayer()) return false
      let sys = systemOfStack(stack)
      if (sys !== 'magic') return false   // only weapons that are themselves magic; other systems' items are not weapons
      return S.itemBlocked(player, stack, false)
    } catch (e) { return false }
  }
})()
