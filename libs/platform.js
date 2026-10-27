/**
 * 平台垫层：一套代码同时跑在「微信小游戏」和「浏览器（本地预览/调试）」。
 *
 * 小游戏端需要补齐 three.js 期望的浏览器全局（document/window/performance 等），
 * 并提供 canvas 工厂。浏览器端直接透传，什么都不做。
 *
 * 注意：three.js r128 在本工程中只使用 WebGL 渲染 + CanvasTexture，
 * 不使用任何加载器（TextureLoader/ImageLoader/FileLoader），
 * 因此不需要完整的 weapp-adapter，这个精简垫层已覆盖其全部依赖面。
 */
(function () {
  const isMiniGame =
    typeof wx !== 'undefined' &&
    typeof wx.getSystemInfoSync === 'function' &&
    typeof wx.createCanvas === 'function'

  const G = typeof globalThis !== 'undefined' ? globalThis : this

  /**
   * 同时挂到全局与 module.exports。
   * 两条分支都必须走这里——历史上小游戏分支误写成 `module.exports = Platform`
   * 而 Platform 仍是初始的 null，导致微信端 require 拿到 null 直接崩。
   */
  function publish(platform) {
    G.Platform = platform
    if (typeof module !== 'undefined' && module && module.exports) module.exports = platform
    return platform
  }

  if (!isMiniGame) {
    // 浏览器：原样导出，供预览页使用
    publish({
      isMiniGame: false,
      screen: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      }),
      displayCanvas: () => document.getElementById('game'),
      create2DCanvas: (w, h) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        return c
      },
      storage: {
        get: (k, d) => {
          try {
            const v = window.localStorage.getItem(k)
            return v == null ? d : JSON.parse(v)
          } catch (e) {
            return d
          }
        },
        set: (k, v) => {
          try {
            window.localStorage.setItem(k, JSON.stringify(v))
            return true
          } catch (e) {
            return false
          }
        },
        remove: (k) => {
          try {
            window.localStorage.removeItem(k)
          } catch (e) {}
        },
      },
      now: () => performance.now(),
      onTouch: (handlers) => {
        const canvas = document.getElementById('game')
        const toLocal = (e) => {
          // touchend 时 touches 已空，必须退到 changedTouches，否则按钮"松开才触发"拿不到坐标
          const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e
          const r = canvas.getBoundingClientRect()
          return { x: t.clientX - r.left, y: t.clientY - r.top }
        }
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handlers.start(toLocal(e)) }, { passive: false })
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handlers.move(toLocal(e)) }, { passive: false })
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); handlers.end(toLocal(e)) }, { passive: false })
        canvas.addEventListener('touchcancel', (e) => { e.preventDefault(); handlers.end() }, { passive: false })
        canvas.addEventListener('mousedown', (e) => handlers.start(toLocal(e)))
        canvas.addEventListener('mousemove', (e) => { if (e.buttons) handlers.move(toLocal(e)) })
        canvas.addEventListener('mouseup', (e) => handlers.end(toLocal(e)))
        // 鼠标拖到窗口外或窗口失焦时不会收到 mouseup，不收尾会让转向状态永久卡住
        const abort = () => handlers.end()
        canvas.addEventListener('mouseleave', abort)
        window.addEventListener('blur', abort)
      },
      vibrate: () => {},
      exit: () => {},
    })
    return
  }

  // ---------------- 小游戏端 ----------------

  // 1) three.js 期望的浏览器全局（最小可用集）
  if (typeof G.window === 'undefined') G.window = G
  if (typeof G.self === 'undefined') G.self = G
  if (typeof G.navigator === 'undefined') G.navigator = { userAgent: 'minigame', platform: 'minigame' }
  if (typeof G.performance === 'undefined') {
    G.performance = { now: () => Date.now() }
  }
  if (typeof G.requestAnimationFrame === 'undefined') {
    G.requestAnimationFrame = (cb) => setTimeout(() => cb(G.performance.now()), 16)
    G.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  // three 的兜底路径会创建 canvas/img（本工程不走，但补齐以防万一）
  function makeCanvas(w, h) {
    if (typeof wx.createOffscreenCanvas === 'function') {
      const c = wx.createOffscreenCanvas({ type: '2d' })
      if (w) c.width = w
      if (h) c.height = h
      return c
    }
    const c = wx.createCanvas()
    if (w) c.width = w
    if (h) c.height = h
    return c
  }
  if (typeof G.document === 'undefined') {
    const bodyStub = {
      appendChild() {},
      removeChild() {},
      insertBefore() {},
    }
    G.document = {
      createElement: (tag) => makeCanvas(),
      createElementNS: (_ns, tag) => makeCanvas(),
      body: bodyStub,
      documentElement: bodyStub,
      addEventListener() {},
      removeEventListener() {},
    }
  }
  if (typeof G.Image === 'undefined') {
    G.Image = function Image() {}
  }
  if (typeof G.HTMLCanvasElement === 'undefined') G.HTMLCanvasElement = function HTMLCanvasElement() {}
  if (typeof G.HTMLImageElement === 'undefined') G.HTMLImageElement = function HTMLImageElement() {}
  if (typeof G.location === 'undefined') G.location = { href: '', origin: '' }
  if (typeof G.addEventListener === 'undefined') {
    G.addEventListener = () => {}
    G.removeEventListener = () => {}
  }

  // 2) 平台能力
  let sysInfo = null
  function sys() {
    if (!sysInfo) {
      try {
        sysInfo = wx.getSystemInfoSync()
      } catch (e) {
        sysInfo = { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }
      }
    }
    return sysInfo
  }

  publish({
    isMiniGame: true,
    screen: () => {
      const s = sys()
      return {
        width: s.windowWidth,
        height: s.windowHeight,
        pixelRatio: Math.min(s.pixelRatio || 2, 2),
      }
    },
    // 小游戏中全局 canvas 即上屏画布
    displayCanvas: () => (typeof canvas !== 'undefined' ? canvas : makeCanvas()),
    // 离屏 2D 画布（用作 UI 贴图）
    create2DCanvas: (w, h) => makeCanvas(w, h),
    storage: {
      get: (k, d) => {
        try {
          const v = wx.getStorageSync(k)
          return v === '' || v == null ? d : v
        } catch (e) {
          return d
        }
      },
      set: (k, v) => {
        try {
          wx.setStorageSync(k, v)
          return true
        } catch (e) {
          return false
        }
      },
      remove: (k) => {
        try {
          wx.removeStorageSync(k)
        } catch (e) {}
      },
    },
    now: () => Date.now(),
    onTouch: (handlers) => {
      wx.onTouchStart((t) => {
        const p = t.touches && t.touches[0]
        if (p) handlers.start({ x: p.clientX, y: p.clientY })
      })
      wx.onTouchMove((t) => {
        const p = t.touches && t.touches[0]
        if (p) handlers.move({ x: p.clientX, y: p.clientY })
      })
      wx.onTouchEnd((t) => {
        const p = (t.changedTouches && t.changedTouches[0]) || (t.touches && t.touches[0])
        handlers.end(p ? { x: p.clientX, y: p.clientY } : null)
      })
      // 老版本基础库没有 onTouchCancel，注册失败不能连带整个游戏起不来
      if (typeof wx.onTouchCancel === 'function') wx.onTouchCancel(() => handlers.end())
    },
    vibrate: (type) => {
      try {
        if (type === 'light') wx.vibrateShort({ type: 'light' })
        else wx.vibrateLong()
      } catch (e) {}
    },
    // 小游戏退出 API（结算页可用）
    exit: () => {
      try {
        wx.exitMiniProgram()
      } catch (e) {}
    },
  })
})()
