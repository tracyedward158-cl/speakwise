import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const inputStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid #e0dcd0",
  fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  background: "#fff",
};

const labelStyle = { fontSize: 13, color: "#888", marginBottom: 6, fontWeight: 600, textAlign: "left" };

export function Login() {
  const navigate = useNavigate();
  const { login, register, enterGuest } = useAuth();

  const [tab, setTab] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState("student");
  const [classCode, setClassCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (tab === "login") {
        await login(username.trim(), password);
      } else {
        await register({
          username: username.trim(),
          password,
          nickname: nickname.trim(),
          role,
          classCode: role === "student" ? classCode.trim() : undefined,
        });
      }
      navigate("/"); // 进入 HSK 门槛或直接主菜单（登录后 hsk 由 App 同步）
    } catch (err) {
      setError(err.message || "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = () => {
    enterGuest();
    navigate("/");
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAF7", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "20px", fontFamily: "'Noto Sans SC', sans-serif",
      boxSizing: "border-box",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20,
        border: "1px solid #f0efe8", padding: "36px 32px 28px", boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
      }}>
        {/* ── 品牌 ── */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🐼</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#D4413A", margin: "8px 0 4px" }}>SpeakWise 琢音</h1>
          <div style={{ fontSize: 12, color: "#aaa" }}>来华留学生 AI 中文口语教练</div>
        </div>

        {/* ── Tab 切换 ── */}
        <div style={{
          display: "flex", background: "#f5f4f0", borderRadius: 12, padding: 4, marginBottom: 20,
        }}>
          {[
            { id: "login", label: "登录" },
            { id: "register", label: "注册" },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setError(""); }}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer",
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "#D4413A" : "#888", fontSize: 14, fontWeight: 600,
                fontFamily: "inherit", boxShadow: tab === t.id ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "register" && (
            <div>
              <div style={labelStyle}>昵称（可选）</div>
              <input style={inputStyle} value={nickname} maxLength={24}
                placeholder="怎么称呼你？" onChange={e => setNickname(e.target.value)} />
            </div>
          )}

          <div>
            <div style={labelStyle}>用户名</div>
            <input style={inputStyle} value={username} autoComplete="username" required
              placeholder={tab === "login" ? "请输入用户名" : "3-32 位字母、数字或下划线"} onChange={e => setUsername(e.target.value)} />
          </div>

          <div>
            <div style={labelStyle}>密码</div>
            <input style={inputStyle} type="password" value={password} autoComplete={tab === "login" ? "current-password" : "new-password"} required
              placeholder={tab === "login" ? "请输入密码" : "至少 6 位"} onChange={e => setPassword(e.target.value)} />
          </div>

          {tab === "register" && (
            <>
              <div>
                <div style={labelStyle}>我是</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { id: "student", label: "🧑‍🎓 学生" },
                    { id: "teacher", label: "👩‍🏫 教师" },
                  ].map(r => (
                    <button key={r.id} type="button" onClick={() => setRole(r.id)}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                        border: role === r.id ? "2px solid #D4413A" : "1px solid #e0dcd0",
                        background: role === r.id ? "#FDF0EF" : "#fff",
                        color: role === r.id ? "#D4413A" : "#888", fontSize: 14, fontWeight: 600,
                        fontFamily: "inherit",
                      }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {role === "student" && (
                <div>
                  <div style={labelStyle}>班级码（可选，教师提供）</div>
                  <input style={{ ...inputStyle, textTransform: "uppercase" }} value={classCode} maxLength={6}
                    placeholder="例如 AB3CD5" onChange={e => setClassCode(e.target.value.toUpperCase())} />
                </div>
              )}

              {role === "teacher" && (
                <div style={{ fontSize: 12, color: "#999", background: "#f8f8f5", borderRadius: 10, padding: "10px 14px" }}>
                  注册后系统会自动为你的班级生成专属班级码，学生凭码加入你的班级。
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{
              background: "#FDF0EF", border: "1px solid #fbe3e1", borderRadius: 10,
              padding: "10px 14px", fontSize: 13, color: "#D4413A",
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy}
            style={{
              marginTop: 4, padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer",
              background: busy ? "#e8a9a5" : "#D4413A", color: "#fff", fontSize: 16, fontWeight: 700,
              fontFamily: "inherit",
            }}>
            {busy ? "请稍候…" : tab === "login" ? "登录" : "注册并开始"}
          </button>
        </form>

        {/* ── 游客入口 ── */}
        <button type="button" onClick={handleGuest}
          style={{
            width: "100%", marginTop: 16, background: "none", border: "none", cursor: "pointer",
            color: "#bbb", fontSize: 13, fontFamily: "inherit", textDecoration: "underline",
          }}>
          先逛逛 · 游客体验（数据仅保存在本机）
        </button>
      </div>
    </div>
  );
}
