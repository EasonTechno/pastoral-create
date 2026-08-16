#!/usr/bin/env node
'use strict';

/* ============================================================
   Pastoral Create — Playwright 多端预览 / 稳定性门禁
   ============================================================
   在多个设备形态（桌面 / 平板横屏 / 手机横屏 / 小屏横屏 / 手机竖屏）
   下启动游戏并截图关键状态：启动界面、进入游戏(HUD)、背包面板。

   用法：
     node tests/preview.js                         # 全部设备 + 全部状态
     node tests/preview.js --devices desktop,mobile-landscape
     node tests/preview.js --states boot,game
     node tests/preview.js --out tool-output/preview
     node tests/preview.js --url http://localhost:8000   # 用外部服务器
     node tests/preview.js --dpr                  # 真实物理像素比（高清验证）
     node tests/preview.js --headed                # 有头调试
     node tests/preview.js --help

   输出：<out>/<device>/<state>.png + <out>/manifest.json
   退出码：0 = 全部通过（稳定性门禁通过）；1 = 任一状态失败。

   约定：
   - 每个设备用全新浏览器上下文（新 localStorage），互不污染；
   - 屏蔽 Service Worker，避免 PWA 缓存干扰（测的是当前源码）；
   - 竖屏设备（手机竖屏）断言 #landscapeHint 保持隐藏（该提示层
     尚未接线，若意外显示即为回归）。
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'tool-output', 'preview');

// 无 root 环境下 Chromium 缺系统库（libgbm/libwayland-server 等）：
// 项目内 tool-output/pw-deps 提供提取好的库，自动加入加载路径。
const PW_DEPS = path.join(ROOT, 'tool-output', 'pw-deps', 'usr', 'lib64');
if (fs.existsSync(path.join(PW_DEPS, 'libgbm.so.1'))) {
  process.env.LD_LIBRARY_PATH = [PW_DEPS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

// ── 设备矩阵 ──────────────────────────────────────────────────────────────
// 游戏为横屏优先（PWA manifest orientation: landscape）。
// dpr 为设备的真实物理像素比；默认按 1 截图（软渲染下高 DPR 合成极慢，
// 布局/回归门禁足够），加 --dpr 旗标时用真实 DPR 验证高清清晰度。
const DEVICES = {
  'desktop': {
    label: '桌面 1440x900',
    viewport: { width: 1440, height: 900 },
    isMobile: false, hasTouch: false, dpr: 1,
    states: ['boot', 'game', 'inv'],
  },
  'tablet-landscape': {
    label: '平板横屏 1180x820',
    viewport: { width: 1180, height: 820 },
    isMobile: true, hasTouch: true, dpr: 2,
    states: ['boot', 'game', 'inv'],
  },
  'mobile-landscape': {
    label: '手机横屏 844x390 (iPhone 12/13)',
    viewport: { width: 844, height: 390 },
    isMobile: true, hasTouch: true, dpr: 3,
    states: ['boot', 'game', 'inv'],
  },
  'mobile-small-landscape': {
    label: '小屏横屏 667x375 (iPhone SE)',
    viewport: { width: 667, height: 375 },
    isMobile: true, hasTouch: true, dpr: 2,
    states: ['boot', 'game', 'inv'],
  },
  'mobile-portrait': {
    label: '手机竖屏 390x844（横屏提示保持隐藏）',
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, dpr: 3,
    states: ['boot', 'game', 'hint-hidden'],
  },
};

const ALL_DEVICES = Object.keys(DEVICES);
const ALL_STATES = ['boot', 'game', 'inv', 'hint-hidden'];

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { devices: ALL_DEVICES, states: ALL_STATES, out: DEFAULT_OUT, url: null, headed: false, dpr: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--devices') args.devices = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--states') args.states = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--out') args.out = next();
    else if (a === '--url') args.url = next();
    else if (a === '--headed') args.headed = true;
    else if (a === '--dpr') args.dpr = true;
    else if (a === '--help') { printHelp(); process.exit(0); }
    else { console.error('未知参数: ' + a); printHelp(); process.exit(2); }
  }
  for (const d of args.devices) {
    if (!DEVICES[d]) { console.error('未知设备: ' + d + '（可用: ' + ALL_DEVICES.join(', ') + '）'); process.exit(2); }
  }
  for (const s of args.states) {
    if (!ALL_STATES.includes(s)) { console.error('未知状态: ' + s + '（可用: ' + ALL_STATES.join(', ') + '）'); process.exit(2); }
  }
  return args;
}

function printHelp() {
  console.log([
    '用法: node tests/preview.js [选项]',
    '  --devices <a,b,c>   设备子集: ' + ALL_DEVICES.join(', '),
    '  --states <a,b,c>    状态子集: ' + ALL_STATES.join(', '),
    '  --out <dir>         输出目录 (默认 ' + DEFAULT_OUT + ')',
    '  --url <url>         使用外部静态服务器，不内置起服务',
    '  --dpr               用设备真实物理像素比截图（慢，验证高清清晰度用）',
    '  --headed            有头模式（调试用）',
    '  --help              帮助',
  ].join('\n'));
}

// ── 内置静态服务器 ─────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // 云存档 API：健康检查放行，其余返回空 API（游戏需能容错）
    if (url.pathname.startsWith('/api/')) {
      const body = url.pathname === '/api/health' ? JSON.stringify({ ok: true }) : JSON.stringify({ error: 'preview_server' });
      res.writeHead(url.pathname === '/api/health' ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    if (file === ROOT || url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found: ' + url.pathname); return; }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// ── 截图状态机 ─────────────────────────────────────────────────────────────
// 游戏 canvas 每帧重绘：Playwright page.screenshot 的"等待页面稳定"永不
// 满足（软渲染下还会叠加大视口合成开销导致超时）。因此统一经 CDP
// Page.captureScreenshot 直接抓当前帧，稳定且可预期。
async function shot(page, ctx, dir, name) {
  const file = path.join(dir, name + '.png');
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

async function stateBoot(page, ctx, dir) {
  await page.waitForSelector('#boot', { state: 'visible', timeout: 45000 });
  // 等版本号渲染出来（bootVer 非空）
  await page.waitForFunction(
    () => { const el = document.getElementById('bootVer'); return el && el.textContent.trim().length > 0; },
    null, { timeout: 30000 }
  ).catch(() => {});
  return shot(page, ctx, dir, 'boot');
}

async function stateGame(page, ctx, dir) {
  await page.click('#btnNew');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 120000 });
  await page.waitForTimeout(1500);   // 等世界首帧稳定
  return shot(page, ctx, dir, 'game');
}

async function stateInv(page, ctx, dir, touch) {
  if (touch) await page.tap('#mbInventory');
  else await page.keyboard.press('Tab');
  await page.waitForSelector('#invPanel:not(.hidden)', { timeout: 20000 });
  await page.waitForTimeout(600);
  const file = await shot(page, ctx, dir, 'inv');
  await page.keyboard.press('Escape').catch(() => {});
  return file;
}

async function stateHintHidden(page, ctx, dir) {
  // 竖屏：进入游戏后横屏提示层必须保持隐藏（未接线，出现即回归）
  await page.waitForTimeout(600);
  const visible = await page.locator('#landscapeHint').evaluate(el => !el.classList.contains('hidden')).catch(() => false);
  if (visible) throw new Error('#landscapeHint 意外显示（横屏提示层未接线，出现即回归）');
  return shot(page, ctx, dir, 'hint-hidden');
}

const STATE_FNS = {
  'boot': (page, ctx, dir) => stateBoot(page, ctx, dir),
  'game': (page, ctx, dir) => stateGame(page, ctx, dir),
  'inv': (page, ctx, dir, touch) => stateInv(page, ctx, dir, touch),
  'hint-hidden': (page, ctx, dir) => stateHintHidden(page, ctx, dir),
};

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  let server = null, baseUrl = args.url;
  if (!baseUrl) {
    const s = await startServer();
    server = s.server;
    baseUrl = 'http://127.0.0.1:' + s.port;
  }

  console.log('Pastoral Create 多端预览');
  console.log('  URL: ' + baseUrl);
  console.log('  设备: ' + args.devices.map(d => DEVICES[d].label).join(' | '));
  console.log('  状态: ' + args.states.join(', '));
  console.log('  输出: ' + args.out);
  console.log('');

  const browser = await chromium.launch({
    headless: !args.headed,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const results = [];
  let failures = 0;
  const startedAt = Date.now();

  for (const devId of args.devices) {
    const dev = DEVICES[devId];
    const devDir = path.join(args.out, devId);
    const wanted = dev.states.filter(s => args.states.includes(s));
    console.log('── ' + dev.label + ' ──');
    const context = await browser.newContext({
      viewport: dev.viewport,
      isMobile: dev.isMobile,
      hasTouch: dev.hasTouch,
      deviceScaleFactor: args.dpr ? dev.dpr : 1,
      serviceWorkers: 'block',
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(baseUrl, { timeout: 60000 });

    let enteredGame = false;
    for (const state of wanted) {
      try {
        if ((state === 'inv' || state === 'hint-hidden') && !enteredGame) {
          // 先进入游戏再截图面板类状态
          await STATE_FNS['game'](page, context, devDir);
          enteredGame = true;
        }
        const file = await STATE_FNS[state](page, context, devDir, dev.hasTouch);
        if (state === 'game') enteredGame = true;
        results.push({ device: devId, state, file, viewport: dev.viewport, dpr: args.dpr ? dev.dpr : 1, label: dev.label });
        console.log('  ✓ ' + state + '  → ' + path.relative(ROOT, file));
      } catch (e) {
        failures++;
        const errFile = path.join(devDir, state + '.error.png');
        await shot(page, context, devDir, state + '.error').catch(() => {});
        results.push({ device: devId, state, file: errFile, viewport: dev.viewport, error: e.message.split('\n')[0] });
        console.log('  ✗ ' + state + '  ' + e.message.split('\n')[0]);
        console.log('    （错误现场: ' + path.relative(ROOT, errFile) + '）');
      }
    }
    await context.close();
  }

  await browser.close();
  if (server) server.close();

  // manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    url: baseUrl,
    deviceMatrix: Object.fromEntries(Object.entries(DEVICES).map(([k, v]) => [k, { label: v.label, viewport: v.viewport, dpr: args.dpr ? v.dpr : 1, states: v.states }])),
    captures: results,
    passed: failures === 0,
    elapsedMs: Date.now() - startedAt,
  };
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('');
  console.log(failures === 0
    ? '✅ 多端预览全部通过 (' + results.length + ' 张截图，' + manifest.elapsedMs + 'ms)'
    : '❌ 有 ' + failures + ' 个状态失败 — 稳定性门禁未通过');
  console.log('清单: ' + path.relative(ROOT, path.join(args.out, 'manifest.json')));
  console.log('后续: 用 vision 工具逐张检查截图，改动前后对比（vision_pixel_diff）验证只影响目标区域。');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('运行失败: ' + e.message); process.exit(1); });
