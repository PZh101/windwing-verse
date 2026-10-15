# 风翼诗咒（WindWing Verse）

微信小游戏 · 3D 飞行躲避 × 语文「名句默写」挑战

> 驾驶风之翼翱翔云海，躲避浮空巨石、雷暴云与鸟群。
> 撞上发光「诗碑」不会死——你会被卷入一场限时「诗咒」：像语文考试一样补全名句。
> 答对：无敌冲刺 + 清屏 + 加分；答错/超时：坠落，GameOver。

## 玩法规则

| 事件 | 结果 |
| --- | --- |
| 撞普通障碍（巨石/雷云/鸟群） | 风羽 -1（共 3 片，耗尽坠落），且**立即减速**（见速度模型） |
| 撞发光诗碑 | 触发「诗咒」：限时 12s 名句填空（四选一） |
| 诗咒答对 | +300 基础分、连击倍率、无敌冲刺 3.6s、清除前方障碍、回复 1 风羽 |
| 诗咒答错/超时 | 直接坠落（诗咒反噬） |
| 贴着障碍擦身而过 | +8 分、**小幅提速** |
| 飞行距离 | 持续积分，单位距离得分随速度加权（最高 ×1.45） |

- 操控：手指按住屏幕拖动（虚拟摇杆式相对位移），浏览器预览支持 WASD/方向键。
- 题库：内置 95 组高考/中考名句默写风格题目，分三档难度，按飞行时间加权出题，近 8 题不重复。
- 排行榜：本机 Top 50（wx storage 持久化），可改昵称。

### 速度模型（一阶动力学）

- **巡航加速**：线性阻尼终端速度 `v(t) = v∞ + (v0 − v∞)·e^(−t/τ)`，v0=13、v∞=40 m/s、τ=55s——起步提速明显，越接近上限越平缓。
- **撞击减速**：注入"速度赤字" `d += max(3, 0.22×v)`（飞得越快撞得越狠），赤字按 τ=4.2s 指数衰减回 0，约 12s 恢复巡航；赤字上限 12 m/s、速度地板 6 m/s，连环撞击也不会停死。
- **擦身提速**：`d −= 1.3`，同样衰减回 0；最多可超速 2.5 m/s。
- 离散推进全部用解析解，**与帧率无关**（掉帧不会改变速度曲线）。
- 全部参数集中在 `src/config.js` 的 SPEED 段，实现见 `src/logic/speed.js`（纯逻辑，9 项单测）。

## 目录结构

```
game.js               小游戏入口（平台垫层 -> three.js -> 主控）
game.json             小游戏配置（竖屏）
project.config.json   微信开发者工具项目配置
libs/
  platform.js         双端平台垫层（小游戏 wx API / 浏览器）
  three.min.js        three.js r128 (UMD)
src/
  config.js           全部可调数值（速度/生成/相机/规则/计分）
  rng.js              可种子随机数 + shuffle/weighted/pick
  logic/
    spawner.js        障碍生成调度（轨道网格覆盖/反驻守/成对出现/诗碑节奏）
    collision.js      圆形碰撞判定（扫掠式防穿透，纯逻辑，可单测）
    speed.js          飞行速度模型（终端速度/撞击赤字/擦身提速）
    spell.js          诗咒挑战状态机（present/choose/timeout）
    spell.js          诗咒挑战状态机（present/choose/timeout）
    scoring.js        计分与连击
  data/poems.js       诗句题库（95 组，含干扰项与出处）
  textures.js         程序化贴图（零外部图片，全部 Canvas 绘制）
  player.js           风之翼模型 + 飞行动画
  obstacles.js        障碍工厂 + 对象池（诗碑/巨石/雷云/鸟群）
  world.js            3D 世界装配与每帧推进
  ui.js               2D 覆盖层（菜单/HUD/诗咒卡/结算/排行榜）
  main.js             状态机与触摸路由
  storage.js          wx storage 封装
  leaderboard.js      本机排行榜
tests/
  run.js              单元测试入口（43 项断言）
  deps.check.js       require 路径与导出静态检查
  e2e.js              端到端渲染验证（本地 Chrome/Edge 驱动）
  preview.html/js     浏览器预览脚手架
```

## 本地预览（浏览器）

```
# 任意静态服务器指向项目根目录，例如：
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>{let u=p.join(__dirname,decodeURIComponent(q.url.split('?')[0]));if(!f.existsSync(u)||f.statSync(u).isDirectory())u=p.join(__dirname,'tests/preview.html');s.setHeader('content-type',u.endsWith('.html')?'text/html;charset=utf-8':'application/javascript;charset=utf-8');s.end(f.readFileSync(u))}).listen(8137)"
# 打开 http://127.0.0.1:8137/tests/preview.html
```

键盘：WASD/方向键转向，空格开始。

## 自动化验证

```
node tests/run.js          # 43 项逻辑单测（Node 直接跑，无需浏览器）
node tests/deps.check.js   # 依赖图静态检查
node tests/e2e.js          # 端到端：真实渲染跑通 菜单->飞行->诗咒->答对/答错->结算->排行榜
```

e2e 依赖 `playwright-core` + 本机 Chrome/Edge，截图输出到 `tests/shots/`。

## 如何发布到微信（可被搜索到）

1. 用微信开发者工具导入本项目（编译类型：小游戏；测试可用 touristappid）。
2. 在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册**小游戏**类目账号（个人主体也可），拿到正式 AppID 填入 `project.config.json`。
3. 开发者工具里「上传」-> 公众平台「版本管理」-> 提交审核。审核通过后发布。
4. 发布后微信内搜索游戏名「风翼诗咒」即可找到（搜索收录需要已发布线上版本）。

> 说明：当前版本排行榜为**本机存储**版（无需后端即可过审）。若要做成全服排行，可在微信公众平台开通「云开发」，把 `src/leaderboard.js` 的读写替换为云数据库调用即可，逻辑层已预留单一入口。

## 技术要点

- 零外部资源：所有贴图（天空渐变、云海、翼面织物、碑面、岩石）均由 Canvas 程序化生成，包体只有 three.js 一个 603KB 依赖。
- 双端垫层：`libs/platform.js` 抹平 wx 小游戏与浏览器的 canvas/触摸/存储/震动差异。
- 逻辑与表现分离：碰撞、出题、计分是纯逻辑模块，全部可在 Node 下单测。
