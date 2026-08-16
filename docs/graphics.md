# 图形 / 光影设置

画面设置（`Esc → 画面设置`）新增四组光影开关，均持久化到
`localStorage["starforge_settings"]`：

| 开关 | 说明 | 默认 |
| --- | --- | --- |
| 环境氛围光 | `自动`：随昼夜自动；`增强`：暖色氛围 + 环境/半球光强度 ×1.2 | 自动 |
| 水面反射 | `开`：给水面加一张程序化天空反射贴图，并提升透明度层次感 | 开 |
| 光追增强 | `开`：近似“光追”渲染——ACES 电影调色 + 更高曝光 + 饱和度/对比/亮度后期，视觉更通透（是真光线追踪的近似实现，移动端慎用） | 关 |
| 柔和阴影 | `开`：PCFSoft 软阴影；`关`：PCF 硬阴影（更省） | 开 |

实现要点（`js/main.js`）：

- `applySettings()` 根据 `settings.rtx / waterReflect / softShadow / lightFx`
  调整 `renderer.toneMapping / exposure`、`shadowMap.type / shadow.radius`、
  水面材质 `envMap / opacity` 及增强光强度。
- 水面反射使用 `THREE.CubeTexture` 生成一张 64×64 程序化天空贴图，廉价近似。
- “光追增强”是美术阶近似（ACES + 后期），不引入真实 BVH 光追，保证在现有
  WebGL/vendored Three.js 下稳定运行。
