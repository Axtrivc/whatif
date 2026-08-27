/**
 * 回放引擎 — 纯计算层
 *
 * 数据口径: 后复权收盘价序列。比值 closes[i]/closes[i0] 即
 * "一直持有 · 分红再投资" 的总回报因子(近似, 分红按除息日再投入)。
 */

export interface ReplayInput {
  dates: string[]; // YYYYMMDD
  closes: number[]; // 后复权
  start: number; // 起始索引(含)
  end: number; // 结束索引(含)
  amount: number; // 本金 USD( lump-sum 模式为单笔; dca 模式为首笔月投额)
  /** 每月定投模式: 每月首个交易日追加 monthly 美元(首笔 = amount 在 start 日买入)。
   *  缺省为一次性买入(lump-sum)。 */
  monthly?: number;
}

export interface ReplayStats {
  finalValue: number;
  profit: number;
  returnPct: number;
  multiple: number;
  years: number;
  cagr: number; // 年化(几何)
  maxDrawdown: number; // 0~1
  startDate: string;
  endDate: string;
  bestDay: { idx: number; value: number };
  invested?: number; // dca 模式: 累计投入本金
}

/** ── DCA 逐日资产序列(与渲染/统计共用) ──
 *  第 i 天的资产值 = Σ_k amount_k * closes[i]/closes[start_k],
 *  其中 amount_k 为第 k 笔投入(start 日投 amount, 此后每月首个交易日投 monthly)。
 *  返回与 dates[start..end] 对齐的 Float64Array。
 *  按 input 身份 WeakMap 缓存(渲染帧内/HUD 反复调用, 勿修改返回数组)。 */
const seriesCache = new WeakMap<ReplayInput, Float64Array>();

export function dcaSeries(input: ReplayInput): Float64Array {
  const hit = seriesCache.get(input);
  if (hit) return hit;
  const { dates, closes, start, end, amount, monthly } = input;
  const n = end - start;
  const out = new Float64Array(n + 1);
  if (!monthly) {
    const base = closes[start];
    for (let j = 0; j <= n; j++) out[j] = (amount * closes[start + j]) / base;
    seriesCache.set(input, out);
    return out;
  }
  // 逐月找注入点: 每月首个交易日。份额法: 每笔买入折成份额, 资产 = 份额 × 当日价。
  let shares = 0;
  let injectedMonth = -1; // 已注入的月份(相对 start 的月序号), -1 = 尚未注入首笔
  for (let j = 0; j <= n; j++) {
    const i = start + j;
    const d = dates[i];
    const m = +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1);
    if (injectedMonth < m) {
      injectedMonth = m;
      shares += (j === 0 ? amount : monthly) / closes[i];
    }
    out[j] = shares * closes[i];
  }
  seriesCache.set(input, out);
  return out;
}

/** 截至每日的累计投入(与 dcaSeries 同长对齐): 首笔 amount + 此后每月 monthly。
 *  一次性买入为常量 amount。同 WeakMap 缓存, 勿修改返回数组。 */
const investedCache = new WeakMap<ReplayInput, Float64Array>();

export function investedSeries(input: ReplayInput): Float64Array {
  const hit = investedCache.get(input);
  if (hit) return hit;
  const { dates, start, end, amount, monthly } = input;
  const n = end - start;
  const out = new Float64Array(n + 1);
  if (!monthly) {
    out.fill(amount);
    investedCache.set(input, out);
    return out;
  }
  let months = 0;
  let lastM = -1;
  for (let j = 0; j <= n; j++) {
    const d = dates[start + j];
    const m = +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1);
    if (lastM < m) {
      lastM = m;
      months++;
    }
    out[j] = amount + monthly * (months - 1);
  }
  investedCache.set(input, out);
  return out;
}

/** dca 模式累计投入(截至 end): 首笔 amount + 后续每月 monthly */
export function dcaInvested(input: ReplayInput): number {
  if (!input.monthly) return input.amount;
  const { dates, start, end } = input;
  let months = 0;
  let lastM = -1;
  for (let i = start; i <= end; i++) {
    const d = dates[i];
    const m = +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1);
    if (lastM < m) {
      lastM = m;
      months++;
    }
  }
  return input.amount + input.monthly * (months - 1);
}

/** 全程统计(回放结束时展示) */
export function computeStats(input: ReplayInput): ReplayStats {
  const { dates, start, end } = input;
  const series = dcaSeries(input);
  const invested = input.monthly ? dcaInvested(input) : input.amount;
  let peak = -Infinity;
  let peakIdx = start;
  let maxDD = 0;
  for (let j = 0; j <= end - start; j++) {
    const v = series[j] / invested;
    if (v > peak) {
      peak = v;
      peakIdx = start + j;
    }
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  const finalValue = series[end - start];
  const totalRet = finalValue / invested;
  const days =
    (Date.UTC(+dates[end].slice(0, 4), +dates[end].slice(4, 6) - 1, +dates[end].slice(6, 8)) -
      Date.UTC(+dates[start].slice(0, 4), +dates[start].slice(4, 6) - 1, +dates[start].slice(6, 8))) /
    (365.2425 * 24 * 3600 * 1000);
  const years = Math.max(days, 1 / 365);
  return {
    finalValue,
    profit: finalValue - invested,
    returnPct: totalRet - 1,
    multiple: totalRet,
    years,
    cagr: Math.pow(totalRet, 1 / years) - 1,
    maxDrawdown: maxDD,
    startDate: dates[start],
    endDate: dates[end],
    bestDay: { idx: peakIdx, value: peak * invested },
    invested: input.monthly ? invested : undefined,
  };
}

/** 动画时长(秒): 对齐参考视频 ~1.25月/秒 的慢节奏(约 21 交易日/秒),
 *  1x 看清月度涨跌; 长回放靠 2x/4x 快进 */
export function durationFor(points: number): number {
  return Math.min(240, Math.max(45, points / 21));
}

/** t∈[0,1] -> 当日索引(线性, 与抖音原视频一致的匀速快进感) */
export function indexAtT(input: ReplayInput, t: number): number {
  const n = input.end - input.start;
  return Math.min(input.end, input.start + Math.floor(t * (n + 1)));
}
