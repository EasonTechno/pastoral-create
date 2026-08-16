/* ============================================================
   STARFORGE - mods.js
   模组运行时：安装 / 启用 / 停用 / 数据注册 / 脚本 API / 资源加载
   详细开发文档见 docs/mods.md
   ============================================================ */
'use strict';

const Mods = (() => {
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = 'pastoral_mods_config_v1';
  const BLOCK_ID_KEY = 'pastoral_mods_blockids_v1';
  const DB_NAME = 'pastoral_mods_store_v1';
  const STORE = 'files';
  const SCHEMA = 1;
  const MAX_MANIFEST = 256 * 1024;
  const MAX_CODE = 512 * 1024;
  const MAX_FILE = 2 * 1024 * 1024;
  const MAX_PACK = 24 * 1024 * 1024;
  const ID_RE = /^[A-Za-z][A-Za-z0-9._-]{1,63}$/;
  const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
  const RECIPE_WHERE = new Set(['hand', 'furnace', 'assembler', 'refinery', 'both']);
  const MAX_MOD_DATA = 64 * 1024;        // 单个模组自定义数据上限（JSON 字节）
  const MAX_MOD_STORE = 512 * 1024;      // 所有模组自定义数据总上限

  let config = { version: 1, mods: [] };
  let blockIds = {};
  let bootErrors = [];
  let dirty = false;          // 有需要重载才完全生效的变更
  let booted = false;
  let currentOwner = null;
  const active = new Map();   // modId -> runtime
  const listeners = Object.create(null);
  const modData = Object.create(null);   // owner -> 自定义存档数据（随 Game.save 持久化）

  function storageGet(key, fallback){
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function storageSet(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }
  function persistConfig(){ storageSet(CONFIG_KEY, config); }
  function persistIds(){ storageSet(BLOCK_ID_KEY, blockIds); }
  function normPath(p){ return String(p || '').replace(/\\/g, '/').replace(/^\/+/, ''); }
  function baseName(p){ const n = normPath(p).split('/').pop(); return n.replace(/\.png$/i, ''); }
  function textOf(blob){ return blob.text(); }

  // ---------- 事件系统（模组脚本通过 Mods.on 挂接） ----------
  function on(event, fn){
    if (typeof fn !== 'function') throw new Error('Mods.on 的第二个参数必须是函数');
    fn.__pcModId = currentOwner;
    (listeners[event] || (listeners[event] = [])).push(fn);
    return () => off(event, fn);
  }
  function once(event, fn){
    const wrap = (...args) => { off(event, wrap); return fn(...args); };
    wrap.__pcModId = currentOwner;
    (listeners[event] || (listeners[event] = [])).push(wrap);
    return () => off(event, wrap);
  }
  function off(event, fn){
    const arr = listeners[event];
    if (arr){ const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); }
  }
  function emit(event, ...args){
    const arr = listeners[event];
    if (!arr || !arr.length) return;
    const prevOwner = currentOwner;
    for (const fn of arr.slice()){
      currentOwner = fn.__pcModId || prevOwner;
      try { fn(...args); }
      catch(e){ console.error('[mods]', event, 'hook error:', e); }
    }
    currentOwner = prevOwner;
  }
  function removeModListeners(modId){
    for (const event in listeners){
      listeners[event] = (listeners[event] || []).filter(fn => fn.__pcModId !== modId);
    }
  }

  // ---------- IndexedDB：模组包文件存储 ----------
  function idbOpen(){
    return new Promise((resolve, reject) => {
      if (!window.indexedDB){ reject(new Error('浏览器不支持 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
  }
  function idbWithStore(mode, fn){
    return idbOpen().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const out = fn(store);
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB 操作失败')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB 操作中止')); };
    }));
  }
  function idbPutFiles(modId, entries){
    return idbWithStore('readwrite', store => {
      for (const e of entries) store.put(e.blob, modId + '::' + normPath(e.path));
    });
  }
  function idbFiles(modId){
    return idbWithStore('readonly', store => new Promise((resolve, reject) => {
      const out = [];
      const prefix = modId + '::';
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur){
          if (String(cur.key).indexOf(prefix) === 0) out.push({ path: String(cur.key).slice(prefix.length), blob: cur.value });
          cur.continue();
        } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    }));
  }
  function idbDeleteMod(modId){
    return idbWithStore('readwrite', store => new Promise((resolve, reject) => {
      const prefix = modId + '::';
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur){ resolve(); return; }
        if (String(cur.key).indexOf(prefix) === 0) cur.delete();
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  }

  // ---------- 贴图 / 图标辅助 ----------
  function ensureTile(name){
    if (!name || typeof name !== 'string') throw new Error('tile 名称必须是字符串');
    if (typeof Tex === 'undefined' || !Tex.addTile) throw new Error('贴图运行时未就绪');
    Tex.addTile(name);
  }
  function ensureDefTiles(def){
    let t = def && def.tiles;
    if (typeof t === 'string'){ def.tiles = t = { all: t }; }
    if (t && typeof t === 'object'){
      for (const k in t) if (t[k] != null) ensureTile(t[k]);
    }
    return def;
  }
  function imageFromBlob(blob){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }

  // ---------- 方块 ID 分配（存档稳定：同一 mod 同一方块始终保持同一 id） ----------
  function occupiedBlockIds(){
    const used = new Set();
    for (const k in BLOCKS){ const id = Number(BLOCKS[k].id); if (Number.isFinite(id)) used.add(id); }
    return used;
  }
  function nextModBlockId(){
    let id = 128;
    for (const v of Object.values(blockIds)) id = Math.max(id, Number(v) + 1);
    return id;
  }
  function reserveBlockId(owner, key){
    const mapKey = owner + '::' + key;
    if (blockIds[mapKey] !== undefined){
      const id = Number(blockIds[mapKey]);
      if (!(id >= 128 && id <= 255)) throw new Error('模组方块 id 映射损坏');
      return id;
    }
    const used = occupiedBlockIds();
    let id = nextModBlockId();
    while (used.has(id) && id <= 255) id++;
    if (id > 255) throw new Error('模组方块 id 已用尽（最多 128 个模组方块）');
    blockIds[mapKey] = id;
    persistIds();
    return id;
  }

  // ---------- 模组自定义存档数据 ----------
  function ownerBucket(owner){
    const o = owner || currentOwner || 'script';
    if (!modData[o]) modData[o] = {};
    return { owner: o, bucket: modData[o] };
  }
  function dataBytes(obj){
    try { return new Blob([JSON.stringify(obj)]).size; } catch(e){ return 0; }
  }
  function setDataFor(owner, key, value){
    const { owner: o, bucket } = ownerBucket(owner);
    if (key === undefined || key === null) throw new Error('Mods.setData 需要 key');
    const next = Object.assign({}, bucket);
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (dataBytes(next) > MAX_MOD_DATA) throw new Error(`模组 ${o} 自定义数据超过 ${MAX_MOD_DATA / 1024}KB`);
    const total = Object.keys(modData).reduce((n, id) => n + dataBytes(modData[id]), 0) + dataBytes(next) - dataBytes(bucket);
    if (total > MAX_MOD_STORE) throw new Error('所有模组自定义数据超过 512KB 总上限');
    if (value === undefined) delete bucket[key];
    else bucket[key] = value;
    return value;
  }
  function getDataFor(owner, key, fallback){
    const { bucket } = ownerBucket(owner);
    return key in bucket ? bucket[key] : fallback;
  }
  function resetModData(){
    for (const k in modData) delete modData[k];
  }
  function serializeModData(){
    const out = {};
    for (const id in modData){
      if (!Object.keys(modData[id]).length) continue;
      out[id] = modData[id];
    }
    return out;
  }
  function restoreModData(data){
    resetModData();
    if (!data || typeof data !== 'object') return;
    for (const id in data){
      if (!data[id] || typeof data[id] !== 'object') continue;
      modData[id] = JSON.parse(JSON.stringify(data[id]));
    }
  }

  // ---------- 数据注册 API ----------
  function addBlock(owner, key, def){
    if (!KEY_RE.test(key)) throw new Error('方块 key 非法：' + key);
    if (!def || typeof def !== 'object') throw new Error('方块定义必须是对象');
    const existing = BLOCKS[key];
    const ours = existing && existing.__pcMod === owner;
    if (existing && !ours && !def.override){
      throw new Error(`方块 key "${key}" 已存在，如需覆盖请设置 override: true`);
    }
    const merged = Object.assign({}, ours ? existing : {}, def);
    if (merged.override !== undefined) delete merged.override;
    merged.key = key;
    merged.id = ours ? existing.id : reserveBlockId(owner, key);
    if (!merged.name) merged.name = key;
    if (merged.solid === undefined) merged.solid = true;
    ensureDefTiles(merged);
    BLOCKS[key] = merged;
    BLOCK_BY_ID[merged.id] = merged;
    merged.__pcMod = owner;
    // 便捷项：item:true 或 item:{...} 自动生成对应可放置方块物品
    if (merged.item){
      const tile = merged.tiles && (merged.tiles.all || merged.tiles.top || merged.tiles.side || merged.tiles.front);
      const itemDef = merged.item === true ? {} : Object.assign({}, merged.item);
      const autoItem = Object.assign({
        name: merged.name,
        cat: 'blk',
        block: key,
        stack: merged.stack || 250,
        desc: merged.desc || '模组方块',
        price: merged.price || 1,
      }, itemDef);
      if (autoItem.iconBlock === undefined && tile) autoItem.iconBlock = tile;
      addItem(owner, key, autoItem);
    }
    return merged;
  }
  function addItem(owner, key, def){
    if (!KEY_RE.test(key)) throw new Error('物品 key 非法：' + key);
    if (!def || typeof def !== 'object') throw new Error('物品定义必须是对象');
    const existing = ITEMS[key];
    if (existing && existing.__pcMod && existing.__pcMod !== owner && !def.override){
      throw new Error(`物品 key "${key}" 已被模组 ${existing.__pcMod} 占用`);
    }
    const merged = Object.assign({}, existing || {}, def);
    if (merged.override !== undefined) delete merged.override;
    merged.id = key;
    if (!merged.name) merged.name = key;
    if (!merged.cat) merged.cat = 'mat';
    if (!merged.stack) merged.stack = 250;
    if (!merged.iconBlock && merged.block && BLOCKS[merged.block] && BLOCKS[merged.block].tiles){
      const t = BLOCKS[merged.block].tiles;
      merged.iconBlock = t.all || t.top || t.side || t.front;
    }
    if (merged.iconBlock) ensureTile(merged.iconBlock);
    ITEMS[key] = merged;
    merged.__pcMod = owner;
    return merged;
  }
  function addRecipe(owner, def){
    if (!def || !def.id || !def.out || !def.in) throw new Error('配方需要 id/out/in');
    if (!RECIPE_WHERE.has(def.where)) throw new Error('配方 where 必须是 hand/furnace/assembler/refinery/both');
    const existing = RECIPE_BY_ID[def.id];
    if (existing && existing.__pcMod && existing.__pcMod !== owner && !def.override) throw new Error('配方 id 已被占用');
    const recipe = Object.assign({}, existing && existing.__pcMod === owner ? existing : {}, def);
    recipe.time = Number(recipe.time || 1);
    recipe.__pcMod = owner;
    if (!existing) RECIPES.push(recipe);
    else RECIPES[RECIPES.indexOf(existing)] = recipe;
    RECIPE_BY_ID[recipe.id] = recipe;
    return recipe;
  }
  function addTech(owner, key, def){
    if (!KEY_RE.test(key)) throw new Error('科技 key 非法：' + key);
    const existing = TECH[key];
    const merged = Object.assign({}, existing || {}, def || {});
    merged.id = key;
    if (!merged.name) merged.name = key;
    if (!merged.icon) merged.icon = Object.keys(merged.cost || {})[0] || 'data';
    if (!merged.cost) merged.cost = {};
    if (!merged.time) merged.time = 10;
    if (!merged.req) merged.req = [];
    TECH[key] = merged;
    merged.__pcMod = owner;
    return merged;
  }
  function addQuest(owner, def){
    if (!def || !def.id || !def.title || !def.type) throw new Error('任务需要 id/title/type');
    const existing = QUESTS.find(q => q.id === def.id);
    if (existing) return existing;
    const q = Object.assign({}, def);
    q.__pcMod = owner;
    QUESTS.push(q);
    return q;
  }
  function addCrop(owner, key, def){
    if (!KEY_RE.test(key)) throw new Error('作物 key 非法：' + key);
    if (!def || !def.tiles || !def.tiles.length) throw new Error('作物需要 tiles 生长贴图数组');
    for (const t of def.tiles) ensureTile(t);
    const existing = CROPS[key];
    const merged = Object.assign({}, existing || {}, def);
    merged.id = key;
    if (!merged.name) merged.name = key;
    if (!merged.seed) merged.seed = key + '_seed';
    if (!merged.produce) merged.produce = key;
    merged.stages = Number(merged.stages || merged.tiles.length);
    merged.tiles.length = merged.stages;
    if (!merged.stageTime) merged.stageTime = 32;
    if (!merged.season) merged.season = '四季';
    if (!merged.baseYield) merged.baseYield = 1;
    CROPS[key] = merged;
    merged.__pcMod = owner;
    return merged;
  }
  function addTrait(owner, key, def){
    if (!KEY_RE.test(key)) throw new Error('词条 key 非法：' + key);
    const merged = Object.assign({}, TRAITS[key] || {}, def || {});
    merged.id = key;
    if (!merged.name) merged.name = key;
    if (!merged.kind) merged.kind = '显性';
    TRAITS[key] = merged;
    merged.__pcMod = owner;
    return merged;
  }
  function addTradeGood(itemId){
    if (!ITEMS[itemId]) throw new Error('交易品必须是已注册物品：' + itemId);
    if (!TRADE_GOODS.includes(itemId)) TRADE_GOODS.push(itemId);
  }
  function patchItem(key, patch){ return addItem(currentOwner || 'script', key, Object.assign({ override: true }, patch)); }
  function patchBlock(key, patch){ return addBlock(currentOwner || 'script', key, Object.assign({ override: true }, patch)); }
  function patchRecipe(id, patch){ return addRecipe(currentOwner || 'script', Object.assign({ override: true, id }, patch)); }

  // ---------- 模组清单校验 / 数据应用 / 脚本执行 ----------
  function validateManifest(m){
    if (!m || typeof m !== 'object') throw new Error('mod.json 不是对象');
    if (Number(m.schemaVersion || 1) > SCHEMA) throw new Error('模组 schemaVersion 高于当前支持版本');
    if (!ID_RE.test(m.id || '')) throw new Error('mod.json 缺少合法 id');
    if (!m.name) throw new Error('mod.json 缺少 name');
    if (!m.version) throw new Error('mod.json 缺少 version');
    if (m.requires && !Array.isArray(m.requires)) throw new Error('requires 必须是数组');
  }
  function applyManifestData(owner, m){
    const d = m.data || {};
    if (d.blocks) for (const k in d.blocks) addBlock(owner, k, d.blocks[k]);
    if (d.items) for (const k in d.items) addItem(owner, k, d.items[k]);
    if (d.recipes) for (const r of d.recipes) addRecipe(owner, r);
    if (d.tech) for (const k in d.tech) addTech(owner, k, d.tech[k]);
    if (d.quests) for (const q of d.quests) addQuest(owner, q);
    if (d.crops) for (const k in d.crops) addCrop(owner, k, d.crops[k]);
    if (d.traits) for (const k in d.traits) addTrait(owner, k, d.traits[k]);
    if (d.tradeGoods) for (const id of d.tradeGoods) addTradeGood(id);
    if (d.fuelValue && typeof d.fuelValue === 'object') Object.assign(FUEL_VALUE, d.fuelValue);
  }
  function makePC(owner){
    return {
      get game(){ return window.Game || null; },
      get ui(){ return window.UI || null; },
      get world(){ return window.World || null; },
      get player(){ return window.Player || null; },
      get factory(){ return window.Factory || null; },
      get farm(){ return window.Farm || null; },
      get space(){ return window.Space || null; },
      get sound(){ return window.Sound || null; },
      BLOCKS, ITEMS, RECIPES, RECIPE_BY_ID, TECH, QUESTS, CROPS, TRAITS, BIOMES,
      FUEL_VALUE, TRADE_GOODS, Tex, Icons, THREE,
      log(...args){ console.log('%c[' + owner + ']', 'color:#8ad66e', ...args); },
      warn(...args){ console.warn('[' + owner + ']', ...args); },
      error(...args){ console.error('[' + owner + ']', ...args); },
      registerBlock: (k, d) => addBlock(owner, k, d),
      registerItem: (k, d) => addItem(owner, k, d),
      registerRecipe: d => addRecipe(owner, d),
      registerTech: (k, d) => addTech(owner, k, d),
      registerQuest: d => addQuest(owner, d),
      registerCrop: (k, d) => addCrop(owner, k, d),
      registerTrait: (k, d) => addTrait(owner, k, d),
      setTexture: (tile, img) => { ensureTile(tile); Tex.setTileImage(tile, img); Tex.refreshTextureUses(); },
      setItemIcon: (itemId, img) => Icons.setItemIcon(itemId, img),
      setData: (key, value) => setDataFor(owner, key, value),
      getData: (key, fallback) => getDataFor(owner, key, fallback),
    };
  }
  function executeScript(rec){
    if (!rec.code) return;
    const codeFile = rec.scriptFile || 'main.js';
    const source = '"use strict";\n' + rec.code + '\n//# sourceURL=pcmod://' + rec.id + '/' + codeFile;
    const fn = new Function(
      'Mods', 'PC', 'BLOCKS', 'ITEMS', 'RECIPES', 'RECIPE_BY_ID', 'TECH', 'QUESTS',
      'CROPS', 'TRAITS', 'BIOMES', 'FUEL_VALUE', 'TRADE_GOODS', 'Tex', 'Icons', 'THREE',
      source
    );
    fn(Mods, makePC(rec.id), BLOCKS, ITEMS, RECIPES, RECIPE_BY_ID, TECH, QUESTS,
       CROPS, TRAITS, BIOMES, FUEL_VALUE, TRADE_GOODS, Tex, Icons, THREE);
  }
  function activateRecord(rec){
    if (active.has(rec.id)) return active.get(rec.id);
    let manifest;
    try {
      manifest = typeof rec.manifest === 'string' ? JSON.parse(rec.manifest) : rec.manifest;
      validateManifest(manifest);
      if (manifest.requires){
        for (const dep of manifest.requires){
          if (!config.mods.some(m => m.enabled && m.id === dep)) throw new Error('缺少依赖模组：' + dep);
        }
      }
      const prevOwner = currentOwner;
      currentOwner = rec.id;
      applyManifestData(rec.id, manifest);
      executeScript(rec);
      currentOwner = prevOwner;
      if (window.Game && listeners.gameReady){
        const prevOwner = currentOwner;
        for (const fn of listeners.gameReady.slice()){
          if (fn.__pcModId !== rec.id) continue;
          currentOwner = rec.id;
          try { fn(window.Game); } catch(e){ console.error('[mods] gameReady 补触发失败', rec.id, e); }
        }
        currentOwner = prevOwner;
      }
      rec.loadError = null;
      const rt = { ok: true, manifest, at: Date.now() };
      active.set(rec.id, rt);
      if (window.UI && UI.refreshAll) UI.refreshAll();   // 运行时安装/启用后即时刷新合成与背包
      return rt;
    } catch(e){
      removeModListeners(rec.id);   // 加载失败时不残留半注册的钩子
      rec.loadError = String(e && e.message || e);
      bootErrors.push({ id: rec.id, name: rec.name || rec.id, error: rec.loadError });
      console.error('[mods] 模组加载失败', rec.id, e);
      const rt = { ok: false, manifest: manifest || null, error: rec.loadError, at: Date.now() };
      active.set(rec.id, rt);
      return rt;
    } finally {
      currentOwner = null;
    }
  }
  function boot(){
    if (booted) return;
    booted = true;
    config = storageGet(CONFIG_KEY, { version: 1, mods: [] });
    blockIds = storageGet(BLOCK_ID_KEY, {});
    bootErrors = [];
    // 依赖优先的拓扑顺序：requires 声明的模组先激活（循环依赖留给加载错误面板提示）
    const byId = new Map(config.mods.map(m => [m.id, m]));
    const enabled = config.mods.filter(m => m.enabled);
    const done = new Set();
    while (enabled.length){
      let progressed = false;
      for (let i = enabled.length - 1; i >= 0; i--){
        const rec = enabled[i];
        let m;
        try { m = typeof rec.manifest === 'string' ? JSON.parse(rec.manifest) : rec.manifest; } catch(e){ m = {}; }
        const deps = (m.requires || []).filter(d => !done.has(d));
        if (deps.length && byId.has(deps[0]) && byId.get(deps[0]).enabled) continue;
        activateRecord(rec);
        done.add(rec.id);
        enabled.splice(i, 1);
        progressed = true;
      }
      if (!progressed) break;   // 循环依赖：剩余模组仍按原顺序尝试加载
    }
    for (const rec of enabled) activateRecord(rec);
    loadAllAssets();
    bindUI();
  }

  // ---------- 模组资源加载 ----------
  async function loadAssetsFor(rec){
    const rt = active.get(rec.id);
    const manifest = (rt && rt.manifest) || (typeof rec.manifest === 'string' ? JSON.parse(rec.manifest) : rec.manifest) || {};
    let entries = [];
    try { entries = await idbFiles(rec.id); }
    catch(e){ return; }
    if (!entries.length) return;
    const byPath = {};
    for (const e of entries) byPath[normPath(e.path)] = e;
    let touched = false;
    const mappings = Array.isArray(manifest.textures) ? manifest.textures : null;
    async function applyEntry(entry, mapping){
      if (!/\.png$/i.test(entry.path)) return;
      let img;
      try { img = await imageFromBlob(entry.blob); } catch(e){ return; }
      if (mapping){
        if (mapping.tile){
          ensureTile(mapping.tile);
          Tex.setTileImage(mapping.tile, img);
          touched = true;
        }
        if (mapping.item && Icons && Icons.setItemIcon){
          Icons.setItemIcon(mapping.item, img);
          touched = true;
        }
      } else {
        const base = baseName(entry.path);
        if (Tex.hasTile(base)){
          Tex.setTileImage(base, img);
          touched = true;
        } else if (ITEMS[base] && Icons && Icons.setItemIcon){
          Icons.setItemIcon(base, img);
          touched = true;
        }
      }
    }
    if (mappings){
      for (const m of mappings){
        const path = normPath(m.file || '');
        const entry = byPath[path];
        if (entry) await applyEntry(entry, m);
      }
    } else {
      for (const e of entries) await applyEntry(e, null);
    }
    if (touched && Tex && Tex.refreshTextureUses) Tex.refreshTextureUses();
  }
  function loadAllAssets(){
    for (const rec of config.mods){
      if (rec.enabled && active.has(rec.id)) loadAssetsFor(rec).catch(e => console.warn('[mods] 资源加载失败', rec.id, e));
    }
  }

  function manifestOf(rec){
    try { return typeof rec.manifest === 'string' ? JSON.parse(rec.manifest) : rec.manifest; }
    catch(e){ return null; }
  }
  // 依赖模组安装/启用成功后，重试此前因缺少该依赖而加载失败的模组。
  function retryDependents(depId){
    const retried = [];
    for (const rec of config.mods){
      if (!rec.enabled || rec.id === depId) continue;
      const rt = active.get(rec.id);
      if (!rt || rt.ok) continue;
      const m = manifestOf(rec);
      if (!m || !Array.isArray(m.requires) || !m.requires.includes(depId)) continue;
      active.delete(rec.id);
      removeModListeners(rec.id);
      const next = activateRecord(rec);
      if (next.ok){
        bootErrors = bootErrors.filter(e => e.id !== rec.id);
        loadAssetsFor(rec).catch(() => {});
        retried.push(rec.id);
      }
    }
    return retried;
  }

  // 按存档应用模组启用集合：读档时把当前全局启用状态切到该存档的模组清单。
  // 模组清单（enabledIds）与数据（modData）都随存档保存，因此每个存档独立拥有自己的模组配置。
  function applySaveEnabled(ids){
    const set = new Set(ids || []);
    let changed = false;
    for (const rec of config.mods){
      const next = set.has(rec.id);
      if (rec.enabled === next) continue;
      rec.enabled = next;
      changed = true;
      if (next){
        const rt = activateRecord(rec);
        if (rt.ok) loadAssetsFor(rec).catch(() => {});
      } else {
        removeModListeners(rec.id);
        active.delete(rec.id);
      }
    }
    if (changed && window.UI && UI.refreshPanel) UI.refreshPanel();
    return changed;
  }

  // ---------- 安装 ----------
  async function installFromEntries(entries, sourceName){
    if (typeof Tex === 'undefined' || !Tex.readZip) throw new Error('ZIP 读取器未就绪');
    if (sourceName && !/\.(zip|pcmod)$/i.test(sourceName)) throw new Error('请选择 .pcmod 或 .zip 文件');
    let total = 0;
    for (const e of entries){
      total += e.blob.size || 0;
      if ((e.blob.size || 0) > MAX_FILE) throw new Error('包内文件超过 2MB：' + e.path);
    }
    if (total > MAX_PACK) throw new Error('模组包超过 24MB');
    const paths = entries.map(e => normPath(e.path));
    const manifestEntry = entries.find(e => normPath(e.path) === 'mod.json')
      || entries.find(e => /^[^/]+\/mod\.json$/.test(normPath(e.path)));
    if (!manifestEntry) throw new Error('压缩包缺少 mod.json（需位于包根目录）');
    const manifestText = await textOf(manifestEntry.blob);
    if (manifestText.length > MAX_MANIFEST) throw new Error('mod.json 超过 256KB');
    const manifest = JSON.parse(manifestText);
    validateManifest(manifest);
    const scriptFile = manifest.script || 'main.js';
    const codeEntry = entries.find(e => normPath(e.path) === scriptFile || normPath(e.path).endsWith('/' + scriptFile));
    let code = '';
    if (codeEntry){
      code = await textOf(codeEntry.blob);
      if (code.length > MAX_CODE) throw new Error(scriptFile + ' 超过 512KB');
    }
    const exists = config.mods.findIndex(m => m.id === manifest.id);
    if (exists >= 0){
      await idbDeleteMod(manifest.id).catch(() => {});
      active.delete(manifest.id);
      removeModListeners(manifest.id);
    }
    const rec = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author || '',
      description: manifest.description || '',
      icon: manifest.icon || '',
      gameVersion: manifest.gameVersion || '',
      manifest: manifestText,
      scriptFile,
      code,
      enabled: true,
      installedAt: Date.now(),
    };
    const oldMods = config.mods.slice();
    config.mods = config.mods.filter(m => m.id !== manifest.id).concat(rec);
    try { persistConfig(); }
    catch(e){
      config.mods = oldMods;
      throw new Error('浏览器本地存储空间不足，无法保存模组配置');
    }
    await idbPutFiles(rec.id, entries).catch(e => console.warn('[mods] 资源写入 IndexedDB 失败，脚本仍可运行', e));
    activateRecord(rec);
    bootErrors = bootErrors.filter(e => e.id !== rec.id);
    loadAssetsFor(rec).catch(() => {});
    const retried = retryDependents(rec.id);
    dirty = true;
    refreshPanel();
    return Object.assign(rec, { retriedDependents: retried });
  }
  async function installFromFile(file){
    if (!file) return null;
    const entries = await Tex.readZip(file);
    return installFromEntries(entries, file.name);
  }
  async function installFromInput(){
    const input = $('modFile');
    const file = input && input.files && input.files[0];
    if (!file) return;
    try {
      const rec = await installFromFile(file);
      if (typeof Sound !== 'undefined' && Sound.play) Sound.play('craft');
      const retryNote = rec.retriedDependents && rec.retriedDependents.length
        ? ` · 已重试依赖模组 ${rec.retriedDependents.length} 个`
        : '';
      if (typeof UI !== 'undefined' && UI.bigMessage) UI.bigMessage('模组安装成功', `${rec.name} v${rec.version} · 重启游戏后完整生效${retryNote}`, 4200);
    } catch(e){
      console.error('[mods] 安装失败', e);
      if (typeof UI !== 'undefined' && UI.bigMessage) UI.bigMessage('模组安装失败', String(e && e.message || e), 5200);
    } finally {
      input.value = '';
    }
  }

  // ---------- 管理操作 ----------
  function restart(){
    try {
      if (window.Game && window.Game.state !== 'menu' && window.Game.state !== 'loading') window.Game.save();
    } catch(e){}
    location.reload();
  }
  function toggleEnabled(id, enabled){
    const rec = config.mods.find(m => m.id === id);
    if (!rec) return;
    rec.enabled = !!enabled;
    if (rec.enabled){
      const rt = activateRecord(rec);
      if (!rt.ok){
        rec.enabled = false;
        persistConfig();
        refreshPanel();
        if (typeof UI !== 'undefined' && UI.bigMessage) UI.bigMessage('模组启用失败', rt.error, 4200);
        return;
      }
      bootErrors = bootErrors.filter(e => e.id !== rec.id);
      loadAssetsFor(rec).catch(() => {});
      retryDependents(rec.id);
      dirty = false;
    } else {
      removeModListeners(id);
      active.delete(id);
      dirty = true;
    }
    persistConfig();
    refreshPanel();
    if (typeof Sound !== 'undefined' && Sound.play) Sound.play('uiClick');
    if (typeof UI !== 'undefined' && UI.bigMessage) UI.bigMessage(rec.enabled ? '模组已启用' : '模组已停用', rec.enabled ? '数据已热加载，复杂脚本建议重启' : '重启游戏后完全移除其数据', 3200);
  }
  function uninstall(id){
    const rec = config.mods.find(m => m.id === id);
    if (!rec) return;
    if (!window.confirm(`确认卸载模组「${rec.name}」？\n卸载后重启游戏，其方块/物品/配方会被移除。`)) return;
    config.mods = config.mods.filter(m => m.id !== id);
    persistConfig();
    idbDeleteMod(id).catch(() => {});
    removeModListeners(id);
    active.delete(id);
    bootErrors = bootErrors.filter(e => e.id !== id);
    dirty = true;
    refreshPanel();
    if (typeof Sound !== 'undefined' && Sound.play) Sound.play('uiClose');
    if (typeof UI !== 'undefined' && UI.bigMessage) UI.bigMessage('模组已卸载', '重启游戏后生效；相关存档方块会变为未知方块', 4200);
  }

  // ---------- 管理面板 UI ----------
  function refreshPanel(){
    const list = $('modsList');
    if (!list) return;
    const head = $('modsCount');
    if (head){
      const on = config.mods.filter(m => m.enabled).length;
      head.textContent = `${config.mods.length} 个模组 · ${on} 个启用`;
    }
    list.innerHTML = '';
    if (bootErrors.length){
      const box = document.createElement('div');
      box.className = 'mods-errors';
      for (const err of bootErrors){
        const row = document.createElement('div');
        row.className = 'mods-error-row';
        row.textContent = `⚠ ${err.name || err.id}：${err.error}`;
        box.appendChild(row);
      }
      list.appendChild(box);
    }
    if (!config.mods.length){
      const empty = document.createElement('div');
      empty.className = 'mods-empty';
      empty.innerHTML = '<b>还没有安装模组</b><p>点击「＋ 安装 Mod 包」选择 .pcmod / .zip 文件。开发者请阅读 docs/mods.md。</p>';
      list.appendChild(empty);
      return;
    }
    for (const rec of config.mods.slice().reverse()){
      const row = document.createElement('div');
      row.className = 'mod-row';
      row.dataset.modId = rec.id;
      const icon = document.createElement('div');
      icon.className = 'mod-icon';
      icon.textContent = '📦';
      const info = document.createElement('div');
      info.className = 'mod-info';
      const name = document.createElement('div');
      name.className = 'mod-name';
      name.textContent = rec.name + '  ' + 'v' + rec.version;
      const meta = document.createElement('div');
      meta.className = 'mod-meta';
      meta.textContent = `${rec.id}${rec.author ? ' · ' + rec.author : ''}${rec.description ? ' — ' + rec.description : ''}`;
      const status = document.createElement('div');
      const rt = active.get(rec.id);
      if (!rec.enabled){ status.className = 'mod-status off'; status.textContent = '已停用'; }
      else if (rt && !rt.ok){ status.className = 'mod-status error'; status.textContent = '加载失败'; }
      else if (rt && rt.ok){ status.className = 'mod-status on'; status.textContent = dirty ? '已启用 · 建议重启' : '已启用'; }
      else { status.className = 'mod-status on'; status.textContent = '待加载'; }
      const actions = document.createElement('div');
      actions.className = 'mod-actions';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'boot-btn small';
      toggleBtn.textContent = rec.enabled ? '停用' : '启用';
      toggleBtn.onclick = () => toggleEnabled(rec.id, !rec.enabled);
      const delBtn = document.createElement('button');
      delBtn.className = 'boot-btn small danger';
      delBtn.textContent = '卸载';
      delBtn.onclick = () => uninstall(rec.id);
      const loadState = document.createElement('div');
      loadState.className = 'mod-loadstate';
      if (rt && !rt.ok) loadState.textContent = '错误：' + rt.error;
      else if (rec.loadError) loadState.textContent = '错误：' + rec.loadError;
      actions.appendChild(toggleBtn);
      actions.appendChild(delBtn);
      info.appendChild(name);
      info.appendChild(meta);
      if (loadState.textContent) info.appendChild(loadState);
      row.appendChild(icon);
      row.appendChild(info);
      row.appendChild(status);
      row.appendChild(actions);
      list.appendChild(row);
    }
    loadPanelIcons();
  }
  const panelIconUrls = new Map();
  function loadPanelIcons(){
    for (const rec of config.mods){
      if (!rec.icon) continue;
      idbFiles(rec.id).then(entries => {
        const target = normPath(rec.icon);
        const entry = entries.find(e => normPath(e.path) === target || normPath(e.path).endsWith('/' + target));
        if (!entry || !/\.(png|jpe?g|gif|webp)$/i.test(entry.path)) return;
        const row = Array.from(document.querySelectorAll('.mod-row')).find(r => r.dataset.modId === rec.id);
        const icon = row && row.querySelector('.mod-icon');
        if (!icon) return;
        const oldUrl = panelIconUrls.get(rec.id);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        const url = URL.createObjectURL(entry.blob);
        panelIconUrls.set(rec.id, url);
        icon.textContent = '';
        icon.style.background = `url("${url}") center / cover no-repeat`;
      }).catch(() => {});
    }
  }
  function openPanel(){
    const el = $('modsPanel');
    if (el) el.classList.remove('hidden');
    refreshPanel();
  }
  function bindUI(){
    const file = $('modFile');
    const installBtn = $('btnInstallMod');
    if (installBtn) installBtn.onclick = () => { file && file.click(); };
    if (file) file.onchange = installFromInput;
    const reloadBtn = $('btnModsReload');
    if (reloadBtn) reloadBtn.onclick = () => {
      if (typeof Sound !== 'undefined' && Sound.play) Sound.play('uiClick');
      restart();
    };
  }

  // ---------- 对外 API ----------
  const api = {
    on, once, off, emit,
    addBlock: (key, def) => addBlock(currentOwner || 'script', key, def),
    addItem: (key, def) => addItem(currentOwner || 'script', key, def),
    addRecipe: def => addRecipe(currentOwner || 'script', def),
    addTech: (key, def) => addTech(currentOwner || 'script', key, def),
    addQuest: def => addQuest(currentOwner || 'script', def),
    addCrop: (key, def) => addCrop(currentOwner || 'script', key, def),
    addTrait: (key, def) => addTrait(currentOwner || 'script', key, def),
    addTradeGood: id => addTradeGood(id),
    patchBlock, patchItem, patchRecipe,
    setData: (key, value) => setDataFor(currentOwner || 'script', key, value),
    getData: (key, fallback) => getDataFor(currentOwner || 'script', key, fallback),
    getModData(modId, key, fallback){ return getDataFor(modId, key, fallback); },
    setModData(modId, key, value){ return setDataFor(modId, key, value); },
    resetData: resetModData,
    serializeData: serializeModData,
    restoreData: restoreModData,
    setTexture: (tile, img) => { ensureTile(tile); Tex.setTileImage(tile, img); Tex.refreshTextureUses(); },
    setItemIcon: (itemId, img) => { if (Icons && Icons.setItemIcon) Icons.setItemIcon(itemId, img); },
    list(){
      return config.mods.map(m => {
        const rt = active.get(m.id);
        return {
          id: m.id, name: m.name, version: m.version, author: m.author,
          description: m.description, enabled: m.enabled,
          status: !m.enabled ? 'disabled' : rt && !rt.ok ? 'error' : rt ? 'active' : 'pending',
          error: rt && !rt.ok ? rt.error : (m.loadError || null),
        };
      });
    },
    enabledIds(){ return config.mods.filter(m => m.enabled).map(m => m.id); },
    has(id){ return config.mods.some(m => m.id === id && m.enabled); },
    installFromFile, installFromEntries, uninstall, toggleEnabled, applySaveEnabled, restart,
    refreshPanel, openPanel, bindUI,
    get dirty(){ return dirty; },
    get version(){ return (typeof document !== 'undefined' && document.querySelector && document.querySelector('meta[name=game-version]') || {}).content || '0.0.0'; },
    get errors(){ return bootErrors.slice(); },
    boot,
  };
  return api;
})();

// 加载时机：本脚本位于 data.js 之后、farm/world/ui/main 之前。
// 同步应用数据补丁 + 执行模组脚本，保证后续游戏模块初始化时能看到模组内容。
window.Mods = Mods;
Mods.boot();
