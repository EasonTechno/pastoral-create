# 发条农庄 · 模组（Mod）开发文档

> 适用版本：v1.1.0 起。游戏为纯 vanilla JS + vendored Three.js，无构建系统，
> 模组同样以「一个 ZIP 包 + 可选 JS」的形式加载，不引入 npm / bundler。

---

## 1. 用户侧：安装与管理

入口：

- 启动页「📦 模组管理」
- 游戏内 `Esc` 暂停菜单「📦 模组管理」
- 移动端右上角菜单 →「模组」

管理面板支持：

| 操作 | 行为 |
| --- | --- |
| ＋ 安装 Mod 包 | 选择 `.pcmod`（推荐）或 `.zip` 文件；补装依赖后会自动重试此前失败的模组 |
| 启用 / 停用 | 停用后需要重启才完全移除数据；启用可热加载数据补丁并自动重试依赖方 |
| 卸载 | 确认后删除包文件与配置，重启游戏生效 |
| ↻ 重启并生效 | 先保存当前存档，再刷新页面 |

包文件保存在浏览器 IndexedDB（`pastoral_mods_store_v1`），
清单与脚本镜像在 `localStorage`（`pastoral_mods_config_v1`）。
换浏览器/换设备不会同步模组；模组属于本机内容。

### 安全提示

模组脚本在页面主线程运行，拥有和游戏本体相同的权限（localStorage、
IndexedDB、网络、DOM 等）。**请只安装可信来源的模组**。
游戏不会自动联网更新模组，也没有沙箱。

---

仓库里附带了一个可直接打包安装的最小示例：`docs/example-mod/`
（荧光砖 + 萤石粉 + 配方 + 任务 + `blockMined` 钩子）。

打包工具：`tools/pack-mod.sh <模组目录> [输出.pcmod]`，会把 `mod.json`、
`main.js`、`textures/`、`README.md`、`icon.png` 自动打进 `.pcmod`。

## 2. 包格式（.pcmod / .zip）

```
my_mod.pcmod
├── mod.json          # 必需，包根目录
├── main.js           # 可选，脚本入口（manifest.script 可改名）
├── icon.png          # 可选，未来面板图标
└── textures/
    ├── candy.png     # 方块/物品贴图，16×16 或任意方形，绘制时缩放
    └── icon.png      # 物品图标，绘制时缩放为 32×32
```

约束：

- 包总大小 ≤ 24MB，单文件 ≤ 2MB
- `mod.json` ≤ 256KB，`main.js` ≤ 512KB
- `mod.json` 必须位于 ZIP 根目录（也兼容 `包名/mod.json` 一层目录）
- 使用标准 ZIP deflate；存储（store）方式也可读取

### mod.json 字段

```json
{
  "schemaVersion": 1,
  "id": "example.candy_farm",
  "name": "糖果农场",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "添加糖果方块与糖果食谱。",
  "gameVersion": ">=1.1.0",
  "script": "main.js",
  "requires": [],
  "data": {
    "blocks": {
      "candy": {
        "name": "糖果方块",
        "tiles": { "all": "candy" },
        "hard": 1.2,
        "drops": [{ "item": "candy", "n": 1 }],
        "item": { "stack": 250, "price": 12 }
      }
    },
    "items": {
      "candy": {
        "name": "糖果",
        "cat": "mat",
        "iconBlock": "candy",
        "stack": 250,
        "price": 8,
        "desc": "甜得发亮。"
      }
    },
    "recipes": [
      { "id": "candy_pack", "out": { "candy": 4 }, "in": { "sweet_berry": 1, "carbon": 2 }, "where": "both", "time": 1.5 }
    ],
    "crops": {
      "candy_cane": {
        "name": "糖果甘蔗",
        "seed": "candy_seed",
        "produce": "candy",
        "stages": 3,
        "stageTime": 26,
        "tiles": ["candy_stage0", "candy_stage1", "candy_stage2"]
      }
    },
    "tech": {
      "candy_tech": {
        "name": "甜蜜科技",
        "icon": "candy",
        "cost": { "data": 4 },
        "time": 12,
        "req": ["farming"],
        "desc": "解锁糖果相关配方。"
      }
    },
    "quests": [
      { "id": "q_candy", "title": "甜头", "desc": "合成 3 块糖果", "type": "collect", "item": "candy", "n": 3 }
    ],
    "tradeGoods": ["candy"],
    "fuelValue": { "candy": 2 }
  },
  "textures": [
    { "file": "textures/candy.png", "tile": "candy" },
    { "file": "textures/candy_icon.png", "item": "candy" }
  ]
}
```

说明：

- `data` 里的键和游戏本体定义同名时是 **合并/补丁**；`blocks` 要覆盖
  已有方块必须显式写 `"override": true`。
- 贴图不写 `textures` 映射也行：运行时会按 PNG 文件名自动匹配——
  文件名等于 tile 名就替换方块贴图，等于物品 id 就作为物品图标。
- 新方块会自动申请 tile 图集空位（共 256 格，本体约占 89 格），
  先用彩色占位图渲染，模组 PNG 异步就绪后原地覆盖，无需重建地形。

---

## 3. 数据注册 API（main.js）

模组脚本是严格模式函数，参数固定为：

```js
// 以下标识符已由运行时注入，直接使用即可：
// Mods, PC, BLOCKS, ITEMS, RECIPES, RECIPE_BY_ID, TECH, QUESTS,
// CROPS, TRAITS, BIOMES, FUEL_VALUE, TRADE_GOODS, Tex, Icons, THREE
```

最小脚本：

```js
Mods.addItem('magic_dust', {
  name: '魔法粉尘', cat: 'mat', iconBlock: 'crystal',
  stack: 500, price: 30, desc: '来自晶簇的细尘。'
});

Mods.addRecipe({
  id: 'magic_dust_recipe',
  out: { magic_dust: 2 },
  in: { stone: 4 },         // in 的 key 是物品 id（stone 是岩石方块对应的物品）
  where: 'both',
  time: 2
});
```

### Mods 注册方法

| 方法 | 说明 |
| --- | --- |
| `Mods.addBlock(key, def)` | 新增/合并方块。`def.tiles` 可写 `"stone"` 或 `{all,top,side,bottom,front}`；`item:true` 自动生成对应方块物品 |
| `Mods.addItem(key, def)` | 新增/合并物品。`iconBlock` 会自动用对应方块贴图绘制图标 |
| `Mods.addRecipe(def)` | 新增/替换配方。`where: hand / furnace / assembler / refinery / both` |
| `Mods.addTech(key, def)` | 新增科技节点 |
| `Mods.addQuest(def)` | 任务入队（`type: collect/place/tech/farm/event`） |
| `Mods.addCrop(key, def)` | 新增作物，需 `tiles` 生长贴图数组与 `seed`/`produce` |
| `Mods.addTrait(key, def)` | 新增作物词条（现有词条效果逻辑为固定代码，可叠加通用字段如 `priceMul`、`craftMul`） |
| `Mods.addTradeGood(id)` | 加入集市交易表 |
| `Mods.patchItem / patchBlock / patchRecipe` | 显式覆盖补丁 |
| `Mods.setTexture(tile, img)` | 用 Image/Canvas 覆盖某个方块 tile |
| `Mods.setItemIcon(itemId, img)` | 设置物品图标 |

所有注册方法都是**幂等**的：每次启动重新执行同一模组不会产生重复定义；
方块 id 按「模组 id + 方块 key」持久化分配（128~255），卸载后重装仍保持
同一 id，存档兼容。

### PC 对象

`PC` 是第二个参数，提供对游戏全局的只读引用与带归属的注册函数
（`PC.game / ui / world / player / factory / farm / space / sound`）：

```js
PC.log('模组启动');
PC.registerBlock('candy', {...});
PC.registerItem('candy', {...});
PC.registerRecipe({...});

PC.BLOCKS.stone.hard = 1.4;   // 直接改全局（小心影响其他模组与存档）
PC.game;  // 运行时为 Game API，启动早期为 null
```

也可以直接写 `BLOCKS`、`ITEMS` 等全局标识符——脚本加载于
`data.js` 之后、`farm/world/factory/ui/main` 之前，因此数据补丁会在
游戏模块初始化前生效。

---

### 版本兼容

- `Mods.has(id)` / `Mods.isEnabled(id)` → 是否已安装并启用
- `Mods.version` → 当前游戏版本（如 `1.2.12`），模组可在启动时做兼容判断。
- `PC.game.version` / `Game.version` → 同样返回游戏版本。

## 4. 脚本生命周期钩子

```js
Mods.on('tick', (dt, ctx) => {
  // ctx: { state, dayTime, dayCount, playTime, camera, camTarget, player }
  // 每帧调用一次；暂停/主菜单时不调用
});

Mods.on('gameReady', game => { /* Game API 就绪，只触发一次 */ });
Mods.on('newGame', ctx => { /* 新档已建立 ctx:{creative, planet, seed} */ });
Mods.on('loadGame', ctx => { /* 读档完成 ctx:{key, creative, planet} */ });
Mods.on('planetReady', ctx => { /* 星球地形已生成 */ });
Mods.on('blockMined', e => { /* e:{key, def} */ });
Mods.on('blockPlaced', e => { /* e:{key, def} */ });
Mods.on('farmEvent', kind => { /* kind: till/plant/water/harvest */ });
```

示例：让矿石方块被挖掉时额外掉落金币：

```js
Mods.on('blockMined', e => {
  if (!PC.game || !e.def || !e.def.ore) return;
  PC.game.addCargo('gold', 1);   // 飞船/背包入货；也可用 PC.player.addItem(...)
});
```

> 注意：钩子里访问 `PC.game` 前先判空。旧版本没有 `gameReady` 前
> `Game` 为 null。

---

### 模组配置基于存档

每个存档独立保存「该存档启用了哪些模组」（存档的 `mods` 字段）与模组自定义数据
（`modData` 字段）。读档时游戏会把全局模组启用状态切换为该存档自己的清单
（`Mods.applySaveEnabled`），因此 A 档选装的作物模组不会带到 B 档。

- 安装/启用的**包与代码**仍存本机（IndexedDB / localStorage），属于“设备可用的模组库”；
- 存档只记录“这个存档需要用哪些”，跨设备读档时若本机没有对应模组会提示缺失；
- 换档 = 切换模组配置，缺哪些模组一读档就会看到提示。

### 自定义存档数据

模组可以为每个存档保存自己的进度（JSON 可序列化）：

```js
Mods.on('newGame', () => {
  PC.setData('coins', 0);
});

Mods.on('tick', (dt, ctx) => {
  if (ctx.dayCount % 3 === 0) PC.setData('coins', PC.getData('coins', 0) + 1);
});

Mods.on('loadGame', () => {
  PC.log('读档恢复金币：', PC.getData('coins', 0));
});
```

- `PC.setData(key, value)` / `PC.getData(key, fallback)` 按模组自动隔离；
- 也可用 `Mods.getModData(modId, key)` / `Mods.setModData(modId, key, value)` 在
  控制台或管理逻辑中读写指定模组的数据；
- 数据随 `Game.save` 写入存档的 `modData` 字段，读档时在 `loadGame` 钩子前恢复；
- 局域网联机时，房主的 `modData` 会随初始同步发给访客；
- 限制：单模组 ≤ 64KB，所有模组合计 ≤ 512KB（JSON 字节数），超限会抛错；
- 不要存放函数、DOM 节点等不可 JSON 序列化的值。

## 5. 方块 / 物品字段速查

方块（`BLOCKS`）：

```js
{
  name: '糖果方块',
  hard: 1.2,                    // 挖掘秒数
  tiles: { all: 'candy' },      // 或 top/side/bottom/front
  solid: true,                  // 默认 true
  transparent: false,
  cross: false,                 // 十字植物面片
  short: false,
  glow: false,
  liquid: false,
  ore: false,
  machine: null,                // 只能填本体已有机器类型，否则无行为/模型
  drops: [{ item: 'candy', n: 1, chance: 1 }]
}
```

物品（`ITEMS`）：

```js
{
  name: '糖果', cat: 'mat',     // res/mat/blk/mach/tool
  stack: 250, price: 8, desc: '...',
  iconBlock: 'candy',           // 用方块贴图生成图标
  iconFn: 'carbon',             // 或复用本体程序图标
  block: 'candy'                // 可放置方块物品必须写
}
```

## 6. 调试与发布

1. 本地起服：`python3 -m http.server 8080`，打开 `http://localhost:8080`。
2. 开发时可在模组脚本末尾保留 `console.log`，DevTools 里
   `sourceURL` 显示为 `pcmod://<id>/main.js`，可打断点。
3. 面板顶部会显示 `bootErrors`；脚本抛错只影响该模组，不拖垮游戏。
4. 模组系统集成测试：`node tests/mods.js`（真实 Chromium 安装、
   注册、钩子、贴图、世界方块、重载持久化一条龙）。
5. 运行回归门禁：`node tests/preview.js`（桌面 / 平板 / 手机截图）。
6. 发布包：把 `mod.json + main.js + textures/` 打成 ZIP，扩展名改为
   `.pcmod` 即可。
7. 资源改动后执行 `node tools/version.js refresh`，正式发版前
   `node tools/version.js bump patch|minor|major`。

## 7. 已知边界

- 方块 id 为 Uint8 存档格式，模组方块共用 128~255（最多 128 个）。
- 自定义 `machine` 类型不会自动获得工厂行为；请复用现有
  `furnace/miner/belt/assembler/...` 类型并只换贴图。
- 卸载模组后，旧存档里对应方块 id 保留但渲染为未知/空气，物品与配方
  会消失；重装同 id 模组可恢复。
- 云存档只同步存档数据，不同步模组文件；跨设备读模组存档请先装齐模组。
- 模组钩子无法覆盖已初始化模块的内部闭包；深度改逻辑请直接改本体或
  使用数据驱动字段（价格、配方、作物、词条、任务、交易）。
