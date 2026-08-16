# 发条农庄 · Pastoral Create

> 在异星开垦田园：播种、选育显隐基因作物、经营集市与工业自动化。

**Pastoral Create（发条农庄）** 是一款运行在浏览器里的体素种田 + 工厂自动化游戏。你将在异星球上开垦土地、种植并选育拥有显隐性基因的作物、搭建传送带与自动化流水线，再把自己的收获拿去集市经营。

纯原生 JavaScript + 内置（vendored）Three.js，**无构建系统、无 package.json**，任意静态文件服务器即可运行。

---

## 🖥 线上 Demo

- **地址：** https://game.imnzak.cn
- **说明：** 线上是一个可玩的公开 Demo（PWA，支持离线缓存、可安装到桌面/手机）。

> ⚠️ **Demo 服务说明（重要）**
> - 云存档每人提供 **10MB 存档空间**，超出后可能无法正常保存或同步。
> - 该 Demo 为**研究与体验用途**，服务可能**不稳定**（包括但不限于：偶发报错、存档丢失、接口波动、随时下线）。**请勿**将重要进度只存放在线上 Demo 的云端账号中——本地存档永远是第一优先。
> - Demo 域名与云存档后端仅用于演示，不代表该项目对其稳定性做出任何承诺。

---

## ✨ 特性

- 🧱 **无缝体素星球**：无限大陆、稀疏存档、区块流式生成。
- 🌾 **种田育种**：种植小麦/土豆/胡萝卜/甜菜/南瓜/浆果，不同生长阶段，显隐性基因选育。
- 🏭 **工业自动化**：矿机、熔炉、传送带、装配机、精炼厂、太阳能、反应堆、箱柜与电力网络。
- 🛒 **集市经营**：把产物卖掉、进货，管理经济系统。
- 🔧 **可增强**：内置材质包导入系统，玩家可自行导入材质包 / PNG 贴图。
- 🧩 **可模组化**：支持 `.pcmod` / `.zip` 模组包（自定义方块、物品、贴图、脚本），见 [docs/mods.md](./docs/mods.md)。
- 📱 **全设备适配**：桌面（鼠标/键盘）、手机横屏（虚拟摇杆 + 上下文按钮 + 触屏工具栏）、平板。
- ☁️ **云存档**：Node 后端，账号 + 多槽位云端同步（每人 10MB，见上方说明）。
- 🧩 **PWA**：离线可用、可安装。

---

## 📸 游戏截图

| 启动界面 | 游戏主画面 |
|---|---|
| ![boot](screenshots/boot.png) | ![gameplay](screenshots/gameplay.png) |

| 背包界面 | 画面设置 | 手机竖屏 |
|---|---|---|
| ![inventory](screenshots/inventory.png) | ![settings](screenshots/settings.png) | ![mobile](screenshots/mobile.png) |

> 截图来自带完整贴图的版本（线上 Demo 用材）。更多说明见 [screenshots/README.md](./screenshots/README.md)。

---

## 🚀 本地运行

无需任何构建步骤，使用任意静态文件服务器托管根目录即可：

```bash
# 任选其一
python3 -m http.server 8000
npx serve .
php -S 0.0.0.0:8000
```

然后浏览器打开 <http://localhost:8000>。

### 快速验证

```bash
# 用 Playwright 多端预览/稳定性门禁（开发用，需 node + playwright）
node tests/preview.js
```

### 版本与缓存键

```bash
node tools/version.js            # 查看当前版本与所有资源缓存键
node tools/version.js refresh    # 改动静态资源后刷新 ?v= 缓存键
node tools/version.js bump patch # 发布前升版本
```

---

## ☁️ 云存档后端

`server/` 是一个零依赖的 Node 云存档 API（无需 npm install），本地运行：

```bash
PORT=17890 DATA_DIR=/var/lib/pastoral-create node server/server.js
```

前端会自动把 `/api/` 请求发往当前站点；生产环境可用 nginx 将 `/api/` 反向代理到该端口。

---

## 🧩 模组开发（Mod）

游戏支持通过 `.pcmod` / `.zip` 模组包扩展（自定义方块、物品、配方、任务、贴图与脚本钩子）。

- **完整开发文档**：[docs/mods.md](./docs/mods.md)
- **开箱即用的示例模组**：[docs/example-mod](./docs/example-mod/)（「荧光砖与萤石粉」，演示方块/物品/配方/任务/钩子）
  ```bash
  cd docs/example-mod && zip -r ../../glowing_brick.pcmod mod.json main.js README.md
  ```
  然后在游戏「📦 模组管理」安装即可。

---

## 🎨 关于游戏素材（Texture）

> ⚠️ **重要：本仓库不随源码分发第三方材质包贴图。**

**线上 Demo（https://game.imnzak.cn）使用**：**Whimscape**（物品/部分方块）+ **PureEdge**（方块）+ **Pastoral**（作物）三套 MC 材质包。
这三套材质**仅用于 Demo 本地运行**，授权**不允许随开源仓库再分发**：

| 材质包 | Demo 中用途 | 授权 | 能否随仓库分发 |
|--------|------|------|--------|
| **Whimscape** | 物品与方块 | All Rights Reserved（保留所有权利） | ❌ 不能 |
| **PureEdge** | 方块 | 需署名 + 不允许作为自己的作品再发布 | ❌ 不能 |
| **Pastoral** | 作物 | CC BY-NC-SA 4.0（非商业 + 相同方式共享） | ⚠️ 仅非商业 |

因此**本仓库的 `assets/textures/` 下不包含任何材质包贴图**，仓库源码以 **MIT** 协议开源（仅游戏代码与自绘图标/字体）。游戏内置了**优雅降级**机制：缺少贴图时会显示中性「缺失贴图」占位，并且不会导致游戏崩溃。

### 如何获得完整贴图体验

1. **自己下载任意合法的 MC 材质包**（推荐原版/高清版、Faithful、Bare Bones 等，可自行获取；见 `assets/textures/README.md`）。
2. 用游戏内置**材质导入系统**（设置面板 → 导入 PNG / zip）即可，无需把贴图放进本仓库。
3. 进阶玩法：可用 **MC 材质包转换方法**把任意 Minecraft 资源包转成游戏能用的贴图集合（完整文件名映射见 `assets/textures/README.md`）。

> 游戏通过 **PNG 文件名**识别贴图（`grass_block_top`、`diamond_pickaxe`、`potatoes_stage0`…），
> 大多与原版 Minecraft 命名一致，因此原版/高清材质几乎**零改动**即可导入。
> 完整指南与映射表：见 [assets/textures/README.md](./assets/textures/README.md)。

---

## 📜 许可证

- **游戏代码**（`js/`、`css/`、`index.html` 等）：**MIT License**，见 [LICENSE](./LICENSE)。
- **字体**（`assets/fonts/` Maple Mono）：**SIL Open Font License 1.1**，见 [assets/fonts/OFL.txt](./assets/fonts/OFL.txt)。
- **第三方素材**（纹理贴图、三维模型）：**不属于 MIT 范围**，各有其独立授权，见 [ASSETS_LICENSE.md](./ASSETS_LICENSE.md)。
  - `js/models.js` 内嵌的 3D 模型来自 Kenney / Quaternius 等 **CC0 公共领域**资源。

---

## 🤝 参与贡献

欢迎提交 Issue、PR 或想法。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

本项目为开发者研究/学习用途的公开 Demo；云端服务（game.imnzak.cn）不承诺稳定性，请勿将线上 Demo 作为生产环境依赖。
