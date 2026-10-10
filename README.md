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
- **视频导出**：结算卡「导出视频」— WebCodecs H.264 硬编码 + mp4-muxer 封装，
  1280×720/30fps MP4，长回放按 ≤45s 目标等比加速采样；`renderFrame` 纯函数逐帧渲染
  （与预览同一路径），不支持 WebCodecs 的浏览器自动隐藏入口（`lib/video-export.ts`）
- **定投模式（DCA）**：回放 URL 加 `m=dca&monthly=1000` 启用，份额法逐日计算
  - 引擎：`lib/engine.ts` 的 `dcaSeries`/`dcaInvested`；收益率/回撤相对**累计投入**
  - 主页预设卡每个案例带定投变体；落地页有「定投 vs 一次性买入」对比表（构建期真算）
  - 梗文案参数为 `mtext`（旧 `m=` 仅非 `dca` 值时生效）
- **多语言**：中文默认（根路径 `/`），英文镜像挂 `/en/` 前缀
  - 文案字典在 `lib/i18n.ts`（`Dict` 类型保证中英键一一对应）
  - 页面正文组件（`HomeContent` / `StockLandingContent`）中英共用，按 `locale` 渲染
  - `<link rel="alternate" hreflang>` 由各页 metadata 的 `alternates.languages` 生成
  - 新增语言：`lib/i18n.ts` 加字典 + 新建对应路由目录即可（回放页为纯客户端组件）

## 开发

```bash
npm install
npm run fetch-data   # 抓取/更新股票数据（东财限流, 脚本内置 5s 限速与退避）
npm run dev
npm run test        # 引擎单元测试（node --test，零依赖）
npm run lint        # TypeScript 类型检查
npm run build       # 静态导出到 out/（prebuild 先跑数据完整性校验; 构建后自动把英文站产物 lang 改为 en）
```

> OG 分享图：中文版为 tools/og-src.html 模板 → 浏览器以 1200×630 截图存 public/og.png；
> 英文版由 app/en/opengraph-image.tsx 构建期自动生成。

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
注意：`lib/i18n.ts` 的 `TAGLINE_EN` 需同步补该标的的英文一句话简介（缺省回退英文名）。

## 部署

任意静态托管（Cloudflare Pages / Vercel / OSS+CDN）：

1. `npm run build` → 部署 `out/`
   - 注意: 托管侧构建命令必须是 `npm run build`（而非裸 `next build`），否则 prebuild 数据门禁与英文站 lang 修正不会执行（Cloudflare Pages 默认构建命令绕过 npm 钩子, 需在控制台手动指定）
2. DNS 增加 CNAME：`whatif.axtrivc.com` → 托管地址
3. 新 URL 可提交 IndexNow：`node scripts/submit-urls.mjs`（密钥文件 `public/<key>.txt`，换密钥时与脚本内常量同步更新）

## 口径与合规

- 后复权价格（分红按除息日再投资近似），不含交易税费与汇率影响
- 页面明示"历史模拟 · 仅供参考 · 不构成投资建议"
- 不提供实时行情，不做荐股
