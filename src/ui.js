/**
 * UI 层：离屏 2D 画布绘制 + 触摸命中测试
 * 画面状态全部由 main.js 通过 setView() 推入，本层只负责画和报点击区域。
 *
 * 设计约定：
 * - 所有交互控件统一走 _button()，自动获得 渐变 / 阴影 / 按下态 / 命中区域；
 * - 页面切换用 screenT 驱动入场动画（透明度 + 上移），不做整屏黑闪；
 * - 文字一律保证底色对比：亮底用 ink，3D 场景上用 glass 深胶囊托底。
 */

const THREE = require('../libs/three.min.js')
const C = require('./config')

const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif'
const KAI = '"KaiTi", "STKaiti", "PingFang SC", serif'

const THEME = {
  ink: '#1f2d3d',
  sub: '#5c6b7a',
  faint: '#8a97a5',
  paper: 'rgba(255,253,248,0.97)',
  accent: '#e8622d',
  accentDeep: '#c64f1f',
  accentSoft: 'rgba(232,98,45,0.12)',
  teal: '#1fa8a0',
  gold: '#f2b950',
  good: '#2e9e5b',
  bad: '#d23b3b',
  line: 'rgba(31,45,61,0.10)',
  glass: 'rgba(16,28,46,0.36)',
  glassSoft: 'rgba(16,28,46,0.24)',
  dim: 'rgba(12,22,40,0.60)',
}

class UI {
  constructor() {
    this.canvas = null
    this.ctx = null
    this.texture = null
    this.w = 375
    this.h = 667
    this.scale = 1
    this.hotspots = []
    this.view = { screen: 'menu' }
    this.toast = null
    this.anim = 0
    this.screenT = 0 // 当前页面已展示时长（入场动画 / count-up 用）
    this.pressed = null // 被按下的按钮 action
    this.fx = null // 全屏闪色 { color, t, dur, alpha }
    this.listScroll = 0 // 排行榜滚动偏移
    this._listMetrics = null // 排行榜视口几何，绘制时回填供 scrollBy 夹取
  }

  /** 绑定离屏画布与尺寸（css 尺寸 + 像素缩放） */
  attach(canvas, cssW, cssH, scale) {
    this.canvas = canvas
    canvas.width = Math.max(2, Math.floor(cssW * scale))
    canvas.height = Math.max(2, Math.floor(cssH * scale))
    this.ctx = canvas.getContext('2d')
    this.w = cssW
    this.h = cssH
    this.scale = scale
    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
  }

  setView(view) {
    const changed = !this.view || this.view.screen !== view.screen
    this.view = view
    this.hotspots = []
    if (changed) {
      // 换页时重置入场计时与滚动位置，否则排行榜会停在上次的位置
      this.screenT = 0
      this.listScroll = 0
      this.pressed = null
    }
  }

  /** 按钮按下态（main.js 在 touch start/move/end 时维护） */
  setPressed(action) {
    this.pressed = action || null
  }

  /** 排行榜拖动滚动（由 main.js 在非飞行状态下转发触摸位移） */
  scrollBy(dy) {
    const m = this._listMetrics
    if (!m || m.maxScroll <= 0 || !dy) return
    this.listScroll = Math.max(0, Math.min(m.maxScroll, this.listScroll + dy))
  }

  /** 尺寸变化（浏览器窗口缩放；小游戏端竖屏锁定，一般不触发） */
  resize(cssW, cssH, scale) {
    if (!this.canvas) return
    this.canvas.width = Math.max(2, Math.floor(cssW * scale))
    this.canvas.height = Math.max(2, Math.floor(cssH * scale))
    this.w = cssW
    this.h = cssH
    this.scale = scale
  }

  showToast(text, dur) {
    this.toast = { text, t: 0, dur: dur || 2.2 }
  }

  /** 全屏闪色反馈（受击/触发咒语） */
  flash(color, dur, alpha) {
    this.fx = { color: color || '#d23b3b', t: 0, dur: dur || 0.4, alpha: alpha == null ? 0.5 : alpha }
  }

  /** 触摸（css 坐标）→ 动作 id 或 null */
  hitTest(x, y) {
    for (const h of this.hotspots) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.action
    }
    return null
  }

  // ---------------- 绘制入口 ----------------
  draw(dt) {
    const ctx = this.ctx
    if (!ctx) return
    this.anim += dt
    this.screenT += dt
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    const v = this.view
    if (v.screen === 'menu') this._drawMenu(v)
    else if (v.screen === 'playing' || v.screen === 'spell') {
      this._drawHud(v)
      if (v.screen === 'spell') this._drawSpell(v)
    } else if (v.screen === 'paused') {
      this._drawHud(v)
      this._drawPaused(v)
    } else if (v.screen === 'gameover') {
      // 结算页不再叠 HUD：分数由卡片自己展示，避免冲刺条/无敌提示残留
      this._drawGameOver(v)
    } else if (v.screen === 'leaderboard') {
      this._drawLeaderboard(v)
    }
    this._drawFx(dt)
    this._drawToast(dt)
    if (this.texture) this.texture.needsUpdate = true
  }

  /** 受击闪屏：中心透、四周浓的暗角 + 一层快速衰减的纯色 */
  _drawFx(dt) {
    if (!this.fx) return
    const f = this.fx
    f.t += dt
    const p = f.t / f.dur
    if (p >= 1) {
      this.fx = null
      return
    }
    const ctx = this.ctx
    const falloff = 1 - p
    ctx.globalAlpha = falloff * falloff * f.alpha
    ctx.fillStyle = f.color
    ctx.fillRect(0, 0, this.w, this.h)
    const g = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      Math.min(this.w, this.h) * 0.22,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.62
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.globalAlpha = falloff * 0.9
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.globalAlpha = 1
  }

  // ---------------- 基础件 ----------------
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  _fillRR(x, y, w, h, r, color) {
    this._roundRect(x, y, w, h, r)
    this.ctx.fillStyle = color
    this.ctx.fill()
  }

  _ease(t) {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
  }

  /** 入场进度：delay 之后用 dur 秒播完（透明度 + 上移由 _withEnter 统一处理） */
  _enter(delay, dur) {
    return this._ease((this.screenT - (delay || 0)) / (dur || 0.42))
  }

  _withEnter(delay, fn) {
    const p = this._enter(delay)
    if (p <= 0) return
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = p
    ctx.translate(0, (1 - p) * 16)
    fn()
    ctx.restore()
  }

  _panel(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(16,28,46,0.22)'
    ctx.shadowBlur = 26
    ctx.shadowOffsetY = 10
    this._roundRect(x, y, w, h, r == null ? 20 : r)
    ctx.fillStyle = THEME.paper
    ctx.fill()
    ctx.restore()
    this._roundRect(x, y, w, h, r == null ? 20 : r)
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  /** 胶囊小标签（3D 场景上保证可读） */
  _chip(text, cx, cy, opts) {
    const o = opts || {}
    const ctx = this.ctx
    ctx.font = `${o.bold ? 'bold ' : ''}${o.size || 12}px ${o.kai ? KAI : FONT}`
    const tw = ctx.measureText(text).width
    const w = tw + (o.pad || 24)
    const h = o.h || 26
    this._fillRR(cx - w / 2, cy - h / 2, w, h, h / 2, o.bg || THEME.glass)
    if (o.border) {
      this._roundRect(cx - w / 2, cy - h / 2, w, h, h / 2)
      ctx.strokeStyle = o.border
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.fillStyle = o.color || 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, cy + 0.5)
    ctx.textBaseline = 'alphabetic'
    return w
  }

  _button(action, x, y, w, h, label, opts) {
    const ctx = this.ctx
    const o = opts || {}
    const down = this.pressed === action
    const dy = down ? 1.5 : 0
    const r = o.r == null ? 14 : o.r
    ctx.save()
    // 主按钮带投影，按下时投影收敛、整体下沉，形成"按下去"的体感
    if (!o.ghost && !o.flat) {
      ctx.shadowColor = down ? 'rgba(198,79,31,0.18)' : 'rgba(198,79,31,0.32)'
      ctx.shadowBlur = down ? 6 : 16
      ctx.shadowOffsetY = down ? 2 : 6
    }
    this._roundRect(x, y + dy, w, h, r)
    if (o.gradient !== false && !o.bg && !o.ghost) {
      const g = ctx.createLinearGradient(0, y + dy, 0, y + dy + h)
      g.addColorStop(0, down ? '#d5571f' : '#f0733c')
      g.addColorStop(1, down ? '#b8481a' : THEME.accentDeep)
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = o.bg || (o.ghost ? 'rgba(255,255,255,0.16)' : THEME.accent)
    }
    ctx.fill()
    ctx.restore()
    if (o.border) {
      this._roundRect(x, y + dy, w, h, r)
      ctx.strokeStyle = o.border
      ctx.lineWidth = o.borderWidth || 1
      ctx.stroke()
    }
    if (!o.ghost && !o.bg && o.sheen !== false) {
      // 顶部一道高光，塑料感少一点、质感多一点
      this._roundRect(x + 1, y + dy + 1, w - 2, h * 0.46, r - 1)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fill()
    }
    ctx.fillStyle = o.color || '#fff'
    ctx.font = `${o.bold === false ? '' : 'bold '}${o.size || 17}px ${o.kai ? KAI : FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + dy + h / 2 + 1)
    ctx.textBaseline = 'alphabetic'
    this.hotspots.push({ action, x, y, w, h })
  }

  /** 圆形序号/字母徽章 */
  _badge(text, cx, cy, r, opts) {
    const o = opts || {}
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = o.bg || THEME.accentSoft
    ctx.fill()
    if (o.border) {
      ctx.strokeStyle = o.border
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.fillStyle = o.color || THEME.accent
    ctx.font = `bold ${o.size || 12}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, cy + 0.5)
    ctx.textBaseline = 'alphabetic'
  }

  _feather(x, y, r, alive) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.5)
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.quadraticCurveTo(r * 0.9, -r * 0.2, 0, r)
    ctx.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r)
    ctx.fillStyle = alive ? THEME.gold : 'rgba(255,255,255,0.22)'
    ctx.fill()
    ctx.strokeStyle = alive ? 'rgba(150,100,20,0.85)' : 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.9)
    ctx.lineTo(0, r * 0.9)
    ctx.strokeStyle = alive ? 'rgba(150,100,20,0.7)' : 'rgba(255,255,255,0.3)'
    ctx.stroke()
    ctx.restore()
  }

  // ---------------- 主菜单 ----------------
  _drawMenu(v) {
    const ctx = this.ctx
    const w = this.w
    const h = this.h
    const cx = w / 2

    this._withEnter(0, () => {
      this._chip('3D 飞行 × 名句默写', cx, h * 0.105, { size: 12, bg: THEME.glassSoft })
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 52px ' + KAI
      ctx.shadowColor = 'rgba(20,40,80,0.5)'
      ctx.shadowBlur = 16
      ctx.fillText('风翼诗咒', cx, h * 0.175)
      ctx.shadowBlur = 0
      ctx.font = `15px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillText('御风而行 · 以诗为咒', cx, h * 0.175 + 32)
      ctx.font = `10px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      ctx.fillText('W I N D W I N G   V E R S E', cx, h * 0.175 + 54)
    })

    // 玩法卡：三条编号说明，避免一大段文字墙
    const pw = Math.min(w - 44, 340)
    const px = (w - pw) / 2
    const py = h * 0.3
    const ph = 166
    this._withEnter(0.08, () => {
      this._panel(px, py, pw, ph)
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.ink
      ctx.font = `bold 15px ${FONT}`
      ctx.fillText('三步上手', px + 20, py + 30)
      const rules = [
        '拖动驾驶风之翼，躲开巨石与雷云',
        '撞上发光诗碑，限时填句触发诗咒',
        '答对冲刺清障；答错或超时坠落',
      ]
      rules.forEach((t, i) => {
        const ry = py + 58 + i * 34
        this._badge(String(i + 1), px + 30, ry - 4, 10, { size: 11 })
        ctx.font = `13px ${FONT}`
        ctx.fillStyle = THEME.sub
        ctx.fillText(t, px + 48, ry)
      })
    })

    const bw = Math.min(w - 72, 300)
    const bx = (w - bw) / 2
    const by = py + ph + 26
    this._withEnter(0.16, () => {
      this._button('start', bx, by, bw, 54, '开 始 御 风', { size: 21 })
    })
    this._withEnter(0.22, () => {
      const gw = (bw - 12) / 2
      const ghost = {
        size: 14,
        bg: 'rgba(255,253,248,0.92)',
        color: THEME.ink,
        border: 'rgba(31,45,61,0.10)',
        bold: false,
        flat: true,
        gradient: false,
        sheen: false,
      }
      this._button('leaderboard', bx, by + 66, gw, 44, '御风榜', ghost)
      this._button('nickname', bx + gw + 12, by + 66, gw, 44, `昵称 · ${v.nickname || '无名御风者'}`, Object.assign({}, ghost, { size: 12 }))
    })

    // 底部信息：深胶囊托底，白字不再埋进云海
    this._withEnter(0.3, () => {
      const bestTxt = v.best ? `本机最佳 ${v.best.score} 分 · ${v.best.distance} m` : '本机暂无记录，飞一局看看'
      this._chip(bestTxt, cx, h - 56, { size: 12, bg: THEME.glassSoft, h: 28 })
      ctx.textAlign = 'center'
      ctx.font = `11px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.fillText(`内置题库 ${v.poemCount || 0} 组名句 · 撞普通障碍掉一片风羽，三片尽则坠落`, cx, h - 24)
    })
  }

  // ---------------- HUD ----------------
  _drawHud(v) {
    const ctx = this.ctx
    const hud = v.hud || {}

    // 左上：玻璃信息胶囊（分数 / 距离 / 速度）
    const px = 14
    const py = 14
    const pw = 162
    const ph = 86
    this._fillRR(px, py, pw, ph, 16, THEME.glassSoft)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px ' + FONT
    ctx.fillText(String(hud.score || 0), px + 12, py + 34)
    const scoreW = ctx.measureText(String(hud.score || 0)).width
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('分', px + 16 + scoreW, py + 34)

    ctx.font = `12px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.fillText(`距离 ${Math.floor(hud.distance || 0)} m`, px + 12, py + 54)

    // 速度条：金色=当前速度，红色段=被撞掉还没恢复的赤字
    const spd = hud.speed || 0
    const ratio = Math.max(0, Math.min(1, hud.speedRatio || 0))
    const cruise = Math.max(ratio, Math.min(1, hud.cruiseRatio || 0))
    const bx = px + 12
    const by = py + 66
    const bw = 96
    this._fillRR(bx, by, bw, 5, 2.5, 'rgba(255,255,255,0.22)')
    if (cruise > ratio) this._fillRR(bx + bw * ratio, by, bw * (cruise - ratio), 5, 2.5, 'rgba(255,120,110,0.85)')
    this._fillRR(bx, by, Math.max(3, bw * ratio), 5, 2.5, THEME.gold)
    ctx.font = `bold 12px ${FONT}`
    ctx.fillStyle = '#fff'
    ctx.fillText(`${spd.toFixed(0)}`, bx + bw + 8, by + 9)
    ctx.font = `10px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('m/s', bx + bw + 26, by + 9)
    if ((hud.deficit || 0) > 0.4) {
      ctx.font = `bold 11px ${FONT}`
      ctx.fillStyle = '#ff9c8a'
      ctx.textAlign = 'right'
      ctx.fillText(`-${hud.deficit.toFixed(1)}`, px + pw - 10, py + 54)
      ctx.textAlign = 'left'
    }

    // 右上：风羽 + 暂停
    const maxFeathers = C.RULES.feathers
    const feathers = hud.feathers == null ? maxFeathers : hud.feathers
    for (let i = 0; i < maxFeathers; i++) {
      this._feather(this.w - 26 - i * 28, 36, 11, i < feathers)
    }
    if (v.screen === 'playing') {
      const cx = this.w - 32
      const cy = 76
      const down = this.pressed === 'pause'
      ctx.beginPath()
      ctx.arc(cx, cy + (down ? 1 : 0), 17, 0, Math.PI * 2)
      ctx.fillStyle = down ? 'rgba(16,28,46,0.55)' : THEME.glassSoft
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillRect(cx - 5, cy - 6 + (down ? 1 : 0), 3.5, 12)
      ctx.fillRect(cx + 2, cy - 6 + (down ? 1 : 0), 3.5, 12)
      this.hotspots.push({ action: 'pause', x: cx - 22, y: cy - 22, w: 44, h: 44 })
    }

    // combo
    if (hud.combo > 1) {
      this._chip(`诗咒连对 ×${hud.combo}`, this.w / 2, 32, {
        size: 13,
        bold: true,
        bg: 'rgba(242,185,80,0.94)',
        color: '#5a3a10',
        h: 28,
      })
    }

    // 无敌提示
    if (hud.invincible) {
      this._chip('无敌中', this.w / 2, this.h - 30, { size: 13, bg: THEME.glassSoft, h: 28 })
    }

    // 新手提示（前几秒）
    if (hud.showHint) {
      const a = 0.95 * Math.max(0, 1 - (hud.hintT || 0) / 4)
      if (a > 0.02) {
        ctx.globalAlpha = a
        this._chip('按住并拖动 · 驾驶风之翼', this.w / 2, this.h - 62, { size: 13, bg: THEME.glass, h: 32 })
        ctx.globalAlpha = 1
      }
    }

    // 冲刺条（仅飞行中）
    if (hud.boosting && v.screen === 'playing') {
      const bw = this.w - 140
      this._fillRR(70, this.h - 16, bw, 5, 2.5, 'rgba(255,255,255,0.28)')
      this._fillRR(70, this.h - 16, bw * Math.max(0, Math.min(1, hud.boostT || 0)), 5, 2.5, THEME.gold)
    }
  }

  // ---------------- 诗咒界面 ----------------
  _drawSpell(v) {
    const ctx = this.ctx
    const s = v.spell || {}
    ctx.fillStyle = THEME.dim
    ctx.fillRect(0, 0, this.w, this.h)

    const pw = Math.min(this.w - 36, 360)
    const px = (this.w - pw) / 2
    const ph = 424
    const py = (this.h - ph) / 2 - 8

    // 卡片弹入：缩放 + 淡入
    const pop = this._ease(this.screenT / 0.28)
    ctx.save()
    ctx.globalAlpha = Math.min(1, pop * 1.4)
    ctx.translate(px + pw / 2, py + ph / 2)
    ctx.scale(0.94 + 0.06 * pop, 0.94 + 0.06 * pop)
    ctx.translate(-(px + pw / 2), -(py + ph / 2))

    this._panel(px, py, pw, ph, 22)

    // 标题 + 倒计时
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.accent
    ctx.font = `bold 21px ${KAI}`
    ctx.fillText('诗 咒 · 名 句 默 写', px + pw / 2, py + 36)
    const ratio = s.timeRatio == null ? 1 : s.timeRatio
    const urgent = ratio <= 0.3
    ctx.textAlign = 'right'
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = urgent ? THEME.bad : THEME.faint
    const secs = s.timeLeft == null ? Math.ceil(ratio * C.RULES.spellTime) : s.timeLeft
    ctx.fillText(s.resolved ? '已揭晓' : `还剩 ${secs} s`, px + pw - 24, py + 62)
    const bw = pw - 48
    this._fillRR(px + 24, py + 52, bw, 7, 3.5, 'rgba(31,45,61,0.10)')
    this._fillRR(px + 24, py + 52, Math.max(4, bw * ratio), 7, 3.5, urgent ? THEME.bad : THEME.teal)

    // 题干（挖空高亮；支持多挖空）
    const prompt = s.prompt || ''
    const parts = prompt.split('____')
    const maxW = pw - 44
    let size = 22
    ctx.font = `${size}px ${KAI}`
    const measure = () => parts.join('＿＿')
    while (ctx.measureText(measure()).width > maxW && size > 11) {
      size--
      ctx.font = `${size}px ${KAI}`
    }
    const totalW = ctx.measureText(measure()).width
    let cx = px + pw / 2 - totalW / 2
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const ty = py + 116
    const drawPart = (t, highlight) => {
      if (!t) return
      ctx.fillStyle = highlight ? THEME.accent : THEME.ink
      ctx.fillText(t, cx, ty)
      cx += ctx.measureText(t).width
    }
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) drawPart('＿＿', true)
      drawPart(parts[i], false)
    }
    ctx.textBaseline = 'alphabetic'

    if (s.resolved && s.source) {
      ctx.textAlign = 'center'
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = THEME.sub
      ctx.fillText(`—— ${s.source} ——`, px + pw / 2, ty + 32)
    }

    // 选项：圆形字母徽章 + 左对齐诗句，避免以前 A/B/C/D 几乎隐形
    const ow = (pw - 36 - 12) / 2
    const oh = 62
    const oy0 = py + 168
    const opts = s.options || []
    for (let i = 0; i < opts.length; i++) {
      const col = i % 2
      const row = Math.floor(i / 2)
      const ox = px + 18 + col * (ow + 12)
      const oy = oy0 + row * (oh + 12)
      const action = 'spell:' + i
      let bg = 'rgba(31,45,61,0.05)'
      let border = 'rgba(31,45,61,0.14)'
      let color = THEME.ink
      let badgeBg = 'rgba(31,45,61,0.08)'
      let badgeColor = THEME.sub
      if (this.pressed === action && !s.resolved) {
        bg = THEME.accentSoft
        border = THEME.accent
        badgeBg = THEME.accent
        badgeColor = '#fff'
      }
      if (s.resolved) {
        if (opts[i].correct) {
          bg = 'rgba(46,158,91,0.14)'
          border = THEME.good
          color = THEME.good
          badgeBg = THEME.good
          badgeColor = '#fff'
        } else if (s.selected === i) {
          bg = 'rgba(210,59,59,0.12)'
          border = THEME.bad
          color = THEME.bad
          badgeBg = THEME.bad
          badgeColor = '#fff'
        } else {
          color = THEME.faint
        }
      }
      this._fillRR(ox, oy, ow, oh, 12, bg)
      this._roundRect(ox, oy, ow, oh, 12)
      ctx.strokeStyle = border
      ctx.lineWidth = 1.4
      ctx.stroke()
      this._badge(String.fromCharCode(65 + i), ox + 22, oy + oh / 2, 11, { bg: badgeBg, color: badgeColor, size: 12 })
      const label = opts[i].text || ''
      let size = 16
      ctx.font = `${size}px ${KAI}`
      while (ctx.measureText(label).width > ow - 52 && size > 11) {
        size--
        ctx.font = `${size}px ${KAI}`
      }
      ctx.fillStyle = color
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, ox + 40, oy + oh / 2 + 1)
      ctx.textBaseline = 'alphabetic'
      if (!s.resolved) this.hotspots.push({ action, x: ox, y: oy, w: ow, h: oh })
    }

    // 底部提示 / 结果
    ctx.textAlign = 'center'
    if (s.resolved) {
      const ok = s.outcome === 'correct'
      ctx.fillStyle = ok ? THEME.good : THEME.bad
      ctx.font = `bold 18px ${KAI}`
      ctx.fillText(ok ? '咒语生效 · 风墙冲击！' : s.outcome === 'timeout' ? '时间到 · 诗咒反噬' : '答错了 · 诗咒反噬', px + pw / 2, py + ph - 24)
    } else {
      ctx.fillStyle = THEME.faint
      ctx.font = `12px ${FONT}`
      ctx.fillText('点选正确诗句，接通这一句风', px + pw / 2, py + ph - 24)
    }
    ctx.restore()
  }

  // ---------------- 暂停 ----------------
  _drawPaused(v) {
    const ctx = this.ctx
    ctx.fillStyle = THEME.dim
    ctx.fillRect(0, 0, this.w, this.h)
    const pw = Math.min(this.w - 64, 320)
    const px = (this.w - pw) / 2
    const ph = 330
    const py = (this.h - ph) / 2
    this._panel(px, py, pw, ph, 22)
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = `bold 28px ${KAI}`
    ctx.fillText('暂 停', px + pw / 2, py + 52)
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = THEME.sub
    ctx.fillText('风仍在原地等你', px + pw / 2, py + 76)
    const bw = pw - 48
    const bx = px + 24
    this._button('resume', bx, py + 104, bw, 50, '继 续 飞 行', { size: 18 })
    const ghost = {
      size: 15,
      bg: 'rgba(31,45,61,0.06)',
      color: THEME.ink,
      border: 'rgba(31,45,61,0.12)',
      bold: false,
      flat: true,
      gradient: false,
      sheen: false,
    }
    this._button('retry', bx, py + 168, bw, 44, '重新开始', ghost)
    this._button('home', bx, py + 224, bw, 44, '回主界面', ghost)
  }

  // ---------------- 结算 ----------------
  _drawGameOver(v) {
    const ctx = this.ctx
    const r = v.result || {}
    ctx.fillStyle = 'rgba(12,22,40,0.48)'
    ctx.fillRect(0, 0, this.w, this.h)

    const pw = Math.min(this.w - 40, 340)
    const px = (this.w - pw) / 2
    const ph = 486
    const py = Math.max(24, (this.h - ph) / 2)

    const pop = this._ease(this.screenT / 0.32)
    ctx.save()
    ctx.globalAlpha = Math.min(1, pop * 1.5)
    ctx.translate(0, (1 - pop) * 24)

    this._panel(px, py, pw, ph, 22)

    ctx.textAlign = 'center'
    ctx.fillStyle = r.cause === 'spell' ? THEME.bad : THEME.ink
    ctx.font = `bold 28px ${KAI}`
    ctx.fillText(r.cause === 'spell' ? '诗咒反噬' : '风羽耗尽', px + pw / 2, py + 46)
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = THEME.sub
    ctx.fillText(r.cause === 'spell' ? '一句诗没有接上，风之翼失去了浮力' : '巨石与雷云之后，再无风羽', px + pw / 2, py + 72)

    if (r.isBest) {
      this._chip('新 纪 录', px + pw / 2, py + 98, {
        size: 12,
        bold: true,
        bg: THEME.gold,
        color: '#5a3a10',
        h: 24,
      })
    }

    // 分数 count-up：让结算有一个"落地"的过程
    const shown = Math.round((r.score || 0) * this._ease(this.screenT / 0.85))
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 46px ' + FONT
    ctx.fillText(String(shown), px + pw / 2, py + 164)
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = THEME.faint
    ctx.fillText('总 分', px + pw / 2, py + 184)

    const stats = [
      ['飞行距离', `${Math.floor(r.distance || 0)} m`],
      ['最高连对', `×${r.combo || 0}`],
      ['诗咒答对', `${r.spellCorrect || 0}/${r.spellTotal || 0}`],
      ['本机排名', r.rank ? `第 ${r.rank} 名` : '未上榜'],
    ]
    const gw = (pw - 48 - 12) / 2
    stats.forEach((st, i) => {
      const gx = px + 24 + (i % 2) * (gw + 12)
      const gy = py + 206 + Math.floor(i / 2) * 62
      this._fillRR(gx, gy, gw, 54, 12, 'rgba(31,45,61,0.045)')
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.faint
      ctx.font = `11px ${FONT}`
      ctx.fillText(st[0], gx + gw / 2, gy + 20)
      ctx.fillStyle = THEME.ink
      ctx.font = `bold 18px ${FONT}`
      ctx.fillText(st[1], gx + gw / 2, gy + 41)
    })

    const bw = pw - 48
    const bx = px + 24
    let by = py + ph - 142
    this._button('retry', bx, by, bw, 48, '重 新 起 飞', { size: 19 })
    by += 58
    const ghost = {
      size: 14,
      bg: 'rgba(31,45,61,0.06)',
      color: THEME.ink,
      border: 'rgba(31,45,61,0.12)',
      bold: false,
      flat: true,
      gradient: false,
      sheen: false,
    }
    this._button('leaderboard', bx, by, (bw - 12) / 2, 42, '御风榜', ghost)
    this._button('home', bx + (bw + 12) / 2, by, (bw - 12) / 2, 42, '回主界面', ghost)
    ctx.restore()
  }

  // ---------------- 排行榜 ----------------
  _drawLeaderboard(v) {
    const ctx = this.ctx
    ctx.fillStyle = THEME.dim
    ctx.fillRect(0, 0, this.w, this.h)

    const list = v.leaderboard || []
    const pw = Math.min(this.w - 40, 360)
    const px = (this.w - pw) / 2
    // 面板高度随内容收拢：只有一两条记录时不再留一整面空白
    const ph = Math.min(this.h - 120, Math.max(330, 96 + Math.min(list.length, 8) * 44 + 84))
    const py = (this.h - ph) / 2
    this._panel(px, py, pw, ph, 22)

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = `bold 24px ${KAI}`
    ctx.fillText('御 风 榜', px + pw / 2, py + 42)
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = THEME.faint
    ctx.fillText(
      list.length ? `成绩保存在本机 · 共 ${list.length} 条 · 上下拖动查看` : '成绩保存在本机',
      px + pw / 2,
      py + 64
    )

    const btnY = py + ph - 62
    const viewTop = py + 82
    const viewH = Math.max(60, btnY - 14 - viewTop)
    const rowH = 44
    const contentH = list.length * rowH
    const maxScroll = Math.max(0, contentH - viewH)
    this.listScroll = Math.max(0, Math.min(maxScroll, this.listScroll))
    this._listMetrics = { rowH, viewTop, viewH, contentH, maxScroll }

    ctx.save()
    ctx.beginPath()
    ctx.rect(px + 6, viewTop, pw - 12, viewH)
    ctx.clip()

    if (!list.length) {
      this._feather(px + pw / 2, viewTop + 52, 26, true)
      ctx.fillStyle = THEME.sub
      ctx.font = `14px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillText('还没有记录，先去飞一局吧', px + pw / 2, viewTop + 104)
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = THEME.faint
      ctx.fillText('第一句诗，等你来接上', px + pw / 2, viewTop + 128)
    }

    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      const y = viewTop + i * rowH - this.listScroll
      if (y + rowH < viewTop || y > viewTop + viewH) continue
      const rx = px + 16
      const rw = pw - 32 - (maxScroll > 0 ? 8 : 0)
      if (i % 2 === 0) this._fillRR(rx, y, rw, rowH - 4, 10, 'rgba(31,45,61,0.04)')
      // 名次：前三用奖牌色徽章
      const medal = i === 0 ? '#e7b43c' : i === 1 ? '#a8b0bc' : i === 2 ? '#c88a52' : null
      if (medal) this._badge(String(i + 1), rx + 22, y + rowH / 2 - 1, 12, { bg: medal, color: '#fff', size: 12 })
      else {
        ctx.textAlign = 'center'
        ctx.font = `bold 14px ${FONT}`
        ctx.fillStyle = THEME.faint
        ctx.fillText(String(i + 1), rx + 22, y + rowH / 2 + 4)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.ink
      ctx.font = `14px ${FONT}`
      ctx.fillText(e.name || '无名御风者', rx + 44, y + rowH / 2)
      ctx.font = `11px ${FONT}`
      ctx.fillStyle = THEME.faint
      ctx.fillText(`${Math.floor(e.distance || 0)}m · 连对 ×${e.combo || 0}`, rx + 44, y + rowH / 2 + 15)
      ctx.textAlign = 'right'
      ctx.fillStyle = THEME.accent
      ctx.font = `bold 17px ${FONT}`
      ctx.fillText(String(e.score || 0), rx + rw - 14, y + rowH / 2 + 4)
    }
    ctx.restore()

    if (maxScroll > 0) {
      const trackX = px + pw - 10
      const trackH = viewH
      const knobH = Math.max(24, (viewH / contentH) * trackH)
      const knobY = viewTop + (this.listScroll / maxScroll) * (trackH - knobH)
      this._fillRR(trackX, viewTop, 4, trackH, 2, 'rgba(31,45,61,0.10)')
      this._fillRR(trackX, knobY, 4, knobH, 2, 'rgba(31,45,61,0.40)')
    }

    this._button('back', px + 24, btnY, pw - 48, 46, '返 回', { size: 17 })
  }

  // ---------------- Toast ----------------
  _drawToast(dt) {
    if (!this.toast) return
    const t = this.toast
    t.t += dt
    if (t.t > t.dur) {
      this.toast = null
      return
    }
    const ctx = this.ctx
    const alpha = t.t < 0.22 ? t.t / 0.22 : t.t > t.dur - 0.4 ? Math.max(0, (t.dur - t.t) / 0.4) : 1
    ctx.font = `bold 14px ${FONT}`
    const tw = ctx.measureText(t.text).width + 44
    const x = (this.w - tw) / 2
    const y = this.h * 0.15
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(0, (1 - Math.min(1, t.t / 0.22)) * -8)
    this._fillRR(x, y, tw, 38, 19, 'rgba(16,28,46,0.88)')
    ctx.beginPath()
    ctx.arc(x + 18, y + 19, 4, 0, Math.PI * 2)
    ctx.fillStyle = THEME.gold
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t.text, this.w / 2 + 6, y + 20)
    ctx.restore()
    ctx.textBaseline = 'alphabetic'
  }
}

module.exports = { UI }
