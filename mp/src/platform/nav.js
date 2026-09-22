import Taro from '@tarojs/taro'

// 路由表。Web 版 24 条路由收敛到这里。
//
// 路径参数全部改成查询串：小程序没有路径参数这回事，原来的
// /oral/scene/:sceneId 现在是 ROUTES.chat + { sceneId }。
export const ROUTES = {
  launch: '/pages/launch/index',
  login: '/pages/login/index',
  hsk: '/pages/hsk/index',
  main: '/pages/main/index',
  oral: '/pages/oral/index',
  scenes: '/pages/scenes/index',
  chat: '/pages/chat/index',
  pronunciation: '/pages/pronunciation/index',
  pronDaily: '/pages/pron-daily/index',
  pronBank: '/pages/pron-bank/index',
  pronTest: '/pages/pron-test/index',
  drill: '/pages/drill/index',
  written: '/pages/written/index',
  records: '/pages/records/index',
  userCenter: '/pages/user-center/index',
  manual: '/pages/manual/index',
  diag: '/pages/diag/index'
}

export function buildUrl(path, params) {
  if (!params) return path
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/** 前进。压栈，注意小程序栈深上限 10 —— 返回一律用 back() 不会加深。 */
export function go(path, params) {
  return Taro.navigateTo({ url: buildUrl(path, params) })
}

/** 替换当前页。用于重定向（登录成功、守卫跳转），不留返回路径。 */
export function replace(path, params) {
  return Taro.redirectTo({ url: buildUrl(path, params) })
}

/** 清空整个栈再跳。用于登出、401。 */
export function reset(path, params) {
  return Taro.reLaunch({ url: buildUrl(path, params) })
}

const routeOf = (url) => String(url).split('?')[0].replace(/^\//, '')

/**
 * 返回。
 *
 * Web 版**从不依赖历史栈** —— 每个页面把自己的父页面写死
 * （ChatView 按 sceneId/mode 分三种，DrillView 按 section 分三种）。这个设计
 * 在这里必须保住，因为小程序栈深只有 10 层，而 navigateBack(delta) 算上
 * ping-pong 很容易算错。
 *
 * 于是：目标正好是上一页时走 navigateBack（保留 iOS 侧滑返回的手感），
 * 否则 redirectTo 到写死的目标（不加深栈）。
 */
export function back(target) {
  const want = target || ROUTES.main
  const pages = Taro.getCurrentPages()
  const prev = pages.length > 1 ? pages[pages.length - 2] : null
  if (prev && routeOf(prev.route) === routeOf(want)) {
    return Taro.navigateBack({ delta: 1 })
  }
  return Taro.redirectTo({ url: want })
}

// ── 查询参数 ──
// Taro.useRouter().params 同时混了路径段和查询串，且**返回新对象**。
// DrillView 原来用 `searchParams.toString()` 当 useMemo 的依赖来防止题目重排，
// 直接换成 params 对象会导致每次渲染都变了引用、把重排逻辑重新触发一遍。
// 所以给一个把指定字段拼成稳定字符串的工具，把那条约等于「字符串不变」的契约平移过来。
export function stableParamsKey(params, keys) {
  return keys.map((k) => `${k}=${params?.[k] ?? ''}`).join('&')
}
