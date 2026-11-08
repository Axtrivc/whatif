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
  cagr: number; // 年化: lump-sum=几何口径; dca=资金加权 IRR(不可解时回退几何)
  maxDrawdown: number; // 0~1
  startDate: string;
  endDate: string;
  invested?: number; // dca 模式: 累计投入本金
}

/** ── DCA 逐日资产序列(与渲染/统计共用) ──
 *  第 i 天的资产值 = Σ_k amount_k * closes[i]/closes[start_k],
 *  其中 amount_k 为第 k 笔投入(start 日投 amount, 此后每月首个交易日投 monthly)。
 *  返回与 dates[start..end] 对齐的 Float64Array。
 *  按 input 身份 WeakMap 缓存(渲染帧内/HUD 反复调用, 勿修改返回数组)。 */
const seriesCache = new WeakMap<ReplayInput, Float64Array>();

/** 月份序号(YYYYMM → 线性可比的月编号), 用于"每月首个交易日"注入点判定 */
const monthSeq = (d: string): number => +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1);

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
    const m = monthSeq(dates[i]);
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
    const m = monthSeq(dates[start + j]);
    if (lastM < m) {
      lastM = m;
      months++;
    }
    out[j] = amount + monthly * (months - 1);
  }
  investedCache.set(input, out);
  return out;
}

/** dca 模式累计投入(截至 end): 首笔 amount + 后续每月 monthly。
 *  委托 investedSeries(共享其 WeakMap 缓存与逐月注入规则, lump-sum 恒为 amount)。 */
export function dcaInvested(input: ReplayInput): number {
  return investedSeries(input)[input.end - input.start];
}

/** ── 定投月度资金加权内部收益率(IRR) ──
 *  现金流: 注入笔 k(k=0 为首笔 amount, k≥1 为每月 monthly)发生在注入月
 *  m_k(0-based, m_0=0, 注入月判定与 investedSeries 同规则 — 每月首个交易日);
 *  终值 finalValue 折现在 m_end = monthSeq(dates[end]) − monthSeq(dates[start])
 *  (不 +1: dates[end] 属最后一个注入月, 终值与末笔注入同月位实现 — 恒定月增长 g 下
 *  取该月位时 NPV(g)≡0, 是折现月位正确性的直接判据)。
 *  令 f(r) = finalValue/(1+r)^{m_end} − Σ_k amount_k/(1+r)^{m_k}(投资人视角 NPV,
 *  与施工说明的 NPV 定义相差整体符号): 现金流时序符号 (−,…,−,+) 恰一次变号
 *  (Descartes), f 在 r∈(−1,∞) 单次由正穿负 — 二分可解唯一根。
 *  lo=−0.99, hi 自 1 倍增至 f(hi)<0(上限 1e6), 80 次迭代; 年化 = (1+r)^12 − 1。
 *  注入笔数 <2 / m_end < 1 / 区间端点未变号(根在 [−0.99, 1e6] 外)→ null,
 *  调用方回退几何口径。 */
function monthlyIrr(input: ReplayInput): number | null {
  const { dates, start, end, amount, monthly } = input;
  if (!monthly) return null;
  // 注入现金流 [月位, 金额]: 首笔 amount 在月 0, 此后每个新月首个交易日注 monthly
  const flows: Array<[number, number]> = [[0, amount]];
  const base = monthSeq(dates[start]);
  let lastM = base;
  for (let j = 1; j <= end - start; j++) {
    const m = monthSeq(dates[start + j]);
    if (m > lastM) {
      lastM = m;
      flows.push([m - base, monthly]);
    }
  }
  const mEnd = lastM - base; // 末次月份即 dates[end] 所在月
  if (flows.length < 2 || mEnd < 1) return null;
  const finalValue = dcaSeries(input)[end - start]; // WeakMap 缓存, 与 computeStats 同源
  // f(r) > 0 ⟺ 折现率 r 低估了这串现金流(IRR 在 r 右侧)
  const f = (r: number): number => {
    let v = finalValue / Math.pow(1 + r, mEnd);
    for (const [m, amt] of flows) v -= amt / Math.pow(1 + r, m);
    return v;
  };
  let lo = -0.99;
  if (f(lo) <= 0) return null; // 根 < −0.99(如终值归零) — 不强行求解
  let hi = 1;
  while (f(hi) >= 0) {
    hi *= 2;
    if (hi > 1e6) return null; // 月 IRR 超 1e6 量级视为不收敛
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  return Math.pow(1 + r, 12) - 1;
}

/** 全程统计(回放结束时展示) */
export function computeStats(input: ReplayInput): ReplayStats {
  const { dates, start, end } = input;
  const series = dcaSeries(input);
  // 累计投入复用 investedSeries 缓存(渲染层已建), 不再单独扫一遍日期序列
  const inv = investedSeries(input);
  // 总量口径(profit/returnPct/multiple/cagr): 期末累计投入; lump-sum 为常量 amount
  const invested = inv[end - start];
  // 回撤口径: 逐日以"当日累计投入"为分母 — 用期末投入作全程分母会系统性低估定投回撤
  let peak = -Infinity;
  let maxDD = 0;
  for (let j = 0; j <= end - start; j++) {
    const v = series[j] / inv[j];
    if (v > peak) peak = v;
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
    // 定投年化: 资金加权 IRR(把后期投入按实际停留时长折现, 修正"期末累计投入
    // 当期初一次投入"的系统性低估); IRR 不可解时回退几何口径。lump-sum 分母即
    // 期初单笔, 几何口径本就正确, 不动。
    cagr: input.monthly
      ? monthlyIrr(input) ?? Math.pow(totalRet, 1 / years) - 1
      : Math.pow(totalRet, 1 / years) - 1,
    maxDrawdown: maxDD,
    startDate: dates[start],
    endDate: dates[end],
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
