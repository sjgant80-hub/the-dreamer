// scripts/serve.mjs — DEV-ONLY throwaway static server for local smoke-testing.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json', '.css':'text/css', '.svg':'image/svg+xml' };
const PORT = 8130;
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(PORT, () => console.log('the-dreamer on http://localhost:' + PORT));
