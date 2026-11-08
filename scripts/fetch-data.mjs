/**
 * 从公开行情 API 抓取后复权日线 → public/data/{key}.json
 *
 * - 东财(旧标的): push2his, fqt=2(后复权)比值 = 含分红再投资的总回报,
 *   即"一直持有·红利复投"口径; 另补抓 fqt=0 不复权真实价(展示"买入价/现价")。
 *   2026-10 起 WAF 升级: curl / Playwright Chromium / 系统 Edge 指纹均被掐(实测),
 *   通道恢复前这些标的靠增量模式跳过, 不阻塞整体跑完
 * - Yahoo(2026-10 扩容标的): v8 chart 显式 period1=0 窗口才有全量日线(range=max
 *   未认证会被降采样成月线); adjclose 即红利复投总回报序列(锚定当前价, 比值口径与
 *   东财后复权一致), quote.close 为不复权真实价
 * - BTC/ETH: Bitstamp OHLC API(日K, 1000 根/页分页抓取), 无分红概念故 closes = 真实价
 * - 东财 WAF 拦 Node 的 TLS 指纹, 故 shell 出 curl 请求
 * - 限速: 每个请求间隔 ≥5s; 失败指数退避(该 IP 曾被临时拉黑)
 * - 默认增量: 只抓「缺文件」与「陈旧(>FETCH_STALE_DAYS 天, 每轮限量 FETCH_REFRESH_MAX 个,
 *   最旧优先)」标的, 新鲜的跳过; 显式传 key 参数则强制抓指定标的(维护语义, 不受预算限制)
 * - 时间预算 FETCH_BUDGET_S(默认 480s): 耗尽后剩余标的留待下轮(不计失败) —
 *   保证 CI/门禁 900s 窗口内必然跑完, 全量追赶靠多轮增量完成
 * - 标的清单单一来源: 从 lib/stocks.ts STOCKS 派生(parseStocks 源码正则解析, .mjs 不能
 *   import TS), 通道专属参数收敛于 FETCH_HINTS 提示表 — 扩标的只改 stocks.ts 一处
 * - 收尾自动生成 ticker.json({ asOf, items }: 全部已有数据文件的最新价+日涨跌+数据截至日,
 *   供首页走马灯; asOf 距今 >14 天时走马灯 Live 降级为「数据截至」)
 *
 * 用法: node scripts/fetch-data.mjs [key ...]   # 缺省增量抓取(含 crypto)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const GAP_MS = 5200;

// ── 标的清单单一来源: lib/stocks.ts STOCKS ──
// .mjs 不能 import TS, 走源码正则解析(仿 check-data.mjs stockKeys, 含同款交叉核对);
// 新增/下线标的只改 stocks.ts 一处, 本脚本不再维护平行清单。
/** 解析 STOCKS 数组 → [{ key, secid, symbol, zh, ccy?, market }](顺序即展示顺序) */
function parseStocks() {
  const src = readFileSync(path.resolve(import.meta.dirname, '../lib/stocks.ts'), 'utf8');
  const begin = src.indexOf('export const STOCKS');
  const end = src.indexOf('export const STOCK_MAP');
  const body = begin >= 0 && end > begin ? src.slice(begin, end) : '';
  const out = [];
  for (const m of body.matchAll(/\{[^{}]*\}/g)) {
    const e = m[0];
    const f = (re) => e.match(re)?.[1];
    const entry = {
      key: f(/key:\s*['"]([a-z0-9-]+)['"]/),
      secid: f(/secid:\s*['"]([^'"]+)['"]/),
      symbol: f(/symbol:\s*['"]([^'"]+)['"]/),
      zh: f(/zh:\s*['"]([^'"]+)['"]/),
      ccy: f(/ccy:\s*['"](USD|HKD|CNY)['"]/), // 可选字段
      market: f(/market:\s*['"](nasdaq|nyse|index|gold|crypto|hk|ashare)['"]/),
    };
    for (const k of ['key', 'secid', 'symbol', 'zh', 'market']) {
      if (entry[k] === undefined) {
        console.error(`✘ lib/stocks.ts STOCKS 条目字段 ${k} 解析失败: ${e.replace(/\s+/g, ' ').slice(0, 90)}`);
        process.exit(1);
      }
    }
    out.push(entry);
  }
  // 交叉核对(与 check-data 同思路, 双引号风格一并计入): `key: '...'` 出现次数与解析条目数
  // 不符 → 清单静默缩水, 直接硬失败
  const total = (body.match(/\bkey:\s*['"]/g) || []).length;
  if (!out.length || total !== out.length) {
    console.error(`✘ lib/stocks.ts STOCKS 解析异常: key 出现 ${total} 次但解析出 ${out.length} 条`);
    process.exit(1);
  }
  return out;
}

// 通道提示表: 目录(secid)之外、无法在 stocks.ts 里表达的抓取参数收敛于此 —
//   alt        secid 候选序(含首选; 仅东财多市场挂牌标的需要, 缺省 [secid] 单候选)
//   minPoints  最小数据点数(缺省 300; 现有候选与下限自旧 CATALOG/YAHOO_CATALOG 如实迁移)
//   tickerCcy  走马灯计价货币覆盖(缺省 meta.ccy ?? 'USD'; spx/djia 点位无符号, qqq 美元 ETF)
//   epoch      Bitstamp 交易起点秒(crypto 通道必填, 分页起点与动态下限共用)
const FETCH_HINTS = {
  // ── 东财通道(secid = 市场码.代码) ──
  msft: { minPoints: 3000 },
  aapl: { minPoints: 3000 },
  nvda: { minPoints: 2000 },
  googl: { minPoints: 2000 },
  amzn: { minPoints: 3000 },
  tsla: { minPoints: 2000 },
  meta: { minPoints: 1500 },
  tsm: { minPoints: 4000 },
  nflx: { minPoints: 4500 },
  amd: { minPoints: 2800 }, // 东财 AMD 仅 2015 起(拆股后), 2927 点
  cost: { minPoints: 5500 },
  orcl: { alt: ['106.ORCL', '105.ORCL'], minPoints: 3000 }, // 东财仅 2013 转板 NYSE 起
  mcd: { minPoints: 6000 },
  intc: { minPoints: 5500 },
  pypl: { minPoints: 1500 },
  ba: { minPoints: 5500 },
  qqq: { alt: ['105.QQQ', '107.QQQ'], minPoints: 5000, tickerCcy: 'USD' }, // market=index 但是美元 ETF, 纯 market 规则会丢 $
  tencent: { minPoints: 4200 },
  moutai: { minPoints: 5200 },
  ko: { minPoints: 5000 },
  dis: { minPoints: 5000 },
  brkb: { alt: ['106.BRK_B', '106.BRK_A'], minPoints: 3000 },
  spx: { minPoints: 5000, tickerCcy: '' }, // 点位报价无货币符号
  gold: { minPoints: 4000 },
  // ── Yahoo v8 通道(secid = Yahoo symbol), minPoints 按各标的 Yahoo 实际起点定
  //    (注释为 2026-10-24 实测点数, 宁少勿多) ──
  jpm: { minPoints: 4000 }, // 自 1980-03 起, 实测 11747 点
  v: { minPoints: 4000 }, // 2008-03 IPO, 实测 4680 点
  wmt: { minPoints: 4000 }, // 1972-08 起, 实测 13653 点
  xom: { minPoints: 4000 }, // 1970-01 起, 实测 14325 点
  avgo: { minPoints: 4000 }, // 2009-08 现 IPO, 实测 4331 点(边缘过线)
  baba: { minPoints: 1600 }, // 港股上市 2019-11-26 起, 实测 1699 点(原配置误按 2014 美股 IPO 估 2800, 已修正)
  meituan: { minPoints: 1800 }, // 2018-09 上市, 实测 1989 点
  xiaomi: { minPoints: 1800 }, // 2018-07 上市, 实测 2042 点
  byd: { minPoints: 4000 }, // 2002-07 港股上市, 实测 6010 点
  catl: { minPoints: 1800 }, // 2018-06 上市, 实测 2028 点
  cmb: { minPoints: 4000 }, // 2002-04 A 股上市, 实测 6027 点
  wuliangye: { minPoints: 4000 }, // 1998-04 上市, 实测 7058 点
  changjiang: { minPoints: 4000 }, // 2003-11 上市, 实测 5607 点
  djia: { minPoints: 4000, tickerCcy: '' }, // 日线自 1992-01 起, 实测 8765 点; 点位报价无货币符号
  hsi: { minPoints: 4000 }, // 1986-12 起, 实测 9825 点(点位报价, 现行走马灯按目录 ccy=HKD 展示, 维持现状)
  sse: { minPoints: 6000 }, // 自 1997-07 起(东财可回溯到 1990, 通道恢复前接受), 实测 7099 点
  // ── Bitstamp 通道(secid = bitstamp:pair) ──
  btc: { epoch: 1_313_616_000 }, // 2011-08-18, Bitstamp BTC 交易起点
  eth: { epoch: 1_502_928_000 }, // 2017-08-17, Bitstamp ETH/USD 上线日(首抓实测 3356 根)
};

// 通道判定(由 secid 形状路由, 无第三处清单): bitstamp: 前缀 → Bitstamp;
// 「1-3 位市场码.代码」(105.MSFT / 1.600519 / 116.00700) → 东财; 其余(JPM / 9988.HK /
// ^DJI / 000001.SS — 数字前缀 ≥4 位) → Yahoo v8 chart
const channelOf = (m) =>
  m.secid.startsWith('bitstamp:') ? 'crypto' : /^\d{1,3}\./.test(m.secid) ? 'em' : 'yahoo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 出网请求统一安全校验: 仅 http/https, 拒绝 localhost/环回/私有/保留地址。
// 本脚本 URL 均由硬编码域名常量拼接, 此校验为纵深防御(防未来参数注入内网地址)。
function assertSafeUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅允许 http/https 协议: ${u.protocol}`);
  }
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '[::1]') {
    throw new Error(`拒绝本地地址: ${h}`);
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const bad =
      a === 0 || a === 127 || a >= 224 || // 0.x / 环回 / 组播及保留段
      a === 10 || // 10/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 169 && b === 254) || // 169.254/16 链路本地
      (a === 100 && b >= 64 && b <= 127); // 100.64/10 CGNAT
    if (bad) throw new Error(`拒绝环回/私有/保留地址: ${h}`);
  }
}

function curlJson(url, { ua = 'curl/8', timeout = 20 } = {}) {
  assertSafeUrl(url);
  const r = spawnSync('curl', ['-s', '--max-time', String(timeout), '-A', ua, url], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024, // Yahoo 全量日线+分红事件 JSON 可达数 MB, 默认 1MB 会截断
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ── 真浏览器抓取回退 ──
// 东财 WAF 会在 TLS 指纹层掐掉非浏览器客户端: curl(schannel)/node undici 均在
// "服务端发起重协商→断连"处死掉(HTTP 000), 但真实 Chromium 指纹可通过。
// Playwright 仅为抓取工具不进依赖(守零重型依赖), 模块探测按候选序依次尝试:
//   1. PLAYWRIGHT_PATH 环境变量(显式指定模块路径)
//   2. 裸 'playwright' 说明符(项目内/同目录安装时命中)
//   3. 本机 npx 缓存(_npx 哈希目录, 由 LOCALAPPDATA 动态拼接, 不硬编码用户绝对路径)
// 全部失败打印安装指引并永久关闭浏览器通道, 脚本降级纯 curl 模式并如实计失败。
let browserCtx = null;
let browserBroken = false;
let pwMod = null;
let pwTried = false;
function loadPlaywright() {
  if (!pwTried) {
    pwTried = true;
    const req = createRequire(import.meta.url);
    const npxCache = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', 'e41f203b7505f1fb', 'node_modules', 'playwright')
      : null;
    const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', npxCache].filter(Boolean);
    for (const c of candidates) {
      try {
        pwMod = req(c);
        break;
      } catch {}
    }
    if (!pwMod) {
      console.log(`    Playwright 不可用(已尝试: ${candidates.join(' | ')}), 浏览器通道关闭, 降级纯 curl`);
      console.log('    启用指引: npx playwright install chromium, 或设 PLAYWRIGHT_PATH 指向 playwright 模块路径');
    }
  }
  return pwMod;
}
async function browserJson(url) {
  if (browserBroken) return null;
  assertSafeUrl(url);
  try {
    if (!browserCtx) {
      const pw = loadPlaywright();
      if (!pw) {
        browserBroken = true;
        return null;
      }
      const { chromium } = pw;
      const browser = await chromium.launch();
      browserCtx = await browser.newContext();
    }
    const page = await browserCtx.newPage();
    try {
      await page.goto(url, { timeout: 25_000, waitUntil: 'domcontentloaded' });
      const txt = await page.evaluate(() => document.body?.innerText ?? '');
      return JSON.parse(txt);
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    const msg = String(e?.message || e);
    console.log(`    浏览器抓取失败: ${msg.slice(0, 80)}`);
    if (/Cannot find|MODULE_NOT_FOUND/i.test(msg)) browserBroken = true;
    return null;
  }
}
async function closeBrowser() {
  if (!browserCtx) return;
  try {
    await browserCtx.browser()?.close();
  } catch {}
  browserCtx = null;
}

async function fetchKlines(secid, { fqt = 2, retries = 2, backoffMs = 20_000 } = {}) {
  const url = `${API}?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=${fqt}&beg=19700101&end=20991231`;
  for (let i = 0; i <= retries; i++) {
    // 同一轮次内 curl 失败立即换浏览器通道, 不先耗尽退避(WAF 生效期 curl 必失败,
    // 先退避再回退会让每个请求白等数分钟)
    let j = curlJson(url);
    let via = 'curl';
    if (j === null) {
      j = await browserJson(url);
      via = 'browser';
    }
    const k = j?.data?.klines;
    if (Array.isArray(k) && k.length) {
      if (via === 'browser') console.log('    (curl 被 WAF 拦截, 走浏览器通道)');
      return j.data;
    }
    // 确定性失败: 拿到合法 JSON 但无 K 线(secid 不存在/无该口径数据) — 重试无意义,
    // 直接返回空让上层换下一个 secid; 仅请求层失败(j===null, WAF/网络)才退避重试
    if (j !== null) return j.data ?? { klines: [] };
    console.log(`    重试 ${i + 1}/${retries + 1} (curl+浏览器均失败)...`);
    if (i < retries) await sleep(backoffMs * (i + 1));
  }
  return null;
}

// ── Yahoo v8 chart 通道(2026-10 扩容标的) ──
// period1=0&period2=远期的显式窗口才有全量日线(range=max 未认证会被降采样成月线, 实测)。
// adjclose = 红利复投总回报序列(锚定当前真实价, 任意两期比值 = 总回报倍数, 与东财后复权
// 同比值口径); quote.close = 交易所不复权收盘(→ rawCloses)。timestamp → UTC 日期: 各交易所
// 收盘时刻换算 UTC 后仍落在同一自然日(美东 16:00=UTC 20/21 时, A股 15:00=UTC 07 时,
// 港股 16:00=UTC 08 时), 实测首末日期与交易所日历吻合。
const YAHOO_API = 'https://query1.finance.yahoo.com/v8/finance/chart';
async function fetchYahooDaily(symbol, { retries = 2, backoffMs = 10_000 } = {}) {
  const url = `${YAHOO_API}/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=1d&events=div%2Csplit`;
  for (let i = 0; i <= retries; i++) {
    const j = curlJson(url, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', timeout: 30 });
    const res = j?.chart?.result?.[0];
    const ts = res?.timestamp;
    const q = res?.indicators?.quote?.[0];
    const adj = res?.indicators?.adjclose?.[0]?.adjclose;
    if (Array.isArray(ts) && ts.length && q && Array.isArray(adj)) {
      const dates = [];
      const closes = []; // adjclose: 总回报口径
      const raws = []; // quote.close: 不复权真实价
      for (let idx = 0; idx < ts.length; idx++) {
        const c = q.close?.[idx];
        const a = adj[idx];
        if (c == null || a == null || !Number.isFinite(c) || !Number.isFinite(a) || c <= 0 || a <= 0) continue;
        dates.push(new Date(ts[idx] * 1000).toISOString().slice(0, 10).replace(/-/g, ''));
        closes.push(Math.round(a * 10000) / 10000);
        raws.push(Math.round(c * 10000) / 10000);
      }
      return { name: res.meta?.shortName || symbol, dates, closes, raws };
    }
    console.log(`    Yahoo ${symbol} 第 ${i + 1}/${retries + 1} 次尝试失败${i < retries ? `, ${backoffMs * (i + 1)}ms 后重试` : ''}`);
    if (i < retries) await sleep(backoffMs * (i + 1));
  }
  return null;
}

/** Bitstamp 日K 前向分页抓取(不带 end: start+limit 稳定返回自 start 起的下一页;
 *  带远端 end 时窗口语义不稳定, 时而返回末尾 1000 根)。
 *  返回 { rows, complete }: complete 仅在分页到达最新(now-2d 容忍窗)时为 true;
 *  请求失败(重试后)、数据洞、窗口未推进、页数耗尽均为 false, 调用方不得写盘 */
async function fetchCryptoDaily(pair, startTs) {
  const DAY = 86_400;
  const now = Math.floor(Date.now() / 1000);
  const rows = new Map();
  let from = startTs; // 该 pair 的 Bitstamp 交易起点
  let complete = false;
  for (let page = 0; page < 12; page++) {
    const url = `https://www.bitstamp.net/api/v2/ohlc/${pair}/?step=86400&limit=1000&start=${from}`;
    // 单页最多 4 次尝试; curlJson 返回 null = 请求失败(可重试), 合法响应但 ohlc 空 = 数据洞(不重试)
    let j = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      j = curlJson(url, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
      if (j !== null) break;
      if (attempt < 3) {
        console.log(`    第 ${page + 1} 页请求失败, 重试 ${attempt + 1}/4...`);
        await sleep(GAP_MS);
      }
    }
    const ohlc = j?.data?.ohlc;
    if (j === null || !Array.isArray(ohlc) || !ohlc.length) break; // 请求失败(重试后)或数据洞 → 不完整
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
    if (lastTs >= now - 2 * DAY) {
      complete = true; // 已到最新(当日K未收, 容忍2天)
      break;
    }
    from = lastTs + DAY;
    await sleep(GAP_MS);
  }
  return { rows, complete };
}

const wanted = process.argv.slice(2);
const explicit = wanted.length > 0;

// 目录解析置于防呆之前: 键集直接来自 lib/stocks.ts(仅只读解析, 不触发任何数据写入)
const ALL = parseStocks();

// 防呆: 拼错的 key 会让 targets 为空并静默重写 ticker.json/index.json 后以"完成: 0/0"收尾。
// 属误操作应立即退出且不触发任何文件写入 — 故置于全部 mkdir/读写之前。
const known = new Set(ALL.map((m) => m.key));
const unknown = wanted.filter((k) => !known.has(k));
if (unknown.length) {
  console.error(`✘ 未知标的 key: ${unknown.join(', ')}`);
  console.error(`  可用: ${[...known].join(', ')}`);
  process.exit(1);
}
// crypto 通道 epoch 必填: 缺失会让分页起点变 NaN, 静默抓空
for (const m of ALL) {
  if (channelOf(m) === 'crypto' && !Number.isFinite(FETCH_HINTS[m.key]?.epoch)) {
    console.error(`✘ ${m.key}: Bitstamp 通道需在 FETCH_HINTS 配置 epoch(交易起点秒)`);
    process.exit(1);
  }
}

// ── 增量选标: 显式 key → 强制抓; 缺省只抓「缺文件」+「陈旧限量刷新(最旧优先)」 ──
// 陈旧阈值默认 90 天(宽于 check-data 的 10 天诊断口径: 门禁轮只保证不缺, 追新鲜靠多轮);
// 每轮限量防超时(东财通道 WAF 期单标的可耗数分钟, 全量陈旧刷新会撞门禁 900s 窗口)
const STALE_DAYS = Number(process.env.FETCH_STALE_DAYS ?? 90);
const REFRESH_MAX = Number(process.env.FETCH_REFRESH_MAX ?? 4);
const BUDGET_MS = Number(process.env.FETCH_BUDGET_S ?? 480) * 1000;
const t0 = Date.now();

// 全局时间预算: 耗尽后剩余标的留待下轮(不计失败)。显式 key 模式是维护操作, 不受预算限制
const overBudget = () => !explicit && Date.now() - t0 > BUDGET_MS;

const ymdAge = (ymd) =>
  /^\d{8}$/.test(ymd)
    ? Math.floor((Date.now() - Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))) / 86_400_000)
    : Infinity;

const outDir = path.resolve(import.meta.dirname, '../public/data');
await mkdir(outDir, { recursive: true });

async function lastOf(key) {
  try {
    const j = JSON.parse(await readFile(path.join(outDir, `${key}.json`), 'utf8'));
    return typeof j.last === 'string' && /^\d{8}$/.test(j.last) ? j.last : null; // 字段异常视同缺失
  } catch {
    return null; // 文件缺失
  }
}

const byChannel = (ch) => ALL.filter((m) => channelOf(m) === ch);
let emTargets, yahooTargets, cryptoTargets;
// 陈旧刷新类标的(增量模式): 抓取失败仅告警不计失败 — 旧数据仍在, check-data 的陈旧
// 诊断(⚠)不阻断; 只有「缺文件」与显式维护模式才 exit 1。防止 WAF 期陈旧刷新把门禁轮打挂
let refreshSet = new Set();
if (explicit) {
  emTargets = byChannel('em').filter((m) => wanted.includes(m.key));
  yahooTargets = byChannel('yahoo').filter((m) => wanted.includes(m.key));
  cryptoTargets = byChannel('crypto').filter((m) => wanted.includes(m.key));
} else {
  const stock = [];
  for (const [src, rows] of [['em', byChannel('em')], ['yahoo', byChannel('yahoo')], ['crypto', byChannel('crypto')]]) {
    for (const r of rows) stock.push({ src, key: r.key, last: await lastOf(r.key) });
  }
  const missing = stock.filter((x) => x.last === null);
  const stale = stock
    .filter((x) => x.last !== null && ymdAge(x.last) > STALE_DAYS)
    .sort((a, b) => ymdAge(b.last) - ymdAge(a.last)); // 最旧优先
  const refresh = stale.slice(0, REFRESH_MAX);
  const deferred = stale.slice(REFRESH_MAX);
  if (deferred.length) console.log(`↷ ${deferred.length} 个陈旧(>${STALE_DAYS}天)标的留待后续轮次(每轮限量 ${REFRESH_MAX}): ${deferred.map((x) => x.key).join(', ')}`);
  const fresh = stock.length - missing.length - stale.length;
  if (fresh > 0) console.log(`↷ ${fresh} 个标的数据新鲜(≤${STALE_DAYS}天), 跳过`);
  if (missing.length) console.log(`△ 缺文件 ${missing.length} 个: ${missing.map((x) => x.key).join(', ')}`);
  const pick = new Set([...missing, ...refresh].map((x) => `${x.src}:${x.key}`));
  refreshSet = new Set(refresh.map((x) => `${x.src}:${x.key}`));
  emTargets = byChannel('em').filter((m) => pick.has(`em:${m.key}`));
  yahooTargets = byChannel('yahoo').filter((m) => pick.has(`yahoo:${m.key}`));
  cryptoTargets = byChannel('crypto').filter((m) => pick.has(`crypto:${m.key}`));
}
const totalCount = emTargets.length + yahooTargets.length + cryptoTargets.length;
let okCount = 0;
const softFail = (src, key) => !explicit && refreshSet.has(`${src}:${key}`);

// manifest 与已有 index.json 合并: 部分抓取时不丢失未抓取标的的条目(sitemap 依赖);
// 合并后按目录键集 prune — 标的下线后旧条目即清除(只增不删会留幽灵 sitemap 条目)
const manifest = {};
try {
  Object.assign(manifest, JSON.parse(await readFile(path.join(outDir, 'index.json'), 'utf8')));
} catch {
  /* 首次抓取无 index.json */
}
const liveKeys = new Set(ALL.map((m) => m.key));
for (const k of Object.keys(manifest)) {
  if (!liveKeys.has(k)) delete manifest[k];
}
let failures = 0;

for (const meta of emTargets) {
  const { key } = meta;
  const hint = FETCH_HINTS[key] ?? {};
  const secids = hint.alt ?? [meta.secid]; // 缺省单候选 = 目录首选 secid
  const minPoints = hint.minPoints ?? 300;
  if (overBudget()) {
    console.log(`⏱ 时间预算(${BUDGET_MS / 1000}s)耗尽, ${key} 及后续东财标的留待下轮`);
    break;
  }
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
    // 失败即换下一个 secid, 不写盘: 缺 rawCloses 时展示端回退后复权 closes 充当真实价,
    // 分红标的差百倍(如 MSFT 后复权 153365 vs 真实 496), 静默落盘属数据事故
    if (!raw) {
      console.error(`  ✘ ${key} 不复权价(fqt=0)抓取失败 — 缺 rawCloses 会把后复权价当真实价展示, 换下一个 secid`);
      continue;
    }
    const map = new Map();
    for (const row of raw.klines) {
      const [d, c] = row.split(',');
      map.set(d.replace(/-/g, ''), Number(c));
    }
    // 与后复权序列按日期对齐; 完全一致(无分红/未除权)时省略该字段, 数据文件体积约减半; 展示端回退 closes
    const aligned = dates.map((d) => map.get(d) ?? null);
    if (aligned.some((v, i) => v !== closes[i])) payload.rawCloses = aligned;
    await writeFile(path.join(outDir, `${key}.json`), JSON.stringify(payload));
    manifest[key] = { first: payload.first, last: payload.last, points: payload.points };
    console.log(`  ✔ ${data.name} ${dates[0]} → ${dates[dates.length - 1]}  ${dates.length} 点`);
    done = true;
    okCount++;
    break;
  }
  if (!done) {
    if (softFail('em', key)) console.warn(`  ⚠ ${key} 刷新失败(陈旧数据保留), 留待下轮`);
    else {
      failures++;
      console.error(`  ✘✘ ${key} 全部 secid 失败`);
    }
  }
}

for (const meta of yahooTargets) {
  const { key, secid: symbol } = meta; // Yahoo 通道: 目录 secid 即 Yahoo symbol
  const minPoints = FETCH_HINTS[key]?.minPoints ?? 300;
  if (overBudget()) {
    console.log(`⏱ 时间预算(${BUDGET_MS / 1000}s)耗尽, ${key} 及后续 Yahoo 标的留待下轮`);
    break;
  }
  console.log(`→ ${key} (Yahoo ${symbol})`);
  const d = await fetchYahooDaily(symbol);
  await sleep(GAP_MS);
  if (!d || d.dates.length < minPoints) {
    if (softFail('yahoo', key)) console.warn(`  ⚠ ${key} 刷新失败(陈旧数据保留), 留待下轮`);
    else {
      failures++;
      console.error(`  ✘✘ ${key} ${d ? `仅 ${d.dates.length} 点(< ${minPoints})` : '无响应'}`);
    }
    continue;
  }
  const payload = {
    symbol: key,
    secid: symbol,
    emName: d.name,
    first: d.dates[0],
    last: d.dates[d.dates.length - 1],
    points: d.dates.length,
    dates: d.dates,
    // adjclose 比值 = 红利复投总回报, 口径同东财后复权(绝对值锚定当前价, 引擎只用比值)
    closes: d.closes,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
  // quote.close = 不复权真实价; 与 closes 完全一致(无分红/未除权)时省略, 展示端回退 closes
  if (d.raws.some((v, i) => v !== d.closes[i])) payload.rawCloses = d.raws;
  await writeFile(path.join(outDir, `${key}.json`), JSON.stringify(payload));
  manifest[key] = { first: payload.first, last: payload.last, points: payload.points };
  okCount++;
  console.log(`  ✔ ${d.name} ${d.dates[0]} → ${d.dates[d.dates.length - 1]}  ${d.dates.length} 点`);
}

for (const meta of cryptoTargets) {
  const { key } = meta;
  const pair = meta.secid.slice('bitstamp:'.length); // 'bitstamp:ethusd' → 'ethusd'
  const startTs = FETCH_HINTS[key].epoch; // 防呆段已校验必填
  if (overBudget()) {
    console.log(`⏱ 时间预算(${BUDGET_MS / 1000}s)耗尽, ${key} 及后续 crypto 标的留待下轮`);
    break;
  }
  console.log(`→ ${key} (Bitstamp)`);
  const { rows, complete } = await fetchCryptoDaily(pair, startTs);
  // 动态下限: 自该 pair Bitstamp 起点起 90% 天数, 随历史自然收紧(btc 今天≈4978, 与原 5000 平滑衔接)
  const minRows = Math.floor(((Date.now() / 1000 - startTs) / 86_400) * 0.9);
  if (!complete) {
    if (softFail('crypto', key)) console.warn(`  ⚠ ${key} 刷新失败(陈旧数据保留), 留待下轮`);
    else {
      failures++;
      console.error(`  ✘✘ ${key} 分页未到达最新，放弃更新`);
    }
  } else if (rows.size < minRows) {
    if (softFail('crypto', key)) console.warn(`  ⚠ ${key} 仅 ${rows.size} 根(< ${minRows}, 陈旧数据保留), 留待下轮`);
    else {
      failures++;
      console.error(`  ✘✘ ${key} 仅 ${rows.size} 根(< ${minRows}), 放弃更新`);
    }
  } else {
    const keys = [...rows.keys()].sort((a, b) => a - b);
    const ymd = (ts) => new Date(ts * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const dates = keys.map(ymd);
    const closes = keys.map((t) => Math.round(rows.get(t) * 100) / 100);
    const payload = {
      symbol: key,
      secid: meta.secid,
      emName: `${meta.symbol}/USD`,
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
    okCount++;
    console.log(`  ✔ ${meta.symbol}/USD ${dates[0]} → ${dates[dates.length - 1]}  ${dates.length} 点`);
  }
}

// ── 生成 ticker.json: 汇总全部已有数据文件的最新真实价与日涨跌 ──
// 结构 { asOf, items }: JSON 数组携带不了顶层属性, asOf(全部落盘文件 last 的最大值)
// 供走马灯做陈旧降级(>14 天 Live → 数据截至); items 顺序/名称/币种随 STOCKS 目录单一来源
const tickerItems = [];
let tickerAsOf = '';
for (const meta of ALL) {
  let j;
  try {
    j = JSON.parse(await readFile(path.join(outDir, `${meta.key}.json`), 'utf8'));
  } catch {
    continue;
  }
  if (typeof j.last === 'string' && /^\d{8}$/.test(j.last) && j.last > tickerAsOf) tickerAsOf = j.last;
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
  tickerItems.push({
    key: meta.key,
    zh: meta.zh,
    sym: meta.symbol,
    // '' = 指数点位(无货币符号); 提示表覆盖(spx/djia/qqq)优先, 其余随目录 ccy, 缺省 USD
    ccy: FETCH_HINTS[meta.key]?.tickerCcy ?? meta.ccy ?? 'USD',
    price: Math.round(last * 100) / 100,
    chg: Math.round((last / prev - 1) * 10000) / 100,
  });
}
if (tickerItems.length) {
  await writeFile(path.join(outDir, 'ticker.json'), JSON.stringify({ asOf: tickerAsOf, items: tickerItems }));
  console.log(`ticker.json: ${tickerItems.length} 项, asOf=${tickerAsOf}`);
}

await writeFile(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));
await closeBrowser();
console.log(`\n完成: ${okCount}/${totalCount}${failures ? `, 失败: ${failures}` : okCount < totalCount ? ', 其余留待下轮' : ''}${explicit ? '' : ` (增量模式, 预算 ${Math.round((Date.now() - t0) / 1000)}s/${BUDGET_MS / 1000}s)`}`);
process.exitCode = failures ? 1 : 0;
