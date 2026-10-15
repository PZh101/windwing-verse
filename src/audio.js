/**
 * 音效：WebAudio 合成，无任何外部音频资源。
 * 小游戏用 wx.createWebAudioContext，浏览器用 AudioContext。
 * 任何一步失败都静默降级为无声，不影响游戏进行。
 */

class Audio {
  constructor() {
    this.ctx = null
    this.enabled = true
  }

  _ensure() {
    if (this.ctx || !this.enabled) return this.ctx
    try {
      const Platform = require('../libs/platform')
      if (Platform.isMiniGame) {
        this.ctx = wx.createWebAudioContext()
      } else {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) {
          this.enabled = false
          return null
        }
        this.ctx = new AC()
      }
    } catch (e) {
      this.enabled = false
      this.ctx = null
    }
    return this.ctx
  }

  /** 用户手势后调用，解锁音频上下文 */
  unlock() {
    const ctx = this._ensure()
    if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume()
  }

  _tone(freq, dur, type, gain, when, slideTo) {
    const ctx = this._ensure()
    if (!ctx) return
    try {
      const t0 = ctx.currentTime + (when || 0)
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type || 'sine'
      osc.frequency.setValueAtTime(freq, t0)
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(g)
      g.connect(ctx.destination || ctx.destinationNode)
      osc.start(t0)
      osc.stop(t0 + dur + 0.05)
    } catch (e) {}
  }

  _noise(dur, gain, filterFrom, filterTo) {
    const ctx = this._ensure()
    if (!ctx) return
    try {
      const t0 = ctx.currentTime
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = ctx.createBufferSource()
      src.buffer = buf
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(filterFrom || 1200, t0)
      f.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo || 200), t0 + dur)
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain || 0.25, t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(f)
      f.connect(g)
      g.connect(ctx.destination || ctx.destinationNode)
      src.start(t0)
    } catch (e) {}
  }

  // ---- 具体音效 ----
  whoosh() { this._noise(0.5, 0.10, 900, 180) }                 // 起飞
  hit() { this._noise(0.35, 0.3, 700, 90); this._tone(90, 0.25, 'sine', 0.2, 0, 50) } // 撞击
  spell() { this._tone(523, 0.12, 'triangle', 0.15); this._tone(659, 0.12, 'triangle', 0.15, 0.1); this._tone(784, 0.2, 'triangle', 0.15, 0.2) } // 触发咒语
  correct() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.16, i * 0.07)) } // 答对
  wrong() { this._tone(220, 0.3, 'sawtooth', 0.12, 0, 110); this._tone(165, 0.4, 'sawtooth', 0.1, 0.08, 80) } // 答错
  click() { this._tone(880, 0.06, 'square', 0.07) }
  dash() { this._noise(0.7, 0.16, 2400, 300); this._tone(392, 0.4, 'triangle', 0.1, 0, 784) }
  graze() { this._noise(0.22, 0.09, 3200, 900); this._tone(1046, 0.09, 'sine', 0.06) } // 擦身而过（轻）
  gameover() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.22, 'sine', 0.14, i * 0.14)) }
}

module.exports = { Audio }
