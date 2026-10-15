const assert = require('assert')
const { Spawner } = require('../src/logic/spawner')
const { createRng } = require('../src/rng')
const { PLAYFIELD, SPAWN } = require('../src/config')

function makeSpawner(seed) {
  return new Spawner(createRng(seed))
}

module.exports = {
  'reset 后应立即生成（distanceSinceLast 初始为无穷大）': () => {
    const s = makeSpawner(1)
    assert.ok(s.shouldSpawn(0))
  },
  '生成后不会立即再次生成': () => {
    const s = makeSpawner(2)
    s.spawn(0)
    assert.ok(!s.shouldSpawn(0))
  },
  '推进足够距离后应再次生成': () => {
    const s = makeSpawner(3)
    s.spawn(0)
    for (let i = 0; i < 200; i++) s.advance(1)
    assert.ok(s.shouldSpawn(60))
  },
  '生成位置始终在游玩空间内': () => {
    const s = makeSpawner(4)
    let elapsed = 0
    for (let i = 0; i < 600; i++) {
      if (s.shouldSpawn(elapsed)) {
        const ob = s.spawn(elapsed)
        assert.ok(ob.x >= PLAYFIELD.minX - 1e-6 && ob.x <= PLAYFIELD.maxX + 1e-6, `x out: ${ob.x}`)
        assert.ok(ob.y >= PLAYFIELD.minY - 1e-6 && ob.y <= PLAYFIELD.maxY + 1e-6, `y out: ${ob.y}`)
        assert.ok(['rock', 'storm', 'bird', 'stele'].includes(ob.kind))
        assert.ok(ob.radius > 0)
      }
      s.advance(1.5)
      elapsed += 0.1
    }
  },
  '诗碑会周期性出现且 isPoem 标记正确': () => {
    const s = makeSpawner(5)
    let elapsed = 0
    let poems = 0
    let lastPoemAt = -1
    for (let i = 0; i < 4000; i++) {
      if (s.shouldSpawn(elapsed)) {
        const ob = s.spawn(elapsed)
        if (ob.isPoem) {
          poems++
          assert.strictEqual(ob.kind, 'stele')
          if (lastPoemAt >= 0) {
            const gap = i - lastPoemAt
            assert.ok(gap >= SPAWN.poemEveryMin, `poem gap too small: ${gap}`)
          }
          lastPoemAt = i
        } else {
          assert.notStrictEqual(ob.kind, 'stele')
        }
      }
      s.advance(1.2)
      elapsed += 0.1
    }
    assert.ok(poems >= 5, `expected several poems, got ${poems}`)
  },
  '难度随时间单调提升（间距收缩）': () => {
    const s = makeSpawner(6)
    const early = []
    const late = []
    const r1 = createRng(100)
    const r2 = createRng(100)
    for (let i = 0; i < 300; i++) early.push(s.interval(0))
    for (let i = 0; i < 300; i++) late.push(s.interval(120))
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
    assert.ok(avg(late) < avg(early), `late ${avg(late)} should be < early ${avg(early)}`)
  },
  '生成覆盖全部横向轨道（不存在永久安全区）': () => {
    const s = makeSpawner(11)
    const seen = new Set()
    let elapsed = 0
    let mn = 99
    let mx = -99
    for (let i = 0; i < 4000; i++) {
      if (s.shouldSpawn(elapsed)) {
        const ob = s.spawn(elapsed)
        seen.add(ob.lane)
        mn = Math.min(mn, ob.x)
        mx = Math.max(mx, ob.x)
      }
      s.advance(1.4)
      elapsed += 0.1
    }
    for (let l = 0; l < SPAWN.lanes; l++) {
      assert.ok(seen.has(l), `轨道 ${l} 从未生成过障碍`)
    }
    // 生成范围要覆盖玩家可达宽度的绝大部分（修复前只有 ±3.56 / ±6.2）
    const span = mx - mn
    const full = PLAYFIELD.maxX - PLAYFIELD.minX
    assert.ok(span > full * 0.85, `横向覆盖不足: ${span.toFixed(2)} / ${full}`)
  },

  '任意连续 12 次生成内不会漏掉某条轨道': () => {
    const s = makeSpawner(12)
    let elapsed = 0
    const win = []
    for (let i = 0; i < 4000; i++) {
      if (s.shouldSpawn(elapsed)) {
        win.push(s.spawn(elapsed).lane)
        if (win.length > 12) win.shift()
        if (win.length === 12) {
          const uniq = new Set(win)
          assert.ok(uniq.size >= 3, `连续 12 次只覆盖了 ${uniq.size} 条轨道`)
        }
      }
      s.advance(1.4)
      elapsed += 0.1
    }
  },

  '玩家钉死在角落也会被瞄准（反驻守）': () => {
    const { PLAYER } = require('../src/config')
    const corners = [
      [PLAYFIELD.minX, PLAYFIELD.minY],
      [PLAYFIELD.maxX, PLAYFIELD.minY],
      [PLAYFIELD.minX, PLAYFIELD.maxY],
      [PLAYFIELD.maxX, PLAYFIELD.maxY],
    ]
    for (const [px, py] of corners) {
      const s = makeSpawner(13)
      let hit = 0
      let total = 0
      let elapsed = 0
      for (let i = 0; i < 3000; i++) {
        if (s.shouldSpawn(elapsed)) {
          const ob = s.spawn(elapsed, { x: px, y: py })
          total++
          const list = [ob]
          if (ob.companion) list.push(ob.companion)
          if (list.some((o) => Math.hypot(o.x - px, o.y - py) < o.radius + PLAYER.radius)) hit++
        }
        s.advance(1.4)
        elapsed += 0.1
      }
      const rate = hit / total
      assert.ok(rate > 0.15, `角落 (${px},${py}) 命中率过低: ${(rate * 100).toFixed(1)}%`)
    }
  },

  '成对障碍之间始终留出通路': () => {
    const s = makeSpawner(14)
    let elapsed = 60 // 后期，簇才会出现
    let pairs = 0
    for (let i = 0; i < 6000; i++) {
      if (s.shouldSpawn(elapsed)) {
        const ob = s.spawn(elapsed)
        if (ob.companion) {
          pairs++
          assert.ok(
            Math.abs(ob.companion.lane - ob.lane) >= SPAWN.clusterLaneGap,
            '伴生障碍与主体挨得太近'
          )
          assert.ok(!ob.isPoem, '诗碑不应带伴生障碍')
        }
      }
      s.advance(1.4)
      elapsed += 0.05
    }
    assert.ok(pairs > 10, `样本里几乎没有成对障碍: ${pairs}`)
  },

  '同种子重放结果一致': () => {
    const runOnce = () => {
      const s = makeSpawner(77)
      const out = []
      let elapsed = 0
      for (let i = 0; i < 500; i++) {
        if (s.shouldSpawn(elapsed)) out.push(s.spawn(elapsed))
        s.advance(1.0)
        elapsed += 0.05
      }
      return out
    }
    assert.deepStrictEqual(runOnce(), runOnce())
  },
}
