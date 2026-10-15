/**
 * UI 层：离屏 2D 画布绘制 + 触摸命中测试
 * 画面状态全部由 main.js 通过 setView() 推入，本层只负责画和报点击区域。
 */

const THREE = require('../libs/three.min.js')

const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif'
const KAI = '"KaiTi", "STKaiti", "PingFang SC", serif'

const THEME = {
  ink: '#22304a',
  sub: '#5b6b86',
  paper: 'rgba(255,253,248,0.96)',
  accent: '#e8622d',
  accent2: '#1fa8a0',
  gold: '#f2b950',
  good: '#2e9e5b',
  bad: '#d23b3b',
  dim: 'rgba(12,22,40,0.55)',
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
    this.fx = null // 全屏闪色 { color, t, dur, alpha }
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
    this.view = view
    this.hotspots = []
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
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    const v = this.view
    if (v.screen === 'menu') this._drawMenu(v)
    else if (v.screen === 'playing' || v.screen === 'spell') {
      this._drawHud(v)
      if (v.screen === 'spell') this._drawSpell(v)
    } else if (v.screen === 'gameover') {
      this._drawHud(v)
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
    // 边缘暗角（在纯色之上再叠一层中心渐隐）
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

  _button(action, x, y, w, h, label, opts) {
    const ctx = this.ctx
    const o = opts || {}
    const bg = o.bg || (o.ghost ? 'rgba(255,255,255,0.14)' : THEME.accent)
    this._roundRect(x, y, w, h, o.r == null ? 14 : o.r)
    ctx.fillStyle = bg
    ctx.fill()
    if (o.border) {
      ctx.strokeStyle = o.border
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = o.color || '#fff'
    ctx.font = `${o.bold ? 'bold ' : ''}${o.size || 18}px ${o.kai ? KAI : FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2 + 1)
    this.hotspots.push({ action, x, y, w, h })
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
    ctx.fillStyle = alive ? THEME.gold : 'rgba(120,130,150,0.35)'
    ctx.fill()
    ctx.strokeStyle = alive ? 'rgba(160,110,20,0.8)' : 'rgba(120,130,150,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.9)
    ctx.lineTo(0, r * 0.9)
    ctx.strokeStyle = alive ? 'rgba(160,110,20,0.7)' : 'rgba(120,130,150,0.4)'
    ctx.stroke()
    ctx.restore()
  }

  _wrap(text, font, maxW) {
    const ctx = this.ctx
    ctx.font = font
    const lines = []
    let cur = ''
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur)
        cur = ch
      } else {
        cur += ch
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  _panel(x, y, w, h, r) {
    const ctx = this.ctx
    this._roundRect(x, y, w, h, r == null ? 18 : r)
    ctx.fillStyle = THEME.paper
    ctx.fill()
    ctx.strokeStyle = 'rgba(34,48,74,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // ---------------- 主菜单 ----------------
  _drawMenu(v) {
    const ctx = this.ctx
    const w = this.w
    // 标题
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = 'bold 52px ' + KAI
    ctx.shadowColor = 'rgba(20,40,80,0.45)'
    ctx.shadowBlur = 14
    ctx.fillText('风翼诗咒', w / 2, this.h * 0.2)
    ctx.shadowBlur = 0
    ctx.font = `16px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('御风而行 · 以诗为咒', w / 2, this.h * 0.2 + 40)

    // 玩法说明卡
    const pw = Math.min(w - 48, 340)
    const px = (w - pw) / 2
    const py = this.h * 0.3
    this._panel(px, py, pw, 176)
    ctx.textAlign = 'left'
    ctx.fillStyle = THEME.ink
    ctx.font = `bold 17px ${FONT}`
    ctx.fillText('玩法', px + 20, py + 32)
    ctx.font = `14px ${FONT}`
    ctx.fillStyle = THEME.sub
    const rules = [
      '· 拖动屏幕驾驶风之翼，躲避浮空巨石与雷云',
      '· 撞上发光诗碑 → 触发「诗咒」：限时填句',
      '· 答对：无敌冲刺 + 清障 + 加分；答错/超时：坠落',
      '· 普通障碍撞一次掉一片风羽，三片尽则坠落',
    ]
    rules.forEach((t, i) => ctx.fillText(t, px + 20, py + 60 + i * 26))

    // 按钮
    const bw = Math.min(w - 80, 300)
    const bx = (w - bw) / 2
    let by = this.h * 0.3 + 176 + 28
    this._button('start', bx, by, bw, 56, '开 始 御 风', { size: 22, bold: true })
    by += 68
    this._button('leaderboard', bx, by, bw, 46, '本地排行榜', { size: 17, bg: 'rgba(255,255,255,0.9)', color: THEME.ink, border: 'rgba(34,48,74,0.2)' })
    by += 58
    this._button('nickname', bx, by, bw, 46, `昵称：${v.nickname || '无名御风者'}`, { size: 15, bg: 'rgba(255,255,255,0.75)', color: THEME.ink, border: 'rgba(34,48,74,0.18)' })

    // 底部信息
    ctx.textAlign = 'center'
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    const bestTxt = v.best ? `本机最佳：${v.best.score} 分 · 最远 ${v.best.distance} m` : '本机暂无记录，飞一局看看'
    ctx.fillText(bestTxt, w / 2, this.h - 34)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`内置题库 ${v.poemCount || 0} 组名句`, w / 2, this.h - 18)
  }

  // ---------------- HUD ----------------
  _drawHud(v) {
    const ctx = this.ctx
    const hud = v.hud || {}
    // 分数
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(20,40,80,0.5)'
    ctx.shadowBlur = 8
    ctx.font = 'bold 34px ' + FONT
    ctx.fillText(String(hud.score || 0), 18, 48)
    ctx.shadowBlur = 0
    ctx.font = `13px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(`距离 ${Math.floor(hud.distance || 0)} m`, 18, 70)

    // 速度表：金色=当前速度，红色段=被撞击拖掉的那截（会随时间恢复）
    const spd = hud.speed || 0
    const ratio = Math.max(0, Math.min(1, hud.speedRatio || 0))
    const cruise = Math.max(ratio, Math.min(1, hud.cruiseRatio || 0))
    const bx = 18
    const by = 80
    const bw = 116
    const bh = 7
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    this._roundRect(bx, by, bw, bh, 3)
    ctx.fill()
    if (cruise > ratio) {
      // 赤字（掉速）区间
      ctx.fillStyle = 'rgba(210,59,59,0.75)'
      this._roundRect(bx + bw * ratio, by, bw * (cruise - ratio), bh, 3)
      ctx.fill()
    }
    ctx.fillStyle = THEME.gold
    this._roundRect(bx, by, Math.max(3, bw * ratio), bh, 3)
    ctx.fill()
    ctx.font = `bold 12px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(`${spd.toFixed(0)}`, bx + bw + 8, by + 8)
    ctx.font = `10px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('m/s', bx + bw + 30, by + 8)
    if ((hud.deficit || 0) > 0.4) {
      ctx.font = `bold 11px ${FONT}`
      ctx.fillStyle = THEME.bad
      ctx.fillText(`-${(hud.deficit).toFixed(1)}`, bx + bw + 54, by + 8)
    }

    // 风羽
    const feathers = hud.feathers == null ? 3 : hud.feathers
    for (let i = 0; i < 3; i++) {
      this._feather(this.w - 26 - i * 30, 44, 11, i < feathers)
    }

    // combo
    if (hud.combo > 1) {
      const txt = `诗咒连对 ×${hud.combo}`
      ctx.font = `bold 15px ${FONT}`
      const tw = ctx.measureText(txt).width
      this._roundRect(this.w - 24 - tw - 18, 62, tw + 18, 26, 13)
      ctx.fillStyle = 'rgba(242,185,80,0.92)'
      ctx.fill()
      ctx.fillStyle = '#5a3a10'
      ctx.textAlign = 'center'
      ctx.fillText(txt, this.w - 24 - tw / 2 - 9, 79)
    }

    // 无敌提示
    if (hud.invincible) {
      ctx.textAlign = 'center'
      ctx.font = `bold 14px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText('无敌中', this.w / 2, this.h - 26)
    }

    // 新手提示（前几秒）
    if (hud.showHint) {
      ctx.textAlign = 'center'
      ctx.font = `14px ${FONT}`
      ctx.fillStyle = `rgba(255,255,255,${0.85 * Math.max(0, 1 - (hud.hintT || 0) / 3)})`
      ctx.fillText('拖动屏幕 · 驾驶风之翼', this.w / 2, this.h - 52)
    }

    // 冲刺条
    if (hud.boosting) {
      const bw = this.w - 120
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      this._roundRect(60, this.h - 18, bw, 6, 3)
      ctx.fill()
      ctx.fillStyle = THEME.gold
      this._roundRect(60, this.h - 18, bw * Math.max(0, Math.min(1, hud.boostT || 0)), 6, 3)
      ctx.fill()
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
    const ph = 400
    const py = (this.h - ph) / 2 - 10
    this._panel(px, py, pw, ph, 20)

    // 标题 + 倒计时
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.accent
    ctx.font = `bold 20px ${KAI}`
    ctx.fillText('诗 咒 · 名 句 默 写', px + pw / 2, py + 36)
    const ratio = s.timeRatio == null ? 1 : s.timeRatio
    const bw = pw - 60
    ctx.fillStyle = 'rgba(34,48,74,0.12)'
    this._roundRect(px + 30, py + 50, bw, 8, 4)
    ctx.fill()
    ctx.fillStyle = ratio > 0.3 ? THEME.accent2 : THEME.bad
    this._roundRect(px + 30, py + 50, bw * ratio, 8, 4)
    ctx.fill()

    // 题干（题干里的 ____ 高亮）
    const prompt = s.prompt || ''
    const parts = prompt.split('____')
    const font = `22px ${KAI}`
    ctx.font = font
    const gapW = ctx.measureText('＿＿').width
    const maxW = pw - 48
    let full = parts.join('＿＿')
    while (ctx.measureText(full).width > maxW && full.length > 4) {
      // 超长时缩字号
      const size = parseInt(ctx.font, 10) - 1
      ctx.font = `${size}px ${KAI}`
      full = parts.join('＿＿')
    }
    const totalW = ctx.measureText(full).width
    let cx = px + pw / 2 - totalW / 2
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const ty = py + 108
    const drawPart = (t, highlight) => {
      if (!t) return
      ctx.fillStyle = highlight ? THEME.accent : THEME.ink
      ctx.fillText(t, cx, ty)
      cx += ctx.measureText(t).width
    }
    drawPart(parts[0], false)
    drawPart('＿＿', true)
    if (parts[1]) drawPart(parts[1], false)
    ctx.textBaseline = 'alphabetic'

    // 出处（结算时显示）
    if (s.resolved && s.source) {
      ctx.textAlign = 'center'
      ctx.font = `13px ${FONT}`
      ctx.fillStyle = THEME.sub
      ctx.fillText(`—— ${s.source} ——`, px + pw / 2, ty + 34)
    }

    // 选项
    const ow = (pw - 36 - 14) / 2
    const oh = 58
    const oy0 = py + 156
    const opts = s.options || []
    for (let i = 0; i < opts.length; i++) {
      const col = i % 2
      const row = Math.floor(i / 2)
      const ox = px + 18 + col * (ow + 14)
      const oy = oy0 + row * (oh + 14)
      let bg = 'rgba(34,48,74,0.06)'
      let border = 'rgba(34,48,74,0.15)'
      let color = THEME.ink
      if (s.resolved) {
        if (opts[i].correct) {
          bg = 'rgba(46,158,91,0.16)'
          border = THEME.good
          color = THEME.good
        } else if (s.selected === i) {
          bg = 'rgba(210,59,59,0.14)'
          border = THEME.bad
          color = THEME.bad
        }
      }
      this._roundRect(ox, oy, ow, oh, 12)
      ctx.fillStyle = bg
      ctx.fill()
      ctx.strokeStyle = border
      ctx.lineWidth = 1.5
      ctx.stroke()
      // 字母标
      ctx.fillStyle = border
      ctx.font = `bold 13px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(String.fromCharCode(65 + i), ox + 10, oy + oh / 2 + 4)
      // 选项文字（自动缩字号）
      const label = opts[i].text || ''
      let size = 16
      ctx.font = `${size}px ${KAI}`
      while (ctx.measureText(label).width > ow - 52 && size > 11) {
        size--
        ctx.font = `${size}px ${KAI}`
      }
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.fillText(label, ox + ow / 2 + 8, oy + oh / 2 + 5)
      this.hotspots.push({ action: 'spell:' + i, x: ox, y: oy, w: ow, h: oh })
    }

    // 底部提示
    ctx.textAlign = 'center'
    ctx.font = `13px ${FONT}`
    if (s.resolved) {
      const ok = s.outcome === 'correct'
      ctx.fillStyle = ok ? THEME.good : THEME.bad
      ctx.font = `bold 17px ${KAI}`
      ctx.fillText(ok ? '咒语生效 · 风墙冲击！' : s.outcome === 'timeout' ? '时间到 · 诗咒反噬' : '答错了 · 诗咒反噬', px + pw / 2, py + ph - 18)
    } else {
      ctx.fillStyle = THEME.sub
      ctx.fillText('点击下方选项作答', px + pw / 2, py + ph - 18)
    }
  }

  // ---------------- 结算 ----------------
  _drawGameOver(v) {
    const ctx = this.ctx
    const r = v.result || {}
    ctx.fillStyle = 'rgba(12,22,40,0.45)'
    ctx.fillRect(0, 0, this.w, this.h)

    const pw = Math.min(this.w - 40, 340)
    const px = (this.w - pw) / 2
    const ph = 470
    const py = Math.max(24, (this.h - ph) / 2)
    this._panel(px, py, pw, ph, 20)

    ctx.textAlign = 'center'
    ctx.fillStyle = r.cause === 'spell' ? THEME.bad : THEME.ink
    ctx.font = `bold 30px ${KAI}`
    ctx.fillText(r.cause === 'spell' ? '诗咒反噬' : '风羽耗尽', px + pw / 2, py + 44)
    ctx.font = `13px ${FONT}`
    ctx.fillStyle = THEME.sub
    ctx.fillText(r.cause === 'spell' ? '一句诗没有接上，风之翼失去了浮力' : '巨石与雷云之后，再无风羽', px + pw / 2, py + 66)

    // 新纪录
    if (r.isBest) {
      const t = '新 纪 录'
      ctx.font = `bold 14px ${FONT}`
      const tw = ctx.measureText(t).width + 26
      this._roundRect(px + pw / 2 - tw / 2, py + 78, tw, 26, 13)
      ctx.fillStyle = THEME.gold
      ctx.fill()
      ctx.fillStyle = '#5a3a10'
      ctx.fillText(t, px + pw / 2, py + 95)
    }

    // 分数
    ctx.fillStyle = THEME.ink
    ctx.font = 'bold 46px ' + FONT
    ctx.fillText(String(r.score || 0), px + pw / 2, py + 140)
    ctx.font = `13px ${FONT}`
    ctx.fillStyle = THEME.sub
    ctx.fillText('总 分', px + pw / 2, py + 160)

    // 数据网格
    const stats = [
      ['飞行距离', `${Math.floor(r.distance || 0)} m`],
      ['最高连对', `×${r.combo || 0}`],
      ['诗咒答对', `${r.spellCorrect || 0}/${r.spellTotal || 0}`],
      ['本机排名', r.rank ? `第 ${r.rank} 名` : '未上榜'],
    ]
    const gw = (pw - 48) / 2
    stats.forEach((st, i) => {
      const gx = px + 24 + (i % 2) * (gw + 0)
      const gy = py + 196 + Math.floor(i / 2) * 60
      ctx.textAlign = 'center'
      ctx.fillStyle = THEME.sub
      ctx.font = `12px ${FONT}`
      ctx.fillText(st[0], gx + gw / 2, gy)
      ctx.fillStyle = THEME.ink
      ctx.font = `bold 19px ${FONT}`
      ctx.fillText(st[1], gx + gw / 2, gy + 24)
    })

    // 按钮
    const bw = pw - 48
    const bx = px + 24
    let by = py + ph - 148
    this._button('retry', bx, by, bw, 48, '重 新 起 飞', { size: 19, bold: true })
    by += 58
    this._button('leaderboard', bx, by, (bw - 12) / 2, 42, '排行榜', { size: 15, bg: 'rgba(34,48,74,0.08)', color: THEME.ink })
    this._button('home', bx + (bw + 12) / 2, by, (bw - 12) / 2, 42, '回主界面', { size: 15, bg: 'rgba(34,48,74,0.08)', color: THEME.ink })
  }

  // ---------------- 排行榜 ----------------
  _drawLeaderboard(v) {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(12,22,40,0.55)'
    ctx.fillRect(0, 0, this.w, this.h)

    const pw = Math.min(this.w - 40, 360)
    const px = (this.w - pw) / 2
    const ph = this.h - 120
    const py = 56
    this._panel(px, py, pw, ph, 20)

    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.ink
    ctx.font = `bold 24px ${KAI}`
    ctx.fillText('本地排行榜', px + pw / 2, py + 40)
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = THEME.sub
    ctx.fillText('成绩保存在本机 · Top 50', px + pw / 2, py + 60)

    const list = v.leaderboard || []
    const rowH = 44
    let y = py + 84
    if (!list.length) {
      ctx.fillStyle = THEME.sub
      ctx.font = `14px ${FONT}`
      ctx.fillText('还没有记录，先去飞一局吧', px + pw / 2, y + 40)
    }
    for (let i = 0; i < Math.min(list.length, 12); i++) {
      const e = list[i]
      const rx = px + 16
      const rw = pw - 32
      if (i % 2 === 0) {
        this._roundRect(rx, y, rw, rowH - 4, 8)
        ctx.fillStyle = 'rgba(34,48,74,0.045)'
        ctx.fill()
      }
      // 名次
      ctx.textAlign = 'center'
      ctx.font = `bold 15px ${FONT}`
      ctx.fillStyle = i === 0 ? '#c8930a' : i === 1 ? '#8a8f99' : i === 2 ? '#b06a30' : THEME.sub
      ctx.fillText(String(i + 1), rx + 20, y + rowH / 2 + 2)
      // 昵称
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.ink
      ctx.font = `14px ${FONT}`
      const name = e.name || '无名御风者'
      ctx.fillText(name, rx + 42, y + rowH / 2 + 1)
      // 距离
      ctx.font = `11px ${FONT}`
      ctx.fillStyle = THEME.sub
      ctx.fillText(`${Math.floor(e.distance || 0)}m · ×${e.combo || 0}`, rx + 42, y + rowH / 2 + 15)
      // 分数
      ctx.textAlign = 'right'
      ctx.fillStyle = THEME.accent
      ctx.font = `bold 17px ${FONT}`
      ctx.fillText(String(e.score || 0), rx + rw - 14, y + rowH / 2 + 2)
      y += rowH
    }

    const bw = pw - 48
    this._button('back', px + 24, py + ph - 60, bw, 46, '返 回', { size: 17, bg: THEME.accent })
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
    const alpha = t.t < 0.3 ? t.t / 0.3 : t.t > t.dur - 0.4 ? Math.max(0, (t.dur - t.t) / 0.4) : 1
    ctx.font = `bold 15px ${FONT}`
    const tw = ctx.measureText(t.text).width + 36
    const x = (this.w - tw) / 2
    const y = this.h * 0.16
    ctx.globalAlpha = alpha
    this._roundRect(x, y, tw, 38, 19)
    ctx.fillStyle = 'rgba(20,30,50,0.85)'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(t.text, this.w / 2, y + 24)
    ctx.globalAlpha = 1
  }
}

module.exports = { UI }
