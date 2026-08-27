/**
 * 从东方财富历史K线 API 抓取后复权日线 → public/data/{key}.json
 *
 * - 股票/指数/ETF: 东财 push2his, fqt=2(后复权)比值 = 含分红再投资的总回报,
 *   即"一直持有·红利复投"口径; 另补抓 fqt=0 不复权真实价(展示"买入价/现价")
 * - BTC: Bitstamp OHLC API(日K, 1000 根/页分页抓取), 无分红概念故 closes = 真实价
 * - 东财 WAF 拦 Node 的 TLS 指纹, 故 shell 出 curl 请求
 * - 限速: 每个请求间隔 ≥5s; 失败指数退避(该 IP 曾被临时拉黑)
 * - 收尾自动生成 ticker.json(全部已有数据文件的最新价+日涨跌, 供首页走马灯)
 *
 * 用法: node scripts/fetch-data.mjs [key ...]   # 缺省抓全部(含 btc)
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const GAP_MS = 5200;

// [key, secid候选(按序尝试), 最小数据点数, 展示代码, 中文名, 计价货币(缺省USD)]
const CATALOG = [
  ['msft', ['105.MSFT'], 3000, 'MSFT', '微软', 'USD'],
  ['aapl', ['105.AAPL'], 3000, 'AAPL', '苹果', 'USD'],
  ['nvda', ['105.NVDA'], 2000, 'NVDA', '英伟达', 'USD'],
  ['googl', ['105.GOOGL'], 2000, 'GOOGL', '谷歌', 'USD'],
  ['amzn', ['105.AMZN'], 3000, 'AMZN', '亚马逊', 'USD'],
  ['tsla', ['105.TSLA'], 2000, 'TSLA', '特斯拉', 'USD'],
  ['meta', ['105.META'], 1500, 'META', 'Meta', 'USD'],
  ['tsm', ['106.TSM'], 4000, 'TSM', '台积电', 'USD'],
  ['nflx', ['105.NFLX'], 4500, 'NFLX', '奈飞', 'USD'],
  ['amd', ['105.AMD'], 2800, 'AMD', '超威半导体', 'USD'], // 东财 AMD 仅 2015 起(拆股后), 2927 点
  ['cost', ['105.COST'], 5500, 'COST', '开市客', 'USD'],
  ['orcl', ['106.ORCL', '105.ORCL'], 3000, 'ORCL', '甲骨文', 'USD'], // 东财仅 2013 转板 NYSE 起
  ['mcd', ['106.MCD'], 6000, 'MCD', '麦当劳', 'USD'],
  ['intc', ['105.INTC'], 5500, 'INTC', '英特尔', 'USD'],
  ['pypl', ['105.PYPL'], 1500, 'PYPL', 'PayPal', 'USD'],
  ['ba', ['106.BA'], 5500, 'BA', '波音', 'USD'],
  ['qqq', ['105.QQQ', '107.QQQ'], 5000, 'QQQ', '纳指100', 'USD'],
  ['tencent', ['116.00700'], 4200, '0700', '腾讯', 'HKD'],
  ['moutai', ['1.600519'], 5200, '600519', '贵州茅台', 'CNY'],
  ['ko', ['106.KO'], 5000, 'KO', '可口可乐', 'USD'],
  ['dis', ['106.DIS'], 5000, 'DIS', '迪士尼', 'USD'],
  ['brkb', ['106.BRK_B', '106.BRK_A'], 3000, 'BRK-B', '伯克希尔', 'USD'],
  ['spx', ['100.SPX'], 5000, 'SPX', '标普500', ''],
  ['gold', ['107.GLD'], 4000, 'GLD', '黄金', 'USD'],
];
// btc 走 Bitstamp, 单列在此(与 lib/stocks.ts 的 STOCKS 共同维护展示信息)
const BTC = ['btc', 'BTC', '比特币', 'USD'];

// ticker.json 的条目顺序 = lib/stocks.ts STOCKS 的展示顺序
const TICKER_ORDER = [
  ['msft', 'MSFT', '微软', 'USD'],
  ['aapl', 'AAPL', '苹果', 'USD'],
  ['nvda', 'NVDA', '英伟达', 'USD'],
  ['googl', 'GOOGL', '谷歌', 'USD'],
  ['amzn', 'AMZN', '亚马逊', 'USD'],
  ['tsla', 'TSLA', '特斯拉', 'USD'],
  ['meta', 'META', 'Meta', 'USD'],
  ['brkb', 'BRK-B', '伯克希尔', 'USD'],
  ['ko', 'KO', '可口可乐', 'USD'],
  ['dis', 'DIS', '迪士尼', 'USD'],
  ['tsm', 'TSM', '台积电', 'USD'],
  ['nflx', 'NFLX', '奈飞', 'USD'],
  ['amd', 'AMD', '超威半导体', 'USD'],
  ['cost', 'COST', '开市客', 'USD'],
  ['orcl', 'ORCL', '甲骨文', 'USD'],
  ['mcd', 'MCD', '麦当劳', 'USD'],
  ['intc', 'INTC', '英特尔', 'USD'],
  ['pypl', 'PYPL', 'PayPal', 'USD'],
  ['ba', 'BA', '波音', 'USD'],
  ['qqq', 'QQQ', '纳指100', 'USD'],
  ['tencent', '0700', '腾讯', 'HKD'],
  ['moutai', '600519', '贵州茅台', 'CNY'],
  ['spx', 'SPX', '标普500', ''],
  ['gold', 'GLD', '黄金', 'USD'],
  ['btc', 'BTC', '比特币', 'USD'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlJson(url, { ua = 'curl/8' } = {}) {
  const r = spawnSync('curl', ['-s', '--max-time', '20', '-A', ua, url], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function fetchKlines(secid, { fqt = 2, retries = 3, backoffMs = 45_000 } = {}) {
  const url = `${API}?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=${fqt}&beg=19700101&end=20991231`;
  for (let i = 0; i <= retries; i++) {
    const j = curlJson(url);
    const k = j?.data?.klines;
    if (Array.isArray(k) && k.length) return j.data;
    console.log(`    重试 ${i + 1}/${retries} (${j ? '无数据' : '请求失败'})...`);
    if (i < retries) await sleep(backoffMs * (i + 1));
  }
  return null;
}

/** Bitstamp 日K 前向分页抓取(不带 end: start+limit 稳定返回自 start 起的下一页;
 *  带远端 end 时窗口语义不稳定, 时而返回末尾 1000 根) */
async function fetchBtcDaily() {
  const DAY = 86_400;
  const now = Math.floor(Date.now() / 1000);
  const rows = new Map();
  let from = 1_313_616_000; // 2011-08-18, Bitstamp 交易起点
  for (let page = 0; page < 12; page++) {
    const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${from}`;
    const j = curlJson(url, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const ohlc = j?.data?.ohlc;
    if (!Array.isArray(ohlc) || !ohlc.length) break;
    let lastTs = 0;
    for (const r of ohlc) {
      const t = Number(r.timestamp);
      const c = Number(r.close);
      if (t && Number.isFinite(c) && c > 0) {
        rows.set(t, c);
        if (t > lastTs) lastTs = t;
      }
    }
    console.log(`    第 ${page + 1} 页: 累计 ${rows.size} 根`);
    if (lastTs < from) break; // 窗口未推进(重复响应), 防死循环
    if (lastTs >= now - 2 * DAY) break; // 已到最新(当日K未收, 容忍2天)
    from = lastTs + DAY;
    await sleep(GAP_MS);
  }
  return rows;
}

const wanted = process.argv.slice(2);
const targets = wanted.length ? CATALOG.filter(([k]) => wanted.includes(k)) : CATALOG;
const wantBtc = !wanted.length || wanted.includes(BTC[0]);

const outDir = path.resolve(import.meta.dirname, '../public/data');
await mkdir(outDir, { recursive: true });

// manifest 与已有 index.json 合并: 部分抓取时不丢失未抓取标的的条目(sitemap 依赖)
const manifest = {};
try {
  Object.assign(manifest, JSON.parse(await readFile(path.join(outDir, 'index.json'), 'utf8')));
} catch {
  /* 首次抓取无 index.json */
}
let failures = 0;

for (const [key, secids, minPoints, ,] of targets) {
  let done = false;
  for (const secid of secids) {
    console.log(`→ ${key} (${secid})`);
    const data = await fetchKlines(secid);
    await sleep(GAP_MS);
    if (!data || data.klines.length < minPoints) {
      console.log(`  ✘ ${data ? `仅 ${data.klines.length} 点(< ${minPoints})` : '无响应'}, 换下一个 secid`);
      continue;
    }
    const dates = [];
    const closes = [];
    for (const row of data.klines) {
      const [d, c] = row.split(',');
      const v = Number(c);
      if (!d || !Number.isFinite(v) || v <= 0) continue;
      dates.push(d.replace(/-/g, ''));
      closes.push(Math.round(v * 10000) / 10000);
    }
    if (dates.length < minPoints) {
      console.log(`  ✘ 有效点 ${dates.length} 不足, 换下一个 secid`);
      continue;
    }
    const payload = {
      symbol: key,
      secid,
      emName: data.name,
      first: dates[0],
      last: dates[dates.length - 1],
      points: dates.length,
      dates,
      closes,
      // 后复权比值 = 红利复投总回报; 抓取日
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    // 补抓 fqt=0 不复权真实价(展示"买入价/现价"), 按日期对齐合并
    const raw = await fetchKlines(secid, { fqt: 0 });
    await sleep(GAP_MS);
    if (raw) {
      const map = new Map();
      for (const row of raw.klines) {
        const [d, c] = row.split(',');
        map.set(d.replace(/-/g, ''), Number(c));
      }
      const raw = dates.map((d) => map.get(d) ?? null);
      // 与后复权完全一致(无分红/未除权)时省略该字段, 数据文件体积约减半; 展示端回退 closes
      if (raw.some((v, i) => v !== closes[i])) payload.rawCloses = raw;
    }
    await writeFile(path.join(outDir, `${key}.json`), JSON.stringify(payload));
    manifest[key] = { first: payload.first, last: payload.last, points: payload.points };
    console.log(`  ✔ ${data.name} ${dates[0]} → ${dates[dates.length - 1]}  ${dates.length} 点`);
    done = true;
    break;
  }
  if (!done) {
    failures++;
    console.error(`  ✘✘ ${key} 全部 secid 失败`);
  }
}

if (wantBtc) {
  const [key, , zh] = BTC;
  console.log(`→ ${key} (Bitstamp)`);
  const rows = await fetchBtcDaily();
  if (rows.size >= 5000) {
    const keys = [...rows.keys()].sort((a, b) => a - b);
    const ymd = (ts) => new Date(ts * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const dates = keys.map(ymd);
    const closes = keys.map((t) => Math.round(rows.get(t) * 100) / 100);
    const payload = {
      symbol: key,
      secid: 'bitstamp:btcusd',
      emName: 'BTC/USD',
      first: dates[0],
      last: dates[dates.length - 1],
      points: dates.length,
      dates,
      closes,
      // 无分红概念, 真实价即复权价(不写 rawCloses, 展示端回退 closes)
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    await writeFile(path.join(outDir, `${key}.json`), JSON.stringify(payload));
    manifest[key] = { first: payload.first, last: payload.last, points: payload.points };
    console.log(`  ✔ BTC/USD ${dates[0]} → ${dates[dates.length - 1]}  ${dates.length} 点`);
  } else {
    failures++;
    console.error(`  ✘✘ btc 仅 ${rows.size} 根(Bitstamp), 放弃更新`);
  }
}

// ── 生成 ticker.json: 汇总本轮抓取 + 已有数据文件的最新真实价与日涨跌 ──
const ticker = [];
for (const [key, sym, zh, ccy] of TICKER_ORDER) {
  let j;
  try {
    j = JSON.parse(await readFile(path.join(outDir, `${key}.json`), 'utf8'));
  } catch {
    continue;
  }
  const closes = Array.isArray(j.rawCloses) ? j.rawCloses : j.closes;
  let last = null;
  let prev = null;
  for (let i = closes.length - 1; i >= 0; i--) {
    const v = closes[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (last == null) {
      last = v;
      continue;
    }
    prev = v;
    break;
  }
  if (last == null || prev == null || prev <= 0) continue;
  ticker.push({
    key,
    zh,
    sym,
    ccy, // '' = 指数(无货币符号)
    price: Math.round(last * 100) / 100,
    chg: Math.round((last / prev - 1) * 10000) / 100,
  });
}
if (ticker.length) {
  await writeFile(path.join(outDir, 'ticker.json'), JSON.stringify(ticker));
  console.log(`ticker.json: ${ticker.length} 项`);
}

await writeFile(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
console.log(`\n完成: ${targets.length + (wantBtc ? 1 : 0) - failures}/${targets.length + (wantBtc ? 1 : 0)}${failures ? `, 失败: ${failures}` : ''}`);
process.exitCode = failures ? 1 : 0;
