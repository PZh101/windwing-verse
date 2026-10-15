/**
 * 程序化贴图：全部用 Canvas 现场绘制，零外部资源。
 * 小游戏端用离屏 canvas，浏览器端用普通 canvas。
 */

const THREE = require('../libs/three.min.js')
const Platform = require('../libs/platform')

function canvas2d(w, h) {
  const c = Platform.create2DCanvas(w, h)
  const ctx = c.getContext('2d')
  return { c, ctx }
}

function finish(c, repeat) {
  const tex = new THREE.CanvasTexture(c)
  tex.encoding = THREE.sRGBEncoding
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
  }
  return tex
}

/** 竖向渐变（天空穹顶用） */
function skyGradient() {
  const { c, ctx } = canvas2d(64, 512)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0.0, '#1b3b6f')   // 高空深蓝
  g.addColorStop(0.45, '#3d7ab8')
  g.addColorStop(0.72, '#8fc3e8')
  g.addColorStop(0.9, '#ffd9a0')   // 地平线暖色
  g.addColorStop(1.0, '#ffb37c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 512)
  return finish(c)
}

/** 云海平面（可平铺） */
function cloudSea() {
  const { c, ctx } = canvas2d(512, 512)
  ctx.fillStyle = '#dfeeff'
  ctx.fillRect(0, 0, 512, 512)
  // 大团
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const r = 30 + Math.random() * 70
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.6, 'rgba(226,240,255,0.75)')
    g.addColorStop(1, 'rgba(226,240,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 阴影纹路
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const r = 8 + Math.random() * 26
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(160,190,225,0.35)')
    g.addColorStop(1, 'rgba(160,190,225,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c, true)
}

/** 单朵云（公告板，带 alpha） */
function cloudPuff() {
  const { c, ctx } = canvas2d(256, 256)
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176
    const y = 90 + Math.random() * 90
    const r = 24 + Math.random() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.65, 'rgba(240,248,255,0.55)')
    g.addColorStop(1, 'rgba(240,248,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c)
}

/** 翼面织物（编织纹 + 渐变） */
function wingFabric() {
  const { c, ctx } = canvas2d(256, 256)
  const g = ctx.createLinearGradient(0, 0, 256, 256)
  g.addColorStop(0, '#1fa8a0')
  g.addColorStop(0.55, '#37c4b4')
  g.addColorStop(1, '#f2b950')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  // 织纹
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  for (let i = 0; i < 256; i += 6) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
  }
  for (let i = 0; i < 256; i += 6) {
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  // 金色纹饰
  ctx.strokeStyle = 'rgba(255,224,150,0.85)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(20, 236)
  ctx.quadraticCurveTo(128, 40, 236, 236)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(30, 200)
  ctx.quadraticCurveTo(128, 70, 226, 200)
  ctx.stroke()
  return finish(c)
}

/** 岩石表面（噪点大理石纹） */
function rockSkin() {
  const { c, ctx } = canvas2d(256, 256)
  ctx.fillStyle = '#8d8578'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 1 + Math.random() * 7
    const v = Math.random()
    ctx.fillStyle =
      v > 0.66 ? 'rgba(120,112,100,0.5)' : v > 0.33 ? 'rgba(160,152,138,0.45)' : 'rgba(96,90,80,0.4)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 苔藓斑点
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    ctx.fillStyle = 'rgba(110,140,90,0.25)'
    ctx.beginPath()
    ctx.arc(x, y, 3 + Math.random() * 9, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c, true)
}

/** 诗碑碑面（印章风「诗」字 + 边框） */
function steleFace() {
  const { c, ctx } = canvas2d(256, 256)
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#f7f1e3')
  g.addColorStop(1, '#e8dfc9')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  // 做旧斑点
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(150,135,105,${0.05 + Math.random() * 0.12})`
    ctx.beginPath()
    ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 0, Math.PI * 2)
    ctx.fill()
  }
  // 双线边框
  ctx.strokeStyle = '#a8452f'
  ctx.lineWidth = 6
  ctx.strokeRect(14, 14, 228, 228)
  ctx.lineWidth = 2
  ctx.strokeRect(26, 26, 204, 204)
  // 篆刻「诗」
  ctx.fillStyle = '#a8452f'
  ctx.font = 'bold 120px "KaiTi", "STKaiti", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('诗', 128, 132)
  // 四角云纹
  ctx.strokeStyle = 'rgba(168,69,47,0.7)'
  ctx.lineWidth = 3
  const corner = (cx, cy, sx, sy) => {
    ctx.beginPath()
    ctx.moveTo(cx, cy + sy * 18)
    ctx.quadraticCurveTo(cx, cy, cx + sx * 18, cy)
    ctx.stroke()
  }
  corner(36, 36, 1, 1)
  corner(220, 36, -1, 1)
  corner(36, 220, 1, -1)
  corner(220, 220, -1, -1)
  return finish(c)
}

/** 雷雨云表面 */
function stormSkin() {
  const { c, ctx } = canvas2d(256, 256)
  const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 150)
  g.addColorStop(0, '#6b5f9e')
  g.addColorStop(0.5, '#4a4070')
  g.addColorStop(1, '#2e2950')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 10 + Math.random() * 40
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r)
    gg.addColorStop(0, 'rgba(150,140,200,0.25)')
    gg.addColorStop(1, 'rgba(150,140,200,0)')
    ctx.fillStyle = gg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(c, true)
}

/** 通用辉光（加法混合 Sprite/平面用） */
function glow() {
  const { c, ctx } = canvas2d(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,236,180,0.9)')
  g.addColorStop(0.35, 'rgba(255,210,120,0.45)')
  g.addColorStop(1, 'rgba(255,200,100,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return finish(c)
}

/** 白色软圆点（粒子 PointsMaterial 用，避免方形颗粒） */
function dot() {
  const { c, ctx } = canvas2d(64, 64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return finish(c)
}

module.exports = { skyGradient, cloudSea, cloudPuff, wingFabric, rockSkin, steleFace, stormSkin, glow, dot }
