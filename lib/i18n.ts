/**
 * 站点多语言字典 — 中文为默认(根路径), 英文挂 /en/ 前缀
 * 静态导出无路由参数可用, 组件一律显式接收 locale 或 dict
 */
import type { Market } from './stocks.ts';

export type Locale = 'zh' | 'en';

export const LOCALES: Locale[] = ['zh', 'en'];

/** 路径辅助: 中文不带前缀, 英文加 /en; 已有尾斜杠不重复追加 */
export function lp(locale: Locale, path: string): string {
  if (path === '/' && locale === 'zh') return '/';
  const p = path === '/' ? '' : path;
  const base = locale === 'en' ? `/en${p}` : p;
  return base.endsWith('/') ? base : `${base}/`;
}

const zh = {
  siteName: '假如当时买了',
  brandSub: 'whatif',
  playNow: '直接开玩 →',

  heroSub: '选一只股票、一个年份、一笔本金。',
  heroSub2: '看复利如何把时间变成奇迹 —— 动画逐日回放。',

  pickStock: '① 选标的',
  pickYear: '② 选年份',
  pickAmount: '③ 本金',
  pickModeLump: '一次性买入',
  pickModeDca: '每月定投',
  pickMonthly: '每月追加',
  customAmount: '自定义金额',
  amountLabel: (a: number) => (a >= 10000 ? `${a / 10000}万` : String(a)),
  startReplay: '开始穿越 ▶',
  replaySummary: (year: number, amount: string, _ccyPrefix: string, monthly?: string) =>
    `${year} 年投入 ${amount}${monthly ? ` + 每月 ${monthly}` : ''} · 一直持有到今天`,
  dataMissing: '数据文件缺失，请先运行',
  yearAria: '年份',
  customAmountAria: '自定义本金金额',

  hotPicks: '热门穿越 · 真实数据',
  allAssets: '全部标的',
  trustAssets: '标的覆盖',
  trustSince: '数据自',
  trustSpan: '年跨度',
  presetPrincipal: '本金',
  yearsLater: (y: number) => `年后`,
  presetDcaTag: '定投',

  howItWorks: '怎么算的',
  how1Title: '真实历史数据',
  how1Body: '日线行情来自公开市场，后复权口径（分红再投资近似），逐日精确到每一个交易日。',
  how2Title: '动画回放',
  how2Body: '不是干巴巴的表格：曲线逐日生长，收益率实时跳动，终点弹出完整战报。',
  how3Title: '一键分享',
  how3Body: '生成竖版分享海报，或复制战报链接发给朋友 —— 微信、小红书都好使。',
  disclaimer:
    '本站为历史数据模拟娱乐工具：价格为后复权口径（含分红再投资的近似），不包含税费与汇率影响。历史表现不代表未来，本站不构成任何投资建议。理财有风险，投资需谨慎。',

  backHome: '返回首页',
  unknownStock: '未知标的',
  loadFailed: '数据加载失败, 请刷新重试',
  retry: '重试',
  loadingData: '载入历史数据…',

  back: '返回',
  principal: (a: string) => `${a} 本金`,
  titleBuyIn: (year: number, amount: string, name: string) =>
    `假如你在 ${year}年 买入 ${amount} ${name}`,
  titleBuyDca: (year: number, amount: string, monthly: string, name: string) =>
    `假如你在 ${year}年 买入 ${amount} ${name}，每月再投 ${monthly}`,
  dcaSubtitle: '每月定投 · 红利复投',
  invested: '总投入',
  holdForever: '一直持有 · 红利复投',
  returnRate: '收益率',
  buyPriceNowPrice: (buy: string, now: string) => `买入价 ${buy} · 当前收盘 ${now}`,
  finalReturn: '最终收益率',
  finalAssets: '最终剩余资产',
  profit: '盈利',
  loss: '亏损',
  statsLine: (years: number, cagr: number, mdd: number) =>
    `${years} 年 · 年化 ${cagr}% · 最大回撤 ${mdd}%`,
  genPoster: '生成分享海报',
  generating: '生成中…',
  posterDone: '已生成 ✓',
  posterFail: '生成失败 · 点重试',
  exportVideo: '导出视频',
  exporting: (p: number) => `导出中 ${p}%`,
  cancelExport: '取消',
  copyLink: '复制战报链接',
  copied: '已复制 ✓',
  replayAgain: '再测一次',
  simNote: '历史数据模拟，仅供娱乐与复盘',
  pause: '暂停',
  play: '播放',
  progressAria: '进度',
  speedGroup: '播放速度',
  replayBtn: '重播',
  kbdHint: '空格 播放/暂停 · ← → 快退/快进 5 秒 · 1/2/4 倍速 · R 重播',
  canvasAria: (name: string, year: number) => `${name} ${year} 年买入后逐日持有的资产曲线动画`,

  // 落地页 /p/[stock]
  landingTitle: (firstYear: string, name: string, symbol: string) =>
    `假如 ${firstYear} 年买入${name}（${symbol}），今天值多少钱？`,
  landingHl: (principal: string, final: string, mult: string, pctStr: string) =>
    `${principal} → ${final}（${mult} · ${pctStr}）`,
  landingIntro: (
    name: string,
    en: string,
    market: string,
    firstYear: string,
    lastYear: string,
    final: string,
    cagr: number,
    principal: string
  ) =>
    `${name}（${en}，${market}）的数据可以追溯到 ${firstYear} 年。如果从上市初期投入 ${principal}、一直持有并让分红再投资（后复权口径），到 ${lastYear} 年将变成 ${final}，年化收益 ${cagr}%。点击任意年份，用动画回放这趟复利之旅。`,
  watchAnimation: '▶ 看动画',
  colYear: '买入年份',
  colResult: (ccyPrefix: string) => `10万 →`, // zh 金额单位币种中性
  colMultiple: '倍数',
  colCagr: '年化',
  caliberNote:
    '口径说明：采用后复权价格（分红按除息日再投资近似），不含交易税费；加密货币与商品以美元计价。历史数据来自公开市场，可能存在误差。历史表现不代表未来，本页面不构成投资建议。',
  anotherIf: '换一个「假如」',
  dcaCompare: '定投 vs 一次性买入',
  dcaCompareIntro: '两行总投入不同：定投持续追加，一次性一笔投完——收益率各按自身总投入计算',
  dcaColMode: '方式',
  dcaColInvested: '累计投入',
  dcaColFinal: '最终市值',
  dcaColReturn: '收益率',
  dcaModeLump: '一次性买入',
  dcaModeDca: '每月定投',
  dcaTryIt: '▶ 看定投回放',
  dcaCompareSideBySide: '▶ 同屏对比回放',

  footerNote: '© 2026 whatif.axtrivc.com · 姊妹站',
  dataAsOf: (d: string) => `数据截至 ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
};

export type Dict = typeof zh;

const en: Dict = {
  siteName: 'What If You Had Bought',
  brandSub: 'whatif',
  playNow: 'Play Now →',

  heroSub: 'Pick a stock, a year, and an amount.',
  heroSub2: 'Watch compound interest turn time into a miracle — day by day.',

  pickStock: '① Pick an asset',
  pickYear: '② Pick a year',
  pickAmount: '③ Principal',
  pickModeLump: 'Lump sum',
  pickModeDca: 'Monthly DCA',
  pickMonthly: 'Monthly top-up',
  customAmount: 'Custom amount',
  amountLabel: (a: number) => (a >= 1e6 ? `${a / 1e6}M` : a >= 10000 ? `${a / 1000}K` : String(a)),
  startReplay: 'Start Replay ▶',
  replaySummary: (year: number, amount: string, ccyPrefix: string, monthly?: string) =>
    `Invested ${ccyPrefix}${amount}${monthly ? ` + ${monthly}/mo` : ''} in ${year} · held until today`,
  dataMissing: 'Data files missing. Run',
  yearAria: 'Year',
  customAmountAria: 'Custom principal amount',

  hotPicks: 'Popular Journeys · Real Data',
  allAssets: 'All assets',
  trustAssets: 'Assets',
  trustSince: 'Data from',
  trustSpan: 'Years spanned',
  presetPrincipal: 'Principal',
  yearsLater: () => `yrs`,
  presetDcaTag: 'DCA',

  howItWorks: 'How it works',
  how1Title: 'Real historical data',
  how1Body: 'Daily prices come from public markets, adjusted for dividends (total-return approximation), accurate to every trading day.',
  how2Title: 'Animated replay',
  how2Body: 'Not a boring table: the curve grows day by day, returns tick live, and a full battle report pops at the end.',
  how3Title: 'One-tap share',
  how3Body: 'Generate a portrait share card or copy the report link — perfect for social apps.',
  disclaimer:
    'This site is a historical-data simulation for entertainment: prices are total-return adjusted (dividend reinvestment approximated) and exclude taxes and FX effects. Past performance does not predict the future. Nothing here is investment advice.',

  backHome: 'Back home',
  unknownStock: 'Unknown asset',
  loadFailed: 'Failed to load data, please refresh',
  retry: 'Retry',
  loadingData: 'Loading history…',

  back: 'Back',
  principal: (a: string) => `${a} invested`,
  titleBuyIn: (year: number, amount: string, name: string) =>
    `If you bought ${amount} of ${name} in ${year}`,
  titleBuyDca: (year: number, amount: string, monthly: string, name: string) =>
    `${amount} of ${name} in ${year}, plus ${monthly} every month`,
  dcaSubtitle: 'Monthly DCA · dividends reinvested',
  invested: 'Total invested',
  holdForever: 'Buy & hold · dividends reinvested',
  returnRate: 'Return',
  buyPriceNowPrice: (buy: string, now: string) => `Bought ${buy} · Last close ${now}`,
  finalReturn: 'Final return',
  finalAssets: 'Final value',
  profit: 'Gain',
  loss: 'Loss',
  statsLine: (years: number, cagr: number, mdd: number) =>
    `${years} yrs · CAGR ${cagr}% · Max drawdown ${mdd}%`,
  genPoster: 'Share Card',
  generating: 'Rendering…',
  posterDone: 'Saved ✓',
  posterFail: 'Failed · tap to retry',
  exportVideo: 'Export Video',
  exporting: (p: number) => `Exporting ${p}%`,
  cancelExport: 'Cancel',
  copyLink: 'Copy Link',
  copied: 'Copied ✓',
  replayAgain: 'Run Again',
  simNote: 'Historical simulation · for entertainment only',
  pause: 'Pause',
  play: 'Play',
  progressAria: 'Progress',
  speedGroup: 'Playback speed',
  replayBtn: 'Restart',
  kbdHint: 'Space play/pause · ← → seek ±5s · 1/2/4 speed · R restart',
  canvasAria: (name: string, year: number) =>
    `Animated daily asset curve after buying ${name} in ${year}`,

  landingTitle: (firstYear: string, name: string, symbol: string) =>
    `If you bought ${name} (${symbol}) in ${firstYear}, what would it be worth today?`,
  landingHl: (principal: string, final: string, mult: string, pctStr: string) =>
    `${principal} → ${final} (${mult} · ${pctStr})`,
  landingIntro: (
    name: string,
    en: string,
    market: string,
    firstYear: string,
    lastYear: string,
    final: string,
    cagr: number,
    principal: string
  ) =>
    `Data for ${en} (${market}) goes back to ${firstYear}. Invest ${principal} at launch and hold with dividends reinvested (total-return basis): by ${lastYear} it grows to ${final}, a ${cagr}% annualized return. Click any year to replay this compounding journey.`,
  watchAnimation: '▶ Watch Replay',
  colYear: 'Buy year',
  colResult: (ccyPrefix: string) => `${ccyPrefix}100K →`,
  colMultiple: 'Multiple',
  colCagr: 'CAGR',
  caliberNote:
    'Methodology: total-return adjusted prices (dividend reinvestment approximated); taxes excluded; crypto and commodities priced in USD. Historical data from public markets may contain errors. Past performance does not predict the future. Not investment advice.',
  anotherIf: 'Try another "what if"',
  dcaCompare: 'DCA vs Lump Sum',
  dcaCompareIntro: 'Different total investments: DCA keeps adding monthly, lump sum pays once — each return is on its own invested total',
  dcaColMode: 'Mode',
  dcaColInvested: 'Invested',
  dcaColFinal: 'Final value',
  dcaColReturn: 'Return',
  dcaModeLump: 'Lump sum',
  dcaModeDca: 'Monthly DCA',
  dcaTryIt: '▶ Watch DCA Replay',
  dcaCompareSideBySide: '▶ Side-by-side Replay',

  footerNote: '© 2026 whatif.axtrivc.com · Sister site',
  dataAsOf: (d: string) => `Data as of ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
};

export function dict(locale: Locale): Dict {
  return locale === 'en' ? en : zh;
}

/** 英文一句话简介(与 lib/stocks.ts STOCKS.tagline 中文对应) */
export const TAGLINE_EN: Record<string, string> = {
  msft: 'The classic case from those viral videos',
  aapl: "From a garage to the world's most valuable company",
  nvda: 'The biggest winner of the AI wave',
  googl: 'Two decades of the search empire',
  amzn: 'From online bookstore to everything store',
  tsla: 'An EV roller coaster',
  meta: 'The rise and fall of the social empire',
  brkb: "Buffett's compounding machine",
  ko: "Buffett's favorite",
  dis: "Mickey Mouse's century-old fairy tale",
  tsm: 'The foundry the whole world depends on',
  nflx: 'The company that killed the video-rental store',
  amd: 'Nearly bankrupt — then came the comeback',
  cost: 'A moat built out of membership fees',
  orcl: "The database veteran's AI second act",
  mcd: 'Compound interest, one burger at a time',
  intc: 'The giant that missed its era (a cautionary tale)',
  pypl: 'The former king of payments (a cautionary tale)',
  ba: 'A rough decade for an aviation icon',
  qqq: 'A basket of tech giants (ETF)',
  tencent: 'The social-and-games money machine',
  moutai: 'The hardest liquor on A-shares',
  spx: 'The lazy benchmark: just buy the index',
  gold: 'The hard asset across cycles (ETF)',
  btc: '$10.9 in 2011 — what about today?',
};

export const MARKET_LABEL_I18N: Record<Locale, Record<Market, string>> = {
  zh: {
    nasdaq: '纳斯达克',
    nyse: '纽交所',
    index: '指数',
    gold: '商品',
    crypto: '加密货币',
    hk: '港交所',
    ashare: 'A 股',
  },
  en: {
    nasdaq: 'Nasdaq',
    nyse: 'NYSE',
    index: 'Index',
    gold: 'Commodity',
    crypto: 'Crypto',
    hk: 'HKEX',
    ashare: 'A-shares',
  },
};
