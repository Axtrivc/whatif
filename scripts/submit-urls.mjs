/**
 * WhatIf — IndexNow 批量提交(Bing/Yandex 收录加速)
 *
 * 提交中英双语全部页面: 首页 + 全部标的落地页(/p/<key>/ 与 /en/p/<key>/)。
 * URL 列表从 lib/stocks.ts 解析, 新增标的后重跑本脚本即可。密钥文件 public/<key>.txt 需已部署到站点根目录。
 *
 * 用法:
 *   node scripts/submit-urls.mjs              # 提交
 *   DRY_RUN=1 node scripts/submit-urls.mjs    # 仅打印 URL 列表
 *   SITE_URL=... INDEXNOW_KEY=... 可覆盖默认值
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = (process.env.SITE_URL || 'https://whatif.axtrivc.com').replace(/\/$/, '');
// 与 public/e79a9da1efb517e5dc4b2f3fada51d11.txt 严格一致(换密钥时两处同步更新)
const KEY = process.env.INDEXNOW_KEY || 'e79a9da1efb517e5dc4b2f3fada51d11';
const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow'];

/** 从 lib/stocks.ts 的 STOCKS 条目提取全部 key(数据文件名 / URL slug) */
function stockKeys() {
  const src = readFileSync(join(ROOT, 'lib', 'stocks.ts'), 'utf8');
  const out = [];
  const re = /key:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

async function submit(urls, endpoint) {
  const host = new URL(SITE_URL).host;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    // 端点挂起时 20s 快速失败换备用节点, 不等 undici 默认 300s headersTimeout
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      host,
      key: KEY,
      keyLocation: `${SITE_URL}/${KEY}.txt`,
      urlList: urls,
    }),
  });
  // 响应体不消费会拖住连接: 只需要状态码, 显式取消
  try { await res.body?.cancel(); } catch {}
  // 200/202 = 已加入抓取队列; 403 = 密钥文件校验失败
  return res.status;
}

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/en/`,
  ...stockKeys().flatMap((k) => [`${SITE_URL}/p/${k}/`, `${SITE_URL}/en/p/${k}/`]),
];

console.log(`WhatIf IndexNow — ${urls.length} 个 URL → ${SITE_URL}`);
if (!existsSync(join(ROOT, 'public', `${KEY}.txt`))) {
  console.warn(`⚠ public/${KEY}.txt 不存在, 节点校验会失败`);
}
if (process.env.DRY_RUN === '1') {
  urls.forEach((u) => console.log('  ' + u));
  process.exit(0);
}

for (const ep of ENDPOINTS) {
  let status;
  try {
    status = await submit(urls, ep);
  } catch (e) {
    console.warn(`✘ ${ep} 网络错误: ${e.message}`);
    continue;
  }
  if (status === 200 || status === 202) {
    console.log(`✔ [${new URL(ep).host}] HTTP ${status} — 已加入抓取队列(Bing/Yandex)`);
    process.exit(0);
  }
  console.warn(`✘ [${new URL(ep).host}] HTTP ${status}, 尝试备用节点…`);
}
console.error('❌ 全部节点提交失败: 检查密钥文件是否已部署且内容与脚本一致');
process.exitCode = 1;
