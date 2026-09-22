import Taro from '@tarojs/taro'

// 麦克风权限。小程序上这是**两层**，缺一层都拿不到录音，而且失败方式可能很安静。
//
//   第一层 · 隐私协议（2023-10 起强制）
//     必须在管理后台《小程序用户隐私保护指引》里声明「麦克风」。没声明的话
//     录音 API 会被平台直接禁用 —— 有时不弹窗、有时连 onError 都不给，
//     表现成「按了没反应」。所以每次开录之前先走 requirePrivacyAuthorize。
//     基础库需 ≥ 2.32.3；更低的版本不会拦截，也就不需要这一步。
//
//   第二层 · scope.record 授权
//     首次会弹系统授权框。**一旦被拒绝就再也不会弹了**，之后只能引导用户
//     去 openSetting 手动打开 —— 所以 false 和 undefined 必须分开处理。
//
// 注意 app.config.js 里的 permission.scope.record 只是弹窗上的说明文案，
// 它不等于「已经声明了麦克风」；声明在管理后台做。

function permError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

/** 第一层：隐私协议。已同意 / 基础库不支持都会安静通过。 */
export async function ensurePrivacyAuthorized() {
  if (typeof Taro.requirePrivacyAuthorize !== 'function') return // 基础库 < 2.32.3
  try {
    await Taro.requirePrivacyAuthorize()
  } catch (e) {
    const msg = e?.errMsg || e?.message || ''
    // 基础库在但小程序没配隐私指引，或调用方式不被支持：不该拦着用户，
    // 交给第二层去暴露问题（届时录音会失败并给出更具体的 errMsg）
    if (/not support|不支持|privacy.*not.*(set|config)/i.test(msg)) {
      console.warn('[privacy] requirePrivacyAuthorize 不可用，继续走 scope 授权:', msg)
      return
    }
    throw permError('PRIVACY_DENIED', '需要先同意隐私协议才能使用语音功能')
  }
}

/** 第二层：scope.record。返回 true 表示可录音；不可用时抛带 code 的错误。 */
export async function ensureRecordScope() {
  let setting = null
  try {
    setting = await Taro.getSetting()
  } catch (e) {
    console.warn('[privacy] getSetting 失败:', e?.errMsg || e?.message)
  }

  const cur = setting?.authSetting?.['scope.record']
  if (cur === true) return true

  if (cur === false) {
    // 拒绝过，系统不再弹窗
    throw permError('NO_PERMISSION', '麦克风权限已被拒绝，请在设置里重新开启')
  }

  try {
    await Taro.authorize({ scope: 'scope.record' })
    return true
  } catch (e) {
    throw permError('NO_PERMISSION', '没有麦克风权限，无法录音')
  }
}

/** 两层一起过。录音前调用。 */
export async function ensureMicAccess() {
  await ensurePrivacyAuthorized()
  return ensureRecordScope()
}

/** 引导用户去设置页开权限。用户从设置页回来后需要重新尝试录音。 */
export async function openMicSetting() {
  try {
    const res = await Taro.openSetting()
    return res?.authSetting?.['scope.record'] === true
  } catch (e) {
    console.warn('[privacy] openSetting 失败:', e?.errMsg || e?.message)
    return false
  }
}

/** 给用户看的权限引导 Toast，文案按错误码分流 */
export function micErrorToast(err) {
  const code = err?.code
  if (code === 'NO_PERMISSION') {
    Taro.showModal({
      title: '需要麦克风权限',
      content: '跟读练习需要录音。请在设置里打开「麦克风」后重试。',
      confirmText: '去设置',
      success: (r) => {
        if (r.confirm) openMicSetting()
      }
    })
    return
  }
  if (code === 'PRIVACY_DENIED') {
    Taro.showToast({ title: '请先同意隐私协议', icon: 'none' })
    return
  }
  Taro.showToast({ title: err?.message || '麦克风不可用', icon: 'none' })
}
