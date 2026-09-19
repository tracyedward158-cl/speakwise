// server/auth.cjs — 认证与班级路由 (SpeakWise)
// ============================================================================
//  JWT Bearer 认证；bcryptjs 密码哈希；教师注册自动建班（6 位班级码）
//  学生一人一班：加入新班级前移除旧班级关系
// ============================================================================

'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./db.cjs');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
// 排除易混字符 I/O/0/1
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function toClientUser(u) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname || u.username,
    role: u.role,
    hsk: u.hsk || null,
    createdAt: u.created_at,
  };
}

function generateClassCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function createClassForTeacher(teacherId) {
  // 班级码唯一冲突时重试（最多 5 次）
  for (let i = 0; i < 5; i++) {
    const code = generateClassCode();
    try {
      const rows = await query(
        'INSERT INTO classes (code, name, teacher_id) VALUES (?, ?, ?)',
        [code, '', teacherId]
      );
      return { id: rows.insertId, code };
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.message.includes('Duplicate entry')) continue;
      throw e;
    }
  }
  throw new Error('班级码生成失败，请重试');
}

async function getClassForTeacher(teacherId) {
  const classes = await query('SELECT * FROM classes WHERE teacher_id = ? LIMIT 1', [teacherId]);
  if (!classes.length) return null;
  const members = await query(
    `SELECT u.id, u.nickname, u.hsk, cm.joined_at
     FROM class_members cm JOIN users u ON u.id = cm.student_id
     WHERE cm.class_id = ? ORDER BY cm.joined_at ASC`,
    [classes[0].id]
  );
  return {
    id: classes[0].id,
    code: classes[0].code,
    name: classes[0].name,
    members: members.map(m => ({
      id: m.id,
      nickname: m.nickname || `学生${m.id}`,
      hsk: m.hsk,
      joinedAt: m.joined_at,
    })),
  };
}

async function getClassForStudent(studentId) {
  const rows = await query(
    `SELECT c.id, c.code, c.name, u.nickname AS teacher_nickname
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     JOIN users u ON u.id = c.teacher_id
     WHERE cm.student_id = ? LIMIT 1`,
    [studentId]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    code: rows[0].code,
    name: rows[0].name,
    teacherNickname: rows[0].teacher_nickname,
  };
}

// 班级查询失败时降级为 null，不阻断登录 / 会话恢复：
// 否则一次偶发的查询报错会让前端清 token 把用户踢回登录页
async function getClassSafe(userId, role) {
  try {
    return role === 'teacher'
      ? await getClassForTeacher(userId)
      : await getClassForStudent(userId);
  } catch (e) {
    console.warn('班级信息获取失败:', e.message);
    return null;
  }
}

// ── 中间件 ──

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function requireTeacher(req, res, next) {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ error: '仅教师可访问' });
  }
  next();
}

// ── 路由 ──

// POST /api/auth/register — {username, password, nickname?, role?, classCode?}
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, role = 'student', classCode } = req.body || {};

    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母、数字或下划线' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: '角色不合法' });
    }

    // 学生注册带班级码时，先验证班级存在
    let targetClass = null;
    if (role === 'student' && classCode) {
      const found = await query('SELECT id, code FROM classes WHERE code = ?', [String(classCode).trim().toUpperCase()]);
      if (!found.length) return res.status(400).json({ error: '班级码不存在，请核对后重试' });
      targetClass = found[0];
    }

    const hash = await bcrypt.hash(String(password), 10);
    let userId;
    try {
      const rows = await query(
        'INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)',
        [username, hash, String(nickname || username).slice(0, 24), role]
      );
      userId = rows.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.message.includes('Duplicate entry')) {
        return res.status(409).json({ error: '用户名已被注册' });
      }
      throw e;
    }

    // 教师：自动建班；学生：加入班级（先清旧关系，一人一班）
    try {
      if (role === 'teacher') {
        await createClassForTeacher(userId);
      } else if (targetClass) {
        await query('DELETE FROM class_members WHERE student_id = ?', [userId]);
        await query('INSERT INTO class_members (class_id, student_id) VALUES (?, ?)', [targetClass.id, userId]);
      }
    } catch (e) {
      await query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
      throw e;
    }

    const user = { id: userId, username, nickname: nickname || username, role, hsk: null, created_at: new Date() };
    // 带上班级信息（教师=新建的班，学生=已加入的班），前端存进 user.class，
    // 主菜单即可直接显示班级码，不必再发一次 /me
    return res.json({
      token: signToken(user),
      user: toClientUser(user),
      class: await getClassSafe(userId, role),
    });
  } catch (e) {
    console.error('/api/auth/register error:', e.message);
    return res.status(500).json({ error: e.message || '注册失败' });
  }
});

// POST /api/auth/login — {username, password}
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    const users = await query('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
    if (!users.length) return res.status(401).json({ error: '用户名或密码错误' });

    const ok = await bcrypt.compare(String(password), users[0].password_hash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });

    return res.json({
      token: signToken(users[0]),
      user: toClientUser(users[0]),
      class: await getClassSafe(users[0].id, users[0].role),
    });
  } catch (e) {
    console.error('/api/auth/login error:', e.message);
    return res.status(500).json({ error: e.message || '登录失败' });
  }
});

// GET /api/auth/me — 当前用户 + 班级信息
router.get('/me', requireAuth, async (req, res) => {
  try {
    const users = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return res.status(401).json({ error: '账号不存在' });
    return res.json({
      user: toClientUser(users[0]),
      class: await getClassSafe(req.user.id, req.user.role),
    });
  } catch (e) {
    console.error('/api/auth/me error:', e.message);
    return res.status(500).json({ error: e.message || '获取用户信息失败' });
  }
});

// PATCH /api/auth/me — {nickname?, hsk?}
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { nickname, hsk } = req.body || {};
    const sets = [];
    const params = [];
    if (nickname !== undefined) {
      const name = String(nickname).trim().slice(0, 24);
      if (name) { sets.push('nickname = ?'); params.push(name); }
    }
    if (hsk !== undefined) {
      if (hsk === null || ['1-3', '4-6', '7-9'].includes(hsk)) {
        sets.push('hsk = ?'); params.push(hsk);
      }
    }
    if (sets.length) {
      params.push(req.user.id);
      await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    const users = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({ user: toClientUser(users[0]) });
  } catch (e) {
    console.error('/api/auth/me PATCH error:', e.message);
    return res.status(500).json({ error: e.message || '更新失败' });
  }
});

// POST /api/auth/change-password — {oldPassword, newPassword}（需登录）
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword) return res.status(400).json({ error: '请输入当前密码' });
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    const users = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return res.status(401).json({ error: '账号不存在' });

    const ok = await bcrypt.compare(String(oldPassword), users[0].password_hash);
    if (!ok) return res.status(400).json({ error: '当前密码不正确' });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('/api/auth/change-password error:', e.message);
    return res.status(500).json({ error: e.message || '修改密码失败' });
  }
});

// POST /api/auth/class/join — {code}（学生）
router.post('/class/join', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '仅学生可加入班级' });
    }
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: '请输入班级码' });

    const found = await query('SELECT id, code FROM classes WHERE code = ?', [code]);
    if (!found.length) return res.status(400).json({ error: '班级码不存在，请核对后重试' });

    await query('DELETE FROM class_members WHERE student_id = ?', [req.user.id]);
    await query('INSERT INTO class_members (class_id, student_id) VALUES (?, ?)', [found[0].id, req.user.id]);

    return res.json({ class: await getClassForStudent(req.user.id) });
  } catch (e) {
    console.error('/api/auth/class/join error:', e.message);
    return res.status(500).json({ error: e.message || '加入班级失败' });
  }
});

// POST /api/auth/class/leave — 学生退出当前班级
// 只删 class_members 关系：练习记录保留在个人档案，只是不再计入该班学情
router.post('/class/leave', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '仅学生可退出班级' });
    }
    const rows = await query('SELECT class_id FROM class_members WHERE student_id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) {
      return res.status(400).json({ error: '你当前未加入任何班级' });
    }
    await query('DELETE FROM class_members WHERE student_id = ?', [req.user.id]);
    return res.json({ class: null });
  } catch (e) {
    console.error('/api/auth/class/leave error:', e.message);
    return res.status(500).json({ error: e.message || '退出班级失败' });
  }
});

module.exports = { router, requireAuth, requireTeacher };
