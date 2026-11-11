// priority: 560
// SKYBORN: the movement half of the origin (the +8% speed, +5 health, slots and locks are in the data jar).
//   * Featherfall:  no fall damage (30_combat.js, stoddFall) - and here a permanent, hidden Jump Boost I
//   * Glide:        hold sneak while falling and a short Slow Falling is re-applied every few ticks
//   * Dive Strike:  +35% damage on hits landed while falling (30_combat.js, traits.skyborn)
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 35_skyborn.js disabled'); return }
  let C = S.cfg
  let SB = C.skyborn || {}
  let JUMP = SB.jumpAmplifier == null ? 0 : SB.jumpAmplifier

  function effect(p, id, ticks, amp) {
    try { p.potionEffects.add(id, ticks, amp, true, false); return } catch (e) { }
    S.run(p.server, 'effect give ' + p.username + ' ' + id + ' ' + Math.max(1, Math.ceil(ticks / 20)) + ' ' + amp + ' true')
  }
  function sneaking(p) {
    try { if (typeof p.isCrouching === 'function') return !!p.isCrouching() } catch (e) { }
    try { if (typeof p.crouching === 'boolean') return p.crouching } catch (e) { }
    return false
  }
  function airborne(p) {
    try { if (typeof p.isOnGround === 'function') return !p.isOnGround() } catch (e) { }
    try { if (typeof p.onGround === 'boolean') return !p.onGround } catch (e) { }
    return false
  }
  function fallingFast(p) {
    try { let v = p.getDeltaMovement(); return Number(v.y) < -0.12 } catch (e) { }
    try { return Number(p.motionY) < -0.12 } catch (e) { }
    return true
  }

  S.skybornTick = function (p) {
    if (p.isSpectator()) return
    if (p.age % 20 === 5) effect(p, 'minecraft:jump_boost', 60, JUMP)
    if (p.age % 4 === 1 && sneaking(p) && airborne(p) && fallingFast(p)) effect(p, 'minecraft:slow_falling', 12, 0)
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (S.getOrigin(p) !== 'skyborn') return
    try { S.skybornTick(p) } catch (e) { S.log('skyborn tick ' + e) }
  })
})()
