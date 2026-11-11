// priority: 400
// ORE PROGRESSION: Vanilla -> Terramity -> Antarchy, and the +15% ore bonus.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 50_progression.js disabled'); return }
  let C = S.cfg
  let Block = Java.loadClass('net.minecraft.world.level.block.Block')

  ServerEvents.tags('item', event => {
    event.add('stodd:antarchy_tier', C.antarchyPickaxes)
    event.add('stodd:swords', /^[a-z0-9_]+:[a-z0-9_]*(sword|katana|odachi|nodachi|wakizashi|rapier|cutlass|saber|sabre)$/)
  })
  ServerEvents.tags('block', event => {
    // Terramity mid/late ores need a netherite-tier (or Terramity) pickaxe; diamond no longer works
    event.add('forge:needs_netherite_tool', C.terramityNetheriteOres)
    event.add('stodd:antarchy_gated', C.antarchyGatedBlocks)
    event.add('stodd:bonus_ores', C.oreBonusBlocks)
  })

  // ---- Antarchy gate lives in startup_scripts/stodd_startup.js (it must run on client AND server).
  function isGated(state) { return global.stoddIsAntarchyGated ? global.stoddIsAntarchyGated(state) : false }
  function hasTier(player) { return global.stoddHasAntarchyTier ? global.stoddHasAntarchyTier(player) : true }

  // ---- +15% ore yield on high-value modded ores
  BlockEvents.broken(event => {
    let player = event.player
    if (player == null || player.isCreative()) return
    let id = String(event.block.id)
    if (!C.oreBonusBlocks.test(id)) return
    if (Math.random() >= C.oreBonusChance) return
    let held = player.getMainHandItem()
    try { if (held.hasEnchantment('minecraft:silk_touch', 1)) return } catch (e) { }
    let state = event.block.blockState
    if (state.requiresCorrectToolForDrops() && !held.isCorrectToolForDrops(state)) return
    if (isGated(state) && !hasTier(player)) return
    let drops = Block.getDrops(state, event.level, event.block.pos, event.level.getBlockEntity(event.block.pos), player, held)
    drops.forEach(st => Block.popResource(event.level, event.block.pos, st))
  })
})()
