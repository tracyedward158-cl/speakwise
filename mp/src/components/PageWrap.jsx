import { View } from '@tarojs/components'

// Web 版是一行 div + maxWidth 居中。小程序恒为手机宽度，maxWidth 恒不生效，
// 所以这里只保留左右留白 —— 省掉一个永远为真的条件，也少一层无谓的样式。
export function PageWrap({ children, style }) {
  return <View style={{ padding: '0 20px', width: '100%', ...style }}>{children}</View>
}
