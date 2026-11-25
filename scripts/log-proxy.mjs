// Dev-only logging proxy used by perf-audit.mjs to count upstream API calls per navigation (listens on :8001, forwards to :8000, appends '[status]: METHOD url' lines to PROXY_LOG).
import http from 'node:http'; import { appendFileSync } from 'node:fs';
const LOG = process.env.PROXY_LOG ?? 'perf-proxy.log';
http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: Number(process.env.UPSTREAM_PORT ?? 8000), path: req.url, method: req.method, headers: req.headers }, (r) => {
    appendFileSync(LOG, `[${r.statusCode}]: ${req.method} ${req.url}\n`); res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up);
}).listen(Number(process.env.PROXY_PORT ?? 8001), '127.0.0.1');
