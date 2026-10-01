import { View, Text } from '@tarojs/components'
import { parseChatBubble } from '../core/utils/text'
import { ChatBubbleText } from './ChatText'

// ── 对话气泡 ──
// 从 ChatView 内联的 JSX 抽出，使实时对话页与回看页共用同一份外观实现。
//
// ⚠️ 不要在本组件内部调用 useSpeech()。
//    Web 版的理由是「`window.speechSynthesis` 是全局单例」；小程序里引擎换成了
//    InnerAudioContext，但约束**依然成立**，只是理由变成了「同一时刻只能播一条音频」。
//    逐气泡各自持有 speaking 的话，点第 7 条播放时所有气泡的按钮都会变成 Stop。
//    由父组件调用一次，把 speaking / onSpeak / onStopSpeak 传下来。
export function ChatBubble({
  sender,
  content,
  kind,
  mode = 'HPE',
  color,
  bg,
  icon,
  showVoice = false,
  speaking = false,
  onSpeak,
  onStopSpeak,
  time
}) {
  // 截断留痕：不当作一条消息渲染，用分隔条表示
  if (kind === 'truncated') {
    return (
      <View style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
        <View style={{ flex: 1, height: 1, background: '#ecebe4' }} />
        <Text style={{ flexShrink: 0, color: '#bbb', fontSize: 11 }}>{content}</Text>
        <View style={{ flex: 1, height: 1, background: '#ecebe4' }} />
      </View>
    )
  }

  const isUser = sender === 'student'
  const parsed = isUser ? { ttsText: content } : parseChatBubble(content)

  return (
    <View
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 14,
        alignItems: 'flex-end',
        gap: 8,
        animation: 'su 0.3s both'
      }}
    >
      {!isUser && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: bg || '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Text style={{ fontSize: 15 }}>{icon}</Text>
        </View>
      )}

      <View style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <View
          style={{
            padding: '12px 16px',
            background: isUser ? color || '#4A90D9' : '#fff',
            color: isUser ? '#fff' : '#1a1a1a',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            fontSize: 14,
            lineHeight: 1.7,
            boxShadow: isUser ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            border: isUser ? 'none' : '1px solid #f0efe8'
          }}
        >
          {isUser ? (
            <Text style={{ fontSize: 14, lineHeight: 1.7, color: '#fff' }}>{content}</Text>
          ) : (
            <ChatBubbleText text={content} mode={mode} themeColor={color} />
          )}
        </View>

        <View
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            marginLeft: isUser ? 0 : 4
          }}
        >
          {time ? <Text style={{ fontSize: 11, color: '#c4c2ba' }}>{time}</Text> : null}

          {!isUser && showVoice && (
            <>
              <View
                onClick={() => (speaking ? onStopSpeak?.() : onSpeak?.(parsed.ttsText))}
                style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.6 }}
              >
                {/* Web 版这里是内联 svg 喇叭图标，小程序渲染不了 —— 用字形代替 */}
                <Text style={{ fontSize: 12, color: speaking ? color || '#E8A838' : '#888' }}>
                  {speaking ? '⏹' : '🔊'}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>{speaking ? 'Stop' : 'Play'}</Text>
              </View>
              <View onClick={() => onSpeak?.(parsed.ttsText, true)} style={{ padding: '2px 8px' }}>
                <Text style={{ fontSize: 11, color: '#666', fontWeight: 600, opacity: 0.6 }}>
                  慢速
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  )
}
