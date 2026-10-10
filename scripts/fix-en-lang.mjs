/**
 * 构建后修正英文站静态产物的 <html lang> — out/en/**
 *
 * app/layout.tsx 是唯一根布局, <html lang="zh-CN"> 硬编码; 静态导出只有一份
 * 根 layout, 服务端无法按路由区分语言, 英文站产物 (out/en/**) 因此被声明为
 * 中文, 与 og:locale=en_US 矛盾。HtmlLang.tsx 只在水合后修正, 爬虫/读屏器
 * 初始读到的仍是错误声明。本脚本在 next build 落盘 out/ 后, 把 out/en 下
 * 所有 index.html 的首个 lang="zh-CN" 改写为 lang="en" (中文侧 out/ 不动)。
 *
 * 用法: node scripts/fix-en-lang.mjs   (npm run build 的 postbuild 钩子)
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EN_DIR = join(import.meta.dirname, '..', 'out', 'en');

/** 递归收集 dir 下全部 index.html (Next 静态导出每个路由一个) */
async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name === 'index.html')
    .map((e) => join(e.parentPath, e.name));
}

async function main() {
  let files;
  try {
    files = await collectHtmlFiles(EN_DIR);
  } catch {
    console.error('✘ 找不到 out/en — 请先 npm run build 生成英文站静态产物');
    process.exitCode = 1;
    return;
  }

  let fixed = 0;
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    // 只替换首个 <html …lang="zh-CN">(不带 g 标志), 页面其余内容不动
    const patched = html.replace(/<html([^>]*?)lang="zh-CN"/, '<html$1lang="en"');
    if (patched !== html) {
      await writeFile(file, patched);
      fixed++;
    }
  }
  console.log(`✔ en lang 修正: ${fixed}/${files.length} 个 index.html → lang="en"`);
  // 结果断言: app/layout.tsx 硬编码 lang="zh-CN" + trailingSlash 产物结构不变的前提下,
  // 全新构建后应全量命中; 0 修正必属异常(regex 失配/产物结构变化), 不能静默 exit 0
  if (files.length === 0 || fixed === 0) {
    console.error(`✘ en lang 修正异常: ${fixed}/${files.length} — 全新构建后应全量命中, 检查 layout lang 硬编码或 Next 序列化变化`);
    process.exitCode = 1;
  }
}

await main();
