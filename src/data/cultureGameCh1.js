// 文游 · 一鸣惊人 — 第一章

export const IMG = {
  hunt:   "/images/c1-hunt.png",
  advise: "/images/c1-advise.png",
  badend: "",
  wuju:   "",
  king:   "",
  guard:  "",
  you:    "",
};

export const META = {
  title: "一鸣惊人",
  subtitle: "第一章",
  desc: "随伍举入宫，以隐语劝谏楚庄王，成就千古成语。",
};

export const SCRIPT = [
  { who: "旁白", text: "公元前 613 年　楚国·郢都　王宫猎场", bg: "", img: "" },
  { who: "伍举", text: "小兄弟，大王现在一门心思沉迷狩猎、不管朝政，再这么下去国家就危险了！我想到个劝他的法子，得借你的力帮我递个话才行。", bg: IMG.hunt, img: IMG.wuju },
  { who: "你", text: "我愿意和大人一起去。", bg: IMG.hunt, img: IMG.you },
  { who: "伍举", text: "（低声）你觉得我该如何劝谏大王？", bg: IMG.hunt, img: IMG.wuju, branch: true },
];

export const CHOICE_1 = [
  { text: "直接告诉大王：您再不治国，楚国就完了", correct: false, feedback: "楚王怒拍案：'妖言惑众，拖下去！'" },
  { text: "用比喻的故事，让大王自己领悟", correct: true, feedback: '伍举点头：\'妙计！就用"三年不飞鸟"的隐语。\'' },
  { text: "写一首诗歌，委婉表达", correct: false, feedback: "楚王皱眉：'酸儒之言，拖出去！'" },
];

export const PALACE_SCRIPT = [
  { who: "旁白", text: "—— 队伍转入大殿，百官肃立 ——", bg: IMG.advise, img: "" },
  { who: "伍举", text: "大王，臣听说有只鸟落在城外的土山上，整整三年既不飞也不叫，您说这是什么鸟呀？", bg: IMG.advise, img: IMG.wuju },
  { who: "楚王", text: "哦？那在你看来，这只鸟怎么样呢？", bg: IMG.advise, img: IMG.king, branch: true },
];

export const CHOICE_2 = [
  { text: "这鸟三年不飞，一旦展翅就会直冲云霄；三年不鸣，一旦开口就会惊动天下人", correct: true, feedback: "楚王大笑：'说得好！此鸟，寡人也！'" },
  { text: "此鸟平庸无为，白白地占领高枝，不如驱逐它", correct: false, feedback: "楚王怒喝：'拖下去，斩！'" },
];

export const VICTORY_SCRIPT = [
  { who: "楚王", text: "说得好！此鸟，寡人也！", bg: IMG.advise, img: IMG.king },
  { who: "旁白", text: "楚庄王从此亲理朝政，诛杀奸臣数百，进用贤臣数百。", bg: IMG.advise, img: "" },
  { who: "旁白", text: "任用伍举、苏从等贤臣治理朝政，楚国日益富强。", bg: IMG.advise, img: "" },
  { who: "旁白", text: "后来楚庄王问鼎中原，大败晋国，成为春秋五霸之一。", bg: IMG.advise, img: "" },
  { who: "旁白", text: "【成就】成语'一鸣惊人'已收录于你的文化手册！", bg: IMG.advise, img: "" },
];
