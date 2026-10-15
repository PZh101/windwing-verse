const assert = require('assert')
const { SpeedModel } = require('../src/logic/speed')
const { SPEED } = require('../src/config')

/** 用固定步长推进 n 秒 */
function run(model, seconds, step = 1 / 60) {
  const n = Math.round(seconds / step)
  for (let i = 0; i < n; i++) model.update(step)
}

module.exports = {
  '初始速度等于起步速度，赤字为零': () => {
    const m = new SpeedModel()
    assert.strictEqual(m.value(), SPEED.base)
    assert.strictEqual(m.deficit(), 0)
    assert.strictEqual(m.ratio(), 0)
  },

  '巡航速度单调趋近终端速度且永不超过': () => {
    const m = new SpeedModel()
    let prev = m.value()
    for (let i = 0; i < 6000; i++) {
      m.update(1 / 60)
      const v = m.value()
      assert.ok(v >= prev - 1e-9, '速度不应回落')
      assert.ok(v <= SPEED.max + 1e-6, `速度超过终端速度: ${v}`)
      prev = v
    }
    // 100 秒后应显著提速，但仍未到顶
    assert.ok(m.value() > SPEED.base + 15, '应明显加速')
    assert.ok(m.value() < SPEED.max, '不应瞬间到顶')
  },

  '逐帧推进结果与解析解一致（与帧率无关）': () => {
    const a = new SpeedModel()
    run(a, 30, 1 / 60)
    const b = new SpeedModel()
    run(b, 30, 1 / 15) // 掉到 15fps，结果应该几乎一样
    assert.ok(Math.abs(a.cruise() - b.cruise()) < 0.05, `帧率相关: ${a.cruise()} vs ${b.cruise()}`)
    const analytic = SpeedModel.cruiseAt(30)
    assert.ok(Math.abs(a.cruise() - analytic) < 0.05, `与解析解不符: ${a.cruise()} vs ${analytic}`)
  },

  '撞击立刻掉速，掉速量与当时速度成正比': () => {
    const slow = new SpeedModel()
    const lossSlow = slow.impact() // 起步 13 m/s
    const fast = new SpeedModel()
    run(fast, 120)
    const vBefore = fast.value()
    const lossFast = fast.impact()
    assert.ok(lossFast > lossSlow, `高速撞击应掉更多: ${lossFast} vs ${lossSlow}`)
    assert.ok(
      Math.abs(lossSlow - Math.max(SPEED.impactMin, SPEED.impactLoss * SPEED.base)) < 1e-6,
      '掉速应按 max(保底, 比例×速度)'
    )
    assert.ok(fast.value() < vBefore - 1, '撞击后速度必须下降')
  },

  '掉速会随时间平滑恢复回巡航速度': () => {
    const m = new SpeedModel()
    run(m, 60)
    const cruise = m.cruise()
    m.impact()
    const afterHit = m.value()
    assert.ok(afterHit < cruise - 2)
    run(m, 1)
    const t1 = m.value()
    run(m, 4)
    const t5 = m.value()
    run(m, 20)
    const t25 = m.value()
    assert.ok(t1 > afterHit, '应开始恢复')
    assert.ok(t5 > t1, '恢复应持续')
    // 巡航速度本身也在涨，所以跟"当前"巡航比
    assert.ok(Math.abs(t25 - m.cruise()) < 0.6, `25s 后应基本回到巡航速度: ${t25} vs ${m.cruise()}`)
  },

  '连环撞击不会跌破速度地板': () => {
    const m = new SpeedModel()
    run(m, 120)
    for (let i = 0; i < 10; i++) {
      m.impact()
      m.update(1 / 60)
      assert.ok(m.value() >= SPEED.floor, `跌破地板: ${m.value()}`)
    }
    assert.ok(m.deficit() <= SPEED.maxDeficit + 1e-9, '赤字应有上限')
    assert.ok(m.value() >= SPEED.floor)
  },

  '擦身而过获得小幅提速，且同样会衰减回巡航': () => {
    const m = new SpeedModel()
    run(m, 30)
    const before = m.value()
    m.graze()
    m.update(1 / 60)
    assert.ok(m.value() > before, `擦身应提速: ${before} -> ${m.value()}`)
    assert.ok(m.value() <= SPEED.max + SPEED.overspeed + 1e-6, '不得超出超速上限')
    run(m, 25)
    assert.ok(Math.abs(m.value() - m.cruise()) < 0.6, '提速应衰减回巡航')
  },

  'ratio 恒在 0..1': () => {
    const m = new SpeedModel()
    for (let i = 0; i < 4000; i++) {
      m.update(1 / 30)
      if (i % 300 === 0) m.impact()
      if (i % 700 === 0) m.graze()
      const r = m.ratio()
      assert.ok(r >= 0 && r <= 1, `ratio 越界: ${r}`)
    }
  },

  'reset 回到初始状态': () => {
    const m = new SpeedModel()
    run(m, 40)
    m.impact()
    m.reset()
    assert.strictEqual(m.value(), SPEED.base)
    assert.strictEqual(m.deficit(), 0)
    assert.strictEqual(m.t, 0)
  },
}
