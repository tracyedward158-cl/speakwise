// 文游 · 完璧归赵 — 第三章

export const META = {
  title: "完璧归赵",
  subtitle: "第三章",
  desc: "随蔺相如携和氏璧入秦，智斗秦王，护璧归赵。",
};

export const IMG = {
  zhaofu:   "",
  palace:   "/images/秦王蔺相如对峙图.png",
  badend:   "",
  victory:  "",
  miaoxian: "/images/缪贤立绘.png",
  linxiang:"/images/蔺相如立绘.png",
  you:      "",
  guard:    "",
};

export const SCRIPT = [
  { who: "旁白", text: "公元前 283 年　赵国·邯郸", bg: "", img: "" },
  { who: "旁白", text: "楚人卞和献'和氏璧'于赵惠文王，此璧天下无双。", bg: IMG.zhaofu, img: "" },
  { who: "缪贤", text: "秦王愿以十五座城池交换和氏璧，但这必是骗局……", bg: IMG.zhaofu, img: IMG.miaoxian },
  { who: "缪贤", text: "相如虽愿携璧入秦，但我心中不安。你随他同去，务必护璧周全！", bg: IMG.zhaofu, img: IMG.miaoxian },
  { who: "蔺相如", text: "此璧价值连城，更系赵国安危。我有一计，但需有人配合。你，可愿助我？", bg: IMG.zhaofu, img: IMG.linxiang },
  { who: "你", text: "晚辈万死不辞！", bg: IMG.zhaofu, img: IMG.you },
  { who: "蔺相如", text: "若秦王在章台接见我，却无意交割城池，我该如何应对？", bg: IMG.zhaofu, img: IMG.linxiang, branch: true },
];

export const CHOICE_1 = [
  { text: "当场揭穿秦王诡计，痛斥秦国无信", correct: false, feedback: "蔺相如摇头：'激怒秦王，人璧俱失。' 秦兵将你拿下……" },
  { text: "假称璧有瑕疵，要回玉璧，再拖延时间", correct: true, feedback: "蔺相如眼中闪过赞赏：'正是此计！'" },
  { text: "献上玉璧，换取秦王好感，再求割城", correct: false, feedback: "蔺相如叹息：'正中秦王下怀。' 赵国既失璧又失地……" },
];

export const PALACE_SCRIPT = [
  { who: "旁白", text: "—— 章台宫·秦王大殿 ——", bg: IMG.palace, img: "" },
  { who: "秦王", text: "（接过和氏璧，传示美人及左右，群臣欢呼'万岁'）", bg: IMG.palace, img: "" },
  { who: "蔺相如", text: "大王，此璧虽美，却有一微瑕，请让臣指给大王看。", bg: IMG.palace, img: IMG.linxiang },
  { who: "秦王", text: "哦？拿来吾看。", bg: IMG.palace, img: "" },
  { who: "蔺相如", text: "（接过玉璧，后退数步，倚柱而立，怒发冲冠）大王欲得璧，使人发书至赵王。赵王悉召群臣议，皆言秦贪，负其强，以空言求璧，偿城恐不可得！", bg: IMG.palace, img: IMG.linxiang },
  { who: "蔺相如", text: "臣观大王无意偿赵王城邑，故臣复取璧。大王必欲急臣，臣头今与璧俱碎于柱矣！", bg: IMG.palace, img: IMG.linxiang },
  { who: "秦王", text: "（大惊失色，连声劝阻）先生勿急！寡人即刻召有司案图，指从此以往十五都予赵！", bg: IMG.palace, img: "" },
  { who: "蔺相如", text: "（暗中对你使眼色）你快——", bg: IMG.palace, img: IMG.linxiang, branch: true },
];

export const CHOICE_2 = [
  { text: "立即上前扶住蔺相如，防止他真的撞柱", correct: false, feedback: "此举暴露计谋，秦王强行夺璧……" },
  { text: "悄悄退出大殿，准备马车，接应玉璧潜逃", correct: true, feedback: "你悄然退出，从者衣褐怀璧，从径道亡……" },
  { text: "大声附和蔺相如，增加气势", correct: false, feedback: "人多引起警觉，秦兵封锁宫门……" },
];

export const VICTORY_SCRIPT = [
  { who: "旁白", text: "—— 玉璧归赵，不辱使命 ——", bg: IMG.victory, img: "" },
  { who: "蔺相如", text: "完璧归赵！秦王虽强，终不能欺赵！", bg: IMG.victory, img: IMG.linxiang },
  { who: "你", text: "大人智勇双全，晚辈佩服！", bg: IMG.victory, img: IMG.you },
  { who: "旁白", text: "蔺相如拜为上大夫。后渑池之会再挫秦王，拜为上卿，位在廉颇之上。", bg: IMG.victory, img: "" },
  { who: "旁白", text: "老将廉颇不服，扬言羞辱，蔺相如以国家为重，处处避让。", bg: IMG.victory, img: "" },
  { who: "蔺相如", text: "'先国家之急而后私仇也。'", bg: IMG.victory, img: IMG.linxiang },
  { who: "旁白", text: "廉颇闻之，肉袒负荆，登门谢罪——成就'负荆请罪'的千古美谈。", bg: IMG.victory, img: "" },
  { who: "旁白", text: "【成就】成语'完璧归赵'已收录于你的文化手册！", bg: IMG.victory, img: "" },
];
