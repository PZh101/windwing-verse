/**
 * 碰撞判定（纯逻辑）
 * 玩家与障碍在 x-y 平面做圆-圆检测；z 方向由世界层保证处于同一走廊。
 */

/**
 * @param {{x:number,y:number,radius:number}} a
 * @param {{x:number,y:number,radius:number}} b
 * @returns {boolean} 是否相交
 */
function circlesOverlap(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const r = a.radius + b.radius
  return dx * dx + dy * dy <= r * r
}

/**
 * 从活跃障碍中找出与玩家碰撞的第一个障碍
 *
 * 采用「扫掠判定」而非点判定：障碍本帧还要从当前 z 继续前进 sweep（朝 +z、
 * 即朝玩家所在的 z=0 平面逼近），只要这段区间 [z, z+sweep] 与玩家所在的判定
 * 窗口 [-zWindow, zWindow] 有交集就参与圆检测。掉帧或高速冲刺时单帧位移
 * 远大于窗口也不会穿透——区间相交对任意 sweep 都成立，不存在隧穿窗口。
 *
 * ⚠️ 调用约定：`z` 必须是**本帧位移之前**的位置，`sweep` 是本帧剩余的位移量。
 * world.js 里障碍是 `z += speed*dt`（向 +z 移动），所以 main.js 在
 * `world.update()` 之前取快照、之后才知道 move 的写法是对的；
 * 若把区间写成 [z, z+sweep] 之外的任何形式都会漏判窗口后方的障碍。
 *
 * @param {{x:number,y:number,radius:number}} player
 * @param {Array<{x:number,y:number,radius:number,z:number}>} obstacles
 * @param {number} zWindow 判定窗口（对称）
 * @param {number} [sweep] 本帧 z 方向位移（0 表示静止，退化为对称点判定）
 * @returns {object|null} 碰撞到的障碍或 null
 */
function findCollision(player, obstacles, zWindow, sweep) {
  const lo = -zWindow
  const hi = zWindow
  const s = Math.max(0, sweep || 0)
  for (const ob of obstacles) {
    if (ob.dead) continue
    // 区间 [ob.z, ob.z + s] 与 [lo, hi] 无交集 => 本帧不会经过玩家走廊
    if (ob.z > hi || ob.z + s < lo) continue
    if (circlesOverlap(player, ob)) return ob
  }
  return null
}

/**
 * 擦身而过（near miss）判定：已经越过玩家所在平面、且距离很近但没撞上的障碍
 * 用于给"躲过去了"一个正反馈；调用方需要自己去重（每个障碍只记一次）
 *
 * @param {{x:number,y:number,radius:number}} player
 * @param {Array<object>} obstacles 需含 x/y/z/radius
 * @param {number} factor 距离系数（>1，越大越容易触发）
 * @param {number} fromZ z 下界（一般取 0：已到达或刚越过玩家平面）
 * @param {number} toZ z 上界（一般取本帧位移 + 余量）
 * @returns {Array<object>} 擦身障碍列表
 */
function findNearMiss(player, obstacles, factor, fromZ, toZ) {
  const out = []
  const tol = player.radius
  for (const ob of obstacles) {
    if (ob.dead) continue
    if (ob.z < fromZ || ob.z > toZ) continue
    const dx = player.x - ob.x
    const dy = player.y - ob.y
    const dst2 = dx * dx + dy * dy
    const contact = player.radius + ob.radius
    const reach = contact + tol * factor
    if (dst2 > contact * contact && dst2 <= reach * reach) out.push(ob)
  }
  return out
}

/**
 * 点是否在矩形内（UI 命中测试）
 */
function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h
}

module.exports = { circlesOverlap, findCollision, findNearMiss, pointInRect }
