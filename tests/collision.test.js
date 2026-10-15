const assert = require('assert')
const { circlesOverlap, findCollision, findNearMiss, pointInRect } = require('../src/logic/collision')

/** 把 Object3D 形状的对象转成逻辑层能吃的快照（与 world.colliders 同构） */
function snap(o) {
  return { x: o.position.x, y: o.position.y, z: o.position.z, radius: o.userData.radius, ref: o }
}

module.exports = {
  '圆相交判定：相交/相切/相离': () => {
    assert.ok(circlesOverlap({ x: 0, y: 0, radius: 1 }, { x: 1.5, y: 0, radius: 1 }))
    assert.ok(circlesOverlap({ x: 0, y: 0, radius: 1 }, { x: 2, y: 0, radius: 1 })) // 相切算相交
    assert.ok(!circlesOverlap({ x: 0, y: 0, radius: 1 }, { x: 2.1, y: 0, radius: 1 }))
  },
  'findCollision 返回第一个命中的障碍': () => {
    const player = { x: 0, y: 0, radius: 1 }
    const obs = [
      { x: 5, y: 0, radius: 1, z: 0, id: 'a' },
      { x: 0.5, y: 0, radius: 1, z: 0, id: 'b' },
      { x: -0.5, y: 0, radius: 1, z: 0, id: 'c' },
    ]
    const hit = findCollision(player, obs, 3)
    assert.strictEqual(hit.id, 'b')
  },
  'findCollision 忽略 z 窗口外的障碍': () => {
    const player = { x: 0, y: 0, radius: 1 }
    const obs = [{ x: 0.5, y: 0, radius: 1, z: -30, id: 'far' }]
    assert.strictEqual(findCollision(player, obs, 3), null)
  },
  'findCollision 跳过 dead 障碍': () => {
    const player = { x: 0, y: 0, radius: 1 }
    const obs = [{ x: 0.5, y: 0, radius: 1, z: 0, id: 'dead', dead: true }]
    assert.strictEqual(findCollision(player, obs, 3), null)
  },
  'Object3D 经快照转换后能被正确命中（回归：坐标必须 flatten）': () => {
    const rock = { visible: true, position: { x: 0.4, y: 0.2, z: 0.5 }, userData: { radius: 1.3, kind: 'rock' } }
    const player = { x: 0, y: 0, radius: 0.95 }
    const hit = findCollision(player, [snap(rock)], 1.7)
    assert.ok(hit, '应命中')
    assert.strictEqual(hit.ref, rock, '命中结果要能回溯到原对象')
    // 反面用例：直接把 Object3D 丢进去 => 以前就是这个 bug
    assert.strictEqual(findCollision(player, [rock], 1.7), null)
  },
  '扫掠判定：单帧位移远大于窗口时不会穿透（掉帧/高速冲刺）': () => {
    const player = { x: 0.3, y: 0, radius: 0.95 }
    // 调用约定：z 是本帧位移「之前」的位置，sweep 是本帧还要走的位移（障碍朝 +z 扑向玩家）
    // 障碍从 z=-3.0 出发，本帧位移 5.6 -> 终点 z=+2.6，必定穿过 [-1.7, 1.7]，点判定会漏掉
    const incoming = { x: 0.3, y: 0, radius: 1.4, z: -3.0, id: 'incoming' }
    assert.strictEqual(findCollision(player, [incoming], 1.7), null, '不带 sweep 时确实会漏（纯点判定）')
    assert.ok(findCollision(player, [incoming], 1.7, 5.6), '带 sweep 后应命中')

    // 已经飞过玩家、且继续远离的障碍不应被误判
    const gone = { x: 0.3, y: 0, radius: 1.4, z: 9, id: 'gone' }
    assert.strictEqual(findCollision(player, [gone], 1.7, 1.0), null)
  },

  '扫掠判定：窗口后方的障碍本帧即将进入走廊时必须命中（回归）': () => {
    const player = { x: 0.3, y: 0, radius: 0.95 }
    // z=-3.0 还在窗口后方，但本帧移动 2.0 后到 -1.0，已进入 [-1.7, 1.7]
    // 旧实现把区间写成 [-win, win+sweep]，ob.z < -win 的会被直接跳过 -> 漏判
    const behind = { x: 0.3, y: 0, radius: 1.4, z: -3.0, id: 'behind' }
    assert.ok(findCollision(player, [behind], 1.7, 2.0), '本帧将进入走廊的障碍应命中')

    // 再扫一遍：对任意 sweep，代码判定都必须等于真实的区间相交
    const win = 1.7
    for (const sweep of [0, 0.4, 1.1, 2.0, 3.29, 8]) {
      for (let z = -8; z <= 8; z += 0.05) {
        const ob = [{ x: 0.3, y: 0, radius: 1.4, z }]
        const code = !!findCollision(player, ob, win, sweep)
        const real = z <= win && z + Math.max(0, sweep) >= -win
        assert.strictEqual(code, real, `sweep=${sweep} z=${z.toFixed(2)} 判定与真实区间相交不一致`)
      }
    }
  },
  'findNearMiss 只认已越过平面且没真撞上的障碍': () => {
    const player = { x: 0, y: 0, radius: 1 }
    const graze = { x: 2.4, y: 0, radius: 1, z: 0.6 }          // 已过平面、距离 2.4 <= (2 + 1*0.62)
    const farAway = { x: 6, y: 0, radius: 1, z: 0.6 }         // 太远
    const notYet = { x: 2.4, y: 0, radius: 1, z: -2.5 }       // 还没到玩家平面
    const already = { x: 1.5, y: 0, radius: 1, z: 0.6 }       // 已经撞上了，不算擦身
    const out = findNearMiss(player, [graze, farAway, notYet, already], 0.62, 0, 2)
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0], graze)
  },
  'pointInRect 边界与内部': () => {
    const r = { x: 10, y: 20, w: 100, h: 50 }
    assert.ok(pointInRect(10, 20, r))
    assert.ok(pointInRect(110, 70, r))
    assert.ok(pointInRect(60, 45, r))
    assert.ok(!pointInRect(9, 45, r))
    assert.ok(!pointInRect(60, 71, r))
  },
}
