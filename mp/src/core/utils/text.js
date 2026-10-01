// 纯文本处理。从 Web 版 src/utils/helpers.jsx 拆出来 —— 那个文件混了 JSX，
// 而 TTS 清洗这条路径需要在小程序里被平台层调用，不能拖一个 JSX 依赖进去。
//
// helpers.jsx 里另外两个函数（renderExampleText / renderChatBubble）是渲染用的，
// 已改写成 components/ChatText.jsx 里的 Taro 组件。

/** 去掉 markdown 强调与标题标记 */
export function clean(t) {
  return String(t || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#{1,6}\s/gm, '')
    .replace(/__/g, '')
    .replace(/~~/g, '')
}

// 从 Web 版 src/hooks/useSpeech.js:31 原样提取。
// 客户端用它算 TTS 缓存键、服务端也用它做二次兜底，两边必须是同一个实现，
// 否则同一个句子会因为清洗结果不同而缓存出两份音频。
//
// ⚠️ 这条正则用了 `u` 标志和 `\u{...}` 转义。构建后请在 dist 里确认 `u` 标志还在
// —— 被降级掉的话 `\u{1F300}` 会退化成「字面量 u 后跟 {1F300}」，正则静默失效。
export function cleanForTTS(t) {
  return clean(t)
    .replace(/\(.*?\)/g, '')
    .replace(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu,
      ''
    )
}

// ── 结构化解析（纯函数，渲染在 components/ChatText.jsx）──

/** 解析 "汉字(pinyin) English" 这种紧凑写法 */
export function parseExampleText(text) {
  const src = String(text || '')
  const hzMatch = src.match(/^(.*?)\(/)
  const pyMatch = src.match(/\((.*?)\)/)
  const enMatch = src.match(/\)\s*(.*)$/)
  return {
    hz: hzMatch ? hzMatch[1].trim() : src,
    py: pyMatch ? pyMatch[1].trim() : '',
    en: enMatch ? enMatch[1].trim() : ''
  }
}

/**
 * 解析 AI 回复里的 "汉字: / 拼音: / 英文:" 三行结构。
 * 返回 { hz, py, en, ttsText } —— ttsText 是拿去合成语音的文本。
 */
export function parseChatBubble(text) {
  const lines = String(text || '').split('\n')
  let hz = ''
  let py = ''
  let en = ''

  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith('汉字:') || t.startsWith('汉字：')) hz = t.substring(3).trim()
    else if (t.startsWith('拼音:') || t.startsWith('拼音：')) py = t.substring(3).trim()
    else if (t.startsWith('英文:') || t.startsWith('英文：')) en = t.substring(3).trim()
  }

  if (!hz && !py && !en) {
    hz = clean(text)
      .replace(/\(.*?\)/g, '')
      .replace(/[a-zA-Z].*$/, '')
  }

  return { hz, py, en, ttsText: hz }
}

/**
 * 剥掉标点与空白，用于跟读比对。
 *
 * 讯飞 IAT 开了 ptt 之后会返回带标点的文本（"你好吗？"），而题库里的参考文本
 * 也带标点、学生的转写却可能不带 —— 不归一化的话每题都会判成不一致。
 */
export function normalizeForCompare(t) {
  return String(t || '')
    .replace(/[\s　]/g, '')
    .replace(/[，。！？、；：""''《》（）()\[\]{}〈〉·—…～,.!?;:'"[\]<>~-]/g, '')
    .toLowerCase()
}
