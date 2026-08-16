# 示例模组：荧光砖与萤石粉

这是发条农庄最小可安装模组，演示：

- `mod.json` 中声明方块、物品、配方、任务
- `main.js` 中使用 `Mods.addItem / addRecipe` 与 `blockMined / tick` 钩子
- 复用本体已有贴图（`amber` / `crystal`），无需打包 PNG

## 打包安装

```bash
cd docs/example-mod
zip -r ../glowing_brick.pcmod mod.json main.js README.md
```

在游戏「📦 模组管理」中选择生成的 `.pcmod` 安装即可。

> 方块贴图、作物等进阶用法见 `../mods.md`。
