/**
 * 构建前数据完整性检查 — public/data/{key}.json
 *
 * 校验 lib/stocks.ts STOCKS 全部 key 都有对应数据文件, 且字段齐全:
 *   dates/closes 等长、非空、日期升序、收盘价为正。
 * 任一不通过即 exit 1, 阻止带病构建部署到线上。
 * 日期缺口(相邻日期差 >60 天)默认即阻断: 历史洞是稳定事实, 豁免表 KNOWN_GAPS 之外
 * 的新洞必是抓取事故; 表内已知洞豁免(仅告警)。
 * 数据陈旧属非阻断诊断: 默认仅告警, CHECK_DATA_STRICT=1 时计为失败(供 CI 选择性启用)。
 *
 * 用法: node scripts/check-data.mjs   (npm run build 的 prebuild 钩子)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 严格模式: CHECK_DATA_STRICT=1 时陈旧类诊断计为失败; 默认仅告警不阻断构建
// (缺口类不受此开关影响, 默认就是硬门禁, 见下方 KNOWN_GAPS)
const STRICT = process.env.CHECK_DATA_STRICT === '1';

// 已知历史缺口豁免表: key → [缺口起始日, 缺口结束日] 边界对(精确匹配)。
// 边界对来自数据源真实历史洞(实测扫描全量 >60 天缺口仅此两处), 属稳定事实, 豁免不计失败;
// 任何豁免表之外的新 >60 天缺口 → 直接 exit 1 阻断构建。
const KNOWN_GAPS = { tsm: [['20041231', '20070319']], spx: [['19860910', '19870406']] };

/** YYYYMMDD → UTC 毫秒(用 Date.UTC 解析, 避免本地时区漂移) */
const ymdToUtc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));

/** 陈旧类非阻断诊断: 默认 warn; 严格模式下计为失败 */
function warnDiag(msg) {
  if (STRICT) {
    console.error(`✘ ${msg}`);
    failures++;
  } else {
    console.warn(`⚠ ${msg}`);
  }
}

/** 从 lib/stocks.ts 解析全部 key(与 submit-urls.mjs 同一来源, 免维护清单) */
function stockKeys() {
  const src = readFileSync(join(ROOT, 'lib', 'stocks.ts'), 'utf8');
  const out = [];
  // 字符类 [a-z0-9-]: 兼容未来 brk-b/csi300 类 key; 引号组 ['"] 把双引号风格纳入
  // (双引号 key 曾静默逃过下面的计数核对); 交叉核对兜底任何正则未覆盖的形态
  const re = /key:\s*['"]([a-z0-9-]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  // 交叉核对(去重前计数): 任何 `key: '...'` / `key: "..."` 出现却未被上面正则匹配
  // (如大写/下划线) → 清单静默缩水, 检查形同虚设, 直接硬失败
  const total = (src.match(/\bkey:\s*['"]/g) || []).length;
  if (total !== out.length) {
    console.error(`✘ lib/stocks.ts 解析异常: key 出现 ${total} 次但仅匹配 ${out.length} 个`);
    process.exit(1);
  }
  return [...new Set(out)];
}

let failures = 0;
let maxLast = ''; // 各数据文件 last(YYYYMMDD)的最大值 — ticker.asOf 核对口径
const KEYS = stockKeys();
for (const key of KEYS) {
  const file = join(ROOT, 'public', 'data', `${key}.json`);
  if (!existsSync(file)) {
    console.error(`✘ ${key}: 缺文件 public/data/${key}.json`);
    failures++;
    continue;
  }
  let j;
  try {
    j = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✘ ${key}: JSON 解析失败 — ${e.message}`);
    failures++;
    continue;
  }
  const { dates, closes, points } = j;
  if (!Array.isArray(dates) || !Array.isArray(closes) || !dates.length) {
    console.error(`✘ ${key}: dates/closes 缺失或为空`);
    failures++;
    continue;
  }
  if (dates.length !== closes.length) {
    console.error(`✘ ${key}: dates(${dates.length}) 与 closes(${closes.length}) 长度不一致`);
    failures++;
    continue;
  }
  if (points != null && points !== dates.length) {
    console.error(`✘ ${key}: points 字段(${points}) ≠ 实际点数(${dates.length})`);
    failures++;
    continue;
  }
  // rawCloses(不复权展示价)与 dates 对齐校验: 长度必须一致, 错位会错标"买入价/现价"
  if (j.rawCloses != null) {
    if (!Array.isArray(j.rawCloses) || j.rawCloses.length !== dates.length) {
      console.error(
        `✘ ${key}: rawCloses(${Array.isArray(j.rawCloses) ? j.rawCloses.length : '非数组'}) 与 dates(${dates.length}) 不对齐`
      );
      failures++;
      continue;
    }
    const nulls = j.rawCloses.filter((v) => v == null || !Number.isFinite(v)).length;
    if (nulls === dates.length) {
      console.error(`✘ ${key}: rawCloses 全部为空值`);
      failures++;
      continue;
    }
  }
  // 抽样校验日期升序 + 收盘价为正(全扫太贵, 头尾 + 中段各取一点)
  const probe = [0, Math.floor(dates.length / 2), dates.length - 1];
  let bad = false;
  for (let w = 0; w < probe.length - 1; w++) {
    if (dates[probe[w]] >= dates[probe[w + 1]]) {
      console.error(`✘ ${key}: 日期非严格升序 (${dates[probe[w]]} → ${dates[probe[w + 1]]})`);
      bad = true;
    }
    if (!(closes[probe[w]] > 0) || !(closes[probe[w + 1]] > 0)) {
      console.error(`✘ ${key}: 收盘价非正数`);
      bad = true;
    }
  }
  if (bad) failures++;

  // ── 陈旧诊断(默认仅告警, CHECK_DATA_STRICT=1 时计失败) + 缺口硬门禁(带 KNOWN_GAPS 豁免) ──
  // 新鲜度: last(YYYYMMDD) 距今 >10 自然日 → 数据陈旧
  if (typeof j.last === 'string' && /^\d{8}$/.test(j.last)) {
    if (j.last > maxLast) maxLast = j.last;
    const ageDays = Math.floor((Date.now() - ymdToUtc(j.last)) / 86_400_000);
    if (ageDays > 10) warnDiag(`${key}: 数据陈旧 (last=${j.last}, 距今 ${ageDays} 天)，建议 npm run fetch-data`);
  }
  // 全量缺口扫描: 相邻日期 UTC 日历差 >60 天(60 放行真实停牌旺季如茅台春节 53 天, 抓出数据源历史洞)。
  // 缺口默认就是硬门禁(无论 STRICT 与否): 命中 KNOWN_GAPS[key] 边界对 → 豁免仅告警; 否则计失败。
  for (let i = 0; i < dates.length - 1; i++) {
    const gapDays = (ymdToUtc(dates[i + 1]) - ymdToUtc(dates[i])) / 86_400_000;
    // 负差=乱序, 0=重复日期: 全量扫描硬门禁(三点抽样测不出的中段乱序也在此拦截)
    if (gapDays <= 0) {
      console.error(`✘ ${key}: 日期乱序或重复 (${dates[i]} → ${dates[i + 1]})`);
      failures++;
      continue;
    }
    if (gapDays <= 60) continue;
    const exempt = (KNOWN_GAPS[key] || []).some(([a, b]) => dates[i] === a && dates[i + 1] === b);
    if (exempt) {
      console.warn(`⚠ ${key}: 已知缺口(豁免) ${dates[i]} → ${dates[i + 1]} (${gapDays} 天)`);
    } else {
      console.error(`✘ ${key}: 日期缺口 ${dates[i]} → ${dates[i + 1]} (${gapDays} 天)`);
      failures++;
    }
  }
}

// ticker.json(走马灯数据源; 缺失不致命, 仅告警)。存在时校验 { asOf, items } 结构,
// 且 asOf = 各数据文件 last 最大值 — 数据文件更新后未重生成 ticker 时在此拦截
{
  const tickerFile = join(ROOT, 'public', 'data', 'ticker.json');
  if (!existsSync(tickerFile)) {
    console.warn('⚠ ticker.json 缺失, 首页走马灯将为空');
  } else {
    let tj = null;
    try {
      tj = JSON.parse(readFileSync(tickerFile, 'utf8'));
    } catch (e) {
      console.error(`✘ ticker.json JSON 解析失败 — ${e.message}`);
      failures++;
    }
    if (tj !== null) {
      if (typeof tj.asOf !== 'string' || !/^\d{8}$/.test(tj.asOf) || !Array.isArray(tj.items)) {
        console.error('✘ ticker.json 应为 { asOf: YYYYMMDD, items: [] } 结构(fetch-data 生成端口径)');
        failures++;
      } else if (maxLast && tj.asOf !== maxLast) {
        console.error(`✘ ticker.json asOf(${tj.asOf}) ≠ 各数据文件 last 最大值(${maxLast}) — 数据更新后未重生成 ticker`);
        failures++;
      }
    }
  }
}

// ── 首页预设门禁(硬门禁, 与缺口门禁同级): PRESETS 每条都必须能渲染出卡片 ──
// HomeContent 对渲染不可达的预设是 continue 静默跳过(曾致 TSM 卡因数据缺 2005 消失);
// 此处按同一渲染条件前置校验, 新预设再静默消失时构建即红:
//   1) key 在 lib/stocks.ts STOCKS 内(meta 失配 → 跳过)
//   2) public/data/{key}.json 存在且 dates 非空(缺数据 → 跳过)
//   3) 数据首年 ≤ year(首年晚于预设年 → 被 first > year 保护跳过)
//   4) dates 中存在 ≥ year 的日期, 即末年 ≥ year(startIndexForYear 夹取语义;
//      末年也早于预设年 → 无从夹取, 跳过)
{
  const src = readFileSync(join(ROOT, 'components', 'HomeContent.tsx'), 'utf8');
  const re = /\{\s*key:\s*'([a-z0-9-]+)',\s*year:\s*(\d+)/g;
  const presets = [];
  let m;
  while ((m = re.exec(src)) !== null) presets.push({ key: m[1], year: Number(m[2]) });
  // 正则一条都没命中 = PRESETS 源码形态变了(改格式/换引号), 门禁将形同虚设 → 硬失败
  if (!presets.length) {
    console.error('✘ 预设门禁: components/HomeContent.tsx 未解析到任何 PRESETS 条目(正则失配), 门禁失效');
    failures++;
  }
  const known = new Set(KEYS);
  for (const p of presets) {
    if (!known.has(p.key)) {
      console.error(`✘ 预设 ${p.key}@${p.year}: key 不在 lib/stocks.ts STOCKS 内 — 该预设卡将被静默跳过`);
      failures++;
      continue;
    }
    const file = join(ROOT, 'public', 'data', `${p.key}.json`);
    let dates = null;
    if (existsSync(file)) {
      try {
        dates = JSON.parse(readFileSync(file, 'utf8')).dates;
      } catch (e) {
        console.error(`✘ 预设 ${p.key}@${p.year}: ${p.key}.json JSON 解析失败 — ${e.message}`);
        failures++;
      }
    } else {
      console.error(`✘ 预设 ${p.key}@${p.year}: 缺文件 public/data/${p.key}.json — 该预设卡将被静默跳过`);
      failures++;
    }
    if (!Array.isArray(dates) || !dates.length) continue; // 缺文件/解析失败已计失败
    const firstYear = Number(String(dates[0]).slice(0, 4));
    const lastYear = Number(String(dates[dates.length - 1]).slice(0, 4));
    if (!(firstYear <= p.year) || !(lastYear >= p.year)) {
      console.error(
        `✘ 预设 ${p.key}@${p.year}: 数据年份 ${firstYear}-${lastYear} 覆盖不到该年(夹取不可达) — 该预设卡将被静默跳过`
      );
      failures++;
    }
  }
}

if (failures) {
  console.error(`\n数据检查失败: ${failures} 个问题。先运行 npm run fetch-data`);
  process.exit(1);
}
console.log(`✔ 数据检查通过 (${KEYS.length} 个标的)`);
