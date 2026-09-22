import { useEffect, useRef, useState } from 'react'
import { View, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'

// 能力雷达图。
//
// Web 版是手写内联 <svg>，小程序**不支持内联 svg 元素**，所以渲染层整体换成
// <canvas type="2d">。但极坐标那套数学（pt / poly / 角度起点）一行没改 ——
// 那是纯算术，与渲染无关，重写的只是「怎么把点画出来」。
//
// 另外两处 Web 有、小程序没有的东西：
//   · CSS transition 做入场动画 → 换成 requestAnimationFrame 复刻同一条缓动曲线
//   · `fill={color}26` 这种 8 位 hex 带 alpha → 换成 rgba()，各版本基础库对
//     #RRGGBBAA 的支持不一致

const GRID = '#ECEAE2'
const LABEL = '#555'
const EMPTY = '#ccc'

// cubic-bezier(0.22, 1, 0.36, 1) 是个很强的 ease-out（接近五次方缓出）。
// canvas 没有 CSS 过渡，这里手工逼近。
const easeOut = (t) => 1 - Math.pow(1 - t, 5)

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function AbilityRadar({ data, size = 300, color = '#D4413A' }) {
  const canvasId = useRef(`radar-${Math.random().toString(36).slice(2, 9)}`).current
  const [ready, setReady] = useState(false)

  const n = data.length
  const cx = size / 2
  const cy = size / 2 + 6 // 底部标签占两行，整体略下移
  const R = size / 2 - 58 // 预留标签空间
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2 // 从正上方顺时针
  const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]

  useEffect(() => {
    let raf = null
    let cancelled = false

    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node
        if (!node || cancelled) return

        const dpr = (Taro.getSystemInfoSync().pixelRatio || 2)
        node.width = size * dpr
        node.height = size * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        setReady(true)

        const draw = (progress) => {
          ctx.clearRect(0, 0, size, size)
          const scale = 0.15 + 0.85 * progress

          // 网格：4 层同心多边形 + 轴线
          ;[0.25, 0.5, 0.75, 1].forEach((f) => {
            ctx.beginPath()
            for (let i = 0; i < n; i++) {
              const [x, y] = pt(i, R * f)
              i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            }
            ctx.closePath()
            if (f === 1) {
              ctx.fillStyle = '#FAFAF7'
              ctx.fill()
            }
            ctx.strokeStyle = GRID
            ctx.lineWidth = 1
            ctx.stroke()
          })

          for (let i = 0; i < n; i++) {
            const [x, y] = pt(i, R)
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(x, y)
            ctx.strokeStyle = GRID
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // 数据区域：从中心生长
          const valuePts = data.map((d, i) => pt(i, (R * (d.value ?? 0) * scale) / 100))

          ctx.beginPath()
          valuePts.forEach(([x, y], i) => {
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          })
          ctx.closePath()
          // Web 版是 fill={color}26，0x26 = 15%
          ctx.fillStyle = hexToRgba(color, 0.149 * progress)
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.lineJoin = 'round'
          ctx.stroke()

          // 顶点圆点
          valuePts.forEach(([x, y], i) => {
            if (data[i].value == null) return
            ctx.beginPath()
            ctx.arc(x, y, 3.5, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.fill()
          })

          // 维度标签 + 分数
          data.forEach((d, i) => {
            const [x, y] = pt(i, R + 30)
            ctx.textAlign = 'center'
            ctx.font = 'bold 12px sans-serif'
            ctx.fillStyle = LABEL
            ctx.fillText(d.label, x, y - 4)

            ctx.font = 'bold 11px sans-serif'
            ctx.fillStyle = d.value == null ? EMPTY : color
            ctx.fillText(String(d.value ?? '暂无数据'), x, y + 12)
          })
        }

        // 先画一帧静态的：万一 rAF 不可用（部分环境），图至少是完整的
        draw(1)

        const start = Date.now()
        const duration = 800
        const tick = () => {
          if (cancelled) return
          const t = Math.min(1, (Date.now() - start) / duration)
          draw(easeOut(t))
          if (t < 1) raf = node.requestAnimationFrame(tick)
        }
        // 与 Web 版一致：挂载后稍等一拍再开始生长
        setTimeout(() => {
          if (!cancelled) raf = node.requestAnimationFrame(tick)
        }, 60)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, size, color, JSON.stringify(data)])

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Canvas
        type="2d"
        id={canvasId}
        style={{ width: size, height: size, opacity: ready ? 1 : 0, transition: 'opacity 300ms' }}
      />
    </View>
  )
}
