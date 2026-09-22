import { View, Text } from '@tarojs/components'
import { useSpeech } from '../hooks/useSpeech'
import { ChatBubble } from './ChatBubble'
import { moduleMeta } from '../core/data/moduleMeta'
import { formatTime } from '../core/utils/transcript'

// ── 对话回看 ──
// 整段对话的消息列表 + 加载/错误/空三态。
// useSpeech 在本组件里只调用一次（整个对话共用一个 TTS 状态），
// 见 ChatBubble 顶部关于「不要逐气泡调 useSpeech」的说明。

// 回看固定用全显模式，不用 useApp().viewMode ——
// 教师若选了「纯汉模式」，历史记录里的拼音/英文会被静默裁掉，那是信息损失。
const VIEW_MODE = 'HPE'

export function ChatTranscript({ messages, loading, error, onRetry, moduleName }) {
  const { speaking, speak, stopSpeaking } = useSpeech()
  const meta = moduleMeta(moduleName)

  if (loading) {
    return (
      <View style={{ padding: '40px 0', textAlign: 'center' }}>
        <Text style={{ color: '#bbb', fontSize: 13 }}>正在加载对话…</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ padding: '40px 0', textAlign: 'center' }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#D4413A', fontSize: 13 }}>{error}</Text>
        </View>
        {onRetry && (
          <View
            onClick={onRetry}
            style={{
              display: 'inline-block',
              border: '1px solid #e0dcd0',
              borderRadius: 14,
              padding: '6px 16px'
            }}
          >
            <Text style={{ fontSize: 12, color: '#888' }}>重试</Text>
          </View>
        )}
      </View>
    )
  }

  if (!messages || messages.length === 0) {
    return (
      <View style={{ padding: '40px 0', textAlign: 'center' }}>
        <Text style={{ color: '#bbb', fontSize: 13 }}>这条记录没有对话内容</Text>
      </View>
    )
  }

  return (
    <View>
      {messages.map((m, i) => (
        <ChatBubble
          key={i}
          sender={m.sender}
          content={m.content}
          kind={m.kind}
          mode={VIEW_MODE}
          color={meta.color}
          bg={meta.bg}
          icon={meta.icon}
          showVoice={m.sender === 'ai'}
          speaking={speaking}
          onSpeak={speak}
          onStopSpeak={stopSpeaking}
          time={formatTime(m.at)}
        />
      ))}
    </View>
  )
}
