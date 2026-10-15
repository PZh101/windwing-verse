/**
 * 障碍生成调度器（纯逻辑，无渲染依赖）
 * 输入：当前难度状态；输出：下一次生成的障碍描述（类型/位置/尺寸）
 *
 * 布局策略（覆盖式，而非纯随机）：
 *   把游玩空间切成 lanes × bands 的网格。每次生成用「最久未用优先 + 随机」的
 *   方式选格，保证任何一条轨道（含最左/最右的边角）都会在若干次生成内被覆盖，
 *   玩家不能靠躲在固定角落永久免疫。
 */

const { PLAYFIELD, SPAWN, OBSTACLE, BIRD_SPREAD } = require('../config')
const { range, rangeInt, weighted, pick } = require('../rng')

class Spawner {
  /**
   * @param {function} rng 随机数生成器
   */
  constructor(rng) {
    this.rng = rng
    this.reset()
  }

  reset() {
    this.distanceSinceLast = 1e9   // 立刻生成第一个
    this.sincePoem = 0             // 距上一座诗碑的普通障碍数
    this.nextPoemAt = rangeInt(this.rng, SPAWN.poemEveryMin, SPAWN.poemEvery)

    this.tick = 0                                  // 生成序号
    this.laneLast = new Array(SPAWN.lanes).fill(-1e9)
    this.bandLast = new Array(SPAWN.bands).fill(-1e9)
    this.lastLane = -1
    this.lastBand = -1
    this.aimedLane = false
    this.aimedBand = false

    // 本次生成的间距在「生成那一刻」定下来。
    // 以前是 shouldSpawn() 每帧重摇一次，等于目标间距逐帧漂移，实际生成
    // 距离的分布被扭曲，而且白白吃掉每帧一个随机数。
    this.nextInterval = this.interval(0)
  }

  /** 当前难度系数 0..1（随飞行时间增长） */
  difficulty(elapsed) {
    return Math.max(0, Math.min(1, elapsed / 90))
  }

  /** 当前生成间距（米） */
  interval(elapsed) {
    const d = this.difficulty(elapsed)
    return range(this.rng, 0, 1) < 0.5
      ? SPAWN.intervalMin + (SPAWN.intervalMin * SPAWN.intervalShrink - SPAWN.intervalMin) * d
      : SPAWN.intervalMax - (SPAWN.intervalMax - SPAWN.intervalMin) * 0.5 * d
  }

  /**
   * 是否该生成新障碍
   * 判定只看累计距离，与本帧的随机数无关（间距已在生成/重置时定好）。
   * 保留 elapsed 形参是为了不破坏既有调用与单测。
   * @param {number} [elapsed] 飞行时间 s（未参与判定）
   * @returns {boolean}
   */
  shouldSpawn(elapsed) {
    return this.distanceSinceLast >= this.nextInterval
  }

  /**
   * 选一条横向轨道
   * - 若给了玩家坐标且命中 aimChance：直接用玩家所在轨道（反"守角落"）
   * - 否则：每 laneForceEvery 次强制补「最久未用」，其余随机且不与上次同轨
   */
  _pickLane(aimX, aimChance) {
    const n = SPAWN.lanes
    const t = this.tick
    let lane
    let aimed = false
    if (aimX !== undefined && aimX !== null && this.rng() < aimChance) {
      lane = this._indexOf(aimX, PLAYFIELD.minX, PLAYFIELD.maxX, n)
      aimed = true
    } else if (t > 0 && t % SPAWN.laneForceEvery === 0) {
      lane = 0
      for (let i = 1; i < n; i++) if (this.laneLast[i] < this.laneLast[lane]) lane = i
    } else {
      lane = rangeInt(this.rng, 0, n - 1)
      if (lane === this.lastLane && n > 1) {
        lane = (lane + 1 + rangeInt(this.rng, 0, n - 2)) % n
      }
    }
    this.laneLast[lane] = t
    this.lastLane = lane
    this.aimedLane = aimed
    return lane
  }

  /** 选一个纵向层（同理，保证上下边角也会被覆盖） */
  _pickBand(aimY, aimChance) {
    const n = SPAWN.bands
    const t = this.tick
    let band
    let aimed = false
    if (aimY !== undefined && aimY !== null && this.rng() < aimChance) {
      band = this._indexOf(aimY, PLAYFIELD.minY, PLAYFIELD.maxY, n)
      aimed = true
    } else if (t > 0 && t % SPAWN.bandForceEvery === 0) {
      band = 0
      for (let i = 1; i < n; i++) if (this.bandLast[i] < this.bandLast[band]) band = i
    } else {
      band = rangeInt(this.rng, 0, n - 1)
      if (band === this.lastBand && n > 1) {
        band = (band + 1 + rangeInt(this.rng, 0, n - 2)) % n
      }
    }
    this.bandLast[band] = t
    this.lastBand = band
    this.aimedBand = aimed
    return band
  }

  /** 坐标 → 所在格序号 */
  _indexOf(v, min, max, n) {
    const r = (v - min) / (max - min)
    return Math.max(0, Math.min(n - 1, Math.floor(r * n)))
  }

  /** 轨道 → 世界 x（含格内抖动；tight 时抖动收紧，用于瞄准玩家） */
  _laneX(lane, tight) {
    const xMin = PLAYFIELD.minX + SPAWN.edgeMargin
    const xMax = PLAYFIELD.maxX - SPAWN.edgeMargin
    const w = (xMax - xMin) / SPAWN.lanes
    const cx = xMin + w * (lane + 0.5)
    const k = tight ? SPAWN.aimJitter : SPAWN.laneJitter
    const jitter = (this.rng() - 0.5) * w * k
    return Math.max(PLAYFIELD.minX, Math.min(PLAYFIELD.maxX, cx + jitter))
  }

  /** 层 → 世界 y */
  _bandY(band, tight) {
    const yMin = PLAYFIELD.minY + SPAWN.bandMargin
    const yMax = PLAYFIELD.maxY - SPAWN.bandMargin
    const h = (yMax - yMin) / SPAWN.bands
    const cy = yMin + h * (band + 0.5)
    const k = tight ? SPAWN.aimJitter : SPAWN.bandJitter
    const jitter = (this.rng() - 0.5) * h * k
    return Math.max(PLAYFIELD.minY, Math.min(PLAYFIELD.maxY, cy + jitter))
  }

  /** 组装一个障碍描述（不推进诗碑计数） */
  _makeDesc(kind, isPoem, lane, band, tl, tb) {
    const size = OBSTACLE[kind]
    const scale = range(this.rng, size.scale[0], size.scale[1])
    const flock = kind === 'bird' ? rangeInt(this.rng, 1, 3) : 1
    // 鸟群在 x 向以 BIRD_SPREAD 为间距左右展开，碰撞圆必须把整个翼展包进去，
    // 只用单只半径会出现「最边上那只鸟看得见却撞不到」
    const spread = kind === 'bird' ? ((flock - 1) / 2) * BIRD_SPREAD : 0
    const radius = (size.radius + spread) * scale
    return {
      kind,
      isPoem,
      x: this._laneX(lane, tl),
      y: this._bandY(band, tb),
      scale,
      radius,
      flock,
      z: SPAWN.spawnZ,
      lane,
      band,
      aimed: !!(tl || tb),
      seed: Math.floor(this.rng() * 1e9),
    }
  }

  /**
   * 生成一个障碍描述（会推进内部计数，调用方负责 actuallySpawn）
   * @returns {object} desc，可能带 companion（同期出现的第二个障碍，留出足够空隙）
   */
  spawn(elapsed, aim) {
    const d = this.difficulty(elapsed)
    const weights = elapsed > SPAWN.lateAfter ? SPAWN.weightsLate : SPAWN.weights
    const type = weighted(this.rng, weights)
    // 反驻守：一部分障碍会冲着玩家当前所在位置来，越到后期越多
    const aimChance = SPAWN.aimChance + SPAWN.aimChanceGain * d

    // 诗碑判定：普通障碍计数达到阈值时，改写为诗碑
    let kind = type
    let isPoem = false
    if (this.sincePoem >= this.nextPoemAt) {
      kind = 'stele'
      isPoem = true
      this.sincePoem = 0
      this.nextPoemAt = rangeInt(this.rng, SPAWN.poemEveryMin, SPAWN.poemEvery)
    } else {
      this.sincePoem++
    }

    const lane = this._pickLane(aim && aim.x, aimChance)
    const band = this._pickBand(aim && aim.y, aimChance)
    const desc = this._makeDesc(kind, isPoem, lane, band, this.aimedLane, this.aimedBand)
    this.tick++

    // 中后期偶尔来一对（形成"墙"，但至少留 3 条空轨，永远不封死）
    if (!isPoem && elapsed > SPAWN.clusterAfter) {
      const chance = SPAWN.clusterChance * (0.5 + d)
      if (this.rng() < chance) {
        const cands = []
        for (let i = 0; i < SPAWN.lanes; i++) {
          if (Math.abs(i - lane) >= SPAWN.clusterLaneGap) cands.push(i)
        }
        if (cands.length) {
          const cl = pick(this.rng, cands)
          const cb = (band + 1 + rangeInt(this.rng, 0, SPAWN.bands - 2)) % SPAWN.bands
          desc.companion = this._makeDesc(type, false, cl, cb)
          // 伴生障碍同样占用了轨道与层，必须记进「最久未用」账本，
          // 否则反驻守的覆盖统计会漏算它，轨道覆盖出现偏差
          this.laneLast[cl] = this.tick
          this.bandLast[cb] = this.tick
          this.lastLane = cl
          this.lastBand = cb
        }
      }
    }

    this.distanceSinceLast = 0
    this.nextInterval = this.interval(elapsed)
    return desc
  }

  /** 由外部在世界推进后调用 */
  advance(dz) {
    this.distanceSinceLast += dz
  }
}

module.exports = { Spawner }
