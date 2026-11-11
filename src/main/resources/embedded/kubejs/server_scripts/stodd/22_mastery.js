// priority: 680
// POWER MASTERY: ties the level to every power system (Haki, Devil Fruit, Cursed Energy, Dark Magic).
//   * Five stages, opened by level (cfg.powerMastery.stageLevels: 1 / 5 / 10 / 15 / 20). Level 20 opens everything for every origin.
//   * Haki is built in: Observation (dodge), Armament (hardening + armour piercing) and Conqueror's (an aura), all scaled by stage.
//   * Each system can also open things in its own mod: advancements (found by name at run time), commands, Jujutsu Craft variables.
//   * Mastery only grants. Nothing is ever taken away.
// Loads after 20_levels.js and 10_origins.js, because it hooks S.applyStats (every level change) and S.lockPath (a chosen path).
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 22_mastery.js disabled'); return }
  let C = S.cfg
  let M = C.powerMastery
  if (!M || M.enabled === false) return
  let LV = M.stageLevels
  let LAST = LV.length - 1
  let HK = M.haki || {}

  S.rand = function () { return Math.random() }
  function colored(str, color) { try { return Text.of(str).color(color) } catch (e) { return Text.gold(str) } }
  function pct(x) { return Math.round(x * 1000) / 10 }

  // ------------------------------------------------------------------ who has what, and at which stage
  S.masteryStage = function (level) {
    let st = 0
    for (let i = 0; i < LV.length; i++) if (level >= LV[i]) st = i
    return st
  }
  S.masteryStageOf = function (player) { return S.masteryStage(S.getLevel(player)) }
  S.masteryHas = function (player, sys) {
    let origin = S.getOrigin(player)
    let def = M.systems[sys]
    if (origin == null || def == null || C.rules[origin] == null) return false
    if (def.who === 'all') return true
    let r = C.rules[origin][sys]
    if (r === true) return true
    if (r === 'path') return String(S.data(player).getString('path')) === sys
    return false
  }
  S.masterySystems = function (player) {
    return Object.keys(M.systems).filter(sys => S.masteryHas(player, sys))
  }

  // ------------------------------------------------------------------ native Haki
  // 0 = not yet, otherwise the share of the maximum (a quarter at the first stage, the full amount at the last).
  S.hakiFrac = function (player, key) {
    if (HK.native === false) return 0
    let cfg = HK[key]
    if (cfg == null || !S.masteryHas(player, 'haki')) return 0
    let st = S.masteryStageOf(player)
    if (st < cfg.fromStage) return 0
    return (st - cfg.fromStage + 1) / (LAST - cfg.fromStage + 1)
  }
  function hakiLine(stage) {
    let t = [
      'Haki sleeps within you.',
      'Observation: you sense blows coming and slip some of them.',
      'Armament: your body hardens against blows and your strikes bite through armour.',
      'Observation and Armament grow sharper.',
      "Conqueror's: weak-willed monsters wilt near you. All Haki at full strength."
    ]
    return t[Math.min(stage, t.length - 1)]
  }
  function armorOf(entity) {
    try { return Number(entity.getAttributeValue(S.J.Attributes.ARMOR)) || 0 } catch (e) { return 0 }
  }
  function effect(e, id, ticks, amp) {
    try { e.potionEffects.add(id, ticks, amp, true, false); return true } catch (x) { }
    return false
  }

  // LivingAttackEvent (forwarded from the startup script): Observation Haki slips some hits from creatures.
  global.stoddAttacked = function (event) {
    let victim = event.getEntity()
    if (victim == null || !victim.isPlayer() || victim.isCreative() || victim.isSpectator()) return
    let att = S.attacker(event.getSource())
    if (att == null || att === victim) return          // falling, fire, the void, /kill ... cannot be seen coming
    let f = S.hakiFrac(victim, 'observation')
    if (f <= 0) return
    if (S.rand() >= HK.observation.dodgeMax * f) return
    event.setCanceled(true)
    try { victim.setStatusMessage(Text.aqua('Observation Haki: you slipped the blow')) } catch (e) { }
    S.run(victim.server, 'playsound minecraft:entity.player.attack.sweep player ' + victim.username + ' ~ ~ ~ 0.6 1.6')
  }

  // Runs at the end of stoddHurt (30_combat.js), after the origin traits and the boss scaling.
  S.hakiOnHurt = function (event) {
    let src = event.getSource()
    let att = S.attacker(src)
    if (att == null) return
    let victim = event.getEntity()
    let amount = event.getAmount(), out = amount
    // Armament, defence: a creature's hit hurts a Haki user less
    if (victim != null && victim.isPlayer() && att !== victim) {
      let f = S.hakiFrac(victim, 'armament')
      if (f > 0) out = out * (1 - HK.armament.reductionMax * f)
    }
    // Armament, offence: a melee blow from the player themselves bites through armour (not pets, not projectiles)
    if (att.isPlayer() && victim != null && victim !== att && S.directAttacker(src) === att) {
      let f2 = S.hakiFrac(att, 'armament')
      if (f2 > 0) out += HK.armament.pierceMax * f2 * Math.min(armorOf(victim), 20)
    }
    if (out !== amount) event.setAmount(out)
  }

  // Conqueror's Haki: weak hostile mobs near the player are weakened and slowed
  function isHostile(e) { try { return String(S.typeObj(e).getCategory()) === 'monster' } catch (x) { return false } }
  let pulseWarned = false
  S.conquerPulse = function (p) {
    let cq = HK.conqueror
    let list = null
    try { list = p.level.getEntitiesWithin(p.boundingBox.inflate(cq.radius)) } catch (x) {
      if (!pulseWarned) { pulseWarned = true; console.warn("[STODD] Conqueror's Haki cannot list nearby entities on this KubeJS version: " + x) }
      return 0
    }
    if (list == null) return 0
    let arr = typeof list.toArray === 'function' ? list.toArray() : list
    let limit = cq.healthShare * p.getMaxHealth(), n = 0
    for (let i = 0; i < arr.length && n < cq.maxTargets; i++) {
      let e = arr[i]
      if (e == null || e === p || e.isPlayer() || !e.isLiving()) continue
      if (!isHostile(e) || S.isBoss(e) || e.getMaxHealth() > limit) continue
      effect(e, 'minecraft:weakness', cq.effectTicks, 0)
      effect(e, 'minecraft:slowness', cq.effectTicks, 0)
      n++
    }
    return n
  }
  PlayerEvents.tick(event => {
    let p = event.player
    let cq = HK.conqueror
    if (cq == null || p.age % cq.everyTicks !== 9 || p.isSpectator()) return
    try { if (S.hakiFrac(p, 'conqueror') > 0) S.conquerPulse(p) } catch (e) { S.log('conqueror ' + e) }
  })

  // ------------------------------------------------------------------ opening things in the other mods
  function prettify(path) {
    return path.substring(path.lastIndexOf('/') + 1).split('_').map(w => w.charAt(0).toUpperCase() + w.substring(1)).join(' ')
  }
  function allAdvancementIds(server) {
    let out = []
    try {
      let all = server.getAdvancements().getAllAdvancements()
      let arr = typeof all.toArray === 'function' ? all.toArray() : all
      for (let i = 0; i < arr.length; i++) out.push(String(arr[i].getId()))
    } catch (e) { S.log('advancement list ' + e) }
    return out
  }
  S.masteryAdvancementIds = function (server, sys) {
    let U = M.unlock ? M.unlock[sys] : null
    if (U == null || U.namespaces == null) return []
    return allAdvancementIds(server).filter(id => U.namespaces.test(S.ns(id)))
  }
  // One stage of one system. idempotentOnly: it was opened before, so only things that are safe to repeat run again.
  function openStage(player, sys, st, idempotentOnly, unlocked) {
    let U = M.unlock ? M.unlock[sys] : null
    if (U == null) return
    let server = player.server
    let ids = null
    ;(U.advancements || []).forEach(a => {
      if (a.stage !== st) return
      if (ids == null) ids = S.masteryAdvancementIds(server, sys)
      ids.forEach(id => {
        let path = id.substring(id.indexOf(':') + 1)
        if (!a.match.test(path)) return
        S.run(server, 'advancement grant ' + player.username + ' only ' + id)
        let nm = prettify(path)
        if (unlocked.indexOf(nm) < 0) unlocked.push(nm)
      })
    })
    ;(U.variables || []).forEach(v => {
      if (v.stage !== st || !S.jjcVarAtLeast) return
      if (S.jjcVarAtLeast(player, v.name, v.atLeast) && unlocked.indexOf(v.name) < 0) unlocked.push(v.name)
    })
    if (!idempotentOnly) {
      ;(U.commands || []).forEach(c => { if (c.stage === st) S.run(server, String(c.run).replace(/\{p\}/g, player.username)) })
    }
  }

  function announce(player, sys, stage, unlocked) {
    let def = M.systems[sys]
    let t = colored('[' + def.name + '] ', def.color).append(Text.white(M.stageNames[stage]))
    if (unlocked.length > 0) t = t.append(Text.gray('  unlocked: ' + unlocked.join(', ')))
    else if (sys === 'haki' && HK.native !== false) t = t.append(Text.gray('  ' + hakiLine(stage)))
    player.tell(t)
    if (stage > 0) S.run(player.server, 'playsound minecraft:entity.experience_orb.pickup player ' + player.username + ' ~ ~ ~ 0.8 1.4')
  }

  // Brings every power system the player has up to the stage their level has earned. Cheap when nothing changed.
  // force = also repeat the advancement grants and variable floors of stages already opened (commands never repeat).
  S.syncMastery = function (player, force) {
    if (player == null || S.getOrigin(player) == null) return 0
    let d = S.data(player)
    let stage = S.masteryStageOf(player)
    let advanced = 0, systems = S.masterySystems(player)
    systems.forEach(sys => {
      let key = 'mst_' + sys
      let have = d.contains(key) ? d.getInt(key) : -1
      if (stage <= have && !force) return
      let unlocked = []
      for (let st = force ? 0 : have + 1; st <= stage; st++) openStage(player, sys, st, st <= have, unlocked)
      if (stage > have) {
        d.putInt(key, stage)
        advanced++
        if (M.announce !== false) announce(player, sys, stage, unlocked)
      }
    })
    if (stage === LAST && systems.length > 0 && !d.getBoolean('mst_full')) {
      d.putBoolean('mst_full', true)
      if (M.announce !== false) {
        player.tell(Text.gold('[Mastery] ').append(Text.yellow('Level ' + LV[LAST] + ': every power you hold is now fully open.')))
        S.run(player.server, 'title ' + player.username + ' subtitle {"text":"Every power you hold is fully open","color":"yellow"}')
        S.run(player.server, 'title ' + player.username + ' title {"text":"MASTERED","color":"gold","bold":true}')
      }
    }
    return advanced
  }

  // Every level change goes through S.applyStats; a chosen path goes through S.lockPath.
  let baseApply = S.applyStats
  if (typeof baseApply === 'function') {
    S.applyStats = function (player) {
      baseApply(player)
      try { S.syncMastery(player, false) } catch (e) { S.log('mastery sync ' + e) }
    }
  }
  let baseLock = S.lockPath
  if (typeof baseLock === 'function') {
    S.lockPath = function (player, system) {
      baseLock(player, system)
      try { S.syncMastery(player, false) } catch (e) { S.log('mastery sync ' + e) }
    }
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % (M.catchUpTicks || 200) !== 11) return
    try { S.syncMastery(p, false) } catch (e) { S.log('mastery catch-up ' + e) }
  })
  PlayerEvents.loggedIn(event => {
    // a login repeats the safe grants, so a pack update that adds a pattern reaches players who are already at that level
    event.server.scheduleInTicks(100, () => { try { S.syncMastery(event.player, true) } catch (e) { S.log('mastery login ' + e) } })
  })

  // ------------------------------------------------------------------ what a player sees
  // The traits that already grow with level and reach their full value at the full level (cfg.traits / cfg.mastery).
  S.traitLines = function (origin, level) {
    let tr = C.traits[origin]
    let out = []
    if (tr == null) return out
    let L1 = Math.max(0, level - 1)
    let all = (tr.allPerLevel || 0) * L1 + (tr.allQuad || 0) * L1 * L1
    if (all > 0) out.push('all damage +' + pct(all) + '%')
    if (tr.swordPerLevel) out.push('sword damage +' + pct(tr.swordPerLevel * L1) + '%')
    if (tr.projectilePerLevel) out.push('projectile damage +' + pct(tr.projectilePerLevel * L1) + '%')
    if (tr.unarmedFlatPerLevel) out.push('fists +' + (Math.round(((tr.unarmedFlat || 0) + tr.unarmedFlatPerLevel * L1) * 10) / 10) + ' flat')
    if (tr.divePerLevel) out.push('dive strike +' + pct(tr.divePerLevel * L1) + '%')
    return out
  }
  function hakiNumbers(player) {
    let o = HK.observation, a = HK.armament
    let parts = []
    parts.push('dodge ' + pct(o.dodgeMax * S.hakiFrac(player, 'observation')) + '%')
    parts.push('hardening ' + pct(a.reductionMax * S.hakiFrac(player, 'armament')) + '%')
    parts.push('armour pierce ' + (Math.round(a.pierceMax * S.hakiFrac(player, 'armament') * 100) / 100) + ' per armour point')
    parts.push("Conqueror's " + (S.hakiFrac(player, 'conqueror') > 0 ? 'active' : 'asleep'))
    return parts.join(', ')
  }
  S.masteryLines = function (player) {
    let out = []
    let origin = S.getOrigin(player)
    out.push(Text.gold('==== Mastery ===='))
    if (origin == null) { out.push(Text.red('Choose an origin first.')); return out }
    let lvl = S.getLevel(player), stage = S.masteryStage(lvl)
    out.push(Text.gray('Level ').append(Text.gold(String(lvl))).append(Text.gray(lvl >= LV[LAST] ? '  (everything you hold is fully open)' : '  (everything opens fully at level ' + LV[LAST] + ')')))
    S.masterySystems(player).forEach(sys => {
      let def = M.systems[sys]
      let line = colored(def.name + ': ', def.color).append(Text.white(M.stageNames[stage] + ' ' + (stage + 1) + '/' + (LAST + 1)))
      line = line.append(Text.gray(stage < LAST ? '   next: ' + M.stageNames[stage + 1] + ' at level ' + LV[stage + 1] : '   fully open'))
      out.push(line)
      if (sys === 'haki' && HK.native !== false) out.push(Text.gray('   ' + hakiNumbers(player)))
    })
    let rules = C.rules[origin]
    if (rules != null && rules.cyber && C.cyberCapacity[origin]) {
      let cb = C.cyberCapacity[origin]
      out.push(Text.aqua('Cyberware: ').append(Text.gray('tolerance ' + Math.round(cb.base + cb.perLevel * (lvl - 1)) + '   (level ' + LV[LAST] + ': ' + Math.round(cb.base + cb.perLevel * (LV[LAST] - 1)) + ')')))
    }
    let tl = S.traitLines(origin, lvl)
    if (tl.length > 0) out.push(Text.yellow('Mastery of your origin: ').append(Text.gray(tl.join(', ') + '   (level ' + LV[LAST] + ': ' + S.traitLines(origin, LV[LAST]).join(', ') + ')')))
    out.push(Text.gray('Power cap (max single hit): ' + Math.round(S.capFor(lvl, origin)) + '   (level ' + LV[LAST] + ': ' + Math.round(S.capFor(LV[LAST], origin)) + ')'))
    return out
  }
  // /stodd mastery scan (operators): which advancements the installed mods really have, and where the patterns hit
  S.masteryScanLines = function (player) {
    let out = [Text.gold('---- STODD mastery scan ----')]
    Object.keys(M.unlock || {}).forEach(sys => {
      let U = M.unlock[sys]
      let ids = S.masteryAdvancementIds(player.server, sys)
      out.push(colored(M.systems[sys] ? M.systems[sys].name : sys, M.systems[sys] ? M.systems[sys].color : 'gold').append(Text.gray(': ' + ids.length + ' advancement(s) in the mod namespaces')))
      ;(U.advancements || []).forEach(a => {
        let hit = ids.filter(id => a.match.test(id.substring(id.indexOf(':') + 1)))
        out.push(Text.gray('   stage ' + a.stage + ' ' + String(a.match) + ' -> ' + (hit.length > 0 ? hit.slice(0, 4).join(', ') : 'NO MATCH')))
      })
      if (ids.length > 0) out.push(Text.darkGray('   e.g. ' + ids.slice(0, 10).join(', ')))
    })
    if (S.jjcVarNames) {
      let names = S.jjcVarNames(player)
      out.push(Text.gray('Jujutsu Craft variables: ' + (names == null ? 'not readable' : names.length + ' (' + names.slice(0, 14).join(', ') + (names.length > 14 ? ', ...' : '') + ')')))
    }
    try {
      let caps = player.getNbt().getCompound('ForgeCaps')
      let keys = caps.getAllKeys().toArray(), n = 0
      for (let i = 0; i < keys.length; i++) {
        let k = String(keys[i])
        if (!/(haki|prime|tpp|jujutsu|malum|ompworld)/i.test(k)) continue
        n++
        out.push(Text.aqua('Capability ' + k).append(Text.gray(': ' + String(caps.get(k)).substring(0, 180))))
      }
      if (n === 0) out.push(Text.gray('No power-mod capability data on you (' + keys.length + ' capability keys).'))
    } catch (e) { out.push(Text.red('Could not read your capability data: ' + e)) }
    return out
  }

  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    let Arguments = event.arguments
    function sendAll(ctx, lines) { lines.forEach(l => ctx.source.sendSystemMessage(l)); return 1 }
    event.register(Commands.literal('stodd')
      .then(Commands.literal('mastery')
        .executes(ctx => sendAll(ctx, S.masteryLines(ctx.source.getPlayerOrException())))
        .then(Commands.literal('scan').requires(src => src.hasPermission(2))
          .executes(ctx => sendAll(ctx, S.masteryScanLines(ctx.source.getPlayerOrException()))))
        .then(Commands.literal('sync').requires(src => src.hasPermission(2))
          .executes(ctx => {
            let p = ctx.source.getPlayerOrException()
            ctx.source.sendSystemMessage(Text.green('Mastery re-applied for ' + p.username + ' (' + S.syncMastery(p, true) + ' system(s) advanced).'))
            return 1
          })
          .then(Commands.argument('target', Arguments.PLAYER.create(event)).executes(ctx => {
            let p = Arguments.PLAYER.getResult(ctx, 'target')
            ctx.source.sendSystemMessage(Text.green('Mastery re-applied for ' + p.username + ' (' + S.syncMastery(p, true) + ' system(s) advanced).'))
            return 1
          })))))
  })
})()
