/**
 * 几何小工具：胶囊体 + 非索引几何体合并（减少 draw call）
 * three r128 核心包不含 BufferGeometryUtils，这里自己实现最小可用版。
 */

const THREE = require('../libs/three.min.js')

/** 胶囊体（开口圆柱 + 两端半球） */
function capsule(radius, length, radialSeg) {
  const seg = radialSeg || 10
  const parts = []
  // 圆柱必须开口：带端盖的话端盖会留在半球内部，
  // 虽然看不见，但法线方向与半球接不上，接缝处会出现一圈硬边
  parts.push(new THREE.CylinderGeometry(radius, radius, length, seg, 1, true))
  const top = new THREE.SphereGeometry(radius, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  top.translate(0, length / 2, 0)
  parts.push(top)
  const bottom = new THREE.SphereGeometry(radius, seg, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  bottom.translate(0, -length / 2, 0)
  parts.push(bottom)
  return mergeGeometries(parts)
}

/**
 * 合并若干几何体（会自动 toNonIndexed）
 *
 * 只在**所有输入都具备**该属性时才输出对应属性；否则某几个有、某几个没有时，
 * 偏移量会算错、把数据写歪（以前就是无条件按 position 长度推进 no/uo）。
 *
 * @param {THREE.BufferGeometry[]} geoms
 * @returns {THREE.BufferGeometry}
 */
function mergeGeometries(geoms) {
  const nonIndexed = geoms.map((g) => (g.index ? g.toNonIndexed() : g))
  const total = nonIndexed.reduce((s, g) => s + g.attributes.position.count, 0)
  const position = new Float32Array(total * 3)
  const normal = nonIndexed.every((g) => g.attributes.normal)
    ? new Float32Array(total * 3)
    : null
  const uv = nonIndexed.every((g) => g.attributes.uv) ? new Float32Array(total * 2) : null
  let po = 0
  let no = 0
  let uo = 0
  for (const g of nonIndexed) {
    const p = g.attributes.position.array
    position.set(p, po)
    po += p.length
    if (normal) {
      normal.set(g.attributes.normal.array, no)
      no += g.attributes.normal.length
    }
    if (uv) {
      uv.set(g.attributes.uv.array, uo)
      uo += g.attributes.uv.length
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  if (normal) out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return out
}

module.exports = { capsule, mergeGeometries }
