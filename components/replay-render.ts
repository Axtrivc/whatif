/**
 * 回放图表渲染器 — 纯函数 drawFrame(全历史累计展开版)
 *
 * canvas 只负责图表本体:
 *   左侧 Y 轴自适应刻度(弹性平滑) / 底部 X 轴时间刻度(当前日期高亮框) /
 *   全历史折线(从起点到当前时刻逐渐展开, 旧数据保留在左侧) + 渐变面积 /
 *   前沿呼吸光标(径向大光晕 + 脉冲环) + 左侧跟随资产大字(发光无框) /
 *   垂直参考虚线 / 盈亏状态色(红↔青绿)无缝渐变 / 右下水印(安全区间距)
 *
 * 标题/战报/终局卡等 chrome 全部由 DOM 承担(见 ReplayExperience)。
 *
 * 跨帧平滑状态(lo/hi/f)由调用方持有并经 smooth 传入 —— 渲染本身仍无副作用。
 */
import { dcaSeries, indexAtT, investedSeries, type ReplayInput } from '@/lib/engine';
import { dateYM, moneyEn, moneyZh } from '@/lib/format';

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
  locale?: 'zh' | 'en'; // 金额格式: 万/亿 ↔ $K/M/B
  /** 对比曲线(定投页叠加一次性买入): 与主序列同长, 绝对资产值同坐标系 */
  compareSeries?: Float64Array;
}

const MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace';
const SANS = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const RED: [number, number, number] = [210, 43, 58]; // #D42B3A 盈(白底可读暖红)
const CYAN: [number, number, number] = [14, 159, 118]; // #0E9F76 亏(白底可读青绿)

/**
 * ── 帧内热路径预计算(按 input 身份缓存一次) ──
 * 原实现每帧对全部历史点做字符串切片 + Date.UTC + y 域线性扫描,
 * 万点级序列在 60fps 下每秒产生百万次重复计算;
 * 这里把逐点时间戳/资产值与 [start..i] 前缀最值算成 TypedArray,
 * 帧内只做 O(1) 查表。所有表达式与原逐帧计算保持一致(含浮点求值顺序)。
 */
interface Prepared {
  ts: Float64Array; // [0..n] 各交易日 0:00 UTC 时间戳
  val: Float64Array; // [0..n] 各日资产值
  inv: Float64Array; // [0..n] 截至当日累计投入(盈亏色基准; 一次性买入为常量本金)
  min: Float64Array; // [0..k] 前缀最小资产值
  max: Float64Array; // [0..k] 前缀最大资产值
  cmpMin?: Float64Array; // 对比曲线前缀最小(定投对比模式)
  cmpMax?: Float64Array;
}

const prepCache = new WeakMap<ReplayInput, Prepared>();
const cmpPrefixCache = new WeakMap<Float64Array, { min: Float64Array; max: Float64Array }>();

/** 对比曲线前缀最值(按序列对象身份缓存一次; 帧内 O(1) 查表) */
function cmpPrefix(cmp: Float64Array): { min: Float64Array; max: Float64Array } {
  const cached = cmpPrefixCache.get(cmp);
  if (cached) return cached;
  const n = cmp.length;
  const min = new Float64Array(n);
  const max = new Float64Array(n);
  let mn = Infinity;
  let mx = -Infinity;
  for (let j = 0; j < n; j++) {
    if (cmp[j] < mn) mn = cmp[j];
    if (cmp[j] > mx) mx = cmp[j];
    min[j] = mn;
    max[j] = mx;
  }
  const out = { min, max };
  cmpPrefixCache.set(cmp, out);
  return out;
}

function prepare(input: ReplayInput): Prepared {
  const cached = prepCache.get(input);
  if (cached) return cached;
  const n = input.end - input.start;
  const ts = new Float64Array(n + 1);
  // 资产序列: DCA(份额法)或一次性买入(比值法)统一由引擎给出(引擎内已缓存)
  const val = dcaSeries(input);
  const inv = investedSeries(input);
  const min = new Float64Array(n + 1);
  const max = new Float64Array(n + 1);
  let mn = Infinity;
  let mx = -Infinity;
  for (let j = 0; j <= n; j++) {
    const d = input.dates[input.start + j];
    ts[j] = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
    if (val[j] < mn) mn = val[j];
    if (val[j] > mx) mx = val[j];
    min[j] = mn;
    max[j] = mx;
  }
  const p: Prepared = { ts, val, inv, min, max };
  prepCache.set(input, p);
  return p;
}

function mixColor(f: number, alpha = 1): string {
  const r = Math.round(CYAN[0] + (RED[0] - CYAN[0]) * f);
  const g = Math.round(CYAN[1] + (RED[1] - CYAN[1]) * f);
  const b = Math.round(CYAN[2] + (RED[2] - CYAN[2]) * f);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderFrame(ctx: CanvasRenderingContext2D, o: ChartOpts): void {
  const { w, h, dpr, t, ts, input, smooth } = o;
  const money = o.locale === 'en' ? moneyEn : moneyZh;
  const locale = o.locale ?? 'zh';
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const p = prepare(input);
  const idx = indexAtT(input, t);
  const n = input.end - input.start;
  const k = idx - input.start; // 前缀数组下标

  // ── 小数进度: 前沿在相邻两日间逐帧插值滑动, 消除按日瞬移 ──
  const headPos = Math.min(input.start + t * (n + 1), input.end);
  const valF = (x: number) => {
    const j = Math.max(0, Math.min(n - 1, Math.floor(x) - input.start));
    const f = Math.min(Math.max(x - input.start - j, 0), 1);
    return p.val[j] + (p.val[j + 1] - p.val[j]) * f;
  };
  const value = valF(headPos);

  // ── 时间轴映射: x 按真实日历时间均匀展开, 与参考视频一致 ──
  const startTs = p.ts[0];
  const endTs = p.ts[n];
  const curTs =
    k >= n
      ? endTs
      : (() => {
          const f = headPos - idx;
          const t0 = p.ts[k];
          return t0 + (p.ts[k + 1] - t0) * f;
        })();

  // ── y 域目标(已走过的全部历史; 前缀最值 O(1) 查表; 对比曲线纳入同一域) ──
  let vLo = p.min[k];
  let vHi = p.max[k];
  // 前沿插值点也纳入 y 域, 让刻度随线头渐进扩张而非瞬跳
  if (value < vLo) vLo = value;
  if (value > vHi) vHi = value;
  const cmp = o.compareSeries;
  let cmpVal: number | null = null;
  if (cmp) {
    const cp = cmpPrefix(cmp);
    if (cmp[k] < vLo) vLo = cmp[k];
    if (cmp[k] > vHi) vHi = cmp[k];
    if (cp.min[k] < vLo) vLo = cp.min[k];
    if (cp.max[k] > vHi) vHi = cp.max[k];
    // 前沿插值(与主曲线同款线性插值)
    const jk = Math.min(k, n - 1);
    const cf = Math.min(Math.max(headPos - input.start - jk, 0), 1);
    cmpVal = cmp[jk] + (cmp[Math.min(jk + 1, n)] - cmp[jk]) * cf;
    if (cmpVal < vLo) vLo = cmpVal;
    if (cmpVal > vHi) vHi = cmpVal;
  }
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

  // ── 盈亏状态色: 红↔青绿 无缝过渡(相对截至当日的累计投入, 预计算前缀 O(1)) ──
  const putIn = p.inv[k];
  const targetF = value >= putIn ? 1 : 0;
  smooth.f = smooth.f == null ? targetF : smooth.f + (targetF - smooth.f) * damp(0.07);
  const f = smooth.f;
  const lineColor = mixColor(f);
  const glowColor = mixColor(f, 0.55);

  // ── 布局: 左刻度槽 + 绘图区(右侧留白带, 光点不贴边) + 底部刻度带 ──
  const gutter = Math.round(Math.min(Math.max(w * 0.075, 46), 64));
  const plotL = gutter;
  const plotR = w - Math.round(Math.min(Math.max(w * 0.07, 44), 88));
  const plotT = 12;
  const plotB = h - 30;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;
  const xOfTs = (v: number) => {
    if (curTs <= startTs) return plotL;
    return plotL + ((v - startTs) / (curTs - startTs)) * plotW;
  };
  const xOf = (j: number) => xOfTs(p.ts[j]);
  const yOf = (v: number) => plotB - ((v - lo) / (hi - lo)) * plotH;

  // ── Y 轴刻度(左侧, 左对齐, 6 档) + 横向网格 + 左竖轴线 ──
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `500 11px ${MONO}`;
  for (let g = 0; g <= 5; g++) {
    const gv = lo + ((hi - lo) * g) / 5;
    const gy = yOf(gv);
    ctx.strokeStyle = 'rgba(17,17,20,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotL, gy);
    ctx.lineTo(plotR, gy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(17,17,20,0.42)';
    ctx.fillText(money(gv), 8, gy);
  }
  ctx.strokeStyle = 'rgba(17,17,20,0.14)';
  ctx.beginPath();
  ctx.moveTo(plotL + 0.5, plotT);
  ctx.lineTo(plotL + 0.5, plotB);
  ctx.stroke();

  // ── 对比模式图例(右上角, 两行: 主线/对比线) ──
  if (cmp) {
    const lx = plotR - 8;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `500 11px ${MONO}`;
    // 主线样式
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx - 96, plotT + 12);
    ctx.lineTo(lx - 58, plotT + 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(17,17,20,0.6)';
    ctx.fillText(locale === 'en' ? 'DCA' : '定投', lx, plotT + 12);
    // 对比线样式
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(17,17,20,0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx - 96, plotT + 30);
    ctx.lineTo(lx - 58, plotT + 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(17,17,20,0.45)';
    ctx.fillText(locale === 'en' ? 'Lump sum' : '一次性', lx, plotT + 30);
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
    const tickTs = Date.UTC(y, m - 1, 1);
    if (tickTs > curTs) break;
    if (tickTs < startTs) continue;
    if (ym === curYM) continue; // 当月由底部高亮框承担
    const x = xOfTs(tickTs);
    if (x < plotL + 20 || x > plotR - 20) continue;
    if (placedXs.length && x - placedXs[placedXs.length - 1] < 50) continue;
    const label = `${y}-${String(m).padStart(2, '0')}`;
    ctx.fillStyle = 'rgba(17,17,20,0.36)';
    ctx.fillText(label, x, h - 10);
    placedXs.push(x);
  }

  // ── 折线 + 渐变面积(裁剪进绘图区); 从起点到前沿逐帧生长 ──
  const headX = curTs > startTs ? plotR : plotL;
  const headY = yOf(value);
  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(plotL, yOf(p.val[0]));
    for (let j = 1; j <= k; j++) ctx.lineTo(xOf(j), yOf(p.val[j]));
    ctx.lineTo(headX, headY);
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotL, plotT - 4, plotW, plotH + 8);
  ctx.clip();
  // ── 对比曲线(垫底层): 灰白虚线, 一次性买入参照 ──
  if (cmp) {
    ctx.beginPath();
    ctx.moveTo(plotL, yOf(cmp[0]));
    for (let j = 1; j <= k; j++) ctx.lineTo(xOf(j), yOf(cmp[j]));
    if (cmpVal != null) ctx.lineTo(headX, yOf(cmpVal));
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(17,17,20,0.38)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const area = ctx.createLinearGradient(0, plotT, 0, plotB);
  area.addColorStop(0, mixColor(f, 0.3));
  area.addColorStop(1, 'rgba(255,255,255,0)');
  drawPath();
  ctx.lineTo(headX, plotB);
  ctx.lineTo(plotL, plotB);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  // 霓虹双层描边: 宽晕底层 + 亮芯上层
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  drawPath();
  ctx.strokeStyle = mixColor(f, 0.32);
  ctx.lineWidth = 7;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;
  ctx.stroke();
  drawPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 前沿坐标(小数插值点)
  const cx = headX;
  const cy = headY;

  // ── 垂直参考虚线(贯穿到底部高亮框) ──
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = mixColor(f, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, plotB);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 前沿径向大光晕 ──
  const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 26);
  halo.addColorStop(0, mixColor(f, 0.5));
  halo.addColorStop(1, mixColor(f, 0));
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  // ── 呼吸光标: 扩散脉冲环(reduced-motion 下跳过) ──
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
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── 跟随资产大字(光点左侧, 无框发光体; 左侧放不下时移到点上方) ──
  const label = money(value);
  const fs = Math.round(Math.min(Math.max(w * 0.034, 20), 34));
  ctx.font = `800 ${fs}px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = lineColor;
  const tw = ctx.measureText(label).width;
  if (cx - 18 - tw > plotL + 4) {
    ctx.textAlign = 'right';
    ctx.fillText(label, cx - 18, cy);
    ctx.fillText(label, cx - 18, cy); // 两遍叠亮
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy - fs);
    ctx.fillText(label, cx, cy - fs);
  }
  ctx.shadowBlur = 0;

  // ── 当前日期高亮框(底部刻度带, 跟随前沿, 贴右缘不溢出) ──
  const curLabel = dateYM(input.dates[Math.min(idx, input.end)]);
  ctx.font = `600 11px ${MONO}`;
  const cw = ctx.measureText(curLabel).width + 16;
  const chh = 20;
  const ccx = Math.min(Math.max(cx, plotL + cw / 2), w - 6 - cw / 2);
  const ccy = h - 16;
  const rr = (x: number, y: number, w2: number, h2: number, r: number) => {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w2, y, x + w2, y + h2, r);
    ctx.arcTo(x + w2, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r);
    ctx.arcTo(x, y, x + w2, y, r);
    ctx.closePath();
  };
  ctx.beginPath();
  rr(ccx - cw / 2, ccy - chh / 2, cw, chh, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = mixColor(f, 0.75);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = lineColor;
  ctx.fillText(curLabel, ccx, ccy + 0.5);

  // ── 右下水印(安全区: 距底部刻度带 ≥20px) ──
  if (o.watermark) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(17,17,20,0.22)';
    ctx.fillText(o.watermark, w - 12, h - 46);
  }

  ctx.restore();
}
