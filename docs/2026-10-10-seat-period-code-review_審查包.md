# 程式碼審查包（第 2 輪）：秩序登記「每節課分開記錄」修正驗收

請你擔任資深前端／Google Apps Script 工程師。上一輪程式碼審查你提出 10 條（高 5、中 5，全部已重現），實作者已全部修正並部署。這一輪請**驗收這些修正**，並找出修正本身有沒有引入新問題。

---

## 一、審查指引（請照做）

1. **範圍**：commit `4fff430`（`git show 4fff430 -- gas/Code.gs index.html universal.html tests/`）。上一輪以前的程式只在你發現「修正沒有涵蓋到的同類問題」時提出。
2. 第一件事：**逐條驗收上一輪 10 條**，每條回覆「已修正（附驗證方式）」或「未修正／部分修正（附重現）」。請用你上一輪的重現方式再跑一次。
3. 接著找新問題，只挑問題、不要稱讚；每條附檔案與函式名稱（或行號），註明「已重現」或「推測」。
4. 分類與格式同上一輪：`[A-高] index.html seatEnqueueOps …問題…；重現：…；建議：…`（A Bug／B 競態／C 相容性／D 維護性／E 測試缺口）。
5. 不要修改檔案、不要部署、不要連線正式試算表。
6. 沒有高優先問題時，請明確寫「本輪無高優先意見」。

---

## 二、上一輪 10 條與實作者的修正（請逐條驗收）

| # | 上一輪問題 | 修正方式 | 對應測試 |
|---|---|---|---|
| A-高 1 | `setSeatCount` 只改第一筆，重複列加總後失準 | 收集所有符合列：第一列設絕對值、其餘刪除；0 全刪。新增 `normSeat_`（`05`＝`5`），讀取、寫入、清除都用 | `seat_backend_sim.js`「同一格有重複列…」 |
| A-高 2 | 匯入用 `normalizeSeatDay` 默默丟掉錯誤次數，覆蓋變清空 | 新增 `seatValidateImport`，在 `importSeatData` 讀檔時嚴格檢查，任一處不合格整份拒絕 | `test_seat_period_408.py` R03、`test_seat_period_universal.py` U07 |
| A-中 3 | V2 匯入用原始字串當識別鍵 | 識別鍵改 `slotOfRow_(p.date, p.h)`＋`normSeat_`，寫入前就擋別名重複 | 後端「座號 05 與 5、#?第3節 與 #3…」 |
| A-中 4 | 全天模式按復原會刪資料 | 處理器先檢查 `seatActiveSlot()===null` 再取出堆疊；`renderSeatChart` 在全天時停用「復原」「清除本節」按鈕 | R04、U07 |
| A-中 5 | 全校版存檔失敗仍回報匯入成功 | 新增 `seatWrite`（拋錯或回傳 false 都算失敗）；`finishSeatImport` 任一寫入失敗就撤回佇列、嘗試還原、保留視窗、不回報成功 | U06 |
| B-高 6 | 清除完成後才到的舊拉取回應會復活資料 | `seatFlushQueue` 成功處理器：非 count 工作完成時 `seatDestructiveSeq++`，讓先前發出的拉取作廢 | R01（模擬器分開「執行」與「回覆」時間） |
| B-高 7 | 多天清除中途失敗留下一半 | `seatEnqueueOp` 改為 `seatEnqueueOps(ops)`：一次存整批、**先不送**；呼叫端改本機成功才 `seatFlushQueue()`，失敗 `seatDropOps(ids)` 撤回 | R02 |
| B-高 8 | 操作紀錄全存不進去時去重失效 | `withSeatOp_`：執行前先存 `{id, done:false}`，存不進去丟暫時錯誤（前端重試、不執行）；完成後改 `done:true` 並存結果；遇到 `done:false` 的重送會重新執行 | 後端「操作紀錄完全存不進去時不執行清除」「上次執行到一半…重新執行」、R07（回覆遺失只執行一次） |
| E-中 9 | 模擬器把執行與回覆一起延遲 | 模擬器新增 `__respDelay`（執行後延遲回覆）、`__lostReply`（執行後回覆遺失） | R01、R07 |
| E-中 10 | 失敗情境、跨午夜、指定座號清除未測 | 新增 R05（跨午夜）、R06（清除單一學生不影響同節其他人的待送工作） | R05、R06 |

---

## 三、實作者自己想請你特別看的地方

1. `withSeatOp_` 遇到 `done:false` 的紀錄會**重新執行**清除。情境：上次清除已在試算表完成，但寫 `done:true` 那一步失敗；之後**另一台裝置**新增了同範圍的紀錄；這台重送同一個 opId → 會把另一台的新紀錄刪掉。實作者判斷這是罕見組合且同一台的後續工作都排在清除之後，接受這個風險——請評估是否需要處理。
2. `seatDropOps` 只撤回清除／匯入工作本身；`seatEnqueueOps` 排入時已移除的 count 工作不會放回去。實作者認為之後拉取時「本機 > 雲端」會自動補送，所以可以自癒——請確認在所有路徑都成立（包括全校版沒有拉取）。
3. `seatValidateImport` 拒絕次數為 0 或非整數；舊版本匯出的備份檔是否可能合法地含有 0（例如更舊的版本）而被誤拒？
4. `finishSeatImport` 失敗時呼叫 `seatWrite('seatCheckRecords', before)` 嘗試還原；如果正是因為空間不足才失敗，這次還原也會失敗——此時本機狀態是否可能介於兩者之間？

---

## 四、檔案與測試

本機路徑：`D:\備課ai\班級計時器\`（GitHub `wukolo1206/classroom-timer` master 已包含 `4fff430`）

- 設計：`docs/2026-10-10-seat-period-design.md`（附錄 C 是上一輪處理紀錄）
- 程式：`gas/Code.gs`、`index.html`（＝`gas/index.html`）、`universal.html`
- 測試：`tests/seat_backend_sim.js`（17 項）、`tests/test_seat_period_408.py`（23 項）、`tests/test_seat_period_universal.py`（7 項）

```
node tests/seat_backend_sim.js
python -m unittest discover -s tests -p "test_seat_*.py" -v
python -m unittest discover -s tests -p "test_*.py"        # 全部 99 項
```

已部署：408 GAS @28、GitHub Pages（408 本機版、全校版 v1.12）皆為 `4fff430`，線上檔案與本機雜湊一致。
