/**
 * 本地存储封装（经 Platform 垫层，小游戏走 wx.storage，浏览器走 localStorage）
 */

const Platform = require('../libs/platform')

const PREFIX = 'windwing.'

const storage = {
  get(key, fallback) {
    return Platform.storage.get(PREFIX + key, fallback)
  },
  set(key, value) {
    return Platform.storage.set(PREFIX + key, value)
  },
  remove(key) {
    Platform.storage.remove(PREFIX + key)
  },
}

module.exports = storage
