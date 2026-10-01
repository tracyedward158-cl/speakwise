// 表单控件的尺寸基准。
//
// ── 为什么尺寸走 class 而不是内联 style ──
//
// 小程序的 `<input>` 是**原生组件**。实测下来，内联 style 在它身上只生效一部分：
// 边框、圆角、宽度都正常，但 `height` 和 `padding` 被无视 —— 输入框停在默认高度
// （约 1.4rem），文字被裁掉下半截，看起来就是「输入框里只剩文字上半部分」。
//
// 这跟浏览器不一样（那边一切正常），所以 Web 版没暴露过。
// 改成 WXSS class 之后尺寸就稳了 —— 那也是小程序里更正统的写法。
//
// 尺寸定义在 app.scss 的 .sw-field / .sw-field--round / .sw-field--tight 里。
//
// 内联部分只留「每个实例各不相同」的东西：颜色、给右侧清除按钮留的paddingRight、
// 以及布局用的 flex / width 覆盖。**不要再往内联里塞 height/padding** ——
// 塞了也不生效，只会让读代码的人以为它在起作用。

/** 变体名 → app.scss 里的 class */
const VARIANTS = {
  base: 'sw-field',
  round: 'sw-field--round', // 对话页 / 造句页底部输入栏
  tight: 'sw-field--tight' // 记录页改昵称那种嵌在卡片里的小号
}

/**
 * 单行输入框的属性。用法：`<Input {...fieldProps()} ... />`
 *
 * @param variant  尺寸变体，见上面 VARIANTS
 * @param style    其余内联样式（颜色、paddingRight、flex 覆盖等）
 */
export function fieldProps({ variant = 'base', ...style } = {}) {
  const cls = VARIANTS[variant]
  if (!cls) {
    // 写错变体名会静默退回默认尺寸，那种 bug 很难查 —— 直接吵出来
    console.warn(`[formStyles] 未知的输入框变体 "${variant}"，已退回 base`)
  }
  return { className: cls || VARIANTS.base, style }
}

/** 多行输入框的属性。用法：`<Textarea {...areaProps({ height: 180 })} />` */
export function areaProps({ ...style } = {}) {
  return { className: 'sw-area', style }
}
