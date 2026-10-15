/**
 * 《风翼诗咒》全局配置 —— 所有可调数值集中在此
 * 单位约定：长度 = 米(m)，时间 = 秒(s)，速度 = m/s
 */

// 游玩空间（世界坐标）：风之翼活动的横向/纵向范围
const PLAYFIELD = {
  minX: -6.2,
  maxX: 6.2,
  minY: 1.6,
  maxY: 9.4,
  startX: 0,
  startY: 4.2,
}

// 风之翼本体
const PLAYER = {
  radius: 0.95,          // 碰撞半径
  followLerp: 7.5,       // 位置追随目标的平滑系数（越大越硬）
  bankMax: 0.85,         // 最大侧倾角(rad)
  pitchFactor: 0.05,     // 升降时的俯仰系数
  wingFlapSpeed: 6.0,    // 双翼扇动频率
}

// 飞行速度曲线（一阶动力学模型，详见 src/logic/speed.js）
const SPEED = {
  base: 13.0,            // 起步速度 v0 (m/s)
  max: 40.0,             // 终端速度 v∞ (m/s)：推力与线性阻力平衡后的极限
  tauGrow: 55.0,         // 巡航加速时间常数 τ (s)：越大越慢接近终端速度
  // ---- 撞击减速（速度赤字）----
  impactLoss: 0.22,      // 每次撞击损失的当前速度比例（撞得越快掉得越多）
  impactMin: 3.0,        // 单次撞击的保底掉速 (m/s)，低速时也有手感
  tauRecover: 4.2,       // 赤字恢复时间常数 (s)：约 3τ ≈ 12s 基本回满
  maxDeficit: 12.0,      // 赤字上限，防止连环撞击直接停死
  // ---- 擦身加速 ----
  grazeGain: 1.3,        // 擦身而过获得的速度加成 (m/s)
  overspeed: 2.5,        // 允许超出终端速度的上限 (m/s)
  // ---- 硬边界 ----
  floor: 6.0,            // 速度地板 (m/s)，撞击后也不会停死
  spellSlow: 0.12,       // 诗咒期间世界慢放系数
  dashBoost: 1.55,       // 答对咒语后的冲刺倍率
}

// 障碍生成
const SPAWN = {
  intervalMin: 15.0,     // 两个障碍的最小间距（米）
  intervalMax: 27.0,     // 最大间距
  intervalShrink: 0.55,  // 间距随难度的收缩系数（最终 min -> intervalMin*shrink）
  poemEvery: 6,          // 平均每 N 个障碍出现一座诗碑（下限 4）
  poemEveryMin: 4,
  spawnZ: -95,           // 障碍生成所在的 z（远在前方）
  despawnZ: 14,          // 越过此 z 回收
  maxActive: 26,         // 同屏活跃障碍上限
  // 类型权重（随难度微调：后期鸟群/雷云变多）
  weights: {
    rock: 0.46,
    storm: 0.30,
    bird: 0.24,
  },
  weightsLate: {
    rock: 0.38,
    storm: 0.34,
    bird: 0.28,
  },
  lateAfter: 45,         // 经过多少秒后切换到后期权重
  // ---- 覆盖式布局：把游玩空间切成 lanes × bands 网格 ----
  lanes: 5,              // 横向轨道数（含最左/最右）
  bands: 3,              // 纵向分层数
  edgeMargin: 0.35,      // 障碍中心距左右边界的留白（越小越贴边角）
  bandMargin: 0.3,       // 障碍中心距上下边界的留白
  laneJitter: 0.86,      // 轨道内横向抖动（× 轨宽）
  bandJitter: 0.7,       // 层内纵向抖动（× 层高）
  laneForceEvery: 3,     // 每 N 次生成强制补「最久未用」轨道
  bandForceEvery: 2,     // 每 N 次生成强制补「最久未用」层
  // ---- 反驻守：一部分障碍会冲着玩家当前位置生成 ----
  aimChance: 0.3,        // 基础瞄准概率
  aimChanceGain: 0.22,   // 随难度追加的瞄准概率
  aimJitter: 0.34,       // 瞄准时的格内抖动（越小越贴脸）
  // ---- 成组出现（中后期）----
  clusterAfter: 20,      // 多少秒后开始可能出现成对障碍
  clusterChance: 0.34,   // 基础成对概率（再乘 0.5+难度）
  clusterLaneGap: 2,     // 伴生障碍与主体至少隔几条轨（保证留出通路）
}

// 各类障碍尺寸（碰撞半径基准）
const OBSTACLE = {
  rock:  { radius: 1.35, scale: [0.8, 1.5] },
  storm: { radius: 1.7,  scale: [0.9, 1.4] },
  bird:  { radius: 0.8,  scale: [0.85, 1.15] },
  stele: { radius: 1.5,  scale: [0.95, 1.1] },
}

// 生命与咒语
const RULES = {
  feathers: 3,           // 初始风羽
  invincibleAfterHit: 1.2,  // 被普通障碍撞击后的短暂无敌(s)
  invincibleBlink: 1.2,     // 无敌期司机闪烁/rgb 提示时长
  spellTime: 12.0,       // 诗咒限时(s)
  dashDuration: 3.6,     // 答对后冲刺时长(s)
  dashClearRadius: 16,   // 答对时清除前方障碍的范围(m)
  hitZWindow: 1.7,       // 判定窗口：|z| 小于此值才做圆检测
  hitStopScale: 0.12,    // 受击卡帧：这段时间世界近乎静止
  hitStopTime: 0.11,     // 卡帧时长(s)
  hurtDuration: 0.55,    // 机体翻抖时长(s)
  grazeNear: 0.62,       // 擦身距离余量系数（× 玩家半径）
  grazeBonus: 8,         // 擦身加分
}

// 计分
const SCORE = {
  perMeter: 0.1,         // 每米距离分
  spellBase: 300,        // 答对基础分
  comboStep: 0.5,        // combo 每提升 1 的倍率增量
  comboMax: 5,           // 倍率上限
  distanceBonusPerMeter: 1, // 结算时距离折算
  speedBonus: 0.45,      // 高速奖励：距离分 × (1 + speedBonus × speedRatio)
}

// 相机
const CAMERA = {
  fov: 62,
  near: 0.1,
  far: 220,
  offset: { x: 0, y: 3.4, z: 7.2 },  // 相对风之翼
  lookAhead: 7.5,
  fovBoost: 7.0,          // 高速时 FOV 拉伸
}

// 云海与氛围
const WORLD = {
  fogNear: 55,
  fogFar: 175,
  seaZ: -60,              // 云海平面中心 z
  seaSize: 260,
  billboardCount: 14,
  trailCount: 90,
}

module.exports = {
  PLAYFIELD,
  PLAYER,
  SPEED,
  SPAWN,
  OBSTACLE,
  RULES,
  SCORE,
  CAMERA,
  WORLD,
}
