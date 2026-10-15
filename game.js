/**
 * 《风翼诗咒》小游戏入口
 * 加载顺序：平台垫层 -> three.js -> 主控
 */
require('./libs/platform')
require('./libs/three.min.js')
const { Game } = require('./src/main')

// 启动（同时暴露实例，便于本地预览调试与自动化测试）
const game = new Game()
if (typeof globalThis !== 'undefined') {
  globalThis.__windwing = game
}
