# 工作交接 — 2026-10-07

## 目前狀態

- **全校通用版（班級工具箱）** `universal.html` **v1.8 已上線**：`https://wukolo1206.github.io/classroom-timer/universal.html`
  - 分頁：SH150、含氟每週紀錄預設顯示；倒數計時、秩序登記、小組討論可在 ⚙️ 打開；共用班級設定、姓名遮罩、完整備份／還原、下載原始碼。
  - v1.6：依 Codex 審查修正資料保護、姓名輸出、跳脫。v1.7：SH150「📤 填報學校本週資料」（預填學校 Google 表單，含填報時間）。v1.8：外框加寬到 1200px，移除 SH150 內重複的班級設定按鈕。
- **408 GAS 版** `index.html`：**@24**（含氟版面、資料保護、跳脫）；GitHub Pages 本機版同步推送。
- **sh150-tracker**（已搬到本專案子資料夾 `sh150-tracker/`，獨立 repo、分支 `main`）：408 版與全校各班通用版（第 18 版）都新增填報學校表單功能，已推送。
- 本專案還有文件 commit（`4833883` sh150-tracker 搬移與規則、本次收工紀錄）**尚未 push**；sh150-tracker 無未推送內容。

## 本次驗證

- 班級工具箱：`tests/test_sh150_school_form.py` 27 項通過（Chromium）；Firefox 抽測計算與複製正常；先前回歸 46＋24＋9＋6 項通過。
- 學校表單（使用者以學校帳號實測、未提交）：導師、班級、學生圈數、導師圈數、填報日期時間（19:31、2027-01-01 00:05）與數字 0 皆正確。
- sh150-tracker：`tests/test_school_form.py` 7 項通過；舊資料逐字比對不變；408 版填報不觸發 GAS 請求。
- 408 版 @24：本機 13 項通過，部署後線上頁面確認載入新程式。
- 三個網頁推送後皆以 curl 確認線上版本。

## 下次接續

1. 使用者曾問「408 計時器能不能內建 SH150」，提出兩案（整頁搬進計時器分頁／只在計時器加讀試算表的填報），使用者取消選擇，尚未決定。
2. 換學期（2027-02）前：處理 PITFALLS 已知風險「含氟與 SH150 舊紀錄會套上新學期日期」，並更新 `CTU_SEMESTER` 與 SH150 開學日。
3. 408 現用秩序項目（存在雲端）尚未換成全校版預設；需使用者從 GAS 版匯出。
4. 視需要 push 本專案的文件 commit。

## 注意事項

- 全校版只能寫 `ctu_` 開頭的 key；`sh150_*`、`408_sh150_records` 等舊名稱絕不可改，同網域共用 localStorage。
- 學校填報：工具只產生連結，不能說「已繳交」；不 POST `formResponse`、不代登入、不上傳照片；計分規則不可放進設定。`sh150-tracker/school-form.js` 與 `universal.html` 的 `ctuSchoolForm` 邏輯相同，改一邊要同步。
- universal.html 的 SH150 嵌入區塊內，`<!--`、`</script` 必須寫成 `<\!--`、`<\/script`。
- sh150-tracker 的 408 版公開程式碼內含 408 的 GAS 與試算表網址（既有狀況，未處理）；`gas/Code.gs` 與 408 `index.html` 也含 408 學生姓名。
- 408 版：部署一律帶既有 deploymentId；root `index.html` 改完要 `cp` 到 `gas/index.html`；試算表只能動「上課表現紀錄」。
- `.git/AUTO_MERGE.lock`（9/11 留下的空檔）讓每次 commit 出現警告，不影響 commit；要刪由使用者決定。
