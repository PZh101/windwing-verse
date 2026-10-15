/**
 * 3D 世界：场景装配 + 每帧世界推进（滚动、回收、相机、特效）
 * 规则（碰撞/计分/状态）在 main.js，这里只管表现。
 */

const THREE = require('../libs/three.min.js')
const C = require('./config')
const T = require('./textures')
const { createRng } = require('./rng')
const { WindGlider } = require('./player')
const { ObstaclePool } = require('./obstacles')

const FOG_COLOR = 0x9cc6e8

// 装饰性随机（云板散布、粒子迸射、尾迹抖动）统一走定种 RNG：
// 既避免 Math.random() 让 e2e 截图每次都不一样，也便于复现视觉问题。
const DECO_SEED = 0x5eed1e

class World {
  /**
   * @param {HTMLCanvasElement} canvas 上屏 WebGL 画布
   */
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(canvas.width, canvas.height, false)
    this.renderer.outputEncoding = THREE.sRGBEncoding
    this.renderer.setClearColor(FOG_COLOR, 1)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(FOG_COLOR)
    this.scene.fog = new THREE.Fog(FOG_COLOR, C.WORLD.fogNear, C.WORLD.fogFar)

    this.aspect = canvas.width / canvas.height
    this.camera = new THREE.PerspectiveCamera(C.CAMERA.fov, this.aspect, C.CAMERA.near, C.CAMERA.far)
    this.camera.position.set(0, C.PLAYFIELD.startY + C.CAMERA.offset.y, C.CAMERA.offset.z)

    // 装饰性随机源要先于 _billboards() 建好，它一上来就要取随机数
    this.rng = createRng(DECO_SEED)

    this._lights()
    this._sky()
    this._sea()
    this._billboards()

    this.glider = new WindGlider()
    this.scene.add(this.glider.root)

    this.pool = new ObstaclePool()
    this.effects = []
    this._trail()
    this._shockwaveProtos()

    // 玩家状态（表现层）
    this.player = { x: C.PLAYFIELD.startX, y: C.PLAYFIELD.startY }
    this.target = { x: C.PLAYFIELD.startX, y: C.PLAYFIELD.startY }
    this.speed = 0
    this.speedRatio = 0
    this.shake = 0
    this.boosting = false
    this.hidden = false
    this.falling = false
    this.fallT = 0
    this.fallSpin = 0
    this.hurtT = 0
    this.time = 0
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7a6a52, 1.05)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xfff2d8, 0.85)
    dir.position.set(12, 22, 6)
    this.scene.add(dir)
  }

  _sky() {
    // 面数给足，避免穹顶出现低多边形棱面感
    const geo = new THREE.SphereGeometry(220, 48, 32)
    const mat = new THREE.MeshBasicMaterial({ map: T.skyGradient(), side: THREE.BackSide, fog: false, depthWrite: false })
    const dome = new THREE.Mesh(geo, mat)
    this.scene.add(dome)
    this.skyDome = dome
  }

  _sea() {
    const tex = T.cloudSea()
    tex.repeat.set(7, 9)
    const geo = new THREE.PlaneGeometry(C.WORLD.seaSize, C.WORLD.seaSize * 1.3)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96, depthWrite: false })
    const sea = new THREE.Mesh(geo, mat)
    sea.rotation.x = -Math.PI / 2
    sea.position.set(0, -9.5, C.WORLD.seaZ)
    this.scene.add(sea)
    this.sea = sea
  }

  _billboards() {
    const tex = T.cloudPuff()
    const rnd = this.rng
    this.billboards = []
    for (let i = 0; i < C.WORLD.billboardCount; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55 + rnd() * 0.35, depthWrite: false })
      )
      const s = 6 + rnd() * 9
      m.scale.set(s, s * 0.55, 1)
      // 只布置在航道两侧，避免云板挡住前方障碍
      m.position.set((6 + rnd() * 20) * (rnd() < 0.5 ? -1 : 1), 2 + rnd() * 14, -20 - rnd() * 110)
      m.userData.speedFactor = 0.75 + rnd() * 0.4
      this.scene.add(m)
      this.billboards.push(m)
    }
  }

  _trail() {
    const n = C.WORLD.trailCount
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    // 初始放到很远的地方避免一开场一条线
    for (let i = 0; i < n; i++) pos[i * 3 + 2] = 999
    this.trail = {
      geo,
      points: new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.3,
          map: T.dot(),
          vertexColors: true,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      ),
      life: new Float32Array(n),
      cursor: 0,
    }
    this.scene.add(this.trail.points)
    this._trailColorA = new THREE.Color(0xffd98a)
    this._trailColorB = new THREE.Color(0x7fb6e8)
  }

  _shockwaveProtos() {
    this.shockGeo = new THREE.RingGeometry(0.85, 1.0, 40)
  }

  /**
   * 供碰撞/擦身的轻量快照
   * Object3D 不能直接喂给纯逻辑层（坐标在 position 里），这里转一层带 ref 的平面数据
   */
  colliders() {
    const out = []
    for (const o of this.pool.active) {
      if (o.dead || !o.visible) continue
      out.push({
        x: o.position.x,
        y: o.position.y,
        z: o.position.z,
        radius: o.userData.radius || 1,
        isPoem: !!o.userData.isPoem,
        kind: o.userData.kind,
        ref: o,
      })
    }
    return out
  }

  /** 风之翼受击后的机体抖动表现（非致命帧） */
  addHurt(v) {
    this.hurtT = Math.max(this.hurtT || 0, v)
  }

  /** 生成一个障碍（返回世界对象） */
  spawn(desc) {
    const obj = this.pool.acquire(desc)
    if (!obj.parent) this.scene.add(obj) // 从池里取出（复用）时可能已不在场景中
    return obj
  }

  /** 风墙冲击波（答对咒语） */
  shockwave(x, y, z, color) {
    const m = new THREE.Mesh(
      this.shockGeo,
      new THREE.MeshBasicMaterial({ color: color || 0xffe6a8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    )
    m.position.set(x, y, z)
    m.userData.effect = { kind: 'ring', t: 0, dur: 0.65 }
    this.scene.add(m)
    this.effects.push(m)
  }

  /** 粒子迸射（撞击/答对） */
  burst(x, y, z, color, count) {
    const n = count || 26
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const vel = []
    const rnd = this.rng
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      const a = rnd() * Math.PI * 2
      const r = 2 + rnd() * 5
      vel.push({ x: Math.cos(a) * r, y: Math.sin(a) * r + 1.5, z: (rnd() - 0.5) * 3 })
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: color || 0xffcf7a,
        size: 0.32,
        map: T.dot(),
        transparent: true,
        opacity: 1,
        depthWrite: false,
      })
    )
    pts.userData.effect = { kind: 'burst', t: 0, dur: 0.8, vel }
    this.scene.add(pts)
    this.effects.push(pts)
  }

  /** 设置玩家目标位置（由输入层驱动） */
  setTarget(x, y) {
    this.target.x = Math.max(C.PLAYFIELD.minX, Math.min(C.PLAYFIELD.maxX, x))
    this.target.y = Math.max(C.PLAYFIELD.minY, Math.min(C.PLAYFIELD.maxY, y))
  }

  addShake(v) {
    this.shake = Math.min(0.9, this.shake + v)
  }

  /**
   * 每帧推进
   * @param {number} dt 秒
   */
  update(dt) {
    this.time += dt
    const speed = this.speed

    // ---- 玩家平滑追随 ----
    const k = Math.min(1, dt * C.PLAYER.followLerp)
    const prevX = this.player.x
    const prevY = this.player.y
    this.player.x += (this.target.x - this.player.x) * k
    this.player.y += (this.target.y - this.player.y) * k
    const vx = (this.player.x - prevX) / Math.max(dt, 1e-4)

    // ---- 风之翼 ----
    if (this.falling) {
      // 坠落动画：螺旋下坠
      this.fallT += dt
      this.fallSpin += dt * 3.6
      this.player.y -= (2.5 + this.fallT * 11) * dt
      this.glider.root.position.set(this.player.x, this.player.y, 0)
      this.glider.update(dt, {
        bank: this.fallSpin,
        pitch: 0.6,
        speedRatio: this.speedRatio,
        boosting: false,
        hidden: false,
      })
    } else {
      // 受击时机体横向翻抖（叠加在常规侧倾之上）
      let hurtRoll = 0
      let hurtJolt = 0
      if (this.hurtT > 0) {
        this.hurtT = Math.max(0, this.hurtT - dt)
        const k = this.hurtT / C.RULES.hurtDuration
        hurtRoll = Math.sin(this.time * 46) * 0.5 * k
        hurtJolt = Math.sin(this.time * 38) * 0.12 * k
      }
      const bank = Math.max(-C.PLAYER.bankMax, Math.min(C.PLAYER.bankMax, -vx * 0.055 + hurtRoll))
      const pitch = Math.max(-0.45, Math.min(0.45, -(this.player.y - prevY) / Math.max(dt, 1e-4) * 0.012 + hurtJolt))
      this.glider.root.position.set(this.player.x, this.player.y, 0)
      this.glider.update(dt, { bank, pitch, speedRatio: this.speedRatio, boosting: this.boosting, hidden: this.hidden })
    }

    // ---- 障碍滚动 ----
    const objs = this.pool.active
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      o.position.z += speed * dt
      const ud = o.userData
      if (o.position.z > C.SPAWN.despawnZ) {
        this.pool.release(o)
        continue
      }
      // 个体动画
      if (ud.kind === 'stele') {
        o.position.y = ud.baseY + Math.sin(this.time * 1.6 + ud.phase) * 0.25
        o.rotation.y += dt * 0.7
        if (ud.spin) ud.spin.rotation.y += dt * 2.2
      } else if (ud.kind === 'rock') {
        o.rotation.y += dt * 0.25
        o.rotation.x += dt * 0.12
        o.position.y = ud.baseY + Math.sin(this.time * 0.9 + ud.phase) * 0.15
      } else if (ud.kind === 'storm') {
        o.rotation.y += dt * 0.4
        o.position.y = ud.baseY + Math.sin(this.time * 0.7 + ud.phase) * 0.3
        if (ud.bolt) ud.bolt.material.opacity = 0.35 + this.rng() * 0.55
      } else if (ud.kind === 'bird') {
        o.position.y = ud.baseY + Math.sin(this.time * 2.4 + ud.phase) * 0.35
        for (const b of o.children) {
          b.rotation.z = Math.sin(this.time * 9 + b.userData.phase) * 0.5
        }
      }
    }

    // ---- 云海 / 公告板滚动 ----
    this.sea.material.map.offset.y -= speed * dt * 0.0016
    const rnd = this.rng
    for (const b of this.billboards) {
      b.position.z += speed * dt * b.userData.speedFactor
      // 在抵达相机（z≈7.2）之前回收，避免云板糊在镜头上
      if (b.position.z > -6) {
        b.position.z = -120 - rnd() * 30
        b.position.x = (6 + rnd() * 20) * (rnd() < 0.5 ? -1 : 1)
        b.position.y = 2 + rnd() * 14
      }
    }

    // ---- 尾迹粒子 ----
    this._updateTrail(dt)

    // ---- 特效 ----
    this._updateEffects(dt)

    // ---- 相机 ----
    const camLag = Math.min(1, dt * 5.5)
    const camX = this.camera.position.x + (this.player.x * 0.72 - this.camera.position.x) * camLag
    // 保持相机在翼面上方足够高度，否则翼面会侧棱朝屏、只剩一根"横梁"
    const camY = this.camera.position.y + (this.player.y + C.CAMERA.offset.y - this.camera.position.y) * camLag
    this.camera.position.x = camX
    this.camera.position.y = camY
    if (this.shake > 0.001) {
      this.camera.position.x += (this.rng() - 0.5) * this.shake * 0.5
      this.camera.position.y += (this.rng() - 0.5) * this.shake * 0.5
      this.shake *= Math.pow(0.0015, dt)
    }
    this.camera.lookAt(this.player.x * 0.8, this.player.y * 0.6 + 0.4, -C.CAMERA.lookAhead)
    const targetFov = C.CAMERA.fov + this.speedRatio * C.CAMERA.fovBoost
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3)
      this.camera.updateProjectionMatrix()
    }
  }

  _updateTrail(dt) {
    const tr = this.trail
    const pos = tr.geo.attributes.position.array
    const col = tr.geo.attributes.color.array
    const rnd = this.rng
    // 发射 2 个新粒子（带横向散布，紧贴翼后）
    for (let s = 0; s < 2; s++) {
      const i = tr.cursor
      pos[i * 3] = this.player.x + (rnd() - 0.5) * 1.1
      pos[i * 3 + 1] = this.player.y + (rnd() - 0.5) * 0.4
      pos[i * 3 + 2] = 0.9
      tr.life[i] = 1
      tr.cursor = (tr.cursor + 1) % tr.life.length
    }
    // 老化 + 颜色衰减；粒子在飘到相机前就熄灭
    const cA = this._trailColorA
    const cB = this._trailColorB
    for (let i = 0; i < tr.life.length; i++) {
      if (tr.life[i] <= 0) continue
      tr.life[i] -= dt * 2.4
      if (tr.life[i] <= 0 || pos[i * 3 + 2] > 4.2) {
        tr.life[i] = 0
        pos[i * 3 + 2] = 999
        continue
      }
      pos[i * 3 + 2] += this.speed * dt * 0.42
      const l = tr.life[i]
      col[i * 3] = cA.r * l + cB.r * (1 - l)
      col[i * 3 + 1] = cA.g * l + cB.g * (1 - l)
      col[i * 3 + 2] = cA.b * l + cB.b * (1 - l)
    }
    tr.geo.attributes.position.needsUpdate = true
    tr.geo.attributes.color.needsUpdate = true
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      const fx = e.userData.effect
      fx.t += dt
      const p = Math.min(1, fx.t / fx.dur)
      if (fx.kind === 'ring') {
        const s = 1 + p * 13
        e.scale.set(s, s, 1)
        e.material.opacity = 0.9 * (1 - p)
        e.quaternion.copy(this.camera.quaternion)
      } else if (fx.kind === 'burst') {
        const arr = e.geometry.attributes.position.array
        for (let j = 0; j < fx.vel.length; j++) {
          arr[j * 3] += fx.vel[j].x * dt
          arr[j * 3 + 1] += fx.vel[j].y * dt
          arr[j * 3 + 2] += (fx.vel[j].z + this.speed * 0.4) * dt
          fx.vel[j].y -= 9 * dt
        }
        e.geometry.attributes.position.needsUpdate = true
        e.material.opacity = 1 - p
      }
      if (p >= 1) {
        this.scene.remove(e)
        this._disposeEffect(e)
        this.effects.splice(i, 1)
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  /** 屏幕尺寸变化 */
  resize(cssW, cssH, pixelW, pixelH) {
    this.renderer.setSize(pixelW, pixelH, false)
    this.aspect = pixelW / pixelH
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
  }

  /**
   * 释放一批一次性特效的 GPU 资源。
   * shockGeo 是共享原型几何体，不能 dispose，否则之后新建的冲击波就没了。
   */
  _disposeEffect(e) {
    if (e.geometry && e.geometry !== this.shockGeo) e.geometry.dispose()
    if (e.material) e.material.dispose()
  }

  reset() {
    this.pool.clearAll()
    // 光 remove 不 dispose 的话，每次重开一局都会漏一批 geometry/material
    for (const e of this.effects) {
      this.scene.remove(e)
      this._disposeEffect(e)
    }
    this.effects.length = 0
    this.player.x = C.PLAYFIELD.startX
    this.player.y = C.PLAYFIELD.startY
    this.target.x = C.PLAYFIELD.startX
    this.target.y = C.PLAYFIELD.startY
    this.camera.position.set(0, C.PLAYFIELD.startY + C.CAMERA.offset.y, C.CAMERA.offset.z)
    this.shake = 0
    this.hidden = false
    this.hurtT = 0
    this.falling = false
    this.fallT = 0
    this.fallSpin = 0
    this.boosting = false
  }
}

module.exports = { World }
