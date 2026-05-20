import { useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "./Onboarding.css";

const slides = [
  {
    id: 1,
    title: "定制你的专属起点",
    desc: "基于 HSK 3.0 标准精准评估。无论初学还是高阶，都能找到最适合的对话难度。",
    img: "/images/onboard-1.png",
  },
  {
    id: 2,
    title: "告别开口焦虑",
    desc: "涵盖点餐、面试等真实场景。24小时在线的 AI 语伴，随时随地开启沉浸式口语训练。",
    img: "/images/onboard-2.png",
  },
  {
    id: 3,
    title: "智能诊断，精准反馈",
    desc: "实时捕获语音偏误，生成多维度报告。学情数据同步教师端，让进步清晰可见。",
    img: "/images/onboard-3.png",
  },
];

export default function Onboarding({ onComplete }) {
  const swiperRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLast = activeIndex === slides.length - 1;

  const handleAction = () => {
    if (isLast) {
      localStorage.setItem("speakwise_onboarded", "true");
      if (onComplete) onComplete();
    } else {
      swiperRef.current?.swiper.slideNext();
    }
  };

  return (
    <div className="onboard-overlay">
      <div className="onboard-window">
        <Swiper
          ref={swiperRef}
          modules={[Pagination]}
          pagination={{ clickable: true, el: ".onboard-dots" }}
          onSlideChange={(s) => setActiveIndex(s.activeIndex)}
          className="onboard-swiper"
        >
          {slides.map((slide) => (
            <SwiperSlide key={slide.id} className="onboard-slide">
              <div className="onboard-illustration">
                <img src={slide.img} alt={slide.title} loading="eager" />
              </div>
              <h2 className="onboard-title">{slide.title}</h2>
              <p className="onboard-desc">{slide.desc}</p>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Dots — centered between illustration and text, overlaying Swiper */}
        <div className="onboard-dots-wrap">
          <div className="onboard-dots" />
        </div>

        {/* Fixed button — outside Swiper, always at bottom */}
        <div className="onboard-btn-area">
          <button
            className={`onboard-btn ${isLast ? "onboard-btn-success" : "onboard-btn-primary"}`}
            onClick={handleAction}
          >
            {isLast ? "立即开启琢音之旅" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
