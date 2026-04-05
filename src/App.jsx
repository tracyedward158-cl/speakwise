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
   DATA & KNOWLEDGE BASE (100% 完整，未删减)
   ═══════════════════════════════════════════ */

const HSK_LEVELS = [
  { id: "1-3", label: "初等 HSK 1-3", sub: "Beginner", desc: "基础交流、拼音与简单句", color: "#2DAA6E", emoji: "🌱" },
  { id: "4-6", label: "中等 HSK 4-6", sub: "Intermediate", desc: "日常交际、表达观点与意图", color: "#E8A838", emoji: "🌿" },
  { id: "7-9", label: "高等 HSK 7-9", sub: "Advanced", desc: "复杂话题讨论、高级书面语体", color: "#7B6CF6", emoji: "🌳" },
];

const HSK_PROMPT = {
  "1-3": "Student is HSK 1-3 beginner. Use basic vocab and short sentences.",
  "4-6": "Student is HSK 4-6 intermediate. Use common vocab and moderate complexity.",
  "7-9": "Student is HSK 7-9 advanced. Use rich vocab, idioms, and complex grammar.",
};

const IDENTITY_FILTERS = [
  { id: "all", label: "全部" }, { id: "student", label: "留学生" },
  { id: "worker", label: "上班族" }, { id: "tourist", label: "游客" },
];

const SCENARIOS = [
  { id: "restaurant", title: "餐厅点餐", titleEn: "Order food", icon: "🍜", color: "#E8A838", bg: "#FFF8ED", identities: ["student","worker","tourist"], role: "You play a restaurant waiter.", greeting: { "1-3": "汉字: 你好！你想吃什么？\n拼音: Nǐ hǎo! Nǐ xiǎng chī shénme?\n英文: Hello! What do you want to eat?", "4-6": "汉字: 欢迎光临！请问几位？\n拼音: Huānyíng guānglín! Qǐngwèn jǐ wèi?\n英文: Welcome! How many guests?", "7-9": "汉字: 欢迎光临！请问有预订吗？\n拼音: Huānyíng guānglín! Qǐngwèn yǒu yùdìng ma?\n英文: Welcome! Do you have a reservation?" } },
  { id: "directions", title: "问路 / 打车", titleEn: "Directions & taxi", icon: "🚕", color: "#4A90D9", bg: "#EEF4FB", identities: ["student","worker","tourist"], role: "You play a taxi driver or passerby giving directions.", greeting: { "1-3": "汉字: 你好！你去哪里？\n拼音: Nǐ hǎo! Nǐ qù nǎlǐ?\n英文: Hello! Where are you going?", "4-6": "汉字: 你好！我是司机。请问你去哪儿？\n拼音: Nǐ hǎo! Wǒ shì sījī. Qǐngwèn nǐ qù nǎr?\n英文: Hello! I'm the driver. Where are you going?", "7-9": "汉字: 您好，去哪儿？现在有点堵车，走三环行吗？\n拼音: Nín hǎo, qù nǎr? Xiànzài yǒudiǎn dǔchē, zǒu sān huán xíng ma?\n英文: Hello, where to? It's a bit jammed now, is the 3rd Ring Road okay?" } },
  { id: "hospital", title: "看病 / 去药店", titleEn: "Doctor & pharmacy", icon: "🏥", color: "#D4413A", bg: "#FDF0EF", identities: ["student","worker","tourist"], role: "You play a doctor or pharmacist.", greeting: { "1-3": "汉字: 你好！你哪里不舒服？\n拼音: Nǐ hǎo! Nǐ nǎlǐ bù shūfu?\n英文: Hello! Where do you feel uncomfortable?", "4-6": "汉字: 你好，请坐。你今天哪里不舒服？\n拼音: Nǐ hǎo, qǐng zuò. Nǐ jīntiān nǎlǐ bù shūfu?\n英文: Hello, please sit. What's wrong today?", "7-9": "汉字: 你好，请坐。我看下挂号信息，哪里不舒服？\n拼音: Nǐ hǎo, qǐng zuò. Wǒ kàn xià guàhào xìnxī, nǎlǐ bù shūfu?\n英文: Hello, please sit. Let me check your registration, what seems to be the problem?" } },
  { id: "shopping", title: "购物 / 砍价", titleEn: "Shopping", icon: "🛍️", color: "#9B59B6", bg: "#F5F0FA", identities: ["student","worker","tourist"], role: "You play a market vendor.", greeting: { "1-3": "汉字: 你好！你要买什么？\n拼音: Nǐ hǎo! Nǐ yào mǎi shénme?\n英文: Hello! What do you want to buy?", "4-6": "汉字: 来看看！今天水果很新鲜！\n拼音: Lái kànkàn! Jīntiān shuǐguǒ hěn xīnxiān!\n英文: Come look! The fruit is very fresh today!", "7-9": "汉字: 看看吧！自家种的纯天然！买两斤送半斤！\n拼音: Kànkàn ba! Zìjiā zhòng de chún tiānrán! Mǎi liǎng jīn sòng bàn jīn!\n英文: Take a look! Homegrown and organic! Buy two jin, get half a jin free!" } },
  { id: "social", title: "校园社交", titleEn: "Making friends", icon: "👋", color: "#2DAA6E", bg: "#EDFAF3", identities: ["student"], role: "You play a friendly Chinese classmate.", greeting: { "1-3": "汉字: 你好！我叫小明。你叫什么？\n拼音: Nǐ hǎo! Wǒ jiào Xiǎo Míng. Nǐ jiào shénme?\n英文: Hello! My name is Xiao Ming. What is your name?", "4-6": "汉字: 嘿！你也是这个班的吗？我叫小明，你呢？\n拼音: Hēi! Nǐ yě shì zhège bān de ma? Wǒ jiào Xiǎo Míng, nǐ ne?\n英文: Hey! Are you in this class too? I'm Xiao Ming, and you?", "7-9": "汉字: 哎，你是新来的交换生吧？加个微信呗？\n拼音: Āi, nǐ shì xīn lái de jiāohuànshēng ba? Jiā gè wēixìn bei?\n英文: Hey, are you the new exchange student? Let's add WeChat?" } },
  { id: "rent", title: "租房沟通", titleEn: "Renting", icon: "🏠", color: "#E67E22", bg: "#FEF5EC", identities: ["student","worker"], role: "You play a landlord.", greeting: { "1-3": "汉字: 你好！你要租房子吗？\n拼音: Nǐ hǎo! Nǐ yào zū fángzi ma?\n英文: Hello! Do you want to rent a house?", "4-6": "汉字: 你好，你是来看房的吧？一室一厅，月租三千五。\n拼音: Nǐ hǎo, nǐ shì lái kàn fáng de ba? Yī shì yī tīng, yuè zū sānqiān wǔ.\n英文: Hello, are you here to see the apartment? 1BR, 3500/month.", "7-9": "汉字: 你好！朝南采光好，家电全新，押一付三。\n拼音: Nǐ hǎo! Cháo nán cǎiguāng hǎo, jiādiàn quánxīn, yā yī fù sān.\n英文: Hello! South-facing, good light, new appliances, deposit 1 pay 3." } },
  { id: "interview", title: "面试求职", titleEn: "Job interview", icon: "👔", color: "#34495E", bg: "#EDF0F2", identities: ["worker","student"], role: "You play an HR interviewer.", greeting: { "1-3": "汉字: 你好！请坐。你叫什么名字？\n拼音: Nǐ hǎo! Qǐng zuò. Nǐ jiào shénme míngzi?\n英文: Hello! Please sit. What's your name?", "4-6": "汉字: 你好，请坐！我是张经理。先做个自我介绍吧。\n拼音: Nǐ hǎo, qǐng zuò! Wǒ shì Zhāng jīnglǐ. Xiān zuò gè zìwǒ jièshào ba.\n英文: Hello, please sit. I'm Manager Zhang. Introduce yourself first.", "7-9": "汉字: 欢迎来面试。我是人力资源部经理。请做个自我介绍。\n拼音: Huānyíng lái miànshì. Wǒ shì rénlì zīyuán bù jīnglǐ. Qǐng zuò gè zìwǒ jièshào.\n英文: Welcome to the interview. I am the HR manager. Please introduce yourself." } }
];

const SENTENCE_BANK = {
  "1-3": [
    { word: "喜欢", pinyin: "xǐhuan", meaning: "to like", hint: "Say something you like", example: "我喜欢吃中国菜。(Wǒ xǐhuan chī Zhōngguó cài.) I like Chinese food." },
    { word: "想", pinyin: "xiǎng", meaning: "to want", hint: "Say what you want to do", example: "我想去北京。(Wǒ xiǎng qù Běijīng.) I want to go to Beijing." },
    { word: "去", pinyin: "qù", meaning: "to go", hint: "Say where you go", example: "我明天去学校。(Wǒ míngtiān qù xuéxiào.) I'm going to school tomorrow." },
    { word: "吃", pinyin: "chī", meaning: "to eat", hint: "Say what you eat", example: "我每天吃米饭。(Wǒ měitiān chī mǐfàn.) I eat rice everyday." },
    { word: "学习", pinyin: "xuéxí", meaning: "to study", hint: "Talk about studying", example: "我在学习中文。(Wǒ zài xuéxí Zhōngwén.) I am studying Chinese." },
    { word: "朋友", pinyin: "péngyou", meaning: "friend", hint: "Say something about a friend", example: "我的朋友很好。(Wǒ de péngyou hěn hǎo.) My friend is very nice." },
    { word: "今天", pinyin: "jīntiān", meaning: "today", hint: "Say what you do today", example: "今天是星期一。(Jīntiān shì xīngqī yī.) Today is Monday." },
    { word: "很", pinyin: "hěn", meaning: "very", hint: "Describe something", example: "中文很有意思。(Zhōngwén hěn yǒu yìsi.) Chinese is very interesting." },
    { word: "在", pinyin: "zài", meaning: "at/in", hint: "Say where something is", example: "我在图书馆。(Wǒ zài túshūguǎn.) I am at the library." },
    { word: "买", pinyin: "mǎi", meaning: "to buy", hint: "Say what you buy", example: "我想买一本书。(Wǒ xiǎng mǎi yī běn shū.) I want to buy a book." },
    { word: "看", pinyin: "kàn", meaning: "to look/watch", hint: "Say what you watch", example: "我看电影。(Wǒ kàn diànyǐng.)" },
    { word: "喝", pinyin: "hē", meaning: "to drink", hint: "Say what you drink", example: "我想喝水。(Wǒ xiǎng hē shuǐ.)" },
    { word: "叫", pinyin: "jiào", meaning: "to be called", hint: "Introduce your name", example: "我叫大卫。(Wǒ jiào Dàwèi.)" },
    { word: "高兴", pinyin: "gāoxìng", meaning: "happy", hint: "Say you are happy", example: "我今天很高兴。(Wǒ jīntiān hěn gāoxìng.)" },
    { word: "认识", pinyin: "rènshi", meaning: "to know someone", hint: "Say nice to meet you", example: "很高兴认识你。(Hěn gāoxìng rènshi nǐ.)" },
    { word: "医生", pinyin: "yīshēng", meaning: "doctor", hint: "Talk about a doctor", example: "他是医生。(Tā shì yīshēng.)" },
    { word: "医院", pinyin: "yīyuàn", meaning: "hospital", hint: "Say you go to the hospital", example: "我去医院。(Wǒ qù yīyuàn.)" },
    { word: "商店", pinyin: "shāngdiàn", meaning: "store", hint: "Say you go to the store", example: "他在商店买东西。(Tā zài shāngdiàn mǎi dōngxi.)" },
    { word: "东西", pinyin: "dōngxi", meaning: "things", hint: "Say you buy things", example: "我要买东西。(Wǒ yào mǎi dōngxi.)" },
    { word: "苹果", pinyin: "píngguǒ", meaning: "apple", hint: "Talk about an apple", example: "我喜欢吃苹果。(Wǒ xǐhuan chī píngguǒ.)" },
    { word: "多少", pinyin: "duōshao", meaning: "how many/much", hint: "Ask a price", example: "这个多少钱？(Zhège duōshao qián?)" },
    { word: "钱", pinyin: "qián", meaning: "money", hint: "Talk about money", example: "我没有钱。(Wǒ méiyǒu qián.)" },
    { word: "时候", pinyin: "shíhou", meaning: "time/moment", hint: "Ask when", example: "你什么时候去？(Nǐ shénme shíhou qù?)" },
    { word: "明天", pinyin: "míngtiān", meaning: "tomorrow", hint: "Talk about tomorrow", example: "明天是星期二。(Míngtiān shì xīngqī èr.)" },
    { word: "昨天", pinyin: "zuótiān", meaning: "yesterday", hint: "Talk about yesterday", example: "昨天我去了北京。(Zuótiān wǒ qùle Běijīng.)" },
    { word: "天气", pinyin: "tiānqì", meaning: "weather", hint: "Describe weather", example: "今天天气很好。(Jīntiān tiānqì hěn hǎo.)" },
    { word: "热", pinyin: "rè", meaning: "hot", hint: "Say it is hot", example: "今天很热。(Jīntiān hěn rè.)" },
    { word: "冷", pinyin: "lěng", meaning: "cold", hint: "Say it is cold", example: "昨天很冷。(Zuótiān hěn lěng.)" },
    { word: "漂亮", pinyin: "piàoliang", meaning: "beautiful", hint: "Describe someone/something", example: "这件衣服很漂亮。(Zhè jiàn yīfu hěn piàoliang.)" },
    { word: "知道", pinyin: "zhīdào", meaning: "to know", hint: "Say you know/don't know", example: "我不知道。(Wǒ bù zhīdào.)" }
  ],
  "4-6": [
    { word: "虽然……但是……", pinyin: "suīrán...dànshì...", meaning: "although...but...", hint: "Express a contrast", example: "虽然今天很冷，但是我还是出去跑步了。(Suīrán jīntiān hěn lěng, dànshì wǒ háishì chūqù pǎobù le.) Although it's cold today, I still went out running." },
    { word: "因为……所以……", pinyin: "yīnwèi...suǒyǐ...", meaning: "because...so...", hint: "Cause and effect", example: "因为下雨了，所以我没去公园。(Yīnwèi xiàyǔ le, suǒyǐ wǒ méi qù gōngyuán.) Because it rained, I didn't go to the park." },
    { word: "不但……而且……", pinyin: "búdàn...érqiě...", meaning: "not only...but also...", hint: "List two positives", example: "他不但会说中文，而且会说日语。(Tā búdàn huì shuō Zhōngwén, érqiě huì shuō Rìyǔ.) He speaks not only Chinese, but also Japanese." },
    { word: "越来越", pinyin: "yuè lái yuè", meaning: "more and more", hint: "Describe a trend", example: "我的中文越来越好了。(Wǒ de Zhōngwén yuè lái yuè hǎo le.) My Chinese is getting better and better." },
    { word: "一边……一边……", pinyin: "yībiān...yībiān...", meaning: "while...also...", hint: "Two actions at once", example: "她一边听音乐，一边做作业。(Tā yībiān tīng yīnyuè, yībiān zuò zuòyè.) She listens to music while doing homework." },
    { word: "除了……以外", pinyin: "chúle...yǐwài", meaning: "besides", hint: "List more things", example: "除了中文以外，我还学了法语。(Chúle Zhōngwén yǐwài, wǒ hái xuéle Fǎyǔ.) Besides Chinese, I also learned French." },
    { word: "对……感兴趣", pinyin: "duì...gǎn xìngqù", meaning: "interested in", hint: "Your interests", example: "我对中国历史很感兴趣。(Wǒ duì Zhōngguó lìshǐ hěn gǎn xìngqù.) I am very interested in Chinese history." },
    { word: "只要……就……", pinyin: "zhǐyào...jiù...", meaning: "as long as", hint: "State a condition", example: "只要你努力，就一定能学好。(Zhǐyào nǐ nǔlì, jiù yídìng néng xuéhǎo.) As long as you work hard, you will definitely learn well." },
    { word: "把", pinyin: "bǎ", meaning: "把-construction", hint: "Act on an object", example: "请你把门关上。(Qǐng nǐ bǎ mén guānshàng.) Please close the door." },
    { word: "被", pinyin: "bèi", meaning: "passive", hint: "Passive voice", example: "我的手机被弟弟弄坏了。(Wǒ de shǒujī bèi dìdi nòng huài le.) My phone was broken by my brother." },
    { word: "为了", pinyin: "wèile", meaning: "in order to", hint: "State a purpose", example: "为了学好中文，我每天练习。" },
    { word: "或者", pinyin: "huòzhě", meaning: "or (in statements)", hint: "Give options", example: "我们去爬山或者看电影吧。" },
    { word: "还是", pinyin: "háishi", meaning: "or (in questions)", hint: "Ask for a choice", example: "你喝茶还是喝咖啡？" },
    { word: "先……然后……", pinyin: "xiān...ránhòu...", meaning: "first...then...", hint: "Sequence of actions", example: "我先吃饭，然后做作业。" },
    { word: "如果……就……", pinyin: "rúguǒ...jiù...", meaning: "if...then...", hint: "Hypothetical condition", example: "如果明天下雨，我就不去。" },
    { word: "以为", pinyin: "yǐwéi", meaning: "thought (mistakenly)", hint: "Express a wrong assumption", example: "我以为今天是星期五。" },
    { word: "一直", pinyin: "yìzhí", meaning: "continuously", hint: "Continuous action", example: "他一直在看书。" },
    { word: "原来", pinyin: "yuánlái", meaning: "originally / turns out", hint: "A sudden realization", example: "原来是你啊！" },
    { word: "必须", pinyin: "bìxū", meaning: "must", hint: "Express necessity", example: "明天我必须早起。" },
    { word: "发现", pinyin: "fāxiàn", meaning: "to discover", hint: "Notice something", example: "我发现他不在家。" },
    { word: "终于", pinyin: "zhōngyú", meaning: "finally", hint: "A delayed result", example: "我终于完成了工作。" },
    { word: "即使……也……", pinyin: "jíshǐ...yě...", meaning: "even if...still", hint: "Concession", example: "即使很累，他也在坚持。" },
    { word: "到处", pinyin: "dàochù", meaning: "everywhere", hint: "Describe locations", example: "公园里到处都是花。" },
    { word: "难道", pinyin: "nándào", meaning: "could it be that", hint: "Rhetorical question", example: "难道你不知道这件事吗？" },
    { word: "差点儿", pinyin: "chàdiǎnr", meaning: "almost", hint: "A near miss", example: "我差点儿迟到了。" },
    { word: "不仅……还……", pinyin: "bùjǐn...hái...", meaning: "not only...but also", hint: "Add information", example: "他不仅聪明，还很努力。" },
    { word: "偶尔", pinyin: "ǒu'ěr", meaning: "occasionally", hint: "Low frequency", example: "我偶尔去图书馆。" },
    { word: "反而", pinyin: "fǎn'ér", meaning: "on the contrary", hint: "Unexpected result", example: "喝了咖啡反而更困了。" },
    { word: "随着", pinyin: "suízhe", meaning: "along with", hint: "Accompanying change", example: "随着时间推移，他变了。" },
    { word: "其实", pinyin: "qíshí", meaning: "actually", hint: "State the reality", example: "其实我并不喜欢吃辣。" }
  ],
  "7-9": [
    { word: "与其……不如……", pinyin: "yǔqí...bùrú...", meaning: "rather than...better to...", hint: "Compare options", example: "与其抱怨，不如行动起来。(Yǔqí bàoyuàn, bùrú xíngdòng qǐlái.) Rather than complain, it's better to take action." },
    { word: "既……又……", pinyin: "jì...yòu...", meaning: "both...and...", hint: "Dual qualities", example: "这道菜既好吃又健康。(Zhè dào cài jì hǎochī yòu jiànkāng.) This dish is both delicious and healthy." },
    { word: "不得不", pinyin: "bùdébù", meaning: "have no choice but to", hint: "Being forced", example: "飞机取消了，我不得不改签。(Fēijī qǔxiāo le, wǒ bùdébù gǎi qiān.) Flight was cancelled, I had to rebook." },
    { word: "何况", pinyin: "hékuàng", meaning: "let alone", hint: "Strengthen argument", example: "大人都觉得难，何况小孩子呢？(Dàrén dōu juéde nán, hékuàng xiǎoháizi ne?) Adults find it hard, let alone children." },
    { word: "难免", pinyin: "nánmiǎn", meaning: "inevitably", hint: "Unavoidable", example: "刚来中国，难免会想家。(Gāng lái Zhōngguó, nánmiǎn huì xiǎng jiā.) Just arriving in China, it's inevitable to miss home." },
    { word: "看来", pinyin: "kànlái", meaning: "it seems", hint: "Make inference", example: "看来今天的会议要取消了。(Kànlái jīntiān de huìyì yào qǔxiāo le.) It seems today's meeting will be cancelled." },
    { word: "即使……也……", pinyin: "jíshǐ...yě...", meaning: "even if...still...", hint: "Strong concession", example: "即使再忙，我也要坚持锻炼。(Jíshǐ zài máng, wǒ yě yào jiānchí duànliàn.) Even if I'm busy, I will keep exercising." },
    { word: "恨不得", pinyin: "hènbude", meaning: "wish one could", hint: "Strong desire", example: "我恨不得马上飞回家。(Wǒ hènbude mǎshàng fēi huí jiā.) I wish I could fly home immediately." },
    { word: "不见得", pinyin: "bújiàndé", meaning: "not necessarily", hint: "Polite disagreement", example: "贵的东西不见得就好。(Guì de dōngxi bújiàndé jiù hǎo.) Expensive things aren't necessarily good." },
    { word: "总而言之", pinyin: "zǒng ér yán zhī", meaning: "in conclusion", hint: "Summarize", example: "总而言之，学语言需要坚持。(Zǒng ér yán zhī, xué yǔyán xūyào jiānchí.) In conclusion, learning languages requires persistence." },
    { word: "毋庸置疑", pinyin: "wúyōng zhìyí", meaning: "beyond doubt", hint: "Express absolute certainty", example: "毋庸置疑，科技改变了我们的生活。" },
    { word: "潜移默化", pinyin: "qiányí mòhuà", meaning: "subtle influence", hint: "Describe unseen impact", example: "父母的言行对孩子有潜移默化的影响。" },
    { word: "息息相关", pinyin: "xīxī xiāngguān", meaning: "closely related", hint: "Show deep connection", example: "环保与我们每个人的生活息息相关。" },
    { word: "不可思议", pinyin: "bùkě sīyì", meaning: "unimaginable", hint: "Express shock/wonder", example: "这个魔术简直不可思议。" },
    { word: "理所当然", pinyin: "lǐsuǒ dāngrán", meaning: "taken for granted", hint: "State what is expected", example: "帮助朋友是理所当然的事。" },
    { word: "莫名其妙", pinyin: "mòmíng qímiào", meaning: "baffling", hint: "Express confusion", example: "他突然发脾气，真是莫名其妙。" },
    { word: "无能为力", pinyin: "wúnéng wéilì", meaning: "powerless", hint: "Admit inability", example: "面对这种突发状况，我也无能为力。" },
    { word: "半途而废", pinyin: "bàntú érfèi", meaning: "give up halfway", hint: "Describe lack of perseverance", example: "做事情要有始有终，不能半途而废。" },
    { word: "一视同仁", pinyin: "yíshì tóngrén", meaning: "treat equally", hint: "Describe fairness", example: "老师对所有学生都一视同仁。" },
    { word: "不求甚解", pinyin: "bùqiú shènjiě", meaning: "superficial understanding", hint: "Criticize lazy learning", example: "读书不能不求甚解，要深入思考。" },
    { word: "既然……就……", pinyin: "jìrán...jiù...", meaning: "since...then...", hint: "Logical conclusion", example: "既然你已经决定了，就大胆去做吧。" },
    { word: "除非……否则……", pinyin: "chúfēi...fǒuzé...", meaning: "unless...otherwise...", hint: "Strict condition", example: "除非你道歉，否则我不会原谅你。" },
    { word: "哪怕……也……", pinyin: "nǎpà...yě...", meaning: "even if", hint: "Hypothetical concession", example: "哪怕失败十次，我也要试最后一次。" },
    { word: "不仅不……反而……", pinyin: "bùjǐn bù...fǎn'ér...", meaning: "not only didn't...but instead...", hint: "Opposite of expectation", example: "他不仅不认错，反而怪别人。" },
    { word: "究竟", pinyin: "jiūjìng", meaning: "after all / actually", hint: "Emphasize an inquiry", example: "你究竟想说什么？" },
    { word: "稍微", pinyin: "shāowēi", meaning: "slightly", hint: "Moderate a description", example: "这件衣服稍微有点大。" },
    { word: "犹如", pinyin: "yóurú", meaning: "just like", hint: "Formal comparison", example: "时间犹如白驹过隙。" },
    { word: "哪怕", pinyin: "nǎpà", meaning: "even if", hint: "Extreme hypothetical", example: "哪怕天下雨，我也要去。" },
    { word: "唯独", pinyin: "wéidú", meaning: "only / except", hint: "Highlight an exception", example: "大家都同意，唯独他反对。" },
    { word: "未免", pinyin: "wèimiǎn", meaning: "a bit too", hint: "Mild criticism", example: "你这样做未免太自私了。" }
  ]
};

const PRONUNCIATION_BANK = {
  "1-3": [
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
    { sentence: "我们在学校学习。", pinyin: "Wǒmen zài xuéxiào xuéxí.", translation: "We study at school." },
    { sentence: "他是我朋友。", pinyin: "Tā shì wǒ péngyou.", translation: "He is my friend." },
    { sentence: "我不喜欢吃肉。", pinyin: "Wǒ bù xǐhuan chī ròu.", translation: "I don't like eating meat." },
    { sentence: "现在几点了？", pinyin: "Xiànzài jǐ diǎn le?", translation: "What time is it now?" },
    { sentence: "我要买苹果。", pinyin: "Wǒ yào mǎi píngguǒ.", translation: "I want to buy apples." },
    { sentence: "明天天气很好。", pinyin: "Míngtiān tiānqì hěn hǎo.", translation: "Tomorrow's weather is good." },
    { sentence: "你去哪里？", pinyin: "Nǐ qù nǎlǐ?", translation: "Where are you going?" },
    { sentence: "我在家看电视。", pinyin: "Wǒ zài jiā kàn diànshì.", translation: "I am watching TV at home." },
    { sentence: "这是我的书。", pinyin: "Zhè shì wǒ de shū.", translation: "This is my book." },
    { sentence: "太贵了！", pinyin: "Tài guì le!", translation: "Too expensive!" },
    { sentence: "便宜一点，好吗？", pinyin: "Piányi yīdiǎn, hǎo ma?", translation: "A little cheaper, ok?" },
    { sentence: "洗手间在哪里？", pinyin: "Xǐshǒujiān zài nǎlǐ?", translation: "Where is the restroom?" },
    { sentence: "对不起。", pinyin: "Duìbuqǐ.", translation: "I'm sorry." },
    { sentence: "没关系。", pinyin: "Méi guānxi.", translation: "It's okay." },
    { sentence: "不用谢。", pinyin: "Búyòng xiè.", translation: "You're welcome." },
    { sentence: "我听不懂。", pinyin: "Wǒ tīng bù dǒng.", translation: "I don't understand." },
    { sentence: "请写下来。", pinyin: "Qǐng xiě xiàlái.", translation: "Please write it down." },
    { sentence: "你多大了？", pinyin: "Nǐ duōdà le?", translation: "How old are you?" },
    { sentence: "我喜欢中国。", pinyin: "Wǒ xǐhuan Zhōngguó.", translation: "I like China." },
    { sentence: "再见！", pinyin: "Zàijiàn!", translation: "Goodbye!" }
  ],
  "4-6": [
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
    { sentence: "请把空调打开，有点热。", pinyin: "Qǐng bǎ kōngtiáo dǎkāi, yǒudiǎn rè.", translation: "Please turn on the AC, it's a bit hot." },
    { sentence: "由于堵车，我迟到了十分钟。", pinyin: "Yóuyú dǔchē, wǒ chídàole shí fēnzhōng.", translation: "Due to traffic, I was 10 mins late." },
    { sentence: "不论多晚，他都会完成工作。", pinyin: "Búlùn duō wǎn, tā dōu huì wánchéng gōngzuò.", translation: "No matter how late, he finishes work." },
    { sentence: "他连这么简单的汉字都不认识。", pinyin: "Tā lián zhème jiǎndān de hànzì dōu bú rènshi.", translation: "He doesn't even know such simple characters." },
    { sentence: "你的中文说得越来越流利了。", pinyin: "Nǐ de Zhōngwén shuō de yuè lái yuè liúlì le.", translation: "Your Chinese is getting more fluent." },
    { sentence: "除了篮球，我还喜欢踢足球。", pinyin: "Chúle lánqiú, wǒ hái xǐhuan tī zúqiú.", translation: "Besides basketball, I also like soccer." },
    { sentence: "经过几个月的努力，他终于通过了考试。", pinyin: "Jīngguò jǐ gè yuè de nǔlì, tā zhōngyú tōngguòle kǎoshì.", translation: "After months of effort, he finally passed." },
    { sentence: "请大家保持安静，会议马上开始。", pinyin: "Qǐng dàjiā bǎochí ānjìng, huìyì mǎshàng kāishǐ.", translation: "Please keep quiet, the meeting is starting." },
    { sentence: "这件毛衣不但颜色好看，而且很暖和。", pinyin: "Zhè jiàn máoyī búdàn yánsè hǎokàn, érqiě hěn nuǎnhuo.", translation: "This sweater is not only pretty but warm." },
    { sentence: "遇到不懂的问题，你应该多问老师。", pinyin: "Yùdào bù dǒng de wèntí, nǐ yīnggāi duō wèn lǎoshī.", translation: "Ask the teacher when you don't understand." },
    { sentence: "我同意你的看法，这个主意不错。", pinyin: "Wǒ tóngyì nǐ de kànfǎ, zhège zhǔyi búcuò.", translation: "I agree with you, good idea." },
    { sentence: "他平时很少说话，但其实很幽默。", pinyin: "Tā píngshí hěn shǎo shuōhuà, dàn qíshí hěn yōumò.", translation: "He rarely speaks, but is actually humorous." },
    { sentence: "这件事没有你想的那么复杂。", pinyin: "Zhè jiàn shì méiyǒu nǐ xiǎng de nàme fùzá.", translation: "This isn't as complicated as you think." },
    { sentence: "我们要养成早睡早起的好习惯。", pinyin: "Wǒmen yào yǎngchéng zǎo shuì zǎo qǐ de hǎo xíguàn.", translation: "Develop the habit of sleeping and waking early." },
    { sentence: "只要坚持练习，就一定会进步。", pinyin: "Zhǐyào jiānchí liànxí, jiù yídìng huì jìnbù.", translation: "As long as you practice, you will improve." },
    { sentence: "为了健康，他决定开始减肥。", pinyin: "Wèile jiànkāng, tā juédìng kāishǐ jiǎnféi.", translation: "For his health, he decided to lose weight." },
    { sentence: "周末你有空的话，我们一起去逛街吧。", pinyin: "Zhōumò nǐ yǒu kòng de huà, wǒmen yìqǐ qù guàngjiē ba.", translation: "If you're free this weekend, let's go shopping." },
    { sentence: "抱歉，让您久等了。", pinyin: "Bàoqiàn, ràng nín jiǔ děng le.", translation: "Sorry to keep you waiting." },
    { sentence: "那家餐厅的烤鸭非常地道。", pinyin: "Nà jiā cāntīng de kǎoyā fēicháng dìdào.", translation: "That restaurant's roast duck is very authentic." },
    { sentence: "我的手机快没电了，借我个充电宝吧。", pinyin: "Wǒ de shǒujī kuài méi diàn le, jiè wǒ gè chōngdiànbǎo ba.", translation: "My phone is dying, lend me a power bank." }
  ],
  "7-9": [
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
    { sentence: "这篇文章见解独到，逻辑严密，令人叹服。", pinyin: "Zhè piān wénzhāng jiànjiě dúdào, luójí yánmì, lìng rén tànfú.", translation: "This article is insightful and logical." },
    { sentence: "我们在追求经济发展的同时，不能忽视环境保护。", pinyin: "Wǒmen zài zhuīqiú jīngjì fāzhǎn de tóngshí, bùnéng hūshì huánjìng bǎohù.", translation: "Don't ignore the environment for economy." },
    { sentence: "网络虽然拉近了距离，但也让人变得冷漠。", pinyin: "Wǎngluò suīrán lājìnle jùlí, dàn yě ràng rén biànde lěngmò.", translation: "The internet connects but also isolates." },
    { sentence: "这种观点未免过于片面，缺乏客观性。", pinyin: "Zhè zhǒng guāndiǎn wèimiǎn guòyú piànmiàn, quēfá kèguānxìng.", translation: "This view is a bit too one-sided." },
    { sentence: "面对激烈的竞争，企业必须不断创新才能生存。", pinyin: "Miànduì jīliè de jìngzhēng, qǐyè bìxū búduàn chuàngxīn cáinéng shēngcún.", translation: "Enterprises must innovate to survive competition." },
    { sentence: "中华传统文化源远流长，博大精深。", pinyin: "Zhōnghuá chuántǒng wénhuà yuányuǎn liúcháng, bódà jīngshēn.", translation: "Chinese culture is profound and enduring." },
    { sentence: "哪怕只有一线希望，我们也要尽百分之百的努力。", pinyin: "Nǎpà zhǐyǒu yí xiàn xīwàng, wǒmen yě yào jìn bǎi fēn zhī bǎi de nǔlì.", translation: "Even with slim hope, give 100% effort." },
    { sentence: "他处理危机时的从容不迫，给所有人留下了深刻印象。", pinyin: "Tā chǔlǐ wēijī shí de cóngróng búpò, gěi suǒyǒu rén liúxiàle shēnkè yìnxiàng.", translation: "His calmness in crisis impressed everyone." },
    { sentence: "一味地逃避问题并不能解决任何实质性的麻烦。", pinyin: "Yíwèi de táobì wèntí bìng bùnéng jiějué rènhé shízhìxìng de máfan.", translation: "Blindly avoiding won't solve real issues." },
    { sentence: "教育的根本目的不仅仅是传授知识，更是培养人格。", pinyin: "Jiàoyù de gēnběn mùdì bù jǐnjǐn shì chuánshòu zhīshi, gèng shì péiyǎng réngé.", translation: "Education builds character, not just knowledge." },
    { sentence: "所谓“己所不欲，勿施于人”，这是最基本的道德底线。", pinyin: "Suǒwèi 'jǐ suǒ bú yù, wù shī yú rén', zhè shì zuì jīběn de dàodé dǐxiàn.", translation: "Do unto others as you would have them do unto you." },
    { sentence: "在利益面前，人性的弱点往往会暴露无遗。", pinyin: "Zài lìyì miànqián, rénxìng de ruòdiǎn wǎngwǎng huì bàolù wú yí.", translation: "Flaws in human nature show in face of profit." },
    { sentence: "这座城市的历史变迁，犹如一部生动的纪录片。", pinyin: "Zhè zuò chéngshì de lìshǐ biànqiān, yóurú yí bù shēngdòng de jìlùpiān.", translation: "The city's history is like a vivid documentary." },
    { sentence: "我们不能只看眼前利益，而要着眼于长远发展。", pinyin: "Wǒmen bùnéng zhǐ kàn yǎnqián lìyì, ér yào zhuóyǎn yú chángyuǎn fāzhǎn.", translation: "Focus on long-term development, not immediate gain." },
    { sentence: "与其临渊羡鱼，不如退而结网。", pinyin: "Yǔqí línyuān xiànyú, bùrú tuì ér jiéwǎng.", translation: "Better to make a net than covet fish." },
    { sentence: "在人工智能时代，终身学习已经成为一种必然选择。", pinyin: "Zài réngōng zhìnéng shídài, zhōngshēn xuéxí yǐjīng chéngwéi yì zhǒng bìrán xuǎnzé.", translation: "Lifelong learning is essential in the AI era." },
    { sentence: "两国在文化交流方面取得了丰硕的成果。", pinyin: "Liǎng guó zài wénhuà jiāoliú fāngmiàn qǔdéle fēngshuò de chéngguǒ.", translation: "Rich results in cultural exchange between the two countries." },
    { sentence: "这部电影情节跌宕起伏，引人深思。", pinyin: "Zhè bù diànyǐng qíngjié diēdàng qǐfú, yǐn rén shēnsī.", translation: "The movie has twists and provokes thought." },
    { sentence: "事实胜于雄辩，再多的狡辩也掩盖不了真相。", pinyin: "Shìshí shèng yú xióngbiàn, zài duō de jiǎobiàn yě yǎngài bùliǎo zhēnxiàng.", translation: "Facts speak louder than words." },
    { sentence: "无论社会如何变迁，有些传统的价值观依然历久弥新。", pinyin: "Wúlùn shèhuì rúhé biànqiān, yǒuxiē chuántǒng de jiàzhíguān yīrán lìjiǔ míxīn.", translation: "Some traditional values endure through changes." }
  ]
};

const MANUAL_DATA = {
  "1-3": {
    vocab: [
      { title: "高频动词：想 (xiǎng) vs 要 (yào)", desc: "想 indicates a wish or missing someone. 要 indicates a stronger intent, demand, or future action.", example: "我想喝茶 (I'd like tea) vs 我要喝茶 (I want/will have tea)." },
      { title: "方向与位置：在 (zài)", desc: "Use 在 to indicate location. Structure: Subject + 在 + Place.", example: "我在家。(I am at home.) 书在桌子上。(The book is on the table.)" },
      { title: "数量词：二 (èr) vs 两 (liǎng)", desc: "Use 二 for counting numbers (1, 2, 3). Use 两 when quantifying objects with a measure word.", example: "一二三 (1, 2, 3). 两个人 (two people)." }
    ],
    grammar: [
      { title: "一般疑问句：吗 (ma)", desc: "Add 吗 at the end of a statement to turn it into a yes/no question.", example: "你是学生吗？(Are you a student?)" },
      { title: "正反疑问句：V 不 V", desc: "Form a question by stating the verb and its negative form side-by-side.", example: "你去不去？(Are you going or not?)" },
      { title: "完成体：了 (le)", desc: "Place 了 after a verb or at the end of a sentence to indicate a completed action.", example: "我吃饭了。(I ate.)" }
    ],
    pinyin: [
      { title: "三声变调 (3rd Tone Sandhi)", desc: "When two 3rd tones are back-to-back, the first one is pronounced as a 2nd tone.", example: "你好 (nǐ hǎo -> ní hǎo)" },
      { title: "“不”的变调 (Tone of bù)", desc: "When '不' (4th tone) is followed by another 4th tone, it changes to the 2nd tone (bú).", example: "不是 (bú shì), 不去 (bú qù)" },
      { title: "“一”的变调 (Tone of yī)", desc: "Before a 4th tone, it becomes 2nd tone (yí). Before 1st/2nd/3rd tones, it becomes 4th tone (yì).", example: "一个 (yí gè), 一起 (yì qǐ)" }
    ]
  },
  "4-6": {
    vocab: [
      { title: "成语入门：莫名其妙", desc: "Meaning 'baffling' or 'without rhyme or reason'. Very common in daily complaints.", example: "他突然生气了，真是莫名其妙。(He suddenly got angry, it's really baffling.)" },
      { title: "连词：既然...就...", desc: "Since... then... Used to draw a conclusion from a stated premise.", example: "既然下雨了，我们就别去了。(Since it's raining, let's not go.)" },
      { title: "程度副词：简直 (jiǎnzhí)", desc: "Meaning 'simply' or 'absolutely'. Used for exaggeration.", example: "这儿的风景简直太美了！(The scenery here is simply too beautiful!)" }
    ],
    grammar: [
      { title: "把字句 (bǎ-construction)", desc: "Subject + 把 + Object + Verb + Complement. Used when the subject does something to change the state/location of a specific object.", example: "请把门关上。(Please close the door.)" },
      { title: "被字句 (Passive Voice)", desc: "Receiver + 被 + Doer + Verb. Often used for negative or unfavorable situations.", example: "我的手机被弟弟弄坏了。(My phone was broken by my brother.)" },
      { title: "趋向补语 (Directional Complements)", desc: "Verb + 来/去 (towards/away from speaker) indicating direction of action.", example: "他走过来了。(He walked over here.)" }
    ],
    pinyin: [
      { title: "轻声 (Neutral Tone)", desc: "Certain syllables lose their tone and are pronounced short and light, especially structural particles or second syllables in some words.", example: "东西 (dōng xi), 喜欢 (xǐ huan), 我的 (wǒ de)" },
      { title: "儿化音 (Erhua)", desc: "Adding 'r' sound to the end of a syllable, common in Northern China accents, sometimes changes the meaning.", example: "画 (huà, picture) -> 画儿 (huàr, a painting)" }
    ]
  },
  "7-9": {
    vocab: [
      { title: "高级成语：塞翁失马，焉知非福", desc: "A blessing in disguise. Lit: The old man lost his horse, how could one know it isn't a blessing?", example: "这次没考上也许是塞翁失马，焉知非福呢。" },
      { title: "书面语：旨在 (zhǐ zài)", desc: "Formal vocabulary meaning 'aimed at' or 'with the purpose of'.", example: "这项政策旨在提高教学质量。(This policy is aimed at improving teaching quality.)" },
      { title: "双音节词的正式表达", desc: "In advanced HSK, colloquial 1-character words are replaced by formal 2-character words.", example: "给 -> 给予 (jǐ yǔ); 办 -> 处理 (chǔ lǐ)" }
    ],
    grammar: [
      { title: "反问句 (Rhetorical Questions)", desc: "Using structures like 难道...吗？ or 怎么会...呢？ to make a strong statement through a question.", example: "难道你连这个都不知道吗？(Don't tell me you don't even know this?)" },
      { title: "复杂关联词：与其...不如...", desc: "Rather than A... it is better to B. Used for evaluating choices.", example: "与其抱怨环境，不如改变自己。(Rather than complaining about the environment, it's better to change yourself.)" },
      { title: "插入语 (Parentheticals)", desc: "Phrases inserted to express the speaker's attitude or source of info.", example: "总而言之 (in conclusion), 依我看 (in my opinion), 据报道 (according to reports)" }
    ],
    pinyin: [
      { title: "语调与情感表达 (Intonation & Emotion)", desc: "At advanced levels, tone isn't just about pronunciation, but sentence intonation. Rising intonation expresses doubt/surprise, falling expresses certainty/command.", example: "他真的来了？(Rising: He really came?!) 他真的来了。(Falling: He really came.)" },
      { title: "连续语流中的停顿 (Pausing in speech)", desc: "Knowing where to pause (sense groups) is crucial for advanced fluency and conveying correct grammatical meaning.", example: "我发现 / 他其实 / 并不了解 / 这个项目。(Sense group pauses)" }
    ]
  }
};

/* ═══════════════════════════════════════════
   HELPERS & PARSERS
   ═══════════════════════════════════════════ */

function clean(t){return t.replace(/\*\*/g,"").replace(/\*/g,"").replace(/^#{1,6}\s/gm,"").replace(/__/g,"").replace(/~~/g,"");}

const MODES = [
  { id: "HPE", label: "全显模式", desc: "汉字+拼音+英文" },
  { id: "HP", label: "辅导模式", desc: "汉字+拼音 (隐藏英文)" },
  { id: "HE", label: "沉浸模式", desc: "汉字+英文 (隐藏拼音)" },
  { id: "H", label: "纯汉模式", desc: "无拼音、无英文翻译" }
];

function renderExampleText(text, mode) {
  const hzMatch = text.match(/^(.*?)\(/);
  const hz = hzMatch ? hzMatch[1].trim() : text;
  const pyMatch = text.match(/\((.*?)\)/);
  const py = pyMatch ? pyMatch[1].trim() : "";
  const enMatch = text.match(/\)\s*(.*)$/);
  const en = enMatch ? enMatch[1].trim() : "";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <div style={{fontSize:16,color:"#1a1a1a"}}>{hz}</div>
      {(mode==="HPE" || mode==="HP") && py && <div style={{fontSize:14,color:"#888"}}>{py}</div>}
      {(mode==="HPE" || mode==="HE") && en && <div style={{fontSize:13,color:"#aaa"}}>{en}</div>}
    </div>
  );
}

function renderChatBubble(text, mode, themeColor) {
  let lines = text.split('\n');
  let hz = '', py = '', en = '';
  
  lines.forEach(l => {
    let t = l.trim();
    if(t.startsWith('汉字:') || t.startsWith('汉字：')) hz = t.substring(3).trim();
    else if(t.startsWith('拼音:') || t.startsWith('拼音：')) py = t.substring(3).trim();
    else if(t.startsWith('英文:') || t.startsWith('英文：')) en = t.substring(3).trim();
  });

  if (!hz && !py && !en) hz = clean(text).replace(/\(.*?\)/g, '').replace(/[a-zA-Z].*$/, '');

  return { 
    ttsText: hz, 
    ui: (
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {hz && <div style={{fontSize:15, lineHeight:1.6, color:"#1a1a1a"}}>{hz}</div>}
        {(mode==="HPE" || mode==="HP") && py && <div style={{fontSize:14, color:themeColor||"#E8A838"}}>{py}</div>}
        {(mode==="HPE" || mode==="HE") && en && <div style={{fontSize:13, color:"rgba(0,0,0,0.5)"}}>{en}</div>}
      </div>
    )
  };
}

const SRC=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
function useSpeech(){
  const[l,sL]=useState(false);const[s,sS]=useState(false);const r=useRef(null);
  const start=useCallback(cb=>{if(!SRC){alert("Use Chrome for voice.");return;}const x=new SRC();x.lang="zh-CN";x.interimResults=false;x.continuous=false;x.onresult=e=>{cb(e.results[0][0].transcript);sL(false);};x.onerror=()=>sL(false);x.onend=()=>sL(false);r.current=x;x.start();sL(true);},[]);
  const stop=useCallback(()=>{r.current?.stop();sL(false);},[]);
  const speak=useCallback((t, slow = false)=>{
    const c=clean(t).replace(/\(.*?\)/g,"").replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, "");
    const sy=window.speechSynthesis;
    sy.cancel();
    const u=new SpeechSynthesisUtterance(c);
    u.lang="zh-CN"; u.rate=slow ? 0.45 : 0.85;
    u.onstart=()=>sS(true); u.onend=()=>sS(false); u.onerror=()=>sS(false);
    sy.speak(u);
  },[]);
  const stopS=useCallback(()=>{window.speechSynthesis.cancel();sS(false);},[]);
  return{listening:l,speaking:s,startListening:start,stopListening:stop,speak,stopSpeaking:stopS};
}

/* ═══════════════════════════════════════════
   LAYOUT WRAPPER
   ═══════════════════════════════════════════ */
function PageWrap({children, maxWidth = 580}){
  return <div style={{padding:"0 20px",maxWidth,margin:"0 auto",width:"100%"}}>{children}</div>;
}

/* ═══════════════════════════════════════════
   TOP BAR
   ═══════════════════════════════════════════ */

function TopBar({title, subtitle, onBack, hskLevel, onChangeHSK, mode, onChangeMode}){
  const[openHSK,setOpenHSK]=useState(false);
  const[openMode,setOpenMode]=useState(false);
  const lv=HSK_LEVELS.find(l=>l.id===hskLevel);
  const curMode = MODES.find(m=>m.id===mode);

  return(<div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12,background:"#fff",borderBottom:"1px solid #f0efe8",position:"sticky",top:0,zIndex:20}}>
    {onBack&&<button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",borderRadius:8}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>}
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:17,fontWeight:600,color:"#1a1a1a"}}>{title}</div>{subtitle&&<div style={{fontSize:12,color:"#999"}}>{subtitle}</div>}</div>
    {hskLevel && lv && <div style={{display:"flex",alignItems:"center",gap:8}}>
      
      {onChangeMode && <div style={{position:"relative"}}>
        <button onClick={()=>setOpenMode(!openMode)} style={{background:"#f0efe8",border:"none",borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4,fontWeight:600,color:"#666"}}>⚙️ {curMode?.label.slice(0,2)}</button>
        {openMode&&<><div onClick={()=>setOpenMode(false)} style={{position:"fixed",inset:0,zIndex:30}}/><div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:31,overflow:"hidden",minWidth:150}}>
          {MODES.map(m=><button key={m.id} onClick={()=>{onChangeMode(m.id);setOpenMode(false);}} style={{width:"100%",padding:"12px 14px",border:"none",background:m.id===mode?"#f8f8f8":"transparent",textAlign:"left",cursor:"pointer",display:"block"}}>
            <div style={{fontSize:14,fontWeight:600,color:m.id===mode?"#333":"#555"}}>{m.label}</div>
            <div style={{fontSize:11,color:"#999",marginTop:2}}>{m.desc}</div>
          </button>)}
        </div></>}
      </div>}

      <div style={{position:"relative"}}>
        <button onClick={()=>setOpenHSK(!openHSK)} style={{background:lv.color+"14",border:`1px solid ${lv.color}30`,borderRadius:20,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:600,color:lv.color,fontFamily:"inherit"}}>{lv.emoji} {lv.label}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={lv.color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
        {openHSK&&<><div onClick={()=>setOpenHSK(false)} style={{position:"fixed",inset:0,zIndex:30}}/><div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",borderRadius:12,border:"1px solid #f0efe8",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:31,overflow:"hidden",minWidth:180}}>
          {HSK_LEVELS.map(l=><button key={l.id} onClick={()=>{onChangeHSK(l.id);setOpenHSK(false);}} style={{width:"100%",padding:"12px 16px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:l.id===hskLevel?l.color+"10":"transparent",fontFamily:"inherit",textAlign:"left"}}><span style={{fontSize:18}}>{l.emoji}</span><div><div style={{fontSize:14,fontWeight:600,color:l.id===hskLevel?l.color:"#1a1a1a"}}>{l.label}</div><div style={{fontSize:12,color:"#999"}}>{l.sub}</div></div>{l.id===hskLevel&&<svg width="16" height="16" viewBox="0 0 24 24" fill={l.color} style={{marginLeft:"auto"}}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}</button>)}
        </div></>}
      </div>

    </div>}
  </div>);
}

/* ═══════════════════════════════════════════
   DRILL VIEW
   ═══════════════════════════════════════════ */

function DrillView({type,hskLevel,onBack,onChangeHSK, mode, onChangeMode}){
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
    }catch{setFeedback({text:"网络稍有波动，请点击 'Next question' 尝试下一题哦~",score:0});}setLoading(false);
  };

  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);submit(t);});};
  const next=()=>{if(idx+1>=total){setDone(true);return;}setIdx(idx+1);setInput("");setFeedback(null);};
  const restart=()=>{setIdx(0);setInput("");setFeedback(null);setScores([]);setDone(false);};

  if(done){const validScores=scores.filter(s=>s>0);const avg=validScores.length?Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length):0;const emoji=avg>=90?"🤩":avg>=80?"😎":avg>=70?"😊":avg>=60?"😐":"💪";
    return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title={isSen?"造句练习":"语音测评"} subtitle="Results" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode}/>
      <PageWrap maxWidth={580}><div style={{padding:"32px 0",textAlign:"center",animation:"su 0.4s both"}}>
        <div style={{fontSize:56,marginBottom:12}}>{emoji}</div>
        <div style={{fontSize:48,fontWeight:700,color,marginBottom:4}}>{avg}<span style={{fontSize:20,color:"#999"}}>/100</span></div>
        <div style={{fontSize:15,color:"#888",marginBottom:28}}>Average across {validScores.length} questions</div>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #f0efe8",overflow:"hidden",marginBottom:24,textAlign:"left"}}>{scores.map((s,i)=><div key={i} style={{padding:"14px 18px",borderBottom:i<scores.length-1?"1px solid #f7f6f1":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,color:"#666"}}>Q{i+1}. {isSen?bank[i].word:bank[i].sentence.slice(0,15)+"…"}</div><div style={{fontSize:15,fontWeight:600,color:s>=80?"#2DAA6E":s>=60?"#E8A838":s>0?"#D4413A":"#ccc"}}>{s>0?s:"—"}</div></div>)}</div>
        <div style={{display:"flex",gap:10}}><button onClick={restart} style={{flex:1,padding:16,borderRadius:12,border:`1.5px solid ${color}`,background:"transparent",color,fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Try again</button><button onClick={onBack} style={{flex:1,padding:16,borderRadius:12,border:"none",background:color,color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Back</button></div>
      </div></PageWrap></div>);
  }

  return(<div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}><TopBar title={isSen?"造句练习":"语音测评"} subtitle={isSen?"Sentence building":"Pronunciation"} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode}/>
    <PageWrap maxWidth={580}><div style={{padding:"20px 0 140px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><div style={{flex:1,height:6,background:"#ebe9e1",borderRadius:3,overflow:"hidden"}}><div style={{width:`${((idx+(feedback?1:0))/total)*100}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.4s"}}/></div><span style={{fontSize:13,color:"#999",fontWeight:600}}>{idx+1}/{total}</span></div>
      <div style={{background:"#fff",borderRadius:16,border:"1px solid #f0efe8",padding:"28px 24px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.03)"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#bbb",textTransform:"uppercase",letterSpacing:1,marginBottom:16}}>{isSen?"Use this word to make a sentence":"Read this sentence aloud"}</div>
        {isSen?<><div style={{fontSize:30,fontWeight:700,color:"#1a1a1a",marginBottom:8}}>{q.word}</div>{(mode==="HPE"||mode==="HP")&&<div style={{fontSize:15,color,marginBottom:4}}>{q.pinyin}</div>}{(mode==="HPE"||mode==="HE")&&<div style={{fontSize:14,color:"#999"}}>{q.meaning}</div>}<div style={{fontSize:13,color:"#bbb",fontStyle:"italic",marginTop:8}}>Hint: {q.hint}</div></>
        :<><div style={{fontSize:26,fontWeight:700,color:"#1a1a1a",marginBottom:8,lineHeight:1.5}}>{q.sentence}</div>{(mode==="HPE"||mode==="HP")&&<div style={{fontSize:15,color,marginBottom:4}}>{q.pinyin}</div>}{(mode==="HPE"||mode==="HE")&&<div style={{fontSize:14,color:"#999"}}>{q.translation}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>speaking?stopSpeaking():speak(q.sentence)} style={{marginTop:14,background:bg,border:`1px solid ${color}30`,borderRadius:20,padding:"8px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color,fontFamily:"inherit"}}><svg width="13" height="13" viewBox="0 0 24 24" fill={color}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>{speaking?"Stop":"Listen"}</button>
            <button onClick={()=>speak(q.sentence, true)} style={{marginTop:14,background:"#fff",border:`1px solid ${color}30`,borderRadius:20,padding:"8px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color,fontFamily:"inherit"}}>慢速</button>
          </div></>}
      </div>
      {feedback&&<div ref={fbRef}>
        <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${feedback.score>=80?"#2DAA6E40":feedback.score>=60?"#E8A83840":"#D4413A40"}`,padding:22,marginBottom:14,animation:"su 0.3s both"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:14,fontWeight:600,color:"#888"}}>AI feedback</span><div style={{background:feedback.score>=80?"#EDFAF3":feedback.score>=60?"#FFF8ED":"#FDF0EF",borderRadius:20,padding:"5px 16px",fontSize:17,fontWeight:700,color:feedback.score>=80?"#2DAA6E":feedback.score>=60?"#E8A838":"#D4413A"}}>{feedback.score>0?feedback.score+"/100":"Error"}</div></div>
          {input&&<div style={{fontSize:14,color:"#888",marginBottom:10}}>Your answer: <span style={{color:"#1a1a1a"}}>{input}</span></div>}
          <div style={{fontSize:15,color:"#444",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{feedback.text}</div>
        </div>
        <div style={{background:bg,borderRadius:14,padding:"18px 20px",marginBottom:20,borderLeft:`3px solid ${color}`}}><div style={{fontSize:12,fontWeight:600,color,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Reference example</div>
          {renderExampleText(q.example||q.sentence, mode)}
        </div>
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

function ChatView({module,hskLevel,onBack,onChangeHSK,showVoice=true, mode, onChangeMode}){
  const[messages,setMessages]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);
  const endRef=useRef(null);const{listening,speaking,startListening,stopListening,speak,stopSpeaking}=useSpeech();
  
  useEffect(()=>{
    const g = typeof module.greeting==="object"?module.greeting[hskLevel]||module.greeting["4-6"]:module.greeting;
    setMessages([{role:"assistant",content:g}]);
  },[module.id, hskLevel]);
  
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  
  const sys=()=>`You are a Chinese language coach.\n${HSK_PROMPT[hskLevel]}\nROLE: ${module.system||module.role||""}\nRULES: Stay in character, 2-3 sentences max. You MUST format your reply strictly in these 3 lines using exactly these prefixes:\n汉字: [Chinese Characters]\n拼音: [Pinyin]\n英文: [English Translation]\nDo not use markdown.`;
  
  const send=async(text)=>{if(!text.trim()||loading)return;const u={role:"user",content:text.trim()};const up=[...messages,u];setMessages(up);setInput("");setLoading(true);
    try{const raw=await callAI(sys(),up.map(m=>({role:m.role,content:m.content})),800);setMessages(p=>[...p,{role:"assistant",content:raw}]);}
    catch{setMessages(p=>[...p,{role:"assistant",content:"汉字: 网络连接有点慢哦，请重试。\n拼音: Wǎngluò liánjiē yǒudiǎn màn o, qǐng chóngshì.\n英文: The network connection is a bit slow, please try again."}]);}setLoading(false);};
  const handleMic=()=>{if(listening){stopListening();return;}startListening(t=>{setInput(t);send(t);});};
  
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
    <TopBar title={module.title} subtitle={module.titleEn} onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode}/>
    <div style={{flex:1,overflowY:"auto",padding:"16px 20px 120px",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{width:"100%",maxWidth:640}}>
      {messages.map((msg,i)=>{
        const isUser = msg.role === "user";
        const parsed = isUser ? { ttsText: msg.content, ui: msg.content } : renderChatBubble(msg.content, mode, module.color);
        return (
          <div key={i} style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",marginBottom:14,alignItems:"flex-end",gap:8,animation:"su 0.3s both"}}>
            {!isUser&&<div style={{width:32,height:32,borderRadius:"50%",background:module.bg||"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{module.icon}</div>}
            <div style={{maxWidth:"75%",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{padding:"12px 16px",background:isUser?(module.color||"#4A90D9"):"#fff",color:isUser?"#fff":"#1a1a1a",borderRadius:isUser?"18px 18px 4px 18px":"18px 18px 18px 4px",fontSize:15,lineHeight:1.7,whiteSpace:"pre-wrap",boxShadow:isUser?"none":"0 1px 3px rgba(0,0,0,0.04)",border:isUser?"none":"1px solid #f0efe8"}}>{parsed.ui}</div>
              {!isUser&&showVoice&&<div style={{display:"flex",gap:10,opacity:0.6,alignSelf:"flex-start",marginLeft:4}}>
                <button onClick={()=>speaking?stopSpeaking():speak(parsed.ttsText)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:4}}><svg width="14" height="14" viewBox="0 0 24 24" fill={speaking?(module.color||"#E8A838"):"#888"}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg><span style={{fontSize:12,color:"#666"}}>{speaking?"Stop":"Play"}</span></button>
                <button onClick={()=>speak(parsed.ttsText, true)} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 8px",borderRadius:10,fontSize:11,color:"#666",fontWeight:600}}>慢速</button>
              </div>}
            </div>
          </div>
        )
      })}
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
   ABOUT MODAL & STUDY MANUAL
   ═══════════════════════════════════════════ */

function SrtpWelcomeModal({onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"su 0.3s both"}}>
      <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:400,padding:32,position:"relative",textAlign:"center"}}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"#f0f0f0",border:"none",width:30,height:30,borderRadius:"50%",cursor:"pointer"}}>✕</button>
        <div style={{fontSize:48,marginBottom:12}}>🎓</div>
        <h2 style={{fontSize:22,fontWeight:700,margin:"0 0 6px",color:"#1a1a1a"}}>SpeakWise 琢音</h2>
        <p style={{fontSize:14,color:"#666",margin:"0 0 20px"}}>AI 中文口语教练 (Web端)</p>
        <div style={{background:"#FDF0EF",borderRadius:16,padding:16,textAlign:"left",marginBottom:24,border:"1px solid #fbe3e1"}}>
          <p style={{fontSize:13,color:"#D4413A",margin:0,lineHeight:1.7}}>本项目为 SRTP 科研课题<br/><b>《师-生-机深度交互式汉语口语教学模式创新研究》</b><br/>落地应用平台，专为来华留学生打造。</p>
        </div>
        <button onClick={onClose} style={{width:"100%",padding:14,background:"#D4413A",color:"#fff",border:"none",borderRadius:12,fontWeight:600,fontSize:15,cursor:"pointer"}}>开始体验</button>
      </div>
    </div>
  );
}

// 系统化升级后的学习手册
function StudyManual({hskLevel, onChangeHSK, onBack}) {
  const [tab, setTab] = useState("vocab");
  const [openCard, setOpenCard] = useState(null);
  const tabs = [{ id: "vocab", label: "重点词汇", icon: "📚" }, { id: "grammar", label: "核心语法", icon: "⚙️" }, { id: "pinyin", label: "语音声调", icon: "🗣️" }];
  const data = MANUAL_DATA[hskLevel]?.[tab] || [];
  const lv = HSK_LEVELS.find(l => l.id === hskLevel);

  return (
    <div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"'Noto Sans SC',sans-serif"}}>
      <TopBar title="学习手册" subtitle="Study Manual" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK}/>
      <PageWrap maxWidth={800}>
        <div style={{padding:"32px 0 80px"}}>
          
          <div style={{background: "#fff", borderRadius: 20, padding: "24px 28px", marginBottom: 32, border: "1px solid #f0efe8", display: "flex", gap: 20, alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{fontSize: 48}}>{lv?.emoji}</div>
            <div>
              <h2 style={{margin: "0 0 8px 0", fontSize: 20, color: "#1a1a1a"}}>{lv?.label} 知识图谱</h2>
              <p style={{margin: 0, fontSize: 14, color: "#666", lineHeight: 1.6}}>系统化梳理该阶段的{lv?.desc}。建议按照“词汇 → 语法 → 发音”的模块顺序进行复习，构建完整的汉语框架。</p>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:28,background:"#fff",padding:6,borderRadius:16,border:"1px solid #f0efe8",boxShadow:"0 2px 8px rgba(0,0,0,0.02)"}}>
             {tabs.map(t => (
                <button key={t.id} onClick={()=>{setTab(t.id);setOpenCard(null);}}
                  style={{flex:1, padding:"12px 0", borderRadius:12, border:"none", background:tab===t.id?"#D4413A":"transparent", color:tab===t.id?"#fff":"#888", fontWeight:600, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.3s"}}>
                  <span style={{fontSize:16}}>{t.icon}</span>{t.label}
                </button>
             ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {data.map((item, i) => {
              const isOpen = openCard === i;
              const idxStr = (i + 1).toString().padStart(2, '0');
              return (
                <div key={i} style={{background:"#fff",borderRadius:16,border:`1.5px solid ${isOpen?"#D4413A40":"#f0efe8"}`,overflow:"hidden",boxShadow:isOpen?"0 6px 16px rgba(212,65,58,0.08)":"0 1px 3px rgba(0,0,0,0.02)",transition:"all 0.3s"}}>
                  <button onClick={()=>setOpenCard(isOpen?null:i)} style={{width:"100%",padding:"20px 24px",border:"none",background:"transparent",display:"flex",alignItems:"center",cursor:"pointer"}}>
                    <span style={{fontSize: 24, fontWeight: 800, color: isOpen?"#D4413A":"#eee", marginRight: 16, transition: "0.3s", fontStyle: "italic"}}>
                      {idxStr}
                    </span>
                    <span style={{fontSize:16,fontWeight:600,color:isOpen?"#D4413A":"#1a1a1a",textAlign:"left",flex:1}}>{item.title}</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isOpen?"#D4413A":"#ccc"} strokeWidth="2.5" style={{transform:isOpen?"rotate(180deg)":"none",transition:"0.3s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {isOpen && (
                    <div style={{padding:"0 24px 24px",animation:"su 0.3s both", marginLeft: 40}}>
                      <div style={{fontSize:14,color:"#555",lineHeight:1.7,marginBottom:16}}>{item.desc}</div>
                      <div style={{background:"#FDF0EF",padding:"14px 18px",borderRadius:12,color:"#D4413A",fontWeight:500,borderLeft:"4px solid #D4413A"}}>
                        <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",opacity:0.8,marginBottom:6}}>Example / 示例</div>
                        <div style={{lineHeight: 1.5}}>{item.example}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </PageWrap>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MENU ITEM COMPONENT
   ═══════════════════════════════════════════ */

function MenuItem({item, onClick, hovered, onHover, badge}){
  return <div onClick={onClick} onMouseEnter={()=>onHover(item.id)} onMouseLeave={()=>onHover(null)}
    style={{background:"#fff",borderRadius:18,padding:"26px 24px",cursor:"pointer",border:`1px solid ${hovered===item.id?item.color+"60":"#f0efe8"}`,transition:"all 0.3s",transform:hovered===item.id?"translateY(-3px)":"none",boxShadow:hovered===item.id?`0 10px 28px ${item.color}15`:"0 1px 3px rgba(0,0,0,0.03)", display:"flex", flexDirection:"column", height:"100%"}}>
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
      <div style={{width:56,height:56,borderRadius:16,background:item.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0,transition:"transform 0.2s",transform:hovered===item.id?"scale(1.06)":"none"}}>{item.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:20,fontWeight:600,color:"#1a1a1a"}}>{item.title}</span>{badge&&<span style={{fontSize:11,background:item.color+"18",color:item.color,padding:"2px 10px",borderRadius:10,fontWeight:600}}>{badge}</span>}</div>
        <div style={{fontSize:13,color:"#aaa",marginTop:2}}>{item.titleEn}</div>
      </div>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end", flex:1}}>
      <div style={{fontSize:14,color:"#666", lineHeight:1.5, paddingRight:10}}>{item.desc}</div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={hovered===item.id?item.color:"#ccc"} strokeWidth="2" style={{flexShrink:0,transition:"transform 0.25s",transform:hovered===item.id?"translateX(4px)":"none", marginBottom:2}}><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>;
}

/* ═══════════════════════════════════════════
   MODULE BUILDERS
   ═══════════════════════════════════════════ */

function buildFreeModule(hsk){return{id:"free",title:"自由对话",titleEn:"Free chat",icon:"🗣️",color:"#2DAA6E",bg:"#EDFAF3",system:"Friendly Chinese conversation partner. Chat naturally, correct gently.",greeting:hsk==="1-3"?"汉字: 你好！你叫什么名字？\n拼音: Nǐ hǎo! Nǐ jiào shénme míngzi?\n英文: Hello! What is your name?":hsk==="4-6"?"汉字: 嘿！你好呀！你今天过得怎么样？\n拼音: Hēi! Nǐ hǎo ya! Nǐ jīntiān guò de zěnmeyàng?\n英文: Hey! Hello! How is your day today?":"汉字: 嘿！今天想聊点什么？最近有什么有意思的事儿吗？\n拼音: Hēi! Jīntiān xiǎng liáo diǎn shénme? Zuìjìn yǒu shénme yǒu yìsi de shìr ma?\n英文: Hey! What do you want to chat about today? Anything interesting lately?"};}
function buildWritingChat(mode,hsk){const c={paragraph:{title:"段落写作",titleEn:"Paragraphs",icon:"✍️",color:"#E8A838",bg:"#FFF8ED",system:"Chinese writing coach. Review paragraphs, give feedback. No markdown.",greeting:hsk==="1-3"?"汉字: 我们来练习写段落。请写3-4个句子：我的一天\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 3-4 gè jùzi: Wǒ de yī tiān\n英文: Let's practice paragraph writing. Write 3-4 sentences: My day":hsk==="4-6"?"汉字: 我们来练习写段落。请写4-5个句子：我最喜欢的城市\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 4-5 gè jùzi: Wǒ zuì xǐhuan de chéngshì\n英文: Let's practice paragraph writing. Write 4-5 sentences: My favorite city":"汉字: 我们来练习写段落。请写5-6个句子：网络社交对人际关系的影响\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 5-6 gè jùzi: Wǎngluò shèjiāo duì rénjì guānxi de yǐngxiǎng\n英文: Let's practice paragraph writing. Write 5-6 sentences: The impact of social networking on relationships"},essay:{title:"短文写作",titleEn:"Essays",icon:"📝",color:"#7B6CF6",bg:"#F3F0FF",system:"Chinese essay coach. Score /100, detailed feedback. No markdown.",greeting:hsk==="1-3"?"汉字: 我们来练习写短文。请写5-6个句子：我的家人\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 5-6 gè jùzi: Wǒ de jiārén\n英文: Let's practice essay writing. Write 5-6 sentences: My family":hsk==="4-6"?"汉字: 我们来练习写短文。请写8-10个句子：一次难忘的旅行\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 8-10 gè jùzi: Yí cì nánwàng de lǚxíng\n英文: Let's practice essay writing. Write 8-10 sentences: An unforgettable trip":"汉字: 我们来练习写短文。请写150字：传统文化在现代社会中的角色\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 150 zì: Chuántǒng wénhuà zài xiàndài shèhuì zhōng de juésè\n英文: Let's practice essay writing. Write 150 characters: The role of traditional culture in modern society"}};return c[mode];}

/* ═══════════════════════════════════════════
   PAGES COMPONENTS
   ═══════════════════════════════════════════ */

function HSKSelect({onSelect}) {
  return <PageWrap><div style={{padding: "60px 0", textAlign: 'center'}}>
    <h2 style={{marginBottom: 20}}>请选择你的汉语水平</h2>
    {HSK_LEVELS.map(l => <button key={l.id} onClick={()=>onSelect(l.id)} style={{display:"block", width:"100%", padding: 16, marginBottom: 12, borderRadius: 12, border:`1px solid ${l.color}`, background: l.color+"10", color: l.color, fontSize: 16, cursor: "pointer"}}>{l.emoji} {l.label} ({l.sub})</button>)}
  </div></PageWrap>
}

function MainMenu({hskLevel, onChangeHSK, onNav, onOpenAbout}) {
  const [hovered, setHovered] = useState(null);
  return <div style={{minHeight:"100vh", background:"#FAFAF7"}}>
    <TopBar title="SpeakWise 主菜单" hskLevel={hskLevel} onChangeHSK={onChangeHSK} onBack={null} />
    <PageWrap maxWidth={580}>
      <div style={{padding: "40px 0"}}>
        <div style={{display: "flex", flexDirection: "column", gap: 16}}>
          <MenuItem item={{id:"oral", title:"口语训练", titleEn:"Speaking", icon:"🗣️", color:"#4A90D9", bg:"#EEF4FB", desc:"场景模拟与发音评测"}} onClick={()=>onNav("oral")} hovered={hovered} onHover={setHovered} />
          <MenuItem item={{id:"written", title:"写作辅导", titleEn:"Writing", icon:"✍️", color:"#E8A838", bg:"#FFF8ED", desc:"AI 批改段落与短文"}} onClick={()=>onNav("written")} hovered={hovered} onHover={setHovered} />
          <MenuItem item={{id:"manual", title:"学习手册", titleEn:"Study Manual", icon:"📖", color:"#D4413A", bg:"#FDF0EF", desc:"核心语法与词汇系统复习"}} onClick={()=>onNav("manual")} hovered={hovered} onHover={setHovered} />
        </div>
        <div onClick={onOpenAbout} className="footer-link">关于 SpeakWise SRTP 项目</div>
      </div>
    </PageWrap>
  </div>
}

function OralMenu({hskLevel, onChangeHSK, onBack, onNav}) {
  const [hovered, setHovered] = useState(null);
  return <div style={{minHeight:"100vh", background:"#FAFAF7"}}>
     <TopBar title="口语训练" subtitle="Speaking Training" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} />
     <PageWrap maxWidth={580}>
       <div style={{padding: "40px 0"}}>
         <div style={{display: "flex", flexDirection: "column", gap: 16}}>
           <MenuItem item={{id:"scenes", title:"场景模拟", titleEn:"Roleplay Scenes", icon:"🎭", color:"#9B59B6", bg:"#F5F0FA", desc:"在真实场景中扮演角色对话"}} onClick={()=>onNav("scenes")} hovered={hovered} onHover={setHovered} />
           <MenuItem item={{id:"assess", title:"发音测评", titleEn:"Pronunciation", icon:"🎙️", color:"#7B6CF6", bg:"#F3F0FF", desc:"跟读句子，AI 打分纠音"}} onClick={()=>onNav("assess")} hovered={hovered} onHover={setHovered} />
           <MenuItem item={{id:"free", title:"自由对话", titleEn:"Free Chat", icon:"💬", color:"#2DAA6E", bg:"#EDFAF3", desc:"和 AI 教练随便聊聊"}} onClick={()=>onNav("free")} hovered={hovered} onHover={setHovered} />
         </div>
       </div>
     </PageWrap>
  </div>
}

function SceneList({hskLevel, onChangeHSK, onBack, onSelect, mode, onChangeMode}) {
  const [hovered, setHovered] = useState(null);
  return <div style={{minHeight:"100vh", background:"#FAFAF7"}}>
     <TopBar title="选择场景" subtitle="Select a Scenario" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} mode={mode} onChangeMode={onChangeMode} />
     <PageWrap maxWidth={860}>
       <div style={{padding: "40px 0"}}>
         <div className="menu-grid">
           {SCENARIOS.map(s => <MenuItem key={s.id} item={s} onClick={()=>onSelect(s)} hovered={hovered} onHover={setHovered} />)}
         </div>
       </div>
     </PageWrap>
  </div>
}

function WrittenMenu({hskLevel, onChangeHSK, onBack, onSelect}) {
  const [hovered, setHovered] = useState(null);
  return <div style={{minHeight:"100vh", background:"#FAFAF7"}}>
     <TopBar title="写作辅导" subtitle="Writing Coach" onBack={onBack} hskLevel={hskLevel} onChangeHSK={onChangeHSK} />
     <PageWrap maxWidth={580}>
       <div style={{padding: "40px 0"}}>
         <div style={{display: "flex", flexDirection: "column", gap: 16}}>
           <MenuItem item={{id:"sentence", title:"造句练习", titleEn:"Sentence Building", icon:"✏️", color:"#4A90D9", bg:"#EEF4FB", desc:"使用指定词汇写句子，AI 批改"}} onClick={()=>onSelect({id:"sentence"})} hovered={hovered} onHover={setHovered} />
           <MenuItem item={{id:"paragraph", title:"段落写作", titleEn:"Paragraphs", icon:"📝", color:"#E8A838", bg:"#FFF8ED", desc:"写几个连贯的句子"}} onClick={()=>onSelect({id:"paragraph"})} hovered={hovered} onHover={setHovered} />
           <MenuItem item={{id:"essay", title:"短文写作", titleEn:"Essays", icon:"📚", color:"#7B6CF6", bg:"#F3F0FF", desc:"写一篇完整的短文，打分并反馈"}} onClick={()=>onSelect({id:"essay"})} hovered={hovered} onHover={setHovered} />
         </div>
       </div>
     </PageWrap>
  </div>
}

/* ═══════════════════════════════════════════
   APP ROOT
   ═══════════════════════════════════════════ */

export default function App() {
  const [isMounted, setIsMounted] = useState(false);
  const [hsk, setHsk] = useState(null);
  const [viewMode, setViewMode] = useState("HPE");
  const [showWelcome, setShowWelcome] = useState(false);
  
  // 核心修改 1：移除直接跳过的逻辑，让初始视图永远为 HSK 选择页
  const [view, setView] = useState("hsk");

  useEffect(() => {
    // 读取上一次的模式设定
    const savedMode = localStorage.getItem("viewMode");
    if (savedMode) setViewMode(savedMode);

    // 核心修改 2：使用新的 localStorage 字段，确保更新后你能看到第一次弹窗
    const seenSrtp = localStorage.getItem("srtpSeen_v2");
    if (!seenSrtp) setShowWelcome(true);

    setIsMounted(true);
  }, []);

  // 当用户选择 HSK 时保存（虽然不再自动跳过，但依然可以存着方便以后别的逻辑使用）
  useEffect(() => { if (isMounted && hsk) localStorage.setItem("hsk", hsk); }, [hsk, isMounted]);
  useEffect(() => { if (isMounted) localStorage.setItem("viewMode", viewMode); }, [viewMode, isMounted]);

  const closeWelcome = () => { 
    setShowWelcome(false); 
    localStorage.setItem("srtpSeen_v2", "true"); 
  };
  const openWelcomeModal = () => setShowWelcome(true);

  const [chatMod, setChatMod] = useState(null);
  const [chatVoice, setChatVoice] = useState(true);
  const [chatParent, setChatParent] = useState("oral");
  const [drillType, setDrillType] = useState(null);
  const [drillParent, setDrillParent] = useState("oral");

  const openChat=(m,v,p)=>{setChatMod(m);setChatVoice(v);setChatParent(p);setView("chat");};
  const openDrill=(t,p)=>{setDrillType(t);setDrillParent(p);setView("drill");};
  const oralNav=id=>{if(id==="scenes")setView("scenes");else if(id==="assess")openDrill("pronunciation","oral");else if(id==="free")openChat(buildFreeModule(hsk),true,"oral");};
  const sceneSelect=s=>openChat({...s,system:`SCENARIO: ${s.role}\nStay in character, 2-3 sentences, correct gently. No markdown.`,greeting:s.greeting[hsk]||s.greeting["4-6"]},true,"scenes");
  const writingSelect=m=>{if(m.id==="sentence")openDrill("sentence","written");else openChat(buildWritingChat(m.id,hsk),false,"written");};

  if (!isMounted) return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap');
        @keyframes su { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0.12) } 50% { box-shadow: 0 0 0 12px rgba(0,0,0,0) } }
        @keyframes dp { 0%, 80%, 100% { opacity: .3; transform: scale(.8) } 40% { opacity: 1; transform: scale(1.1) } }
        * { box-sizing: border-box; margin: 0 }
        body { font-family: 'Noto Sans SC', sans-serif }
        
        /* 只有 SceneList 使用这个类，保证它在宽屏下是两列 */
        .menu-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 640px) {
          .menu-grid { grid-template-columns: repeat(2, 1fr); }
        }

        /* 底部链接样式 */
        .footer-link {
          text-align: center;
          margin-top: 48px;
          font-size: 13px;
          color: #aaa;
          cursor: pointer;
          transition: color 0.3s;
        }
        .footer-link:hover {
          color: #666;
          text-decoration: underline;
        }
      `}</style>
      
      {showWelcome && <SrtpWelcomeModal onClose={closeWelcome} />}
      {view==="hsk"&&<HSKSelect onSelect={l=>{setHsk(l);setView("main");}}/>}
      {view==="main"&&<MainMenu hskLevel={hsk} onChangeHSK={setHsk} onNav={id=>setView(id==="oral"?"oral":id==="written"?"written":"manual")} onOpenAbout={openWelcomeModal}/>}
      {view==="oral"&&<OralMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")} onNav={oralNav}/>}
      {view==="scenes"&&<SceneList hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("oral")} onSelect={sceneSelect} mode={viewMode} onChangeMode={setViewMode}/>}
      {view==="written"&&<WrittenMenu hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")} onSelect={writingSelect}/>}
      {view==="manual"&&<StudyManual hskLevel={hsk} onChangeHSK={setHsk} onBack={()=>setView("main")}/>}
      {view==="chat"&&chatMod&&<ChatView module={chatMod} hskLevel={hsk} onBack={()=>setView(chatParent)} onChangeHSK={setHsk} showVoice={chatVoice} mode={viewMode} onChangeMode={setViewMode}/>}
      {view==="drill"&&<DrillView type={drillType} hskLevel={hsk} onBack={()=>setView(drillParent)} onChangeHSK={setHsk} mode={viewMode} onChangeMode={setViewMode}/>}
    </>
  );
}
