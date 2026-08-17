/**
 * 回放图表渲染器 — 纯函数 drawFrame(电影感滑动镜头版)
 *
 * canvas 只负责图表本体:
 *   左侧 Y 轴自适应刻度(弹性平滑) / 底部 X 轴滚动刻度 / 本金虚线 /
 *   滑动窗口折线(固定 6-12 个月跨度, 旧数据向左滚出) /
 *   前沿呼吸光标(Pulsing Dot) + 跟随资产气泡 + 垂直参考虚线 /
 *   盈亏状态色(红↔青绿)无缝渐变 / 右下水印(安全区间距)
 *
 * 标题/战报/终局卡等 chrome 全部由 DOM 承担(见 ReplayExperience)。
 *
 * 跨帧平滑状态(lo/hi/f)由调用方持有并经 smooth 传入 —— 渲染本身仍无副作用。
 */
import { indexAtT, type ReplayInput } from '@/lib/engine';
import { dateYM, moneyZh } from '@/lib/format';

export interface SmoothState {
  lo?: number; // 平滑后的 y 域下限(资产值)
  hi?: number; // 平滑后的 y 域上限
  f?: number; // 盈亏状态色因子 0=青绿 1=红
  ts?: number; // 上一帧时间戳(帧率无关阻尼用)
  flashTs?: number; // 最近一次里程碑闪光时刻(回本/首破整数倍)
}

export interface ChartOpts {
  w: number;
  h: number;
  dpr: number;
  t: number; // 0..1 播放进度
  ts: number; // performance.now(), 驱动呼吸脉冲
  input: ReplayInput;
  smooth: SmoothState;
  watermark?: string;
}

const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const RED: [number, number, number] = [255, 77, 79]; // #FF4D4F 盈
const CYAN: [number, number, number] = [0, 245, 212]; // #00F5D4 亏

/** 窗口跨度(交易日): ~2 年, 对齐参考视频的窗口宽度 */
const SPAN_DAYS = 500;

function mixColor(f: number, alpha = 1): string {
  const r = Math.round(CYAN[0] + (RED[0] - CYAN[0]) * f);
  const g = Math.round(CYAN[1] + (RED[1] - CYAN[1]) * f);
  const b = Math.round(CYAN[2] + (RED[2] - CYAN[2]) * f);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderFrame(ctx: CanvasRenderingContext2D, o: ChartOpts): void {
  const { w, h, dpr, t, ts, input, smooth } = o;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const idx = indexAtT(input, t);
  const base = input.closes[input.start];
  const amount = input.amount;
  const val = (i: number) => (amount * input.closes[i]) / base;
  const value = val(idx);

  // ── 滑动镜头窗口: 头部钉在右缘, 旧数据向左滚出 ──
  const n = input.end - input.start;
  const span = Math.min(SPAN_DAYS, n + 1);
  const wEnd = Math.max(idx + 1, Math.min(input.start + span, input.end + 1));
  const wStart = Math.max(input.start, wEnd - span);

  // ── y 域目标(窗口内已走过部分) + 里程碑点扫描(全程历史, 含回本/首破整数倍) ──
  let vLo = Infinity;
  let vHi = -Infinity;
  const dots: number[] = [];
  let runMax = 1; // 起始即 1x 本金
  let under = false; // 曾跌破本金
  for (let i = input.start; i <= idx; i++) {
    const v = val(i);
    if (i >= wStart) {
      if (v < vLo) vLo = v;
      if (v > vHi) vHi = v;
    }
    const m = input.closes[i] / base;
    if (m < 1) {
      under = true;
    } else if (under) {
      under = false;
      if (i >= wStart) dots.push(i); // 回本点
    }
    if (m > runMax) {
      if (m >= 2 && Math.floor(m) > Math.floor(runMax) && i >= wStart) dots.push(i); // 首破整数倍
      runMax = m;
    }
  }
  const padY = Math.max((vHi - vLo) * 0.12, vHi * 0.05);
  const tLo = vLo - padY;
  const tHi = vHi + padY;
  // 帧率无关阻尼(以 60fps 系数为基准) + 快攻慢放(域扩张快跟防裁剪, 收缩慢降防抖)
  const dtMs = smooth.ts == null ? 16.7 : Math.min(Math.max(ts - smooth.ts, 1), 100);
  smooth.ts = ts;
  const damp = (b: number) => 1 - Math.pow(1 - b, dtMs / 16.667);
  if (smooth.lo == null || smooth.hi == null) {
    smooth.lo = tLo;
    smooth.hi = tHi;
  } else {
    smooth.lo += (tLo - smooth.lo) * damp(tLo < smooth.lo ? 0.35 : 0.06);
    smooth.hi += (tHi - smooth.hi) * damp(tHi > smooth.hi ? 0.35 : 0.06);
  }
  const lo = smooth.lo;
  const hi = Math.max(smooth.hi, smooth.lo + 1e-9);

  // ── 盈亏状态色: 红↔青绿 无缝过渡 ──
  const targetF = value >= amount ? 1 : 0;
  smooth.f = smooth.f == null ? targetF : smooth.f + (targetF - smooth.f) * damp(0.07);
  const f = smooth.f;
  const lineColor = mixColor(f);
  const glowColor = mixColor(f, 0.55);

  // ── 布局: 左刻度槽 + 绘图区 + 底部刻度带 ──
  const gutter = Math.round(Math.min(Math.max(w * 0.075, 46), 64));
  const plotL = gutter;
  const plotR = w - 10;
  const plotT = 12;
  const plotB = h - 30;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;
  const xOf = (i: number) => plotL + ((i - wStart) / (span - 1)) * plotW;
  const yOf = (v: number) => plotB - ((v - lo) / (hi - lo)) * plotH;

  // ── Y 轴刻度(左侧, 左对齐, 6 档) + 横向网格 ──
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `500 11px ${MONO}`;
  for (let g = 0; g <= 5; g++) {
    const gv = lo + ((hi - lo) * g) / 5;
    const gy = yOf(gv);
    ctx.strokeStyle = 'rgba(245,245,247,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotL, gy);
    ctx.lineTo(plotR, gy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,245,247,0.35)';
    ctx.fillText(moneyZh(gv), 8, gy);
  }

  // ── X 轴滚动刻度(6 档, 跟随窗口平移) ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 11px ${MONO}`;
  for (let g = 0; g <= 5; g++) {
    const i = wStart + Math.round(((span - 1) * g) / 5);
    const label = dateYM(input.dates[Math.min(i, input.end)]);
    ctx.fillStyle = 'rgba(245,245,247,0.3)';
    ctx.fillText(label, xOf(i), h - 10);
  }

  // ── 本金虚线(在可视域内才画) ──
  const py = yOf(amount);
  if (py > plotT + 6 && py < plotB - 6) {
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(245,245,247,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotL, py);
    ctx.lineTo(plotR, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.font = `500 10px ${SANS}`;
    ctx.fillStyle = 'rgba(245,245,247,0.35)';
    ctx.fillText('本金', plotR - 2, py - 7);
  }

  // ── 折线 + 渐变面积(裁剪进绘图区) ──
  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(xOf(wStart), yOf(val(wStart)));
    for (let i = wStart + 1; i <= idx; i++) ctx.lineTo(xOf(i), yOf(val(i)));
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotL, plotT - 4, plotW, plotH + 8);
  ctx.clip();
  const area = ctx.createLinearGradient(0, plotT, 0, plotB);
  area.addColorStop(0, mixColor(f, 0.26));
  area.addColorStop(1, 'rgba(0,0,0,0)');
  drawPath();
  ctx.lineTo(xOf(idx), plotB);
  ctx.lineTo(xOf(wStart), plotB);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  drawPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── 里程碑小圆点(回本/首破整数倍, 永久留在折线上随窗口滚走) ──
  for (const di of dots) {
    const dx = xOf(di);
    const dy = yOf(val(di));
    if (dy < plotT + 2 || dy > plotB - 2) continue;
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,245,247,0.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = mixColor(f, 0.7);
    ctx.stroke();
  }

  // 前沿坐标
  const cx = xOf(idx);
  const cy = yOf(value);

  // ── 垂直参考虚线(贯穿到底) ──
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = mixColor(f, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, plotB);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 呼吸光标: 实心点 + 白描边 + 扩散脉冲环 ──
  const pulse = (ts / 1100) % 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + 9 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = mixColor(f, 0.55 * (1 - pulse));
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── 里程碑闪光(突破瞬间的一次性扩散亮环, ~0.5s) ──
  if (smooth.flashTs != null) {
    const ft = (ts - smooth.flashTs) / 480;
    if (ft >= 0 && ft < 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, 7 + 26 * ft, 0, Math.PI * 2);
      ctx.strokeStyle = mixColor(f, 0.85 * (1 - ft));
      ctx.lineWidth = 2.5 - 1.5 * ft;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── 跟随资产气泡 [ 108万 ● ] ──
  const label = moneyZh(value);
  ctx.font = `700 13px ${MONO}`;
  const tw = ctx.measureText(label).width;
  const bw = tw + 34;
  const bh = 26;
  let bx = Math.min(Math.max(cx + 12, plotL), plotR - bw);
  const by = Math.max(cy - 40, plotT + 2);
  ctx.beginPath();
  const rr = (x: number, y: number, w2: number, h2: number, r: number) => {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w2, y, x + w2, y + h2, r);
    ctx.arcTo(x + w2, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r);
    ctx.arcTo(x, y, x + w2, y, r);
    ctx.closePath();
  };
  rr(bx, by, bw, bh, 8);
  ctx.fillStyle = 'rgba(8,10,16,0.78)';
  ctx.fill();
  ctx.strokeStyle = mixColor(f, 0.85);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(245,245,247,0.95)';
  ctx.fillText(label, bx + 10, by + bh / 2 + 0.5);
  ctx.beginPath();
  ctx.arc(bx + bw - 13, by + bh / 2, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();

  // ── 右下水印(安全区: 距底部刻度带 ≥20px) ──
  if (o.watermark) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(245,245,247,0.25)';
    ctx.fillText(o.watermark, w - 12, h - 46);
  }

  ctx.restore();
}
