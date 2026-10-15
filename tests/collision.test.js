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
    const player = { x: 0, y: 0, radius: 0.95 }
    // 障碍本帧从 z=-3 一路跨到 z=+2.6（窗口只有 1.7），点判定会漏掉
    const swept = { x: 0.3, y: 0, radius: 1.4, z: 2.6, id: 'swept' }
    assert.strictEqual(findCollision(player, [swept], 1.7), null, '不带 sweep 时确实会漏（旧行为）')
    const hit = findCollision(player, [swept], 1.7, 5.6)
    assert.ok(hit && hit.id === 'swept', '带 sweep 后应命中')

    // 但已经远离玩家很久的障碍（上一帧就飞过去了）不应被误判
    const gone = { x: 0.3, y: 0, radius: 1.4, z: 9, id: 'gone' }
    assert.strictEqual(findCollision(player, [gone], 1.7, 1.0), null)
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
