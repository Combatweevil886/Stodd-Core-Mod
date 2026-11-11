// priority: 880
// DISCOVERY: finds, at load time, which installed mods provide each power system (Devil Fruits, Dark Magic)
// and which of their items / blocks belong to it. Nothing here depends on a hard-coded item id for a mod the
// pack author could not inspect: mods are matched by the name or id they report, items by the patterns in
// 00_config.js (cfg.detect). The result feeds
//   * the item / block tags the data jar's Apoli locks read     (stodd:devil_fruits, stodd:magic_items, ...)
//   * the item gate and the Curios / attack vetoes              (S.systemOfItem, S.systemOfBlock)
//   * /stodd scan, which prints what was found so the patterns can be corrected from real data
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 06_discover.js disabled'); return }
  let C = S.cfg
  let Registries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

  // ------------------------------------------------------------ installed mods
  S.modList = []
  try {
    let mods = Platform.getMods()
    let keys = mods.keySet().toArray()
    for (let i = 0; i < keys.length; i++) {
      let info = mods.get(keys[i])
      S.modList.push({ id: String(keys[i]), name: String(info.getName()) })
    }
  } catch (e) { console.warn('[STODD] could not list installed mods: ' + e) }
  S.modsWhere = function (nameRe, idRe) {
    let out = []
    S.modList.forEach(m => {
      if ((nameRe != null && nameRe.test(m.name)) || (idRe != null && idRe.test(m.id))) out.push(m.id)
    })
    return out
  }
  S.isModLoaded = function (id) { return S.modList.some(m => m.id === id) }

  // ------------------------------------------------- mods behind each power system
  S.systemMods = {}
  C.systems.forEach(sys => {
    let d = C.detect[sys]
    S.systemMods[sys] = d ? S.modsWhere(d.names, d.ids) : []
  })

  // -------------------------------------------------------- items and blocks per system
  S.systemItems = {}
  S.systemBlocks = {}
  S.itemSystem = {}
  S.blockSystem = {}
  C.systems.forEach(sys => { S.systemItems[sys] = []; S.systemBlocks[sys] = [] })
  function split(rl) { let s = String(rl), i = s.indexOf(':'); return [s.substring(0, i), s.substring(i + 1)] }
  try {
    let nsSys = {}
    C.systems.forEach(sys => { S.systemMods[sys].forEach(ns => { (nsSys[ns] = nsSys[ns] || []).push(sys) }) })
    let keys = Registries.ITEM.keySet().toArray()
    for (let i = 0; i < keys.length; i++) {
      let p = split(keys[i]), list = nsSys[p[0]]
      if (list == null) continue
      for (let j = 0; j < list.length; j++) {
        let d = C.detect[list[j]]
        if (d.items != null && d.items.test(p[1])) {
          let id = p[0] + ':' + p[1]
          S.systemItems[list[j]].push(id)
          if (S.itemSystem[id] == null) S.itemSystem[id] = list[j]
        }
      }
    }
    let bkeys = Registries.BLOCK.keySet().toArray()
    for (let i = 0; i < bkeys.length; i++) {
      let p = split(bkeys[i]), list = nsSys[p[0]]
      if (list == null) continue
      for (let j = 0; j < list.length; j++) {
        let d = C.detect[list[j]]
        if (d.blocks != null && d.blocks.test(p[1])) {
          let id = p[0] + ':' + p[1]
          S.systemBlocks[list[j]].push(id)
          if (S.blockSystem[id] == null) S.blockSystem[id] = list[j]
        }
      }
    }
  } catch (e) { console.warn('[STODD] item discovery failed: ' + e) }

  let summary = []
  C.systems.forEach(sys => {
    if (sys === 'sorcery') return
    summary.push(sys + ': mods [' + S.systemMods[sys].join(', ') + '] items ' + S.systemItems[sys].length + ' blocks ' + S.systemBlocks[sys].length)
  })
  console.info('[STODD] power systems found - ' + summary.join(' | '))

  // Which system an item id belongs to ('fruit', 'sorcery', 'magic') or null.
  S.systemOfItem = function (id) {
    let s = S.itemSystem[id]
    if (s != null) return s
    if (C.sorceryItems.indexOf(id) >= 0 || C.sorceryItemPattern.test(id)) return 'sorcery'
    return null
  }
  S.systemOfBlock = function (id) { return S.blockSystem[id] || null }

  // ------------------------------------------------------------------ tags
  // The data jar's Apoli locks read these tags. The jar ships them empty (plus Malum's ids from its source); this
  // fills in whatever was actually found in the installed mods.
  let ITEM_TAG = { fruit: 'stodd:devil_fruits', magic: 'stodd:magic_items' }
  let BLOCK_TAG = { magic: 'stodd:magic_machines' }
  ServerEvents.tags('item', event => {
    Object.keys(ITEM_TAG).forEach(sys => {
      let ids = S.systemItems[sys] || []
      for (let i = 0; i < ids.length; i++) { try { event.add(ITEM_TAG[sys], ids[i]) } catch (e) { } }
    })
  })
  ServerEvents.tags('block', event => {
    Object.keys(BLOCK_TAG).forEach(sys => {
      let ids = S.systemBlocks[sys] || []
      for (let i = 0; i < ids.length; i++) { try { event.add(BLOCK_TAG[sys], ids[i]) } catch (e) { } }
    })
    C.ripperdocBlocks.forEach(id => { try { event.add('stodd:cyberware_stations', id) } catch (e) { } })
  })

  // ----------------------------------------------------------- island themes
  // Only themes whose mod is installed are used ('wild' is always on).
  S.activeThemes = C.islandThemes.filter(t => t.mods == null || S.modsWhere(t.mods, t.mods).length > 0)
  S.themeMods = {}
  C.islandThemes.forEach(t => { S.themeMods[t.id] = t.mods == null ? [] : S.modsWhere(t.mods, t.mods) })
})()
