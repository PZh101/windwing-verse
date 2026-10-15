/**
 * 计分与 combo（纯逻辑）
 */

const { SCORE } = require('../config')

class ScoreBoard {
  constructor() {
    this.reset()
  }

  reset() {
    this.score = 0
    this.distance = 0
    this.combo = 0
    this.maxCombo = 0
    this.spellCorrect = 0
    this.spellTotal = 0
  }

  /**
   * 距离推进，返回本帧新增分数
   * @param {number} dz 本帧前进距离(m)
   * @param {number} [speedRatio] 0..1 速度比，越高单位距离得分越多
   */
  addDistance(dz, speedRatio) {
    this.distance += dz
    const r = Math.max(0, Math.min(1, speedRatio || 0))
    const delta = dz * SCORE.perMeter * (1 + SCORE.speedBonus * r)
    this.score += delta
    return delta
  }

  /** 诗咒结果登记 */
  registerSpell(outcome) {
    this.spellTotal++
    if (outcome !== 'correct') {
      this.combo = 0
      return 0
    }
    this.spellCorrect++
    this.combo++
    if (this.combo > this.maxCombo) this.maxCombo = this.combo
    const mult = Math.min(SCORE.comboMax, 1 + (this.combo - 1) * SCORE.comboStep)
    const delta = SCORE.spellBase * mult
    this.score += delta
    return delta
  }

  /** 当前倍率 */
  multiplier() {
    if (this.combo <= 0) return 1
    return Math.min(SCORE.comboMax, 1 + (this.combo - 1) * SCORE.comboStep)
  }

  /** 结算快照 */
  snapshot() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      combo: this.maxCombo,
      spellCorrect: this.spellCorrect,
      spellTotal: this.spellTotal,
    }
  }
}

module.exports = { ScoreBoard }
