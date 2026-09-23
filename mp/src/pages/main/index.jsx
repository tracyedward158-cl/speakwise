import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { authApi, taskApi } from '../../core/utils/api'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MenuItem } from '../../components/MenuItem'
import { Onboarding } from '../../components/Onboarding'
import { storage } from '../../platform/storage'
import { FEATURES } from '../../config'
import { ROUTES, go, replace, reset } from '../../platform/nav'
import { useGuard } from '../../hooks/useGuard'

const ONBOARDED_KEY = 'speakwise_onboarded'

function UserBar({ onLogout }) {
  const { user, guest } = useAuth()
  const { hsk: hskLevel } = useApp()
  // 教师端首页已有大号班级码卡片，这里只给学生显示
  const cls = user?.role === 'student' ? user.class : null

  return (
    <View
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #f0efe8',
        padding: '12px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          flexShrink: 0,
          background: user ? 'linear-gradient(135deg, #D4413A, #9B59B6)' : '#e8e6dd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text style={{ fontSize: 15, color: '#fff', fontWeight: 700 }}>
          {user ? (user.nickname || user.username)[0] : '🙂'}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
            {user ? user.nickname || user.username : '游客模式'}
          </Text>
          {user && (
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
          )}
          {cls?.code && (
            <Text
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                background: '#F7F9FC',
                color: '#4A90D9',
                letterSpacing: 1
              }}
            >
              班级码 {cls.code}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 11, color: '#aaa', marginTop: 1, display: 'block' }}>
          {user
            ? user.role === 'teacher'
              ? '班级管理 · 学情分析'
              : `HSK ${user.hsk || hskLevel || '未设置'}`
            : '练习数据仅保存在本机'}
        </Text>
      </View>

      {user ? (
        <>
          <View
            onClick={() => go(ROUTES.userCenter)}
            style={{
              flexShrink: 0,
              border: '1px solid #e0dcd0',
              borderRadius: 8,
              padding: '6px 12px'
            }}
          >
            <Text style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>👤 用户中心</Text>
          </View>
          <View
            onClick={onLogout}
            style={{
              flexShrink: 0,
              border: '1px solid #e0dcd0',
              borderRadius: 8,
              padding: '6px 12px'
            }}
          >
            <Text style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>退出登录</Text>
          </View>
        </>
      ) : (
        <View
          onClick={() => go(ROUTES.login)}
          style={{ flexShrink: 0, background: '#D4413A', borderRadius: 8, padding: '6px 14px' }}
        >
          <Text style={{ fontSize: 12, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
            登录 / 注册
          </Text>
        </View>
      )}
    </View>
  )
}

// ── 教师主页：班级码 + 学情概览，无学生练习模块 ──
function TeacherHome({ onOpenAbout }) {
  const { logout } = useAuth()
  const [hovered, setHovered] = useState(null)
  const [classInfo, setClassInfo] = useState(null)

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then(({ class: c }) => {
        if (!cancelled) setClassInfo(c)
      })
      .catch((err) => console.warn('[TeacherHome] 班级信息获取失败:', err.message))
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    logout()
    reset(ROUTES.login)
  }

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar title="SpeakWise 教师端" subtitle="班级管理" onBack={null} />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          <UserBar onLogout={handleLogout} />

          <View
            style={{
              background: 'linear-gradient(135deg, #7B4FA3, #9B59B6)',
              borderRadius: 18,
              padding: '24px 28px',
              marginBottom: 20
            }}
          >
            <Text style={{ fontSize: 12, opacity: 0.85, display: 'block', marginBottom: 10 }}>
              我的班级 · 班级码
            </Text>
            <Text
              style={{
                fontSize: 29,
                fontWeight: 800,
                letterSpacing: 8,
                textAlign: 'center',
                display: 'block',
                color: '#fff',
                margin: '4px 0 12px'
              }}
            >
              {classInfo?.code || '———'}
            </Text>
            <Text style={{ fontSize: 12, opacity: 0.85, textAlign: 'center', display: 'block', color: '#fff' }}>
              学生注册时输入此码即可加入班级 · 当前 {classInfo?.members?.length ?? 0} 名学生
            </Text>
          </View>

          {/* 教师面板本轮未迁移（教师侧不使用语音，不阻塞语音链路验证）*/}
          {FEATURES.teacher ? (
            <MenuItem
              item={{
                id: 'teacher',
                title: '学情概览',
                titleEn: 'Class Dashboard',
                icon: '📊',
                color: '#9B59B6',
                bg: '#F5F0FA',
                desc: '班级练习数据、问题诊断与教学建议'
              }}
              onClick={() => go(ROUTES.teacher)}
              hovered={hovered}
              onHover={setHovered}
            />
          ) : (
            <View
              style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px dashed #e0dcd0',
                padding: '20px 22px'
              }}
            >
              <Text style={{ fontSize: 12, color: '#aaa' }}>
                学情概览面板正在迁移中，本版本暂未开放。班级码与成员管理不受影响。
              </Text>
            </View>
          )}

          <View onClick={onOpenAbout} className="footer-link" style={{ marginTop: 32 }}>
            <Text style={{ fontSize: 12, color: '#aaa' }}>关于 SpeakWise SRTP 项目</Text>
          </View>
          <Text style={{ textAlign: 'center', display: 'block', marginTop: 8, fontSize: 12, color: '#aaa' }}>
            受国家级/江苏省大学生创新训练计划支持
          </Text>
        </View>
      </PageWrap>
    </View>
  )
}

// ── 学生/游客主页 ──
function StudentHome({ onOpenAbout }) {
  const [hovered, setHovered] = useState(null)
  const { hsk: hskLevel, setHsk: onChangeHSK } = useApp()
  const { user, guest, logout } = useAuth()

  const handleLogout = () => {
    logout()
    reset(ROUTES.login)
  }

  // ── 我的任务：教师发布的练习任务（仅登录学生）──
  const [myTasks, setMyTasks] = useState(null)
  useEffect(() => {
    if (!user || user.role !== 'student') return
    let cancelled = false
    taskApi
      .mine()
      .then(({ tasks }) => {
        if (!cancelled) setMyTasks(tasks)
      })
      .catch((err) => {
        console.warn('[MainMenu] 任务获取失败:', err.message)
        if (!cancelled) setMyTasks([])
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <View style={{ background: '#FAFAF7' }}>
      <TopBar title="SpeakWise 主菜单" hskLevel={hskLevel} onChangeHSK={onChangeHSK} onBack={null} />
      <PageWrap>
        <View style={{ padding: '40px 0' }}>
          <UserBar onLogout={handleLogout} />

          {/* ── 我的任务：任务进度卡 ── */}
          {user && user.role === 'student' && myTasks && myTasks.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  background: 'linear-gradient(135deg, #7B4FA3, #9B59B6)',
                  borderRadius: 16,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  🎯 我的任务
                  <Text style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}> 老师发布的练习任务 · 完成自动更新</Text>
                </Text>
                {myTasks.slice(0, 3).map((t) => (
                  <View key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t.title}
                    </Text>
                    <View
                      style={{
                        width: 110,
                        height: 6,
                        background: 'rgba(255,255,255,0.25)',
                        borderRadius: 3,
                        overflow: 'hidden'
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.min((t.count / t.targetCount) * 100, 100)}%`,
                          height: '100%',
                          background: '#fff',
                          borderRadius: 3,
                          transition: 'width 0.4s'
                        }}
                      />
                    </View>
                    <Text style={{ minWidth: 46, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {t.done ? '✅ ' : ''}
                      {t.count}/{t.targetCount}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <MenuItem
              item={{
                id: 'oral',
                title: '口语训练',
                titleEn: 'Speaking',
                icon: '🗣️',
                color: '#4A90D9',
                bg: '#EEF4FB',
                desc: '场景模拟与发音评测'
              }}
              onClick={() => go(ROUTES.oral)}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'written',
                title: '写作辅导',
                titleEn: 'Writing',
                icon: '✍️',
                color: '#E8A838',
                bg: '#FFF8ED',
                desc: 'AI 批改段落与短文'
              }}
              onClick={() => go(ROUTES.written)}
              hovered={hovered}
              onHover={setHovered}
            />
            <MenuItem
              item={{
                id: 'manual',
                title: '学习手册',
                titleEn: 'Study Manual',
                icon: '📖',
                color: '#D4413A',
                bg: '#FDF0EF',
                desc: '核心语法与词汇系统复习'
              }}
              onClick={() => go(ROUTES.manual)}
              hovered={hovered}
              onHover={setHovered}
            />
            {FEATURES.culture && (
              <MenuItem
                item={{
                  id: 'culture',
                  title: '文化文游',
                  titleEn: 'Cultural Game',
                  icon: '📜',
                  color: '#9B59B6',
                  bg: '#F5F0FA',
                  desc: '历史文化互动小说'
                }}
                onClick={() => go(ROUTES.culture)}
                hovered={hovered}
                onHover={setHovered}
              />
            )}
          </View>

          {/* ── 学习档案：明显入口 ── */}
          <View style={{ marginTop: 20 }}>
            <MenuItem
              item={{
                id: 'records',
                title: '我的练习记录',
                titleEn: 'My Records',
                icon: '📒',
                color: '#2DAA6E',
                bg: '#EDFAF3',
                desc: '学习档案 · 练习统计、弱项追踪与个性化推荐'
              }}
              onClick={() => go(ROUTES.records)}
              hovered={hovered}
              onHover={setHovered}
            />
          </View>

          <View onClick={onOpenAbout} className="footer-link">
            <Text style={{ fontSize: 12, color: '#aaa' }}>关于 SpeakWise SRTP 项目</Text>
          </View>
          <Text style={{ textAlign: 'center', display: 'block', marginTop: 8, fontSize: 12, color: '#aaa' }}>
            受国家级/江苏省大学生创新训练计划支持
          </Text>
          <Text
            style={{
              textAlign: 'center',
              display: 'block',
              marginTop: 2,
              fontSize: 11,
              color: '#bbb',
              fontStyle: 'italic'
            }}
          >
            National Undergraduate Training Programs for Innovation
          </Text>
          {guest && FEATURES.teacher && (
            <View onClick={() => go(ROUTES.teacher)} style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: '#bbb' }}>教师支持端 · 学情概览</Text>
            </View>
          )}

          {/* 语音链路诊断入口。默认开着是因为真机排查全靠它 —— 提审前
              把 config.js 的 FEATURES.diag 关掉即可。 */}
          {FEATURES.diag && (
            <View
              onClick={() => go(ROUTES.diag)}
              style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 12, color: '#ccc' }}>语音链路自检</Text>
            </View>
          )}
        </View>
      </PageWrap>
    </View>
  )
}

export default function MainMenu() {
  const [showOnboarding, setShowOnboarding] = useState(() => !storage.getItem(ONBOARDED_KEY))
  const { user } = useAuth()
  const { ready } = useGuard()

  const closeOnboarding = () => setShowOnboarding(false)
  // 与 Web 版一致：清掉标记再打开，这样下次进来还会看到
  const reopenOnboarding = () => {
    storage.removeItem(ONBOARDED_KEY)
    setShowOnboarding(true)
  }

  if (!ready) return <View style={{ background: '#FAFAF7' }} />

  return (
    <>
      {/* 引导页：登录/注册后再展示，游客同样可见。Web 版把它挂在 App 根上，
          小程序这边挂在登录后必经的主菜单上 —— 两条路径（有 HSK / 无 HSK）
          都会落到这里，效果等价。 */}
      {showOnboarding && <Onboarding onComplete={closeOnboarding} />}
      {user?.role === 'teacher' ? (
        <TeacherHome onOpenAbout={reopenOnboarding} />
      ) : (
        <StudentHome onOpenAbout={reopenOnboarding} />
      )}
    </>
  )
}
