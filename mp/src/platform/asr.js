import { transcribeAudio } from '../core/utils/api'
import { abortRecording, isRecording, startRecording, stopRecording } from './recorder'
import { stopSpeaking } from './tts'

// 语音识别（STT）。Web 版靠浏览器 SpeechRecognition，边说边出字；
// 小程序里没有对应物，走「录音 → 上行 → 服务端转发讯飞 IAT → 返回整段文本」。
//
// 产品上必须接受一个差异：**没有实时中间结果**了。识别期间只能显示状态，
// 拿不到逐字上屏 —— 这不是实现没做好，是这条链路的固有形态。
// Web 版的 ChatView 是靠 SpeechRecognition 自己停的，这里必须由用户显式停止。

/** 开始录音。会先过隐私协议与麦克风授权。 */
export async function beginListen() {
  // 正在播放的语音会被麦克风一起录进去 —— 跟读场景下尤其致命，先掐掉
  stopSpeaking()
  await startRecording()
  return true
}

/** 停止录音并转写。返回文本（可能为空串：讯飞没听清时不报错，就是空） */
export async function endListen() {
  const { base64 } = await stopRecording()
  return transcribe(base64)
}

/** 放弃本次识别（页面卸载、用户取消） */
export function cancelListen() {
  abortRecording()
}

export function isListening() {
  return isRecording()
}

/** 单独的转写入口，诊断页也用它 */
export async function transcribe(base64) {
  const res = await transcribeAudio(base64)
  return (res?.text || '').trim()
}
