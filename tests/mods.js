#!/usr/bin/env node
'use strict';

/* ============================================================
   Pastoral Create — 模组系统集成测试
   ============================================================
   在真实 Chromium 中验证：
     1) .pcmod(ZIP) 安装与清单校验
     2) mod.json 数据注册（方块/物品/配方）+ main.js 脚本
     3) gameReady / tick 钩子
     4) 模组贴图/物品图标应用（图集动态空位）
     5) 模组方块写入世界并正确渲染定义
     6) 刷新后持久化重载、停用/启用管理
   用法：
     node tests/mods.js
   退出码：0 = 全部通过；1 = 失败。
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PW_DEPS = path.join(ROOT, 'tool-output', 'pw-deps', 'usr', 'lib64');
if (fs.existsSync(path.join(PW_DEPS, 'libgbm.so.1'))) {
  process.env.LD_LIBRARY_PATH = [PW_DEPS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

// ---------- 测试夹具：纯 Node 生成 16x16 PNG 与 store 模式 ZIP ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head, data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([body, tail]);
}
function pngBuffer(rgba) {
  const size = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    for (let x = 0; x < size; x++) Buffer.from(rgba).copy(raw, row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function zipBuffer(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(Buffer.concat([local, name, data]));
    centrals.push(Buffer.concat([central, name]));
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}
function buildTestMod() {
  const manifest = JSON.stringify({
    schemaVersion: 1,
    id: 'test.candy_mod',
    name: '糖果测试模组',
    version: '1.2.3',
    author: 'tests/mods.js',
    description: '自动化测试模组',
    gameVersion: '>=1.1.0',
    icon: 'icon.png',
    data: {
      blocks: {
        candy: { name: '糖果方块', tiles: { all: 'candy' }, hard: 1.2, drops: [{ item: 'candy', n: 1 }], item: true },
      },
      items: {
        candy: { name: '糖果', cat: 'mat', iconBlock: 'candy', stack: 250, price: 8, desc: '甜得发亮' },
      },
      recipes: [
        { id: 'candy_pack', out: { candy: 4 }, in: { sweet_berry: 1, carbon: 2 }, where: 'both', time: 1.5 },
      ],
    },
    textures: [
      { file: 'candy.png', tile: 'candy' },
      { file: 'candy_icon.png', item: 'candy' },
    ],
  });
  const main = [
    "Mods.addItem('mod_marker', { name: '模组标记', cat: 'mat', iconBlock: 'stone', stack: 10, price: 1 });",
    "Mods.on('gameReady', () => { window.__modReady = true; });",
    "Mods.on('tick', () => { window.__modTicks = (window.__modTicks || 0) + 1; });",
    "Mods.on('newGame', () => { PC.setData('started', true); });",
    "Mods.on('loadGame', () => { window.__modLoadedData = PC.getData('score', null); });",
  ].join('\n');
  return zipBuffer([
    { name: 'mod.json', data: manifest },
    { name: 'main.js', data: main },
    { name: 'icon.png', data: pngBuffer([120, 200, 80, 255]) },
    { name: 'candy.png', data: pngBuffer([255, 64, 160, 255]) },
    { name: 'candy_icon.png', data: pngBuffer([255, 220, 90, 255]) },
  ]);
}
function buildRepoExample() {
  const dir = path.join(ROOT, 'docs', 'example-mod');
  return zipBuffer([
    { name: 'mod.json', data: fs.readFileSync(path.join(dir, 'mod.json')) },
    { name: 'main.js', data: fs.readFileSync(path.join(dir, 'main.js')) },
    { name: 'README.md', data: fs.readFileSync(path.join(dir, 'README.md')) },
  ]);
}
function buildDependencyMods() {
  const base = zipBuffer([
    { name: 'mod.json', data: JSON.stringify({
      schemaVersion: 1, id: 'test.base_mod', name: '基础模组', version: '1.0.0',
      data: { items: { base_item: { name: '基础物品', cat: 'mat', iconBlock: 'stone' } } },
    }) },
  ]);
  const dep = zipBuffer([
    { name: 'mod.json', data: JSON.stringify({
      schemaVersion: 1, id: 'test.dep_mod', name: '依赖模组', version: '1.0.0', requires: ['test.base_mod'],
    }) },
    { name: 'main.js', data: [
      "if (!ITEMS.base_item) throw new Error('依赖数据缺失');",
      "Mods.addItem('dep_item', { name: '依赖物品', cat: 'mat', iconBlock: 'stone' });",
    ].join('\n') },
  ]);
  return { base, dep };
}

// ---------- 静态服务器 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  let failed = false;
  const step = async (name, fn) => {
    try { await fn(); console.log('  ✓ ' + name); }
    catch (e) { failed = true; console.log('  ✗ ' + name + ' — ' + e.message); }
  };

  try {
    console.log('模组系统集成测试');
    await step('启动游戏并打开空模组面板', async () => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('#btnModsBoot');
      await page.click('#btnModsBoot');
      await page.waitForSelector('#modsPanel:not(.hidden)');
      const text = await page.locator('#modsList').innerText();
      if (!text.includes('还没有安装模组')) throw new Error(text);
    });

    await step('安装 .pcmod 包', async () => {
      await page.setInputFiles('#modFile', { name: 'test_candy.pcmod', mimeType: 'application/zip', buffer: buildTestMod() });
      await page.waitForFunction(() => document.querySelector('#modsList') && document.querySelector('#modsList').innerText.includes('糖果测试模组'), null, { timeout: 15000 });
    });

    await step('面板显示包内图标', async () => {
      await page.waitForFunction(() => {
        const row = [...document.querySelectorAll('.mod-row')].find(r => r.dataset.modId === 'test.candy_mod');
        return row && row.querySelector('.mod-icon') && row.querySelector('.mod-icon').style.background.includes('blob:');
      }, null, { timeout: 10000 });
    });

    await step('manifest 数据 + 脚本注册生效', async () => {
      const v = await page.evaluate(() => ({
        list: window.Mods.list(),
        block: typeof BLOCKS !== 'undefined' && !!BLOCKS.candy,
        item: typeof ITEMS !== 'undefined' && ITEMS.candy && ITEMS.candy.name,
        recipe: typeof RECIPE_BY_ID !== 'undefined' && !!RECIPE_BY_ID.candy_pack,
        tile: typeof Tex !== 'undefined' && Tex.hasTile('candy'),
        marker: typeof ITEMS !== 'undefined' && !!ITEMS.mod_marker,
      }));
      if (!v.block || v.item !== '糖果' || !v.recipe || !v.tile || !v.marker) throw new Error(JSON.stringify(v));
      if (!v.list[0] || v.list[0].status !== 'active') throw new Error(JSON.stringify(v.list));
    });

    await step('进入游戏：tick / gameReady 钩子与合成列表', async () => {
      await page.evaluate(() => document.getElementById('btnNew').click());
      await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
      await page.waitForFunction(() => window.__modReady === true && window.__modTicks > 0, null, { timeout: 15000 });
      await page.keyboard.press('Tab');
      await page.waitForSelector('#invPanel:not(.hidden)');
      await page.waitForFunction(() => document.querySelector('.craft-list') && document.querySelector('.craft-list').innerText.includes('糖果'), null, { timeout: 10000 });
      await page.keyboard.press('Escape');
    });

    await step('模组贴图与物品图标应用', async () => {
      const v = await page.evaluate(() => {
        const tilePx = Tex.tileCanvas('candy').getContext('2d').getImageData(0, 0, 1, 1).data;
        const iconPx = Icons.get('candy').getContext('2d').getImageData(2, 2, 1, 1).data;
        return { tile: [...tilePx], icon: [...iconPx] };
      });
      if (Math.abs(v.tile[0] - 255) > 10 || Math.abs(v.tile[1] - 64) > 10 || Math.abs(v.tile[2] - 160) > 10) throw new Error(JSON.stringify(v));
      if (Math.abs(v.icon[0] - 255) > 10 || Math.abs(v.icon[1] - 220) > 10 || Math.abs(v.icon[2] - 90) > 10) throw new Error(JSON.stringify(v));
    });

    await step('模组方块写入世界并保持定义', async () => {
      const v = await page.evaluate(async () => {
        const sp = World.findSpawn();
        const x = Math.floor(sp.x), y = Math.floor(sp.y) + 2, z = Math.floor(sp.z);
        World.set(x, y, z, BLOCKS.candy.id);
        await new Promise(r => setTimeout(r, 1000));
        const def = World.getDef(x, y, z);
        return { key: def.key, id: def.id, expected: BLOCKS.candy.id };
      });
      if (v.key !== 'candy' || v.id !== v.expected) throw new Error(JSON.stringify(v));
    });

    await step('模组自定义数据写入存档', async () => {
      const v = await page.evaluate(() => {
        Mods.setModData('test.candy_mod', 'score', 42);
        Game.saveTo(null, '模组数据测试');
        localStorage.__modSaveKey = Game.listSaves()[0].key;
        return { key: localStorage.__modSaveKey, stored: Mods.getModData('test.candy_mod', 'score', null) };
      });
      if (!v.key || v.stored !== 42) throw new Error(JSON.stringify(v));
    });

    await step('刷新后模组持久化并重载', async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#btnModsBoot');
      await page.waitForFunction(() => window.Mods && Mods.list().some(m => m.id === 'test.candy_mod' && m.status === 'active'), null, { timeout: 15000 });
      const v = await page.evaluate(() => ({
        block: typeof BLOCKS !== 'undefined' && !!BLOCKS.candy,
        marker: typeof ITEMS !== 'undefined' && !!ITEMS.mod_marker,
        enabled: Mods.enabledIds().includes('test.candy_mod'),
      }));
      if (!v.block || !v.marker || !v.enabled) throw new Error(JSON.stringify(v));
      await page.waitForFunction(() => {
        if (typeof Tex === 'undefined' || !Tex.hasTile('candy')) return false;
        const d = Tex.tileCanvas('candy').getContext('2d').getImageData(0, 0, 1, 1).data;
        return Math.abs(d[0] - 255) < 10 && Math.abs(d[1] - 64) < 10;
      }, null, { timeout: 15000 });
    });

    await step('读档恢复模组自定义数据', async () => {
      await page.evaluate(async () => { await Game.loadFrom(localStorage.__modSaveKey); });
      await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
      await page.waitForFunction(() => window.__modLoadedData === 42, null, { timeout: 10000 });
      const v = await page.evaluate(() => ({ stored: Mods.getModData('test.candy_mod', 'score', null), state: Game.state }));
      if (v.stored !== 42 || v.state !== 'planet') throw new Error(JSON.stringify(v));
    });

    await step('停用 / 启用管理', async () => {
      await page.evaluate(() => Mods.toggleEnabled('test.candy_mod', false));
      await page.waitForFunction(() => Mods.list().some(m => m.id === 'test.candy_mod' && m.status === 'disabled'));
      await page.evaluate(() => Mods.toggleEnabled('test.candy_mod', true));
      await page.waitForFunction(() => Mods.list().some(m => m.id === 'test.candy_mod' && m.status === 'active'));
    });

    await step('先装依赖方 → 依赖缺失加载失败', async () => {
      const { dep } = buildDependencyMods();
      await page.setInputFiles('#modFile', { name: 'dep.pcmod', mimeType: 'application/zip', buffer: dep });
      await page.waitForTimeout(1500);   // 等待 onchange 的异步安装流程落地
      await page.waitForFunction(() => Mods.list().some(m => m.id === 'test.dep_mod' && m.status === 'error'), null, { timeout: 20000 });
      const v = await page.evaluate(() => Mods.list().find(m => m.id === 'test.dep_mod'));
      if (!/缺少依赖/.test(v.error || '')) throw new Error(JSON.stringify(v));
    });

    await step('仓库 docs/example-mod 示例包可直接安装', async () => {
      await page.setInputFiles('#modFile', { name: 'example.pcmod', mimeType: 'application/zip', buffer: buildRepoExample() });
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => Mods.list().some(m => m.id === 'example.glowing_brick' && m.status === 'active'), null, { timeout: 20000 });
      const v = await page.evaluate(() => ({
        block: typeof BLOCKS !== 'undefined' && !!BLOCKS.glow_brick,
        item: typeof ITEMS !== 'undefined' && !!ITEMS.glow_sack,
        recipe: typeof RECIPE_BY_ID !== 'undefined' && !!RECIPE_BY_ID.glow_sack_recipe,
      }));
      if (!v.block || !v.item || !v.recipe) throw new Error(JSON.stringify(v));
    });

    await step('补装依赖 → 依赖方自动重试成功', async () => {
      const { base } = buildDependencyMods();
      await page.setInputFiles('#modFile', { name: 'base.pcmod', mimeType: 'application/zip', buffer: base });
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => {
        const b = Mods.list().find(m => m.id === 'test.base_mod');
        const d = Mods.list().find(m => m.id === 'test.dep_mod');
        return b && b.status === 'active' && d && d.status === 'active';
      }, null, { timeout: 20000 });
      const v = await page.evaluate(() => ({
        base: typeof ITEMS !== 'undefined' && !!ITEMS.base_item,
        dep: typeof ITEMS !== 'undefined' && !!ITEMS.dep_item,
      }));
      if (!v.base || !v.dep) throw new Error(JSON.stringify(v));
    });

    // 依赖缺失属于测试预期路径（先装依赖方必然失败一次），不计为错误。
    const unexpected = errors.filter(e => !/模组加载失败 test\.dep_mod/.test(e));
    if (unexpected.length) {
      failed = true;
      console.log('  浏览器错误：');
      unexpected.forEach(e => console.log('   ' + e));
    }

    if (failed) { console.log('模组系统测试失败'); process.exitCode = 1; }
    else console.log('模组系统测试全部通过');
  } finally {
    await browser.close();
    server.close();
  }
})();
