/* ============================================================
   STARFORGE - data.js
   方块 / 物品 / 配方 / 科技树 / 任务 / 星球生态 定义
   ============================================================ */
'use strict';

// ================= 方块 =================
// hard: 挖掘时间(秒)  drops: [{item,n,chance}]  cross: 十字植物面片
// machine: 属于工厂机器（视觉由 factory.js 接管，方块网格中隐形但有碰撞）
const BLOCKS = {
  air:      { id: 0, name: '空气', solid: false },
  grass:    { id: 1, name: '草方块', hard: 0.75, tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, drops: [{ item: 'dirt', n: 1 }] },
  dirt:     { id: 2, name: '泥土', hard: 0.7, tiles: { all: 'dirt' }, drops: [{ item: 'dirt', n: 1 }] },
  stone:    { id: 3, name: '岩石', hard: 1.6, tiles: { all: 'stone' }, drops: [{ item: 'stone', n: 1 }] },
  sand:     { id: 4, name: '沙', hard: 0.6, tiles: { all: 'sand' }, drops: [{ item: 'sand', n: 1 }] },
  log:      { id: 5, name: '橡木原木', hard: 1.1, tiles: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, drops: [{ item: 'carbon', n: 3 }] },
  leaves:   { id: 6, name: '橡树树叶', hard: 0.3, tiles: { all: 'leaves' }, transparent: true, fancy: true, drops: [{ item: 'carbon', n: 1 }, { item: 'oxygen', n: 1, chance: 0.35 }] },
  coal_ore: { id: 7, name: '煤矿', hard: 2.2, tiles: { all: 'coal_ore' }, ore: true, drops: [{ item: 'coal', n: 1 }, { item: 'coal', n: 1, chance: 0.3 }] },
  iron_ore: { id: 8, name: '铁矿', hard: 2.6, tiles: { all: 'iron_ore' }, ore: true, drops: [{ item: 'iron_ore', n: 1 }] },
  copper_ore:{ id: 9, name: '铜矿', hard: 2.6, tiles: { all: 'copper_ore' }, ore: true, drops: [{ item: 'copper_ore', n: 1 }] },
  titanium_ore:{ id: 10, name: '钛矿', hard: 3.6, tiles: { all: 'titanium_ore' }, ore: true, drops: [{ item: 'titanium_ore', n: 1 }] },
  uranium_ore:{ id: 11, name: '铀矿', hard: 4.2, tiles: { all: 'uranium_ore' }, ore: true, drops: [{ item: 'uranium', n: 1 }] },
  gold_ore: { id: 12, name: '金矿', hard: 3.0, tiles: { all: 'gold_ore' }, ore: true, drops: [{ item: 'gold_ore', n: 1 }] },
  sodium_plant:{ id: 13, name: '黄花', hard: 0.05, tiles: { all: 'sodium_plant' }, cross: true, short: true, solid: false, drops: [{ item: 'sodium', n: 2 }] },
  oxygen_plant:{ id: 14, name: '红花', hard: 0.05, tiles: { all: 'oxygen_plant' }, cross: true, short: true, solid: false, drops: [{ item: 'oxygen', n: 2 }] },
  fern:     { id: 15, name: '短草', hard: 0.05, tiles: { all: 'carbon_fern' }, cross: true, short: true, solid: false, drops: [{ item: 'carbon', n: 1 }] },
  water:    { id: 16, name: '水', solid: false, tiles: { all: 'water' }, transparent: true, liquid: true },
  planks:   { id: 17, name: '橡木木板', hard: 0.9, tiles: { all: 'planks' }, drops: [{ item: 'planks_b', n: 1 }] },
  glass:    { id: 18, name: '玻璃', hard: 0.4, tiles: { all: 'glass' }, transparent: true, drops: [{ item: 'glass_b', n: 1 }] },
  lamp:     { id: 19, name: '光源方块', hard: 0.5, tiles: { all: 'lamp_on' }, glow: true, drops: [{ item: 'lamp_b', n: 1 }] },
  ice:      { id: 20, name: '永冻冰', hard: 1.2, tiles: { all: 'ice' }, drops: [{ item: 'stone', n: 1 }] },
  snow:     { id: 21, name: '雪被层', hard: 0.7, tiles: { top: 'snow_top', side: 'snow_side', bottom: 'dirt' }, drops: [{ item: 'dirt', n: 1 }] },
  basalt:   { id: 22, name: '玄武岩', hard: 2.0, tiles: { all: 'basalt' }, drops: [{ item: 'stone', n: 1 }, { item: 'coal', n: 1, chance: 0.15 }] },
  alien:    { id: 23, name: '荧紫菌毯', hard: 0.75, tiles: { top: 'alien_top', side: 'alien_side', bottom: 'dirt' }, drops: [{ item: 'dirt', n: 1 }, { item: 'sodium', n: 1, chance: 0.2 }] },
  barrier:  { id: 24, name: '致密基岩', hard: Infinity, tiles: { all: 'barrier' } },
  // ------ 机器 ------
  furnace:  { id: 30, name: '熔炉', hard: 1.2, machine: 'furnace', tiles: { all: 'stone', front: 'furnace_front' }, drops: [{ item: 'furnace_b', n: 1 }] },
  miner:    { id: 31, name: '自动采矿机', hard: 1.2, machine: 'miner', tiles: { all: 'metal', top: 'miner_top' }, drops: [{ item: 'miner_b', n: 1 }] },
  belt:     { id: 32, name: '传送带', hard: 0.5, machine: 'belt', lowbox: true, tiles: { all: 'belt' }, drops: [{ item: 'belt_b', n: 1 }] },
  assembler:{ id: 33, name: '装配机', hard: 1.4, machine: 'assembler', tiles: { all: 'metal', top: 'assembler_top' }, drops: [{ item: 'assembler_b', n: 1 }] },
  solar:    { id: 34, name: '太阳能板', hard: 0.8, machine: 'solar', lowbox: true, tiles: { all: 'solar_top' }, drops: [{ item: 'solar_b', n: 1 }] },
  refinery: { id: 35, name: '精炼厂', hard: 1.6, machine: 'refinery', tiles: { all: 'refinery_side' }, drops: [{ item: 'refinery_b', n: 1 }] },
  chest:    { id: 36, name: '储物箱', hard: 0.9, machine: 'chest', tiles: { all: 'chest_side', top: 'storage_top' }, drops: [{ item: 'chest_b', n: 1 }] },
  reactor:  { id: 37, name: '核子反应堆', hard: 2.4, machine: 'reactor', tiles: { all: 'reactor_side' }, drops: [{ item: 'reactor_b', n: 1 }] },
  wind:     { id: 39, name: '风力涡轮机', hard: 1.0, machine: 'wind', tiles: { all: 'metal' }, drops: [{ item: 'wind_b', n: 1 }] },
  burner:   { id: 40, name: '火力发电机', hard: 1.2, machine: 'burner', tiles: { all: 'metal_dark', front: 'furnace_front' }, drops: [{ item: 'burner_b', n: 1 }] },
  // ---- 新星球方块 ----
  crystal:  { id: 41, name: '晶簇', hard: 1.8, tiles: { all: 'crystal' }, glow: true, drops: [{ item: 'stone', n: 2 }, { item: 'stone', n: 2, chance: 0.5 }] },
  mush_stem:{ id: 42, name: '巨菌柄', hard: 0.8, tiles: { all: 'mush_stem' }, drops: [{ item: 'carbon', n: 2 }] },
  mush_cap: { id: 43, name: '巨菌盖', hard: 0.5, tiles: { all: 'mush_cap' }, drops: [{ item: 'carbon', n: 1 }, { item: 'oxygen', n: 1, chance: 0.4 }, { item: 'sodium', n: 1, chance: 0.2 }] },
  ash:      { id: 44, name: '灰烬土', hard: 0.8, tiles: { all: 'ash' }, drops: [{ item: 'dirt', n: 1 }, { item: 'coal', n: 1, chance: 0.12 }] },
  amber:    { id: 45, name: '金珀岩', hard: 1.4, tiles: { all: 'amber' }, glow: true, drops: [{ item: 'carbon', n: 2 }, { item: 'gold_ore', n: 1, chance: 0.08 }] },
  rust:     { id: 46, name: '锈蚀铁壤', hard: 1.0, tiles: { all: 'rust' }, drops: [{ item: 'dirt', n: 1 }, { item: 'iron_ore', n: 1, chance: 0.25 }] },
  salt:     { id: 47, name: '盐晶块', hard: 0.7, tiles: { all: 'salt' }, drops: [{ item: 'sodium', n: 1 }, { item: 'sodium', n: 1, chance: 0.4 }] },
  obsidian: { id: 48, name: '黑曜岩', hard: 2.6, tiles: { all: 'obsidian' }, drops: [{ item: 'stone', n: 1 }, { item: 'titanium_ore', n: 1, chance: 0.1 }] },
  redmoss:  { id: 49, name: '红藓被', hard: 0.75, tiles: { top: 'redmoss_top', side: 'redmoss_side', bottom: 'dirt' }, drops: [{ item: 'dirt', n: 1 }, { item: 'carbon', n: 1, chance: 0.25 }] },
  hive:     { id: 50, name: '蜂窝晶壁', hard: 1.1, tiles: { all: 'hive' }, drops: [{ item: 'dirt', n: 1 }, { item: 'carbon', n: 1, chance: 0.35 }] },
  murk:     { id: 51, name: '荧沼菌毯', hard: 0.75, tiles: { top: 'murk_top', side: 'murk_side', bottom: 'dirt' }, drops: [{ item: 'dirt', n: 1 }, { item: 'oxygen', n: 1, chance: 0.15 }] },
  glow_shroom:{ id: 52, name: '荧光蕈', hard: 0.05, tiles: { all: 'glow_shroom' }, cross: true, solid: false, glow: true, drops: [{ item: 'oxygen', n: 2 }, { item: 'sodium', n: 1, chance: 0.5 }] },
  lumberbot:{ id: 54, name: '伐木机器人', hard: 1.0, machine: 'lumberbot', tiles: { all: 'vent', top: 'metal_dark' }, drops: [{ item: 'lumberbot_b', n: 1 }] },
  collector:{ id: 55, name: '收集点', hard: 0.9, machine: 'collector', tiles: { all: 'chest_side', top: 'storage_top' }, drops: [{ item: 'collector_b', n: 1 }] },
  farmland: { id: 60, name: '耕地', hard: 0.6, tiles: { all: 'farmland_dry' }, solid: true, drops: [{ item: 'dirt', n: 1 }] },
  crop:     { id: 61, name: '作物', hard: 0.1, tiles: { all: 'wheat_stage0' }, cross: true, solid: false },
  irrigator:{ id: 62, name: '灌溉机', hard: 1.0, machine: 'irrigator', tiles: { all: 'metal', top: 'storage_top' }, drops: [{ item: 'irrigator_b', n: 1 }] },
  planter:  { id: 63, name: '播种机', hard: 1.0, machine: 'planter', tiles: { all: 'metal', top: 'miner_top' }, drops: [{ item: 'planter_b', n: 1 }] },
  harvester:{ id: 64, name: '收割机', hard: 1.0, machine: 'harvester', tiles: { all: 'metal_dark', top: 'vent' }, drops: [{ item: 'harvester_b', n: 1 }] },
  sellbot:   { id: 65, name: '收购站', hard: 1.0, machine: 'sellbot', tiles: { all: 'metal', top: 'storage_top' }, drops: [{ item: 'sellbot_b', n: 1 }] },
  vendor:   { id: 66, name: '出售站', hard: 1.0, machine: 'vendor', tiles: { all: 'metal', top: 'storage_top' }, drops: [{ item: 'vendor_b', n: 1 }] },
  trash:    { id: 67, name: '物品销毁机', hard: 1.0, machine: 'trash', tiles: { all: 'metal_dark', front: 'furnace_front' }, drops: [{ item: 'trash_b', n: 1 }] },
  filter:   { id: 68, name: '过滤器', hard: 0.9, machine: 'filter', tiles: { all: 'metal', front: 'vent' }, drops: [{ item: 'filter_b', n: 1 }] },
  chute:    { id: 69, name: '向漏斗', hard: 0.9, machine: 'chute', tiles: { all: 'metal_dark', top: 'storage_top' }, drops: [{ item: 'chute_b', n: 1 }] },
  // ---- 工业扩展 ----
  foundry:  { id: 70, name: '铸造炉', hard: 1.4, machine: 'furnace', speed: 1.35, tiles: { all: 'metal_dark', front: 'furnace_front' }, drops: [{ item: 'foundry_b', n: 1 }] },
  smelter:  { id: 71, name: '精炼熔炉', hard: 1.4, machine: 'furnace', speed: 1.6, tiles: { all: 'metal', front: 'furnace_front' }, drops: [{ item: 'smelter_b', n: 1 }] },
  iron_box: { id: 72, name: '加固箱', hard: 1.5, machine: 'chest', tiles: { all: 'metal', top: 'vent' }, drops: [{ item: 'iron_box_b', n: 1 }] },
  vent_pipe:{ id: 73, name: '通风管道', hard: 1.1, tiles: { all: 'vent' }, drops: [{ item: 'vent_pipe_b', n: 1 }] },
  cable_spool:{ id: 74, name: '电缆卷', hard: 1.0, tiles: { all: 'copper_block' }, drops: [{ item: 'cable_spool_b', n: 1 }] },
  light_panel:{ id: 75, name: '工业灯板', hard: 0.8, tiles: { all: 'lamp_on' }, glow: true, drops: [{ item: 'light_panel_b', n: 1 }] },
  battery:  { id: 76, name: '储能电池', hard: 1.6, machine: 'battery', tiles: { all: 'metal', top: 'vent' }, drops: [{ item: 'battery_b', n: 1 }] },
  boiler:   { id: 77, name: '高效锅炉', hard: 1.6, machine: 'boiler', tiles: { all: 'metal_dark', front: 'furnace_front' }, drops: [{ item: 'boiler_b', n: 1 }] },
  fast_belt:{ id: 78, name: '高速传送带', hard: 0.6, machine: 'belt', beltSpeed: 2.0, lowbox: true, tiles: { all: 'belt' }, drops: [{ item: 'fast_belt_b', n: 1 }] },
  storage_vault:{ id: 79, name: '大型仓储柜', hard: 1.6, machine: 'chest', slots: 48, tiles: { all: 'metal', top: 'vent' }, drops: [{ item: 'storage_vault_b', n: 1 }] },
  compressor:{ id: 80, name: '压缩机', hard: 1.6, machine: 'assembler', tiles: { all: 'metal_dark', top: 'vent' }, drops: [{ item: 'compressor_b', n: 1 }] },
  compact_stone:{ id: 81, name: '压缩岩', hard: 2.0, tiles: { all: 'stone' }, drops: [{ item: 'compact_stone', n: 1 }] },
  solar_farm:{ id: 82, name: '大型太阳能板', hard: 1.4, machine: 'solar', gen: 24, tiles: { all: 'solar_top' }, drops: [{ item: 'solar_farm_b', n: 1 }] },
  wind_tower:{ id: 83, name: '大型风力发电机', hard: 1.4, machine: 'wind', genMul: 1.6, tiles: { all: 'metal', top: 'wind_pole' }, drops: [{ item: 'wind_tower_b', n: 1 }] },
  deep_miner:{ id: 84, name: '深井采矿机', hard: 1.8, machine: 'miner', minerSpeed: 1.8, tiles: { all: 'metal', top: 'miner_top' }, drops: [{ item: 'deep_miner_b', n: 1 }] },
  refinery_tower:{ id: 85, name: '大型精炼厂', hard: 1.8, machine: 'refinery', speed: 1.6, tiles: { all: 'refinery_side' }, drops: [{ item: 'refinery_tower_b', n: 1 }] },
  assembler_tower:{ id: 86, name: '大型装配机', hard: 1.8, machine: 'assembler', speed: 1.6, tiles: { all: 'metal', top: 'assembler_top' }, drops: [{ item: 'assembler_tower_b', n: 1 }] },
  reactor_tower:{ id: 87, name: '大型核反应堆', hard: 2.4, machine: 'reactor', gen: 150, fuelCap: 600, tiles: { all: 'reactor_side' }, drops: [{ item: 'reactor_tower_b', n: 1 }] },
  irrigator_tower:{ id: 88, name: '大型灌溉机', hard: 1.2, machine: 'irrigator', range: 3, tiles: { all: 'metal', top: 'storage_top' }, drops: [{ item: 'irrigator_tower_b', n: 1 }] },
  harvester_tower:{ id: 89, name: '大型收割机', hard: 1.3, machine: 'harvester', range: 3, tiles: { all: 'metal_dark', top: 'vent' }, drops: [{ item: 'harvester_tower_b', n: 1 }] },
  planter_tower:{ id: 90, name: '大型播种机', hard: 1.3, machine: 'planter', range: 3, tiles: { all: 'metal', top: 'miner_top' }, drops: [{ item: 'planter_tower_b', n: 1 }] },
  collector_tower:{ id: 91, name: '大型收集点', hard: 1.3, machine: 'collector', slots: 36, tiles: { all: 'chest_side', top: 'storage_top' }, drops: [{ item: 'collector_tower_b', n: 1 }] },
  furnace_tower:{ id: 92, name: '工业熔炉塔', hard: 1.8, machine: 'furnace', speed: 2.0, tiles: { all: 'stone', front: 'furnace_front' }, drops: [{ item: 'furnace_tower_b', n: 1 }] },
  metal_frame:{ id: 93, name: '金属框架', hard: 1.2, tiles: { all: 'metal' }, drops: [{ item: 'metal_frame_b', n: 1 }] },
  industrial_pipe:{ id: 94, name: '工业管道', hard: 1.2, tiles: { all: 'metal_dark' }, drops: [{ item: 'industrial_pipe_b', n: 1 }] },
  warning_stripe:{ id: 95, name: '警告条', hard: 1.2, tiles: { all: 'gold_block' }, drops: [{ item: 'warning_stripe_b', n: 1 }] },
  burner_tower:{ id: 96, name: '大型火力发电机', hard: 1.6, machine: 'burner', gen: 40, fuelMul: 1.3, tiles: { all: 'metal_dark', front: 'furnace_front' }, drops: [{ item: 'burner_tower_b', n: 1 }] },
  trade_tower:{ id: 97, name: '交易塔', hard: 1.5, machine: 'sellbot', priceMul: 1.15, tiles: { all: 'metal', top: 'storage_top' }, drops: [{ item: 'trade_tower_b', n: 1 }] },
  vendor_tower:{ id: 98, name: '交易商城', hard: 1.5, machine: 'vendor', buyMul: 0.85, tiles: { all: 'metal_dark', top: 'storage_top' }, drops: [{ item: 'vendor_tower_b', n: 1 }] },
  chest_tower:{ id: 99, name: '大型仓储塔', hard: 1.8, machine: 'chest', slots: 64, tiles: { all: 'metal', top: 'vent' }, drops: [{ item: 'chest_tower_b', n: 1 }] },
};
const BLOCK_BY_ID = {};
for (const k in BLOCKS){ BLOCKS[k].key = k; BLOCK_BY_ID[BLOCKS[k].id] = BLOCKS[k]; if (BLOCKS[k].solid === undefined) BLOCKS[k].solid = true; }

// ================= 物品 =================
// cat: res资源 mat材料 blk方块 mach机器 tool特殊
const ITEMS = {
  // 元素资源
  carbon:   { name: '碳', cat: 'res', iconFn: 'carbon', stack: 250, desc: '一切有机物的基础，也是基础燃料。', price: 4 },
  oxygen:   { name: '氧气', cat: 'res', iconFn: 'oxygen', stack: 250, desc: '为生命维持系统充能。', price: 6 },
  sodium:   { name: '钠', cat: 'res', iconFn: 'sodium', stack: 250, desc: '为危险防护装置充能。', price: 8 },
  dirt:     { name: '泥土', cat: 'blk', iconBlock: 'dirt', block: 'dirt', stack: 250, desc: '朴实无华的土。', price: 1 },
  stone:    { name: '岩石', cat: 'blk', iconBlock: 'stone', block: 'stone', stack: 250, desc: '基础建材，可烧炼加工。', price: 2 },
  sand:     { name: '沙', cat: 'blk', iconBlock: 'sand', block: 'sand', stack: 250, desc: '可烧制成玻璃。', price: 2 },
  coal:     { name: '煤', cat: 'res', iconFn: 'coal', stack: 250, desc: '高能燃料，熔炉的最爱。', price: 10 },
  iron_ore: { name: '铁矿石', cat: 'res', iconFn: 'iron_ore', stack: 250, desc: '需熔炼成铁锭。', price: 8 },
  copper_ore:{ name: '铜矿石', cat: 'res', iconFn: 'copper_ore', stack: 250, desc: '需熔炼成铜锭。', price: 8 },
  titanium_ore:{ name: '钛矿石', cat: 'res', iconFn: 'titanium_ore', stack: 250, desc: '稀有轻金属矿。', price: 24 },
  gold_ore: { name: '金矿石', cat: 'res', iconFn: 'gold_ore', stack: 250, desc: '闪闪发光，星站高价收购。', price: 40 },
  uranium:  { name: '铀-235', cat: 'res', iconFn: 'uranium', stack: 100, desc: '微微发热…核反应堆燃料。', price: 60 },
  // 加工材料
  iron:     { name: '铁锭', cat: 'mat', iconFn: 'iron', stack: 250, desc: '工业的骨架。', price: 18 },
  copper:   { name: '铜锭', cat: 'mat', iconFn: 'copper', stack: 250, desc: '导电材料。', price: 18 },
  titanium: { name: '钛锭', cat: 'mat', iconFn: 'titanium', stack: 250, desc: '航天级合金。', price: 55 },
  gold:     { name: '金锭', cat: 'mat', iconFn: 'gold', stack: 250, desc: '贵金属，硬通货。', price: 90 },
  gear:     { name: '齿轮', cat: 'mat', iconFn: 'gear', stack: 250, desc: '机械传动核心。', price: 42 },
  wire:     { name: '铜线圈', cat: 'mat', iconFn: 'wire', stack: 250, desc: '缠绕的铜线。', price: 24 },
  circuit:  { name: '电路板', cat: 'mat', iconFn: 'circuit', stack: 200, desc: '所有智能机器的大脑。', price: 110 },
  plate:    { name: '装甲板', cat: 'mat', iconFn: 'plate', stack: 200, desc: '飞船与机器的外壳。', price: 60 },
  data:     { name: '研究数据', cat: 'mat', iconFn: 'data', stack: 500, desc: '科技矩阵的解锁密钥。', price: 150 },
  // 可放置方块物品
  planks_b: { name: '碳板块', cat: 'blk', iconBlock: 'planks', block: 'planks', stack: 250, desc: '压缩碳建材。', price: 6 },
  glass_b:  { name: '玻璃', cat: 'blk', iconBlock: 'glass', block: 'glass', stack: 250, desc: '透明建材。', price: 12 },
  lamp_b:   { name: '光源方块', cat: 'blk', iconBlock: 'lamp', block: 'lamp', stack: 100, desc: '照亮黑夜。', price: 30 },
  // 机器物品
  furnace_b:  { name: '熔炉', cat: 'mach', iconBlock: 'furnace', block: 'furnace', stack: 50, desc: '烧炼矿石。燃料：碳/煤。', price: 80 },
  miner_b:    { name: '自动采矿机', cat: 'mach', iconBlock: 'miner', block: 'miner', stack: 50, desc: '放置在矿脉上自动开采。需电力。', price: 500 },
  belt_b:     { name: '传送带', cat: 'mach', iconBlock: 'belt', block: 'belt', stack: 200, desc: '运输物品。朝放置者视线方向传送。', price: 60 },
  assembler_b:{ name: '装配机', cat: 'mach', iconBlock: 'assembler', block: 'assembler', stack: 50, desc: '自动合成部件。需电力。', price: 700 },
  solar_b:    { name: '太阳能板', cat: 'mach', iconBlock: 'solar', block: 'solar', stack: 100, desc: '白天发电 10kW。', price: 350 },
  refinery_b: { name: '精炼厂', cat: 'mach', iconBlock: 'refinery', block: 'refinery', stack: 50, desc: '精炼高级化合物。需电力。', price: 900 },
  chest_b:    { name: '储物箱', cat: 'mach', iconBlock: 'chest', block: 'chest', stack: 50, desc: '24 格储存空间。', price: 90 },
  reactor_b:  { name: '核子反应堆', cat: 'mach', iconBlock: 'reactor', block: 'reactor', stack: 20, desc: '全天候发电 100kW，消耗铀。', price: 4000 },
  wind_b:     { name: '风力涡轮机', cat: 'mach', iconBlock: 'wind', block: 'wind', stack: 50, desc: '全天候发电 4~14kW，海拔越高风越大。', price: 420 },
  burner_b:   { name: '火力发电机', cat: 'mach', iconBlock: 'burner', block: 'burner', stack: 50, desc: '烧煤/碳发电 25kW，工业的第一缕黑烟。', price: 260 },
  lumberbot_b:{ name: '伐木机器人', cat: 'mach', iconBlock: 'lumberbot', block: 'lumberbot', stack: 10, desc: '放置充电桩后悬浮机器人自动巡林伐木，采集碳装满后自动送往附近的收集点。', price: 320 },
  collector_b:{ name: '收集点', cat: 'mach', iconBlock: 'collector', block: 'collector', stack: 20, desc: '伐木机器人的卸货站（12格），库存自动输出到面前的传送带/机器，可直通装配机。', price: 110 },
  hoe:        { name: '锄头', cat: 'tool', iconFn: 'hoe', stack: 1, desc: '把泥土开垦成耕地。', price: 10 },
  watering_can:{ name: '洒水壶', cat: 'tool', iconFn: 'watering_can', stack: 1, desc: '给耕地浇水，作物才能继续生长。', price: 14 },
  shovel:     { name: '铲子', cat: 'tool', iconFn: 'shovel', stack: 1, desc: '挖掘方块并收集掉落物，只有它能破坏方块。', price: 12 },
  wheat_seed: { name: '小麦种子', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获小麦。', price: 3 },
  potato_seed:{ name: '马铃薯块茎', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获马铃薯。', price: 4 },
  carrot_seed:{ name: '胡萝卜种子', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获胡萝卜。', price: 3 },
  beet_seed:  { name: '甜菜种子', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获甜菜根。', price: 3 },
  pumpkin_seed:{ name: '南瓜种子', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获南瓜。', price: 5 },
  berry_seed: { name: '甜浆果苗', cat: 'res', iconFn: 'seed', stack: 250, desc: '种在耕地上，成熟后收获甜浆果。', price: 5 },
  wheat:      { name: '小麦', cat: 'mat', iconFn: 'wheat', stack: 250, desc: '谷物，可磨成面粉。', price: 6 },
  potato:     { name: '马铃薯', cat: 'mat', iconFn: 'potato', stack: 250, desc: '耐放的块茎作物。', price: 8 },
  carrot:     { name: '胡萝卜', cat: 'mat', iconFn: 'carrot', stack: 250, desc: '甜脆的根菜。', price: 7 },
  beetroot:   { name: '甜菜根', cat: 'mat', iconFn: 'beetroot', stack: 250, desc: '含糖量高的根菜。', price: 7 },
  pumpkin:    { name: '南瓜', cat: 'mat', iconFn: 'pumpkin', stack: 100, desc: '秋天的心跳。', price: 12 },
  sweet_berry:{ name: '甜浆果', cat: 'mat', iconFn: 'sweet_berry', stack: 250, desc: '可以加工成果酱。', price: 9 },
  flour:      { name: '面粉', cat: 'mat', iconFn: 'flour', stack: 250, desc: '小麦磨成的粉。', price: 10 },
  bread:      { name: '面包', cat: 'mat', iconFn: 'bread', stack: 100, desc: '刚出炉的麦香。', price: 20 },
  jam:        { name: '浆果酱', cat: 'mat', iconFn: 'jam', stack: 100, desc: '甜浆果慢熬成的果酱。', price: 26 },
  irrigator_b:{ name: '灌溉机', cat: 'mach', iconBlock: 'irrigator', block: 'irrigator', stack: 20, desc: '耗电覆盖周围 5×5 耕地，自动浇水。', price: 650 },
  planter_b:  { name: '播种机', cat: 'mach', iconBlock: 'planter', block: 'planter', stack: 20, desc: '消耗种子，自动在周围空耕地上播种。', price: 900 },
  harvester_b:{ name: '收割机', cat: 'mach', iconBlock: 'harvester', block: 'harvester', stack: 20, desc: '自动收割周围成熟作物并输出到传送带。', price: 1200 },
  sellbot_b:  { name: '收购站', cat: 'mach', iconBlock: 'sellbot', block: 'sellbot', stack: 20, desc: '接受传送带输入，按行情自动收购并支付金币。需电力。', price: 500 },
  vendor_b:   { name: '出售站', cat: 'mach', iconBlock: 'vendor', block: 'vendor', stack: 20, desc: '消耗金币购买物资，货物自动输出到面前的传送带/机器。需电力。', price: 500 },
  trash_b:    { name: '物品销毁机', cat: 'mach', iconBlock: 'trash', block: 'trash', stack: 20, desc: '丢进去的物品会被直接销毁，无法找回。', price: 60 },
  filter_b:   { name: '过滤器', cat: 'mach', iconBlock: 'filter', block: 'filter', stack: 20, desc: '只放行清单内的物品，其余物品继续留在传送带上。', price: 180 },
  chute_b:    { name: '向漏斗', cat: 'mach', iconBlock: 'chute', block: 'chute', stack: 20, desc: '把收到的物品垂直投递到下方容器/机器，可叠放接力。', price: 120 },
  // ---- 工业扩展物品 ----
  foundry_b:    { name: '铸造炉', cat: 'mach', iconBlock: 'foundry', block: 'foundry', stack: 50, desc: '升级版熔炉，冶炼更快更稳。', price: 160 },
  smelter_b:    { name: '精炼熔炉', cat: 'mach', iconBlock: 'smelter', block: 'smelter', stack: 50, desc: '高效精炼金属，矿石利用率更高。', price: 220 },
  iron_box_b:   { name: '加固箱', cat: 'mach', iconBlock: 'iron_box', block: 'iron_box', stack: 50, desc: '24 格加固存储，更耐工业环境。', price: 130 },
  vent_pipe_b:  { name: '通风管道', cat: 'blk', iconBlock: 'vent_pipe', block: 'vent_pipe', stack: 250, desc: '工业管道装饰与通风。', price: 8 },
  cable_spool_b:{ name: '电缆卷', cat: 'blk', iconBlock: 'cable_spool', block: 'cable_spool', stack: 250, desc: '铜电缆卷起的工业建材。', price: 14 },
  light_panel_b:{ name: '工业灯板', cat: 'blk', iconBlock: 'light_panel', block: 'light_panel', stack: 100, desc: '发光的工业面板，照亮夜班。', price: 26 },
  battery_b:   { name: '储能电池', cat: 'mach', iconBlock: 'battery', block: 'battery', stack: 20, desc: '储存富余电力，缺电时释放，稳定电网。', price: 1400 },
  boiler_b:    { name: '高效锅炉', cat: 'mach', iconBlock: 'boiler', block: 'boiler', stack: 20, desc: '50kW 锅炉，燃料利用率更高（燃烧时间×2.5）。', price: 900 },
  fast_belt_b: { name: '高速传送带', cat: 'mach', iconBlock: 'fast_belt', block: 'fast_belt', stack: 200, desc: '传送速度 1.67× 的传送带。', price: 90 },
  storage_vault_b:{ name: '大型仓储柜', cat: 'mach', iconBlock: 'storage_vault', block: 'storage_vault', stack: 20, desc: '48 格大型仓储，工业堆场必备。', price: 240 },
  compressor_b:  { name: '压缩机', cat: 'mach', iconBlock: 'compressor', block: 'compressor', stack: 20, desc: '可自动合成的高压装配机。', price: 720 },
  compact_stone: { name: '压缩岩', cat: 'blk', iconBlock: 'compact_stone', block: 'compact_stone', stack: 250, desc: '加压成型的致密建材。', price: 6 },
  solar_farm_b:  { name: '大型太阳能板', cat: 'mach', iconBlock: 'solar_farm', block: 'solar_farm', stack: 50, desc: '白天输出 24kW，比普通太阳能板更强。', price: 800 },
  wind_tower_b:  { name: '大型风力发电机', cat: 'mach', iconBlock: 'wind_tower', block: 'wind_tower', stack: 50, desc: '风力输出 ×1.6，高海拔收益更高。', price: 640 },
  deep_miner_b:  { name: '深井采矿机', cat: 'mach', iconBlock: 'deep_miner', block: 'deep_miner', stack: 20, desc: '采矿速度 ×1.8 的增强矿机。', price: 900 },
  refinery_tower_b:{ name: '大型精炼厂', cat: 'mach', iconBlock: 'refinery_tower', block: 'refinery_tower', stack: 20, desc: '精炼速度 ×1.6 的大型精炼厂。', price: 1500 },
  assembler_tower_b:{ name: '大型装配机', cat: 'mach', iconBlock: 'assembler_tower', block: 'assembler_tower', stack: 20, desc: '装配速度 ×1.6 的大型装配机。', price: 1100 },
  reactor_tower_b:  { name: '大型核反应堆', cat: 'mach', iconBlock: 'reactor_tower', block: 'reactor_tower', stack: 10, desc: '150kW 全天候发电，燃料容量更大。', price: 9000 },
  irrigator_tower_b:{ name: '大型灌溉机', cat: 'mach', iconBlock: 'irrigator_tower', block: 'irrigator_tower', stack: 20, desc: '覆盖 7×7 耕地的大型灌溉机。', price: 950 },
  harvester_tower_b:{ name: '大型收割机', cat: 'mach', iconBlock: 'harvester_tower', block: 'harvester_tower', stack: 20, desc: '覆盖 7×7 的大型自动收割机。', price: 1600 },
  planter_tower_b:  { name: '大型播种机', cat: 'mach', iconBlock: 'planter_tower', block: 'planter_tower', stack: 20, desc: '覆盖 7×7 的大型自动播种机。', price: 1300 },
  collector_tower_b:{ name: '大型收集点', cat: 'mach', iconBlock: 'collector_tower', block: 'collector_tower', stack: 20, desc: '36 格大型卸货收集点。', price: 300 },
  furnace_tower_b:  { name: '工业熔炉塔', cat: 'mach', iconBlock: 'furnace_tower', block: 'furnace_tower', stack: 20, desc: '冶炼速度 ×2.0 的工业熔炉塔。', price: 260 },
  metal_frame_b:   { name: '金属框架', cat: 'blk', iconBlock: 'metal_frame', block: 'metal_frame', stack: 250, desc: '工业建筑框架。', price: 10 },
  industrial_pipe_b:{ name: '工业管道', cat: 'blk', iconBlock: 'industrial_pipe', block: 'industrial_pipe', stack: 250, desc: '管道与支撑结构。', price: 9 },
  warning_stripe_b:{ name: '警告条', cat: 'blk', iconBlock: 'warning_stripe', block: 'warning_stripe', stack: 250, desc: '黄黑警示装饰。', price: 16 },
  burner_tower_b:  { name: '大型火力发电机', cat: 'mach', iconBlock: 'burner_tower', block: 'burner_tower', stack: 20, desc: '40kW 火电，燃料效率 ×1.3。', price: 520 },
  trade_tower_b:   { name: '交易塔', cat: 'mach', iconBlock: 'trade_tower', block: 'trade_tower', stack: 20, desc: '售价 ×1.15 的高级收购站。', price: 900 },
  vendor_tower_b:  { name: '交易商城', cat: 'mach', iconBlock: 'vendor_tower', block: 'vendor_tower', stack: 20, desc: '购买价 ×0.85 的出售商城。', price: 900 },
  chest_tower_b:   { name: '大型仓储塔', cat: 'mach', iconBlock: 'chest_tower', block: 'chest_tower', stack: 20, desc: '64 格大型仓储塔。', price: 360 },
};
for (const k in ITEMS){ ITEMS[k].id = k; if (!ITEMS[k].stack) ITEMS[k].stack = 250; }

// ================= 作物 =================
// tiles: 生长阶段对应的十字贴图（Farm 模块据此动态换贴）
const CROPS = {
  wheat:   { name: '小麦',   seed: 'wheat_seed',   produce: 'wheat',      type: '谷物', stages: 4, stageTime: 30, tiles: ['wheat_stage0', 'wheat_stage1', 'wheat_stage2', 'wheat_stage3'], season: '春·秋', baseYield: 1 },
  potato:  { name: '马铃薯', seed: 'potato_seed',  produce: 'potato',     type: '蔬菜', part: 'root', stages: 4, stageTime: 34, tiles: ['potato_stage0', 'potato_stage1', 'potato_stage2', 'potato_stage3'], season: '春·夏', baseYield: 2 },
  carrot:  { name: '胡萝卜', seed: 'carrot_seed',  produce: 'carrot',     type: '蔬菜', part: 'root', stages: 4, stageTime: 30, tiles: ['carrot_stage0', 'carrot_stage1', 'carrot_stage2', 'carrot_stage3'], season: '春·秋', baseYield: 2 },
  beetroot:{ name: '甜菜',   seed: 'beet_seed',    produce: 'beetroot',   type: '蔬菜', part: 'root', stages: 4, stageTime: 30, tiles: ['beet_stage0', 'beet_stage1', 'beet_stage2', 'beet_stage3'], season: '春·秋', baseYield: 2 },
  pumpkin: { name: '南瓜',   seed: 'pumpkin_seed', produce: 'pumpkin',    type: '蔬菜', part: 'fruit', stages: 4, stageTime: 42, tiles: ['pumpkin_stage0', 'pumpkin_stage1', 'pumpkin_stage2', 'pumpkin_stage3'], season: '夏·秋', baseYield: 1 },
  berry:   { name: '甜浆果', seed: 'berry_seed',   produce: 'sweet_berry',type: '水果', stages: 4, stageTime: 34, tiles: ['berry_stage0', 'berry_stage1', 'berry_stage2', 'berry_stage3'], season: '春·夏', baseYield: 2 },
};
for (const k in CROPS){ CROPS[k].id = k; CROPS[k].tiles.length = CROPS[k].stages; }
for (const k in CROPS){
  if (!CROPS[k].season) CROPS[k].season = '四季';
  if (!CROPS[k].baseYield) CROPS[k].baseYield = k === 'pumpkin' ? 1 : 2;
}

// ================= 作物词条 =================
// tr 固定保存两个基因槽：显性 75%，隐性 25%，允许双相同基因。
const TRAITS = {
  companion: { name: '同道相益', kind: '隐性', color: '#8ad66e', desc: '附近有同类作物时，生长速度 +50%。' },
  contrast:  { name: '鹤立鸡群', kind: '隐性', color: '#7dd6dc', desc: '附近有不同类作物时，生长速度 +50%。' },
  pack:      { name: '狼狈为奸', kind: '隐性', color: '#bc8ae0', desc: '附近有相同词条作物时，生长速度 +25%。' },
  pollinate: { name: '招蜂引蝶', kind: '隐性', color: '#f1b653', desc: '播种时有 77% 概率获得丰收组。' },
  hydrated:  { name: '水分充足', kind: '显性', color: '#5ab6e8', priceMul: 1.08, desc: '水润饱满，售价 +8%。' },
  lush:      { name: '枝叶繁茂', kind: '显性', type: '蔬菜', part: 'leaf', color: '#63af58', desc: '绿叶蔬菜售价 +20%。' },
  rooty:     { name: '茁壮根茎', kind: '显性', type: '蔬菜', part: 'root', color: '#c98754', desc: '根茎蔬菜售价 +20%。' },
  pungent:   { name: '刺鼻气味', kind: '显性', type: '蔬菜', color: '#d46b4d', desc: '大葱/大蒜售价 +50%，其他蔬菜售价 -10%。' },
};
for (const k in TRAITS) TRAITS[k].id = k;

function traitsForCrop(cropId){
  const c = CROPS[cropId];
  return Object.values(TRAITS).filter(t => !t.type || t.type === c.type);
}
function rollTraits(cropId){
  const pool = traitsForCrop(cropId); const dominant = pool.filter(t => t.kind === '显性'); const recessive = pool.filter(t => t.kind === '隐性');
  return [0, 1].map(() => { const pick = Math.random() < 0.75 ? dominant : recessive; return pick[Math.floor(Math.random() * pick.length)].id; });
}
function inheritTraits(cropId, base){ return normalizeTraits(cropId, base); }
function normalizeTraits(cropId, traits){
  const crop = CROPS[cropId];
  if (!crop) return [];
  const pool = new Set(traitsForCrop(cropId).map(t => t.id));
  const valid = (traits || []).filter(id => pool.has(id)).slice(0, 2);
  while (valid.length < 2) valid.push(rollTraits(cropId)[valid.length]);
  return valid;
}
function breedTraits(cropId, a, b){
  const left = normalizeTraits(cropId, a), right = normalizeTraits(cropId, b);
  // 每个基因槽分别从父、母两株的两个基因中随机继承一个，允许纯合双词条。
  return [left[Math.floor(Math.random() * 2)], right[Math.floor(Math.random() * 2)]];
}
function traitPriceMul(traits){
  let m = 1; for (const id of traits || []){ const t = TRAITS[id]; if (t && t.priceMul) m *= t.priceMul; }
  return m;
}
function cropTraitPriceMul(cropId, traits){
  let m = traitPriceMul(traits); const crop = CROPS[cropId];
  for (const id of traits || []){
    if (id === 'lush' && crop && crop.part === 'leaf') m *= 1.2;
    if (id === 'rooty' && crop && crop.part === 'root') m *= 1.2;
    if (id === 'pungent') m *= crop && (crop.name.includes('葱') || crop.name.includes('蒜')) ? 1.5 : crop && crop.type === '蔬菜' ? 0.9 : 1;
  }
  return m;
}
function traitCraftMul(traits){
  let m = 1;
  for (const id of traits || []){ const t = TRAITS[id]; if (t && t.craftMul) m *= t.craftMul; }
  return m;
}

// ================= 配方 =================
// where: hand(便携合成) / furnace / assembler / refinery ; time 秒
const RECIPES = [
  // --- 熔炉 ---
  { id: 'iron',    out: { iron: 1 },    in: { iron_ore: 1 },  where: 'furnace', time: 2.4 },
  { id: 'copper',  out: { copper: 1 },  in: { copper_ore: 1 },where: 'furnace', time: 2.4 },
  { id: 'titanium',out: { titanium: 1 },in: { titanium_ore: 1 }, where: 'furnace', time: 3.6 },
  { id: 'gold',    out: { gold: 1 },    in: { gold_ore: 1 },  where: 'furnace', time: 3.0 },
  { id: 'glass_b', out: { glass_b: 1 }, in: { sand: 2 },      where: 'furnace', time: 2.0 },
  { id: 'stone_smelt', out: { stone: 1 }, in: { dirt: 4 },    where: 'furnace', time: 2.0, hidden: true },
  { id: 'bread',   out: { bread: 1 },   in: { flour: 2 },     where: 'furnace', time: 3.0 },
  { id: 'jam',     out: { jam: 1 },     in: { sweet_berry: 4, carbon: 2 }, where: 'furnace', time: 3.5 },
  // --- 便携/装配 通用 ---
  { id: 'gear',    out: { gear: 1 },    in: { iron: 2 },              where: 'both', time: 1.6 },
  { id: 'wire',    out: { wire: 2 },    in: { copper: 1 },            where: 'both', time: 1.2 },
  { id: 'circuit', out: { circuit: 1 }, in: { wire: 3, iron: 1 },     where: 'both', time: 3.2 },
  { id: 'plate',   out: { plate: 1 },   in: { iron: 3, carbon: 2 },   where: 'both', time: 2.8 },
  { id: 'data',    out: { data: 1 },    in: { circuit: 1, carbon: 5 },where: 'both', time: 4.0 },
  { id: 'planks_b',out: { planks_b: 4 },in: { carbon: 4 },            where: 'both', time: 1.0 },
  { id: 'lamp_b',  out: { lamp_b: 2 },  in: { glass_b: 2, wire: 1 },  where: 'both', time: 1.5 },
  { id: 'flour',   out: { flour: 1 },   in: { wheat: 2 },             where: 'both', time: 1.2 },
  { id: 'hoe',     out: { hoe: 1 },     in: { iron: 1, planks_b: 2 }, where: 'both', time: 1.0 },
  { id: 'watering_can', out: { watering_can: 1 }, in: { iron: 2, copper: 1 }, where: 'both', time: 1.4 },
  { id: 'wheat_seed',  out: { wheat_seed: 2 },  in: { wheat: 1 },     where: 'both', time: 0.8 },
  { id: 'potato_seed', out: { potato_seed: 2 }, in: { potato: 1 },    where: 'both', time: 0.8 },
  { id: 'carrot_seed', out: { carrot_seed: 2 }, in: { carrot: 1 },    where: 'both', time: 0.8 },
  { id: 'beet_seed',   out: { beet_seed: 2 },   in: { beetroot: 1 },  where: 'both', time: 0.8 },
  { id: 'pumpkin_seed',out: { pumpkin_seed: 2 },in: { pumpkin: 1 },   where: 'both', time: 0.8 },
  { id: 'berry_seed',  out: { berry_seed: 2 },  in: { sweet_berry: 1 }, where: 'both', time: 0.8 },
  // --- 机器制造（便携+装配）---
  { id: 'furnace_b',  out: { furnace_b: 1 },  in: { stone: 12 },                              where: 'both', time: 2.0 },
  { id: 'burner_b',   out: { burner_b: 1 },   in: { iron: 8, gear: 4, stone: 6 },             where: 'both', time: 4.0, tech: 'automation' },
  { id: 'wind_b',     out: { wind_b: 1 },     in: { iron: 6, gear: 4, circuit: 1 },           where: 'both', time: 4.0, tech: 'power' },
  { id: 'chest_b',    out: { chest_b: 1 },    in: { planks_b: 6, iron: 2 },                   where: 'both', time: 2.0, tech: 'automation' },
  { id: 'collector_b',out: { collector_b: 1 },in: { planks_b: 4, iron: 4 },                   where: 'both', time: 2.0, tech: 'automation' },
  { id: 'lumberbot_b',out: { lumberbot_b: 1 },in: { iron: 6, gear: 2, wire: 2 },              where: 'both', time: 3.0, tech: 'automation' },
  { id: 'miner_b',    out: { miner_b: 1 },    in: { iron: 10, gear: 4, circuit: 1 },          where: 'both', time: 5.0, tech: 'automation' },
  { id: 'belt_b',     out: { belt_b: 2 },     in: { iron: 2, gear: 1 },                       where: 'both', time: 1.4, tech: 'automation' },
  { id: 'solar_b',    out: { solar_b: 1 },    in: { iron: 5, glass_b: 3, circuit: 1 },        where: 'both', time: 4.0, tech: 'power' },
  { id: 'assembler_b',out: { assembler_b: 1 },in: { iron: 12, gear: 6, circuit: 3 },          where: 'both', time: 6.0, tech: 'assembly' },
  { id: 'refinery_b', out: { refinery_b: 1 }, in: { iron: 10, copper: 6, circuit: 2, stone: 8 }, where: 'both', time: 6.0, tech: 'refining' },
  { id: 'reactor_b',  out: { reactor_b: 1 },  in: { titanium: 12, circuit: 8, plate: 4, uranium: 4 }, where: 'both', time: 12.0, tech: 'nuclear' },
  { id: 'irrigator_b',out: { irrigator_b: 1 },in: { iron: 8, gear: 4, copper: 6 },            where: 'both', time: 5.0, tech: 'agri_auto' },
  { id: 'planter_b',  out: { planter_b: 1 },  in: { iron: 10, gear: 6, circuit: 2 },          where: 'both', time: 6.0, tech: 'agri_auto' },
  { id: 'sellbot_b',  out: { sellbot_b: 1 },  in: { iron: 6, gear: 3, circuit: 1 },           where: 'both', time: 5.0, tech: 'automation' },
  { id: 'vendor_b',   out: { vendor_b: 1 },   in: { iron: 6, gear: 2, circuit: 2 },            where: 'both', time: 5.0, tech: 'automation' },
  { id: 'trash_b',    out: { trash_b: 1 },    in: { iron: 4, stone: 4 },                       where: 'both', time: 2.0 },
  { id: 'filter_b',   out: { filter_b: 1 },   in: { iron: 4, wire: 2, gear: 2 },                where: 'both', time: 4.0, tech: 'automation' },
  { id: 'chute_b',    out: { chute_b: 1 },    in: { iron: 5, gear: 2 },                         where: 'both', time: 3.0, tech: 'automation' },
  { id: 'harvester_b',out: { harvester_b: 1 },in: { iron: 12, gear: 6, circuit: 3 },          where: 'both', time: 7.0, tech: 'agri_auto' },
  { id: 'shovel',  out: { shovel: 1 },   in: { iron: 1, planks_b: 2 },     where: 'both', time: 1.0 },
  // --- 精炼厂 / 便携 ---
  { id: 'carbon_x',out: { carbon: 3 },   in: { coal: 1 },                  where: 'refinery', time: 1.5 },
  // --- 工业扩展配方 ---
  { id: 'foundry_b',    out: { foundry_b: 1 },    in: { stone: 8, iron: 4, gear: 2 },        where: 'both', time: 5.0, tech: 'metallurgy' },
  { id: 'smelter_b',    out: { smelter_b: 1 },    in: { stone: 6, copper: 4, circuit: 1 },   where: 'both', time: 5.0, tech: 'metallurgy' },
  { id: 'iron_box_b',   out: { iron_box_b: 1 },   in: { iron: 4, planks_b: 4 },              where: 'both', time: 2.5 },
  { id: 'vent_pipe_b',  out: { vent_pipe_b: 4 },  in: { iron: 3, stone: 2 },                 where: 'both', time: 2.0 },
  { id: 'cable_spool_b',out: { cable_spool_b: 3 },in: { copper: 6, wire: 1 },                where: 'both', time: 2.5 },
  { id: 'light_panel_b',out: { light_panel_b: 2 },in: { glass_b: 2, lamp_b: 1, wire: 2 },    where: 'both', time: 3.0 },
  { id: 'battery_b',    out: { battery_b: 1 },    in: { iron: 12, copper: 4, circuit: 2, plate: 1 }, where: 'both', time: 8.0, tech: 'power' },
  { id: 'boiler_b',     out: { boiler_b: 1 },     in: { iron: 10, gear: 2, circuit: 1, stone: 4 }, where: 'both', time: 6.0, tech: 'power' },
  { id: 'fast_belt_b',  out: { fast_belt_b: 2 },  in: { iron: 2, gear: 2, copper: 1 }, where: 'both', time: 2.0, tech: 'automation' },
  { id: 'storage_vault_b', out: { storage_vault_b: 1 }, in: { iron: 8, planks_b: 10, chest_b: 1 }, where: 'both', time: 5.0, tech: 'automation' },
  { id: 'compressor_b', out: { compressor_b: 1 }, in: { iron: 10, gear: 4, circuit: 2, plate: 1 }, where: 'both', time: 6.0, tech: 'assembly' },
  { id: 'compact_stone', out: { compact_stone: 4 }, in: { stone: 8 }, where: 'assembler', time: 2.5 },
  { id: 'solar_farm_b', out: { solar_farm_b: 1 }, in: { solar_b: 1, iron: 4, circuit: 2, glass_b: 4 }, where: 'both', time: 6.0, tech: 'power' },
  { id: 'wind_tower_b', out: { wind_tower_b: 1 }, in: { wind_b: 1, iron: 4, gear: 2, circuit: 1 }, where: 'both', time: 6.0, tech: 'power' },
  { id: 'deep_miner_b', out: { deep_miner_b: 1 }, in: { miner_b: 1, iron: 6, gear: 2, circuit: 2 }, where: 'both', time: 6.0, tech: 'automation' },
  { id: 'refinery_tower_b', out: { refinery_tower_b: 1 }, in: { refinery_b: 1, iron: 8, circuit: 2, plate: 1 }, where: 'both', time: 8.0, tech: 'refining' },
  { id: 'assembler_tower_b', out: { assembler_tower_b: 1 }, in: { assembler_b: 1, iron: 8, circuit: 1, plate: 1 }, where: 'both', time: 7.0, tech: 'assembly' },
  { id: 'reactor_tower_b', out: { reactor_tower_b: 1 }, in: { reactor_b: 1, titanium: 8, plate: 4, circuit: 4 }, where: 'both', time: 12.0, tech: 'nuclear' },
  { id: 'irrigator_tower_b', out: { irrigator_tower_b: 1 }, in: { irrigator_b: 1, iron: 6, copper: 4 }, where: 'both', time: 6.0, tech: 'agri_auto' },
  { id: 'harvester_tower_b', out: { harvester_tower_b: 1 }, in: { harvester_b: 1, iron: 8, gear: 4, circuit: 1 }, where: 'both', time: 7.0, tech: 'agri_auto' },
  { id: 'planter_tower_b', out: { planter_tower_b: 1 }, in: { planter_b: 1, iron: 8, gear: 4, circuit: 1 }, where: 'both', time: 7.0, tech: 'agri_auto' },
  { id: 'collector_tower_b', out: { collector_tower_b: 1 }, in: { collector_b: 1, iron: 6, planks_b: 4 }, where: 'both', time: 3.0, tech: 'automation' },
  { id: 'furnace_tower_b', out: { furnace_tower_b: 1 }, in: { stone: 10, iron: 6, gear: 2 }, where: 'both', time: 5.0, tech: 'metallurgy' },
  { id: 'metal_frame_b',   out: { metal_frame_b: 4 },    in: { iron: 2 },        where: 'both', time: 1.0 },
  { id: 'industrial_pipe_b',out: { industrial_pipe_b: 4 },in: { iron: 2, copper: 1 }, where: 'both', time: 1.2 },
  { id: 'warning_stripe_b', out: { warning_stripe_b: 3 }, in: { gold: 1, iron: 1 }, where: 'both', time: 1.0 },
  { id: 'burner_tower_b', out: { burner_tower_b: 1 }, in: { burner_b: 1, iron: 8, gear: 2, circuit: 1 }, where: 'both', time: 6.0, tech: 'automation' },
  { id: 'trade_tower_b', out: { trade_tower_b: 1 }, in: { sellbot_b: 1, iron: 6, circuit: 1, gold: 2 }, where: 'both', time: 5.0, tech: 'automation' },
  { id: 'vendor_tower_b', out: { vendor_tower_b: 1 }, in: { vendor_b: 1, iron: 6, circuit: 1, gold: 2 }, where: 'both', time: 5.0, tech: 'automation' },
  { id: 'chest_tower_b', out: { chest_tower_b: 1 }, in: { storage_vault_b: 1, iron: 8, plate: 2 }, where: 'both', time: 6.0, tech: 'assembly' },
];
const RECIPE_BY_ID = {}; RECIPES.forEach(r => RECIPE_BY_ID[r.id] = r);

// 熔炉燃料价值（秒）
const FUEL_VALUE = { carbon: 4, coal: 16, planks_b: 3 };

// ================= 科技树 =================
// cost: {item:n}  time: 研究秒数  pos: 树中坐标
const TECH = {
  farming:   { name: '田园耕读', icon: 'hoe', cost: {}, time: 0, pos: [60, 420], desc: '解锁锄头、种子与作物加工。', unlocked: true, req: [] },
  survival:  { name: '基础采集', icon: 'carbon', cost: {}, time: 0, pos: [60, 300], desc: '基础采集与合成。', unlocked: true, req: [] },
  metallurgy:{ name: '冶金学', icon: 'furnace_b', cost: { data: 2 }, time: 8, pos: [260, 360], req: ['farming'], desc: '解锁熔炉高效冶炼。' },
  automation:{ name: '自动化', icon: 'miner_b', cost: { data: 5 }, time: 15, pos: [450, 300], req: ['metallurgy'], desc: '解锁自动采矿机、传送带、储物箱与火力发电机。' },
  power:     { name: '清洁能源', icon: 'solar_b', cost: { data: 8 }, time: 20, pos: [640, 240], req: ['automation'], desc: '解锁太阳能板与风力涡轮机。' },
  assembly:  { name: '装配流水线', icon: 'assembler_b', cost: { data: 12 }, time: 25, pos: [640, 400], req: ['automation'], desc: '解锁装配机，自动制造部件。' },
  refining:  { name: '化学精炼', icon: 'refinery_b', cost: { data: 15 }, time: 30, pos: [830, 320], req: ['power', 'assembly'], desc: '解锁精炼厂：高效燃料与化合物。' },
  nuclear:   { name: '核裂变', icon: 'reactor_b', cost: { data: 30, uranium: 5 }, time: 45, pos: [1020, 320], req: ['refining'], desc: '解锁核子反应堆，能源自由！' },
  agri_auto: { name: '农业自动化', icon: 'irrigator_b', cost: { data: 18, circuit: 4 }, time: 35, pos: [830, 460], req: ['power', 'assembly'], desc: '解锁灌溉机、播种机与收割机，让田野自己运转。' },
};
for (const k in TECH) TECH[k].id = k;

// ================= 星球生态 =================
const BIOMES = {
  lush:   { name: '翠绿星球', grass: 'grass', dirt: 'dirt', deep: 'stone', sky: [0.48, 0.72, 0.95], fog: [0.7, 0.85, 1.0], haz: null, hazName: '宜居', trees: 0.012, flowers: 0.02, oreMul: 1.0, tint: 0x7cc44f },
  desert: { name: '灼热荒漠', grass: 'sand', dirt: 'sand', deep: 'stone', sky: [0.95, 0.75, 0.5], fog: [0.98, 0.85, 0.65], haz: 'heat', hazName: '☀ 极端高温', hazRate: 1.6, trees: 0.001, flowers: 0.008, oreMul: 1.3, tint: 0xe0d29a },
  frozen: { name: '冰封世界', grass: 'snow', dirt: 'dirt', deep: 'ice', sky: [0.7, 0.8, 0.95], fog: [0.85, 0.9, 1.0], haz: 'cold', hazName: '❄ 酷寒', hazRate: 1.4, trees: 0.004, flowers: 0.006, oreMul: 1.2, tint: 0xf2f6fa },
  volcanic:{ name: '熔火之地', grass: 'basalt', dirt: 'basalt', deep: 'basalt', sky: [0.5, 0.28, 0.2], fog: [0.6, 0.4, 0.3], haz: 'heat', hazName: '🌋 炽热大气', hazRate: 2.2, trees: 0.0, flowers: 0.004, oreMul: 2.0, tint: 0x3a3a42, dry: true },
  alien:  { name: '异星菌境', grass: 'alien', dirt: 'dirt', deep: 'stone', sky: [0.45, 0.3, 0.6], fog: [0.6, 0.45, 0.75], haz: 'toxic', hazName: '☣ 剧毒孢子', hazRate: 1.8, trees: 0.008, flowers: 0.03, oreMul: 1.5, tint: 0x9a5fd0 },
  // ---- 新星球类型 ----
  ocean:  { name: '蔚蓝海球', grass: 'grass', dirt: 'sand', deep: 'stone', sky: [0.35, 0.62, 0.88], fog: [0.6, 0.8, 0.95], haz: null, hazName: '宜居', trees: 0.007, flowers: 0.014, oreMul: 0.9, tint: 0x3e8ed6, seaLift: 7 },
  crystal:{ name: '晶簇冻土', grass: 'snow', dirt: 'dirt', deep: 'ice', sky: [0.55, 0.75, 0.85], fog: [0.75, 0.9, 0.95], haz: 'cold', hazName: '❄ 晶界酷寒', hazRate: 1.7, trees: 0, flowers: 0.004, oreMul: 1.4, tint: 0x7fe8e0, crystals: 0.02 },
  fungal: { name: '巨菌之森', grass: 'alien', dirt: 'dirt', deep: 'stone', sky: [0.5, 0.38, 0.55], fog: [0.68, 0.55, 0.72], haz: 'toxic', hazName: '☣ 菌孢瘴气', hazRate: 1.3, trees: 0.010, flowers: 0.02, oreMul: 1.2, tint: 0xc06fd8, mushroom: true },
  ashen:  { name: '灰烬荒原', grass: 'ash', dirt: 'ash', deep: 'basalt', sky: [0.45, 0.42, 0.4], fog: [0.6, 0.58, 0.55], haz: 'rad', hazName: '☢ 辐射尘暴', hazRate: 2.0, trees: 0, flowers: 0.003, oreMul: 1.8, tint: 0x8a8a8a },
  // ---- 更多星球类型 ----
  amber:  { name: '金珀沙海', grass: 'amber', dirt: 'sand', deep: 'stone', sky: [0.92, 0.72, 0.42], fog: [0.98, 0.85, 0.6], haz: 'heat', hazName: '☀ 灼金热浪', hazRate: 1.2, trees: 0.001, flowers: 0.006, oreMul: 1.1, tint: 0xe0a63a,
    desc: '远古树脂凝成的琥珀荒漠，岩层中封存着黄金与史前碳。' },
  ferrous:{ name: '磁暴铁原', grass: 'rust', dirt: 'rust', deep: 'basalt', sky: [0.55, 0.4, 0.32], fog: [0.7, 0.55, 0.45], haz: 'storm', hazName: '⚡ 磁暴侵蚀', hazRate: 1.5, trees: 0, flowers: 0.004, oreMul: 1.6, tint: 0xa86a4a,
    desc: '整颗星球是一块生锈的陨铁，磁暴撕扯着每一件金属装备。' },
  murk:   { name: '荧光沼泽', grass: 'murk', dirt: 'dirt', deep: 'stone', sky: [0.16, 0.3, 0.28], fog: [0.25, 0.42, 0.38], haz: 'toxic', hazName: '☣ 沼气瘴雾', hazRate: 1.1, trees: 0.004, flowers: 0.035, oreMul: 1.0, tint: 0x2e8a72, seaLift: 4, mushroom: true,
    flora: ['glow_shroom', 'glow_shroom', 'oxygen_plant'],
    desc: '永暮的湿地被荧光蕈照亮，是氧气与钠的天然温室。' },
  salt:   { name: '盐晶滩', grass: 'salt', dirt: 'salt', deep: 'stone', sky: [0.8, 0.85, 0.9], fog: [0.92, 0.95, 0.98], haz: null, hazName: '宜居', trees: 0, flowers: 0.008, oreMul: 1.0, tint: 0xe8ecf0,
    flora: ['sodium_plant', 'sodium_plant', 'fern'],
    desc: '一望无际的白色盐原，脚下每一块地面都是钠矿。' },
  obsidian:{ name: '黑曜熔壁', grass: 'obsidian', dirt: 'obsidian', deep: 'basalt', sky: [0.28, 0.22, 0.35], fog: [0.4, 0.32, 0.48], haz: 'heat', hazName: '☀ 曜岩余温', hazRate: 1.9, trees: 0, flowers: 0.002, oreMul: 1.7, tint: 0x2a2a35, dry: true,
    desc: '冷却的熔岩玻璃覆盖全球，坚硬、锋利、闪着幽紫的光。' },
  redmoss:{ name: '红藓高原', grass: 'redmoss', dirt: 'dirt', deep: 'stone', sky: [0.75, 0.5, 0.42], fog: [0.88, 0.68, 0.58], haz: 'cold', hazName: '❄ 稀薄冷风', hazRate: 1.1, trees: 0.003, flowers: 0.012, oreMul: 1.15, tint: 0xc25a48,
    desc: '猩红苔藓吞没了古老山脉，像一颗永远处于黄昏的星球。' },
  hive:   { name: '蜂窝穹丘', grass: 'hive', dirt: 'hive', deep: 'stone', sky: [0.85, 0.6, 0.3], fog: [0.95, 0.75, 0.45], haz: 'toxic', hazName: '☣ 信息素迷雾', hazRate: 1.5, trees: 0, flowers: 0.01, oreMul: 1.3, tint: 0xd8862a,
    desc: '不知是谁筑起了覆盖星球的六角巢穴——而它们还在里面。' },
};

// 生物类型（按星球生态）
const CREATURE_TYPES = {
  crab:    { w: 0.55, h: 0.4, d: 0.7, headW: 0.2, speed: 0.7, jump: false },
  strider: { w: 0.35, h: 1.1, d: 0.35, headW: 0.22, speed: 1.8, jump: true },
  blob:    { w: 0.7, h: 0.5, d: 0.7, headW: 0.0, speed: 0.35, jump: false },
  drone:   { w: 0.3, h: 0.3, d: 0.6, headW: 0.15, speed: 2.4, jump: true, fly: true },
};
// 每个生态一种特色生物（所有星球都有生物）
BIOMES.lush.animal    = { body: 0x8a9e56, legs: 0x5e7038, eye: 0x2a2a2a, count: 10, name: '草原跳羚', type: 'strider' };
BIOMES.desert.animal  = { body: 0xd8b878, legs: 0xa8895a, eye: 0x442200, count: 7, name: '沙壳甲虫', type: 'crab' };
BIOMES.frozen.animal  = { body: 0xdce8f0, legs: 0xb8c8d4, eye: 0x3399ff, count: 6, name: '霜绒兽', type: 'blob' };
BIOMES.volcanic.animal= { body: 0x5a4038, legs: 0xc94f1e, eye: 0xff6600, count: 5, name: '熔壳蟹', type: 'crab' };
BIOMES.alien.animal   = { body: 0x9a6fd8, legs: 0x7c4fba, eye: 0xffd14d, count: 8, name: '孢子爬行者', type: 'strider' };
BIOMES.ocean.animal   = { body: 0x4da6c8, legs: 0x2e7893, eye: 0xffffff, count: 8, name: '碧波滑行兽', type: 'blob' };
BIOMES.crystal.animal = { body: 0xaef0ea, legs: 0x5ec8c0, eye: 0x0a4f6e, count: 5, name: '晶背蟹', type: 'crab' };
BIOMES.fungal.animal  = { body: 0xd8a8e8, legs: 0x9a5fd0, eye: 0xff5a4e, count: 9, name: '菌帽跳虫', type: 'strider' };
BIOMES.ashen.animal   = { body: 0x6e6a66, legs: 0x3a3a3a, eye: 0x7dff56, count: 4, name: '灰烬潜行者', type: 'crab' };
BIOMES.amber.animal   = { body: 0xe8c060, legs: 0xa87828, eye: 0x5e3808, count: 6, name: '珀壳掘虫', type: 'crab' };
BIOMES.ferrous.animal = { body: 0x8a5a3a, legs: 0x4a4a52, eye: 0x35e0e8, count: 5, name: '磁尘甲兽', type: 'crab' };
BIOMES.murk.animal    = { body: 0x2e8a72, legs: 0x1a5244, eye: 0x4ee8b8, count: 9, name: '沼灯浮蜓', type: 'blob' };
BIOMES.salt.animal    = { body: 0xf0f2f4, legs: 0xc2c9ce, eye: 0x222222, count: 7, name: '盐羽鹬', type: 'strider' };
BIOMES.obsidian.animal= { body: 0x2a2a35, legs: 0x6a5a9a, eye: 0xff6600, count: 4, name: '曜甲蟹', type: 'crab' };
BIOMES.redmoss.animal = { body: 0xc25a48, legs: 0x8a3a2c, eye: 0xffe8a0, count: 8, name: '藓原掠行者', type: 'strider' };
BIOMES.hive.animal    = { body: 0xd8862a, legs: 0x8a5210, eye: 0x1a1a1a, count: 10, name: '蜂窝守卫', type: 'strider' };

// ================= 商品交易表 =================
const TRADE_GOODS = ['wheat','potato','carrot','beetroot','pumpkin','sweet_berry','flour','bread','jam','coal','iron_ore','copper_ore','gold_ore','iron','copper','gold','gear','wire','circuit','stone','sand','planks_b','glass_b','wheat_seed','potato_seed','carrot_seed','beet_seed','pumpkin_seed','berry_seed','vent_pipe_b','cable_spool_b','light_panel_b','battery_b','boiler_b','fast_belt_b','storage_vault_b','compressor_b','compact_stone','solar_farm_b','wind_tower_b','deep_miner_b','refinery_tower_b','assembler_tower_b','reactor_tower_b','irrigator_tower_b','harvester_tower_b','planter_tower_b','collector_tower_b','furnace_tower_b','metal_frame_b','industrial_pipe_b','warning_stripe_b','burner_tower_b','trade_tower_b','vendor_tower_b','chest_tower_b'];

// ================= 任务线 =================
// type: collect(拥有n个) / place / tech / farm(农田行为计数)
const QUESTS = [
  { id: 'q_till', title: '开垦第一片田', desc: '用锄头开垦 6 块耕地', type: 'farm', stat: 'till', n: 6,
    dialog: '选中锄头，右键点泥土/草地就能开垦耕地。' },
  { id: 'q_plant', title: '播下种子', desc: '在耕地上种下 6 粒小麦种子', type: 'farm', stat: 'plant', n: 6,
    dialog: '选中小麦种子，右键点击耕地播种。' },
  { id: 'q_water', title: '浇灌土地', desc: '用洒水壶给 4 块耕地浇水', type: 'farm', stat: 'water', n: 4,
    dialog: '只有保持水润的耕地，作物才会继续生长。' },
  { id: 'q_harvest', title: '第一份收成', desc: '收获 2 株成熟作物', type: 'farm', stat: 'harvest', n: 2,
    dialog: '成熟后用锄头左键收割，产物会带随机词条。' },
  { id: 'q_stone', title: '开采岩层', desc: '采集岩石 ×12', type: 'collect', item: 'stone', n: 12 },
  { id: 'q_furnace', title: '第一座熔炉', desc: '合成并放置一座熔炉', type: 'place', block: 'furnace',
    dialog: '按 Tab 打开合成面板，用岩石合成熔炉。' },
  { id: 'q_iron', title: '钢铁意志', desc: '熔炼铁锭 ×6（熔炉需要碳/煤作燃料）', type: 'collect', item: 'iron', n: 6 },
  { id: 'q_auto', title: '自动化黎明', desc: '研究「自动化」，放置自动采矿机于矿脉上', type: 'place', block: 'miner',
    dialog: '让机器为你工作。采矿机需要电力，先造火力发电机。' },
  { id: 'q_belt', title: '流水线', desc: '放置传送带 ×6，把矿石送进熔炉', type: 'place', block: 'belt', n: 6 },
  { id: 'q_power', title: '电力时代', desc: '研究「清洁能源」并放置 2 块太阳能板', type: 'place', block: 'solar', n: 2 },
  { id: 'q_refinery', title: '化学工厂', desc: '研究「化学精炼」并放置精炼厂', type: 'place', block: 'refinery' },
  { id: 'q_agri', title: '会自己种田的田野', desc: '研究「农业自动化」并放置灌溉机', type: 'place', block: 'irrigator' },
  { id: 'q_nuclear', title: '原子之心', desc: '研究「核裂变」并建造核子反应堆', type: 'place', block: 'reactor' },
];

// 星系里的星球（固定布局，每档案随机种子着色）
// 初始星系（固定布局）
const DEFAULT_PLANETS = [
  { id: 0, biome: 'lush',    name: '始源星',   pos: [0, 0, 0],       radius: 150 },
  { id: 1, biome: 'desert',  name: '赤沙',     pos: [1800, 120, -900], radius: 130 },
  { id: 2, biome: 'frozen',  name: '霜白',     pos: [-1500, -200, -1700], radius: 140 },
  { id: 3, biome: 'volcanic',name: '熔核',     pos: [900, -100, 2300],  radius: 120 },
  { id: 4, biome: 'alien',   name: '紫瘴',     pos: [-2400, 250, 1100], radius: 145 },
];
const DEFAULT_STATION = [700, 200, -500];
let SYSTEM_PLANETS = DEFAULT_PLANETS.map(p => ({ ...p, pos: [...p.pos] }));
let STATION_POS = [...DEFAULT_STATION];
const HOME_GALAXY_SEED = 7777;

function resetGalaxy(){
  SYSTEM_PLANETS = DEFAULT_PLANETS.map(p => ({ ...p, pos: [...p.pos] }));
  STATION_POS = [...DEFAULT_STATION];
}

// 生成一个随机星系的星球布局（seed 决定内容，纯函数不产生副作用）
const GALAXY_PREFIX = ['天琴','杜鹃','狐尾','鲸落','银帆','烛龙','雾马','环蛇','曙光','霜港','孤灯','奔雷','碎星','拾荒','眠沙','赤弦','夜莺','枯苇','潮汐','洄游'];
const GALAXY_SUFFIX = ['-α','-β','-γ','-δ','-Ω','-Ⅲ','-Ⅶ','-Ⅸ','-Ⅻ','-Prime','-Minor','-Deep'];
function galaxyName(seed){
  if (seed === HOME_GALAXY_SEED) return '起源星系';
  const rnd = mulberry32(seed ^ 0x6A09E667);
  return GALAXY_PREFIX[(rnd() * GALAXY_PREFIX.length) | 0] + GALAXY_SUFFIX[(rnd() * GALAXY_SUFFIX.length) | 0];
}
function generateGalaxy(seed){
  const rnd = mulberry32(seed);
  const biomePool = ['lush','desert','frozen','volcanic','alien','ocean','crystal','fungal','ashen','amber','ferrous','murk','salt','obsidian','redmoss','hive'];
  const names = [
    '翠风','赤岭','霜穹','灰烬','荒星','渊蓝','绿溪','灼岩','冰环','晶尘',
    '紫涌','绯沙','苍脊','黯潮','辉冠','裂星','流火','雾原','雪锋','熔渊',
    '澜礁','菌歌','空悬','曜壁','沉塔','洄湾','铁穗','昙丘','烬柱','虹隙',
  ];
  const used = new Set();
  const planets = [];
  const count = 4 + ((rnd() * 4) | 0);       // 4~7 颗
  for (let i = 0; i < count; i++){
    let n;
    do { n = names[(rnd() * names.length) | 0]; } while (used.has(n));
    used.add(n);
    const b = biomePool[(rnd() * biomePool.length) | 0];
    const ang = i / count * Math.PI * 2 + rnd() * 0.8, dist = 800 + rnd() * 2400, el = (rnd() - 0.5) * 700;
    planets.push({
      id: i,
      biome: b,
      name: n,
      pos: [Math.cos(ang) * dist, el, Math.sin(ang) * dist],
      radius: 105 + rnd() * 70,
    });
  }
  // 保证至少一颗富碳星球（可获取燃料材料）
  if (!planets.some(p => ['lush','ocean','fungal','alien'].includes(p.biome))){
    planets[0].biome = ['lush','ocean','fungal'][(rnd() * 3) | 0];
  }
  // 空间站
  const stat = [1200 * (rnd() - 0.5), 300 + rnd() * 400, 1200 * (rnd() - 0.5)];
  // 市场波动
  const market = {};
  for (const g of TRADE_GOODS) market[g] = 0.75 + rnd() * 0.5;
  return { planets, station: stat, market, seed, name: galaxyName(seed) };
}

// 当前星系的备份（存档用）
function setGalaxy(gal){
  SYSTEM_PLANETS = gal.planets;
  STATION_POS = gal.station;
}
