// 页面表。Web 版的 24 条路由收敛到这里 —— Taro/小程序的 pages 是静态数组，
// 不能像 App.jsx 那样按登录态/角色拼 JSX 分支，所以原来的三路条件路由
// 全部改由 pages/launch 与 hooks/useGuard 在运行时重定向。
//
// 参数一律走查询串（小程序没有路径参数），例如原来的 /oral/scene/:sceneId
// 现在是 pages/chat/index?sceneId=xxx。
export default {
  pages: [
    'pages/launch/index', // 入口：只做重定向，不留栈
    'pages/login/index',
    'pages/hsk/index',
    'pages/main/index',
    'pages/oral/index',
    'pages/scenes/index',
    'pages/chat/index',
    'pages/pronunciation/index',
    'pages/pron-daily/index',
    'pages/pron-bank/index',
    'pages/pron-test/index',
    'pages/drill/index',
    'pages/written/index',
    'pages/records/index',
    'pages/user-center/index',
    'pages/manual/index',
    'pages/diag/index' // 语音链路诊断页
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: 'SpeakWise',
    navigationBarTextStyle: 'black',
    // TopBar 里带 HSK / 显示模式两个下拉，系统导航栏装不下，自绘。
    // 代价是要自己处理状态栏高度和右上角胶囊的避让，见 components/TopBar.jsx。
    navigationStyle: 'custom'
  },
  // 注意：这里**不能**写 permission["scope.record"]。
  // app.json 的 permission 字段只用于地理位置类 scope（scope.userLocation /
  // userFuzzyLocation / userLocationBackground），其它 scope 写进去会被微信判为
  // 「无效的 app.json permission[...]」。麦克风授权只有运行时一条路：
  // Taro.authorize({scope:'scope.record'})，见 platform/privacy.js。
  //
  // 另外，麦克风能不能用还取决于管理后台《用户隐私保护指引》里是否声明了它 ——
  // 没声明时录音 API 会被直接禁用，而且可能是静默失败（不弹窗、不报错）。
  lazyCodeLoading: 'requiredComponents'
}
