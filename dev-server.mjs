/** 本地静态服务器（无依赖），用于电脑预览和手机局域网测试 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.resolve(ROOT, '.' + pathname);
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }

    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': data.length,
    });
    if (request.method === 'HEAD') response.end();
    else response.end(data);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Server Error');
  }
});

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const ipv4 = net.family === 'IPv4' || net.family === 4;
      if (ipv4 && !net.internal) result.push(net.address);
    }
  }
  return result;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('简明记账 本地预览已启动：');
  console.log(`  本机：  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  局域网：http://${ip}:${PORT}  （手机连同一 WiFi 后访问）`);
  }
  console.log('\n提示：局域网 http 地址不支持安装 PWA / 离线缓存，正式使用请部署到 HTTPS。');
});
