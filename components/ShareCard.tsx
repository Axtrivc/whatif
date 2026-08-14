/**
 * 分享卡片 — 1080×1350 PNG (Instagram/微信/小红书 竖版比例)
 * 纯 canvas 渲染, 输出 Blob
 */
import { computeStats, type ReplayInput, type ReplayStats } from '@/lib/engine';
import { dateISO, money, multiple, pct } from '@/lib/format';
import type { StockMeta } from '@/lib/stocks';

const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const W = 1080;
const H = 1350;

export async function buildShareImage(opts: {
  stock: StockMeta;
  input: ReplayInput;
  stats?: ReplayStats;
  locale?: 'zh' | 'en';
}): Promise<Blob> {
  const { stock, input, locale = 'zh' } = opts;
  const stats = opts.stats ?? computeStats(input);
  const year = input.dates[input.start].slice(0, 4);
  const endYear = stats.endDate.slice(0, 4);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#101018');
  bg.addColorStop(1, '#07070b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 100, W / 2, H * 0.35, 700);
  glow.addColorStop(0, 'rgba(255,59,48,0.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const P = 84;
  const up = stats.returnPct >= 0;
  const accent = up ? '#ff3b30' : '#20c997';

  // 顶部
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = 'rgba(245,245,247,0.5)';
  ctx.fillText(`假如 ${year} 年买入`, P, P);

  ctx.font = `800 76px ${SANS}`;
  ctx.fillStyle = '#f5f5f7';
  ctx.fillText(`${stock.zh} ${stock.symbol}`, P, P + 52);

  // 本金
  ctx.font = `500 40px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.65)';
  ctx.fillText(`${money(input.amount, locale)} · ${dateISO(stats.startDate)}`, P, P + 170);

  // 巨大终值
  ctx.font = `800 148px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = up ? 'rgba(255,59,48,0.4)' : 'rgba(32,201,151,0.4)';
  ctx.shadowBlur = 42;
  ctx.fillText(money(stats.finalValue, locale), P, H * 0.36);
  ctx.shadowBlur = 0;

  // 指标行
  ctx.font = `700 46px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.fillText(pct(stats.returnPct), P, H * 0.36 + 190);
  const pw = ctx.measureText(pct(stats.returnPct)).width;

  ctx.font = `600 40px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.85)';
  ctx.fillText(`${multiple(stats.multiple)} · 年化 ${(stats.cagr * 100).toFixed(1)}%`, P + pw + 36, H * 0.36 + 198);

  // 迷你走势线(全程)
  const cTop = H * 0.66;
  const cBottom = H * 0.9;
  const cW = W - P * 2;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = input.start; i <= input.end; i++) {
    const v = input.closes[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const xOf = (i: number) => P + ((i - input.start) / (input.end - input.start)) * cW;
  const yOf = (v: number) => cBottom - ((v - mn) / (mx - mn)) * (cBottom - cTop);

  ctx.beginPath();
  for (let i = input.start; i <= input.end; i++) {
    const x = xOf(i);
    const y = yOf(input.closes[i]);
    i === input.start ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.shadowColor = up ? 'rgba(255,59,48,0.5)' : 'rgba(32,201,151,0.4)';
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 端点日期
  ctx.font = `400 28px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.35)';
  ctx.fillText(dateISO(stats.startDate), P, cBottom + 22);
  ctx.textAlign = 'right';
  ctx.fillText(`${dateISO(stats.endDate)} (${endYear})`, W - P, cBottom + 22);
  ctx.textAlign = 'left';

  // 底部品牌: 左品牌名, 右域名
  ctx.textAlign = 'left';
  ctx.font = `800 42px ${SANS}`;
  ctx.fillStyle = '#f5f5f7';
  ctx.fillText('假如当时买了', P, H - 108);
  ctx.font = `400 24px ${SANS}`;
  ctx.fillStyle = 'rgba(245,245,247,0.3)';
  ctx.fillText('历史模拟 · 仅供参考 · 不构成投资建议', P, H - 54);
  ctx.textAlign = 'right';
  ctx.font = `600 34px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.55)';
  ctx.fillText('whatif.axtrivc.com', W - P, H - 108);

  return new Promise((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png', 0.95);
  });
}
