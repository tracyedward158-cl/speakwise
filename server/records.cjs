// server/records.cjs — 练习记录路由 (SpeakWise)
// ============================================================================
//  全部需要登录（requireAuth）。教师端 GET /class 仅返回本班学生记录。
//  迁移接口 POST /migrate 按 (user_id, legacy_id) 唯一键 INSERT IGNORE 去重。
// ============================================================================

'use strict';
const express = require('express');
const { query } = require('./db.cjs');
const { requireAuth, requireTeacher } = require('./auth.cjs');

const router = express.Router();
const MAX_ROWS = 500;

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
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function toJson(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
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
       (user_id, legacy_id, module, scenario, score, dimensions, problems, suggestion, hsk_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
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
      ]
    );
    return res.json({ id: rows.insertId });
  } catch (e) {
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

    // 每批 50 条多行 INSERT IGNORE
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50);
      const values = [];
      const params = [];
      for (const r of chunk) {
        const createdAt = r.createdAt && !isNaN(new Date(r.createdAt).getTime())
          ? new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')
          : null;
        values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))');
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
          createdAt
        );
      }
      const result = await query(
        `INSERT IGNORE INTO records
         (user_id, legacy_id, module, scenario, score, dimensions, problems, suggestion, hsk_level, created_at)
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

// GET /api/records/mine — 本人记录
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [req.user.id, MAX_ROWS]
    );
    return res.json({ records: rows.map(toClientRecord) });
  } catch (e) {
    console.error('/api/records/mine error:', e.message);
    return res.status(500).json({ error: e.message || '获取记录失败' });
  }
});

// GET /api/records/class — 教师：本班全部学生记录
router.get('/class', requireAuth, requireTeacher, async (req, res) => {
  try {
    const classes = await query('SELECT id FROM classes WHERE teacher_id = ? LIMIT 1', [req.user.id]);
    if (!classes.length) return res.json({ class: null, records: [] });

    const rows = await query(
      `SELECT r.*, u.nickname AS student_nickname
       FROM records r
       JOIN class_members cm ON cm.student_id = r.user_id
       JOIN users u ON u.id = r.user_id
       WHERE cm.class_id = ?
       ORDER BY r.created_at DESC LIMIT ?`,
      [classes[0].id, MAX_ROWS]
    );
    return res.json({ class: { id: classes[0].id }, records: rows.map(toClientRecord) });
  } catch (e) {
    console.error('/api/records/class error:', e.message);
    return res.status(500).json({ error: e.message || '获取班级记录失败' });
  }
});

module.exports = { router };
