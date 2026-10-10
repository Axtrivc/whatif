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
  let path = '';
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error('traversal');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // 回退: 无扩展名且无尾斜杠的路径(如 /p/msft)补试其目录下 index.html; 其余(带扩展名,
    // 或尾斜杠路径上方已试过 index.html)直接回退 404 页。基于已解码的 path, 不再碰原始 req.url
    const candidates = [];
    if (path && !extname(path) && !path.endsWith('/')) {
      candidates.push(normalize(join(ROOT, path, 'index.html')));
    }
    candidates.push(join(ROOT, '404.html'));
    for (const fallback of candidates) {
      if (!fallback.startsWith(ROOT)) continue; // 与上方同款目录穿越守卫
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
