import { useState, useRef, useCallback } from 'react'
import { getToken, recordApi } from '../core/utils/api'

// ── 按需拉取单条记录的完整对话 ──
// 列表接口刻意不返回 messages（500 行 × 一条对话 = 10MB 响应），
// 所以登录用户点开某条记录时才发 GET /records/:id。
// 游客的本地记录自带 messages 数组，不走网络。
//
// 结果按 id 缓存，反复开合不重复请求。
export function useTranscriptDetail() {
  const cacheRef = useRef(new Map()) // id -> messages
  const seqRef = useRef(0) // 竞态守卫：快速点开 A 再点 B，A 的响应不能覆盖 B
  const [modal, setModal] = useState(null) // { record, messages, loading, error }

  const open = useCallback(async (record) => {
    const local = record.messages || cacheRef.current.get(record.id)
    if (local) {
      setModal({ record, messages: local, loading: false, error: null })
      return
    }

    // 无 token 还去请求云端会拿到 401，而 apiFetch 会顺带把用户踢到登录页
    if (!getToken()) {
      setModal({ record, messages: [], loading: false, error: null })
      return
    }

    const my = ++seqRef.current
    setModal({ record, messages: null, loading: true, error: null })
    try {
      const { record: detail } = await recordApi.detail(record.id)
      if (seqRef.current !== my) return
      const messages = detail.messages || []
      cacheRef.current.set(record.id, messages)
      setModal({ record: { ...record, ...detail }, messages, loading: false, error: null })
    } catch (e) {
      if (seqRef.current !== my) return
      setModal({
        record,
        messages: null,
        loading: false,
        // 演示数据（MOCK_RECORDS）的 id 不在库里，必然 404 —— 给一句人话
        error: /404|不存在/.test(e.message) ? '演示数据没有对话内容' : e.message
      })
    }
  }, [])

  const close = useCallback(() => {
    seqRef.current++
    setModal(null)
  }, [])

  const retry = useCallback(() => {
    if (modal?.record) open(modal.record)
  }, [modal, open])

  /** 已拉取过的对话（供导出复用，避免把看过的记录再拉一遍） */
  const getCached = useCallback((id) => cacheRef.current.get(id) || null, [])

  return { modal, open, close, retry, getCached }
}
