import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../core/utils/api'
import { ROUTES, back, go } from '../../platform/nav'
import { fieldProps } from '../../components/formStyles'

// 尺寸走 class（见 app.scss 的 .sw-field）：原生 <input> 会无视内联的
// height 和 padding，只认边框/圆角/宽度。原因详见 components/formStyles.js。
const inputProps = fieldProps({ width: 'auto', flex: 1 })

const labelStyle = { fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600 }

// 与输入框同行的按钮：alignSelf: stretch 让它自动撑到行高（也就是输入框的高度），
// 比写死一个 minHeight 靠谱 —— 输入框高度变了它跟着变。
const btn = (bg, disabled) => ({
  flexShrink: 0,
  alignSelf: 'stretch',
  padding: '0 20px',
  borderRadius: 10,
  background: disabled ? '#e8a9a5' : bg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
})

function Msg({ msg }) {
  if (!msg) return null
  return (
    <View
      style={{
        padding: '9px 12px',
        borderRadius: 9,
        marginTop: 10,
        background: msg.type === 'ok' ? '#EDFAF3' : '#FDF0EF',
        border: `1px solid ${msg.type === 'ok' ? '#d3f0e1' : '#fbe3e1'}`
      }}
    >
      <Text style={{ fontSize: 12, color: msg.type === 'ok' ? '#2DAA6E' : '#D4413A' }}>
        {msg.text}
      </Text>
    </View>
  )
}

export default function UserCenter() {
  const { user, guest, patchMe, joinClass, leaveClass } = useAuth()

  // ── 昵称表单 ──
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [nickMsg, setNickMsg] = useState(null)
  const [nickBusy, setNickBusy] = useState(false)

  // ── 密码表单 ──
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState(null)
  const [pwdBusy, setPwdBusy] = useState(false)

  // ── 班级表单 ──
  const [classCode, setClassCode] = useState('')
  const [classMsg, setClassMsg] = useState(null)
  const [classBusy, setClassBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false) // 退出班级二次确认

  // 游客无账号能力
  if (!user || guest) {
    return (
      <View style={{ background: '#FAFAF7' }}>
        <TopBar title="用户中心" subtitle="账号设置" onBack={() => back(ROUTES.main)} />
        <PageWrap>
          <View style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 16 }}>🔐</Text>
            <Text style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 8 }}>
              游客模式暂不支持用户中心
            </Text>
            <Text style={{ fontSize: 12, color: '#999', marginBottom: 24 }}>
              登录账号后可修改昵称、修改密码
            </Text>
            <View
              onClick={() => go(ROUTES.login)}
              style={{ padding: '10px 32px', borderRadius: 12, background: '#D4413A' }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>去登录 / 注册</Text>
            </View>
          </View>
        </PageWrap>
      </View>
    )
  }

  const cls = user.class || null
  const isStudent = user.role !== 'teacher'

  const handleJoinClass = async () => {
    const code = classCode.trim().toUpperCase()
    if (!code) {
      setClassMsg({ type: 'err', text: '请输入班级码' })
      return
    }
    if (code === cls?.code) {
      setClassMsg({ type: 'err', text: '你已经在这个班级里了' })
      return
    }
    setClassBusy(true)
    setClassMsg(null)
    setConfirmLeave(false)
    try {
      // 一人一班：服务端会先移除旧班级关系
      const joined = await joinClass(code)
      setClassCode('')
      setClassMsg({
        type: 'ok',
        text: joined?.teacherNickname ? `已加入 ${joined.teacherNickname} 老师的班级` : '已加入班级'
      })
    } catch (e) {
      setClassMsg({ type: 'err', text: e.message || '加入班级失败' })
    } finally {
      setClassBusy(false)
    }
  }

  const handleLeaveClass = async () => {
    setClassBusy(true)
    setClassMsg(null)
    try {
      await leaveClass()
      setConfirmLeave(false)
      setClassMsg({ type: 'ok', text: '已退出班级，练习记录仍保留在「我的练习记录」中' })
    } catch (e) {
      setClassMsg({ type: 'err', text: e.message || '退出班级失败' })
    } finally {
      setClassBusy(false)
    }
  }

  const handleSaveNickname = async () => {
    const name = nickname.trim()
    if (!name) {
      setNickMsg({ type: 'err', text: '昵称不能为空' })
      return
    }
    if (name === user.nickname) {
      setNickMsg({ type: 'err', text: '昵称没有变化' })
      return
    }
    setNickBusy(true)
    setNickMsg(null)
    try {
      await patchMe({ nickname: name })
      setNickMsg({ type: 'ok', text: '昵称已更新' })
    } catch (e) {
      setNickMsg({ type: 'err', text: e.message || '保存失败' })
    } finally {
      setNickBusy(false)
    }
  }

  const handleChangePassword = async () => {
    if (!oldPwd) {
      setPwdMsg({ type: 'err', text: '请输入当前密码' })
      return
    }
    if (!newPwd || newPwd.length < 6) {
      setPwdMsg({ type: 'err', text: '新密码至少 6 位' })
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'err', text: '两次输入的新密码不一致' })
      return
    }
    if (newPwd === oldPwd) {
      setPwdMsg({ type: 'err', text: '新密码不能和当前密码相同' })
      return
    }
    setPwdBusy(true)
    setPwdMsg(null)
    try {
      await authApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd })
      setPwdMsg({ type: 'ok', text: '密码修改成功' })
      setOldPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (e) {
      setPwdMsg({ type: 'err', text: e.message || '修改失败' })
    } finally {
      setPwdBusy(false)
    }
  }

  const displayName = user.nickname || user.username

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar title="用户中心" subtitle="账号设置" onBack={() => back(ROUTES.main)} />
      <PageWrap>
        <View style={{ padding: '28px 0 80px' }}>
          {/* ── 账号信息卡 ── */}
          <View
            style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #f0efe8',
              padding: '22px 24px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #D4413A, #9B59B6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text style={{ fontSize: 22, color: '#fff', fontWeight: 700 }}>
                {String(displayName)[0]}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>{displayName}</Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: user.role === 'teacher' ? '#F5F0FA' : '#EEF4FB',
                    color: user.role === 'teacher' ? '#9B59B6' : '#4A90D9'
                  }}
                >
                  {user.role === 'teacher' ? '教师' : '学生'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#aaa', display: 'block', marginTop: 3 }}>
                用户名：{user.username}
                {user.role !== 'teacher' ? ` · HSK ${user.hsk || '未设置'}` : ''}
              </Text>
            </View>
          </View>

          {/* ── 我的班级（仅学生）── */}
          {isStudent && (
            <View
              style={{
                background: '#fff',
                borderRadius: 18,
                border: '1px solid #f0efe8',
                padding: '22px 24px',
                marginBottom: 20
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: 700, color: '#333', display: 'block', marginBottom: 14 }}>
                我的班级
              </Text>

              {cls ? (
                <View
                  style={{
                    background: '#F7F9FC',
                    border: '1px solid #e6eefa',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 16
                  }}
                >
                  <View style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12, color: '#888' }}>班级码</Text>
                    <Text style={{ fontSize: 17, fontWeight: 800, letterSpacing: 3, color: '#4A90D9' }}>
                      {cls.code}
                    </Text>
                    {cls.name ? <Text style={{ fontSize: 12, color: '#666' }}>· {cls.name}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: '#666', display: 'block', marginTop: 8 }}>
                    任课老师：
                    <Text style={{ fontWeight: 700, color: '#333' }}>
                      {cls.teacherNickname || '未设置昵称'}
                    </Text>
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    background: '#f8f8f5',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 16
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#999' }}>
                    你还没有加入班级。向老师索取 6 位班级码，在下方输入即可加入。
                  </Text>
                </View>
              )}

              <Text style={{ ...labelStyle, display: 'block' }}>
                {cls ? '加入新班级（将替换当前班级）' : '班级码'}
              </Text>
              <View style={{ display: 'flex', gap: 10 }}>
                <Input alwaysEmbed
                  {...inputProps} style={{ letterSpacing: 2 }}
                  value={classCode}
                  maxlength={6}
                  disabled={classBusy}
                  placeholder="例如 AB3CD5"
                  confirmType="done"
                  onConfirm={handleJoinClass}
                  onInput={(e) => setClassCode(e.detail.value.toUpperCase())}
                />
                <View onClick={classBusy ? undefined : handleJoinClass} style={btn('#4A90D9', classBusy)}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {classBusy ? '处理中…' : cls ? '换班' : '加入'}
                  </Text>
                </View>
              </View>

              {cls &&
                (confirmLeave ? (
                  <View style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12, color: '#D4413A', flex: 1 }}>
                      退出后练习记录仍保留，但不再计入该班学情。
                    </Text>
                    <View
                      onClick={handleLeaveClass}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 10,
                        background: classBusy ? '#e8a9a5' : '#D4413A'
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>确认退出</Text>
                    </View>
                    <View
                      onClick={() => setConfirmLeave(false)}
                      style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid #e0dcd0' }}
                    >
                      <Text style={{ color: '#888', fontSize: 12 }}>取消</Text>
                    </View>
                  </View>
                ) : (
                  <View
                    onClick={() => {
                      setConfirmLeave(true)
                      setClassMsg(null)
                    }}
                    style={{
                      marginTop: 14,
                      padding: '7px 16px',
                      borderRadius: 10,
                      border: '1px solid #f0c9c6',
                      display: 'inline-flex'
                    }}
                  >
                    <Text style={{ color: '#D4413A', fontSize: 12 }}>退出当前班级</Text>
                  </View>
                ))}

              <Msg msg={classMsg} />
            </View>
          )}

          {/* ── 修改昵称 ── */}
          <View
            style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #f0efe8',
              padding: '22px 24px',
              marginBottom: 20
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: 700, color: '#333', display: 'block', marginBottom: 14 }}>
              修改昵称
            </Text>
            <Text style={{ ...labelStyle, display: 'block' }}>新昵称</Text>
            <View style={{ display: 'flex', gap: 10 }}>
              <Input alwaysEmbed
                {...inputProps}
                value={nickname}
                maxlength={24}
                confirmType="done"
                onConfirm={handleSaveNickname}
                onInput={(e) => setNickname(e.detail.value)}
              />
              <View onClick={nickBusy ? undefined : handleSaveNickname} style={btn('#D4413A', nickBusy)}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  {nickBusy ? '保存中…' : '保存'}
                </Text>
              </View>
            </View>
            <Msg msg={nickMsg} />
          </View>

          {/* ── 修改密码 ── */}
          <View style={{ background: '#fff', borderRadius: 18, border: '1px solid #f0efe8', padding: '22px 24px' }}>
            <Text style={{ fontSize: 14, fontWeight: 700, color: '#333', display: 'block', marginBottom: 14 }}>
              修改密码
            </Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <View>
                <Text style={{ ...labelStyle, display: 'block' }}>当前密码</Text>
                <Input alwaysEmbed {...inputProps} password value={oldPwd} onInput={(e) => setOldPwd(e.detail.value)} />
              </View>
              <View>
                <Text style={{ ...labelStyle, display: 'block' }}>新密码</Text>
                <Input alwaysEmbed
                  {...inputProps}
                  password
                  value={newPwd}
                  placeholder="至少 6 位"
                  onInput={(e) => setNewPwd(e.detail.value)}
                />
              </View>
              <View>
                <Text style={{ ...labelStyle, display: 'block' }}>确认新密码</Text>
                <Input alwaysEmbed
                  {...inputProps}
                  password
                  value={confirmPwd}
                  confirmType="done"
                  onConfirm={handleChangePassword}
                  onInput={(e) => setConfirmPwd(e.detail.value)}
                />
              </View>
            </View>
            <View
              onClick={pwdBusy ? undefined : handleChangePassword}
              style={{
                marginTop: 16,
                padding: '11px 0',
                borderRadius: 10,
                background: pwdBusy ? '#e8a9a5' : '#D4413A',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {pwdBusy ? '提交中…' : '确认修改密码'}
              </Text>
            </View>
            <Msg msg={pwdMsg} />
          </View>
        </View>
      </PageWrap>
    </View>
  )
}
