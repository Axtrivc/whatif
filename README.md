# WhatIf · 假如当时买了

投资回放动画站：选一只股票、一个年份、一笔本金，用动画逐日回放"一直持有 · 红利复投"的复利之旅。
灵感来自抖音爆款"假如 XXXX 年买入 100 万 XXX"系列，做成可交互、可分享的网页版。

- 线上地址：<https://whatif.axtrivc.com>
- 姊妹站：[ToolHub](https://toolhub.axtrivc.com)（首页有入口链接）

## 技术架构

- **Next.js 静态导出**（`output: 'export'`）+ Tailwind CSS，零后端、零运维
- **数据**：构建前从东方财富历史 K 线 API 抓取后复权日线 → `public/data/*.json`
  - 后复权序列的比值 ≈ 分红再投资总回报（"红利复投"口径）
- **渲染引擎**：`components/replay-render.ts` 的 `renderFrame(ctx, t)` 纯函数
  - 预览与未来的逐帧视频导出（WebCodecs + H.264 MP4）共用同一渲染路径
- **分享**：v1 生成 1080×1350 PNG 分享图 + 复制链接（支持 `navigator.share` 文件分享）

## 开发

```bash
npm install
npm run fetch-data   # 抓取/更新股票数据（东财限流, 脚本内置 5s 限速与退避）
npm run dev
npm run build        # 静态导出到 out/
```

## 数据更新

```bash
node scripts/fetch-data.mjs          # 全部标的(美股/指数/黄金走东财, BTC 走 Bitstamp)
node scripts/fetch-data.mjs msft btc # 指定标的
```

脚本收尾会自动生成/刷新：

- `public/data/index.json` — 各标的日期范围清单（与已有内容合并，sitemap 的 lastModified 用真实数据日期）
- `public/data/ticker.json` — 全部标的最新真实价 + 日涨跌（首页走马灯数据源）

标的目录在 `lib/stocks.ts` 的 `STOCKS`、`scripts/fetch-data.mjs` 的 `CATALOG`/`TICKER_ORDER` 中同步维护。
新增标的：两处各加一行 → 跑 fetch-data → 落地页/站点地图自动生成。

## 部署

任意静态托管（Cloudflare Pages / Vercel / OSS+CDN）：

1. `npm run build` → 部署 `out/`
2. DNS 增加 CNAME：`whatif.axtrivc.com` → 托管地址
3. 新 URL 可提交 IndexNow：`node scripts/submit-urls.mjs`（密钥文件 `public/<key>.txt`，换密钥时与脚本内常量同步更新）

## 口径与合规

- 后复权价格（分红按除息日再投资近似），不含交易税费与汇率影响
- 页面明示"历史模拟 · 仅供参考 · 不构成投资建议"
- 不提供实时行情，不做荐股
