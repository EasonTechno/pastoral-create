#!/usr/bin/env node
'use strict';

/* ============================================================
   Pastoral Create — 版本号维护工具
   ============================================================
   游戏版本与资源缓存键的统一维护入口。

   版本体系：
   - version.json            版本单一来源（游戏版本号）
   - index.html 的
     <meta name="game-version" content="X.Y.Z">
     是运行时展示版本（boot 底部）与 version.json 同步
   - index.html / offline.html 中所有本地资源引用
     `?v=<hash8>` 是缓存破坏键：由文件内容 SHA-1 前 8 位生成，
     文件改动 → 键自动变化 → 浏览器/PWA 自动拉新（幂等）

   用法：
     node tools/version.js                 # 显示当前版本与资源缓存键
     node tools/version.js refresh         # 重新生成所有 ?v= 缓存键
     node tools/version.js bump patch      # 1.0.0 → 1.0.1
     node tools/version.js bump minor      # 1.0.0 → 1.1.0
     node tools/version.js bump major      # 1.0.0 → 2.0.0（sw.js 缓存代 +1）

   约定：
   - 改动任何 css/js/静态资源后必须跑 refresh，禁止手写 ?v= 参数
   - 发布前 bump；major 版本换代时 sw.js 缓存名自动升代（全量清缓存）
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'version.json');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OFFLINE_HTML = path.join(ROOT, 'offline.html');
const SW_JS = path.join(ROOT, 'sw.js');
const SCAN_FILES = [INDEX_HTML, OFFLINE_HTML];

// ── 工具 ───────────────────────────────────────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function contentHash(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash('sha1').update(data).digest('hex').slice(0, 8);
}

function versionFile() {
  return readJson(VERSION_FILE, { version: '0.0.0' });
}

// 解析 HTML 中带 ?v= 的本地资源引用，返回 [{ file, url, full }]
// 两种形式：属性引用（src/href="...?v=..."）与
// serviceWorker.register('sw.js?v=...') 字符串。
function findVersionedRefs(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const refs = [];
  const re = /(src|href)="([^"]+\?v=[^"]+)"/g;
  const swRe = /(register\(')([^']+\?v=[^']+)('\))/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = m[0];
    const url = m[2];
    const file = url.split('?')[0];
    if (/^(https?:|data:|#|\/\/)/.test(file)) continue;   // 外链/内联跳过
    const abs = path.normalize(path.join(ROOT, file));
    if (!abs.startsWith(ROOT)) continue;                    // 路径穿越防护
    refs.push({ file: abs, url, full, htmlPath });
  }
  while ((m = swRe.exec(html)) !== null) {
    const full = m[2];                                     // 'sw.js?v=1'（含引号前后不替换）
    const url = m[2];
    const file = url.split('?')[0];
    if (!file.endsWith('.js')) continue;
    const abs = path.normalize(path.join(ROOT, file));
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs)) continue;
    refs.push({ file: abs, url, full, htmlPath, swCall: true });
  }
  return refs;
}

function rewriteRefs(htmlPath, refs) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  let changed = 0;
  for (const r of refs) {
    const hash = contentHash(r.file);
    const newUrl = r.url.replace(/\?v=[^"]*/, '?v=' + hash);
    if (newUrl !== r.url) {
      if (html.includes(r.full)) {
        // swCall: full 就是 url 字符串本身；属性形式: full 含 src="..." 包装
        html = html.replace(r.full, r.swCall ? newUrl : r.full.replace(r.url, newUrl));
        changed++;
      } else {
        console.warn('  ! 引用未找到（可能已被其他改动影响）: ' + r.url);
      }
    }
  }
  fs.writeFileSync(htmlPath, html);
  return changed;
}

// ── 显示 ───────────────────────────────────────────────────────────────────
function show() {
  const v = versionFile();
  console.log('游戏版本: ' + v.version + '（version.json' + (v.updatedAt ? '，更新于 ' + v.updatedAt : '') + '）');
  console.log('index.html meta: ' + (fs.readFileSync(INDEX_HTML, 'utf8').match(/<meta name="game-version" content="([^"]+)"/) || [])[1] || '（未找到！）');
  console.log('sw.js 缓存代: ' + ((fs.readFileSync(SW_JS, 'utf8').match(/pastoral-create-v(\d+)/) || [])[1] || '（未找到！）'));
  console.log('');
  console.log('资源缓存键:');
  const seen = new Set();
  for (const htmlPath of SCAN_FILES) {
    if (!fs.existsSync(htmlPath)) continue;
    for (const r of findVersionedRefs(htmlPath)) {
      const key = r.url.split('?v=')[1];
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      const current = contentHash(r.file);
      const stale = current !== key ? '  ← 已过期（改文件后未 refresh）' : '';
      console.log('  ' + path.relative(ROOT, r.file).padEnd(34) + ' ?v=' + key + stale);
    }
  }
}

// ── refresh：按文件内容重新生成所有缓存键 ─────────────────────────────────
function refresh() {
  let total = 0;
  for (const htmlPath of SCAN_FILES) {
    if (!fs.existsSync(htmlPath)) continue;
    const refs = findVersionedRefs(htmlPath);
    if (refs.length === 0) { console.log(path.relative(ROOT, htmlPath) + ': 无带 ?v= 的本地引用'); continue; }
    console.log(path.relative(ROOT, htmlPath) + ':');
    for (const r of refs) {
      if (!fs.existsSync(r.file)) { console.warn('  ! 文件不存在: ' + r.url); continue; }
      console.log('  ' + path.relative(ROOT, r.file) + '  →  ?v=' + contentHash(r.file));
    }
    total += rewriteRefs(htmlPath, refs);
  }
  console.log('');
  console.log('已更新 ' + total + ' 处引用（内容未变的文件键不变，幂等）。');
  console.log('注意：修改的是本地文件；如需同步部署，记得提交 index.html/offline.html 的变更。');
}

// ── bump：语义化升版 ───────────────────────────────────────────────────────
function bump(part) {
  if (!['patch', 'minor', 'major'].includes(part)) {
    console.error('用法: node tools/version.js bump patch|minor|major');
    process.exit(2);
  }
  const v = versionFile();
  const parts = String(v.version).split('.').map(n => parseInt(n, 10) || 0);
  if (part === 'patch') parts[2] += 1;
  else if (part === 'minor') { parts[1] += 1; parts[2] = 0; }
  else { parts[0] += 1; parts[1] = 0; parts[2] = 0; }
  const next = parts.join('.');

  // version.json
  v.version = next;
  v.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2) + '\n');
  console.log('version.json        → ' + next);

  // index.html meta（boot 版本号读取处）
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const metaRe = /(<meta name="game-version" content=")[^"]*(")/;
  if (!metaRe.test(html)) { console.error('! index.html 未找到 game-version meta'); process.exit(1); }
  html = html.replace(metaRe, '$1' + next + '$2');
  fs.writeFileSync(INDEX_HTML, html);
  console.log('index.html meta     → ' + next);

  // major：sw.js 缓存代 +1（全量清缓存换代）
  if (part === 'major') {
    let sw = fs.readFileSync(SW_JS, 'utf8');
    const swRe = /(pastoral-create-v)(\d+)/;
    if (!swRe.test(sw)) { console.error('! sw.js 未找到缓存代'); process.exit(1); }
    const gen = parseInt(sw.match(swRe)[2], 10) + 1;
    sw = sw.replace(swRe, '$1' + gen);
    fs.writeFileSync(SW_JS, sw);
    console.log('sw.js 缓存代         → pastoral-create-v' + gen + '（旧缓存将被全量清理）');
  }

  console.log('');
  console.log('bump 完成。建议接着执行: node tools/version.js refresh');
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'show';
if (cmd === 'show') show();
else if (cmd === 'refresh') refresh();
else if (cmd === 'bump') bump(process.argv[3]);
else {
  console.error('未知命令: ' + cmd);
  console.error('用法: node tools/version.js [show|refresh|bump patch|minor|major]');
  process.exit(2);
}
