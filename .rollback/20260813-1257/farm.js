/* ============================================================
   Pastoral Create - farm.js
   耕地 / 作物 overlay：生长、浇水、收割、序列化
   世界网格只保存 farmland/crop 通用方块，贴图按本模块状态动态选择
   ============================================================ */
'use strict';

const Farm = (() => {
  let cells = new Map();   // "x,y,z" -> {type, stage, water, progress}
  const key = (x, y, z) => x + ',' + y + ',' + z;

  function reset(){
    cells = new Map();
  }
  function markDirty(x, y, z){
    if (window.World && World.markDirty) World.markDirty(x, y, z);
  }
  function emit(ev){
    if (window.Game && Game.onFarmEvent) Game.onFarmEvent(ev);
  }
  function isFarmland(x, y, z){
    const d = World.getDef(x, y, z);
    return d && d.key === 'farmland';
  }
  function cellAt(x, y, z){
    return cells.get(key(x, y, z)) || null;
  }
  function register(x, y, z){
    const k = key(x, y, z);
    if (!cells.has(k)) cells.set(k, { type: null, stage: 0, water: false, progress: 0, tr: [], waterHold: 0 });
    return cells.get(k);
  }

  // 把泥土/草地开垦成耕地
  function hoe(x, y, z){
    const d = World.getDef(x, y, z);
    if (!d || !['dirt', 'grass', 'snow'].includes(d.key)) return false;
    World.set(x, y, z, BLOCKS.farmland.id);
    cells.set(key(x, y, z), { type: null, stage: 0, water: false, progress: 0, tr: [], waterHold: 0 });
    emit('till');
    return true;
  }

  // 播种：耕地上方必须是空气
  function plant(x, y, z, cropType, traits){
    if (!CROPS[cropType]) return false;
    if (!isFarmland(x, y, z)) return false;
    if (World.getDef(x, y + 1, z).id !== 0) return false;
    const c = cells.get(key(x, y, z));
    if (c && c.type) return false;
    const genes = normalizeTraits(cropType, traits && traits.length ? traits : rollTraits(cropType));
    cells.set(key(x, y, z), { type: cropType, stage: 0, water: !!(c && c.water), progress: 0, tr: genes, waterHold: 0, pollinated: genes.includes('pollinate') && Math.random() < 0.77 });
    World.set(x, y + 1, z, BLOCKS.crop.id);
    emit('plant');
    return true;
  }

  function water(x, y, z){
    // 点击作物时作用到下方耕地
    if (BLOCK_BY_ID[World.get(x, y, z)] && BLOCK_BY_ID[World.get(x, y, z)].key === 'crop') y--;
    if (!isFarmland(x, y, z)) return false;
    const c = cells.get(key(x, y, z));
    if (!c){ cells.set(key(x, y, z), { type: null, stage: 0, water: true, progress: 0, tr: [], waterHold: 0 }); }
    else { c.water = true; c.waterHold = 0; }
    markDirty(x, y, z);
    emit('water');
    return true;
  }

  function cropAt(x, y, z){
    const d = BLOCK_BY_ID[World.get(x, y, z)];
    if (!d || d.key !== 'crop') return null;
    const c = cells.get(key(x, y - 1, z));
    if (!c || !c.type) return null;
    return { cell: c, def: CROPS[c.type], x, y, z };
  }
  function mature(x, y, z){
    const c = cropAt(x, y, z);
    return c && c.cell.stage >= c.def.stages - 1;
  }

  // 收割成熟作物：返回掉落物数组；作物块与耕地作物状态同步清空
  function harvest(x, y, z){
    const c = cropAt(x, y, z);
    if (!c || c.cell.stage < c.def.stages - 1) return null;
    const groups = [normalizeTraits(c.def.id, c.cell.tr)];
    while (groups.length < 4){
      const genes = rollTraits(c.def.id);
      if (!groups.some(g => g[0] === genes[0] && g[1] === genes[1])) groups.push(genes);
    }
    // 一格成熟作物固定产出四个 16 个装的词条包；每包附一粒同组合种子供玩家筛选留种。
    const yields = groups.flatMap((genes, i) => [
      { item: c.def.produce, n: 16 + (c.cell.pollinated && i === 0 ? 16 : 0), tr: genes },
      { item: c.def.seed, n: 1, tr: genes },
    ]);
    World.set(x, y, z, 0);
    const farmCell = cells.get(key(x, y - 1, z));
    if (farmCell){ farmCell.type = null; farmCell.stage = 0; farmCell.progress = 0; farmCell.tr = []; farmCell.waterHold = 0; farmCell.pollinated = false; }
    markDirty(x, y, z);
    emit('harvest');
    return yields;
  }

  // 强制清除耕地（挖掉耕地/作物方块时同步）
  function clearCell(x, y, z){
    if (cells.delete(key(x, y, z))) markDirty(x, y, z);
  }

  let hydrateT = 0;
  function tick(dt){
    hydrateT -= dt;
    if (hydrateT <= 0){
      hydrateT = 1;
      for (const [k, c] of cells){
        if (c.water) continue;
        const p = k.split(',').map(Number);
        if (waterNear(p[0], p[1], p[2])){
          c.water = true;
          markDirty(p[0], p[1], p[2]);
        }
      }
    }
  }
  function newDay(season){
    for (const [k, c] of cells){
      if (!c.type) continue;
      const def = CROPS[c.type];
      const inSeason = !def.season || def.season.includes(season);
      c.inSeason = inSeason;
      if (inSeason && c.water && c.stage < def.stages - 1){
        c.stage += growthSteps(k, c, def);
        c.stage = Math.min(def.stages - 1, c.stage);
        c.water = false;
      }
      const p = k.split(',').map(Number); markDirty(p[0], p[1], p[2]);
    }
  }
  function growthSteps(k, c, def){
    const [x, y, z] = k.split(',').map(Number); let sameType = false, differentType = false, sameGene = false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++){
      if (!dx && !dz) continue;
      const near = cells.get(key(x + dx, y, z + dz));
      if (!near || !near.type) continue;
      if (CROPS[near.type].type === def.type) sameType = true; else differentType = true;
      if ((c.tr || []).some(g => (near.tr || []).includes(g))) sameGene = true;
    }
    let chance = 0;
    if ((c.tr || []).includes('companion') && sameType) chance += 0.5;
    if ((c.tr || []).includes('contrast') && differentType) chance += 0.5;
    if ((c.tr || []).includes('pack') && sameGene) chance += 0.25;
    return 1 + (Math.random() < Math.min(0.95, chance) ? 1 : 0);
  }
  function waterNear(x, y, z){
    for (let dx = -4; dx <= 4; dx++){
      for (let dz = -4; dz <= 4; dz++){
        if (Math.max(Math.abs(dx), Math.abs(dz)) > 4) continue;
        const d = World.getDef(x + dx, y, z + dz);
        if (d && d.liquid && d.key === 'water') return true;
      }
    }
    return false;
  }

  // 贴图选择：世界网格构建时调用
  function tileFor(x, y, z, face){
    const d = BLOCK_BY_ID[World.get(x, y, z)];
    if (!d) return null;
    if (d.key === 'farmland'){
      const c = cells.get(key(x, y, z));
      return (face === 2 && c && c.water) ? 'farmland_wet' : 'farmland_dry';
    }
    if (d.key === 'crop'){
      const c = cropAt(x, y, z);
      if (!c) return 'wheat_stage0';
      return c.def.tiles[Math.min(c.def.stages - 1, c.cell.stage)];
    }
    return null;
  }

  // ---------- 农业机器查询 ----------
  function farmlandNear(mx, my, mz, r, wantEmpty){
    const out = [];
    for (let dz = -r; dz <= r; dz++){
      for (let dx = -r; dx <= r; dx++){
        const x = mx + dx, z = mz + dz, gy = my - 1;
        if (!isFarmland(x, gy, z)) continue;
        const c = cells.get(key(x, gy, z));
        if (wantEmpty && c && c.type) continue;
        out.push({ x, y: gy, z, c: c || { type: null, water: false } });
      }
    }
    return out;
  }
  function cropsNear(mx, my, mz, r){
    const out = [];
    for (let dz = -r; dz <= r; dz++){
      for (let dx = -r; dx <= r; dx++){
        const c = cropAt(mx + dx, my, mz + dz);
        if (c) out.push(c);
      }
    }
    return out;
  }

  function serialize(){
    const arr = [];
    for (const [k, c] of cells){
      arr.push([k, { type: c.type, stage: c.stage, water: !!c.water, progress: c.progress || 0, tr: c.type ? normalizeTraits(c.type, c.tr || []) : [], waterHold: c.waterHold || 0, pollinated: !!c.pollinated, inSeason: c.inSeason !== false }]);
    }
    return { cells: arr };
  }
  function breedSeed(cropId, a, b){
    if (!CROPS[cropId] || !a || !b || a.item !== CROPS[cropId].seed || b.item !== CROPS[cropId].seed) return null;
    const genes = a === b ? normalizeTraits(cropId, a.tr || []) : breedTraits(cropId, a.tr || [], b.tr || []);
    return { item: CROPS[cropId].seed, n: 1, tr: genes };
  }
  function deserialize(data){
    cells = new Map();
    if (!data || !data.cells) return;
    for (const [k, c] of data.cells){
      cells.set(k, { type: c.type || null, stage: c.stage || 0, water: !!c.water, progress: c.progress || 0, tr: c.type ? normalizeTraits(c.type, c.tr || []) : [], waterHold: c.waterHold || 0, pollinated: !!c.pollinated, inSeason: c.inSeason !== false });
    }
  }

  return {
    reset, register, hoe, plant, water, cropAt, mature, harvest, clearCell, tick, tileFor,
    farmlandNear, cropsNear, serialize, deserialize, isFarmland, cellAt, newDay,
    get count(){ return cells.size; }, breedSeed,
  };
})();
window.Farm = Farm;
