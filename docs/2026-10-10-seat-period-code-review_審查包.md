# 程式碼審查包：秩序登記「每節課分開記錄」實作

請你擔任資深前端／Google Apps Script 工程師，審查這次**已實作的程式碼**（不是設計）。設計已經過兩輪交叉審查並定案（v0.3），這一輪只看「程式有沒有照設計寫對、有沒有新 bug」。

---

## 一、審查指引（請照做）

1. **只挑問題**，不要稱讚、不要重寫整段程式；每條附**檔案與函式名稱（或行號）**。
2. 優先找：會**遺失或寫錯資料**的 bug、同步競態、舊資料／舊頁面相容、邊界情況（跨午夜、空資料、未分節、對照表外的節次）、GAS 執行限制。
3. 能的話請**實際執行**測試或用 Node／瀏覽器重現；重現過的請註明「已重現」，推測的請註明「推測」。
4. 每條標優先級（高／中／低）並分類：
   - A. Bug（行為和設計不符、會出錯）
   - B. 競態／同步問題
   - C. 相容性（舊資料、舊佇列、還開著的舊頁面）
   - D. 可讀性／維護性（只列會造成之後改錯的，不列風格偏好）
   - E. 測試缺口（設計 §5 驗收項目沒被測到，或測試本身寫錯）
5. 固定格式，一條一行開頭：`[A-高] gas/Code.gs importSeatRecordsV2 …問題…；重現：…；建議：…`
6. 設計已定案的取捨（見設計文件附錄 A、B 的「部分採納」理由）請不要再重議，除非程式因此會遺失資料。
7. 沒有高優先問題時，請明確寫「本輪無高優先意見」。

---

## 二、要讀的檔案

本機路徑：`D:\備課ai\班級計時器\`（以本機為準；GitHub `wukolo1206/classroom-timer` master 少了最後一個 commit `bf50312`）

| 檔案 | 內容 |
|---|---|
| `docs/2026-10-10-seat-period-design.md` | **設計 v0.3（規格依據）**，含兩輪審查處理紀錄 |
| `gas/Code.gs` | 後端。重點函式：`getSheet_`、`parseSlot_`、`slotOfRow_`、`validDate_`、`getSeatRecords`、`getSeatRowsRaw`、`withSeatOp_`、`deleteSeatRowsWhere_`、`setSeatCount`、`clearSeatRecords`（舊入口）、`clearSeatSlot`、`clearSeatDay`、`clearSeatAllV2`、`clearSeatAll`／`importSeatRecords`（舊入口，應拒絕）、`importSeatRecordsV2`、`logSeatCheck` |
| `index.html`（408 版） | 前端。同步：`seatQueue`、`renderSyncStatus`、`seatMaskPending`、`seatSyncPull`、`seatSyncPush`、`seatJobCovered`、`seatEnqueueOp`、`seatFlushQueue`、`seatResolvePaused`。節次：`SEAT_PERIOD_UI`、`SEAT_PERIODS`、`seatSlotKey`、`seatParseSlot`、`seatPeriodAt`、`seatActiveSlot`、`seatDayAggregate`、`renderSeatPeriodBar`、`seatResetAuto`、`seatAutoTick`。登記與清除：`getSelectedSeatRecord`、`saveSlotRecord`、`addSeatCount`、`seatClearSlot`、`seatClearDays`、`openSeatModal`、`closeSeatModal`、`renderSeatModalList`、`initSeatPanel`（清除、復原按鈕）、`renderSeatDateTabs`。統計：`seatRangeStartKey`、`seatRangeEndKey`、`seatSlotPass`、`collectSeatStats`、`collectSeatWeeklyStats`、`seatDatesInRange`、`purgeSeatRecords`、`purgeAllSeatRecords`、`exportSeatCsv`、`exportSeatDetailCsv`。匯入：`applySeatImport`、`seatImportRows`、`finishSeatImport`、`mergeSeatRecords`。報告：`buildSeatReport`、`seatSummaryData`、`seatSummaryTitle` |
| `universal.html`（全校版） | 與 index.html 同名函式，從 408 版轉寫：存檔用 `ctuStore`（自動加 `ctu_`）、`SEAT_SYNC=false`（不連試算表）、名冊 `seatRoster[n]` 是 `[遮罩名, 職務, 全名]` |
| `gas/index.html` | 與 `index.html` 相同（GAS 部署用複本） |
| `tests/seat_backend_sim.js`、`tests/test_seat_backend.py` | 後端 Node 模擬（記憶體假試算表跑真的 Code.gs），13 項 |
| `tests/test_seat_period_408.py` | 408 前端＋真的 Code.gs（瀏覽器內模擬 google.script.run，假試算表存 sessionStorage），16 項 |
| `tests/test_seat_period_universal.py` | 全校版，5 項 |
| `DECISIONS.md`、`PITFALLS.md` | 既有決策與踩過的坑（同步送絕對值、本機優先保留、合併匯入覆蓋試算表的舊 bug） |

變更範圍：`git diff ec376d2..bf50312 -- gas/Code.gs index.html universal.html tests/`（約 +2240／−410 行）。

執行測試（需要 Node、Python、Playwright Chromium）：

```
node tests/seat_backend_sim.js
python -m unittest discover -s tests -p "test_seat_*.py" -v
python -m unittest discover -s tests -p "test_*.py"        # 全部 90 項
```

---

## 三、背景與限制（設計文件裡也有，這裡列重點）

- 「上課表現紀錄」分頁：A 日期｜B 座號｜C 姓名｜D 項目｜E 次數｜F 最後更新｜G 項目代碼｜**H 節次（新增）**。A～G 順序與 G 不可改；H 空白＝未分節。程式**只能寫這個分頁**。
- 同步一律送**絕對值**；本機優先保留（拉取時逐格取較大值）。
- GAS 頁面與後端同一次部署；需相容的是「部署當下還開著的舊頁面」與「本機佇列裡的舊工作」。
- 回復手段：`SEAT_PERIOD_UI=false`（畫面不分節、只讀寫未分節），不可退回舊 7 欄後端。
- 已部署：408 GAS @27（不含 `bf50312`：操作紀錄上限 200→100、寫入紀錄失敗不拋錯）、全校版 v1.12。

---

## 四、實作者自己覺得可能有問題、請特別看的地方

1. `seatClearDays`（index.html）：多天清除時逐天呼叫 `seatEnqueueOp`；若中途某一天存佇列失敗，前面幾天已排入但本機還沒改，之後拉取會不會把雲端已清的資料又補回（本機 > 雲端 → 補送）？
2. `universal.html` 的 `saveSeatQueue` 改成 `ctuStore.setItem`，它**吞掉例外**（回傳 false），所以 `seatEnqueueOp` 的 try/catch 在全校版不會觸發。全校版 `SEAT_SYNC=false` 時 `seatEnqueueOp` 直接 return true，目前不影響——請確認沒有其他路徑依賴這個例外。
3. `importSeatRecordsV2` 寫後核對用 `getSeatRecords()` 聚合結果比對；若試算表原本就有「同時段＋座號＋項目」重複的列（舊資料可能有），核對方式是否會誤判或漏判？
4. `seatSyncPull` 在 `seq !== seatDestructiveSeq` 時丟掉回應並設 `seatNeedPull`，等佇列清空才重拉——如果佇列一直有工作（例如網路斷線），設定（檢查項目、座位表）也一直拉不下來，可以接受嗎？
5. `seatAutoTick` 每 30 秒執行；切到別的分頁時也會跑並 `renderSeatChart()`，是否有效能或副作用問題？
6. `seatPeriodAt` 用字串比較 `'HH:MM' >= start`；`SEAT_PERIODS` 若被改成未排序，自動判斷會錯——是否需要防呆？
7. `withSeatOp_` 把整個清除包在文件鎖裡逐列 `deleteRow`；350 列以上時是否有 GAS 執行時間或鎖等待（30 秒）的風險？
