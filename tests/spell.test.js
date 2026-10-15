const assert = require('assert')
const { SpellChallenge, PHASE, OUTCOME } = require('../src/logic/spell')
const { shuffle } = require('../src/rng')
const { createRng } = require('../src/rng')

const poem = {
  id: 't1',
  prompt: '海内存知己，____。',
  answer: '天涯若比邻',
  options: ['天涯若比邻', '天涯共此时', '海上生明月', '风正一帆悬'],
  source: '王勃《送杜少府之任蜀州》',
}

function fresh() {
  const c = new SpellChallenge()
  c.present(poem, (a) => shuffle(createRng(1), a))
  return c
}

module.exports = {
  '初始为 idle': () => {
    const c = new SpellChallenge()
    assert.strictEqual(c.phase, PHASE.IDLE)
    assert.ok(!c.active)
  },
  'present 后进入 presenting 且选项被打乱且含唯一正确答案': () => {
    const c = fresh()
    assert.strictEqual(c.phase, PHASE.PRESENTING)
    assert.ok(c.active)
    assert.strictEqual(c.options.length, 4)
    const correct = c.options.filter((o) => o.correct)
    assert.strictEqual(correct.length, 1)
    assert.strictEqual(correct[0].text, poem.answer)
  },
  '倒计时随时间减少': () => {
    const c = fresh()
    const t0 = c.remaining
    c.update(2)
    assert.ok(c.remaining < t0)
    c.update(1)
    assert.ok(c.remaining < t0 - 2)
  },
  '超时返回 timeout 并进入 resolved': () => {
    const c = fresh()
    let r = null
    for (let i = 0; i < 20 && !r; i++) r = c.update(1)
    assert.strictEqual(r, OUTCOME.TIMEOUT)
    assert.strictEqual(c.phase, PHASE.RESOLVED)
    assert.strictEqual(c.outcome, OUTCOME.TIMEOUT)
    assert.strictEqual(c.timeRatio(), 0)
  },
  '答对返回 correct': () => {
    const c = fresh()
    const idx = c.options.findIndex((o) => o.correct)
    const r = c.choose(idx)
    assert.strictEqual(r, OUTCOME.CORRECT)
    assert.strictEqual(c.phase, PHASE.RESOLVED)
    assert.strictEqual(c.selected, idx)
  },
  '答错返回 wrong': () => {
    const c = fresh()
    const idx = c.options.findIndex((o) => !o.correct)
    const r = c.choose(idx)
    assert.strictEqual(r, OUTCOME.WRONG)
  },
  'resolved 后 choose/update 不再生效': () => {
    const c = fresh()
    c.choose(0)
    assert.strictEqual(c.choose(1), null)
    assert.strictEqual(c.update(1), null)
  },
  'clear 回到 idle': () => {
    const c = fresh()
    c.choose(0)
    c.clear()
    assert.strictEqual(c.phase, PHASE.IDLE)
    assert.strictEqual(c.poem, null)
  },
  'timeRatio 在 0..1 之间': () => {
    const c = fresh()
    for (let i = 0; i < 30; i++) {
      const r = c.timeRatio()
      assert.ok(r >= 0 && r <= 1)
      if (c.update(0.5)) break
    }
  },
}
