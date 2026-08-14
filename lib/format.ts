/** 数值与日期格式化(引擎/HUD/分享卡共用, 必须纯函数) */

const fmt2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 金额: $1.23万 / $4.87亿 / $2,413亿 (中文单位) */
export function moneyZh(v: number): string {
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `$${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `$${(v / 1e4).toFixed(abs >= 1e6 ? 0 : 1)}万`;
  if (abs >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

/** 金额: $1.23M / $4.87B */
export function moneyEn(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return `$${v.toFixed(2)}`;
}

/** 精确到分的收益额: +4,011,072.99 */
export function profitExact(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}$${fmt2.format(Math.abs(v))}`;
}

/** 涨幅: +244.02% */
export function pct(v: number, digits = 2): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${Math.abs(v * 100).toFixed(digits)}%`;
}

/** 倍数: ×24.4 */
export function multiple(v: number): string {
  return `×${v >= 100 ? v.toFixed(0) : v.toFixed(1)}`;
}

/** YYYYMMDD -> 1996-08-02 */
export function dateISO(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export function money(amount: number, locale: 'zh' | 'en'): string {
  return locale === 'zh' ? moneyZh(amount) : moneyEn(amount);
}

export const compact = fmt0.format;
