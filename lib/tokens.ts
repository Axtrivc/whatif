/**
 * 设计令牌 — 色彩与币种符号的唯一权威来源
 * 视觉系统: Terminal Minimal(白底 + 红/青绿双语义色)
 */

export const GAIN = '#D42B3A'; // 涨 / 盈利 / 强调(暖红, 白底可读)
export const LOSS = '#0E9F76'; // 跌 / 定投(青绿)

/** 币种 → 价格前缀; '' = 指数类(无货币符号), 未标注币种视为 USD */
const CCY_SYMBOL: Record<string, string> = {
  USD: '$',
  HKD: 'HK$',
  CNY: '¥',
  '': '',
};

export function ccyPrefix(ccy: string | undefined | null): string {
  return CCY_SYMBOL[ccy ?? 'USD'] ?? '$';
}

/** #RRGGBB → [r,g,b](canvas 插值混合用) */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
