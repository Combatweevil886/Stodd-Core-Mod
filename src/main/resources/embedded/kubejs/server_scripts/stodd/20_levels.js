// priority: 700
// LEVEL SYSTEM: Power XP (separate from vanilla/enchanting XP), levels 1-20, exponential curve.
// Each level raises base health/strength and your origin's mastery bonuses.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 20_levels.js disabled'); return }
  let C = S.cfg

  // XP to go from `level` to the next. Up to level 20 it grows by xpGrowth per level; the levels past 20 that only
  // the Weakling can reach grow by that origin's overGrowth instead (see cfg.originLevels).
  S.need = function (level, origin) {
    if (level <= C.maxLevel) return Math.round(C.xpBase * Math.pow(C.xpGrowth, level - 1))
    let o = origin != null && C.originLevels ? C.originLevels[origin] : null
    let g = o != null && o.overGrowth ? o.overGrowth : C.xpGrowth
    return Math.round(C.xpBase * Math.pow(C.xpGrowth, C.maxLevel - 1) * Math.pow(g, level - C.maxLevel))
  }
  S.totalToReach = function (level, origin) { let t = 0; for (let l = 1; l < level; l++) t += S.need(l, origin); return t }
  // Power cap (max single hit): 100 at level 1 up to capAtMaxLevel at the origin's own final level.
  S.capFor = function (level, origin) {
    let max = S.maxLevelOf(origin)
    let top = C.capAtMaxLevel
    let o = origin != null && C.originLevels ? C.originLevels[origin] : null
    if (o != null && o.capAtMax) top = o.capAtMax
    let f = (Math.min(level, max) - 1) / (max - 1)
    return C.capAtLevel1 + (top - C.capAtLevel1) * f
  }

  // ------------------------------------------------------------- Stats
  S.applyStats = function (player) {
    let origin = S.getOrigin(player)
    let L1 = S.getLevel(player) - 1
    let m = (origin != null && C.mastery[origin]) ? C.mastery[origin] : {}
    let A = S.J.Attributes
    let L2 = L1 * L1
    let health = (C.perLevel.health + (m.health || 0)) * L1 + (m.healthQuad || 0) * L2
    let attack = (C.perLevel.attack + (m.attack || 0)) * L1 + (m.attackQuad || 0) * L2
    S.setModifier(player, A.MAX_HEALTH, S.UUIDS.health, 'stodd_level_health', health, 'add')
    S.setModifier(player, A.ATTACK_DAMAGE, S.UUIDS.attack, 'stodd_level_attack', attack, 'add')
    S.setModifier(player, A.ARMOR, S.UUIDS.armor, 'stodd_level_armor', (m.armor || 0) * L1, 'add')
    S.setModifier(player, A.ARMOR_TOUGHNESS, S.UUIDS.toughness, 'stodd_level_toughness', (m.toughness || 0) * L1, 'add')
    S.setModifier(player, A.MOVEMENT_SPEED, S.UUIDS.speed, 'stodd_level_speed', (m.speedPct || 0) * L1, 'mul_base')
    S.setModifier(player, A.ATTACK_SPEED, S.UUIDS.attackSpeed, 'stodd_level_attack_speed', (m.attackSpeedPct || 0) * L1, 'mul_base')
    if (player.getHealth() > player.getMaxHealth()) player.setHealth(player.getMaxHealth())
    if (origin != null) S.applyCyberCapacity(player, origin, false)
  }

  function bar(cur, max) {
    let n = 20, filled = max <= 0 ? n : Math.floor(n * cur / max)
    let s = ''
    for (let i = 0; i < n; i++) s += i < filled ? '|' : '.'
    return s
  }
  S.showProgress = function (player, gained) {
    let d = S.data(player), lvl = S.getLevel(player), origin = S.getOrigin(player)
    let t = Text.gold('Lv ' + lvl + ' ')
    if (lvl >= S.maxLevelOf(origin)) t = t.append(Text.yellow('MAX'))
    else {
      let need = S.need(lvl, origin), cur = d.getInt('lxp')
      t = t.append(Text.green(bar(cur, need))).append(Text.gray(' ' + cur + '/' + need + ' PXP'))
    }
    if (gained) t = t.append(Text.aqua('  +' + gained))
    player.setStatusMessage(t)
  }

  function syncScore(player) {
    S.run(player.server, 'scoreboard players set ' + player.username + ' stodd_level ' + S.getLevel(player))
  }
  S.syncScore = syncScore

  function onLevelUp(player, lvl) {
    let s = player.server, n = player.username
    S.run(s, 'title ' + n + ' times 10 50 20')
    S.run(s, 'title ' + n + ' subtitle {"text":"Your ' + (S.ORIGIN_NAMES[S.getOrigin(player)] || 'power') + ' mastery deepens","color":"yellow"}')
    S.run(s, 'title ' + n + ' title {"text":"LEVEL ' + lvl + '","color":"gold","bold":true}')
    S.run(s, 'playsound minecraft:ui.toast.challenge_complete player ' + n + ' ~ ~ ~ 1 1.2')
    S.run(s, 'execute at ' + n + ' run particle minecraft:totem_of_undying ~ ~1 ~ 0.6 1 0.6 0.4 60 normal')
    if (lvl % 5 === 0) s.tell(Text.gold('[Level] ').append(Text.yellow(n)).append(Text.white(' has reached ')).append(Text.gold('Level ' + lvl)).append(Text.white('!')))
  }

  S.setLevel = function (player, lvl, xp) {
    let d = S.data(player), origin = S.getOrigin(player), max = S.maxLevelOf(origin)
    lvl = Math.max(1, Math.min(max, lvl))
    d.putInt('lvl', lvl)
    d.putInt('lxp', lvl >= max ? 0 : Math.max(0, xp || 0))
    S.applyStats(player)
    if (origin != null && S.hasGrowingSlots(origin)) S.applyMilestoneSlots(player, origin, false)
    syncScore(player)
  }

  S.addXp = function (player, amount) {
    amount = Math.floor(amount)
    if (amount <= 0 || S.getOrigin(player) == null) return
    let d = S.data(player)
    let lvl = S.getLevel(player), origin = S.getOrigin(player), max = S.maxLevelOf(origin)
    if (lvl >= max) { S.showProgress(player, 0); return }
    let xp = d.getInt('lxp') + amount
    let leveled = false
    while (lvl < max && xp >= S.need(lvl, origin)) { xp -= S.need(lvl, origin); lvl++; leveled = true; onLevelUp(player, lvl) }
    d.putInt('lvl', lvl)
    d.putInt('lxp', lvl >= max ? 0 : xp)
    if (leveled) {
      S.applyStats(player); syncScore(player); player.setHealth(player.getMaxHealth())
      if (origin != null && S.hasGrowingSlots(origin) && S.applyMilestoneSlots(player, origin, false)) {
        player.tell(Text.gold('[Growth] ').append(Text.white('Your body can carry more now: ')).append(Text.aqua(S.slotTotalAt(origin, lvl) + ' accessory slots')).append(Text.white('.')))
      }
    }
    S.showProgress(player, amount)
  }

  // ---------------------------------------------------------- XP sources
  EntityEvents.death(event => {
    let victim = event.entity
    if (victim == null || victim.isPlayer()) return
    let killer = S.responsiblePlayer(event.source)
    if (killer == null) return
    let xp = victim.getMaxHealth() * C.xpPerMobHealth
    let boss = S.isBoss(victim)
    let isMonster = true
    try { isMonster = String(S.typeObj(victim).getCategory()) === 'monster' } catch (e) { }
    if (!isMonster && !boss) xp *= C.xpPassiveMultiplier
    let pd = victim.getPersistentData()
    if (pd.getBoolean('stodd_spawner')) xp *= 0.25
    if (boss) {
      xp *= C.xpBossMultiplier * (1 + 0.1 * (Math.max(1, pd.getInt('stodd_blvl')) - 1))
      xp = Math.min(xp, C.xpMaxPerKill)
      let r2 = C.xpBossShareRadius * C.xpBossShareRadius
      event.level.getPlayers().forEach(p => {
        let dx = p.x - victim.x, dy = p.y - victim.y, dz = p.z - victim.z
        if (dx * dx + dy * dy + dz * dz <= r2 || p == killer) S.addXp(p, xp)
      })
      return
    }
    S.addXp(killer, Math.min(Math.max(1, xp), C.xpMaxPerKill))
  })

  BlockEvents.broken(event => {
    let p = event.player
    if (p == null || p.isCreative()) return
    try { if (event.block.hasTag('forge:ores')) S.addXp(p, C.xpOre) } catch (e) { }
  })

  // ---------------------------------------------------------- Scoreboard
  ServerEvents.loaded(event => {
    S.run(event.server, 'scoreboard objectives add stodd_level dummy {"text":"Lv","color":"gold"}')
    S.run(event.server, 'scoreboard objectives setdisplay list stodd_level')
    // Safety net for Project: Edgerunner's own scripts, which error every tick if this objective is missing
    S.run(event.server, 'scoreboard objectives add er_cw_runtime_ready dummy')
  })
  PlayerEvents.loggedIn(event => {
    let p = event.player
    let d = S.data(p)
    if (!d.contains('lvl')) { d.putInt('lvl', 1); d.putInt('lxp', 0) }
    syncScore(p)
    event.server.scheduleInTicks(60, () => { try { S.applyStats(event.player) } catch (e) { } })
  })

  // ------------------------------------------------------------ Commands
  function info(src, player) {
    let d = S.data(player), lvl = S.getLevel(player), origin = S.getOrigin(player)
    let lines = []
    lines.push(Text.gold('==== ').append(Text.yellow(player.username)).append(Text.gold(' ====')))
    lines.push(Text.gray('Origin: ').append(Text.white(origin ? S.ORIGIN_NAMES[origin] : 'not chosen')))
    let max = S.maxLevelOf(origin)
    lines.push(Text.gray('Level: ').append(Text.gold(String(lvl) + ' / ' + max))
      .append(Text.gray(lvl < max ? ('  (' + d.getInt('lxp') + ' / ' + S.need(lvl, origin) + ' PXP)') : '  (MAX)')))
    lines.push(Text.gray('Max hit (power cap): ').append(Text.red(String(Math.round(S.capFor(lvl, origin))))))
    if (origin != null && S.masterySystems) {
      let st = S.masteryStage(lvl)
      lines.push(Text.gray('Mastery: ').append(Text.white(S.cfg.powerMastery.stageNames[st])).append(Text.gray('  (' + S.masterySystems(player).map(x => S.cfg.powerMastery.systems[x].name).join(', ') + ')  /stodd mastery for details')))
    }
    if (origin != null) {
      let paths = C.systems.filter(sys => C.rules[origin][sys] === 'path')
      if (paths.length > 0) {
        let path = String(d.getString('path'))
        lines.push(Text.gray('Path: ').append(Text.yellow(path === '' ? 'undecided (' + paths.map(x => C.systemNames[x]).join(', ') + ')' : (C.systemNames[path] || path))))
      }
      if (S.hasGrowingSlots(origin)) lines.push(Text.gray('Accessory slots: ').append(Text.aqua(String(S.slotTotalAt(origin, lvl))))
        .append(Text.gray(lvl < max ? '  (a new set every ' + C.slotMilestoneEvery + ' levels)' : '  (fully grown)')))
    }
    if (origin != null) lines.push(Text.gray('Cyberware capacity: ').append(Text.aqua(String(d.getInt('cyberCap')))))
    if (S.islandAt) {
      let isl = S.islandAt(player.level, Math.floor(player.x), Math.floor(player.z))
      if (isl) lines.push(Text.gray('Island: ').append(Text.of(isl.label).color(isl.theme.color)))
    }
    lines.forEach(l => src.sendSystemMessage(l))
    return 1
  }

  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    let Arguments = event.arguments
    event.register(Commands.literal('stodd')
      .executes(ctx => info(ctx.source, ctx.source.getPlayerOrException()))
      .then(Commands.literal('level')
        .executes(ctx => info(ctx.source, ctx.source.getPlayerOrException()))
        .then(Commands.argument('target', Arguments.PLAYER.create(event))
          .executes(ctx => info(ctx.source, Arguments.PLAYER.getResult(ctx, 'target')))))
      .then(Commands.literal('curve').executes(ctx => {
        let origin = null
        try { origin = S.getOrigin(ctx.source.getPlayerOrException()) } catch (e) { }
        let max = S.maxLevelOf(origin), s = ''
        for (let l = 1; l < max; l++) s += 'L' + l + '->' + (l + 1) + ': ' + S.need(l, origin) + (l % 4 === 0 ? '\n' : '   ')
        ctx.source.sendSystemMessage(Text.gray(s + '\nTotal to Lv' + max + ': ' + S.totalToReach(max, origin)))
        return 1
      }))
      .then(Commands.literal('setlevel').requires(src => src.hasPermission(2))
        .then(Commands.argument('target', Arguments.PLAYER.create(event))
          .then(Commands.argument('level', Arguments.INTEGER.create(event)).executes(ctx => {
            let p = Arguments.PLAYER.getResult(ctx, 'target')
            S.setLevel(p, Arguments.INTEGER.getResult(ctx, 'level'), 0)
            ctx.source.sendSystemMessage(Text.green('Set ' + p.username + ' to level ' + S.getLevel(p)))
            return 1
          }))))
      .then(Commands.literal('addxp').requires(src => src.hasPermission(2))
        .then(Commands.argument('target', Arguments.PLAYER.create(event))
          .then(Commands.argument('amount', Arguments.INTEGER.create(event)).executes(ctx => {
            S.addXp(Arguments.PLAYER.getResult(ctx, 'target'), Arguments.INTEGER.getResult(ctx, 'amount'))
            return 1
          }))))
      .then(Commands.literal('resetpath').requires(src => src.hasPermission(2))
        .then(Commands.argument('target', Arguments.PLAYER.create(event)).executes(ctx => {
          let p = Arguments.PLAYER.getResult(ctx, 'target')
          S.data(p).putString('path', '')
          ctx.source.sendSystemMessage(Text.green('Cleared the chosen path of ' + p.username))
          return 1
        })))
      .then(Commands.literal('itemid').executes(ctx => {
        let p = ctx.source.getPlayerOrException()
        let st = p.getMainHandItem()
        if (st == null || st.isEmpty()) { ctx.source.sendSystemMessage(Text.gray('Hold an item first.')); return 0 }
        let nm = ''
        try { nm = String(st.getHoverName().getString()) } catch (e) { }
        ctx.source.sendSystemMessage(Text.gray('Item id: ').append(Text.yellow(String(st.id))).append(Text.gray('   name: ' + nm + '   counted as a cursed-energy item: ' + (S.isSorceryStack && S.isSorceryStack(st) ? 'yes' : 'no'))))
        return 1
      }))
      .then(Commands.literal('spawn').requires(src => src.hasPermission(2)).executes(ctx => {
        ctx.source.sendSystemMessage(Text.yellow(S.resetSpawn ? S.resetSpawn(ctx.source.getServer()) : 'Spawn logic is not loaded.'))
        return 1
      }))
      .then(Commands.literal('waystone').requires(src => src.hasPermission(2)).executes(ctx => {
        let msg = S.forceIslandWaystone ? S.forceIslandWaystone(ctx.source.getPlayerOrException()) : 'Island waystones are not loaded.'
        ctx.source.sendSystemMessage(Text.yellow(msg))
        return 1
      }))
      .then(Commands.literal('check').executes(ctx => {
        let src = ctx.source
        let p = src.getPlayerOrException()
        let lines = S.diagnose ? S.diagnose(p) : [Text.red('Diagnostics are not loaded.')]
        lines.forEach(l => src.sendSystemMessage(l))
        // operators also see what Project: Edgerunner reports for this player's cyberware capacity
        if (src.hasPermission(2) && S.hasCommand && S.hasCommand(src.getServer(), 'projectedgerunner')) {
          src.sendSystemMessage(Text.gray('Capacity as the mod reports it:'))
          try { src.getServer().getCommands().performPrefixedCommand(src, 'projectedgerunner cyberware capacity get') } catch (e) { src.sendSystemMessage(Text.red('capacity get failed: ' + e)) }
        } else if (!src.hasPermission(2)) src.sendSystemMessage(Text.gray('(An operator running /stodd check also sees the capacity the mod reports.)'))
        return 1
      }))
      .then(Commands.literal('scan').requires(src => src.hasPermission(2)).executes(ctx => {
        let p = ctx.source.getPlayerOrException()
        let lines = S.scanLines ? S.scanLines(p) : [Text.red('Scan is not loaded.')]
        lines.forEach(l => ctx.source.sendSystemMessage(l))
        return 1
      }))
      .then(Commands.literal('unstick').executes(ctx => {
        let p = ctx.source.getPlayerOrException()
        let moved = S.unstick ? S.unstick(p) : false
        ctx.source.sendSystemMessage(moved ? Text.green('Moved to the nearest open ground.') : Text.red('No open ground found nearby. Ask an operator to /tp you.'))
        return moved ? 1 : 0
      }))
      .then(Commands.literal('refresh').executes(ctx => {
        S.refreshOrigin(ctx.source.getPlayerOrException(), true)
        ctx.source.sendSystemMessage(Text.green('Origin, slots and stats re-applied.'))
        return 1
      }))
    )
  })
})()
