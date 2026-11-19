# 3D 花園第二期：夥伴生活動作 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 花園的夥伴跟平面版一樣，會在自己附近散步，並輪替看花、野餐、澆水、追蝴蝶、閱讀，各有 3D 道具；網址與開關不變。

**Architecture:** 不在 3D 另寫規則。平面版 `garden/life.js` 的 `Life.frame()` 已決定每位夥伴的 `activity`、位移 `x/y`（像素，|x|≤48、|y|≤6）、`facing`。只讓 `View.render()` 把這一格的結果存到 `this.lastStates`，`app.js` 把它放進推給 3D 的狀態；3D 把位移換成世界座標小幅偏移、依活動掛道具。凍結、減少動態、蝴蝶最多 2 隻、展示者等規則全部沿用平面版引擎。

**Tech Stack:** three.js r160（本機）、ES modules、Playwright（SwiftShader）。

---

## 背景

- 第一期（Pages 3acc785，計畫 `2026-11-19-garden3d-production.md`）已上線：`garden3d/stage3d.js` 控制器、`partners.js` 夥伴、`layout.js` 座位；`app.js` 的 `g3State()` 每次 `render()` 結尾推狀態。
- `Life.frame()` 回傳每位 `{seat, activity, x, y, facing, cycle, presenting?, variant?}`；`activity` 為 `flowers|picnic|watering|butterfly|reading|walking`，月光後還可能是 `basketball|soccer|volleyball|tennis|baseball|badminton|sowing|planting`（第三期才做 3D 道具，本期這些不掛道具）。
- 減少動態時引擎回傳 `x=y=0`；不活動（超標等）時引擎不推進。
- 世界座標：鏡頭在 +z 看向 -z，畫面右＝+x，畫面下（靠近觀眾）＝+z。夥伴座位最小間距 31 位 1.44、100 位 0.95。
- 專案規則：改既有程式先備份 `.bak`；改 garden 載入的 js 後跑 `python tools/stamp_garden.py`；push 前問老師。

## 檔案

| 檔案 | 動作 | 責任 |
|---|---|---|
| `garden/life.js` | 修改 1 行 | `View.render` 存 `this.lastStates` |
| `garden/app.js` | 修改 | `g3State()` 加 `life` |
| `garden3d/props.js` | 新增 | 五種活動道具的 3D 模型與動畫 |
| `garden3d/partners.js` | 修改 | 套用位移／面向／散步彈跳／道具 |
| `garden3d/stage3d.js` | 修改 | `setState` 轉交 `life` |
| `tests/test_garden3d.py` | 修改 | 新增 2 項測試 |

---

### Task 1: life.js 保留這一格的結果、app.js 推給 3D

**Files:** Modify `garden/life.js`、`garden/app.js`（先備份）

- [ ] **Step 1: 備份** `cp garden/life.js garden/life.js.bak && cp garden/app.js garden/app.js.bak`
- [ ] **Step 2: life.js**：把 `var self=this,states=this.life.frame(list,dt,bounds,active,reduced,discovery);` 改成

```js
var self=this,states=this.life.frame(list,dt,bounds,active,reduced,discovery);this.lastStates=states;
```

並把 `View.prototype.reset=function(){this.life.reset();` 改成 `View.prototype.reset=function(){this.lastStates=[];this.life.reset();`

- [ ] **Step 3: app.js**：`g3State()` 回傳物件最後加 `,life:lifeView.lastStates||[]`，即

```js
function g3State(){return {visible:model?model.visible():[],rosterSize:roster.length||31,stage:model?model.stage:0,active:$('garden-scene').dataset.lifeActive==='true',reduced:reducedMotion.matches,idle:!model,life:lifeView.lastStates||[]};}
```

- [ ] **Step 4: 驗證** `node tests/garden_life_test.js && node --check garden/app.js`，Expected：通過、無輸出錯誤。
- [ ] **Step 5: Commit** `git commit -am "feat(garden): 生活引擎結果提供給 3D（lastStates）"`

---

### Task 2: props.js（五種活動道具）

**Files:** Create `garden3d/props.js`

道具座標以夥伴群組為準（公仔面向 +z，高約 1.55，底座半徑 0.5）；放在側邊或腳邊，不擋臉。

- [ ] **Step 1: 寫 props.js**

```js
// garden3d/props.js
// 3D props for partner activities (same ids as garden/life.js). Unknown ids (phase-3 discoveries) -> null.
import * as THREE from '../vendor/three/three.module.min.js';

const M = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, flatShading: true }, extra));
const mats = { pot: M('#c9825a'), stem: M('#6f9d55'), wood: M('#b07a4f'), teal: M('#6fb3b8', { roughness: 0.5 }), page: M('#fbf6e6'), cover: M('#7d9bd1'), water: M('#a8dcef', { transparent: true, opacity: 0.85 }), wing: M('#f6c0d4', { side: THREE.DoubleSide }) };
const petal = ['#fff3d6', '#f7c2a8', '#cbb8ec'].map((c) => M(c));
let blanketTex = null;
function blanketMaterial() {
  if (!blanketTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#f4efe0' : '#e98a7a'; g.fillRect(x * 8, y * 8, 8, 8); }
    blanketTex = new THREE.CanvasTexture(c); blanketTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: blanketTex, roughness: 1 });
}
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

function flowers() {
  const g = new THREE.Group(); g.position.set(0.62, 0, 0.28);
  g.add(Object.assign(mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.18, 8), mats.pot), { position: new THREE.Vector3(0, 0.09, 0) }));
  const heads = [];
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), mats.stem); s.position.set((i - 1) * 0.06, 0.29, 0); g.add(s);
    const h = mesh(new THREE.IcosahedronGeometry(0.06, 0), petal[i]); h.position.set((i - 1) * 0.06, 0.41, 0); g.add(h); heads.push(h);
  }
  g.userData.animate = (t) => heads.forEach((h, i) => { h.position.x = (i - 1) * 0.06 + Math.sin(t * 1.6 + i) * 0.015; });
  return g;
}
function picnic() {
  const g = new THREE.Group();
  const blanket = mesh(new THREE.PlaneGeometry(1.15, 0.85), blanketMaterial(), false); blanket.rotation.x = -Math.PI / 2; blanket.position.set(0.05, 0.012, 0.18); g.add(blanket);
  const basket = mesh(new THREE.BoxGeometry(0.24, 0.14, 0.17), mats.wood); basket.position.set(0.5, 0.08, 0.32); g.add(basket);
  const handle = mesh(new THREE.TorusGeometry(0.09, 0.012, 4, 10, Math.PI), mats.wood); handle.position.set(0.5, 0.15, 0.32); g.add(handle);
  return g;
}
function watering() {
  const g = new THREE.Group(), can = new THREE.Group(); can.position.set(0.62, 0.5, 0.18); g.add(can);
  can.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.18, 10), mats.teal));
  const spout = mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.22, 6), mats.teal); spout.position.set(0.13, 0.04, 0); spout.rotation.z = -1.0; can.add(spout);
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.014, 4, 10, Math.PI), mats.teal); handle.position.set(-0.08, 0.06, 0); handle.rotation.z = Math.PI / 2; can.add(handle);
  const drops = [0, 1, 2].map(() => { const d = mesh(new THREE.SphereGeometry(0.022, 5, 4), mats.water, false); g.add(d); return d; });
  g.userData.animate = (t) => {
    const pour = Math.max(0, Math.sin(t * 1.8));
    can.rotation.z = -0.25 - pour * 0.45;
    drops.forEach((d, i) => { const k = (t * 1.4 + i / 3) % 1; d.visible = pour > 0.3; d.position.set(0.86 + k * 0.04, 0.5 - k * 0.45, 0.18); });
  };
  return g;
}
function butterfly() {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const wg = new THREE.CircleGeometry(0.1, 8); wg.translate(0.09, 0, 0);
  const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(new THREE.Mesh(wg, mats.wing)); const r = new THREE.Mesh(wg, mats.wing); r.rotation.y = Math.PI; rp.add(r); b.add(lp, rp);
  g.userData.animate = (t) => {
    b.position.set(Math.cos(t * 1.5) * 0.55, 1.5 + Math.sin(t * 3) * 0.08, Math.sin(t * 1.5) * 0.35);
    b.rotation.y = -t * 1.5; const f = Math.sin(t * 16) * 0.9; lp.rotation.y = f; rp.rotation.y = Math.PI - f;
  };
  return g;
}
function reading() {
  const g = new THREE.Group(), book = new THREE.Group(); book.position.set(0, 0.42, 0.34); book.rotation.x = -0.5; g.add(book);
  const left = new THREE.Group(), right = new THREE.Group(); book.add(left, right);
  [left, right].forEach((side, i) => {
    const cover = mesh(new THREE.BoxGeometry(0.2, 0.26, 0.012), mats.cover); cover.position.x = (i ? 1 : -1) * 0.1; side.add(cover);
    const page = mesh(new THREE.BoxGeometry(0.18, 0.24, 0.012), mats.page); page.position.set((i ? 1 : -1) * 0.1, 0, 0.012); side.add(page);
  });
  left.rotation.y = 0.35; right.rotation.y = -0.35;
  g.userData.animate = (t) => { right.rotation.y = -0.35 - Math.max(0, Math.sin(t * 0.7)) * 0.12; };
  return g;
}

const MAKERS = { flowers, picnic, watering, butterfly, reading };
export const PROP_IDS = Object.keys(MAKERS);
export function createProp(activity) { return MAKERS[activity] ? MAKERS[activity]() : null; }
export function disposeProp(g) {
  g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.dispose(); } });
}
```

- [ ] **Step 2: 語法檢查** `node --check garden3d/props.js`
- [ ] **Step 3: Commit** `git add garden3d/props.js && git commit -m "feat(garden3d): props.js 五種活動 3D 道具"`

---

### Task 3: partners.js 套用生活狀態＋stage3d 轉交（含測試）

**Files:** Modify `garden3d/partners.js`、`garden3d/stage3d.js`（先備份）、`tests/test_garden3d.py`

- [ ] **Step 1: 寫失敗的測試**（加在 `tests/test_garden3d.py` 類別內）

```python
    def test_life_states_move_partners_and_swap_props(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px'; document.body.appendChild(box);
          const g = window.Garden3D.create(box, { reducedMotion: false });
          const vis = [{ seat: 1, avatar: 3 }, { seat: 2, avatar: 25 }];
          g.setState({ visible: vis, rosterSize: 31, stage: 0, active: true, reduced: false, idle: false, life: [] });
          await until(() => g.debug().partners[1] && g.debug().partners[1].ready);
          const base = g.debug().partners[1];
          g.setState({ life: [{ seat: 1, activity: 'picnic', x: 48, y: 6, facing: 1 }, { seat: 2, activity: 'butterfly', x: 0, y: 0, facing: -1 }] });
          const a = g.debug().partners;
          g.setState({ life: [{ seat: 1, activity: 'reading', x: 0, y: 0, facing: 1 }, { seat: 2, activity: 'basketball', x: 0, y: 0, facing: 1 }] });
          const b = g.debug().partners;
          g.dispose();
          return { dx: a[1].x - base.slotX, dz: a[1].z - base.slotZ, a1: a[1].activity, a1p: a[1].prop, a2: a[2].activity, a2p: a[2].prop,
                   b1: b[1].activity, b1p: b[1].prop, b2: b[2].activity, b2p: b[2].prop, backX: b[1].x - base.slotX };
        }""" % UNTIL)
        self.assertEqual((r['a1'], r['a1p'], r['a2'], r['a2p']), ('picnic', True, 'butterfly', True))
        self.assertEqual((r['b1'], r['b1p'], r['b2'], r['b2p']), ('reading', True, 'basketball', False))
        self.assertAlmostEqual(r['dx'], 0.45, places=2)
        self.assertAlmostEqual(r['dz'], 0.18, places=2)
        self.assertAlmostEqual(r['backX'], 0.0, places=2)
        self.assertEqual(p.errors, [])

    def test_3d_activities_match_the_2d_garden(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'timed')
        p.click('#garden-demo'); p.fill('#garden-minutes', '5'); p.fill('#garden-spawn-seconds', '1')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(6000)
        pairs = p.evaluate("""() => { const d = window.__gardenDebug3d().partners;
          return Object.keys(d).map((s) => [d[s].activity, (document.querySelector('.garden-visitor[data-seat="' + s + '"]') || {}).dataset?.activity]); }""")
        self.assertGreaterEqual(len(pairs), 4)
        for a3, a2 in pairs:
            self.assertEqual(a3, a2)
        self.assertEqual(p.errors, [])
```

Run: `python -m pytest tests/test_garden3d.py -q -k "life_states or match_the_2d"` → Expected：2 FAIL（`slotX`/`activity` undefined）。

- [ ] **Step 2: partners.js 修改**（先 `cp garden3d/partners.js garden3d/partners.js.bak`）

(a) import 加：

```js
import { createProp, disposeProp } from './props.js';
```

(b) 檔頭常數加：

```js
// Life engine offsets are pixels (|x| <= 48, |y| <= 6); map them to a small walk around the seat.
const WALK_X = 0.45, WALK_Z = 0.18;
```

(c) `add()` 裡建立 `it` 時多加欄位 `activity: null, prop: null, ox: 0, oz: 0, facing: 1`，即把

```js
const it = { seat, avatar: null, slot, group, body, label, figure: null, motion: MOTIONS[seat % 4], phase: seat * 0.7, changedAt: instant ? -99 : now, leaving: false };
```

改成

```js
const it = { seat, avatar: null, slot, group, body, label, figure: null, motion: MOTIONS[seat % 4], phase: seat * 0.7, changedAt: instant ? -99 : now, leaving: false, activity: null, prop: null, ox: 0, oz: 0, facing: 1 };
```

(d) `place(it)` 改成套用偏移（大班縮放偏移避免相撞）：

```js
  place(it) {
    const [sx, sz] = this.slots[it.slot], k = this.scale / 0.82;
    const x = sx + it.ox * k, z = sz + it.oz * k;
    it.group.position.set(x, groundY(x, z), z);
    it.group.rotation.y = Math.atan2(this.home.x - sx, this.home.z - sz);
  }
```

(e) 新增方法 `applyLife(states)`（放在 `sync` 後面）：

```js
  // states: garden/life.js Life.frame() output for this frame
  applyLife(states) {
    (states || []).forEach((s) => {
      const it = this.items.get(s.seat);
      if (!it || it.leaving) return;
      it.ox = Math.max(-1, Math.min(1, (s.x || 0) / 48)) * WALK_X;
      it.oz = Math.max(-1, Math.min(1, (s.y || 0) / 6)) * WALK_Z;
      it.facing = s.facing < 0 ? -1 : 1;
      this.place(it);
      if (s.activity !== it.activity) {
        it.activity = s.activity;
        if (it.prop) { it.group.remove(it.prop); disposeProp(it.prop); it.prop = null; }
        const prop = createProp(s.activity);
        if (prop) { it.prop = prop; it.group.add(prop); }
      }
    });
  }
```

(f) `update()` 裡動作區塊改成：散步時依面向轉身＋彈跳，其他照舊，並驅動道具動畫。把

```js
      if (reduced) return;
      const k = clock * 2 + it.phase;
      if (it.motion === 'sway') b.rotation.z = Math.sin(k) * 0.07;
```

改成

```js
      if (reduced) return;
      const k = clock * 2 + it.phase;
      if (it.prop && it.prop.userData.animate) it.prop.userData.animate(clock + it.phase);
      if (it.activity === 'walking') { b.rotation.y = it.facing * 0.6; b.position.y = 0.08 + Math.abs(Math.sin(k * 2.2)) * 0.12; return; }
      if (it.motion === 'sway') b.rotation.z = Math.sin(k) * 0.07;
```

(g) `drop(seat)` 在 `this.scene.remove(it.group);` 後加 `if (it.prop) disposeProp(it.prop);`

(h) `debug()` 每位多回傳 `activity: it.activity, prop: !!it.prop, slotX: this.slots[it.slot][0], slotZ: this.slots[it.slot][1]`。

- [ ] **Step 3: stage3d.js**：`setState` 內 `partners.sync(...)` 下一行加：

```js
    if (s.life) partners.applyLife(s.life);
```

- [ ] **Step 4: 跑測試** `python -m pytest tests/test_garden3d.py -q -k "life_states or match_the_2d"` → Expected：2 passed
- [ ] **Step 5: Commit** `git add garden3d/partners.js garden3d/stage3d.js tests/test_garden3d.py && git commit -m "feat(garden3d): 夥伴照平面版生活引擎散步並掛活動道具"`

---

### Task 4: 試作頁也演生活動作（看效果用）

**Files:** Modify `garden3d/preview.js`（先備份）

試作頁沒有 app.js，直接用 `window.GardenLife.Life` 驅動（需載入 `garden/activities.js`、`garden/life.js`）。

- [ ] **Step 1: garden3d-preview.html** 在 `points/avatars.js` 那行後加：

```html
  <script src="garden/activities.js"></script>
  <script src="garden/life.js"></script>
```

- [ ] **Step 2: preview.js**：試作頁的立牌是自己建的（不是 Partners），只顯示活動道具與位移：
  - import 加 `import { createProp, disposeProp } from './props.js';`
  - 檔頭加 `const life = window.GardenLife ? new window.GardenLife.Life() : null;`
  - `addStandee()` 裡 `g.userData = {...}` 加 `seat, slotX: x, slotZ: z, activity: null, prop: null`
  - `frame()` 裡 `world.update(dt, renderer);` 之後加：

```js
  if (life && standees.length) {
    const states = life.frame(standees.map((g) => ({ seat: g.userData.seat })), dt * 1000, { width: 1200, columns: 8, size: 60, rowPitch: 140, height: 600, rows: 4 }, !paused, reducedMotion, null);
    states.forEach((s) => {
      const g = standees.find((o) => o.userData.seat === s.seat); if (!g) return; const u = g.userData;
      const x = u.slotX + (s.x / 48) * 0.45 * FIG_SCALE / 0.82, z = u.slotZ + (s.y / 6) * 0.18 * FIG_SCALE / 0.82;
      g.position.set(x, groundY(x, z), z); u.walking = s.activity === 'walking'; u.facing = s.facing;
      if (s.activity !== u.activity) { u.activity = s.activity; if (u.prop) { g.remove(u.prop); disposeProp(u.prop); } u.prop = createProp(s.activity); if (u.prop) g.add(u.prop); }
    });
  }
```

  - standee 動作迴圈中 `b.rotation.set(0, 0, 0); b.position.y = 0.08;` 之後加：

```js
    if (u.prop && u.prop.userData.animate && !reducedMotion) u.prop.userData.animate(clock + u.phase);
    if (u.walking && !reducedMotion) { b.rotation.y = u.facing * 0.6; b.position.y = 0.08 + Math.abs(Math.sin(k * 2.2)) * 0.12; return; }
```

  （`standees.forEach` 的 callback 用 `return` 跳過後續動作即可。）

- [ ] **Step 3: 截圖檢查**（scratch 腳本）：全員 31 位、快轉 20 秒，截圖確認有野餐墊、書、澆水壺、蝴蝶、盆花，且道具不擋臉、不穿進別人。
- [ ] **Step 4: Commit** `git commit -am "feat(garden3d): 試作頁演出生活動作與道具"`

---

### Task 5: 蓋章、全面回歸、文件、上線

- [ ] **Step 1:** `python tools/stamp_garden.py`（兩次確認冪等）
- [ ] **Step 2:** `node --test tests/garden3d_layout_test.mjs`、`node tests/garden_life_test.js`、`python -m pytest tests/test_garden3d.py tests/test_garden.py -q` → Expected：layout 5、3D 8、平面 59 全過
- [ ] **Step 3:** 文件：CHANGELOG（第二期）、secret-garden-guide.md 3D 一節更新「夥伴會散步並輪替五種活動」、DECISIONS（沿用平面版 Life 引擎而非另寫）、handoff.md、CLAUDE.md frontmatter
- [ ] **Step 4:** 問老師是否 push；push 後驗證線上檔案一致、勾 3D 有道具、無錯誤

## 不做（留給後續期）

- 月光後新發現的 6 種主景與 8 種道具（第三期；本期這些活動不掛道具，夥伴照常站立）。
- 平面版「花朵隨合宜音量逐株增加」在 3D 的對應（3D 已有依階段開花的花圃，暫不重複）。
