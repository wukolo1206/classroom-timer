# 程式碼審查包（第 3 輪）：秩序登記「每節課分開記錄」修正驗收

請你擔任資深前端／Google Apps Script 工程師。上一輪（修正驗收）你回報：10 條中 7 條已修正、第 5／7／8 條部分修正，另有 5 條新問題（高 3、中 2）。實作者已全部處理並部署。這一輪請**驗收這 5 條**，並找修正本身有沒有引入新問題。

---

## 一、審查指引（請照做）

1. **範圍**：commit `c4e1171`（`git show c4e1171 -- gas/Code.gs index.html universal.html tests/`）。之前的程式只在你發現「同類問題沒被涵蓋」時提出。
2. 第一件事：用你上一輪的重現方式，**逐條驗收下表 5 條**，回覆「已修正（附驗證方式）」或「未修正／部分修正（附重現）」。
3. 接著找新問題，只挑問題、不要稱讚；附檔案與函式名稱（或行號），註明「已重現」或「推測」。
4. 格式同前：`[A-高] index.html seatCommitDestructive …問題…；重現：…；建議：…`（A Bug／B 競態／C 相容性／D 維護性／E 測試缺口）。
5. 不要修改檔案、不要部署、不要連線正式試算表。
6. 沒有高優先問題時，請明確寫「本輪無高優先意見」。

---

## 二、上一輪 5 條與修正（請逐條驗收）

實作者判斷這 3 條高優先的根本原因是**順序**：原本「先存佇列 → 再改本機 → 失敗撤回佇列」，撤回本身可能失敗。改成「**先寫本機 → 再存佇列 → 佇列失敗就還原本機**」，最壞情況只剩「操作沒有成功、資料還在」。

| # | 上一輪問題 | 修正 | 測試 |
|---|---|---|---|
| B-高 1 | `seatDropOps` 撤回失敗被吞掉，清除仍送出 | 移除 `seatEnqueueOps`／`seatDropOps`，改 `seatCommitDestructive(writes, ops)`：先記原值並寫本機（任一失敗全部還原、不排入）；再一次寫佇列（失敗則還原本機、佇列保持原樣） | R08、R09 |
| B-高 2 | 撤回沒還原被移除的 count（例如減到 0） | 佇列只在本機成功後寫一次；失敗就整個不寫，原本的 count 保留 | R08 |
| B-高 3 | `done:true` 存失敗後，`done:false` 重送會重做並刪掉後來新增的資料 | `withSeatOp_` 遇到 `done:false` 改丟永久錯誤「結果不確定」，前端暫停讓老師確認；`fn` 拋錯時移除 `done:false` 讓重試正常執行。另修 `saveSeatOpLog_` 存空陣列時根本不寫入的 bug | 後端「進行中紀錄的重送…暫停」「完成紀錄存不進去…不會被重送刪掉」「執行失敗時移除進行中…」 |
| A-中 4 | 匯入失敗只還原紀錄，沒還原項目與座位 | `seatCommitDestructive` 對所有受影響的鍵（紀錄、項目、座位）先記原值，任一失敗全部還原，`localStorage` 原本不存在的鍵就移除 | U08 |
| A-中 5 | 前端匯入保留座號 `05`，與後端 `normSeat_` 不一致 | `finishSeatImport` 把座號正規化為 `String(+seat)`；`seatValidateImport` 拒絕同一時段的別名並存（`05` 與 `5`） | R10 |

---

## 三、實作者自己想請你特別看的地方

1. `seatCommitDestructive` 還原時若也失敗（例如空間持續不足），本機會停在「已清除」但佇列沒有清除工作。實作者認為重新整理後拉取會把試算表資料併回本機，所以不會遺失——請確認全校版（沒有試算表）在這種情況下是否會讓資料**真的消失**。
2. 「結果不確定」的永久錯誤會讓整條佇列暫停，後面的登記也停住，直到老師在畫面上選擇略過。這個體驗是否可以接受？有沒有誤判的情況（例如網路重試而非真的中斷）會頻繁觸發暫停？
3. `withSeatOp_` 的 `fn` 拋錯時移除 `done:false`。如果 `fn` 是在「已經刪掉部分列」之後才拋錯（例如逐列 `deleteRow` 途中出錯），重試會重新執行清除——這裡是否有問題？
4. 匯入正規化座號後，`seatImportRows` 送出的座號也是正規化後的值，與試算表既有的 `05` 舊列在後端會被 `normSeat_` 視為同一人——請確認取代匯入與合併匯入在這種舊資料下的結果正確。

---

## 四、檔案與測試

本機路徑：`D:\備課ai\班級計時器\`（GitHub `wukolo1206/classroom-timer` master 已包含 `c4e1171`）

- 設計：`docs/2026-10-10-seat-period-design.md`（v0.4，附錄 D 是上一輪處理紀錄）
- 程式：`gas/Code.gs`、`index.html`（＝`gas/index.html`）、`universal.html`
- 測試：`tests/seat_backend_sim.js`（19 項）、`tests/test_seat_period_408.py`（26 項）、`tests/test_seat_period_universal.py`（8 項）

```
node tests/seat_backend_sim.js
python -m unittest discover -s tests -p "test_seat_*.py" -v
python -m unittest discover -s tests -p "test_*.py"        # 全部 103 項
```

已部署：408 GAS @29、GitHub Pages（408 本機版、全校版）皆為 `c4e1171`，線上檔案與本機一致。
