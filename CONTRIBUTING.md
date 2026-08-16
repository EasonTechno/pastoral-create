# Contributing Guide

感谢你参与 **Pastoral Create（发条农庄）**。在提交任何改动前，请先阅读 **[MAINTENANCE.md](./MAINTENANCE.md)** 的发布红线，它定义了能提交/绝不能提交的内容。

## 环境与运行

纯原生 JS + vendored Three.js，**无构建系统、无 package.json**：

```bash
# 本地起服
python3 -m http.server 8000
```

## 改动规范

- 保持现有编码风格：每个模块是 IIFE 单例，暴露一个全局（Game / World / UI / Tex / Icons / Factory / Mods ...），直接编辑源码。
- 开发模组请参考 `docs/mods.md`（打包用 `tools/pack-mod.sh`）；新增工业方块参考 `docs/blocks.md`；光影参考 `docs/graphics.md`。
- 提交信息使用短前缀（`mods:` `graphics:` `blocks:` `save:` `fix:` `chore:`），一条 commit 只做一件事。
- 默认分支为 `main`（本地 `master` 推送为 `main`，见 `tools/push-github.sh`）。

## 改动静态资源后

```bash
node tools/version.js refresh     # 重新生成所有 ?v= 缓存键
```

## 发布新版本

```bash
node tools/version.js bump patch|minor|major
node tools/version.js refresh
```

## 提交前自查（红线，必读）

详见 `MAINTENANCE.md` 第 5.3 节，至少确认：

- [ ] GitHub 推送中没有 `assets/textures/` 下的第三方贴图（PNG/JPG/GIF）（本地线上目录 `/opt` 可保留材质包用于网页体验）
- [ ] 没有 20MB 的 `MapleMono-NF-CN-Medium.ttf`
- [ ] 没有 token / 密钥 / `.env`
- [ ] 没有 `server/data/*.json` 真实数据
- [ ] 没有 `node_modules/`、`tool-output/`、`.rollback/`、`.agents/`、`.dsh-vision-toolkit/`
- [ ] 不修改根 `README.md`（它由远端原始内容维护）
- [ ] 改过 css/js/静态资源后跑过 `version.js refresh`

## 推送前必做

```bash
bash tools/check-redlines.sh   # 红线预检（不通过会阻止推送）
./tools/push-github.sh         # 一键推送（内部先跑红线预检）
bash tools/sync-prod.sh        # 一键同步本地线上目录 /opt（也先跑红线预检）
```

## CI

GitHub Actions（`.github/workflows/redline.yml`）会在每次 push/PR 自动跑 `tools/check-redlines.sh`，红线不通过会失败并阻止合并。

## 测试

```bash
node tests/mods.js        # 模组系统集成测试
node tests/preview.js     # 多端预览/稳定性门禁
```
