// STODD COMPAT - client tooltips
ItemEvents.tooltip(event => {
  event.add('stodd:downgrade_smithing_template', [
    Text.gray('Craft with an upgraded tool or armor piece'),
    Text.gray('to undo its last smithing upgrade.'),
    Text.green('Returns the upgrade material and its template.'),
    Text.darkGray('Enchantments and name are kept.')
  ])
  event.addAdvanced(Ingredient.all, (item, advanced, text) => {
    let tag = null
    try { tag = (typeof item.getNbt === 'function') ? item.getNbt() : item.getTag() } catch (e) { }
    if (tag != null && tag.contains('stodd_return')) {
      let parts = String(tag.getString('stodd_return')).split('|').filter(s => s.length > 0)
      text.add(Text.green('Also returns: ' + parts.join(', ')))
    }
  })
})
