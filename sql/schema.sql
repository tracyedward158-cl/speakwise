-- SpeakWise 琢音 — TDSQL-C Serverless (MySQL 8.0) 建表脚本
-- 执行方式：腾讯云控制台 → TDSQL-C 实例 → SQL 窗口，粘贴全部执行
-- 或本地：mysql -h <host> -P <port> -u <user> -p speakwise < schema.sql

CREATE DATABASE IF NOT EXISTS speakwise DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE speakwise;

-- ── users: 账号、角色、HSK（与前端 AppContext.hsk 同步）──
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  nickname VARCHAR(24) NOT NULL DEFAULT '',
  role ENUM('student','teacher') NOT NULL DEFAULT 'student',
  hsk VARCHAR(4) DEFAULT NULL,          -- '1-3' | '4-6' | '7-9'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── classes: 教师注册时自动建班 ──
CREATE TABLE IF NOT EXISTS classes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(6) NOT NULL UNIQUE,         -- 6 位班级码（数字+字母，排除易混字符）
  name VARCHAR(64) NOT NULL DEFAULT '',
  teacher_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── class_members: 学生-班级（一名学生仅一个班）──
CREATE TABLE IF NOT EXISTS class_members (
  class_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── records: 练习记录（结构对齐前端 buildRecord 输出）──
CREATE TABLE IF NOT EXISTS records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  legacy_id BIGINT DEFAULT NULL,        -- 本地 Date.now() id，迁移去重用（NULL 不参与唯一约束）
  module VARCHAR(20) NOT NULL,
  scenario VARCHAR(128) NOT NULL DEFAULT '',
  score INT NOT NULL DEFAULT 0,
  dimensions JSON DEFAULT NULL,         -- {pronunciation,tone,fluency,completeness}
  problems JSON DEFAULT NULL,           -- ["量词搭配不稳定", ...]
  suggestion TEXT,
  messages JSON DEFAULT NULL,           -- 完整对话记录 [{sender,content,at,channel}]，仅对话类模块
  source VARCHAR(8) NOT NULL DEFAULT '', -- 发音测评题目来源 'train'|'testA'|'testB'|'custom'，其余模块留空
  hsk_level VARCHAR(4) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_legacy (user_id, legacy_id),   -- 迁移幂等去重
  KEY idx_user_created (user_id, created_at),
  KEY idx_module (module),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ⚠️ CREATE TABLE IF NOT EXISTS 不会给已存在的表加列。若 records 表已建，
--    需执行文件末尾「幂等 ALTER」一节，否则所有 POST /api/records 会因缺列报 500。

-- ── tasks: 教师发布的口语任务（按模块 + 可选场景统计完成次数）──
CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  title VARCHAR(64) NOT NULL,
  module VARCHAR(20) NOT NULL,
  scenario VARCHAR(128) NOT NULL DEFAULT '',   -- 空 = 该模块不限场景
  target_count INT NOT NULL DEFAULT 3,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_class_end (class_id, end_at),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- 幂等 ALTER —— 给已存在的库补列
-- ═══════════════════════════════════════════════════════════════════
-- 上面的 CREATE TABLE IF NOT EXISTS 只对新建库生效；MySQL 8.0 也没有
-- ADD COLUMN IF NOT EXISTS。下面这段可反复执行，已存在时输出 skipped。
--
-- ⚠️ 部署顺序：必须先跑这段（或裸 ALTER），再发布带 messages 列的后端。
--    反过来会让所有 POST /api/records 抛 ER_BAD_FIELD_ERROR，而前端
--    saveRecord 会静默降级到 localStorage —— 用户以为存到云端了，实际没有。
--
-- 若 TDSQL-C 控制台限制 PREPARE/多语句，直接执行：
--   ALTER TABLE records ADD COLUMN messages JSON DEFAULT NULL;
-- 重跑报 ER_DUP_FIELDNAME (1060) Duplicate column name 'messages' 即代表列已存在。

SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE records ADD COLUMN messages JSON DEFAULT NULL COMMENT ''对话记录 [{sender,content,at,channel}]''',
    'SELECT ''skipped: records.messages already exists'' AS result')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'speakwise'   -- 与本文件顶部 CREATE DATABASE 一致；库名不同请改这里
    AND TABLE_NAME   = 'records'
    AND COLUMN_NAME  = 'messages'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证：
--   SHOW COLUMNS FROM records LIKE 'messages';                    -- 应返回 1 行
--   SELECT COUNT(*) FROM records WHERE messages IS NOT NULL;      -- 升级后应为 0

-- ── records.source：区分发音测评的题目来源（train/testA/testB/custom）──
-- 测试模式的成绩与日常练习在 module/scenario 上完全一样，导出时无法分辨前后测数据。
-- ⚠️ 同样必须先跑这段再发布带 source 列的后端，否则所有 POST /api/records 报
--    ER_BAD_FIELD_ERROR，前端 saveRecord 会静默降级到 localStorage。
SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE records ADD COLUMN source VARCHAR(8) NOT NULL DEFAULT '''' COMMENT ''发音测评题目来源 train/testA/testB/custom''',
    'SELECT ''skipped: records.source already exists'' AS result')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'speakwise'
    AND TABLE_NAME   = 'records'
    AND COLUMN_NAME  = 'source'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证：
--   SHOW COLUMNS FROM records LIKE 'source';                      -- 应返回 1 行
--   SELECT source, COUNT(*) FROM records GROUP BY source;
