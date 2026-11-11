// priority: 440
// WORLD SPAWN: the map is only ~1% land, so on a brand-new world the vanilla spawn search can leave a player
// in open sea. On first load the world spawn is moved to the nearest island (inland, not on the beach).
(function () {
  let S = global.stodd
  if (!S || !S.ready || !S.landSampler) { console.error('[STODD] islands not loaded - 47_spawn.js disabled'); return }
  let C = S.cfg
  let SP = C.spawn || {}
  let STEP = SP.ringStep || 192, MAXR = SP.maxRadius || 24000, INLAND = SP.inland || 0.22

  // Nearest land point to (0,0), ring by ring. Returns [x, z] or null.
  S.nearestLand = function (sample, margin) {
    let need = C.islandLandThreshold + margin
    if (sample(0, 0) > need) return [0, 0]
    for (let r = STEP; r <= MAXR; r += STEP) {
      let n = Math.max(8, Math.floor(2 * Math.PI * r / STEP))
      let best = null, bv = need
      for (let i = 0; i < n; i++) {
        let a = 2 * Math.PI * i / n
        let x = Math.round(r * Math.cos(a)), z = Math.round(r * Math.sin(a))
        let v = sample(x, z)
        if (v > bv) { bv = v; best = [x, z] }
      }
      if (best != null) return best
    }
    return null
  }

  // Walk from a coastal point toward the island's summit until clearly inland.
  S.inlandSpawn = function (level, sample) {
    let p = S.nearestLand(sample, 0.0)
    if (p == null) return null
    if (p[0] === 0 && p[1] === 0 && sample(0, 0) > C.islandLandThreshold + INLAND) return [0, 0]
    let isl = S.islandAt(level, p[0], p[1])
    let tx = isl && !isl.ocean ? isl.peakX : p[0], tz = isl && !isl.ocean ? isl.peakZ : p[1]
    let x = p[0], z = p[1]
    let dist = Math.sqrt((tx - x) * (tx - x) + (tz - z) * (tz - z))
    let steps = Math.max(1, Math.ceil(dist / 48))
    for (let i = 0; i <= steps; i++) {
      let px = Math.round(p[0] + (tx - p[0]) * i / steps), pz = Math.round(p[1] + (tz - p[1]) * i / steps)
      x = px; z = pz
      if (sample(px, pz) > C.islandLandThreshold + INLAND) break
    }
    return [x, z]
  }

  ServerEvents.loaded(event => {
    try {
      let server = event.server
      let pd = server.persistentData
      if (pd.getBoolean('stodd_spawn_done')) return
      let level = null
      try { level = server.overworld() } catch (e) { }
      if (level == null) { try { level = server.getOverworld() } catch (e) { } }
      if (level == null) { try { level = server.getLevel('minecraft:overworld') } catch (e) { } }
      if (level == null) return
      // never move the spawn of a world someone already plays in
      pd.putBoolean('stodd_spawn_done', true)
      let sample = S.landSampler(level)
      if (sample == null) return
      let pos = S.inlandSpawn(level, sample)
      if (pos == null) { console.warn('[STODD] no island found within ' + MAXR + ' blocks; spawn left alone'); return }
      if (pos[0] === 0 && pos[1] === 0) return
      S.run(server, 'execute in minecraft:overworld run setworldspawn ' + pos[0] + ' 100 ' + pos[1])
      console.info('[STODD] world spawn moved to the nearest island at ' + pos[0] + ', ' + pos[1])
    } catch (e) { console.error('[STODD] spawn: ' + e) }
  })

  // /stodd spawn (operator): re-run the search (e.g. after changing the seed or island settings)
  S.resetSpawn = function (server) {
    let level = null
    try { level = server.overworld() } catch (e) { }
    if (level == null) return 'Overworld not available.'
    let sample = S.landSampler(level)
    if (sample == null) return 'No island noise on this world.'
    let pos = S.inlandSpawn(level, sample)
    if (pos == null) return 'No island found within ' + MAXR + ' blocks.'
    S.run(server, 'execute in minecraft:overworld run setworldspawn ' + pos[0] + ' 100 ' + pos[1])
    return 'World spawn set to ' + pos[0] + ', ' + pos[1]
  }
})()
