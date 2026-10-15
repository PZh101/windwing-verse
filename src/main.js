/**
 * 《风翼诗咒》主控：状态机 + 每帧调度 + 触摸路由
 * 状态：menu -> playing <-> spell -> gameover(falling -> result) -> menu
 */

const THREE = require('../libs/three.min.js')
const Platform = require('../libs/platform')
const C = require('./config')
const { World } = require('./world')
const { UI } = require('./ui')
const { Audio } = require('./audio')
const { Spawner } = require('./logic/spawner')
const { findCollision, findNearMiss } = require('./logic/collision')
const { SpellChallenge, PHASE } = require('./logic/spell')
const { ScoreBoard } = require('./logic/scoring')
const { SpeedModel } = require('./logic/speed')
const { createRng, shuffle, weighted, pick } = require('./rng')
const { POEMS } = require('./data/poems')
const leaderboard = require('./leaderboard')

const STEER_X = 0.024 // 触摸位移(css px) -> 世界单位
const STEER_Y = 0.017
const RESOLVE_HOLD = 1.7 // 诗咒结算展示时长
const FALL_TIME = 1.15 // 坠落动画时长

class Game {
  constructor() {
    const screen = Platform.screen()
    this.cssW = screen.width
    this.cssH = screen.height
    this.scale = Math.max(1, screen.pixelRatio || 1)

    // ---- 3D 世界 ----
    const canvas = Platform.displayCanvas()
    this.world = new World(canvas)

    // ---- UI 覆盖层 ----
    this.ui = new UI()
    this.ui.attach(Platform.create2DCanvas(2, 2), this.cssW, this.cssH, this.scale)
    this._buildOverlay()

    // ---- 子系统 ----
    this.audio = new Audio()
    this.rng = createRng((Date.now() % 2147483647) >>> 0)
    this.spawner = new Spawner(this.rng)
    this.spell = new SpellChallenge()
    this.score = new ScoreBoard()

    // ---- 运行状态 ----
    this.state = 'menu'
    this.sub = null
    this.elapsed = 0
    this.feathers = C.RULES.feathers
    this.invincible = 0
    this.boostT = 0
    this.recentPoems = []
    this.fallT = 0
    this.resolveT = 0
    this.result = null
    this.steering = null
    this.keys = {}
    this.lastTs = 0
    this.lbReturn = 'menu'
    this.hitStop = 0        // 受击卡帧剩余时间
    this.hitFlash = 0       // 受击红闪剩余时间
    this.speed = new SpeedModel()  // 飞行速度模型（加速/撞击减速/擦身提速）
    this.speedHit = 0       // 最近一次撞击的掉速（HUD 展示用）

    this._bindTouch()
    if (!Platform.isMiniGame) this._bindKeyboard()
    this._refreshMenuView()

    this._loop = this._loop.bind(this)
    requestAnimationFrame(this._loop)
  }

  // ---------------- 覆盖层（UI 贴图） ----------------
  _buildOverlay() {
    this.overlayScene = new THREE.Scene()
    this.overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.ui.texture, transparent: true, depthTest: false, depthWrite: false })
    )
    this.overlayScene.add(quad)
  }

  // ---------------- 输入 ----------------
  _bindTouch() {
    Platform.onTouch({
      start: (p) => {
        this.audio.unlock()
        const action = this.ui.hitTest(p.x, p.y)
        if (action) {
          this._uiAction(action)
          return
        }
        if (this.state === 'playing') {
          this.steering = { x: p.x, y: p.y }
        }
      },
      move: (p) => {
        if (!this.steering || this.state !== 'playing') return
        const dx = p.x - this.steering.x
        const dy = p.y - this.steering.y
        this.steering.x = p.x
        this.steering.y = p.y
        this.world.setTarget(this.world.target.x + dx * STEER_X, this.world.target.y - dy * STEER_Y)
      },
      end: () => {
        this.steering = null
      },
    })
  }

  /** 浏览器预览用的键盘转向（开发便利，小游戏端无此逻辑） */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true
      if (e.key === ' ' && this.state === 'menu') this._uiAction('start')
    })
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false
    })
    window.addEventListener('resize', () => {
      const s = Platform.screen()
      this.cssW = s.width
      this.cssH = s.height
      this.ui.resize(this.cssW, this.cssH, s.pixelRatio)
      this.world.resize(this.cssW, this.cssH, Platform.displayCanvas().width, Platform.displayCanvas().height)
    })
  }

  _uiAction(action) {
    this.audio.unlock()
    if (action === 'start' || action === 'retry') {
      this._startRun()
    } else if (action === 'home') {
      this._toMenu()
    } else if (action === 'leaderboard') {
      this.lbReturn = this.state === 'gameover' ? 'gameover' : 'menu'
      this.ui.setView({ screen: 'leaderboard', leaderboard: leaderboard.top(50) })
    } else if (action === 'back') {
      if (this.lbReturn === 'gameover' && this.result) {
        this.ui.setView({ screen: 'gameover', result: this.result, hud: this._hudView() })
      } else {
        this._refreshMenuView()
      }
    } else if (action === 'nickname') {
      this._editNickname()
    } else if (action.indexOf('spell:') === 0) {
      const idx = parseInt(action.slice(6), 10)
      if (this.state === 'spell' && this.spell.active) {
        const outcome = this.spell.choose(idx)
        this._resolveSpell(outcome)
      }
    }
  }

  // ---------------- 状态切换 ----------------
  _startRun() {
    this.world.reset()
    this.spawner.reset()
    this.score.reset()
    this.spell.clear()
    this.state = 'playing'
    this.sub = null
    this.elapsed = 0
    this.feathers = C.RULES.feathers
    this.invincible = 0
    this.boostT = 0
    this.recentPoems = []
    this.result = null
    this.world.hidden = false
    this.world.hurtT = 0
    this.hitStop = 0
    this.hitFlash = 0
    this.speed.reset()
    this.speedHit = 0
    this.audio.whoosh()
    this.ui.setView({ screen: 'playing', hud: this._hudView() })
  }

  _toMenu() {
    this.state = 'menu'
    this.sub = null
    this.world.reset()
    this._refreshMenuView()
  }

  _refreshMenuView() {
    this.ui.setView({
      screen: 'menu',
      nickname: leaderboard.getNickname(),
      best: leaderboard.best(),
      poemCount: POEMS.length,
    })
  }

  _hudView() {
    return {
      score: Math.floor(this.score.score),
      distance: Math.floor(this.score.distance),
      feathers: this.feathers,
      combo: this.score.combo,
      invincible: this.invincible > 0,
      showHint: this.elapsed < 4,
      hintT: this.elapsed,
      boosting: this.boostT > 0,
      boostT: C.RULES.dashDuration > 0 ? this.boostT / C.RULES.dashDuration : 0,
      speed: this.speed.value(),
      speedRatio: this.speed.ratio(),
      cruiseRatio: Math.max(
        0,
        Math.min(1, (this.speed.cruise() - C.SPEED.base) / (C.SPEED.max - C.SPEED.base))
      ),
      deficit: this.speed.deficit(),
    }
  }

  // ---------------- 诗咒 ----------------
  _pickPoem() {
    let weights
    if (this.elapsed < 25) weights = { 1: 0.8, 2: 0.2, 3: 0.0 }
    else if (this.elapsed < 70) weights = { 1: 0.5, 2: 0.4, 3: 0.1 }
    else weights = { 1: 0.35, 2: 0.45, 3: 0.2 }
    const level = parseInt(weighted(this.rng, weights), 10)
    let pool = POEMS.filter((p) => p.level === level && !this.recentPoems.includes(p.id))
    if (!pool.length) pool = POEMS.filter((p) => !this.recentPoems.includes(p.id))
    if (!pool.length) pool = POEMS
    const poem = pick(this.rng, pool)
    this.recentPoems.push(poem.id)
    if (this.recentPoems.length > 8) this.recentPoems.shift()
    return poem
  }

  _beginSpell() {
    const poem = this._pickPoem()
    this.spell.present(poem, (arr) => shuffle(this.rng, arr))
    this.state = 'spell'
    this.world.spellActive = true
    this.audio.spell()
  }

  _resolveSpell(outcome) {
    this.score.registerSpell(outcome)
    this.resolveT = 0
    if (outcome === 'correct') {
      this.audio.correct()
      const p = this.world.player
      this.world.shockwave(p.x, p.y, 0, 0xffe6a8)
      this.world.burst(p.x, p.y, 1, 0xffd98a, 30)
      const removed = this.world.pool.clearAhead(C.RULES.dashClearRadius)
      for (const r of removed) this.world.burst(r.x, r.y, r.z, 0xd8c9a8, 8)
      this.boostT = C.RULES.dashDuration
      this.world.boosting = true
      this.feathers = Math.min(C.RULES.feathers, this.feathers + 1)
      this.audio.dash()
    } else {
      this.audio.wrong()
      this.ui.showToast(outcome === 'timeout' ? '时间到' : '答错了')
    }
  }

  _resumeAfterSpell() {
    const outcome = this.spell.outcome
    this.spell.clear()
    this.world.spellActive = false
    if (outcome === 'correct') {
      this.state = 'playing'
      this.ui.setView({ screen: 'playing', hud: this._hudView() })
    } else {
      this._gameOver('spell')
    }
  }

  // ---------------- 坠落与结算 ----------------
  _gameOver(cause) {
    this.state = 'gameover'
    this.sub = 'falling'
    this.fallT = 0
    this.fallCause = cause
    this.result = null
    this.world.falling = true
    this.world.boosting = false
    this.audio.gameover()
    this.world.addShake(0.7)
  }

  _finishGameOver(cause) {
    this.sub = 'result'
    this.world.falling = false
    const snap = this.score.snapshot()
    const { rank, isBest } = leaderboard.submit({
      name: leaderboard.getNickname(),
      score: snap.score,
      distance: snap.distance,
      combo: snap.combo,
      spellCorrect: snap.spellCorrect,
      spellTotal: snap.spellTotal,
    })
    this.result = Object.assign({}, snap, { cause, isBest, rank })
    this.ui.setView({ screen: 'gameover', result: this.result, hud: this._hudView() })
  }

  // ---------------- 昵称 ----------------
  _editNickname() {
    const cur = leaderboard.getNickname()
    if (Platform.isMiniGame) {
      try {
        wx.showKeyboard({ defaultValue: cur, maxLength: 12 })
        const onConfirm = (res) => {
          const v = String(res.value || '').trim()
          if (v) {
            leaderboard.setNickname(v)
            this.ui.showToast('昵称已更新')
          }
          try {
            wx.hideKeyboard()
          } catch (e) {}
          try {
            wx.offKeyboardConfirm(onConfirm)
          } catch (e) {}
          this._refreshMenuView()
        }
        wx.onKeyboardConfirm(onConfirm)
      } catch (e) {
        this.ui.showToast('当前环境无法唤起键盘')
      }
    } else {
      const v = window.prompt('输入昵称（最长 12 字）', cur)
      if (v != null) {
        leaderboard.setNickname(v)
        this._refreshMenuView()
        this.ui.showToast('昵称已更新')
      }
    }
  }

  // ---------------- 主循环 ----------------
  _loop(ts) {
    const dt = this.lastTs ? Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000)) : 0.016
    this.lastTs = ts
    this._update(dt)
    this._render()
    requestAnimationFrame(this._loop)
  }

  /** 当前速度（m/s）：速度模型 × 场景修正（诗咒慢放 / 冲刺倍率） */
  _speedNow() {
    const base = this.speed.value()
    if (this.state === 'spell') return base * C.SPEED.spellSlow
    if (this.boostT > 0) return base * C.SPEED.dashBoost
    return base
  }

  _update(rawDt) {
    let dt = rawDt
    // 受击卡帧：世界近乎静止的 0.1s，打击感的关键
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - rawDt)
      dt = rawDt * C.RULES.hitStopScale
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - rawDt)
    const world = this.world
    const inFlight = this.state === 'playing' || this.state === 'spell'

    // 键盘转向（浏览器预览）
    if (!Platform.isMiniGame && this.state === 'playing') {
      const k = this.keys
      let kx = 0
      let ky = 0
      if (k['ArrowLeft'] || k['a'] || k['A']) kx -= 1
      if (k['ArrowRight'] || k['d'] || k['D']) kx += 1
      if (k['ArrowUp'] || k['w'] || k['W']) ky += 1
      if (k['ArrowDown'] || k['s'] || k['S']) ky -= 1
      if (kx || ky) world.setTarget(world.target.x + kx * 14 * dt, world.target.y + ky * 10 * dt)
    }

    if (inFlight) {
      this.elapsed += dt
      this.speed.update(dt)

      // 世界速度：速度模型 × 场景修正（诗咒慢放 / 冲刺加速）
      let mod = 1
      if (this.state === 'spell') mod = C.SPEED.spellSlow
      else if (this.boostT > 0) mod = C.SPEED.dashBoost
      const eff = this.speed.value() * mod
      world.speed = eff
      const ratio = Math.max(0, Math.min(1, (eff - C.SPEED.base) / (C.SPEED.max - C.SPEED.base)))
      world.speedRatio = ratio

      // 距离分随速度加权，鼓励保持高速
      this.score.addDistance(eff * dt, ratio)

      // 生成
      this.spawner.advance(eff * dt)
      if (
        this.spawner.shouldSpawn(this.elapsed) &&
        world.pool.active.length < C.SPAWN.maxActive
      ) {
        this._spawnOne(this.spawner.spawn(this.elapsed, world.player))
      }

      // 冲刺计时
      if (this.boostT > 0) {
        this.boostT -= dt
        if (this.boostT <= 0) {
          this.boostT = 0
          world.boosting = false
        }
      }

      // 无敌计时（机身闪烁提示）
      if (this.invincible > 0) {
        this.invincible = Math.max(0, this.invincible - dt)
        world.hidden = Math.sin(this.invincible * 42) < -0.25
      } else {
        world.hidden = false
      }

      if (this.state === 'playing') {
        // 碰撞（快照里带 ref，指向真正的 Object3D）
        const move = eff * dt
        const me = { x: world.player.x, y: world.player.y, radius: C.PLAYER.radius }
        const cols = world.colliders()
        if (this.invincible <= 0) {
          // 扫掠判定：把本帧位移一起考虑，掉帧/高速时也不会穿透
          const hit = findCollision(me, cols, C.RULES.hitZWindow, move)
          if (hit) this._onHit(hit.ref)
        }
        // 擦身而过：躲过去也要有正反馈
        if (this.invincible <= 0) {
          for (const g of findNearMiss(me, cols, C.RULES.grazeNear, 0, move + C.RULES.hitZWindow)) {
            const ref = g.ref
            if (!ref.userData.grazed) {
              ref.userData.grazed = true
              this._onGraze(g.x, g.y)
            }
          }
        }
        this.ui.setView({ screen: 'playing', hud: this._hudView() })
      } else {
        // 诗咒推进
        if (this.spell.phase === PHASE.PRESENTING) {
          const timeout = this.spell.update(dt)
          if (timeout) this._resolveSpell(timeout)
        } else if (this.spell.phase === 'resolved') {
          this.resolveT += dt
          if (this.resolveT >= RESOLVE_HOLD) this._resumeAfterSpell()
        }
        this.ui.setView({ screen: 'spell', spell: this._spellView(), hud: this._hudView() })
      }
    } else if (this.state === 'gameover' && this.sub === 'falling') {
      this.fallT += dt
      world.speed = this._speedNow() * 0.35
      if (this.fallT >= FALL_TIME) this._finishGameOver(this.fallCause)
    } else {
      // 菜单/结算：世界缓慢漂移营造氛围
      world.speed = 4
      world.speedRatio = 0.05
      world.spawnerIdle = (world.spawnerIdle || 0) + dt
      this.spawner.advance(world.speed * dt)
      if (this.spawner.shouldSpawn(999) && world.pool.active.length < 10) {
        this._spawnOne(this.spawner.spawn(999))
      }
    }

    world.update(dt)
  }

  _spellView() {
    const s = this.spell
    return {
      prompt: s.poem ? s.poem.prompt : '',
      options: s.options,
      selected: s.selected,
      resolved: s.phase === 'resolved',
      outcome: s.outcome,
      source: s.poem ? s.poem.source : '',
      timeRatio: s.timeRatio(),
    }
  }

  /** 落地一个生成描述（含可能的伴生障碍） */
  _spawnOne(desc) {
    if (!desc) return
    this.world.spawn(desc)
    if (desc.companion) this.world.spawn(desc.companion)
  }

  _onHit(ob) {
    const world = this.world
    const ud = ob.userData

    // 统一的受击反馈：卡帧 + 红闪 + 强震 + 机体翻抖 + 碎屑 + 震动 + 音效
    this.hitStop = C.RULES.hitStopTime
    this.hitFlash = 0.42
    world.addHurt(C.RULES.hurtDuration)
    world.addShake(ud.isPoem ? 0.45 : 0.85)
    Platform.vibrate(ud.isPoem ? 'light' : 'medium')
    this.ui.flash(ud.isPoem ? '#f2b950' : '#d23b3b', 0.42, ud.isPoem ? 0.3 : 0.55)

    if (ud.isPoem) {
      world.burst(ob.position.x, ob.position.y, ob.position.z, 0xffe9b0, 34)
      this.audio.spell()
      world.pool.release(ob)
      this._beginSpell()
      return
    }
    // 普通障碍：掉风羽 + 掉速
    this.feathers--
    this.audio.hit()
    world.burst(ob.position.x, ob.position.y, ob.position.z, 0xd8b28a, 26)
    world.pool.release(ob)
    this.invincible = C.RULES.invincibleAfterHit
    const loss = this.speed.impact()
    this.speedHit = loss
    if (this.feathers <= 0) {
      this._gameOver('crash')
    } else {
      this.ui.showToast(`风羽 -1（剩 ${this.feathers}）· 减速 ${loss.toFixed(1)}`, 1.4)
      this.score.combo = 0
    }
  }

  /** 擦身而过：加分 + 小幅提速（负的速度赤字）+ 提示 */
  _onGraze(x, y) {
    this.score.score += C.RULES.grazeBonus
    this.speed.graze()
    this.world.burst(x, y, 1.2, 0xfff0c8, 8)
    this.world.addShake(0.12)
    this.audio.graze()
    this.ui.showToast(`擦身而过 +${C.RULES.grazeBonus} · 加速`, 1.0)
  }

  _render() {
    const r = this.world.renderer
    this.world.render()
    r.autoClear = false
    r.clearDepth()
    r.render(this.overlayScene, this.overlayCam)
    r.autoClear = true
    this.ui.draw(0.016)
  }
}

module.exports = { Game }
