'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(process.argv[2] || 'output/quality-audit/progressive-images');
const port = Number(process.env.PROGRESSIVE_PORT || 4174);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
async function readAsset(relative) {
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) throw new Error('Outside output directory');
  const real = await fs.realpath(filename);
  if (!real.startsWith(root + path.sep)) throw new Error('Outside output directory');
  return { filename:real, bytes:await fs.readFile(real) };
}
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/manifest.json') {
      const manifests = [];
      for (const entry of await fs.readdir(root, {withFileTypes:true})) {
        if (!entry.isDirectory() || !/^[a-f0-9]{16,64}$/.test(entry.name)) continue;
        try {
          const m = JSON.parse((await readAsset(entry.name + '/manifest.json')).bytes.toString());
          const { directory, ...safe } = m;
          manifests.push(safe);
        } catch { /* Incomplete builds are deliberately invisible. */ }
      }
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(manifests));
      return;
    }
    const staticFiles = {
      '/': path.join(__dirname,'viewer.html'),
      '/viewer.js':path.join(__dirname,'viewer.js'),
      '/queue.js':path.join(__dirname,'queue.js'),
      '/pannellum.js':require.resolve('pannellum/build/pannellum.js'),
      '/pannellum.css':require.resolve('pannellum/build/pannellum.css')
    };
    let filename, bytes;
    if (staticFiles[url.pathname]) {
      filename = staticFiles[url.pathname];
      bytes = await fs.readFile(filename);
    } else if (url.pathname.startsWith('/assets/')) {
      const relative = decodeURIComponent(url.pathname.slice(8)).replace(/^([a-f0-9]{64})\/@[a-z0-9-]+\//, '$1/');
      ({filename,bytes} = await readAsset(relative));
      const delay = Math.max(0, Math.min(1000, Number(url.searchParams.get('delay')) || 0));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    } else { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type':types[path.extname(filename)] || 'application/octet-stream',
      'Content-Length':bytes.length,
      'Cache-Control':!url.pathname.startsWith('/assets/') || url.searchParams.has('run') || url.pathname.includes('/@') ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options':'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Progressive image lab: http://127.0.0.1:${port} (local files only)`));
