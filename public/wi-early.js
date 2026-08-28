/* 回放数据早取 — 回放页 HTML 解析期(先于 React 水合)就 fetch 标的数据 JSON,
   弱网/低端机上可领先水合数百 ms~数秒; promise 挂 window.__wiData,
   ReplayClient 挂载后直接复用同一次请求(见其 effect 的 early 分支)。
   带 async src 的 script 在 SSR 直开与客户端导航两种进入方式下都会执行, 故有防重入守卫。 */
(function () {
  try {
    var k = new URLSearchParams(location.search).get('s') || 'msft';
    k = k.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!k) return;
    var W = (window.__wiData = window.__wiData || {});
    if (W[k]) return;
    W[k] = fetch('/data/' + k + '.json').then(
      function (r) {
        return r.ok ? r.json() : null;
      },
      function () {
        return null;
      }
    );
  } catch (e) {
    /* 早取失败无妨, ReplayClient 会走常规 fetch */
  }
})();
