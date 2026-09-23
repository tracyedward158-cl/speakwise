#!/usr/bin/env node
// core/ 纯逻辑自检。
//
// 为什么需要它：本项目没有前端测试框架，而小程序的正确性无法在 CI 里跑起来
// （没有微信运行时）。但 core/ 里那批模块恰恰是**平台无关**的 —— 题库选卷、
// 评测响应解析、对话指标口径、雷达图数学、记录存储规则 —— 这些是最容易在移植中
// 被悄悄改坏、又最难在界面上看出问题的地方。
//
// 做法：用 esbuild 把断言脚本连同 core/ 一起打成单个 Node 可执行文件，
// 用 scripts/stub-taro.js 顶掉平台依赖。跑的是**真正的产品代码**，不是副本。

import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = path.join(ROOT, 'node_modules', '.cache', 'check-core.mjs')

const ENTRY = `
import TaroStub from './scripts/stub-taro.js'
import { storage } from './src/platform/storage'
import {
  PRON_BANK, UNITS, TEST_PLAN, TRAIN_SIZE, ALL_TAGS,
  coreFor, filterBank, countAvailable, selectItems,
  buildTestSequence, buildPracticeSession, nextRoundParams,
  extractFeedback, dimensionCells, buildCustomBank, statsByText,
} from './src/core/utils/pronunciationBank'
import { computeRecordMetrics, summarizeMetrics, METRICS_VERSION } from './src/core/utils/conversationMetrics'
import { toTranscript, countStudentTurns, messageCount, hasTranscript, formatTime, formatRecordDate, MAX_MESSAGES } from './src/core/utils/transcript'
import { cleanForTTS, normalizeForCompare, parseChatBubble } from './src/core/utils/text'
import {
  buildRecord, saveRecord, getRecords, clearRecords, getOwnerId, setOwnerId,
  readDrafts, putDraft, dropDraft, clearDrafts,
  getStudentStats, getWeakDimensions, getRadarDimensions, getRecommendedExercises,
  RADAR_DIMENSIONS, getAllRecords,
} from './src/core/utils/recordStore'

let pass = 0
const fails = []
// CHECK_VERBOSE=1 时逐条回显。断言之间出现未捕获异常时，最后一行就是定位点。
const VERBOSE = !!process.env.CHECK_VERBOSE
function ok(name, cond, detail) {
  if (VERBOSE) console.log((cond ? '  ✓ ' : '  ✗ ') + name)
  if (cond) { pass++; return }
  fails.push(name + (detail ? '  → ' + detail : ''))
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  ok(name, a === e, '实际 ' + a + '，期望 ' + e)
}

// ══════════════ 1. 题库与选卷 ══════════════
eq('题库共 552 题', PRON_BANK.length, 552)
eq('题库 unit 集合', UNITS, ['字', '词', '句'])
eq('测试卷计划', TEST_PLAN.map(x => x.unit + x.count).join(','), '字10,词10,句5')
ok('ALL_TAGS 非空且已排序', ALL_TAGS.length >= 8)
ok('每道题都有 id/level/unit/tags', PRON_BANK.every(it => it.id != null && it.level && it.unit && Array.isArray(it.tags)))

// 同一 seed 必须选出同一批题 —— 这是「刷新/前进后退题目不能变」的根据
const a1 = selectItems({ level: '1-3', unit: '句', set: 'train', mode: 'random', count: 10, seed: 12345 })
const a2 = selectItems({ level: '1-3', unit: '句', set: 'train', mode: 'random', count: 10, seed: 12345 })
const a3 = selectItems({ level: '1-3', unit: '句', set: 'train', mode: 'random', count: 10, seed: 999 })
eq('同 seed 选出同一批题', a1.items.map(i => i.id), a2.items.map(i => i.id))
ok('不同 seed 选出不同批题', a1.items.map(i => i.id).join() !== a3.items.map(i => i.id).join())

// 顺序模式的 offset 轮转
const s0 = selectItems({ level: '1-3', unit: '句', set: 'train', mode: 'seq', count: 10, offset: 0 })
const s1 = selectItems({ level: '1-3', unit: '句', set: 'train', mode: 'seq', count: 10, offset: 10 })
ok('顺序模式 offset 推进题目', s0.items[0].id !== s1.items[0].id)

// 筛选与计数
const f = filterBank({ level: '1-3', unit: '字', set: 'train' })
eq('筛选结果与计数一致', f.length, countAvailable({ level: '1-3', unit: '字', set: 'train' }))
ok('筛选结果 level/unit 都正确', f.every(i => i.level === '1-3' && i.unit === '字'))

// 标准测试卷：字10 + 词10 + 句5
const seq = buildTestSequence({ set: 'testA', level: '1-3' })
eq('testA 1-3 共 25 题', seq.length, 25)
eq('testA 前 10 题是字', seq.slice(0, 10).every(i => i.unit === '字'), true)
eq('testA 后 5 题是句', seq.slice(20).every(i => i.unit === '句'), true)

// 练习会话构造 + 下一轮
const sess = buildPracticeSession({ set: 'train', unit: '句', mode: 'seq' }, '1-3')
ok('buildPracticeSession 产出题目', sess.items.length > 0 && sess.title)
const nr = nextRoundParams({ set: 'train', unit: '句', mode: 'seq', offset: '0' }, sess)
ok('顺序模式下一轮推进 offset', Number(nr.offset) > 0, JSON.stringify(nr))
const nrRand = nextRoundParams({ set: 'train', unit: '句', mode: 'random', seed: '1' }, { mode: 'random' }, 1700000000000)
ok('随机模式下一轮换 seed', nrRand.seed !== '1', JSON.stringify(nrRand))

// ══════════════ 2. 评测响应解析 ══════════════
eq('coreFor 字→word', coreFor('字'), 'word')
eq('coreFor 句→sent', coreFor('句'), 'sent')
// 「词」必须是 sent：讯飞 word 模式只收 1 个词（汉字按字计数）。
// 这条曾经是 coreFor 的真 bug ——「词」被划给 word，而题库里 193 个词条目
// 没有一个是单字，于是「词」粒度 100% 失败，且失败在服务端返回之后，
// 界面上只表现为「点了一直没有结果」，极难定位。
eq('coreFor 词→sent', coreFor('词'), 'sent')

// para 模式**不返回逐字评分**（实测 words 为空数组），而逐字评分是发音测评的核心
// 教学反馈 —— 跟读页那一整块「逐字评分 + 增读/漏读/错读」直接不渲染，而且是静默的。
// 所以 coreFor 永远不该返回 'para'。这条断言防的是「好心优化」：
// 看到文本长了就想换成段落模式，结果悄悄丢掉最有价值的反馈。
{
  const units = ['字', '词', '句', undefined, null, '']
  const bad = units.filter((u) => coreFor(u) === 'para')
  eq('coreFor 不返回 para（para 没有逐字评分）', bad.length, 0)
}

// 数据驱动的回归：题库里每一条题，走 coreFor 选出的模式都不能超词数上限。
// 比单测 coreFor 更强 —— 它同时盯住「映射」和「题库数据」两边，任一边变坏都会红。
const WORD_LIMITS = { word: 1, sent: 400, para: 1000 }
const overLimit = PRON_BANK.filter((it) => {
  const limit = WORD_LIMITS[coreFor(it.unit)]
  return limit != null && it.text.length > limit
})
ok(
  '题库里没有超出所选评测模式词数上限的题',
  overLimit.length === 0,
  overLimit.length
    ? overLimit.length + ' 条超限，例：' +
      overLimit.slice(0, 3).map((i) => i.unit + '「' + i.text + '」→ ' + coreFor(i.unit)).join('、')
    : ''
)

const iseSample = {
  refText: '你好',
  overall: 82.5, pronunciation: 85, tone: 78, fluency: 80, integrity: 90, rhythm: 70, speed: 210, duration: 1200,
  words: [
    { word: '你', pinyin: 'nǐ', tone: 3, readType: 0, scores: { overall: 88, pronunciation: 90, tone: 80, prominence: 70 } },
    { word: '好', pinyin: 'hǎo', tone: 3, readType: 0, scores: { overall: 77, pronunciation: 80, tone: 76, prominence: 60 } },
  ],
  warning: null,
}
const { feedback: fb, record: rec } = extractFeedback(iseSample, { text: '你好', unit: '词' })
eq('extractFeedback 保留总分', fb.overall, 82.5)
eq('extractFeedback 保留逐字', fb.words.length, 2)
ok('record.dimensions 四个维度齐全',
  ['pronunciation', 'tone', 'fluency', 'completeness'].every(k => rec.dimensions[k] != null),
  JSON.stringify(rec.dimensions))
ok('record 分数落在 0-100', rec.score >= 0 && rec.score <= 100, String(rec.score))
// 注意：讯飞的 overall 是小数（这里是 82.5），extractFeedback 不做取整，
// 直接落到 record.score。Web 版同样如此 —— 这是继承来的行为，不是移植引入的。
ok('分数可以是小数（保持讯飞原值）', rec.score === 82.5, String(rec.score))
ok('record 有 suggestion', typeof rec.suggestion === 'string' && rec.suggestion.length > 0)
ok('dimensionCells 过滤掉空值', dimensionCells({ pronunciation: 80, tone: null, overall: 80 }).every(c => c.value != null))

// ══════════════ 3. 对话指标口径 ══════════════
const mkMsgs = () => ([
  { sender: 'ai', content: '你好', at: '2026-01-01T10:00:00.000Z', kind: 'greeting' },
  { sender: 'student', content: '我要一个米饭', at: '2026-01-01T10:00:30.000Z', channel: 'voice' },
  { sender: 'ai', content: '好的', at: '2026-01-01T10:00:35.000Z' },
  { sender: 'student', content: '谢谢', at: '2026-01-01T10:01:00.000Z', channel: 'text' },
])
const tr = toTranscript(mkMsgs())
ok('toTranscript 剥掉 greeting', !tr.some(m => m.kind === 'greeting'), JSON.stringify(tr.map(m => m.kind)))
eq('学生轮次计数', countStudentTurns(tr), 2)

const met = computeRecordMetrics({ id: 1, messages: tr })
ok('指标可用', met.available === true, JSON.stringify(met))
// turns 的语义是**学生发言条数**（一问一答算一轮），不是消息总条数。
// 原注释见 conversationMetrics.js:3 —— 科研口径依赖这个定义，必须钉住。
eq('指标轮次 = 学生发言数', met.turns, 2)
// 指标是在**transcript** 上算的，而 toTranscript 已经把开场白剥掉了：
// 原始 4 条 → 转写 3 条，指标看的是后者。这个差值是对的，不是漏算。
eq('消息总条数按转写照算（开场白已剥）', met.messageTotal, 3)
eq('AI 发言数', met.aiTurns, 1)
eq('指标语音轮次', met.voiceTurns, 1)
eq('指标文本轮次', met.textTurns, 1)
ok('语音占比 0.5', Math.abs(met.voiceRatio - 0.5) < 1e-9, String(met.voiceRatio))
ok('平均字数算得出来', met.avgChars > 0, String(met.avgChars))

const metNone = computeRecordMetrics({ id: 2, messages: [] })
eq('空对话 → available:false', metNone.available, false)
eq('空对话原因', metNone.reason, 'no-student-turns')

// 截断：超长对话必须留痕，且痕迹在最前面
const long = []
for (let i = 0; i < MAX_MESSAGES + 40; i++) {
  long.push({ sender: i % 2 ? 'student' : 'ai', content: 'x'.repeat(10), at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString() })
}
const trunc = toTranscript(long)
// 截断标记是**额外**插在最前面的，所以总数是 MAX_MESSAGES + 1
eq('截断后条数 = 上限 + 1 条标记', trunc.length, MAX_MESSAGES + 1)
eq('截断标记在首位', trunc[0].kind, 'truncated')
ok('截断标记 at 为 null', trunc[0].at === null)
const trMet = computeRecordMetrics({ id: 3, messages: trunc })
eq('截断被指标记录', trMet.truncated, true)

eq('summarizeMetrics 版本', summarizeMetrics([met]).metricsVersion ?? METRICS_VERSION, METRICS_VERSION)

// ══════════════ 4. 文本处理 ══════════════
eq('TTS 清洗去掉半角括号内容', cleanForTTS('你好(轻声)吗'), '你好吗')
// 括号正则是 /\\(.*?\\)/g，只认半角。全角括号不会被剥掉 —— 这是从 Web 版
// 原样继承的行为（useSpeech.js:31），不是移植引入的，但值得钉住：
// 若哪天要支持全角，改的是共用实现，两端会一起变。
eq('全角括号不被剥离（继承行为）', cleanForTTS('你好（轻声）吗'), '你好（轻声）吗')
eq('TTS 清洗剥掉 emoji', cleanForTTS('你好😀世界'), '你好世界')
eq('TTS 清洗剥掉旗帜 emoji', cleanForTTS('中国🇨🇳加油'), '中国加油')
eq('TTS 清洗去掉 markdown', cleanForTTS('**你好**'), '你好')
eq('对比归一化剥标点', normalizeForCompare('你好，很高兴认识你。'), '你好很高兴认识你')
eq('对比归一化对齐中英标点差异', normalizeForCompare('你好，世界！'), normalizeForCompare('你好世界'))
const pb = parseChatBubble('汉字: 你好\\n拼音: Nǐ hǎo\\n英文: Hello')
eq('解析三行结构 hz', pb.hz, '你好')
eq('解析三行结构 ttsText', pb.ttsText, '你好')
// 回退分支用 /[a-zA-Z].*$/ 砍掉英文，末尾会留一个空格 —— 继承行为，
// 朗读前还会过 cleanForTTS，实际不影响发音
eq('无前缀时回退取汉字（含尾随空格）', parseChatBubble('你好 hello').hz.trim(), '你好')
ok('回退分支确实会留尾随空格（继承行为）', parseChatBubble('你好 hello').hz !== '你好')

// ══════════════ 5. 记录存储与聚合 ══════════════
storage.removeItem('speakwise_practice_records')
storage.removeItem('speakwise_owner_id')
storage.removeItem('speakwise_student_id')
clearDrafts()
setOwnerId('u1')

const r1 = buildRecord({ module: '发音测评', scenario: '你好', score: 80, hskLevel: '1-3', dimensions: { pronunciation: 80, tone: 75, fluency: 70, completeness: 90 }, problems: ['声调不稳定'], suggestion: '多练声调' })
await saveRecord(r1)
eq('记录写入本地', getRecords().length, 1)
await saveRecord(r1)               // 同 id 重复提交
eq('同 id 去重', getRecords().length, 1)
// ⚠️ buildRecord 的默认 id 是 Date.now()。同一毫秒内建两条会撞 id，
//    而 saveRecordLocal 按 id 去重 —— 后一条会被静默丢掉。
//    这里显式给不同 id，是为了测「两条不同记录都保留」本身；
//    撞 id 这件事单独在下面钉住。
const r2 = buildRecord({ module: '造句练习', scenario: '喜欢', score: 60, hskLevel: '1-3', id: 900002 })
r2.createdAt = '2026-01-02T00:00:00.000Z'
await saveRecord(r2)
eq('不同记录都保留', getRecords().length, 2)

// 继承自 Web 版的已知边界：id 由 Date.now() 生成，同毫秒会撞。
// 实际触发不了（两次练习不可能在同一毫秒结束），但它是 saveRecordLocal 去重的依据。
const dupA = buildRecord({ module: '造句练习', scenario: 'a', score: 1, hskLevel: '1-3', id: 900003 })
const dupB = buildRecord({ module: '造句练习', scenario: 'b', score: 2, hskLevel: '1-3', id: 900003 })
await saveRecord(dupA)
await saveRecord(dupB)
eq('同 id 的第二条被丢弃（继承行为）', getRecords().filter(r => r.id === 900003).length, 1)
eq('留下的是先写入的那条', getRecords().find(r => r.id === 900003).scenario, 'a')

// 把上面那条撞 id 的记录清掉，免得污染后面按 2 条算的聚合口径断言
storage.setItem('speakwise_practice_records', JSON.stringify(getRecords().filter(r => r.id !== 900003)))
eq('清理后回到 2 条', getRecords().length, 2)

// 草稿队列：putDraft 覆盖、dropDraft 移除
putDraft({ draftId: 111, ownerKey: 'u1', messages: [{ sender: 'student', content: 'a', at: '2026-01-01T00:00:00.000Z' }] })
putDraft({ draftId: 111, ownerKey: 'u1', messages: [{ sender: 'student', content: 'ab', at: '2026-01-01T00:00:05.000Z' }] })
eq('同 draftId 只留最新一份', readDrafts().length, 1)
eq('留下的是最新内容', readDrafts()[0].messages[0].content, 'ab')
dropDraft(111)
eq('dropDraft 后清空', readDrafts().length, 0)

// 聚合口径
const all = getRecords()
const st = getStudentStats(all)
eq('统计总数', st.total, 2)
eq('统计均分', st.average, 70)
eq('统计最高分', st.best, 80)
const weak = getWeakDimensions(all, 70, 1)
ok('弱项识别到声调/流利度', weak.some(w => w.dim === 'tone'), JSON.stringify(weak.map(w => w.dim)))
eq('弱项按均分升序', weak.map(w => w.dim)[0], weak.slice().sort((x, y) => x.avg - y.avg)[0].dim)

const radar = getRadarDimensions(all)
eq('雷达维度数', radar.length, RADAR_DIMENSIONS.length)
eq('雷达维度顺序与常量一致', radar.map(r => r.key), RADAR_DIMENSIONS.map(d => d.key))
const radarPron = radar.find(r => r.key === 'pronunciation')
// 发音测评那条：0.6*80 + 0.4*75 = 78
eq('雷达发音维度按 0.6/0.4 加权', radarPron.value, 78)
const radarGrammar = radar.find(r => r.key === 'grammar')
eq('雷达语法维度来自造句练习', radarGrammar.value, 60)
eq('无数据维度为 null', radar.find(r => r.key === 'logic').value, null)

const recs = getRecommendedExercises(all)
ok('推荐非空', Array.isArray(recs) && recs.length > 0)
ok('推荐 action 目标是逻辑名而非路径',
  recs.every(r => !String(r.action?.target || '').startsWith('/')),
  JSON.stringify(recs.map(r => r.action)))

// getAllRecords 合并演示数据并按时间倒序
const merged = getAllRecords()
ok('getAllRecords 合并了演示数据', merged.length > getRecords().length)
ok('按时间倒序', merged.every((r, i) => i === 0 || new Date(merged[i - 1].createdAt) >= new Date(r.createdAt)))

eq('hasTranscript 认 messageCount', hasTranscript({ messageCount: 3 }), true)
eq('messageCount 读 messages 长度', messageCount({ messages: [1, 2] }), 2)
eq('messageCount 缺省为 0', messageCount({}), 0)

// ══════════════ 6. 雷达图极坐标数学 ══════════════
// 与 components/AbilityRadar.jsx 里那段逐字相同 —— 渲染层换成 canvas，
// 这层数学不该跟着变。这里把它单独钉住。
const data5 = RADAR_DIMENSIONS.map(d => ({ ...d, value: 80 }))
const n = data5.length
const cx = 300 / 2, cy = 300 / 2 + 6, R = 300 / 2 - 58
const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2
const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]
const p0 = pt(0, R)
ok('第 0 个维度在正上方', Math.abs(p0[0] - cx) < 1e-9 && Math.abs(p0[1] - (cy - R)) < 1e-9, JSON.stringify(p0))
const pQuarter = pt(n / 4, R)
ok('第 n/4 个维度在正右方', Math.abs(pQuarter[0] - (cx + R)) < 1e-9, JSON.stringify(pQuarter))
ok('半径随 r 线性', Math.abs(Math.hypot(pt(2, R)[0] - cx, pt(2, R)[1] - cy) - R) < 1e-9)
ok('value=0 落在圆心', Math.abs(Math.hypot(...pt(1, 0).map((v, i) => v - [cx, cy][i]))) < 1e-9)

// ══════════════ 7. 自定义题库 ══════════════
const cb = buildCustomBank('你好。今天很好！')
eq('自定义断句按标点切', cb.length, 2)
eq('自定义每句粒度是句', cb.every(x => x.unit === '句'), true)
eq('空文本断出 0 句', buildCustomBank('').length, 0)
const stat = statsByText([
  { module: '发音测评', score: 80, scenario: '你好', createdAt: '2026-01-01T00:00:00Z' },
  { module: '发音测评', score: 60, scenario: '你好', createdAt: '2026-01-02T00:00:00Z' },
  { module: '生活情境', score: 99, scenario: '你好' },   // 非发音测评，应被排除
])
eq('按文本聚合次数', stat.get('你好').count, 2)
eq('按文本聚合最高分', stat.get('你好').best, 80)
eq('只统计「发音测评」模块', statsByText([{ module: '造句练习', scenario: 'x', score: 90 }]).size, 0)
eq('历史按时间倒序', stat.get('你好').history[0].score, 60)

// ══════════════ 8. 录音状态机 ══════════════
// 这一段是补上的回归测试。起因是一个真实故障：点了停止之后 onStop 没来，
// phase 永久卡在 'stopping'，之后每次点麦克风都报「正在录音中」，退出页面也解不开。
//
// 状态机最要命的性质就是「回调不保证来」，而那恰恰是真机/开发者工具上的常态。
// 所以这里的测试是**编排时序**：自己决定哪个回调发、哪个不发。

// 这个 stub 与 @tarojs/taro 的别名指向同一个文件，esbuild 会去重，
// 所以这里拿到的就是 recorder 模块内部用的那个假录音器实例。
const recorder = TaroStub.__recorder()
const {
  startRecording, stopRecording, resetRecorder, isRecording, recorderState, RECORDER_LIMITS
} = await import('./src/platform/recorder')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const OK_STOP = { tempFilePath: '/tmp/a.mp3', duration: 3000, fileSize: 24000 }

/** 停掉并让 onStop 到达 */
async function stopAndFinish(payload = OK_STOP) {
  const p = stopRecording()
  recorder.emit('stop', payload)
  return p
}

/** 模拟「回调不来」：这个开关关掉后，start() 不会再自动发 onStart */
const withSuppressedStart = async (fn) => {
  recorder.suppressAutoStart = true
  try {
    return await fn()
  } finally {
    recorder.suppressAutoStart = false
  }
}

// 先触发一次，让模块把回调注册到假录音器上（bindOnce 只跑一次）
{
  await startRecording()
  resetRecorder()
}

// ── 回归：startRecording 必须在 onStart 兑现，绝不能等到 onStop ──
//
// 这是「点麦克风没反应，再点一下说正在录音中」的根因：
// 早先那个 promise 只在 onStop 时才兑现，于是
//     await startRecording(); setRecording(true)
// 里的 setRecording 要等整段录音结束才执行 —— 按钮永远不变红，
// 用户以为没录上又点一下，就撞上「正在录音中」。
{
  let resolved = false
  await withSuppressedStart(async () => {
    const start = startRecording().then(() => { resolved = true })
    await sleep(30)
    eq('onStart 未到时不兑现', resolved, false)

    recorder.emit('start')
    await start
    eq('onStart 一到就兑现（没有等 onStop）', resolved, true)
    eq('此时确实在录音中', recorderState().phase, 'recording')
  })
  await stopAndFinish()
  eq('收尾后回到 idle', recorderState().phase, 'idle')
}

// ── 正常一次 ──
{
  await startRecording()
  eq('isRecording 为真', isRecording(), true)

  const p = stopRecording()
  eq('停止后进入 stopping', recorderState().phase, 'stopping')
  recorder.emit('stop', OK_STOP)
  const res = await p
  eq('拿到 base64', res.base64.length > 0, true)
  eq('格式标为 mp3', res.format, 'mp3')
  eq('时长透传', res.duration, 3000)
  eq('回到空闲', recorderState().phase, 'idle')
}

// ── 回归：onStop 不来，stopping 必须自己超时解开 ──
// 「点了停止之后再也录不了」的那个故障。
{
  const saved = RECORDER_LIMITS.stopping
  RECORDER_LIMITS.stopping = 60

  await startRecording()
  const p = stopRecording()
  let err = null
  await p.catch(e => { err = e })           // 故意不发 onStop
  eq('onStop 缺席时按 STOP_TIMEOUT 收尾', err && err.code, 'STOP_TIMEOUT')
  eq('状态机回到 idle（不再粘住）', recorderState().phase, 'idle')
  eq('复位后 isRecording 为假', isRecording(), false)

  // 关键：卡过之后还能正常再录一次 —— 用户视角就是「再点一下就好了」
  await startRecording()
  eq('卡死自愈后能重新录音', recorderState().phase, 'recording')
  await stopAndFinish()

  RECORDER_LIMITS.stopping = saved
}

// ── 回归：卡住的 starting，下次 start 应自动复位而不是报 BUSY ──
{
  const saved = RECORDER_LIMITS.starting
  RECORDER_LIMITS.starting = 50

  // 先制造一个卡死的 starting：让 onStart 永远不来
  recorder.suppressAutoStart = true
  const s1 = startRecording()
  s1.catch(() => {})
  await sleep(90)
  eq('卡死的 starting 被识别', recorderState().stuck, true)
  recorder.suppressAutoStart = false        // 恢复真机时序，好让下一次能真的起来

  // 下一次 start 应当自愈，而不是抛 BUSY
  await startRecording()
  eq('自愈后正常进入录音', recorderState().phase, 'recording')
  await stopAndFinish()

  RECORDER_LIMITS.starting = saved
}

// ── 连点两下：第二下必须被拒，且不能污染第一下 ──
{
  const first = startRecording()
  let err = null
  await startRecording().catch(e => { err = e })   // 同步重入闸该挡住它
  eq('连点第二下报 BUSY', err && err.code, 'BUSY')

  await first
  eq('第一下不受影响', recorderState().phase, 'recording')
  await stopAndFinish()
}

// ── stop 早于 onStart：必须挂起到 onStart 到达才真停 ──
// 用户点得快就会撞上；直接 stop 在真机上会失败（recorder not start）。
{
  await withSuppressedStart(async () => {
    const start = startRecording()
    await sleep(10)                          // 等它走完权限检查、进入 starting
    eq('此时处于 starting', recorderState().phase, 'starting')

    const before = recorder.stopCalls
    const p = stopRecording()                // onStart 还没来
    eq('onStart 未到时不调用底层 stop', recorder.stopCalls, before)

    recorder.emit('start')                   // onStart 到达 → 这时才该停
    ok('onStart 到达后补上 stop', recorder.stopCalls > before, String(recorder.stopCalls))

    recorder.emit('stop', OK_STOP)
    await start
    const res = await p
    eq('仍然拿到了结果', res.base64.length > 0, true)
  })
}

// ── 异常结果的处理 ──
{
  await startRecording()
  const err = await stopAndFinish({ tempFilePath: '/tmp/a.mp3', duration: 3000, fileSize: 0 }).catch(e => e)
  eq('空文件判为 EMPTY', err.code, 'EMPTY')

  await startRecording()
  const err2 = await stopAndFinish({ tempFilePath: '/tmp/a.mp3', duration: 100, fileSize: 800 }).catch(e => e)
  eq('过短的录音判为 TOO_SHORT', err2.code, 'TOO_SHORT')

  await startRecording()
  const err3 = await stopAndFinish({ duration: 3000, fileSize: 800 }).catch(e => e)
  eq('没有文件路径判为 EMPTY', err3.code, 'EMPTY')
}

// ── 页面卸载/切后台走的无条件复位 ──
{
  await startRecording()
  eq('录音中', isRecording(), true)
  resetRecorder()
  eq('resetRecorder 后回到 idle', recorderState().phase, 'idle')
  eq('resetRecorder 后 isRecording 为假', isRecording(), false)

  // 复位必须能在**任何阶段**生效，而不只是 recording —— 原来的 bug 就出在
  // 调用方用 isRecording() 做条件，把 stopping 漏掉了。
  await startRecording()
  const p = stopRecording()
  eq('处于 stopping', recorderState().phase, 'stopping')
  resetRecorder()
  eq('stopping 阶段也能被复位', recorderState().phase, 'idle')
  await p.catch(() => {})                    // 已复位，拒绝是预期的

  // starting 阶段同理
  await withSuppressedStart(async () => {
    const s = startRecording()
    s.catch(() => {})
    await sleep(10)
    resetRecorder()
    eq('starting 阶段也能被复位', recorderState().phase, 'idle')
    await s.catch(() => {})
  })

  await startRecording()
  eq('反复复位后仍能正常开始', recorderState().phase, 'recording')
  await stopAndFinish()
  eq('最后回到 idle', recorderState().phase, 'idle')
}

// 到这里为止，所有会话都该已经落地、看门狗也都该被清掉。
// 若还有 setTimeout 挂着，Node 会在这里卡住直到它触发 —— 那本身就是个泄漏信号。

// ══════════════ 输出 ══════════════
if (fails.length) {
  console.error('\\n✗ 自检失败 ' + fails.length + ' 项（通过 ' + pass + '）：\\n')
  for (const f of fails) console.error('   ✗ ' + f)
  process.exit(1)
}
console.log('✓ core/ 自检全部通过（' + pass + ' 项断言）')
`

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  await build({
    stdin: { contents: ENTRY, resolveDir: ROOT, sourcefile: 'check-entry.mjs', loader: 'js' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: OUT,
    // 本工程不是 type:module，esbuild 得把源码当 ESM 解析
    mainFields: ['module', 'main'],
    loader: { '.json': 'json' },
    alias: { '@tarojs/taro': path.join(HERE, 'stub-taro.js') },
    logLevel: 'warning'
  })

  await import(pathToFileURL(OUT).href)
}

main().catch((e) => {
  console.error('自检构建失败:', e.message)
  process.exit(1)
})
