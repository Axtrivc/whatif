/**
 * 构建前数据完整性检查 — public/data/{key}.json
 *
 * 校验 lib/stocks.ts STOCKS 全部 key 都有对应数据文件, 且字段齐全:
 *   dates/closes 等长、非空、日期升序、收盘价为正。
 * 任一不通过即 exit 1, 阻止带病构建部署到线上。
 *
 * 用法: node scripts/check-data.mjs   (npm run build 的 prebuild 钩子)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 从 lib/stocks.ts 解析全部 key(与 submit-urls.mjs 同一来源, 免维护清单) */
function stockKeys() {
  const src = readFileSync(join(ROOT, 'lib', 'stocks.ts'), 'utf8');
  const out = [];
  const re = /key:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

let failures = 0;
for (const key of stockKeys()) {
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
}

// ticker.json 存在性(走马灯依赖; 缺失不致命, 仅告警)
if (!existsSync(join(ROOT, 'public', 'data', 'ticker.json'))) {
  console.warn('⚠ ticker.json 缺失, 首页走马灯将为空');
}

if (failures) {
  console.error(`\n数据检查失败: ${failures} 个问题。先运行 npm run fetch-data`);
  process.exit(1);
}
console.log(`✔ 数据检查通过 (${stockKeys().length} 个标的)`);
