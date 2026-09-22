import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { beginListen, cancelListen, endListen, isListening } from '../platform/asr'
import { getSnapshot, speak as ttsSpeak, stopSpeaking as ttsStop, subscribe } from '../platform/tts'
import { micErrorToast } from '../platform/privacy'

// useSpeech —— 对外签名与 Web 版 src/hooks/useSpeech.js **逐字一致**：
//   { listening, speaking, startListening(cb), stopListening(), speak(t, slow), stopSpeaking() }
// 这样四个调用点（ChatView / DrillView / PronunciationDrill / ChatTranscript）才能
// 只换 import、不动逻辑。
//
// ── 一个必须知道的行为差异 ──
//
// Web 版用浏览器 SpeechRecognition，设了 `continuous: false` —— 它会在检测到停顿后
// **自己停止并回调**，所以 ChatView 的麦克风按钮虽然是开关，用户往往不需要按第二下。
//
// 小程序这条链路（录音 → 上传 → 服务端转发讯飞）没有浏览器 VAD，**必须用户显式停止**。
// 为了不让「说完了还在录」一直挂着烧额度，这里加了 ASR_AUTO_STOP_MS 的自动收尾 ——
// 它模拟的就是浏览器那个「停顿即结束」。想彻底交给用户，把常量设为 0。

const ASR_AUTO_STOP_MS = 20000

export function useSpeech() {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const cbRef = useRef(null)
  const autoStopRef = useRef(null)
  // 自动收尾要调「最新的」stopListening。用 ref 转一层，避免把 stopListening
  // 塞进 startListening 的依赖里 —— 那会让 startListening 每次渲染都换引用，
  // 而调用点是把它当稳定回调用的。
  const stopRef = useRef(null)

  // TTS 状态来自 platform/tts 的模块级单例。
  // 之所以不是本地 state：同一时刻只能播一条音频，而这个「谁在播」的事实
  // 属于播放器，不属于任何单个组件实例 —— 与 Web 版把 speechSynthesis 当全局单例同理。
  useEffect(() => {
    setSpeaking(getSnapshot().playing)
    return subscribe((s) => setSpeaking(s.playing))
  }, [])

  const clearAutoStop = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }

  const startListening = useCallback(async (cb) => {
    if (isListening()) return
    cbRef.current = cb
    try {
      await beginListen()
      setListening(true)
      if (ASR_AUTO_STOP_MS > 0) {
        clearAutoStop()
        autoStopRef.current = setTimeout(() => {
          autoStopRef.current = null
          stopRef.current?.()
        }, ASR_AUTO_STOP_MS)
      }
    } catch (e) {
      setListening(false)
      // 权限被拒时给「去设置」的引导，其它错误走 toast
      micErrorToast(e)
    }
  }, [])

  const stopListening = useCallback(async () => {
    clearAutoStop()
    if (!isListening()) {
      setListening(false)
      return
    }
    setListening(false)
    try {
      const text = await endListen()
      if (text) {
        cbRef.current?.(text)
      } else {
        // 讯飞没听清时不报错，就是返回空 —— 要说出来，否则用户以为按钮坏了
        Taro.showToast({ title: '没听清，请再说一次', icon: 'none' })
      }
    } catch (e) {
      if (e?.code === 'ABORTED') return
      if (e?.code === 'TOO_SHORT' || e?.code === 'EMPTY') {
        Taro.showToast({ title: e.message, icon: 'none' })
        return
      }
      console.warn('[useSpeech] 识别失败:', e?.message)
      Taro.showToast({ title: e?.message || '识别失败，请重试', icon: 'none' })
    }
  }, [])

  useEffect(() => {
    stopRef.current = stopListening
  }, [stopListening])

  const speak = useCallback((t, slow = false) => {
    ttsSpeak(t, slow).catch((e) => {
      if (e?.code === 'FILE_MISSING') return // 缓存被回收，下一次会自动重新合成
      console.warn('[useSpeech] 播放失败:', e?.message)
      Taro.showToast({ title: '播放失败', icon: 'none' })
    })
  }, [])

  const stopSpeaking = useCallback(() => ttsStop(), [])

  // 页面卸载：无条件复位录音状态。
  //
  // 这里**不能**写 `if (isListening())` —— isListening() 只看 'recording'/'starting'，
  // 卡在 'stopping' 时它是 false，于是退出页面也解不开，下次进来点麦克风直接
  // 报「正在录音中」。这个条件判断本身就是 bug。
  useEffect(
    () => () => {
      clearAutoStop()
      cancelListen()
      ttsStop()
    },
    []
  )

  return { listening, speaking, startListening, stopListening, speak, stopSpeaking }
}
