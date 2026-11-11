// priority: 100
// STODD COMPAT - startup: item registration and Forge event hooks.
// Heavy logic lives in server_scripts/stodd/*.js (reloadable with /reload); these hooks only forward.

// ------------------------------------------------------------------ Items
StartupEvents.registry('item', event => {
  event.create('stodd:downgrade_smithing_template')
    .displayName('Downgrade Smithing Template')
    .texture('stodd:item/downgrade_smithing_template')
    .rarity('uncommon')
    .maxStackSize(64)
})

function stoddForward(name, e) {
  let fn = global[name]
  if (typeof fn !== 'function') return
  try { fn(e) } catch (err) { console.error('[STODD] ' + name + ': ' + err) }
}

// Damage pipeline: Hurt = multipliers, Damage = the power cap (after armour/absorption)
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingHurtEvent', e => stoddForward('stoddHurt', e))
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingDamageEvent', e => stoddForward('stoddDamage', e))
// Observation Haki: LivingAttackEvent is the cancellable "a hit is about to land" event
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingAttackEvent', e => stoddForward('stoddAttacked', e))

// Skyborn: no fall damage
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingFallEvent', e => stoddForward('stoddFall', e))

// City islands are built as their chunks are generated: tell 49_city.js that a chunk was generated for the first time.
// (isNewChunk is only true for freshly generated chunks, so this is a cheap no-op for every chunk loaded from disk.)
ForgeEvents.onEvent('net.minecraftforge.event.level.ChunkEvent$Load', e => {
  let f = global.stoddChunkLoad
  if (typeof f === 'function') f(e)
})

// Island theming of natural / structure / spawner spawns
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.MobSpawnEvent$FinalizeSpawn', e => stoddForward('stoddFinalizeSpawn', e))

// Starting / continuing to use an item (eating a Devil Fruit, and so on): the origin rules can veto it here,
// whatever route the mod used to start the use. stoddUseGate returns true to cancel.
function stoddUseGateHook(e) {
  let f = global.stoddUseGate
  if (typeof f !== 'function') return
  try { if (f(e.getEntity(), e.getItem())) e.setCanceled(true) } catch (err) { }
}
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingEntityUseItemEvent$Start', stoddUseGateHook)
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingEntityUseItemEvent$Tick', stoddUseGateHook)

// Equipping a magic curio (Curios' CurioEquipEvent, a Forge event with a result) and swinging a magic weapon
// (AttackEntityEvent) are not "item use", so the Apoli lock cannot see them: forward both to the origin rules.
try {
  let EventResult = Java.loadClass('net.minecraftforge.eventbus.api.Event$Result')
  ForgeEvents.onEvent('top.theillusivec4.curios.api.event.CurioEquipEvent', e => {
    let f = global.stoddEquipGate
    if (typeof f !== 'function') return
    try { if (f(e.getEntity(), e.getStack())) e.setResult(EventResult.DENY) } catch (err) { }
  })
} catch (err) { console.warn('[STODD] Curios equip hook not installed: ' + err) }
ForgeEvents.onEvent('net.minecraftforge.event.entity.player.AttackEntityEvent', e => {
  let f = global.stoddAttackGate
  if (typeof f !== 'function') return
  try { if (f(e.getEntity(), e.getEntity().getMainHandItem())) e.setCanceled(true) } catch (err) { }
})

// Finishing an item use (eating a Devil Fruit etc.) locks a 'path' origin's path
ForgeEvents.onEvent('net.minecraftforge.event.entity.living.LivingEntityUseItemEvent$Finish', e => {
  let f = global.stoddOnUseFinish
  if (typeof f === 'function') { try { f(e.getEntity(), e.getItem()) } catch (err) { } }
})

// Keep levels/origin data through death (Forge persistent data is not copied by default)
ForgeEvents.onEvent('net.minecraftforge.event.entity.player.PlayerEvent$Clone', e => {
  try {
    let oldData = e.getOriginal().getPersistentData()
    if (oldData.contains('stodd')) e.getEntity().getPersistentData().put('stodd', oldData.getCompound('stodd').copy())
  } catch (err) { console.error('[STODD] clone: ' + err) }
})

// ------------------------------------------------- Antarchy mining gate
// Runs on both client and server so the break animation and the result agree.
let STODD_ANTARCHY_PICKS = ['terramity:exodium_pickaxe', 'terramity:nyxium_pickaxe', 'terramity:reverium_pickaxe', 'antarchy:ultimate_pickaxe']
let STODD_ANTARCHY_GATED = /^antarchy:(([a-z]+_)?(uranium|titanium)_ore|raw_uranium_block|blood_crystal_cluster|budding_blood_crystal)$/
let StoddBlockRegistry = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries').BLOCK
let stoddGateCache = new Map()

global.stoddIsAntarchyGated = function (state) {
  let b = state.getBlock()
  if (stoddGateCache.has(b)) return stoddGateCache.get(b)
  let cfg = global.stodd && global.stodd.cfg
  let re = cfg ? cfg.antarchyGatedBlocks : STODD_ANTARCHY_GATED
  let g = re.test(String(StoddBlockRegistry.getKey(b)))
  stoddGateCache.set(b, g)
  return g
}
global.stoddHasAntarchyTier = function (player) {
  let held = player.getMainHandItem()
  if (held == null || held.isEmpty()) return false
  let cfg = global.stodd && global.stodd.cfg
  let picks = cfg ? cfg.antarchyPickaxes : STODD_ANTARCHY_PICKS
  if (picks.indexOf(String(held.id)) >= 0) return true
  try { return held.hasTag('stodd:antarchy_tier') } catch (err) { return false }
}
let stoddLastWarn = new Map()
ForgeEvents.onEvent('net.minecraftforge.event.entity.player.PlayerEvent$BreakSpeed', e => {
  try {
    if (!global.stoddIsAntarchyGated(e.getState())) return
    let player = e.getEntity()
    if (player.isCreative() || global.stoddHasAntarchyTier(player)) return
    e.setCanceled(true)
    if (player.level.isClientSide()) return
    let k = String(player.getUuid()), now = Date.now()
    if ((stoddLastWarn.get(k) || 0) + 3000 < now) {
      stoddLastWarn.set(k, now)
      player.setStatusMessage(Text.red('Too dense to mine. You need a Tier 3 Terramity pickaxe (Exodium, Nyxium or Reverium).'))
    }
  } catch (err) { }
})
ForgeEvents.onEvent('net.minecraftforge.event.entity.player.PlayerEvent$HarvestCheck', e => {
  try {
    if (!global.stoddIsAntarchyGated(e.getTargetBlock())) return
    let player = e.getEntity()
    if (!player.isCreative() && !global.stoddHasAntarchyTier(player)) e.setCanHarvest(false)
  } catch (err) { }
})
