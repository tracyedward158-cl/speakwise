export function buildFreeModule(hsk) {
  return {
    id: "free", title: "自由对话", titleEn: "Free chat", icon: "🗣️", color: "#2DAA6E", bg: "#EDFAF3",
    system: "Friendly Chinese conversation partner. Chat naturally, correct gently.",
    greeting: hsk === "1-3"
      ? "汉字: 你好！你叫什么名字？\n拼音: Nǐ hǎo! Nǐ jiào shénme míngzi?\n英文: Hello! What is your name?"
      : hsk === "4-6"
        ? "汉字: 嘿！你好呀！你今天过得怎么样？\n拼音: Hēi! Nǐ hǎo ya! Nǐ jīntiān guò de zěnmeyàng?\n英文: Hey! Hello! How is your day today?"
        : "汉字: 嘿！今天想聊点什么？最近有什么有意思的事儿吗？\n拼音: Hēi! Jīntiān xiǎng liáo diǎn shénme? Zuìjìn yǒu shénme yǒu yìsi de shìr ma?\n英文: Hey! What do you want to chat about today? Anything interesting lately?"
  };
}

export function buildWritingChat(mode, hsk) {
  const c = {
    paragraph: {
      title: "段落写作", titleEn: "Paragraphs", icon: "✍️", color: "#E8A838", bg: "#FFF8ED",
      system: "Chinese writing coach. Review paragraphs, give feedback. No markdown.",
      greeting: hsk === "1-3"
        ? "汉字: 我们来练习写段落。请写3-4个句子：我的一天\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 3-4 gè jùzi: Wǒ de yī tiān\n英文: Let's practice paragraph writing. Write 3-4 sentences: My day"
        : hsk === "4-6"
          ? "汉字: 我们来练习写段落。请写4-5个句子：我最喜欢的城市\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 4-5 gè jùzi: Wǒ zuì xǐhuan de chéngshì\n英文: Let's practice paragraph writing. Write 4-5 sentences: My favorite city"
          : "汉字: 我们来练习写段落。请写5-6个句子：网络社交对人际关系的影响\n拼音: Wǒmen lái liànxí xiě duànluò. Qǐng xiě 5-6 gè jùzi: Wǎngluò shèjiāo duì rénjì guānxi de yǐngxiǎng\n英文: Let's practice paragraph writing. Write 5-6 sentences: The impact of social networking on relationships"
    },
    essay: {
      title: "短文写作", titleEn: "Essays", icon: "📝", color: "#7B6CF6", bg: "#F3F0FF",
      system: "Chinese essay coach. Score /100, detailed feedback. No markdown.",
      greeting: hsk === "1-3"
        ? "汉字: 我们来练习写短文。请写5-6个句子：我的家人\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 5-6 gè jùzi: Wǒ de jiārén\n英文: Let's practice essay writing. Write 5-6 sentences: My family"
        : hsk === "4-6"
          ? "汉字: 我们来练习写短文。请写8-10个句子：一次难忘的旅行\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 8-10 gè jùzi: Yí cì nánwàng de lǚxíng\n英文: Let's practice essay writing. Write 8-10 sentences: An unforgettable trip"
          : "汉字: 我们来练习写短文。请写150字：传统文化在现代社会中的角色\n拼音: Wǒmen lái liànxí xiě duǎnwén. Qǐng xiě 150 zì: Chuántǒng wénhuà zài xiàndài shèhuì zhōng de juésè\n英文: Let's practice essay writing. Write 150 characters: The role of traditional culture in modern society"
    }
  };
  return c[mode];
}
