/* ============================================================
   STARFORGE - world.js
   无限体素星球：按需区块生成 / 流式加载 / 稀疏存档
   ============================================================ */
'use strict';

// ---------- 2D 值噪声 ----------
function makeNoise(seed){
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--){ const j = (rnd() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  function fade(t){ return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad2(h, x, y){
    switch (h & 3){ case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; }
  }
  function n2(x, y){
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grad2(perm[a], x, y), grad2(perm[b], x - 1, y), u),
      THREE.MathUtils.lerp(grad2(perm[a + 1], x, y - 1), grad2(perm[b + 1], x - 1, y - 1), u), v);
  }
  function fbm2(x, y, oct = 4, lac = 2, gain = 0.5){
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++){ sum += n2(x * f, y * f) * amp; norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  return { n2, fbm2 };
}

// ============================================================
const World = (() => {
  const CHUNK = 16, WORLD_H = 64, SEA = 20;
  const CHUNK_CELLS = CHUNK * CHUNK * WORLD_H;
  let GEN_R = 17, MESH_R = 16, UNLOAD_R = 19;    // 区块半径（切比雪夫，可被设置调整）：实际渲染 MESH_R 区块
  let shadowsOn = false;                          // 高画质：区块网格参与阳光阴影
  const farHoleU = { r0: { value: 158 * 158 }, r1: { value: 248 * 248 } };   // 远景挖空半径²（随视距联动）
  function setViewDist(n){
    MESH_R = n;
    GEN_R = n + 1;
    UNLOAD_R = n + 3;
    const r1 = n * 16 - 8, r0 = Math.max(56, r1 - 90);
    farHoleU.r0.value = r0 * r0;
    farHoleU.r1.value = r1 * r1;
  }
  function setShadows(on){
    shadowsOn = !!on;
    for (const c of chunks.values()){
      if (c.mesh){ c.mesh.castShadow = shadowsOn; c.mesh.receiveShadow = shadowsOn; }
    }
    if (farMesh) farMesh.receiveShadow = shadowsOn;
  }

  let chunks = new Map();       // "cx,cz" -> {cx,cz,data,mesh,waterMesh,dirty,modified}
  let savedMods = null;         // 存档中被修改过的区块 {key: rle}
  let group = null;
  let noise = null, biome = null, seed = 0;
  let planetBiome = null;       // 星球主群系（lush 星球启用区域混合）
  let farmCore = null;          // 出生农庄中心（lush 核心，出生地保持现状）
  const LUSH_CORE = 256;        // lush 核心半径（格）
  const NO_BEACH_KEYS = ['sand','basalt','ash','salt','obsidian','rust','hive','amber'];
  function biomeAt(x, z){
    if (!planetBiome || planetBiome.grass !== 'grass') return biome;   // 非 lush 星球保持单一群系
    if (!farmCore) return biome;
    const dx = x - farmCore.x, dz = z - farmCore.z;
    if (dx * dx + dz * dz < LUSH_CORE * LUSH_CORE) return BIOMES.lush;
    const n = noise.n2(x * 0.0032, z * 0.0032);   // 低噪自然混杂：沙漠约 40%
    return n < -0.12 ? BIOMES.desert : BIOMES.lush;
  }

  const solidMat = new THREE.MeshLambertMaterial({ map: Tex.texture, vertexColors: true, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide });
  const waterMat = new THREE.MeshLambertMaterial({ map: Tex.texture, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const crossMat = new THREE.MeshLambertMaterial({
    map: Tex.texture, vertexColors: true, transparent: false, alphaTest: 0.4,
    side: THREE.DoubleSide, depthWrite: true,
  });
  let detailLOD = false;          // 拉远时省略十字面片/镂空树叶
  let fadeAboveY = Infinity;      // Y 阈值：高于此值的方块虚化
  const fadeU = { y: { value: 10000 } };
  let viewMask = null;            // {dir: 1|-1, axis: 'x'|'z', cut: n} 剖面视图掩码

  // 原版风格材质包的草/树叶贴图是灰色底，需要像 Minecraft 一样做生物群系染色
  const TILE_TINTS = {
    grass_top: [0.62, 1.02, 0.46],
    leaves: [0.66, 1.10, 0.50],
  };

  // ---------- 星球曲率（顶点着色器弯曲：高空/太空视角地形贴合球面，落地渐平）----------
  // 体素坐标下星球曲率半径恒为 1/0.004 = 250 格
  // 注：近全透明像素（边缘淡出环外圈/淡入首帧/皮肤 160 格外区块）必须 discard——
  // 它们不显色却写深度，会沿区块边缘把太空侧后绘的大气层/云壳裁出碎片状缺口
  const curveU = { amt: { value: 0 }, cx: { value: 0 }, cz: { value: 0 }, fade: { value: 1 }, grow: { value: 1 }, edgeR: { value: 9999 } };
  // 方块边缘柔光（Shine 式）：与视线方向夹角大的表面叠一层暖白高光
  const rimU = {
    dir: { value: new THREE.Vector3(0, -1, 0) },
    strength: { value: 0.5 },
  };
  // 作物交叉面朝向剔除：固定 45° 等距视角下总有一片面恰好侧对相机，
  // 会在作物中心退化成一条细线；这里按相机水平朝向在片元里裁掉侧对相机的面。
  const crossPlaneU = {
    horiz: { value: new THREE.Vector2(1, 0) },
    enabled: { value: 1 },
  };
  function setRimDir(dir){ rimU.dir.value.copy(dir); }
  function setRimStrength(v){ rimU.strength.value = v; }
  function setCrossCam(hx, hz, on){
    crossPlaneU.horiz.value.set(hx, hz);
    crossPlaneU.enabled.value = on ? 1 : 0;
  }
  // 地表扫描脉冲（NMS 式）：青色波前光环贴地扫过地形，身后拖曳渐隐全息网格
  // 注入所有地形材质（区块/水面/远景模拟地形），自动贴合方块起伏与曲率
  const scanPU = { r: { value: -1e9 }, cx: { value: 0 }, cz: { value: 0 }, a: { value: 0 } };
  function setScanPulse(r, cx, cz, a){
    scanPU.r.value = r;
    scanPU.cx.value = cx;
    scanPU.cz.value = cz;
    scanPU.a.value = a;
  }
  function applyCurve(mat, extra){
    const ex = extra || {};
    mat.onBeforeCompile = shader => {
      shader.uniforms.uCurveAmt = curveU.amt;
      shader.uniforms.uCurveCX = curveU.cx;
      shader.uniforms.uCurveCZ = curveU.cz;
      shader.uniforms.uCurveFade = curveU.fade;
      shader.uniforms.uCurveGrow = curveU.grow;
      shader.uniforms.uCurveEdge = curveU.edgeR;
      shader.uniforms.uScanR = scanPU.r;
      shader.uniforms.uScanCX = scanPU.cx;
      shader.uniforms.uScanCZ = scanPU.cz;
      shader.uniforms.uScanA = scanPU.a;
      shader.uniforms.uRimDir = rimU.dir;
      shader.uniforms.uRimStrength = rimU.strength;
      shader.uniforms.uFadeY = fadeU.y;
      if (ex.crossCull){
        shader.uniforms.uCrossHoriz = crossPlaneU.horiz;
        shader.uniforms.uCrossOn = crossPlaneU.enabled;
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uCurveAmt;\nuniform float uCurveCX;\nuniform float uCurveCZ;\nuniform float uCurveGrow;\nvarying float vEdgeR2;\nvarying vec2 vScanXZ;\nvarying vec3 vRimNormal;\nvarying float vFadeY;\n' + (ex.vCommon || ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{\n  vFadeY = transformed.y;\n  vRimNormal = normalize(mat3(modelMatrix) * objectNormal);\n  transformed.y = 16.0 + (transformed.y - 16.0) * uCurveGrow;\n  float _cdx = transformed.x - uCurveCX;\n  float _cdz = transformed.z - uCurveCZ;\n  vEdgeR2 = _cdx * _cdx + _cdz * _cdz;\n  vScanXZ = transformed.xz;\n  transformed.y -= uCurveAmt * (_cdx * _cdx + _cdz * _cdz) * 0.002;\n}\n' + (ex.vBegin || ''));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uCurveFade;\nuniform float uCurveEdge;\nuniform float uScanR;\nuniform float uScanCX;\nuniform float uScanCZ;\nuniform float uScanA;\nuniform vec3 uRimDir;\nuniform float uRimStrength;\nuniform float uFadeY;\nvarying float vEdgeR2;\nvarying vec2 vScanXZ;\nvarying vec3 vRimNormal;\nvarying float vFadeY;\n' + (ex.fCommon || ''))
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.a *= uCurveFade * smoothstep(0.0, 3600.0, uCurveEdge * uCurveEdge - vEdgeR2);\n  gl_FragColor.a *= 1.0 - smoothstep(uFadeY, uFadeY + 6.0, vFadeY);\n{\n  float _sd = length(vScanXZ - vec2(uScanCX, uScanCZ)) - uScanR;\n  float _bk = -_sd;\n  float _trail = smoothstep(0.0, 6.0, _bk) * (1.0 - smoothstep(10.0, 55.0, _bk));\n  vec2 _gv = abs(fract(vScanXZ * 0.125) - 0.5);\n  float _grid = smoothstep(0.40, 0.5, max(_gv.x, _gv.y));\n  gl_FragColor.rgb += vec3(0.13, 0.86, 0.9) * (exp(-_sd * _sd * 0.018) + _grid * _trail * 0.5) * uScanA;\n}\n  vec3 _rn = normalize(vRimNormal);\n  vec3 _rd = normalize(uRimDir);\n  float _rim = pow(max(0.0, 1.0 - abs(dot(_rn, _rd))), 2.0);\n  float _rimSide = max(0.0, 1.0 - abs(_rn.y));\n  gl_FragColor.rgb += vec3(1.0, 0.98, 0.9) * _rim * _rimSide * uRimStrength;\n' + (ex.fFrag || '') + '\n  if (gl_FragColor.a < 0.04) discard;');
    };
    mat.customProgramCacheKey = () => ex.crossCull ? 'curve3cross' : 'curve3';
  }
  applyCurve(solidMat);
  applyCurve(waterMat);
  applyCurve(crossMat, {
    crossCull: true,
    vCommon: 'attribute vec3 aPlane;\nvarying vec3 vPlane;',
    vBegin: '  vPlane = normalize(mat3(modelMatrix) * aPlane);',
    fCommon: 'uniform vec2 uCrossHoriz;\nuniform float uCrossOn;\nvarying vec3 vPlane;',
    fFrag: '  if (uCrossOn > 0.5 && abs(vPlane.x * uCrossHoriz.x + vPlane.z * uCrossHoriz.y) < 0.28) discard;',
  });

  function setFadeAbove(y){
    fadeAboveY = y === null || y === undefined ? 10000 : y;
    fadeU.y.value = fadeAboveY;
    const active = fadeAboveY < 64;
    solidMat.transparent = active;
    solidMat.alphaTest = active ? 0 : 0.4;
    solidMat.depthWrite = !active;
    solidMat.needsUpdate = true;
    crossMat.transparent = active;
    crossMat.alphaTest = active ? 0 : 0.4;
    crossMat.depthWrite = !active;
    crossMat.needsUpdate = true;
  }
  function setCurve(amt, cx, cz, fade, grow, edgeR){
    curveU.amt.value = amt;
    curveU.cx.value = cx;
    curveU.cz.value = cz;
    curveU.fade.value = fade === undefined ? 1 : fade;
    curveU.grow.value = grow === undefined ? 1 : grow;
    curveU.edgeR.value = edgeR === undefined ? 9999 : edgeR;
  }

  const ckey = (cx, cz) => cx + ',' + cz;
  const lidx = (lx, y, lz) => (y * CHUNK + lz) * CHUNK + lx;
  const cf = v => Math.floor(v / CHUNK);

  // 确定性哈希随机（列/区块）
  function hash2(x, z, salt = 0){
    let h = (seed ^ salt) >>> 0;
    h = Math.imul(h ^ (x | 0), 374761393);
    h = Math.imul(h ^ (z | 0), 668265263);
    h = (h ^ (h >>> 13)) >>> 0;
    return mulberry32(h);
  }

  // ---------- 3D 值噪声（洞穴用） ----------
  function lattice3(x, y, z, salt){
    let h = (seed ^ salt) >>> 0;
    h = Math.imul(h ^ x, 374761393);
    h = Math.imul(h ^ y, 217645177);
    h = Math.imul(h ^ z, 668265263);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  function vnoise3(x, y, z, salt){
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const c000 = lattice3(ix, iy, iz, salt),     c100 = lattice3(ix + 1, iy, iz, salt);
    const c010 = lattice3(ix, iy + 1, iz, salt), c110 = lattice3(ix + 1, iy + 1, iz, salt);
    const c001 = lattice3(ix, iy, iz + 1, salt), c101 = lattice3(ix + 1, iy, iz + 1, salt);
    const c011 = lattice3(ix, iy + 1, iz + 1, salt), c111 = lattice3(ix + 1, iy + 1, iz + 1, salt);
    const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
    const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }
  // 洞穴判定：双噪声面交叉 = 隧道（类 MC 面条洞）+ 低频奶酪洞
  function isCave(wx, y, wz){
    const a = vnoise3(wx * 0.045, y * 0.075, wz * 0.045, 0xCAFE01);
    const b = vnoise3(wx * 0.045, y * 0.075, wz * 0.045, 0xCAFE02);
    if (Math.abs(a - 0.5) < 0.05 && Math.abs(b - 0.5) < 0.05) return true;    // 隧道
    const c = vnoise3(wx * 0.024, y * 0.045, wz * 0.024, 0xCAFE03);
    return c > 0.855;                                                          // 洞窟
  }

  // ---------- 基础存取 ----------
  function get(x, y, z){
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= WORLD_H) return 0;
    const c = chunks.get(ckey(cf(x), cf(z)));
    if (!c) return 0;
    return c.data[lidx(x - cf(x) * CHUNK, y, z - cf(z) * CHUNK)];
  }
  function getDef(x, y, z){ return BLOCK_BY_ID[get(x, y, z)] || BLOCKS.air; }
  function set(x, y, z, id, silent){
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= WORLD_H) return;
    const cx = cf(x), cz = cf(z);
    let c = chunks.get(ckey(cx, cz));
    if (!c) c = genChunk(cx, cz);
    c.data[lidx(x - cx * CHUNK, y, z - cz * CHUNK)] = id;
    c.modified = true;
    if (!silent){
      c.dirty = true;
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      const mark = (ax, az) => { const n = chunks.get(ckey(ax, az)); if (n) n.dirty = true; };
      if (lx === 0) mark(cx - 1, cz);
      if (lx === CHUNK - 1) mark(cx + 1, cz);
      if (lz === 0) mark(cx, cz - 1);
      if (lz === CHUNK - 1) mark(cx, cz + 1);
    }
  }
  function markDirty(x, y, z){
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= WORLD_H) return;
    const cx = cf(x), cz = cf(z);
    const c = chunks.get(ckey(cx, cz));
    if (!c) return;
    c.dirty = true;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const mark = (ax, az) => { const n = chunks.get(ckey(ax, az)); if (n) n.dirty = true; };
    if (lx === 0) mark(cx - 1, cz);
    if (lx === CHUNK - 1) mark(cx + 1, cz);
    if (lz === 0) mark(cx, cz - 1);
    if (lz === CHUNK - 1) mark(cx, cz + 1);
  }
  function rebuildAll(){
    for (const c of chunks.values()) c.dirty = true;
  }
  function inBounds(x, y, z){ return y >= 0 && y < WORLD_H; }

  // ---------- 地形生成 ----------
  function heightAt(wx, wz){
    let h = SEA - 4 + (noise.fbm2(wx * 0.012, wz * 0.012, 5) * 0.5 + 0.5) * 30;
    h += noise.fbm2(wx * 0.05, wz * 0.05, 3) * 3.5;
    // 大尺度大陆起伏
    h += noise.fbm2(wx * 0.003, wz * 0.003, 2) * 10;
    return Math.max(3, Math.min(WORLD_H - 8, h | 0));
  }
  function treeAt(wx, wz){
    const r = hash2(wx, wz, 0xABCD);
    const b = biomeAt(wx, wz);
    if (r() >= b.trees) return null;
    const h = heightAt(wx, wz);
    if (h <= SEA + (b.seaLift || 0)) return null;
    return { h, th: 4 + (r() * 3) | 0, rng: r };
  }

  // ---------- 结构物：宜居星球村庄 / 危险星球遗迹（种子确定性，跨区块安全） ----------
  let structures = [];   // {type:'village'|'ruin', x, z, kind, name, huts?, h, seed}
  function genStructures(){
    structures = [];
    if (!biome || !noise) return;
    const rnd = mulberry32((seed ^ 0x57A7C7) >>> 0);
    const SEAB = SEA + (biome.seaLift || 0);
    const onLand = (x, z) => heightAt(x, z) > SEAB + 1;
    if (!biome.haz){
      // 宜居星球：拓荒者村庄（若干木屋围绕村心灯柱）
      let want = 3;
      for (let t = 0; t < 70 && want > 0; t++){
        const x = ((rnd() * 1300) | 0) - 650;
        const z = ((rnd() * 440) | 0) - 220;
        if (!onLand(x, z)) continue;
        if (biomeAt(x, z) !== BIOMES.lush) continue;   // 村庄只在 lush 区
        if (structures.some(s => (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z) < 240 * 240)) continue;
        const huts = [];
        const n = 4 + ((rnd() * 3) | 0);
        for (let i = 0; i < n; i++){
          const a = i / n * Math.PI * 2 + rnd() * 0.7;
          const d = 8 + rnd() * 7;
          const hx = Math.round(x + Math.cos(a) * d), hz = Math.round(z + Math.sin(a) * d);
          if (!onLand(hx, hz)) continue;
          huts.push({ x: hx, z: hz, h: heightAt(hx, hz) });
        }
        if (huts.length < 3) continue;
        structures.push({ type: 'village', x, z, kind: 0, name: '拓荒者村落', huts, h: heightAt(x, z) });
        want--;
      }
      // 出生点：靠近世界原点找一块陆地，铺出带水源的初始农田
      let farmX = 0, farmZ = 0, farmH = 0;
      for (let t = 0; t < 200; t++){
        const a = rnd() * Math.PI * 2;
        const rad = 10 + rnd() * 60;
        const tx = Math.round(Math.cos(a) * rad), tz = Math.round(Math.sin(a) * rad);
        const gh = heightAt(tx, tz);
        if (gh > SEAB + 1){ farmX = tx; farmZ = tz; farmH = gh; break; }
      }
      farmCore = { x: farmX, z: farmZ };
      structures.push({ type: 'farm', x: farmX, z: farmZ, h: farmH });
    } else {
      // 危险星球：先民遗迹（三种形态）
      const names = ['先民石环', '哨戒方尖碑', '崩塌回廊'];
      let want = 3;
      for (let t = 0; t < 70 && want > 0; t++){
        const x = ((rnd() * 1300) | 0) - 650;
        const z = ((rnd() * 440) | 0) - 220;
        if (!onLand(x, z)) continue;
        if (structures.some(s => (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z) < 220 * 220)) continue;
        const kind = (rnd() * 3) | 0;
        structures.push({ type: 'ruin', x, z, kind, name: names[kind], h: heightAt(x, z), seed: (rnd() * 0xFFFF) | 0 });
        want--;
      }
    }
  }
  function sput(c, lx, y, lz, id){
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 1 || y >= WORLD_H) return;
    c.data[lidx(lx, y, lz)] = id;
  }
  function stampHut(c, x0, z0, hut){
    const s = 2;   // 5×5 小屋
    if (hut.x + s < x0 || hut.x - s >= x0 + CHUNK || hut.z + s < z0 || hut.z - s >= z0 + CHUNK) return;
    const f = hut.h + 1;   // 地板层
    const planksId = BLOCKS.planks.id, logId = BLOCKS.log.id, glassId = BLOCKS.glass.id;
    for (let dx = -s; dx <= s; dx++){
      for (let dz = -s; dz <= s; dz++){
        const wx = hut.x + dx, wz = hut.z + dz;
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) continue;
        // 地基填平 + 地板
        const gh = heightAt(wx, wz);
        for (let y = Math.min(gh, f - 1); y < f - 1; y++) sput(c, lx, y, lz, BLOCKS[biome.dirt].id);
        sput(c, lx, f - 1, lz, planksId);
        // 内部清空（顺带削平原地形/树木）
        for (let y = f; y <= f + 4; y++) sput(c, lx, y, lz, 0);
        const edge = Math.abs(dx) === s || Math.abs(dz) === s;
        const corner = Math.abs(dx) === s && Math.abs(dz) === s;
        if (edge){
          for (let y = f; y <= f + 2; y++) sput(c, lx, y, lz, corner ? logId : planksId);
          if (dx === 0 && dz === s){ sput(c, lx, f, lz, 0); sput(c, lx, f + 1, lz, 0); }   // 门
          if ((Math.abs(dx) === s && dz === 0) || (dx === 0 && dz === -s)) sput(c, lx, f + 1, lz, glassId);   // 窗
        }
        sput(c, lx, f + 3, lz, planksId);   // 屋顶
      }
    }
  }
  function stampVillageCenter(c, x0, z0, st){
    const lx = st.x - x0, lz = st.z - z0;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) return;
    const h = heightAt(st.x, st.z);
    for (let y = h + 1; y <= h + 2; y++) sput(c, lx, y, lz, BLOCKS.log.id);   // 村心灯柱
    sput(c, lx, h + 3, lz, BLOCKS.lamp.id);
  }
  function stampRuin(c, x0, z0, st){
    const R = 10;
    if (st.x + R < x0 || st.x - R >= x0 + CHUNK || st.z + R < z0 || st.z - R >= z0 + CHUNK) return;
    const stoneId = BLOCKS.stone.id, deepId = BLOCKS[biome.deep].id;
    for (let dx = -R; dx <= R; dx++){
      for (let dz = -R; dz <= R; dz++){
        const wx = st.x + dx, wz = st.z + dz;
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) continue;
        const gh = heightAt(wx, wz);
        const hr = hash2(wx, wz, st.seed);   // 逐列确定性（跨区块一致）
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (st.kind === 0){
          // 先民石环：立柱环 + 中央发光祭坛
          if (Math.abs(dist - 7) < 0.7 && hr() < 0.7){
            const hh = 2 + ((hash2(wx, wz, st.seed + 7)() * 3) | 0);
            for (let y = 1; y <= hh; y++) sput(c, lx, gh + y, lz, y === hh ? deepId : stoneId);
          } else if (dist < 1.6){
            sput(c, lx, gh + 1, lz, stoneId);
            if (dx === 0 && dz === 0) sput(c, lx, gh + 2, lz, BLOCKS.lamp.id);
          }
        } else if (st.kind === 1){
          // 哨戒方尖碑：三段收分的塔 + 顶端信标光
          const t0 = st.h;
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1){
            for (let y = t0 + 1; y <= t0 + 3; y++) sput(c, lx, y, lz, deepId);
            if (Math.abs(dx) + Math.abs(dz) <= 1)
              for (let y = t0 + 4; y <= t0 + 8; y++) sput(c, lx, y, lz, stoneId);
            if (dx === 0 && dz === 0){
              for (let y = t0 + 9; y <= t0 + 12; y++) sput(c, lx, y, lz, deepId);
              sput(c, lx, t0 + 13, lz, BLOCKS.lamp.id);
            }
          }
        } else {
          // 崩塌回廊：断墙矩形 + 散落地砖
          const inX = Math.abs(dx) <= 8, inZ = Math.abs(dz) <= 6;
          const edge = (Math.abs(dx) === 8 && inZ) || (Math.abs(dz) === 6 && inX);
          if (edge){
            const hh = (hr() * 4) | 0;   // 0~3：缺口断墙
            for (let y = 1; y <= hh; y++) sput(c, lx, gh + y, lz, hr() < 0.25 ? deepId : stoneId);
          } else if (inX && inZ && hr() < 0.3){
            sput(c, lx, gh, lz, stoneId);   // 残存地砖
          }
        }
      }
    }
  }
  function stampSpawnFarm(c, x0, z0, st){
    const y0 = st.h;
    const fx = st.x, fz = st.z;               // 农田内区原点
    const cx0 = fx - 9, cx1 = fx + 19;        // 空地范围
    const cz0 = fz - 6, cz1 = fz + 22;
    const dirtId = BLOCKS[biome.dirt].id, grassId = BLOCKS[biome.grass].id;
    // 整片空地削平：清掉树/草/水，填出齐平草地
    for (let lz = 0; lz < CHUNK; lz++){
      for (let lx = 0; lx < CHUNK; lx++){
        const wx = x0 + lx, wz = z0 + lz;
        if (wx < cx0 || wx > cx1 || wz < cz0 || wz > cz1) continue;
        const gh = heightAt(wx, wz);
        for (let y = y0 + 1; y < WORLD_H; y++) sput(c, lx, y, lz, 0);
        if (gh < y0){
          for (let y = gh + 1; y <= y0; y++) sput(c, lx, y, lz, y === y0 ? grassId : dirtId);
        } else {
          sput(c, lx, y0, lz, grassId);
        }
      }
    }
    // 农田本体：11×17，x=4 / x=6 两列水渠，外围一圈树桩
    for (let dz = -1; dz <= 17; dz++){
      for (let dx = -1; dx <= 11; dx++){
        const wx = fx + dx, wz = fz + dz;
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) continue;
        if (dx === -1 || dx === 11 || dz === -1 || dz === 17){
          sput(c, lx, y0, lz, BLOCKS.log.id);
        } else if (dx === 4 || dx === 6){
          sput(c, lx, y0, lz, BLOCKS.water.id);
        } else {
          sput(c, lx, y0, lz, BLOCKS.farmland.id);
        }
      }
    }
  }
  function stampStructures(c, x0, z0){
    for (const st of structures){
      if (st.type === 'farm'){ stampSpawnFarm(c, x0, z0, st); continue; }
      if (st.type === 'village'){
        for (const hut of st.huts) stampHut(c, x0, z0, hut);
        stampVillageCenter(c, x0, z0, st);
      } else stampRuin(c, x0, z0, st);
    }
  }

  function genChunk(cx, cz){
    const k = ckey(cx, cz);
    let c = chunks.get(k);
    if (c) return c;
    c = { cx, cz, data: new Uint8Array(CHUNK_CELLS), mesh: null, waterMesh: null, crossMesh: null, dirty: true, modified: false };
    chunks.set(k, c);

    // 存档区块直接还原
    if (savedMods && savedMods[k]){
      const rle = savedMods[k];
      let i = 0;
      for (let p = 0; p < rle.length; p += 2){
        c.data.fill(rle[p + 1], i, i + rle[p]);
        i += rle[p];
      }
      c.modified = true;
      markNeighborsDirty(cx, cz);
      return c;
    }

    const stoneId = BLOCKS.stone.id;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // 地层 + 水 + 花草 + 露头矿（逐列取区域群系）
    for (let lz = 0; lz < CHUNK; lz++){
      for (let lx = 0; lx < CHUNK; lx++){
        const wx = x0 + lx, wz = z0 + lz;
        const b = biomeAt(wx, wz);
        const grassId = BLOCKS[b.grass].id, dirtId = BLOCKS[b.dirt].id, deepId = BLOCKS[b.deep].id;
        const SEAB = SEA + (b.seaLift || 0);
        const noBeach = NO_BEACH_KEYS.includes(b.grass);
        const h = heightAt(wx, wz);
        const canCave = h > SEAB + 1;      // 近水岸不挖洞，避免悬空水
        for (let y = 0; y <= h; y++){
          let id;
          if (y === 0) id = BLOCKS.barrier.id;
          else if (y === h) id = (h < SEAB + 1 && !noBeach) ? BLOCKS.sand.id : grassId;
          else if (y > h - 3) id = dirtId;
          else if (y < 10) id = deepId;
          else id = stoneId;
          // 洞穴雕刻（保留地表 2 层与基岩）
          if (canCave && y >= 3 && y <= h - 3 && isCave(wx, y, wz)) id = 0;
          c.data[lidx(lx, y, lz)] = id;
        }
        if (h < SEAB && !b.dry && b.grass !== 'basalt'){
          for (let y = h + 1; y <= SEAB; y++) c.data[lidx(lx, y, lz)] = BLOCKS.water.id;
        }
        // 列级装饰（确定性）
        const cr = hash2(wx, wz, 0x51CA);
        const rv = cr();
        if (h > SEAB){
          if (rv < 0.0015){                                 // 地表矿露头
            const oid = cr() < 0.5 ? BLOCKS.iron_ore.id : BLOCKS.copper_ore.id;
            c.data[lidx(lx, h, lz)] = oid;
            if (cr() < 0.6 && h > 1) c.data[lidx(lx, h - 1, lz)] = oid;
          } else if (b.crystals && rv < 0.0015 + b.crystals){
            // 氚晶簇尖塔
            const ch = 1 + ((cr() * 3) | 0);
            for (let y = 1; y <= ch && h + y < WORLD_H; y++)
              c.data[lidx(lx, h + y, lz)] = BLOCKS.crystal.id;
          }
        }
      }
    }

    // 矿脉（区块内约束）
    const rng = hash2(cx, cz, 0x0DE5);
    const ores = [
      { id: BLOCKS.coal_ore.id, exp: 0.7, size: 8, yMin: 4, yMax: 40 },
      { id: BLOCKS.iron_ore.id, exp: 0.62, size: 7, yMin: 3, yMax: 34 },
      { id: BLOCKS.copper_ore.id, exp: 0.62, size: 7, yMin: 3, yMax: 34 },
      { id: BLOCKS.titanium_ore.id, exp: 0.26, size: 5, yMin: 2, yMax: 20 },
      { id: BLOCKS.gold_ore.id, exp: 0.17, size: 4, yMin: 2, yMax: 16 },
      { id: BLOCKS.uranium_ore.id, exp: 0.11, size: 4, yMin: 2, yMax: 12 },
    ];
    for (const ore of ores){
      const b8 = biomeAt(x0 + 8, z0 + 8);
      const expc = ore.exp * b8.oreMul;
      let n = Math.floor(expc) + (rng() < (expc % 1) ? 1 : 0);
      while (n-- > 0){
        let lx = (rng() * CHUNK) | 0, lz = (rng() * CHUNK) | 0;
        let y = ore.yMin + (rng() * (ore.yMax - ore.yMin)) | 0;
        const veinSize = 3 + (rng() * ore.size) | 0;
        for (let v = 0; v < veinSize; v++){
          if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK && y > 0 && y < WORLD_H){
            const cur = c.data[lidx(lx, y, lz)];
            if (cur === stoneId || cur === BLOCKS[b8.deep].id) c.data[lidx(lx, y, lz)] = ore.id;
          }
          lx += (rng() * 3 - 1) | 0; y += (rng() * 3 - 1) | 0; lz += (rng() * 3 - 1) | 0;
        }
      }
    }

    // 树 / 巨菌（含跨界树冠：检查扩展范围）
    for (let lz = -2; lz < CHUNK + 2; lz++){
      for (let lx = -2; lx < CHUNK + 2; lx++){
        const wx = x0 + lx, wz = z0 + lz;
        const t = treeAt(wx, wz);
        if (!t) continue;
        const { h, th, rng: tr } = t;
        if (biomeAt(wx, wz).mushroom){
          // 巨型蘑菇：菌柄 + 宽菌盖
          if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK){
            for (let y = 1; y <= th; y++)
              if (h + y < WORLD_H) c.data[lidx(lx, h + y, lz)] = BLOCKS.mush_stem.id;
          }
          for (let ox = -2; ox <= 2; ox++)
            for (let oz = -2; oz <= 2; oz++){
              if (Math.abs(ox) === 2 && Math.abs(oz) === 2) continue;   // 圆角
              const tx = lx + ox, tz = lz + oz, ty = h + th + 1;
              if (tx < 0 || tx >= CHUNK || tz < 0 || tz >= CHUNK || ty >= WORLD_H) continue;
              if (c.data[lidx(tx, ty, tz)] === 0) c.data[lidx(tx, ty, tz)] = BLOCKS.mush_cap.id;
            }
          // 顶心
          if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK && h + th + 2 < WORLD_H)
            c.data[lidx(lx, h + th + 2, lz)] = BLOCKS.mush_cap.id;
          continue;
        }
        // 树干
        if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK){
          for (let y = 1; y <= th; y++)
            if (h + y < WORLD_H) c.data[lidx(lx, h + y, lz)] = BLOCKS.log.id;
          if (h + th + 2 < WORLD_H) c.data[lidx(lx, h + th + 2, lz)] = BLOCKS.leaves.id;
        }
        // 树冠
        for (let ly = th - 1; ly <= th + 1; ly++)
          for (let ox = -2; ox <= 2; ox++)
            for (let oz = -2; oz <= 2; oz++){
              const dist = Math.abs(ox) + Math.abs(oz) + Math.abs(ly - th);
              if (dist > 3 || tr() < 0.15) continue;
              const tx = lx + ox, tz = lz + oz, ty = h + ly;
              if (tx < 0 || tx >= CHUNK || tz < 0 || tz >= CHUNK || ty >= WORLD_H) continue;
              if (c.data[lidx(tx, ty, tz)] === 0) c.data[lidx(tx, ty, tz)] = BLOCKS.leaves.id;
            }
      }
    }
    stampStructures(c, x0, z0);   // 村庄/遗迹（在植被之后压印，保证内部净空）
    markNeighborsDirty(cx, cz);
    return c;
  }
  function markNeighborsDirty(cx, cz){
    for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n = chunks.get(ckey(cx + ox, cz + oz));
      if (n && n.mesh) n.dirty = true;
    }
  }

  // ---------- 网格构建 ----------
  const FACES = [
    { dir: [1, 0, 0], corners: [[1,1,1],[1,0,1],[1,1,0],[1,0,0]], shade: 0.8 },
    { dir: [-1, 0, 0], corners: [[0,1,0],[0,0,0],[0,1,1],[0,0,1]], shade: 0.8 },
    { dir: [0, 1, 0], corners: [[0,1,1],[1,1,1],[0,1,0],[1,1,0]], shade: 1.0 },
    { dir: [0, -1, 0], corners: [[0,0,0],[1,0,0],[0,0,1],[1,0,1]], shade: 0.5 },
    { dir: [0, 0, 1], corners: [[0,1,1],[0,0,1],[1,1,1],[1,0,1]], shade: 0.65 },
    { dir: [0, 0, -1], corners: [[1,1,0],[1,0,0],[0,1,0],[0,0,0]], shade: 0.65 },
  ];
  function tileFor(def, faceIndex, x, y, z){
    const t = def.tiles;
    if (x !== undefined && y !== undefined && z !== undefined && window.Farm){
      const farmTile = Farm.tileFor(x, y, z, faceIndex);
      if (farmTile) return farmTile;
    }
    if (t.all && !t.top && !t.front) return t.all;
    if (faceIndex === 2) return t.top || t.all || t.side;
    if (faceIndex === 3) return t.bottom || t.all || t.side;
    if (faceIndex === 4 && t.front) return t.front;
    return t.side || t.all || t.top;
  }

  function buildChunkMesh(c){
    const fresh = !c.mesh && !c.waterMesh;   // 全新出现的区块（含卸载后回归）→ 淡入
    if (c.mesh){ group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    if (c.waterMesh){ group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); c.waterMesh = null; }
    if (c.crossMesh){ group.remove(c.crossMesh); c.crossMesh.geometry.dispose(); c.crossMesh = null; }
    const pos = [], nor = [], uv = [], col = [], ind = [];
    const wpos = [], wnor = [], wuv = [], wind = [];
    const xpos = [], xnor = [], xuv = [], xcol = [], xind = [], xpl = [];
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    c.lamps = null;   // 发光方块位置（点光源池取用）
    const opaque = (nDef) => nDef.solid && (!nDef.transparent || (detailLOD && nDef.key === 'leaves'));

    for (let y = 0; y < WORLD_H; y++){
      for (let lz = 0; lz < CHUNK; lz++){
        for (let lx = 0; lx < CHUNK; lx++){
          const id = c.data[lidx(lx, y, lz)];
          if (!id) continue;
          const def = BLOCK_BY_ID[id];
          if (def.machine) continue;
          const x = x0 + lx, z = z0 + lz;
          if (def.glow) (c.lamps || (c.lamps = [])).push([x, y, z]);
          if (def.cross){
            if (detailLOD) continue;
            const farmTile = (window.Farm && Farm.tileFor(x, y, z, 2)) || def.tiles.all;
            const t = Tex.uvRect(farmTile);
            const gb = def.glow ? 1.7 : 1;   // 发光植物全亮
            // 用 4 片真正穿过方块中心的竖直交叉面，角度间隔 45°。
            // 旧实现把面片错放到了方块边缘，导致作物在方块里明显偏移。
            // 作物底面略高于耕地顶面，避免共面 z-fighting 在贴图底部形成闪烁边缘线
            const y0 = def.short ? y + 0.04 : y + 0.03;
            const y1 = def.short ? y + 0.68 : y + 1;
            const half = def.short ? 0.34 : 0.46;
            const cx = x + 0.5, cz = z + 0.5;
            const quads = [];
            for (let i = 0; i < 4; i++){
              const a = (i * Math.PI) / 4;
              const tx = -Math.sin(a), tz = Math.cos(a);   // 面内水平方向
              const nx = Math.cos(a), nz = Math.sin(a);    // 面法线（用于朝向剔除）
              quads.push(
                cx + tx * half, y0, cz + tz * half,
                cx - tx * half, y0, cz - tz * half,
                cx - tx * half, y1, cz - tz * half,
                cx + tx * half, y1, cz + tz * half,
                nx, nz
              );
            }
            for (let q = 0; q < quads.length / 14; q++){
              const b = xpos.length / 3;
              const base = q * 14;
              for (let v = 0; v < 4; v++){
                const px = quads[base + v * 3], py = quads[base + v * 3 + 1], pz = quads[base + v * 3 + 2];
                xpos.push(px, py, pz);
                xnor.push(0, 1, 0);
                xpl.push(quads[base + 12], 0, quads[base + 13]);
                xcol.push(gb, gb, gb);
              }
              xuv.push(t.u0, t.v0, t.u1, t.v0, t.u1, t.v1, t.u0, t.v1);
              xind.push(b, b + 1, b + 2, b, b + 2, b + 3);
            }
            continue;
          }
          const isWater = def.liquid;
          for (let f = 0; f < FACES.length; f++){
            const face = FACES[f];
            const nDef = getDef(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
            if (isWater){
              if (nDef.id === def.id) continue;
              if (opaque(nDef)) continue;
            } else {
              if (opaque(nDef) && !nDef.cross && !nDef.machine) continue;
              if (nDef.id === def.id && def.transparent && !def.fancy) continue;
            }
            const tileName = tileFor(def, f, x, y, z);
            const t = Tex.uvRect(tileName);
            const tint = TILE_TINTS[tileName];
            const P = isWater ? wpos : pos, N = isWater ? wnor : nor, U = isWater ? wuv : uv, I = isWater ? wind : ind;
            const b = P.length / 3;
            for (const cnr of face.corners){
              let yy = y + cnr[1];
              if (isWater && cnr[1] === 1) yy -= 0.12;
              P.push(x + cnr[0], yy, z + cnr[2]);
              N.push(face.dir[0], face.dir[1], face.dir[2]);
              if (!isWater){
                // 竖直面上下棱边做明暗，形成像素方块棱角
                let s = face.shade * (def.glow ? 2.2 : 1);
                if (!def.glow && face.dir[1] === 0) s *= cnr[1] === 1 ? 1.22 : 0.82;
                else if (!def.glow && face.dir[1] === 1) s *= 1.04;
                if (tint) col.push(s * tint[0], s * tint[1], s * tint[2]);
                else col.push(s, s, s);
              }
            }
            U.push(t.u0, t.v1, t.u0, t.v0, t.u1, t.v1, t.u1, t.v0);
            I.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
          }
        }
      }
    }
    if (ind.length){
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(ind);
      g.computeBoundingSphere();
      g.boundingSphere.radius += 60;   // 曲率顶点位移的裁剪余量
      const m = new THREE.Mesh(g, solidMat);
      m.castShadow = shadowsOn;
      m.receiveShadow = shadowsOn;
      group.add(m);
      c.mesh = m;
      if (fresh) startFadeIn(m, solidMat, 1);
    }
    if (wind.length){
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      g.setIndex(wind);
      g.computeBoundingSphere();
      g.boundingSphere.radius += 60;
      const m = new THREE.Mesh(g, waterMat);
      group.add(m);
      c.waterMesh = m;
      if (fresh) startFadeIn(m, waterMat, 0.72);
    }
    if (xind.length){
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(xpos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(xnor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(xuv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(xcol, 3));
      g.setAttribute('aPlane', new THREE.Float32BufferAttribute(xpl, 3));
      g.setIndex(xind);
      g.computeBoundingSphere();
      g.boundingSphere.radius += 60;
      const m = new THREE.Mesh(g, crossMat);
      group.add(m);
      c.crossMesh = m;
      if (fresh) startFadeIn(m, crossMat, 1);
    }
    c.dirty = false;
  }

  // ---------- 剖面视图切面网格（Terraria 式截面） ----------
  let sliceMesh = null, sliceMat = null;
  const SLICE_FACE = { 'z+': 5, 'z-': 4, 'x+': 1, 'x-': 0 };
  function buildSliceMesh(cx, cz){
    if (sliceMesh){ group.remove(sliceMesh); sliceMesh.geometry.dispose(); sliceMesh = null; }
    if (!viewMask) return;
    if (!sliceMat){
      sliceMat = new THREE.MeshLambertMaterial({
        map: Tex.texture, side: THREE.DoubleSide, transparent: false, alphaTest: 0.4,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      applyCurve(sliceMat);
    }
    const axis = viewMask.axis, cut = viewMask.cut;
    const faceIdx = SLICE_FACE[axis + (viewMask.dir > 0 ? '+' : '-')];
    const pos = [], nor = [], uv = [], col = [], ind = [];
    const x0 = (cx - MESH_R) * CHUNK, z0 = (cz - MESH_R) * CHUNK;
    const x1 = (cx + MESH_R) * CHUNK, z1 = (cz + MESH_R) * CHUNK;
    for (let y = 1; y < WORLD_H; y++){
      if (axis === 'z'){
        for (let x = x0; x < x1; x++){
          const d = getDef(x, y, cut);
          if (!d || d.id === 0 || d.liquid || d.cross) continue;
          const tileName = tileFor(d, faceIdx, x, y, cut);
          const t = Tex.uvRect(tileName);
          const b = pos.length / 3;
          const nz = viewMask.dir > 0 ? -1 : 1;
          const depth = viewMask.dir > 0 ? x - cut : cut - x;
          const s = THREE.MathUtils.clamp(0.9 - depth * 0.005 - (1 - y / WORLD_H) * 0.12, 0.42, 0.98);
          pos.push(x, y, cut, x, y + 1, cut, x + 1, y + 1, cut, x + 1, y, cut);
          for (let i = 0; i < 4; i++) nor.push(0, 0, nz);
          for (let i = 0; i < 4; i++) col.push(s, s, s);
          uv.push(t.u0, t.v1, t.u0, t.v0, t.u1, t.v0, t.u1, t.v1);
          ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      } else {
        for (let z = z0; z < z1; z++){
          const d = getDef(cut, y, z);
          if (!d || d.id === 0 || d.liquid || d.cross) continue;
          const tileName = tileFor(d, faceIdx, cut, y, z);
          const t = Tex.uvRect(tileName);
          const b = pos.length / 3;
          const nx = viewMask.dir > 0 ? -1 : 1;
          const depth = viewMask.dir > 0 ? z - cut : cut - z;
          const s = THREE.MathUtils.clamp(0.9 - depth * 0.005 - (1 - y / WORLD_H) * 0.12, 0.42, 0.98);
          pos.push(cut, y, z, cut, y + 1, z, cut, y + 1, z + 1, cut, y, z + 1);
          for (let i = 0; i < 4; i++) nor.push(nx, 0, 0);
          for (let i = 0; i < 4; i++) col.push(s, s, s);
          uv.push(t.u0, t.v1, t.u0, t.v0, t.u1, t.v0, t.u1, t.v1);
          ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
    }
    if (!ind.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ind);
    g.computeBoundingSphere();
    sliceMesh = new THREE.Mesh(g, sliceMat);
    group.add(sliceMesh);
  }

  function setDetailLOD(on){
    if (detailLOD === !!on) return;
    detailLOD = !!on;
    rebuildAll();
  }
  function setViewMask(mask, cx, cz){
    viewMask = mask || null;
    if (farMesh) farMesh.visible = !viewMask;
    if (cx !== undefined) buildSliceMesh(cx, cz);
    else if (sliceMesh){ group.remove(sliceMesh); sliceMesh.geometry.dispose(); sliceMesh = null; }
  }

  // ---------- 区块淡入（已禁用） ----------
  // 旧实现用半透明 alpha 叠加淡入，会让作物十字贴图被 alphaTest 裁掉，
  // 表现为作物边缘线闪烁/时隐时现；现在区块直接以满不透明度显示。
  const fadeIns = [];
  function startFadeIn(mesh, sharedMat, targetOpacity){
    return;
  }
  function tickFade(dt){
    for (let i = fadeIns.length - 1; i >= 0; i--){
      const f = fadeIns[i];
      f.t += dt / 0.9;
      if (f.t >= 1 || f.mesh.material !== f.mat){
        if (f.mesh.material === f.mat) f.mesh.material = f.sharedMat;
        f.mat.dispose();
        fadeIns.splice(i, 1);
      } else {
        f.mat.opacity = f.targetOpacity * f.t;
      }
    }
  }

  // ---------- 流式加载（每帧限额）----------
  function stream(px, pz){
    const pcx = cf(px), pcz = cf(pz);
    let genBudget = 8, meshBudget = 4;
    // 由近及远
    for (let r = 0; r <= GEN_R && (genBudget > 0 || meshBudget > 0); r++){
      for (let ox = -r; ox <= r; ox++){
        for (let oz = -r; oz <= r; oz++){
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const cx = pcx + ox, cz = pcz + oz;
          let c = chunks.get(ckey(cx, cz));
          if (!c && genBudget > 0){ c = genChunk(cx, cz); genBudget--; }
          if (c && r <= MESH_R && (!c.mesh && c.dirty || c.dirty) && meshBudget > 0){
            // 确保周围数据存在，避免边界破洞
            for (const [ax, az] of [[1,0],[-1,0],[0,1],[0,-1]]){
              if (!chunks.get(ckey(cx + ax, cz + az))) genChunk(cx + ax, cz + az);
            }
            buildChunkMesh(c);
            meshBudget--;
          }
        }
      }
    }
    // 邻块补齐后二次重建，消除区块边界水面/地形接缝
    for (const c of chunks.values()){
      if (!c.dirty || meshBudget <= 0) continue;
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > MESH_R) continue;
      const n0 = chunks.get(ckey(c.cx + 1, c.cz)), n1 = chunks.get(ckey(c.cx - 1, c.cz));
      const n2 = chunks.get(ckey(c.cx, c.cz + 1)), n3 = chunks.get(ckey(c.cx, c.cz - 1));
      if (n0 && n1 && n2 && n3){
        buildChunkMesh(c);
        meshBudget--;
      }
    }
    // 卸载远处网格（保留数据）
    for (const c of chunks.values()){
      if (!c.mesh && !c.waterMesh && !c.crossMesh) continue;
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > UNLOAD_R){
        if (c.mesh){ group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
        if (c.waterMesh){ group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); c.waterMesh = null; }
        if (c.crossMesh){ group.remove(c.crossMesh); c.crossMesh.geometry.dispose(); c.crossMesh = null; }
        c.dirty = true;   // 回来时重建
      }
    }
  }

  // 载入屏预生成
  async function pregen(wx, wz, radius, progressCb){
    const pcx = cf(wx), pcz = cf(wz);
    const total = (radius * 2 + 1) * (radius * 2 + 1);
    let done = 0;
    for (let ox = -radius; ox <= radius; ox++){
      for (let oz = -radius; oz <= radius; oz++){
        genChunk(pcx + ox, pcz + oz);
        done++;
        if (progressCb) progressCb(done / total * 0.5);
      }
      await new Promise(r => setTimeout(r, 0));
    }
    done = 0;
    for (let ox = -radius + 1; ox < radius; ox++){
      for (let oz = -radius + 1; oz < radius; oz++){
        const c = chunks.get(ckey(pcx + ox, pcz + oz));
        if (c && c.dirty) buildChunkMesh(c);
        done++;
        if (progressCb) progressCb(0.5 + done / total * 0.5);
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ---------- 光源方块照明：点光源池（就近 6 盏，恒定数量避免着色器反复重编译）----------
  let lampPool = null, lampScanT = 0;
  function updateLampLights(dt, px, pz){
    if (!group || !lampPool) return;
    lampScanT -= dt;
    if (lampScanT > 0) return;
    lampScanT = 0.5;
    const cands = [];
    const pcx = cf(px), pcz = cf(pz);
    for (let ox = -3; ox <= 3; ox++)
      for (let oz = -3; oz <= 3; oz++){
        const c = chunks.get(ckey(pcx + ox, pcz + oz));
        if (c && c.lamps)
          for (const p of c.lamps){
            const dx = p[0] - px, dz = p[2] - pz;
            cands.push({ p, d: dx * dx + dz * dz });
          }
      }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < lampPool.length; i++){
      const l = lampPool[i];
      if (i < cands.length && cands[i].d < 3600){
        l.position.set(cands[i].p[0] + 0.5, cands[i].p[1] + 0.9, cands[i].p[2] + 0.5);
        l.intensity = 0.95;
      } else l.intensity = 0;
    }
  }

  // ---------- 草方块扩散：泥土在草旁且顶部露天时缓慢长草，耕地/水下不扩散 ----------
  let grassSpreadT = 0;
  function tickGrassSpread(dt, px, pz){
    if (!biome || biome.grass !== 'grass' || biome.dirt !== 'dirt') return;
    grassSpreadT -= dt;
    if (grassSpreadT > 0) return;
    grassSpreadT = 0.6;
    const grassId = BLOCKS.grass.id;
    const pcx = cf(px), pcz = cf(pz);
    const picked = new Set();
    // 优先检查玩家周围 5x5 区块，让身边挖开的泥土能较快长草
    for (let ox = -2; ox <= 2; ox++)
      for (let oz = -2; oz <= 2; oz++) picked.add(ckey(pcx + ox, pcz + oz));
    const loaded = [];
    for (const c of chunks.values()) if (c.mesh) loaded.push(c);
    for (let i = 0; i < 5 && loaded.length; i++){
      const c = loaded[(Math.random() * loaded.length) | 0];
      picked.add(ckey(c.cx, c.cz));
    }
    let converted = 0;
    for (const key of picked){
      const c = chunks.get(key);
      if (!c || !c.mesh || converted >= 8) continue;
      for (let s = 0; s < 48 && converted < 8; s++){
        const lx = (Math.random() * CHUNK) | 0, lz = (Math.random() * CHUNK) | 0;
        let y = WORLD_H - 1;
        while (y > 0 && c.data[lidx(lx, y, lz)] === 0) y--;
        if (y < 1) continue;
        const id = c.data[lidx(lx, y, lz)];
        const wx = c.cx * CHUNK + lx, wz = c.cz * CHUNK + lz;
        if (id === grassId){
          // 从草块出发，向横向邻位扩散
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nDef = getDef(wx + dx, y, wz + dz);
            if (nDef.key !== 'dirt') continue;
            const upDef = getDef(wx + dx, y + 1, wz + dz);
            if (upDef.id !== 0 && (upDef.solid || upDef.liquid)) continue;
            set(wx + dx, y, wz + dz, grassId);
            converted++;
            if (converted >= 8) break;
          }
        } else if (id === BLOCKS.dirt.id){
          const upDef = getDef(wx, y + 1, wz);
          if (upDef.id !== 0 && (upDef.solid || upDef.liquid)) continue;
          let near = false;
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
            if (getDef(wx + dx, y, wz + dz).key === 'grass'){ near = true; break; }
          }
          if (near){ set(wx, y, wz, grassId); converted++; }
        }
      }
    }
  }
  function update(dt, cx, cz){
    tickFade(dt || 0.016);
    if (cx !== undefined){
      tickFar(cx, cz);
      updateLampLights(dt || 0.016, cx, cz);
      tickGrassSpread(dt || 0.016, cx, cz);
    }
  }

  // ---------- 查询 ----------
  function topAt(x, z){
    x = Math.floor(x); z = Math.floor(z);
    genChunk(cf(x), cf(z));
    for (let y = WORLD_H - 1; y >= 0; y--){
      const d = getDef(x, y, z);
      if (d.solid || d.liquid) return y;
    }
    return 0;
  }
  // ---------- 地表颜色采样（星球贴图贴合方块地形用；区块未加载返回 null，绝不触发生成）----------
  const tileColorCache = {};
  function tileAvgColor(name){
    let c = tileColorCache[name];
    if (c) return c;
    const cv = Tex.tileCanvas(name);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4){
      if (d[i + 3] > 40){ r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    n = Math.max(1, n);
    c = [(r / n) | 0, (g / n) | 0, (b / n) | 0];
    tileColorCache[name] = c;
    return c;
  }
  function surfaceColorAt(x, z){
    x = Math.floor(x); z = Math.floor(z);
    if (!chunks.get(ckey(cf(x), cf(z)))) return null;
    for (let y = WORLD_H - 1; y >= 0; y--){
      const d = getDef(x, y, z);
      if (d.solid || d.liquid){
        const col = tileAvgColor(tileFor(d, 2));
        const sh = 0.72 + (y - 14) * 0.012;
        return 'rgb(' + Math.min(255, (col[0] * sh) | 0) + ',' + Math.min(255, (col[1] * sh) | 0) + ',' + Math.min(255, (col[2] * sh) | 0) + ')';
      }
    }
    return null;
  }
  // 纯噪声地表高度（不生成区块）：整球浮雕位移用；水面返回海平面
  function mapHeightAt(x, z){
    if (!noise || !biome) return 16;
    const h = heightAt(Math.floor(x), Math.floor(z));
    const SEAB = SEA + (biome.seaLift || 0);
    if (h < SEAB && !biome.dry && biome.grass !== 'basalt') return SEAB;
    return h;
  }
  // 纯噪声地表颜色（不生成区块）：把整颗星球的体素地形“模拟渲染”到球面贴图
  function mapColorRGB(x, z){
    if (!noise || !biome) return [90, 90, 90];
    const b = biomeAt(x, z);
    const h = heightAt(Math.floor(x), Math.floor(z));
    const SEAB = SEA + (b.seaLift || 0);
    let def, y;
    if (h < SEAB && !b.dry && b.grass !== 'basalt'){
      def = BLOCKS.water; y = SEAB;
    } else {
      def = (h < SEAB + 1 && !NO_BEACH_KEYS.includes(b.grass)) ? BLOCKS.sand : BLOCKS[b.grass];
      y = h;
    }
    const col = tileAvgColor(tileFor(def, 2));
    const sh = 0.72 + (y - 14) * 0.012;
    return [Math.min(255, col[0] * sh), Math.min(255, col[1] * sh), Math.min(255, col[2] * sh)];
  }
  function mapColorAt(x, z){
    const c = mapColorRGB(x, z);
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  // ---------- 超级视距：远景模拟地形（单网格，噪声高度+地表色，实时跟随） ----------
  let FAR_STEP = 12;                          // 格/单元（可被设置调整）
  const FAR_N = 129;                          // 129×129 顶点 · 12格/单元 ≈ 1536 格视距
  let farMesh = null, farCenter = [1e9, 1e9], farRow = FAR_N, farPend = null, farDone = false;
  function setFarDist(dist){
    FAR_STEP = Math.max(4, Math.round(dist * 2 / (FAR_N - 1)));
    farCenter = [1e9, 1e9];   // 强制整体重刷
    farRow = FAR_N;
  }
  function ensureFarMesh(){
    if (farMesh) return farMesh;
    const n = FAR_N * FAR_N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    // 法线：缺省朝上，完整刷新后重算（无法线时不受阳光照明，会呈现黑色地皮）
    const nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const ind = [];
    for (let iz = 0; iz < FAR_N - 1; iz++){
      for (let ix = 0; ix < FAR_N - 1; ix++){
        const a = iz * FAR_N + ix, b = a + 1, c = a + FAR_N, d = c + 1;
        ind.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(ind);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    applyCurve(mat);                          // 高空曲率与真实区块一致
    // 不写深度 + renderOrder -1：远景永远垫在真实地形之下，透明挖空区不会遮挡方块
    // 玩家周围真实区块覆盖区内挖空远景（模拟地皮高度有偏差，会盖住真实方块）；半径随区块视距联动
    const curveCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = shader => {
      curveCompile(shader);
      // 远景地形是平滑斜坡网格，不参与方块边缘高光，避免远处出现斜向白带
      shader.uniforms.uRimStrength = { value: 0 };
      shader.uniforms.uFarR0 = farHoleU.r0;
      shader.uniforms.uFarR1 = farHoleU.r1;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFarR0;\nuniform float uFarR1;')
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.a *= smoothstep(uFarR0, uFarR1, vEdgeR2);');
    };
    mat.customProgramCacheKey = () => 'curve3far';
    farMesh = new THREE.Mesh(geo, mat);
    farMesh.frustumCulled = false;
    farMesh.renderOrder = -1;
    farMesh.visible = false;
    return farMesh;
  }
  function tickFar(cx, cz){
    if (!noise) return;
    ensureFarMesh();
    const snapX = Math.round(cx / 64) * 64, snapZ = Math.round(cz / 64) * 64;
    if (farRow >= FAR_N && (snapX !== farCenter[0] || snapZ !== farCenter[1])){
      farPend = [snapX, snapZ];
      farRow = 0;
    }
    if (farRow >= FAR_N) return;
    const posA = farMesh.geometry.attributes.position;
    const colA = farMesh.geometry.attributes.color;
    const half = (FAR_N - 1) / 2 * FAR_STEP;
    for (let r = 0; r < 10 && farRow < FAR_N; r++, farRow++){
      const wz = farPend[1] - half + farRow * FAR_STEP;
      for (let ix = 0; ix < FAR_N; ix++){
        const wx = farPend[0] - half + ix * FAR_STEP;
        const i = farRow * FAR_N + ix;
        posA.setXYZ(i, wx, mapHeightAt(wx, wz) - 2.2, wz);   // 下沉偏置：近处由真实区块覆盖
        const c = mapColorRGB(wx, wz);
        colA.setXYZ(i, c[0] / 255, c[1] / 255, c[2] / 255);
      }
    }
    posA.needsUpdate = true;
    colA.needsUpdate = true;
    if (farRow >= FAR_N){
      farCenter = farPend;
      farMesh.geometry.computeVertexNormals();
      if (!farDone){ farDone = true; farMesh.visible = !viewMask; }
    }
  }
  function findSpawn(){
    const farm = structures.find(s => s.type === 'farm');
    if (farm) return new THREE.Vector3(farm.x + 5.5, farm.h + 2, farm.z + 8);
    const SEAB = SEA + (biome.seaLift || 0);
    for (let r = 0; r < 140; r++){
      const range = 20 + r;                       // 海洋星球逐步扩大搜索
      const x = ((Math.random() * range * 2 - range) | 0), z = ((Math.random() * range * 2 - range) | 0);
      const y = topAt(x, z);
      if (y > SEAB && getDef(x, y, z).id !== BLOCKS.water.id) return new THREE.Vector3(x + 0.5, y + 2, z + 0.5);
    }
    return new THREE.Vector3(0.5, topAt(0, 0) + 2, 0.5);
  }

  // ---------- 射线 ----------
  // 正交相机 near=-1000：地形位于相机平面后方时也会被渲染，
  // 因此从相机近裁面后方开始向前做 DDA，命中的才是深度缓冲区里真正可见的面。
  let rayBack = 1100;
  function setRayBack(v){
    if (Number.isFinite(v) && v > 0) rayBack = v;
  }
  // 负 near 正交相机下，可见面等价于“从视锥远端沿射线进入方块”的那一面。
  // 必须用远端起点取 AABB 入面，不能取离相机更近的出面，否则相机背后/靠近平面的方块会高亮到反面。
  function entryFaceFromFar(x, y, z, start, dir){
    let tmin = -Infinity, tmax = Infinity;
    let inA = -1, outA = -1, inS = 0, outS = 0;
    for (let a = 0; a < 3; a++){
      const o = a === 0 ? start.x : a === 1 ? start.y : start.z;
      const d = a === 0 ? dir.x : a === 1 ? dir.y : dir.z;
      const low = a === 0 ? x : a === 1 ? y : z;
      const high = low + 1;
      if (Math.abs(d) < 1e-9){
        if (o < low || o > high) return null;
        continue;
      }
      const t1 = (low - o) / d, t2 = (high - o) / d;
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      const loSign = t1 < t2 ? -1 : 1;
      const hiSign = t1 < t2 ? 1 : -1;
      if (lo > tmin){ tmin = lo; inA = a; inS = loSign; }
      if (hi < tmax){ tmax = hi; outA = a; outS = hiSign; }
    }
    if (inA < 0) return null;
    if (tmin >= -1e-7) return [inA === 0 ? inS : 0, inA === 1 ? inS : 0, inA === 2 ? inS : 0];
    if (outA >= 0) return [outA === 0 ? outS : 0, outA === 1 ? outS : 0, outA === 2 ? outS : 0];
    return null;
  }
  function raycast(origin, dir, maxDist = 6){
    const o = new THREE.Vector3().copy(origin).addScaledVector(dir, -rayBack);
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tX = stepX > 0 ? (x + 1 - o.x) * tDX : (o.x - x) * tDX;
    let tY = stepY > 0 ? (y + 1 - o.y) * tDY : (o.y - y) * tDY;
    let tZ = stepZ > 0 ? (z + 1 - o.z) * tDZ : (o.z - z) * tDZ;
    let t = 0, lastT = 0;
    let skipStart = false;
    let lastFace = null;
    const d0 = getDef(x, y, z);
    if (d0.id !== 0 && !d0.liquid) skipStart = true;
    const limit = maxDist + rayBack;
    while (t <= limit){
      if (!skipStart){
        const def = getDef(x, y, z);
        if (def.id !== 0 && !def.liquid && viewVisible(x, y, z)){
          const face = lastFace || entryFaceFromFar(x, y, z, o, dir);
          if (!face) continue;
          const nx = x + face[0], ny = y + face[1], nz = z + face[2];
          const nb = getDef(nx, ny, nz);
          // 只接受暴露面：面外侧是空气/液体/透明/十字/机器/被剖面隐藏，
          // 否则继续向里找可见面
          const exposed = !nb.solid || nb.liquid || nb.transparent || nb.cross || nb.machine || !viewVisible(nx, ny, nz);
          if (exposed) return { x, y, z, def, face: [...face], dist: lastT - rayBack };
        }
      }
      skipStart = false;
      if (tX < tY && tX < tZ){ x += stepX; t = tX; tX += tDX; lastFace = [-stepX, 0, 0]; }
      else if (tY < tZ){ y += stepY; t = tY; tY += tDY; lastFace = [0, -stepY, 0]; }
      else { z += stepZ; t = tZ; tZ += tDZ; lastFace = [0, 0, -stepZ]; }
      lastT = t;
    }
    const geoHit = raycastGeometry(origin, dir, maxDist);
    if (geoHit) return geoHit;
    return null;
  }
  const _pickRay = new THREE.Raycaster();
  function raycastGeometry(origin, dir, maxDist = 6){
    const o = new THREE.Vector3().copy(origin).addScaledVector(dir, -rayBack);
    _pickRay.set(o, dir, 0, rayBack + Math.max(6, maxDist));
    const meshes = [];
    for (const c of chunks.values()){
      if (c.mesh) meshes.push(c.mesh);
      if (c.waterMesh) meshes.push(c.waterMesh);
      if (c.crossMesh) meshes.push(c.crossMesh);
    }
    if (sliceMesh) meshes.push(sliceMesh);
    if (window.Factory && window.Factory.group){
      window.Factory.group.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) meshes.push(obj);
      });
    }
    let hits = _pickRay.intersectObjects(meshes, false);
    if (viewMask){
      hits = hits.filter(h => {
        const v = viewMask.axis === 'x' ? h.point.x : h.point.z;
        return viewMask.dir > 0 ? v >= viewMask.cut - 1e-6 : v <= viewMask.cut + 1e-6;
      });
    }
    for (const h of hits){
      const n = new THREE.Vector3().copy(h.face.normal).round();
      if (n.lengthSq() === 0) continue;
      const x = Math.floor(h.point.x - n.x * 1e-4);
      const y = Math.floor(h.point.y - n.y * 1e-4);
      const z = Math.floor(h.point.z - n.z * 1e-4);
      const def = getDef(x, y, z);
      if (!def || def.id === 0 || def.liquid) continue;
      return { x, y, z, def, face: [n.x, n.y, n.z], dist: h.distance - rayBack };
    }
    return null;
  }
  function viewVisible(x, y, z){
    if (!viewMask) return true;
    const v = viewMask.axis === 'x' ? x : z;
    return viewMask.dir > 0 ? v >= viewMask.cut : v <= viewMask.cut;
  }

  // ---------- 存档 ----------
  function rleEncode(data){
    const out = [];
    let cur = data[0], run = 1;
    for (let i = 1; i < data.length; i++){
      if (data[i] === cur && run < 65535) run++;
      else { out.push(run, cur); cur = data[i]; run = 1; }
    }
    out.push(run, cur);
    return out;
  }
  function serialize(){
    const mods = {};
    for (const [k, c] of chunks){
      if (c.modified) mods[k] = rleEncode(c.data);
    }
    return { seed, mods };
  }
  function init(biomeKey, worldSeed, mods){
    dispose();
    seed = worldSeed;
    biome = BIOMES[biomeKey];
    planetBiome = biome;
    farmCore = null;
    noise = makeNoise(worldSeed);
    savedMods = mods || null;
    chunks = new Map();
    group = new THREE.Group();
    genStructures();   // 村庄/遗迹布点（种子确定性）
    // 光源方块点光源池（初始化即建满 6 盏，加载期完成着色器编译）
    lampPool = [];
    for (let i = 0; i < 6; i++){
      const l = new THREE.PointLight(0xffd9a0, 0, 11, 2);
      group.add(l);
      lampPool.push(l);
    }
    lampScanT = 0;
    // 远景模拟地形：换世界后强制重算并隐藏至首次刷完
    farCenter = [1e9, 1e9];
    farRow = FAR_N;
    farDone = false;
    if (farMesh) farMesh.visible = false;
  }
  function dispose(){
    if (group){
      for (const c of chunks.values()){
        if (c.mesh){ group.remove(c.mesh); c.mesh.geometry.dispose(); }
        if (c.waterMesh){ group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
        if (c.crossMesh){ group.remove(c.crossMesh); c.crossMesh.geometry.dispose(); }
      }
      group.clear();   // 兜底：确保无残留子对象（旧 biome 区块贴在场景上=无碰撞方块）
    }
    chunks = new Map();
    savedMods = null;
  }

  return {
    CHUNK, WORLD_H, SEA,
    get biome(){ return biome; },
    get group(){ return group; },
    get seed(){ return seed; },
    get viewMask(){ return viewMask; },
    get materials(){ return [solidMat, waterMat, crossMat]; },
    get farMesh(){ return ensureFarMesh(); },
    get spawnFarm(){ return structures.find(s => s.type === 'farm') || null; },
    init, pregen, stream, update, get, set, markDirty, rebuildAll, getDef, raycast, topAt, findSpawn,
    serialize, dispose, inBounds, setCurve, setScanPulse, surfaceColorAt, mapColorAt, mapColorRGB, mapHeightAt,
    setViewDist, setFarDist, setShadows, setRimDir, setRimStrength, setCrossCam,
    setFadeAbove, setDetailLOD, setViewMask, isViewVisible: viewVisible,
    setRayBack,
    get structures(){ return structures; },
  };
})();
window.World = World;
