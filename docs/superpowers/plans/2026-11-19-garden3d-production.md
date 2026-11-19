# 3D 班級祕密花園接入正式版 — 實作計畫（第一期）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓正式的 `garden.html` 可以切換成 3D 花園（8 階段＋膨膨立體夥伴），跟著真實的音量、計時、班級名單運作；預設仍是平面版，老師勾選後才用 3D。

**Architecture:** 3D 是「疊在上面的另一個畫面」：`garden3d/` 的 ES 模組在 `#garden-scene` 裡建立一張 WebGL 畫布（z-index 4，在 HUD、歡迎框之下，在平面圖層之上）。`garden/app.js` 不改既有流程，只在每次 `render()` 結尾把狀態（在場夥伴、階段、是否在成長、是否閒置）推給 3D 控制器；3D 自己用 `requestAnimationFrame` 跑動畫，`active=false` 時整個 3D 時鐘凍結。平面版照常在下面運作，所以 PNG 保存、活動紀錄、59 項既有測試都不受影響。

**Tech Stack:** three.js r160（本機 `vendor/three/`，MIT）、原生 ES modules、Playwright（SwiftShader WebGL）、Node `node:test`。

---

## 背景（給沒參與前面對話的人）

- 試作頁 `garden3d-preview.html`（Pages 上已有，v2 commit f4b184a）已驗證：8 階段依 `docs/design/garden-eight-stages-v0.1.md`、38 款頭貼自動轉成膨膨公仔、31 位約 29 萬三角形、暫停凍結、自動播放全流程。
- 試作檔案：`garden3d/world.js`（場景＋階段揭示＋晝夜）、`garden3d/figures.js`（頭貼→公仔）、`garden3d/preview.js`（試作頁介面）。
- 正式花園：`garden.html` ＋ `garden/*.js`。`garden/app.js` 是壓縮風格的單一 IIFE，`render(dt)` 是畫面總入口；`#garden-scene` 的 `data-life-active` 為 `'true'` 才代表「合宜音量、正在成長」。
- 圖層 z-index：meadow 0、wildlife 1、visitors 3、welcome/finish 5、noise 7、HUD 8。
- **`garden.html` 也被全校通用版（universal.html，已分享他校）開啟**，所以 3D 必須預設關閉、壞掉時退回平面版。
- 改 `garden.html` 載入的任何 js/css 後要跑 `python tools/stamp_garden.py`（快取版本號，見 PITFALLS 2026-11-19）。ES 模組內的 `import` 目前**沒有**版本號，Task 6 補上。
- 專案規則：改既有程式前先備份同目錄 `檔名.bak`；push 前要問老師。

## 本期範圍與不做的事

| 本期做 | 本期不做（後續分期，見文末路線圖） |
|---|---|
| 3D 開關（預設關、記在這台瀏覽器、不支援 WebGL 時停用） | 夥伴在 3D 裡散步／看花／野餐／澆水／閱讀（第二期） |
| 8 階段跟著 `model.stage` 走；新花園立即回第 1 階段 | 月光後的「新發現」6 種主景與 8 種道具（第三期） |
| 夥伴跟著 `model.visible()` 入園／休息離開／換頭貼 | 3D 畫面直接存成 PNG（第四期；本期保存的仍是平面版畫） |
| 合宜音量才動；超標、老師暫停、無訊號、結束時全部凍結 | 依 FPS 自動降畫質（第五期） |
| 31～100 位都排得下、不站池塘／小徑／花圃 | |
| 減少動態偏好：不轉鏡頭、不跳動、轉場瞬間完成 | |

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `garden3d/layout.js` | 新增 | 純函式（不依賴 three）：地形高度、池塘／花圃位置、保留區、夥伴座位、公仔縮放 |
| `garden3d/world.js` | 修改 | 改從 `layout.js` 取地形與保留區；移除內建 slots |
| `garden3d/partners.js` | 新增 | 夥伴公仔：座號→固定座位、入園／離開動畫、換頭貼 |
| `garden3d/stage3d.js` | 新增 | 正式版控制器：renderer、相機、動畫迴圈、`setState`／`dispose`／`debug` |
| `garden3d/bridge.js` | 新增 | 偵測 WebGL，掛 `window.Garden3D`，發 `garden3d-ready` 事件 |
| `garden3d/preview.js` | 修改 | 改用 `layout.js` 的座位與縮放（試作頁繼續能用） |
| `garden.html` | 修改 | 加 3D 容器、開關、模組 script |
| `garden/app.js` | 修改 | 開關邏輯、每次 render 推狀態、測試用 debug 掛勾 |
| `garden/garden.css` | 修改 | 3D 容器與開關樣式 |
| `tools/stamp_garden.py` | 修改 | 也幫 `garden3d/*.js` 的 import 加內容雜湊 |
| `tests/garden3d_layout_test.mjs` | 新增 | layout 單元測試 |
| `tests/test_garden3d.py` | 新增 | 瀏覽器整合測試（SwiftShader） |

---

### Task 1: layout.js（純座位與地形）

**Files:**
- Create: `garden3d/layout.js`
- Test: `tests/garden3d_layout_test.mjs`

- [ ] **Step 1: 寫失敗的測試**

```js
// tests/garden3d_layout_test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSlots, figureScale, isReserved, groundY, POND, BEDS } from '../garden3d/layout.js';

const minDist = (s) => { let d = Infinity; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) d = Math.min(d, Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1])); return d; };

test('31 seats fit, stay off reserved areas and keep figures apart', () => {
  const s = generateSlots(31);
  assert.equal(s.length, 31);
  s.forEach(([x, z]) => assert.equal(isReserved(x, z), false, `slot ${x},${z} is reserved`));
  assert.ok(minDist(s) >= 1.4, 'min distance ' + minDist(s));
});

test('100 seats still fit without overlap', () => {
  const s = generateSlots(100);
  assert.equal(s.length, 100);
  assert.ok(minDist(s) >= 0.9, 'min distance ' + minDist(s));
});

test('seats are deterministic and clamp to 1..100', () => {
  assert.deepEqual(generateSlots(31), generateSlots(31));
  assert.equal(generateSlots(0).length, 1);
  assert.equal(generateSlots(500).length, 100);
});

test('figures shrink only for large classes', () => {
  assert.equal(figureScale(31), 0.82);
  assert.equal(figureScale(45), 0.82);
  assert.ok(figureScale(100) < 0.6 && figureScale(100) >= 0.5);
});

test('pond centre and flower beds are reserved; pond floor is below the meadow', () => {
  assert.equal(isReserved(POND.x, POND.z), true);
  BEDS.forEach(([x, z]) => assert.equal(isReserved(x, z), true));
  assert.ok(groundY(POND.x, POND.z) < -0.2);
  assert.ok(Math.abs(groundY(-3, 3)) < 0.3);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/garden3d_layout_test.mjs`
Expected: FAIL，`Cannot find module ... garden3d/layout.js`

- [ ] **Step 3: 寫 layout.js**

```js
// garden3d/layout.js
// Pure layout for the 3D garden (no three.js): terrain height, reserved areas, partner seats.
export const POND = { x: 4.4, z: 0.6, rx: 3.4, rz: 2.2 };
// [x, z, radius] — four flower beds (design v0.1: blooms stay in the corners / beds)
export const BEDS = [[-4.2, 5.7, 1.25], [-7.0, 0.4, 1.3], [5.4, 5.7, 1.2], [1.2, -2.7, 1.2]];
export const pondE = (x, z) => ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;

export function groundY(x, z) {
  const r = Math.hypot(x, z), k = Math.min(1, Math.max(0, (r - 7) / 12));
  let h = (0.16 * Math.sin(x * 0.45) * Math.cos(z * 0.38) + 0.08 * Math.sin(x * 1.1 + z * 0.7)) * (0.35 + 0.65 * k) + k * k * 1.6;
  const e = pondE(x, z);
  if (e < 1.25) h = h * Math.max(0, (e - 1) / 0.25) - 0.28 * Math.min(1, (1.25 - e) / 0.35);
  return h;
}

// Pond (and its banks), the bridge line, the stepping-stone path and flower beds never get a partner.
export function isReserved(x, z) {
  if (pondE(x, z) < 2.2) return true;
  if (Math.abs(x - (POND.x - 0.4)) < 1.2 && z > -3.2 && z < 4.4) return true;
  if (Math.abs(x - 0.45) < 0.7 && z > 1.2) return true;
  return BEDS.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r * 0.85);
}

// Meadow = left / centre area plus a front strip in front of the pond.
const onMeadow = (x, z) => z >= -2.2 && z <= 7.2 && x >= -9.6 && (x < 1.3 || (z > 4.9 && x < 8.2));
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

function grid(spacing) {
  const out = [];
  let row = 0;
  for (let z = -2.0; z <= 7.2; z += spacing * 0.75, row++) {
    for (let x = -9.6 + (row % 2) * spacing / 2; x <= 8.2; x += spacing) {
      if (onMeadow(x, z) && !isReserved(x, z)) out.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
    }
  }
  return out;
}

// Staggered hex grid that shrinks until `count` seats fit; ordered centre-first with a fixed jitter
// so a partial class is spread out rather than packed in one corner.
export function generateSlots(count) {
  const n = Math.max(1, Math.min(100, Math.floor(count) || 1));
  let spacing = 1.6;
  for (let tries = 0; tries < 40; tries++) {
    const g = grid(spacing);
    if (g.length >= n) {
      return g.map(([x, z]) => [x, z, Math.hypot(x + 0.8, (z - 3.4) * 1.1) + hash(x, z) * 5])
        .sort((a, b) => a[2] - b[2]).slice(0, n).map(([x, z]) => [x, z]);
    }
    spacing *= 0.95;
  }
  throw new Error('garden3d: cannot fit ' + n + ' partners');
}

export function figureScale(count) {
  return count <= 45 ? 0.82 : Math.max(0.5, 0.82 * Math.sqrt(45 / count));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/garden3d_layout_test.mjs`
Expected: 5 passed（實測 31 位最小距離 1.44、100 位 0.95）

- [ ] **Step 5: Commit**

```bash
git add garden3d/layout.js tests/garden3d_layout_test.mjs
git commit -m "feat(garden3d): layout.js 座位與地形純函式＋單元測試"
```

---

### Task 2: world.js 與試作頁改用 layout.js

**Files:**
- Modify: `garden3d/world.js`（先備份 `garden3d/world.js.bak`）
- Modify: `garden3d/preview.js`（先備份 `garden3d/preview.js.bak`）

- [ ] **Step 1: 備份**

```bash
cp garden3d/world.js garden3d/world.js.bak && cp garden3d/preview.js garden3d/preview.js.bak
```

- [ ] **Step 2: world.js 改 import，刪掉重複定義**

在 `import * as THREE ...` 下一行加：

```js
import { POND, BEDS, pondE, groundY } from './layout.js';
```

刪除 world.js 內的這些區塊（它們現在由 layout.js 提供）：
- `const POND = { x: 4.4, z: 0.6, rx: 3.4, rz: 2.2 };`
- `const pondE = (x, z) => ...;`
- 整個 `function groundY(x, z) { ... }`
- `const BEDS = [[-4.2, 5.7, 1.25], ...];`
- 整段 `const slots = (() => { ... })();`（含上方註解行）

把最後的 return 改成：

```js
  return { groundY, POND, update, setStage, get stage() { return stage; }, get mood() { return mood; } };
```

- [ ] **Step 3: preview.js 改用 generateSlots／figureScale**

把

```js
import { createWorld, STAGE_NAMES } from './world.js';
```

改成

```js
import { createWorld, STAGE_NAMES } from './world.js';
import { generateSlots, figureScale } from './layout.js';
```

把

```js
const MAX_PARTNERS = 31, FIG_SCALE = 0.82;
```

改成

```js
const MAX_PARTNERS = 31, FIG_SCALE = figureScale(MAX_PARTNERS);
```

把

```js
const { groundY, slots } = world;
```

改成

```js
const { groundY } = world;
const slots = generateSlots(MAX_PARTNERS);
```

- [ ] **Step 4: 手動驗證試作頁**

Run（另一個終端）: `python -m http.server 8765`，瀏覽 `http://127.0.0.1:8765/garden3d-preview.html`
Expected: 8 位夥伴載入、按「全員 31 位到齊」後 31 位、8 個階段按鈕可切換、主控台無錯誤。（Task 4 會把這項寫成自動測試。）

- [ ] **Step 5: Commit**

```bash
git add garden3d/world.js garden3d/preview.js
git commit -m "refactor(garden3d): world 與試作頁改用 layout.js"
```

---

### Task 3: partners.js（夥伴公仔管理）

**Files:**
- Create: `garden3d/partners.js`

設計重點：
- 座號→座位索引在入園時決定，之後不變（別人離開也不會讓其他人跳位）。
- 入園／離開動畫用**牆上時間**（`now`），因為「休息一位」發生在超標時（此時花園時鐘凍結），學生離開仍要立刻看得到。
- 搖擺等動作用**花園時鐘**（`clock`），凍結時一起停。
- 頭貼載入失敗時保留底座與號碼牌，不讓整個花園壞掉。

- [ ] **Step 1: 寫 partners.js**

```js
// garden3d/partners.js
// Partner figures in the 3D garden: stable seat -> slot, arrive / leave animations, avatar swaps.
import * as THREE from '../vendor/three/three.module.min.js';
import { puffyFor, labelTexture } from './figures.js';
import { generateSlots, figureScale, groundY } from './layout.js';

const MOTIONS = ['sway', 'hop', 'turn', 'float'];
const baseGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.09, 24);
const baseMat = new THREE.MeshStandardMaterial({ color: '#eadcc0', roughness: 0.6 });
const labelGeo = new THREE.PlaneGeometry(0.66, 0.23);
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

export class Partners {
  constructor(scene, home) {
    this.scene = scene;
    this.home = home; // audience position: figures face it, so camera sway shows their thickness
    this.items = new Map();
    this.capacity = 31;
    this.slots = generateSlots(31);
    this.scale = figureScale(31);
  }

  setCapacity(n) {
    const cap = Math.max(31, Math.min(100, Math.floor(n) || 31));
    if (cap === this.capacity) return;
    this.capacity = cap;
    this.slots = generateSlots(cap);
    this.scale = figureScale(cap);
    this.items.forEach((it) => this.place(it));
  }

  freeSlot() {
    const used = new Set();
    this.items.forEach((it) => { if (!it.leaving) used.add(it.slot); });
    for (let i = 0; i < this.slots.length; i++) if (!used.has(i)) return i;
    return -1;
  }

  place(it) {
    const [x, z] = this.slots[it.slot];
    it.group.position.set(x, groundY(x, z), z);
    it.group.rotation.y = Math.atan2(this.home.x - x, this.home.z - z);
  }

  // list: [{seat, avatar}] = model.visible(); now: wall-clock seconds; instant: skip arrive/leave animation
  sync(list, now, instant) {
    const wanted = new Map(list.map((r) => [r.seat, r.avatar]));
    [...this.items.entries()].forEach(([seat, it]) => {
      if (wanted.has(seat) || it.leaving) return;
      if (instant) this.drop(seat); else { it.leaving = true; it.changedAt = now; }
    });
    list.forEach((r) => {
      const it = this.items.get(r.seat);
      if (it && !it.leaving) { if (it.avatar !== r.avatar) this.setAvatar(it, r.avatar); return; }
      if (it) this.drop(r.seat); // came back while still fading out
      const slot = this.freeSlot();
      if (slot >= 0) this.add(r.seat, r.avatar, slot, now, instant);
    });
  }

  add(seat, avatar, slot, now, instant) {
    const group = new THREE.Group(), body = new THREE.Group();
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.04; base.castShadow = base.receiveShadow = true;
    const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(String(seat).padStart(2, '0') + '號'), transparent: true }));
    label.position.set(0, 0.16, 0.56); label.rotation.x = -0.35;
    body.position.y = 0.08;
    group.add(base, body, label);
    const it = { seat, avatar: null, slot, group, body, label, figure: null, motion: MOTIONS[seat % 4], phase: seat * 0.7, changedAt: instant ? -99 : now, leaving: false };
    this.items.set(seat, it);
    this.place(it);
    group.scale.setScalar(instant ? this.scale : 0.0001);
    this.scene.add(group);
    this.setAvatar(it, avatar);
  }

  setAvatar(it, avatar) {
    it.avatar = avatar;
    puffyFor(avatar).then((fig) => {
      if (this.items.get(it.seat) !== it || it.avatar !== avatar) return; // left or changed again meanwhile
      if (it.figure) it.body.remove(it.figure);
      const m = new THREE.Mesh(fig.geo, fig.mats);
      m.castShadow = m.receiveShadow = true; m.position.y = -0.02;
      it.figure = m; it.body.add(m);
    }).catch(() => { /* keep base + seat label; the 2D garden underneath still has the avatar */ });
  }

  drop(seat) {
    const it = this.items.get(seat);
    if (!it) return;
    this.scene.remove(it.group);
    it.label.material.map.dispose(); it.label.material.dispose();
    this.items.delete(seat);
  }

  reset() { [...this.items.keys()].forEach((s) => this.drop(s)); }

  update(clock, now, reduced) {
    [...this.items.entries()].forEach(([seat, it]) => {
      const age = now - it.changedAt, b = it.body;
      if (it.leaving) {
        const k = reduced ? 1 : Math.min(1, age / 0.4);
        it.group.scale.setScalar(Math.max(0.0001, this.scale * (1 - k)));
        if (k >= 1) this.drop(seat);
        return;
      }
      const grow = reduced || age >= 0.7 ? 1 : Math.max(0.0001, easeOutBack(age / 0.7));
      it.group.scale.setScalar(this.scale * grow);
      b.rotation.set(0, 0, 0); b.position.y = 0.08;
      if (reduced) return;
      const k = clock * 2 + it.phase;
      if (it.motion === 'sway') b.rotation.z = Math.sin(k) * 0.07;
      else if (it.motion === 'hop') b.position.y = 0.08 + Math.abs(Math.sin(k * 0.9)) * 0.16;
      else if (it.motion === 'turn') b.rotation.y = Math.sin(k * 0.5) * 0.5;
      else b.position.y = 0.12 + Math.sin(k * 0.7) * 0.06;
    });
  }

  debug() {
    const out = {};
    this.items.forEach((it, seat) => { if (!it.leaving) out[seat] = { avatar: it.avatar, slot: it.slot, x: it.group.position.x, z: it.group.position.z, ready: !!it.figure }; });
    return out;
  }
}
```

- [ ] **Step 2: 語法檢查**

Run: `node --check garden3d/partners.js`
Expected: 無輸出（語法正確；實際行為在 Task 4 的瀏覽器測試驗證）

- [ ] **Step 3: Commit**

```bash
git add garden3d/partners.js
git commit -m "feat(garden3d): partners.js 夥伴公仔管理（固定座位、入園離開、換頭貼）"
```

---

### Task 4: stage3d.js 控制器＋bridge.js＋直接建立的瀏覽器測試

**Files:**
- Create: `garden3d/stage3d.js`
- Create: `garden3d/bridge.js`
- Create: `tests/test_garden3d.py`

- [ ] **Step 1: 寫失敗的測試（直接建立控制器，不經 app.js）**

```python
# tests/test_garden3d.py
"""3D garden checks (SwiftShader WebGL); isolated server, no production requests or student data."""
import functools, http.server, socketserver, sys, threading, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_garden import FAKE  # fake microphone / AudioContext shared with the 2D suite

ROOT = Path(__file__).resolve().parents[1]
GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
NO_WEBGL = "(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return /webgl/.test(k) ? null : g.call(this, k, ...a); }; })();"
UNTIL = "const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };"


class Garden3D(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        cls.server = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%s/' % cls.server.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=GL_ARGS)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def open(self, path='garden.html', width=1366, webgl=True, enable=False):
        ctx = self.browser.new_context(viewport={'width': width, 'height': 768})
        self.addCleanup(ctx.close)
        ctx.add_init_script(FAKE)
        if not webgl:
            ctx.add_init_script(NO_WEBGL)
        if enable:
            ctx.add_init_script("localStorage.setItem('c408_garden_renderer3d','true')")
        page = ctx.new_page(); page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        page.goto(self.url + path)
        return page

    def test_controller_swaps_avatar_and_fits_hundred_partners(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px'; document.body.appendChild(box);
          const g = window.Garden3D.create(box, { reducedMotion: true });
          g.setState({ visible: [{ seat: 1, avatar: 3 }], rosterSize: 31, stage: 0, active: true, reduced: true, idle: false });
          await until(() => g.debug().partners[1] && g.debug().partners[1].ready);
          const a = g.debug().partners[1].avatar;
          g.setState({ visible: [{ seat: 1, avatar: 25 }] });
          await until(() => g.debug().partners[1].avatar === 25 && g.debug().partners[1].ready);
          const b = g.debug().partners[1];
          g.setState({ visible: Array.from({ length: 100 }, (_, i) => ({ seat: i + 1, avatar: i %% 38 })), rosterSize: 100 });
          const pts = Object.values(g.debug().partners); let md = 99;
          for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) md = Math.min(md, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
          g.setState({ idle: true, visible: [] });
          const afterIdle = Object.keys(g.debug().partners).length, stage = g.debug().stage;
          g.dispose();
          return { a, b: b.avatar, ready: b.ready, n: pts.length, md, afterIdle, stage, canvases: box.querySelectorAll('canvas').length };
        }""" % UNTIL)
        self.assertEqual(r['a'], 3)
        self.assertEqual(r['b'], 25)
        self.assertTrue(r['ready'])
        self.assertEqual(r['n'], 100)
        self.assertGreaterEqual(r['md'], 0.9)
        self.assertEqual(r['afterIdle'], 0)
        self.assertEqual(r['stage'], 0)
        self.assertEqual(r['canvases'], 0)
        self.assertEqual(p.errors, [])

    def test_preview_page_still_loads(self):
        p = self.open('garden3d-preview.html')
        p.wait_for_function('window.__garden3d && __garden3d.standees.length >= 8', timeout=60000)
        self.assertEqual(p.locator('#g3-stages button').count(), 8)
        self.assertEqual(p.errors, [])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest tests/test_garden3d.py -q`
Expected: `test_controller_...` FAIL（等 `window.Garden3D` 逾時，因為 bridge.js 還不存在、garden.html 也還沒載入）；`test_preview_page_still_loads` PASS。

- [ ] **Step 3: 寫 stage3d.js**

```js
// garden3d/stage3d.js
// Production 3D garden controller: owns renderer, camera and loop; app.js pushes state via setState().
import * as THREE from '../vendor/three/three.module.min.js';
import { createWorld } from './world.js';
import { Partners } from './partners.js';

export function createGarden3D(container, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'garden-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const world = createWorld(scene);
  const target = new THREE.Vector3(0.2, 1.3, 2.0);
  const home = new THREE.Vector3(target.x, 0, target.z + 13);
  const partners = new Partners(scene, home);
  let state = { visible: [], rosterSize: 31, stage: 0, active: false, reduced: !!options.reducedMotion, idle: true };
  let clock = 0, last = performance.now(), first = true;
  const nowS = () => performance.now() / 1000;

  // next: any subset of {visible, rosterSize, stage, active, reduced, idle}
  function setState(next) {
    const s = Object.assign({}, state, next);
    if (s.idle && (!state.idle || first)) { partners.reset(); world.setStage(0, true); }
    if (s.stage !== world.stage) world.setStage(s.stage, first || s.reduced || Math.abs(s.stage - world.stage) > 1);
    partners.setCapacity(s.rosterSize);
    partners.sync(s.visible, nowS(), first || s.reduced);
    state = s; first = false;
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 54 : camera.aspect < 1.2 ? 46 : 38;
    camera.updateProjectionMatrix();
  }

  function frame(t) {
    const real = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
    const dt = state.active ? real : 0; // noise / teacher pause / no signal / ended: everything holds still
    clock += dt;
    world.update(dt, renderer);
    partners.update(clock, nowS(), state.reduced);
    const aspect = camera.aspect, R = aspect < 0.8 ? 17 : aspect < 1.2 ? 15 : 13.5, H = aspect < 1.2 ? 4.8 : 4.0;
    const a = state.reduced ? 0 : Math.sin(clock * 0.06) * 0.3;
    camera.position.set(target.x + Math.sin(a) * R, target.y + H, target.z + Math.cos(a) * R);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  renderer.setAnimationLoop(frame);

  return {
    setState,
    dispose() { renderer.setAnimationLoop(null); ro.disconnect(); partners.reset(); renderer.dispose(); canvas.remove(); },
    debug() { return { stage: world.stage, mood: world.mood, clock, partners: partners.debug() }; },
  };
}
```

- [ ] **Step 4: 寫 bridge.js**

```js
// garden3d/bridge.js
// Loaded as <script type="module"> after garden/app.js. If this module fails to load (old browser),
// window.Garden3D stays undefined and the garden simply stays 2D.
import { createGarden3D } from './stage3d.js';

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
window.Garden3D = { supported: webglOk(), create: createGarden3D };
window.dispatchEvent(new Event('garden3d-ready'));
```

- [ ] **Step 5: 暫時讓測試能載入 bridge（Task 5 會正式加進 garden.html）**

在 `garden.html` 的 `<script src="garden/app.js?v=...">` 那一行**下面**加：

```html
  <script type="module" src="garden3d/bridge.js"></script>
```

（先備份：`cp garden.html garden.html.bak`）

- [ ] **Step 6: 跑測試確認通過**

Run: `python -m pytest tests/test_garden3d.py -q`
Expected: 2 passed

- [ ] **Step 7: Commit**

```bash
git add garden3d/stage3d.js garden3d/bridge.js tests/test_garden3d.py garden.html
git commit -m "feat(garden3d): 正式版控制器 stage3d.js、bridge.js 與瀏覽器測試"
```

---

### Task 5: 接進 garden.html／app.js（3D 開關）

**Files:**
- Modify: `garden.html`、`garden/app.js`（先備份 `garden/app.js.bak`）、`garden/garden.css`（先備份 `garden/garden.css.bak`）
- Test: `tests/test_garden3d.py`

- [ ] **Step 1: 加整合測試（先失敗）**

在 `tests/test_garden3d.py` 的 `class Garden3D` 裡、`test_preview_page_still_loads` 後面加：

```python
    def test_default_is_2d_and_toggle_persists(self):
        p = self.open()
        p.wait_for_function("window.Garden3D !== undefined")
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '2d')
        self.assertTrue(p.locator('#garden-3d').is_hidden())
        self.assertEqual(p.locator('#garden-3d canvas').count(), 0)
        p.check('#garden-3d-toggle')
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '3d')
        self.assertEqual(p.locator('#garden-3d canvas').count(), 1)
        p.reload()
        p.wait_for_function("window.Garden3D !== undefined && document.body.dataset.renderer === '3d'")
        self.assertTrue(p.is_checked('#garden-3d-toggle'))
        p.uncheck('#garden-3d-toggle')
        self.assertEqual(p.locator('#garden-3d canvas').count(), 0)
        self.assertEqual(p.errors, [])

    def test_without_webgl_toggle_is_disabled(self):
        p = self.open(webgl=False, enable=True)
        p.wait_for_function("window.Garden3D !== undefined")
        self.assertTrue(p.is_disabled('#garden-3d-toggle'))
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '2d')
        self.assertIn('不支援', p.inner_text('#garden-3d-note'))
        self.assertEqual(p.errors, [])

    def test_partners_follow_arrivals_and_freeze_on_teacher_pause(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'timed')
        p.click('#garden-demo'); p.fill('#garden-minutes', '5'); p.fill('#garden-spawn-seconds', '1')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(5500)
        visible = int(p.inner_text('#garden-count').split('/')[0])
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertGreaterEqual(visible, 4)
        self.assertEqual(len(dbg['partners']), visible)
        self.assertGreater(dbg['clock'], 0)
        p.click('#garden-pause')
        held = p.evaluate('window.__gardenDebug3d().clock')
        p.clock.run_for(3000)
        self.assertEqual(p.evaluate('window.__gardenDebug3d().clock'), held)
        self.assertEqual(p.errors, [])

    def test_full_class_reaches_moonlight_and_new_garden_resets(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'direct')
        p.click('#garden-demo'); p.fill('#garden-spawn-seconds', '1'); p.fill('#garden-upgrade-seconds', '5')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(38000)
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertEqual(dbg['stage'], 7)
        self.assertEqual(len(dbg['partners']), 31)
        p.on('dialog', lambda d: d.accept())
        p.click('#garden-end'); p.click('#garden-again')
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertEqual(dbg['stage'], 0)
        self.assertEqual(len(dbg['partners']), 0)
        self.assertEqual(p.errors, [])
```

Run: `python -m pytest tests/test_garden3d.py -q`
Expected: 新的 4 項 FAIL（找不到 `#garden-3d-toggle`／`__gardenDebug3d`）

- [ ] **Step 2: garden.html 加容器與開關**

在 `<div id="garden-wildlife" class="garden-wildlife" aria-hidden="true"></div>` 下一行加：

```html
      <div id="garden-3d" class="garden-3d" hidden></div>
```

把

```html
<label>全員到齊後，每 <input id="garden-upgrade-seconds" type="number" min="5" max="300" step="1" value="30"> 秒合宜音量升級一次</label></div>
```

改成

```html
<label>全員到齊後，每 <input id="garden-upgrade-seconds" type="number" min="5" max="300" step="1" value="30"> 秒合宜音量升級一次</label><label class="garden-3d-toggle"><input id="garden-3d-toggle" type="checkbox"> 3D 花園（試作）</label><span id="garden-3d-note" class="garden-3d-note">正在檢查這台裝置能否使用 3D…</span></div>
```

（Task 4 Step 5 已加 `<script type="module" src="garden3d/bridge.js"></script>`，確認仍在 app.js 那行下面。）

- [ ] **Step 3: garden.css 加樣式（檔尾追加）**

```css
.garden-3d{position:absolute;inset:0;z-index:4;pointer-events:none;border-radius:inherit;overflow:hidden}
.garden-3d[hidden]{display:none}
.garden-3d-canvas{display:block;width:100%;height:100%}
.garden-3d-toggle{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.garden-3d-note{font-size:.85em;color:#6b7d68}
```

- [ ] **Step 4: app.js 加開關與狀態推送**

(a) 第 9 行 `var lifeView=...` 那一整行**之後**加一行：

```js
    var g3=null,use3d=read('renderer3d',false)===true;
```

(b) 在 `function render(dt){` 這行**之前**加：

```js
    function g3State(){return {visible:model?model.visible():[],rosterSize:roster.length||31,stage:model?model.stage:0,active:$('garden-scene').dataset.lifeActive==='true',reduced:reducedMotion.matches,idle:!model};}
    function apply3d(){
        var api=window.Garden3D,ok=!!(api&&api.supported),on=use3d&&ok,box=$('garden-3d');
        $('garden-3d-toggle').checked=on;$('garden-3d-toggle').disabled=!ok;
        $('garden-3d-note').textContent=!api?'正在檢查這台裝置能否使用 3D…':!ok?'這台裝置不支援 3D，使用平面花園。':on?'3D 模式：保存的花園畫目前仍是平面版。':'勾選後改用 3D 花園。';
        document.body.dataset.renderer=on?'3d':'2d';box.hidden=!on;
        if(on&&!g3){try{g3=api.create(box,{reducedMotion:reducedMotion.matches});}catch(e){g3=null;use3d=false;write('renderer3d',false);message('3D 花園無法啟動，已改用平面花園。',true);apply3d();return;}}
        if(!on&&g3){g3.dispose();g3=null;}
        if(g3)g3.setState(g3State());
    }
```

(c) 在 `render(dt)` 裡，把

```js
renderFeedback();renderNoise();renderWelcome();
```

改成

```js
renderFeedback();renderNoise();renderWelcome();if(g3)g3.setState(g3State());
```

（只改 `render` 函式內那一處；用 Grep 確認該字串只出現一次。）

(d) 在檔尾 `setPhase('idle');render();showHistory();` **之前**加：

```js
    $('garden-3d-toggle').onchange=function(){use3d=this.checked;write('renderer3d',use3d);apply3d();};
    window.addEventListener('garden3d-ready',apply3d);
    window.__gardenDebug3d=function(){return g3?g3.debug():null;};
```

並把 `setPhase('idle');render();showHistory();` 改成 `setPhase('idle');render();showHistory();apply3d();`

- [ ] **Step 5: 跑 3D 測試**

Run: `python -m pytest tests/test_garden3d.py -q`
Expected: 6 passed

- [ ] **Step 6: 跑平面版回歸（必須全過，證明預設關閉時沒影響）**

Run: `python -m pytest tests/test_garden.py -q`
Expected: 59 passed

- [ ] **Step 7: Commit**

```bash
git add garden.html garden/app.js garden/garden.css tests/test_garden3d.py
git commit -m "feat(garden): 3D 花園開關（預設關、記在瀏覽器、不支援時停用），狀態跟著正式花園"
```

---

### Task 6: stamp_garden.py 也處理 ES 模組 import

**Files:**
- Modify: `tools/stamp_garden.py`（先備份 `tools/stamp_garden.py.bak`）

問題：`garden.html` 只載入 `garden3d/bridge.js`，其他模組是 `import` 進來的；只幫 bridge 加 `?v=` 不夠，`world.js` 改了但網址沒變，iPad 仍會用舊檔。

- [ ] **Step 1: 改 ASSET 規則涵蓋 garden3d／vendor**

把

```python
ASSET = re.compile(r'((?:src|href)=")((?:garden|points)/[^"?#]+)(?:\?v=[0-9a-f]+)?(")')
```

改成

```python
ASSET = re.compile(r'((?:src|href)=")((?:garden|garden3d|points|vendor)/[^"?#]+)(?:\?v=[0-9a-f]+)?(")')
IMPORT = re.compile(r"""((?:from|import)\s*['"])(\.{1,2}/[^'"?#]+\.js)(?:\?v=[0-9a-f]+)?(['"])""")
```

- [ ] **Step 2: 加模組蓋章函式（依賴先蓋，再蓋引用者）**

在 `def main():` 之前加：

```python
def stamp_module(path, done):
    """Stamp ./ and ../ imports inside an ES module with the dependency's content hash (deps first)."""
    path = path.resolve()
    if path in done:
        return done[path]
    text = path.read_bytes().decode('utf-8')

    def repl(m):
        dep = (path.parent / m.group(2)).resolve()
        if not dep.is_file():
            raise SystemExit('missing import: %s in %s' % (m.group(2), path))
        return m.group(1) + m.group(2) + '?v=' + stamp_module(dep, done) + m.group(3)

    if path.suffix == '.js' and 'vendor' not in path.parts:
        new = IMPORT.sub(repl, text)
        if new != text:
            path.write_bytes(new.encode('utf-8'))
            text = new
    done[path] = digest(text.encode('utf-8'))
    return done[path]
```

- [ ] **Step 3: main() 先蓋模組，資產雜湊改用蓋過章的內容**

在 `def stamp(m):` 裡，把

```python
        return m.group(1) + m.group(2) + '?v=' + digest(path.read_bytes()) + m.group(3)
```

改成

```python
        return m.group(1) + m.group(2) + '?v=' + stamp_module(path, done) + m.group(3)
```

並在 `main()` 開頭（`html = PAGE.read_bytes()...` 之前）加：

```python
    done = {}
```

- [ ] **Step 4: 執行兩次確認冪等**

Run:
```bash
python tools/stamp_garden.py && cp garden.html /tmp/g1 && cp garden3d/world.js /tmp/w1 && python tools/stamp_garden.py && cmp garden.html /tmp/g1 && cmp garden3d/world.js /tmp/w1 && echo idempotent
grep -n "?v=" garden3d/*.js garden.html | grep -c "garden3d\|from"
```
Expected: `idempotent`；`garden3d/stage3d.js` 內出現 `from './world.js?v=` 與 `from './partners.js?v=`；`garden.html` 內出現 `garden3d/bridge.js?v=`

- [ ] **Step 5: 再跑兩組測試（import 字串改了不能壞）**

Run: `python -m pytest tests/test_garden3d.py tests/test_garden.py -q`
Expected: 65 passed

- [ ] **Step 6: Commit**

```bash
git add tools/stamp_garden.py garden.html garden3d/ garden/build.txt
git commit -m "fix(garden): stamp_garden 也為 ES 模組 import 加內容雜湊"
```

---

### Task 7: 全面回歸、文件

**Files:**
- Modify: `CHANGELOG.md`、`DECISIONS.md`、`docs/secret-garden-guide.md`、`CLAUDE.md`（frontmatter）、`handoff.md`

- [ ] **Step 1: 全部測試**

Run:
```bash
node --test tests/garden3d_layout_test.mjs
node tests/garden_core_test.js && node tests/garden_life_test.js && node tests/garden_activities_test.js && node tests/garden_discoveries_test.js && node tests/garden_roster_test.js && node tests/points_avatars_sim.js
python -m pytest tests/test_garden.py tests/test_garden3d.py -q
```
Expected: 全部通過（layout 5、node 各檔通過、Playwright 65）

- [ ] **Step 2: 寫文件**

- `CHANGELOG.md` 頂端：版本「Pages <commit> — 3D 花園開關（第一期）」，列出：預設平面、勾選改 3D、8 階段跟正式進度、凍結規則、31～100 位、PNG 仍為平面版、測試數字。
- `DECISIONS.md` 尾端：「3D 疊在平面版之上，平面版照常運作」——原因：PNG／紀錄／59 項測試不受影響、universal 他校預設不變、壞掉可立即退回；棄選：直接取代平面版、iframe 嵌試作頁。
- `docs/secret-garden-guide.md`：新增「3D 花園（試作）」一節：在哪勾選、記在這台瀏覽器、哪些裝置不支援、目前保存的畫仍是平面版、遇到卡頓先取消勾選。
- `CLAUDE.md` frontmatter：更新 `version`、`next_action`、`updated`。

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md DECISIONS.md docs/secret-garden-guide.md CLAUDE.md
git commit -m "docs(garden3d): 第一期 3D 開關文件與使用說明"
```

---

### Task 8: 上線（需老師同意 push）

- [ ] **Step 1: 問老師是否 push**（專案規則：commit 一律做，push 先問）
- [ ] **Step 2: push 後等 Pages 完成**

```bash
git push origin master
gh run list -R wukolo1206/classroom-timer -L 1
```

- [ ] **Step 3: 線上檢查**：`garden.html`、`garden3d/bridge.js?v=...`、各模組 `?v=` 網址皆 200；用 Playwright（GL_ARGS）開線上 `garden.html`，勾 3D → 有 canvas、無頁面錯誤。
- [ ] **Step 4: 交接**：更新 `handoff.md`（目前狀態／本次驗證／下次接續／注意事項），註明「真 iPad 尚未實測」。
- [ ] **Step 5: 請老師課堂確認清單**
  1. 從班級頁面開花園 → 勾「3D 花園（試作）」→ 開始。
  2. 迎來幾位後故意大聲：3D 畫面要立刻停住，安靜後繼續。
  3. 全員到齊後看階段升級；結束、開新花園要回到第 1 階段。
  4. 右上角沒有 FPS；若明顯卡頓就取消勾選，回報裝置型號。

---

## 後續分期路線圖（各期另寫計畫）

| 期 | 內容 | 前提 |
|---|---|---|
| 二 | 3D 夥伴生活：沿用 `garden/life.js` 的五種活動（看花、野餐、澆水、追蝴蝶、閱讀），在 3D 裡做「走到附近點→停留→回座位」＋小道具；避開保留區與其他夥伴 | 第一期課堂確認通過 |
| 三 | 月光後新發現：6 種主景（木橋池塘、小噴水池、兔子石像、小鳥飲水台、花藤拱門、小風車）輪替一個主景；8 種手持道具（6 種球、播種、移苗）；接 `GardenDiscoveries.Session` 的 `themeId`／`activityId` | 第二期 |
| 四 | 3D 畫作保存：`canvas.toBlob`，暫時隱藏號碼牌（「畫作包含座號」未勾時）、不含 HUD；結束時凍結一幀供重試保存 | 第一期 |
| 五 | 效能保護：前 5 秒量 FPS，低於 24 自動降為省電（DPR 1、關陰影），仍低則提示改回平面；可考慮公仔改 InstancedMesh | 第一期 iPad 實測數據 |
| 六 | 預設值翻轉：c408 預設 3D、universal 維持預設平面（另議） | 二～五期完成且課堂穩定 |

## 風險

- **iPad 效能未知**：試作在軟體算圖下才 3～5 FPS，真機未測。第一期預設關閉、一鍵關掉，降低風險；第五期處理自動降級。
- **Playwright 假時鐘與 rAF**：`p.clock.install()` 會接管 `requestAnimationFrame`；若 `test_partners_follow...` 的 `clock > 0` 斷言失敗，代表 rAF 沒被推進，改用 `p.clock.run_for` 前先 `p.clock.resume()` 或在測試中改以 `setState` 推進驗證（不要改正式程式碼去遷就測試）。
- **universal 他校**：開關對他校也可見但預設關；若老師希望他校看不到，可在 `apply3d` 依 `source==='universal'` 隱藏開關（一行），上線前問老師。
