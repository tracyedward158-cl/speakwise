import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import { useAuth } from '../../context/AuthContext'
import { ROUTES, replace } from '../../platform/nav'
import { fieldProps } from '../../components/formStyles'
import { useNavMetrics } from '../../hooks/useNavMetrics'

// 尺寸走 class（见 app.scss 的 .sw-field）：原生 <input> 会无视内联的
// height 和 padding，只认边框/圆角/宽度，结果文字被裁掉下半截。
// 原因详见 components/formStyles.js。四个框完全一样，抽成一个常量。
const inputProps = fieldProps()

const labelStyle = { fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600 }

export default function Login() {
  const { login, register, enterGuest } = useAuth()
  // 用运行时量到的真实高度，而不是 100vh —— 首帧 WebView 还不知道自己多高，
  // 100vh 会先给一个错的值再纠正，而原生输入框的位置是按第一版（错的）布局算的，
  // 之后不会自己跟上（表现就是「要交互一下文字才显示全」）。
  const nav = useNavMetrics()

  const [tab, setTab] = useState('login') // login | register
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState('student')
  const [classCode, setClassCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async () => {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (tab === 'login') {
        await login(username.trim(), password)
      } else {
        await register({
          username: username.trim(),
          password,
          nickname: nickname.trim(),
          role,
          classCode: role === 'student' ? classCode.trim() : undefined
        })
      }
      // 与 Web 版的 navigate("/") 等价：交给启动页重新判一次
      // （教师进主菜单，学生没 HSK 就先去选 HSK）
      replace(ROUTES.launch)
    } catch (err) {
      setError(err.message || '操作失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const handleGuest = () => {
    enterGuest()
    replace(ROUTES.launch)
  }

  return (
    <View
      style={{
        height: nav.screenHeight,
        background: '#FAFAF7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <View
        style={{
          width: '100%',
          background: '#fff',
          borderRadius: 20,
          border: '1px solid #f0efe8',
          padding: '36px 32px 28px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.06)'
        }}
      >
        {/* ── 品牌 ── */}
        <View style={{ textAlign: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 34, display: 'block' }}>🐼</Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#D4413A',
              display: 'block',
              margin: '8px 0 4px'
            }}
          >
            SpeakWise 琢音
          </Text>
          <Text style={{ fontSize: 12, color: '#aaa' }}>来华留学生 AI 中文口语教练</Text>
        </View>

        {/* ── Tab 切换 ── */}
        <View style={{ display: 'flex', background: '#f5f4f0', borderRadius: 12, padding: 4, marginBottom: 20 }}>
          {[
            { id: 'login', label: '登录' },
            { id: 'register', label: '注册' }
          ].map((t) => (
            <View
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setError('')
              }}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 9,
                background: tab === t.id ? '#fff' : 'transparent',
                display: 'flex',
                justifyContent: 'center',
                boxShadow: tab === t.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: 600, color: tab === t.id ? '#D4413A' : '#888' }}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>

        {/* 小程序没有 <form>，提交靠按钮 onClick；密码框的“回车提交”用 confirmType 触发 */}
        <View style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'register' && (
            <View>
              <Text style={{ ...labelStyle, display: 'block' }}>昵称（可选）</Text>
              <Input alwaysEmbed
                {...inputProps}
                value={nickname}
                maxlength={24}
                placeholder="怎么称呼你？"
                onInput={(e) => setNickname(e.detail.value)}
              />
            </View>
          )}

          <View>
            <Text style={{ ...labelStyle, display: 'block' }}>用户名</Text>
            <Input alwaysEmbed
              {...inputProps}
              value={username}
              placeholder={tab === 'login' ? '请输入用户名' : '3-32 位字母、数字或下划线'}
              onInput={(e) => setUsername(e.detail.value)}
            />
          </View>

          <View>
            <Text style={{ ...labelStyle, display: 'block' }}>密码</Text>
            <Input alwaysEmbed
              {...inputProps}
              password
              value={password}
              placeholder={tab === 'login' ? '请输入密码' : '至少 6 位'}
              onInput={(e) => setPassword(e.detail.value)}
            />
          </View>

          {tab === 'register' && (
            <>
              <View>
                <Text style={{ ...labelStyle, display: 'block' }}>我是</Text>
                <View style={{ display: 'flex', gap: 10 }}>
                  {[
                    { id: 'student', label: '🧑🎓 学生' },
                    { id: 'teacher', label: '👩🏫 教师' }
                  ].map((r) => (
                    <View
                      key={r.id}
                      onClick={() => setRole(r.id)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 10,
                        border: role === r.id ? '2px solid #D4413A' : '1px solid #e0dcd0',
                        background: role === r.id ? '#FDF0EF' : '#fff',
                        display: 'flex',
                        justifyContent: 'center'
                      }}
                    >
                      <Text
                        style={{ fontSize: 13, fontWeight: 600, color: role === r.id ? '#D4413A' : '#888' }}
                      >
                        {r.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {role === 'student' && (
                <View>
                  <Text style={{ ...labelStyle, display: 'block' }}>班级码（可选，教师提供）</Text>
                  <Input alwaysEmbed
                    {...inputProps}
                    value={classCode}
                    maxlength={6}
                    placeholder="例如 AB3CD5"
                    onInput={(e) => setClassCode(e.detail.value.toUpperCase())}
                  />
                </View>
              )}

              {role === 'teacher' && (
                <View style={{ background: '#f8f8f5', borderRadius: 10, padding: '10px 14px' }}>
                  <Text style={{ fontSize: 12, color: '#999' }}>
                    注册后系统会自动为你的班级生成专属班级码，学生凭码加入你的班级。
                  </Text>
                </View>
              )}
            </>
          )}

          {error ? (
            <View
              style={{
                background: '#FDF0EF',
                border: '1px solid #fbe3e1',
                borderRadius: 10,
                padding: '10px 14px'
              }}
            >
              <Text style={{ fontSize: 12, color: '#D4413A' }}>{error}</Text>
            </View>
          ) : null}

          <View
            onClick={handleSubmit}
            style={{
              marginTop: 4,
              padding: '12px 0',
              borderRadius: 12,
              background: busy ? '#e8a9a5' : '#D4413A',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
              {busy ? '请稍候…' : tab === 'login' ? '登录' : '注册并开始'}
            </Text>
          </View>
        </View>

        {/* ── 游客入口 ── */}
        <View
          onClick={handleGuest}
          style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}
        >
          <Text style={{ color: '#bbb', fontSize: 12, textDecoration: 'underline' }}>
            先逛逛 · 游客体验（数据仅保存在本机）
          </Text>
        </View>
      </View>
    </View>
  )
}
