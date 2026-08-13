'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 17890);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');
const sessions = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return fallback; } }
let users = readJson(USERS_FILE, {});
let saves = readJson(SAVES_FILE, {});
function writeJson(file, value){ fs.writeFileSync(file, JSON.stringify(value)); }
function cleanName(name){ return String(name || '').trim().toLowerCase(); }
function validName(name){ return /^[a-z0-9_\u4e00-\u9fff-]{3,24}$/i.test(name); }
function hashPassword(password, salt){
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}
function verifyPassword(password, user){
  const actual = hashPassword(password, user.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(user.hash, 'hex'));
}
function token(){ return crypto.randomBytes(32).toString('hex'); }
function dataHash(data){ return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }
function body(req){ return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 12 * 1024 * 1024) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch(e){ reject(e); } }); req.on('error', reject); }); }
function send(res, code, data){ res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); res.end(JSON.stringify(data)); }
function auth(req){ const value = req.headers.authorization || ''; const t = value.startsWith('Bearer ') ? value.slice(7) : ''; return sessions.get(t) || null; }
function saveSummary(s){ return { key: s.key, name: s.name, time: s.time, planetName: s.planetName, playMin: s.playMin, rev: s.rev, hash: s.hash }; }
function userInfo(name){ return { username: name, saves: Object.values(saves[name] || {}).map(saveSummary) }; }

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS'){ send(res, 204, {}); return; }
  if (!req.url.startsWith('/api/')){ send(res, 404, { error: 'not_found' }); return; }
  const route = req.url.split('?')[0];
  try {
    if (route === '/api/health'){ send(res, 200, { ok: true }); return; }
    if (route === '/api/register' && req.method === 'POST'){
      const b = await body(req), name = cleanName(b.username), password = String(b.password || '');
      if (!validName(name) || password.length < 6){ send(res, 400, { error: '用户名 3-24 位，密码至少 6 位' }); return; }
      if (users[name]){ send(res, 409, { error: '用户名已存在' }); return; }
      const h = hashPassword(password); users[name] = { salt: h.salt, hash: h.hash, created: Date.now() }; saves[name] = {};
      writeJson(USERS_FILE, users); writeJson(SAVES_FILE, saves);
      const t = token(); sessions.set(t, name); send(res, 201, { token: t, user: userInfo(name) }); return;
    }
    if (route === '/api/login' && req.method === 'POST'){
      const b = await body(req), name = cleanName(b.username), user = users[name];
      if (!user || !verifyPassword(String(b.password || ''), user)){ send(res, 401, { error: '用户名或密码错误' }); return; }
      const t = token(); sessions.set(t, name); send(res, 200, { token: t, user: userInfo(name) }); return;
    }
    const name = auth(req);
    if (!name){ send(res, 401, { error: '请先登录' }); return; }
    if (route === '/api/me' && req.method === 'GET'){ send(res, 200, { user: userInfo(name) }); return; }
    if (route === '/api/saves' && req.method === 'GET'){ send(res, 200, { saves: userInfo(name).saves }); return; }
    if (route === '/api/saves' && req.method === 'POST'){
      const b = await body(req); if (!b.key || !b.data || typeof b.data !== 'object'){ send(res, 400, { error: '存档数据无效' }); return; }
      const payload = JSON.stringify(b.data); if (payload.length > 10 * 1024 * 1024){ send(res, 413, { error: '存档超过 10MB' }); return; }
      const previous = saves[name][b.key];
      const baseRev = b.baseRev === null || b.baseRev === undefined ? null : Number(b.baseRev);
      if (previous && !b.force && baseRev !== previous.rev){
        send(res, 409, { error: '云端存档已在其他设备更新', code: 'save_conflict', save: previous }); return;
      }
      const next = { key: b.key, name: String(b.name || b.key).slice(0, 40), time: Date.now(), planetName: String(b.planetName || ''), playMin: Number(b.playMin || 0), rev: previous ? (Number(previous.rev) || 0) + 1 : 1, hash: dataHash(b.data), data: b.data };
      saves[name][b.key] = next;
      writeJson(SAVES_FILE, saves); send(res, 200, { save: next }); return;
    }
    const deleteMatch = route.match(/^\/api\/saves\/([^/]+)\/delete$/);
    if (deleteMatch && req.method === 'POST'){
      delete saves[name][decodeURIComponent(deleteMatch[1])]; writeJson(SAVES_FILE, saves); send(res, 200, { ok: true }); return;
    }
    const match = route.match(/^\/api\/saves\/([^/]+)$/);
    if (match && req.method === 'GET'){
      const save = saves[name][decodeURIComponent(match[1])]; if (!save){ send(res, 404, { error: '存档不存在' }); return; }
      send(res, 200, { save }); return;
    }
    send(res, 404, { error: 'not_found' });
  } catch(e){ console.error(e); send(res, 500, { error: '服务器错误' }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Pastoral cloud saves listening on 127.0.0.1:${PORT}`));
