import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { TopBar } from '../../components/TopBar'
import { PageWrap } from '../../components/PageWrap'
import { MAX_AUDIO_BASE64, RECORD_FORMAT, RECORD_OPTIONS, API_BASE } from '../../config'
import { isRecording, recorderState, resetRecorder, startRecording, stopRecording } from '../../platform/recorder'
import { readAsArrayBuffer } from '../../platform/file'
import { transcribe } from '../../platform/asr'
import { speak as ttsSpeak, stopSpeaking, getSnapshot } from '../../platform/tts'
import { ROUTES, back } from '../../platform/nav'

// ── 语音链路诊断页 ──
//
// 为什么值得单独做一页：开发者工具**在语音这件事上会骗人** ——
//   · 录音路径形态与真机不同（工具是 http://tmp/…，真机是 wxfile://…）
//   · 经常无视 format 参数，有时直接返回 0 字节文件
//   · 麦克风走的是电脑的，噪声特征和学生手机完全不同
// 一旦真机上「录了没反应」，没有这页就只能靠猜。它把每一步的中间结果直接打出来：
// 录音到底产出了什么格式、多大、多久、授权到哪一层。
//
// 关键判读：文件前 16 字节里
//   FF FB / FF F3 / FF E3  → MPEG 帧同步，是合法 MP3
//   ID3                    → 带 ID3 标签（服务端会剥掉后再送讯飞）
//   ftyp（第 4~8 字节）     → 是 m4a/aac，讯飞不收 —— 把 config.RECORD_FORMAT 切到 'pcm'

const hex = (buf, n = 16) =>
  Array.from(buf.slice(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')

function Row({ k, v, ok }) {
  return (
    <View style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f7f6f1' }}>
      <Text style={{ fontSize: 12, color: '#999', width: 92, flexShrink: 0 }}>{k}</Text>
      <Text style={{ fontSize: 12, color: ok === false ? '#D4413A' : ok === true ? '#2DAA6E' : '#333', flex: 1 }}>
        {v}
      </Text>
    </View>
  )
}

function Card({ title, children }) {
  return (
    <View
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #f0efe8',
        padding: '16px 18px',
        marginBottom: 14
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: 700, color: '#333', display: 'block', marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function Diag() {
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)

  const info = (() => {
    try {
      return Taro.getSystemInfoSync() || {}
    } catch (e) {
      return {}
    }
  })()

  const [authState, setAuthState] = useState(null)
  const push = (line) => setLog((l) => [...l, line])

  const checkAuth = async () => {
    try {
      const s = await Taro.getSetting()
      const scope = s?.authSetting?.['scope.record']
      setAuthState(scope === true ? '已授权' : scope === false ? '已拒绝（需去设置里打开）' : '未询问（首次点录音会弹窗）')
      push(`授权状态：${scope === true ? 'true' : scope === false ? 'false' : 'undefined'}`)
    } catch (e) {
      setAuthState('读取失败：' + (e?.errMsg || e?.message))
    }
  }

  const testRecord = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (!isRecording()) {
        await startRecording()
        setRecording(true)
        push('● 开始录音，说一句话，然后再点一次结束')
      } else {
        const res = await stopRecording()
        setRecording(false)
        push(`✅ 录音结束：${res.format} | ${res.fileSize} bytes | ${res.duration}ms | ${res.base64.length} base64 字符`)

        // 文件头是判断「到底录成了什么」的唯一可靠依据
        try {
          const ab = await readAsArrayBuffer(res.tempFilePath)
          const bytes = new Uint8Array(ab)
          push(`   前 16 字节：${hex(bytes)}`)
          const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
          const isMpeg = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
          const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49
          const isM4a = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
          push(
            isMpeg
              ? '   → 判读：MPEG 帧同步，是合法 MP3 ✓'
              : isId3
                ? '   → 判读：带 ID3 标签的 MP3（服务端会剥头）✓'
                : isRiff
                  ? '   → 判读：RIFF/WAV，命中服务端转码分支'
                  : isM4a
                    ? '   → 判读：m4a/aac，讯飞不收 ✗ 请把 config.RECORD_FORMAT 改成 pcm'
                    : '   → 判读：无法识别的格式，录音可能失败了'
          )
        } catch (e) {
          push(`   读文件失败：${e.message}`)
        }

        if (res.base64.length > MAX_AUDIO_BASE64) {
          push('   ⚠️ 超过客户端 4MB 上限，网关会先于服务端拒绝')
        }
      }
    } catch (e) {
      setRecording(false)
      push(`❌ 录音失败：${e.code || ''} ${e.message}`)
    }
    setBusy(false)
  }

  const testTts = async () => {
    if (busy) return
    setBusy(true)
    push('🔊 正在请求 /api/tts…')
    try {
      await ttsSpeak('你好，很高兴认识你。', false)
      push('✅ 合成并开始播放')
    } catch (e) {
      push(`❌ TTS 失败：${e.message}`)
    }
    setBusy(false)
  }

  const testAsr = async () => {
    if (busy) return
    setBusy(true)
    push('🎙️ 先录一段，停止后会自动送去识别')
    try {
      if (!isRecording()) {
        await startRecording()
        setRecording(true)
        setBusy(false)
        return
      }
      const { base64, duration, fileSize } = await stopRecording()
      setRecording(false)
      push(`✅ 录了 ${duration}ms / ${fileSize} bytes，正在识别…`)
      const text = await transcribe(base64)
      push(text ? `✅ 识别结果：${text}` : '⚠️ 识别返回空 —— 讯飞没听清时不报错，就是空')
    } catch (e) {
      setRecording(false)
      push(`❌ ASR 失败：${e.code || ''} ${e.message}`)
    }
    setBusy(false)
  }

  const cancel = () => {
    resetRecorder()
    stopSpeaking()
    setRecording(false)
    push('已取消')
  }

  // 状态机自检：卡住的表现是「点麦克风一直说正在录音中，而且退页面也没用」。
  // 这里把内部阶段直接打出来，配合「强制复位」可以当场解开。
  const checkState = () => {
    const s = recorderState()
    const zh = { idle: '空闲', starting: '启动中', recording: '录音中', stopping: '结束中' }
    push(
      `录音状态机：${s.phase}（${zh[s.phase] || '?'}）` +
        ` · 已持续 ${Math.round((Date.now() - s.since) / 1000)}s` +
        (s.stuck ? ' · ⚠️ 已判定卡死' : '')
    )
  }

  const forceReset = () => {
    resetRecorder()
    setRecording(false)
    push('✅ 已强制复位录音状态机（再点「录音测试」应该能正常开始）')
  }

  return (
    <View style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      <TopBar title="语音链路诊断" subtitle="Voice Diagnostics" onBack={() => back(ROUTES.main)} />
      <PageWrap>
        <View style={{ padding: '18px 0 60px' }}>
          <Card title="运行环境">
            <Row k="基础库" v={info.SDKVersion || '未知'} />
            <Row k="平台" v={`${info.platform || '?'} / ${info.system || '?'}`} />
            <Row k="微信版本" v={info.version || '?'} />
            <Row k="麦克风授权" v={authState || '点下面「检查授权」'} ok={authState === '已授权' ? true : undefined} />
            <Row k="API_BASE" v={API_BASE} />
          </Card>

          <Card title="录音配置">
            <Row k="format" v={RECORD_FORMAT} />
            <Row
              k="参数"
              v={`${RECORD_OPTIONS.sampleRate}Hz / ${RECORD_OPTIONS.numberOfChannels}声道 / ${RECORD_OPTIONS.encodeBitRate}bps / 上限${RECORD_OPTIONS.duration}ms`}
            />
            <Row k="客户端上限" v={`${(MAX_AUDIO_BASE64 / 1024 / 1024).toFixed(1)}MB base64`} />
          </Card>

          <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            {[
              { label: '检查授权', fn: checkAuth },
              { label: recording ? '停止录音' : '录音测试', fn: testRecord },
              { label: 'TTS 测试', fn: testTts },
              { label: recording ? '停止并识别' : 'ASR 测试', fn: testAsr },
              { label: '录音状态', fn: checkState },
              { label: '强制复位', fn: forceReset },
              { label: '取消', fn: cancel }
            ].map((b) => (
              <View
                key={b.label}
                onClick={b.fn}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  background: busy ? '#e8e6de' : '#4A90D9'
                }}
              >
                <Text style={{ color: busy ? '#aaa' : '#fff', fontSize: 14, fontWeight: 600 }}>
                  {b.label}
                </Text>
              </View>
            ))}
          </View>

          <Card title="输出">
            {log.length === 0 ? (
              <Text style={{ fontSize: 12, color: '#bbb' }}>点上面的按钮开始。</Text>
            ) : (
              <ScrollView scrollY style={{ maxHeight: 420 }}>
                {log.map((l, i) => (
                  <Text
                    key={i}
                    style={{
                      fontSize: 12,
                      color: '#444',
                      display: 'block',
                      lineHeight: 1.7,
                      marginBottom: 4,
                      wordBreak: 'break-all'
                    }}
                  >
                    {l}
                  </Text>
                ))}
              </ScrollView>
            )}
          </Card>

          <Text style={{ fontSize: 12, color: '#bbb', display: 'block', lineHeight: 1.8 }}>
            提示：这段代码在开发者工具里能跑到「合成并开始播放」，但工具上经常无视 format
            参数、且录音路径与真机不同。**语音链路的结论必须以真机为准**，这页在真机上才有意义。
          </Text>
        </View>
      </PageWrap>
    </View>
  )
}
