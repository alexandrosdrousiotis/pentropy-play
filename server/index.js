// HTTP(S) entry point: hardened static serving + JSON API. Zero dependencies.
import http from 'node:http';
import https from 'node:https';
import { readFile, stat, realpath } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { makeSeedCipher } from './fairness.js';
import { createAuth } from './auth.js';
import { createApi } from './routes.js';
import { HttpError, RateLimiter, securityHeaders, clientIp, readJson } from './security.js';
import { createSocial } from './social.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC_ROOTS = { public: join(root, 'public'), shared: join(root, 'shared') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };

export function createServer(overrides = {}) {
  const cfg = { ...config, ...overrides };
  const db = openDatabase(cfg.dbPath);
  const seedCipher = makeSeedCipher(cfg.secret);
  const auth = createAuth(db, cfg, seedCipher);
  const social = createSocial(db, cfg);
  const api = createApi({ db, config: cfg, auth, seedCipher, social });
  const limiters = { general: new RateLimiter(cfg.rateLimit.general), auth: new RateLimiter(cfg.rateLimit.auth), play: new RateLimiter(cfg.rateLimit.play), chat: new RateLimiter(cfg.rateLimit.chat || { windowMs: 10e3, max: 6 }) };
  const https_ = Boolean(cfg.tlsCert && cfg.tlsKey);

  async function serveStatic(pathname, res) {
    if (pathname === '/') pathname = '/index.html';
    const ext = extname(pathname);
    if (!TYPES[ext]) throw new HttpError(404, 'Not found');
    const [, first] = pathname.split('/');
    const base = first === 'shared' ? STATIC_ROOTS.shared : STATIC_ROOTS.public;
    const rel = first === 'shared' ? pathname.slice('/shared'.length) : pathname;
    if (rel.includes('\0') || rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) throw new HttpError(404, 'Not found');
    const file = join(base, rel);
    if (!file.startsWith(base + sep)) throw new HttpError(404, 'Not found');
    let real;
    try { real = await realpath(file); } catch { throw new HttpError(404, 'Not found'); }
    if (!real.startsWith(base + sep)) throw new HttpError(404, 'Not found');
    const s = await stat(real);
    if (!s.isFile()) throw new HttpError(404, 'Not found');
    const body = await readFile(real);
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Content-Length': body.length, 'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache' });
    res.end(body);
  }

  const sendJson = (res, status, body) => {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    res.end(data);
  };

  const handler = async (req, res) => {
    const forwardedHttps = cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https';
    securityHeaders(res, { https: https_ || forwardedHttps || cfg.isProd });
    const ip = clientIp(req, cfg.trustProxy);
    try {
      if (!['GET', 'POST', 'PATCH', 'DELETE', 'HEAD'].includes(req.method)) throw new HttpError(404, 'Not found');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (!limiters.general.allow(ip)) throw new HttpError(429, 'Too many requests');
        const out = await api(req, res, { ip, url, limiters, body: () => readJson(req, cfg.bodyLimit) });
        return sendJson(res, out.status, out.body);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(404, 'Not found');
      if (!limiters.general.allow(ip)) throw new HttpError(429, 'Too many requests');
      await serveStatic(url.pathname, res);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, ...err.extra });
      if (err?.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(err.message)) return sendJson(res, 409, { error: 'Conflict' });
      console.error(new Date().toISOString(), 'unhandled', err?.message || err);
      return sendJson(res, 500, { error: 'Internal error' });
    }
  };

  const server = https_ ? https.createServer({ cert: cfg.tlsCert, key: cfg.tlsKey, minVersion: 'TLSv1.2' }, handler) : http.createServer(handler);
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 60;
  server.on('clientError', (err, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return { server, db, close: () => new Promise((r) => server.close(() => { social.close(); db.close(); r(); })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`Pentropy Play listening on ${config.tlsCert ? 'https' : 'http'}://${config.host}:${config.port} (${config.isProd ? 'production' : 'development'})`);
    if (!config.isProd) console.log('Development mode: set NODE_ENV=production and SECRET_KEY for deployment. Bind HOST=0.0.0.0 behind a TLS-terminating proxy with TRUST_PROXY=1.');
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
