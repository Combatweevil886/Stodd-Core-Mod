// priority: 300
// DOWNGRADE TEMPLATE: Downgrade Template + any smithing-upgraded item -> the original item.
// The upgrade material and the upgrade template are handed back. Enchantments, name and damage are kept.
// Recipes are generated automatically from every smithing_transform recipe in the pack, so modded
// upgrades (Terramity, Mythic Upgrades, Mekanism Tools, ...) are covered without manual entries.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 60_downgrade.js disabled'); return }
  let TEMPLATE = 'stodd:downgrade_smithing_template'
  // KubeJS renames ItemStack.getTag()/setTag() to getNbt()/setNbt() in JS; accept either
  function nbtOf(stack) {
    try { if (typeof stack.getNbt === 'function') return stack.getNbt() } catch (e) { }
    try { if (typeof stack.getTag === 'function') return stack.getTag() } catch (e) { }
    return null
  }
  function putNbt(stack, tag) {
    try { if (typeof stack.setNbt === 'function') { stack.setNbt(tag); return } } catch (e) { }
    try { if (typeof stack.setTag === 'function') stack.setTag(tag) } catch (e) { }
  }

  function firstItem(el) {
    if (el == null) return null
    try {
      if (el.isJsonArray()) return el.getAsJsonArray().size() > 0 ? firstItem(el.getAsJsonArray().get(0)) : null
      if (el.isJsonPrimitive()) return String(el.getAsString())
      let o = el.getAsJsonObject()
      if (o.has('item')) return String(o.get('item').getAsString())
      if (o.has('tag')) {
        let ids = Ingredient.of('#' + o.get('tag').getAsString()).getItemIds().toArray()
        return ids.length > 0 ? String(ids[0]) : null
      }
    } catch (e) { }
    return null
  }

  ServerEvents.recipes(event => {
    // Cheap, dedicated recipe: no template needed to make one (unlike vanilla template duplication)
    event.shaped('2x ' + TEMPLATE, ['CFC', 'CIC', 'CCC'], {
      C: 'minecraft:cobblestone', F: 'minecraft:flint', I: 'minecraft:copper_ingot'
    }).id('stodd:downgrade_smithing_template')

    let found = []
    let seen = {}
    event.forEachRecipe({ type: 'minecraft:smithing_transform' }, r => {
      try {
        let j = r.json
        let template = firstItem(j.get('template'))
        let base = firstItem(j.get('base'))
        let addition = firstItem(j.get('addition'))
        let result = firstItem(j.get('result'))
        if (!base || !result || base === result || seen[result]) return
        seen[result] = true
        found.push({ template: template, base: base, addition: addition, result: result })
      } catch (e) { S.log('downgrade parse ' + e) }
    })

    found.forEach(f => {
      let safe = f.result.replace(':', '/')
      event.shapeless(Item.of(f.base), [TEMPLATE, f.result])
        .id('stodd:downgrade/' + safe)
        .modifyResult((grid, out) => {
          let up = grid.find(Ingredient.of(f.result))
          if (up != null && !up.isEmpty() && nbtOf(up) != null) putNbt(out, nbtOf(up).copy())
          out.getOrCreateTag().putString('stodd_return', (f.addition || '') + '|' + (f.template || ''))
          return out
        })
    })
    console.info('[STODD] generated ' + found.length + ' downgrade recipes')
  })

  // Hand back the upgrade material + template and clean the marker off the item.
  ItemEvents.crafted(event => {
    let item = event.item
    let tag = nbtOf(item)
    if (tag == null || !tag.contains('stodd_return')) return
    let parts = String(tag.getString('stodd_return')).split('|')
    tag.remove('stodd_return')
    if (tag.isEmpty()) putNbt(item, null)
    parts.forEach(id => { if (id && id.length > 0) { try { event.player.give(Item.of(id)) } catch (e) { } } })
  })
})()
