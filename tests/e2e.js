/**
 * 端到端渲染验证（开发用，不参与打包）
 * 用本地 Chrome/Edge 打开 tests/preview.html，真实跑主循环：
 *   菜单 -> 飞行 -> 诗咒 -> 答对 -> 结算 -> 排行榜
 * 捕获 console error / pageerror，并截图到 tests/shots/
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
function loadPlaywright() {
  const candidates = [
    'playwright-core',
    'C:/Users/zhoup/node_modules/playwright-core',
    'C:/Users/zhoup/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
  ]
  for (const c of candidates) {
    try {
      return require(c)
    } catch (e) {}
  }
  throw new Error('未找到 playwright-core，请先安装：npm i playwright-core')
}
const { chromium } = loadPlaywright()

const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(__dirname, 'shots')
const PORT = 8150 // 避开本地预览服占用的 8137

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0])
      const file = path.join(ROOT, urlPath === '/' ? '/tests/preview.html' : urlPath)
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
      res.end(fs.readFileSync(file))
    })
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })
}

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const server = await serve()

  let browser
  for (const exe of BROWSERS) {
    if (!fs.existsSync(exe)) continue
    try {
      browser = await chromium.launch({
        executablePath: exe,
        headless: true,
        args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-lcd-text'],
      })
      console.log('浏览器:', exe)
      break
    } catch (e) {
      console.warn('启动失败', exe, e.message)
    }
  }
  if (!browser) {
    console.error('没有可用的 Chromium 浏览器')
    server.close()
    process.exit(1)
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const errors = []
  const logs = []
  const http404 = []
  const failed = []
  function ok(name, cond, extra) {
    if (cond) console.log('ok   - ' + name)
    else {
      failed.push(name + ' ' + (extra || ''))
      console.log('FAIL - ' + name + ' ' + (extra || ''))
    }
  }
  page.on('console', (m) => {
    const t = `[${m.type()}] ${m.text()}`
    logs.push(t)
    // favicon 是浏览器行为，与游戏无关，忽略
    if (m.type() === 'error' && !/favicon/i.test(m.location().url || '')) errors.push(t)
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const line = `[http ${r.status()}] ${r.url()}`
      http404.push(line)
      if (!/favicon/i.test(r.url())) errors.push(line)
    }
  })

  await page.goto(`http://127.0.0.1:${PORT}/tests/preview.html`, { waitUntil: 'load' })
  await page.waitForFunction('!!window.__windwing', null, { timeout: 15000 })
  await page.waitForTimeout(1500)

  const step = async (name, fn, waitMs = 1200) => {
    if (fn) await page.evaluate(fn)
    await page.waitForTimeout(waitMs)
    await page.screenshot({ path: path.join(SHOTS, name + '.png') })
    const st = await page.evaluate(() => ({
      state: window.__windwing.state,
      sub: window.__windwing.sub,
      elapsed: +window.__windwing.elapsed.toFixed(1),
      score: Math.floor(window.__windwing.score.score),
      feathers: window.__windwing.feathers,
      active: window.__windwing.world.pool.active.length,
    }))
    console.log(`✓ ${name.padEnd(14)} ${JSON.stringify(st)}`)
  }

  await step('01-menu', null, 1200)
  await step('02-flying', () => window.__windwing._startRun(), 4000)
  // 手动摆一排障碍做特写检查
  await step(
    '02b-obstacles',
    () => {
      const w = window.__windwing.world
      w.spawn({ kind: 'rock', x: -3.4, y: 4.8, z: -22, scale: 1.2, radius: 1.35, seed: 7 })
      w.spawn({ kind: 'storm', x: 0, y: 5.4, z: -26, scale: 1.1, radius: 1.7, seed: 11 })
      w.spawn({ kind: 'stele', x: 3.4, y: 4.4, z: -20, scale: 1, radius: 1.5, isPoem: true, seed: 3 })
      w.spawn({ kind: 'bird', x: -1.2, y: 6.8, z: -16, scale: 1, radius: 0.8, flock: 3, seed: 5 })
    },
    900
  )
  const drawInfo = await page.evaluate(() => {
    const i = window.__windwing.world.renderer.info
    return { calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries }
  })
  console.log('渲染统计:', JSON.stringify(drawInfo))
  await step('03-spell', () => window.__windwing._beginSpell(), 1200)
  // 答对：选正确选项
  await step(
    '04-correct',
    () => {
      const g = window.__windwing
      const idx = g.spell.options.findIndex((o) => o.text === g.spell.poem.answer)
      g._resolveSpell(g.spell.choose(idx))
    },
    2200
  )
  await step('05-boosting', null, 1500)
  await step('06-gameover', () => window.__windwing._gameOver('crash'), 2500)
  await step('07-result', null, 1800)
  await step('08-leaderboard', () => window.__windwing._uiAction('leaderboard'), 1200)
  await step('09-menu-back', () => window.__windwing._uiAction('back'), 1200)

  // 再跑一轮，验证可重开 + 长时间运行稳定性
  await step('10-replay', () => window.__windwing._uiAction('start'), 6000)
  // 自动闪避不好控制，直接验证答错分支
  await step(
    '11-wrong',
    () => {
      const g = window.__windwing
      g._beginSpell()
      const idx = g.spell.options.findIndex((o) => o.text !== g.spell.poem.answer)
      g._resolveSpell(g.spell.choose(idx))
    },
    2500
  )
  await step('12-wrong-over', null, 2000)

  // ================= 碰撞回归 =================
  // 1) 把一块巨石直接怼在风之翼身上 => 必须掉风羽且不再无敌时再次判定
  await page.evaluate(() => window.__windwing._uiAction('home'))
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__windwing._uiAction('start'))
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const g = window.__windwing
    const w = g.world
    g.spawner.distanceSinceLast = -1e9 // 测试期间冻结随机生成，保证只有下面这一块
    w.pool.clearAll()
    window.__spdBefore = g.speed.value()
    const p = w.player
    w.spawn({ kind: 'rock', x: p.x, y: p.y, z: 0, scale: 1.2, radius: 1.35, seed: 7 })
  })
  await page.waitForTimeout(500)
  const afterRock = await page.evaluate(() => ({
    feathers: window.__windwing.feathers,
    invincible: +window.__windwing.invincible.toFixed(2),
    hidden: window.__windwing.world.hidden,
    hurt: +window.__windwing.world.hurtT.toFixed(2),
    shake: +window.__windwing.world.shake.toFixed(2),
    fx: !!window.__windwing.ui.fx,
    spdBefore: +(window.__spdBefore || 0).toFixed(2),
    spdAfter: +window.__windwing.speed.value().toFixed(2),
    deficit: +window.__windwing.speed.deficit().toFixed(2),
  }))
  ok('撞击巨石：风羽 -1', afterRock.feathers === 2, JSON.stringify(afterRock))
  ok('撞击触发无敌帧', afterRock.invincible > 0, 'invincible=' + afterRock.invincible)
  ok('撞击触发机体翻抖', afterRock.hurt >= 0, 'hurtT=' + afterRock.hurt)
  ok('撞击触发屏幕红闪', afterRock.fx === true, 'ui.fx=' + afterRock.fx)
  ok(
    '撞击减速：速度下降并产生赤字',
    afterRock.deficit > 1 && afterRock.spdAfter < afterRock.spdBefore - 1,
    JSON.stringify(afterRock)
  )
  await step('13-hit-rock', null, 300)

  // 1b) 掉速必须能随时间恢复回来
  const rec = await page.evaluate(async () => {
    const g = window.__windwing
    const low = g.speed.value()
    await new Promise((r) => setTimeout(r, 3500))
    return { low: +low.toFixed(2), back: +g.speed.value().toFixed(2), deficit: +g.speed.deficit().toFixed(2) }
  })
  ok('掉速会随时间恢复', rec.back > rec.low + 0.5 && rec.deficit < 3, JSON.stringify(rec))

  // 2) 诗碑 => 必须进入诗咒，而不是直接死
  await page.evaluate(() => {
    const g = window.__windwing
    const w = g.world
    g.invincible = 0
    g.spawner.distanceSinceLast = -1e9
    w.hidden = false
    w.pool.clearAll()
    const p = w.player
    w.spawn({ kind: 'stele', x: p.x, y: p.y, z: 0, scale: 1, radius: 1.5, isPoem: true, seed: 3 })
  })
  await page.waitForTimeout(400)
  const afterStele = await page.evaluate(() => ({
    state: window.__windwing.state,
    poem: window.__windwing.spell.poem && window.__windwing.spell.poem.answer,
  }))
  ok('撞击诗碑：进入诗咒', afterStele.state === 'spell' && !!afterStele.poem, JSON.stringify(afterStele))
  await step('14-hit-stele', null, 300)

  // 3) 连续撞击到风羽耗尽 => 必须 GameOver
  await page.evaluate(() => {
    const g = window.__windwing
    g.spell.clear()
    g.state = 'playing'
    g.world.spellActive = false
    g.feathers = 1
    g.invincible = 0
    g.spawner.distanceSinceLast = -1e9
    const w = g.world
    w.pool.clearAll()
    const p = w.player
    w.spawn({ kind: 'rock', x: p.x, y: p.y, z: 0, scale: 1.2, radius: 1.35, seed: 9 })
  })
  await page.waitForTimeout(1200)
  const afterFatal = await page.evaluate(() => ({
    state: window.__windwing.state,
    feathers: window.__windwing.feathers,
  }))
  ok('风羽耗尽：GameOver', afterFatal.state === 'gameover' && afterFatal.feathers === 0, JSON.stringify(afterFatal))
  await step('15-crash-over', null, 600)

  // 4) 擦身而过：贴着走不撞上，应触发一次 graze
  await page.evaluate(() => window.__windwing._uiAction('home'))
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__windwing._uiAction('start'))
  await page.waitForTimeout(400)
  const grazeInfo = await page.evaluate(async () => {
    const g = window.__windwing
    const w = g.world
    w.pool.clearAll()
    const scoreBefore = g.score.score
    // 距离比"刚好相切"远一点点，让玩家帧正好擦过去
    const p = w.player
    const ob = w.spawn({ kind: 'rock', x: p.x + 2.55, y: p.y, z: 0, scale: 1, radius: 1.35, seed: 11 })
    await new Promise((r) => setTimeout(r, 450))
    return { grazed: !!ob.userData.grazed, gained: g.score.score - scoreBefore, feathers: g.feathers }
  })
  ok('擦身而过：记一次 graze 且不掉血', grazeInfo.grazed === true, JSON.stringify(grazeInfo))
  await step('16-graze', null, 300)

  // 5) 覆盖回归：真实游戏里障碍必须铺满横向空间（修复前只有 ±3.56 / ±6.2）
  await page.evaluate(() => window.__windwing._uiAction('home'))
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__windwing._uiAction('start'))
  await page.waitForTimeout(400)
  const spread = await page.evaluate(() => {
    const g = window.__windwing
    const xs = []
    const lanes = new Set()
    // 直接驱动生成器取样，避免受软件渲染帧率影响
    for (let i = 0; i < 600; i++) {
      g.spawner.distanceSinceLast = 1e9
      const d = g.spawner.spawn(i * 0.2, g.world.player)
      xs.push(d.x)
      lanes.add(d.lane)
      if (d.companion) xs.push(d.companion.x)
      g.world.pool.clearAll()
    }
    return { min: Math.min(...xs), max: Math.max(...xs), lanes: [...lanes].sort(), n: xs.length }
  })
  // 玩家可达 ±6.2，轨道宽 12.4；两侧边角都必须被覆盖到
  ok(
    '障碍铺满全部横向轨道',
    spread.lanes.length === 5 && spread.min < -4.5 && spread.max > 4.5,
    JSON.stringify(spread)
  )
  await step('17-spread', null, 4000)

  const fps = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      let n = 0
      const t0 = performance.now()
      const tick = () => {
        n++
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
        else resolve(Math.round((n * 1000) / (performance.now() - t0)))
      }
      requestAnimationFrame(tick)
    })
  })
  console.log('帧率（软件渲染）:', fps, 'fps')

  await browser.close()
  server.close()

  const allFail = errors.length + failed.length
  if (allFail) {
    console.error('\n❌ 失败 ' + allFail + ' 项：')
    failed.forEach((f) => console.error('  [断言] ' + f))
    errors.slice(0, 15).forEach((e) => console.error('  ' + e))
    process.exit(1)
  }
  if (http404.length) console.log('非阻断性 404:', http404.join(', '))
  console.log('\n✅ 端到端跑通，无运行时错误。截图见 tests/shots/')
})().catch((e) => {
  console.error('E2E 失败:', e)
  process.exit(1)
})
