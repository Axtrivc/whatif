/**
 * 分享海报 — 1080×1350 PNG (微信/小红书 竖版)
 * 纯 canvas 渲染, 输出 Blob; 货币表达与回放页统一(纯中文 万/亿)
 */
import { computeStats, type ReplayInput, type ReplayStats } from '@/lib/engine';
import { dateISO, moneyZh, multiple, pct, profitZh, usdPrice } from '@/lib/format';
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
}

export async function buildShareImage(opts: ShareOpts): Promise<Blob> {
  const { stock, input } = opts;
  const stats = opts.stats ?? computeStats(input);
  const year = input.dates[input.start].slice(0, 4);
  const up = stats.returnPct >= 0;
  const accent = up ? '#FF4D4F' : '#00F5D4';

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
  glow.addColorStop(0, up ? 'rgba(255,59,48,0.16)' : 'rgba(0,245,212,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const P = 84;

  // 标题(与回放页一致)
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = 'rgba(245,245,247,0.5)';
  ctx.fillText(`假如你在 ${year}年 买入`, P, P);

  ctx.font = `800 76px ${SANS}`;
  ctx.fillStyle = '#f5f5f7';
  ctx.fillText(`${moneyZh(input.amount)} ${stock.zh}`, P, P + 52);

  ctx.font = `500 36px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.6)';
  ctx.fillText(
    `${dateISO(stats.startDate)} 起一直持有 · 红利复投`,
    P,
    P + 170
  );

  // 巨幅结果
  ctx.font = `800 150px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = up ? 'rgba(255,77,79,0.45)' : 'rgba(0,245,212,0.4)';
  ctx.shadowBlur = 46;
  ctx.fillText(moneyZh(stats.finalValue), P, H * 0.33);
  ctx.shadowBlur = 0;

  // 指标行
  ctx.font = `700 48px ${MONO}`;
  ctx.fillStyle = accent;
  ctx.fillText(pct(stats.returnPct), P, H * 0.33 + 195);
  const pw = ctx.measureText(pct(stats.returnPct)).width;
  ctx.font = `600 38px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.85)';
  ctx.fillText(
    `${multiple(stats.multiple)} · 年化 ${(stats.cagr * 100).toFixed(1)}%`,
    P + pw + 36,
    H * 0.33 + 203
  );

  // 迷你走势线(全程)
  const cTop = H * 0.62;
  const cBottom = H * 0.88;
  const cW = W - P * 2;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = input.start; i <= input.end; i++) {
    const v = input.closes[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const step = Math.max(1, Math.floor((input.end - input.start) / 1200));
  const xOf = (i: number) => P + ((i - input.start) / (input.end - input.start)) * cW;
  const yOf = (v: number) => cBottom - ((v - mn) / (mx - mn)) * (cBottom - cTop);
  ctx.beginPath();
  for (let i = input.start; i <= input.end; i += step) {
    const x = xOf(i);
    const y = yOf(input.closes[i]);
    i === input.start ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(xOf(input.end), yOf(input.closes[input.end]));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.shadowColor = up ? 'rgba(255,59,48,0.5)' : 'rgba(0,245,212,0.4)';
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 端点日期 + 价格(不复权真实价)
  ctx.font = `400 28px ${MONO}`;
  ctx.fillStyle = 'rgba(245,245,247,0.35)';
  ctx.textAlign = 'left';
  ctx.fillText(dateISO(stats.startDate), P, cBottom + 22);
  ctx.textAlign = 'right';
  ctx.fillText(dateISO(stats.endDate), W - P, cBottom + 22);
  if (opts.rawCloses) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,245,247,0.3)';
    ctx.fillText(
      `买入 ${usdPrice(opts.rawCloses[input.start])} → 现价 ${usdPrice(opts.rawCloses[input.end])}`,
      W / 2,
      cBottom + 66
    );
  }

  // 底部品牌: 左名称+免责, 右域名
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
