import { useLaunch, useDidHide, useDidShow } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import './app.scss'
import { AuthProvider } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { initTtsCache, stopSpeaking } from './platform/tts'
import { resetRecorder } from './platform/recorder'

// App 级副作用。三件必须在启动时做的事，放在这里是刻意的 ——
// 放到页面的 onLoad 里可能已经太晚（比如音频选项必须在任何播放之前设好）。

function App({ children }) {
  useLaunch(() => {
    // ⚠️ iOS 的物理静音开关。默认 obeyMuteSwitch = true，意味着**静音键拨下去时
    // 播放会完全没声音、而且不触发任何错误事件** —— 一个在开发者工具里复现不了、
    // 只在真机上出现的「播放没反应」。语言学习应用的用户是主动想听声音的，
    // 这里明确关掉；配合应用内的静音开关即可。
    //
    // 注意：不要传 useWebAudioImplement，官方标注它与 setInnerAudioOption 冲突，
    // 传了会让这里的设置不生效。
    Taro.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: true }).catch((e) => {
      console.warn('[app] setInnerAudioOption 失败:', e?.errMsg || e?.message)
    })

    // 清理 TTS 缓存里的孤儿文件，并做一次容量淘汰。
    // USER_DATA_PATH 全小程序共用 200MB，写爆了会连累其它存储（1300202）。
    initTtsCache().catch((e) => {
      console.warn('[app] TTS 缓存初始化失败:', e?.message)
    })
  })

  // 来电 / 微信语音通话会打断播放，且**不会**触发 onEnded/onStop。
  // 不处理的话 UI 上的「播放中」状态会一直停在那里下不来。
  useDidShow(() => {
    if (typeof Taro.onAudioInterruptionBegin === 'function') {
      Taro.onAudioInterruptionBegin(() => stopSpeaking())
    }
  })

  // 切后台：小程序在后台不能录音，录音会被系统暂停 —— 与其挂在那里等看门狗，
  // 不如直接复位。**不加条件判断**：卡在 'stopping' 这类中间态时，
  // 「有没有在录音」这种判断正好是解不开的那种。
  useDidHide(() => {
    resetRecorder()
    stopSpeaking()
  })

  return (
    <AuthProvider>
      <AppProvider>{children}</AppProvider>
    </AuthProvider>
  )
}

export default App
