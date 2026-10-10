# 工作交接 — 2026-10-10

## 本次小組討論改善（GAS @32／全校版 v1.13）

### 目前狀態

408／全校版已有「進入投影／返回備課」、放大任務與揭曉、輪抽進度提示、明確加分與上一筆復原。root 已同步 gas/index.html。使用者已授權發布；GAS 已更新為 @32 且網址不變，全校版 v1.13 隨本次提交發布。

### 本次驗證

- `python -B -m unittest discover -s tests -p "test_group_discussion.py" -v`：17 項通過。
- 最後補上投影上方輪抽進度後，再跑 `-k projection`：兩版 2 項通過（含選取加分後同屏及返回討論）。
- `python -B -m unittest discover -s tests -p "test_seat_*.py" -v`：43 項通過；`node tests/seat_backend_sim.js`：20 項通過。
- 兩版本機截圖檢視 1366×768、1024×768、390×844；預設任務與 8 組分數在大屏同屏，手機保留捲動且無水平溢出。JS 語法及 root／gas 一致性通過，內嵌工具原文未改。
- 使用暫存檔與獨立瀏覽器，GAS 使用既有 mock；未連線正式試算表。

### 下次接續

開正式頁面 → 小組討論 → 進入投影，讓老師確認教室可讀性、任務長度、加分與抽籤流程。討論階段、角色分工、各組不同人數／缺席排除另批處理；既有秩序與 SR 待辦繼續保留在下方。

### 注意事項

分數與輪抽進度只存本機；復原不跨重新整理。完整備份包含全校版新進度鍵。抽完須按重設才開新輪；修改候選範圍暫時隱藏已抽候選，不自動重開。現有程式碼修改前已建 .bak；未修改後端、試算表結構或內嵌 SR／SH150 原文。

## 已完成
- **📚 SR 閱讀小卡分頁**（把 408 的 SR 轉換與小卡列印做成全校通用）
  - 全校版 `universal.html` v1.11 起：名冊讀班級設定、依學年度學期保存（`115-1`）、畫面遮罩、A4 八格小卡（右邊家長說明 QR Code、功能說明 12pt）、家長說明頁 `sr-reading/parent.html`、下載空白範本、匯入時可用檔案名冊更新班級名冊、班級設定貼「座號＋姓名」會依座號排（跳號自動空號）。
  - 408 版 `index.html`（GAS @26 起）：名冊讀 seatRoster，資料 `c408_sr_records` 同步到 GAS 文件屬性（`getSrRecords`／`saveSrRecords`，分段存）。
  - 原始檔 `sr-reading/sr-tool.html`，`python tools/embed_sr.py` 同時嵌入兩版並複製到 gas/index.html。
  - 使用說明網頁補 SR 章節與截圖。
- **秩序登記「每節課分開記錄」**（408 GAS @27→@31、全校版 v1.12）
  - 9 個時段（早自習、第 1～7 節、午休）依碧華作息自動跳節、可手動；全天只看不登記；未分節（舊紀錄）可看可改；統計可自訂日期與節次篩選、逐節明細 CSV。
  - 試算表「上課表現紀錄」新增 H 欄「節次」（A～G 不動）。
  - 設計 `docs/2026-10-10-seat-period-design.md` v0.4：設計 2 輪＋程式碼 4 輪交叉審查，所有高優先問題已處理（附錄 A～F）。
  - 修正既有 bug：「合併匯入」原本會整份覆蓋試算表。
- 部署前唯讀備份腳本 `tools/backup_seat_sheet.py`（失敗以非 0 結束，部署用 `set -e` 串接）。

## 目前進度
本批版本為 GAS @32、GitHub Pages 全校版 v1.13（408 本機版一併發布）。本批小組 17 項、座位 unittest 43 項、後端模擬 20 項通過；之前 @31 的完整測試為 111 項。正式試算表未作測試。

## 未完成／待確認
- **教室實機試用秩序分節**：大屏與筆電先重新整理；看自動跳節、統計篩選是否順手。
- **408 SR 分頁實機確認**：匯入 `G:\我的雲端硬碟\碧華國小班級\116碧小408\01_班級日常營運\閱讀能力與SR適性診斷\408_SR登記_四上至五下.xlsx`，確認列印小卡、匯出試算表、家長說明信、筆電與教室電腦同步。
- 程式碼審查是否再送一輪：建議收斂（最近三輪的高優先都在「瀏覽器儲存已滿」之後的極端路徑）。審查包 `docs/2026-10-10-seat-period-code-review_審查包.md`（目前內容是第 4 輪）。
- Word 版說明 `docs/班級工具箱使用說明.docx` 尚未補 SR 章節（轉檔腳本不在 repo）。

## 下一步
1. 收集教室實機試用回饋（秩序分節、SR 分頁），有問題再修。
2. 換學期（2027-02）前：更新 `CTU_SEMESTER`（universal.html）與 408 版 `window.CTU_SEMESTER`（index.html 的 SR 介面區塊），並處理 PITFALLS「含氟與 SH150 舊紀錄會套上新學期日期」。

## 注意事項
- **秩序登記**：不可退回舊 7 欄後端（會把不同節次的列當同一列覆寫）；要回復就把 `SEAT_PERIOD_UI` 改 false 再部署。節次代碼在 `gas/Code.gs` `SEAT_PERIOD_TEXT` 與兩版 `SEAT_PERIODS` 三處必須一致。清除與匯入一律經 `seatCommitDestructive`（先寫保護標記 → 寫本機 → 存佇列）。
- **部署 GAS 前**：`python tools/backup_seat_sheet.py && ...clasp push && clasp deploy --deploymentId <既有>`，用 `set -e`／`&&`，備份失敗就停（@29 曾因用換行串接而無備份部署，事後比對資料無損，見 PITFALLS）。
- **SR 改功能**：改 `sr-reading/sr-tool.html` 後跑 `python tools/embed_sr.py`；原始檔不可出現 `<\!--`、`<\/script`。
- 全校版只寫 `ctu_` 開頭的 key；408 SR 用 `c408_` 前綴（GitHub Pages 同網域）。
- `backups/` 含學生姓名，已 gitignore，不可推上 GitHub。
- `.git/AUTO_MERGE.lock` 舊檔讓每次 commit 出現警告，不影響 commit。
