// priority: 750
// POWER ENFORCEMENT: strips power systems a player's origin may not have, and locks the Swordsman
// path when a power arrives by a route that is not an item use (e.g. Jujutsu Craft's join book).
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 15_powers.js disabled'); return }
  let C = S.cfg

  // ---------------------------------------------------- Jujutsu Craft data
  let JJC = null
  try { JJC = Java.loadClass(C.jjcVariablesClass) } catch (e) { console.info('[STODD] Jujutsu Craft variables class not found; using NBT read-only fallback') }

  function jjcCap(player) {
    if (JJC == null) return null
    try {
      let opt = player.getCapability(JJC.PLAYER_VARIABLES_CAPABILITY, null).resolve()
      return opt.isPresent() ? opt.get() : null
    } catch (e) { return null }
  }
  // Returns the technique id, or 0 if none / unknown.
  // Without the class (KubeJS may refuse to load it) the Java side reaches the same MCreator variables object on the player.
  function apiGet(player, name) {
    if (S.API == null) return null
    try { let v = S.API.varGet(player, 'jujutsucraft', name); return v == null ? null : Number(v) } catch (e) { return null }
  }
  function apiSet(player, name, value) {
    if (S.API == null) return false
    try { return !!S.API.varSet(player, 'jujutsucraft', name, value) } catch (e) { return false }
  }
  S.jjcTechnique = function (player) {
    let cap = jjcCap(player)
    if (cap != null) { try { return Number(cap.PlayerCurseTechnique) || 0 } catch (e) { } }
    let av = apiGet(player, 'PlayerCurseTechnique')
    if (av != null && !isNaN(av)) return av
    try {
      let caps = player.getNbt().getCompound('ForgeCaps')
      let keys = caps.getAllKeys().toArray()
      for (let i = 0; i < keys.length; i++) {
        let k = String(keys[i])
        if (k.indexOf('jujutsucraft') === 0) {
          let v = caps.getCompound(k)
          if (v.contains('PlayerCurseTechnique')) return v.getDouble('PlayerCurseTechnique')
        }
      }
    } catch (e) { }
    return 0
  }
  S.jjcStrip = function (player) {
    let cap = jjcCap(player)
    if (cap == null) {
      if (!apiSet(player, 'PlayerCurseTechnique', 0)) return false
      ;['PlayerCurseTechnique2', 'PlayerCursePowerMAX', 'PlayerCursePower', 'PlayerCursePowerFormer'].forEach(n => { apiSet(player, n, 0) })
      return true
    }
    try {
      cap.PlayerCurseTechnique = 0
      try { cap.PlayerCurseTechnique2 = 0 } catch (e) { }
      try { cap.PlayerCursePowerMAX = 0; cap.PlayerCursePower = 0; cap.PlayerCursePowerFormer = 0 } catch (e) { }
      cap.syncPlayerVariables(player)
      return true
    } catch (e) { S.log('jjc strip failed ' + e); return false }
  }

  // Raises one Jujutsu Craft player variable to at least `value` (never lowers it, and ignores a name the mod does not have).
  // Used by the power mastery stages (cfg.powerMastery.unlock.sorcery.variables). Returns true when the variable is at or above value afterwards.
  S.jjcVarAtLeast = function (player, name, value) {
    let cap = jjcCap(player)
    if (cap == null) {
      let cur = apiGet(player, name)
      if (cur == null || isNaN(cur)) return false
      if (cur < value) apiSet(player, name, value)
      return true
    }
    try {
      let cur = Number(cap[name])
      if (isNaN(cur)) return false
      if (cur < value) { cap[name] = value; cap.syncPlayerVariables(player) }
      return true
    } catch (e) { S.log('jjc variable ' + name + ' ' + e); return false }
  }
  // Reads / writes one Jujutsu Craft player variable (used by the level links, 24_links.js). Get returns null for a name the mod
  // does not have or a value that is not a number; set returns true when the variable accepted the value (and syncs it to the client).
  S.jjcVarGet = function (player, name) {
    let cap = jjcCap(player)
    if (cap == null) { let v = apiGet(player, name); return v == null || isNaN(v) || !isFinite(v) ? null : v }
    try {
      let v = Number(cap[name])
      return isNaN(v) || !isFinite(v) ? null : v
    } catch (e) { return null }
  }
  S.jjcVarSet = function (player, name, value) {
    let cap = jjcCap(player)
    if (cap == null) return S.jjcVarGet(player, name) != null && apiSet(player, name, value)
    if (S.jjcVarGet(player, name) == null) return false
    try { cap[name] = value; cap.syncPlayerVariables(player); return true } catch (e) { S.log('jjc variable ' + name + ' ' + e); return false }
  }
  // Names of the Jujutsu Craft player variables, for /stodd mastery scan. null = not readable.
  S.jjcVarNames = function (player) {
    let cap = jjcCap(player)
    if (cap == null) {
      if (S.API == null) return null
      try { let n = S.API.varNames(player, 'jujutsucraft'); return n == null ? null : Array.prototype.slice.call(n).map(String) } catch (e) { return null }
    }
    try {
      let fs = cap.getClass().getFields(), out = []
      for (let i = 0; i < fs.length; i++) out.push(String(fs[i].getName()))
      return out
    } catch (e) { return null }
  }

  // ------------------------------------------- The Cursed Technique book
  // A Jujutsu resource that holds Cursed Energy (a cursed finger, a sorcerer shard ...): only a sorcerer may use one, and only
  // the origins in jjkOutsiders.holdResources may keep one without using it
  S.isSorceryResource = function (stack) {
    try {
      if (stack == null || stack.isEmpty()) return false
      return C.sorceryResourcePattern != null && C.sorceryResourcePattern.test(String(stack.id))
    } catch (e) { return false }
  }
  let JO = C.jjkOutsiders || {}
  function listed(list, player) {
    try { let o = S.getOrigin(player); return o != null && (list || []).indexOf(String(o)) >= 0 } catch (e) { return false }
  }
  S.mayHoldJjkResources = function (player) { return listed(JO.holdResources, player) }
  S.mustNotWearJjkArmor = function (player) {
    try { return !player.isCreative() && listed(JO.noArmor, player) && !S.canUse(player, 'sorcery') } catch (e) { return false }
  }
  function jjkNs(id) { return C.sorceryNamespaces != null && C.sorceryNamespaces.test(id) }
  // Is this stack something that grants / selects a cursed technique (or a resource that holds Cursed Energy)?
  S.isSorceryStack = function (stack) {
    try {
      if (stack == null || stack.isEmpty()) return false
      let id = String(stack.id)
      if (C.sorceryItems.indexOf(id) >= 0 || C.sorceryItemPattern.test(id)) return true
      if (C.sorceryResourcePattern != null && C.sorceryResourcePattern.test(id)) return true
      if (C.sorceryNamespaces.test(id)) {
        if (C.sorceryBookIdPattern.test(id.substring(id.indexOf(':') + 1))) return true
        let name = ''
        try { name = String(stack.getHoverName().getString()) } catch (e) { }
        if (name !== '' && C.sorceryBookNamePattern.test(name)) return true
      }
    } catch (e) { }
    return false
  }
  // Removes every such item from the player's inventory (main, hotbar, armor, offhand). Returns how many stacks went.
  // The origins that may hold the resources keep them (they still cannot use them).
  S.stripSorceryItems = function (player) {
    let removed = 0
    try {
      let inv = player.getInventory()
      let n = inv.getContainerSize()
      let keepRes = S.mayHoldJjkResources(player)
      for (let i = 0; i < n; i++) {
        let st = inv.getItem(i)
        if (S.isSorceryStack(st) && !(keepRes && S.isSorceryResource(st))) { inv.removeItemNoUpdate(i); removed++ }
      }
    } catch (e) { S.log('strip sorcery items ' + e) }
    if (removed > 0) {
      player.setStatusMessage(Text.darkPurple('The cursed book crumbles to ash in your hands. ').append(Text.gray(S.denyText ? S.denyText(player, 'sorcery') : '')))
      S.log(player.username + ' lost ' + removed + ' sorcery item stack(s)')
    }
    return removed
  }
  S.mustLoseSorceryItems = function (player) {
    if (player.isCreative()) return false
    let origin = S.getOrigin(player)
    if (origin == null) return false          // not chosen yet: the book stays until an origin is picked
    return !S.canUse(player, 'sorcery')
  }

  // The moment one appears (picked up, handed out on spawn, crafted, taken from a chest)
  PlayerEvents.inventoryChanged(event => {
    let player = event.player
    if (player == null) return
    if (S.mustNotWearJjkArmor(player)) player.server.scheduleInTicks(1, () => { try { S.takeOffJjkArmor(player) } catch (e) { } })
    if (!S.mustLoseSorceryItems(player)) return
    if (!S.isSorceryStack(event.item)) return
    if (S.mayHoldJjkResources(player) && S.isSorceryResource(event.item)) return
    player.server.scheduleInTicks(1, () => { try { S.stripSorceryItems(player) } catch (e) { } })
  })

  // ------------------------------------------------- Jujutsu armor
  // Anything from a Jujutsu mod in an armor slot of an origin in jjkOutsiders.noArmor goes back into the inventory (or to the
  // ground when it is full). Slots 36-39 are the armor (boots, leggings, chestplate, helmet).
  S.isJjkArmorSlotItem = function (stack) {
    try {
      if (stack == null || stack.isEmpty()) return false
      let id = String(stack.id)
      if (!jjkNs(id)) return false
      let path = id.substring(id.indexOf(':') + 1)
      return !(JK.keep != null && JK.keep.test(path) && !/(helmet|chestplate|leggings|boots|uniform|mask|blindfold)/.test(path))
    } catch (e) { return false }
  }
  S.takeOffJjkArmor = function (player) {
    let moved = 0
    try {
      let inv = player.getInventory()
      for (let i = 36; i <= 39 && i < inv.getContainerSize(); i++) {
        let st = inv.getItem(i)
        if (!S.isJjkArmorSlotItem(st)) continue
        let off = inv.removeItemNoUpdate(i)
        if (off == null || off.isEmpty()) continue
        if (!inv.add(off)) player.drop(off, false)
        moved++
      }
    } catch (e) { S.log('jjk armor ' + e) }
    if (moved > 0) {
      let k = '', now = Date.now()
      try { k = String(S.uuidOf ? S.uuidOf(player) : player.username) } catch (e) { k = String(player.username) }
      if ((armorTold.get(k) || 0) + 10000 < now) {
        armorTold.set(k, now)
        player.setStatusMessage(Text.darkPurple('Jujutsu armor answers only to Cursed Energy. ').append(Text.gray('It slips off.')))
      }
    }
    return moved
  }
  let armorTold = new Map()
  // Safety net every ~2 seconds, and right after login / respawn / origin change
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % 20 === 9 && S.mustNotWearJjkArmor(p)) S.takeOffJjkArmor(p)
    if (p.age % 40 !== 21) return
    if (S.mustLoseSorceryItems(p)) S.stripSorceryItems(p)
  })
  PlayerEvents.loggedIn(event => {
    event.server.scheduleInTicks(60, () => { try { if (S.mustLoseSorceryItems(event.player)) S.stripSorceryItems(event.player) } catch (e) { } })
  })

  // ------------------------------------------------- Jujutsu starter kit
  // Jujutsu Craft gives every new player a random cursed technique and its starter items. Only origins whose rule is
  // sorcery:true (Sorcerer, Brawler) may keep them. For every other origin, from the moment the very first origin is
  // chosen and for cfg.jjk.starterWindowTicks afterwards, the technique is reset and EVERY item from a Jujutsu mod
  // (not only books) is taken out of the inventory - unless it is only a material (ore, planks, ingots ...).
  let JK = C.jjk || {}
  function gameTime(player) { try { return Number(player.level.getGameTime()) } catch (e) { return 0 } }
  S.jjkWindowOpen = function (player) {
    if (!JK.purgeStarter) return false
    try {
      let u = String(S.data(player).getString('jjkUntil'))
      return u !== '' && gameTime(player) <= Number(u)
    } catch (e) { return false }
  }
  S.mustPurgeJjkStarter = function (player) {
    try {
      if (!S.jjkWindowOpen(player) || player.isCreative()) return false
      let origin = S.getOrigin(player)
      if (origin == null) return false
      return C.rules[origin].sorcery !== true
    } catch (e) { return false }
  }
  S.isJjkStarterStack = function (stack) {
    try {
      if (stack == null || stack.isEmpty()) return false
      let id = String(stack.id)
      if (JK.purgeNamespaces == null || !JK.purgeNamespaces.test(id.substring(0, id.indexOf(':')))) return false
      let path = id.substring(id.indexOf(':') + 1)
      if (JK.keep != null && JK.keep.test(path)) return false
      return true
    } catch (e) { return false }
  }
  // Returns how many stacks were removed (the technique reset is reported to the player too). An origin that may hold the
  // Jujutsu resources only loses the technique items (and the armor it may not wear); the rest of the kit stays.
  S.purgeJjkStarter = function (player) {
    let removed = 0, cleared = false
    try {
      let inv = player.getInventory()
      let n = inv.getContainerSize()
      let holder = S.mayHoldJjkResources(player), noArmor = S.mustNotWearJjkArmor(player)
      for (let i = 0; i < n; i++) {
        let st = inv.getItem(i)
        if (!S.isJjkStarterStack(st)) continue
        if (holder && !(S.isSorceryStack(st) && !S.isSorceryResource(st))) {
          if (noArmor && i >= 36 && i <= 39) { let off = inv.removeItemNoUpdate(i); if (!inv.add(off)) player.drop(off, false) }
          continue
        }
        inv.removeItemNoUpdate(i); removed++
      }
    } catch (e) { S.log('jjk purge ' + e) }
    try {
      if (S.jjcTechnique(player) !== 0 && S.jjcStrip(player)) cleared = true
    } catch (e) { }
    if (removed > 0 || cleared) {
      let d = S.data(player)
      if (!d.getBoolean('jjkTold')) {
        d.putBoolean('jjkTold', true)
        player.tell(Text.darkPurple('[Jujutsu] ').append(Text.white(S.mayHoldJjkResources(player)
          ? 'Your origin cannot channel Cursed Energy, so the starter technique was taken back. You may keep and trade Jujutsu resources (cursed fingers too), but not use them or wear Jujutsu armor.'
          : 'Your origin cannot channel Cursed Energy, so the starter technique and items from the Jujutsu mod were taken back.')))
      }
      S.log(player.username + ' jjk starter purge: ' + removed + ' stack(s), technique cleared=' + cleared)
    }
    return removed
  }
  // The first origin ever chosen opens the window
  let baseChanged = S.onOriginChanged
  S.onOriginChanged = function (player, origin, previous) {
    try {
      if (JK.purgeStarter && previous === '' && String(S.data(player).getString('jjkUntil')) === '') {
        S.data(player).putString('jjkUntil', String(gameTime(player) + (JK.starterWindowTicks || 6000)))
      }
    } catch (e) { }
    if (baseChanged) baseChanged(player, origin, previous)
    try { if (S.mustPurgeJjkStarter(player)) S.purgeJjkStarter(player) } catch (e) { }
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % (JK.sweepEveryTicks || 20) !== 3) return
    if (S.mustPurgeJjkStarter(p)) S.purgeJjkStarter(p)
  })
  PlayerEvents.inventoryChanged(event => {
    let p = event.player
    if (p == null || !S.mustPurgeJjkStarter(p) || !S.isJjkStarterStack(event.item)) return
    p.server.scheduleInTicks(1, () => { try { S.purgeJjkStarter(p) } catch (e) { } })
  })

  // ------------------------------------------------------------ Enforcement
  S.enforceSystems = function (player, origin) {
    if (origin == null || player.isCreative()) return
    if (S.mustLoseSorceryItems(player)) S.stripSorceryItems(player)
    if (S.sweepHeld) S.sweepHeld(player)
    let rules = C.rules[origin]
    let d = S.data(player)

    // Cursed Energy (Jujutsu Craft)
    let tech = S.jjcTechnique(player)
    if (tech !== 0) {
      // the technique the mod hands out at the start is not a chosen path: it is reset, not locked in
      if (S.mustPurgeJjkStarter(player)) S.purgeJjkStarter(player)
      else if (rules.sorcery === 'path' && String(d.getString('path')) === '') S.lockPath(player, 'sorcery')
      else if (!S.canUse(player, 'sorcery')) {
        if (S.jjcStrip(player)) player.tell(Text.darkPurple('[Jujutsu] ').append(Text.white(S.denyText(player, 'sorcery') + ' Your cursed technique has faded.')))
      }
    }
  }
})()
