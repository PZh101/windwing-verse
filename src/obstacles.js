/**
 * 障碍物：工厂 + 对象池
 * 类型：stele(诗碑) / rock(浮空巨石) / storm(雷暴云) / bird(鸟群)
 */

const THREE = require('../libs/three.min.js')
const { capsule } = require('./geom')
const T = require('./textures')

let UID = 0

function jitterGeometry(geo, amount, seed) {
  const pos = geo.attributes.position
  let s = seed
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * (1 + (rnd() - 0.5) * amount),
      pos.getY(i) * (1 + (rnd() - 0.5) * amount),
      pos.getZ(i) * (1 + (rnd() - 0.5) * amount)
    )
  }
  geo.computeVertexNormals()
  return geo
}

/** 诗碑：方尖碑 + 发光碑面 + 辉光 */
function createStele() {
  const g = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8ad93, roughness: 0.95, flatShading: true })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.35, 6), stoneMat)
  base.position.y = -1.15
  g.add(base)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.5, 6), stoneMat)
  g.add(body)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.7, 6), stoneMat)
  tip.position.y = 1.6
  g.add(tip)

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.78),
    new THREE.MeshBasicMaterial({ map: T.steleFace(), transparent: false })
  )
  face.position.set(0, 0.15, 0.47)
  g.add(face)

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: T.glow(), color: 0xffe9b0, transparent: true, opacity: 0.75, depthWrite: false })
  )
  glow.scale.set(3.2, 3.2, 1)
  glow.position.set(0, 0.1, 0.3)
  g.add(glow)

  // 顶部悬浮的符文环
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.035, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd27a })
  )
  ring.position.y = 2.05
  g.add(ring)

  g.userData.spin = ring
  return g
}

/** 浮空巨石 */
function createRock(seed) {
  const geo = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.34, seed || 7)
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: T.rockSkin(), roughness: 1, metalness: 0, flatShading: true })
  )
  const g = new THREE.Group()
  g.add(m)
  // 挂一些小碎石
  for (let i = 0; i < 2; i++) {
    const chip = new THREE.Mesh(
      jitterGeometry(new THREE.IcosahedronGeometry(0.22, 0), 0.4, (seed || 3) + i * 17),
      m.material
    )
    chip.position.set((i === 0 ? 1 : -1) * 0.75, i === 0 ? 0.4 : -0.5, 0.2)
    g.add(chip)
  }
  return g
}

/** 雷暴云（多球合并为单 mesh，省 draw call） */
function createStorm(seed) {
  const { mergeGeometries } = require('./geom')
  const parts = []
  const spec = [
    [0, 0, 0, 1.0],
    [0.75, 0.15, 0.1, 0.66],
    [-0.7, 0.1, -0.15, 0.6],
    [0.2, 0.55, -0.2, 0.5],
    [-0.25, -0.35, 0.25, 0.55],
  ]
  for (const [x, y, z, r] of spec) {
    const s = new THREE.SphereGeometry(r, 9, 7)
    jitterGeometry(s, 0.25, (seed || 11) + x * 100 + y * 10)
    s.translate(x, y, z)
    parts.push(s)
  }
  const merged = mergeGeometries(parts)
  const m = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ map: T.stormSkin(), roughness: 1, flatShading: true, emissive: 0x1a1440, emissiveIntensity: 0.35 })
  )
  const g = new THREE.Group()
  g.add(m)
  // 云内电光（辉光片 + 自发光脉动，比 PointLight 便宜得多）
  const bolt = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: T.glow(), color: 0xbfa8ff, transparent: true, opacity: 0.6, depthWrite: false })
  )
  bolt.scale.set(2.4, 2.4, 1)
  g.add(bolt)
  g.userData.bolt = bolt
  return g
}

/** 单只鸟（V 形双翼一体几何） */
function createBird() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(-0.55, 0.3)
  shape.lineTo(-0.18, 0.02)
  shape.lineTo(0, -0.05)
  shape.lineTo(0.18, 0.02)
  shape.lineTo(0.55, 0.3)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 4)
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x2c2c3a, side: THREE.DoubleSide })
  )
  const g = new THREE.Group()
  g.add(m)
  return g
}

/** 鸟群 */
function createFlock(count, seed) {
  const g = new THREE.Group()
  for (let i = 0; i < count; i++) {
    const b = createBird()
    b.position.set((i - (count - 1) / 2) * 0.85, (i % 2) * 0.3, -i * 0.7)
    b.userData.phase = (seed || 1) * 0.1 + i
    g.add(b)
  }
  return g
}

/**
 * 对象池：按 kind 缓存，避免飞行中反复创建几何体
 */
class ObstaclePool {
  constructor() {
    this.free = { stele: [], rock: [], storm: [], bird: [] }
    this.active = []
  }

  acquire(desc) {
    const { kind, isPoem, x, y, scale, radius, flock, z, seed } = desc
    let obj = this.free[kind].pop()
    if (!obj) {
      if (kind === 'stele') obj = createStele()
      else if (kind === 'rock') obj = createRock(seed)
      else if (kind === 'storm') obj = createStorm(seed)
      else obj = createFlock(flock || 1, seed)
      obj.userData.kind = kind
    } else if (kind === 'bird') {
      // 复用鸟群：调整数量
      this._resizeFlock(obj, flock || 1)
    }
    obj.visible = true
    obj.dead = false
    obj.scale.setScalar(scale)
    obj.position.set(x, y, z)
    obj.userData.baseY = y
    obj.userData.radius = radius
    obj.userData.isPoem = !!isPoem
    obj.userData.grazed = false // 擦身而过只记一次
    obj.userData.seed = seed
    obj.userData.phase = (seed % 1000) / 1000 * Math.PI * 2
    if (kind === 'stele' && obj.userData.spin) obj.userData.spin.rotation.y = 0
    this.active.push(obj)
    return obj
  }

  _resizeFlock(flockGroup, count) {
    while (flockGroup.children.length > count) {
      const c = flockGroup.children.pop()
      c.visible = false
    }
    while (flockGroup.children.length < count) {
      const b = createBird()
      b.position.set(0, 0, 0)
      b.visible = true
      flockGroup.add(b)
    }
    const n = flockGroup.children.length
    flockGroup.children.forEach((b, i) => {
      b.visible = true
      b.position.set((i - (n - 1) / 2) * 0.85, (i % 2) * 0.3, -i * 0.7)
    })
  }

  release(obj) {
    const i = this.active.indexOf(obj)
    if (i >= 0) this.active.splice(i, 1)
    obj.visible = false
    obj.dead = true
    if (this.free[obj.userData.kind]) this.free[obj.userData.kind].push(obj)
    if (obj.parent) obj.parent.remove(obj)
  }

  /** 清除一定范围内的障碍（答对咒语的风墙冲击波） */
  clearAhead(scene, maxAbsZ) {
    const removed = []
    for (const obj of this.active.slice()) {
      if (obj.userData.isPoem) continue
      if (Math.abs(obj.position.z) <= maxAbsZ) {
        removed.push({ x: obj.position.x, y: obj.position.y, z: obj.position.z })
        this.release(obj)
      }
    }
    return removed
  }

  clearAll() {
    for (const obj of this.active.slice()) this.release(obj)
  }
}

module.exports = { ObstaclePool, createStele, createRock, createStorm, createFlock }
