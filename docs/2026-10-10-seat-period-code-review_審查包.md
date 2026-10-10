# 程式碼審查包（第 4 輪）：秩序登記「每節課分開記錄」修正驗收

請你擔任資深前端／Google Apps Script 工程師。上一輪你驗收通過前一輪的 5 條，另重現 3 條新問題（高 2、中 1）。實作者已處理並部署（GAS @30）。這一輪請**驗收這 3 條**，並找修正本身有沒有引入新問題。

---

## 一、審查指引（請照做）

1. **範圍**：commit `49e1afe`（`git show 49e1afe -- gas/Code.gs index.html universal.html tests/`）。之前的程式只在你發現「同類問題沒被涵蓋」時提出。
2. 第一件事：用你上一輪的重現方式，**逐條驗收下表 3 條**，回覆「已修正（附驗證方式）」或「未修正／部分修正（附重現）」。
3. 接著找新問題，只挑問題、不要稱讚；附檔案與函式名稱（或行號），註明「已重現」或「推測」。
4. 格式同前：`[A-高] index.html seatRestoreFailed …問題…；重現：…；建議：…`（A Bug／B 競態／C 相容性／D 維護性／E 測試缺口）。
5. 不要修改檔案、不要部署、不要連線正式試算表。
6. 沒有高優先問題時，請明確寫「本輪無高優先意見」。實作者打算在本輪沒有高優先意見時收斂、停止送審。

---

## 二、上一輪 3 條與修正（請逐條驗收）

| # | 上一輪問題 | 修正 | 測試 |
|---|---|---|---|
| A-高 1 | 還原失敗留下做到一半的資料；全校版新項目占住空間讓舊紀錄寫不回去；408 版重新整理後殘留資料被補傳 | `seatCommitDestructive` 的 `restore()`：先移除原本不存在的鍵 → 依寫入相反順序還原 → 失敗的再試一次 → 逐一核對。仍失敗時 `seatRestoreFailed(before)`：下載可匯回的救援檔、寫入 `seatRestoreFailed` 旗標、`seatSyncPaused=true`。旗標存在時 `seatSyncPull` 不拉取合併、`seatFlushQueue` 不送出（重新整理後仍成立）、狀態列顯示「本機資料還原失敗」。`seatResolvePaused`：408 版清掉本機紀錄與待送 count、移除旗標後重新拉取（試算表未被改動，是正確版本）；全校版請老師匯入救援檔（覆蓋）後解除 | U09（空間被新項目占住）、U10、R09、R12 |
| B-高 2 | `fn` 刪到一半拋錯後移除「進行中」，重送誤刪新資料 | `seatOpTouched_`：`deleteSeatRowsWhere_` 刪第一列前、`clearSeatAllV2` 刪除前、`importSeatRecordsV2` 寫入前設為 true；`withSeatOp_` 只有 `seatOpTouched_ === false` 時才移除「進行中」，否則維持，重送即「結果不確定」 | 後端「刪到一半出錯…」「還沒動到試算表就失敗…」「取代匯入：寫入失敗…」 |
| A-中 3 | 前端匯入只正規化座號，節次別名 `#?第3節` 與後端不一致 | `seatNormSlot`（與後端 `slotOfRow_` 同規則）；`finishSeatImport` 以正規化時段合併；`seatValidateImport` 以正規化後的「時段｜座號｜項目」檢查重複 | R11 |

---

## 三、實作者自己想請你特別看的地方

1. 408 版的處理方式「清掉本機紀錄、用試算表重建」：如果本機有**尚未同步**、雲端沒有的登記（例如網路斷線時登記的），重建會讓它們消失。`seatResolvePaused` 只保留非 count 工作。這個取捨是否可接受，或應該先提示並下載本機現況？
2. `seatRestoreFailed` 下載救援檔用 `downloadSeatFile`（Blob＋`<a download>`）；GAS 網頁的 iframe sandbox 是否會擋下載而讓老師拿不到救援檔？（現有「匯出秩序資料」也用同一方式）
3. `seatOpTouched_` 是 GAS 全域變數；同一次執行內若連續呼叫多個 `withSeatOp_`（目前沒有），旗標會互相影響——是否需要改成區域狀態？
4. `seatNormSlot` 只把「對照表內的中文節次名稱」轉成代碼；對照表外的文字（如 `#?補課`）仍保留。若老師在試算表手動把 H 欄改成「第 3 節」（有空格），會變成對照表外的獨立時段——是否需要更寬鬆的比對？

---

## 四、檔案與測試

本機路徑：`D:\備課ai\班級計時器\`（GitHub `wukolo1206/classroom-timer` master 已包含 `49e1afe`）

- 設計：`docs/2026-10-10-seat-period-design.md`（v0.4，附錄 E 是上一輪處理紀錄）
- 程式：`gas/Code.gs`、`index.html`（＝`gas/index.html`）、`universal.html`
- 測試：`tests/seat_backend_sim.js`（20 項）、`tests/test_seat_period_408.py`（28 項）、`tests/test_seat_period_universal.py`（10 項）

```
node tests/seat_backend_sim.js
python -B -m unittest discover -s tests -p "test_seat_*.py" -v
python -B -m unittest discover -s tests -p "test_*.py"        # 全部 107 項
```

已部署：408 GAS @30、GitHub Pages（408 本機版、全校版）皆為 `49e1afe`，線上檔案與本機一致。
