/** 数值与日期格式化(引擎/HUD/分享卡共用, 必须纯函数) */
import { ccyPrefix } from './tokens';

const trim = (x: number, d: number): string => {
  let s = x.toFixed(d);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
};

/** 金额(纯中文万/亿, 无货币符号): 209万 / 8.2万 / 949.4万 / 1.23亿
 *  进位边界取 "会四舍五入成 10000 低一级单位" 的阈值(9999.5万→1亿), 避免出现 10000万 */
export function moneyZh(v: number): string {
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 999_950_000_000) return `${trim(v / 1e12, 2)}万亿`;
  if (abs >= 99_995_000) return `${trim(v / 1e8, 2)}亿`;
  if (abs >= 1e4) return `${trim(v / 1e4, abs >= 1e6 ? 0 : 1)}万`;
  return trim(v, 0);
}

/** 带符号盈亏: +939万 / -91.83万 / +1.23亿 (进位阈值同 moneyZh) */
export function profitZh(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  if (abs >= 99_995_000) return `${sign}${trim(abs / 1e8, 2)}亿`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e4, 0)}万`;
  if (abs >= 1e4) return `${sign}${trim(abs / 1e4, 2)}万`;
  return `${sign}${trim(abs, 0)}`;
}

/** 金额(英文缩写, 币种可插): $1.23M / HK$4.87B / ¥1.2M (999,500 → 1.00M, 不出现 1000K; 整数不带小数) */
export function moneyEn(v: number, ccy = 'USD'): string {
  const sym = ccyPrefix(ccy);
  const abs = Math.abs(v);
  if (abs >= 999_995_000_000) return `${sym}${(v / 1e12).toFixed(2)}T`;
  if (abs >= 999_995_000) return `${sym}${(v / 1e9).toFixed(2)}B`;
  if (abs >= 999_500) return `${sym}${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sym}${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return Number.isInteger(v) ? `${sym}${v}` : `${sym}${v.toFixed(2)}`;
}

/** 涨幅: +244.02% / -91.83% */
export function pct(v: number, digits = 2): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${(Math.abs(v) * 100).toFixed(digits)}%`;
}

/** 倍数: ×24.4 */
export function multiple(v: number): string {
  return `×${v >= 100 ? v.toFixed(0) : v.toFixed(1)}`;
}

/** YYYYMMDD -> 1996-08-02 */
export function dateISO(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** YYYYMMDD -> 1996-08 (战报日期展示) */
export function dateYM(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}`;
}

/** 真实价格展示: $26.71 / HK$312.40 / ¥1420.00 (不复权收盘, 按标的计价货币) */
export function fmtPrice(v: number | null | undefined, ccy = 'USD'): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `${ccyPrefix(ccy)}${v.toFixed(2)}`;
}

/** 带符号盈亏(英文缩写): +$1.23M / -HK$918.3K */
export function profitEn(v: number, ccy = 'USD'): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${moneyEn(Math.abs(v), ccy)}`;
}

/** 按语言选择金额格式(zh 为万/亿中性无符号; en 带币种前缀, 缺省 USD) */
export function money(amount: number, locale: 'zh' | 'en', ccy = 'USD'): string {
  return locale === 'zh' ? moneyZh(amount) : moneyEn(amount, ccy);
}

/** 按语言选择带符号盈亏 */
export function profit(amount: number, locale: 'zh' | 'en', ccy = 'USD'): string {
  return locale === 'zh' ? profitZh(amount) : profitEn(amount, ccy);
}
