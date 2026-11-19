# 3D 花園第四期：3D 畫作保存 PNG — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 模式下按「保存花園畫（PNG）」存的是 3D 畫面（約 1800 px 寬、不含 HUD），「畫作包含座號」決定是否顯示號碼牌；活動結束時先凍結兩個版本供重試。平面模式不變。

**Architecture:** `stage3d.js` 新增 `capture({seats, width})`：暫時調高 pixelRatio、依 `seats` 切換號碼牌、同步 `toDataURL` 後立即還原，回傳 PNG Blob。HUD／噪音提示都是 DOM，本來就不在 WebGL 畫布上。`app.js` 的保存按鈕在有 `g3` 時改走 3D；`finish()` 另存 `finishedArt3d = {plain, seats}`（Promise<Blob>），與平面版 `finishedArt` 同時清除。

**Tech Stack:** three.js r160、Playwright（下載事件）。

---

## 背景

- 平面版保存：`$('garden-save').onclick` 取 `finishedArt[include?'seats':'plain']` 或 `GardenPainting.capture(scene, include)` → `GardenPainting.toPng(svg)` → `GardenPainting.download(blob, '班級花園_YYYY-MM-DD.png')`；`finish()` 存 `finishedArt`；`finishedArt=null;` 出現在開新花園與開始新活動兩處。
- `#garden-save-seats` 為「畫作包含座號」勾選；`#garden-finish-save` 會觸發 `#garden-save`。
- renderer 已開 `preserveDrawingBuffer: true`。`setPixelRatio` 會重設畫布大小並清空，所以必須在還原前同步取 `toDataURL`。

## Task 1: partners 號碼牌開關

- `partners.js` 新增：

```js
  setLabelsVisible(v) { this.labelsVisible = v; this.items.forEach((it) => { it.label.visible = v; }); }
```

  `constructor` 加 `this.labelsVisible = true;`；`add()` 建立 label 後加 `label.visible = this.labelsVisible;`。

## Task 2: stage3d.capture（含測試）

- 測試（`tests/test_garden3d.py`）：

```python
    def test_capture_png_hides_seat_labels_unless_asked(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:450px'; document.body.appendChild(box);
          const g = window.Garden3D.create(box, { reducedMotion: true });
          g.setState({ visible: [{ seat: 1, avatar: 3 }, { seat: 2, avatar: 25 }, { seat: 3, avatar: 13 }], rosterSize: 31, stage: 5, active: true, reduced: true, idle: false });
          await until(() => Object.values(g.debug().partners).every((d) => d.ready));
          const a = await g.capture({ seats: true }), b = await g.capture({ seats: false });
          const ia = await createImageBitmap(a), ib = await createImageBitmap(b);
          const labels = g.debug().labelsVisible, w = box.querySelector('canvas').width;
          g.dispose();
          return { ta: a.type, sa: a.size, sb: b.size, wa: ia.width, wb: ib.width, labels, w };
        }""" % UNTIL)
        self.assertEqual(r['ta'], 'image/png')
        self.assertGreaterEqual(r['wa'], 1600); self.assertEqual(r['wa'], r['wb'])
        self.assertNotEqual(r['sa'], r['sb'])
        self.assertTrue(r['labels'])
        self.assertLess(r['w'], 1600)  # live canvas back to normal resolution
        self.assertEqual(p.errors, [])
```

- `stage3d.js`：

```js
  function dataUrlToBlob(url) {
    const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }
  // One high-resolution frame as PNG. The HUD is DOM, so it is never part of the image.
  async function capture({ seats = false, width = 1800 } = {}) {
    const css = canvas.clientWidth || container.clientWidth || 1, before = renderer.getPixelRatio();
    partners.setLabelsVisible(!!seats);
    renderer.setPixelRatio(Math.min(3, Math.max(1, width / css))); resize();
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png'); // must be read before the size is restored (that clears the buffer)
    partners.setLabelsVisible(true);
    renderer.setPixelRatio(before); resize();
    renderer.render(scene, camera);
    return dataUrlToBlob(url);
  }
```

  回傳物件加 `capture`；`debug()` 加 `labelsVisible: partners.labelsVisible`。

## Task 3: app.js 保存走 3D（含測試）

- 測試：

```python
    def test_save_button_downloads_3d_png_live_and_after_finish(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'timed')
        p.click('#garden-demo'); p.fill('#garden-minutes', '5'); p.fill('#garden-spawn-seconds', '1')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(3000)
        for button in ['#garden-save', None]:
            if button is None:
                p.on('dialog', lambda d: d.accept()); p.click('#garden-end'); button = '#garden-finish-save'
            with p.expect_download() as info:
                p.click(button)
            data = Path(info.value.path()).read_bytes()
            self.assertTrue(info.value.suggested_filename.startswith('班級花園_'))
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            self.assertGreaterEqual(int.from_bytes(data[16:20], 'big'), 1600)
        self.assertIn('已送出', p.inner_text('#garden-save-status'))
        self.assertIn('3D', p.inner_text('#garden-3d-note'))
        self.assertEqual(p.errors, [])
```

- `app.js`：
  1. `var g3=null,use3d=...;` 那行改為 `var g3=null,finishedArt3d=null,use3d=read('renderer3d',false)===true;`
  2. 保存按鈕：把 `var include=$('garden-save-seats').checked,svg=finishedArt?finishedArt[include?'seats':'plain']:window.GardenPainting.capture($('garden-scene'),include);var blob=await window.GardenPainting.toPng(svg);` 改成

```js
var include=$('garden-save-seats').checked,blob;if(g3){blob=await (finishedArt3d?finishedArt3d[include?'seats':'plain']:g3.capture({seats:include}));}else{var svg=finishedArt?finishedArt[include?'seats':'plain']:window.GardenPainting.capture($('garden-scene'),include);blob=await window.GardenPainting.toPng(svg);}
```

  3. `finish()` 中 `finishedArt={...};` 之後加 `finishedArt3d=g3?{plain:g3.capture({seats:false}),seats:g3.capture({seats:true})}:null;`
  4. 其餘兩處 `finishedArt=null;` 改為 `finishedArt=null;finishedArt3d=null;`
  5. `apply3d` 的提示 `'3D 模式：保存的花園畫目前仍是平面版。'` 改為 `'3D 模式：保存花園畫會存 3D 畫面。'`

## Task 4: 蓋章、回歸、文件、上線

- `python tools/stamp_garden.py`；node 測試；`pytest tests/test_garden3d.py tests/test_garden.py`（預期 3D 12、平面 59）。
- 檢視一張 3D 存檔圖（含／不含座號）。
- CHANGELOG、guide（3D 一節移除「PNG 仍是平面版」，改為存 3D 畫面）、handoff、frontmatter。
- 問老師是否 push；上線驗證。
