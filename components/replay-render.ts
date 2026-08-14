/**
 * 回放渲染器 — 纯函数 drawFrame
 *
 * 一切(HUD/图表/水印)都画进 canvas:
 * 1. 实时预览与未来 v1.5 的逐帧视频导出共用同一渲染路径, 像素级一致
 * 2. 无 DOM 依赖, 可在 Worker/OffscreenCanvas 中运行
 */
import { indexAtT, type ReplayInput } from '@/lib/engine';
import { dateISO, money, pct, profitExact } from '@/lib/format';

export interface RenderLabels {
  ifBought: string; // 假如
  bought: string; // 买入
  mode: string; // 一直持有 · 红利复投
  peak: string; // 峰值
  principal: string; // 本金
  disclaimer: string; // 模拟估算 仅供参考
}

export const LABELS: Record<'zh' | 'en', RenderLabels> = {
  zh: {
    ifBought: '假如',
    bought: '买入',
    mode: '一直持有 · 红利复投',
    peak: '峰值',
    principal: '本金',
    disclaimer: '历史模拟 · 仅供参考 · 不构成投资建议',
  },
  en: {
    ifBought: 'What if you bought',
    bought: 'in',
    mode: 'Buy & Hold · Dividends Reinvested',
    peak: 'Peak',
    principal: 'Invested',
    disclaimer: 'Simulation for reference only. Not investment advice.',
  },
};

export interface AssetMeta {
  zh: string;
  en: string;
  symbol: string;
}

export interface FrameOpts {
  w: number; // CSS 像素
  h: number;
  dpr: number;
  t: number; // 0..1
  input: ReplayInput;
  asset: AssetMeta;
  locale: 'zh' | 'en';
  site?: string;
}

const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const UP = '#ff4d4f';
const DOWN = '#20c997';
const INK = '#f5f5f7';
const DIM = 'rgba(245,245,247,0.45)';
const LINE = '#ff3b30';

export function renderFrame(ctx: CanvasRenderingContext2D, o: FrameOpts): void {
  const { w, h, dpr, t, input, asset, locale } = o;
  const L = LABELS[locale];
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // 背景: 近黑 + 轻微暗角
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a0a12');
  bg.addColorStop(1, '#060609');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.2, w / 2, h * 0.5, h * 0.75);
  vig.addColorStop(0, 'rgba(255,59,48,0.05)');
  vig.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const LS = w > h; // 横屏舞台: HUD 紧凑两行, 图表占主体
  const pad = LS ? Math.round(h * 0.055) : Math.round(w * 0.065);
  const name = locale === 'zh' ? asset.zh : asset.en;
  const year = input.dates[input.start].slice(0, 4);

  const idx = indexAtT(input, t);
  const base = input.closes[input.start];
  const value = (input.amount * input.closes[idx]) / base;
  const gain = value - input.amount;
  const up = gain >= 0;

  ctx.textBaseline = 'top';

  if (LS) {
    // ---- 横屏 HUD: 第一行 标题+日期, 第二行 巨额+涨幅+收益 ----
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(h * 0.055)}px ${SANS}`;
    ctx.fillStyle = DIM;
    ctx.fillText(
      locale === 'zh' ? `${L.ifBought} ${year} 年买入 ${name} ${asset.symbol}` : `${L.ifBought} ${name} ${L.bought} ${year} · ${asset.symbol}`,
      pad,
      pad
    );
    ctx.textAlign = 'right';
    ctx.font = `500 ${Math.round(h * 0.06)}px ${MONO}`;
    ctx.fillStyle = 'rgba(245,245,247,0.75)';
    ctx.fillText(dateISO(input.dates[idx]), w - pad, pad);

    ctx.textAlign = 'left';
    const vy = pad + h * 0.085;
    ctx.font = `800 ${Math.round(Math.min(h * 0.155, w * 0.05))}px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.shadowColor = 'rgba(255,59,48,0.35)';
    ctx.shadowBlur = up ? 16 : 0;
    ctx.fillText(money(value, locale), pad, vy);
    ctx.shadowBlur = 0;
    const vw = ctx.measureText(money(value, locale)).width;
    ctx.font = `700 ${Math.round(h * 0.07)}px ${MONO}`;
    ctx.fillStyle = up ? UP : DOWN;
    ctx.fillText(pct(gain / input.amount), pad + vw + h * 0.06, vy + h * 0.045);
    const pw = ctx.measureText(pct(gain / input.amount)).width;
    ctx.font = `500 ${Math.round(h * 0.05)}px ${MONO}`;
    ctx.fillStyle = up ? 'rgba(255,77,79,0.75)' : 'rgba(32,201,151,0.75)';
    ctx.fillText(profitExact(gain), pad + vw + h * 0.06 + pw + h * 0.045, vy + h * 0.06);
  } else {
    // ---- 竖屏 HUD: 自上而下堆叠 ----
    let y = pad + 6;
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(w * 0.042)}px ${SANS}`;
    ctx.fillStyle = DIM;
    if (locale === 'zh') {
      ctx.fillText(`${L.ifBought} ${year} 年买入`, pad, y);
    } else {
      ctx.fillText(`${L.ifBought} ${name} ${L.bought} ${year}`, pad, y);
    }
    y += w * 0.062;

    ctx.font = `800 ${Math.round(w * 0.072)}px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(`${name} ${asset.symbol}`, pad, y);
    y += w * 0.105;

    // 当前日期(跳动)
    ctx.font = `500 ${Math.round(w * 0.05)}px ${MONO}`;
    ctx.fillStyle = 'rgba(245,245,247,0.75)';
    ctx.fillText(dateISO(input.dates[idx]), pad, y);
    y += w * 0.085;

    // 当前市值(巨大)
    ctx.font = `800 ${Math.round(w * 0.115)}px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.shadowColor = 'rgba(255,59,48,0.35)';
    ctx.shadowBlur = up ? 18 : 0;
    ctx.fillText(money(value, locale), pad, y);
    ctx.shadowBlur = 0;
    y += w * 0.15;

    // 涨幅 + 精确收益
    ctx.font = `700 ${Math.round(w * 0.06)}px ${MONO}`;
    ctx.fillStyle = up ? UP : DOWN;
    ctx.fillText(pct(gain / input.amount), pad, y);
    const pw = ctx.measureText(pct(gain / input.amount)).width;
    ctx.font = `500 ${Math.round(w * 0.045)}px ${MONO}`;
    ctx.fillStyle = up ? 'rgba(255,77,79,0.75)' : 'rgba(32,201,151,0.75)';
    ctx.fillText(profitExact(gain), pad + pw + w * 0.035, y + w * 0.012);
  }

  // ---------- 图表区(滑动窗口看细节, 结尾拉远看全局) ----------
  const chartTop = LS ? Math.round(h * 0.3) : Math.round(h * 0.42);
  const chartBottom = LS ? Math.round(h * 0.88) : Math.round(h * 0.9);
  const chartW = w - pad * 2;
  const chartH = chartBottom - chartTop;

  const n = input.end - input.start;
  // 窗口跨度(交易日): 覆盖约1-2.5年, 让月度涨跌清晰可见
  const W = Math.round(Math.min(Math.max(n * 0.15, 240), 620));
  const ZOOM_OUT_T = 0.82; // 最后 18% 时间用于拉远到全局总览
  const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  // 可见窗口: 播放期 [idx-W, idx] 前移; 收尾期平滑扩张到 [start, end]
  let wEnd = Math.max(idx, Math.min(input.start + W, input.end));
  let wStart = Math.max(input.start, wEnd - W);
  if (t > ZOOM_OUT_T) {
    const s = easeInOut((t - ZOOM_OUT_T) / (1 - ZOOM_OUT_T));
    wEnd = Math.round(wEnd + (input.end - wEnd) * s);
    wStart = Math.round(wStart + (input.start - wStart) * s);
  }
  if (wEnd - wStart < 2) wEnd = Math.min(input.end, wStart + 2);

  // y 域: 窗口内已走过部分的价格范围
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = wStart; i <= Math.min(idx, wEnd); i++) {
    const v = (input.amount * input.closes[i]) / base;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  vMin = Math.min(vMin, input.amount);
  vMax = Math.max(vMax, input.amount);
  const span = Math.max(vMax - vMin, vMax * 0.04);
  const yTop = vMin - span * 0.06;
  const yMax = vMax + span * 0.1;
  const xOf = (i: number) => pad + ((i - wStart) / (wEnd - wStart)) * chartW;
  const yOf = (v: number) => chartBottom - ((v - yTop) / (yMax - yTop)) * chartH;

  // 水平网格 + 刻度值
  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(w * 0.032)}px ${MONO}`;
  for (let g = 1; g <= 3; g++) {
    const gv = yTop + ((yMax - yTop) * g) / 4;
    const gy = yOf(gv);
    ctx.strokeStyle = 'rgba(245,245,247,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, gy);
    ctx.lineTo(w - pad, gy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,245,247,0.28)';
    ctx.fillText(money(gv, locale), w - pad - 4, gy - w * 0.045);
  }

  // 本金基准虚线(在可视范围内才画)
  const py = yOf(input.amount);
  if (py > chartTop + 8 && py < chartBottom - 8) {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(245,245,247,0.28)';
    ctx.beginPath();
    ctx.moveTo(pad, py);
    ctx.lineTo(w - pad, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(245,245,247,0.4)';
    ctx.font = `500 ${Math.round(w * 0.03)}px ${SANS}`;
    ctx.fillText(`${L.principal} ${money(input.amount, locale)}`, pad + 2, py - w * 0.048);
  }

  // 可见折线 + 面积(从 wStart 到当前; 超长时抽稀采样, 像素级无差)
  const upNow = input.closes[idx] >= base;
  const lineColor = upNow ? LINE : DOWN;
  const segLen = idx - wStart;
  const step = Math.max(1, Math.floor(segLen / 1500));
  const drawLinePath = () => {
    ctx.beginPath();
    ctx.moveTo(xOf(wStart), yOf((input.amount * input.closes[wStart]) / base));
    for (let i = wStart + 1; i < idx; i += step) {
      ctx.lineTo(xOf(i), yOf((input.amount * input.closes[i]) / base));
    }
    ctx.lineTo(xOf(idx), yOf(value));
  };
  const area = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
  area.addColorStop(0, upNow ? 'rgba(255,59,48,0.30)' : 'rgba(32,201,151,0.26)');
  area.addColorStop(1, 'rgba(0,0,0,0)');
  drawLinePath();
  ctx.save();
  ctx.lineTo(xOf(idx), chartBottom);
  ctx.lineTo(xOf(wStart), chartBottom);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.restore();
  drawLinePath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = upNow ? 'rgba(255,59,48,0.55)' : 'rgba(32,201,151,0.45)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 线端点(当前) + 当前值小标签
  const cx = xOf(idx);
  const cy = yOf(value);
  ctx.fillStyle = lineColor;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 窗口内峰值标记
  let pkVal = -Infinity;
  let pkIdx = wStart;
  for (let i = wStart; i <= idx; i++) {
    if (input.closes[i] > pkVal) {
      pkVal = input.closes[i];
      pkIdx = i;
    }
  }
  if (pkIdx > wStart + 2 && pkIdx < idx - 2) {
    const px = xOf(pkIdx);
    const pyy = yOf((input.amount * pkVal) / base);
    ctx.fillStyle = 'rgba(245,245,247,0.75)';
    ctx.font = `500 ${Math.round(w * 0.03)}px ${SANS}`;
    ctx.textAlign = px > w * 0.6 ? 'right' : 'left';
    ctx.fillText(
      `${L.peak} ${money((input.amount * pkVal) / base, locale)}`,
      px > w * 0.6 ? px - w * 0.02 : px + w * 0.02,
      pyy - w * 0.045
    );
    ctx.fillStyle = 'rgba(245,245,247,0.5)';
    ctx.beginPath();
    ctx.arc(px, pyy, w * 0.007, 0, Math.PI * 2);
    ctx.fill();
  }

  // 底部日期(窗口两端)
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(245,245,247,0.3)';
  ctx.font = `400 ${Math.round(w * 0.03)}px ${MONO}`;
  ctx.fillText(dateISO(input.dates[wStart]), pad, chartBottom + w * 0.02);
  ctx.textAlign = 'right';
  ctx.fillText(dateISO(input.dates[Math.min(wEnd, input.end)]), w - pad, chartBottom + w * 0.02);

  // ---------- 底部: 模式 + 水印 + 进度 ----------
  const footY = h - pad - 4;
  ctx.textAlign = 'left';
  const fMode = LS ? h * 0.042 : w * 0.032;
  const fTiny = LS ? h * 0.032 : w * 0.026;
  ctx.font = `600 ${Math.round(fMode)}px ${SANS}`;
  ctx.fillStyle = 'rgba(245,245,247,0.55)';
  ctx.fillText(L.mode, pad, footY - fMode - fTiny * 0.7);
  ctx.font = `400 ${Math.round(fTiny)}px ${SANS}`;
  ctx.fillStyle = 'rgba(245,245,247,0.3)';
  ctx.fillText(L.disclaimer, pad, footY - fTiny * 0.4);
  if (o.site) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(245,245,247,0.4)';
    ctx.font = `600 ${Math.round(fMode)}px ${MONO}`;
    ctx.fillText(o.site, w - pad, footY - fTiny * 0.4);
  }
  // 细进度条
  ctx.fillStyle = 'rgba(245,245,247,0.12)';
  ctx.fillRect(pad, footY, w - pad * 2, 2);
  ctx.fillStyle = LINE;
  ctx.fillRect(pad, footY, (w - pad * 2) * t, 2);

  ctx.restore();
}
