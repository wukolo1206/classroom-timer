# 程式審查請求：班級工具箱 全校通用版 universal.html（v1.4）

你在 `classroom-timer` repo 裡（本機路徑 `D:\備課ai\班級計時器`）。請**只審查、不要修改任何檔案**，把問題整理成下方格式回報。

## 1. 這是什麼

- `universal.html`：給全校老師用的單檔課堂工具（HTML + Tailwind CDN + 原生 JS，沒有建置流程），放在 GitHub Pages：`https://wukolo1206.github.io/classroom-timer/universal.html`
- 分頁：🏃 SH150 運動登記、🗓 含氟每週紀錄（預設顯示）；⏱ 倒數計時、🪑 秩序登記、👥 小組討論（預設隱藏，可在 ⚙️ 打開）
- 資料**只存在各台電腦的瀏覽器 localStorage**，沒有後端。一台教室大屏對一個班
- 從 `index.html`（408 班專用的 GAS 版）複製後刪改，之後兩份分開維護
- 設計文件：`docs/universal-design.md`；決策：`DECISIONS.md` 最後兩節；坑：`PITFALLS.md`

## 2. 檔案結構（universal.html 由上到下）

1. 原本 index.html 的 HTML 與 CSS
2. 全校版新增的視窗：`#class-modal`（班級設定）、`#backup-modal`、`#source-modal`、`#sh150-import-modal`、`#backup-reminder`
3. `<script type="text/plain" id="sh150-source">`：SH150 通用版原始碼整份嵌入。裡面的 `<!--`、`</script` 已跳脫成 `<\!--`、`<\/script`，第一次切到 SH150 分頁時還原後設成 `#sh150-frame` 的 `srcdoc`（同源框架）
4. 第一段 `<script>`（全校版前置）：`ctuStore`（自動加 `ctu_` 前綴的 localStorage 包裝）、`CTU_VERSION`、`CTU_SEMESTER`、班級設定 `ctuGetClass`、`ctuBuildRoster`、姓名遮罩等
5. 第二段 `<script>`（主程式，原 index.html）：所有 `localStorage.` 已換成 `ctuStore.`
6. 第三段 `<script>`（全校版後置）：班級設定視窗、完整備份／還原、清除全部資料、SH150 舊資料帶入、下載原始碼、備份提醒

## 3. 不能違反的規則（以這些為準，不接受重議）

- **同網域共用 localStorage**：`wukolo1206.github.io` 下還有 `sh150-tracker/universal.html`（已分享給其他老師在用）與 `classroom-timer/index.html`。universal.html **只能寫 `ctu_` 開頭的 key**；`sh150_*` 只能讀，絕不能寫或刪；不能碰沒有前綴的 key
- **老師的資料必須在程式更新後保留**：網址不變、key 名稱不變；任何程式邏輯都不能因為更新或改設定而刪掉既有紀錄
- 名冊 `seatRoster[座號] = [畫面用遮罩姓名, 職務(空字串), 全名]`：投影畫面一律用遮罩（`[0]`），列印、CSV、文字報告用全名（`[2]`）
- 檔案裡不能出現 408 學生姓名或任何 GAS 網址
- GAS 同步程式碼還留著，但 `SEAT_SYNC`／`WEEKLY_SYNC`／`GROUP_SYNC` 都寫死 `false`，視為死碼即可
- 監考分頁的 HTML 與 JS 還在檔案裡，但不在分頁清單、使用者到不了，屬於已知取捨

## 4. 請重點檢查

1. **資料隔離**：有沒有任何路徑會寫入或刪除非 `ctu_` 的 key、寫入 `sh150_*`，包含 SH150 框架內的程式
2. **資料保留**（最重要）：
   - 老師改班級人數（變多、變少）、改名冊後，秩序登記、含氟紀錄、小組、SH150 的既有紀錄會不會被刪或錯位？
     例如 `normalizeWeeklyRecords` 會丟掉 `seatRoster` 裡沒有的座號，下次 `saveWeeklyRecordsLocal` 時是否就永久刪除？
   - 未來改版時，有沒有哪裡的寫法容易讓舊資料讀不回來（缺少相容處理的格式假設）？
3. **localStorage → ctuStore 替換的副作用**：原程式是否依賴 `setItem` 失敗時拋出例外、或依賴 `getItem` 回傳值的特殊情況？`ctuStore.setItem` 會靜默吞掉錯誤（例如容量滿）
4. **姓名遮罩**：有沒有該用遮罩卻用了全名（投影畫面外洩），或該用全名卻用了遮罩（列印、報告）的地方
5. **備份與還原**（後置 script 的 `ctuFullBackup`、`ctuRestoreFromFile`、`clearAll`）：先下載備份再重新載入頁面的時序、還原檔驗證、`ctu_meta` 處理是否有漏洞
6. **SH150 嵌入**：跳脫與還原是否完整；框架內讀外層 `ctuSemesterStart`／`ctuSemesterWeeks`／`ctuOpenClassModal` 的時機；匯入 SH150 舊備份檔後的流程
7. **分頁顯示／隱藏**（主程式 `loadTabHidden`、`visibleTabs`、`applyTabOrder`、`switchTab`、檔案最後的開啟分頁邏輯）：全部隱藏、目前分頁被隱藏、倒數計時進行中但分頁被隱藏、舊版存過設定的老師等邊界情況
8. **學期週次**：`ctuSemesterStart` 的覆寫值不是星期一、格式錯誤、跨年時，SH150 週次與含氟日期是否正確
9. **從自己電腦打開（file://）**：下載原始碼後雙擊打開，有沒有功能會壞
10. 其他你看到的錯誤：JS 例外、事件重複綁定、記憶體或計時器沒清掉、手機寬度版面破掉等

## 5. 回報格式（請照這個格式，方便逐條處理）

先用一句話總結整體狀況，接著逐條列出：

```
### 編號. 標題
- 優先級：高 / 中 / 低
- 分類：資料遺失風險 / 資料隔離 / 隱私（姓名）/ 功能錯誤 / 邊界情況 / 可維護性
- 位置：函式名稱＋大約行號
- 問題：發生什麼事
- 重現：具體操作步驟或輸入
- 建議修法：一兩句話即可，不用貼整段程式
```

- 只挑問題與風險，不用稱讚，不要重寫整個檔案
- 不確定的請標「待確認」，不要推測成確定的錯誤
- 若某項重點檢查沒有發現問題，也請寫一句「已檢查，未發現問題」
