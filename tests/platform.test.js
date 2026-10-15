/**
 * 平台垫层冒烟测试（回归防线）
 *
 * 为什么必须有这个文件：微信小游戏分支以前把 `module.exports = Platform` 写在了
 * 小游戏路径的末尾，而那个分支里 Platform 变量从未被赋值（一直是初始的 null），
 * 结果微信端 require('./libs/platform') 拿到 null，main.js 第一行就炸。
 * 之所以一直没被发现，是因为所有测试都跑在 Node/浏览器下，
 * `isMiniGame === false` 走的是另一条能正常工作的分支。
 *
 * 所以这里显式桩出 wx 全局，两条分支各跑一遍。
 *
 * 注意：Platform 的方法（screen/storage 等）会去读全局 wx / window，
 * 必须在桩还活着的时候调用，所以统一用 withPlatform() 包起来执行。
 */
const assert = require('assert')
const path = require('path')

const PLATFORM_PATH = path.resolve(__dirname, '..', 'libs', 'platform.js')

/** 桩一个够用的微信小游戏全局 */
function stubWx() {
  const listeners = { start: [], move: [], end: [], cancel: [] }
  return {
    __listeners: listeners,
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null }),
    createOffscreenCanvas: () => ({ width: 0, height: 0, getContext: () => null }),
    onTouchStart: (cb) => listeners.start.push(cb),
    onTouchMove: (cb) => listeners.move.push(cb),
    onTouchEnd: (cb) => listeners.end.push(cb),
    onTouchCancel: (cb) => listeners.cancel.push(cb),
    vibrateShort: () => {},
    vibrateLong: () => {},
    getStorageSync: () => '',
    setStorageSync: () => {},
    removeStorageSync: () => {},
  }
}

const GLOBAL_KEYS = ['wx', 'window', 'document', 'navigator', 'performance', 'requestAnimationFrame', 'Platform', 'canvas']

/**
 * 在受控的全局环境里重新加载一次 platform.js，并在环境被拆除前执行 fn。
 * @param {{wx?:object|null, browser?:boolean}} opts
 * @param {(Platform:object, globalRef:object)=>any} fn
 */
function withPlatform(opts, fn) {
  const saved = {}
  for (const k of GLOBAL_KEYS) {
    saved[k] = globalThis[k]
    delete globalThis[k]
  }
  if (opts.wx) globalThis.wx = opts.wx
  if (opts.browser) {
    globalThis.window = { innerWidth: 375, innerHeight: 667, devicePixelRatio: 2, localStorage: null }
    globalThis.document = { createElement: () => ({ getContext: () => null }), getElementById: () => null }
  }

  delete require.cache[PLATFORM_PATH]
  try {
    const P = require(PLATFORM_PATH)
    return fn(P, globalThis)
  } finally {
    delete require.cache[PLATFORM_PATH]
    for (const k of GLOBAL_KEYS) {
      delete globalThis[k]
      if (saved[k] !== undefined) globalThis[k] = saved[k]
    }
  }
}

module.exports = {
  '小程序端：module.exports 必须是对象而不是 null': () => {
    withPlatform({ wx: stubWx() }, (P, g) => {
      assert.ok(P, 'module.exports 不能是 null/undefined')
      assert.strictEqual(typeof P, 'object', 'module.exports 必须是平台对象')
      assert.strictEqual(P.isMiniGame, true)
      for (const api of ['screen', 'displayCanvas', 'create2DCanvas', 'now', 'onTouch', 'vibrate', 'exit']) {
        assert.strictEqual(typeof P[api], 'function', `缺少 Platform.${api}`)
      }
      for (const api of ['get', 'set', 'remove']) {
        assert.strictEqual(typeof P.storage[api], 'function', `缺少 Platform.storage.${api}`)
      }
      assert.strictEqual(typeof g.Platform, 'object', '全局 Platform 也不能是 null')
      assert.strictEqual(g.Platform.isMiniGame, true)
    })
  },

  '小程序端：screen() 返回 css 尺寸且 pixelRatio 被钳到 2': () => {
    withPlatform({ wx: stubWx() }, (P) => {
      const s = P.screen()
      assert.strictEqual(s.width, 390)
      assert.strictEqual(s.height, 844)
      assert.strictEqual(s.pixelRatio, 2, '像素比不能超过 2，否则 UI 离屏画布过大')
    })
  },

  '小程序端：getSystemInfoSync 抛异常时要有兜底尺寸': () => {
    const wx = stubWx()
    wx.getSystemInfoSync = () => {
      throw new Error('基础库不支持')
    }
    withPlatform({ wx }, (P) => {
      const s = P.screen()
      assert.strictEqual(s.width, 375)
      assert.strictEqual(s.height, 667)
    })
  },

  '小程序端：onTouch 注册齐手势，onTouchCancel 缺失也不崩': () => {
    const wx = stubWx()
    delete wx.onTouchCancel // 模拟老版本基础库
    withPlatform({ wx }, (P) => {
      assert.doesNotThrow(() => P.onTouch({ start() {}, move() {}, end() {} }))
      assert.strictEqual(wx.__listeners.start.length, 1)
      assert.strictEqual(wx.__listeners.move.length, 1)
      assert.strictEqual(wx.__listeners.end.length, 1)
    })
  },

  '小程序端：touchstart 会把坐标交给处理器': () => {
    const wx = stubWx()
    withPlatform({ wx }, (P) => {
      let got = null
      P.onTouch({
        start: (p) => {
          got = p
        },
        move() {},
        end() {},
      })
      wx.__listeners.start[0]({ touches: [{ clientX: 12, clientY: 34 }] })
      assert.deepStrictEqual(got, { x: 12, y: 34 })
    })
  },

  '浏览器端：导出 isMiniGame=false 且屏幕来自 window': () => {
    withPlatform({ browser: true }, (P) => {
      assert.ok(P)
      assert.strictEqual(P.isMiniGame, false)
      const s = P.screen()
      assert.strictEqual(s.width, 375)
      assert.strictEqual(s.height, 667)
      assert.strictEqual(s.pixelRatio, 2)
    })
  },

  '两条分支导出的都是对象（防 null 回归）': () => {
    for (const opts of [{ wx: stubWx() }, { browser: true }]) {
      withPlatform(opts, (P, g) => {
        const tag = opts.wx ? 'minigame' : 'browser'
        assert.ok(P && typeof P === 'object', `${tag}: module.exports 失效`)
        assert.ok(g.Platform && typeof g.Platform === 'object', `${tag}: 全局 Platform 失效`)
        assert.strictEqual(P.isMiniGame, g.Platform.isMiniGame, `${tag}: 全局与导出不一致`)
      })
    }
  },
}
