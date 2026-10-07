# 工作交接 — 2026-10-07

## 目前狀態

- **全校通用版** `universal.html`：線上是 **v1.6**（`https://wukolo1206.github.io/classroom-timer/universal.html`）。
  本機已完成 **v1.7「SH150 每週填報學校 Google 表單」**，已 commit、**未 push**。
- **408 GAS 版**：**@24**（含氟版面、資料保護、跳脫）；GitHub Pages 本機版同一份 `index.html`，已推送。
- `sh150-tracker` 舊網址完全沒動，已分享給其他老師的仍照常使用。
- v1.7 內容：SH150 工具列「📤 填報學校本週資料」→ 核對所選週彙整 → 開啟預填表單或複製文字 → 老師補照片、自己提交；「⚙️ 學校表單設定」可換表單、匯出／匯入設定。只新增 `ctu_school_form_config`。

## 本次驗證

- `python -m unittest discover -s tests -p test_sh150_school_form.py -v`：26 項通過（headless Chromium；C01～C07、S01～S07、U01～U08、D01～D03、R01～R02）。
- Firefox 抽測：計算 4／3 圈與複製正常、無 JS 錯誤；未跑完整矩陣。
- 先前回歸（scratchpad 腳本）：46 項、v1.6 審查 24 項、下載原始碼 9 項、含氟捲軸 6 項皆通過。
- **未驗**：L01 四個核心欄位在真實學校表單的帶入（需學校帳號）；L02 日期時間參數與數值 0 的實際行為。
- 未 push、未部署 GAS、未開啟或提交學校表單。

## 下次接續

1. 用學校帳號開一個獨立分頁，按預填連結確認導師、班級、學生圈數、導師圈數四格位置（不要提交、不要上傳照片），結果記在計畫第 9 節。
2. 請承辦用「預先填寫表單」產生含日期時間的範本，實測 00:05、13:05、跨年後，才在設定中啟用日期自動帶入。
3. 確認後再 push v1.7；push 後在 GitHub Pages 確認版本、預填開啟、複製備援、單檔下載。
4. 換學期（2027-02）前處理 PITFALLS 已知風險：含氟與 SH150 舊紀錄會套上新學期日期。

## 注意事項

- universal.html **只能寫 `ctu_` 開頭的 key**；`sh150_*` 只讀；同網域共用 localStorage，撞名會蓋掉 SH150 舊網址的資料。
- 學校表單：工具只產生連結，**不能說「已繳交」**；不 POST `formResponse`、不代登入、不上傳照片；計分規則不可放進設定。
- 改 `universal.html` 前先備份 `.bak`；改完跑 `tests/test_sh150_school_form.py`。每次發佈要更新 `CTU_VERSION`。
- 408 版：GAS 網址只在 `gas/weburl.txt`；部署一律帶既有 deploymentId；root `index.html` 改完要 `cp` 到 `gas/index.html`；試算表只能動「上課表現紀錄」。
- `.git/AUTO_MERGE.lock`（9/11 留下的空檔）讓每次 commit 出現警告，但不影響 commit；要刪由使用者決定。
