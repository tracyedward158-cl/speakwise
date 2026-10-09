import { transcribeAudio } from '../core/utils/api'
import { abortRecording, isRecording, startRecording, stopRecording } from './recorder'
import { stopSpeaking } from './tts'

// 语音识别（STT）：录音 → 上行 → 服务端转发讯飞 IAT → 返回整段文本。
// 当初只有小程序走这条（Web 版那时靠浏览器 SpeechRecognition、边说边出字）；
// 2026-10 起网页端也切了过来，两端行为一致。
//
// 这条链路的固有形态：**没有实时中间结果**。识别期间只能显示状态，拿不到逐字上屏。
// 也因此必须由用户显式停止（或等 hook 的自动收尾），没有浏览器 VAD 那套停顿检测。

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
