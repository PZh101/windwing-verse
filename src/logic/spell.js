/**
 * 诗咒挑战状态机（纯逻辑）
 * 生命周期：idle -> presenting(限时) -> resolved(correct|wrong|timeout)
 * 由 world 层在撞击诗碑时调用 present()，每帧 update(dt)。
 */

const { RULES } = require('../config')

const PHASE = {
  IDLE: 'idle',
  PRESENTING: 'presenting',
  RESOLVED: 'resolved',
}

const OUTCOME = {
  CORRECT: 'correct',
  WRONG: 'wrong',
  TIMEOUT: 'timeout',
}

class SpellChallenge {
  constructor() {
    this.phase = PHASE.IDLE
    this.poem = null
    this.options = []        // 打乱后的选项 [{ text, correct }]
    this.selected = -1
    this.remaining = 0
    this.outcome = null
    this.totalTime = RULES.spellTime
  }

  get active() {
    return this.phase === PHASE.PRESENTING
  }

  /**
   * 出示一道题
   * @param {object} poem 诗句条目 { id, prompt, answer, options, source, level }
   * @param {function} shuffleFn (arr) => arr，用于打乱选项
   */
  present(poem, shuffleFn) {
    this.poem = poem
    this.totalTime = RULES.spellTime
    this.remaining = this.totalTime
    this.selected = -1
    this.outcome = null
    this.phase = PHASE.PRESENTING
    const opts = poem.options.map((text) => ({ text, correct: text === poem.answer }))
    this.options = shuffleFn ? shuffleFn(opts) : opts
  }

  /**
   * 玩家选择
   * @param {number} index 选项下标
   * @returns {string} outcome: correct | wrong
   */
  choose(index) {
    if (this.phase !== PHASE.PRESENTING) return null
    this.selected = index
    const opt = this.options[index]
    this.outcome = opt && opt.correct ? OUTCOME.CORRECT : OUTCOME.WRONG
    this.phase = PHASE.RESOLVED
    return this.outcome
  }

  /**
   * 每帧更新倒计时
   * @param {number} dt 秒
   * @returns {string|null} 超时返回 'timeout'，否则 null
   */
  update(dt) {
    if (this.phase !== PHASE.PRESENTING) return null
    this.remaining -= dt
    if (this.remaining <= 0) {
      this.remaining = 0
      this.outcome = OUTCOME.TIMEOUT
      this.phase = PHASE.RESOLVED
      return OUTCOME.TIMEOUT
    }
    return null
  }

  /** 重置回 idle（世界层在展示完结算后调用） */
  clear() {
    this.phase = PHASE.IDLE
    this.poem = null
    this.options = []
    this.selected = -1
    this.outcome = null
  }

  /** 倒计时比例 0..1 */
  timeRatio() {
    return this.totalTime > 0 ? Math.max(0, this.remaining / this.totalTime) : 0
  }
}

module.exports = { SpellChallenge, PHASE, OUTCOME }
