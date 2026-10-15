/**
 * 本地排行榜服务
 *
 * 说明：云服务确认框被用户关闭，当前按规则采用本地实现（设备内存储）。
 * 接口形状与未来的云端实现保持一致（load/submit/best/all），
 * 后续接入云数据库时只需替换本文件实现，游戏代码零改动。
 */

const storage = require('./storage')

const KEY = 'leaderboard.v1'
const MAX_ENTRIES = 50

/**
 * 按「字符」而不是「码元」截断昵称。
 * String.slice(0,12) 会把 emoji 之类的代理对切成半个乱码。
 */
function trimName(name, max) {
  const chars = Array.from(String(name || '').trim())
  return chars.slice(0, max || 12).join('')
}

function loadAll() {
  const list = storage.get(KEY, [])
  return Array.isArray(list) ? list : []
}

function saveAll(list) {
  return storage.set(KEY, list.slice(0, MAX_ENTRIES))
}

/**
 * 提交一局成绩
 * @param {{name:string, score:number, distance:number, combo:number, spellCorrect:number, spellTotal:number}} entry
 * @returns {{rank:number, isBest:boolean, list:Array}} rank 从 1 开始
 */
function submit(entry) {
  const list = loadAll()
  const prevBest = list.length ? list[0].score : 0
  const record = {
    name: trimName(entry.name, 12) || '无名御风者',
    score: Math.floor(entry.score || 0),
    distance: Math.floor(entry.distance || 0),
    combo: entry.combo || 0,
    spellCorrect: entry.spellCorrect || 0,
    spellTotal: entry.spellTotal || 0,
    date: new Date().toISOString().slice(0, 10),
  }
  list.push(record)
  list.sort((a, b) => b.score - a.score)
  saveAll(list)
  const rank = list.indexOf(record) + 1
  return { rank, isBest: record.score > prevBest, list: loadAll() }
}

/** 本机最佳成绩 */
function best() {
  const list = loadAll()
  return list.length ? list[0] : null
}

/** 排行榜（前 n 条） */
function top(n) {
  return loadAll().slice(0, n || MAX_ENTRIES)
}

/** 昵称 */
function getNickname() {
  const v = storage.get('nickname', '无名御风者')
  return typeof v === 'string' && v ? v : '无名御风者'
}

function setNickname(name) {
  storage.set('nickname', trimName(name, 12) || '无名御风者')
  return getNickname()
}

module.exports = { submit, best, top, getNickname, setNickname, loadAll }
