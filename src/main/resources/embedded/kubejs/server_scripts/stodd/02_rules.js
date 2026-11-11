// priority: 980
// WORLD RULES FOR THE JAVA SIDE. STODD Core 3 generates the islands' cities, dressed islands and sky-island dressing as real
// world-generation structures, and drives the Log Pose, in Java. This turns the settings in 00_config.js / 01_content.js into
// the one object the Java code reads, so the scripts and the generator always agree on which island is what.
//   * The jar carries a copy made at build time (stodd_world.json, by tools/gen_world_json.js calling this same function).
//   * 49_city.js hands the live copy to Java when the server loads (StoddApi.configure), so an edit here reaches the generator
//     after a restart. Chunks that already exist keep what they were generated with.
(function () {
  function num(v, d) { return v == null ? d : v }
  // a regular expression for Java: its source and whether it ignores case (Rhino has no RegExp.flags)
  function re(r) { return r == null ? null : { src: String(r.source), i: !!r.ignoreCase } }
  global.stoddWorldRules = function (C, activeIds) {
    let cc = C.city || {}
    let mc = C.makeover || {}
    let active = {}
    ;(activeIds || C.islandThemes.map(t => t.id)).forEach(id => { active[id] = true })
    let themes = C.islandThemes.map(t => ({
      id: t.id, name: t.name, color: t.color || 'white', weight: t.weight || 0, chance: t.chance || 0, hidden: !!t.hidden,
      active: !!active[t.id] || !!t.chance, minOriginDistance: t.minOriginDistance == null ? null : t.minOriginDistance
    }))
    // the same bands as 40_islands.js: every special theme owns the next slice of one roll per island
    let bands = []
    let acc = 0
    C.islandThemes.filter(t => t.chance).forEach(t => {
      let isCity = t.id.indexOf('city') === 0
      let on = isCity ? !!(cc.enabled && cc.styles && cc.styles[t.id]) : !!(mc.enabled && mc.themes && mc.themes[t.id])
      bands.push({ id: t.id, lo: acc, hi: acc + t.chance, minOriginDistance: t.minOriginDistance == null ? null : t.minOriginDistance, on: on })
      acc += t.chance
    })
    let styles = {}
    Object.keys(cc.styles || {}).forEach(id => {
      let st = cc.styles[id]
      styles[id] = {
        plazas: st.plazas || (st.plaza ? [st.plaza] : []), plazaHeights: st.plazaHeights || {}, plazaHeight: st.plazaHeight || 8,
        foundation: st.foundation || 'minecraft:stone_bricks', biome: st.biome || 'stodd:metropolis',
        templates: (st.templates || []).map(t => ({ id: t.id, kind: t.kind, weight: t.weight, height: t.height })),
        zones: (st.zones || []).map(z => ({ upTo: z.upTo, kind: z.kind }))
      }
    })
    let isles = {}
    Object.keys(mc.themes || {}).forEach(id => {
      let t = mc.themes[id]
      let cen = t.center || {}
      isles[id] = {
        biome: t.biome || null, foundation: t.foundation || 'minecraft:stone_bricks', density: num(t.density, 1),
        paint: (t.paint || []).map(r => [r[0], r[1]]),
        center: (cen.ids && cen.ids.length ? cen.ids : (cen.id ? [cen.id] : [])), centerRot: cen.rot == null ? -1 : cen.rot,
        scatter: (t.scatter || []).map(s => ({ id: s.id, weight: s.weight || 1 }))
      }
    })
    let landmarks = {}
    Object.keys(mc.landmarks || {}).forEach(id => {
      let l = mc.landmarks[id]
      landmarks[id] = { size: l.size, foot: l.foot == null ? 3 : l.foot }
    })
    let sk = mc.sky || {}
    let sky = C.sky || {}
    let lp = C.logPose || {}
    return {
      version: 3,
      landThreshold: C.islandLandThreshold,
      peakStep: C.islandPeakStep || 32,
      oceanTheme: C.oceanTheme || 'one_piece',
      themes: themes,
      bands: bands,
      names: C.islandNames || {},
      syllables: C.islandSyllables || [],
      city: {
        enabled: cc.enabled !== false, minOriginDistance: cc.minOriginDistance || 0, cell: cc.cell || 48, radius: cc.radius || 300,
        landMargin: num(cc.landMargin, 0.04), baseMin: cc.baseMin || 66, baseMax: cc.baseMax || 78, sampleStep: cc.sampleStep || 28,
        foundationMax: cc.foundationMax || 40, floorMin: num(cc.floorMin, -58), cutCap: cc.cutCap || 148,
        biomeBelow: num(cc.biomeBelow, 8), biomeAbove: num(cc.biomeAbove, 104), styles: styles
      },
      makeover: {
        enabled: mc.enabled !== false, cell: mc.cell || 48, radius: mc.radius || 330, landMargin: num(mc.landMargin, 0.06),
        cutCap: mc.cutCap || 148, biomeBelow: num(mc.biomeBelow, 12), biomeAbove: num(mc.biomeAbove, 60),
        landmarkDensity: num(mc.landmarkDensity, 0.15), maxLandmarks: mc.maxLandmarks || 40, foundationMax: mc.foundationMax || 14,
        themes: isles, landmarks: landmarks,
        sky: {
          enabled: !!(sky.enabled && sk.biome), biome: sk.biome || 'stodd:sky_meadow', biomeLow: sk.biomeLow || 146, biomeHigh: sk.biomeHigh || 262,
          perCell: num(sk.perCell, 5), density: num(sk.density, 0.9), foundation: sk.foundation || 'minecraft:stone',
          styles: (sk.styles || []).map(s => ({ name: s.name, features: (s.features || []).map(f => [f[0], f[1]]) })),
          scatter: (sk.scatter || []).map(s => ({ id: s.id, weight: s.weight || 1 }))
        }
      },
      origins: {
        list: C.origins || [], names: C.originNames || {}, rules: C.rules || {}, systemNames: C.systemNames || {},
        detect: {
          fruit: C.detect && C.detect.fruit ? { names: re(C.detect.fruit.names), ids: re(C.detect.fruit.ids), items: re(C.detect.fruit.items) } : null,
          magic: C.detect && C.detect.magic ? { names: re(C.detect.magic.names), ids: re(C.detect.magic.ids), items: re(C.detect.magic.items), blocks: re(C.detect.magic.blocks) } : null
        },
        sorcery: {
          items: C.sorceryItems || [], namespaces: re(C.sorceryNamespaces), bookId: re(C.sorceryBookIdPattern),
          bookName: re(C.sorceryBookNamePattern), itemPattern: re(C.sorceryItemPattern)
        },
        ripperdocBlocks: C.ripperdocBlocks || [], ripperdocEntity: re(C.ripperdocEntityPattern),
        slotIds: C.slotIds || [], slots: C.slots || {}, slotsByMilestone: C.slotsByMilestone || {}, slotMilestoneEvery: C.slotMilestoneEvery || 5,
        cyberCapacity: C.cyberCapacity || {}, cyberCapacityCommands: C.cyberCapacityCommands || [],
        jjcVariablesClass: C.jjcVariablesClass || null
      },
      sky: { enabled: !!sky.enabled, minY: sky.minY || 200, probeY: sky.probeY || 227, scanStep: sky.scanStep || 64, minRadius: sky.minRadius || 48 },
      logPose: {
        dwellTicks: lp.dwellTicks || 600, centerTicks: lp.centerTicks || 60, centerRadius: lp.centerRadius || 40, arriveRadius: lp.arriveRadius || 24,
        giveOnFirstJoin: lp.giveOnFirstJoin !== false, maxRecorded: lp.maxRecorded || 96, searchRadii: lp.searchRadii || [800, 1500, 3000, 5000],
        skyMinY: lp.skyMinY || 200,
        modes: (lp.modes || []).map(m => ({ id: m.id, name: m.name, kind: m.kind, themes: m.themes || [] }))
      }
    }
  }
})()
