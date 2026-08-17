/**
 * 回放图表渲染器 — 纯函数 drawFrame(全历史累计展开版)
 *
 * canvas 只负责图表本体:
 *   左侧 Y 轴自适应刻度(弹性平滑) / 底部 X 轴时间刻度 / 本金虚线 / 历史峰值虚线 /
 *   全历史折线(从起点到当前时刻逐渐展开, 旧数据保留在左侧) /
 *   前沿呼吸光标(Pulsing Dot) + 跟随资产气泡 + 垂直参考虚线 /
 *   盈亏状态色(红↔青绿)无缝渐变 / 右下水印(安全区间距)
 *
 * 标题/战报/终局卡等 chrome 全部由 DOM 承担(见 ReplayExperience)。
 *
 * 跨帧平滑状态(lo/hi/f)由调用方持有并经 smooth 传入 —— 渲染本身仍无副作用。
 */
import { indexAtT, runningMaxInit, runningMaxStep, type ReplayInput } from '@/lib/engine';
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
  reduced?: boolean; // prefers-reduced-motion: 关闭脉冲环/里程碑闪光
}

const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const RED: [number, number, number] = [255, 77, 79]; // #FF4D4F 盈
const CYAN: [number, number, number] = [0, 245, 212]; // #00F5D4 亏

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

  // ── 小数进度: 前沿在相邻两日间逐帧插值滑动, 消除按日瞬移 ──
  const n = input.end - input.start;
  const headPos = Math.min(input.start + t * (n + 1), input.end);
  const valF = (x: number) => {
    const i = Math.max(input.start, Math.min(input.end - 1, Math.floor(x)));
    const f = Math.min(Math.max(x - i, 0), 1);
    return val(i) + (val(i + 1) - val(i)) * f;
  };
  const value = valF(headPos);

  // ── 时间轴映射: x 按真实日历时间均匀展开, 与参考视频一致 ──
  const dateTs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  const startTs = dateTs(input.dates[input.start]);
  const endTs = dateTs(input.dates[input.end]);
  const curTs =
    idx >= input.end
      ? endTs
      : (() => {
          const f = headPos - idx;
          const t0 = dateTs(input.dates[idx]);
          return t0 + (dateTs(input.dates[idx + 1]) - t0) * f;
        })();

  // ── y 域目标(已走过的全部历史) + 里程碑点扫描(全程历史, 含回本/首破整数倍) ──
  let vLo = Infinity;
  let vHi = -Infinity;
  const dots: number[] = [];
  let runMax = 1; // 起始即 1x 本金
  let under = false; // 曾跌破本金
  let peak = runningMaxInit(input); // 历史最高资产(画峰值虚线用)
  for (let i = input.start; i <= idx; i++) {
    const v = val(i);
    if (v < vLo) vLo = v;
    if (v > vHi) vHi = v;
    peak = runningMaxStep(input.closes, peak, i);
    const m = input.closes[i] / base;
    if (m < 1) {
      under = true;
    } else if (under) {
      under = false;
      dots.push(i); // 回本点
    }
    if (m > runMax) {
      if (m >= 2 && Math.floor(m) > Math.floor(runMax)) dots.push(i); // 首破整数倍
      runMax = m;
    }
  }
  // 前沿插值点也纳入 y 域, 让刻度随线头渐进扩张而非瞬跳
  if (value < vLo) vLo = value;
  if (value > vHi) vHi = value;
  const padY = Math.max((vHi - vLo) * 0.12, vHi * 0.05);
  const tLo = Math.max(0, vLo - padY);
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
  const xOfTs = (ts: number) => {
    if (curTs <= startTs) return plotL;
    return plotL + ((ts - startTs) / (curTs - startTs)) * plotW;
  };
  const xOf = (i: number) => xOfTs(dateTs(input.dates[i]));
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

  // ── X 轴时间刻度(按年月边界动态稀疏, 随时间范围自动从月缩到年) ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 11px ${MONO}`;
  const startDate = new Date(startTs);
  const startYM = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  const curDate = new Date(curTs);
  const curYM = curDate.getUTCFullYear() * 12 + curDate.getUTCMonth();
  const totalMonths = curYM - startYM + 1;
  const steps = [1, 2, 3, 6, 12, 24, 60, 120];
  const step = steps.find((s) => totalMonths / s <= 7) ?? steps[steps.length - 1];
  const firstYM = Math.ceil(startYM / step) * step;
  const placedXs: number[] = [];
  for (let ym = firstYM; ; ym += step) {
    const y = Math.floor(ym / 12);
    const m = (ym % 12) + 1;
    const ts = Date.UTC(y, m - 1, 1);
    if (ts > curTs) break;
    if (ts < startTs) continue;
    const x = xOfTs(ts);
    if (x < plotL + 20 || x > plotR - 20) continue;
    if (placedXs.length && x - placedXs[placedXs.length - 1] < 50) continue;
    const label = `${y}-${String(m).padStart(2, '0')}`;
    ctx.fillStyle = 'rgba(245,245,247,0.3)';
    ctx.fillText(label, x, h - 10);
    placedXs.push(x);
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

  // ── 历史峰值虚线(截至当前进度的最高资产, 在可视域内才画) ──
  if (peak.idx > input.start) {
    const peakY = yOf(val(peak.idx));
    if (peakY > plotT + 6 && peakY < plotB - 6) {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(245,245,247,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotL, peakY);
      ctx.lineTo(plotR, peakY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.font = `500 10px ${SANS}`;
      ctx.fillStyle = 'rgba(245,245,247,0.45)';
      ctx.fillText(`峰值 ${moneyZh(val(peak.idx))}`, plotR - 2, peakY - 7);
    }
  }

  // ── 折线 + 渐变面积(裁剪进绘图区); 从起点到前沿逐帧生长 ──
  const headX = curTs > startTs ? plotR : plotL;
  const headY = yOf(value);
  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(plotL, yOf(val(input.start)));
    for (let i = input.start + 1; i <= idx; i++) ctx.lineTo(xOf(i), yOf(val(i)));
    ctx.lineTo(headX, headY);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotL, plotT - 4, plotW, plotH + 8);
  ctx.clip();
  const area = ctx.createLinearGradient(0, plotT, 0, plotB);
  area.addColorStop(0, mixColor(f, 0.26));
  area.addColorStop(1, 'rgba(0,0,0,0)');
  drawPath();
  ctx.lineTo(headX, plotB);
  ctx.lineTo(plotL, plotB);
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

  // ── 里程碑小圆点(回本/首破整数倍, 永久留在折线上) ──
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

  // 前沿坐标(小数插值点)
  const cx = headX;
  const cy = headY;

  // ── 垂直参考虚线(贯穿到底) ──
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = mixColor(f, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, plotB);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 呼吸光标: 实心点 + 白描边 + 扩散脉冲环(reduced-motion 下跳过脉冲) ──
  if (!o.reduced) {
    const pulse = (ts / 1100) % 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + 9 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = mixColor(f, 0.55 * (1 - pulse));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── 里程碑闪光(突破瞬间的一次性扩散亮环, ~0.5s, reduced-motion 下跳过) ──
  if (!o.reduced && smooth.flashTs != null) {
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
