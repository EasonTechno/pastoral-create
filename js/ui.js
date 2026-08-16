/* ============================================================
   STARFORGE - ui.js
   HUD / 背包 / 合成 / 机器面板 / 科技树 / 贸易 / 提示
   ============================================================ */
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  let cursorStack = null;        // 鼠标携带的物品
  let lastTouchTooltip = 0;      // 最近一次触摸显示 tooltip 的时间（屏蔽兼容鼠标事件误隐藏）
  let lastTouchAny = 0;          // 最近一次任意触摸开始时间（屏蔽兼容 mousedown 误拾取）
  let wsMode = 'craft';          // 工作台右栏：craft | machine | breed | trait
  let wsBackMode = null;         // 词条取用视图的返回模式
  let wsTraitGetter = null;      // 词条取用视图的数据源 () => stack
  let wsTraitSetter = null;      // 数据源对应槽位的 setter
  let selectedSlot = null;       // {el, get, set, kind?, adjust?, removeVariant?} 三段式点按的第一段（选中）

  function clearSelection(){
    if (selectedSlot){
      if (selectedSlot.el) selectedSlot.el.classList.remove('ws-sel');
      selectedSlot = null;
    }
  }
  // 选中某个词条变体（二级）：单击选中，点其他栏位移动
  function selectVariantRow(getStack, tr, rowEl){
    clearSelection();
    const s = getStack();
    if (!s) return;
    const vs = () => (s.variants && s.variants.length ? s.variants : [{ tr: s.tr || [], n: s.n }]);
    selectedSlot = {
      kind: 'variant', el: rowEl,
      get: () => {
        const st = getStack(); if (!st) return null;
        const vv = vs().find(x => x.n > 0 && x.tr.length === tr.length && x.tr.every(id => tr.includes(id)));
        return vv ? { item: st.item, n: vv.n, tr: vv.tr.slice() } : null;
      },
      adjust: n => { const vv = vs().find(x => x.tr.length === tr.length && x.tr.every(id => tr.includes(id))); if (vv){ vv.n -= n; if (vv.n < 0) vv.n = 0; } },
      removeVariant: () => {
        const st = getStack(); if (!st) return;
        const vv = vs().find(x => x.tr.length === tr.length && x.tr.every(id => tr.includes(id)));
        if (vv) vv.n = 0;
        const rem = vs().filter(x => x.n > 0);
        st.variants = rem.length ? rem : [];
        st.tr = rem.length ? rem[0].tr.slice() : [];
        st.n = rem.reduce((a, x) => a + x.n, 0);
        if (st.n <= 0 && wsTraitSetter) wsTraitSetter(null);
      },
    };
    rowEl.classList.add('ws-sel');
    lastTouchTooltip = Date.now();
    const vstack = selectedSlot.get();
    if (vstack) showTooltip({ clientX: innerWidth / 2, clientY: innerHeight / 2 }, vstack.item, null, vstack.tr || []);
  }
  // 将已选中的变体移动到目标槽位（合并/放置/交换）
  function moveVariantSelected(targetGet, targetSet, acceptFilter){
    const src = selectedSlot.get();
    if (!src){ clearSelection(); return; }
    if (acceptFilter && !acceptFilter(src.item)){ Sound.play('uiError'); return; }
    const dst = targetGet();
    if (dst && dst.item === src.item && dst.n < ITEMS[dst.item].stack){
      const n = Math.min(src.n, ITEMS[dst.item].stack - dst.n);
      if (isTraitStack(dst.item)) transferVariants(dst, src, n);
      else { dst.n += n; src.n -= n; }
      selectedSlot.adjust(-n);
      if (!src.n) selectedSlot.removeVariant();
    } else if (!dst){
      targetSet(cloneStack(src));
      selectedSlot.removeVariant();
    } else {
      const tmp = cloneStack(dst);
      targetSet(cloneStack(src));
      selectedSlot.removeVariant();
      Player.addItem(tmp.item, tmp.n, true, tmp.tr);
    }
    clearSelection(); refreshAll(); Sound.play('uiClick');
    tooltip().classList.add('hidden');
  }
  function renderWs(){           // 按当前模式渲染右栏：词条区置顶，基础内容在其下
    const host = $('wsRight');
    if (!host || $('invPanel').classList.contains('hidden')) return;
    if (wsMode === 'machine' && openMachine && (openMachine.type === 'chest' || openMachine.type === 'collector') && !wsTraitGetter){
      // 箱子/收集点：就地刷新槽位，避免整栏重建把列表弹回顶端
      const list = host.querySelector('.warehouse-list');
      if (list){
        const d = openMachine.data;
        for (let i = 0; i < d.slots.length && i < list.children.length; i++) fillWarehouseRow(list.children[i], d.slots[i]);
        return;
      }
    }
    const base = document.createElement('div'); base.className = 'ws-base';
    if (wsMode === 'machine'){ renderMachineInto(base); }
    else if (wsMode === 'breed'){ renderBreedInto(base); }
    else { buildCraftInto(base); }
    host.innerHTML = '';
    if (wsTraitGetter){ const t = document.createElement('div'); renderTraitSection(t); host.appendChild(t); }
    host.appendChild(base);
  }
  let openMachine = null;
  let craftCat = 'all';
  let craftQueue = [];           // {recipe, t}

  // ---------- 通用 ----------
  function anyPanelOpen(){
    return ['invPanel','machinePanel','tradePanel','pausePanel','helpPanel','savePanel','settingsPanel','mapPanel','encyPanel','breedingPanel','techPanel','accountPanel','questTreePanel','modsPanel']
      .some(id => !$(id).classList.contains('hidden'));
  }
  function closeAll(){
    ['invPanel','machinePanel','techPanel','tradePanel','pausePanel','helpPanel','savePanel','settingsPanel','mapPanel','encyPanel','breedingPanel','accountPanel','questTreePanel','modsPanel']
      .forEach(id => $(id).classList.add('hidden'));
    openMachine = null;
    tooltip().classList.add('hidden');   // 强制隐藏，不受触摸守卫影响
    clearSelection();
    wsTraitGetter = null;
    dropCursor();
    if (encyReturnToInv){              // 图鉴从背包打开，关闭后回背包
      encyReturnToInv = false;
      $('invPanel').classList.remove('hidden');
      refreshInv();
    }
  }
  function toggle(id){
    const el = $(id);
    const willOpen = el.classList.contains('hidden');
    closeAll();
    if (willOpen){
      el.classList.remove('hidden');
      Sound.play('uiOpen');
      if (id === 'invPanel'){ wsMode = 'craft'; wsBackMode = null; wsTraitGetter = null; refreshInv(); }
       if (id === 'techPanel') refreshTech();
      if (id === 'modsPanel' && window.Mods && Mods.refreshPanel) Mods.refreshPanel();
      document.exitPointerLock && document.exitPointerLock();
    } else {
      Sound.play('uiClose');
      Game.lockPointer();
    }
    return willOpen;
  }
  function dropCursor(){
    if (cursorStack){ Player.addItem(cursorStack.item, cursorStack.n, true); cursorStack = null; updateGhost(); }
  }

  // ---------- Tooltip ----------
  const tooltip = () => $('tooltip');
  function showTooltip(e, itemId, extra, traits){
    const it = ITEMS[itemId];
    if (!it) return;
    lastHoverItem = itemId;
    const t = tooltip();
    const cat = { res:'资源', mat:'材料', blk:'方块', mach:'机器', tool:'工具' }[it.cat] || '';
    traits = traits || (e && e._traits) || [];
    const traitCards = traits.map((id, i) => TRAITS[id] ? `<span class="gene-card ${TRAITS[id].kind === '显性' ? 'dominant' : 'recessive'}"><i>槽${i + 1}</i><b>${TRAITS[id].kind}</b>${TRAITS[id].name}</span>` : '').join('');
    const trHtml = traits.length
      ? `<div class="tt-traits"><div class="tt-tl">双基因槽</div><div class="gene-cards">${traitCards}</div></div>`
      : `<div class="tt-traits"><div class="tt-tl">词条</div><span class="trait-chip t-null">普通</span></div>`;
    const variantNote = e && e._variants && e._variants.length > 1 ? `<div class="tt-variants">含 ${e._variants.length} 种词条组合</div>` : '';
    t.innerHTML = `<div class="tt-name">${it.name}</div><div class="tt-cat">${cat} · 基准价 🪙${it.price}</div>${trHtml}${variantNote}<div class="tt-desc">${it.desc || ''}${extra ? '<br>' + extra : ''}</div><div class="tt-hint" style="margin-top:5px;font-size:10px;color:#7b6447"><b>R</b> 配方 · <b>U</b> 用途</div>`;
    t.classList.remove('hidden');
    moveTooltip(e);
  }
  function moveTooltip(e){
    const t = tooltip();
    t.style.visibility = 'hidden'; t.classList.remove('hidden');
    const r = t.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, e.clientX + 16));
    const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, e.clientY + 14));
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    t.style.visibility = 'visible';
  }
  function hideTooltip(){
    if (Date.now() - lastTouchTooltip < 5000) return;   // 触摸显示后屏蔽浏览器补发的兼容 mouseleave
    tooltip().classList.add('hidden');
  }
  function showTraitBox(crop){
    const box = $('traitBox');
    if (!box) return;
    if (!crop || !crop.cell || !crop.def){ box.classList.add('hidden'); return; }
    const traits = crop.cell.tr || [];
    const seasonal = !crop.def.season || crop.def.season.includes(Game.season) ? '当季' : `非当季 · 适宜 ${crop.def.season}`;
    const genes = traits.map((id, i) => TRAITS[id] ? `<span class="gene-card ${TRAITS[id].kind === '显性' ? 'dominant' : 'recessive'}"><i>槽${i + 1}</i><b>${TRAITS[id].kind}</b>${TRAITS[id].name}</span>` : '').join('');
    box.innerHTML = `<b>${crop.def.name}</b><small>生长 ${crop.cell.stage + 1}/${crop.def.stages} · ${crop.cell.water ? '水润' : '待浇水'} · ${seasonal}</small><div class="gene-cards">${genes}</div>`;
    box.classList.remove('hidden');
  }

  // ---------- 拾取通知 ----------
  function pickupToast(item, n){
    const box = $('pickups');
    // 合并最近同类
    const last = box.firstChild;
    if (last && last.dataset.item === item){
      last.dataset.n = +last.dataset.n + n;
      last.querySelector('.pn').textContent = '+' + last.dataset.n;
      clearTimeout(+last.dataset.tm);
      last.dataset.tm = setTimeout(() => last.remove(), 2600);
      return;
    }
    const el = document.createElement('div');
    el.className = 'pickup';
    el.dataset.item = item; el.dataset.n = n;
    el.appendChild(Icons.img(item));
    const span = document.createElement('span');
    span.textContent = ITEMS[item].name;
    el.appendChild(span);
    const pn = document.createElement('span'); pn.className = 'pn'; pn.textContent = '+' + n;
    el.appendChild(pn);
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    el.dataset.tm = setTimeout(() => el.remove(), 2600);
  }
  function bigMessage(title, sub, dur = 3200){
    const el = $('bigMsg');
    el.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    el.classList.remove('hidden');
    clearTimeout(el._tm);
    el._tm = setTimeout(() => el.classList.add('hidden'), dur);
  }

  // ---------- 槽位渲染 ----------
  function fillSlot(el, stack){
    el.innerHTML = el.querySelector('.num') ? el.querySelector('.num').outerHTML : '';
    if (stack){
      el.appendChild(Icons.img(stack.item));
      if (stack.tr && stack.tr.length) el.insertAdjacentHTML('beforeend', '<span class="trdot"></span>');
      const c = document.createElement('span');
      c.className = 'cnt';
      c.textContent = stack.n > 1 ? stack.n : '';
      el.appendChild(c);
    }
  }
  function cloneStack(s){
    return s ? { ...s, variants: s.variants && s.variants.map(v => ({ tr: v.tr.slice(), n: v.n })) } : s;
  }
  function isTraitStack(item){
    return !!(ITEMS[item] && (ITEMS[item].iconFn === 'seed' || Object.values(CROPS).some(c => c.produce === item)));
  }
  // 把 src 中 n 个物品按词条组合转移进 dest（保持双基因变体账本）
  function transferVariants(dest, src, n){
    if (!n) return 0;
    let left = n;
    const srcVs = src.variants && src.variants.length ? src.variants : [{ tr: src.tr || [], n: src.n }];
    const destVs = dest.variants || (dest.tr && dest.tr.length ? [{ tr: dest.tr.slice(), n: dest.n }] : []);
    for (const v of srcVs){
      if (left <= 0 || v.n <= 0) continue;
      const take = Math.min(v.n, left);
      const dv = destVs.find(x => x.tr.length === v.tr.length && x.tr.every(id => v.tr.includes(id)));
      if (dv) dv.n += take; else destVs.push({ tr: v.tr.slice(), n: take });
      v.n -= take; src.n -= take; left -= take;
    }
    if (src.variants) src.variants = srcVs.filter(x => x.n > 0);
    dest.variants = destVs.filter(x => x.n > 0);
    dest.n = destVs.reduce((a, v) => a + v.n, 0);
    dest.tr = destVs.length ? destVs[0].tr.slice() : (dest.tr || []);
    return n - left;
  }
  function fillWarehouseRow(el, stack){
    el.innerHTML = '';
    const icon = document.createElement('span'); icon.className = 'warehouse-icon';
    const info = document.createElement('span'); info.className = 'warehouse-info';
    const qty = document.createElement('span'); qty.className = 'warehouse-qty';
    if (stack){
      icon.appendChild(Icons.img(stack.item));
      const variants = stack.variants && stack.variants.length ? stack.variants : [{ tr: stack.tr || [], n: stack.n }];
      const genes = variants.filter(v => v.n > 0).map(v => (v.tr || []).map(id => TRAITS[id] ? TRAITS[id].name : id).join(' + ') || '普通').join(' · ');
      info.innerHTML = `<b>${ITEMS[stack.item].name}</b><small>${genes}${variants.length > 1 ? ` · ${variants.length} 组词条` : ''}</small>`;
      qty.textContent = `${stack.n} / ${ITEMS[stack.item].stack}`;
      if (stack.tr && stack.tr.length){
        el.classList.add('has-genes');
        if (!el.querySelector('.ws-trait-tag')) el.insertAdjacentHTML('beforeend', '<span class="ws-trait-tag" title="点击查看词条取用">词条</span>');
      } else el.classList.remove('has-genes');
    } else {
      info.innerHTML = '<b>空仓位</b><small>可拖入物品或从快捷栏装填</small>';
      qty.textContent = '—'; el.classList.remove('has-genes');
    }
    el.append(icon, info, qty);
  }
  // 触摸拖拽（面板槽位与 HUD 快捷栏共用）：轻触查看，拖到目标格交换/合并
  function bindTouchDrag(el, getStack, setStack, opts){
    const suppressDefault = !opts || opts.suppressDefault !== false;
    el.onpointerdown = e => {
      if (e.pointerType !== 'touch') return;
      lastTouchAny = Date.now();
      el._lastTouch = Date.now();
      el._touchSlot = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (suppressDefault) e.preventDefault();
    };
    el.onpointercancel = () => { el._touchSlot = null; el._lastTouch = Date.now(); if (!cursorStack) $('dragGhost').classList.add('hidden'); };
    // 触摸拖拽：物品图标跟随手指
    el.onpointermove = e => {
      if (e.pointerType !== 'touch' || !el._touchSlot || el._touchSlot.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - el._touchSlot.x, e.clientY - el._touchSlot.y) > 12){
        clearSelection();
        const s = getStack();
        if (s){
          const g = $('dragGhost');
          g.innerHTML = '';
          g.appendChild(Icons.img(s.item));
          if (s.n > 1){
            const c = document.createElement('span');
            c.className = 'cnt'; c.textContent = s.n;
            c.style.cssText = 'position:absolute;right:0;bottom:0;color:#fff;font:bold 12px Consolas;text-shadow:1px 1px 2px #000';
            g.appendChild(c);
          }
          g.classList.remove('hidden');
          g.style.left = (e.clientX - 22) + 'px';
          g.style.top = (e.clientY - 22) + 'px';
        }
      }
    };
    el.onpointerup = e => {
      const start = el._touchSlot;
      if (!start || start.id !== e.pointerId) return;
      el._touchSlot = null;
      el._lastTouch = Date.now();   // 屏蔽触摸后浏览器补发的兼容 mouseleave 误隐藏 tooltip
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12;
      const source = getStack();
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const slot = target && target.closest ? target.closest('.slot, .hslot') : null;
      if (!moved || !slot || !slot._slot || slot === el){
        if (cursorStack){
          // 手持状态：点击目标格 → 放下 / 合并 / 交换
          const dest = getStack();
          if (dest && dest.item === cursorStack.item && dest.n < ITEMS[dest.item].stack){
            const n = Math.min(cursorStack.n, ITEMS[dest.item].stack - dest.n);
            if (isTraitStack(dest.item)) transferVariants(dest, cursorStack, n);
            else { dest.n += n; cursorStack.n -= n; }
            if (!cursorStack.n) cursorStack = null;
          } else if (!dest){
            setStack(cloneStack(cursorStack)); cursorStack = null;
          } else {
            const tmp = cloneStack(dest); setStack(cloneStack(cursorStack)); cursorStack = tmp;
          }
          clearSelection();
          updateGhost(); refreshAll(); Sound.play('uiClick');
          tooltip().classList.add('hidden');
          if (!cursorStack) $('dragGhost').classList.add('hidden');
        } else if (selectedSlot){
          if (selectedSlot.el === el){
            // 再点同一格：取消选中
            clearSelection(); tooltip().classList.add('hidden');
          } else if (selectedSlot.kind === 'variant'){
            moveVariantSelected(getStack, setStack, null);
          } else {
            // 点其他格 → 移动选中物品到该格（合并/交换）
            const src = selectedSlot.get();
            const dst = getStack();
            if (src){
              if (dst && dst.item === src.item && dst.n < ITEMS[dst.item].stack){
                const n = Math.min(src.n, ITEMS[dst.item].stack - dst.n);
                if (isTraitStack(dst.item)) transferVariants(dst, src, n);
                else { dst.n += n; src.n -= n; }
                if (!src.n) selectedSlot.set(null);
              } else if (!dst){
                setStack(cloneStack(src)); selectedSlot.set(null);
              } else {
                const tmp = cloneStack(dst); setStack(cloneStack(src)); selectedSlot.set(tmp);
              }
            }
            clearSelection();
            refreshAll(); Sound.play('uiClick');
            tooltip().classList.add('hidden');
          }
        } else if (source){
          if (opts && opts.hotbar){
            // 快捷栏（游戏内 HUD）：点击仅选中，不拿起、不弹详情
            clearSelection();
            if (el._hotIdx !== undefined){ Player.hotIdx = el._hotIdx; refreshHotbar(); showItemName(); Sound.play('uiClick'); }
            return;
          }
          // 第一次点击 → 选中 + 详情；带词条物品切右侧“词条取用”
          clearSelection();
          selectedSlot = { el, get: getStack, set: setStack };
          el.classList.add('ws-sel');
          if (el._hotIdx !== undefined){ Player.hotIdx = el._hotIdx; refreshHotbar(); }
          lastTouchTooltip = Date.now();
          showTooltip({ clientX: start.x, clientY: start.y, _variants: source.variants }, source.item, null, source.tr || []);
          if (isTraitStack(source.item)){
            wsTraitGetter = getStack; wsTraitSetter = setStack;
            renderWs();
          }
        } else {
          clearSelection(); tooltip().classList.add('hidden');   // 点空仓位：清掉残留详情
        }
        return;
      }
      e.preventDefault();
      const to = slot._slot, dest = to.get();
      if (!source){ if (!cursorStack) $('dragGhost').classList.add('hidden'); return; }
      if (dest && dest.item === source.item && dest.n < ITEMS[dest.item].stack){
        const n = Math.min(source.n, ITEMS[dest.item].stack - dest.n);
        if (isTraitStack(dest.item)) transferVariants(dest, source, n);
        else { dest.n += n; source.n -= n; }
        if (!source.n) setStack(null);
      } else { setStack(dest ? cloneStack(dest) : null); to.set(cloneStack(source)); }
      Sound.play('uiClick'); refreshAll();
      tooltip().classList.add('hidden');   // 拖拽落地：清掉旧位置的详情
      if (!cursorStack) $('dragGhost').classList.add('hidden');
    };
    el._slot = { get: getStack, set: setStack };
  }
  function bindSlotEvents(el, getStack, setStack, idx){
    el.onmouseenter = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; const s = getStack(); if (s) { e._variants = s.variants; showTooltip(e, s.item, null, s.tr || []); Sound.play('hover'); } };
    el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
    el.onmouseleave = () => { if (Date.now() - (el._lastTouch || 0) < 5000) return; hideTooltip(); };
    el.oncontextmenu = e => e.preventDefault();
    // 仓库行不禁用默认手势：纵向滑动交给浏览器滚动；热栏/背包格保持拖拽优先
    bindTouchDrag(el, getStack, setStack, { suppressDefault: idx === undefined || idx < 8 });
    if (idx !== undefined && idx < 8) el._hotIdx = idx;
    el.onmousedown = e => {
      e.preventDefault();
      if (Date.now() - lastTouchAny < 8000) return;   // 触摸后浏览器补发的兼容 mousedown 忽略
      if (e.target !== el && e.target.closest && e.target.closest('button')) return;
      const s = getStack();
      Sound.play('uiClick');
      if (e.shiftKey && s && idx !== undefined){
        // 快捷移动：热栏<->背包
        const target = idx < 8 ? 8 : 0;
        const inv = Player.inv;
        for (let i = target; i < (target === 0 ? 8 : 36); i++){
          if (inv[i] && inv[i].item === s.item && inv[i].n < ITEMS[s.item].stack){
            const add = Math.min(s.n, ITEMS[s.item].stack - inv[i].n);
            if (isTraitStack(s.item)) transferVariants(inv[i], s, add);
            else { inv[i].n += add; s.n -= add; }
            if (!s.n){ setStack(null); break; }
          }
        }
        if (getStack()){
          for (let i = target; i < (target === 0 ? 8 : 36); i++){
            if (!inv[i]){ inv[i] = cloneStack(getStack()); setStack(null); break; }
          }
        }
        refreshAll(); return;
      }
      if (e.button === 0){
        if (!cursorStack && s){ cursorStack = cloneStack(s); setStack(null); el.classList.add('dragging'); }
        else if (cursorStack && !s){ setStack(cloneStack(cursorStack)); cursorStack = null; }
        else if (cursorStack && s){
          if (s.item === cursorStack.item && s.n < ITEMS[s.item].stack){
            const add = Math.min(cursorStack.n, ITEMS[s.item].stack - s.n);
            if (isTraitStack(s.item)) transferVariants(s, cursorStack, add);
            else { s.n += add; cursorStack.n -= add; }
            if (!cursorStack.n) cursorStack = null;
          } else {
            const tmp = cloneStack(s); setStack(cloneStack(cursorStack)); cursorStack = tmp;
          }
        }
      } else if (e.button === 2){
        if (!cursorStack && s){
          if (isTraitStack(s.item)){
            const picked = Player.splitVariant(s.item, (s.variants && s.variants.length ? s.variants[0].tr : s.tr) || []);
            if (picked){
              const half = Math.ceil(picked.n / 2);
              if (half < picked.n){
                // 只拆一半：把另一半放回原堆叠
                Player.addItem(picked.item, picked.n - half, true, picked.tr);
                picked.n = half;
              }
              cursorStack = picked;
            } else cursorStack = { item: s.item, n: 1 };
          } else {
            const half = Math.ceil(s.n / 2);
            cursorStack = { item: s.item, n: half };
            s.n -= half;
            if (!s.n) setStack(null);
          }
        } else if (cursorStack){
          if (!s){ setStack({ item: cursorStack.item, n: 1 }); cursorStack.n--; }
          else if (s.item === cursorStack.item && s.n < ITEMS[s.item].stack){ s.n++; cursorStack.n--; }
          if (cursorStack && !cursorStack.n) cursorStack = null;
        }
      }
      updateGhost();
      const current = getStack();
      if (current && current.tr && current.tr.length){ const target = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, _variants: current.variants }; showTooltip(target, current.item, null, current.tr); }
      refreshAll();
    };
  }
  function updateGhost(){
    const g = $('dragGhost');
    if (cursorStack){
      g.innerHTML = '';
      g.appendChild(Icons.img(cursorStack.item));
      if (cursorStack.n > 1){
        const c = document.createElement('span');
        c.className = 'cnt'; c.style.cssText = 'position:absolute;right:0;bottom:0;color:#fff;font:bold 12px Consolas;text-shadow:1px 1px 2px #000';
        c.textContent = cursorStack.n;
        g.appendChild(c);
      }
      g.classList.remove('hidden');
    } else g.classList.add('hidden');
  }
  document.addEventListener('mousemove', e => {
    const g = $('dragGhost');
    if (!g.classList.contains('hidden')){ g.style.left = (e.clientX - 22) + 'px'; g.style.top = (e.clientY - 22) + 'px'; }
    if (cursorStack){
      document.querySelectorAll('.slot.drag-over').forEach(el => el.classList.remove('drag-over'));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const slot = t && t.closest ? t.closest('.slot') : null;
      if (slot && slot._slot) slot.classList.add('drag-over');
    }
  });
  document.addEventListener('mouseup', () => {
    document.querySelectorAll('.slot.dragging, .slot.drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
  });
  // 任何触摸都记录时间，屏蔽触摸后浏览器补发的兼容鼠标事件
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') lastTouchAny = Date.now(); }, true);
  // 点 Tooltip 外部：优先关闭已有 Tooltip（点空白处抑制本次点按；点槽位则放行其操作）
  document.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const tt = $('tooltip');
    if (tt.classList.contains('hidden')) return;
    const t = e.target;
    const onSlot = t && t.closest && t.closest('.slot, .hslot, .mslot, .mrp, .ws-trait-row, button');
    lastTouchTooltip = 0;
    tt.classList.add('hidden');
    if (!onSlot){ e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ---------- 快捷栏 ----------
  function laserIcon(){
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    const px = (a, b, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    px(6, 14, '#4e5a63', 16, 6);            // 机身
    px(8, 12, '#68747d', 12, 2);            // 上盖
    px(20, 15, '#333d44', 8, 4);            // 枪管
    px(27, 14, '#c9641a', 2, 6);            // 枪口环
    px(9, 20, '#333d44', 3, 6);             // 握把
    px(10, 15, '#35e0e8', 5, 3);            // 能量屏
    px(5, 15, '#c9641a', 2, 4);             // 尾饰
    return c;
  }
  function buildHotbar(){
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++){
      const el = document.createElement('div');
      el.className = 'hslot' + (i === 0 ? ' hand' : '');
      if (i === 0){
        // 1 号位 = 交互位：恒为🖐，选中即空手交互方块
        el.innerHTML = `<span class="num">1</span><span class="hand-glyph">🖐</span>`;
        el.onclick = () => { Player.hotIdx = -1; refreshHotbar(); showItemName(); Sound.play('uiClick'); };
        el._hotIdx = -1;
      } else {
        const idx = i - 1;
        el.innerHTML = `<span class="num">${i + 1}</span>`;
        el.onclick = () => { Player.hotIdx = idx; refreshHotbar(); showItemName(); Sound.play('uiClick'); };
        el._hotIdx = idx;
        bindTouchDrag(el, () => Player.inv[idx], v => Player.inv[idx] = v, { suppressDefault: false, hotbar: true });
      }
      hb.appendChild(el);
    }
  }
  function refreshHotbar(){
    const hb = $('hotbar');
    if (!hb.children.length) buildHotbar();
    for (let i = 0; i < 9; i++){
      const el = hb.children[i];
      if (i === 0){
        el.classList.toggle('sel', Player.hotIdx === -1);
      } else {
        el.classList.toggle('sel', (i - 1) === Player.hotIdx);
        fillSlot(el, Player.inv[i - 1]);
      }
    }
  }
  // 切换物品名称标签（MC 风格短暂显示）
  let itemLabelTm = null;
  function showItemName(){
    const el = $('itemLabel');
    if (!el) return;
    let name;
    if (Player.hotIdx === -1) name = '';
    else {
      const s = Player.inv[Player.hotIdx];
      name = s ? ITEMS[s.item].name + (ITEMS[s.item].block ? '' : '') : '';
    }
    if (!name){ el.classList.remove('show'); return; }
    el.textContent = name;
    el.classList.add('show');
    clearTimeout(itemLabelTm);
    itemLabelTm = setTimeout(() => el.classList.remove('show'), 900);
  }

  // ---------- 背包 ----------
  function buildInv(){
    const hot = $('invHotRow'), grid = $('invGrid');
    hot.innerHTML = ''; grid.innerHTML = '';
    for (let i = 0; i < 36; i++){
      const el = document.createElement('div');
      el.className = i < 8 ? 'slot' : 'slot warehouse-row';
      const idx = i;
      el._invIndex = idx;
      bindSlotEvents(el, () => Player.inv[idx], v => Player.inv[idx] = v, idx);
      (i < 8 ? hot : grid).appendChild(el);
    }
  }
  // 右栏：手工合成
  function buildCraftInto(host){
    host.innerHTML = '';
    const cats = [['all','全部'],['mat','材料'],['mach','机器'],['blk','方块']];
    const sec = document.createElement('div'); sec.className = 'inv-sec'; sec.textContent = '⚒ 手工合成';
    host.appendChild(sec);
    const tabs = document.createElement('div'); tabs.className = 'craft-tabs';
    for (const [k, name] of cats){
      const b = document.createElement('button');
      b.className = 'ctab' + (k === craftCat ? ' on' : '');
      b.textContent = name;
      b.onclick = () => { craftCat = k; Sound.play('uiClick'); buildCraftInto(host); refreshInv(); };
      tabs.appendChild(b);
    }
    host.appendChild(tabs);
    const list = document.createElement('div'); list.className = 'craft-list';
    for (const r of RECIPES){
      if (r.where !== 'hand' && r.where !== 'both') continue;
      if (r.hidden) continue;
      const outItem = Object.keys(r.out)[0];
      if (!ITEMS[outItem]) continue;   // 模组配方引用了未注册物品时安全跳过
      if (craftCat !== 'all' && ITEMS[outItem].cat !== craftCat) continue;
      const el = document.createElement('div');
      el.className = 'recipe';
      el.dataset.rid = r.id;
      const icon = document.createElement('div'); icon.className = 'ricon';
      icon.appendChild(Icons.img(outItem));
      el.appendChild(icon);
      const info = document.createElement('div'); info.className = 'rinfo';
      info.innerHTML = `<div class="rname">${ITEMS[outItem].name}${r.out[outItem] > 1 ? ' ×' + r.out[outItem] : ''}</div><div class="rcost"></div>`;
      el.appendChild(info);
      const btn = document.createElement('div'); btn.className = 'rbtn'; btn.textContent = '合成';
      btn.onclick = e => {
        e.stopPropagation();
        const n = e.shiftKey ? 5 : 1;
        let made = 0;
        for (let i = 0; i < n; i++){ if (tryCraft(r)) made++; else break; }
        if (made) Sound.play('craft');
        else {
          Sound.play('uiError');
          if (r.tech && !Game.techDone(r.tech)){
            bigMessage('科技未解锁', '需要研究「' + TECH[r.tech].name + '」才能合成', 2400);
          } else {
            const miss = Object.keys(r.in).filter(k => Player.countItem(k) < r.in[k]);
            if (miss.length) bigMessage('材料不足', '缺少 ' + miss.map(k => ITEMS[k].name + '×' + (r.in[k] - Player.countItem(k))).join('、'), 2800);
          }
        }
        refreshAll();
      };
      el.appendChild(btn);
      el.onmouseenter = e => showTooltip(e, outItem, r.tech && !Game.techDone(r.tech) ? `<span style="color:#ff5555">需要科技：${TECH[r.tech].name}</span>` : '');
      el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
      el.onmouseleave = hideTooltip;
      el.onclick = e => { openEncyclopedia(outItem); };
      list.appendChild(el);
    }
    host.appendChild(list);
  }
  function tryCraft(r){
    if (r.tech && !Game.techDone(r.tech)) return false;
    if (!Player.hasItems(r.in)) return false;
    // 加工继承词条：取第一个带词条原料，产物保留同组词条并享受加工加成
    let tr = [];
    outer:
    for (const id in r.in){
      for (const s of Player.inv){
        if (s && s.item === id && s.tr && s.tr.length){ tr = s.tr.slice(); break outer; }
      }
    }
    Player.payItems(r.in);
    // 难度产出倍率：合成产物整体按倍率放大
    for (const k in r.out){
      const n = Math.max(1, Math.round(r.out[k] * Game.dropMult * traitCraftMul(tr)));
      Player.addItem(k, n, true, tr);
    }
    const outItem = Object.keys(r.out)[0];
    pickupToast(outItem, Math.max(1, Math.round(r.out[outItem] * Game.dropMult * traitCraftMul(tr))));
    return true;
  }
  function refreshInv(){
    const hot = $('invHotRow'), grid = $('invGrid');
    if (!hot.children.length) buildInv();
    for (let i = 0; i < 8; i++){ fillSlot(hot.children[i], Player.inv[i]); hot.children[i].classList.toggle('sel', i === Player.hotIdx); }
    for (let i = 8; i < 36; i++) fillWarehouseRow(grid.children[i - 8], Player.inv[i]);
    const used = Player.inv.slice(8).filter(Boolean).length;
    if ($('warehouseUsed')) $('warehouseUsed').textContent = `${used} / 28 堆叠位`;
    if ($('inventorySummary')) $('inventorySummary').textContent = `仓库 ${used}/28 · 快捷栏 ${Player.inv.slice(0, 8).filter(Boolean).length}/8`;
    renderWs();
  }

  // ---------- 机器面板 ----------
  // 面板通用槽位绑定（支持 Shift 快速转移动作）
  function bindPanelSlot(el, getStack, setStack, shiftAction, acceptFilter, refill){
    const lightRefresh = () => {
      if (refill) refill();                       // 就地重绘当前槽（不重建 wsRight）
      const h = $('invHotRow'), g = $('invGrid');
      if (h && h.children.length) for (let i = 0; i < 8; i++) fillSlot(h.children[i], Player.inv[i]);
      if (g && g.children.length) for (let i = 8; i < 36; i++) fillWarehouseRow(g.children[i - 8], Player.inv[i]);
      const used = Player.inv.slice(8).filter(Boolean).length;
      if ($('warehouseUsed')) $('warehouseUsed').textContent = `${used} / 28 堆叠位`;
      if ($('inventorySummary')) $('inventorySummary').textContent = `仓库 ${used}/28 · 快捷栏 ${Player.inv.slice(0, 8).filter(Boolean).length}/8`;
      if (wsTraitGetter) renderWs();              // 词条区需要整栏重建
    };
    el.onmouseenter = e => { const s = getStack(); if (s) showTooltip(e, s.item); };
    el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
    el.onmouseleave = hideTooltip;
    el.oncontextmenu = e => e.preventDefault();
    el.onpointerup = e => {
      if (e.pointerType !== 'touch') return;
      const s = getStack();
      if (cursorStack){
        if (acceptFilter && !acceptFilter(cursorStack.item)){ Sound.play('uiError'); return; }
        if (s && s.item === cursorStack.item && s.n < ITEMS[s.item].stack){
          const add = Math.min(cursorStack.n, ITEMS[s.item].stack - s.n);
          setStack({ item: s.item, n: s.n + add }); cursorStack.n -= add;
          if (!cursorStack.n) cursorStack = null;
        } else if (!s){ setStack(cloneStack(cursorStack)); cursorStack = null; }
        else { const tmp = cloneStack(s); setStack(cloneStack(cursorStack)); cursorStack = tmp; }
        updateGhost(); lightRefresh(); Sound.play('uiClick');
      } else if (selectedSlot){
        if (selectedSlot.el === el){
          // 再点同一格：取消选中
          clearSelection(); tooltip().classList.add('hidden'); lightRefresh(); return;
        }
        if (selectedSlot.kind === 'variant'){
          moveVariantSelected(getStack, setStack, acceptFilter);
        } else {
          // 选中物品后点其他槽 → 快捷放入 / 移动（不“拿起”进光标）
          const src = selectedSlot.get();
          if (src){
            if (acceptFilter && !acceptFilter(src.item)){ Sound.play('uiError'); return; }
            if (s && s.item === src.item && s.n < ITEMS[s.item].stack){
              const n = Math.min(src.n, ITEMS[s.item].stack - s.n);
              if (isTraitStack(s.item)) transferVariants(s, src, n);
              else { s.n += n; src.n -= n; }
              if (!src.n) selectedSlot.set(null);
            } else if (!s){ setStack(cloneStack(src)); selectedSlot.set(null); }
            else { const tmp = cloneStack(s); setStack(cloneStack(src)); selectedSlot.set(tmp); }
          }
          clearSelection(); lightRefresh(); Sound.play('uiClick');
        }
      } else if (s){
        // 点有物品的槽：仅选中并展示词条，不“拿起”进光标
        clearSelection();
        selectedSlot = { el, get: getStack, set: setStack };
        el.classList.add('ws-sel');
        lastTouchTooltip = Date.now();
        showTooltip({ clientX: e.clientX, clientY: e.clientY, _variants: s.variants }, s.item, null, s.tr || []);
        if (isTraitStack(s.item)){ wsTraitGetter = getStack; wsTraitSetter = setStack; renderWs(); }
      }
    };
    el.onmousedown = e => {
      e.preventDefault();
      if (Date.now() - lastTouchAny < 8000) return;   // 触摸后浏览器补发的兼容 mousedown 忽略
      Sound.play('uiClick');
      const s = getStack();
      if (e.shiftKey && s && shiftAction){
        shiftAction(s, setStack);
      } else if (e.button === 0){
        if (!cursorStack && s){ cursorStack = cloneStack(s); setStack(null); }
        else if (cursorStack && !s){ setStack(cloneStack(cursorStack)); cursorStack = null; }
        else if (cursorStack && s){
          if (s.item === cursorStack.item){
            const add = Math.min(cursorStack.n, ITEMS[s.item].stack - s.n);
            setStack({ item: s.item, n: s.n + add });
            cursorStack.n -= add;
            if (!cursorStack.n) cursorStack = null;
          } else { const tmp = cloneStack(s); setStack(cloneStack(cursorStack)); cursorStack = tmp; }
        }
      } else if (e.button === 2){
        if (!cursorStack && s){
          const half = Math.ceil(s.n / 2);
          cursorStack = { item: s.item, n: half };
          setStack(s.n - half > 0 ? { item: s.item, n: s.n - half } : null);
        } else if (cursorStack){
          if (!s){ setStack({ item: cursorStack.item, n: 1 }); cursorStack.n--; }
          else if (s.item === cursorStack.item && s.n < ITEMS[s.item].stack){ setStack({ item: s.item, n: s.n + 1 }); cursorStack.n--; }
          if (cursorStack && !cursorStack.n) cursorStack = null;
        }
      }
      updateGhost();
      lightRefresh();
    };
  }
  function openInvWorkspace(mode){
    closeAll();
    $('invPanel').classList.remove('hidden');
    wsMode = mode || 'craft';
    wsBackMode = null;
    wsTraitGetter = null;
    clearSelection();
    document.exitPointerLock && document.exitPointerLock();
    $('wsTitle').textContent = mode === 'machine' ? '◈ 机器' : mode === 'breed' ? '◈ 种子工坊 · 选育' : '◈ 田园工作台';
    buildInv();
    refreshInv();
  }
  function openMachinePanel(m){
    const titles = { furnace: '熔炉', miner: '自动采矿机', assembler: '装配机', refinery: '精炼厂', chest: '储物箱', reactor: '核子反应堆', belt: '传送带', solar: '太阳能板', wind: '风力涡轮机', burner: '火力发电机', lumberbot: '伐木机器人', collector: '收集点', irrigator: '灌溉机', planter: '播种机', harvester: '收割机', sellbot: '收购站', vendor: '出售站', trash: '物品销毁机', filter: '过滤器', chute: '向漏斗' };
    openInvWorkspace('machine');
    openMachine = m;          // 必须在 closeAll 之后（closeAll 会清空 openMachine）
    $('wsTitle').textContent = '◈ ' + (titles[m.type] || m.type);
    renderWs();
    Sound.play(m.type === 'chest' || m.type === 'collector' ? 'openChest' : 'uiOpen');
  }
  function renderMachineInto(host){
    if (!openMachine) return;
    buildMachineBody(host);
  }
  function mslot(labelText, getStack, setStack, acceptFilter){
    const el = document.createElement('div');
    el.className = 'mslot';
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = labelText;
    el.appendChild(lbl);
    el.onmouseenter = e => { const s = getStack(); if (s) showTooltip(e, s.item); };
    el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
    el.onmouseleave = hideTooltip;
    el.oncontextmenu = e => e.preventDefault();
    el.onpointerup = e => {
      if (e.pointerType !== 'touch') return;
      const s = getStack();
      if (cursorStack){
        if (acceptFilter && !acceptFilter(cursorStack.item)){ Sound.play('uiError'); return; }
        if (s && s.item === cursorStack.item && s.n < ITEMS[s.item].stack){
          const add = Math.min(cursorStack.n, ITEMS[s.item].stack - s.n);
          setStack({ item: s.item, n: s.n + add }); cursorStack.n -= add;
          if (!cursorStack.n) cursorStack = null;
        } else if (!s){ setStack(cloneStack(cursorStack)); cursorStack = null; }
        else { const tmp = cloneStack(s); setStack(cloneStack(cursorStack)); cursorStack = tmp; }
        updateGhost(); refreshAll(); Sound.play('uiClick');
      } else if (selectedSlot){
        if (selectedSlot.kind === 'variant'){
          moveVariantSelected(getStack, setStack, acceptFilter);
        } else {
          // 选中物品后点机器槽 → 快捷放入
          const src = selectedSlot.get();
          if (src){
            if (acceptFilter && !acceptFilter(src.item)){ Sound.play('uiError'); return; }
            if (s && s.item === src.item && s.n < ITEMS[s.item].stack){
              const n = Math.min(src.n, ITEMS[s.item].stack - s.n);
              if (isTraitStack(s.item)) transferVariants(s, src, n);
              else { s.n += n; src.n -= n; }
              if (!src.n) selectedSlot.set(null);
            } else if (!s){ setStack(cloneStack(src)); selectedSlot.set(null); }
            else { const tmp = cloneStack(s); setStack(cloneStack(src)); selectedSlot.set(tmp); }
          }
          clearSelection(); refreshAll(); Sound.play('uiClick');
        }
      } else if (s){
        cursorStack = cloneStack(s); setStack(null); updateGhost(); refreshAll(); Sound.play('uiClick');
      }
    };
    el.onmousedown = e => {
      e.preventDefault();
      if (Date.now() - lastTouchAny < 8000) return;   // 触摸后浏览器补发的兼容 mousedown 忽略
      Sound.play('uiClick');
      const s = getStack();
      // Shift+左键：整组取回背包
      if (e.shiftKey && s){
        Player.addItem(s.item, s.n, true);
        setStack(null);
        Sound.play('insert');
        updateGhost();
        renderWs();
        refreshHotbar();
        return;
      }
      if (e.button === 0){
        if (!cursorStack && s){ cursorStack = cloneStack(s); setStack(null); }
        else if (cursorStack && (!acceptFilter || acceptFilter(cursorStack.item))){
          if (!s){ setStack(cloneStack(cursorStack)); cursorStack = null; }
          else if (s.item === cursorStack.item){ setStack({ item: s.item, n: s.n + cursorStack.n }); cursorStack = null; }
          else { const tmp = cloneStack(s); setStack(cloneStack(cursorStack)); cursorStack = tmp; }
        } else if (cursorStack) Sound.play('uiError');
      }
      updateGhost();
      renderWs();
      refreshHotbar();
    };
    const s = getStack();
    if (s){
      el.appendChild(Icons.img(s.item));
      const c = document.createElement('span'); c.className = 'cnt'; c.textContent = s.n > 1 ? s.n : '';
      el.appendChild(c);
    }
    return el;
  }
  function stackRef(obj, key){
    return [() => obj[key], v => obj[key] = v];
  }
  function buildMachineBody(target){
    const m = openMachine;
    if (!m) return;
    const body = target || $('machineBody');
    const titles = { furnace: '熔炉', miner: '自动采矿机', assembler: '装配机', refinery: '精炼厂', chest: '储物箱', reactor: '核子反应堆', belt: '传送带', solar: '太阳能板', wind: '风力涡轮机', burner: '火力发电机', lumberbot: '伐木机器人', collector: '收集点', irrigator: '灌溉机', planter: '播种机', harvester: '收割机', sellbot: '收购站', vendor: '出售站', trash: '物品销毁机', filter: '过滤器', chute: '向漏斗' };
    body.innerHTML = '';
    const d = m.data;

    if (m.type === 'furnace'){
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      flow.appendChild(mslot('原料', ...stackRef(d, 'in')));
      const fireCol = document.createElement('div');
      fireCol.style.textAlign = 'center';
      fireCol.innerHTML = `<div style="font-size:22px">${m.active ? '🔥' : '🧯'}</div>`;
      fireCol.appendChild(mslot('燃料', ...stackRef(d, 'fuel'), it => !!FUEL_VALUE[it]));
      flow.appendChild(fireCol);
      const arrow = document.createElement('div'); arrow.className = 'marrow'; arrow.textContent = '➤'; flow.appendChild(arrow);
      flow.appendChild(mslot('产出', ...stackRef(d, 'out')));
      body.appendChild(flow);
      const prog = document.createElement('div'); prog.className = 'mprog';
      prog.innerHTML = `<div style="width:${(d.prog * 100).toFixed(0)}%"></div>`;
      body.appendChild(prog);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = `燃烧余量 ${Math.max(0, d.burn).toFixed(1)}s · 燃料：碳(4s) 煤(16s)`;
      body.appendChild(stat);
    }
    else if (m.type === 'miner'){
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      flow.appendChild(mslot('缓存', ...stackRef(d, 'out')));
      body.appendChild(flow);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = m.active
        ? `正在开采随机矿物：<b style="color:#7dff8a">铁矿 / 铜矿 / 煤 / 金矿 / 钛矿 / 铀</b><br>耗电 8kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%`
        : `开机即按权重随机开采各类矿物，无需压在矿石上方<br>耗电 8kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%`;
      body.appendChild(stat);
    }
    else if (m.type === 'assembler' || m.type === 'refinery'){
      // 配方选择
      const pick = document.createElement('div'); pick.className = 'mrecipe-pick';
      const where = m.type === 'assembler' ? ['both', 'assembler'] : ['refinery'];
      for (const r of RECIPES){
        if (!where.includes(r.where)) continue;
        if (r.tech && !Game.techDone(r.tech)) continue;
        const outItem = Object.keys(r.out)[0];
        const el = document.createElement('div');
        el.className = 'mrp' + (d.recipe === r.id ? ' on' : '');
        el.appendChild(Icons.img(outItem));
        el.onmouseenter = e => showTooltip(e, outItem, Object.keys(r.in).map(k => `${ITEMS[k].name}×${r.in[k]}`).join(' '));
        el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
    el.onmouseleave = () => { if (Date.now() - (el._lastTouch || 0) < 5000) return; hideTooltip(); };
        el.onclick = () => {
          // 切换/取消配方：退还格内材料（含制作中已扣除的一组），背包放不下就掉在机器旁
          const refund = (item, n) => {
            if (n <= 0) return;
            const added = Player.addItem(item, n, true);
            if (added < n) Player.spawnDrop(m.x + 0.5, m.y + 1.2, m.z + 0.5, item, n - added);
          };
          const old = d.recipe ? RECIPE_BY_ID[d.recipe] : null;
          if (old){
            for (const k in d.in) refund(k, d.in[k] || 0);
            if (d.prog > 0) for (const k in old.in) refund(k, old.in[k]);
          }
          d.in = {};
          d.recipe = d.recipe === r.id ? null : r.id;
          d.prog = 0;
          Sound.play('uiClick');
          renderWs();
        };
        pick.appendChild(el);
      }
      body.appendChild(pick);
      if (d.recipe){
        const r = RECIPE_BY_ID[d.recipe];
        const flow = document.createElement('div'); flow.className = 'mach-flow';
        for (const k of Object.keys(r.in)){
          flow.appendChild(mslot(`${ITEMS[k].name} ${d.in[k] || 0}/${r.in[k]}`,
            () => (d.in[k] ? { item: k, n: d.in[k] } : null),
            v => { d.in[k] = v ? v.n : 0; },
            it => it === k));
        }
        const arrow = document.createElement('div'); arrow.className = 'marrow'; arrow.textContent = '➤'; flow.appendChild(arrow);
        flow.appendChild(mslot('产出', ...stackRef(d, 'out')));
        body.appendChild(flow);
        const prog = document.createElement('div'); prog.className = 'mprog';
        prog.innerHTML = `<div style="width:${(d.prog * 100).toFixed(0)}%"></div>`;
        body.appendChild(prog);
      }
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = `耗电 ${m.type === 'assembler' ? 12 : 20}kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%${Factory.power.sat < 1 ? ' <span class="warn">(电力不足，减速运行)</span>' : ''}`;
      body.appendChild(stat);
    }
    else if (m.type === 'chest' || m.type === 'collector'){
      const list = document.createElement('div');
      list.className = 'warehouse-list';
      for (let i = 0; i < d.slots.length; i++){
        const idx = i;
        const el = document.createElement('div');
        el.className = 'slot warehouse-row';
        bindPanelSlot(el,
          () => d.slots[idx],
          v => d.slots[idx] = v,
          (s, setStack) => {           // Shift：取回背包
            Player.addItem(s.item, s.n, true);
            setStack(null);
            Sound.play('insert');
          },
          null,
          () => fillWarehouseRow(el, d.slots[idx]));   // 就地刷新，避免整栏重建
        fillWarehouseRow(el, d.slots[idx]);
        list.appendChild(el);
      }
      body.appendChild(list);
      if (m.type === 'collector'){
        const stat = document.createElement('div'); stat.className = 'mstat';
        stat.innerHTML = '伐木机器人自动送货至此 · 库存自动输出到<b>面前</b>的传送带/机器（放置朝向）';
        body.appendChild(stat);
      }
    }
    else if (m.type === 'lumberbot'){
      const stateName = { scan: '巡林搜索中', move: '前往目标树', chop: '伐木中 🪚', deliver: '前往收集点卸货', wait: '待机' };
      const bs = m.bot ? (stateName[m.bot.state] || m.bot.state) : '初始化…';
      const hasCol = (() => { for (const c of Factory.machines.values()) if (c.type === 'collector') return true; return false; })();
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.style.padding = '16px';
      stat.innerHTML = `<div style="font-size:26px;margin-bottom:8px">🤖</div>` +
        `状态：<b style="color:#7dff8a">${bs}</b><br>` +
        `携带碳素：<b style="color:#ffd94d">${m.data.cargo || 0}</b> / 40（满载自动卸货）<br>` +
        `工作半径 32 格 · 锯倒树干与树冠 · 树干每段碳×4 · 整树完成 +6` +
        (hasCol ? '' : '<br><span class="warn">⚠ 附近没有收集点！请放置收集点方块接收木料</span>');
      body.appendChild(stat);
    }
    else if (m.type === 'irrigator'){
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = `<div style="font-size:26px;margin-bottom:6px">💧</div>` +
        (m.active
          ? `正在灌溉周围 <b style="color:#7dff8a">5×5</b> 耕地<br>耗电 6kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%`
          : `<span class="warn">⚠ 电力不足或附近没有耕地</span><br>耗电 6kW · 覆盖 5×5 耕地`);
      body.appendChild(stat);
    }
    else if (m.type === 'planter'){
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      flow.appendChild(mslot('种子', ...stackRef(d, 'seed'), it => !!Object.values(CROPS).find(c => c.seed === it)));
      body.appendChild(flow);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = m.active
        ? `正在向周围 <b style="color:#7dff8a">5×5</b> 空耕地播种<br>耗电 8kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%`
        : `<span class="warn">⚠ 电力不足或没有可播种的耕地</span><br>耗电 8kW · 需要放入种子`;
      body.appendChild(stat);
    }
    else if (m.type === 'harvester'){
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      flow.appendChild(mslot('产物', ...stackRef(d, 'out')));
      body.appendChild(flow);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = m.active
        ? `正在收割周围 <b style="color:#7dff8a">5×5</b> 成熟作物<br>产物自动送入前方传送带/机器`
        : `<span class="warn">⚠ 电力不足或附近没有成熟作物</span><br>耗电 10kW · 产物输出到前方`;
      body.appendChild(stat);
    }
    else if (m.type === 'reactor'){
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.style.padding = '18px';
      stat.innerHTML = `<div style="font-size:30px;margin-bottom:8px">☢</div>核燃料余量：<b style="color:#7dff8a">${Math.max(0, d.fuel).toFixed(0)}s</b><br>输出 100kW`;
      body.appendChild(stat);
      const btn = document.createElement('button');
      btn.className = 'boot-btn small';
      btn.style.margin = '0 auto 14px'; btn.style.display = 'block';
      btn.textContent = '投入铀-235（+60s）';
      btn.onclick = () => {
        if (Player.removeItem('uranium', 1)){ d.fuel += 60; Sound.play('insert'); renderWs(); }
        else Sound.play('uiError');
      };
      body.appendChild(btn);
    }
    else if (m.type === 'burner'){
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      const fireCol = document.createElement('div');
      fireCol.style.textAlign = 'center';
      fireCol.innerHTML = `<div style="font-size:22px">${m.active ? '🔥' : '🧯'}</div>`;
      fireCol.appendChild(mslot('燃料', ...stackRef(d, 'fuel'), it => !!FUEL_VALUE[it]));
      flow.appendChild(fireCol);
      body.appendChild(flow);
      const prog = document.createElement('div'); prog.className = 'mprog';
      prog.innerHTML = `<div style="width:${d.burnMax ? Math.max(0, d.burn / d.burnMax * 100).toFixed(0) : 0}%"></div>`;
      body.appendChild(prog);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = m.active
        ? `正在发电：<b style="color:#7dff8a">25kW</b> · 燃烧余量 ${Math.max(0, d.burn).toFixed(1)}s`
        : `<span class="warn">待机 — 投入煤/碳开始发电</span>`;
      body.appendChild(stat);
    }
    else if (m.type === 'wind'){
      const stat = document.createElement('div'); stat.className = 'mstat'; stat.style.padding = '20px';
      stat.innerHTML = `<div style="font-size:26px;margin-bottom:6px">🌀</div>当前输出：<b style="color:#7dff8a">${(d.out || 0).toFixed(1)}kW</b><br><span style="color:#5f7d8c">海拔越高风力越强 · 输出随阵风波动</span>`;
      body.appendChild(stat);
    }
    else if (m.type === 'sellbot'){
      const d = m.data;
      const st = document.createElement('div'); st.className = 'mstat';
      st.innerHTML = m.active ? `⚡ 运行中（耗电 2kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%）` : `<span class="warn">⚠ 缺电：接上火力/太阳能/风力/核能发电机</span>`;
      body.appendChild(st);
      const earn = document.createElement('div'); earn.className = 'mstat';
      earn.innerHTML = `累计收购：<b style="color:#8f5c26">🪙${d.earned}</b>`;
      body.appendChild(earn);
      const cfg = document.createElement('div'); cfg.className = 'inv-sec'; cfg.textContent = '出售清单';
      body.appendChild(cfg);
      const mode = document.createElement('div'); mode.className = 'set-opts';
      const bAll = document.createElement('button'); bAll.textContent = '卖全部';
      bAll.onclick = () => { d.list = null; Sound.play('uiClick'); renderWs(); };
      const bCust = document.createElement('button'); bCust.textContent = '自定义';
      bCust.onclick = () => { if (!d.list) d.list = {}; Sound.play('uiClick'); renderWs(); };
      bAll.classList.toggle('on', !d.list); bCust.classList.toggle('on', !!d.list);
      mode.appendChild(bAll); mode.appendChild(bCust);
      body.appendChild(mode);
      if (d.list){
        const set = new Set(TRADE_GOODS);
        for (const k in CROPS){ set.add(CROPS[k].produce); set.add(CROPS[k].seed); }
        const grid = document.createElement('div'); grid.className = 'slot-grid';
        grid.style.gridTemplateColumns = 'repeat(6,1fr)'; grid.style.margin = '6px 0';
        for (const id of set){
          if (!ITEMS[id] || ITEMS[id].price <= 0) continue;
          const b = document.createElement('button'); b.className = 'ctab' + (d.list[id] ? ' on' : '');
          b.textContent = ITEMS[id].name; b.style.fontSize = '10px'; b.style.padding = '3px 2px';
          b.onclick = () => { if (d.list[id]) delete d.list[id]; else d.list[id] = true; Sound.play('uiClick'); renderWs(); };
          grid.appendChild(b);
        }
        body.appendChild(grid);
      }
      const buf = document.createElement('div'); buf.className = 'inv-sec'; buf.textContent = '暂存（未列入清单的物品）';
      body.appendChild(buf);
      const flow = document.createElement('div'); flow.className = 'mach-flow';
      flow.appendChild(mslot('暂存', () => d.buffer, v => { d.buffer = v || null; }, null));
      body.appendChild(flow);
    }
    else if (m.type === 'vendor'){
      const st = document.createElement('div'); st.className = 'mstat';
      st.innerHTML = m.active
        ? `⚡ 营业中（耗电 4kW · 电力满足率 ${(Factory.power.sat * 100).toFixed(0)}%）`
        : `<span class="warn">⚠ 缺电：接通发电机后开张</span>`;
      body.appendChild(st);
      const creds = document.createElement('div'); creds.className = 'mstat';
      creds.innerHTML = `余额：<b style="color:#8f5c26">🪙${Player.credits}</b>`;
      body.appendChild(creds);
      const sec = document.createElement('div'); sec.className = 'inv-sec'; sec.textContent = '点击购买 · 货物自动输出到面前';
      body.appendChild(sec);
      const grid = document.createElement('div'); grid.className = 'slot-grid';
      grid.style.gridTemplateColumns = 'repeat(5,1fr)'; grid.style.margin = '6px 0';
      for (const id of TRADE_GOODS){
        const it = ITEMS[id];
        if (!it || it.price <= 0) continue;
        const mod = (Game.market && Game.market[id]) || 1;
        const price = Math.max(1, Math.round(it.price * mod * 1.25));
        const b = document.createElement('button'); b.className = 'ctab';
        b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px';
        b.appendChild(Icons.img(id));
        const nm = document.createElement('span'); nm.style.cssText = 'font-size:10px'; nm.textContent = it.name;
        const pc = document.createElement('small'); pc.style.cssText = 'font-size:9px;color:#8f5c26'; pc.textContent = '🪙' + price;
        b.append(nm, pc);
        b.onclick = () => {
          if (!m.active){ Sound.play('uiError'); return; }
          if (Player.credits < price){ Sound.play('uiError'); bigMessage('金币不足', `购买 ${it.name} 需要 🪙${price}`, 2200); return; }
          Player.credits -= price;
          if (!m.data.out) m.data.out = { item: id, n: 0 };
          if (m.data.out.item !== id) m.data.out = { item: id, n: 1 };
          else m.data.out.n++;
          Sound.play('insert');
          renderWs();
        };
        grid.appendChild(b);
      }
      body.appendChild(grid);
      const flow2 = document.createElement('div'); flow2.className = 'mach-flow';
      flow2.appendChild(mslot('待取货物', ...stackRef(d, 'out')));
      body.appendChild(flow2);
    }
    else if (m.type === 'trash'){
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = `<div style="font-size:26px;margin-bottom:6px">🗑</div>丢入本机的物品会被<b style="color:#c0392b">直接销毁</b>，无法找回。<br>已销毁：<b style="color:#8f5c26">${d.destroyed}</b> 件`;
      body.appendChild(stat);
    }
    else if (m.type === 'filter'){
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = '只放行<b>清单内</b>的物品：未列入的物品不会进入（继续留在传送带上）。';
      body.appendChild(stat);
      const cfg = document.createElement('div'); cfg.className = 'inv-sec'; cfg.textContent = '放行清单';
      body.appendChild(cfg);
      const mode = document.createElement('div'); mode.className = 'set-opts';
      const bAll = document.createElement('button'); bAll.textContent = '全部放行';
      bAll.onclick = () => { d.list = null; Sound.play('uiClick'); renderWs(); };
      const bCust = document.createElement('button'); bCust.textContent = '自定义';
      bCust.onclick = () => { if (!d.list) d.list = {}; Sound.play('uiClick'); renderWs(); };
      bAll.classList.toggle('on', !d.list); bCust.classList.toggle('on', !!d.list);
      mode.appendChild(bAll); mode.appendChild(bCust);
      body.appendChild(mode);
      if (d.list){
        const set = new Set(TRADE_GOODS);
        for (const k in CROPS){ set.add(CROPS[k].produce); set.add(CROPS[k].seed); }
        const grid2 = document.createElement('div'); grid2.className = 'slot-grid';
        grid2.style.gridTemplateColumns = 'repeat(6,1fr)'; grid2.style.margin = '6px 0';
        for (const id of set){
          if (!ITEMS[id]) continue;
          const b = document.createElement('button'); b.className = 'ctab' + (d.list[id] ? ' on' : '');
          b.textContent = ITEMS[id].name; b.style.fontSize = '10px'; b.style.padding = '3px 2px';
          b.onclick = () => { if (d.list[id]) delete d.list[id]; else d.list[id] = true; Sound.play('uiClick'); renderWs(); };
          grid2.appendChild(b);
        }
        body.appendChild(grid2);
      }
      const flow3 = document.createElement('div'); flow3.className = 'mach-flow';
      flow3.appendChild(mslot('放行缓存', ...stackRef(d, 'out')));
      body.appendChild(flow3);
    }
    else if (m.type === 'chute'){
      const below = World.getDef(m.x, m.y - 1, m.z);
      const stat = document.createElement('div'); stat.className = 'mstat';
      stat.innerHTML = below && below.id !== 0
        ? `正在向下方 <b style="color:#7dff8a">${below.name}</b> 投递物品（可叠放接力）`
        : `<span class="warn">⚠ 下方没有容器/机器</span> · 物品暂存在缓存格`;
      body.appendChild(stat);
      const flow4 = document.createElement('div'); flow4.className = 'mach-flow';
      flow4.appendChild(mslot('缓存', ...stackRef(d, 'buffer')));
      body.appendChild(flow4);
    }
    else {
      const stat = document.createElement('div'); stat.className = 'mstat'; stat.style.padding = '20px';
      stat.textContent = m.type === 'solar' ? '白天输出 10kW，夜间休眠。' : '物品将沿传送方向移动，靠近其他传送带会自动转弯/爬坡。';
      body.appendChild(stat);
    }


    // ---- 机器信息（去除内嵌背包：与左侧仓库重复）----
    const stat2 = document.createElement('div'); stat2.className = 'mstat'; stat2.style.padding = '12px';
    stat2.innerHTML = '左栏仓库取用材料 → 点上方槽位放入 · 产物在「产出」槽取回';
    body.appendChild(stat2);
  }

  // ---------- 科技树 ----------
  let researching = null;   // {id, t}
  function refreshTech(){
    const nodesBox = $('techNodes'), svg = $('techLines');
    nodesBox.innerHTML = '';
    svg.innerHTML = '';
    $('dataCount').textContent = `⬡ 研究数据 ×${Player.countItem('data')}`;
    for (const id in TECH){
      const t = TECH[id];
      const done = Game.techDone(id);
      const reqOk = t.req.every(r => Game.techDone(r));
      const el = document.createElement('div');
      el.className = 'tnode ' + (done ? 'done' : reqOk ? 'avail' : 'locked');
      el.style.left = t.pos[0] + 'px';
      el.style.top = t.pos[1] + 'px';
      const icon = document.createElement('div'); icon.className = 'ticon';
      icon.appendChild(Icons.img(t.icon));
      el.appendChild(icon);
      const nm = document.createElement('div'); nm.className = 'tname'; nm.textContent = t.name;
      el.appendChild(nm);
      const cost = document.createElement('div'); cost.className = 'tcost';
      if (done) cost.innerHTML = '<span class="tdone">✔ 已解锁</span>';
      else if (researching && researching.id === id) cost.textContent = `研究中 ${(researching.t / t.time * 100).toFixed(0)}%`;
      else cost.textContent = Object.keys(t.cost).map(k => `${ITEMS[k].name}×${t.cost[k]}`).join(' ') || '免费';
      el.appendChild(cost);
      el.onmouseenter = e => {
        const tt = tooltip();
        tt.innerHTML = `<div class="tt-name">${t.name}</div><div class="tt-desc">${t.desc}</div>` +
          (t.req.length ? `<div style="color:#5f7d8c;font-size:11px;margin-top:4px">前置：${t.req.map(r => TECH[r].name).join('、')}</div>` : '');
        tt.classList.remove('hidden');
        moveTooltip(e);
      };
      el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
      el.onmouseleave = hideTooltip;
      el.onclick = () => {
        if (done || !reqOk || researching) { Sound.play('uiError'); return; }
        if (!Player.hasItems(t.cost)){ Sound.play('uiError'); bigMessage('材料不足', '需要 ' + Object.keys(t.cost).map(k => `${ITEMS[k].name}×${t.cost[k]}`).join(' ')); return; }
        Player.payItems(t.cost);
        researching = { id, t: 0 };
        Sound.play('uiClick');
        refreshTech();
      };
      nodesBox.appendChild(el);
      // 连线
      for (const r of t.req){
        const p = TECH[r];
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.pos[0] + 59); line.setAttribute('y1', p.pos[1] + 45);
        line.setAttribute('x2', t.pos[0] + 59); line.setAttribute('y2', t.pos[1] + 45);
        line.setAttribute('stroke', done ? '#7dff8a66' : Game.techDone(r) ? '#ffb34766' : '#24405a');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', done ? '' : '6 4');
        svg.appendChild(line);
      }
    }
  }
  function updateResearch(dt){
    if (!researching) return;
    const t = TECH[researching.id];
    researching.t += dt;
    if (researching.t >= t.time){
      Game.completeTech(researching.id);
      researching = null;
      Sound.play('research');
      bigMessage('科技解锁', TECH[Game.lastTech].name + ' — ' + TECH[Game.lastTech].desc);
      if (!$('techPanel').classList.contains('hidden')) refreshTech();
    } else if (!$('techPanel').classList.contains('hidden') && Math.random() < 0.1) refreshTech();
  }

  // ---------- 贸易 ----------
  function openTrade(){
    closeAll();
    $('tradePanel').classList.remove('hidden');
    Sound.play('uiOpen');
    document.exitPointerLock && document.exitPointerLock();
    refreshTrade();
  }
  function refreshTrade(){
    $('tradeCredits').textContent = Player.credits;
    const list = $('tradeList');
    list.innerHTML = '';
    const discount = 1;
    for (const id of TRADE_GOODS){
      const it = ITEMS[id];
      const mod = Game.market[id] || 1;
      const buyP = Math.max(1, Math.round(it.price * mod * 1.25 * discount));
      const sellTraits = findTraitsForItem(id);
      const cropId = Object.keys(CROPS).find(k => CROPS[k].produce === id);
      const traitMul = cropId ? cropTraitPriceMul(cropId, sellTraits) : traitPriceMul(sellTraits);
      const sellP = Math.max(1, Math.round(it.price * mod * 0.8 * traitMul));
      const row = document.createElement('div');
      row.className = 'trade-row';
      const ic = document.createElement('div'); ic.className = 'ricon'; ic.appendChild(Icons.img(id));
      row.appendChild(ic);
      const nm = document.createElement('div'); nm.className = 'tnm';
      const traitHint = traitMul > 1 ? ` · 词条 +${Math.round((traitMul - 1) * 100)}%` : '';
      nm.innerHTML = `${it.name}<br><span style="color:${mod > 1.05 ? '#ff5555' : mod < 0.95 ? '#7dff8a' : '#5f7d8c'};font-size:10px">${mod > 1.05 ? '▲ 紧缺' : mod < 0.95 ? '▼ 过剩' : '— 平稳'}${traitHint}</span>`;
      row.appendChild(nm);
      const qty = document.createElement('div'); qty.className = 'tqty'; qty.textContent = '持有' + Player.countItem(id);
      row.appendChild(qty);
      const bBuy = document.createElement('button'); bBuy.className = 'tbtn'; bBuy.textContent = `买 🪙${buyP}`;
      bBuy.onclick = e => {
        const n = e.shiftKey ? 10 : 1;
        let bought = 0;
        for (let i = 0; i < n; i++){
          if (Player.credits >= buyP){ Player.credits -= buyP; Player.addItem(id, 1, true); bought++; }
        }
        if (bought){ Sound.play('buy'); Game.market[id] = Math.min(1.6, (Game.market[id] || 1) + 0.01 * bought); }
        else Sound.play('uiError');
        refreshTrade(); refreshHUD();
      };
      row.appendChild(bBuy);
      const bSell = document.createElement('button'); bSell.className = 'tbtn sell'; bSell.textContent = `卖 🪙${sellP}`;
      bSell.onclick = e => {
        const n = e.shiftKey ? 10 : 1;
        let sold = 0;
        for (let i = 0; i < n; i++){
          if (Player.removeVariant(id, sellTraits) || Player.removeItem(id, 1)){ Player.credits += sellP; sold++; }
        }
        if (sold){ Sound.play('coin'); Game.market[id] = Math.max(0.5, (Game.market[id] || 1) - 0.012 * sold); }
        else Sound.play('uiError');
        refreshTrade(); refreshHUD();
      };
      row.appendChild(bSell);
      list.appendChild(row);
    }
    // 种子与建材
    const bp = $('bpList');
    bp.innerHTML = '';
    const shop = ['wheat_seed','potato_seed','carrot_seed','beet_seed','pumpkin_seed','berry_seed','stone','sand','planks_b','glass_b','hoe','watering_can','shovel'];
    for (const id of shop){
      const it = ITEMS[id];
      if (!it) continue;
      const buyP = Math.max(1, Math.round(it.price * 1.35));
      const row = document.createElement('div');
      row.className = 'trade-row';
      const ic = document.createElement('div'); ic.className = 'ricon'; ic.appendChild(Icons.img(id));
      row.appendChild(ic);
      const nm = document.createElement('div'); nm.className = 'tnm'; nm.innerHTML = `${it.name}<br><span style="font-size:10px;color:#6d5438">${it.desc}</span>`;
      row.appendChild(nm);
      const btn = document.createElement('button'); btn.className = 'tbtn'; btn.textContent = `买 🪙${buyP}`;
      btn.onclick = () => {
        if (Player.credits >= buyP){ Player.credits -= buyP; Player.addItem(id, 1, true); Sound.play('buy'); }
        else Sound.play('uiError');
        refreshTrade(); refreshHUD();
      };
      row.appendChild(btn);
      bp.appendChild(row);
    }
  }
  function findTraitsForItem(item){
    for (const s of Player.inv){
      if (!s || s.item !== item) continue;
      if (s.variants && s.variants.length) return s.variants.find(v => v.n > 0).tr;
      if (s.tr && s.tr.length) return s.tr;
    }
    return [];
  }

  // ---------- 任务 ----------
  const QUEST_GUIDES = {
    q_till:    '选中<b>锄头</b>，右键点泥土/草地开垦 6 块耕地',
    q_plant:   '选中小麦种子，右键点耕地播种 6 粒',
    q_water:   '选中<b>洒水壶</b>，右键点耕地浇水 4 次',
    q_harvest: '作物长满后，用<b>左键+锄头</b>收割 2 株',
    q_stone:   '选中<b>铲子</b>，左键挖灰色岩石',
    q_furnace: '按 <b>Tab</b> 合成熔炉 → 选中快捷栏 → <b>右键</b>放置',
    q_iron:    '对熔炉按 <b>右键</b>：放入铁矿石 + 燃料(碳/煤)',
    q_auto:    '研究「自动化」后把采矿机<b>右键</b>放在矿脉正上方，再接上电',
    q_belt:    '放置传送带 6 条，末端对准熔炉/储物箱自动送入',
    q_power:   '研究「清洁能源」后合成太阳能板放置 2 块',
    q_refinery:'研究「化学精炼」后放置精炼厂，右键选配方',
    q_agri:    '研究「农业自动化」后放置灌溉机，它会自动浇 5×5 耕地',
    q_nuclear: '研究「核裂变」后建造核子反应堆（需要铀矿与钛锭）',
  };
  function refreshQuests(){
    const list = $('questList');
    if (!list) return;
    if (!window.Game) return;
    list.innerHTML = '';
    const cur = Game.currentQuests();
    const chapter = Game.currentQuestChapter ? Game.currentQuestChapter() : null;
    if (chapter) list.insertAdjacentHTML('beforeend', `<div class="quest-chapter">${chapter}</div>`);
    for (const q of cur){
      const el = document.createElement('div');
      el.className = 'q-item' + (q.done ? ' done' : '');
      el.innerHTML = `<span class="qbox">${q.done ? '☑' : '☐'}</span><span>${q.desc}${q.progress ? ` <span class="qp">${q.progress}</span>` : ''}</span>`;
      list.appendChild(el);
    }
    const tip = $('questTip');
    if (tip){
      const gid = Game.currentQuestId && Game.currentQuestId();
      tip.innerHTML = (gid && QUEST_GUIDES[gid])
        ? '💡 ' + QUEST_GUIDES[gid]
        : '💡 <b>右键</b>使用 · <b>左键</b>工具 · <b>V</b>视图 · <b>Tab</b>合成 · <b>T</b>科技';
    }
    refreshScoreStats();
  }
  function openQuestTree(){
    closeAll(); $('questTreePanel').classList.remove('hidden'); renderQuestTree(); document.exitPointerLock && document.exitPointerLock();
  }
  function renderQuestTree(){
    const box = $('questTree'); if (!box || !window.Game) return;
    const done = Game.currentQuestId ? Game.currentQuestId() : null;
    const currentIndex = done ? QUESTS.findIndex(q => q.id === done) : QUESTS.length;
    $('questTreeProgress').textContent = `${currentIndex}/${QUESTS.length} 已完成`;
    box.innerHTML = '';
    QUESTS.forEach((q, i) => {
      const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'locked';
      const el = document.createElement('div'); el.className = `quest-node ${state}`;
      const progress = state === 'current' ? (Game.currentQuests()[0] && Game.currentQuests()[0].progress) || '进行中' : state === 'done' ? '已完成' : '未解锁';
      el.innerHTML = `<span class="quest-node-num">${i + 1}</span><div><b>${q.title}</b><small>${q.desc}</small></div><em>${progress}</em>`;
      box.appendChild(el);
      if (i < QUESTS.length - 1) box.insertAdjacentHTML('beforeend', '<div class="quest-link">↓</div>');
    });
  }

  // ---------- 作物选育（工作台右栏） ----------
  let breedA = null, breedB = null;   // {item, tr}
  function seedTraitText(s){
    return s.tr && s.tr.length ? s.tr.map(id => TRAITS[id] ? `<span style="color:${TRAITS[id].color}">${TRAITS[id].kind}·${TRAITS[id].name}</span>` : '').join(' · ') : '<span class="trait-muted">普通</span>';
  }
  function renderBreedInto(host){
    host.innerHTML = '';
    const intro = document.createElement('div'); intro.className = 'breeding-intro';
    intro.textContent = '每枚种子固定有两个显隐基因槽。左侧点选种子 → 右侧变体处「设为亲本 A/B」→ 开始选育。';
    host.appendChild(intro);
    const slots = document.createElement('div'); slots.className = 'breeding-slots';
    const mk = (label, p) => {
      const card = document.createElement('div'); card.className = 'parent-card';
      const b = document.createElement('b'); b.textContent = label; card.appendChild(b);
      const box = document.createElement('div'); box.className = 'breed-parent';
      box.innerHTML = p ? `${ITEMS[p.item].name}<small>${seedTraitText(p)}</small>` : '未选择';
      card.appendChild(box); return card;
    };
    slots.appendChild(mk('亲本 A', breedA));
    const heart = document.createElement('div'); heart.className = 'breed-heart'; heart.textContent = '×'; slots.appendChild(heart);
    slots.appendChild(mk('亲本 B', breedB));
    host.appendChild(slots);
    const result = document.createElement('div'); result.className = 'breed-result'; result.id = 'wsBreedResult';
    host.appendChild(result);
    const btn = document.createElement('button'); btn.className = 'boot-btn small'; btn.id = 'wsBreedSubmit';
    btn.textContent = '开始选育'; btn.disabled = true;
    btn.onclick = doBreed;
    host.appendChild(btn);
    updateBreedState(result, btn);
  }
  function updateBreedState(result, btn){
    if (!result || !btn) return;
    const a = breedA, b = breedB;
    const okA = !!a && Player.countVariant(a.item, a.tr) > 0;
    const okB = !b || (!!a && a.item === b.item && Player.countVariant(b.item, b.tr) > 0);
    const valid = okA && okB;
    btn.disabled = !valid;
    result.textContent = !valid ? '先在左侧选种子，右侧设为亲本' : !b ? '单株克隆：100% 复制这枚种子的两个基因' : '双亲杂交：子代从父母各随机继承一个基因';
  }
  function doBreed(){
    const a = breedA, b = breedB;
    if (!a || Player.countVariant(a.item, a.tr) < 1) return;
    if (b && (a.item !== b.item || Player.countVariant(b.item, b.tr) < 1)) return;
    const cropId = Object.keys(CROPS).find(k => CROPS[k].seed === a.item);
    const aSt = { item: a.item, tr: a.tr };
    const bSt = b ? { item: b.item, tr: b.tr } : aSt;
    const child = Farm.breedSeed(cropId, aSt, bSt);
    if (!child) return;
    if (!Player.removeVariant(a.item, a.tr)) return;
    if (b && !Player.removeVariant(b.item, b.tr)) return;
    Player.addItem(child.item, child.n, false, child.tr);
    breedA = breedB = null;
    Sound.play('craft'); bigMessage(b ? '杂交完成' : '克隆完成', `${CROPS[cropId].name} · ${child.tr.map(id => TRAITS[id].name).join(' · ')}`);
    renderWs(); refreshAll();
  }
  function refreshBreeding(){ renderWs(); }

  // 右栏：词条变体区（追加在机器/合成/选育内容下方）
  function renderTraitSection(host){
    const get = wsTraitGetter;
    const stack = get ? get() : null;
    if (!stack){ wsTraitGetter = null; return; }
    const box = document.createElement('div'); box.className = 'ws-trait-box';
    const head = document.createElement('div'); head.className = 'ws-trait-head';
    head.innerHTML = `<b>${ITEMS[stack.item].name}</b> <span>单击选中变体，再点其他栏位移动</span>`;
    const closeBtn = document.createElement('button'); closeBtn.className = 'ws-back'; closeBtn.textContent = '✕ 关闭';
    closeBtn.onclick = () => { wsTraitGetter = null; clearSelection(); renderWs(); };
    head.appendChild(closeBtn);
    box.appendChild(head);
    const vs = stack.variants && stack.variants.length ? stack.variants : [{ tr: stack.tr || [], n: stack.n }];
    const inBreed = wsMode === 'breed';
    vs.filter(x => x.n > 0).forEach(v => {
      const row = document.createElement('div'); row.className = 'ws-trait-row';
      const label = document.createElement('span'); label.className = 'ws-trait-label';
      label.innerHTML = (v.tr || []).map(id => TRAITS[id] ? `${TRAITS[id].kind}·${TRAITS[id].name}` : id).join(' + ') || '普通';
      const cnt = document.createElement('b'); cnt.style.color = '#8f5c26'; cnt.textContent = `×${v.n}`;
      row.appendChild(label); row.appendChild(cnt);
      row.onclick = e => {
        if (e.target.closest && e.target.closest('button')) return;
        selectVariantRow(get, v.tr, row);
        Sound.play('uiClick');
      };
      if (inBreed){
        const mkB = (label, key) => {
          const b = document.createElement('button'); b.className = 'boot-btn small'; b.textContent = label;
          b.onclick = e => {
            e.stopPropagation();
            const pick = { item: stack.item, tr: v.tr.slice() };
            if (key === 'A') breedA = pick; else breedB = pick;
            Sound.play('uiClick'); refreshInv();
          };
          row.appendChild(b);
        };
        mkB('设为亲本 A', 'A'); mkB('设为亲本 B', 'B');
      }
      box.appendChild(row);
    });
    host.appendChild(box);
  }

  function refreshScoreStats(){
    const el = $('scoreStats');
    if (!el) return;
    const playMin = Math.floor((Game.playTime || 0) / 60);
    const machines = window.Factory && Factory.machines ? Factory.machines.size : 0;
    const crops = window.Farm ? Farm.count : 0;
    el.innerHTML =
      `<span class="stat">游玩 <b>${playMin}分</b></span>` +
      `<span class="stat">机器 <b>${machines}</b></span>` +
      `<span class="stat">农田格 <b>${crops}</b></span>` +
      `<span class="stat">电力 <b>${Factory.power ? Factory.power.gen + '/' + Factory.power.use + 'kW' : '0/0'}</b></span>`;
  }

  // ---------- HUD ----------
  function buildSegBar(el, n){
    el.innerHTML = '';
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'));
  }
  function refreshHUD(){
    const p = Factory.power;
    const pt = $('powerText');
    if (pt){
      pt.textContent = `${p.gen}/${p.use} kW`;
      pt.style.color = p.sat < 1 ? '#ff5555' : '#ffb347';
    }
    const eco = $('ecoCredits');
    if (eco) eco.textContent = Player.credits;
    const mobileEco = $('mbCoins');
    if (mobileEco) mobileEco.textContent = Player.credits;
  }
  function refreshAll(){
    refreshHotbar();
    if (!$('invPanel').classList.contains('hidden')) refreshInv();
    if (openMachine && wsMode === 'machine' && !$('invPanel').classList.contains('hidden')) renderWs();
    refreshQuests();
    refreshHUD();
  }

  function setInteractHint(text){
    const el = $('interactHint');
    if (!text){ el.classList.add('hidden'); return; }
    el.innerHTML = text;
    el.classList.remove('hidden');
  }

  // ---------- 创造物品库 ----------
  let creativeBuilt = false;
  function buildCreative(){
    if (creativeBuilt) return;
    creativeBuilt = true;
    const grid = $('creativeGrid');
    grid.innerHTML = '';
    for (const id in ITEMS){
      const el = document.createElement('div');
      el.className = 'slot';
      el.appendChild(Icons.img(id));
      el.onmouseenter = e => { showTooltip(e, id); Sound.play('hover'); };
      el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
      el.onmouseleave = hideTooltip;
      el.oncontextmenu = e => e.preventDefault();
      el.onmousedown = e => {
        e.preventDefault();
        if (Date.now() - lastTouchAny < 8000) return;   // 触摸后浏览器补发的兼容 mousedown 忽略
        const n = e.button === 2 ? 1 : Math.min(64, ITEMS[id].stack);
        Player.addItem(id, n);
        Sound.play('uiClick');
      };
      grid.appendChild(el);
    }
  }
  function toggleCreative(){
    if (!(window.Game && Game.creative)) return;
    const el = $('creativePanel');
    const willOpen = el.classList.contains('hidden');
    closeAll();
    if (willOpen){
      buildCreative();
      el.classList.remove('hidden');
      Sound.play('uiOpen');
      document.exitPointerLock && document.exitPointerLock();
    } else {
      Sound.play('uiClose');
      Game.lockPointer();
    }
  }

  // ---------- 星系地图（NMS 高级星图：全屏星海 · 光谱分级 · 侦测滤镜 · 航线规划 · 飞跃镜头）----------
  let galSelected = null;
  let g3d = null;
  const STAR_CLASSES = [
    { k: 'G', name: 'G 级黄星', col: '#ffd97a', desc: '常规恒星系' },
    { k: 'M', name: 'M 级红星', col: '#ff8a6a', desc: '富矿异常' },
    { k: 'E', name: 'E 级绿星', col: '#7dffa8', desc: '异象频发' },
    { k: 'B', name: 'B 级蓝星', col: '#7fb8ff', desc: '古老富饶' },
  ];
  function starClassFor(seed){
    const rnd = mulberry32((seed ^ 0x51A77E57) >>> 0);
    const r = rnd();
    const cls = seed === HOME_GALAXY_SEED ? STAR_CLASSES[0]
      : r < 0.55 ? STAR_CLASSES[0] : r < 0.75 ? STAR_CLASSES[1] : r < 0.9 ? STAR_CLASSES[2] : STAR_CLASSES[3];
    return { ...cls, code: cls.k + ((rnd() * 10) | 0) + 'pfvk'[(rnd() * 4) | 0] };
  }
  function galaxyMeta(seed, gal){
    const meta = { cls: starClassFor(seed) };
    const market = gal.market || {};
    let avg = 0, n = 0, best = null, bestV = 0;
    for (const k in market){ avg += market[k]; n++; if (market[k] > bestV){ bestV = market[k]; best = k; } }
    avg = n ? avg / n : 1;
    meta.eco = avg > 1.04 ? '富饶' : avg < 0.96 ? '衰退' : '平稳';
    meta.ecoBest = best ? `${(typeof ITEMS !== 'undefined' && ITEMS[best] && ITEMS[best].name) || best} ×${bestV.toFixed(2)}` : null;
    const haz = gal.planets.filter(p => BIOMES[p.biome] && BIOMES[p.biome].haz).length;
    meta.conflict = haz >= 3 ? '⚠ 高危' : haz === 2 ? '紧张' : '平静';
    meta.ly = ((seed % 9000) / 100 + 4.2).toFixed(1);
    meta.visited = !!(Game.isGalaxyVisited && Game.isGalaxyVisited(seed));
    return meta;
  }
  const _galTexCache = {};
  function starTexture(color, spikes){
    const key = color + (spikes ? '+s' : '');
    if (_galTexCache[key]) return _galTexCache[key];
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    if (spikes){
      x.globalCompositeOperation = 'lighter';
      const sg = x.createLinearGradient(6, 0, 122, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sg;
      x.fillRect(6, 63, 116, 2);
      x.save(); x.translate(64, 64); x.rotate(Math.PI / 2); x.translate(-64, -64);
      x.fillRect(6, 63, 116, 2);
      x.restore();
    }
    return _galTexCache[key] = new THREE.CanvasTexture(c);
  }
  function reticleTexture(color){
    const key = 'ret' + color;
    if (_galTexCache[key]) return _galTexCache[key];
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = 5; x.lineCap = 'round';
    x.shadowColor = color; x.shadowBlur = 8;
    x.beginPath(); x.arc(64, 64, 50, -0.35, 1.25); x.stroke();
    x.beginPath(); x.arc(64, 64, 50, Math.PI - 0.35, Math.PI + 1.25); x.stroke();
    return _galTexCache[key] = new THREE.CanvasTexture(c);
  }
  const GAL_MODES = [
    { id: 'all', tx: '自由探索' },
    { id: 'G', tx: '黄星' }, { id: 'M', tx: '红星' }, { id: 'E', tx: '绿星' }, { id: 'B', tx: '蓝星' },
    { id: 'visited', tx: '已到访' },
  ];
  function ensureGalaxyOverlays(){
    const box = $('galMap');
    if (document.getElementById('galRegion')) return;
    const hud = document.createElement('div');
    hud.id = 'galTopHud';
    hud.innerHTML = '<div id="galRegion"></div><div id="galModes"></div>';
    box.appendChild(hud);
    const modes = hud.querySelector('#galModes');
    for (const m of GAL_MODES){
      const b = document.createElement('button');
      b.className = 'gal-mode' + (m.id === 'all' ? ' on' : '');
      b.textContent = m.tx;
      b.dataset.mode = m.id;
      b.onclick = () => {
        Sound.play('uiClick');
        g3d.mode = m.id;
        modes.querySelectorAll('.gal-mode').forEach(x => x.classList.toggle('on', x === b));
        applyGalaxyFilter();
      };
      modes.appendChild(b);
    }
    const lg = document.createElement('div');
    lg.id = 'galLegend';
    lg.innerHTML = STAR_CLASSES.map(c =>
      `<i style="background:${c.col};box-shadow:0 0 6px ${c.col}"></i>${c.name} · ${c.desc}<br>`).join('') +
      `<i style="background:#7ff5fa;box-shadow:0 0 6px #7ff5fa"></i>当前星系　<i style="background:#b48cff;box-shadow:0 0 6px #b48cff"></i>起源星系`;
    box.appendChild(lg);
    const ct = document.createElement('div');
    ct.id = 'galCtrl';
    ct.textContent = '拖动 旋转 · 滚轮 缩放 · 悬停 侦测 · 单击 选定 · 锁定后出图对准方框 → 脉冲冲刺自动跃迁';
    box.appendChild(ct);
    const tip = document.createElement('div');
    tip.id = 'galTip';
    tip.style.display = 'none';
    box.appendChild(tip);
  }
  function applyGalaxyFilter(){
    if (!g3d) return;
    for (const spr of g3d.stars){
      const ent = spr.userData.ent;
      const match = g3d.mode === 'all' || ent.current
        || (g3d.mode === 'visited' ? ent.meta.visited : ent.meta.cls.k === g3d.mode);
      ent.dim = !match;
      spr.material.opacity = match ? 1 : 0.1;
    }
  }
  function openGalaxyMap(){
    closeAll();
    $('galaxyPanel').classList.remove('hidden');
    Sound.play('uiOpen');
    document.exitPointerLock && document.exitPointerLock();
    galSelected = null;
    buildGalaxyMap();
  }
  function buildGalaxyMap(){
    const box = $('galMap');
    ensureGalaxyOverlays();
    const wc = Player.countItem('warpcell');
    $('galWarpInfo').textContent = `曲率电池 ×${wc}`;
    $('galInfo').innerHTML = '<div class="save-empty">— 悬停侦测 · 点击星系查看详情 —</div>';
    const cur = Space.getCurrentGalaxySeed();
    $('galRegion').innerHTML =
      `<b>✦ ${galaxyName(cur)}</b> · 星域坐标 #${cur}<br>距银核 ${((cur % 70000) / 1000 + 3.7).toFixed(1)} 千光年 · 曲率电池 ×${wc}`;
    const entries = [{ seed: cur, current: true, pos: new THREE.Vector3(0, 0, 0) }];
    if (cur !== HOME_GALAXY_SEED)
      entries.push({ seed: HOME_GALAXY_SEED, home: true, pos: new THREE.Vector3(-55, -12, 40) });
    // 无限邻域：从当前种子扩散 12 个近邻 + 48 个远邻（4 层波纹，每层 12 星）
    const rnd = mulberry32((cur ^ 0x9E3779B9) >>> 0);
    const allSeeds = new Set();
    for (let i = 0; i < 60; i++) allSeeds.add((rnd() * 1e9) | 0);
    const seedList = [...allSeeds];
    for (let i = 0; i < 12; i++){
      const s = seedList[i];
      const jr = mulberry32((s ^ 0xC2B2) >>> 0);
      const a = i / 12 * Math.PI * 2 + (jr() - 0.5) * 0.5, r = 24 + (i % 4) * 10 + jr() * 6, y = Math.sin(i * 2.3) * 16 + (jr() - 0.5) * 6;
      entries.push({ seed: s, pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r) });
    }
    for (let ring = 0; ring < 4; ring++){
      for (let i = 0; i < 12; i++){
        const s = seedList[12 + ring * 12 + i]; if (!s) continue;
        const jr = mulberry32((s ^ 0xC2B2) >>> 0);
        const a = (i / 12 + ring * 0.07) * Math.PI * 2 + (jr() - 0.5) * 0.4;
        const r = 44 + ring * 16 + (i % 4) * 6 + jr() * 8;
        const y = (ring - 1.5) * 18 + Math.sin(i * 1.7) * 8 + (jr() - 0.5) * 8;
        entries.push({ seed: s, pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r) });
      }
    }
    // 每个星系：布局/元数据一次生成（详情卡与滤镜直接复用）
    for (const ent of entries){
      ent.gal = ent.seed === HOME_GALAXY_SEED
        ? { name: '起源星系', planets: DEFAULT_PLANETS, market: null, seed: ent.seed }
        : generateGalaxy(ent.seed);
      ent.meta = galaxyMeta(ent.seed, ent.gal);
    }
    if (!g3d){
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      box.appendChild(renderer.domElement);
      g3d = { renderer, yaw: 0.6, pitch: 0.33, dist: 135, distT: 135, drag: null, labels: [], raf: 0, stars: [], entries: [],
        mode: 'all', focus: new THREE.Vector3(), focusCur: new THREE.Vector3(), hover: null, lockSeed: undefined, t: 0 };
      bindGalaxyControls();
      window.addEventListener('resize', () => { if (g3d && !$('galaxyPanel').classList.contains('hidden')) resizeGalaxy(); });
    }
    g3d.labels.forEach(l => l.remove());
    g3d.labels = [];
    g3d.hover = null;
    g3d.focus.set(0, 0, 0);
    g3d.focusCur.set(0, 0, 0);
    g3d.distT = g3d.dist = 135;
    const scene = new THREE.Scene();
    g3d.scene = scene;
    g3d.cam = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
    scene.fog = new THREE.Fog(0x04060c, 400, 1400);
    // 背景星海（双层视差：远层暗蓝微尘 + 近层亮星）
    {
      const rnd2 = mulberry32(20261);
      const mk = (count, rMin, rSpan, size, color, op) => {
        const pos = [];
        for (let i = 0; i < count; i++){
          const v = new THREE.Vector3(rnd2() * 2 - 1, (rnd2() * 2 - 1) * 0.55, rnd2() * 2 - 1).normalize().multiplyScalar(rMin + rnd2() * rSpan);
          pos.push(v.x, v.y, v.z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: op, fog: false })));
      };
      mk(900, 260, 500, 1.2, 0x5a6f9a, 0.55);
      mk(500, 170, 340, 1.8, 0x9fb4d8, 0.8);
    }
    // 星云尘带 + 远景银核（NMS 式纵深）
    const nebCols = ['rgba(53,224,232,0.20)', 'rgba(180,140,255,0.18)', 'rgba(255,140,90,0.14)', 'rgba(90,160,255,0.16)', 'rgba(255,90,140,0.10)', 'rgba(120,255,180,0.10)'];
    for (let i = 0; i < nebCols.length; i++){
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(nebCols[i]), transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      const rr = mulberry32(999 + i * 77);
      sp.position.set((rr() - 0.5) * 260, (rr() - 0.5) * 100, (rr() - 0.5) * 260);
      sp.scale.setScalar(180 + rr() * 200);
      scene.add(sp);
    }
    {
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture('#ffdfae'), transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
      core.position.set(-380, 46, -420);
      core.scale.setScalar(300);
      scene.add(core);
      const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture('rgba(255,200,130,0.5)'), transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      haze.position.copy(core.position);
      haze.scale.set(760, 300, 1);
      scene.add(haze);
    }
    // 星系恒星（光谱分级配色 + 衍射十字）+ 邻域航线 + 标签
    g3d.stars = [];
    const linePos = [];
    for (const ent of entries){
      const col = ent.current ? '#7ff5fa' : ent.home ? '#b48cff' : ent.meta.cls.col;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTexture(col, true), transparent: true, depthWrite: false, fog: false }));
      spr.position.copy(ent.pos);
      const base = ent.current ? 12 : ent.home ? 9.5 : ent.meta.cls.k === 'B' ? 9 : 8;
      spr.scale.setScalar(base);
      spr.userData.ent = ent;
      spr.userData.base = base;
      scene.add(spr);
      g3d.stars.push(spr);
      ent.spr = spr;
      if (!ent.current) linePos.push(0, 0, 0, ent.pos.x, ent.pos.y, ent.pos.z);
      const el = document.createElement('div');
      el.className = 'g3d-label' + (ent.current ? ' cur' : '') + (ent.home ? ' home' : '');
      el.textContent = (ent.current ? '⬤ ' : '') + ent.gal.name + (ent.meta.visited && !ent.current ? ' ·✓' : '');
      box.appendChild(el);
      g3d.labels.push(el);
      ent.label = el;
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    scene.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0x35e0e8, transparent: true, opacity: 0.10, fog: false })));
    // 选中标记：双层反向旋转卡爪环
    g3d.retA = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture('#ffb347'), transparent: true, depthWrite: false, fog: false }));
    g3d.retA.scale.setScalar(16);
    g3d.retA.visible = false;
    scene.add(g3d.retA);
    g3d.retB = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture('#35e0e8'), transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    g3d.retB.scale.setScalar(21);
    g3d.retB.visible = false;
    scene.add(g3d.retB);
    g3d.routeLine = null;
    g3d.routePulse = null;
    g3d.routeEnt = null;
    g3d.lockSeed = undefined;   // 触发 tick 内航线重建
    g3d.entries = entries;
    applyGalaxyFilter();
    resizeGalaxy();
    if (!g3d.raf) galaxyTick();
  }
  // 曲速航线：当前星系 → 锁定目标（紫色虚线 + 流动能量脉冲）
  function rebuildGalaxyRoute(){
    if (g3d.routeLine){ g3d.scene.remove(g3d.routeLine); g3d.routeLine.geometry.dispose(); g3d.routeLine = null; }
    if (g3d.routePulse){ g3d.scene.remove(g3d.routePulse); g3d.routePulse = null; }
    g3d.routeEnt = null;
    g3d.lockSeed = Game.warpLockSeed;
    if (g3d.lockSeed == null) return;
    const ent = g3d.entries.find(e => e.seed === g3d.lockSeed && !e.current);
    if (!ent) return;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), ent.pos]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xb48cff, transparent: true, opacity: 0.9, dashSize: 3, gapSize: 2.2 }));
    line.computeLineDistances();
    g3d.scene.add(line);
    g3d.routeLine = line;
    g3d.routePulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture('#e6d8ff'), transparent: true, depthWrite: false, fog: false }));
    g3d.routePulse.scale.setScalar(5);
    g3d.scene.add(g3d.routePulse);
    g3d.routeEnt = ent;
  }
  function resizeGalaxy(){
    const box = $('galMap');
    const w = box.clientWidth || 640, h = box.clientHeight || 420;
    g3d.renderer.setSize(w, h);
    g3d.cam.aspect = w / h;
    g3d.cam.updateProjectionMatrix();
  }
  function bindGalaxyControls(){
    const el = g3d.renderer.domElement;
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', e => { g3d.drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', e => {
      if (!g3d) return;
      if (g3d.drag){
        const dx = e.clientX - g3d.drag.x, dy = e.clientY - g3d.drag.y;
        g3d.drag.x = e.clientX; g3d.drag.y = e.clientY;
        g3d.drag.moved += Math.abs(dx) + Math.abs(dy);
        g3d.yaw -= dx * 0.006;
        g3d.pitch = THREE.MathUtils.clamp(g3d.pitch + dy * 0.006, -1.35, 1.35);
        return;
      }
      hoverGalaxy(e);
    });
    window.addEventListener('mouseup', e => {
      if (!g3d || !g3d.drag) return;
      const clicked = g3d.drag.moved < 5;
      g3d.drag = null;
      el.style.cursor = g3d.hover ? 'pointer' : 'grab';
      if (clicked) pickGalaxy(e);
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      g3d.distT = THREE.MathUtils.clamp(g3d.distT * (e.deltaY > 0 ? 1.14 : 0.87), 40, 420);
    }, { passive: false });
  }
  const _galRay = new THREE.Raycaster(), _galM = new THREE.Vector2();
  function galaxyHit(e){
    const rect = g3d.renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
    _galM.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    _galRay.setFromCamera(_galM, g3d.cam);
    const hits = _galRay.intersectObjects(g3d.stars).filter(h => !h.object.userData.ent.dim);
    return hits.length ? { ent: hits[0].object.userData.ent, rect } : null;
  }
  // 悬停侦测：星体增辉 + 光标随行情报条（名称/光谱/距离）
  function hoverGalaxy(e){
    if ($('galaxyPanel').classList.contains('hidden')) return;
    const tip = document.getElementById('galTip');
    const hit = galaxyHit(e);
    const ent = hit && hit.ent;
    if (g3d.hover && g3d.hover !== ent) g3d.hover.spr.scale.setScalar(g3d.hover.spr.userData.base);
    g3d.hover = ent || null;
    g3d.renderer.domElement.style.cursor = g3d.drag ? 'grabbing' : ent ? 'pointer' : 'grab';
    if (!ent){ if (tip) tip.style.display = 'none'; return; }
    ent.spr.scale.setScalar(ent.spr.userData.base * 1.35);
    if (tip){
      tip.innerHTML = `<b style="color:${ent.meta.cls.col}">${ent.gal.name}</b> · <span class="tclass">${ent.meta.cls.code}</span>` +
        ` · ${ent.current ? '当前所在' : ent.meta.ly + ' 光年'}${ent.meta.visited && !ent.current ? ' · ✓已到访' : ''}`;
      tip.style.display = '';
      tip.style.left = (e.clientX - hit.rect.left) + 'px';
      tip.style.top = (e.clientY - hit.rect.top) + 'px';
    }
  }
  function pickGalaxy(e){
    const hit = galaxyHit(e);
    if (!hit) return;
    const ent = hit.ent;
    Sound.play('uiClick');
    galSelected = ent;
    // 飞跃镜头：焦点滑向选中恒星并推近
    g3d.focus.copy(ent.pos);
    g3d.distT = Math.min(g3d.distT, 85);
    g3d.retA.visible = g3d.retB.visible = true;
    g3d.retA.position.copy(ent.pos);
    g3d.retB.position.copy(ent.pos);
    g3d.labels.forEach(l => l.classList.remove('sel'));
    if (ent.label) ent.label.classList.add('sel');
    showGalaxyDetail(ent);
  }
  const _gV = new THREE.Vector3();
  function galaxyTick(){
    if (!g3d) return;
    if ($('galaxyPanel').classList.contains('hidden')){ g3d.raf = 0; return; }
    g3d.raf = requestAnimationFrame(galaxyTick);
    g3d.t += 1 / 60;
    if (!g3d.drag) g3d.yaw += 0.0012;   // 待机缓转
    // 飞跃镜头：焦点/距离缓动（NMS 式滑向选中恒星）
    g3d.focusCur.lerp(g3d.focus, 0.07);
    g3d.dist += (g3d.distT - g3d.dist) * 0.08;
    g3d.cam.position.set(
      g3d.focusCur.x + Math.cos(g3d.pitch) * Math.sin(g3d.yaw) * g3d.dist,
      g3d.focusCur.y + Math.sin(g3d.pitch) * g3d.dist,
      g3d.focusCur.z + Math.cos(g3d.pitch) * Math.cos(g3d.yaw) * g3d.dist);
    g3d.cam.lookAt(g3d.focusCur);
    // 当前星系呼吸脉冲
    const curSpr = g3d.stars[0];
    if (curSpr) curSpr.scale.setScalar(curSpr.userData.base * (1 + Math.sin(g3d.t * 3.2) * 0.09));
    // 选中卡爪环：双层反向旋转
    if (galSelected && g3d.retA.visible){
      g3d.retA.material.rotation += 0.022;
      g3d.retB.material.rotation -= 0.014;
      const k = 1 + Math.sin(g3d.t * 4) * 0.05;
      g3d.retA.scale.setScalar(16 * k);
      g3d.retB.scale.setScalar(21 * k);
    }
    // 曲速航线：锁定变化即重建；能量脉冲沿航线流动
    if (g3d.lockSeed !== Game.warpLockSeed) rebuildGalaxyRoute();
    if (g3d.routePulse && g3d.routeEnt){
      const f = (g3d.t % 1.6) / 1.6;
      g3d.routePulse.position.copy(g3d.routeEnt.pos).multiplyScalar(f);
      g3d.routePulse.material.opacity = Math.sin(f * Math.PI) * 0.95;
    }
    g3d.renderer.render(g3d.scene, g3d.cam);
    // 标签投影（滤镜淡出的星隐藏名牌）
    const w = g3d.renderer.domElement.clientWidth, h = g3d.renderer.domElement.clientHeight;
    for (const ent of g3d.entries){
      _gV.copy(ent.pos).project(g3d.cam);
      if (_gV.z > 1 || ent.dim){ ent.label.style.display = 'none'; continue; }
      ent.label.style.display = '';
      ent.label.style.left = ((_gV.x + 1) / 2 * w) + 'px';
      ent.label.style.top = ((1 - _gV.y) / 2 * h + 8) + 'px';
    }
  }
  function showGalaxyDetail(ent){
    const info = $('galInfo');
    const gal = ent.gal, meta = ent.meta;
    const wc = Player.countItem('warpcell');
    const cur = ent.current;
    let html = `<div class="gal-detail"><h3>✦ ${gal.name}${meta.visited && !cur ? '<span class="gd-visited">✓ 已到访</span>' : ''}</h3>
      <div class="gd-seed">星图坐标 #${ent.seed}</div>
      <div class="gd-meta">
        <div class="gd-row"><span class="lb">恒星等级</span><b style="color:${meta.cls.col}">${meta.cls.code} · ${meta.cls.name}</b></div>
        <div class="gd-row"><span class="lb">星系特征</span><b>${meta.cls.desc}</b></div>
        <div class="gd-row"><span class="lb">行星</span><b>${gal.planets.length} 颗</b></div>
        <div class="gd-row"><span class="lb">经济</span><b>${gal.market ? meta.eco + (meta.ecoBest ? ' · 主营 ' + meta.ecoBest : '') : '母星贸易网'}</b></div>
        <div class="gd-row"><span class="lb">冲突</span><b${meta.conflict.startsWith('⚠') ? ' style="color:#ffb347"' : ''}>${meta.conflict}</b></div>
        <div class="gd-row"><span class="lb">距离</span><b>${cur ? '— 当前所在' : meta.ly + ' 光年 · 曲率电池 ×1'}</b></div>
      </div>`;
    for (const p of gal.planets){
      const b = BIOMES[p.biome];
      const col = '#' + new THREE.Color(b.tint).getHexString();
      html += `<div class="gal-planet"><span class="gp-dot" style="background:${col};color:${col}"></span>${p.name}<span class="gp-biome">${b.name}${b.haz ? ' ⚠' : ''}</span></div>`;
    }
    html += `</div>`;
    info.innerHTML = html;
    const btn = document.createElement('button');
    btn.className = 'gal-warp-btn';
    const locked = Game.warpLockSeed === ent.seed;
    if (cur){ btn.textContent = '当前所在星系'; btn.disabled = true; }
    else if (!locked && wc < 1){ btn.textContent = '⚠ 需要曲率电池 ×1（仍可锁定导航）'; btn.disabled = false; }
    if (!cur){
      btn.textContent = locked ? '◉ 解除锁定' : (wc >= 1 ? '◎ 锁定星系（出图后对准方框脉冲冲刺跃迁）' : '◎ 锁定导航方向（需要 1 枚曲率电池才可跃迁）');
      btn.onclick = () => {
        Game.setWarpLock(locked ? null : ent.seed, gal.name);
        showGalaxyDetail(ent);   // 刷新按钮态（航线由 tick 检测锁定变化自动重绘）
      };
    }
    info.querySelector('.gal-detail').appendChild(btn);
  }

  // ---------- 存档管理 ----------
  // mode: 'load'（主菜单读档）| 'save'（游戏内存档）
  function openSavePanel(mode){
    const el = $('savePanel');
    ['invPanel','machinePanel','techPanel','tradePanel','helpPanel','pausePanel','settingsPanel','modsPanel'].forEach(id => $(id).classList.add('hidden'));
    el.classList.remove('hidden');
    $('saveTitle').textContent = mode === 'save' ? '◈ 存档 — 覆盖或新建' : '◈ 继续档案 — 选择存档';
    $('btnNewSave').style.display = mode === 'save' ? '' : 'none';
    Sound.play('uiOpen');
    refreshSaveList(mode);
  }
  function refreshSaveList(mode){
    const list = $('saveList');
    list.innerHTML = '';
    const saves = Game.listSaves();
    if (!saves.length){
      list.innerHTML = '<div class="save-empty">— 暂无档案 —</div>';
    }
    for (const s of saves){
      const row = document.createElement('div');
      row.className = 'save-row';
      const date = new Date(s.time);
      const pad = n => String(n).padStart(2, '0');
      row.innerHTML = `
        <span class="sv-icon">${s.creative ? '✦' : '⛏'}</span>
        <div class="sv-info">
          <div class="sv-name">${s.name}</div>
          <div class="sv-meta">${s.creative ? '<span class="cr">创造</span>' : '生存'} · ${s.planetName} · 🪙${s.credits} · 游玩${s.playMin}分钟<br>${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}</div>
        </div>`;
      const act = document.createElement('button');
      act.className = 'sv-btn';
      act.textContent = mode === 'save' ? '覆盖' : '读取';
      act.onclick = () => {
        Sound.play('uiClick');
        if (mode === 'save'){
          if (!confirm(`覆盖存档「${s.name}」？`)) return;
          Game.saveTo(s.key);
          bigMessage('已存档', s.name, 1500);
          $('savePanel').classList.add('hidden');
          if (!anyPanelOpen()) Game.lockPointer();
        } else {
          $('savePanel').classList.add('hidden');
          Game.loadFrom(s.key);
        }
      };
      row.appendChild(act);
      const del = document.createElement('button');
      del.className = 'sv-btn danger';
      del.textContent = '✕';
      del.title = '删除存档';
      del.onclick = () => {
        if (!confirm(`删除存档「${s.name}」？不可恢复！`)) return;
        Game.deleteSave(s.key);
        Sound.play('breakBlk');
        refreshSaveList(mode);
      };
      row.appendChild(del);
      list.appendChild(row);
    }
  }
  $('btnNewSave').onclick = () => {
    const name = prompt('新存档名称：', '档案 ' + (Game.listSaves().length + 1));
    if (name === null) return;
    Game.saveTo(null, name.trim() || '未命名档案');
    Sound.play('craft');
    bigMessage('已创建存档', name, 1500);
    refreshSaveList('save');
  };

  document.querySelectorAll('.pclose').forEach(b => {
    b.onclick = () => {
      Sound.play('uiClose');
      tooltip().classList.add('hidden');   // 关闭面板时清掉详情
      if (b.dataset.close === 'tradePanel' && Game.state === 'docked'){ $('btnUndock').click(); return; }
      $(b.dataset.close).classList.add('hidden');
      if (b.dataset.close === 'machinePanel') openMachine = null;
      if (b.dataset.close === 'encyPanel' && encyReturnToInv){
        encyReturnToInv = false;
        $('invPanel').classList.remove('hidden');
        refreshInv();
      }
      if (Game.state !== 'menu' && !anyPanelOpen()) Game.lockPointer();
    };
  });

  // 机器面板实时刷新（进度/状态）
  let machTickT = 0;
  function tickMachinePanel(dt){
    if (!openMachine || $('invPanel').classList.contains('hidden') || wsMode !== 'machine') return;
    machTickT += dt;
    if (machTickT < 0.4) return;
    machTickT = 0;
    renderWs();
  }

  // 回收站：手持物品点击销毁（右键销毁1个）
  $('trashSlot').onclick = () => {
    if (!cursorStack) return;
    Sound.play('breakBlk', 1.4);
    cursorStack = null;
    updateGhost();
    refreshAll();
    flashTrash();
  };
  $('trashSlot').oncontextmenu = e => {
    e.preventDefault();
    if (!cursorStack) return;
    Sound.play('uiClick');
    cursorStack.n--;
    if (cursorStack.n <= 0) cursorStack = null;
    updateGhost();
    refreshAll();
    flashTrash();
  };
  function flashTrash(){
    const el = $('trashSlot');
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 200);
  }

  // ---------- JEI 式图鉴 ----------
  let lastHoverItem = null;
  let encyStack = [];
  let encyReturnToInv = false;  // 图鉴关闭后是否回到背包
  function openEncyclopediaFromHover(usage){
    const item = lastHoverItem
      || (Player.hotIdx >= 0 && Player.inv[Player.hotIdx] ? Player.inv[Player.hotIdx].item : null);
    openEncyclopedia(item, usage);
  }
  function openEncyclopedia(itemId, usage){
    const fromInv = !$('invPanel').classList.contains('hidden');
    if (!itemId || !ITEMS[itemId]) itemId = Object.keys(ITEMS)[0];
    closeAll();
    encyReturnToInv = fromInv;
    $('encyPanel').classList.remove('hidden');
    Sound.play('uiOpen');
    encyStack = [];
    document.exitPointerLock && document.exitPointerLock();
    renderEncyclopedia(itemId, !!usage);
  }
  function renderEncyclopedia(itemId, usage){
    if (!itemId || !ITEMS[itemId]){ buildEncyGrid(); return; }
    $('encyCrumb').textContent = ITEMS[itemId].name + ' · ' + (usage ? '用途' : '配方');
    $('encyBack').classList.remove('hidden');
    const view = $('encyView');
    view.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'ency-detail';
    const recCol = document.createElement('div');
    recCol.innerHTML = '<h3>配方</h3>';
    const useCol = document.createElement('div');
    useCol.innerHTML = '<h3>用途</h3>';
    const recipes = RECIPES.filter(r => r.out[itemId]);
    if (!recipes.length) recCol.innerHTML += '<div class="ency-recipe" style="color:#6d5438">没有直接配方</div>';
    for (const r of recipes){
      const el = document.createElement('div');
      el.className = 'ency-recipe';
      const outItem = Object.keys(r.out)[0];
      const locked = r.tech && !Game.techDone(r.tech);
      el.innerHTML = `<div class="rname">${ITEMS[outItem].name} ×${r.out[outItem]} <span style="color:#6d5438;font-size:10px">${r.where === 'hand' || r.where === 'both' ? '手工' : r.where} · ${r.time}s</span></div><div class="rcost">${locked ? `<span class="no">🔒 ${TECH[r.tech].name}</span>` : Object.keys(r.in).map(k => `<a class="inq" data-item="${k}" href="#">${ITEMS[k].name}×${r.in[k]}</a>`).join(' + ')}</div>`;
      el.querySelectorAll('.inq').forEach(a => {
        a.style.cssText = 'color:#4f7a2a;cursor:pointer;text-decoration:underline';
        a.onclick = ev => { ev.preventDefault(); encyStack.push({ item: itemId, usage }); renderEncyclopedia(a.dataset.item, false); };
      });
      recCol.appendChild(el);
    }
    const uses = RECIPES.filter(r => r.in[itemId]);
    if (!uses.length) useCol.innerHTML += '<div class="ency-recipe" style="color:#6d5438">没有配方使用它</div>';
    for (const r of uses){
      const el = document.createElement('div');
      el.className = 'ency-usage';
      const outItem = Object.keys(r.out)[0];
      el.innerHTML = `<a class="inq" data-item="${outItem}" href="#"><b>${ITEMS[outItem].name}</b></a> ×${r.out[outItem]} · ${r.where} · ${r.time}s<br><span style="font-size:10px;color:#6d5438">消耗 ${Object.keys(r.in).map(k => ITEMS[k].name + '×' + r.in[k]).join('、')}</span>`;
      el.querySelector('.inq').onclick = ev => {
        ev.preventDefault();
        encyStack.push({ item: itemId, usage });
        renderEncyclopedia(outItem, false);
      };
      useCol.appendChild(el);
    }
    box.appendChild(recCol);
    box.appendChild(useCol);
    view.appendChild(box);
  }
  function renderRecipeTree(itemId, depth, seen){
    const recipes = RECIPES.filter(r => r.out[itemId]);
    if (!recipes.length) return `<div class="recipe-leaf"><span>${ITEMS[itemId] ? ITEMS[itemId].name : itemId}</span><small>基础原料</small></div>`;
    const r = recipes.find(x => !x.hidden) || recipes[0], outN = r.out[itemId];
    const loop = seen.has(itemId); if (loop) return `<div class="recipe-leaf"><span>${ITEMS[itemId].name}</span><small>循环配方</small></div>`;
    const nextSeen = new Set(seen); nextSeen.add(itemId);
    return `<div class="recipe-node depth-${Math.min(depth, 5)}"><div class="recipe-node-head"><b>${ITEMS[itemId].name} ×${outN}</b><span>${r.where === 'both' ? '手工/装配' : r.where} · ${r.time}s</span></div><div class="recipe-inputs">${Object.keys(r.in).map(id => `<div class="recipe-input"><span>${ITEMS[id].name} ×${r.in[id]}</span>${renderRecipeTree(id, depth + 1, nextSeen)}</div>`).join('')}</div></div>`;
  }
  function openRecipeTree(itemId){
    const fromInv = !$('invPanel').classList.contains('hidden');
    if (!itemId || !ITEMS[itemId]) itemId = Object.keys(RECIPES[RECIPES.length - 1].out)[0];
    closeAll(); encyReturnToInv = fromInv; $('encyPanel').classList.remove('hidden'); $('encyCrumb').textContent = ITEMS[itemId].name + ' · 合成树'; $('encyBack').classList.add('hidden');
    $('encyView').innerHTML = `<div class="recipe-tree-view"><h3>完整原料路径</h3>${renderRecipeTree(itemId, 0, new Set())}</div>`;
    document.exitPointerLock && document.exitPointerLock(); Sound.play('uiOpen');
  }
  function buildEncyGrid(){
    const q = ($('encySearch').value || '').trim().toLowerCase();
    $('encyCrumb').textContent = '全部物品';
    $('encyBack').classList.add('hidden');
    const view = $('encyView');
    view.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'ency-grid';
    for (const id in ITEMS){
      const it = ITEMS[id];
      if (q && !(it.name.toLowerCase().includes(q) || id.toLowerCase().includes(q))) continue;
      const el = document.createElement('div');
      el.className = 'ency-item';
      el.appendChild(Icons.img(id));
      const nm = document.createElement('div'); nm.className = 'en-name'; nm.textContent = it.name;
      el.appendChild(nm);
      el.onmouseenter = e => { showTooltip(e, id); Sound.play('hover'); };
      el.onmousemove = e => { if (Date.now() - (el._lastTouch || 0) < 5000) return; moveTooltip(e); };
      el.onmouseleave = hideTooltip;
      el.onclick = () => { encyStack = []; renderEncyclopedia(id, false); };
      grid.appendChild(el);
    }
    view.appendChild(grid);
  }
  if ($('encySearch')) $('encySearch').oninput = buildEncyGrid;
  if ($('encyBack')) $('encyBack').onclick = () => {
    const prev = encyStack.pop();
    if (prev) renderEncyclopedia(prev.item, prev.usage);
    else buildEncyGrid();
  };
  if ($('recipeTreeBtn')) $('recipeTreeBtn').onclick = () => openRecipeTree(lastHoverItem || (Player.hotIdx >= 0 && Player.inv[Player.hotIdx] ? Player.inv[Player.hotIdx].item : null));
  if ($('scoreToggle')) $('scoreToggle').onclick = () => $('scoreBody').classList.toggle('collapsed');

  return {
    anyPanelOpen, closeAll, toggle, buildHotbar, refreshHotbar, refreshInv, refreshAll, showItemName,
    openMachinePanel, openTrade, refreshTrade, refreshTech, updateResearch, tickMachinePanel,
    toggleCreative, openSavePanel, openGalaxyMap,
    openEncyclopediaFromHover, openEncyclopedia, openQuestTree, openRecipeTree,
    pickupToast, bigMessage, refreshQuests, refreshHUD, setInteractHint, showTraitBox,
    get openMachine(){ return openMachine; },
    get researching(){ return researching; }, openBreeding: () => openInvWorkspace('breed'),
    set researching(v){ researching = v; },
    // 光标物品存取（飞船货仓等外部格子接入拖放体系）
    getCursor(){ return cursorStack; },
    setCursor(s){ cursorStack = (s && s.n > 0) ? s : null; updateGhost(); },
  };
})();
window.UI = UI;
