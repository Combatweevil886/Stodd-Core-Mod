// Rhino-compat lint for the KubeJS scripts: strips comments/strings/regex literals, then flags syntax this pack avoids.
const fs = require('fs'), path = require('path')
const dir = process.argv[2]
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)).concat(process.argv.slice(3))
let bad = 0
function strip(src) {
  let out = '', i = 0, n = src.length
  let prevSig = ''
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++ } i += 2; continue }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++ } i++; out += '""'; prevSig = '"'; continue }
    if (c === '`') { out += '`'; i++; while (i < n && src[i] !== '`') { if (src[i] === '\\') i++; i++ } i++; prevSig = '"'; continue }
    if (c === '/' && !/[\w)\]"]/.test(prevSig)) { // regex literal
      i++; let cls = false
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++ }
      i++; while (/[a-z]/.test(src[i] || '')) i++
      out += 'R'; prevSig = 'R'; continue
    }
    out += c
    if (!/\s/.test(c)) prevSig = c
    i++
  }
  return out
}
const RULES = [
  [/\?\./, 'optional chaining ?.'],
  [/\?\?/, 'nullish ??'],
  [/\.\.\.[\w(\[]/, 'spread/rest ...'],
  [/`/, 'template literal'],
  [/\bclass\s+\w+/, 'class'],
  [/\basync\b|\bawait\b|\byield\b|function\s*\*/, 'async/generator'],
  [/\*\*/, 'exponent **'],
  [/\b(let|const|var)\s*[\[{]/, 'destructuring'],
  [/\bfor\s*\(\s*(let|const|var)\s+[\w$]+\s+of\b/, 'for-of'],
  [/\.(flat|flatMap|at|replaceAll|padStart|padEnd|fromEntries|entries|values|includes|startsWith|endsWith|trimStart|trimEnd)\(/, 'ES2017+ method (check)'],
  [/\bObject\.(entries|values|fromEntries|assign)\b/, 'Object.* ES2017+'],
  [/\bArray\.from\b/, 'Array.from'],
  [/\.fill\(/, 'Array.fill'],
  [/Math\.(imul|trunc|sign|hypot|cbrt|log2|log10)\b/, 'Math.* ES6'],
  [/=>\s*\{\s*\}/, 'empty arrow (fine)'],
]
const ALLOW = [/ES2017\+ method/, /empty arrow/]
for (const f of files) {
  const src = strip(fs.readFileSync(f, 'utf8'))
  const lines = src.split('\n')
  lines.forEach((ln, idx) => {
    for (const [re, why] of RULES) {
      if (re.test(ln)) {
        if (ALLOW.some(a => a.test(why)) && !/\.(flat|flatMap|at|replaceAll|padStart|padEnd|fromEntries|entries|values|startsWith|endsWith)\(/.test(ln)) continue
        console.log(path.basename(f) + ':' + (idx + 1) + ': ' + why + '  | ' + ln.trim().slice(0, 100)); bad++
      }
    }
  })
  // shorthand properties / default params: walk braces
  const stack = []
  let line = 1
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\n') line++
    if (c === '{' || c === '(' || c === '[') stack.push(c)
    else if (c === '}' || c === ')' || c === ']') stack.pop()
    if (stack[stack.length - 1] === '{') {
      const m = /^[\s]*([A-Za-z_$][\w$]*)\s*(?=[,}])/.exec(src.slice(i + 1, i + 80))
      if ((c === '{' || c === ',') && m && !/^(let|var|const|return|break|continue|else|new|typeof|void|delete|this|true|false|null|undefined)$/.test(m[1])) {
        // inside an object literal, "{ a, b }" is shorthand; in a block this cannot occur except "let a, b" (previous char is not { or ,)
        const before = src.slice(Math.max(0, i - 60), i).replace(/\s+$/, '')
        if (!/\b(let|var|const)\s+[\w$,\s=\d.'"]*$/.test(before + c)) { console.log(path.basename(f) + ':' + line + ': possible shorthand property "' + m[1] + '"'); bad++ }
      }
    }
  }
}
console.log(bad === 0 ? 'LINT CLEAN (' + files.length + ' files)' : bad + ' lint findings')
process.exit(bad === 0 ? 0 : 1)
