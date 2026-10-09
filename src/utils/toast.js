// ── 模块级 toast ──
//
// 网页端原来只有两处 alert（都在语音链路里）。接讯飞之后，「没听清」「播放失败」
// 「服务不可用」这类提示多起来了，弹窗会打断对话节奏，所以用一个最小的 DOM toast。
//
// 为什么不是 React 组件：调用方是 hooks/useSpeech.js 与 utils/tts.js ——
// 都不在渲染树里，拿不到 context；而 toast 的可见性不需要参与 React 的渲染。
// 样式走 inline，与全站风格一致（这个项目没有 CSS 框架）。

let timer = null;

export function showToast(message, ms = 2500) {
  if (typeof document === "undefined" || !message) return;

  let node = document.getElementById("sw-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "sw-toast";
    node.setAttribute("role", "status");
    Object.assign(node.style, {
      position: "fixed",
      left: "50%",
      bottom: "96px",
      transform: "translateX(-50%)",
      background: "rgba(26,26,26,0.88)",
      color: "#fff",
      fontSize: "13px",
      lineHeight: "1.6",
      padding: "10px 18px",
      borderRadius: "20px",
      maxWidth: "80vw",
      textAlign: "center",
      zIndex: "9999",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity .2s",
      fontFamily: "inherit",
    });
    document.body.appendChild(node);
  }

  node.textContent = message;
  node.style.opacity = "1";
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    node.style.opacity = "0";
  }, ms);
}
