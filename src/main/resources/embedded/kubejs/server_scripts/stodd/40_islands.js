// priority: 500
// ISLANDS: every overworld island is assigned ONE power-system theme. Mobs from a power-system mod
// only spawn on islands of their theme. The island an (x,z) belongs to is found by climbing the
// world's own continentalness field (the same density function that shaped the terrain) up to the
// island's summit; the summit's position decides the theme, so a whole island shares one theme.
(function () {
  let S = global.stodd
  if (!S || !S.ready) { console.error('[STODD] 05_util.js failed to load - 40_islands.js disabled'); return }
  let C = S.cfg
  let SinglePointContext = null
  try { SinglePointContext = Java.loadClass('net.minecraft.world.level.levelgen.DensityFunction$SinglePointContext') } catch (e) { console.warn('[STODD] no SinglePointContext: ' + e) }

  // Only themes whose mod is installed are used (06_discover.js); 'wild' is always on.
  let THEMES = S.activeThemes || C.islandThemes
  // namespace -> theme id: the theme's own namespaces plus the ids of the mods that matched it
  let NS_THEME = {}
  THEMES.forEach(t => {
    t.namespaces.forEach(n => { NS_THEME[n] = t.id })
    ;(S.themeMods && S.themeMods[t.id] || []).forEach(n => { NS_THEME[n] = t.id })
  })
  let THEME = {}
  THEMES.forEach(t => { THEME[t.id] = t })
  S.themeOfNamespace = function (ns) { return NS_THEME[ns] || null }

  let ListTag = Java.loadClass('net.minecraft.nbt.ListTag')
  let StringTag = Java.loadClass('net.minecraft.nbt.StringTag')
  let MERGE = C.islandMergeRadius || 170, LINK = C.islandLinkRadius || 460, QUICK = 110
  let SCAN_STEP = C.islandScanStep || 48, SCAN_CELL = 512
  let cache = new Map()
  let cacheSeed = null

  // 32-bit integer multiply (Math.imul is not guaranteed in KubeJS's Rhino)
  function imul(a, b) {
    let ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0)
  }
  function hash3(a, b, seed) {
    let h = (imul(a | 0, 0x27d4eb2d) ^ imul(b | 0, 0x165667b1) ^ (seed | 0)) | 0
    h = imul(h ^ (h >>> 15), 0x85ebca6b)
    h = imul(h ^ (h >>> 13), 0xc2b2ae35)
    return (h ^ (h >>> 16)) >>> 0
  }
  // Themes with a `chance` (the cities and the dressed-up island themes) are decided first, from a hash of their own: one roll in
  // [0, 1) per island, and each special theme owns the next slice of that range (city 0.00-0.08, Neo City 0.08-0.13 ...), so
  // adding a theme at the END never moves the others and none of them reshuffles the ordinary themes.
  let ROLLED = THEMES.filter(t => !t.chance && !t.hidden)
  let SPECIAL = THEMES.filter(t => t.chance)
  let BANDS = []
  ;(function () {
    let acc = 0
    C.islandThemes.filter(t => t.chance).forEach(t => {
      let active = SPECIAL.indexOf(t) >= 0
      if (active) BANDS.push({ t: t, lo: acc, hi: acc + t.chance })
      acc += t.chance
    })
  })()
  S.themeById = function (id) { return THEME[id] || null }
  // 'city' kind themes are built by 49_city.js, 'dress' kind themes by 52_makeover.js
  function kindOf(t) { return t.id.indexOf('city') === 0 ? 'city' : 'dress' }
  S.themeKind = kindOf
  S.isCityTheme = function (t) { return t != null && t.id.indexOf('city') === 0 }
  function pickTheme(h) {
    let total = 0
    ROLLED.forEach(t => { total += t.weight })
    let r = h % total
    for (let i = 0; i < ROLLED.length; i++) { r -= ROLLED[i].weight; if (r < 0) return ROLLED[i] }
    return ROLLED[0]
  }
  S.hash3 = hash3
  // island name parts (00_config.js: islandNames / islandSyllables)
  let NAMES = C.islandNames
  let SYL = C.islandSyllables
  function islandName(theme, h) {
    let a = SYL[h % SYL.length], b = SYL[(h >>> 5) % SYL.length], c = (h >>> 10) % 3 === 0 ? SYL[(h >>> 13) % SYL.length] : ''
    let word = (a + b + c).charAt(0).toUpperCase() + (a + b + c).substring(1)
    let list = NAMES[theme.id] || NAMES.wild
    return word + ' ' + list[(h >>> 18) % list.length]
  }

  function sampler(level) {
    if (SinglePointContext == null) return null
    try {
      let fn = level.getChunkSource().randomState().router().continents()
      return function (x, z) { return fn.compute(new SinglePointContext(x | 0, 64, z | 0)) }
    } catch (e) { return null }
  }

  // Hill-climb the continentalness field from (x, z) to the top of whatever hill it is on, in steps that
  // halve from islandPeakStep down to 8 blocks.
  function climb(sample, x, z) {
    let step = C.islandPeakStep || 32
    let bx = x, bz = z, bv = sample(x, z)
    for (let iter = 0; iter < 200; iter++) {
      let moved = false
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        let v = sample(bx + dx * step, bz + dz * step)
        if (v > bv + 1e-5) { bv = v; bx += dx * step; bz += dz * step; moved = true }
      }
      if (!moved) { if (step <= 8) break; step = Math.floor(step / 2) }
    }
    return [bx, bz]
  }
  // true when the straight line between two points never dips below the shore (so both are on one island)
  function onLandLine(sample, ax, az, bx, bz) {
    let n = Math.max(6, Math.ceil(Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz)) / 24))
    for (let i = 1; i < n; i++) {
      let t = i / n
      if (sample(ax + (bx - ax) * t, az + (bz - az) * t) < C.islandLandThreshold) return false
    }
    return true
  }
  S.landSampler = sampler   // (level) -> function(x, z) = continentalness, or null

  // ---------------------------------------------------------------- island registry
  // The first time a hill-top is found it is recorded as THE centre of its island (saved in the world), so the island
  // keeps the same centre, name and theme forever, however it is reached afterwards. Centres are where the island's
  // waystone stands and what the Log Pose points at.
  let reg = null
  function regFor(level) {
    let seed = Number(level.getSeed() % 2147483647)
    if (reg != null && reg.seed === seed) return reg
    let r = { seed: seed, list: [], cells: new Map(), tag: null, scanned: new Set(), sky: [], skyScanned: new Set(), legacy: 0, legacy2: 0 }
    try {
      let pd = level.server.persistentData
      let raw = String(level.getSeed())
      let t = pd.contains('stodd_isles') ? pd.getCompound('stodd_isles') : null
      let fresh = false
      if (t == null || String(t.getString('seed')) !== raw) {
        fresh = true
        t = new S.J.CompoundTag()
        t.putString('seed', raw)
        t.put('list', new ListTag())
        pd.put('stodd_isles', t)
      }
      r.tag = t
      let lt = t.getList('list', 8)
      for (let i = 0; i < lt.size(); i++) {
        let m = /^(-?\d+),(-?\d+)$/.exec(String(lt.getString(i)))
        if (m) memAdd(r, Number(m[1]), Number(m[2]))
      }
      // Islands registered before the city update (a world that already had a registry) are never turned into cities, so a
      // base built on one is safe. A brand-new world has legacy = 0: every island may roll the city theme.
      if (!t.contains('legacy')) t.putInt('legacy', fresh ? 0 : lt.size())
      r.legacy = t.getInt('legacy')
      // Islands registered before 2.0 keep exactly the theme they had (one roll for the modern city, nothing else), so a base
      // built on one is never repainted. A brand-new world has legacy2 = 0: every island may roll any theme.
      if (!t.contains('legacy2')) t.putInt('legacy2', fresh ? 0 : lt.size())
      r.legacy2 = t.getInt('legacy2')
      if (!t.contains('sky')) t.put('sky', new ListTag())
      let st = t.getList('sky', 8)
      for (let i = 0; i < st.size(); i++) {
        let m = /^(-?\d+),(-?\d+),(\d+)$/.exec(String(st.getString(i)))
        if (m) skyMem(r, Number(m[1]), Number(m[2]), Number(m[3]))
      }
    } catch (e) { S.log('island registry: ' + e) }
    reg = r
    return r
  }
  function memAdd(r, x, z) {
    let e = { x: x, z: z, key: x + ',' + z, info: null, idx: r.list.length }
    r.list.push(e)
    let ck = (x >> 8) + ',' + (z >> 8)
    let a = r.cells.get(ck)
    if (a == null) { a = []; r.cells.set(ck, a) }
    a.push(e)
    return e
  }
  function regAdd(r, x, z) {
    let e = memAdd(r, x, z)
    try { if (r.tag != null) r.tag.getList('list', 8).add(StringTag.valueOf(x + ',' + z)) } catch (ex) { S.log('island registry save: ' + ex) }
    return e
  }
  function regNear(r, x, z, rad, pred) {
    let k = Math.ceil(rad / 256), cx0 = x >> 8, cz0 = z >> 8, best = null, bd = rad * rad
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
      let a = r.cells.get((cx0 + i) + ',' + (cz0 + j))
      if (a == null) continue
      for (let n = 0; n < a.length; n++) {
        let dx = a[n].x - x, dz = a[n].z - z, d = dx * dx + dz * dz
        if (d <= bd && (pred == null || pred(a[n]))) { bd = d; best = a[n] }
      }
    }
    return best
  }
  // The OLDEST registered centre within `rad` of (x, z), or null. If two threads ever registered the same island at
  // once (chunk-generation spawns run off the main thread), everybody still agrees on the older entry.
  function regFirst(r, x, z, rad) {
    let k = Math.ceil(rad / 256), cx0 = x >> 8, cz0 = z >> 8, best = null
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
      let a = r.cells.get((cx0 + i) + ',' + (cz0 + j))
      if (a == null) continue
      for (let n = 0; n < a.length; n++) {
        let dx = a[n].x - x, dz = a[n].z - z
        if (dx * dx + dz * dz <= rad * rad && (best == null || a[n].idx < best.idx)) best = a[n]
      }
    }
    return best
  }
  // The registered island that (x, z) is on (registering it if it is new). Assumes (x, z) is land.
  function canonical(level, sample, x, z) {
    let r = regFor(level)
    let e = regFirst(r, x, z, QUICK)
    if (e != null) return e
    // the Java side gives every island one centre, whatever point of it is asked (and the same one the generator builds on)
    let pk = null
    if (S.API != null) {
      try { let c = S.API.centre(level, x | 0, z | 0); if (c != null) pk = [Number(c[0]), Number(c[1])] } catch (ex) { }
    }
    if (pk == null) pk = climb(sample, x, z)
    e = regFirst(r, pk[0], pk[1], MERGE)
    if (e != null) return e
    e = regNear(r, pk[0], pk[1], LINK, o => onLandLine(sample, pk[0], pk[1], o.x, o.z))
    if (e != null) return e
    return regAdd(r, pk[0], pk[1])
  }
  // { theme, ocean, label, peakX, peakZ, key } for a registered island (memoised on the entry)
  function infoOf(r, e) {
    if (e.info != null) return e.info
    let th = pickTheme(hash3(e.x, e.z, r.seed))
    let roll = (hash3(e.x - 31337, e.z + 4177, r.seed ^ 0x2c1b3c6d) % 10000) / 10000
    let dist = Math.sqrt(e.x * e.x + e.z * e.z)
    if (e.idx < r.legacy2) {
      // registered under 1.3.0 or earlier: the old rule, unchanged (one in eight was the modern city)
      let city = THEME.city
      if (city && e.idx >= r.legacy && C.city && C.city.enabled && dist >= (city.minOriginDistance || (C.city && C.city.minOriginDistance) || 0) && roll < 0.125) th = city
    } else {
      for (let i = 0; i < BANDS.length; i++) {
        let b = BANDS[i]
        if (roll < b.lo || roll >= b.hi) continue
        let t = b.t, kind = kindOf(t)
        let on = kind === 'city' ? !!(C.city && C.city.enabled && C.city.styles && C.city.styles[t.id]) : !!(C.makeover && C.makeover.enabled && C.makeover.themes && C.makeover.themes[t.id])
        let far = dist >= (t.minOriginDistance != null ? t.minOriginDistance : ((C.city && C.city.minOriginDistance) || 0))
        if (on && far) th = t
        break
      }
    }
    let hn = hash3(e.x + 7919, e.z - 104729, r.seed ^ 0x5bd1e995)
    e.info = { theme: th, ocean: false, label: islandName(th, hn) + ' (' + th.name + ')', peakX: e.x, peakZ: e.z, key: e.key }
    return e.info
  }
  S.islandInfo = function (level, e) { return e.sky ? S.skyInfo(level, e) : infoOf(regFor(level), e) }

  // Returns { theme, ocean, label, peakX, peakZ, key } or null outside the overworld.
  S.islandAt = function (level, x, z) {
    if (String(level.dimension).indexOf('minecraft:overworld') < 0) return null
    let seed = Number(level.getSeed() % 2147483647)
    if (cacheSeed !== seed) { cache.clear(); cacheSeed = seed }
    let cx = x >> 4, cz = z >> 4
    let key = cx + ',' + cz
    if (cache.has(key)) return cache.get(key)
    if (cache.size > 60000) cache.clear()
    let sample = sampler(level)
    let result
    if (sample == null) {
      // No noise router (flat / custom generator): fall back to a coarse grid of themed regions
      let h = hash3(Math.floor(x / C.islandThemeCell), Math.floor(z / C.islandThemeCell), seed)
      let th = pickTheme(h)
      result = { theme: th, ocean: false, label: th.name + ' Region', peakX: x, peakZ: z, key: 'r' + Math.floor(x / C.islandThemeCell) + ',' + Math.floor(z / C.islandThemeCell) }
    } else {
      let cxm = (cx << 4) + 8, czm = (cz << 4) + 8
      if (sample(cxm, czm) < C.islandLandThreshold) {
        let th = THEME[C.oceanTheme] || ROLLED[ROLLED.length - 1]
        result = { theme: th, ocean: true, label: 'Open Sea', peakX: cxm, peakZ: czm, key: 'sea' }
      } else {
        let r = regFor(level)
        result = infoOf(r, canonical(level, sample, cxm, czm))
      }
    }
    cache.set(key, result)
    return result
  }

  // ---------------------------------------------------------------- floating sky islands
  // They are part of the world's own density function (data/stodd/worldgen, see the README); this only FINDS them, by
  // asking the world's final density function whether the probe plane (just under the island plane) is solid there.
  // Found islands are saved next to the ground islands, so each keeps its centre, name, waystone and Log Pose entry.
  let SKY = C.sky || {}
  let SKY_MIN_Y = SKY.minY || 140
  let SKY_THEME = { id: 'sky', name: 'Sky', color: 'aqua', weight: 0, namespaces: [] }
  function skyProbe(level) {
    if (SinglePointContext == null || !SKY.enabled) return null
    try {
      let fd = level.getChunkSource().randomState().router().finalDensity()
      let y = SKY.probeY || 227
      return function (x, z) { return fd.compute(new SinglePointContext(x | 0, y, z | 0)) }
    } catch (e) { return null }
  }
  S.skyProbe = skyProbe
  function skyMem(r, x, z, rad) {
    let e = { x: x, z: z, rad: rad, sky: true, key: 'sky:' + x + ',' + z, info: null, idx: r.sky.length }
    r.sky.push(e)
    return e
  }
  function skyAdd(r, x, z, rad) {
    let e = skyMem(r, x, z, rad)
    try { if (r.tag != null) r.tag.getList('sky', 8).add(StringTag.valueOf(x + ',' + z + ',' + rad)) } catch (ex) { S.log('sky registry save: ' + ex) }
    return e
  }
  // Centre and radius of the island that contains the solid point (x, z): march out along the four axes, re-centre, repeat.
  function skyExtent(probe, x, z) {
    let cx = x, cz = z
    if (!(probe(cx, cz) > 0)) {
      let found = false
      for (let d = 16; d <= 48 && !found; d += 16) {
        for (let a = 0; a < 8 && !found; a++) {
          let px = Math.round(x + d * Math.cos(a * Math.PI / 4)), pz = Math.round(z + d * Math.sin(a * Math.PI / 4))
          if (probe(px, pz) > 0) { cx = px; cz = pz; found = true }
        }
      }
      if (!found) return null
    }
    let rad = 0
    let dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (let pass = 0; pass < 3; pass++) {
      let e = [0, 0, 0, 0]
      for (let k = 0; k < 4; k++) {
        let d = 0
        while (d < 560 && probe(cx + dirs[k][0] * (d + 12), cz + dirs[k][1] * (d + 12)) > 0) d += 12
        e[k] = d
      }
      cx = Math.round(cx + (e[0] - e[1]) / 2)
      cz = Math.round(cz + (e[2] - e[3]) / 2)
      rad = (e[0] + e[1] + e[2] + e[3]) / 4
    }
    return { x: cx, z: cz, rad: Math.round(rad) }
  }
  function skyNearest(r, x, z, rad) {
    let best = null, bd = rad * rad
    for (let i = 0; i < r.sky.length; i++) {
      let e = r.sky[i], dx = e.x - x, dz = e.z - z, d = dx * dx + dz * dz
      if (d <= bd) { bd = d; best = e }
    }
    return best
  }
  // An island seen again from the next map cell has (nearly) the same centre; big islands drift further between two views.
  function skySame(r, x, z, rad) {
    for (let i = 0; i < r.sky.length; i++) {
      let e = r.sky[i], dx = e.x - x, dz = e.z - z
      let lim = Math.max(120, 0.6 * Math.max(rad, e.rad))
      if (dx * dx + dz * dz <= lim * lim) return e
    }
    return null
  }
  // One 512 x 512 cell (plus a margin, so islands on a border are seen from both sides): every cluster of solid probe
  // points is an island. Islands smaller than minRadius are floating rocks and do not count.
  function scanSkyCell(level, probe, r, ix, iz) {
    r.skyScanned.add(ix + ',' + iz)
    let step = SKY.scanStep || 64
    let x0 = ix * SCAN_CELL - 160, z0 = iz * SCAN_CELL - 160
    let n = Math.floor((SCAN_CELL + 320) / step) + 1
    let hit = []
    for (let i = 0; i < n; i++) {
      let row = []
      for (let j = 0; j < n; j++) row.push(probe(x0 + i * step, z0 + j * step) > 0)
      hit.push(row)
    }
    let seen = []
    for (let i = 0; i < n; i++) { let row = []; for (let j = 0; j < n; j++) row.push(false); seen.push(row) }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (!hit[i][j] || seen[i][j]) continue
      let stack = [[i, j]], sx = 0, sz = 0, cnt = 0
      seen[i][j] = true
      while (stack.length > 0) {
        let c = stack.pop()
        sx += c[0]; sz += c[1]; cnt++
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          let ii = c[0] + a, jj = c[1] + b
          if (ii < 0 || jj < 0 || ii >= n || jj >= n || seen[ii][jj] || !hit[ii][jj]) continue
          seen[ii][jj] = true
          stack.push([ii, jj])
        }
      }
      let mx = Math.round(x0 + sx / cnt * step), mz = Math.round(z0 + sz / cnt * step)
      let ext = null
      if (S.API != null) {
        try { let sk = S.API.skyIsland(level, mx, mz); if (sk != null) ext = { x: Number(sk[0]), z: Number(sk[1]), rad: Number(sk[2]) } } catch (ex) { }
      }
      if (ext == null) ext = skyExtent(probe, mx, mz)
      if (ext == null || ext.rad < (SKY.minRadius || 48)) continue
      if (skySame(r, ext.x, ext.z, ext.rad) != null) continue
      skyAdd(r, ext.x, ext.z, ext.rad)
    }
  }
  S.skyInfo = function (level, e) {
    if (e.info != null) return e.info
    let r = regFor(level)
    let hn = hash3(e.x + 5, e.z - 9, r.seed ^ 0x1f3d5b79)
    e.info = { theme: SKY_THEME, ocean: false, label: islandName(SKY_THEME, hn) + ' (Sky)', peakX: e.x, peakZ: e.z, key: e.key, sky: true, rad: e.rad }
    return e.info
  }
  // The sky island over (x, z) for a player / mob at height y, or null. Scans the 512-block cell the first time.
  S.skyIslandHere = function (level, x, y, z) {
    if (!SKY.enabled || y < SKY_MIN_Y) return null
    if (String(level.dimension).indexOf('minecraft:overworld') < 0) return null
    let probe = skyProbe(level)
    if (probe == null) return null
    let r = regFor(level)
    let ix = Math.floor(x / SCAN_CELL), iz = Math.floor(z / SCAN_CELL)
    if (!r.skyScanned.has(ix + ',' + iz)) scanSkyCell(level, probe, r, ix, iz)
    let best = null, bd = 1e18
    for (let i = 0; i < r.sky.length; i++) {
      let e = r.sky[i], dx = e.x - x, dz = e.z - z, d = dx * dx + dz * dz
      if (d < bd && d <= (e.rad + 12) * (e.rad + 12)) { bd = d; best = e }
    }
    return best
  }
  // What a player at (x, y, z) is standing on: the sky island overhead if they are up there, else the island below.
  S.islandOrSkyAt = function (level, x, y, z) {
    let sk = S.skyIslandHere(level, x, y, z)
    if (sk != null) return S.skyInfo(level, sk)
    return S.islandAt(level, Math.floor(x), Math.floor(z))
  }

  // ---------------------------------------------------------------- finding islands that nobody has visited yet
  // Looks at one 512 x 512 block cell (plus a margin): every local maximum of the field above the shore is an island.
  function scanCell(level, sample, r, ix, iz) {
    r.scanned.add(ix + ',' + iz)
    let thr = C.islandLandThreshold + 0.03
    let x0 = ix * SCAN_CELL - 128, z0 = iz * SCAN_CELL - 128
    let n = Math.floor((SCAN_CELL + 256) / SCAN_STEP) + 1
    let v = []
    for (let i = 0; i < n; i++) {
      let row = []
      for (let j = 0; j < n; j++) row.push(sample(x0 + i * SCAN_STEP, z0 + j * SCAN_STEP))
      v.push(row)
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let c = v[i][j]
      if (c < thr) continue
      let top = true
      for (let a = -1; a <= 1 && top; a++) for (let b = -1; b <= 1; b++) {
        if (a === 0 && b === 0) continue
        let ii = i + a, jj = j + b
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue
        let o = v[ii][jj]
        if (o > c || (o === c && (a < 0 || (a === 0 && b < 0)))) { top = false; break }
      }
      if (!top) continue
      let px = x0 + i * SCAN_STEP, pz = z0 + j * SCAN_STEP
      if (regNear(r, px, pz, 150) != null) continue
      canonical(level, sample, px, pz)
    }
  }
  // Islands (registered centres) within R blocks of (x, z), nearest first, as [{ e, d }]. Map cells that were never
  // looked at are scanned, up to `budget` per call; `complete` says whether every cell within R has been scanned.
  S.islandsNear = function (level, x, z, R, budget, withSky) {
    let sample = sampler(level)
    if (sample == null || String(level.dimension).indexOf('minecraft:overworld') < 0) return { list: [], complete: true }
    let r = regFor(level)
    let i0 = Math.floor((x - R) / SCAN_CELL), i1 = Math.floor((x + R) / SCAN_CELL)
    let j0 = Math.floor((z - R) / SCAN_CELL), j1 = Math.floor((z + R) / SCAN_CELL)
    let todo = []
    let probe = withSky ? skyProbe(level) : null
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (r.scanned.has(i + ',' + j) && (probe == null || r.skyScanned.has(i + ',' + j))) continue
      let dx = (i + 0.5) * SCAN_CELL - x, dz = (j + 0.5) * SCAN_CELL - z
      todo.push([i, j, dx * dx + dz * dz])
    }
    todo.sort((p, q) => p[2] - q[2])
    let n = Math.min(budget == null ? 4 : budget, todo.length)
    for (let k = 0; k < n; k++) {
      if (!r.scanned.has(todo[k][0] + ',' + todo[k][1])) scanCell(level, sample, r, todo[k][0], todo[k][1])
      if (probe != null && !r.skyScanned.has(todo[k][0] + ',' + todo[k][1])) scanSkyCell(level, probe, r, todo[k][0], todo[k][1])
    }
    let out = []
    for (let k = 0; k < r.list.length; k++) {
      let e = r.list[k], dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz)
      if (d <= R) out.push({ e: e, d: d })
    }
    if (withSky) {
      for (let k = 0; k < r.sky.length; k++) {
        let e = r.sky[k], dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz)
        if (d <= R) out.push({ e: e, d: d })
      }
    }
    out.sort((p, q) => p.d - q.d)
    return { list: out, complete: todo.length <= n }
  }

  S.allowedAt = function (level, x, z, ns, y) {
    let need = NS_THEME[ns]
    if (need == null) return true
    // nothing themed spawns on a sky island
    if (y != null && y >= SKY_MIN_Y && S.skyIslandHere(level, Math.floor(x), y, Math.floor(z)) != null) return false
    let isl = S.islandAt(level, Math.floor(x), Math.floor(z))
    if (isl == null) return true
    if (isl.theme.id === need) return true
    // a theme may host another theme's mobs (the city hosts Night City's)
    return !!(isl.theme.hosts && isl.theme.hosts.indexOf(need) >= 0)
  }

  // Natural / structure / spawner spawns (forwarded MobSpawnEvent.FinalizeSpawn)
  let GATED = { NATURAL: 1, CHUNK_GENERATION: 1, STRUCTURE: 1, SPAWNER: 1, PATROL: 1, EVENT: 1, REINFORCEMENT: 1, JOCKEY: 1 }
  global.stoddFinalizeSpawn = function (event) {
    let type = String(event.getSpawnType())
    let entity = event.getEntity()
    if (type === 'SPAWNER') entity.getPersistentData().putBoolean('stodd_spawner', true)
    if (!GATED[type]) { entity.getPersistentData().putBoolean('stodd_ok', true); return }
    let ns = S.ns(S.typeId(entity))
    if (NS_THEME[ns] == null) return
    let level = event.getLevel().getLevel()
    if (!S.allowedAt(level, event.getX(), event.getZ(), ns, event.getY())) event.setSpawnCancelled(true)
    else entity.getPersistentData().putBoolean('stodd_ok', true)
  }

  // Fallback for mods with their own spawn loops (MCreator style): check new hostile themed mobs once.
  EntityEvents.spawned(event => {
    if (!C.cullOnJoin) return
    let e = event.entity
    if (e == null || !e.isLiving() || e.isPlayer()) return
    let ns = S.ns(S.typeId(e))
    if (NS_THEME[ns] == null) return
    let pd = e.getPersistentData()
    if (pd.getBoolean('stodd_ok')) return
    event.server.scheduleInTicks(2, () => {
      try {
        if (!e.isAlive()) return
        pd.putBoolean('stodd_ok', true)
        let cat = ''
        try { cat = String(S.typeObj(e).getCategory()) } catch (x) { }
        if (cat !== 'MONSTER' && cat !== 'monster') return
        if (e.hasCustomName()) return
        try { if (e.isPersistenceRequired()) return } catch (x) { }
        try { if (e.getOwner && e.getOwner() != null) return } catch (x) { }
        let nbt = e.getNbt ? e.getNbt() : null
        if (nbt != null && (nbt.contains('Owner') || nbt.contains('OwnerUUID') || nbt.contains('owner'))) return
        if (!S.allowedAt(e.level, e.x, e.z, ns, e.y)) e.discard()
      } catch (x) { S.log('cull ' + x) }
    })
  })

  // Tell players which island they are on when it changes.
  let lastIsland = new Map()
  PlayerEvents.tick(event => {
    let p = event.player
    if (p.age % 40 !== 13) return
    let isl = S.islandOrSkyAt(p.level, p.x, p.y, p.z)
    let key = isl == null ? 'none' : (isl.ocean ? 'sea' : (isl.sky ? isl.key : isl.peakX + ',' + isl.peakZ))
    let id = S.uuidOf(p)
    if (lastIsland.get(id) === key) return
    lastIsland.set(id, key)
    if (isl == null || isl.ocean) return
    S.run(p.server, 'title ' + p.username + ' actionbar {"text":"Now entering ' + isl.label.replace(/"/g, '') + '","color":"' + isl.theme.color + '"}')
  })

  // ---------------------------------------------------------------- the Java side
  // Hand it the live rules (02_rules.js) once the installed themes are known, so the generator and the scripts agree.
  if (S.API != null && global.stoddWorldRules) {
    try {
      let err = S.API.configure(JSON.stringify(global.stoddWorldRules(C, THEMES.map(t => t.id))))
      if (err != null) console.warn('[STODD] the Java side refused the world rules (it keeps its built-in copy): ' + err)
      else console.info('[STODD] world rules handed to STODD Core (Java)')
    } catch (e) { console.warn('[STODD] could not hand the world rules to the Java side: ' + e) }
  }
})()
