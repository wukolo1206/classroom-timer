---
project: 班級紀錄器
category: 學科工具集
status: 已部署（GAS @19，秩序登記與含氟每週紀錄）
version: GAS 部署 @19（秩序登記加入週一至週五日期切換並統一當日文字）；保留良好表現名單兩欄、右側移除重複秩序項目清單、當週／每週統計、SH150 運動登記快捷連線與列印邊界調整
url: https://script.google.com/macros/s/<見 gas/weburl.txt，已 gitignore>/exec
next_action: 實際使用秩序登記未登記名單、當週累計、每週統計與含氟每週紀錄，確認同步與列印結果
updated: 2026-09-10
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

## 不能動的地方

- **試算表只能動「上課表現紀錄」分頁**。同一份檔案裡的 9月～1月份聯絡簿是老師每天在用的資料，任何腳本都不得寫入或重排。
- **「上課表現紀錄」的欄位順序固定**：`日期 | 座號 | 姓名 | 項目 | 次數 | 最後更新 | 項目代碼`。
  G 欄「項目代碼」是程式比對用的 key，改名或刪除會讓舊紀錄對不上檢查項目。
- **部署一律帶 `--deploymentId <見 gas/weburl.txt，已 gitignore>`**，
  新建部署會產生新網址，大屏與各電腦的書籤就失效。
- **同步一律送絕對值 `setSeatCount`**，不可改回 `+1` 相對值（重送會算錯，見 PITFALLS）。
- **GAS 網址不可寫進程式碼**，repo 是公開的，網址等於寫入權限。
- 名冊姓名一律從試算表或既有程式碼複製，不可憑記憶輸入。

## 部署後驗證清單

`clasp deploy` 後用無痕視窗開 GAS 網址確認：

1. 四個分頁都在，順序符合雲端設定，⚙️ 可開分頁順序視窗
2. 切到秩序登記：狀態列顯示「☁ 已同步至試算表」（不是「⚠ 待同步」或「○ 本機模式」）
3. 檢查項目與座位表是雲端那份（不是預設三項）
4. 連點同一人 3 下 → 試算表該列次數精準為 3（驗證佇列沒有重送問題）
5. 測試後把測試列從「上課表現紀錄」刪掉，並還原被測試改動的雲端設定
