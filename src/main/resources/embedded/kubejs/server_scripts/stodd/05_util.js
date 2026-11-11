// priority: 900
// Shared helpers for every STODD script. Everything is exported on global.stodd.
(function () {
  let S = global.stodd
  let UUID = Java.loadClass('java.util.UUID')
  let CompoundTag = Java.loadClass('net.minecraft.nbt.CompoundTag')
  let AttributeModifier = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  let Operation = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation')
  let Attributes = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
  let ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')
  let TagKey = Java.loadClass('net.minecraft.tags.TagKey')
  let Registries = Java.loadClass('net.minecraft.core.registries.Registries')

  S.J = { UUID: UUID, CompoundTag: CompoundTag, AttributeModifier: AttributeModifier, Operation: Operation, Attributes: Attributes, ResourceLocation: ResourceLocation, TagKey: TagKey, Registries: Registries }

  S.UUIDS = {
    slot: {
      charm: 'a0314bdf-c160-5fbd-a1ca-a7e3747a7b2d', hands: 'fb3d777a-b75f-5a95-884e-4791fc00be83',
      ring: '80599cff-ceaf-5d28-929d-9664321f7794', necklace: '7c0d8102-108f-51d1-a018-aad4451eda66',
      head: '5b393abd-2fdf-57a7-9458-1619379d19e6', back: '781d4308-27bb-52ee-b2ac-f4ebebc66021',
      belt: 'cacb7fa3-9961-5ee2-9786-8df7f735a7cc', body: '0edca450-42bc-54a0-89a2-3e0e6086a791',
      bracelet: 'dfb9c64a-ec81-5667-9868-1b7cb240a9e6', feet: '4d378a64-a08b-5ddd-aa8d-e65c2aec990a',
      curio: '830a88c0-9ad7-50f9-bc18-bd4c5fe8519c'
    },
    health: '70a48ff5-5e37-5747-86bb-1f7b012fab0b', attack: 'fb9151dc-7057-5a82-916f-5ccecb859646',
    armor: '99b0efaa-8b40-5e3c-b058-a482b53b1909', toughness: '1152433b-13fd-5cd0-9f1e-19ea02375db6',
    speed: '2273f5ff-bbf2-5f8d-b242-f2051758ef90', attackSpeed: '3e2d9d1d-0db7-5635-b879-bd4326094dad',
    bossHealth: '2d0d35dc-ca2e-5cab-8eee-f0e3644bd1ff'
  }

  S.ORIGINS = S.cfg.origins
  // STODD Core 3's Java side (null with an older jar, then every script works as before): the island centres, world-generated
  // cities and dressed islands, the Log Pose item, the origin gate and live access to the other mods' player data.
  S.API = null
  try {
    let A = Java.loadClass('stodd.core.api.StoddApi')
    if (A != null && Number(A.version()) >= 3) S.API = A
  } catch (e) { }
  S.apiFlag = function (name) {
    if (S.API == null) return false
    try { return !!S.API[name]() } catch (e) { return false }
  }
  S.ORIGIN_NAMES = S.cfg.originNames
  // Highest level an origin can reach (the Weakling has its own, higher cap).
  S.maxLevelOf = function (origin) {
    let o = origin != null && S.cfg.originLevels ? S.cfg.originLevels[origin] : null
    return o != null && o.maxLevel ? o.maxLevel : S.cfg.maxLevel
  }

  S.log = function (msg) { if (S.cfg.debug) console.info('[STODD] ' + msg) }

  // Per-player saved data lives in Forge persistent data under "stodd" (copied on death by startup script).
  S.data = function (player) {
    let pd = player.getPersistentData()
    if (!pd.contains('stodd')) pd.put('stodd', new CompoundTag())
    return pd.getCompound('stodd')
  }

  // Origin is published by the Origins power stodd:<origin>/marker as the entity tag stodd_o_<origin>.
  S.getOrigin = function (player) {
    let tags = player.getTags()
    for (let i = 0; i < S.ORIGINS.length; i++) {
      if (tags.contains('stodd_o_' + S.ORIGINS[i])) return S.ORIGINS[i]
    }
    return null
  }

  S.getLevel = function (player) {
    let d = S.data(player)
    let l = d.getInt('lvl')
    return l < 1 ? 1 : l
  }

  // Add/replace a permanent attribute modifier. op: 'add' | 'mul_base' | 'mul_total'
  S.setModifier = function (entity, attribute, uuidStr, name, amount, op) {
    let inst = entity.getAttribute(attribute)
    if (inst == null) return false
    let uuid = UUID.fromString(uuidStr)
    let old = inst.getModifier(uuid)
    if (old != null) {
      if (Math.abs(old.getAmount() - amount) < 1e-6) return false
      inst.removeModifier(uuid)
    }
    if (amount === 0) return old != null
    let operation = op === 'mul_base' ? Operation.MULTIPLY_BASE : (op === 'mul_total' ? Operation.MULTIPLY_TOTAL : Operation.ADDITION)
    inst.addPermanentModifier(new AttributeModifier(uuid, name, amount, operation))
    return true
  }

  S.entityTag = function (path) {
    let parts = path.split(':')
    return TagKey.create(Registries.ENTITY_TYPE, new ResourceLocation(parts[0], parts[1]))
  }
  S.BOSS_TAG = S.entityTag('forge:bosses')

  let EntityType = Java.loadClass('net.minecraft.world.entity.EntityType')
  let BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  S.J.EntityType = EntityType
  S.J.BuiltInRegistries = BuiltInRegistries
  // Entity type id as a JS string, e.g. "minecraft:zombie" (works whether KubeJS exposes .type as string or object)
  S.typeId = function (entity) {
    try { let t = entity.type; if (t != null && String(t).indexOf(':') > 0) return String(t) } catch (e) { }
    try { return String(EntityType.getKey(entity.getEntityType())) } catch (e) { }
    try { return String(EntityType.getKey(entity.getType())) } catch (e) { }
    return 'unknown:unknown'
  }
  S.typeObj = function (entity) {
    return BuiltInRegistries.ENTITY_TYPE.get(new ResourceLocation(S.typeId(entity)))
  }
  S.ns = function (id) { let i = id.indexOf(':'); return i < 0 ? 'minecraft' : id.substring(0, i) }

  S.run = function (server, cmd) {
    try { server.runCommandSilent(cmd) } catch (e) { S.log('command failed: ' + cmd + ' ' + e) }
  }

  // Resolve the player responsible for a damage source: the attacker itself, or the owner of a pet/summon.
  // KubeJS hides vanilla names on these classes: DamageSource.getEntity() is getActual() and
  // getDirectEntity() is getImmediate() in JS; Entity.getUUID() is getUuid(). These wrappers accept either.
  S.attacker = function (src) {
    if (src == null) return null
    try { if (typeof src.getActual === 'function') return src.getActual() } catch (e) { }
    try { if (typeof src.getEntity === 'function') return src.getEntity() } catch (e) { }
    return null
  }
  S.directAttacker = function (src) {
    if (src == null) return null
    try { if (typeof src.getImmediate === 'function') return src.getImmediate() } catch (e) { }
    try { if (typeof src.getDirectEntity === 'function') return src.getDirectEntity() } catch (e) { }
    return null
  }
  S.uuidOf = function (entity) {
    try { return String(entity.getUuid()) } catch (e) { }
    try { return String(entity.getUUID()) } catch (e) { }
    return String(entity.username)
  }
  S.responsiblePlayer = function (src) {
    if (src == null) return null
    let att = S.attacker(src)
    if (att == null) return null
    if (att.isPlayer && att.isPlayer()) return att
    try {
      if (att.getOwner) {
        let owner = att.getOwner()
        if (owner != null && owner.isPlayer && owner.isPlayer()) return owner
      }
    } catch (e) { }
    return null
  }

  S.isBoss = function (entity) {
    if (entity == null || entity.isPlayer()) return false
    try { if (S.typeObj(entity).is(S.BOSS_TAG)) return true } catch (e) { }
    return entity.getMaxHealth() >= S.cfg.bossMinHealth
  }
  S.ready = true // only reached if every line above loaded
})()
