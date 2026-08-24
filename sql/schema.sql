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
  hsk_level VARCHAR(4) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_legacy (user_id, legacy_id),   -- 迁移幂等去重
  KEY idx_user_created (user_id, created_at),
  KEY idx_module (module),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
