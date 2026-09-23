import { View, Text, ScrollView } from '@tarojs/components'
import { ChatTranscript } from './ChatTranscript'
import { moduleMeta } from '../core/data/moduleMeta'
import { formatRecordDate } from '../core/utils/transcript'
import { computeRecordMetrics, LONG_GAP_SEC } from '../core/utils/conversationMetrics'

// ── 完整对话弹窗 ──
// 遮罩模式沿用原设计。整段对话可能几千像素，放进列表行内会让页面高度失控，
// 所以列表里只做摘要预览，完整内容在这里独立滚动。

// ── 过程指标条（认知深度操作化）──
function Chip({ label, value, unit, sub, color, bg }) {
  return (
    <View style={{ background: bg, borderRadius: 12, padding: '8px 14px', minWidth: 86 }}>
      <Text style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.15 }}>
        {value}
        {unit ? <Text style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{unit}</Text> : null}
      </Text>
      {sub ? <Text style={{ fontSize: 10, color: '#bbb', display: 'block', marginTop: 2 }}>{sub}</Text> : null}
    </View>
  )
}

function MetricsStrip({ m }) {
  // 空值渲染成「—」而不是 0：avgGapSec 为 null（一个间隔都测不到）与为 0
  // （学生秒回）是两回事，在单条对话的视图里必须看得出来。
  const dash = '—'
  const pct = m.voiceRatio != null ? Math.round(m.voiceRatio * 100) : null

  // 只在有异常时出现。常驻一行「0 条截断 · 0 次时钟回拨」会训练读者忽略这一行，
  // 而它恰恰是数据可用性的信号。
  const notes = []
  if (m.truncated) notes.push('对话已截断，轮次可能偏低')
  if (m.unknownChannelTurns) notes.push(`${m.unknownChannelTurns} 轮通道未知（未计入语音比例）`)
  if (m.longGapCount) notes.push(`${m.longGapCount} 次长间隔（>${Math.round(LONG_GAP_SEC / 60)} 分钟）`)
  if (m.gapRewindCount) notes.push(`${m.gapRewindCount} 次时钟回拨已丢弃`)

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Chip
          label="对话轮次"
          value={m.turns}
          unit="轮"
          color="#7B4FA3"
          bg="#F5F0FA"
          sub={`共 ${m.messageTotal} 条消息`}
        />
        <Chip
          label="学生平均字数"
          value={m.avgChars}
          unit="字"
          color="#4A90D9"
          bg="#EEF4FB"
          sub={`共 ${m.charsTotal} 字`}
        />
        <Chip
          label="平均回复间隔"
          value={m.avgGapSec ?? dash}
          unit={m.avgGapSec != null ? '秒' : ''}
          color="#2DAA6E"
          bg="#EDFAF3"
          sub={m.medianGapSec != null ? `中位 ${m.medianGapSec} 秒 · ${m.gapCount} 次` : '无可用间隔'}
        />
        <Chip
          label="语音输入占比"
          value={pct ?? dash}
          unit={pct != null ? '%' : ''}
          color="#E8A838"
          bg="#FFF8ED"
          sub={pct != null ? `${m.voiceTurns}/${m.voiceTurns + m.textTurns} 轮` : '通道全未知'}
        />
      </View>
      {notes.length > 0 && (
        <Text style={{ fontSize: 10, color: '#bbb', display: 'block', marginTop: 8, lineHeight: 1.6 }}>
          {notes.join(' · ')}
        </Text>
      )}
    </View>
  )
}

export function TranscriptModal({ record, messages, loading, error, onRetry, onClose, onExport }) {
  if (!record) return null
  const meta = moduleMeta(record.module)

  // ⚠️ 刻意不用 useMemo：本函数第一行就是 `if (!record) return null`，在任何 hook
  //    之前 —— 加 hook 得先把它挪到早返回上面才合法。messages 来自详情接口或缓存，
  //    其余字段来自列表行，所以按 messages 覆盖合并。
  const metrics = !loading && !error && messages ? computeRecordMetrics({ ...record, messages }) : null

  return (
    <View
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'su 0.2s both'
      }}
    >
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FAFAF7',
          borderRadius: 20,
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 标题栏 */}
        <View
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #f0efe8',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: meta.bg,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: 700, color: '#333', display: 'block' }}>
              {record.scenario || record.module}
              {record.nickname ? ` · ${record.nickname}` : ''}
            </Text>
            <Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 2 }}>
              <Text style={{ color: meta.color, fontWeight: 500 }}>{record.module}</Text>
              {' · '}
              {formatRecordDate(record)}
              {record.score > 0 ? ` · ${record.score} 分` : ' · 待评分'}
            </Text>
          </View>

          {onExport && (
            <View
              onClick={onExport}
              style={{
                border: '1px solid #e0dcd0',
                borderRadius: 14,
                padding: '6px 14px',
                flexShrink: 0
              }}
            >
              <Text style={{ fontSize: 12, color: '#888' }}>导出 JSON</Text>
            </View>
          )}

          <View onClick={onClose} style={{ padding: '0 4px', flexShrink: 0 }}>
            <Text style={{ fontSize: 17, color: '#bbb', lineHeight: 1 }}>×</Text>
          </View>
        </View>

        {/* 对话内容 */}
        <ScrollView scrollY style={{ flex: 1, minHeight: 0, padding: '20px 22px' }}>
          {/* 放在滚动区内而不是钉在标题栏：标题栏已有场景/模块/时间/分数三行，
              再塞一行会把对话本身挤掉。指标只是「这段对话有多长」的摘要，
              回看时不需要一直盯着。 */}
          {metrics?.available && <MetricsStrip m={metrics} />}

          <ChatTranscript
            messages={messages}
            loading={loading}
            error={error}
            onRetry={onRetry}
            moduleName={record.module}
          />

          {record.problems?.length > 0 && (
            <View style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #ecebe4' }}>
              <Text style={{ fontSize: 11, color: '#bbb', display: 'block', marginBottom: 6 }}>本次问题</Text>
              <Text style={{ fontSize: 12, color: '#888', lineHeight: 1.7 }}>
                {record.problems.join(' · ')}
              </Text>
            </View>
          )}

          {record.suggestion ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 11, color: '#bbb', display: 'block', marginBottom: 6 }}>教学建议</Text>
              <Text style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>{record.suggestion}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  )
}
