/**
 * 从东方财富历史K线 API 抓取后复权日线 → public/data/{key}.json
 *
 * - fqt=2(后复权): 序列比值 = 含分红再投资的总回报, 即"一直持有·红利复投"口径
 * - 东财 WAF 拦 Node 的 TLS 指纹, 故 shell 出 curl 请求
 * - 限速: 每个请求间隔 ≥5s; 失败指数退避(该 IP 曾被临时拉黑)
 *
 * 用法: node scripts/fetch-data.mjs [key ...]   # 缺省抓全部
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const GAP_MS = 5200;

// [key, secid候选(按序尝试), 最小数据点数]
// 注意: btc 数据来自 Bitstamp API, 本脚本不支持(见 README"数据更新");
//       东财对本机非浏览器指纹有临时封锁, 脚本失败时可稍后重试或用浏览器方案
const CATALOG = [
  ['msft', ['105.MSFT'], 3000],
  ['aapl', ['105.AAPL'], 3000],
  ['nvda', ['105.NVDA'], 2000],
  ['googl', ['105.GOOGL'], 2000],
  ['amzn', ['105.AMZN'], 3000],
  ['tsla', ['105.TSLA'], 2000],
  ['meta', ['105.META'], 1500],
  ['ko', ['106.KO'], 5000],
  ['dis', ['106.DIS'], 5000],
  ['brkb', ['106.BRK_B', '106.BRK_A'], 3000],
  ['spx', ['100.SPX'], 5000],
  ['gold', ['107.GLD'], 4000],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlJson(url) {
  const r = spawnSync('curl', ['-s', '--max-time', '20', url], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function fetchKlines(secid, { retries = 3, backoffMs = 45_000 } = {}) {
  const url = `${API}?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=2&beg=19700101&end=20991231`;
  for (let i = 0; i <= retries; i++) {
    const j = curlJson(url);
    const k = j?.data?.klines;
    if (Array.isArray(k) && k.length) return j.data;
    console.log(`    重试 ${i + 1}/${retries} (${j ? '无数据' : '请求失败'})...`);
    if (i < retries) await sleep(backoffMs * (i + 1));
  }
  return null;
}

const wanted = process.argv.slice(2);
const targets = wanted.length ? CATALOG.filter(([k]) => wanted.includes(k)) : CATALOG;

const outDir = path.resolve(import.meta.dirname, '../public/data');
await mkdir(outDir, { recursive: true });

const manifest = {};
let failures = 0;

for (const [key, secids, minPoints] of targets) {
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

await writeFile(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
console.log(`\n完成: ${targets.length - failures}/${targets.length}${failures ? `, 失败: ${failures}` : ''}`);
process.exitCode = failures ? 1 : 0;
