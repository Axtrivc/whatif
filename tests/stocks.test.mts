/**
 * 标的目录层单元测试 — 锁定「选年份 → 回放起点」唯一桥 startIndexForYear
 * (-1 哨兵是 ReplayClient 回退逻辑的依赖; clamp 行为是回放起点下界) 与
 * rawClosesOf 的缺省回退(与 closes 一致的标的省略 rawCloses 字段);
 * 以及 STOCKS 清单完整性/去重、与 public/data 数据文件的双向对应关系
 * (含 index.json / ticker.json 交叉核对) 和 loadSeries 读取语义
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSeries,
  rawClosesOf,
  startIndexForYear,
  STOCKS,
  STOCK_MAP,
  type Series,
} from '../lib/stocks.ts';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

/** 进程内单次解析: 各用例复用同一份 Series(与 loadSeries 的只读一次语义对齐) */
const fileCache = new Map<string, Series>();
function readSeries(key: string): Series {
  let j = fileCache.get(key);
  if (!j) {
    j = JSON.parse(readFileSync(join(DATA_DIR, `${key}.json`), 'utf8')) as Series;
    fileCache.set(key, j);
  }
  return j;
}

/**
 * 已知 secid 分歧表: key → 数据文件实际落盘的 secid。
 * 分歧来源: fetch-data CATALOG 的候选序与 lib/stocks.ts 首选不同
 * (orcl: 东财仅 2013 转板 NYSE 起有数据, 抓取实际命中 106.ORCL)。
 * 仿 check-data.mjs 的 KNOWN_GAPS: 表外分歧直接失败; 目录修复后删条目恢复严格相等。
 */
const KNOWN_SECID_DIVERGENCE: Record<string, string> = { orcl: '106.ORCL' };

/** 配齐 Series 必要字段的最小对象(可选字段 emName/rawCloses 省略) */
function miniSeries(dates: string[], closes: number[]): Series {
  return {
    symbol: 'TEST',
    secid: '105.TEST',
    first: dates[0],
    last: dates[dates.length - 1],
    points: dates.length,
    dates,
    closes,
    fetchedAt: '20260101',
  };
}

test('startIndexForYear: 该年首日 / 早于数据 clamp / 晚于数据哨兵 -1', () => {
  const s = miniSeries(['20191231', '20200102', '20200601'], [10, 11, 12]);
  assert.equal(startIndexForYear(s, 2020), 1); // 2020 首个交易日 20200102
  assert.equal(startIndexForYear(s, 2018), 0); // 早于数据 → clamp 到首日
  assert.equal(startIndexForYear(s, 2021), -1); // 晚于数据 → -1 哨兵(回放回退)
});

test('rawClosesOf: rawCloses 缺省回退 closes, 有则原样返回', () => {
  const s = miniSeries(['20200102', '20200601'], [10.5, 11.5]);
  assert.equal(rawClosesOf(s), s.closes); // 省略 rawCloses(与后复权一致) → 回退 closes
  const withRaw: Series = { ...s, rawCloses: [9.9, 10.9] };
  assert.deepEqual(rawClosesOf(withRaw), [9.9, 10.9]); // 显式提供 → 原样返回
});

test('STOCKS: 清单规模/首尾锚点 + key·symbol·secid 三重去重与字段完备', () => {
  assert.equal(STOCKS.length, 25); // 增删标的时同步此数(check-data 输出同源计数)
  assert.equal(STOCKS[0].key, 'msft'); // 展示顺序锚点: ticker.json/HomePicker 均按此序
  assert.equal(STOCKS[STOCKS.length - 1].key, 'btc');
  const keys = new Set<string>();
  const symbols = new Set<string>();
  const secids = new Set<string>();
  for (const s of STOCKS) {
    assert.match(s.key, /^[a-z0-9-]+$/, `key 非法 slug: ${s.key}`); // 与 check-data.mjs 解析正则一致
    for (const f of ['symbol', 'zh', 'en', 'tagline', 'secid'] as const) {
      assert.ok(typeof s[f] === 'string' && s[f].length > 0, `${s.key}.${f} 为空`);
    }
    keys.add(s.key);
    symbols.add(s.symbol);
    secids.add(s.secid);
  }
  assert.equal(keys.size, STOCKS.length, 'key 重复');
  assert.equal(symbols.size, STOCKS.length, 'symbol 重复');
  assert.equal(secids.size, STOCKS.length, 'secid 重复');
  // 市场事实: 港股 HKD / A 股 CNY 计价, 漏配 ccy 会把真实价显示成 $
  for (const s of STOCKS) {
    if (s.market === 'hk') assert.equal(s.ccy, 'HKD', `${s.key} 港股应为 HKD`);
    if (s.market === 'ashare') assert.equal(s.ccy, 'CNY', `${s.key} A 股应为 CNY`);
  }
  // STOCK_MAP 与清单一一对应: 重复 key 会被 fromEntries 静默吞并
  assert.equal(Object.keys(STOCK_MAP).length, STOCKS.length, 'STOCK_MAP 与 STOCKS 数量不一致');
  for (const s of STOCKS) assert.equal(STOCK_MAP[s.key], s, `STOCK_MAP[${s.key}] 非同一条目`);
});

test('public/data: STOCKS 键与 *.json 文件双向对应, 无孤儿 JSON', () => {
  const expected = new Set(STOCKS.map((s) => `${s.key}.json`));
  expected.add('index.json'); // sitemap lastModified 清单(fetch-data 维护)
  expected.add('ticker.json'); // 首页走马灯(fetch-data 生成)
  const actual = new Set(readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')));
  for (const s of STOCKS) {
    assert.ok(actual.has(`${s.key}.json`), `缺数据文件 public/data/${s.key}.json`);
  }
  // 反向: 标的下线但文件残留 → 走马灯/sitemap 与目录静默失同步(check-data 只查正向)
  const orphans = [...actual].filter((f) => !expected.has(f));
  assert.deepEqual(orphans, [], 'public/data 存在目录外孤儿 JSON');
});

test('数据文件自洽: symbol=key/secid 对应, first·last·points 与 dates·closes·rawCloses 对齐', () => {
  for (const s of STOCKS) {
    const j = readSeries(s.key);
    assert.equal(j.symbol, s.key, `${s.key}.json 的 symbol 字段应为 key(非展示代码)`);
    const known = KNOWN_SECID_DIVERGENCE[s.key];
    if (known === undefined) {
      assert.equal(j.secid, s.secid, `${s.key}.json secid 与目录不一致`);
    } else {
      assert.equal(j.secid, known, `${s.key}.json secid 应为已知分歧值`);
      assert.notEqual(j.secid, s.secid, `${s.key} 分歧已修复: 请删除 KNOWN_SECID_DIVERGENCE 条目`);
    }
    assert.ok(Array.isArray(j.dates) && j.dates.length > 0, `${s.key}: dates 空`);
    assert.equal(j.dates.length, j.closes.length, `${s.key}: dates/closes 不等长`);
    assert.equal(j.points, j.dates.length, `${s.key}: points ≠ 实际点数`);
    assert.match(j.first, /^\d{8}$/, `${s.key}: first 非 YYYYMMDD`);
    assert.match(j.last, /^\d{8}$/, `${s.key}: last 非 YYYYMMDD`);
    assert.equal(j.first, j.dates[0], `${s.key}: first ≠ dates[0]`);
    assert.equal(j.last, j.dates[j.dates.length - 1], `${s.key}: last ≠ 末位日期`);
    for (let i = 0; i < j.dates.length; i++) {
      assert.ok(j.closes[i] > 0, `${s.key}: closes[${i}]=${j.closes[i]} 非正数`);
      if (i > 0) assert.ok(j.dates[i] > j.dates[i - 1], `${s.key}: dates[${i}] 非严格升序`); // YYYYMMDD 定宽, 字典序=时间序
    }
    const rc = rawClosesOf(j);
    assert.equal(rc.length, j.dates.length, `${s.key}: rawCloses 与 dates 不对齐`);
    let nulls = 0;
    for (const v of rc) {
      if (v === null) nulls++;
      else assert.ok(Number.isFinite(v), `${s.key}: rawCloses 含非有限数值`);
    }
    assert.ok(nulls < rc.length, `${s.key}: rawCloses 全为 null`);
    // 真实数据上的「选年份→起点」边界: 起始年命中首日, 远超末端 -1 哨兵
    assert.equal(startIndexForYear(j, Number(j.first.slice(0, 4))), 0, `${s.key}: 起始年应 clamp 到 0`);
    assert.equal(startIndexForYear(j, 9999), -1, `${s.key}: 远超数据末端应返回 -1`);
  }
});

test('index.json: 键集与 STOCKS 一致, first/last/points 与各数据文件逐一相符(sitemap 依赖)', () => {
  type IdxEntry = { first: string; last: string; points: number };
  const idx = JSON.parse(readFileSync(join(DATA_DIR, 'index.json'), 'utf8')) as Record<string, IdxEntry>;
  assert.deepEqual(
    Object.keys(idx).sort(),
    STOCKS.map((s) => s.key).sort(),
    'index.json 键集与 STOCKS 不一致(fetch-data 合并旧 manifest 会残留已下线标的)'
  );
  for (const s of STOCKS) {
    const e = idx[s.key];
    const j = readSeries(s.key);
    assert.equal(e.first, j.first, `${s.key}: index.first ≠ 数据文件 first`);
    assert.equal(e.last, j.last, `${s.key}: index.last ≠ 数据文件 last`);
    assert.equal(e.points, j.points, `${s.key}: index.points ≠ 数据文件 points`);
  }
});

test('ticker.json: 顺序/中文名/代码/币种随目录, price·chg 可由数据文件末两个有效真实价复算', () => {
  type Tick = { key: string; zh: string; sym: string; ccy: string; price: number; chg: number };
  const ticker = JSON.parse(readFileSync(join(DATA_DIR, 'ticker.json'), 'utf8')) as Tick[];
  assert.deepEqual(ticker.map((t) => t.key), STOCKS.map((s) => s.key), 'ticker.json 顺序应与 STOCKS 展示顺序逐位相同');
  for (const [i, s] of STOCKS.entries()) {
    const t = ticker[i];
    assert.equal(t.zh, s.zh, `${s.key}: ticker.zh 与目录不一致`);
    assert.equal(t.sym, s.symbol, `${s.key}: ticker.sym 与目录不一致`);
    // SPX 为点位报价无货币符号(TickerTape '' 语义), 其余缺省 USD
    assert.equal(t.ccy, s.ccy ?? (s.symbol === 'SPX' ? '' : 'USD'), `${s.key}: ticker.ccy 口径不符`);
    // 复算 fetch-data 的「最新真实价 + 日涨跌」: 倒序跳过 null 取末两个有效 rawCloses
    const rc = rawClosesOf(readSeries(s.key));
    let last: number | null = null;
    let prev: number | null = null;
    for (let k = rc.length - 1; k >= 0; k--) {
      const v = rc[k];
      if (v === null || !Number.isFinite(v)) continue;
      if (last === null) {
        last = v;
        continue;
      }
      prev = v;
      break;
    }
    assert.ok(last !== null && prev !== null && prev > 0, `${s.key}: 数据文件尾部无两个有效真实价`);
    assert.equal(t.price, Math.round(last * 100) / 100, `${s.key}: ticker.price 与数据文件不符(文件更新未重生成 ticker)`);
    assert.equal(t.chg, Math.round((last / prev - 1) * 10000) / 100, `${s.key}: ticker.chg 与数据文件不符`);
  }
});

test('loadSeries: 与磁盘内容逐字段一致 / 缺失文件 null / 同 key 进程内缓存复用', async () => {
  const got = await loadSeries('msft');
  assert.ok(got, 'msft 应有数据文件');
  assert.equal(got.symbol, 'msft');
  assert.equal(got.points, got.dates.length);
  assert.deepEqual(got, readSeries('msft'), 'loadSeries 应返回 public/data/msft.json 原样内容');
  const again = await loadSeries('msft');
  assert.equal(again, got, '同一文件只读一次: 二次调用应命中缓存返回同一引用');
  assert.equal(await loadSeries('zz-not-a-stock'), null, '文件不存在应返回 null');
  assert.equal(await loadSeries('zz-not-a-stock'), null, '缺失键的 null 亦被缓存(稳定缺失语义)');
});
