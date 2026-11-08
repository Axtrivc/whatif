/**
 * 设计令牌 — 色彩与币种符号的唯一权威来源
 * 视觉系统: Terminal Minimal(白底 + 红/青绿双语义色)
 */

export const GAIN = '#D42B3A'; // 涨 / 盈利 / 强调(暖红, 白底可读)
export const LOSS = '#0E9F76'; // 跌 / 定投(青绿)
export const LOSS_TEXT = '#0B7A5C'; // 跌-文本安全档(LOSS 同色相加深一档, 白底 ≈5.3:1 达 WCAG AA; LOSS 仅 ≈3.4:1, 小字文本用)

/** 币种 → 价格前缀; '' = 指数类(无货币符号), 未标注币种视为 USD */
const CCY_SYMBOL: Record<'USD' | 'HKD' | 'CNY' | '', string> = {
  USD: '$',
  HKD: 'HK$',
  CNY: '¥',
  '': '',
};

/** 币种符号穷举化: 缺省(undefined/null)→ USD; 非空未知字符串显式抛错, 不再静默回退 '$' */
export function ccyPrefix(ccy: string | undefined | null): string {
  const key = ccy ?? 'USD'; // undefined/null 缺省分支(缺省 USD 语义)
  if (!(key in CCY_SYMBOL)) throw new Error(`未知币种: ${ccy}`);
  return CCY_SYMBOL[key as keyof typeof CCY_SYMBOL];
}

/** 币种 → 中文名(中文站金额语境, 如「10 万美元」) */
export const CCY_ZH: Record<'USD' | 'HKD' | 'CNY', string> = {
  USD: '美元',
  HKD: '港元',
  CNY: '人民币',
};

/** 涨跌语义色 locale 令牌对(图形档: canvas/海报/大字图形, DOM/canvas/海报同源)
 *  zh 红涨绿跌(市场惯例); en 绿涨红跌(英文读者直觉) */
export function toneFor(locale: 'zh' | 'en'): { up: string; down: string } {
  return locale === 'en' ? { up: LOSS, down: GAIN } : { up: GAIN, down: LOSS };
}

/** toneFor 的类名版(text-gain/text-loss) */
export function toneCls(locale: 'zh' | 'en'): { up: string; down: string } {
  return locale === 'en'
    ? { up: 'text-loss', down: 'text-gain' }
    : { up: 'text-gain', down: 'text-loss' };
}

/** 涨跌语义色 locale 令牌对(文本档): 文本用途一律把 #0E9F76 色值替换为 LOSS_TEXT(白底 AA), 不分槽位/语言
 *  zh {up: GAIN, down: LOSS_TEXT} / en {up: LOSS_TEXT, down: GAIN}
 *  en 侧已接入(en-tone-unify 批: 回放页小字/走马灯/落地页文本档); zh 侧启用归 a11y-focus-contrast 批 */
export function toneTextFor(locale: 'zh' | 'en'): { up: string; down: string } {
  return locale === 'en' ? { up: LOSS_TEXT, down: GAIN } : { up: GAIN, down: LOSS_TEXT };
}

/** toneTextFor 的类名版(text-gain/text-loss-strong) */
export function toneClsText(locale: 'zh' | 'en'): { up: string; down: string } {
  return locale === 'en'
    ? { up: 'text-loss-strong', down: 'text-gain' }
    : { up: 'text-gain', down: 'text-loss-strong' };
}

/** #RRGGBB → [r,g,b](canvas 插值混合用) */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
