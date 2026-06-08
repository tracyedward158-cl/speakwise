// Tencent SCF Web Function — AI chat proxy (DeepSeek)
// Deploy: zip with node_modules (express + cors) → upload to SCF
// scf_bootstrap: node scf-chat.js
// Env vars: DEEPSEEK_API_KEY

const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.all('/*', async (req, res) => {
    try {
        const userMessages = req.body.messages;
        const systemContent = req.body.system || "你现在是 SpeakWise 琢音平台的一名专业 AI 中文口语教练。请配合来华留学生的水平进行真实场景对话。回复必须自然、简短，并严格遵循 HSK 分级词汇标准。";

        if (!userMessages || userMessages.length === 0) {
            return res.status(400).json({ error: '没有收到对话内容哦' });
        }

        const messagesForAI = [
            { role: "system", content: systemContent },
            ...userMessages
        ];

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: messagesForAI,
            })
        });

        const data = await response.json();
        const aiRealText = data.choices[0].message.content;

        res.json({ reply: aiRealText });

    } catch (error) {
        console.error('AI 请求出错了:', error);
        res.status(500).json({ error: '云端请求大模型失败，请稍后再试' });
    }
});

app.listen(9000, () => {
    console.log('SpeakWise 云函数启动成功，监听 9000 端口');
});
