/**
 * 回放数据早取 — 注入外部 async script(见 public/wi-early.js):
 * 带 src+async 的 script 在 SSR 直开(HTML 解析期执行, 早于 React 水合)与
 * 客户端路由挂载(React 19 会执行)两种进入方式下都生效, 且无内联 script 的
 * React 渲染告警。站内 router.push 导入回放页时数据可能已由首页 warm() 预热。
 */
export default function ReplayEarlyData() {
  return <script src="/wi-early.js" async />;
}
