// 文游 · 卧薪尝胆 — 第二章

export const IMG = {
  battle:  "/images/c2-battle.png",
  hut:     "/images/c2-hut.png",
  badend:  "https://cdn.jsdelivr.net/gh/oxguy/chaotic/images/blood-hall.jpg",
  victory: "https://cdn.jsdelivr.net/gh/oxguy/chaotic/images/yue-victory.jpg",
  fuchai:  "/images/c2-fuchai.png",
  goujian: "/images/c2-goujian.png",
  you:     "https://cdn.jsdelivr.net/gh/oxguy/chaotic/images/player-gu.png",
  guard:   "https://cdn.jsdelivr.net/gh/oxguy/chaotic/images/wu-guard.png",
};

export const META = {
  title: "卧薪尝胆",
  subtitle: "第二章",
  desc: "随越王勾践卧薪尝胆，积蓄力量，十年生聚终雪前耻。",
};

export const SCRIPT = [
  { who: "旁白", text: "公元前 494 年　吴国·姑苏台", bg: "", img: "" },
  { who: "吴王夫差", text: "勾践，你败于我手，今日起为我牵马洗辇，可有不服？", bg: IMG.battle, img: IMG.fuchai },
  { who: "越王勾践", text: "（俯首）臣……不敢。愿为大王效犬马之劳。", bg: IMG.battle, img: IMG.goujian },
  { who: "吴王夫差", text: "哼！算你识相。且看你这三年的表现！", bg: IMG.battle, img: IMG.fuchai },
  { who: "旁白", text: "三年后，勾践获释归国，居于会稽山茅屋……", bg: IMG.hut, img: "" },
  { who: "你", text: "大王，您每日睡柴草、尝苦胆，这是何苦？", bg: IMG.hut, img: IMG.you },
  { who: "越王勾践", text: "汝知'卧薪尝胆'之意乎？我问你——", bg: IMG.hut, img: IMG.goujian, branch: true },
];

export const CHOICE_1 = [
  { text: "大王应享安乐，忘却前耻，与吴修好", correct: false, feedback: "勾践怒目：'懦夫之言！' 吴兵突至，将你押走……" },
  { text: "大王卧薪尝胆，正是为了不忘耻辱，积蓄力量复国", correct: true, feedback: "勾践点头：'知我者，卿也。十年生聚，十年教训，越必兴！'" },
  { text: "大王此举徒增苦楚，不如刺杀夫差，一了百了", correct: false, feedback: "勾践摇头：'匹夫之勇，不足与谋。' 你被逐出宫外……" },
];

export const PALACE_SCRIPT = [
  { who: "旁白", text: "—— 十年后，越国大治，兵强马壮 ——", bg: IMG.victory, img: "" },
  { who: "越王勾践", text: "如今时机已至！汝愿随我伐吴，一雪前耻？", bg: IMG.victory, img: IMG.goujian },
  { who: "你", text: "臣万死不辞！", bg: IMG.victory, img: IMG.you },
  { who: "旁白", text: "公元前 473 年，越军攻破姑苏，吴王夫差自刎。", bg: IMG.battle, img: "" },
];

export const CHOICE_2 = []; // No second choice in this chapter

export const VICTORY_SCRIPT = [
  { who: "越王勾践", text: "二十年卧薪尝胆，终雪会稽之耻！夫差，你可曾想到今日？", bg: IMG.battle, img: IMG.goujian },
  { who: "旁白", text: "勾践终于报了会稽之仇，成为了春秋最后一位霸主。", bg: IMG.victory, img: "" },
  { who: "旁白", text: "'卧薪尝胆'的典故流传至今，成为激励后人忍辱负重、奋发图强的精神象征。", bg: IMG.victory, img: "" },
  { who: "旁白", text: "【成就】成语'卧薪尝胆'已收录于你的文化手册！", bg: IMG.victory, img: "" },
];
