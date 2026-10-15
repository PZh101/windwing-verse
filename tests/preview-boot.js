/**
 * 本地预览脚手架（仅用于开发验证，不参与小游戏打包）
 * 用一个极小的同步 CJS 加载器在浏览器里跑小游戏代码：
 *   - libs/platform.js 走浏览器分支
 *   - libs/three.min.js 是 UMD，exports 分支直接被加载器接到
 *   - src/** 用 require 相对路径互相引用
 */
(function () {
  const canvas = document.getElementById('game')
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr)
    canvas.height = Math.floor(window.innerHeight * dpr)
    canvas.style.width = window.innerWidth + 'px'
    canvas.style.height = window.innerHeight + 'px'
  }
  fit()
  window.addEventListener('resize', fit)

  const registry = new Map()
  const cache = new Map()

  function normalize(dir, request) {
    const parts = (dir + '/' + request).split('/')
    const out = []
    for (const p of parts) {
      if (p === '' || p === '.') continue
      if (p === '..') out.pop()
      else out.push(p)
    }
    let id = out.join('/')
    if (!/\.js$/.test(id)) id += '.js'
    return id
  }

  function load(id) {
    if (cache.has(id)) return cache.get(id)
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/' + id, false)
    xhr.send()
    if (xhr.status !== 200) throw new Error('cannot load ' + id + ' (' + xhr.status + ')')
    const code = xhr.responseText
    const module = { exports: {} }
    cache.set(id, module.exports) // 先占位，允许循环引用
    const dir = id.split('/').slice(0, -1).join('/')
    const requireFn = (request) => {
      if (request === 'three') return window.THREE
      return load(normalize(dir, request))
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function('module', 'exports', 'require', 'window', 'globalThis', code)
    fn.call(window, module, module.exports, requireFn, window, window)
    cache.set(id, module.exports)
    registry.set(id, module.exports)
    return module.exports
  }

  // 预加载 three（UMD 在无 module 时会挂 window.THREE；这里走 module 分支）
  load('libs/three.min.js')
  window.THREE = window.THREE || registry.get('libs/three.min.js')
  load('libs/platform.js')
  const Game = load('src/main.js').Game
  const game = new Game()
  window.__windwing = game
  console.log('[preview] booted')
})()
