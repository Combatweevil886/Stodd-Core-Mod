// priority: 600
// COMBAT: origin damage traits, level mastery, the 500-damage power cap, and boss level scaling.
// The Forge events are subscribed in startup_scripts/stodd_startup.js and forwarded here, so this
// file can be changed with /reload.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 30_combat.js disabled'); return }
  let C = S.cfg
  let SwordItem = null
  try { SwordItem = Java.loadClass('net.minecraft.world.item.SwordItem') } catch (e) { }
  let ProjectileClass = null
  try { ProjectileClass = Java.loadClass('net.minecraft.world.entity.projectile.Projectile') } catch (e) { }
  // Bullets, kunai, darts and thrown weapons from mods are projectile entities; the name check catches ones that are not.
  let PROJECTILE_WORDS = /(arrow|bolt|trident|bullet|shuriken|kunai|dart|pellet|slug|projectile|javelin|spear)/
  S.isProjectileHit = function (src, direct, player) {
    if (direct == null || direct === player) return false
    try { if (ProjectileClass != null && direct instanceof ProjectileClass) return true } catch (e) { }
    try { if (src.isProjectile()) return true } catch (e) { }
    return PROJECTILE_WORDS.test(S.typeId(direct))
  }
  let SWORD_WORDS = /(sword|katana|blade|saber|sabre|cutlass|rapier|odachi|nodachi|tachi|wakizashi|scimitar|claymore|longsword|greatsword|dao|nichirin)/

  S.isSword = function (stack) {
    if (stack == null || stack.isEmpty()) return false
    try { if (SwordItem != null && stack.getItem() instanceof SwordItem) return true } catch (e) { }
    try { if (stack.hasTag('stodd:swords') || stack.hasTag('forge:tools/swords') || stack.hasTag('minecraft:swords')) return true } catch (e) { }
    return SWORD_WORDS.test(String(stack.id).split(':')[1] || '')
  }

  S.bossLevel = function (entity) { return Math.max(1, entity.getPersistentData().getInt('stodd_blvl')) }

  S.scaleBoss = function (entity, level) {
    let pd = entity.getPersistentData()
    level = Math.max(1, Math.min(C.bossMaxLevel || C.maxLevel, level))
    if (pd.contains('stodd_blvl') && pd.getInt('stodd_blvl') >= level) return
    let ratio = entity.getMaxHealth() > 0 ? entity.getHealth() / entity.getMaxHealth() : 1
    pd.putInt('stodd_blvl', level)
    S.setModifier(entity, S.J.Attributes.MAX_HEALTH, S.UUIDS.bossHealth, 'stodd_boss_level', C.bossHealthPerLevel * (level - 1), 'mul_total')
    entity.setHealth(Math.max(1, entity.getMaxHealth() * ratio))
    if (C.bossLevelInName && (!entity.hasCustomName() || pd.getBoolean('stodd_named'))) {
      if (!pd.contains('stodd_bname')) pd.putString('stodd_bname', String(entity.getName().getString()))
      pd.putBoolean('stodd_named', true)
      entity.setCustomName(Text.of(pd.getString('stodd_bname') + ' ').append(Text.red('[Lv ' + level + ']')))
      entity.setCustomNameVisible(false)
    }
  }

  function nearbyMaxLevel(entity) {
    let best = 0
    let r2 = C.bossScanRadius * C.bossScanRadius
    entity.level.getPlayers().forEach(p => {
      let dx = p.x - entity.x, dy = p.y - entity.y, dz = p.z - entity.z
      if (dx * dx + dy * dy + dz * dz <= r2 && !p.isSpectator()) best = Math.max(best, S.getLevel(p))
    })
    return best
  }

  // New bosses take the level of the strongest player nearby.
  EntityEvents.spawned(event => {
    let e = event.entity
    if (e == null || !e.isLiving() || e.isPlayer()) return
    let server = event.server
    server.scheduleInTicks(5, () => {
      try {
        if (!e.isAlive() || !S.isBoss(e)) return
        if (e.getPersistentData().contains('stodd_blvl')) return
        S.scaleBoss(e, Math.max(1, nearbyMaxLevel(e)))
      } catch (x) { S.log('boss scale ' + x) }
    })
  })

  // LivingHurtEvent (forwarded): origin traits and boss scaling first, then Armament Haki (22_mastery.js) on the result
  global.stoddHurt = function (event) {
    hurtTraits(event)
    try { if (S.hakiOnHurt) S.hakiOnHurt(event) } catch (e) { S.log('haki hurt ' + e) }
  }
  function hurtTraits(event) {
    let victim = event.getEntity()
    let src = event.getSource()
    let attacker = S.attacker(src)
    let amount = event.getAmount()
    if (attacker == null) return

    // Boss outgoing damage scales with its level
    if (!attacker.isPlayer() && attacker.getPersistentData().contains('stodd_blvl')) {
      let bl = S.bossLevel(attacker)
      if (bl > 1) event.setAmount(amount * (1 + C.bossDamagePerLevel * (bl - 1)))
      return
    }
    let player = S.responsiblePlayer(src)
    if (player == null) return

    // A stronger player hitting a boss pulls it up to their level
    if (victim != null && !victim.isPlayer() && S.isBoss(victim)) {
      let pl = S.getLevel(player)
      if (pl > S.bossLevel(victim)) S.scaleBoss(victim, pl)
    }
    if (attacker !== player) return // pets/summons only get the cap, not origin traits

    let origin = S.getOrigin(player)
    if (origin == null) return
    let tr = C.traits[origin]
    if (tr == null) return
    let L1 = S.getLevel(player) - 1
    let direct = S.directAttacker(src)
    let melee = direct != null && direct === player
    let mult = 1
    if (tr.nonMelee && !melee) mult *= tr.nonMelee
    mult *= 1 + (tr.allPerLevel || 0) * L1 + (tr.allQuad || 0) * L1 * L1
    if (tr.sword && S.isSword(player.getMainHandItem())) mult *= tr.sword
    if (tr.swordPerLevel && S.isSword(player.getMainHandItem())) mult *= 1 + tr.swordPerLevel * L1
    if ((tr.projectile || tr.projectilePerLevel) && S.isProjectileHit(src, direct, player)) mult *= (tr.projectile || 1) + (tr.projectilePerLevel || 0) * L1
    // Empty-handed melee (the Brawler): a flat bonus first, because bare fists only do 1 damage, then the multiplier
    if ((tr.unarmed || tr.unarmedFlat) && melee && player.getMainHandItem().isEmpty()) {
      amount += (tr.unarmedFlat || 0) + (tr.unarmedFlatPerLevel || 0) * L1
      if (tr.unarmed) mult *= tr.unarmed
    }
    // Hits landed while falling (the Skyborn's dive strike)
    if (tr.dive && fallen(player) > (tr.diveMinFall || 2.5)) mult *= tr.dive + (tr.divePerLevel || 0) * L1
    if (mult !== 1 || amount !== event.getAmount()) event.setAmount(amount * mult)
  }

  function fallen(player) {
    try { return Number(player.fallDistance) || 0 } catch (e) { }
    try { return Number(player.getFallDistance()) || 0 } catch (e) { }
    return 0
  }

  // LivingFallEvent (forwarded): the Skyborn never takes fall damage
  global.stoddFall = function (event) {
    let who = event.getEntity()
    if (who == null || !who.isPlayer()) return
    if (S.getOrigin(who) !== 'skyborn') return
    event.setDamageMultiplier(0)
    event.setDistance(0)
  }

  // LivingDamageEvent (forwarded): the power cap, applied after armour and every other modifier.
  global.stoddDamage = function (event) {
    let player = S.responsiblePlayer(event.getSource())
    if (player == null) return
    let victim = event.getEntity()
    if (victim === player) return
    let cap = S.capFor(S.getLevel(player), S.getOrigin(player))
    if (event.getAmount() > cap) event.setAmount(cap)
  }
})()
