import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(root, 'index.html');
  if (url.pathname.startsWith('/assets/') || ['/manifest.webmanifest','/robots.txt','/sitemap.xml','/404.html'].includes(url.pathname)) filePath = path.join(root, 'public', url.pathname);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    const body = await readFile(path.join(root, 'public', '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body);
  }
}).listen(port, '0.0.0.0', () => console.log(`BuildStory AI dev server: http://localhost:${port}`));
