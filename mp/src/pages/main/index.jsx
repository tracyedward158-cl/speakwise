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

// ── 我的任务卡片用的小工具 ──

// 任务模块 → 对应练习入口，学生点「去练习」直接跳到那个模块。
// 文化文游没有条目：小程序端尚未迁移该模块（FEATURES.culture = false），按钮不显示。
const TASK_MODULE_ENTRY = {
  生活情境: { path: ROUTES.scenes },
  自由对话: { path: ROUTES.chat, params: { free: 1 } },
  发音测评: { path: ROUTES.pronunciation },
  造句练习: { path: ROUTES.drill, params: { type: 'sentence', section: 'written' } },
  写作辅导: { path: ROUTES.written }
}

// 距截止天数 + 绝对日期。剩余不足 24 小时按“今天截止”显示 ——
// 学生端 /mine 只返回未过期任务，纯按 ceil 算天数的话这一档永远不会出现。
function taskDeadline(endAt) {
  const end = new Date(endAt)
  if (!endAt || Number.isNaN(end.getTime())) return null
  const msLeft = end.getTime() - Date.now()
  const date = `${end.getMonth() + 1}月${end.getDate()}日`
  if (msLeft <= 0) return { daysLeft: 0, label: `已截止（${date}）` }
  const daysLeft = Math.max(1, Math.ceil(msLeft / 86400000))
  return {
    daysLeft,
    label: msLeft < 86400000 ? `今天截止（${date}）` : `剩 ${daysLeft} 天 · ${date}截止`
  }
}

// 学生主页的「我的任务」卡。纯展示：任务由父组件取好后传进来。
export function MyTasksCard({ tasks, onGo }) {
  const [showAll, setShowAll] = useState(false)
  if (!tasks || tasks.length === 0) return null

  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{
          background: 'linear-gradient(135deg, #7B4FA3, #9B59B6)',
          borderRadius: 16,
          padding: '16px 20px'
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#fff', display: 'block', marginBottom: 10 }}>
          🎯 我的任务（{tasks.length}）
          <Text style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>
            {' '}
            老师发布的练习任务 · 完成自动更新
          </Text>
        </Text>
        {(showAll ? tasks : tasks.slice(0, 3)).map((t, i) => {
          const dl = taskDeadline(t.endAt)
          const entry = TASK_MODULE_ENTRY[t.module]
          const pct = Math.min(100, Math.round((t.count / Math.max(t.targetCount, 1)) * 100))
          const urgent = !t.done && dl && dl.daysLeft <= 1
          return (
            <View
              key={t.id}
              style={{
                paddingTop: i === 0 ? 0 : 12,
                marginTop: i === 0 ? 0 : 12,
                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.22)'
              }}
            >
              <View style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
                  {t.title}
                </Text>
                {entry && (
                  <View
                    onClick={() => onGo(entry)}
                    style={{
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.55)',
                      background: 'rgba(255,255,255,0.14)',
                      borderRadius: 12,
                      padding: '4px 10px'
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap' }}>去练习 →</Text>
                  </View>
                )}
              </View>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#fff',
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: 8,
                    padding: '2px 8px'
                  }}
                >
                  {t.module}
                  {t.scenario ? ` · ${t.scenario}` : ''}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: '#fff',
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: 8,
                    padding: '2px 8px'
                  }}
                >
                  目标 {t.targetCount} 次
                </Text>
                {dl && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: '#fff',
                      borderRadius: 8,
                      padding: '2px 8px',
                      fontWeight: urgent ? 700 : 400,
                      background: urgent ? 'rgba(255,214,102,0.3)' : 'rgba(255,255,255,0.18)'
                    }}
                  >
                    {dl.label}
                  </Text>
                )}
              </View>
              <View style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <View
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'rgba(255,255,255,0.25)',
                    borderRadius: 3,
                    overflow: 'hidden'
                  }}
                >
                  <View
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: '#fff',
                      borderRadius: 3,
                      transition: 'width 0.4s'
                    }}
                  />
                </View>
                <Text style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                  {t.done ? '✅ ' : ''}
                  {t.count}/{t.targetCount} 次
                </Text>
              </View>
            </View>
          )
        })}
        {tasks.length > 3 && (
          <View
            onClick={() => setShowAll((v) => !v)}
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.22)'
            }}
          >
            <Text style={{ fontSize: 11, color: '#fff', opacity: 0.9, textAlign: 'center', display: 'block' }}>
              {showAll ? '收起任务 ▲' : `展开全部 ${tasks.length} 个任务 ▼`}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

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
          {user && user.role === 'student' && (
            <MyTasksCard tasks={myTasks} onGo={(entry) => go(entry.path, entry.params)} />
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
