// priority: 850
// CRASH GUARDS: removes entity types that are known to crash the server in this pack (see blockedEntities in 00_config.js).
// The event also fires for entities loaded from a save, so an anvil that was already in the world when the server last
// stopped is removed instead of crashing the next boot.
(function () {
  let S = global.stodd
  if (!S || !S.cfg) return
  let list = S.cfg.blockedEntities || []
  let told = {}
  list.forEach(id => {
    EntityEvents.spawned(id, event => {
      try {
        let ent = event.entity
        let n = (told[id] || 0) + 1
        told[id] = n
        if (n <= 3 || n % 50 === 0) console.warn('[STODD] blocked ' + id + ' (crashes this pack: Royal Variations x Apoli isInWall). Count: ' + n)
        try {
          let owner = ent.owner
          if (owner != null && typeof owner.tell === 'function') owner.tell(Text.red('[STODD] ').append(Text.white('A Spectral Anvil was blocked: it crashes the server in this pack (Royal Variations x Apoli).')))
        } catch (e) { }
      } catch (e) { }
      event.cancel()
    })
  })
})()
