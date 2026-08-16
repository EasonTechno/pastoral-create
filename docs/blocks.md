# 工业方块扩展

新增 6 个工业方块，全部复用已配齐的材质包贴图（PureEdge 方块 / Whimscape 物品图标），
无需额外贴图文件即可正常显示。

| 方块 | 类型 | 用途 | 贴图 |
| --- | --- | --- | --- |
| 铸造炉 foundry | 机器(furnace) | 升级熔炉，冶炼更快（1.35×） | metal_dark + furnace_front |
| 精炼熔炉 smelter | 机器(furnace) | 高效精炼金属（1.6×） | metal + furnace_front |
| 加固箱 iron_box | 机器(chest) | 24 格加固存储 | metal + vent |
| 通风管道 vent_pipe | 装饰方块 | 工业管道 | vent |
| 电缆卷 cable_spool | 装饰方块 | 工业建材 | copper_block |
| 工业灯板 light_panel | 发光方块 | 照亮夜班 | lamp_on + glow |

对应物品、配方与集市交易均已加入：

- 配方全部在手工/装配机（`both`）可合成；铸造炉/精炼熔炉需先研究「冶金学」。
- 集市可交易通风管道、电缆卷与工业灯板。
- 机器方块复用现有 `furnace` / `chest` 行为，无需新增工厂逻辑。

> 注：同类型机器（furnace/chest）在存档恢复时按类型匹配，会优先还原为基础机型外观，但功能一致。

> 铸造炉/精炼熔炉的冶炼速度由 `BLOCKS[].speed` 控制（默认 1），`factory.js` 在燃烧进度中按该倍率加速。
