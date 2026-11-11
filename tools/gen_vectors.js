// Reference values from the real scripts, for the Java tests (GenTest): hash3, the script seed and the theme each island centre gets.
// usage: node gen_vectors.js <stodd scripts dir> <out.json>
const fs = require('fs'), path = require('path')
process.argv[2] = process.argv[2]
const H = require('./harness.js')
const DIR = process.argv[2], OUT = process.argv[3]
const W = H.mkWorld({ ground: [{ x: 0, z: 0, r: 150 }], sky: [] })
const B = H.boot(W)
const S = B.S
const out = { hash: [], seed: [], themes: [] }
let st = 12345
function rnd() { st = (st * 1103515245 + 12345) & 0x7fffffff; return st }
for (let n = 0; n < 400; n++) {
  const a = (rnd() % 400000) - 200000, b = (rnd() % 400000) - 200000, s = (rnd() % 2147483647) * (n % 2 ? -1 : 1)
  out.hash.push([a, b, s, S.hash3(a, b, s)])
}
;['987654321', '-4172144997902289642', '8106281632925128379', '1', '-1', '2147483647', '9223372036854775807', '-9223372036854775808', '123456789012345678'].forEach(sd => {
  out.seed.push([sd, Number(Number(BigInt(sd)) % 2147483647) | 0])
})
// themes: islands registered fresh (legacy = 0) at chosen centres; the scripts' rule decides the theme
const seedJ = Number(W.level.getSeed() % 2147483647)
const isl = S.islandAt   // ensures the registry exists
S.islandAt(W.level, 0, 0)
const r = W.server.persistentData.getCompound('stodd_isles')
for (let n = 0; n < 3000; n++) {
  const x = ((rnd() % 600) - 300) * 48 + 24, z = ((rnd() % 600) - 300) * 48 + 24
  const e = { x: x, z: z, key: x + ',' + z, info: null, idx: 1e9 }
  const info = S.islandInfo(W.level, e)
  out.themes.push([x, z, info.theme.id])
}
out.themeSeed = seedJ
fs.writeFileSync(OUT, JSON.stringify(out))
console.log('vectors', out.hash.length, out.seed.length, out.themes.length, 'seed', seedJ)
