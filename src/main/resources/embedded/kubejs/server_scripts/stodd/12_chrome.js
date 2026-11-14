// priority: 780
// STODD Core: starting chrome. Installs an implant into Project: Edgerunner's cyberware data the way its Ripperdoc does, so the
// Cyberware User starts with the Kiroshi Optics in, not in the inventory (10_origins.js calls it when the origin is chosen).
;(function () {
  const S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 12_chrome.js disabled'); return }

  // Installs one implant through Project: Edgerunner's own cyberware data, the way its Ripperdoc does: the body slot, the
  // physical slot, the old component key, the load, the power, then Edgerunner refreshes itself. Returns 'installed', 'had'
  // (already in, or the slot holds another implant) or null (Edgerunner is not there, or this did not work).
  S.installImplant = function (player, itemId) {
    let Bridge
    try { Bridge = Java.loadClass('com.edgerunner.cyberware.CyberwareScriptBridge') } catch (e) { return null }
    try {
      if (Bridge.hasInstalledItem(player, itemId)) return 'had'
      let cfg = global.getCyberwareInstallComponentConfig ? global.getCyberwareInstallComponentConfig(itemId) : null
      if (cfg == null) return null
      let data = {}
      try { data = JSON.parse(String(Bridge.toCyberwareJson(player) || '{}')) || {} } catch (e) { data = {} }
      ;['installed_components', 'installed_physical', 'installed_body_slots', 'installed_activation_slots'].forEach(k => {
        if (data[k] == null || typeof data[k] !== 'object') data[k] = {}
      })
      let slot = String(cfg.body_slot)
      if (data.installed_body_slots[slot]) return 'had'
      data.installed_body_slots[slot] = itemId
      let phys = global.resolveCyberwarePhysicalSlotForBodySlot ? Number(global.resolveCyberwarePhysicalSlotForBodySlot(slot)) : -1
      if (phys >= 0) data.installed_physical['slot_' + phys] = itemId
      if (cfg.legacy_slot_key) data.installed_components[String(cfg.legacy_slot_key)] = itemId
      if (String(cfg.activation_mode) === 'manual' && cfg.activation_slot) data.installed_activation_slots[String(cfg.activation_slot)] = itemId
      let load = Number(cfg.load_cost) > 0 ? Math.floor(Number(cfg.load_cost)) : 3
      data.current_load = (Number(data.current_load) || 0) + load
      Bridge.replaceCyberwareJson(player, JSON.stringify(data))
      if (cfg.palladium_power) S.run(player.server, 'superpower add ' + cfg.palladium_power + ' ' + player.username)
      try { if (global.normalizeCyberwareInstalledData) global.normalizeCyberwareInstalledData(player) } catch (e) { }
      try { if (global.recomputeCyberwareCapacityNow) global.recomputeCyberwareCapacityNow(player) } catch (e) { }
      try { if (global.refreshCyberwarePowerVariantNow) global.refreshCyberwarePowerVariantNow(player, { reason: 'stodd_starter', preferRecoveryFallback: true }) } catch (e) { }
      try { Java.loadClass('com.edgerunner.cyberware.CyberwareSyncService').syncInstalledStateAndHud(player) } catch (e) { }
      return Bridge.hasInstalledItem(player, itemId) ? 'installed' : null
    } catch (e) {
      S.log('installImplant ' + itemId + ': ' + e)
      return null
    }
  }

  S.itemName = function (id) {
    try { return String(Item.of(id).getHoverName().getString()) } catch (e) { return String(id).replace(/^.*:/, '').replace(/_/g, ' ') }
  }
})()
