/**
 * 飞行速度模型（纯逻辑，可单测）
 *
 * ── 1. 巡航加速：线性阻尼下的终端速度 ──────────────────────────
 * 把风之翼看作「恒定推力 F + 与速度成正比的阻力 kv」的质点：
 *
 *     m·dv/dt = F − k·v
 *
 * 这是标准的一阶线性常微分方程，解为
 *
 *     v(t) = v∞ + (v0 − v∞)·e^(−t/τ)
 *
 * 其中 v∞ = F/k 是终端速度（= SPEED.max），τ = m/k 是时间常数（= SPEED.tauGrow）。
 * 好处：起步加速明显、越接近上限越平缓，永远不会"撞到硬上限"，
 * 而且天然有物理含义，调 τ 就等于调"机体惯性/空气阻力"。
 *
 * 离散推进时用解析解而非欧拉积分，保证任意 dt / 任意帧率下轨迹一致：
 *
 *     v ← v∞ + (v − v∞)·e^(−dt/τ)
 *
 * ── 2. 撞击减速：速度偏移量 deficit ───────────────────────────
 * 撞击不直接改写速度，而是注入一个「速度赤字」d：
 *
 *     d ← d + max(impactMin, impactLoss × v)
 *
 * 与 v 成正比 ≈ 动量交换的直觉：飞得越快撞得越狠，后期惩罚更重。
 * 赤字按同类一阶过程指数衰减回 0（时间常数 τ_recover），
 * 等价于撞击后机体重新加速的过程，恢复曲线天然平滑，不需要额外插值。
 *
 * 擦身而过注入负赤字（小幅提速），同样衰减回 0——同一个状态量，双向复用。
 *
 * ── 3. 最终速度 ──────────────────────────────────────────────
 *     v = clamp(v_cruise − d, floor, max + overspeed) × modifier
 *   modifier 由外部叠加（诗咒慢放 / 答对冲刺）。
 */

const { SPEED } = require('../config')

/** 指数衰减系数：把「时间常数」翻译成每帧的衰减比例 */
function decay(dt, tau) {
  return Math.exp(-Math.max(0, dt) / Math.max(1e-6, tau))
}

class SpeedModel {
  constructor() {
    this.reset()
  }

  reset() {
    this.t = 0
    this.v = SPEED.base      // 巡航速度状态（未计赤字）
    this.d = 0               // 速度赤字（正=减速中，负=擦身加速中）
  }

  /**
   * 推进一帧
   * @param {number} dt 秒
   */
  update(dt) {
    this.t += dt
    // 巡航速度向终端速度指数趋近（解析解）
    this.v += (SPEED.max - this.v) * (1 - decay(dt, SPEED.tauGrow))
    // 赤字指数衰减回 0
    this.d *= decay(dt, SPEED.tauRecover)
    if (Math.abs(this.d) < 1e-3) this.d = 0
  }

  /** 当前巡航速度（不含赤字，HUD 用它显示"目标速度"） */
  cruise() {
    return this.v
  }

  /** 当前赤字（>0 表示被撞击拖慢） */
  deficit() {
    return this.d
  }

  /** 实际速度（m/s） */
  value() {
    const raw = this.v - this.d
    return Math.max(SPEED.floor, Math.min(SPEED.max + SPEED.overspeed, raw))
  }

  /** 速度比 0..1（用于 FOV 拉伸、翼面动画、高速得分奖励） */
  ratio() {
    const r = (this.value() - SPEED.base) / (SPEED.max - SPEED.base)
    return Math.max(0, Math.min(1, r))
  }

  /**
   * 撞击：按当前速度比例注入赤字
   * @returns {number} 本次掉速 (m/s)，可用于 UI 反馈
   */
  impact() {
    const v = this.value()
    const loss = Math.max(SPEED.impactMin, SPEED.impactLoss * v)
    this.d = Math.min(SPEED.maxDeficit, this.d + loss)
    return loss
  }

  /** 擦身而过：小幅提速（负赤字） */
  graze() {
    this.d = Math.max(-SPEED.overspeed, this.d - SPEED.grazeGain)
  }

  /**
   * 解析求解：t 秒后的巡航速度（用于测试/调参，不依赖逐帧推进）
   */
  static cruiseAt(t) {
    return SPEED.max + (SPEED.base - SPEED.max) * decay(t, SPEED.tauGrow)
  }
}

module.exports = { SpeedModel, decay }
