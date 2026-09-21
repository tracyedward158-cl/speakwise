import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { recordApi } from "../utils/api.js";
import { getStudentProfile, getStudentRecords } from "../utils/recordStore.js";
import { formatRecordDate } from "../utils/transcript.js";
import { PRON_BANK, ALL_TAGS, UNITS, statsByText } from "../utils/pronunciationBank.js";

const COLOR = "#4A90D9";
const ALL = "全部";

const scoreColor = (s) => s >= 80 ? "#2DAA6E" : s >= 60 ? "#E8A838" : s > 0 ? "#D4413A" : "#ccc";

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 16, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
      whiteSpace: "nowrap",
      background: active ? COLOR : "#fff", color: active ? "#fff" : "#777",
      border: `1px solid ${active ? COLOR : "#e8e6de"}`, fontWeight: active ? 600 : 400,
    }}>{children}</button>
  );
}

export function PronunciationBank() {
  const navigate = useNavigate();
  const { hsk: hskLevel, setHsk: onChangeHSK, viewMode: mode, setViewMode: onChangeMode } = useApp();
  const { user } = useAuth();
  const isGuest = !user;

  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [expanded, setExpanded] = useState(null);   // 展开历史的那条题目 id

  // 练习记录：与「我的练习记录」同一口径——登录取云端，游客取本地
  const [profile] = useState(() => (user ? { id: user.id } : getStudentProfile()));
  const [cloudRecords, setCloudRecords] = useState(null);   // null = 加载中
  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    recordApi.mine()
      .then(({ records }) => { if (!cancelled) setCloudRecords(records); })
      .catch(err => {
        console.warn("[PronunciationBank] 云端记录获取失败:", err.message);
        if (!cancelled) setCloudRecords([]);
      });
    return () => { cancelled = true; };
  }, [isGuest, user?.id]);

  const records = useMemo(
    () => (isGuest ? getStudentRecords(profile.id) : (cloudRecords || [])),
    [isGuest, profile.id, cloudRecords]
  );
  // 记录里没存题库 id，句子原文是唯一的关联键
  const stats = useMemo(() => statsByText(records), [records]);

  const list = useMemo(() => {
    const kw = query.trim().toLowerCase();
    return PRON_BANK.filter(it =>
      it.level === hskLevel &&
      (unit === ALL || it.unit === unit) &&
      (tag === ALL || it.tags.includes(tag)) &&
      (!kw
        || it.text.toLowerCase().includes(kw)
        || (it.pinyin || "").toLowerCase().includes(kw)
        || (it.english || "").toLowerCase().includes(kw))
    );
  }, [hskLevel, unit, tag, query]);

  const practice = (it) => navigate(`/oral/drill/practice?mode=single&item=${it.id}&from=bank`);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC',sans-serif" }}>
      <TopBar title="题库浏览" subtitle="Question Bank" onBack={() => navigate("/oral/pronunciation")} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
      <PageWrap maxWidth={580}>
        <div style={{ padding: "18px 0 40px" }}>

          {/* ── 搜索 ── */}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索汉字、拼音或英文…"
              style={{
                width: "100%", boxSizing: "border-box", padding: "13px 40px 13px 16px",
                borderRadius: 12, border: "1px solid #e8e6de", background: "#fff",
                fontSize: 15, outline: "none", color: "#1a1a1a", fontFamily: "inherit",
              }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#ccc", padding: 4,
              }}>✕</button>
            )}
          </div>

          {/* ── 两排筛选 ── */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 2 }}>
            {[ALL, ...UNITS].map(u => (
              <FilterChip key={u} active={unit === u} onClick={() => setUnit(u)}>{u}</FilterChip>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
            {[ALL, ...ALL_TAGS].map(t => (
              <FilterChip key={t} active={tag === t} onClick={() => setTag(t)}>{t}</FilterChip>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "#bbb", marginBottom: 10 }}>
            共 {list.length} 题 · HSK {hskLevel || "未设置"}　点题目直接朗读评测
          </div>

          {/* ── 题目列表 ── */}
          {list.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", padding: "40px 20px", textAlign: "center", color: "#bbb", fontSize: 14 }}>
              没有匹配的题目
            </div>
          )}

          {list.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0efe8", overflow: "hidden" }}>
              {list.map((it, i) => {
                const st = stats.get(it.text);
                const isOpen = expanded === it.id;
                return (
                  <div key={it.id} style={{ borderBottom: i < list.length - 1 ? "1px solid #f7f6f1" : "none" }}>
                    <div onClick={() => practice(it)}
                      onMouseEnter={e => { e.currentTarget.style.background = "#FAFAF7"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: it.unit === "句" ? 16 : 20, fontWeight: 600, color: "#1a1a1a" }}>{it.text}</span>
                          {(mode === "HPE" || mode === "HP") && <span style={{ fontSize: 12, color: "#aaa" }}>{it.pinyin}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: "#EEF4FB", color: COLOR, fontWeight: 600 }}>{it.unit}</span>
                          {it.tags.map(t => (
                            <span key={t} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: "#F5F5F0", color: "#999" }}>{t}</span>
                          ))}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 62 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: st ? "#666" : "#ccc" }}>
                          {st ? `已练 ${st.count} 次` : "未练"}
                        </div>
                        <div style={{ fontSize: 12, color: st && st.best > 0 ? scoreColor(st.best) : "#ccc", fontWeight: st && st.best > 0 ? 700 : 400 }}>
                          {st && st.best > 0 ? `最高 ${st.best}` : "最高 —"}
                        </div>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : it.id); }}
                        title="查看历史评分"
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0,
                          color: "#ccc", fontSize: 12, fontFamily: "inherit",
                          transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s",
                        }}>▼</button>
                    </div>

                    {/* ── 历史评分记录 ── */}
                    {isOpen && (
                      <div style={{ background: "#FAFAF7", padding: "12px 16px", borderTop: "1px solid #f7f6f1" }}>
                        {!st && (
                          <div style={{ fontSize: 12, color: "#bbb" }}>还没有练习记录，点题目开始第一次朗读。</div>
                        )}
                        {st && (
                          <>
                            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>
                              历史评分 · 共 {st.count} 次
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {st.history.slice(0, 8).map(r => (
                                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                                  <span style={{ color: "#bbb", flexShrink: 0 }}>{formatRecordDate(r)}</span>
                                  <span style={{ width: 34, textAlign: "right", fontWeight: 700, color: scoreColor(r.score), flexShrink: 0 }}>
                                    {r.score > 0 ? r.score : "—"}
                                  </span>
                                  <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {r.dimensions
                                      ? [["发音", r.dimensions.pronunciation], ["声调", r.dimensions.tone], ["流利度", r.dimensions.fluency]]
                                          .filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(" · ")
                                      : ""}
                                  </span>
                                </div>
                              ))}
                              {st.history.length > 8 && (
                                <div style={{ fontSize: 11, color: "#ccc" }}>…还有 {st.history.length - 8} 次</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 14, lineHeight: 1.7 }}>
            已练次数与最高分来自你自己的练习记录 · 按题目原文匹配
          </div>
        </div>
      </PageWrap>
    </div>
  );
}
