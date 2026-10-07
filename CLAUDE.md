---
project: 班級紀錄器
category: 學科工具集
status: 維護中
version: GAS @24
url: https://script.google.com/macros/s/<見 gas/weburl.txt，已 gitignore>/exec
next_action: 讓老師試用全校通用版 universal.html；取得 408 現用秩序項目後換上預設
updated: 2026-10-07
---

# CLAUDE.md — 班級計時器

單檔 HTML 課堂工具（`index.html`），分頁：倒數計時 / 監考 / 秩序登記 / 含氟每週紀錄。

## 技術框架

- 純前端單檔：`index.html`（HTML + Tailwind CDN + 原生 JS，無建置流程）
- 資料預設存瀏覽器 localStorage
- `gas/`：Apps Script 專案，綁定試算表「碧小408四上聯絡簿」
  （`19zxbbVSalkk4OzfVYDWYVwDUKJyyvCBJD_NdKGHKfJA`），`gas/index.html` 是 root 的複本
- 秩序登記的雲端同步只在 GAS 版啟用，靠 `google.script.run` 是否存在判斷

**兩個網址，行為不同：**

| 網址 | 資料 | 更新方式 |
|---|---|---|
| GAS `/exec`（存於 `gas/weburl.txt`，已 gitignore） | 試算表，跨電腦同步 | `clasp push && clasp deploy --deploymentId …` |
| https://wukolo1206.github.io/classroom-timer/ | 該台瀏覽器本機，顯示「○ 本機模式」 | `git push` |
| https://wukolo1206.github.io/classroom-timer/universal.html（全校通用版） | 該台瀏覽器本機，key 一律 `ctu_` 前綴 | `git push` |

## 不能動的地方

- **試算表只能動「上課表現紀錄」分頁**。同一份檔案裡的 9月～1月份聯絡簿是老師每天在用的資料，任何腳本都不得寫入或重排。
- **「上課表現紀錄」的欄位順序固定**：`日期 | 座號 | 姓名 | 項目 | 次數 | 最後更新 | 項目代碼`。
  G 欄「項目代碼」是程式比對用的 key，改名或刪除會讓舊紀錄對不上檢查項目。
- **部署一律帶 `--deploymentId <見 gas/weburl.txt，已 gitignore>`**，
  新建部署會產生新網址，大屏與各電腦的書籤就失效。
- **同步一律送絕對值 `setSeatCount`**，不可改回 `+1` 相對值（重送會算錯，見 PITFALLS）。
- **GAS 網址不可寫進程式碼**，repo 是公開的，網址等於寫入權限。
- 名冊姓名一律從試算表或既有程式碼複製，不可憑記憶輸入。

## 全校通用版 universal.html

- 設計見 `docs/universal-design.md`。從 index.html 複製後分開維護，**改 index.html 不會自動帶到 universal.html**，反之亦然。
- **不可影響 `sh150-tracker/universal.html`**（已分享給其他老師）：同網域共用 localStorage，universal.html 只能寫 `ctu_` 開頭的 key，對 `sh150_*` 只讀。
- **不可寫入 408 學生姓名或 GAS 網址**；名冊一律來自老師自己的班級設定。
- 每學期更新程式頂端 `CTU_SEMESTER`（開學週星期一、SH150 週數）。
- SH150 分頁是嵌入的原版原始碼（`#sh150-source`），更新方式見 DECISIONS。

## 部署後驗證清單

`clasp deploy` 後用無痕視窗開 GAS 網址確認：

1. 四個分頁都在，順序符合雲端設定，⚙️ 可開分頁順序視窗
2. 切到秩序登記：狀態列顯示「☁ 已同步至試算表」（不是「⚠ 待同步」或「○ 本機模式」）
3. 檢查項目與座位表是雲端那份（不是預設三項）
4. 連點同一人 3 下 → 試算表該列次數精準為 3（驗證佇列沒有重送問題）
5. 測試後把測試列從「上課表現紀錄」刪掉，並還原被測試改動的雲端設定
