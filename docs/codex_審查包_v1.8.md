# 程式審查請求：班級工具箱 v1.8＋SH150 學校表單填報（含 sh150-tracker 與 408 @24）

你在 `D:\備課ai\班級計時器`（repo `classroom-timer`，分支 `master`）。子資料夾 `sh150-tracker\` 是**另一個 repo**（`sh150-tracker`，分支 `main`）。
請**只審查、不要修改任何檔案、不要 commit／push、不要部署、不要開啟或提交學校 Google 表單**。重點是**實際運行時可能出錯的地方**，把問題整理成下方格式回報。

## 1. 這次要看的範圍

| 檔案 | 版本 | 說明 |
|---|---|---|
| `universal.html` | v1.8（`CTU_VERSION`） | 全校版單檔。v1.7 新增 SH150「📤 填報學校本週資料」；v1.8 外框改 1200px、移除 SH150 內重複的班級設定按鈕 |
| `index.html`、`gas/index.html` | GAS @24 | 408 專用版（兩份內容相同）。@24 改含氟版面、`ctuParse` 安全解析、`ctuEsc` 跳脫、含氟紀錄保留名冊外座號 |
| `sh150-tracker/school-form.js` | 新增 | 408 版與通用版共用的填報模組（自帶 `sf-` 樣式） |
| `sh150-tracker/index.html` | 408 SH150 頁 | 加填報按鈕與 adapter；本頁會連 408 的 GAS、寫入試算表「SH150運動明細」 |
| `sh150-tracker/universal.html` | 第 18 版 | 已分享給其他老師的 SH150 通用版，加填報按鈕與 adapter |
| `tests/test_sh150_school_form.py`、`sh150-tracker/tests/test_school_form.py` | 新增 | Playwright 驗收（攔截 Google 表單與 GAS） |

背景文件：`CLAUDE.md`（含「子資料夾 sh150-tracker/」一節）、`docs/universal-design.md` 11.6 節、`docs/sh150-school-form-guide.md`、`docs/superpowers/plans/2026-10-07-sh150-school-form.md`、`DECISIONS.md` 最後一節、`PITFALLS.md`。

## 2. 架構重點

- **全校版**：SH150 原始碼放在 `<script type="text/plain" id="sh150-source">`（內含 `<\!--`、`<\/script` 跳脫），第一次切到 SH150 分頁時還原後設為 `#sh150-frame` 的 `srcdoc`（同源框架）。
  - 框架提供 `window.ctuGetSh150ReportSnapshot()`（所選週、記憶體中的 `records`／`teacherRuns` 深拷貝、`rosterCount`、五天含年份日期）；按鈕呼叫外層 `ctuOpenSchoolReport()`。
  - 外層 `window.ctuSchoolForm`：`summarizeWeek`、`validateConfig`、`parsePrefillTemplate`、`buildPrefillUrl`、`buildReportText`、`taipeiNow`。
  - 設定 key：`ctu_school_form_config`（schema 1）。內建預設已標「已核對」，並啟用填報日期時間五個參數 `entry.682543904_year/_month/_day/_hour/_minute`（數字不補零）。
- **sh150-tracker**：兩頁各自用 `<script src="school-form.js">` 加上一段 adapter（`storageKey`、`snapshot`、`classInfo`、`storedWeek`），透過 `SH150SchoolForm.init()` 建立視窗。
  - 408 版：設定 key `408_sh150_school_form_config`；班級固定 `408`；導師姓名以正規式從頁首 `.header-title p` 讀出；`rosterCount` 取 `STUDENTS` 最大座號。
  - 通用版：設定 key `sh150_school_form_config`；班級、導師取 `classConfig`（導師會去掉「老師」字尾）。
- 計分規則：每天全班跳繩加總後 `floor(/200)`，五天相加；導師填原始圈數，不乘 2（學校後台乘）。

## 3. 不能違反的規則（以這些為準，不接受重議）

- **同網域 `wukolo1206.github.io` 共用 localStorage**。以下舊 key **名稱與格式不可改、不可被新功能寫入或刪除**：`sh150_class_config`、`sh150_universal_all_records`、`408_sh150_records`，以及全校版其他 `ctu_*` 運動、名冊、含氟、秩序、小組資料。全校版只能寫 `ctu_` 開頭的 key。
- 填報只產生連結：**不 POST `formResponse`、不代登入、不上傳照片、不宣稱「已繳交」**；計分規則不可放進可更換設定。
- 預填網址只能含 `usp=pp_url`、四個核心 entry、日期五參數；不得帶學生姓名、`authuser`、範本中的其他回答。
- 408 GAS 版：不新建部署；root `index.html` 與 `gas/index.html` 必須一致；試算表只能寫「上課表現紀錄」（以及原本就有的 SH150 API 寫入「SH150運動明細」）。
- 不得在檔案中新增學生姓名或 GAS 網址（408 SH150 頁原本就公開含 GAS 與試算表網址，屬既有狀況，可列為風險但不在本次修正範圍）。

## 4. 請重點檢查（運行上的可能錯誤）

1. **全校版 SH150 嵌入**：v1.8 在嵌入區塊內加了一行 `<\!-- … -->` 註解，請確認還原、`srcdoc` 載入、框架內程式都正常，沒有任何未跳脫的 `<!--`、`</script` 讓區塊提前結束。
2. **快照與外層橋接**：
   - 框架尚未載入、切週中、匯入舊備份後重新載入時，`ctuOpenSchoolReport`、`refreshIfChanged` 的行為是否正確。
   - 是否可能用到舊快照送出數字。
   - `storedMatches` 比對已存檔與記憶體資料時，是否會誤報或漏報。
3. **計算正確性**：`summarizeWeek` 的跳脫鍵、字串數字、負數、小數、`NaN`、`Infinity`、名冊外座號、空週、導師額外圈數；確認與 SH150 原本列印表的算法一致（每日全班加總後取整）。
4. **時間與日期**：`taipeiNow` 在不同時區、`hourCycle` 不支援的瀏覽器、午夜、跨年、夏令時間的行為；`String(Number(...))` 不補零的寫法是否有邊界問題；五天日期用 `SEMESTER_START_MONDAY` 推算的跨月、跨年。
5. **預填網址**：`URLSearchParams` 的編碼（中文、`&`、`+`、`#`、空白）；班級選項比對；導師姓名預設值偵測（`OOO 老師`、`OOO`）；`buildPrefillUrl` 在設定無效、未知 schema 時的回傳。
6. **設定讀寫**：`ctu_school_form_config`／`sh150_school_form_config`／`408_sh150_school_form_config` 損壞、陣列、schema 2、過大時的處理；寫入失敗（`QuotaExceededError`）是否誤報成功；匯出、匯入、重設是否只碰本功能 key。
7. **sh150-tracker adapter**：
   - 408 頁首正規式在姓名含空白、全形符號、沒有「老師」時，能否正確取出導師姓名。
   - 頂層 `let records`、`teacherRuns`、`currentWeek`、`classConfig` 在另一段 `<script>` 讀取的時機（`window.onload = loadData` 之前按按鈕？）。
   - `school-form.js` 載入失敗（404、離線、快取舊版）時頁面是否仍可用。
   - `sf-` 樣式是否影響原頁面或列印版面。
8. **408 頁與 GAS**：填報功能本身不應觸發任何 GAS 請求。請確認沒有路徑會呼叫 `saveData`／`syncToCloud`，或改動 `408_sh150_records`。
9. **開啟新分頁**：`window.open(url, '_blank', 'noopener,noreferrer')` 被擋時的備援連結；重複點擊是否開多個分頁；視窗反覆開關後事件是否重複綁定。
10. **剪貼簿**：`navigator.clipboard` 不存在、權限被拒、`file://` 時的備援文字框。
11. **版面**：v1.8 外框 1200px 後，SH150 框架高度 `calc(100vh - 150px)`、手機 375px、平板直式、列印時是否有遮擋或溢出；填報視窗在 SH150 框架內外的 z-index。
12. **408 @24**：`ctuParse` 取代 26 處 `JSON.parse(localStorage…)` 後，原本依賴舊行為的地方（例如回傳 `null` 時的 `|| 預設值`）是否變了語意；含氟上方捲軸同步；`weekly-sync-status` 移位後同步狀態仍正確。
13. **兩份計算邏輯一致性**：`universal.html` 的 `ctuSchoolForm` 與 `sh150-tracker/school-form.js` 是否有任何行為差異。
14. 其他：JS 例外、記憶體或計時器沒清掉、`file://` 開檔（下載原始碼功能）時的差異、Firefox／Safari 相容性。

可以自己跑測試佐證：
```
python -m unittest discover -s tests -p test_sh150_school_form.py -v
cd sh150-tracker && python -m unittest discover -s tests -p test_school_form.py -v
```
測試會攔截 Google 表單與 GAS；若你另外寫實驗腳本，也必須攔截 `docs.google.com` 與 `script.google.com`，絕不能連正式表單或寫入 408 試算表。

## 5. 回報格式

先用一句話總結整體狀況，接著逐條列出：

```
### 編號. 標題
- 優先級：高 / 中 / 低
- 分類：執行錯誤 / 資料遺失風險 / 資料隔離 / 計算錯誤 / 隱私 / 相容性 / 版面 / 可維護性
- 檔案與位置：檔名＋函式名稱＋大約行號
- 問題：發生什麼事
- 重現：具體操作步驟或輸入（是否已實際重現）
- 建議修法：一兩句話即可
```

- 只挑問題與風險，不用稱讚，不要重寫整個檔案
- 不確定的請標「待確認」，不要推測成確定的錯誤
- 每個重點檢查項目都要有結論；沒發現問題就寫「已檢查，未發現問題」
