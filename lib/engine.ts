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
  amount: number; // 本金 USD
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
}

export function valueAt(input: ReplayInput, i: number): number {
  const base = input.closes[input.start];
  return (input.amount * input.closes[i]) / base;
}

/** 全程统计(回放结束时展示) */
export function computeStats(input: ReplayInput): ReplayStats {
  const { closes, dates, start, end, amount } = input;
  const base = closes[start];
  let peak = -Infinity;
  let peakIdx = start;
  let maxDD = 0;
  for (let i = start; i <= end; i++) {
    const v = closes[i] / base;
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  const totalRet = closes[end] / base;
  const days =
    (Date.UTC(+dates[end].slice(0, 4), +dates[end].slice(4, 6) - 1, +dates[end].slice(6, 8)) -
      Date.UTC(+dates[start].slice(0, 4), +dates[start].slice(4, 6) - 1, +dates[start].slice(6, 8))) /
    (365.2425 * 24 * 3600 * 1000);
  const years = Math.max(days, 1 / 365);
  return {
    finalValue: amount * totalRet,
    profit: amount * (totalRet - 1),
    returnPct: totalRet - 1,
    multiple: totalRet,
    years,
    cagr: Math.pow(totalRet, 1 / years) - 1,
    maxDrawdown: maxDD,
    startDate: dates[start],
    endDate: dates[end],
    bestDay: { idx: peakIdx, value: amount * peak },
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

/** 截至 i 的运行最大值索引(画峰值标记用), 供渲染帧内增量维护的初始值 */
export function runningMaxInit(input: ReplayInput): { idx: number; val: number } {
  return { idx: input.start, val: input.closes[input.start] };
}

/** 步进式更新运行最大 */
export function runningMaxStep(
  closes: number[],
  state: { idx: number; val: number },
  i: number
): { idx: number; val: number } {
  if (closes[i] > state.val) return { idx: i, val: closes[i] };
  return state;
}
