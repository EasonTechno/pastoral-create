# Maintenance Guide（维护 / 发布红线）

本文档面向仓库维护者 / 协作者，说明本仓库的发布边界：什么能提交、什么绝不能提交、哪些文件不要手动改。遵守这些红线，才能让项目长期干净、合法、可维护。

## 1. 一句话红线

本仓库只包含：纯原生 JS 游戏代码 + 自绘图标/字体 + 文档 + 截图，且都在 MIT（或独立明确授权）下。绝不把受版权限制的素材、内部工具、私人信息、大体积非必要文件提交进仓库。

## 2. ✅ 什么能传（允许提交）

| 类别 | 说明 |
| --- | --- |
| 游戏源码 | `js/*.js`、`css/style.css`、`index.html`、`offline.html`、`sw.js`、`manifest.json` |
| 自绘图标 | `assets/icons/*.png`（icon-180/192/512、game-icon） |
| 字体子集 | `assets/fonts/*.woff2`（Maple Mono，OFL 许可，附 OFL.txt） |
| 云存档后端 | `server/server.js`、`server/README.md`（不含 `server/data/*.json` 真实数据） |
| 文档 | `README.md`、`CONTRIBUTING.md`、`MAINTENANCE.md`、`LICENSE`、`ASSETS_LICENSE.md`、`docs/*`、`assets/textures/README.md` |
| 示例模组 | `docs/example-mod/*`（纯示例代码，无版权问题） |
| 游戏截图 | `screenshots/*.png`（但注意截图里可能带第三方材质贴图，见第 6 节） |
| 开发工具 | `tools/version.js`、`tests/preview.js`（纯脚本，无隐私） |
| 版本信息 | `version.json` |

## 3. ❌ 什么绝对不能传（禁止提交）

### 3.1 版权红线（最重要）

- 任何第三方材质包贴图：`assets/textures/` 下只允许 `README.md` 和说明文件，禁止放入任何 PNG 贴图。
- 尤其 **Whimscape / PureEdge / Pastoral** 的贴图严禁上传（授权不允许再分发）。
- 不要通过 PR / 提交向仓库添加贴图文件。玩家自行下载、自行导入，仓库不携带。

### 3.2 隐私 / 凭据

- Token、密钥、密码、API Key：任何 token/secret/key/`.env` 内容。
- 私人域名 / 部署配置：`deploy/`、含内网 IP、私人域名（如 `game.imnzak.cn` 的 nginx 配置）不要提交。
- 云存档真实数据：`server/data/*.json`（用户账号、存档），已被 gitignore，切勿强加。

### 3.3 内部工作区 / 工具产物

- `.agents/`、`.dsh-vision-toolkit/`、`.rollback/`、`agents.md`、`skills-lock.json`（内部开发配置）
- `tool-output/`（本机截图、预览产物、浏览器缓存、反馈数据）
- `node_modules/`（依赖，本项目无 package.json 不应出现）

### 3.4 大体积 / 非必要文件

- `assets/fonts/MapleMono-NF-CN-Medium.ttf`（20MB 完整字体，运行不需要，只用 woff2 子集）
- 临时文件、压缩包、`.local` 存档、日志 `*.log`

## 4. 🚫 哪些文件不要手动改（会被工具覆盖 / 属于生成物）

| 文件 | 原因 |
| --- | --- |
| `version.json` | 版本号单一来源，由 `node tools/version.js` 维护，禁止手改 |
| `index.html` 的 `<meta name="game-version">` | 由 `tools/version.js` 与 `version.json` 同步，禁止单独手改 |
| 所有资源 `?v=` 缓存键 | 由 `node tools/version.js refresh` 自动生成（文件内容 SHA-1 前 8 位），手写会吃旧缓存 |
| `js/three.min.js`、`js/GLTFLoader.js`、`js/SVGLoader.js` | vendored 第三方库，升级请走正规渠道 |
| `js/models.js` | ~11MB 自动生成的模型数据（base64），由外部 CC0 模型打包而来，不要手编 |
| `sw.js` 缓存代号 | 由 `node tools/version.js bump major` 自动升代，别手改 |

## 5. 🔧 维护时必须遵守的工作流

### 5.1 改动静态资源后

```bash
node tools/version.js refresh   # 重新生成所有 ?v= 缓存键
```

### 5.2 发布版本

```bash
node tools/version.js bump patch|minor|major   # 同步 version.json 与 meta
node tools/version.js refresh                  # 再刷新缓存键
```

### 5.3 提交前自查清单

- [ ] 没有 `assets/textures/` 下的 PNG 贴图
- [ ] 没有 `server/data/*.json`
- [ ] 没有 `.env` / token / 密钥
- [ ] 没有 `node_modules/`、`tool-output/`、`.rollback/` 等
- [ ] 没有 20MB 的 `MapleMono-NF-CN-Medium.ttf`
- [ ] 改过 css/js/静态资源后跑过 `version.js refresh`
- [ ] `git status` 里没有意外文件

## 6. 截图使用注意事项

`screenshots/*.png` 是用带第三方材质包贴图的版本截的。它们可以留在仓库做展示，但：

- 截图里出现的贴图素材归属第三方，不要在别处单独二次分发这些贴图本身。
- 新增截图前先确认画面里没有私人信息 / 不该出现的东西。

## 7. 云存档说明（对外一致）

线上 Demo（game.imnzak.cn）云存档每人 10MB、服务不稳定，属已知特性。文档、README、宣传文案都要保持这一口径，避免误导用户。
