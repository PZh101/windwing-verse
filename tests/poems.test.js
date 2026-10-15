const assert = require('assert')
const { POEMS } = require('../src/data/poems')

module.exports = {
  '题库规模 >= 60': () => {
    assert.ok(POEMS.length >= 60, `only ${POEMS.length} poems`)
  },
  'id 唯一': () => {
    const ids = new Set(POEMS.map((p) => p.id))
    assert.strictEqual(ids.size, POEMS.length)
  },
  '题干含挖空标记': () => {
    for (const p of POEMS) {
      assert.ok(p.prompt.includes('____'), `${p.id} prompt has no blank`)
      assert.ok(p.prompt.trim().length > 0)
    }
  },
  '答案非空且是选项之一': () => {
    for (const p of POEMS) {
      assert.ok(p.answer && p.answer.length > 0, `${p.id} empty answer`)
      assert.ok(p.options.includes(p.answer), `${p.id} answer not in options`)
    }
  },
  '四个选项且互不重复': () => {
    for (const p of POEMS) {
      assert.strictEqual(p.options.length, 4, `${p.id} options != 4`)
      assert.strictEqual(new Set(p.options).size, 4, `${p.id} duplicate options`)
    }
  },
  '正确选项唯一': () => {
    for (const p of POEMS) {
      const matches = p.options.filter((o) => o === p.answer)
      assert.strictEqual(matches.length, 1, `${p.id} answer appears ${matches.length} times`)
    }
  },
  '出处与难度字段完整': () => {
    for (const p of POEMS) {
      assert.ok(p.source && p.source.length > 0, `${p.id} no source`)
      assert.ok([1, 2, 3].includes(p.level), `${p.id} bad level`)
    }
  },
  '等级分布合理（每级 >= 10）': () => {
    const c = { 1: 0, 2: 0, 3: 0 }
    for (const p of POEMS) c[p.level]++
    for (const k of [1, 2, 3]) assert.ok(c[k] >= 10, `level ${k} only ${c[k]}`)
  },
  '题干与答案不能雷同（挖空必须真的挖掉了句子）': () => {
    for (const p of POEMS) {
      assert.ok(p.prompt.replace('____', '') !== p.prompt.replace('____', p.answer) + '', 'n/a')
      // 题干去掉空后不应包含答案
      const bare = p.prompt.replace('____', '')
      assert.ok(!bare.includes(p.answer), `${p.id} prompt still contains answer`)
    }
  },
}
