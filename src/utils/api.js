// ── SCF API endpoints ──
// 生产环境：前端静态页面托管 → 直连 SCF
// 本地开发：Vite proxy /api → localhost:3000 (server.js)
const AI_SCF_URL = "https://1421249792-bj1fnrrvy7.ap-nanjing.tencentscf.com/";
const EVAL_SCF_URL = "https://1421249792-bsap200z1z.ap-nanjing.tencentscf.com"; 

export async function callAI(system, messages, maxTokens = 600, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(AI_SCF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.reply || data.reply.trim() === "") throw new Error("Empty reply");
      return data.reply;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export async function evaluatePronunciation(audioBase64, refText, core = "sent") {
  const res = await fetch(EVAL_SCF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioBase64, refText, core }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
