/** 标的目录与构建期数据读取 */

export interface StockMeta {
  key: string; // 数据文件名 / URL slug
  symbol: string; // 展示代码
  secid: string; // 东方财富代码
  zh: string; // 中文名
  en: string; // 英文名
  market: 'nasdaq' | 'nyse' | 'index' | 'gold' | 'crypto';
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
  { key: 'spx', symbol: 'SPX', secid: '100.SPX', zh: '标普500', en: 'S&P 500', market: 'index', tagline: '懒人基准：买指数' },
  { key: 'gold', symbol: 'GLD', secid: '107.GLD', zh: '黄金', en: 'Gold (GLD ETF)', market: 'gold', tagline: '穿越周期的硬通货(ETF)' },
  { key: 'btc', symbol: 'BTC', secid: 'bitstamp:btcusd', zh: '比特币', en: 'Bitcoin', market: 'crypto', hot: true, tagline: '2011 年 $10.9，今天呢？' },
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
  rawCloses?: (number | null)[]; // 不复权收盘(展示用), 与 dates 对齐
  fetchedAt: string;
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
  } catch {
    out = null;
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
