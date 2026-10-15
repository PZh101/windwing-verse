/**
 * 几何小工具：胶囊体 + 非索引几何体合并（减少 draw call）
 * three r128 核心包不含 BufferGeometryUtils，这里自己实现最小可用版。
 */

const THREE = require('../libs/three.min.js')

/** 胶囊体（圆柱 + 两端半球） */
function capsule(radius, length, radialSeg) {
  const parts = []
  const cyl = new THREE.CylinderGeometry(radius, radius, length, radialSeg || 10)
  parts.push(cyl)
  const top = new THREE.SphereGeometry(radius, radialSeg || 10, 8)
  top.translate(0, length / 2, 0)
  parts.push(top)
  const bottom = new THREE.SphereGeometry(radius, radialSeg || 10, 8)
  bottom.translate(0, -length / 2, 0)
  parts.push(bottom)
  return mergeGeometries(parts)
}

/**
 * 合并若干几何体（会自动 toNonIndexed）
 * @param {THREE.BufferGeometry[]} geoms
 * @returns {THREE.BufferGeometry}
 */
function mergeGeometries(geoms) {
  const nonIndexed = geoms.map((g) => (g.index ? g.toNonIndexed() : g))
  const total = nonIndexed.reduce((s, g) => s + g.attributes.position.count, 0)
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  let po = 0
  let no = 0
  let uo = 0
  for (const g of nonIndexed) {
    const p = g.attributes.position.array
    const n = g.attributes.normal ? g.attributes.normal.array : null
    const u = g.attributes.uv ? g.attributes.uv.array : null
    position.set(p, po)
    po += p.length
    if (n) {
      normal.set(n, no)
      no += n.length
    }
    if (u) {
      uv.set(u, uo)
      uo += u.length
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  if (no > 0) out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  if (uo > 0) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return out
}

module.exports = { capsule, mergeGeometries }
