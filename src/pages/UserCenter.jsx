import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar.jsx";
import { PageWrap } from "../components/PageWrap.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../utils/api.js";

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #e0dcd0",
  fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  background: "#fff",
};

const labelStyle = { fontSize: 13, color: "#888", marginBottom: 6, fontWeight: 600, textAlign: "left" };

function Msg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 13, padding: "9px 12px", borderRadius: 9, marginTop: 10,
      background: msg.type === "ok" ? "#EDFAF3" : "#FDF0EF",
      border: `1px solid ${msg.type === "ok" ? "#d3f0e1" : "#fbe3e1"}`,
      color: msg.type === "ok" ? "#2DAA6E" : "#D4413A",
    }}>
      {msg.text}
    </div>
  );
}

export function UserCenter() {
  const navigate = useNavigate();
  const { user, guest, patchMe } = useAuth();

  // ── 昵称表单 ──
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [nickMsg, setNickMsg] = useState(null);
  const [nickBusy, setNickBusy] = useState(false);

  // ── 密码表单 ──
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  // 游客无账号能力
  if (!user || guest) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
        <TopBar title="用户中心" subtitle="账号设置" onBack={() => navigate("/main")} />
        <PageWrap maxWidth={520}>
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#333", marginBottom: 8 }}>游客模式暂不支持用户中心</div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>登录账号后可修改昵称、修改密码</div>
            <button onClick={() => navigate("/login")}
              style={{
                padding: "10px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: "#D4413A", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
              }}>
              去登录 / 注册
            </button>
          </div>
        </PageWrap>
      </div>
    );
  }

  const handleSaveNickname = async () => {
    const name = nickname.trim();
    if (!name) { setNickMsg({ type: "err", text: "昵称不能为空" }); return; }
    if (name === user.nickname) { setNickMsg({ type: "err", text: "昵称没有变化" }); return; }
    setNickBusy(true);
    setNickMsg(null);
    try {
      await patchMe({ nickname: name });
      setNickMsg({ type: "ok", text: "昵称已更新" });
    } catch (e) {
      setNickMsg({ type: "err", text: e.message || "保存失败" });
    } finally {
      setNickBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd) { setPwdMsg({ type: "err", text: "请输入当前密码" }); return; }
    if (!newPwd || newPwd.length < 6) { setPwdMsg({ type: "err", text: "新密码至少 6 位" }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: "err", text: "两次输入的新密码不一致" }); return; }
    if (newPwd === oldPwd) { setPwdMsg({ type: "err", text: "新密码不能和当前密码相同" }); return; }
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await authApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setPwdMsg({ type: "ok", text: "密码修改成功" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e) {
      setPwdMsg({ type: "err", text: e.message || "修改失败" });
    } finally {
      setPwdBusy(false);
    }
  };

  const displayName = user.nickname || user.username;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Noto Sans SC', sans-serif" }}>
      <TopBar title="用户中心" subtitle="账号设置" onBack={() => navigate("/main")} />
      <PageWrap maxWidth={520}>
        <div style={{ padding: "28px 0 80px" }}>

          {/* ── 账号信息卡 ── */}
          <div style={{
            background: "#fff", borderRadius: 18, border: "1px solid #f0efe8",
            padding: "22px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #D4413A, #9B59B6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, color: "#fff", fontWeight: 700,
            }}>
              {String(displayName)[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{displayName}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                  background: user.role === "teacher" ? "#F5F0FA" : "#EEF4FB",
                  color: user.role === "teacher" ? "#9B59B6" : "#4A90D9",
                }}>
                  {user.role === "teacher" ? "教师" : "学生"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 3 }}>
                用户名：{user.username}
                {user.role !== "teacher" && ` · HSK ${user.hsk || "未设置"}`}
              </div>
            </div>
          </div>

          {/* ── 修改昵称 ── */}
          <div style={{
            background: "#fff", borderRadius: 18, border: "1px solid #f0efe8",
            padding: "22px 24px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 14 }}>修改昵称</div>
            <div style={labelStyle}>新昵称</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input style={inputStyle} value={nickname} maxLength={24}
                onChange={e => setNickname(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSaveNickname()} />
              <button onClick={handleSaveNickname} disabled={nickBusy}
                style={{
                  flexShrink: 0, padding: "0 20px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: nickBusy ? "#e8a9a5" : "#D4413A", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                }}>
                {nickBusy ? "保存中…" : "保存"}
              </button>
            </div>
            <Msg msg={nickMsg} />
          </div>

          {/* ── 修改密码 ── */}
          <div style={{
            background: "#fff", borderRadius: 18, border: "1px solid #f0efe8",
            padding: "22px 24px",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 14 }}>修改密码</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={labelStyle}>当前密码</div>
                <input style={inputStyle} type="password" value={oldPwd} autoComplete="current-password"
                  onChange={e => setOldPwd(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>新密码</div>
                <input style={inputStyle} type="password" value={newPwd} autoComplete="new-password"
                  placeholder="至少 6 位" onChange={e => setNewPwd(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>确认新密码</div>
                <input style={inputStyle} type="password" value={confirmPwd} autoComplete="new-password"
                  onChange={e => setConfirmPwd(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleChangePassword()} />
              </div>
            </div>
            <button onClick={handleChangePassword} disabled={pwdBusy}
              style={{
                width: "100%", marginTop: 16, padding: "11px 0", borderRadius: 10, border: "none", cursor: "pointer",
                background: pwdBusy ? "#e8a9a5" : "#D4413A", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
              }}>
              {pwdBusy ? "提交中…" : "确认修改密码"}
            </button>
            <Msg msg={pwdMsg} />
          </div>

        </div>
      </PageWrap>
    </div>
  );
}
