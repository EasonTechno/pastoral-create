'use strict';

const Cloud = (() => {
  const TOKEN_KEY = 'pastoral_cloud_token';
  const API = '/api';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  const revisions = JSON.parse(localStorage.getItem('pastoral_cloud_revisions') || '{}');
  const $ = id => document.getElementById(id);
  function request(path, options = {}){
    options.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) options.headers.Authorization = 'Bearer ' + token;
    return fetch(API + path, options).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok){ const e = new Error(d.error || '云端服务不可用'); e.status = r.status; e.data = d; throw e; } return d; });
  }
  function setLogged(data){
    if (data && data.token){ token = data.token; localStorage.setItem(TOKEN_KEY, token); }
    const user = data && data.user;
    $('accountForm').classList.toggle('hidden', !user);
    $('accountLogged').classList.toggle('hidden', !user);
    $('accountState').textContent = user ? `已登录：${user.username} · 云端存档 ${user.saves.length} 个 · 同步正常` : '未登录。登录后可在手机、电脑间同步存档。';
    if (user) renderSaves(user.saves);
    renderProfile(user);
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
    list.forEach(s => { revisions[s.key] = s.rev; const row = document.createElement('div'); row.className = 'cloud-save-row'; row.innerHTML = `<span>${s.name}</span><small>版本 ${s.rev || 1} · ${s.planetName || '未知星球'} · ${s.playMin || 0}分</small>`; const b = document.createElement('button'); b.textContent = '读取'; b.className = 'boot-btn small'; b.onclick = () => request('/saves/' + encodeURIComponent(s.key)).then(d => { revisions[s.key] = d.save.rev; persistRevisions(); return Game.loadCloudData(d.save.data); }).catch(e => UI.bigMessage('读取失败', e.message)); row.appendChild(b); box.appendChild(row); });
    persistRevisions();
  }
  function open(){ UI.closeAll(); $('accountPanel').classList.remove('hidden'); if (token) request('/me').then(setLogged).catch(() => { token = ''; localStorage.removeItem(TOKEN_KEY); setLogged(null); }); else renderProfile(null); }
  function login(register){ const username = $('accountName').value, password = $('accountPassword').value; request(register ? '/register' : '/login', { method: 'POST', body: JSON.stringify({ username, password }) }).then(setLogged).catch(e => UI.bigMessage('账号操作失败', e.message)); }
  function refresh(){ request('/me').then(setLogged).catch(e => UI.bigMessage('刷新失败', e.message)); }
  function logout(){ token = ''; localStorage.removeItem(TOKEN_KEY); setLogged(null); }
  function persistRevisions(){ localStorage.setItem('pastoral_cloud_revisions', JSON.stringify(revisions)); }
  function setStatus(text){ const el = $('accountState'); if (el) el.textContent = text; }
  function checkRemote(){
    if (!token) return;
    request('/saves').then(d => {
      const newer = d.saves.some(s => revisions[s.key] !== undefined && Number(s.rev) > Number(revisions[s.key]));
      if (newer) setStatus('发现其他设备的新存档 · 请打开云端账号选择读取');
    }).catch(() => {});
  }
  function upload(key, data, meta){
    if (!token) return Promise.reject(new Error('请先登录云端账号'));
    setStatus('正在同步云端存档…');
    return request('/saves', { method: 'POST', body: JSON.stringify({ key, data, baseRev: revisions[key] === undefined ? null : revisions[key], ...meta }) }).then(result => { revisions[key] = result.save.rev; persistRevisions(); setStatus(`云端同步完成 · 版本 ${result.save.rev}`); return result; });
  }
  function resolveConflict(key, data, meta, error){
    const remote = error && error.data && error.data.save;
    setStatus('同步冲突：云端存档已被其他设备更新');
    const useRemote = confirm(`存档「${meta.name || key}」发生冲突。\n确定：使用云端版本\n取消：保留本地版本并尝试覆盖云端`);
    if (useRemote && remote) return Game.loadCloudData(remote.data).then(() => { revisions[key] = remote.rev; persistRevisions(); setStatus(`已使用云端版本 ${remote.rev}`); });
    return request('/saves', { method: 'POST', body: JSON.stringify({ key, data, force: true, ...meta }) }).then(result => { revisions[key] = result.save.rev; persistRevisions(); setStatus(`已确认覆盖云端 · 版本 ${result.save.rev}`); });
  }
  document.addEventListener('DOMContentLoaded', () => { $('btnAccount').onclick = open; $('btnLogin').onclick = () => login(false); $('btnRegister').onclick = () => login(true); $('btnCloudRefresh').onclick = refresh; $('btnLogout').onclick = logout; setInterval(checkRemote, 30000); });
  return { open, upload, resolveConflict, get logged(){ return !!token; } };
})();
window.Cloud = Cloud;
