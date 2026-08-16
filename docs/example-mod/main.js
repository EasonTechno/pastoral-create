// 严格模式下由模组运行时注入：Mods / PC / BLOCKS / ITEMS / RECIPES ...
'use strict';

// 1) 数据驱动内容：方块与物品已经在 mod.json 的 data 中声明。
//    这里再演示脚本 API 注册一个额外物品。
Mods.addItem('glow_sack', {
  name: '萤石粉袋',
  cat: 'mat',
  iconBlock: 'crystal',
  stack: 100,
  price: 45,
  desc: '把 4 份萤石粉打包，卖个更好的价钱。'
});

Mods.addRecipe({
  id: 'glow_sack_recipe',
  out: { glow_sack: 1 },
  in: { glow_dust: 4, carbon: 2 },
  where: 'both',
  time: 2.5
});

// 2) 生命周期钩子：挖掉任意发光方块时，额外给玩家一点萤石粉作为彩蛋。
Mods.on('blockMined', e => {
  if (!PC.game || !e.def || !e.def.glow) return;
  PC.player.addItem('glow_dust', 1, true);
});

// 3) 每帧钩子示例（默认不做事，避免无意义开销）。
Mods.on('tick', (dt, ctx) => {
  // ctx: { state, dayTime, dayCount, playTime, camera, camTarget, player }
});
