/**
 * OG 分享图 CJK 子集字体构建 — 手工工具(仅文案变化时跑): npm run og-font
 *
 * satori/next-og 默认字体(Geist)不含中文字形, 中文 OG 会渲染成空白方框。
 * 本脚本从 Noto Sans SC 子集化「两份 OG 固定文案 + lib/stocks.ts 全部 zh 字段
 * 用字 + 全 ASCII + 常用标点」→ app/og-assets/og-zh.woff 入库,
 * 构建期由 lib/og.ts 的 ogFontData() 读取传入 ImageResponse fonts 选项。
 *
 * 为什么是 .woff 而不是 .woff2: next/og 内置的 opentype 解析器只认
 * TTF/OTTO/WOFF(1) 签名(无 brotli 解码, 不认 wOF2), 传 woff2 会抛
 * "Unsupported OpenType signature"。
 *
 * 全量字体缓存 tools/fonts/NotoSansSC-Regular.ttf(约 10MB, 不入库):
 * 缺失时自动从 fonts.googleapis.com / fonts.gstatic.com 下载(老 UA 触发
 * 单文件全量 TTF, 而非按 unicode-range 切片的 woff2)。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_CACHE = join(ROOT, 'tools', 'fonts', 'NotoSansSC-Regular.ttf');
const OUT = join(ROOT, 'app', 'og-assets', 'og-zh.woff');

/** 允许下载的域名白名单(Google Fonts 官方) */
const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/** 服务端出网 URL 安全校验: 仅 https + 域名白名单 + 拒绝 localhost/环回/私有/保留地址 */
function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`非法 URL: ${raw}`);
  }
  if (u.protocol !== 'https:') throw new Error(`仅允许 https: ${raw}`);
  const h = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(h)) throw new Error(`域名不在白名单: ${h}`);
  const priv =
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^0\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (priv) throw new Error(`拒绝环回/私有/保留地址: ${raw}`);
  return u;
}

/** 老 Safari UA: Google Fonts 对不支持 unicode-range 的客户端返回单文件全量 TTF */
const LEGACY_UA =
  'Mozilla/5.0 (U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

/** 取全量 Noto Sans SC Regular TTF: 优先本地缓存, 缺失则下载一次 */
async function ensureFont() {
  if (existsSync(FONT_CACHE)) return readFileSync(FONT_CACHE);
  const cssUrl = assertSafeUrl('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400');
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } })).text();
  const m = /url\((https:\/\/fonts\.gstatic\.com[^)]+)\) format\('truetype'\)/.exec(css);
  if (!m) throw new Error('未能从 Google Fonts CSS 解析出全量 TTF 地址(接口形态可能已变)');
  const ttfUrl = assertSafeUrl(m[1]);
  const res = await fetch(ttfUrl);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}: ${ttfUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 全量 Noto Sans SC 约 10MB; 太小 = 拿到的是切片, 会导致子集缺字
  if (buf.length < 5_000_000) throw new Error(`字体仅 ${buf.length} 字节, 疑似非全量文件`);
  if (buf.readUInt32BE(0) !== 0x00010000) throw new Error('下载内容不是 TrueType 字体(签名不符)');
  mkdirSync(dirname(FONT_CACHE), { recursive: true });
  writeFileSync(FONT_CACHE, buf);
  console.log(`↓ 已缓存全量字体 ${FONT_CACHE} (${(buf.length / 1e6).toFixed(1)}MB)`);
  return buf;
}

/** 各 OG(zh/en 站点级 + 标的级) 的静态文案 — 新增/修改文案时同步这里并重跑本脚本 */
const FIXED_TEXT = [
  'WHATIF // REPLAY ENGINE',
  'WhatIf // Replay Engine',
  'WHATIF // 回测模拟报告',
  'What if you had bought back then?',
  '假如当时买了…',
  'Microsoft 1996 Bitcoin 2013 NVIDIA 2015',
  '假如 年买入 → ×', // 标的级 zh 数据行(app/p/[stock]/opengraph-image.tsx)
  'in →', // 标的级 en 数据行(app/en/p/[stock]/..., 标的名/年份均为 ASCII)
].join('');

/** 全 ASCII 可见字符(覆盖 en 文案与数字/单位微调) */
const ASCII = String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 32 + i));

/** 倍数符号 + 常用中英文标点(文案微调不必每次重跑子集) */
const PUNCT = '×…—–·、，。：；！？（）「」『』《》％＋－／';

/** 从 lib/stocks.ts 解析全部 zh 字段(与 check-data.mjs 的 key 解析同一手法) */
function stockZhNames() {
  const src = readFileSync(join(ROOT, 'lib', 'stocks.ts'), 'utf8');
  const out = [];
  const re = /zh:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  // 交叉核对: `zh: '` 出现总数与正则命中数不一致 = 解析缩水, 硬失败
  const total = (src.match(/\bzh:\s*'/g) || []).length;
  if (total !== out.length || out.length === 0) {
    console.error(`✘ lib/stocks.ts 解析异常: zh 字段出现 ${total} 次但仅匹配 ${out.length} 个`);
    process.exit(1);
  }
  return out;
}

/** 从 lib/site.ts 解析生产域名(水印/站名行) */
function siteHost() {
  const m = /SITE_HOST = '([^']+)'/.exec(readFileSync(join(ROOT, 'lib', 'site.ts'), 'utf8'));
  if (!m) {
    console.error('✘ 未能从 lib/site.ts 解析 SITE_HOST');
    process.exit(1);
  }
  return m[1];
}

const font = await ensureFont();
const charset = [...new Set(FIXED_TEXT + stockZhNames().join('') + siteHost() + ASCII + PUNCT)].join('');
const subset = await subsetFont(font, charset, { targetFormat: 'woff', noHinting: true });

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, subset);
console.log(`✔ ${OUT} (${(subset.length / 1024).toFixed(0)}KB, ${charset.length} 字符)`);
