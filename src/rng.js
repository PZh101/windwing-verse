/**
 * 可播种随机数生成器（mulberry32）
 * 逻辑层全部使用它，保证 Node 冒烟测试可复现。
 */

function createRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 在 [min, max] 内取随机浮点数 */
function range(rng, min, max) {
  return min + rng() * (max - min)
}

/** 在 [min, max] 内取随机整数（含端点） */
function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1))
}

/** 按权重表取 key：weights = { rock: 0.4, storm: 0.6 } */
function weighted(rng, weights) {
  const keys = Object.keys(weights)
  let total = 0
  for (const k of keys) total += weights[k]
  let roll = rng() * total
  for (const k of keys) {
    roll -= weights[k]
    if (roll <= 0) return k
  }
  return keys[keys.length - 1]
}

/** 从数组中随机取一个元素 */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

/** Fisher-Yates 洗牌（返回新数组） */
function shuffle(rng, arr) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

module.exports = { createRng, range, rangeInt, weighted, pick, shuffle }
