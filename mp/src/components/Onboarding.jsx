import { useState } from 'react'
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components'
import { storage } from '../platform/storage'
import onboard1 from '../assets/onboarding/onboard-1.png'
import onboard2 from '../assets/onboarding/onboard-2.png'
import onboard3 from '../assets/onboarding/onboard-3.png'

// 引导页。Web 版用 swiper 这个 npm 库（DOM 轮播），小程序里没有对应物，
// 换成原生的 <Swiper>。三处必须改的地方：
//
//   1. 分页点原来是 `pagination={{ el: '.onboard-dots' }}` —— 一个 DOM 选择器，
//      小程序里不存在。改成自己按 activeIndex 画。
//   2. "下一步"原来是 swiperRef.current.swiper.slideNext() —— 命令式操作库实例。
//      改成受控：把 current 交给 state。
//   3. Web 版把点阵用 `top: 600px` 这种魔法数字绝对定位卡在插图下方，
//      那是靠固定高度撑出来的。这里改成正常文档流排布，少了两个魔法数。
//
// 图片从小程序包内加载（三张共约 290KB）。Web 版那 49MB 的大图是文化文游用的，
// 与这里无关。

const SLIDES = [
  {
    id: 1,
    title: '定制你的专属起点',
    desc: '基于 HSK 3.0 标准精准评估。无论初学还是高阶，都能找到最适合的对话难度。',
    img: onboard1
  },
  {
    id: 2,
    title: '告别开口焦虑',
    desc: '涵盖点餐、面试等真实场景。24小时在线的 AI 语伴，随时随地开启沉浸式口语训练。',
    img: onboard2
  },
  {
    id: 3,
    title: '智能诊断，精准反馈',
    desc: '实时捕获语音偏误，生成多维度报告。学情数据同步教师端，让进步清晰可见。',
    img: onboard3
  }
]

export function Onboarding({ onComplete }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const isLast = activeIndex === SLIDES.length - 1

  const handleAction = () => {
    if (isLast) {
      storage.setItem('speakwise_onboarded', 'true')
      if (onComplete) onComplete()
    } else {
      setActiveIndex((i) => i + 1)
    }
  }

  return (
    <View
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        animation: 'su 0.5s both'
      }}
    >
      <Swiper
        current={activeIndex}
        onChange={(e) => setActiveIndex(e.detail.current)}
        style={{ flex: 1, width: '100%' }}
        indicatorDots={false}
      >
        {SLIDES.map((slide) => (
          <SwiperItem key={slide.id}>
            <View
              style={{
                padding: '44px 28px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%'
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: 240,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <Image src={slide.img} mode="aspectFit" style={{ width: '100%', height: '100%' }} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#1a1a1a',
                  marginBottom: 10,
                  marginTop: 40,
                  textAlign: 'center'
                }}
              >
                {slide.title}
              </Text>
              <Text style={{ fontSize: 14, color: '#888', lineHeight: 1.65, textAlign: 'center', padding: '0 8px' }}>
                {slide.desc}
              </Text>
            </View>
          </SwiperItem>
        ))}
      </Swiper>

      {/* 分页点 */}
      <View style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
        {SLIDES.map((s, i) => (
          <View
            key={s.id}
            onClick={() => setActiveIndex(i)}
            style={{
              height: 8,
              width: i === activeIndex ? 24 : 8,
              background: i === activeIndex ? '#D4413A' : '#e2e8f0',
              borderRadius: i === activeIndex ? 4 : '50%',
              transition: 'all 0.3s ease'
            }}
          />
        ))}
      </View>

      {/* 固定按钮区，在 Swiper 之外，始终贴底 */}
      <View style={{ padding: '0 28px 34px', flexShrink: 0 }}>
        <View
          onClick={handleAction}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 16,
            background: isLast ? '#2DAA6E' : '#D4413A',
            display: 'flex',
            justifyContent: 'center',
            boxShadow: isLast
              ? '0 8px 16px -3px rgba(45,170,110,0.3)'
              : '0 8px 16px -3px rgba(212,65,58,0.3)'
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
            {isLast ? '立即开启琢音之旅' : '下一步'}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default Onboarding
