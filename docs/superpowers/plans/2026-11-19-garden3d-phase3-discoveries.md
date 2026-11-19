# 3D 花園第三期：月光後新發現（主景＋活動道具） — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 花園在月光成畫之後，與平面版同步出現「新發現」：池塘位置輪替 6 種主景、8 種新活動有 3D 道具、示範夥伴有發光環；網址與開關不變。

**Architecture:** 規則仍完全沿用平面版：`garden/discoveries.js` 的 `Session.sync()` 產生 `{count, themeId, activityId, unlockedIds, presenters, variant}`（app.js 已存在 `discovery` 變數），`Life.frame()` 已把新活動排進輪替並標出 `presenting`／`variant`。3D 只做呈現：`app.js` 把 `discovery.themeId` 推給 3D；`world.js` 把池塘相關物件收進 `pondGroup`，主景切換時池塘沉下、草地覆蓋、新主景從石台長出（6 秒合宜音量時間，減少動態時立即）；`props.js` 增加 8 種道具（3 種配色＝平面版 palettes）；`partners.js` 加示範發光環。

**Tech Stack:** three.js r160、ES modules、Playwright（SwiftShader）。

---

## 背景

- 第一、二期已上線（Pages 1f197f6）。`app.js` 的 `g3State()` 推 `{visible, rosterSize, stage, active, reduced, idle, life}`；`stage3d.js` 的 `setState` 轉交 world／partners。
- 平面版主景（`garden/fixtures.js`）：theme `bridge`＝池塘＋木橋；其他 5 種取代池塘位置；切換時新舊交叉淡化 6 秒，只在合宜音量（active）時前進，減少動態或立即模式直接完成；同時最多一個主景。第 1 次新發現固定 fountain，之後每 4 次換景（Session 處理）。
- 8 種活動 id：`basketball soccer volleyball tennis baseball badminton sowing planting`；variant 0～2 對應 `garden/activities.js` 的 palettes：`[['#deaa72','#92b5bd','#a3ba83'],['#d8a3ad','#b5a4c7','#9cb9b2'],['#b7c58d','#e2b783','#99b8cd']]`。
- 池塘中心 `POND = {x:4.4, z:0.6, rx:3.4, rz:2.2}`，窪地底約 -0.28。

## 檔案

| 檔案 | 動作 | 責任 |
|---|---|---|
| `garden3d/props.js` | 修改 | 新增 8 種活動道具、`createProp(activity, variant)` |
| `garden3d/fixtures3d.js` | 新增 | 5 種主景 3D 模型（噴水池、兔子石像、小鳥飲水台、花藤拱門、小風車）＋石台 |
| `garden3d/world.js` | 修改 | `pondGroup`、草地覆蓋、`setTheme()`、6 秒換景、`theme` debug |
| `garden3d/partners.js` | 修改 | variant 變化換道具、示範發光環 |
| `garden3d/stage3d.js` | 修改 | 轉交 `discovery.themeId`、debug 帶 theme |
| `garden/app.js` | 修改 | `g3State()` 加 `discovery` |
| `garden3d/preview.js`、`garden3d-preview.html` | 修改 | 試作頁「下一個新發現」按鈕 |
| `tests/test_garden3d.py` | 修改 | 調整 1 項、新增 2 項 |

---

### Task 1: props.js 新增 8 種道具

- [ ] 在 `props.js` 的 `const MAKERS` 之前加入下列程式；把 `MAKERS` 改為包含新 8 種、`createProp` 改為接受 variant。

```js
const PAL = [['#deaa72', '#92b5bd', '#a3ba83'], ['#d8a3ad', '#b5a4c7', '#9cb9b2'], ['#b7c58d', '#e2b783', '#99b8cd']];
const pal = (v) => PAL[Math.max(0, Math.min(2, Math.floor(v) || 0))];
function ball(color, r, line) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(r, 1), M(color)));
  if (line) [0, Math.PI / 2].forEach((a) => { const t = mesh(new THREE.TorusGeometry(r * 1.01, r * 0.07, 4, 16), M(line), false); t.rotation.y = a; g.add(t); });
  return g;
}
function racket(color) {
  const g = new THREE.Group();
  const head = mesh(new THREE.TorusGeometry(0.11, 0.016, 5, 16), M(color)); head.position.y = 0.24; g.add(head);
  const net = mesh(new THREE.CircleGeometry(0.1, 12), M('#f4f1e6', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }), false); net.position.y = 0.24; g.add(net);
  const handle = mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.24, 5), M('#8a6a4a')); handle.position.y = 0.02; g.add(handle);
  return g;
}
function soil(g) { const s = mesh(new THREE.CircleGeometry(0.26, 10), M('#8a6a4a'), false); s.rotation.x = -Math.PI / 2; s.position.set(0.55, 0.014, 0.36); g.add(s); }
function basketball() {
  const g = new THREE.Group(), b = ball('#e8894a', 0.13, '#5a3a2a'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.14 + Math.abs(Math.sin(t * 3)) * 0.45, 0.3); b.rotation.x = t * 2; };
  g.userData.animate(0); return g;
}
function soccer() {
  const g = new THREE.Group(), b = ball('#f6f4ec', 0.13, '#3c3c3c'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.5 + Math.sin(t * 1.5) * 0.15, 0.14, 0.42); b.rotation.z = -Math.sin(t * 1.5) * 1.2; };
  g.userData.animate(0); return g;
}
function volleyball(v) {
  const g = new THREE.Group(), b = ball('#f7f1d8', 0.13, pal(v)[1]); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.15, 1.65 + Math.abs(Math.sin(t * 2)) * 0.5, 0.35); b.rotation.y = t; };
  g.userData.animate(0); return g;
}
function tennis(v) {
  const g = new THREE.Group(), r = racket(pal(v)[0]); r.position.set(0.58, 0.3, 0.3); r.rotation.x = -1.1; g.add(r);
  const b = ball('#d6e65a', 0.06); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.48 + Math.abs(Math.sin(t * 4)) * 0.3, 0.42); };
  g.userData.animate(0); return g;
}
function baseball() {
  const g = new THREE.Group(), glove = mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#a0683f')); glove.position.set(0.58, 0.45, 0.3); glove.rotation.x = Math.PI; g.add(glove);
  const b = ball('#f6f4ec', 0.06, '#c8473d'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.52 + Math.abs(Math.sin(t * 2.5)) * 0.4, 0.3); };
  g.userData.animate(0); return g;
}
function badminton(v) {
  const g = new THREE.Group(), r = racket(pal(v)[2]); r.position.set(0.58, 0.3, 0.3); r.rotation.x = -1.1; g.add(r);
  const sh = new THREE.Group(), skirt = mesh(new THREE.ConeGeometry(0.06, 0.1, 8, 1, true), M('#fbfaf2', { side: THREE.DoubleSide }));
  skirt.position.y = 0.05; const cork = mesh(new THREE.SphereGeometry(0.03, 6, 4), M('#e7d3b0')); sh.add(skirt, cork); g.add(sh);
  g.userData.animate = (t) => { const k = Math.abs(Math.sin(t * 2.2)); sh.position.set(0.58, 0.5 + k * 0.45, 0.42); sh.rotation.z = (1 - k) * 0.3; };
  g.userData.animate(0); return g;
}
function sowing(v) {
  const g = new THREE.Group(); soil(g);
  const bag = mesh(new THREE.SphereGeometry(0.1, 8, 6), M(pal(v)[0])); bag.scale.set(1, 1.2, 0.8); bag.position.set(0.55, 0.62, 0.28); g.add(bag);
  const seeds = [0, 1, 2, 3].map(() => { const s = mesh(new THREE.SphereGeometry(0.018, 4, 3), M('#6b4a2f'), false); g.add(s); return s; });
  g.userData.animate = (t) => seeds.forEach((s, i) => { const k = (t * 0.9 + i / 4) % 1; s.position.set(0.55 + (i - 1.5) * 0.04, 0.55 - k * 0.53, 0.33); });
  g.userData.animate(0); return g;
}
function planting(v) {
  const g = new THREE.Group(); soil(g);
  const sprout = new THREE.Group(); sprout.position.set(0.55, 0.014, 0.36); g.add(sprout);
  const stem = mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.2, 4), mats.stem); stem.position.y = 0.1; sprout.add(stem);
  [-1, 1].forEach((sd) => { const l = mesh(new THREE.SphereGeometry(0.05, 5, 3), M('#8dbb6a')); l.scale.set(1.5, 0.45, 0.8); l.position.set(sd * 0.05, 0.17, 0); l.rotation.z = sd * 0.5; sprout.add(l); });
  const trowel = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.12), M(pal(v)[1])); trowel.position.set(0.3, 0.3, 0.35); trowel.rotation.x = 0.6; g.add(trowel);
  g.userData.animate = (t) => { const k = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.6)); sprout.scale.setScalar(k); trowel.position.y = 0.3 + Math.sin(t * 2) * 0.05; };
  g.userData.animate(0); return g;
}
```

```js
const MAKERS = { flowers, picnic, watering, butterfly, reading, basketball, soccer, volleyball, tennis, baseball, badminton, sowing, planting };
export const PROP_IDS = Object.keys(MAKERS);
export function createProp(activity, variant) { return MAKERS[activity] ? MAKERS[activity](variant || 0) : null; }
```

- [ ] `node --check garden3d/props.js`；commit。

### Task 2: fixtures3d.js（5 種主景）

```js
// garden3d/fixtures3d.js
// Primary scenes that take the pond's place after moonlight (same ids as garden/fixtures.js).
import * as THREE from '../vendor/three/three.module.min.js';

const M = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, flatShading: true }, extra));
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
const STONE = M('#b6c2b0'), PALE = M('#d8ddcf'), WATER = M('#b6dce1', { roughness: 0.2, emissive: '#b6dce1', emissiveIntensity: 0.25 }), FLOWER = M('#efc6be'), LEAF = M('#91ac73');

function foundation(g) {
  const a = mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.12, 24), M('#c6b49a')); a.position.y = 0.06; g.add(a);
  const b = mesh(new THREE.CylinderGeometry(1.32, 1.4, 0.1, 24), M('#e2d5b7')); b.position.y = 0.17; g.add(b);
}
function fountain() {
  const g = new THREE.Group(); foundation(g);
  const basin = mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.32, 20), STONE); basin.position.y = 0.38; g.add(basin);
  const w1 = mesh(new THREE.CircleGeometry(0.9, 20), WATER, false); w1.rotation.x = -Math.PI / 2; w1.position.y = 0.55; g.add(w1);
  const col = mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 10), STONE); col.position.y = 0.85; g.add(col);
  const top = mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.14, 16), PALE); top.position.y = 1.18; g.add(top);
  const w2 = mesh(new THREE.CircleGeometry(0.38, 16), WATER, false); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.26; g.add(w2);
  const drops = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) { const d = mesh(new THREE.SphereGeometry(0.035, 5, 4), WATER, false); d.userData = { j, i }; g.add(d); drops.push(d); }
  g.userData.animate = (t) => drops.forEach((d) => {
    const k = (t * 0.8 + d.userData.i / 6) % 1, ang = d.userData.j * 2.09, r = d.userData.j === 0 ? 0 : 0.55 * k;
    const h = d.userData.j === 0 ? 0.55 * Math.sin(k * Math.PI) : 0.45 * Math.sin(k * Math.PI);
    d.position.set(Math.cos(ang) * r, 1.3 + h, Math.sin(ang) * r);
  });
  g.userData.animate(0); return g;
}
function rabbit() {
  const g = new THREE.Group(); foundation(g);
  const ped = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.7), M('#b5bbaa')); ped.position.y = 0.4; g.add(ped);
  const body = mesh(new THREE.SphereGeometry(0.42, 14, 10), PALE); body.scale.set(1, 0.95, 0.85); body.position.y = 0.95; g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.3, 14, 10), PALE); head.position.y = 1.48; g.add(head);
  [-1, 1].forEach((sd) => {
    const ear = mesh(new THREE.SphereGeometry(0.1, 10, 8), PALE); ear.scale.set(1, 3.2, 0.6); ear.position.set(sd * 0.12, 1.92, 0); ear.rotation.z = -sd * 0.15; g.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.03, 6, 4), M('#738b7b'), false); eye.position.set(sd * 0.1, 1.52, 0.27); g.add(eye);
    const f = mesh(new THREE.IcosahedronGeometry(0.09, 0), FLOWER); f.position.set(sd * 0.6, 0.66, 0.25); g.add(f);
  });
  return g;
}
function birdbath() {
  const g = new THREE.Group(); foundation(g);
  const ped = mesh(new THREE.CylinderGeometry(0.16, 0.32, 0.85, 10), M('#c4c6b3')); ped.position.y = 0.62; g.add(ped);
  const bowl = mesh(new THREE.CylinderGeometry(0.78, 0.25, 0.24, 18), M('#dbe0cb')); bowl.position.y = 1.15; g.add(bowl);
  const w = mesh(new THREE.CircleGeometry(0.68, 18), WATER, false); w.rotation.x = -Math.PI / 2; w.position.y = 1.28; g.add(w);
  const birds = [['#a5cbd6', -0.45], ['#e8cc9c', 0.45]].map(([col, x]) => {
    const b = new THREE.Group(); b.position.set(x, 1.33, 0.1);
    const body = mesh(new THREE.SphereGeometry(0.13, 8, 6), M(col)); body.scale.set(1.3, 1, 1); b.add(body);
    const head = mesh(new THREE.SphereGeometry(0.085, 8, 6), M(col)); head.position.set(x < 0 ? 0.12 : -0.12, 0.12, 0); b.add(head);
    const beak = mesh(new THREE.ConeGeometry(0.03, 0.08, 4), M('#e4bb77')); beak.rotation.z = x < 0 ? -Math.PI / 2 : Math.PI / 2; beak.position.set(x < 0 ? 0.22 : -0.22, 0.12, 0); b.add(beak);
    g.add(b); return b;
  });
  g.userData.animate = (t) => birds.forEach((b, i) => { b.position.y = 1.33 + Math.max(0, Math.sin(t * 3 + i * 2)) * 0.12; });
  return g;
}
function arch() {
  const g = new THREE.Group(); foundation(g);
  const wood = M('#c3ad8c'), R = 1.05, H = 1.0;
  [-1, 1].forEach((sd) => { const p = mesh(new THREE.CylinderGeometry(0.07, 0.08, H, 8), wood); p.position.set(sd * R, 0.22 + H / 2, 0); g.add(p); });
  const pts = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * i / 24; pts.push(new THREE.Vector3(Math.cos(a) * R, 0.22 + H + Math.sin(a) * R, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(curve, 32, 0.07, 6), wood));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p, i) => new THREE.Vector3(p.x, p.y + Math.sin(i) * 0.04, 0.07))), 32, 0.035, 5), LEAF));
  const flowers = [];
  for (let i = 0; i < 9; i++) { const p = curve.getPoint(0.06 + i * 0.11), f = mesh(new THREE.IcosahedronGeometry(0.09, 0), FLOWER); f.position.set(p.x, p.y, 0.12); g.add(f); flowers.push(f); }
  g.userData.animate = (t) => flowers.forEach((f, i) => { f.rotation.y = Math.sin(t * 1.2 + i) * 0.4; });
  return g;
}
function windmill() {
  const g = new THREE.Group(); foundation(g);
  const tower = mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.7, 6), M('#e1d3ae')); tower.position.y = 1.07; g.add(tower);
  const roof = mesh(new THREE.ConeGeometry(0.62, 0.55, 6), M('#d2aa98')); roof.position.y = 2.2; g.add(roof);
  const door = mesh(new THREE.BoxGeometry(0.24, 0.36, 0.05), M('#b69c7e')); door.position.set(0, 0.4, 0.5); g.add(door);
  const blades = new THREE.Group(); blades.position.set(0, 1.75, 0.62); g.add(blades);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.BoxGeometry(0.16, 1.1, 0.03), M('#f1e3bf')); b.position.y = 0.55; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); blades.add(arm); }
  blades.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), M('#c4a482')));
  g.userData.animate = (t) => { blades.rotation.z = t * 0.8; };
  return g;
}

const MAKERS = { fountain, rabbit, birdbath, arch, windmill };
export const FIXTURE_IDS = Object.keys(MAKERS);
export function createFixture(id) { return MAKERS[id] ? MAKERS[id]() : null; }
export function disposeFixture(g) { g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
```

- [ ] `node --check`；commit。

### Task 3: world.js 主景切換

1. import：`import { createFixture, disposeFixture, FIXTURE_IDS } from './fixtures3d.js';`
2. 在 `// ---------- stage 5: pond` 之前加 `const pondGroup = new THREE.Group(); scene.add(pondGroup);`
3. 池塘區段（水面、岸石、波光、睡蓮荷花）與木橋區段、`moonPath`：所有 `scene.add(` 改為 `pondGroup.add(`。
4. 在 `// ---------- mood` 之前加主景系統：

```js
  // ---------- discoveries: primary scene in the pond's place (6 s of quiet time to cross-fade, like garden/fixtures.js) ----------
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: '#a9c47c', roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
  lawn.rotation.x = -Math.PI / 2; lawn.scale.set(POND.rx * 1.18, POND.rz * 1.22, 1); lawn.position.set(POND.x, 0.05, POND.z); lawn.receiveShadow = true; lawn.visible = false; scene.add(lawn);
  let themeId = 'bridge', fixture = null, outgoing = null, fadeP = 1;
  function applyTheme() {
    const bridgeVis = themeId === 'bridge' ? fadeP : (outgoing && outgoing.id === 'bridge' ? 1 - fadeP : 0);
    pondGroup.position.y = -2.2 * (1 - bridgeVis); pondGroup.visible = bridgeVis > 0.001;
    lawn.material.opacity = 1 - bridgeVis; lawn.visible = bridgeVis < 0.999;
    if (fixture) fixture.scale.setScalar(Math.max(0.0001, easeOut(fadeP)));
    if (outgoing && outgoing.obj) outgoing.obj.scale.setScalar(Math.max(0.0001, 1 - fadeP));
    if (fadeP >= 1 && outgoing) { if (outgoing.obj) { scene.remove(outgoing.obj); disposeFixture(outgoing.obj); } outgoing = null; }
  }
  function setTheme(id, instant) {
    if (id !== 'bridge' && FIXTURE_IDS.indexOf(id) < 0) id = 'bridge';
    if (id === themeId) { if (instant && fadeP < 1) { fadeP = 1; applyTheme(); } return; }
    if (outgoing && outgoing.obj) { scene.remove(outgoing.obj); disposeFixture(outgoing.obj); }
    outgoing = { id: themeId, obj: fixture };
    themeId = id; fixture = createFixture(id);
    if (fixture) { fixture.position.set(POND.x, 0.04, POND.z); fixture.rotation.y = -0.28; scene.add(fixture); }
    fadeP = instant ? 1 : 0; applyTheme();
  }
```

5. `update(dt, renderer)` 中，`applyMood(renderer);` 之後加：

```js
    if (fadeP < 1 && dt > 0) { fadeP = Math.min(1, fadeP + dt / 6); applyTheme(); }
    if (fixture && fixture.userData.animate) fixture.userData.animate(clock);
```

6. return 物件加 `setTheme, get theme() { return { themeId, fade: fadeP }; }`。

### Task 4: partners 示範環與 variant、stage3d／app 串接（含測試）

- partners.js：`it` 加 `variant: 0, presenting: false, ring: null`；`applyLife` 的換道具條件改為 `s.activity !== it.activity || (s.variant || 0) !== it.variant`，`it.variant = s.variant || 0`，`createProp(s.activity, it.variant)`；並加

```js
      it.presenting = !!s.presenting;
      if (it.presenting && !it.ring) { it.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.8, depthWrite: false })); it.ring.rotation.x = -Math.PI / 2; it.ring.position.y = 0.03; it.group.add(it.ring); }
      if (it.ring) it.ring.visible = it.presenting;
```

  檔頭 `const ringGeo = new THREE.RingGeometry(0.56, 0.7, 32);`；`update()` 在 `if (reduced) return;` 前加 `if (it.ring && it.ring.visible) it.ring.material.opacity = reduced ? 0.8 : 0.55 + 0.3 * Math.sin(clock * 4);`；`drop()` 加 `if (it.ring) it.ring.material.dispose();`；`debug()` 加 `presenting: it.presenting, variant: it.variant`。
- stage3d.js：`setState` 在 `partners.sync` 前加 `world.setTheme((s.discovery && s.discovery.themeId) || 'bridge', first || s.reduced || s.idle);`；`debug()` 加 `theme: world.theme`。
- app.js：`g3State()` 加 `,discovery:discovery?{count:discovery.count,themeId:discovery.themeId}:null`。
- 測試：
  - 修改 `test_life_states_move_partners_and_swap_props`：第二次狀態的 seat 2 活動改為 `'mystery'`（未知 id 不掛道具），預期 `('reading', True, 'mystery', False)`。
  - 新增 `test_every_discovery_prop_and_scene_builds`（直接建立）：8 種活動逐一 `setState({life:[{seat:1,activity:id,variant:2,presenting:true,x:0,y:0,facing:1}]})` → `prop`、`presenting` 為 true；6 種主景逐一 `setState({stage:7, reduced:true, discovery:{count:i+1, themeId:id}})` → `theme.themeId===id`、`theme.fade===1`。
  - 新增 `test_first_discovery_shows_fountain_in_3d`（整合、真實時間、減少動態）：示範、直接偵測、出場 1 秒、升級 5 秒 → 等 `__gardenDebug3d().theme.themeId==='fountain'`（timeout 300 秒）→ 至少一位 activity 為 `basketball` 且 `prop` true、`presenting` 人數 ≤2。

### Task 5: 試作頁「下一個新發現」

- `garden3d-preview.html` 加 `<script src="garden/discoveries.js"></script>`（在 life.js 前）與按鈕 `<button id="g3-discover">✦ 下一個新發現</button>`（放在「全員 31 位到齊」後）。
- `preview.js`：`const discoveries = window.GardenDiscoveries ? new window.GardenDiscoveries.Session() : null; let discovery = null, discoveryCount = 0;`；按鈕：`goStage(7,true)`（若未到月光）、`discoveryCount++`、`discovery = discoveries.sync(discoveryCount, standees.map(g=>g.userData.seat))`、`world.setTheme(discovery.themeId, false)`、`say('新發現 '+count+'：'+themeName+' · '+activityName)`；`applyLifeFrame` 把 `discovery` 傳給 `life.frame` 的最後一個參數；道具建立改 `createProp(s.activity, s.variant)`；示範者加 `presenting` 時稍微放大（`g.scale` ×1.08）。

### Task 6: 蓋章、回歸、文件、上線

- `python tools/stamp_garden.py`（冪等）；node 測試；`pytest tests/test_garden3d.py tests/test_garden.py`（預期 3D 10 項、平面 59 項）。
- 截圖：6 種主景各一張、8 種道具特寫。
- CHANGELOG、guide（3D 一節改為「月光後新發現與平面版同步」）、DECISIONS（池塘沉入＋草地覆蓋的換景方式）、handoff、frontmatter。
- 問老師是否 push；上線驗證。
