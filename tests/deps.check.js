/**
 * 静态依赖检查：
 * 1. 所有 require('./x') 路径必须存在
 * 2. 解构 require 必须能拿到对应具名导出（导出解析走轻量正则，覆盖本项目写法）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKIP = ['node_modules', '.workbuddy']

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.includes(name)) continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

const files = walk(ROOT)

/** 抽取一个文件模块级导出的名字 */
function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8')
  const names = new Set()
  // module.exports = { a, b: c }
  const reObj = /module\.exports\s*=\s*\{([^{}]*)\}/g
  let m
  while ((m = reObj.exec(src))) {
    for (const part of m[1].split(',')) pushKey(part, names)
  }
  // exports.foo =
  const reDot = /exports\.([A-Za-z_$][\w$]*)\s*=/g
  while ((m = reDot.exec(src))) names.add(m[1])
  // module.exports = class X / function X
  const reDirect = /module\.exports\s*=\s*(?:class|function)\s+([A-Za-z_$][\w$]*)/g
  while ((m = reDirect.exec(src))) names.add(m[1])
  // module.exports.default
  const reDefault = /module\.exports\.default\s*=/g
  if (reDefault.test(src)) names.add('default')
  return names
}

function pushKey(raw, names) {
  const s = raw.trim()
  if (!s) return
  const mm = /^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))/.exec(s)
  if (mm) names.add(mm[1] || mm[2] || mm[3])
}

let errors = 0
let checked = 0

for (const file of files) {
  if (file === __filename) continue // 本文件内含示例 require('./x')，跳过自身
  const src = fs.readFileSync(file, 'utf8')
  const re = /require\(['"](\.[^'"]+)['"]\)/g
  let m
  while ((m = re.exec(src))) {
    let target = path.resolve(path.dirname(file), m[1])
    if (!fs.existsSync(target)) target += '.js'
    if (!fs.existsSync(target)) {
      console.error(`✗ [缺失依赖] ${path.relative(ROOT, file)} -> ${m[1]}`)
      errors++
      continue
    }
    checked++
    // 具名解构检查
    const beforeSrc = src.slice(Math.max(0, m.index - 120), m.index)
    const dm = /const\s*\{([^}]*)\}\s*=\s*$/.exec(beforeSrc.replace(/\n/g, ' '))
    if (dm) {
      const wanted = dm[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      const avail = exportsOf(target)
      for (const w of wanted) {
        if (!avail.has(w)) {
          console.error(
            `✗ [导出缺失] ${path.relative(ROOT, file)} 从 ${path.relative(ROOT, target)} 取 ${w}，实际导出: [${[...avail].join(', ')}]`
          )
          errors++
        }
      }
    }
  }
}

console.log(`\n依赖图检查：${files.length} 个文件，${checked} 条 require`)
if (errors) {
  console.error(`❌ 发现 ${errors} 个问题`)
  process.exit(1)
} else {
  console.log('✅ 全部 require 路径与具名导出匹配')
}
