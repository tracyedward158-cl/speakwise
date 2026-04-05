import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════
   AI CALL with retry & Friendly Error
   ═══════════════════════════════════════════ */

async function callAI(system, messages, maxTokens = 600, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch("/api/chat", {
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

/* ═══════════════════════════════════════════
   RESPONSIVE HELPER
   ═══════════════════════════════════════════ */

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : true);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

/* ═══════════════════════════════════════════
   DATA & KNOWLEDGE BASE (Updated for Strict Format)
   ═══════════════════════════════════════════ */

const HSK_LEVELS = [
  { id: "1-3", label: "初等 HSK 1-3", sub: "Beginner", desc: "基础交流、拼音与简单句", color: "#2DAA6E", emoji: "🌱" },
  { id: "4-6", label: "中等 HSK 4-6", sub: "Intermediate", desc: "日常交际、表达观点与意图", color: "#E8A838", emoji: "🌿" },
  { id: "7-9", label: "高等 HSK 7-9", sub: "Advanced", desc: "复杂话题讨论、高级书面语体", color: "#7B6CF6", emoji: "🌳" },
];

const HSK_PROMPT = {
  "1-3": "Student is HSK 1-3 beginner. Use basic vocab, short sentences.",
  "4-6": "Student is HSK 4-6 intermediate. Use common vocab, moderate complexity.",
  "7-9": "Student is HSK 7-9 advanced. Use rich vocab, idioms, complex grammar.",
};

const IDENTITY_FILTERS = [
  { id: "all", label: "全部" }, { id: "student", label: "留学生" },
  { id: "worker", label: "上班族" }, { id: "tourist", label: "游客" },
];

// Greetings converted to strictly formatted 3-line strings so the parser works identically
const SCENARIOS = [
  { id: "restaurant", title: "餐厅点餐", titleEn: "Order food", icon: "🍜", color: "#E8A838", bg: "#FFF8ED", identities: ["student","worker","tourist"], role: "You play a restaurant waiter. Take orders, recommend dishes, handle payment.", greeting: { "1-3": "HANZI: 你好！你想吃什么？\nPINYIN: Nǐ hǎo! Nǐ xiǎng chī shénme?\nENGLISH: Hello! What do you want to eat?", "4-6": "HANZI: 你好，欢迎光临！请问几位？想坐大厅还是包间？\nPINYIN: Nǐ hǎo, huānyíng guānglín! Qǐngwèn jǐ wèi? Xiǎng zuò dàtīng háishì bāojiān?\nENGLISH: Hello, welcome! How many guests? Would you like to sit in the hall or a private room?", "7-9": "HANZI: 欢迎光临！请问您有预订吗？今天我们有几道新推出的特色菜，要不要我给您介绍一下？\nPINYIN: Huānyíng guānglín! Qǐngwèn nín yǒu yùdìng ma? Jīntiān wǒmen yǒu jǐ dào xīn tuīchū de tèsè cài, yào bùyào wǒ gěi nín jièshào yíxià?\nENGLISH: Welcome! Do you have a reservation? We have a few new special dishes today, would you like me to introduce them to you?" } },
  { id: "directions", title: "问路 / 打车", titleEn: "Directions & taxi", icon: "🗺️", color: "#4A90D9", bg: "#EEF4FB", identities: ["student","worker","tourist"], role: "You play a taxi driver or passerby. Use: 左转, 右转, 直走, 红绿灯.", greeting: { "1-3": "HANZI: 你好！你去哪里？\nPINYIN: Nǐ hǎo! Nǐ qù nǎlǐ?\nENGLISH: Hello! Where are you going?", "4-6": "HANZI: 你好！我是出租车司机。请问你去哪儿？\nPINYIN: Nǐ hǎo! Wǒ shì chūzūchē sījī. Qǐngwèn nǐ qù nǎr?\nENGLISH: Hello! I am a taxi driver. Where are you heading?", "7-9": "HANZI: 您好，请问去哪儿？现在有点堵车，我建议走三环，您看行吗？\nPINYIN: Nín hǎo, qǐngwèn qù nǎr? Xiànzài yǒudiǎn dǔchē, wǒ jiànyì zǒu sān huán, nín kàn xíng ma?\nENGLISH: Hello, where to? There's a bit of traffic now, I suggest taking the 3rd Ring Road, is that okay?" } },
  { id: "hospital", title: "看病 / 去药店", titleEn: "Doctor & pharmacy", icon: "🏥", color: "#D4413A", bg: "#FDF0EF", identities: ["student","worker","tourist"], role: "You play a doctor or pharmacist. Teach: 头疼, 发烧, 感冒, 过敏.", greeting: { "1-3": "HANZI: 你好！你哪里不舒服？\nPINYIN: Nǐ hǎo! Nǐ nǎlǐ bù shūfu?\nENGLISH: Hello! Where do you feel uncomfortable?", "4-6": "HANZI: 你好，请坐。我是王医生。你今天哪里不舒服？\nPINYIN: Nǐ hǎo, qǐng zuò. Wǒ shì Wáng yīshēng. Nǐ jīntiān nǎlǐ bù shūfu?\nENGLISH: Hello, please sit down. I am Dr. Wang. What is troubling you today?", "7-9": "HANZI: 你好，请坐。我先看一下挂号信息……你是内科对吧？\nPINYIN: Nǐ hǎo, qǐng zuò. Wǒ xiān kàn yíxià guàhào xìnxī... nǐ shì nèikē duì ba?\nENGLISH: Hello, please sit. Let me check your registration info first... you are here for internal medicine, right?" } },
  { id: "shopping", title: "购物 / 砍价", titleEn: "Shopping", icon: "🛍️", color: "#9B59B6", bg: "#F5F0FA", identities: ["student","worker","tourist"], role: "You play a market vendor. Teach: 多少钱, 太贵了, 便宜一点.", greeting: { "1-3": "HANZI: 你好！你要买什么？\nPINYIN: Nǐ hǎo! Nǐ yào mǎi shénme?\nENGLISH: Hello! What do you want to buy?", "4-6": "HANZI: 来看看！今天水果很新鲜！草莓十块一斤！\nPINYIN: Lái kànkan! Jīntiān shuǐguǒ hěn xīnxiān! Cǎoméi shí kuài yì jīn!\nENGLISH: Come take a look! The fruits are very fresh today! Strawberries are 10 RMB per half-kilo!", "7-9": "HANZI: 哎，来来来！自家种的，纯天然！买两斤送半斤！\nPINYIN: Āi, lái lái lái! Zìjiā zhòng de, chún tiānrán! Mǎi liǎng jīn sòng bàn jīn!\nENGLISH: Hey, come over here! Homegrown, pure and natural! Buy one kilo, get a quarter kilo free!" } },
  { id: "social", title: "校园社交", titleEn: "Making friends", icon: "👋", color: "#2DAA6E", bg: "#EDFAF3", identities: ["student"], role: "You play a friendly classmate. Casual, topics: clubs, food, WeChat.", greeting: { "1-3": "HANZI: 你好！我叫小明。你叫什么？\nPINYIN: Nǐ hǎo! Wǒ jiào Xiǎomíng. Nǐ jiào shénme?\nENGLISH: Hello! My name is Xiaoming. What is your name?", "4-6": "HANZI: 嘿！你也是这个班的吗？我叫小明，你呢？\nPINYIN: Hēi! Nǐ yě shì zhège bān de ma? Wǒ jiào Xiǎomíng, nǐ ne?\nENGLISH: Hey! Are you also in this class? I'm Xiaoming, and you?", "7-9": "HANZI: 哎，你是新来的交换生吧？加个微信呗？\nPINYIN: Āi, nǐ shì xīn lái de jiāohuànshēng ba? Jiā gè wēixìn bei?\nENGLISH: Hey, you're the new exchange student, right? Let's add each other on WeChat?" } },
];

// Formatted PRONUNCIATION_BANK using explicit fields
const PRONUNCIATION_BANK = {
  "1-3": [
    { hanzi: "你好吗？", pinyin: "Nǐ hǎo ma?", english: "How are you?" },
    { hanzi: "我是学生。", pinyin: "Wǒ shì xuéshēng.", english: "I am a student." },
    { hanzi: "谢谢你！", pinyin: "Xièxie nǐ!", english: "Thank you!" },
    { hanzi: "我想喝水。", pinyin: "Wǒ xiǎng hē shuǐ.", english: "I want water." },
    { hanzi: "请再说一次。", pinyin: "Qǐng zài shuō yī cì.", english: "Say it again." }
  ],
  "4-6": [
    { hanzi: "今天天气不错，适合出去走走。", pinyin: "Jīntiān tiānqì búcuò, shìhé chūqù zǒuzou.", english: "Nice weather for a walk." },
    { hanzi: "我对中国文化特别感兴趣。", pinyin: "Wǒ duì Zhōngguó wénhuà tèbié gǎn xìngqù.", english: "I'm interested in Chinese culture." },
    { hanzi: "请问附近有没有地铁站？", pinyin: "Qǐngwèn fùjìn yǒu méiyǒu dìtiě zhàn?", english: "Is there a subway station nearby?" }
  ],
  "7-9": [
    { hanzi: "不管遇到什么困难，都不应该轻易放弃。", pinyin: "Bùguǎn yù dào shénme kùnnan, dōu bù yīnggāi qīngyì fàngqì.", english: "No matter what difficulties you meet, don't give up easily." },
    { hanzi: "与其抱怨环境，不如改变自己。", pinyin: "Yǔqí bàoyuàn huánjìng, bùrú gǎibiàn zìjǐ.", english: "Rather than complaining about the environment, change yourself." },
    { hanzi: "随着科技的发展，生活发生了巨大变化。", pinyin: "Suízhe kējì de fāzhǎn, shēnghuó fāshēngle jùdà biànhuà.", english: "With the development of technology, life has changed drastically." }
  ]
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function clean(t){return t.replace(/\*\*/g,"").replace(/\*/g,"").replace(/^#{1,6}\s/gm,"").replace(/__/g,"").replace(/~~/g,"");}

const SRC=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
function useSpeech(){
  const[l,sL]=useState(false);const[s,sS]=useState(false);const r=useRef(null);
  const start=useCallback(cb=>{if(!SRC){alert("Use Chrome for voice.");return;}const x=new SRC();x.lang="zh-CN";x.interimResults=false;x.continuous=false;x.onresult=e=>{cb(e.results[0][0].transcript);sL(false);};x.onerror=()=>sL(false);x.onend=()=>sL(false);r.current=x;x.start();sL(true);},[]);
  const stop=useCallback(()=>{r.current?.stop();sL(false);},[]);
  const speak=useCallback((t, slow = false)=>{
    // 彻底过滤所有 Emoji 和括号内容
    const c=clean(t).replace(/\(.*?\)/g,"").replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "");
    const sy=window.speechSynthesis;
    sy.cancel();
    const u=new SpeechSynthesisUtterance(c);
    u.lang="zh-CN";
    u.rate=slow ? 0.45 : 0.85;
    u.onstart=()=>sS(true);
    u.onend=()=>sS(false);
    u.onerror=()=>sS(false);
    sy.speak(u);
  },[]);
  const stopS=useCallback(()=>{window.speechSynthesis.cancel();sS(false);},[]);
  return{listening:l,speaking:s,startListening:start,stopListening:stop,speak,stopSpeaking:stopS};
}

/* ═══════════════════════════════════════════
   UI COMPONENTS
   ═══════════════════════════════════════════ */

function PageWrap({children, wide}){
  return <div style={{padding:"0 20px",maxWidth:wide?720:580,margin:"0 auto",width:"100%"}}>{children}</div>;
}

// 通用结构化文本组件，根据用户选择的模式动态隐藏
function SmartText({ hanzi, pinyin, english, mode, align="left" }) {
  const showPinyin = mode === "hanzi_pinyin" || mode === "all";
  const showEn = mode === "hanzi_en" || mode === "all";
  
  return (
    <div style={{display:"flex", flexDirection:"column", gap: 5, textAlign: align}}>
      <div style={{fontSize: 16, lineHeight: 1.6, color: "#1a1a1a"}}>{hanzi}</div>
      {showPinyin && pinyin && <div style={{fontSize: 14, color: "#4A90D9", fontFamily: "sans-serif"}}>{pinyin}</div>}
      {showEn && english && <div style={{fontSize: 13, color: "#888", fontStyle: "italic"}}>{english}</div>}
    </div>
  )
}

function TopBar({title, subtitle, onBack, hskLevel, onChangeHSK, displayMode, onModeChange}){
  const[hskOpen,setHskOpen]=useState(false);
  const[modeOpen,setModeOpen]=useState(false);
  
  const lv=HSK_LEVELS.find(l=>l.id===hskLevel);
  const MODES = [
    { id: "hanzi", label: "🇨🇳 仅汉字", short: "汉字" },
    { id: "hanzi_pinyin", label: "🇨🇳+🔤 汉字+拼音", short: "拼音" },
    { id: "hanzi_en", label: "🇨🇳+🇬🇧 汉字+英文", short: "英文" },
    { id: "all", label: "🔤+🇬🇧 全显模式", short: "全显" }
  ];
  const curMode = MODES.find(m => m.id === displayMode) || MODES[3];

  return(
  <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12,background:"#fff",borderBottom:"1px solid #f0efe8",position:"sticky",top:0,zIndex:20}}>
    {onBack&&<button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",borderRadius:8}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>}
    <div style={{flex:1,minWidth:0}}>
       <div style={{fontSize:17,fontWeight:600,color:"#1a1a1a"}}>{title}</div>
       {subtitle&&<div style={{fontSize:12,color:"#999"}}>{subtitle}</div>}
    </div>
    
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {/* DISPLAY MODE DROPDOWN */}
      {displayMode && (
        <div style={{position:"relative"}}>
          <button onClick={()=>{setModeOpen(!modeOpen); setHskOpen(false);}} style={{background:"#f0efe8",border:"none",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4,fontWeight:600,color:"#555"}}>
            ⚙️ {curMode.short}
          </button>
          {modeOpen&&<>
            <div onClick={()=>setModeOpen(false)} style={{position:"fixed",inset:0,zIndex:30}}/>
            <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:31,overflow:"hidden",minWidth:160, padding:4}}>
              {MODES.map(m=>
                <button key={m.id} onClick={()=>{onModeChange(m.id);setModeOpen(false);}} style={{width:"100%",padding:"10px 12px",border:"none",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",background:m.id===displayMode?"#f4f3ed":"transparent",fontSize:13,fontWeight:m.id===displayMode?600:400,color:"#333",textAlign:"left"}}>
                  {m.label}
                </button>
              )}
            </div>
          </>}
        </div>
      )}

      {/* HSK LEVEL DROPDOWN */}
      {hskLevel && (
      <div style={{position:"relative"}}>
        <button onClick={()=>{setHskOpen(!hskOpen); setModeOpen(false);}} style={{background:lv.color+"14",border:`1px solid ${lv.color}30`,borderRadius:20,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:600,color:lv.color,fontFamily:"inherit"}}>
          {lv.emoji} {lv.label}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={lv.color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {hskOpen&&<>
          <div onClick={()=>setHskOpen(false)} style={{position:"fixed",inset:0,zIndex:30}}/>
          <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:31,overflow:"hidden",minWidth:180}}>
            {HSK_LEVELS.map(l=>
              <button key={l.id} onClick={()=>{onChangeHSK(l.id);setHskOpen(false);}} style={{width:"100%",padding:"12px 16px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:l.id===hskLevel?l.color+"10":"transparent",fontFamily:"inherit",textAlign:"left"}}>
                <span style={{fontSize:18}}>{l.emoji}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:l.id===hskLevel?l.color:"#1a1a1a"}}>{l.label}</div>
                  <div style={{fontSize:12,color:"#999"}}>{l.sub}</div>
                </div>
              </button>
            )}
          </div>
        </>}
      </div>
      )}
    </div>
  </div>);
}

/* ═══════════════════════════════════════════
   MENU ITEM COMPONENT (升级为与首页同款的大尺寸卡片)
   ═══════════════════════════════════════════ */

function MenuItem({item, onClick, hovered, onHover, badge}){
  return <div onClick={onClick} onMouseEnter={()=>onHover(item.id)} onMouseLeave={()=>onHover(null)}
    style={{background:"#fff",borderRadius:18,padding:"26px 24px",cursor:"pointer",border:`1.5px solid ${hovered===item.id?item.color+"60":"#f0efe8"}`,transition:"all 0.3s",transform:hovered===item.id?"translateY(-3px)":"none",boxShadow:hovered===item.id?`0 10px 28px ${item.color}15`:"0 1px 3px rgba(0,0,0,0.03)"}}>
    
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
      <div style={{width:56,height:56,borderRadius:16,background:item.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0,transition:"transform 0.2s",transform:hovered===item.id?"scale(1.06)":"none"}}>{item.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:20,fontWeight:600,color:"#1a1a1a"}}>{item.title}</span>{badge&&<span style={{fontSize:11,background:item.color+"18",color:item.color,padding:"2px 10px",borderRadius:10,fontWeight:600}}>{badge}</span>}</div>
        <div style={{fontSize:13,color:"#aaa",marginTop:2}}>{item.titleEn}</div>
      </div>
    </div>
    
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:14,color:"#666"}}>{item.desc}</div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={hovered===item.id?item.color:"#ccc"} strokeWidth="2" style={{flexShrink:0,transition:"transform 0.25s",transform:hovered===item.id?"translateX(4px)":"none"}}><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>;
}

/* ═══════════════════════════════════════════
   DRILL VIEW
   ═══════════════════════════════════════════ */

function DrillView({type, hskLevel, onBack, onChangeHSK, displayMode, onModeChange}){
  // Using pronunciation bank for demo as it has been updated with struct fields
  const bank = PRONUNCIATION_BANK[hskLevel] || PRONUNCIATION_BANK["4-6"];
  const[idx,setIdx]=useState(0);const[input,setInput]=useState("");const[feedback,setFeedback]=useState(null);
  const[loading,setLoading]=useState(false);const[scores,setScores]=useState([]);const[done,setDone]=useState(false);
  const{listening,speaking,startListening,stopListening,speak,stopSpeaking}=useSpeech();
  const fbRef=useRef(null);const q=bank[idx];const total=bank.length;
  const color="#7B6CF6";const bg="#F3F0FF";

  useEffect(()=>{if(feedback&&fbRef.current)fbRef.current.scrollIntoView({behavior:"smooth"});},[feedback]);

  const submit=async(text)=>{
    if(!text.trim()||loading)return;setInput(text.trim());setLoading(true);setFeedback(null);
    const sys=`Grade pronunciation. Target: "${q.hanzi}". Student said: "${text.trim()}". Reply ONLY:\nSCORE: [0-100]\nFEEDBACK: [1 sentence]\nISSUES: [wrong characters or "None"]`;
    try{
      const raw=await callAI(sys,[{role:"user",content:text.trim()}],300);const reply=clean(raw);
      const m=reply.match(/SCORE:\s*(\d+)/i);const score=m?Math.min(parseInt(m[1]),100):70;
      setFeedback({text:reply.replace(/SCORE:\s*\d+\s*/i,"").trim(),score});setScores(p=>[...p,score]);
    }catch{setFeedback({text:"网络稍有波动，请尝试下一题哦~",score:0});}
    setLoading(false);
  };

  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);submit(t);});};
  const next=()=>{if(idx+1>=total){setDone(true);return;}setIdx(idx+1);setInput("");setFeedback(null);};
  const restart=()=>{setIdx(0);setInput("");setFeedback(null);setScores([]);setDone(false);};

  if(done){
    const validScores=scores.filter(s=>s>0);const avg=validScores.length?Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length):0;const emoji=avg>=90?"🌟":avg>=80?"👍":avg>=70?"👌":avg>=60?"🤔":"💪";
    return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
      <TopBar title="语音测评" subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
      <PageWrap><div style={{padding:"32px 0",textAlign:"center",animation:"su 0.4s both"}}>
        <div style={{fontSize:56,marginBottom:12}}>{emoji}</div>
        <div style={{fontSize:48,fontWeight:700,color,marginBottom:4}}>{avg}<span style={{fontSize:20,color:"#999"}}>/100</span></div>
        <div style={{fontSize:15,color:"#888",marginBottom:28}}>Average across {validScores.length} questions</div>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #f0efe8",overflow:"hidden",marginBottom:24,textAlign:"left"}}>{scores.map((s,i)=><div key={i} style={{padding:"14px 18px",borderBottom:i<scores.length-1?"1px solid #f7f6f1":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,color:"#666"}}>Q{i+1}. {bank[i].hanzi.slice(0,15)+"…"}</div><div style={{fontSize:15,fontWeight:600,color:s>=80?"#2DAA6E":s>=60?"#E8A838":s>0?"#D4413A":"#ccc"}}>{s>0?s:"—"}</div></div>)}</div>
        <div style={{display:"flex",gap:10}}><button onClick={restart} style={{flex:1,padding:16,borderRadius:12,border:`1.5px solid ${color}`,background:"transparent",color,fontSize:16,fontWeight:600,cursor:"pointer"}}>Try again</button><button onClick={onBack} style={{flex:1,padding:16,borderRadius:12,border:"none",background:color,color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer"}}>Back</button></div>
      </div></PageWrap></div>);
  }

  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
    <TopBar title="语音测评" subtitle="Pronunciation" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} displayMode={displayMode} onModeChange={onModeChange}/>
    <PageWrap><div style={{padding:"20px 0 140px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><div style={{flex:1,height:6,background:"#ebe9e1",borderRadius:3,overflow:"hidden"}}><div style={{width:`${((idx+(feedback?1:0))/total)*100}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.4s"}}/></div><span style={{fontSize:13,color:"#999",fontWeight:600}}>{idx+1}/{total}</span></div>
      
      <div style={{background:"#fff",borderRadius:16,border:"1px solid #f0efe8",padding:"28px 24px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.03)"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#bbb",textTransform:"uppercase",letterSpacing:1,marginBottom:16}}>Read this sentence aloud</div>
        
        {/* Uses the strictly separated fields */}
        <SmartText hanzi={q.hanzi} pinyin={q.pinyin} english={q.english} mode={displayMode} />
        
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>speaking?stopSpeaking():speak(q.hanzi)} style={{marginTop:18,background:bg,border:`1px solid ${color}30`,borderRadius:20,padding:"8px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color,fontFamily:"inherit"}}><svg width="13" height="13" viewBox="0 0 24 24" fill={color}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>{speaking?"Stop":"Listen"}</button>
          <button onClick={()=>speak(q.hanzi, true)} style={{marginTop:18,background:"#fff",border:`1px solid ${color}30`,borderRadius:20,padding:"8px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,color,fontFamily:"inherit"}}>🐢 慢速</button>
        </div>
      </div>

      {feedback&&<div ref={fbRef}>
        <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${feedback.score>=80?"#2DAA6E40":feedback.score>=60?"#E8A83840":"#D4413A40"}`,padding:22,marginBottom:14,animation:"su 0.3s both"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:14,fontWeight:600,color:"#888"}}>AI feedback</span><div style={{background:feedback.score>=80?"#EDFAF3":feedback.score>=60?"#FFF8ED":"#FDF0EF",borderRadius:20,padding:"5px 16px",fontSize:17,fontWeight:700,color:feedback.score>=80?"#2DAA6E":feedback.score>=60?"#E8A838":"#D4413A"}}>{feedback.score>0?feedback.score+"/100":"Error"}</div></div>
          {input&&<div style={{fontSize:14,color:"#888",marginBottom:10}}>Your answer: <span style={{color:"#1a1a1a"}}>{input}</span></div>}
          <div style={{fontSize:15,color:"#444",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{feedback.text}</div>
        </div>
        <button onClick={next} style={{width:"100%",padding:16,borderRadius:12,border:"none",background:color,color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{idx+1>=total?"See results →":"Next question →"}</button>
      </div>}
      {loading&&<div style={{textAlign:"center",padding:24}}><div style={{display:"inline-flex",gap:5}}>{[0,1,2].map(j=><div key={j} style={{width:8,height:8,borderRadius:"50%",background:color,animation:`dp 1.2s ${j*0.2}s infinite`}}/>)}</div><div style={{fontSize:13,color:"#999",marginTop:8}}>AI grading...</div></div>}
    </div></PageWrap>
    
    {!feedback&&!loading&&<div style={{position:"fixed",bottom:0,left:0,right:0,padding:"14px 20px",background:"#fff",borderTop:"1px solid #f0efe8",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:580}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit(input)} placeholder="Tap mic or type..." style={{flex:1,padding:"14px 18px",borderRadius:24,border:"1px solid #e8e6de",background:"#FAFAF7",fontSize:15,outline:"none",color:"#1a1a1a",fontFamily:"inherit"} }/>
      <button onClick={handleMic} style={{width:48,height:48,borderRadius:"50%",background:listening?color:"transparent",border:`2px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",animation:listening?"pulse 1.5s infinite":"none",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill={listening?"#fff":color}><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></button>
      <button onClick={()=>submit(input)} disabled={!input.trim()} style={{width:48,height:48,borderRadius:"50%",background:input.trim()?color:"#e8e6de",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()?"pointer":"default",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div></div>}
  </div>);
}

/* ═══════════════════════════════════════════
   CHAT VIEW (with Strict Parsing)
   ═══════════════════════════════════════════ */

// 辅助函数：将AI的3行输出解析为结构化对象
const parseAIResponse = (content) => {
  if (!content.includes("HANZI:")) return { hanzi: content, pinyin: "", english: "" };
  const hanzi = content.match(/HANZI:\s*(.*)/i)?.[1] || "";
  const pinyin = content.match(/PINYIN:\s*(.*)/i)?.[1] || "";
  const english = content.match(/ENGLISH:\s*(.*)/i)?.[1] || "";
  return { hanzi, pinyin, english };
};

function ChatView({module,hskLevel,onBack,onChangeHSK,showVoice=true, displayMode, onModeChange}){
  const[messages,setMessages]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);
  const endRef=useRef(null);const{listening,speaking,startListening,stopListening,speak,stopSpeaking}=useSpeech();
  
  useEffect(()=>{
    const g=typeof module.greeting==="object"?module.greeting[hskLevel]||module.greeting["4-6"]:module.greeting;
    setMessages([{role:"assistant", content: g}]);
  },[module.id, hskLevel]);
  
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  
  // 新版强制命令的系统提示词
  const sys=()=>`You are a Chinese language coach. Level: ${HSK_PROMPT[hskLevel]}
ROLE: ${module.system||module.role||""}
RULES: Stay in character, 2-3 sentences max.
CRITICAL MANDATORY FORMAT: You MUST strictly output your reply in EXACTLY 3 lines using these prefixes:
HANZI: [Your Chinese text]
PINYIN: [Pinyin for the Chinese text]
ENGLISH: [English translation]
Do NOT output any markdown, conversational filler, or intro text.`;

  const send=async(text)=>{
    if(!text.trim()||loading)return;
    const u={role:"user",content:text.trim()};
    const up=[...messages,u];
    setMessages(up);setInput("");setLoading(true);
    try{
      const raw=await callAI(sys(),up.map(m=>({role:m.role,content:m.content})),800);
      setMessages(p=>[...p,{role:"assistant",content:clean(raw||"")}]);
    } catch{
      setMessages(p=>[...p,{role:"assistant",content:"HANZI: 网络连接不太稳定，请重新发送。\nPINYIN: Wǎngluò lianjiē bù tài wěndìng, qǐng chóngxīn fāsòng.\nENGLISH: Network is unstable, please resend."}]);
    }
    setLoading(false);
  };
  
  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);send(t);});};
  
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
    <TopBar title={module.title} subtitle={module.titleEn} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} displayMode={displayMode} onModeChange={onModeChange}/>
    
    <div style={{flex:1,overflowY:"auto",padding:"16px 20px 120px",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{width:"100%",maxWidth:640}}>
      {messages.map((msg,i)=>{
        const isUser = msg.role==="user";
        // 如果是用户发的，直接渲染纯文本，如果是AI发的，用分离器解析
        const parsed = isUser ? { hanzi: msg.content, pinyin:"", english:"" } : parseAIResponse(msg.content);
        
        return(
        <div key={i} style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",marginBottom:14,alignItems:"flex-end",gap:8,animation:"su 0.3s both"}}>
          {!isUser&&<div style={{width:32,height:32,borderRadius:"50%",background:module.bg||"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{module.icon}</div>}
          
          <div style={{maxWidth:"75%",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{padding:"12px 16px",background:isUser?(module.color||"#4A90D9"):"#fff",color:isUser?"#fff":"#1a1a1a",borderRadius:isUser?"18px 18px 4px 18px":"18px 18px 18px 4px",boxShadow:isUser?"none":"0 1px 3px rgba(0,0,0,0.04)",border:isUser?"none":"1px solid #f0efe8"}}>
              {/* 核心：使用 SmartText 按需显示 */}
              <SmartText 
                hanzi={parsed.hanzi} 
                pinyin={parsed.pinyin} 
                english={parsed.english} 
                mode={isUser ? "hanzi" : displayMode} 
              />
            </div>
            
            {!isUser&&showVoice&&<div style={{display:"flex",gap:10,opacity:0.6,alignSelf:"flex-start",marginLeft:4}}>
              {/* 这里精确只读 parsed.hanzi */}
              <button onClick={()=>speaking?stopSpeaking():speak(parsed.hanzi)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:4}}><svg width="14" height="14" viewBox="0 0 24 24" fill={speaking?(module.color||"#E8A838"):"#888"}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg><span style={{fontSize:12,color:"#666"}}>{speaking?"Stop":"Play"}</span></button>
              <button onClick={()=>speak(parsed.hanzi, true)} style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:14}}>🐢</button>
            </div>}
          </div>
        </div>
      )})}
      {loading&&<div style={{display:"flex",gap:6,alignItems:"center",padding:"8px 0",animation:"su 0.3s both"}}><div style={{width:32,height:32,borderRadius:"50%",background:module.bg||"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{module.icon}</div><div style={{background:"#fff",borderRadius:16,padding:"12px 18px",border:"1px solid #f0efe8",display:"flex",gap:5}}>{[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"#ccc",animation:`dp 1.2s ${j*0.2}s infinite`}}/>)}</div></div>}
      <div ref={endRef}/>
      </div>
    </div>
    
    <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"14px 20px",background:"#fff",borderTop:"1px solid #f0efe8",display:"flex",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:640}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send(input)} placeholder={showVoice?"Type or tap mic...":"Type here..."} style={{flex:1,padding:"14px 18px",borderRadius:24,border:"1px solid #e8e6de",background:"#FAFAF7",fontSize:15,outline:"none",color:"#1a1a1a",fontFamily:"inherit"}}/>
      {showVoice&&<button onClick={handleMic} style={{width:48,height:48,borderRadius:"50%",background:listening?(module.color||"#4A90D9"):"transparent",border:`2px solid ${module.color||"#4A90D9"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",animation:listening?"pulse 1.5s infinite":"none",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill={listening?"#fff":(module.color||"#4A90D9")}><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></button>}
      <button onClick={()=>send(input)} disabled={!input.trim()||loading} style={{width:48,height:48,borderRadius:"50%",background:input.trim()?(module.color||"#4A90D9"):"#e8e6de",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()?"pointer":"default",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
      </div>
    </div>
  </div>);
}

/* ═══════════════════════════════════════════
   SCREENS & MENU
   ═══════════════════════════════════════════ */

function HSKSelect({onSelect}){const[h,sH]=useState(null);return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
  <div style={{width:72,height:72,borderRadius:20,background:"linear-gradient(135deg,#E8A838,#D4413A)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:22,boxShadow:"0 8px 24px rgba(232,168,56,0.25)"}}><span style={{fontSize:34,color:"#fff",fontWeight:700}}>说</span></div>
  <h1 style={{fontSize:26,fontWeight:700,color:"#1a1a1a",margin:"0 0 6px"}}>SpeakWise 琢音</h1>
  <p style={{fontSize:15,color:"#999",margin:"0 0 8px"}}>AI Chinese language coach</p>
  <p style={{fontSize:14,color:"#bbb",margin:"0 0 36px"}}>What's your Chinese level?</p>
  <div style={{width:"100%",maxWidth:440,display:"flex",flexDirection:"column",gap:14}}>
    {HSK_LEVELS.map((l,i)=><div key={l.id} onClick={()=>onSelect(l.id)} onMouseEnter={()=>sH(l.id)} onMouseLeave={()=>sH(null)} style={{background:"#fff",borderRadius:18,padding:24,cursor:"pointer",border:`1.5px solid ${h===l.id?l.color+"80":"#f0efe8"}`,transition:"all 0.25s",transform:h===l.id?"translateY(-2px)":"none",boxShadow:h===l.id?`0 8px 20px ${l.color}18`:"0 1px 3px rgba(0,0,0,0.03)",display:"flex",alignItems:"center",gap:18,animation:`su 0.5s ${i*0.1}s both`}}>
      <div style={{width:56,height:56,borderRadius:16,background:l.color+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,flexShrink:0,transition:"transform 0.25s",transform:h===l.id?"scale(1.1)":"none"}}>{l.emoji}</div>
      <div style={{flex:1}}><div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{fontSize:19,fontWeight:600,color:"#1a1a1a"}}>{l.label}</span><span style={{fontSize:14,color:l.color,fontWeight:500}}>{l.sub}</span></div><p style={{fontSize:14,color:"#888",margin:"4px 0 0"}}>{l.desc}</p></div>
    </div>)}
  </div>
  <p style={{fontSize:12,color:"#ccc",marginTop:30}}>You can change anytime from the top bar</p>
</div>);}

function MainMenu({hskLevel,onChangeHSK,onNav, onOpenAbout}){const[h,sH]=useState(null);
  const sec=[
    {id:"oral",title:"口语练习",titleEn:"Oral practice",icon:"🗣️",color:"#E8A838",bg:"#FFF8ED",desc:"场景模拟 · 语音测评 · 自由对话"},
    {id:"written",title:"书面语练习",titleEn:"Written practice",icon:"✍️",color:"#7B6CF6",bg:"#F3F0FF",desc:"造句 · 段落写作 · 短文写作"},
    {id:"manual",title:"学习手册",titleEn:"Study Manual",icon:"📚",color:"#D4413A",bg:"#FDF0EF",desc:"重点词汇 · 核心语法 · 语音声调"}
  ];
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="SpeakWise 琢音" subtitle="AI Chinese language coach" hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"32px 0 40px"}}>
      <p style={{fontSize:22,fontWeight:600,color:"#1a1a1a",margin:"0 0 28px",lineHeight:1.4}}>Hi! 👋 What would you<br/>like to practice?</p>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {sec.map((s,i)=><div key={s.id} onClick={()=>onNav(s.id)} onMouseEnter={()=>sH(s.id)} onMouseLeave={()=>sH(null)}
          style={{flex:1,background:"#fff",borderRadius:18,padding:"26px 24px",cursor:"pointer",border:`1.5px solid ${h===s.id?s.color+"60":"#f0efe8"}`,transition:"all 0.3s",transform:h===s.id?"translateY(-3px)":"none",boxShadow:h===s.id?`0 10px 28px ${s.color}15`:"0 1px 3px rgba(0,0,0,0.03)",animation:`su 0.5s ${i*0.12}s both`}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:56,height:56,borderRadius:16,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{s.icon}</div><div><div style={{fontSize:20,fontWeight:600,color:"#1a1a1a"}}>{s.title}</div><div style={{fontSize:13,color:"#aaa"}}>{s.titleEn}</div></div></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,color:"#666"}}>{s.desc}</div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={h===s.id?s.color:"#ccc"} strokeWidth="2" style={{flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>)}
      </div>
      <div style={{marginTop:24,padding:"14px 18px",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",display:"flex",alignItems:"center",gap:10}}><span>💡</span><p style={{fontSize:13,color:"#999",margin:0}}>Use Chrome for voice. Tap mic to speak Chinese!</p></div>
      <div style={{marginTop:18,textAlign:"center"}}>
        <div style={{fontSize:12,color:"#d0d0d0"}}>Powered by Claude AI · SRTP Project</div>
        <button onClick={onOpenAbout} style={{background:"none",border:"none",color:"#aaa",fontSize:12,marginTop:8,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>ℹ️ 关于项目</button>
      </div>
    </div></PageWrap></div>);}

function OralMenu({hskLevel,onChangeHSK,onBack,onNav}){const[h,sH]=useState(null);
  const items=[
    {id:"scenes",title:"场景模拟",titleEn:"Scenarios",icon:"🎭",color:"#E8A838",bg:"#FFF8ED",desc:"Real-life role play"},
    {id:"assess",title:"语音测评",titleEn:"Pronunciation",icon:"🎙️",color:"#7B6CF6",bg:"#F3F0FF",desc:"Read & get AI scores"},
    {id:"free",title:"自由对话",titleEn:"Free chat",icon:"💬",color:"#2DAA6E",bg:"#EDFAF3",desc:"Chat freely with AI"}];
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="口语练习" subtitle="Oral practice" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"24px 0",display:"flex",flexDirection:"column",gap:12}}>
      {items.map(it=><MenuItem key={it.id} item={it} onClick={()=>onNav(it.id)} hovered={h} onHover={sH}/>)}
    </div></PageWrap></div>);}

function SceneList({hskLevel,onChangeHSK,onBack,onSelect, displayMode, onModeChange}){const[filter,setFilter]=useState("all");const[h,sH]=useState(null);const isMobile=useIsMobile();
  const filtered=filter==="all"?SCENARIOS:SCENARIOS.filter(s=>s.identities.includes(filter));
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
    <TopBar title="场景模拟" subtitle="Scenarios" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} displayMode={displayMode} onModeChange={onModeChange}/>
    <PageWrap wide>
    <div style={{padding:"14px 0 6px",display:"flex",gap:8,overflowX:"auto"}}>{IDENTITY_FILTERS.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:"7px 18px",borderRadius:20,border:"1px solid",borderColor:filter===f.id?"#E8A838":"#ebe9e1",background:filter===f.id?"#E8A83814":"#fff",color:filter===f.id?"#E8A838":"#888",fontSize:14,fontWeight:filter===f.id?600:400,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{f.label}</button>)}</div>
    <div style={{padding:"14px 0 40px"}}><div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:12}}>
      {filtered.map((s,i)=><div key={s.id} onClick={()=>onSelect(s)} onMouseEnter={()=>sH(s.id)} onMouseLeave={()=>sH(null)} style={{background:"#fff",borderRadius:16,padding:"18px 16px",cursor:"pointer",border:`1px solid ${h===s.id?s.color+"50":"#f0efe8"}`,transition:"all 0.25s",transform:h===s.id?"translateY(-2px)":"none",animation:`su 0.3s ${i*0.04}s both`}}>
        <div style={{width:44,height:44,borderRadius:12,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,marginBottom:12}}>{s.icon}</div>
        <div style={{fontSize:16,fontWeight:600,color:"#1a1a1a",marginBottom:3}}>{s.title}</div><div style={{fontSize:12,color:"#aaa"}}>{s.titleEn}</div>
      </div>)}
    </div></div>
    </PageWrap></div>);}

function buildFreeModule(){return{id:"free",title:"自由对话",titleEn:"Free chat",icon:"💬",color:"#2DAA6E",bg:"#EDFAF3",system:"Friendly Chinese conversation partner. Chat naturally.",greeting: "HANZI: 嘿！今天想聊点什么？\nPINYIN: Hēi! Jīntiān xiǎng liáo diǎn shénme?\nENGLISH: Hey! What do you want to talk about today?"};}

/* ═══════════════════════════════════════════
   APP ROOT (State persistence & UI orchestration)
   ═══════════════════════════════════════════ */

export default function App(){
  const [hsk, setHsk] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("hsk") || null;
    return null;
  });
  useEffect(() => { if (hsk) localStorage.setItem("hsk", hsk); }, [hsk]);

  // 新的 4模显示控制状态
  const [displayMode, setDisplayMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("displayMode") || "all";
    return "all";
  });
  useEffect(() => { if (displayMode) localStorage.setItem("displayMode", displayMode); }, [displayMode]);

  const [showAbout, setShowAbout] = useState(false);
  const closeAbout = () => { setShowAbout(false); };

  const [view, setView] = useState(hsk ? "main" : "hsk");
  const [chatMod, setChatMod] = useState(null);
  const [chatParent, setChatParent] = useState("oral");
  const [drillType, setDrillType] = useState(null);
  const [drillParent, setDrillParent] = useState("oral");

  const openChat=(m,p)=>{setChatMod(m);setChatParent(p);setView("chat");};
  const openDrill=(t,p)=>{setDrillType(t);setDrillParent(p);setView("drill");};
  
  const oralNav=id=>{
    if(id==="scenes")setView("scenes");
    else if(id==="assess")openDrill("pronunciation","oral");
    else if(id==="free")openChat(buildFreeModule(),"oral");
  };
  
  const sceneSelect=s=>openChat({...s,system:`SCENARIO: ${s.role}`},"scenes");
  
  return(<><style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap');@keyframes su{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0.12)}50%{box-shadow:0 0 0 12px rgba(0,0,0,0)}}@keyframes dp{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}*{box-sizing:border-box;margin:0}body{font-family:'Noto Sans SC',sans-serif}`}</style>
    
    {view==="hsk"&&<HSKSelect onSelect={l=>{setHsk(l);setView("main");}}/>}
    {view==="main"&&<MainMenu hskLevel={hsk} onChangeHSK={setHsk} onNav={id=>setView(id==="oral"?"oral":id==="written"?"written":"manual")} onOpenAbout={()=>setShowAbout(true)}/>}
    {view==="oral"&&<OralMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")} onNav={oralNav}/>}
    {view==="scenes"&&<SceneList hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("oral")} onSelect={sceneSelect} displayMode={displayMode} onModeChange={setDisplayMode}/>}
    {view==="chat"&&chatMod&&<ChatView module={chatMod} hskLevel={hsk} onBack={()=>setView(chatParent)} onChangeHSK={setHsk} displayMode={displayMode} onModeChange={setDisplayMode}/>}
    {view==="drill"&&<DrillView type={drillType} hskLevel={hsk} onBack={()=>setView(drillParent)} onChangeHSK={setHsk} displayMode={displayMode} onModeChange={setDisplayMode}/>}
    
    {/* 这里删除了书面语练习和学习手册的占位，仅保留你在要求中提到的核心部分供你快速套用 */}
  </>);
}
