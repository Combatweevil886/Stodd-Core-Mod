// priority: 400
// LOCATE: find islands without exploring, for testing and for planning trips.
//
//   /stodd locate city            nearest city island of any style (modern, Neo City, tribal)
//   /stodd locate neocity         nearest Neo City (futuristic)        /stodd locate tribal      nearest tribal town
//   /stodd locate sky             nearest floating sky island
//   /stodd locate ember|sakura|ruins|crystal|skull|onepiece|jujutsu|cyberpunk|arcane|wild
//   /stodd locate island          nearest island of any kind
//   /stodd locate <what> list     the nearest five          /stodd locate <what> tp    (operators) teleport there
//   /stodd locate            lists what can be searched for
//
// The search reads the same terrain function that shaped the world (40_islands.js), a few map cells per tick, so it needs
// no exploring and never freezes the server; the answer arrives in chat when the search is done.
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.islandsNear || !S.islandInfo) { console.error('[STODD] islands not loaded - 53_locate.js disabled'); return }
  let C = S.cfg
  let L = C.locate || {}
  let RADII = L.radii || [1000, 2000, 4000, 8000]
  let CELLS = L.cellsPerTick || 3
  let LIST_N = L.listCount || 5
  let SKY_ON = !!(C.sky && C.sky.enabled)
  let DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

  // name -> { label, themes: [ids] | null, sky: bool, any: bool }
  let TARGETS = {}
  Object.keys(L.groups || {}).forEach(k => { TARGETS[k] = { label: k, themes: L.groups[k], sky: false } })
  ;(S.activeThemes || C.islandThemes).forEach(t => { if (TARGETS[t.id] == null) TARGETS[t.id] = { label: t.name, themes: [t.id], sky: false } })
  TARGETS.island = { label: 'island', themes: null, sky: false }
  if (SKY_ON) TARGETS.sky = { label: 'sky island', themes: null, sky: true }
  // drop targets whose themes are not active in this pack (their mods are missing or they are turned off)
  Object.keys(TARGETS).forEach(k => {
    let t = TARGETS[k]
    if (t.themes == null) return
    let live = t.themes.filter(id => S.themeById ? S.themeById(id) != null : true)
    if (live.length === 0) delete TARGETS[k]
    else t.themes = live
  })
  S.locateTargets = TARGETS

  function test(level, e, t) {
    if (t.sky) return !!e.sky
    if (e.sky) return false
    if (t.themes == null) return true
    let info = S.islandInfo(level, e)
    return info != null && !info.ocean && t.themes.indexOf(info.theme.id) >= 0
  }
  function bearing(dx, dz) {
    let a = Math.atan2(dx, -dz) * 180 / Math.PI
    return DIRS[((Math.round(a / 45) % 8) + 8) % 8]
  }

  let jobs = new Map()
  // starts (or restarts) a search for the player; mode = 'find' | 'list' | 'tp'
  S.locateStart = function (p, name, mode) {
    let t = TARGETS[name]
    if (t == null) { p.tell(Text.red('[Locate] Unknown target "' + name + '". Try: ' + Object.keys(TARGETS).join(', '))); return 0 }
    if (String(p.level.dimension).indexOf('minecraft:overworld') < 0) { p.tell(Text.yellow('[Locate] Islands only exist in the overworld.')); return 0 }
    jobs.set(S.uuidOf(p), { name: name, t: t, mode: mode, level: p.level, x: p.x, z: p.z, ri: 0, want: mode === 'list' ? LIST_N : 1 })
    p.tell(Text.gold('[Locate] ').append(Text.gray('Searching for the nearest ' + t.label + '...')))
    return 1
  }

  function finish(p, job, found) {
    jobs.delete(S.uuidOf(p))
    if (found.length === 0) {
      p.tell(Text.gold('[Locate] ').append(Text.yellow('No ' + job.t.label + ' within ' + RADII[RADII.length - 1] + ' blocks of where you stood.')))
      return
    }
    let top = found.slice(0, job.want)
    top.forEach(it => {
      let info = S.islandInfo(job.level, it.e)
      let name = info.label
      let msg = name + ' at ' + it.e.x + ', ' + it.e.z + (it.e.sky ? ' (y ~232)' : '') + '  -  ' + Math.round(it.d) + ' blocks ' + bearing(it.e.x - job.x, it.e.z - job.z)
      p.tell(Text.gold('[Locate] ').append(Text.white(msg)))
    })
    if (job.mode === 'tp') {
      let it = top[0]
      let y = it.e.sky ? (L.tpHeight || 262) : (L.tpHeightGround || 200)
      let n = p.username
      S.run(p.server, 'execute in minecraft:overworld run tp ' + n + ' ' + it.e.x + ' ' + y + ' ' + it.e.z)
      S.run(p.server, 'effect give ' + n + ' minecraft:slow_falling 90 0 true')
      p.tell(Text.gold('[Locate] ').append(Text.gray('Teleported. Slow falling for 90 seconds while the chunks load.')))
    }
  }

  function step(p) {
    let job = jobs.get(S.uuidOf(p))
    if (job == null) return
    let R = RADII[job.ri]
    let res = S.islandsNear(job.level, job.x, job.z, R, job.t.sky ? 1 : CELLS, job.t.sky)
    if (!res.complete) return
    let found = res.list.filter(it => test(job.level, it.e, job.t))
    if (found.length >= job.want || job.ri >= RADII.length - 1) { finish(p, job, found); return }
    job.ri++
  }
  PlayerEvents.tick(event => {
    let p = event.player
    if (jobs.size === 0) return
    try { step(p) } catch (e) { jobs.delete(S.uuidOf(p)); console.warn('[STODD] locate: ' + e) }
  })
  PlayerEvents.loggedOut(event => { try { jobs.delete(S.uuidOf(event.player)) } catch (e) { } })

  // ---------------------------------------------------------------- commands
  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    let loc = Commands.literal('locate')
      .requires(src => L.everyone !== false || src.hasPermission(2))
      .executes(ctx => {
        ctx.source.sendSystemMessage(Text.gold('[Locate] ').append(Text.white('/stodd locate <' + Object.keys(TARGETS).join('|') + '> [list|tp]')))
        return 1
      })
    Object.keys(TARGETS).forEach(name => {
      loc = loc.then(Commands.literal(name)
        .executes(ctx => S.locateStart(ctx.source.getPlayerOrException(), name, 'find'))
        .then(Commands.literal('list').executes(ctx => S.locateStart(ctx.source.getPlayerOrException(), name, 'list')))
        .then(Commands.literal('tp').requires(src => src.hasPermission(2)).executes(ctx => S.locateStart(ctx.source.getPlayerOrException(), name, 'tp'))))
    })
    // /stodd find city|sky kept as a short alias
    let find = Commands.literal('find').requires(src => L.everyone !== false || src.hasPermission(2))
    ;['city', 'sky'].forEach(name => {
      if (TARGETS[name] != null) find = find.then(Commands.literal(name).executes(ctx => S.locateStart(ctx.source.getPlayerOrException(), name, 'find')))
    })
    event.register(Commands.literal('stodd').then(loc).then(find))
  })
})()
