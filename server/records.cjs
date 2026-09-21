// server/records.cjs — 练习记录路由 (SpeakWise)
// ============================================================================
//  全部需要登录（requireAuth）。教师端 GET /class 仅返回本班学生记录。
//  迁移接口 POST /migrate 按 (user_id, legacy_id) 唯一键 INSERT IGNORE 去重。
//
//  对话记录（messages JSON 列）：
//    · 列表接口一律【不含】messages，只给 JSON_LENGTH 哨兵 messageCount。
//      500 行 × 一条 12 轮对话(≈20KB) = 10MB 响应，会撞 SCF 上限。
//    · messages 的唯一出口是 GET /:id。
//    · 路由注册顺序：/mine、/class、/scenarios 必须在 /:id 之前，
//      否则 /:id 会把它们吞掉（Number('mine') = NaN → 400）。
// ============================================================================

'use strict';
const express = require('express');
const { query } = require('./db.cjs');
const { requireAuth, requireTeacher } = require('./auth.cjs');

const router = express.Router();
const MAX_ROWS = 500;

// ── 对话记录截断上限 ──
// ⚠️ 必须与前端 src/utils/transcript.js 的 capTranscript 保持同一规则。
//    前后端无法共享代码，这是必要重复；改这里请同步改那边。
const MAX_MESSAGES = 120;          // 约 60 轮
const MAX_CONTENT = 2000;          // 单条消息字符数
const MAX_TRANSCRIPT_BYTES = 48 * 1024;

// ── 列表投影：显式列名，刻意排除 messages ──
const LIST_COLUMNS = `
  id, legacy_id, user_id, module, scenario, score, dimensions, problems,
  suggestion, hsk_level, source, created_at,
  JSON_LENGTH(messages) AS message_count`;

// 发音测评的题目来源。测试成绩与日常练习在 module/scenario 上完全一样，
// 科研导出要靠这一列分辨前后测数据，所以非法值一律归一化为空而不是报错。
const ALLOWED_SOURCES = ['train', 'testA', 'testB', 'custom'];
function sanitizeSource(v) {
  return ALLOWED_SOURCES.includes(v) ? v : '';
}

function toClientRecord(r) {
  return {
    id: r.id,
    legacyId: r.legacy_id,
    studentId: r.user_id,
    nickname: r.student_nickname || null,
    hskLevel: r.hsk_level,
    module: r.module,
    scenario: r.scenario,
    score: r.score,
    dimensions: r.dimensions,
    problems: r.problems,
    suggestion: r.suggestion,
    source: r.source || '',
    messageCount: r.message_count ?? 0,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

// messages 的唯一出口
function toClientRecordDetail(r) {
  const messages = parseMessages(r.messages);
  return {
    ...toClientRecord(r),
    messageCount: messages ? messages.length : 0,
    messages,
  };
}

function parseMessages(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v;          // mysql2 已按 JSON 列自动解析
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : null;
  } catch { return null; }
}

function toJson(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// 白名单校验 + 三层截断（与前端 src/utils/transcript.js 的 toTranscript 同规则）
// content.length 是 UTF-16 码元数，中文在 UTF-8 下 3 字节/字，按 3 倍估算
function sanitizeMessages(v) {
  if (!Array.isArray(v)) return null;
  const out = [];

  for (const m of v.slice(-MAX_MESSAGES)) {
    if (!m || typeof m.content !== 'string') continue;
    if (m.sender !== 'student' && m.sender !== 'ai') continue;   // 不猜，丢弃未知发送方
    const content = m.content.trim().slice(0, MAX_CONTENT);
    if (!content) continue;

    const at = m.at && !isNaN(new Date(m.at).getTime()) ? new Date(m.at).toISOString() : null;
    const entry = { sender: m.sender, content, at };
    if (m.channel === 'text' || m.channel === 'voice') entry.channel = m.channel;
    if (m.kind === 'truncated') entry.kind = 'truncated';        // 保留截断留痕

    out.push(entry);
  }

  // 字节上限：从头部（较早的消息）开始丢，保留最新几轮 ——
  // 与前端 toTranscript 同向，也与评分只看最近 12 条的口径一致。
  // （注意不能写成「push 到超限就 break」，那会反过来保留最早的、丢掉最新的。）
  let bytes = out.reduce((n, e) => n + e.content.length * 3 + 64, 0);
  while (bytes > MAX_TRANSCRIPT_BYTES && out.length > 2) {
    bytes -= out[0].content.length * 3 + 64;
    out.shift();
  }
  return out.length ? out : null;
}

// 与 tasks.cjs 中的同名函数保持一致
async function getClassId(teacherId) {
  const rows = await query('SELECT id FROM classes WHERE teacher_id = ? LIMIT 1', [teacherId]);
  return rows.length ? rows[0].id : null;
}

// POST /api/records — 保存单条练习记录
router.post('/', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const createdAt = b.createdAt && !isNaN(new Date(b.createdAt).getTime())
      ? new Date(b.createdAt).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    const rows = await query(
      `INSERT INTO records
       (user_id, legacy_id, module, scenario, score, dimensions, problems, suggestion,
        hsk_level, created_at, messages, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)`,
      [
        req.user.id,
        b.id ?? null,
        b.module || '未知',
        b.scenario || '',
        Number(b.score) || 0,
        toJson(b.dimensions),
        toJson(b.problems),
        b.suggestion || '',
        b.hskLevel || null,
        createdAt,
        toJson(sanitizeMessages(b.messages)),
        sanitizeSource(b.source),
      ]
    );
    return res.json({ id: rows.insertId });
  } catch (e) {
    // 补交与原提交竞态：撞 uq_user_legacy 说明这条已存在，视为成功
    if (e.code === 'ER_DUP_ENTRY' || /Duplicate entry/.test(e.message || '')) {
      return res.json({ id: null, duplicated: true });
    }
    console.error('/api/records error:', e.message);
    return res.status(500).json({ error: e.message || '保存记录失败' });
  }
});

// POST /api/records/migrate — 批量迁移本地记录（幂等，legacy_id 去重）
router.post('/migrate', requireAuth, async (req, res) => {
  try {
    const list = Array.isArray((req.body || {}).records) ? req.body.records : [];
    if (!list.length) return res.json({ inserted: 0 });

    // 过滤有 legacy_id 的条目（本地记录必有 Date.now() id），其余忽略
    const items = list.filter(r => r && Number.isFinite(Number(r.id)));
    let inserted = 0;

    // 按「50 条 AND 累计 <1MB」动态分批：本地可能积压多条带对话的记录，
    // 单条 SQL 过大会撞 max_allowed_packet 与 SCF 内存余量
    let i = 0;
    while (i < items.length) {
      const values = [];
      const params = [];
      let bytes = 0;

      while (i < items.length && values.length < 50 && bytes < 1024 * 1024) {
        const r = items[i++];
        const createdAt = r.createdAt && !isNaN(new Date(r.createdAt).getTime())
          ? new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')
          : null;
        // 只序列化一次：算批量大小的字符串直接复用给 INSERT，不再 stringify 第二遍
        const messagesJson = toJson(sanitizeMessages(r.messages));
        // ×3：中文 UTF-8 三字节/字，按字符数估会低估
        bytes += messagesJson ? messagesJson.length * 3 : 0;

        values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)');
        params.push(
          req.user.id,
          Number(r.id),
          r.module || '未知',
          r.scenario || '',
          Number(r.score) || 0,
          toJson(r.dimensions),
          toJson(r.problems),
          r.suggestion || '',
          r.hskLevel || null,
          createdAt,
          messagesJson,
          sanitizeSource(r.source)
        );
      }

      const result = await query(
        `INSERT IGNORE INTO records
         (user_id, legacy_id, module, scenario, score, dimensions, problems, suggestion,
          hsk_level, created_at, messages, source)
         VALUES ${values.join(', ')}`,
        params
      );
      inserted += result.affectedRows;
    }
    return res.json({ inserted });
  } catch (e) {
    console.error('/api/records/migrate error:', e.message);
    return res.status(500).json({ error: e.message || '迁移失败' });
  }
});

// GET /api/records/mine — 本人记录（不含对话内容）
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT ${LIST_COLUMNS} FROM records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [req.user.id, MAX_ROWS]
    );
    return res.json({ records: rows.map(toClientRecord) });
  } catch (e) {
    console.error('/api/records/mine error:', e.message);
    return res.status(500).json({ error: e.message || '获取记录失败' });
  }
});

// GET /api/records/class — 教师：本班全部学生记录（不含对话内容）
router.get('/class', requireAuth, requireTeacher, async (req, res) => {
  try {
    const classId = await getClassId(req.user.id);
    if (!classId) return res.json({ class: null, records: [] });

    const rows = await query(
      `SELECT r.id, r.legacy_id, r.user_id, r.module, r.scenario, r.score,
              r.dimensions, r.problems, r.suggestion, r.hsk_level, r.source, r.created_at,
              JSON_LENGTH(r.messages) AS message_count,
              u.nickname AS student_nickname
       FROM records r
       JOIN class_members cm ON cm.student_id = r.user_id
       JOIN users u ON u.id = r.user_id
       WHERE cm.class_id = ?
       ORDER BY r.created_at DESC LIMIT ?`,
      [classId, MAX_ROWS]
    );
    return res.json({ class: { id: classId }, records: rows.map(toClientRecord) });
  } catch (e) {
    console.error('/api/records/class error:', e.message);
    return res.status(500).json({ error: e.message || '获取班级记录失败' });
  }
});

// GET /api/records/scenarios — 本人练过的场景名（去重）
// 供自由对话的话题推荐排除已练场景。原先前端为此调 /mine 下载全部列，
// 在 records 带上对话内容后那是唯一会直接拖垮页面的点。
router.get('/scenarios', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT scenario FROM records
       WHERE user_id = ? AND scenario <> '' ORDER BY scenario LIMIT 200`,
      [req.user.id]
    );
    return res.json({ scenarios: rows.map(r => r.scenario) });
  } catch (e) {
    console.error('/api/records/scenarios error:', e.message);
    return res.status(500).json({ error: e.message || '获取场景列表失败' });
  }
});

// GET /api/records/:id — 单条记录（含完整对话）
// ⚠️ 必须注册在 /mine、/class、/scenarios 之后
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: '记录 ID 不合法' });
    }

    if (req.user.role === 'teacher') {
      // 教师：仅本班学生
      const classId = await getClassId(req.user.id);
      if (!classId) return res.status(404).json({ error: '记录不存在' });
      const rows = await query(
        `SELECT r.*, u.nickname AS student_nickname
         FROM records r
         JOIN class_members cm ON cm.student_id = r.user_id
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ? AND cm.class_id = ? LIMIT 1`,
        [id, classId]
      );
      if (!rows.length) return res.status(404).json({ error: '记录不存在' });
      return res.json({ record: toClientRecordDetail(rows[0]) });
    }

    // 学生：仅本人。鉴权内嵌在 WHERE 里，不区分 403/404，避免 ID 枚举探测
    const rows = await query(
      `SELECT r.*, u.nickname AS student_nickname
       FROM records r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ? AND r.user_id = ? LIMIT 1`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: '记录不存在' });
    return res.json({ record: toClientRecordDetail(rows[0]) });
  } catch (e) {
    console.error('/api/records/:id error:', e.message);
    return res.status(500).json({ error: e.message || '获取对话记录失败' });
  }
});

module.exports = { router };
