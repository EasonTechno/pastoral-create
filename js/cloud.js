'use strict';

/* ============================================================
   发条农庄 — 云端存档同步（本地优先 / 断网自动队列 / 实时统一）
   ============================================================
   原则：
   - 存档永远先写本地（localStorage），再异步上传云端；
   - 断网时保存只写本地并打“待同步”标记，不影响游戏；
   - 恢复联网后立即自动同步（syncAll），无需手动；
   - 每个存档维护一份同步标识 syncMap：cloudRev / dirty / status / origin / lastSyncAt。
   服务器 API 不变（rev 冲突检测 + force 覆盖）。
   ============================================================ */
'use strict';

const Cloud = (() => {
  const TOKEN_KEY = 'pastoral_cloud_token';
  const INDEX_KEY = 'pastoral_create_index_v1';
  const SYNC_KEY = 'pastoral_cloud_sync_v1';
  const API = '/api';
  let token = localStorage.getItem(TOKEN_KEY) || '';

  function readIndex(){ try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch(e){ return []; } }
  function writeIndex(arr){ localStorage.setItem(INDEX_KEY, JSON.stringify(arr)); }
  function readSync(){ try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); } catch(e){ return {}; } }
  let syncMap = readSync();
  function persistSync(){ try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncMap)); } catch(e){} }
  function entryOf(list, key){ return list.find(e => e.key === key); }

  const $ = id => document.getElementById(id);
  function request(path, options = {}){
    options.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) options.headers.Authorization = 'Bearer ' + token;
    return fetch(API + path, options).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok){ const e = new Error(d.error || '云端服务不可用'); e.status = r.status; e.data = d; throw e; } return d; });
  }

  // ---------- 同步标识 ----------
  function statusText(key){
    const sm = syncMap[key];
    if (!sm) return '未同步';
    if (sm.status === 'conflict') return '⚠ 冲突';
    if (sm.status === 'offline') return '离线 · 待同步';
    if (sm.dirty) return '本地 · 待同步';
    if (sm.cloudRev && sm.origin === 'cloud') return `云端 v${sm.cloudRev} · 已同步`;
    if (sm.cloudRev) return `云端 v${sm.cloudRev} · 已同步`;
    return '本地';
  }
  function setStatus(text){
    const el = $('accountState'); if (el) el.textContent = text;
  }
  function syncSummary(){
    const idx = readIndex();
    const dirty = idx.filter(e => syncMap[e.key] && syncMap[e.key].dirty).length;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!token) return offline ? '未登录（离线）' : '未登录';
    if (offline) return `离线模式 · 本地优先 · 待同步 ${dirty}`;
    const pending = idx.filter(e => syncMap[e.key] && (syncMap[e.key].dirty || syncMap[e.key].status === 'conflict')).length;
    return pending ? `已连接 · ${pending} 个存档待统一` : `已连接 · 云端实时统一`;
  }

  // ---------- 登录 / 渲染 ----------
  function setLogged(data){
    if (data && data.token){ token = data.token; localStorage.setItem(TOKEN_KEY, token); }
    const user = data && data.user;
    $('accountForm').classList.toggle('hidden', !user);
    $('accountLogged').classList.toggle('hidden', !user);
    $('accountState').textContent = user ? `已登录：${user.username} · ${syncSummary()}` : '未登录。登录后可在手机、电脑间同步存档。';
    if (user) renderSaves(user.saves);
    renderProfile(user);
    if (user) syncAll();
  }
  function renderProfile(user){
    const box = $('accountProfile'); if (!box) return;
    if (!user){ box.innerHTML = '<h3>田园档案</h3><div class="profile-empty">登录后显示你的旅程</div>'; return; }
    const s = window.Game && Game.profileStats ? Game.profileStats() : null;
    if (!s){ box.innerHTML = '<h3>田园档案</h3><div class="profile-empty">进入游戏后生成统计</div>'; return; }
    box.innerHTML = `<h3>${user.username} 的田园档案</h3><div class="profile-badge">✿ ${s.quest === '14/14' ? '主线完成' : '开垦中的新生活'}</div><div class="profile-grid"><span>游玩时长<b>${s.playMin} 分钟</b></span><span>主线进度<b>${s.quest}</b></span><span>金币<b>🪙${s.credits}</b></span><span>农田格<b>${s.till}</b></span><span>播种次数<b>${s.plant}</b></span><span>收获次数<b>${s.harvest}</b></span><span>灌溉次数<b>${s.water}</b></span><span>机器数量<b>${s.machines}</b></span><span>已研科技<b>${s.tech}</b></span></div>`;
  }
  function renderSaves(list){
    const box = $('cloudSaveList'); box.innerHTML = list.length ? '' : '<div class="cloud-empty">暂无云存档</div>';
    list.forEach(s => {
      const status = statusText(s.key);
      const row = document.createElement('div'); row.className = 'cloud-save-row';
      row.innerHTML = `<span>${s.name}</span><small>v${s.rev || 1} · ${s.planetName || '未知星球'} · ${s.playMin || 0}分 · ${status}</small>`;
      const b = document.createElement('button'); b.textContent = '读取'; b.className = 'boot-btn small';
      b.onclick = () => request('/saves/' + encodeURIComponent(s.key)).then(d => {
        syncMap[s.key] = { cloudRev: d.save.rev, dirty: false, status: 'synced', origin: 'cloud', lastSyncAt: Date.now() };
        persistSync();
        return Game.loadCloudData(d.save.data);
      }).catch(e => UI.bigMessage('读取失败', e.message));
      row.appendChild(b); box.appendChild(row);
    });
  }

  // ---------- 云端上行（本地优先，失败仅打标记） ----------
  function markLocalDirty(key){
    const sm = syncMap[key] || {};
    sm.dirty = true;
    sm.origin = 'local';
    sm.lastEditAt = Date.now();
    syncMap[key] = sm;
    persistSync();
    return sm;
  }
  function push(key, opts = {}){
    const sm = markLocalDirty(key);
    if (!token) { sm.status = 'offline'; sm.dirty = true; persistSync(); return Promise.reject(new Error('请先登录')); }
    const raw = localStorage.getItem(key); if (!raw) return Promise.resolve();
    let data; try { data = JSON.parse(raw); } catch(e){ sm.status = 'conflict'; persistSync(); return Promise.resolve(); }
    const meta = loadMeta(key);
    const baseRev = sm.cloudRev === undefined ? null : sm.cloudRev;
    setStatus('正在同步云端存档…');
    return request('/saves', { method: 'POST', body: JSON.stringify({ key, data, baseRev, ...(meta || {}), ...(opts.force ? { force: true } : {}) }) })
      .then(result => {
        syncMap[key] = { cloudRev: result.save.rev, dirty: false, status: 'synced', origin: 'local', lastSyncAt: Date.now() };
        persistSync();
        setStatus(syncSummary());
        return result;
      })
      .catch(e => {
        sm.status = e.status === 409 ? 'conflict' : 'offline';
        sm.dirty = true; persistSync();
        setStatus(e.status === 409 ? '同步冲突' : '离线：本地优先，恢复后自动同步');
        throw e;
      });
  }
  function loadMeta(key){
    const idx = readIndex(); const e = entryOf(idx, key);
    return e ? { name: e.name, planetName: e.planetName, playMin: e.playMin } : {};
  }

  // ---------- 云端下行 ----------
  async function pull(key, remote){
    if (!token) return;
    try {
      const d = await request('/saves/' + encodeURIComponent(key));
      const save = d.save; if (!save || !save.data) return;
      localStorage.setItem(key, JSON.stringify(save.data));
      // 合并到本地索引（保留原有本地字段）
      const idx = readIndex();
      const ex = entryOf(idx, key);
      const entry = ex || { key, name: save.name || key, time: save.time, creative: false };
      entry.name = save.name || entry.name || key;
      entry.time = save.time || entry.time;
      entry.planetName = save.planetName || entry.planetName;
      entry.playMin = save.playMin !== undefined ? save.playMin : entry.playMin;
      if (ex) idx[idx.indexOf(ex)] = entry; else idx.push(entry);
      writeIndex(idx);
      syncMap[key] = { cloudRev: save.rev, dirty: false, status: 'synced', origin: 'cloud', lastSyncAt: Date.now() };
      persistSync();
      if (window.Game && Game.state !== 'menu' && key === Game.activeSaveKey) setStatus('云端已更新本档 · 请重新读取');
    } catch(e){ /* 单档拉取失败不影响其他 */ }
  }

  // ---------- 全量自动同步 ----------
  async function syncAll(){
    if (!token) return Promise.resolve();
    setStatus('正在自动同步…');
    try {
      const list = await request('/saves');
      const local = readIndex();
      const localByKey = new Map(local.map(e => [e.key, e]));
      const remoteByKey = new Map(list.map(s => [s.key, s]));
      const tasks = [];
      for (const [key, entry] of localByKey){
        const sm = syncMap[key] || {};
        const remote = remoteByKey.get(key);
        if (sm.dirty){
          if (remote && sm.cloudRev !== undefined && remote.rev > sm.cloudRev){ sm.status = 'conflict'; persistSync(); continue; }
          tasks.push(push(key, { force: !remote }).catch(() => {}));
        } else if (remote && remote.rev > (sm.cloudRev || 0)){
          tasks.push(pull(key, remote));
        }
      }
      for (const s of list){ if (!localByKey.has(s.key)) tasks.push(pull(s.key, s)); }
      await Promise.all(tasks);
      setStatus(syncSummary());
    } catch(e){
      setStatus('离线：本机存档优先，恢复后自动同步');
    }
  }
  function checkRemote(){ return syncAll(); }

  // ---------- 对外（兼容旧调用） ----------
  function upload(key, data, meta){
    // 本地优先：先把数据落到本地，再排队上传
    localStorage.setItem(key, JSON.stringify(data));
    const sm = markLocalDirty(key);
    sm.status = 'local';
    persistSync();
    return push(key);
  }
  function resolveConflict(key, data, meta, error){
    const remote = error && error.data && error.data.save;
    setStatus('同步冲突：云端存档已被其他设备更新');
    const useRemote = confirm(`存档「${meta.name || key}」发生冲突。\n确定：使用云端版本\n取消：保留本地版本并尝试覆盖云端`);
    if (useRemote && remote){
      return Game.loadCloudData(remote.data).then(() => {
        syncMap[key] = { cloudRev: remote.rev, dirty: false, status: 'synced', origin: 'cloud', lastSyncAt: Date.now() };
        persistSync(); setStatus(syncSummary());
      });
    }
    return push(key, { force: true }).then(r => { setStatus(syncSummary()); return r; });
  }

  function open(){ UI.closeAll(); $('accountPanel').classList.remove('hidden'); if (token) request('/me').then(setLogged).catch(() => { token = ''; localStorage.removeItem(TOKEN_KEY); setLogged(null); }); else renderProfile(null); }
  function login(register){ const username = $('accountName').value, password = $('accountPassword').value; request(register ? '/register' : '/login', { method: 'POST', body: JSON.stringify({ username, password }) }).then(setLogged).catch(e => UI.bigMessage('账号操作失败', e.message)); }
  function refresh(){ if (token) request('/me').then(setLogged).catch(e => UI.bigMessage('刷新失败', e.message)); else setLogged(null); }
  function logout(){ token = ''; localStorage.removeItem(TOKEN_KEY); setLogged(null); }

  // ---------- 断网本地优先 / 恢复立即统一 ----------
  function onOnline(){ if (token){ setStatus('网络已恢复 · 正在统一…'); syncAll(); } else setStatus(syncSummary()); }
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', () => { setStatus('离线模式 · 本地优先'); });

  document.addEventListener('DOMContentLoaded', () => {
    $('btnAccount').onclick = open; $('btnLogin').onclick = () => login(false); $('btnRegister').onclick = () => login(true);
    $('btnCloudRefresh').onclick = refresh; $('btnLogout').onclick = logout;
    setStatus(syncSummary());
    setInterval(syncAll, 30000);
  });

  return {
    open, upload, resolveConflict, syncAll, checkRemote,
    get logged(){ return !!token; },
    get status(){ return syncSummary(); },
    get syncMap(){ return syncMap; },
    markLocalDirty, push,
    syncBadge: key => statusText(key),
  };
})();
window.Cloud = Cloud;
