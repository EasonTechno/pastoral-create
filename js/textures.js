/* ============================================================
   STARFORGE - textures.js
   程序化像素贴图生成：16x16 图集 + 物品图标（全部原创绘制）
   ============================================================ */
'use strict';

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Tex = (() => {
  const TS = 16, COLS = 16;
  const canvas = document.createElement('canvas');
  canvas.width = TS * COLS; canvas.height = TS * COLS;
  const ctx = canvas.getContext('2d');
  const index = {}; // name -> tile index
  const tilePainters = {}; // name -> {painter, seed}（程序化底稿，回退用）
  const modTileNames = new Set();   // 模组动态分配的 tile 名
  const modTileImages = new Map();  // 模组 tile 的当前图像（重新加载材质包后恢复用）
  let cursor = 0;

  // --- 小工具 ---
  function shade(hex, f){
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return `rgb(${r},${g},${b})`;
  }
  function makePX(ox, oy){
    return (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); };
  }
  // 噪点填充
  function speckle(px, rnd, palette){
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++)
      px(x, y, palette[(rnd() * palette.length) | 0]);
  }
  // 定义一个 tile
  function tile(name, painter, seed){
    const i = cursor++;
    index[name] = i;
    tilePainters[name] = { painter, seed };
    const ox = (i % COLS) * TS, oy = ((i / COLS) | 0) * TS;
    ctx.clearRect(ox, oy, TS, TS);
    painter(makePX(ox, oy), mulberry32(seed || (i * 7919 + 13)), { ox, oy });
    return i;
  }
  function paintTile(name){
    const rec = tilePainters[name];
    const i = index[name];
    if (!rec || i === undefined) return;
    const ox = (i % COLS) * TS, oy = ((i / COLS) | 0) * TS;
    ctx.clearRect(ox, oy, TS, TS);
    rec.painter(makePX(ox, oy), mulberry32(rec.seed || (i * 7919 + 13)), { ox, oy });
  }
  // ---- 模组 tile：在 256 格图集里动态申请空位，先画占位、后用模组贴图覆盖 ----
  function nameHash(name){
    let h = 2166136261;
    for (let i = 0; i < name.length; i++){ h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function paintModPlaceholder(name){
    const i = index[name];
    if (i === undefined) return;
    const ox = (i % COLS) * TS, oy = ((i / COLS) | 0) * TS;
    const base = ['#7d5fb8','#4e8a5a','#b07a3a','#3f7d9a','#a34a4a'][nameHash(name) % 5];
    ctx.fillStyle = base; ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = shade(base, 0.72);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++)
      if (((x + y) & 1) === 0) ctx.fillRect(ox + x, oy + y, 1, 1);
  }
  function allocTile(name){
    if (index[name] !== undefined) return index[name];
    if (cursor >= COLS * COLS) throw new Error('贴图图集已满（256 格），无法再添加模组贴图');
    const i = cursor++;
    index[name] = i;
    modTileNames.add(name);
    paintModPlaceholder(name);
    return i;
  }
  function hasTile(name){ return index[name] !== undefined; }
  function setTileImage(name, img){
    allocTile(name);
    modTileImages.set(name, img);
    drawTileFromImage(name, img);
  }
  function reapplyModTiles(){
    for (const name of modTileNames){
      const img = modTileImages.get(name);
      if (img) drawTileFromImage(name, img);
      else paintModPlaceholder(name);
    }
  }
  const pal = (base, n = 4, spread = 0.16) => {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(shade(base, 1 - spread * i));
    return arr;
  };

  // ============ 基础地形 ============
  tile('grass_top', (px, r) => speckle(px, r, ['#69b23f','#5da337','#74bd48','#619f3b','#7cc44f']));
  tile('dirt',      (px, r) => speckle(px, r, ['#8a5f3c','#7d5535','#95683f','#775033','#8a6039']));
  tile('grass_side',(px, r) => {
    speckle(px, r, ['#8a5f3c','#7d5535','#95683f','#775033']);
    for (let x = 0; x < TS; x++){
      const h = 3 + ((r() * 2.4) | 0);
      for (let y = 0; y < h; y++) px(x, y, ['#69b23f','#5da337','#74bd48'][(r()*3)|0]);
    }
  });
  tile('stone', (px, r) => {
    speckle(px, r, ['#8c8c8c','#828282','#969696','#7a7a7a']);
    for (let i = 0; i < 5; i++){ const x=(r()*14)|0,y=(r()*14)|0; px(x,y,'#a3a3a3'); px(x+1,y,'#a3a3a3'); }
  });
  tile('sand', (px, r) => speckle(px, r, ['#e0d29a','#d8c98e','#e8dba6','#d0c184']));
  tile('gravel', (px, r) => speckle(px, r, ['#8f8b87','#7c7975','#a09b96','#6e6a66','#95908b']));
  tile('log_side', (px, r) => {
    for (let x = 0; x < TS; x++){
      const band = ['#6b502f','#5e4629','#755834','#634a2b'][x % 4];
      for (let y = 0; y < TS; y++) px(x, y, r() < 0.85 ? band : shade('#6b502f', 0.8 + r()*0.4));
    }
  });
  tile('log_top', (px, r) => {
    speckle(px, r, ['#b08d55','#a5854f']);
    for (let ring = 7; ring >= 1; ring -= 2)
      for (let a = 0; a < 64; a++){
        const x = 8 + Math.round(Math.cos(a/64*6.283) * ring * 0.9);
        const y = 8 + Math.round(Math.sin(a/64*6.283) * ring * 0.9);
        if (x>=0&&x<16&&y>=0&&y<16) px(x, y, '#8a6b3d');
      }
    for(let i=0;i<16;i++){px(i,0,'#6b502f');px(i,15,'#6b502f');px(0,i,'#6b502f');px(15,i,'#6b502f');}
  });
  tile('leaves', (px, r) => {
    // 镂空树叶：约1/4像素透明，可透视
    const pal = ['#3f7d2c','#357024','#488a33','#2e6420'];
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++){
      if (r() < 0.24) continue;                 // 透明孔洞
      px(x, y, pal[(r() * pal.length) | 0]);
      if (r() < 0.06) px(x, y, '#5aa93f');      // 高光叶尖
    }
  });
  tile('planks', (px, r) => {
    speckle(px, r, ['#a8824f','#9d7948','#b28a55']);
    for (let y = 3; y < TS; y += 4) for (let x = 0; x < TS; x++) px(x, y, '#7a5c35');
    px(4,1,'#7a5c35'); px(11,5,'#7a5c35'); px(2,9,'#7a5c35'); px(13,13,'#7a5c35');
  });
  tile('water', (px, r) => speckle(px, r, ['#3e6bd6','#3862c7','#4675e0','#3455b8']));
  tile('ice', (px, r) => {
    speckle(px, r, ['#a8d4f0','#9ccbeb','#b6ddf5']);
    px(3,4,'#e0f2fc'); px(4,5,'#e0f2fc'); px(10,9,'#e0f2fc'); px(11,10,'#e0f2fc'); px(12,3,'#e0f2fc');
  });
  tile('snow_top', (px, r) => speckle(px, r, ['#f2f6fa','#e8eef5','#fafcff','#e0e8f0']));
  tile('snow_side', (px, r) => {
    speckle(px, r, ['#8a5f3c','#7d5535','#95683f']);
    for (let x = 0; x < TS; x++) for (let y = 0; y < 4; y++) px(x, y, ['#f2f6fa','#e8eef5'][(r()*2)|0]);
  });
  tile('basalt', (px, r) => {
    speckle(px, r, ['#3a3a42','#33333a','#42424c','#2c2c33']);
    for (let i = 0; i < 4; i++){ const x=(r()*15)|0,y=(r()*15)|0; px(x,y,'#ff7733'); if(r()<0.5)px(x+1,y,'#c94f1e'); }
  });
  tile('alien_top', (px, r) => speckle(px, r, ['#9a5fd0','#8b52c2','#a86ddb','#7d47b3','#b078e0']));
  tile('alien_side', (px, r) => {
    speckle(px, r, ['#6e4a8a','#61407c','#7b5498']);
    for (let x = 0; x < TS; x++){ const h = 3 + ((r()*2.2)|0); for (let y = 0; y < h; y++) px(x, y, ['#9a5fd0','#a86ddb'][(r()*2)|0]); }
  });
  tile('barrier', (px, r) => {
    speckle(px, r, ['#2a2a30','#222228','#32323a']);
    for (let i = 0; i < 16; i++){ px(i, i, '#4a4a55'); px(15 - i, i, '#4a4a55'); }
  });
  // ---- 新星球类型 ----
  tile('crystal', (px, r) => {
    speckle(px, r, ['#1a4a50','#153c42','#20585e']);
    for (let i = 0; i < 5; i++){
      const x = 1 + ((r() * 12) | 0), y = 1 + ((r() * 12) | 0);
      px(x, y, '#7fe8e0'); px(x + 1, y + 1, '#aef7f2'); px(x, y + 1, '#5ec8c0');
      if (r() < 0.5) px(x + 1, y, '#ffffff');
    }
  });
  tile('mush_stem', (px, r) => {
    for (let x = 0; x < 16; x++){
      const band = ['#e8dcc8','#dccfb8','#f0e6d4'][x % 3];
      for (let y = 0; y < 16; y++) px(x, y, r() < 0.9 ? band : '#c4b8a2');
    }
    for (let i = 0; i < 16; i++){ px(0, i, '#b8ab94'); px(15, i, '#b8ab94'); }
  });
  tile('mush_cap', (px, r) => {
    speckle(px, r, ['#a04fc8','#9445ba','#ad5cd4','#8a3dad']);
    for (let i = 0; i < 5; i++){
      const x = 1 + ((r() * 12) | 0), y = 1 + ((r() * 12) | 0);
      px(x, y, '#f0e0f8'); px(x + 1, y, '#f0e0f8'); px(x, y + 1, '#f0e0f8'); px(x + 1, y + 1, '#e0c8ec');
    }
  });
  tile('ash', (px, r) => {
    speckle(px, r, ['#5c5a56','#524f4c','#66625e','#48453f']);
    for (let i = 0; i < 3; i++){
      const x = (r() * 15) | 0, y = (r() * 15) | 0;
      px(x, y, r() < 0.5 ? '#8a4a2a' : '#3a3a3a');
    }
  });
  // ---- 更多星球类型 ----
  tile('amber', (px, r) => {
    speckle(px, r, ['#e0a63a','#d49830','#ecb448','#c88a28']);
    for (let i = 0; i < 4; i++){
      const x = 1 + ((r() * 13) | 0), y = 1 + ((r() * 13) | 0);
      px(x, y, '#8a5a14'); if (r() < 0.5) px(x + 1, y, '#6e4610');   // 包裹物
      px(x - 1, y - 1, '#f8d878');                                     // 高光
    }
  });
  tile('rust', (px, r) => {
    speckle(px, r, ['#9a5a38','#8a4e30','#a86a42','#7c452a']);
    for (let i = 0; i < 5; i++){
      const x = (r() * 15) | 0, y = (r() * 15) | 0;
      px(x, y, r() < 0.5 ? '#c8875a' : '#5e3520');
      if (r() < 0.3) px(x + 1, y, '#d8d8dc');   // 金属反光
    }
  });
  tile('salt', (px, r) => {
    speckle(px, r, ['#f0f2f4','#e6e9ec','#f8fafc','#dde2e6']);
    for (let i = 0; i < 4; i++){
      const x = 1 + ((r() * 13) | 0), y = 1 + ((r() * 13) | 0);
      px(x, y, '#c2c9ce'); px(x + 1, y, '#c2c9ce'); px(x + 1, y + 1, '#c2c9ce');   // 裂纹
    }
  });
  tile('obsidian', (px, r) => {
    speckle(px, r, ['#1c1a26','#16141f','#24202e','#120f1a']);
    for (let i = 0; i < 3; i++){
      const x = 1 + ((r() * 12) | 0), y = 1 + ((r() * 12) | 0);
      px(x, y, '#6a5a9a'); px(x + 1, y + 1, '#48406e');   // 玻璃光泽
      if (r() < 0.4) px(x + 2, y + 2, '#8a7ab8');
    }
  });
  tile('redmoss_top', (px, r) => speckle(px, r, ['#b04a38','#a04230','#c05642','#943a2a','#c86a50']));
  tile('redmoss_side', (px, r) => {
    speckle(px, r, ['#8a5f3c','#7d5535','#95683f']);
    for (let x = 0; x < TS; x++){ const h = 3 + ((r() * 2.2) | 0); for (let y = 0; y < h; y++) px(x, y, ['#b04a38','#c05642'][(r() * 2) | 0]); }
  });
  tile('hive', (px, r) => {
    speckle(px, r, ['#d8862a','#c87822','#e69634']);
    // 蜂窝格纹
    for (let cy = 0; cy < 2; cy++)
      for (let cx = 0; cx < 2; cx++){
        const ox = cx * 8 + (cy % 2) * 4, oy = cy * 8;
        for (let a = 0; a < 12; a++){
          const x = (ox + 3 + Math.round(Math.cos(a / 12 * 6.283) * 2.6)) & 15;
          const y = (oy + 3 + Math.round(Math.sin(a / 12 * 6.283) * 2.6)) & 15;
          px(x, y, '#8a5210');
        }
        px((ox + 3) & 15, (oy + 3) & 15, '#5e3808');
      }
  });
  tile('murk_top', (px, r) => {
    speckle(px, r, ['#1e5a4c','#1a4f42','#246656','#16453a']);
    for (let i = 0; i < 4; i++) px((r() * 15) | 0, (r() * 15) | 0, '#4ee8b8');   // 荧光点
  });
  tile('murk_side', (px, r) => {
    speckle(px, r, ['#4a4238','#3f382f','#554c40']);
    for (let x = 0; x < TS; x++){ const h = 3 + ((r() * 2) | 0); for (let y = 0; y < h; y++) px(x, y, ['#1e5a4c','#246656'][(r() * 2) | 0]); }
  });
  tile('glow_shroom', (px, r) => {
    // 荧光蘑菇（十字面片）
    px(7, 15, '#3a5248'); px(8, 14, '#2e453c'); px(7, 13, '#3a5248'); px(8, 12, '#2e453c');
    const c = '#4ee8b8', h = '#b8ffe8', d = '#2aa882';
    px(6, 9, c); px(7, 9, c); px(8, 9, c); px(9, 9, c);
    px(5, 10, d); px(10, 10, d);
    px(6, 8, h); px(7, 7, h); px(8, 8, c); px(9, 8, d);
    px(7, 10, '#e8fff6'); px(8, 10, '#e8fff6');
  });

  // ============ 矿石（石底 + 矿斑）============
  function orePainter(color, hi, glow){
    return (px, r) => {
      speckle(px, r, ['#8c8c8c','#828282','#969696','#7a7a7a']);
      for (let i = 0; i < 5; i++){
        const x = 1 + ((r() * 12) | 0), y = 1 + ((r() * 12) | 0);
        px(x, y, color); px(x+1, y, color); px(x, y+1, color); px(x+1, y+1, hi);
        if (glow && r() < 0.7) px(x+2, y+1, glow);
      }
    };
  }
  tile('coal_ore',     orePainter('#2b2b2b', '#4a4a4a'));
  tile('iron_ore',     orePainter('#d8af93', '#e8c7ae'));
  tile('copper_ore',   orePainter('#d17f4a', '#e89a63'));
  tile('titanium_ore', orePainter('#cdd6dd', '#eef4f8'));
  tile('uranium_ore',  orePainter('#69d436', '#a2f078', '#c6ff9e'));
  tile('gold_ore',     orePainter('#f5cd3a', '#ffe98a'));

  // ============ 金属块（物品图标配色取样用，程序化兜底） ============
  tile('iron_block',   (px, r) => speckle(px, r, ['#c8c4ba','#bdb8ab','#d2cec4','#b0ab9e']));
  tile('copper_block', (px, r) => speckle(px, r, ['#c08a62','#b57d55','#cc986f','#a9744d']));
  tile('gold_block',   (px, r) => speckle(px, r, ['#d8b64f','#cfa83f','#e3c35e','#c39a34']));
  tile('coal_block',   (px, r) => speckle(px, r, ['#2b2b2b','#242424','#343434','#1d1d1d']));
  tile('diamond_block',(px, r) => speckle(px, r, ['#9fd8e0','#8ccbd6','#b5e6ec','#7abcc9']));

  // ============ 植物（十字面片）============
  tile('sodium_plant', (px, r) => {
    // 田园黄花：短茎 + 蒲公英式花头
    px(7,13,'#3f7d2c'); px(7,14,'#357024'); px(7,12,'#3f7d2c');
    px(6,12,'#2e6420'); px(8,13,'#2e6420'); px(5,14,'#2e6420');
    px(6,6,'#ffd23e'); px(7,6,'#ffe98a'); px(8,6,'#ffd23e');
    px(6,7,'#ffd23e'); px(7,7,'#fff2ae'); px(8,7,'#ffd23e');
    px(7,5,'#ffe98a'); px(7,8,'#ffd23e'); px(5,7,'#d9a80f'); px(9,7,'#d9a80f');
  });
  tile('oxygen_plant', (px, r) => {
    // 田园红花：短茎 + 四瓣小花
    px(7,13,'#3f7d2c'); px(7,14,'#357024'); px(7,12,'#3f7d2c');
    px(6,13,'#2e6420'); px(8,12,'#2e6420'); px(5,14,'#2e6420');
    px(6,6,'#e8484e'); px(7,6,'#ff8a80'); px(8,6,'#e8484e');
    px(6,7,'#e8484e'); px(7,7,'#ffb0a8'); px(8,7,'#e8484e');
    px(7,5,'#ff8a80'); px(7,8,'#c22e24');
  });
  tile('carbon_fern', (px, r) => {
    // 短草：几簇从根部竖起的草叶
    for (let i = 0; i < 9; i++){
      const x = 2 + ((r() * 12) | 0);
      const h = 3 + ((r() * 5) | 0);
      const c = ['#3f7d2c','#2e6420','#488a33','#357024'][(r() * 4) | 0];
      for (let y = 14 - h; y <= 14; y++) px(x, y, c);
    }
    px(7,14,'#2e6420'); px(8,13,'#357024'); px(6,14,'#488a33');
  });

  // ============ 功能方块 ============
  tile('glass', (px) => {
    for (let i = 0; i < 16; i++){ px(i,0,'#cfeef5'); px(i,15,'#cfeef5'); px(0,i,'#cfeef5'); px(15,i,'#cfeef5'); }
    px(3,3,'#ffffffcc'); px(4,4,'#ffffff99'); px(5,5,'#ffffff66');
  });
  tile('lamp_on', (px, r) => {
    speckle(px, r, ['#ffe9a8','#fff3c8','#ffdf8e']);
    for (let i = 0; i < 16; i++){ px(i,0,'#8a6b2d'); px(i,15,'#8a6b2d'); px(0,i,'#8a6b2d'); px(15,i,'#8a6b2d'); }
  });
  // 金属面板（机器通用）
  tile('metal', (px, r) => {
    speckle(px, r, ['#9aa7b0','#909da6','#a4b1ba','#8a97a0']);
    for (let i = 0; i < 16; i++){ px(i,0,'#b8c5ce'); px(0,i,'#b8c5ce'); px(i,15,'#6a7780'); px(15,i,'#6a7780'); }
    px(2,2,'#5f6b73');px(13,2,'#5f6b73');px(2,13,'#5f6b73');px(13,13,'#5f6b73');
  });
  tile('metal_dark', (px, r) => {
    speckle(px, r, ['#4e5a63','#46525b','#57636c']);
    for (let i = 0; i < 16; i++){ px(i,0,'#68747d'); px(0,i,'#68747d'); px(i,15,'#333d44'); px(15,i,'#333d44'); }
  });
  tile('vent', (px, r) => {
    speckle(px, r, ['#4e5a63','#46525b']);
    for (let y = 2; y < 14; y += 3) for (let x = 2; x < 14; x++){ px(x, y, '#222a30'); px(x, y+1, '#68747d'); }
  });
  tile('furnace_front', (px, r) => {
    speckle(px, r, ['#8c8c8c','#828282','#969696']);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) px(x, y, '#1d1d1d');
    for (let x = 3; x < 13; x++){ px(x, 7, '#5a5a5a'); px(x, 14, '#5a5a5a'); }
  });
  tile('furnace_on', (px, r) => {
    speckle(px, r, ['#8c8c8c','#828282','#969696']);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++)
      px(x, y, ['#ff8c1a','#ffb31a','#ff6600','#ffd21a'][(r()*4)|0]);
    for (let x = 3; x < 13; x++){ px(x, 7, '#5a5a5a'); px(x, 14, '#5a5a5a'); }
  });
  tile('belt', (px, r) => {
    speckle(px, r, ['#3a4148','#333a40','#424a52']);
    for (let x = 0; x < 16; x++){ px(x,0,'#586269'); px(x,15,'#586269'); }
    // 黄色箭头纹（滚动动画用）
    for (const oy of [2, 10]){
      for (let i = 0; i < 5; i++){ px(3+i, oy+4-i>oy? oy+i : oy, '#ffcf4d'); }
      px(3,oy,'#ffcf4d');px(4,oy+1,'#ffcf4d');px(5,oy+2,'#ffcf4d');px(4,oy+3,'#ffcf4d');px(3,oy+4,'#ffcf4d');
      px(9,oy,'#e6b23a');px(10,oy+1,'#e6b23a');px(11,oy+2,'#e6b23a');px(10,oy+3,'#e6b23a');px(9,oy+4,'#e6b23a');
    }
  });
  // 转弯传送带：入口在下边缘(-z)，出口在右边缘(+x)
  tile('belt_turn', (px, r) => {
    speckle(px, r, ['#3a4148','#333a40','#424a52']);
    for (let x = 0; x < 16; x++) px(x, 0, '#586269');
    for (let y = 0; y < 16; y++) px(0, y, '#586269');
    // 弧形导轨
    for (let a = 0; a < 26; a++){
      const t = a / 25 * Math.PI / 2;
      const x = Math.round(15 - Math.cos(t) * 12), y = Math.round(15 - Math.sin(t) * 12);
      if (x>=0&&x<16&&y>=0&&y<16){ px(x, y, '#ffcf4d'); }
      const x2 = Math.round(15 - Math.cos(t) * 6), y2 = Math.round(15 - Math.sin(t) * 6);
      if (x2>=0&&x2<16&&y2>=0&&y2<16){ px(x2, y2, '#e6b23a'); }
    }
    px(13,12,'#ffcf4d'); px(12,13,'#ffcf4d');
  });
  // 风机塔身 / 火电正面
  tile('wind_pole', (px, r) => {
    speckle(px, r, ['#c8d2d8','#bcc6cc','#d2dce2']);
    for (let i = 0; i < 16; i++){ px(0,i,'#98a2a8'); px(15,i,'#98a2a8'); }
    px(7,3,'#8a97a0');px(8,3,'#8a97a0');px(7,10,'#8a97a0');px(8,10,'#8a97a0');
  });
  tile('miner_top', (px, r) => {
    speckle(px, r, ['#9aa7b0','#909da6','#a4b1ba']);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) px(x, y, '#333d44');
    for (let i = 5; i < 11; i++){ px(i, i, '#ffcf4d'); px(16-i, i, '#ffcf4d'); }
    for (let i = 0; i < 16; i++){ px(i,0,'#b8c5ce'); px(0,i,'#b8c5ce'); px(i,15,'#6a7780'); px(15,i,'#6a7780'); }
  });
  tile('assembler_top', (px, r) => {
    speckle(px, r, ['#9aa7b0','#909da6','#a4b1ba']);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) px(x, y, '#1a2a38');
    px(7,7,'#35e0e8');px(8,7,'#35e0e8');px(7,8,'#35e0e8');px(8,8,'#7ff5fa');
    for (let i = 0; i < 16; i++){ px(i,0,'#b8c5ce'); px(0,i,'#b8c5ce'); px(i,15,'#6a7780'); px(15,i,'#6a7780'); }
  });
  tile('solar_top', (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      px(x, y, (x % 5 === 0 || y % 8 === 7) ? '#8a97a0' : ['#16294e','#1a3160','#122342'][(r()*3)|0]);
    px(3,2,'#4a6dc0'); px(8,4,'#4a6dc0'); px(12,9,'#4a6dc0');
  });
  tile('chest_side', (px, r) => {
    speckle(px, r, ['#a8824f','#9d7948','#b28a55']);
    for (let i = 0; i < 16; i++){ px(i,0,'#7a5c35'); px(i,15,'#7a5c35'); px(0,i,'#7a5c35'); px(15,i,'#7a5c35'); }
    for (let x = 0; x < 16; x++) px(x, 6, '#63482a');
    px(7,6,'#d8d8d8'); px(8,6,'#d8d8d8'); px(7,7,'#b8b8b8'); px(8,7,'#b8b8b8');
  });
  tile('refinery_side', (px, r) => {
    speckle(px, r, ['#4e5a63','#46525b','#57636c']);
    for (let y = 3; y < 13; y++){ px(4, y, '#ff8c1a'); px(5, y, '#c9641a'); px(10, y, '#35e0e8'); px(11, y, '#1a8a90'); }
    for (let i = 0; i < 16; i++){ px(i,0,'#68747d'); px(i,15,'#333d44'); }
  });
  tile('reactor_side', (px, r) => {
    speckle(px, r, ['#4e5a63','#46525b','#57636c']);
    for (let y = 4; y < 12; y++) for (let x = 6; x < 10; x++) px(x, y, ['#69d436','#a2f078','#4caf1e'][(r()*3)|0]);
    for (let i = 0; i < 16; i++){ px(i,0,'#68747d'); px(0,i,'#68747d'); px(i,15,'#333d44'); px(15,i,'#333d44'); }
  });
  tile('storage_top', (px, r) => {
    speckle(px, r, ['#a8824f','#9d7948']);
    for (let i = 0; i < 16; i++){ px(i,0,'#7a5c35'); px(i,15,'#7a5c35'); px(0,i,'#7a5c35'); px(15,i,'#7a5c35'); }
  });

  // ============ 农田与作物（Pastoral 加载前先程序化兜底） ============
  tile('farmland_dry', (px, r) => {
    speckle(px, r, ['#8a5f3c','#7d5535','#95683f']);
    for (let y = 2; y < 16; y += 4)
      for (let x = 0; x < 16; x++){ px(x, y, '#6e4727'); px(x, y+1, '#7d5535'); }
  });
  tile('farmland_wet', (px, r) => {
    speckle(px, r, ['#5e432c','#543b27','#684a32']);
    for (let y = 2; y < 16; y += 4)
      for (let x = 0; x < 16; x++){ px(x, y, '#4a301f'); px(x, y+1, '#5e432c'); }
    for (let i = 0; i < 6; i++) px((r()*15)|0, (r()*15)|0, '#a7d8e8');
  });
  function cropPainter(stage, greens){
    return (px, r) => {
      const h = 2 + stage * 2;
      const base = greens || ['#3f7d2c','#5aa93f','#7cc44f'];
      for (let i = 0; i < 16; i++){
        if (r() < 0.12) continue;
        const y = 15 - ((r() * h) | 0);
        px(i, y, base[(r() * base.length) | 0]);
        if (stage >= 2 && r() < 0.22) px(i, y - 1, base[base.length - 1]);
      }
    };
  }
  tile('wheat_stage0', cropPainter(0, ['#9aa53f','#b4a847']));
  tile('wheat_stage1', cropPainter(1, ['#9aa53f','#b4a847']));
  tile('wheat_stage2', cropPainter(2, ['#b49a3a','#d4b84a']));
  tile('wheat_stage3', cropPainter(3, ['#d4b84a','#e8cf5a']));
  tile('potato_stage0', cropPainter(0, ['#4a7a3a','#6aa04f']));
  tile('potato_stage1', cropPainter(1, ['#4a7a3a','#6aa04f']));
  tile('potato_stage2', cropPainter(2, ['#4a7a3a','#6aa04f']));
  tile('potato_stage3', cropPainter(3, ['#4a7a3a','#6aa04f']));
  tile('carrot_stage0', cropPainter(0, ['#3f8a3f','#5aa95a']));
  tile('carrot_stage1', cropPainter(1, ['#3f8a3f','#5aa95a']));
  tile('carrot_stage2', cropPainter(2, ['#3f8a3f','#5aa95a']));
  tile('carrot_stage3', cropPainter(3, ['#3f8a3f','#5aa95a']));
  tile('beet_stage0', cropPainter(0, ['#7a3f5a','#a05a78']));
  tile('beet_stage1', cropPainter(1, ['#7a3f5a','#a05a78']));
  tile('beet_stage2', cropPainter(2, ['#7a3f5a','#a05a78']));
  tile('beet_stage3', cropPainter(3, ['#8a355a','#b35a7f']));
  tile('berry_stage0', cropPainter(0, ['#3f6a3f','#5a8a5a']));
  tile('berry_stage1', cropPainter(1, ['#3f6a3f','#5a8a5a']));
  tile('berry_stage2', cropPainter(2, ['#3f6a3f','#c03a4a']));
  tile('berry_stage3', cropPainter(3, ['#3f6a3f','#e84858']));
  tile('pumpkin_stage0', cropPainter(0, ['#3f7d2c']));
  tile('pumpkin_stage1', cropPainter(1, ['#3f7d2c','#6a9a3f']));
  tile('pumpkin_stage2', cropPainter(2, ['#3f7d2c','#d8953a']));
  tile('pumpkin_stage3', (px, r) => {
    speckle(px, r, ['#d8953a','#c9832f','#e8a848']);
    for (let x = 0; x < 16; x++) px(x, 0, '#3f7d2c');
  });

  // Default 材质包组合：PureEdge 方块 + Pastoral 作物 + Whimscape 物品。
  // 所有可见贴图都来自材质包 PNG；没有任何程序化手绘贴图出现在显示路径中。
  const PUREEDGE_DIR = 'assets/textures/pureedge/block';
  const PASTORAL_DIR = 'assets/textures/pastoral';
  const WHIM_BLOCK_DIR = 'assets/textures/whimscape/block';
  const PUREEDGE_MAP = {
    grass_top: 'grass_block_top', grass_side: 'grass_block_side', dirt: 'dirt',
    stone: 'stone', sand: 'sand', gravel: 'gravel', log_side: 'oak_log', log_top: 'oak_log_top',
    leaves: 'oak_leaves', planks: 'oak_planks', glass: 'glass', water: 'water_still',
    ice: 'ice', snow_top: 'snow', snow_side: 'snow', basalt: 'basalt_side', barrier: 'bedrock',
    coal_ore: 'coal_ore', iron_ore: 'iron_ore', gold_ore: 'gold_ore',
    titanium_ore: 'diamond_ore', uranium_ore: 'lapis_ore',
    iron_block: 'iron_block', gold_block: 'gold_block', diamond_block: 'diamond_block', coal_block: 'coal_block',
    furnace_front: 'furnace_front', furnace_on: 'furnace_front_on', furnace_side: 'furnace_side',
    farmland_dry: 'farmland', farmland_wet: 'farmland_moist',
  };
  // PureEdge 是 1.16 材质包，没有铜矿/铜块，用 Whimscape 补齐（同样是材质包贴图）。
  const WHIM_BLOCK_MAP = {
    copper_ore: 'copper_ore', copper_block: 'copper_block',
  };
  // 作物统一使用 Pastoral。
  const PASTORAL_CROP_MAP = {
    wheat_stage0: 'wheat_stage0', wheat_stage1: 'wheat_stage1', wheat_stage2: 'wheat_stage2', wheat_stage3: 'wheat_stage7',
    potato_stage0: 'potatoes_stage0', potato_stage1: 'potatoes_stage1', potato_stage2: 'potatoes_stage2', potato_stage3: 'potatoes_stage3',
    carrot_stage0: 'carrots_stage0', carrot_stage1: 'carrots_stage1', carrot_stage2: 'carrots_stage2', carrot_stage3: 'carrots_stage3',
    beet_stage0: 'beetroots_stage0', beet_stage1: 'beetroots_stage1', beet_stage2: 'beetroots_stage2', beet_stage3: 'beetroots_stage3',
    berry_stage0: 'sweet_berry_bush_stage0', berry_stage1: 'sweet_berry_bush_stage1', berry_stage2: 'sweet_berry_bush_stage2', berry_stage3: 'sweet_berry_bush_stage3',
    pumpkin_stage0: 'pumpkin_stem', pumpkin_stage1: 'pumpkin_stem', pumpkin_stage2: 'pumpkin_stem', pumpkin_stage3: 'pumpkin_side',
  };
  // 机器/装饰贴图映射到 PureEdge 原版方块贴图，不再用程序化金属板/通风口。
  const MACHINE_TILE_MAP = {
    metal: 'iron_block', metal_dark: 'basalt_side', vent: 'smoker_side',
    belt: 'gravel', belt_turn: 'gravel', wind_pole: 'oak_log',
    miner_top: 'iron_block', assembler_top: 'crafting_table_top', solar_top: 'sea_lantern',
    chest_side: 'barrel_side', storage_top: 'barrel_top', refinery_side: 'blast_furnace_side',
    reactor_side: 'obsidian', lamp_on: 'glowstone',
  };
  // 其它生态的装饰方块也尽量映射到材质包贴图，避免任何手绘残留。
  const EXTRA_TILE_MAP = {
    alien_top: 'grass_block_top', alien_side: 'grass_block_side',
    crystal: 'diamond_ore', mush_stem: 'oak_log', mush_cap: 'oak_leaves',
    ash: 'dirt', amber: 'gold_ore', rust: 'iron_ore', salt: 'snow', obsidian: 'obsidian',
    redmoss_top: 'grass_block_top', redmoss_side: 'grass_block_side', hive: 'stone',
    murk_top: 'grass_block_top', murk_side: 'grass_block_side',
    sodium_plant: 'dandelion', oxygen_plant: 'poppy', carbon_fern: 'fern', glow_shroom: 'fern',
  };
  const CROP_TILE_NAMES = Object.keys(PASTORAL_CROP_MAP);
  const TEXTURE_PACKS = {
    default: { map: PUREEDGE_MAP },
    imported: { map: PUREEDGE_MAP },
  };
  function tileSource(tileName){
    if (PASTORAL_CROP_MAP[tileName]) return { dir: PASTORAL_DIR, file: PASTORAL_CROP_MAP[tileName] };
    if (PUREEDGE_MAP[tileName]) return { dir: PUREEDGE_DIR, file: PUREEDGE_MAP[tileName] };
    if (MACHINE_TILE_MAP[tileName]) return { dir: PUREEDGE_DIR, file: MACHINE_TILE_MAP[tileName] };
    if (WHIM_BLOCK_MAP[tileName]) return { dir: WHIM_BLOCK_DIR, file: WHIM_BLOCK_MAP[tileName] };
    if (EXTRA_TILE_MAP[tileName]) return { dir: PUREEDGE_DIR, file: EXTRA_TILE_MAP[tileName] };
    return null;
  }
  const importedBlockImages = {};   // tileName -> Image/canvas
  const importedItemImages = {};    // itemId -> canvas
  function tileNames(){ return Object.keys(index); }
  function basenameNoExt(p){
    const base = String(p).split('/').pop().split('\\').pop();
    return base.replace(/\.png$/i, '');
  }
  function drawTileFromImage(tileName, img){
    const i = index[tileName];
    if (i === undefined) return;
    const ox = (i % COLS) * TS, oy = ((i / COLS) | 0) * TS;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(ox, oy, TS, TS);
    ctx.drawImage(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, ox, oy, TS, TS);
  }
  // PureEdge 的草方块侧面是“泥土底 + 灰色草皮叠加层”，
  // 这里用材质包自带的 overlay 叠成绿色，避免 45° 视角下大片土色侧面。
  function loadGrassSideTile(){
    return Promise.all([
      loadImage(PUREEDGE_DIR + '/grass_block_side.png'),
      loadImage(PUREEDGE_DIR + '/grass_block_side_overlay.png'),
    ]).then(([base, overlay]) => {
      const c = document.createElement('canvas'); c.width = TS; c.height = TS;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(base, 0, 0, TS, TS);
      const oc = document.createElement('canvas'); oc.width = TS; oc.height = TS;
      const ox = oc.getContext('2d');
      ox.drawImage(overlay, 0, 0, TS, TS);
      const id = ox.getImageData(0, 0, TS, TS);
      const d = id.data;
      const tint = [0.62, 1.02, 0.46];
      for (let i = 0; i < d.length; i += 4){
        if (d[i + 3] < 8){ d[i + 3] = 0; continue; }
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3 / 255;
        d[i]     = Math.min(255, Math.round(255 * tint[0] * (0.55 + 0.45 * lum)));
        d[i + 1] = Math.min(255, Math.round(255 * tint[1] * (0.55 + 0.45 * lum)));
        d[i + 2] = Math.min(255, Math.round(255 * tint[2] * (0.55 + 0.45 * lum)));
      }
      ox.putImageData(id, 0, 0);
      cx.drawImage(oc, 0, 0);
      drawTileFromImage('grass_side', c);
    }).catch(() => {});
  }
  function clearImported(){
    for (const k in importedBlockImages) delete importedBlockImages[k];
    for (const k in importedItemImages) delete importedItemImages[k];
  }
  function applyImportedBlocks(){
    for (const tileName of Object.keys(importedBlockImages)){
      drawTileFromImage(tileName, importedBlockImages[tileName]);
    }
    refreshTextureUses();
  }
  function loadImage(src){
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('texture ' + src));
      img.src = src;
    });
  }
  function refreshTextureUses(){
    texture.needsUpdate = true;
    for (const k in tileTexCache) delete tileTexCache[k];
    if (typeof Icons !== 'undefined' && Icons.clearCache) Icons.clearCache();
    if (typeof UI !== 'undefined' && UI.refreshAll) UI.refreshAll();
    if (typeof World !== 'undefined' && World.rebuildAll) World.rebuildAll();
  }
  // 中性缺失贴图：绝不用手绘画代替材质包。
  function paintMissing(name){
    const i = index[name];
    if (i === undefined) return;
    const ox = (i % COLS) * TS, oy = ((i / COLS) | 0) * TS;
    ctx.fillStyle = '#2b2226';
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = '#4a3b40';
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++)
      if (((x + y) & 1) === 0) ctx.fillRect(ox + x, oy + y, 1, 1);
  }
  function resetPackTiles(){
    for (const tileName of Object.keys(index)) paintMissing(tileName);
  }
  function savedPackName(){
    try {
      const v = localStorage.getItem('texture_pack');
      if (v === 'imported') return 'imported';
    } catch(e){}
    return 'default';
  }
  function currentPackName(){ return savedPackName(); }
  function savedItemPackName(){
    try {
      const v = localStorage.getItem('item_texture_pack');
      if (v === 'imported') return 'imported';
    } catch(e){}
    return 'default';
  }
  async function loadPack(name){
    if (name === 'imported'){
      resetPackTiles();
      applyImportedBlocks();
    } else {
      resetPackTiles();
      if (Object.prototype.hasOwnProperty.call(index, 'grass_side')) await loadGrassSideTile();
      await Promise.all(Object.keys(index).map(async tileName => {
        const src = tileSource(tileName);
        if (!src || tileName === 'grass_side') return;
        try {
          const img = await loadImage(src.dir + '/' + src.file + '.png');
          drawTileFromImage(tileName, img);
        } catch(e){ /* 缺图保留中性缺失块 */ }
      }));
    }
    reapplyModTiles();
    refreshTextureUses();
    if (typeof Icons !== 'undefined' && Icons.loadPack) await Icons.loadPack(savedItemPackName());
  }
  function setPack(name){
    name = 'default';
    try { localStorage.setItem('texture_pack', name); } catch(e){}
    loadPack(name);
  }
  function applySavedPack(){ return loadPack(savedPackName()); }
  function setItemPack(name){
    name = 'default';
    try { localStorage.setItem('item_texture_pack', name); } catch(e){}
    if (typeof Icons !== 'undefined' && Icons.loadPack) Icons.loadPack(name);
  }
  function applySavedItemPack(){ return Icons.loadPack(savedItemPackName()); }
  async function imageFromBlob(blob){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad png')); };
      img.src = url;
    });
  }
  function matchTileFile(base){
    for (const tileName of Object.keys(index)){
      const src = tileSource(tileName);
      const aliases = [tileName, src && src.file].filter(Boolean);
      if (aliases.some(a => a === base)) return tileName;
    }
    return null;
  }
  async function importFiles(entries){
    clearImported();
    for (const entry of entries){
      const path = entry.path || entry.name || '';
      if (!/\.png$/i.test(path)) continue;
      const base = basenameNoExt(path);
      try {
        const img = await imageFromBlob(entry.blob);
        const tileName = matchTileFile(base);
        if (tileName) importedBlockImages[tileName] = img;
        if (typeof Icons !== 'undefined' && Icons.applyImport) Icons.applyImport(base, img);
      } catch(e){ /* 跳过无法解码的 PNG */ }
    }
    await loadPack('imported');
    try { localStorage.setItem('texture_pack', 'imported'); localStorage.setItem('item_texture_pack', 'imported'); } catch(e){}
  }
  async function readZip(file){
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = [];
    let i = buf.length - 22;
    while (i > 0 && !(buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x05 && buf[i+3] === 0x06)) i--;
    if (i <= 0) throw new Error('zip');
    const count = buf[i+10] | (buf[i+11] << 8);
    let off = buf[i+16] | (buf[i+17] << 8) | (buf[i+18] << 16) | (buf[i+19] << 24);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const readU16 = o => dv.getUint16(o, true);
    const readU32 = o => dv.getUint32(o, true);
    async function inflate(data){
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    for (let e = 0; e < count; e++){
      if (buf[off] !== 0x50 || buf[off+1] !== 0x4b || buf[off+2] !== 0x01 || buf[off+3] !== 0x02) break;
      const method = readU16(off + 10);
      const csize = readU32(off + 20);
      const usize = readU32(off + 24);
      const nlen = readU16(off + 28);
      const elen = readU16(off + 30);
      const clen = readU16(off + 32);
      const lho = readU32(off + 42);
      const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      if (buf[lho] !== 0x50 || buf[lho+1] !== 0x4b || buf[lho+2] !== 0x03 || buf[lho+3] !== 0x04) continue;
      const localName = readU16(lho + 26);
      const localExtra = readU16(lho + 28);
      const dataStart = lho + 30 + localName + localExtra;
      let data = buf.subarray(dataStart, dataStart + csize);
      if (method === 8) data = await inflate(data);
      else if (method !== 0) continue;
      entries.push({ path: name, blob: new Blob([data]) });
    }
    return entries;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  // 提取单 tile 独立贴图（机器材质用）
  const tileTexCache = {};
  function tileTexture(name, repeatX = 1, repeatY = 1){
    const key = name + '_' + repeatX + '_' + repeatY;
    if (tileTexCache[key]) return tileTexCache[key];
    const i = index[name];
    const c = document.createElement('canvas'); c.width = TS; c.height = TS;
    c.getContext('2d').drawImage(canvas, (i % COLS) * TS, ((i / COLS) | 0) * TS, TS, TS, 0, 0, TS, TS);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
    tileTexCache[key] = t;
    return t;
  }
  function tileCanvas(name){
    const i = index[name];
    const c = document.createElement('canvas'); c.width = TS; c.height = TS;
    c.getContext('2d').drawImage(canvas, (i % COLS) * TS, ((i / COLS) | 0) * TS, TS, TS, 0, 0, TS, TS);
    return c;
  }

  return { canvas, ctx, TS, COLS, index, texture, tileTexture, tileCanvas, shade,
    resetPackTiles, loadPack, setPack, applySavedPack, currentPackName, savedPackName,
    setItemPack, applySavedItemPack, savedItemPackName, loadImage,
    importFiles, readZip, tileNames, hasTile, addTile: allocTile, setTileImage,
    refreshTextureUses,
    uvRect(name){
      const i = index[name];
      const u = (i % COLS) / COLS, v = 1 - (((i / COLS) | 0) + 1) / COLS;
      // 收进半像素，避免最近点采样在图集边界读到相邻图块，形成贴图边缘线
      const e = 0.5 / (TS * COLS);
      return { u0: u + e, v0: v + e, u1: u + 1 / COLS - e, v1: v + 1 / COLS - e };
    }
  };
})();

/* ============================================================
   物品图标绘制（32x32 canvas，惰性生成缓存）
   ============================================================ */
const Icons = (() => {
  const cache = {};
  const itemCache = {};
  const modItemIcons = {};   // itemId -> canvas（模组自定义图标，随材质包重载自动恢复）
  // 每个物品都映射到 Whimscape 材质包里的真实 PNG（item 或 block）。
  // 找不到对应物品时，方块物品用 Whimscape 方块贴图，绝不回退到程序化手绘。
  const ITEM_ICON_MAP = {
    carbon: { f: 'coal' }, oxygen: { f: 'bucket' }, sodium: { f: 'glowstone_dust' },
    dirt: { f: 'dirt', kind: 'block' }, stone: { f: 'stone', kind: 'block' }, sand: { f: 'sand', kind: 'block' },
    coal: { f: 'coal' },
    iron_ore: { f: 'raw_iron' }, copper_ore: { f: 'raw_copper' },
    titanium_ore: { f: 'diamond' }, gold_ore: { f: 'raw_gold' }, uranium: { f: 'glowstone_dust' },
    iron: { f: 'iron_ingot' }, copper: { f: 'copper_ingot' }, titanium: { f: 'netherite_ingot' }, gold: { f: 'gold_ingot' },
    gear: { f: 'iron_nugget' }, wire: { f: 'redstone' }, circuit: { f: 'repeater' },
    plate: { f: 'iron_bars' }, data: { f: 'book' },
    planks_b: { f: 'oak_planks', kind: 'block' }, glass_b: { f: 'glass', kind: 'block' }, lamp_b: { f: 'glowstone', kind: 'block' },
    furnace_b: { f: 'furnace_front', kind: 'block', top: 'furnace_top', side: 'furnace_side' },
    miner_b: { f: 'diamond_pickaxe' }, belt_b: { f: 'minecart' },
    assembler_b: { f: 'crafting_table_front', kind: 'block', top: 'crafting_table_top', side: 'crafting_table_side' },
    solar_b: { f: 'sunflower' }, refinery_b: { f: 'brewing_stand' },
    chest_b: { f: 'barrel_side', kind: 'block', top: 'barrel_top' },
    reactor_b: { f: 'nether_star' }, wind_b: { f: 'feather' }, burner_b: { f: 'furnace_minecart' },
    lumberbot_b: { f: 'iron_axe' }, collector_b: { f: 'chest_minecart' },
    hoe: { f: 'iron_hoe' }, watering_can: { f: 'water_bucket' }, shovel: { f: 'iron_shovel' },
    wheat_seed: { f: 'wheat_seeds' }, potato_seed: { f: 'potato' }, carrot_seed: { f: 'carrot' },
    beet_seed: { f: 'beetroot_seeds' }, pumpkin_seed: { f: 'pumpkin_seeds' }, berry_seed: { f: 'sweet_berries' },
    wheat: { f: 'wheat' }, potato: { f: 'potato' }, carrot: { f: 'carrot' }, beetroot: { f: 'beetroot' },
    pumpkin: { f: 'pumpkin_side', kind: 'block' }, sweet_berry: { f: 'sweet_berries' },
    flour: { f: 'sugar' }, bread: { f: 'bread' }, jam: { f: 'honey_bottle' },
    irrigator_b: { f: 'water_bucket' }, planter_b: { f: 'wheat_seeds' }, harvester_b: { f: 'iron_hoe' },
  };
  const ITEM_TEXTURE_PACKS = {
    default: { dir: 'assets/textures/whimscape/item', blockDir: 'assets/textures/whimscape/block', map: ITEM_ICON_MAP },
  };

  function newC(){ const c = document.createElement('canvas'); c.width = 32; c.height = 32; return c; }
  function P(ctx){ return (x, y, col, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }; }

  // 等距方块图标（Minecraft 风）
  function blockIcon(topName, sideName, side2Name){
    const c = newC(); const ctx = c.getContext('2d');
    const top = Tex.tileCanvas(topName), side = Tex.tileCanvas(sideName), side2 = Tex.tileCanvas(side2Name || sideName);
    ctx.imageSmoothingEnabled = false;
    // 顶面（菱形）
    ctx.save();
    ctx.translate(16, 1);
    ctx.transform(1, 0.5, -1, 0.5, 0, 0);
    ctx.drawImage(top, 0, 0, 16, 16, 0, 0, 15, 15);
    ctx.restore();
    // 左面
    ctx.save();
    ctx.translate(1, 8.5);
    ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.drawImage(side, 0, 0, 16, 16, 0, 0, 15, 15.5);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 16, 24);
    ctx.restore();
    // 右面
    ctx.save();
    ctx.translate(16, 16);
    ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.drawImage(side2, 0, 0, 16, 16, 0, 0, 15, 15.5);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 16, 24);
    ctx.restore();
    return c;
  }
  function flatIcon(tileName){
    const c = newC(); const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(Tex.tileCanvas(tileName), 0, 0, 16, 16, 2, 2, 28, 28);
    return c;
  }
  // 锭
  function ingotIcon(c1, c2){
    const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
    const dark = Tex.shade(c1, 0.6), hi = c2;
    px(6, 16, dark, 20, 8); px(4, 14, c1, 20, 8); px(4, 12, hi, 20, 3);
    px(6, 24, Tex.shade(c1, 0.45), 20, 1);
    px(5, 13, '#ffffff88', 8, 1);
    ctx.strokeStyle = Tex.shade(c1, 0.4); ctx.lineWidth = 1;
    return c;
  }
  // 晶体
  function crystalIcon(c1, c2){
    const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
    const d = Tex.shade(c1, 0.55);
    px(14, 4, c2, 4, 4); px(12, 8, c1, 8, 10); px(10, 12, d, 4, 8); px(18, 10, c1, 6, 12);
    px(8, 18, c1, 6, 8); px(20, 6, c2, 2, 4); px(15, 9, '#ffffffaa', 2, 5);
    px(6, 26, d, 20, 2);
    return c;
  }
  // 矿石碎块
  function chunkIcon(c1){
    const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
    const d = Tex.shade(c1, 0.6), h = Tex.shade(c1, 1.35);
    px(8, 10, c1, 10, 9); px(16, 14, d, 8, 8); px(10, 18, d, 8, 6); px(12, 8, h, 4, 3);
    px(20, 12, h, 3, 2); px(7, 14, d, 3, 5);
    return c;
  }
  // 从已加载的 Pastoral 方块贴图取平均主色，用于物品图标配色
  function avgHex(tileName){
    try {
      const d = Tex.tileCanvas(tileName).getContext('2d').getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4){
        if (d[i + 3] < 32) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) return '#888888';
      const h = v => Math.round(v / n).toString(16).padStart(2, '0');
      return '#' + h(r) + h(g) + h(b);
    } catch(e){ return '#888888'; }
  }
  function blockIngot(tileName){
    const base = avgHex(tileName);
    return ingotIcon(base, Tex.shade(base, 1.4));
  }
  const painters = {
    gear(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const g = avgHex('iron_block'), d = Tex.shade(g, 0.7), h = Tex.shade(g, 1.3);
      const cu = avgHex('copper_block');
      for (let a = 0; a < 8; a++){
        const x = 16 + Math.round(Math.cos(a / 8 * 6.283) * 11) - 2;
        const y = 16 + Math.round(Math.sin(a / 8 * 6.283) * 11) - 2;
        px(x, y, d, 5, 5);
      }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 9, 0, 7); ctx.fill();
      ctx.fillStyle = h; ctx.beginPath(); ctx.arc(14, 14, 4, 0, 7); ctx.fill();
      ctx.fillStyle = cu; ctx.beginPath(); ctx.arc(16, 16, 4, 0, 7); ctx.fill();
      return c;
    },
    circuit(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const cu = avgHex('copper_block'), cuD = Tex.shade(cu, 0.6), cuH = Tex.shade(cu, 1.35);
      px(5, 7, '#5d7a4a', 22, 18); px(5, 7, '#6f8f58', 22, 3);
      px(9, 12, '#e0bd62', 5, 5); px(19, 16, '#3c3a34', 6, 4);
      px(7, 20, cu, 16, 1); px(7, 10, cu, 1, 11); px(14, 14, cu, 8, 1);
      px(24, 9, cu, 1, 8); px(11, 22, cuH, 2, 3); px(17, 22, cuD, 2, 3);
      return c;
    },
    data(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      px(6, 6, '#122c48', 20, 20); px(6, 6, '#1a3d63', 20, 4);
      px(10, 13, '#35e0e8', 12, 2); px(10, 17, '#35e0e8', 8, 2); px(10, 21, '#2596a0', 10, 1);
      px(24, 12, '#7dff8a', 2, 2);
      for (let i = 0; i < 4; i++){ px(8 + i * 5, 3, '#8a97a0', 2, 3); px(8 + i * 5, 26, '#8a97a0', 2, 3); }
      return c;
    },
    oxygen(){
      const c = newC(); const ctx = c.getContext('2d');
      ctx.fillStyle = '#c2392b'; ctx.beginPath(); ctx.arc(13, 14, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(20, 20, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb3ab'; ctx.beginPath(); ctx.arc(10, 11, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8a80'; ctx.beginPath(); ctx.arc(19, 18, 2, 0, 7); ctx.fill();
      return c;
    },
    carbon(){ return crystalIcon('#3a3a3a', '#6e6e6e'); },
    sodium(){ return crystalIcon('#ffd23e', '#fff2ae'); },
    uranium(){ return crystalIcon('#69d436', '#c6ff9e'); },
    coal(){ return chunkIcon(avgHex('coal_block')); },
    iron_ore(){ return chunkIcon(avgHex('iron_ore')); },
    copper_ore(){ return chunkIcon(avgHex('copper_ore')); },
    titanium_ore(){ return chunkIcon(avgHex('diamond_ore')); },
    gold_ore(){ return chunkIcon(avgHex('gold_ore')); },
    iron(){ return blockIngot('iron_block'); },
    copper(){ return blockIngot('copper_block'); },
    titanium(){ return blockIngot('diamond_block'); },
    gold(){ return blockIngot('gold_block'); },
    glass_item(){ return flatIcon('glass'); },
    stone_item(){ return chunkIcon('#8c8c8c'); },
    wire(){
      const c = newC(); const ctx = c.getContext('2d');
      const cu = avgHex('copper_block');
      ctx.strokeStyle = cu; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(16, 16, 9, 0.5, 5.5); ctx.stroke();
      ctx.strokeStyle = Tex.shade(cu, 1.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(16, 15, 9, 0.7, 5.3); ctx.stroke();
      return c;
    },
    plate(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const iron = avgHex('iron_block'), ironH = Tex.shade(iron, 1.3), ironD = Tex.shade(iron, 0.7);
      px(6, 8, ironD, 20, 16); px(6, 8, iron, 20, 4); px(6, 22, Tex.shade(iron, 0.55), 20, 2);
      px(9, 11, ironH, 2, 2); px(21, 11, ironH, 2, 2); px(9, 19, ironH, 2, 2); px(21, 19, ironH, 2, 2);
      return c;
    },
    hoe(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const iron = avgHex('iron_block'), ironH = Tex.shade(iron, 1.35);
      px(9, 5, '#8a6a48', 4, 8); px(7, 4, '#8a6a48', 8, 2); px(8, 3, '#a08058', 6, 1);
      px(8, 13, '#8a6a48', 4, 2); px(10, 14, '#b8895a', 2, 8); px(11, 15, '#6e4a28', 1, 6);
      px(10, 22, '#6e4a28', 1, 3);
      px(7, 10, iron, 2, 1); px(12, 8, ironH, 1, 2);
      return c;
    },
    shovel(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const iron = avgHex('iron_block'), ironH = Tex.shade(iron, 1.35), ironD = Tex.shade(iron, 0.7);
      px(9, 5, '#8a6a48', 4, 8); px(7, 4, '#8a6a48', 8, 2); px(8, 3, '#a08058', 6, 1);
      px(8, 13, '#8a6a48', 4, 2); px(10, 14, '#b8895a', 2, 8); px(11, 15, '#6e4a28', 1, 6);
      px(10, 22, '#6e4a28', 1, 3);
      px(7, 10, iron, 2, 1); px(12, 8, ironH, 1, 2);
      px(5, 9, ironD, 3, 4); px(4, 8, ironH, 2, 2); px(5, 12, ironD, 3, 2);
      return c;
    },
    watering_can(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const iron = avgHex('iron_block'), ironH = Tex.shade(iron, 1.3), ironD = Tex.shade(iron, 0.6);
      const cu = avgHex('copper_block'), cuH = Tex.shade(cu, 1.35);
      px(6, 12, ironD, 20, 12); px(6, 11, iron, 20, 3); px(6, 24, Tex.shade(iron, 0.45), 20, 1);
      px(7, 8, ironD, 3, 4); px(14, 8, ironD, 3, 4); px(21, 10, cu, 2, 8);
      px(22, 15, cu, 1, 4); px(23, 17, cuH, 2, 1); px(24, 19, cuH, 1, 1);
      return c;
    },
    seed(itemId){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      const tile = {
        wheat_seed: 'wheat_stage0', potato_seed: 'potato_stage0', carrot_seed: 'carrot_stage0',
        beet_seed: 'beet_stage0', pumpkin_seed: 'pumpkin_stage0', berry_seed: 'berry_stage0'
      }[itemId] || 'wheat_stage0';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(Tex.tileCanvas(tile), 0, 0, 16, 16, 3, 3, 26, 26);
      px(6, 25, '#5c4a2e', 20, 1); px(6, 26, '#4a3a24', 20, 1);
      return c;
    },
    wheat(){ return flatIcon('wheat_stage3'); },
    potato(){ return flatIcon('potato_stage3'); },
    carrot(){ return flatIcon('carrot_stage3'); },
    beetroot(){ return flatIcon('beet_stage3'); },
    pumpkin(){ return flatIcon('pumpkin_stage3'); },
    sweet_berry(){ return flatIcon('berry_stage3'); },
    flour(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      px(7, 7, '#d8c8a0', 18, 18); px(7, 7, '#e8dab8', 18, 4); px(7, 25, '#b89a70', 18, 1);
      px(9, 10, '#f0e8d0', 3, 3); px(14, 14, '#f0e8d0', 3, 3); px(19, 9, '#f0e8d0', 3, 3); px(18, 18, '#c8b080', 2, 2);
      px(8, 16, '#c8b080', 2, 2); px(16, 21, '#c8b080', 2, 2);
      return c;
    },
    bread(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      px(6, 8, '#c88838', 20, 15); px(5, 7, '#e8a858', 22, 4); px(6, 23, '#a86828', 20, 2);
      px(8, 11, '#f0c878', 4, 3); px(14, 9, '#f0c878', 4, 3); px(20, 12, '#f0c878', 4, 3);
      px(11, 16, '#f0c878', 3, 3); px(17, 18, '#f0c878', 3, 3); px(12, 21, '#b87a30', 4, 1);
      return c;
    },
    jam(){
      const c = newC(); const ctx = c.getContext('2d'); const px = P(ctx);
      px(8, 5, '#b8c8d0', 16, 22); px(7, 4, '#d8e8f0', 18, 3); px(9, 6, '#e8f0f4', 2, 8); px(21, 8, '#8a9aa2', 2, 16);
      px(9, 10, '#e84858', 14, 12); px(9, 9, '#ff8090', 14, 2); px(11, 13, '#c83040', 3, 3); px(17, 17, '#c83040', 3, 3);
      px(12, 20, '#f8a0a8', 2, 2); px(18, 13, '#f8a0a8', 2, 2);
      return c;
    }
  };

  function missingIcon(){
    const c = newC(); const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2226'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#4a3b40';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
      if (((x + y) & 1) === 0) ctx.fillRect(x, y, 1, 1);
    return c;
  }
  function iconFromImage(img){
    const c = newC(); const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, 0, 0, 32, 32);
    return c;
  }
  function setItemIcon(itemId, img){
    modItemIcons[itemId] = iconFromImage(img);
    itemCache[itemId] = modItemIcons[itemId];
    clearCache();
    if (typeof UI !== 'undefined' && UI.refreshAll) UI.refreshAll();
  }
  function applyModIcons(){
    for (const id in modItemIcons) itemCache[id] = modItemIcons[id];
    clearCache();
  }
  function blockIconFromImages(topImg, sideImg, frontImg){
    const c = newC(); const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const tw = topImg.naturalWidth || topImg.width, th = topImg.naturalHeight || topImg.height;
    const sw = sideImg.naturalWidth || sideImg.width, sh = sideImg.naturalHeight || sideImg.height;
    const fw = frontImg.naturalWidth || frontImg.width, fh = frontImg.naturalHeight || frontImg.height;
    ctx.save(); ctx.translate(16, 2); ctx.transform(1, 0.5, -1, 0.5, 0, 0);
    ctx.drawImage(topImg, 0, 0, tw, th, 0, 0, 15, 15); ctx.restore();
    ctx.save(); ctx.translate(1, 8.5); ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.drawImage(sideImg, 0, 0, sw, sh, 0, 0, 15, 15.5);
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 16, 24);
    ctx.restore();
    ctx.save(); ctx.translate(16, 16); ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.drawImage(frontImg, 0, 0, fw, fh, 0, 0, 15, 15.5);
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 16, 24);
    ctx.restore();
    return c;
  }
  function get(itemId){
    if (cache[itemId]) return cache[itemId];
    if (itemCache[itemId]) return itemCache[itemId];
    const it = (typeof ITEMS !== 'undefined' && ITEMS && ITEMS[itemId]) || null;
    if (it && it.iconBlock){
      const tiles = BLOCKS && BLOCKS[it.iconBlock] && BLOCKS[it.iconBlock].tiles;
      if (typeof Tex !== 'undefined' && Tex.tileCanvas && Tex.hasTile && (tiles || Tex.hasTile(it.iconBlock))){
        const t = (tiles && (tiles.all || tiles.top || tiles.side || tiles.front)) || it.iconBlock || 'stone';
        cache[itemId] = blockIcon(t, t, t);
        return cache[itemId];
      }
    }
    if (it && it.iconFn && typeof painters !== 'undefined' && painters[it.iconFn]){
      cache[itemId] = painters[it.iconFn](itemId);
      return cache[itemId];
    }
    cache[itemId] = missingIcon();
    return cache[itemId];
  }
  function img(itemId){ // 返回克隆 canvas（用于多处插入 DOM）
    const src = get(itemId);
    const c = newC();
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  function clearCache(){ for (const k in cache) delete cache[k]; }
  function applyImport(baseName, img){
    let itemId = Object.keys(ITEM_ICON_MAP).find(id => ITEM_ICON_MAP[id].f === baseName);
    if (!itemId && ITEMS && ITEMS[baseName]) itemId = baseName;
    if (!itemId) return;
    itemCache[itemId] = iconFromImage(img);
  }
  async function loadPack(packName){
    if (packName === 'imported'){
      clearCache();
      applyModIcons();
      if (typeof UI !== 'undefined' && UI.refreshAll) UI.refreshAll();
      return;
    }
    for (const k in itemCache) delete itemCache[k];
    const pack = ITEM_TEXTURE_PACKS.default;
    if (pack){
      await Promise.all(Object.entries(pack.map).map(async ([itemId, spec]) => {
        try {
          if (spec.kind === 'block'){
            const [topImg, sideImg, frontImg] = await Promise.all([
              Tex.loadImage(pack.blockDir + '/' + (spec.top || spec.f) + '.png'),
              Tex.loadImage(pack.blockDir + '/' + (spec.side || spec.f) + '.png'),
              Tex.loadImage(pack.blockDir + '/' + (spec.front || spec.side || spec.f) + '.png'),
            ]);
            itemCache[itemId] = blockIconFromImages(topImg, sideImg, frontImg);
          } else {
            const img = await Tex.loadImage(pack.dir + '/' + spec.f + '.png');
            itemCache[itemId] = iconFromImage(img);
          }
        } catch(e){ /* 缺图保留中性缺失图标 */ }
      }));
    }
    applyModIcons();
    if (typeof UI !== 'undefined' && UI.refreshAll) UI.refreshAll();
  }
  return { get, img, clearCache, loadPack, applyImport, setItemIcon, defaultItemMap: ITEM_ICON_MAP };
})();
