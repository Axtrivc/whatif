/**
 * 分享海报 — 1080×1350 PNG (微信/小红书 竖版)
 * 纯 canvas 渲染, 输出 Blob; 货币与文案表达随语言切换(中文 万/亿 ↔ 英文 $K/M/B)
 */
import { computeStats, dcaSeries, type ReplayInput, type ReplayStats } from '@/lib/engine';
import { dateISO, moneyEn, moneyZh, multiple, pct, usdPrice } from '@/lib/format';
import type { Locale } from '@/lib/i18n';
import type { StockMeta } from '@/lib/stocks';

const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const W = 1080;
const H = 1350;

interface ShareOpts {
  stock: StockMeta;
  input: ReplayInput;
  stats?: ReplayStats;
  rawCloses?: (number | null)[];
  locale?: Locale;
}

const COPY = {
  zh: {
    boughtIn: (y: string) => `假如你在 ${y}年 买入`,
    holding: '起一直持有 · 红利复投',
    dcaHolding: (m: string) => `起买入并每月再投 ${m} · 红利复投`,
    invested: '总投入',
    brand: '假如当时买了',
    disclaimer: '历史模拟 · 仅供参考 · 不构成投资建议',
    bought: '买入',
    now: '现价',
  },
  en: {
    boughtIn: (y: string) => 'If you had bought in',
    holding: ' · buy & hold · div. reinvested',
    dcaHolding: (m: string) => ` · plus ${m}/mo · div. reinvested`,
    invested: 'Total invested',
    brand: 'What If You Had Bought',
    disclaimer: 'Historical simulation · Not investment advice',
    bought: 'Bought',
    now: 'Last',
  },
} as const;

/** 单行文本自适应缩字号: 超出安全宽度时按比例缩小(下限 60%), 防长文案溢出海报 */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxW: number): number {
  let s = size;
  for (; s >= size * 0.6; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

export async function buildShareImage(opts: ShareOpts): Promise<Blob> {
  const { stock, input } = opts;
  const locale: Locale = opts.locale ?? 'zh';
  const c = COPY[locale];
  const money = locale === 'en' ? moneyEn : moneyZh;
  const stockName = locale === 'zh' ? stock.zh : stock.en;
  const stats = opts.stats ?? computeStats(input);
  const year = input.dates[input.start].slice(0, 4);
  const up = stats.returnPct >= 0;
  const accent = up ? '#D42B3A' : '#0E9F76';

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#f4f4f6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 100, W / 2, H * 0.35, 700);
  glow.addColorStop(0, up ? 'rgba(212,43,58,0.10)' : 'rgba(14,159,118,0.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const P = 84;

  // 标题(与回放页一致)
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = 'rgba(17,17,20,0.5)';
  ctx.fillText(c.boughtIn(year), P, P);

  ctx.font = `800 76px ${SANS}`;
  ctx.fillStyle = '#111114';
  // 标的+金额行也可能很长(Berkshire Hathaway), 同样自适应
  const titleText = `${money(input.amount)} ${stockName}`;
  fitFont(ctx, titleText, 800, 76, SANS, W - P * 2);
  ctx.fillText(titleText, P, P + 52);

  const holdText = input.monthly
    ? `${dateISO(stats.startDate)} ${c.dcaHolding(money(input.monthly))}`
    : `${dateISO(stats.startDate)} ${c.holding}`;
  fitFont(ctx, holdText, 500, 36, MONO, W - P * 2);
  ctx.fillStyle = 'rgba(17,17,20,0.6)';
  ctx.fillText(holdText, P, P + 170);

  // DCA 模式: 副标题下补一行总投入
  if (stats.invested != null) {
    ctx.font = `500 30px ${MONO}`;
    ctx.fillStyle = 'rgba(17,17,20,0.45)';
    ctx.fillText(`${c.invested} ${money(stats.invested)}`, P, P + 224);
  }

  // 巨幅结果
  ctx.font = `800 150px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = up ? 'rgba(212,43,58,0.3)' : 'rgba(14,159,118,0.28)';
  ctx.shadowBlur = 28;
  ctx.fillText(money(stats.finalValue), P, H * 0.33);
  ctx.shadowBlur = 0;

  // 指标行
  ctx.font = `700 48px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.fillText(pct(stats.returnPct), P, H * 0.33 + 195);
  const pw = ctx.measureText(pct(stats.returnPct)).width;
  ctx.font = `600 38px ${MONO}`;
  ctx.fillStyle = 'rgba(17,17,20,0.85)';
  const cagrLabel = locale === 'en' ? `CAGR ${((stats.cagr * 100).toFixed(1))}%` : `年化 ${(stats.cagr * 100).toFixed(1)}%`;
  ctx.fillText(
    `${multiple(stats.multiple)} · ${cagrLabel}`,
    P + pw + 36,
    H * 0.33 + 203
  );

  // 迷你走势线(全程): 用资产序列(份额法)而非原始价 —— 一次性买入两者形状一致,
  // 定投海报则与头部最终市值同口径(曲线含每月追加的阶梯增长)
  const cTop = H * 0.62;
  const cBottom = H * 0.88;
  const cW = W - P * 2;
  const vs = dcaSeries(input);
  const nPts = vs.length - 1;
  let mn = Infinity;
  let mx = -Infinity;
  for (let j = 0; j <= nPts; j++) {
    const v = vs[j];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const step = Math.max(1, Math.floor(nPts / 1200));
  const xOf = (j: number) => P + (j / nPts) * cW;
  const yOf = (v: number) => cBottom - ((v - mn) / (mx - mn)) * (cBottom - cTop);
  ctx.beginPath();
  for (let j = 0; j <= nPts; j += step) {
    const x = xOf(j);
    const y = yOf(vs[j]);
    j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(xOf(nPts), yOf(vs[nPts]));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.shadowColor = up ? 'rgba(212,43,58,0.32)' : 'rgba(14,159,118,0.3)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 端点日期 + 价格(不复权真实价)
  ctx.font = `400 28px ${MONO}`;
  ctx.fillStyle = 'rgba(17,17,20,0.35)';
  ctx.textAlign = 'left';
  ctx.fillText(dateISO(stats.startDate), P, cBottom + 22);
  ctx.textAlign = 'right';
  ctx.fillText(dateISO(stats.endDate), W - P, cBottom + 22);
  if (opts.rawCloses) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(17,17,20,0.3)';
    ctx.fillText(
      `${c.bought} ${usdPrice(opts.rawCloses[input.start])} → ${c.now} ${usdPrice(opts.rawCloses[input.end])}`,
      W / 2,
      cBottom + 66
    );
  }

  // 底部品牌: 左名称+免责, 右域名
  ctx.textAlign = 'left';
  ctx.font = `800 42px ${SANS}`;
  ctx.fillStyle = '#111114';
  ctx.fillText(c.brand, P, H - 108);
  ctx.font = `400 24px ${SANS}`;
  ctx.fillStyle = 'rgba(17,17,20,0.3)';
  ctx.fillText(c.disclaimer, P, H - 54);
  ctx.textAlign = 'right';
  ctx.font = `600 34px ${MONO}`;
  ctx.fillStyle = 'rgba(17,17,20,0.55)';
  ctx.fillText('whatif.axtrivc.com', W - P, H - 108);

  return new Promise((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png', 0.95);
  });
}
