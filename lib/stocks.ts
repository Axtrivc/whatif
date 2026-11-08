/** 标的目录与构建期数据读取 */

export type Ccy = 'USD' | 'HKD' | 'CNY';

/** 交易市场(单一来源: i18n 标签等处的 Record 键依赖此 union, 新增市场漏配会在编译期报错) */
export type Market = 'nasdaq' | 'nyse' | 'index' | 'gold' | 'crypto' | 'hk' | 'ashare';

export interface StockMeta {
  key: string; // 数据文件名 / URL slug
  symbol: string; // 展示代码
  secid: string; // 数据源代码: 东财 secid(旧标的) / Yahoo symbol(2026-10 扩容标的) / bitstamp:pair
  zh: string; // 中文名
  en: string; // 英文名
  market: Market;
  ccy?: Ccy; // 真实价计价货币, 缺省 USD(引擎倍数为比值, 与币种无关)
  hot?: boolean; // 首页精选
  tagline: string; // 一句话
}

export const STOCKS: StockMeta[] = [
  { key: 'msft', symbol: 'MSFT', secid: '105.MSFT', zh: '微软', en: 'Microsoft', market: 'nasdaq', hot: true, tagline: '视频里的经典案例' },
  { key: 'aapl', symbol: 'AAPL', secid: '105.AAPL', zh: '苹果', en: 'Apple', market: 'nasdaq', hot: true, tagline: '从车库到全球市值第一' },
  { key: 'nvda', symbol: 'NVDA', secid: '105.NVDA', zh: '英伟达', en: 'NVIDIA', market: 'nasdaq', hot: true, tagline: 'AI 浪潮的最大赢家' },
  { key: 'googl', symbol: 'GOOGL', secid: '105.GOOGL', zh: '谷歌', en: 'Alphabet', market: 'nasdaq', hot: true, tagline: '搜索霸主的二十年' },
  { key: 'amzn', symbol: 'AMZN', secid: '105.AMZN', zh: '亚马逊', en: 'Amazon', market: 'nasdaq', hot: true, tagline: '从网上书店到万店帝国' },
  { key: 'tsla', symbol: 'TSLA', secid: '105.TSLA', zh: '特斯拉', en: 'Tesla', market: 'nasdaq', hot: true, tagline: '电动车的过山车' },
  { key: 'meta', symbol: 'META', secid: '105.META', zh: 'Meta', en: 'Meta Platforms', market: 'nasdaq', tagline: '社交帝国的起落' },
  { key: 'brkb', symbol: 'BRK-B', secid: '106.BRK_B', zh: '伯克希尔', en: 'Berkshire Hathaway', market: 'nyse', tagline: '巴菲特的复利机器' },
  { key: 'ko', symbol: 'KO', secid: '106.KO', zh: '可口可乐', en: 'Coca-Cola', market: 'nyse', tagline: '巴菲特的最爱' },
  { key: 'dis', symbol: 'DIS', secid: '106.DIS', zh: '迪士尼', en: 'Disney', market: 'nyse', tagline: '米老鼠的百年童话' },
  { key: 'tsm', symbol: 'TSM', secid: '106.TSM', zh: '台积电', en: 'TSMC', market: 'nyse', hot: true, tagline: '全世界的芯片都绕不开它' },
  { key: 'jpm', symbol: 'JPM', secid: 'JPM', zh: '摩根大通', en: 'JPMorgan Chase', market: 'nyse', tagline: '穿越了五次危机的百年银行' },
  { key: 'v', symbol: 'V', secid: 'V', zh: 'Visa', en: 'Visa', market: 'nyse', tagline: '你刷的每一笔卡, 都在给它分账' },
  { key: 'wmt', symbol: 'WMT', secid: 'WMT', zh: '沃尔玛', en: 'Walmart', market: 'nyse', tagline: '把一分钱折扣做成万亿帝国' },
  { key: 'xom', symbol: 'XOM', secid: 'XOM', zh: '埃克森美孚', en: 'Exxon Mobil', market: 'nyse', tagline: '工业时代的血液批发商' },
  { key: 'nflx', symbol: 'NFLX', secid: '105.NFLX', zh: '奈飞', en: 'Netflix', market: 'nasdaq', hot: true, tagline: '把录像带店干倒闭的公司' },
  { key: 'amd', symbol: 'AMD', secid: '105.AMD', zh: '超威半导体', en: 'AMD', market: 'nasdaq', hot: true, tagline: '险些破产, 后来的事都知道了' },
  { key: 'cost', symbol: 'COST', secid: '105.COST', zh: '开市客', en: 'Costco', market: 'nasdaq', tagline: '会员费砌出的护城河' },
  { key: 'orcl', symbol: 'ORCL', secid: '105.ORCL', zh: '甲骨文', en: 'Oracle', market: 'nasdaq', tagline: '数据库老炮的 AI 第二春' },
  { key: 'avgo', symbol: 'AVGO', secid: 'AVGO', zh: '博通', en: 'Broadcom', market: 'nasdaq', hot: true, tagline: 'AI 军备竞赛的另一个军火商' },
  { key: 'mcd', symbol: 'MCD', secid: '106.MCD', zh: '麦当劳', en: "McDonald's", market: 'nyse', tagline: '汉堡里卖出的复利' },
  { key: 'intc', symbol: 'INTC', secid: '105.INTC', zh: '英特尔', en: 'Intel', market: 'nasdaq', tagline: '错过时代的巨人(警示案例)' },
  { key: 'pypl', symbol: 'PYPL', secid: '105.PYPL', zh: 'PayPal', en: 'PayPal', market: 'nasdaq', tagline: '曾经的支付之王(高位警示)' },
  { key: 'ba', symbol: 'BA', secid: '106.BA', zh: '波音', en: 'Boeing', market: 'nyse', tagline: '天之骄子的至暗十年' },
  { key: 'qqq', symbol: 'QQQ', secid: '105.QQQ', zh: '纳指100', en: 'Invesco QQQ', market: 'index', tagline: '一篮子科技巨头(ETF)' },
  { key: 'tencent', symbol: '0700', secid: '116.00700', zh: '腾讯', en: 'Tencent', market: 'hk', ccy: 'HKD', hot: true, tagline: '社交与游戏的印钞机' },
  { key: 'baba', symbol: '09988', secid: '9988.HK', zh: '阿里巴巴', en: 'Alibaba', market: 'hk', ccy: 'HKD', tagline: '电商帝国的上半场与下半场' },
  { key: 'meituan', symbol: '03690', secid: '3690.HK', zh: '美团', en: 'Meituan', market: 'hk', ccy: 'HKD', tagline: '把三条街的生意装进一个 App' },
  { key: 'xiaomi', symbol: '01810', secid: '1810.HK', zh: '小米集团', en: 'Xiaomi', market: 'hk', ccy: 'HKD', hot: true, tagline: '从被嘲笑到造车逆袭' },
  { key: 'byd', symbol: '01211', secid: '1211.HK', zh: '比亚迪', en: 'BYD', market: 'hk', ccy: 'HKD', tagline: '被巴菲特押中的电车老大哥' },
  { key: 'moutai', symbol: '600519', secid: '1.600519', zh: '贵州茅台', en: 'Kweichow Moutai', market: 'ashare', ccy: 'CNY', hot: true, tagline: 'A 股最硬的白酒' },
  { key: 'catl', symbol: '300750', secid: '300750.SZ', zh: '宁德时代', en: 'CATL', market: 'ashare', ccy: 'CNY', tagline: '电动车的心脏供应商' },
  { key: 'cmb', symbol: '600036', secid: '600036.SS', zh: '招商银行', en: 'China Merchants Bank', market: 'ashare', ccy: 'CNY', tagline: '零售之王的利息生意' },
  { key: 'wuliangye', symbol: '000858', secid: '000858.SZ', zh: '五粮液', en: 'Wuliangye', market: 'ashare', ccy: 'CNY', tagline: '茅台之外的另一瓶' },
  { key: 'changjiang', symbol: '600900', secid: '600900.SS', zh: '长江电力', en: 'Yangtze Power', market: 'ashare', ccy: 'CNY', tagline: '把一条江装进一只股票' },
  { key: 'spx', symbol: 'SPX', secid: '100.SPX', zh: '标普500', en: 'S&P 500', market: 'index', tagline: '懒人基准：买指数' },
  { key: 'djia', symbol: 'DJIA', secid: '^DJI', zh: '道琼斯', en: 'Dow Jones', market: 'index', tagline: '一百年前的老指数, 还在工作' },
  { key: 'hsi', symbol: 'HSI', secid: '^HSI', zh: '恒生指数', en: 'Hang Seng Index', market: 'index', ccy: 'HKD', tagline: '港股的体温计' },
  { key: 'sse', symbol: 'SSE', secid: '000001.SS', zh: '上证指数', en: 'SSE Composite', market: 'index', ccy: 'CNY', tagline: '三千点的青春记忆' },
  { key: 'gold', symbol: 'GLD', secid: '107.GLD', zh: '黄金', en: 'Gold (GLD ETF)', market: 'gold', tagline: '穿越周期的硬通货(ETF)' },
  { key: 'btc', symbol: 'BTC', secid: 'bitstamp:btcusd', zh: '比特币', en: 'Bitcoin', market: 'crypto', hot: true, tagline: '2011 年 $10.9，今天呢？' },
  { key: 'eth', symbol: 'ETH', secid: 'bitstamp:ethusd', zh: '以太坊', en: 'Ethereum', market: 'crypto', tagline: 'BTC 之外最大的加密实验' },
];

export const STOCK_MAP: Record<string, StockMeta> = Object.fromEntries(
  STOCKS.map((s) => [s.key, s])
);

export interface Series {
  symbol: string;
  secid: string;
  emName?: string;
  first: string; // YYYYMMDD
  last: string;
  points: number;
  dates: string[]; // YYYYMMDD
  closes: number[]; // 后复权收盘(计算用)
  rawCloses?: (number | null)[]; // 不复权收盘(展示用), 与 dates 对齐; 与 closes 完全一致时省略(无分红/未除权标的)
  fetchedAt: string;
}

/** 不复权展示价: rawCloses 缺省(与后复权一致的标的)时回退 closes */
export function rawClosesOf(series: Series): (number | null)[] {
  return series.rawCloses ?? series.closes;
}

const seriesCache = new Map<string, Series | null>();

/** 构建期读取 public/data/{key}.json (仅服务端调用; 同一文件只读一次) */
export async function loadSeries(key: string): Promise<Series | null> {
  if (seriesCache.has(key)) return seriesCache.get(key)!;
  let out: Series | null = null;
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'public', 'data', `${key}.json`);
    out = JSON.parse(await fs.readFile(file, 'utf8')) as Series;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'ENOENT') {
      out = null; // 文件不存在: 稳定缺失, 维持缓存 null 语义
    } else {
      // 损坏/读取异常: 构建期必须可见, 且不写缓存以便下次调用重试
      console.error(`✘ loadSeries(${key}): public/data/${key}.json 读取/解析失败 —`, e);
      return null;
    }
  }
  seriesCache.set(key, out);
  return out;
}

/** 该年份首个交易日索引(>= YYYY0101 的第一天) */
export function startIndexForYear(series: Series, year: number): number {
  const prefix = String(year);
  for (let i = 0; i < series.dates.length; i++) {
    if (series.dates[i].slice(0, 4) >= prefix) return i;
  }
  return -1;
}
