/** 轻量静态服务(仅本地预览 out/ 用): node scripts/serve-out.mjs [port] */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'out');
const PORT = Number(process.argv[2]) || 3112;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error('traversal');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // 目录形式回退 index.html; 找不到则回退 404 页
    for (const fallback of [join(ROOT, req.url?.replace(/[^/]*$/, '') ?? '', 'index.html'), join(ROOT, '404.html')]) {
      try {
        const data = await readFile(fallback);
        res.writeHead(fallback.endsWith('404.html') ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
        return;
      } catch {}
    }
    res.writeHead(500);
    res.end('boom');
  }
}).listen(PORT, () => console.log(`serving out/ on http://localhost:${PORT}`));
