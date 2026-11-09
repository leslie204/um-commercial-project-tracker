'use strict';
// UM Commercial Project Tracker: serves the app and stores its records in Postgres.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const COLLECTIONS = new Set(['projects', 'phases', 'items', 'decisions', 'risks', 'kpis', 'docs', 'people', 'comments', 'activity']);
const ID_PATTERN = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
const MAX_BODY = 300 * 1024;
const MAX_WRITES_PER_MINUTE = 300;
const ACTIVITY_KEEP = 1000;
const ACTIVITY_SENT = 300;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
pool.on('error', e => console.error('database connection error', e.message));

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const htmlGz = zlib.gzipSync(html);

let ready = false;
const streams = new Set();
const writeCounts = new Map();
let activityWrites = 0;

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS docs (
    col text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (col, id))`);
  await pool.query('CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value text)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const first = await client.query("INSERT INTO app_meta (key, value) VALUES ('seeded', now()::text) ON CONFLICT DO NOTHING");
    if (first.rowCount === 1) {
      const seedFile = path.join(__dirname, 'seed', 'seed.json');
      if (fs.existsSync(seedFile)) {
        const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        let n = 0;
        for (const [col, docs] of Object.entries(seed)) {
          for (const [id, data] of Object.entries(docs)) {
            await client.query('INSERT INTO docs (col, id, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [col, id, data]);
            n += 1;
          }
        }
        console.log(`imported ${n} records`);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  ready = true;
  console.log('database ready');
}

async function startDatabase() {
  for (;;) {
    try { await init(); return; } catch (e) {
      console.error('waiting for database:', e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(body);
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function tooManyWrites(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const entry = writeCounts.get(ip);
  if (!entry || entry.minute !== minute) { writeCounts.set(ip, { minute, n: 1 }); return false; }
  entry.n += 1;
  return entry.n > MAX_WRITES_PER_MINUTE;
}
setInterval(() => {
  const minute = Math.floor(Date.now() / 60000);
  for (const [ip, e] of writeCounts) if (e.minute !== minute) writeCounts.delete(ip);
}, 60000).unref();

function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { return new URL(origin).host === host; } catch (e) { return false; }
}

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const s of streams) s.write(line);
}

async function allData() {
  const main = await pool.query("SELECT col, id, data FROM docs WHERE col <> 'activity'");
  const activity = await pool.query("SELECT col, id, data FROM docs WHERE col = 'activity' ORDER BY data->>'at' DESC LIMIT $1", [ACTIVITY_SENT]);
  const out = {};
  for (const c of COLLECTIONS) out[c] = {};
  for (const r of [...main.rows, ...activity.rows]) out[r.col][r.id] = r.data;
  return out;
}

const isPlainObject = v => v && typeof v === 'object' && !Array.isArray(v);

async function write(req, res) {
  if (!sameSite(req)) return json(res, 403, { code: 'forbidden' });
  if (tooManyWrites(clientIp(req))) return json(res, 429, { code: 'resource_exhausted' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, e.status || 400, { code: 'invalid_argument' }); }
  const { op, col, id, data } = body || {};
  if (!COLLECTIONS.has(col) || !ID_PATTERN.test(String(id))) return json(res, 400, { code: 'invalid_argument' });
  if (op === 'delete') {
    await pool.query('DELETE FROM docs WHERE col = $1 AND id = $2', [col, id]);
    broadcast({ col, id, data: null });
    return json(res, 200, { ok: true });
  }
  if ((op !== 'set' && op !== 'update') || !isPlainObject(data)) return json(res, 400, { code: 'invalid_argument' });
  let saved;
  if (op === 'set') {
    saved = await pool.query(`INSERT INTO docs (col, id, data) VALUES ($1, $2, $3)
      ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING data`, [col, id, data]);
  } else {
    saved = await pool.query('UPDATE docs SET data = data || $3::jsonb, updated_at = now() WHERE col = $1 AND id = $2 RETURNING data', [col, id, JSON.stringify(data)]);
    if (!saved.rowCount) return json(res, 400, { code: 'invalid_argument' });
  }
  broadcast({ col, id, data: saved.rows[0].data });
  if (col === 'activity' && ++activityWrites % 50 === 0) {
    pool.query(`DELETE FROM docs WHERE col = 'activity' AND id NOT IN
      (SELECT id FROM docs WHERE col = 'activity' ORDER BY data->>'at' DESC LIMIT $1)`, [ACTIVITY_KEEP]).catch(e => console.error('activity cleanup failed', e.message));
  }
  return json(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/health') return ready ? send(res, 200, 'ok') : send(res, 503, 'starting');
    if (req.method === 'GET' && url.pathname === '/') {
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      return send(res, 200, gz ? htmlGz : html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    }
    if (url.pathname.startsWith('/api/') && !ready) return json(res, 503, { code: 'unavailable' });
    if (req.method === 'GET' && url.pathname === '/api/data') return json(res, 200, await allData());
    if (req.method === 'POST' && url.pathname === '/api/write') return await write(req, res);
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': connected\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return undefined;
    }
    return send(res, 404, 'Not found');
  } catch (e) {
    console.error(req.method, url.pathname, e.message);
    if (!res.headersSent) return json(res, 500, { code: 'unavailable' });
    return res.end();
  }
});

setInterval(() => { for (const s of streams) s.write(': ping\n\n'); }, 25000).unref();
server.listen(PORT, () => { console.log(`listening on ${PORT}`); startDatabase(); });
process.on('SIGTERM', () => { for (const s of streams) s.end(); server.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 3000).unref(); });
