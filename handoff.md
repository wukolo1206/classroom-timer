# 工作交接 — 2026-10-08

## 目前狀態

- **全校通用版（班級工具箱）** `universal.html` **v1.10 已上線**：`https://wukolo1206.github.io/classroom-timer/universal.html`
  - 預設顯示 SH150、含氟每週紀錄；倒數計時、秩序登記、小組討論可在 ⚙️ 打開。共用班級設定、姓名遮罩、完整備份／還原、下載原始碼。
  - v1.6 資料保護（Codex 第一輪）→ v1.7 SH150「📤 填報學校本週資料」→ v1.8 畫面加寬 → v1.9 Codex 第二輪（設定變更、即時填報時間、安全整數、日期對應、就緒檢查）→ v1.10 使用說明。
- **使用說明網頁** `universal-guide.html`：
  - 各章節（§2～§7）已補齊關鍵介面截圖（班級設定、SH150 主畫面、學生登記彈窗、填報學校本週資料、含氟每週紀錄、備份與還原、下載原始碼），截圖存於 `guide-images/`。
  - 截圖使用無個資示範班級名冊與姓名遮罩；支援點擊開啟大圖、RWD 響應式排版與列印樣式優化。
  - 已推送至 GitHub Pages（`https://wukolo1206.github.io/classroom-timer/universal-guide.html`）並確認線上 HTTP 200 正常顯示。
  - Word 版 `docs/班級工具箱使用說明.docx`（A4 共 6 頁，純文字版，如需置入截圖可再更新）。
- **408 GAS 版** `index.html`：**@25**（含氟版面、資料保護、跳脫、計時紀錄逐筆檢查）；GitHub Pages 本機版同步。
- **sh150-tracker**（本專案子資料夾 `sh150-tracker/`，獨立 repo、分支 `main`）：408 版與全校各班通用版（**第 19 版**）都有填報學校表單功能，已推送。
- 兩個 repo 工作區乾淨，皆已與 GitHub 同步。

## 本次驗證

- `tests/test_sh150_school_form.py` 38 項通過（Chromium）；`sh150-tracker/tests/test_school_form.py` 11 項通過。
- 先前回歸（scratchpad 腳本，未納入 repo）：46＋24＋下載原始碼＋含氟捲軸＋408 頁 13 項皆通過。
- 學校表單（使用者以學校帳號實測、未提交）：導師、班級、學生圈數、導師圈數、填報日期時間（19:31、2027-01-01 00:05）與數字 0 皆正確。
- 408 GAS @25 部署後以 curl 確認線上頁面載入新程式；所有網頁推送後皆確認線上版本。
- Word 版說明用 Word 轉 PDF 逐頁檢查排版。**未測**：Firefox 完整測試（只抽測）、Safari、實體平板、實際列印分頁。

## 下次接續

1. 使用者曾問「408 計時器能不能內建 SH150」，提出兩案（整頁搬進計時器分頁／只在計時器加讀試算表的填報），使用者取消選擇，尚未決定。
2. 換學期（2027-02）前：處理 PITFALLS 已知風險「含氟與 SH150 舊紀錄會套上新學期日期」，並更新 `CTU_SEMESTER` 與 SH150 開學日；說明與 Word 版的版本號也要更新。
3. 408 現用秩序項目（存在雲端）尚未換成全校版預設；需使用者從 GAS 版匯出。
4. 之後若功能或畫面有變，記得同步更新 `universal-guide.html` 與 Word 版（Word 版由說明網頁轉出，轉換腳本在 session 暫存區，沒有納入 repo）。

## 注意事項

- 全校版只能寫 `ctu_` 開頭的 key；`sh150_*`、`408_sh150_records` 等舊名稱絕不可改，同網域共用 localStorage。
- 學校填報：工具只產生連結，不能說「已繳交」；不 POST `formResponse`、不代登入、不上傳照片；計分規則不可放進設定。`sh150-tracker/school-form.js` 與 `universal.html` 的 `ctuSchoolForm` 邏輯相同，改一邊要同步（`test_V07` 會比對兩份結果）。
- 每次發佈要更新 `CTU_VERSION`（universal.html）與通用版頁尾「第 N 版」（sh150-tracker/universal.html）。
- universal.html 的 SH150 嵌入區塊內，`<!--`、`</script` 必須寫成 `<\!--`、`<\/script`。
- sh150-tracker 的 408 版公開程式碼內含 408 的 GAS 與試算表網址（既有狀況，未處理）；`gas/Code.gs` 與 408 `index.html` 也含 408 學生姓名。
- 408 版：部署一律帶既有 deploymentId；root `index.html` 改完要 `cp` 到 `gas/index.html`；試算表只能動「上課表現紀錄」。
- `.git/AUTO_MERGE.lock`（9/11 留下的空檔）讓每次 commit 出現警告，不影響 commit；要刪由使用者決定。
