// priority: 390
// WORLD CHECK: "is this server really generating the STODD islands?"
//
//   /stodd world        (operators) prints the report below.  The same report is written to the server log when the server starts.
//
// What it tells you:
//   * the island layout in use (config/stodd_islands.properties -> config/survivalisland.json),
//   * which packs provide the overworld noise settings (the LAST one listed is the one that wins),
//   * what the terrain function really does: it samples the continentalness over a square around 0,0 and counts land and separate
//     landmasses, then says ISLANDS or NOT ISLANDS,
//   * leftovers that cause trouble (the old STODD Compat jar).
// The sampling is the same function that shapes new chunks, so it answers for chunks that have NOT been generated yet. Chunks that
// were generated earlier keep their terrain whatever this says.
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.landSampler) { console.error('[STODD] islands not loaded - 54_world.js disabled'); return }
  let C = S.cfg
  let W = C.world || {}
  let HALF = W.gridHalf || 12            // samples each way from 0,0
  let STEP = W.gridStep || 128           // blocks between samples (HALF 12 x STEP 128 = a 3.1 km square)
  let MAX_LAND = W.maxLandFraction == null ? 0.4 : W.maxLandFraction
  let MAX_BLOB = W.maxBlobCells || 80
  let ResourceLocation = S.J.ResourceLocation

  function toArr(x) {
    if (x == null) return []
    try { if (typeof x.toArray === 'function') return Array.prototype.slice.call(x.toArray()) } catch (e) { }
    try { if (typeof x.length === 'number') return Array.prototype.slice.call(x) } catch (e) { }
    return []
  }
  function field(m, k) {
    if (m == null) return null
    try { if (typeof m.get === 'function') return m.get(k) } catch (e) { }
    return m[k]
  }
  function num(x) { let n = Number(x); return isFinite(n) ? n : null }

  // ---------------------------------------------------------------- pieces of the report
  // The layout file STODD Core writes from config/stodd_islands.properties.
  S.worldLayout = function () {
    let m = null
    try { m = JsonIO.read('config/survivalisland.json') } catch (e) { }
    if (m == null) return null
    return {
      size: num(field(m, 'islandSize')), sep: num(field(m, 'islandSeperation')),
      preset: field(m, '_stodd_preset') == null ? null : String(field(m, '_stodd_preset')),
      managed: field(m, '_stodd') != null
    }
  }
  // Packs that provide a data file, lowest priority first (the last one wins).
  S.worldProviders = function (server, ns, path) {
    let out = []
    try {
      let stack = toArr(server.getResourceManager().getResourceStack(new ResourceLocation(ns, path)))
      for (let i = 0; i < stack.length; i++) out.push(String(stack[i].sourcePackId()))
    } catch (e) { }
    return out
  }
  // Counts land and separate landmasses on a grid of continentalness samples (4-connected flood fill).
  S.worldShape = function (sample) {
    let N = HALF * 2 + 1
    let land = []
    let cells = 0
    for (let i = 0; i < N; i++) {
      land.push([])
      for (let j = 0; j < N; j++) {
        let v = sample((i - HALF) * STEP, (j - HALF) * STEP)
        let isLand = typeof v === 'number' && isFinite(v) && v > C.islandLandThreshold
        land[i].push(isLand ? 1 : 0)
        if (isLand) cells++
      }
    }
    let seen = []
    for (let i = 0; i < N; i++) { seen.push([]); for (let j = 0; j < N; j++) seen[i].push(0) }
    let blobs = 0, biggest = 0
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (land[i][j] !== 1 || seen[i][j] === 1) continue
      blobs++
      let size = 0
      let stack = [[i, j]]
      seen[i][j] = 1
      while (stack.length > 0) {
        let c = stack.pop()
        size++
        let nb = [[c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]]
        for (let k = 0; k < 4; k++) {
          let a = nb[k][0], b = nb[k][1]
          if (a < 0 || b < 0 || a >= N || b >= N) continue
          if (land[a][b] !== 1 || seen[a][b] === 1) continue
          seen[a][b] = 1
          stack.push([a, b])
        }
      }
      if (size > biggest) biggest = size
    }
    let total = N * N
    return { total: total, land: cells, fraction: cells / total, blobs: blobs, biggest: biggest, square: N * STEP }
  }

  // lines of { k: 'ok'|'warn'|'bad'|'info', s: text }
  S.worldReport = function (server) {
    let L = []
    let add = function (k, s) { L.push({ k: k, s: s }) }
    add('info', 'STODD world check')
    let lay = S.worldLayout()
    if (lay == null) add('warn', 'config/survivalisland.json could not be read here (Survival Island then uses its own defaults).')
    else {
      add('info', 'Island layout: ' + (lay.preset ? 'preset ' + lay.preset + ', ' : '') + 'islandSize ' + lay.size + ', islandSeparation ' + lay.sep +
        ' (from config/stodd_islands.properties).')
      if (!lay.managed) add('warn', 'config/survivalisland.json was not written by STODD Core 2.3.0+; edit config/stodd_islands.properties instead (it is rewritten at start-up).')
    }
    if (S.API != null) add('ok', 'STODD Core 3 (Java) is running: the island world pack, cities / dressed islands / sky dressing generated with the chunks, the Log Pose item, the origin gate. Full report: /stodd core world')
    else add('warn', 'The Java side of STODD Core 3 is not loaded (an older stodd_core jar?): cities and dressed islands are built by the scripts as players come near.')
    let oldJars = S.isModLoaded && S.isModLoaded('stodd_compat')
    if (oldJars) add('bad', 'The old STODD Compat mod is still installed. Delete mods/stodd_compat-*.jar: it carries older copies of the world files.')
    if (S.isModLoaded && !S.isModLoaded('survivalisland')) add('bad', 'Survival Island is not installed, so there are no islands.')

    let prov = server == null ? [] : S.worldProviders(server, 'minecraft', 'worldgen/noise_settings/overworld.json')
    if (prov.length > 0) add(prov.length > 2 ? 'warn' : 'info', 'Overworld noise settings come from: ' + prov.join('  >  ') + '   (the last one wins)')
    let level = null
    try { level = server.overworld() } catch (e) { }
    if (level == null) { try { level = server.getOverworld() } catch (e) { } }
    let sample = level == null ? null : S.landSampler(level)
    if (sample == null) {
      add('bad', 'The overworld has no island terrain function: the generator is NOT Survival Island. New chunks will be an ordinary world.')
      add('info', 'Check: the log line "[STODD Core] version ... written" at start-up, that mods/ holds only stodd_core-<version>.jar, and send this report.')
      return L
    }
    let sh = S.worldShape(sample)
    let pct = Math.round(sh.fraction * 1000) / 10
    let islands = sh.fraction <= MAX_LAND && sh.biggest <= MAX_BLOB
    add(islands ? 'ok' : 'bad', (islands ? 'ISLANDS: ' : 'NOT ISLANDS: ') + 'sampling ' + sh.total + ' points over ' + (sh.square / 1000).toFixed(1) +
      ' km: ' + pct + '% land, ' + sh.blobs + ' separate landmasses, the biggest is ' + sh.biggest + ' points (about ' +
      Math.round(Math.sqrt(sh.biggest * 4 / Math.PI) * STEP) + ' blocks across).')
    if (islands) add('info', 'New chunks are generated as islands. Chunks generated earlier keep the terrain they had; to see islands there, use a new world.')
    else add('info', 'New chunks will not be islands. If the log shows the world files from more than one pack, remove the extra one; if a world folder already exists on the server, delete it so it is generated again.')
    return L
  }

  function paint(l) {
    if (l.k === 'ok') return Text.green(l.s)
    if (l.k === 'bad') return Text.red(l.s)
    if (l.k === 'warn') return Text.yellow(l.s)
    return Text.gray(l.s)
  }

  ServerEvents.loaded(event => {
    if (W.logOnStart === false) return
    try {
      S.worldReport(event.server).forEach(l => {
        if (l.k === 'bad' || l.k === 'warn') console.warn('[STODD] ' + l.s)
        else console.info('[STODD] ' + l.s)
      })
    } catch (e) { console.warn('[STODD] world check: ' + e) }
  })

  ServerEvents.commandRegistry(event => {
    let Commands = event.commands
    event.register(Commands.literal('stodd')
      .then(Commands.literal('world').requires(src => src.hasPermission(2))
        .executes(ctx => {
          let lines = S.worldReport(ctx.source.getServer())
          lines.forEach(l => ctx.source.sendSystemMessage(paint(l)))
          return 1
        })))
  })
})()
