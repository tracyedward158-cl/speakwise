import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════
   AI CALL with retry
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
   DATA
   ═══════════════════════════════════════════ */

const HSK_LEVELS = [
  { id: "1-2", label: "HSK 1-2", sub: "Beginner", desc: "Basic greetings, numbers, simple sentences", color: "#2DAA6E", emoji: "🌱" },
  { id: "3-4", label: "HSK 3-4", sub: "Intermediate", desc: "Daily conversations, express opinions", color: "#E8A838", emoji: "🌿" },
  { id: "5-6", label: "HSK 5-6", sub: "Advanced", desc: "Complex discussions, idioms, formal expressions", color: "#7B6CF6", emoji: "🌳" },
];

const HSK_PROMPT = {
  "1-2": "Student is HSK 1-2 beginner. Use basic vocab, short sentences, always give pinyin + English. NEVER use markdown (no ** # _ ~~).",
  "3-4": "Student is HSK 3-4 intermediate. Use common vocab, moderate complexity, pinyin for hard words. NEVER use markdown (no ** # _ ~~).",
  "5-6": "Student is HSK 5-6 advanced. Use rich vocab, idioms, complex grammar. Pinyin only for rare words. NEVER use markdown (no ** # _ ~~).",
};

const IDENTITY_FILTERS = [
  { id: "all", label: "全部" }, { id: "student", label: "留学生" },
  { id: "worker", label: "上班族" }, { id: "tourist", label: "游客" },
];

const SCENARIOS = [
  { id: "restaurant", title: "餐厅点餐", titleEn: "Order food", icon: "🍜", color: "#E8A838", bg: "#FFF8ED", identities: ["student","worker","tourist"], role: "You play a restaurant waiter. Take orders, recommend dishes, handle payment.", greeting: { "1-2": "你好！\n(Nǐ hǎo!) Hello!\n\n你想吃什么？\n(Nǐ xiǎng chī shénme?)\nWhat do you want to eat?", "3-4": "你好，欢迎光临！请问几位？\n(Qǐngwèn jǐ wèi?)\nHow many guests?\n\n想坐大厅还是包间？", "5-6": "欢迎光临！请问您有预订吗？今天我们有几道新推出的特色菜，要不要我给您介绍一下？" } },
  { id: "directions", title: "问路 / 打车", titleEn: "Directions & taxi", icon: "🗺️", color: "#4A90D9", bg: "#EEF4FB", identities: ["student","worker","tourist"], role: "You play a taxi driver or passerby. Use: 左转, 右转, 直走, 红绿灯.", greeting: { "1-2": "你好！你去哪里？\n(Nǐ qù nǎlǐ?) 🚕", "3-4": "你好！我是出租车司机。请问你去哪儿？🚕", "5-6": "您好，请问去哪儿？现在有点堵车，我建议走三环，您看行吗？🚕" } },
  { id: "hospital", title: "看病 / 去药店", titleEn: "Doctor & pharmacy", icon: "🏥", color: "#D4413A", bg: "#FDF0EF", identities: ["student","worker","tourist"], role: "You play a doctor or pharmacist. Teach: 头疼, 发烧, 感冒, 过敏.", greeting: { "1-2": "你好！你哪里不舒服？\n(Nǐ nǎlǐ bù shūfu?) 🩺", "3-4": "你好，请坐。我是王医生。\n你今天哪里不舒服？ 🩺", "5-6": "你好，请坐。我先看一下挂号信息……你是内科对吧？🩺" } },
  { id: "shopping", title: "购物 / 砍价", titleEn: "Shopping", icon: "🛒", color: "#9B59B6", bg: "#F5F0FA", identities: ["student","worker","tourist"], role: "You play a market vendor. Teach: 多少钱, 太贵了, 便宜一点.", greeting: { "1-2": "你好！你要买什么？\n(Nǐ yào mǎi shénme?) 🛒", "3-4": "来看看！今天水果很新鲜！草莓十块一斤！🍓", "5-6": "哎，来来来！自家种的，纯天然！买两斤送半斤！🍓" } },
  { id: "social", title: "校园社交", titleEn: "Making friends", icon: "🤝", color: "#2DAA6E", bg: "#EDFAF3", identities: ["student"], role: "You play a friendly classmate. Casual, topics: clubs, food, WeChat.", greeting: { "1-2": "你好！我叫小明。你叫什么？😄", "3-4": "嘿！你也是这个班的吗？我叫小明，你呢？😄", "5-6": "哎，你是新来的交换生吧？加个微信呗？😄" } },
  { id: "rent", title: "租房沟通", titleEn: "Renting", icon: "🏠", color: "#E67E22", bg: "#FEF5EC", identities: ["student","worker"], role: "You play a landlord. Teach: 房租, 押金, 水电费, 合同.", greeting: { "1-2": "你好！你要租房子吗？🏠", "3-4": "你好，你是来看房的吧？一室一厅，月租三千五。🏠", "5-6": "你好！朝南采光好，家电全新，租金三千五，押一付三。🏠" } },
  { id: "interview", title: "面试求职", titleEn: "Job interview", icon: "👔", color: "#34495E", bg: "#EDF0F2", identities: ["worker","student"], role: "You play an HR interviewer. Ask: self-intro, experience, salary.", greeting: { "1-2": "你好！请坐。你叫什么名字？💼", "3-4": "你好，请坐！我是张经理。先做个自我介绍吧。💼", "5-6": "你好，欢迎来面试。我是人力资源部张经理。请先做个自我介绍。💼" } },
  { id: "travel", title: "旅游订酒店", titleEn: "Travel & hotels", icon: "🏨", color: "#1ABC9C", bg: "#E8FAF6", identities: ["tourist","student"], role: "You play a hotel receptionist. Teach: 预订, 入住, 退房, 门票.", greeting: { "1-2": "你好！欢迎！你要住房间吗？🏨", "3-4": "欢迎来到北京大酒店！请问有预订吗？🏨", "5-6": "欢迎光临！请问您是网上预订还是现场办理？🏨" } },
  { id: "workplace", title: "职场沟通", titleEn: "Workplace", icon: "🏢", color: "#8E44AD", bg: "#F4ECF9", identities: ["worker"], role: "You play a colleague/manager. Topics: meetings, leave, projects.", greeting: { "1-2": "早上好！今天忙吗？🏢", "3-4": "早上好！下午三点有部门会议，准备好了吗？🏢", "5-6": "早！昨天方案客户反馈了，下午开会你汇报一下进度。🏢" } },
  { id: "sightseeing", title: "景点游览", titleEn: "Sightseeing", icon: "🏯", color: "#C0392B", bg: "#FBEEED", identities: ["tourist"], role: "You play a tour guide. Teach: 拍照, 排队, 纪念品.", greeting: { "1-2": "欢迎！这是长城！好看吗？🏯", "3-4": "欢迎来到长城！我是导游小李。🏯", "5-6": "各位游客朋友们，欢迎来到八达岭长城！🏯" } },
];

const SENTENCE_BANK = {
  "1-2": [
    { word: "喜欢", pinyin: "xǐhuan", meaning: "to like", hint: "Say something you like", example: "我喜欢吃中国菜。(Wǒ xǐhuan chī Zhōngguó cài.)" },
    { word: "想", pinyin: "xiǎng", meaning: "to want", hint: "Say what you want to do", example: "我想去北京。(Wǒ xiǎng qù Běijīng.)" },
    { word: "去", pinyin: "qù", meaning: "to go", hint: "Say where you go", example: "我明天去学校。(Wǒ míngtiān qù xuéxiào.)" },
    { word: "吃", pinyin: "chī", meaning: "to eat", hint: "Say what you eat", example: "我每天吃米饭。(Wǒ měitiān chī mǐfàn.)" },
    { word: "学习", pinyin: "xuéxí", meaning: "to study", hint: "Talk about studying", example: "我在学习中文。(Wǒ zài xuéxí Zhōngwén.)" },
    { word: "朋友", pinyin: "péngyou", meaning: "friend", hint: "Say something about a friend", example: "我的朋友很好。" },
    { word: "今天", pinyin: "jīntiān", meaning: "today", hint: "Say what you do today", example: "今天是星期一。" },
    { word: "很", pinyin: "hěn", meaning: "very", hint: "Describe something", example: "中文很有意思。" },
    { word: "在", pinyin: "zài", meaning: "at/in", hint: "Say where something is", example: "我在图书馆。" },
    { word: "买", pinyin: "mǎi", meaning: "to buy", hint: "Say what you buy", example: "我想买一本书。" },
  ],
  "3-4": [
    { word: "虽然……但是……", pinyin: "suīrán...dànshì...", meaning: "although...but...", hint: "Express a contrast", example: "虽然今天很冷，但是我还是出去跑步了。" },
    { word: "因为……所以……", pinyin: "yīnwèi...suǒyǐ...", meaning: "because...so...", hint: "Cause and effect", example: "因为下雨了，所以我没去公园。" },
    { word: "不但……而且……", pinyin: "búdàn...érqiě...", meaning: "not only...but also...", hint: "List two positives", example: "他不但会说中文，而且会说日语。" },
    { word: "越来越", pinyin: "yuè lái yuè", meaning: "more and more", hint: "Describe a trend", example: "我的中文越来越好了。" },
    { word: "一边……一边……", pinyin: "yībiān...yībiān...", meaning: "while...also...", hint: "Two actions at once", example: "她一边听音乐，一边做作业。" },
    { word: "除了……以外", pinyin: "chúle...yǐwài", meaning: "besides", hint: "List more things", example: "除了中文以外，我还学了法语。" },
    { word: "对……感兴趣", pinyin: "duì...gǎn xìngqù", meaning: "interested in", hint: "Your interests", example: "我对中国历史很感兴趣。" },
    { word: "只要……就……", pinyin: "zhǐyào...jiù...", meaning: "as long as", hint: "State a condition", example: "只要你努力，就一定能学好。" },
    { word: "把", pinyin: "bǎ", meaning: "把-construction", hint: "Act on an object", example: "请你把门关上。" },
    { word: "被", pinyin: "bèi", meaning: "passive", hint: "Passive voice", example: "我的手机被弟弟弄坏了。" },
  ],
  "5-6": [
    { word: "与其……不如……", pinyin: "yǔqí...bùrú...", meaning: "rather than...better to...", hint: "Compare options", example: "与其抱怨，不如行动起来。" },
    { word: "既……又……", pinyin: "jì...yòu...", meaning: "both...and...", hint: "Dual qualities", example: "这道菜既好吃又健康。" },
    { word: "不得不", pinyin: "bùdébù", meaning: "have no choice but to", hint: "Being forced", example: "飞机取消了，我不得不改签。" },
    { word: "何况", pinyin: "hékuàng", meaning: "let alone", hint: "Strengthen argument", example: "大人都觉得难，何况小孩子呢？" },
    { word: "难免", pinyin: "nánmiǎn", meaning: "inevitably", hint: "Unavoidable", example: "刚来中国，难免会想家。" },
    { word: "看来", pinyin: "kànlái", meaning: "it seems", hint: "Make inference", example: "看来今天的会议要取消了。" },
    { word: "即使……也……", pinyin: "jíshǐ...yě...", meaning: "even if...still...", hint: "Strong concession", example: "即使再忙，我也要坚持锻炼。" },
    { word: "恨不得", pinyin: "hènbude", meaning: "wish one could", hint: "Strong desire", example: "我恨不得马上飞回家。" },
    { word: "不见得", pinyin: "bújiàndé", meaning: "not necessarily", hint: "Polite disagreement", example: "贵的东西不见得就好。" },
    { word: "总而言之", pinyin: "zǒng ér yán zhī", meaning: "in conclusion", hint: "Summarize", example: "总而言之，学语言需要坚持。" },
  ]
};

const PRONUNCIATION_BANK = {
  "1-2": [
    { sentence: "你好吗？", pinyin: "Nǐ hǎo ma?", translation: "How are you?" },
    { sentence: "我是学生。", pinyin: "Wǒ shì xuéshēng.", translation: "I am a student." },
    { sentence: "谢谢你！", pinyin: "Xièxie nǐ!", translation: "Thank you!" },
    { sentence: "这个多少钱？", pinyin: "Zhège duōshao qián?", translation: "How much?" },
    { sentence: "我想喝水。", pinyin: "Wǒ xiǎng hē shuǐ.", translation: "I want water." },
    { sentence: "今天很热。", pinyin: "Jīntiān hěn rè.", translation: "It's hot today." },
    { sentence: "你叫什么名字？", pinyin: "Nǐ jiào shénme míngzi?", translation: "What's your name?" },
    { sentence: "我不知道。", pinyin: "Wǒ bù zhīdào.", translation: "I don't know." },
    { sentence: "请再说一次。", pinyin: "Qǐng zài shuō yī cì.", translation: "Say it again." },
    { sentence: "我很高兴认识你。", pinyin: "Wǒ hěn gāoxìng rènshi nǐ.", translation: "Nice to meet you." },
  ],
  "3-4": [
    { sentence: "今天天气不错，适合出去走走。", pinyin: "Jīntiān tiānqì búcuò, shìhé chūqù zǒuzou.", translation: "Nice weather for a walk." },
    { sentence: "你能帮我一个忙吗？", pinyin: "Nǐ néng bāng wǒ yī gè máng ma?", translation: "Can you help me?" },
    { sentence: "我对中国文化特别感兴趣。", pinyin: "Wǒ duì Zhōngguó wénhuà tèbié gǎn xìngqù.", translation: "I'm interested in Chinese culture." },
    { sentence: "虽然很累，但是我很开心。", pinyin: "Suīrán hěn lèi, dànshì wǒ hěn kāixīn.", translation: "Tired but happy." },
    { sentence: "请问附近有没有地铁站？", pinyin: "Qǐngwèn fùjìn yǒu méiyǒu dìtiě zhàn?", translation: "Subway nearby?" },
    { sentence: "我昨天看了一部很有意思的电影。", pinyin: "Wǒ zuótiān kànle yī bù hěn yǒu yìsi de diànyǐng.", translation: "Watched an interesting movie." },
    { sentence: "如果明天下雨，我们就不去了。", pinyin: "Rúguǒ míngtiān xiàyǔ, wǒmen jiù bú qù le.", translation: "If it rains, we won't go." },
    { sentence: "这道菜又好吃又便宜。", pinyin: "Zhè dào cài yòu hǎochī yòu piányi.", translation: "Delicious and cheap." },
    { sentence: "他比我大三岁。", pinyin: "Tā bǐ wǒ dà sān suì.", translation: "3 years older." },
    { sentence: "我已经在中国住了两年了。", pinyin: "Wǒ yǐjīng zài Zhōngguó zhùle liǎng nián le.", translation: "Lived in China 2 years." },
  ],
  "5-6": [
    { sentence: "不管遇到什么困难，都不应该轻易放弃。", pinyin: "Bùguǎn yù dào shénme kùnnan, dōu bù yīnggāi qīngyì fàngqì.", translation: "Never give up." },
    { sentence: "与其抱怨环境，不如改变自己。", pinyin: "Yǔqí bàoyuàn huánjìng, bùrú gǎibiàn zìjǐ.", translation: "Change yourself." },
    { sentence: "这件事说起来容易，做起来难。", pinyin: "Zhè jiàn shì shuō qǐlái róngyì, zuò qǐlái nán.", translation: "Easier said than done." },
    { sentence: "他的成功并非偶然，而是努力的结果。", pinyin: "Tā de chénggōng bìngfēi ǒurán, ér shì nǔlì de jiéguǒ.", translation: "Success from effort." },
    { sentence: "随着科技的发展，生活发生了巨大变化。", pinyin: "Suízhe kējì de fāzhǎn, shēnghuó fāshēngle jùdà biànhuà.", translation: "Tech changed life." },
    { sentence: "入乡随俗，要尊重当地风俗习惯。", pinyin: "Rù xiāng suí sú, yào zūnzhòng dāngdì fēngsú xíguàn.", translation: "When in Rome..." },
    { sentence: "这个问题值得深入思考和讨论。", pinyin: "Zhège wèntí zhídé shēnrù sīkǎo hé tǎolùn.", translation: "Worth deep thought." },
    { sentence: "塞翁失马，焉知非福。", pinyin: "Sài wēng shī mǎ, yān zhī fēi fú.", translation: "A blessing in disguise." },
    { sentence: "只有不断学习，才能跟上时代。", pinyin: "Zhǐyǒu búduàn xuéxí, cáinéng gēnshàng shídài.", translation: "Keep learning." },
    { sentence: "他不但没生气，反而笑着安慰了我。", pinyin: "Tā búdàn méi shēngqì, fǎn'ér xiàozhe ānwèile wǒ.", translation: "Comforted with a smile." },
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
  const speak=useCallback(t=>{const c=clean(t).replace(/\(.*?\)/g,"");const sy=window.speechSynthesis;sy.cancel();const u=new SpeechSynthesisUtterance(c);u.lang="zh-CN";u.rate=0.85;u.onstart=()=>sS(true);u.onend=()=>sS(false);u.onerror=()=>sS(false);sy.speak(u);},[]);
  const stopS=useCallback(()=>{window.speechSynthesis.cancel();sS(false);},[]);
  return{listening:l,speaking:s,startListening:start,stopListening:stop,speak,stopSpeaking:stopS};
}

/* ═══════════════════════════════════════════
   LAYOUT WRAPPER — centers content responsively
   ═══════════════════════════════════════════ */

function PageWrap({children, wide}){
  return <div style={{padding:"0 20px",maxWidth:wide?720:580,margin:"0 auto",width:"100%"}}>{children}</div>;
}

/* ═══════════════════════════════════════════
   TOP BAR
   ═══════════════════════════════════════════ */

function TopBar({title,subtitle,onBack,hskLevel,onChangeHSK}){
  const[open,setOpen]=useState(false);const lv=HSK_LEVELS.find(l=>l.id===hskLevel);
  return(<div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12,background:"#fff",borderBottom:"1px solid #f0efe8",position:"sticky",top:0,zIndex:20}}>
    {onBack&&<button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",borderRadius:8}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>}
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:17,fontWeight:600,color:"#1a1a1a"}}>{title}</div>{subtitle&&<div style={{fontSize:12,color:"#999"}}>{subtitle}</div>}</div>
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(!open)} style={{background:lv.color+"14",border:`1px solid ${lv.color}30`,borderRadius:20,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:600,color:lv.color,fontFamily:"inherit"}}>{lv.emoji} {lv.label}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={lv.color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
      {open&&<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:30}}/><div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:31,overflow:"hidden",minWidth:180}}>{HSK_LEVELS.map(l=><button key={l.id} onClick={()=>{onChangeHSK(l.id);setOpen(false);}} style={{width:"100%",padding:"12px 16px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:l.id===hskLevel?l.color+"10":"transparent",fontFamily:"inherit",textAlign:"left"}}><span style={{fontSize:18}}>{l.emoji}</span><div><div style={{fontSize:14,fontWeight:600,color:l.id===hskLevel?l.color:"#1a1a1a"}}>{l.label}</div><div style={{fontSize:12,color:"#999"}}>{l.sub}</div></div>{l.id===hskLevel&&<svg width="16" height="16" viewBox="0 0 24 24" fill={l.color} style={{marginLeft:"auto"}}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}</button>)}</div></>}
    </div>
  </div>);
}

/* ═══════════════════════════════════════════
   DRILL VIEW
   ═══════════════════════════════════════════ */

function DrillView({type,hskLevel,onBack,onChangeHSK}){
  const bank=type==="sentence"?SENTENCE_BANK[hskLevel]:PRONUNCIATION_BANK[hskLevel];
  const[idx,setIdx]=useState(0);const[input,setInput]=useState("");const[feedback,setFeedback]=useState(null);
  const[loading,setLoading]=useState(false);const[scores,setScores]=useState([]);const[done,setDone]=useState(false);
  const{listening,speaking,startListening,stopListening,speak,stopSpeaking}=useSpeech();
  const fbRef=useRef(null);const isSen=type==="sentence";const q=bank[idx];const total=bank.length;
  const color=isSen?"#4A90D9":"#7B6CF6";const bg=isSen?"#EEF4FB":"#F3F0FF";

  useEffect(()=>{if(feedback&&fbRef.current)fbRef.current.scrollIntoView({behavior:"smooth"});},[feedback]);

  const submit=async(text)=>{
    if(!text.trim()||loading)return;setInput(text.trim());setLoading(true);setFeedback(null);
    const sys=isSen
      ?`Grade this Chinese sentence. Word: "${q.word}". Student wrote: "${text.trim()}". ${HSK_PROMPT[hskLevel]} Reply ONLY:\nSCORE: [0-100]\nFEEDBACK: [1 sentence]\nCORRECTION: [corrected version or "None"]`
      :`Grade pronunciation. Target: "${q.sentence}". Student said: "${text.trim()}". Reply ONLY:\nSCORE: [0-100]\nFEEDBACK: [1 sentence]\nISSUES: [wrong characters or "None"]`;
    try{const raw=await callAI(sys,[{role:"user",content:text.trim()}],300);const reply=clean(raw);const m=reply.match(/SCORE:\s*(\d+)/i);const score=m?Math.min(parseInt(m[1]),100):70;
      setFeedback({text:reply.replace(/SCORE:\s*\d+\s*/i,"").trim(),score});setScores(p=>[...p,score]);
    }catch{setFeedback({text:"Network error, please tap 'Next' and try the next question.",score:0});}setLoading(false);
  };

  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);submit(t);});};
  const next=()=>{if(idx+1>=total){setDone(true);return;}setIdx(idx+1);setInput("");setFeedback(null);};
  const restart=()=>{setIdx(0);setInput("");setFeedback(null);setScores([]);setDone(false);};

  if(done){const validScores=scores.filter(s=>s>0);const avg=validScores.length?Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length):0;const emoji=avg>=90?"🌟":avg>=80?"👏":avg>=70?"👍":avg>=60?"💪":"📚";
    return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title={isSen?"造句练习":"语音测评"} subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
      <PageWrap><div style={{padding:"32px 0",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12}}>{emoji}</div>
        <div style={{fontSize:48,fontWeight:700,color,marginBottom:4}}>{avg}<span style={{fontSize:20,color:"#999"}}>/100</span></div>
        <div style={{fontSize:15,color:"#888",marginBottom:28}}>Average across {validScores.length} questions</div>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #f0efe8",overflow:"hidden",marginBottom:24,textAlign:"left"}}>{scores.map((s,i)=><div key={i} style={{padding:"14px 18px",borderBottom:i<scores.length-1?"1px solid #f7f6f1":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,color:"#666"}}>Q{i+1}. {isSen?bank[i].word:bank[i].sentence.slice(0,15)+"…"}</div><div style={{fontSize:15,fontWeight:600,color:s>=80?"#2DAA6E":s>=60?"#E8A838":s>0?"#D4413A":"#ccc"}}>{s>0?s:"—"}</div></div>)}</div>
        <div style={{display:"flex",gap:10}}><button onClick={restart} style={{flex:1,padding:16,borderRadius:12,border:`1.5px solid ${color}`,background:"transparent",color,fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Try again</button><button onClick={onBack} style={{flex:1,padding:16,borderRadius:12,border:"none",background:color,color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Back</button></div>
      </div></PageWrap></div>);
  }

  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title={isSen?"造句练习":"语音测评"} subtitle={isSen?"Sentence building":"Pronunciation"} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"20px 0 140px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><div style={{flex:1,height:6,background:"#ebe9e1",borderRadius:3,overflow:"hidden"}}><div style={{width:`${((idx+(feedback?1:0))/total)*100}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.4s"}}/></div><span style={{fontSize:13,color:"#999",fontWeight:600}}>{idx+1}/{total}</span></div>
      <div style={{background:"#fff",borderRadius:16,border:"1px solid #f0efe8",padding:"28px 24px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.03)"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#bbb",textTransform:"uppercase",letterSpacing:1,marginBottom:16}}>{isSen?"Use this word to make a sentence":"Read this sentence aloud"}</div>
        {isSen?<><div style={{fontSize:30,fontWeight:700,color:"#1a1a1a",marginBottom:8}}>{q.word}</div><div style={{fontSize:15,color,marginBottom:4}}>{q.pinyin} — {q.meaning}</div><div style={{fontSize:14,color:"#999",fontStyle:"italic"}}>Hint: {q.hint}</div></>
        :<><div style={{fontSize:26,fontWeight:700,color:"#1a1a1a",marginBottom:8,lineHeight:1.5}}>{q.sentence}</div><div style={{fontSize:15,color,marginBottom:4}}>{q.pinyin}</div><div style={{fontSize:14,color:"#999"}}>{q.translation}</div>
          <button onClick={()=>speaking?stopSpeaking():speak(q.sentence)} style={{marginTop:14,background:bg,border:`1px solid ${color}30`,borderRadius:20,padding:"8px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color,fontFamily:"inherit"}}><svg width="13" height="13" viewBox="0 0 24 24" fill={color}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>{speaking?"Stop":"Listen"}</button></>}
      </div>
      {feedback&&<div ref={fbRef}>
        <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${feedback.score>=80?"#2DAA6E40":feedback.score>=60?"#E8A83840":"#D4413A40"}`,padding:22,marginBottom:14,animation:"su 0.3s both"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:14,fontWeight:600,color:"#888"}}>AI feedback</span><div style={{background:feedback.score>=80?"#EDFAF3":feedback.score>=60?"#FFF8ED":"#FDF0EF",borderRadius:20,padding:"5px 16px",fontSize:17,fontWeight:700,color:feedback.score>=80?"#2DAA6E":feedback.score>=60?"#E8A838":"#D4413A"}}>{feedback.score>0?feedback.score+"/100":"Error"}</div></div>
          {input&&<div style={{fontSize:14,color:"#888",marginBottom:10}}>Your answer: <span style={{color:"#1a1a1a"}}>{input}</span></div>}
          <div style={{fontSize:15,color:"#444",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{feedback.text}</div>
        </div>
        <div style={{background:bg,borderRadius:14,padding:"18px 20px",marginBottom:20,borderLeft:`3px solid ${color}`}}><div style={{fontSize:12,fontWeight:600,color,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Reference example</div><div style={{fontSize:16,color:"#1a1a1a",lineHeight:1.7}}>{q.example||q.sentence}</div></div>
        <button onClick={next} style={{width:"100%",padding:16,borderRadius:12,border:"none",background:color,color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{idx+1>=total?"See results →":"Next question →"}</button>
      </div>}
      {loading&&<div style={{textAlign:"center",padding:24}}><div style={{display:"inline-flex",gap:5}}>{[0,1,2].map(j=><div key={j} style={{width:8,height:8,borderRadius:"50%",background:color,animation:`dp 1.2s ${j*0.2}s infinite`}}/>)}</div><div style={{fontSize:13,color:"#999",marginTop:8}}>AI grading...</div></div>}
    </div></PageWrap>
    {!feedback&&!loading&&<div style={{position:"fixed",bottom:0,left:0,right:0,padding:"14px 20px",background:"#fff",borderTop:"1px solid #f0efe8",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:580}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit(input)} placeholder={isSen?"Type your sentence...":"Tap mic or type..."} style={{flex:1,padding:"14px 18px",borderRadius:24,border:"1px solid #e8e6de",background:"#FAFAF7",fontSize:15,outline:"none",color:"#1a1a1a",fontFamily:"inherit"}}/>
      {!isSen&&<button onClick={handleMic} style={{width:48,height:48,borderRadius:"50%",background:listening?color:"transparent",border:`2px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",animation:listening?"pulse 1.5s infinite":"none",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill={listening?"#fff":color}><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></button>}
      <button onClick={()=>submit(input)} disabled={!input.trim()} style={{width:48,height:48,borderRadius:"50%",background:input.trim()?color:"#e8e6de",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()?"pointer":"default",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div></div>}
  </div>);
}

/* ═══════════════════════════════════════════
   CHAT VIEW
   ═══════════════════════════════════════════ */

function ChatView({module,hskLevel,onBack,onChangeHSK,showVoice=true}){
  const[messages,setMessages]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);
  const endRef=useRef(null);const{listening,speaking,startListening,stopListening,speak,stopSpeaking}=useSpeech();
  useEffect(()=>{const g=typeof module.greeting==="object"?module.greeting[hskLevel]:module.greeting;setMessages([{role:"assistant",content:g}]);},[module.id]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  const sys=()=>`You are a Chinese language coach.\n${HSK_PROMPT[hskLevel]}\nROLE: ${module.system||module.role||""}\nRULES: Stay in character, 2-3 sentences max, correct gently. No markdown.`;
  const send=async(text)=>{if(!text.trim()||loading)return;const u={role:"user",content:text.trim()};const up=[...messages,u];setMessages(up);setInput("");setLoading(true);
    try{const raw=await callAI(sys(),up.map(m=>({role:m.role,content:m.content})),800);setMessages(p=>[...p,{role:"assistant",content:clean(raw||"Sorry, try again.")}]);}
    catch{setMessages(p=>[...p,{role:"assistant",content:"Network error. Please try again."}]);}setLoading(false);};
  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);send(t);});};
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
    <TopBar title={module.title} subtitle={module.titleEn} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <div style={{flex:1,overflowY:"auto",padding:"16px 20px 120px",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{width:"100%",maxWidth:640}}>
      {messages.map((msg,i)=><div key={i} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",marginBottom:14,alignItems:"flex-end",gap:8}}>
        {msg.role==="assistant"&&<div style={{width:32,height:32,borderRadius:"50%",background:module.bg||"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{module.icon}</div>}
        <div style={{maxWidth:"75%",display:"flex",flexDirection:"column",gap:4}}>
          <div style={{padding:"12px 16px",background:msg.role==="user"?(module.color||"#4A90D9"):"#fff",color:msg.role==="user"?"#fff":"#1a1a1a",borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",fontSize:15,lineHeight:1.7,whiteSpace:"pre-wrap",boxShadow:msg.role==="user"?"none":"0 1px 3px rgba(0,0,0,0.04)",border:msg.role==="user"?"none":"1px solid #f0efe8"}}>{msg.content}</div>
          {msg.role==="assistant"&&showVoice&&<button onClick={()=>speaking?stopSpeaking():speak(msg.content)} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 6px",display:"flex",alignItems:"center",gap:5,opacity:0.5,alignSelf:"flex-start"}}><svg width="14" height="14" viewBox="0 0 24 24" fill={speaking?(module.color||"#E8A838"):"#888"}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg><span style={{fontSize:12,color:"#999"}}>{speaking?"Stop":"Play"}</span></button>}
        </div>
      </div>)}
      {loading&&<div style={{display:"flex",gap:6,alignItems:"center",padding:"8px 0"}}><div style={{width:32,height:32,borderRadius:"50%",background:module.bg||"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{module.icon}</div><div style={{background:"#fff",borderRadius:16,padding:"12px 18px",border:"1px solid #f0efe8",display:"flex",gap:5}}>{[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"#ccc",animation:`dp 1.2s ${j*0.2}s infinite`}}/>)}</div></div>}
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
   MENU ITEM COMPONENT
   ═══════════════════════════════════════════ */

function MenuItem({item, onClick, hovered, onHover, badge}){
  return <div onClick={onClick} onMouseEnter={()=>onHover(item.id)} onMouseLeave={()=>onHover(null)}
    style={{background:"#fff",borderRadius:16,padding:"20px 22px",cursor:"pointer",border:`1px solid ${hovered===item.id?item.color+"50":"#f0efe8"}`,transition:"all 0.25s",transform:hovered===item.id?"translateY(-2px)":"none",boxShadow:hovered===item.id?`0 6px 18px ${item.color}12`:"0 1px 3px rgba(0,0,0,0.02)",display:"flex",alignItems:"center",gap:16}}>
    <div style={{width:52,height:52,borderRadius:14,background:item.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,transition:"transform 0.2s",transform:hovered===item.id?"scale(1.06)":"none"}}>{item.icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:17,fontWeight:600,color:"#1a1a1a"}}>{item.title}</span>{badge&&<span style={{fontSize:11,background:item.color+"18",color:item.color,padding:"2px 10px",borderRadius:10,fontWeight:600}}>{badge}</span>}</div>
      <div style={{fontSize:12,color:"#aaa",marginTop:2}}>{item.titleEn}</div>
      {item.desc&&<div style={{fontSize:13,color:"#888",marginTop:4}}>{item.desc}</div>}
    </div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={hovered===item.id?item.color:"#ccc"} strokeWidth="2" style={{flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
  </div>;
}

/* ═══════════════════════════════════════════
   PAGE SCREENS
   ═══════════════════════════════════════════ */

function HSKSelect({onSelect}){const[h,sH]=useState(null);return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
  <div style={{width:72,height:72,borderRadius:20,background:"linear-gradient(135deg,#E8A838,#D4413A)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:22,boxShadow:"0 8px 24px rgba(232,168,56,0.25)"}}><span style={{fontSize:34,color:"#fff",fontWeight:700}}>说</span></div>
  <h1 style={{fontSize:26,fontWeight:700,color:"#1a1a1a",margin:"0 0 6px"}}>SpeakWise 说慧</h1>
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

function MainMenu({hskLevel,onChangeHSK,onNav}){const[h,sH]=useState(null);const isMobile=useIsMobile();
  const sec=[{id:"oral",title:"口语练习",titleEn:"Oral practice",icon:"🗣️",color:"#E8A838",bg:"#FFF8ED",desc:"场景模拟 · 语音测评 · 自由对话"},{id:"written",title:"书面语练习",titleEn:"Written practice",icon:"📖",color:"#7B6CF6",bg:"#F3F0FF",desc:"造句 · 段落写作 · 短文写作"}];
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="SpeakWise 说慧" subtitle="AI Chinese language coach" hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"32px 0 40px"}}>
      <p style={{fontSize:22,fontWeight:600,color:"#1a1a1a",margin:"0 0 28px",lineHeight:1.4}}>Hi! 👋 What would you<br/>like to practice?</p>
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:16}}>
        {sec.map((s,i)=><div key={s.id} onClick={()=>onNav(s.id)} onMouseEnter={()=>sH(s.id)} onMouseLeave={()=>sH(null)}
          style={{flex:1,background:"#fff",borderRadius:18,padding:"26px 24px",cursor:"pointer",border:`1.5px solid ${h===s.id?s.color+"60":"#f0efe8"}`,transition:"all 0.3s",transform:h===s.id?"translateY(-3px)":"none",boxShadow:h===s.id?`0 10px 28px ${s.color}15`:"0 1px 3px rgba(0,0,0,0.03)",animation:`su 0.5s ${i*0.12}s both`}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:56,height:56,borderRadius:16,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{s.icon}</div><div><div style={{fontSize:20,fontWeight:600,color:"#1a1a1a"}}>{s.title}</div><div style={{fontSize:13,color:"#aaa"}}>{s.titleEn}</div></div></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,color:"#666"}}>{s.desc}</div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={h===s.id?s.color:"#ccc"} strokeWidth="2" style={{flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>)}
      </div>
      <div style={{marginTop:24,padding:"14px 18px",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",display:"flex",alignItems:"center",gap:10}}><span>💡</span><p style={{fontSize:13,color:"#999",margin:0}}>Use Chrome for voice. Tap mic to speak Chinese!</p></div>
      <div style={{marginTop:18,textAlign:"center",fontSize:12,color:"#d0d0d0"}}>Powered by Claude AI · SRTP Project</div>
    </div></PageWrap></div>);}

function OralMenu({hskLevel,onChangeHSK,onBack,onNav}){const[h,sH]=useState(null);
  const items=[
    {id:"scenes",title:"场景模拟",titleEn:"Scenarios",icon:"🎭",color:"#E8A838",bg:"#FFF8ED",desc:"Real-life role play"},
    {id:"assess",title:"语音测评",titleEn:"Pronunciation",icon:"🎯",color:"#7B6CF6",bg:"#F3F0FF",desc:"10 questions, AI scores"},
    {id:"free",title:"自由对话",titleEn:"Free chat",icon:"💬",color:"#2DAA6E",bg:"#EDFAF3",desc:"Chat freely with AI"}];
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="口语练习" subtitle="Oral practice" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"24px 0",display:"flex",flexDirection:"column",gap:12}}>
      {items.map(it=><MenuItem key={it.id} item={it} onClick={()=>onNav(it.id)} hovered={h} onHover={sH}/>)}
    </div></PageWrap></div>);}

function SceneList({hskLevel,onChangeHSK,onBack,onSelect}){const[filter,setFilter]=useState("all");const[h,sH]=useState(null);const isMobile=useIsMobile();
  const filtered=filter==="all"?SCENARIOS:SCENARIOS.filter(s=>s.identities.includes(filter));
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="场景模拟" subtitle="Scenarios" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap wide>
    <div style={{padding:"14px 0 6px",display:"flex",gap:8,overflowX:"auto"}}>{IDENTITY_FILTERS.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:"7px 18px",borderRadius:20,border:"1px solid",borderColor:filter===f.id?"#E8A838":"#ebe9e1",background:filter===f.id?"#E8A83814":"#fff",color:filter===f.id?"#E8A838":"#888",fontSize:14,fontWeight:filter===f.id?600:400,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{f.label}</button>)}</div>
    <div style={{padding:"14px 0 40px"}}><div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:12}}>
      {filtered.map((s,i)=><div key={s.id} onClick={()=>onSelect(s)} onMouseEnter={()=>sH(s.id)} onMouseLeave={()=>sH(null)} style={{background:"#fff",borderRadius:16,padding:"18px 16px",cursor:"pointer",border:`1px solid ${h===s.id?s.color+"50":"#f0efe8"}`,transition:"all 0.25s",transform:h===s.id?"translateY(-2px)":"none",animation:`su 0.3s ${i*0.04}s both`}}>
        <div style={{width:44,height:44,borderRadius:12,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,marginBottom:12}}>{s.icon}</div>
        <div style={{fontSize:16,fontWeight:600,color:"#1a1a1a",marginBottom:3}}>{s.title}</div><div style={{fontSize:12,color:"#aaa"}}>{s.titleEn}</div>
      </div>)}
    </div></div>
    </PageWrap></div>);}

function WrittenMenu({hskLevel,onChangeHSK,onBack,onSelect}){const[h,sH]=useState(null);
  const modes=[
    {id:"sentence",title:"造句练习",titleEn:"Sentences",icon:"✏️",color:"#4A90D9",bg:"#EEF4FB",desc:"10 questions, AI grades"},
    {id:"paragraph",title:"段落写作",titleEn:"Paragraphs",icon:"📝",color:"#E8A838",bg:"#FFF8ED",desc:"Write on a topic"},
    {id:"essay",title:"短文写作",titleEn:"Essays",icon:"📄",color:"#7B6CF6",bg:"#F3F0FF",desc:"Full essay, detailed feedback"}];
  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title="书面语练习" subtitle="Written practice" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
    <PageWrap><div style={{padding:"24px 0",display:"flex",flexDirection:"column",gap:12}}>
      {modes.map(m=><MenuItem key={m.id} item={m} onClick={()=>onSelect(m)} hovered={h} onHover={sH} badge={m.id==="sentence"?"10Q":null}/>)}
    </div></PageWrap></div>);}

/* ═══════════════════════════════════════════
   MODULE BUILDERS
   ═══════════════════════════════════════════ */

function buildFreeModule(hsk){return{id:"free",title:"自由对话",titleEn:"Free chat",icon:"💬",color:"#2DAA6E",bg:"#EDFAF3",system:"Friendly Chinese conversation partner. Chat naturally, correct gently.",greeting:hsk==="1-2"?"你好！😊\n(Nǐ hǎo!)\n\n你叫什么名字？\n(Nǐ jiào shénme míngzi?)":hsk==="3-4"?"嘿！你好呀！😊\n\n你今天过得怎么样？\n(Nǐ jīntiān guò de zěnmeyàng?)":"嘿！今天想聊点什么？😊\n\n最近有什么有意思的事儿吗？"};}
function buildWritingChat(mode,hsk){const c={paragraph:{title:"段落写作",titleEn:"Paragraphs",icon:"📝",color:"#E8A838",bg:"#FFF8ED",system:"Chinese writing coach. Review paragraphs, give feedback. No markdown.",greeting:hsk==="1-2"?"Paragraph practice! 📝\n\nWrite 3-4 sentences:\n\n我的一天 \"My day\"":hsk==="3-4"?"Paragraph writing! 📝\n\nWrite 4-5 sentences:\n\n我最喜欢的城市 \"My favorite city\"":"Paragraph writing! 📝\n\nWrite 5-6 sentences:\n\n网络社交对人际关系的影响"},essay:{title:"短文写作",titleEn:"Essays",icon:"📄",color:"#7B6CF6",bg:"#F3F0FF",system:"Chinese essay coach. Score /100, detailed feedback. No markdown.",greeting:hsk==="1-2"?"Essay practice! 📄\n\nWrite 5-6 sentences:\n\n我的家人 \"My family\"":hsk==="3-4"?"Essay writing! 📄\n\nWrite 8-10 sentences:\n\n一次难忘的旅行 \"An unforgettable trip\"":"Essay writing! 📄\n\nWrite 150-200 chars:\n\n传统文化在现代社会中的角色"}};return c[mode];}

/* ═══════════════════════════════════════════
   APP ROOT
   ═══════════════════════════════════════════ */

export default function App(){
  const[hsk,setHsk]=useState(null);const[view,setView]=useState("hsk");
  const[chatMod,setChatMod]=useState(null);const[chatVoice,setChatVoice]=useState(true);const[chatParent,setChatParent]=useState("oral");
  const[drillType,setDrillType]=useState(null);const[drillParent,setDrillParent]=useState("oral");
  const openChat=(m,v,p)=>{setChatMod(m);setChatVoice(v);setChatParent(p);setView("chat");};
  const openDrill=(t,p)=>{setDrillType(t);setDrillParent(p);setView("drill");};
  const oralNav=id=>{if(id==="scenes")setView("scenes");else if(id==="assess")openDrill("pronunciation","oral");else if(id==="free")openChat(buildFreeModule(hsk),true,"oral");};
  const sceneSelect=s=>openChat({...s,system:`SCENARIO: ${s.role}\nStay in character, 2-3 sentences, correct gently. No markdown.`,greeting:s.greeting[hsk]||s.greeting["3-4"]},true,"scenes");
  const writingSelect=m=>{if(m.id==="sentence")openDrill("sentence","written");else openChat(buildWritingChat(m.id,hsk),false,"written");};
  return(<><style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap');@keyframes su{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0.12)}50%{box-shadow:0 0 0 12px rgba(0,0,0,0)}}@keyframes dp{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}*{box-sizing:border-box;margin:0}body{font-family:'Noto Sans SC',sans-serif}`}</style>
    {view==="hsk"&&<HSKSelect onSelect={l=>{setHsk(l);setView("main");}}/>}
    {view==="main"&&<MainMenu hskLevel={hsk} onChangeHSK={setHsk} onNav={id=>setView(id==="oral"?"oral":"written")}/>}
    {view==="oral"&&<OralMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")} onNav={oralNav}/>}
    {view==="scenes"&&<SceneList hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("oral")} onSelect={sceneSelect}/>}
    {view==="written"&&<WrittenMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")} onSelect={writingSelect}/>}
    {view==="chat"&&chatMod&&<ChatView module={chatMod} hskLevel={hsk} onBack={()=>setView(chatParent)} onChangeHSK={setHsk} showVoice={chatVoice}/>}
    {view==="drill"&&<DrillView type={drillType} hskLevel={hsk} onBack={()=>setView(drillParent)} onChangeHSK={setHsk}/>}
  </>);
}
