import { View, Text } from '@tarojs/components'
import { parseChatBubble, parseExampleText } from '../core/utils/text'

// Web 版 src/utils/helpers.jsx 里两个返回 JSX 的函数的组件化版本。
// 原样搬过来是做不到的 —— 那个文件返回的是 <div>/<span>，小程序里没有这些标签。

/** 解析 "汉字(pinyin) English" 的紧凑写法 */
export function ExampleText({ text, mode }) {
  const { hz, py, en } = parseExampleText(text)
  return (
    <View style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text style={{ fontSize: 16, color: '#1a1a1a' }}>{hz}</Text>
      {(mode === 'HPE' || mode === 'HP') && py && (
        <Text style={{ fontSize: 14, color: '#888' }}>{py}</Text>
      )}
      {(mode === 'HPE' || mode === 'HE') && en && (
        <Text style={{ fontSize: 13, color: '#aaa' }}>{en}</Text>
      )}
    </View>
  )
}

/** 解析 AI 回复的 "汉字: / 拼音: / 英文:" 三行结构 */
export function ChatBubbleText({ text, mode, themeColor }) {
  const { hz, py, en } = parseChatBubble(text)
  return (
    <View style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hz && <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#1a1a1a' }}>{hz}</Text>}
      {(mode === 'HPE' || mode === 'HP') && py && (
        <Text style={{ fontSize: 14, color: themeColor || '#E8A838' }}>{py}</Text>
      )}
      {(mode === 'HPE' || mode === 'HE') && en && (
        <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>{en}</Text>
      )}
    </View>
  )
}

export { parseChatBubble, parseExampleText }
