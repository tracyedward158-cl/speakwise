// server/db.cjs — TDSQL-C (MySQL) connection pool for SCF
// ============================================================================
//  惰性创建：首次调用 query() 才建池，冷启动时不阻塞非 DB 请求
//  connectionLimit 小值：SCF 实例动态伸缩，防止打满数据库连接数
//  idleTimeout：空闲连接主动回收，避免复用被外网代理（NAT）掐断的死连接
//  连接级错误（含 ER_MALFORMED_PACKET）：销毁连接池重建并重试一次
// ============================================================================

'use strict';
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (pool) return pool;

  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'speakwise',
    connectionLimit: 5,
    waitForConnections: true,
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 60000,   // 空闲 1 分钟主动断开，避免复用被代理回收的死连接
    connectTimeout: 10000, // 覆盖 TDSQL-C 自动暂停唤醒耗时（唤醒需数秒）
  };

  pool = mysql.createPool(config); // charset: 'utf8mb4' 已在握手时生效，无需逐连接 SET NAMES
  pool.on('error', (err) => {
    console.error('[db] pool error:', err.message);
  });
  return pool;
}

// 连接/协议级错误：连接被掐断、包格式错乱、网络中断等（与 SQL 执行错误区分）
const CONN_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE',
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_PACKETS_OUT_OF_ORDER', 'PROTOCOL_INCORRECT_PACKETS_SEQUENCE',
  'ER_MALFORMED_PACKET', 'ER_QUERY_INTERRUPTED', 'ER_SERVER_SHUTDOWN',
  'ER_CONNECTION_KILLED', 'ER_NET_READ_INTERRUPTED', 'ER_NET_WRITE_INTERRUPTED',
]);

function isConnError(err) {
  return !err.code || CONN_ERROR_CODES.has(err.code);
}

/** 销毁连接池，下次调用 query 时重建（用于连接失效后的自动恢复）。 */
async function resetPool() {
  if (!pool) return;
  const old = pool;
  pool = null;
  try { await old.destroy(); } catch (e) { /* 忽略销毁失败 */ }
}

// 连接级错误重试：自动暂停唤醒期间可能连续失败，指数退避重试
const MAX_RETRIES = 3;          // 重试 3 次（共 4 次尝试）
const RETRY_BASE_DELAY = 1000;  // 基础间隔，指数退避：1s, 2s, 3s

/**
 * 执行 SQL 查询。
 * - 连接/协议级错误：销毁连接池重建，指数退避重试（最多 MAX_RETRIES 次）；
 *   仍失败 → 友好文案。覆盖自动暂停唤醒、代理回收死连接等场景
 * - SQL 执行错误（ER_*，如 Duplicate entry）：保留原始错误供上层判断
 */
async function query(sql, params = [], retries = MAX_RETRIES) {
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    throw new Error('Database not configured (missing DB_* env vars)');
  }
  const p = getPool();
  try {
    const [rows] = await p.query(sql, params);
    return rows;
  } catch (err) {
    console.error('[db] query failed:', err.code, err.message);

    if (isConnError(err)) {
      if (retries > 0) {
        const delay = RETRY_BASE_DELAY * (MAX_RETRIES - retries + 1);
        console.warn(`[db] connection-level error, rebuilding pool and retrying in ${delay}ms (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})...`);
        await resetPool();
        await new Promise(r => setTimeout(r, delay));
        return query(sql, params, retries - 1);
      }
      throw new Error('数据库暂时不可用，请稍后再试');
    }
    throw err; // SQL 执行错误：保留原始信息（Duplicate entry 等）
  }
}

module.exports = { query };
