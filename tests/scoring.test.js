const assert = require('assert')
const { ScoreBoard } = require('../src/logic/scoring')
const { SCORE } = require('../src/config')

module.exports = {
  'reset 清零': () => {
    const s = new ScoreBoard()
    s.addDistance(100)
    s.registerSpell('correct')
    s.reset()
    assert.strictEqual(s.score, 0)
    assert.strictEqual(s.distance, 0)
    assert.strictEqual(s.combo, 0)
    assert.strictEqual(s.maxCombo, 0)
  },
  '距离分按比例累计': () => {
    const s = new ScoreBoard()
    const d = s.addDistance(50)
    assert.ok(Math.abs(d - 50 * SCORE.perMeter) < 1e-9)
    s.addDistance(50)
    assert.ok(Math.abs(s.score - 100 * SCORE.perMeter) < 1e-9)
    assert.strictEqual(s.distance, 100)
  },
  '连续答对 combo 与倍率递增并封顶': () => {
    const s = new ScoreBoard()
    const deltas = []
    for (let i = 0; i < 10; i++) deltas.push(s.registerSpell('correct'))
    assert.strictEqual(s.combo, 10)
    assert.strictEqual(s.maxCombo, 10)
    assert.strictEqual(s.multiplier(), SCORE.comboMax)
    // 第一段基础分，最后达到倍率上限
    assert.ok(Math.abs(deltas[0] - SCORE.spellBase) < 1e-9)
    assert.ok(Math.abs(deltas[9] - SCORE.spellBase * SCORE.comboMax) < 1e-9)
  },
  '答错重置 combo 但累计总数': () => {
    const s = new ScoreBoard()
    s.registerSpell('correct')
    s.registerSpell('correct')
    s.registerSpell('wrong')
    assert.strictEqual(s.combo, 0)
    assert.strictEqual(s.maxCombo, 2)
    assert.strictEqual(s.spellTotal, 3)
    assert.strictEqual(s.spellCorrect, 2)
  },
  '超时按错误处理': () => {
    const s = new ScoreBoard()
    s.registerSpell('correct')
    s.registerSpell('timeout')
    assert.strictEqual(s.combo, 0)
    assert.strictEqual(s.spellTotal, 2)
  },
  'snapshot 为整数快照': () => {
    const s = new ScoreBoard()
    s.addDistance(33.3)
    s.registerSpell('correct')
    const snap = s.snapshot()
    assert.ok(Number.isInteger(snap.score))
    assert.ok(Number.isInteger(snap.distance))
    assert.strictEqual(snap.spellTotal, 1)
    assert.strictEqual(snap.spellCorrect, 1)
  },
}
