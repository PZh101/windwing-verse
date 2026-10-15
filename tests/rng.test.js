const assert = require('assert')
const { createRng, range, rangeInt, weighted, pick, shuffle } = require('../src/rng')

module.exports = {
  '相同种子产生相同序列': () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 50 }, () => a())
    const seqB = Array.from({ length: 50 }, () => b())
    assert.deepStrictEqual(seqA, seqB)
  },
  '不同种子序列不同': () => {
    const a = createRng(1)
    const b = createRng(2)
    assert.notDeepStrictEqual(Array.from({ length: 20 }, () => a()), Array.from({ length: 20 }, () => b()))
  },
  'range 落在区间内': () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const v = range(rng, -3, 5)
      assert.ok(v >= -3 && v <= 5, `out of range: ${v}`)
    }
  },
  'rangeInt 含端点且为整数': () => {
    const rng = createRng(9)
    const seen = new Set()
    for (let i = 0; i < 800; i++) {
      const v = rangeInt(rng, 2, 5)
      assert.ok(Number.isInteger(v))
      assert.ok(v >= 2 && v <= 5)
      seen.add(v)
    }
    assert.ok(seen.has(2) && seen.has(5), 'endpoints should appear')
  },
  'weighted 只返回表中的 key': () => {
    const rng = createRng(11)
    const w = { a: 0.2, b: 0.5, c: 0.3 }
    for (let i = 0; i < 300; i++) {
      assert.ok(['a', 'b', 'c'].includes(weighted(rng, w)))
    }
  },
  'shuffle 保留全部元素': () => {
    const rng = createRng(3)
    const src = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffle(rng, src)
    assert.strictEqual(out.length, src.length)
    assert.deepStrictEqual(out.slice().sort((x, y) => x - y), src)
    assert.notDeepStrictEqual(out, src) // 极大概率换序
  },
  'pick 返回数组元素': () => {
    const rng = createRng(5)
    const arr = ['x', 'y', 'z']
    for (let i = 0; i < 100; i++) assert.ok(arr.includes(pick(rng, arr)))
  },
}
