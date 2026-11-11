// Writes the Java mod's built-in world rules (src/main/resources/stodd_world.json) with the SAME function the scripts use at
// runtime (02_rules.js -> global.stoddWorldRules), from 00_config.js / 01_content.js, so the two can never disagree.
// usage: node gen_world_json.js <kubejs/server_scripts/stodd dir> <out.json>
const fs = require('fs'), path = require('path'), vm = require('vm')
const DIR = process.argv[2], OUT = process.argv[3]
global.global = global
for (const f of ['00_config.js', '01_content.js', '02_rules.js']) vm.runInThisContext(fs.readFileSync(path.join(DIR, f), 'utf8'), { filename: f })
const r = global.stoddWorldRules(global.stodd.cfg, null)
fs.writeFileSync(OUT, JSON.stringify(r, null, 1) + '\n')
console.log('wrote', OUT + ':', Object.keys(r.city.styles).map(k => k + ' ' + r.city.styles[k].templates.length).join(', '),
  '| isles', Object.keys(r.makeover.themes).join(' '), '| landmarks', Object.keys(r.makeover.landmarks).length, '| bands', r.bands.length)
