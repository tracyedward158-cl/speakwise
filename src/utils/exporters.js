// ── 练习记录导出（JSON）──
//
// 为什么是 JSON 而不是 CSV：导出的用途是实验后的数据分析。原来的 CSV 是
// 「一条消息一行」的扁平表，扁平化的过程中丢掉了 dimensions（发音/声调/
// 流利度/完整度）—— 那恰恰是语音测评的主要因变量。JSON 原样保留记录结构，
// 分析脚本按字段取值即可，不做有损转换。
//
// 除 records 原始数据外，导出包还带两个过程指标块（metricsSummary 给人看、
// metricsByRecord 给脚本读），口径见 src/utils/conversationMetrics.js。
// 它们与 records 平行存放，records 本身一个字段都没动 —— 只读 records 的
// 分析脚本完全不受影响，所以 EXPORT_VERSION 不需要升。
//
// 为什么前端生成而不是服务端加导出接口：整包 JSON 恰好是 SCF 响应上限要
// 消灭的那类大响应。逐条详情接口 GET /records/:id 已经存在，复用它即可。
//
// ⚠️ 绝不导出 speakwise_token。导出文件会落到磁盘、再被拷来拷去，
//    带上 JWT 等于把账号凭证一起交出去。
import { getToken, recordApi } from "./api.js";
import { readDrafts, getStudentId, getOwnerId, getStudentProfile } from "./recordStore.js";
import { computeRecordMetrics, summarizeMetrics, metricsParams, METRICS_VERSION } from "./conversationMetrics.js";

export const EXPORT_FORMAT = "speakwise-records";
export const EXPORT_VERSION = 1;

// 单次导出的条数上限，与服务端 GET /records/mine|/class 的 MAX_ROWS 对齐。
// 超过时界面上必须明说，不做静默截断。
export const EXPORT_LIMIT = 500;

/** 并发受限的 map。导出要逐条拉详情，串行 500 个请求会拖到几分钟。 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/**
 * 补齐记录里的 messages。
 *
 * 列表接口刻意不带 messages（500 行 × 一条对话 ≈ 10MB 响应），所以登录用户
 * 必须逐条走详情接口。拉不到的那条按元信息原样导出，不让它整体消失 ——
 * 科研数据不能因为一次网络抖动就少一条。
 */
export async function hydrateRecords(records, { getCached, concurrency = 6, onProgress } = {}) {
  let done = 0;
  return mapLimit(records, concurrency, async (r) => {
    try {
      if (r.messages) return r;                       // 游客的本地记录自带对话
      const cached = getCached?.(r.id);               // 回看过的记录不重复拉
      if (cached) return { ...r, messages: cached };
      if (!getToken()) return r;
      const { record } = await recordApi.detail(r.id);
      return { ...r, ...record };
    } catch {
      return r;
    } finally {
      done += 1;
      onProgress?.(done, records.length);
    }
  });
}

/**
 * 客户端本地快照。
 * 登录用户的记录在云端，本地这份可能只是降级副本；游客则全靠它。
 * 与 records 分开放，免得分析时分不清某条记录是哪来的。
 */
function localSnapshot() {
  const p = getStudentProfile();
  return {
    studentId: getStudentId(),      // 本地匿名编号 P01-P05
    ownerId: getOwnerId(),          // 记录归属（登录用户 = 账号 id）
    nickname: p.nickname,
    hsk: p.hsk,
    // 未提交的对话草稿。通常为空，非空说明有学生的练习没能成功落库，
    // 对实验是有效数据，不该丢。
    pendingDrafts: readDrafts(),
  };
}

/**
 * 组装导出包：records 是原样的记录对象，分析脚本不需要再挖嵌套结构。
 *
 * includeClient 只在导出「本机自己的记录」时为 true。教师导出班级数据时传 false ——
 * 那是老师自己浏览器里的 localStorage（一个随机演示编号 + 空草稿），不是班级数据，
 * 混进去只会让分析时多出无法解释的字段。
 */
export function buildExportPayload(records, { scope = "记录", label = "", extra, includeClient = true } = {}) {
  const list = records || [];
  const transcriptCount = list.filter(r => (r.messages?.length ?? r.messageCount ?? 0) > 0).length;

  // ── 对话过程指标（认知深度操作化，口径见 conversationMetrics.js）──
  // 只对已带 messages 的记录可算：列表接口不返回 messages，导出前 hydrateRecords
  // 已逐条补齐；补不到的那几条会进 coverage.notHydrated，绝不静默当成 0 轮 ——
  // 「平均 3.2 轮」这种结论必须能回答「基于多少条对话」。
  //
  // 刻意不把这些派生字段塞进 records：records 是原始数据，分析脚本会逐条遍历它，
  // 混入派生量会让「原样保留记录结构」这条原则失效。所以平行放在两个顶层键里。
  const perRecord = list.map(record => ({ record, metrics: computeRecordMetrics(record) }));

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    label,
    recordCount: list.length,
    transcriptCount,
    // 给人看的那一块，紧挨 recordCount/transcriptCount —— 打开文件前十行就知道
    // 这份数据里有多少条对话、平均多少轮、口径是什么。
    metricsSummary: {
      metricsVersion: METRICS_VERSION,
      params: metricsParams(),
      ...summarizeMetrics(perRecord.map(x => x.metrics)),
    },
    // 给脚本读的那一块。用数组而不是以 id 为键的对象：演示数据的 1001 与云端自增
    // id 会撞键，数组还保留与 records 相同的顺序，join 很简单。
    metricsByRecord: perRecord
      .filter(x => x.metrics.available)
      .map(({ record, metrics }) => ({
        id: record.id,
        legacyId: record.legacyId ?? null,
        studentId: record.studentId,
        nickname: record.nickname ?? null,
        module: record.module,
        ...metrics,
      })),
    ...(includeClient ? { client: localSnapshot() } : null),
    ...extra,
    records: list,
  };
}

/** Windows 文件名不能含 : / \ 等字符，时间戳用 YYYYMMDD-HHmm */
export function buildFilename(scope, label) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = String(label || "").replace(/[\\/:*?"<>|\s]/g, "_").slice(0, 30);
  return `speakwise_记录_${scope}${safe ? "_" + safe : ""}_${stamp}.json`;
}

export function downloadJson(filename, payload) {
  // 缩进两个空格：这是给人看也会给脚本读的科研数据，体积翻倍换可直接翻阅是划算的
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 一步导出。返回 payload，调用方可以拿 recordCount 报数。 */
export function exportRecordsJson(records, { scope = "记录", label = "", extra, includeClient } = {}) {
  const payload = buildExportPayload(records, { scope, label, extra, includeClient });
  downloadJson(buildFilename(scope, label), payload);
  return payload;
}
