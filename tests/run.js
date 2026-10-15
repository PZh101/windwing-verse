/**
 * 极简测试运行器：node tests/run.js
 * 无第三方依赖，输出 TAP 风格结果。
 */

const files = [
  './rng.test.js',
  './platform.test.js',
  './spawner.test.js',
  './collision.test.js',
  './speed.test.js',
  './spell.test.js',
  './scoring.test.js',
  './poems.test.js',
]

let passed = 0
let failed = 0
const failures = []

for (const f of files) {
  const suite = require(f)
  const entries = Object.entries(suite)
  console.log(`\n# ${f} (${entries.length} tests)`)
  for (const [name, fn] of entries) {
    try {
      fn()
      passed++
      console.log(`ok - ${name}`)
    } catch (err) {
      failed++
      failures.push({ f, name, err })
      console.log(`not ok - ${name}`)
      console.log(`    ${err && err.message}`)
    }
  }
}

console.log(`\n1..${passed + failed}  # pass ${passed}  fail ${failed}`)
if (failures.length) {
  console.log('\nFAILED:')
  for (const { f, name, err } of failures) {
    console.log(`  ${f} :: ${name} -> ${err && err.message}`)
  }
  process.exit(1)
}
