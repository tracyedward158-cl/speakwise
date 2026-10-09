import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioRecorder } from "../utils/audioRecorder.js";
import { transcribeAudio } from "../utils/api.js";
import { getSnapshot, speak as ttsSpeak, stopSpeaking as ttsStop, subscribe } from "../utils/tts.js";
import { showToast } from "../utils/toast.js";

// ── 网页端语音 hook：TTS 与 ASR 都走服务端讯飞 ──
//
// 2026-10 之前是浏览器原生实现：ASR 用 SpeechRecognition（只有 Chrome，识别走
// Google 服务器，国内基本不可用），TTS 用 speechSynthesis（音色随操作系统、
// 慢速会把音高一起变掉）。现在两条链路都换成服务端讯飞 —— 与小程序端同源。
//
// 对外形状与 mp/src/hooks/useSpeech.js 保持一致（那边就是照着这个文件写的），
// 只多一个 transcribing。它与 mp 的一处**刻意不同**：那边上传前就把 listening 置 false，
// 这里让 listening 覆盖「录音中 + 上传识别中」两个阶段 —— ChatView 的取消按钮是
// `showVoice && listening`，上传期间置 false 的话那 1~3 秒就没法反悔了，
// 而 ChatView 的回调是**直接把识别文本发出去**的，必须留出反悔窗口。
//
// 另一个必须接受的形态差异：没有实时中间结果。Chrome 的 SpeechRecognition 会边说
// 边出字，这条链路只能「说完 → 点停止 → 等整段文本」。不是实现没做好。

const ASR_AUTO_STOP_MS = 20000; // 没有浏览器 VAD 的「停顿即结束」，用固定上限兜底（与 mp 一致）
const ASR_MAX_RECORD_MS = 60000; // 硬上限：对齐讯飞 IAT 的单次时长与 mp 的 RECORD_OPTIONS.duration
const MAX_UPLOAD_CHARS = 4 * 1024 * 1024; // base64 体积守卫，对齐 mp 的 MAX_AUDIO_BASE64

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // 当前在播的是不是「慢速」那一档。界面上播放/慢速是两颗按钮，
  // 各自只该在自己那一档在播时显示停止（见 ChatBubble）。
  const [speakingSlow, setSpeakingSlow] = useState(false);

  const cbRef = useRef(null);
  const recorderRef = useRef(null);
  // 会话 token：取消 / 卸载 / 换一轮之后，迟到的 await 靠对象身份比对作废。
  // 这是「取消绝不回调」的全部保证 —— 不依赖平台的 abort 行为。
  const sessionRef = useRef(null);
  const phaseRef = useRef("idle"); // idle | starting | recording | transcribing
  const autoStopRef = useRef(null);
  const stopRef = useRef(null);

  // speaking 的事实来自 utils/tts.js 的模块级单例（同一时刻只有一条音频在响）。
  useEffect(() => {
    const s0 = getSnapshot();
    setSpeaking(s0.speaking);
    setSpeakingSlow(s0.slow);
    return subscribe((s) => {
      setSpeaking(s.speaking);
      setSpeakingSlow(s.slow);
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const finishSession = useCallback(() => {
    sessionRef.current = null;
    cbRef.current = null;
    phaseRef.current = "idle";
    setListening(false);
    setTranscribing(false);
  }, []);

  const startListening = useCallback(async (cb) => {
    // 同步闸：getUserMedia 弹权限那段窗口里连点两下会开两条录音
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "starting";

    const session = {};
    sessionRef.current = session;
    cbRef.current = cb;
    setListening(true);

    // 正在外放的语音会被麦克风一起录进去（跟读场景尤其致命），先掐掉
    ttsStop();

    const recorder = createAudioRecorder({ maxMs: ASR_MAX_RECORD_MS });
    try {
      await recorder.start();
    } catch (e) {
      console.warn("[useSpeech] 打开麦克风失败:", e?.message);
      if (sessionRef.current === session) {
        finishSession();
        showToast("无法访问麦克风，请检查权限设置");
      }
      return;
    }
    // 权限弹窗期间被取消 / 已卸载：流已经开出来了，放掉
    if (sessionRef.current !== session) {
      recorder.stop();
      return;
    }

    recorderRef.current = recorder;
    phaseRef.current = "recording";
    // 20s 自动收尾，模拟浏览器的「停顿即结束」。真正防住「一直录」的是两层：
    // 这条定时器，以及录音器内部的采样上限（后台标签页被节流时定时器不可靠）。
    autoStopRef.current = setTimeout(() => stopRef.current?.(), ASR_AUTO_STOP_MS);
  }, [clearTimers, finishSession]);

  const stopListening = useCallback(async () => {
    if (phaseRef.current === "idle" || phaseRef.current === "transcribing") return;
    const session = sessionRef.current;
    if (!session) return;

    clearTimers();
    const recorder = recorderRef.current;
    recorderRef.current = null;

    // 还没真正开录就停了：没有音频可传，直接收场
    if (!recorder || phaseRef.current === "starting") {
      finishSession();
      return;
    }

    phaseRef.current = "transcribing";
    setTranscribing(true);
    recorder.stop();

    let base64 = "";
    try {
      base64 = recorder.getWavBase64();
    } catch (e) {
      if (sessionRef.current !== session) return;
      finishSession();
      showToast("没录到声音，请再说一次");
      return;
    }
    if (sessionRef.current !== session) return;

    if (base64.length > MAX_UPLOAD_CHARS) {
      finishSession();
      showToast("录音太长了，请分几次说");
      return;
    }

    try {
      const res = await transcribeAudio(base64);
      if (sessionRef.current !== session) return; // 取消 / 卸载 / 已换会话 → 绝不回调
      const text = String(res?.text || "").trim();
      if (!text) {
        // 讯飞没听清时不报错，就是返回空 —— 要说出来，否则用户以为按钮坏了
        showToast("没听清，请再说一次");
        return;
      }
      cbRef.current?.(text);
    } catch (e) {
      if (sessionRef.current !== session) return;
      console.warn("[useSpeech] 识别失败:", e?.message);
      showToast(e?.message ? `识别失败：${e.message}` : "识别失败，请重试");
    } finally {
      if (sessionRef.current === session) finishSession();
    }
  }, [clearTimers, finishSession]);

  // 取消 = 这次说的不要了：停硬件、丢掉音频、不上传、不回调。
  // 从任何相位调用都安全；此后任何迟到的 await 都会在身份检查处终止。
  const cancelListening = useCallback(() => {
    cbRef.current = null; // 双保险：先摘回调，再作废 token
    sessionRef.current = null;
    clearTimers();
    try {
      recorderRef.current?.stop(); // 放掉麦克风（标签页的录音图标要立刻消失）
    } catch (e) {
      /* ignore */
    }
    recorderRef.current = null;
    phaseRef.current = "idle";
    setListening(false);
    setTranscribing(false);
  }, [clearTimers]);

  useEffect(() => {
    stopRef.current = stopListening;
  }, [stopListening]);

  const speak = useCallback((t, slow = false) => {
    ttsSpeak(t, slow).catch((e) => {
      console.warn("[useSpeech] 播放失败:", e?.message);
      showToast(e?.message || "播放失败");
    });
  }, []);

  const stopSpeaking = useCallback(() => ttsStop(), []);

  // 页面卸载：无条件复位。
  // 这里**不能**写 `if (listening)` 之类的条件 —— 录音与识别分属两个相位，
  // 条件判断一定会漏掉其中一个（mp 那边专门记过这个 bug 的教训）。
  // main.jsx 开着 StrictMode，开发期会 mount → cleanup → mount，
  // 所以清理函数必须是幂等的 no-op 安全。
  useEffect(
    () => () => {
      cancelListening();
      ttsStop();
    },
    [cancelListening]
  );

  return { listening, transcribing, speaking, speakingSlow, startListening, stopListening, cancelListening, speak, stopSpeaking };
}
