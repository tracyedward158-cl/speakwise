// server/tasks.cjs — 教师任务发布路由 (SpeakWise)
// ============================================================================
//  教师：POST / 发布任务（按模块 + 可选场景 + 目标次数 + 周期天数）
//        GET  / 列出本班任务 + 每名学生完成次数（自动汇总）
//        DELETE /:id 删除任务
//  学生：GET /mine 所在班级的有效任务 + 本人完成进度
//  完成次数统计：records 中 module（+scenario）匹配且 created_at 落在任务周期内
// ============================================================================

'use strict';
const express = require('express');
const { query } = require('./db.cjs');
const { requireAuth, requireTeacher } = require('./auth.cjs');

const router = express.Router();

const ALLOWED_MODULES = ['生活情境', '自由对话', '发音测评', '造句练习', '写作辅导', '文化文游'];

// 与 records.cjs 写入 created_at 的路径保持一致（naive UTC 字符串）
// 两条路径都被 MySQL 按会话时区解释，比较时相互对齐
function toNaiveUtc(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function getClassId(teacherId) {
  const rows = await query('SELECT id FROM classes WHERE teacher_id = ? LIMIT 1', [teacherId]);
  return rows.length ? rows[0].id : null;
}

function toClientTask(t) {
  return {
    id: t.id,
    title: t.title,
    module: t.module,
    scenario: t.scenario,
    targetCount: t.target_count,
    endAt: t.end_at instanceof Date ? t.end_at.toISOString() : t.end_at,
  };
}

// 某人在某任务下的完成次数（比较全部在 SQL 内完成，避免 Date 往返时区问题）
async function countTaskRecords(taskId, userId) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt FROM records r
     JOIN tasks t ON t.id = ?
     WHERE r.user_id = ? AND r.module = t.module
       AND (t.scenario = '' OR r.scenario = t.scenario)
       AND r.created_at >= t.start_at AND r.created_at <= t.end_at`,
    [taskId, userId]
  );
  return rows[0].cnt;
}

// POST /api/tasks — {title, module, scenario?, targetCount, days}（教师）
router.post('/', requireAuth, requireTeacher, async (req, res) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 64);
    const module = String(b.module || '');
    const scenario = String(b.scenario || '').trim().slice(0, 128);
    const targetCount = Math.min(Math.max(parseInt(b.targetCount, 10) || 0, 1), 30);
    const days = Math.min(Math.max(parseInt(b.days, 10) || 0, 1), 60);

    if (!title) return res.status(400).json({ error: '请输入任务标题' });
    if (!ALLOWED_MODULES.includes(module)) return res.status(400).json({ error: '练习模块不合法' });

    const classId = await getClassId(req.user.id);
    if (!classId) return res.status(400).json({ error: '尚未创建班级' });

    const now = new Date();
    const endAt = new Date(now.getTime() + days * 86400000);
    const rows = await query(
      `INSERT INTO tasks (class_id, title, module, scenario, target_count, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [classId, title, module, scenario, targetCount, toNaiveUtc(now), toNaiveUtc(endAt)]
    );
    return res.json({ id: rows.insertId });
  } catch (e) {
    console.error('/api/tasks POST error:', e.message);
    return res.status(500).json({ error: e.message || '发布任务失败' });
  }
});

// GET /api/tasks — 教师：本班全部任务 + 每名学生完成汇总
router.get('/', requireAuth, requireTeacher, async (req, res) => {
  try {
    const classId = await getClassId(req.user.id);
    if (!classId) return res.json({ tasks: [] });

    const tasks = await query('SELECT * FROM tasks WHERE class_id = ? ORDER BY created_at DESC', [classId]);
    const members = await query(
      `SELECT u.id, u.nickname FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = ? ORDER BY cm.joined_at ASC`,
      [classId]
    );

    const result = [];
    for (const t of tasks) {
      const progress = [];
      for (const m of members) {
        const cnt = await countTaskRecords(t.id, m.id);
        progress.push({
          studentId: m.id,
          nickname: m.nickname || `学生${m.id}`,
          count: cnt,
          targetCount: t.target_count,
          done: cnt >= t.target_count,
        });
      }
      result.push({
        ...toClientTask(t),
        progress,
        doneCount: progress.filter(p => p.done).length,
        totalStudents: progress.length,
      });
    }
    return res.json({ tasks: result });
  } catch (e) {
    console.error('/api/tasks GET error:', e.message);
    return res.status(500).json({ error: e.message || '获取任务失败' });
  }
});

// GET /api/tasks/mine — 学生：所在班级有效任务 + 本人进度
router.get('/mine', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.json({ tasks: [] });
    const cm = await query('SELECT class_id FROM class_members WHERE student_id = ? LIMIT 1', [req.user.id]);
    if (!cm.length) return res.json({ tasks: [] });

    const tasks = await query(
      'SELECT * FROM tasks WHERE class_id = ? AND end_at >= ? ORDER BY end_at ASC LIMIT 20',
      [cm[0].class_id, toNaiveUtc(new Date())]
    );

    const result = [];
    for (const t of tasks) {
      const cnt = await countTaskRecords(t.id, req.user.id);
      result.push({
        ...toClientTask(t),
        count: cnt,
        done: cnt >= t.target_count,
      });
    }
    return res.json({ tasks: result });
  } catch (e) {
    console.error('/api/tasks/mine error:', e.message);
    return res.status(500).json({ error: e.message || '获取任务失败' });
  }
});

// DELETE /api/tasks/:id — 教师删除自己班级的任务
router.delete('/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const classId = await getClassId(req.user.id);
    const taskId = Number(req.params.id);
    if (!Number.isFinite(taskId)) return res.status(400).json({ error: '任务 ID 不合法' });
    const rows = await query('DELETE FROM tasks WHERE id = ? AND class_id = ?', [taskId, classId]);
    if (!rows.affectedRows) return res.status(404).json({ error: '任务不存在' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('/api/tasks DELETE error:', e.message);
    return res.status(500).json({ error: e.message || '删除任务失败' });
  }
});

module.exports = { router };
