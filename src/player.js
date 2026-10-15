/**
 * 风之翼：载具模型 + 飞行动画（纯表现层，不含规则）
 * 结构：root(位置/侧倾/俯仰) -> pilot(人物) + wingPivot(扇翅)
 */

const THREE = require('../libs/three.min.js')
const { capsule } = require('./geom')
const T = require('./textures')

const C = {
  wingA: '#1fa8a0',
  wingB: '#f2b950',
  frame: '#8a5a2b',
  tunic: '#e8622d',
  trousers: '#2f4a6e',
  skin: '#f2c9a0',
  hair: '#3a2c22',
  scarf: '#e23b4e',
}

function mat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05 }, opts || {}))
}

class WindGlider {
  constructor() {
    this.root = new THREE.Group()
    this._build()
    this.time = 0
    this.bank = 0
    this.pitch = 0
    this.flapPhase = Math.random() * Math.PI * 2
  }

  _build() {
    // ---- 翼面（三角滑翔翼，悬挂在飞行员上方）----
    const shape = new THREE.Shape()
    shape.moveTo(0, 1.35)          // 翼尖前缘（局部 +y 将旋转到 -z 前方）
    shape.lineTo(-2.65, -0.95)     // 左翼尖
    shape.lineTo(-0.7, -0.2)       // 左翼根
    shape.lineTo(0.7, -0.2)        // 右翼根
    shape.lineTo(2.65, -0.95)      // 右翼尖
    shape.closePath()
    let wingGeo = new THREE.ShapeGeometry(shape, 12)
    // 加弯度：按 x 位移 z
    const pos = wingGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const camber = -0.22 * (1 - Math.min(1, Math.abs(x) / 2.8)) + 0.06 * y
      pos.setZ(i, camber)
    }
    wingGeo.computeVertexNormals()

    // UV 归一化到 0..1（ShapeGeometry 默认直接用顶点坐标当 UV，会导致贴图拉伸）
    const uv = wingGeo.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (uv.getX(i) + 2.65) / 5.3, (uv.getY(i) + 0.95) / 2.3)
    }

    this.wingPivot = new THREE.Group()
    const wingMat = new THREE.MeshStandardMaterial({
      map: T.wingFabric(),
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.02,
    })
    const wing = new THREE.Mesh(wingGeo, wingMat)
    wing.rotation.x = -Math.PI / 2   // 形状平面 XY -> 水平面 XZ
    wing.position.y = 0.95
    this.wingPivot.add(wing)

    // 翼梁（两根前缘管沿翼展方向 + 中央横杆 + 龙骨）
    const frameMat = mat(C.frame, { roughness: 0.6 })
    const tube = (len, r) => new THREE.CylinderGeometry(r, r, len, 6)
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(tube(3.0, 0.04), frameMat)
      t.position.set(sx * 1.28, 0.86, -0.15)
      t.rotation.set(0, 0, sx * (Math.PI / 2 - 0.3))
      this.wingPivot.add(t)
    }
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), frameMat)
    crossbar.rotation.z = Math.PI / 2
    crossbar.position.set(0, 0.42, 0.55)
    this.wingPivot.add(crossbar)
    // 龙骨（前梁到翼尖的中央骨架）
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6), frameMat)
    keel.rotation.set(Math.PI / 2 + 0.12, 0, 0)
    keel.position.set(0, 0.62, 0.35)
    this.wingPivot.add(keel)
    this.root.add(this.wingPivot)

    // ---- 飞行员（悬挂在翼下）----
    const pilot = new THREE.Group()
    const skinMat = mat(C.skin, { roughness: 0.7 })
    const hairMat = mat(C.hair, { roughness: 0.9 })
    const tunicMat = mat(C.tunic)
    const trouserMat = mat(C.trousers)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat)
    head.position.set(0, 0.42, 0.28)
    pilot.add(head)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat)
    hair.position.set(0, 0.43, 0.27)
    pilot.add(hair)

    const torso = new THREE.Mesh(capsule(0.14, 0.3, 10), tunicMat)
    torso.position.set(0, 0.12, 0.3)
    torso.rotation.x = 0.35
    pilot.add(torso)

    // 手臂向上握住横梁
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(capsule(0.045, 0.34, 8), tunicMat)
      arm.position.set(sx * 0.15, 0.3, 0.42)
      arm.rotation.x = -0.55
      arm.rotation.z = sx * -0.18
      pilot.add(arm)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat)
      hand.position.set(sx * 0.2, 0.46, 0.52)
      pilot.add(hand)
    }
    // 腿向后下方（飞行中并拢后伸）
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(capsule(0.055, 0.36, 8), trouserMat)
      leg.position.set(sx * 0.08, -0.2, 0.42)
      leg.rotation.x = 0.35
      pilot.add(leg)
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), mat('#5a3a22'))
      boot.position.set(sx * 0.08, -0.36, 0.5)
      pilot.add(boot)
    }
    // 围巾（飘带）
    const scarf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.7),
      new THREE.MeshStandardMaterial({ color: C.scarf, side: THREE.DoubleSide, roughness: 0.8 })
    )
    scarf.position.set(0, 0.34, 0.42)
    scarf.geometry.translate(0, -0.35, 0)
    this.scarf = scarf
    pilot.add(scarf)

    this.pilot = pilot
    this.root.add(pilot)

    // 尾焰光点（冲刺时可见）
    const glowTex = T.glow()
    this.boostGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false })
    )
    this.boostGlow.scale.set(1.6, 1.6, 1)
    this.boostGlow.position.set(0, 0.3, 1.2)
    this.root.add(this.boostGlow)
  }

  /**
   * 每帧更新
   * @param {number} dt 秒
   * @param {{bank:number, pitch:number, speedRatio:number, boosting:boolean, hidden:boolean}} s
   */
  update(dt, s) {
    this.time += dt
    this.bank += (s.bank - this.bank) * Math.min(1, dt * 8)
    this.pitch += (s.pitch - this.pitch) * Math.min(1, dt * 8)

    this.root.rotation.z = this.bank
    this.root.rotation.x = this.pitch
    this.root.rotation.y = -this.bank * 0.35

    // 扇翅
    this.flapPhase += dt * 6.5
    const flap = Math.sin(this.flapPhase) * 0.14 + Math.sin(this.time * 2.1) * 0.02
    this.wingPivot.rotation.z = flap

    // 身体随速度前倾 + 呼吸浮动
    this.pilot.position.y = Math.sin(this.time * 3.2) * 0.03
    this.pilot.rotation.x = -0.12 - s.speedRatio * 0.1

    // 围巾飘动
    this.scarf.rotation.x = 0.5 + Math.sin(this.time * 9) * 0.25
    this.scarf.rotation.z = Math.sin(this.time * 7) * 0.2

    // 冲刺辉光
    const targetOpacity = s.boosting ? 0.85 : 0
    this.boostGlow.material.opacity += (targetOpacity - this.boostGlow.material.opacity) * Math.min(1, dt * 6)
    const pulse = 1.4 + Math.sin(this.time * 18) * 0.25
    this.boostGlow.scale.set(pulse, pulse, 1)

    this.root.visible = !s.hidden
  }

  /** 世界坐标下的引擎尾焰位置（粒子发射点） */
  emitterPosition(target) {
    return target.set(this.root.position.x, this.root.position.y + 0.15, this.root.position.z + 1.0)
  }
}

module.exports = { WindGlider }
