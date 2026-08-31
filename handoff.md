# 工作交接 — 2026-08-31

## 已完成

### 座位檢查分頁（新功能，index.html 第四個分頁）
- 依 Google 試算表「408雙桌合併座位表」建置座位表：6 排、左中右三區雙桌、走道留空、31 人（無 7 號），卡片顯示座號／姓名／職務
- 兩種登記方式並存：
  - 「✋ 逐項登記」→ 點座位卡片開視窗，逐項 +1／−1，可「清除此人今日紀錄」
  - 先選項目 → 連點座位快速登記（每點一次 +1）
- 計次制：同一天同一項可重複累加，卡片顯示 `●2`
- 「↩ 復原上一筆」可回退誤觸
- 右側統計欄：今日登記 N 次 / M 人，各項目次數與未通過名單（`4 劉宸燁×2`）
- 檢查項目可改文字、換顏色、▲▼ 調順序、新增、刪除（刪除會一併清掉該項紀錄）
- 座位表可在介面上編輯（`4,30 | 29,16 | 28,3` 格式）
- 分頁順序可用分頁列最右邊 ⚙️ 調整，第一個分頁成為開啟時預設畫面
- 「📊 累計次數統計」：每人各項次數與總計，期間可選 全部／近30天／近7天／今日
- 清除功能四種：表格每列 ✕（該生該期間）、指定日期清整天、清除目前期間、清除全部歷史（雙重確認）
- 匯出：CSV 次數表（含 BOM，Excel 直開）、座位資料 JSON 備份；匯入為覆蓋並先確認
- 舊的勾選格式紀錄讀取時自動轉為次數 1（向下相容）

### Google 試算表同步（Apps Script 網頁版）
- 新建 GAS 專案綁在「碧小408四上聯絡簿」（試算表 ID `19zxbbVSalkk4OzfVYDWYVwDUKJyyvCBJD_NdKGHKfJA`）
- 專案檔在 `gas/`：`Code.gs`、`appsscript.json`、`index.html`（root index.html 的複本）
- 寫入「上課表現紀錄」分頁，欄位：`日期 | 座號 | 姓名 | 項目 | 次數 | 最後更新 | 項目代碼`
- 一天一人一項一列，重複登記 +1，減到 0 刪列；LockService 防併發
- 檢查項目與座位表存 DocumentProperties，多台裝置共用設定
- 前端同步層：偵測到 `google.script.run` 才啟用；切到座位分頁拉取試算表資料為準，每筆登記即時上傳，離線排入 localStorage 佇列自動補傳，狀態列顯示「☁ 已同步 / ↻ 同步中 / ⚠ 待同步 N 筆」

### 部署
- GitHub Pages：commit `5364045` 已 push，線上版含累計次數與匯出匯入（本機模式）
- GAS：`clasp push && clasp deploy --deploymentId ... @2` 已完成
- 本機尚有兩個未 push 的 commit：`96962e5`（同步層）、`5e7d817`（清除功能）

## 目前進度

程式碼與部署都完成，**卡在 GAS 匿名存取需要使用者本人先授權一次**。目前匿名開啟該網址回 403「需要存取權」。

## 未完成／待確認

- [ ] **使用者需用 wukolo1206@gmail.com 開啟一次 GAS 網址並按「允許」**（會出現「未經 Google 驗證」警告，需點「進階 → 前往」）
      網址：`https://script.google.com/macros/s/<見 gas/weburl.txt，已 gitignore>/exec`
      （網址另存於 `gas/weburl.txt`，已 gitignore 不進版控）
- [ ] 授權後做端對端實測：無痕匿名開啟 → 登記一筆 → 確認「上課表現紀錄」長出資料列
- [ ] 使用者在 GitHub Pages 版新增的「發出聲音」「坐姿不良」兩個檢查項目只存在該瀏覽器
      → 需在該頁「⬇️ 匯出座位資料」再到 GAS 版「⬆️ 匯入座位資料」，匯入會把項目與座位表推上試算表
- [ ] 決定 GAS 存取層級：目前是 ANYONE_ANONYMOUS（免登入，知道連結就能用）。若要改成必須登入 Google，改 `appsscript.json` 的 `access` 為 `ANYONE` 後重新 deploy
- [ ] 決定是否 push `96962e5`、`5e7d817` 到 GitHub（純備份與版控，與 GAS 同步無關）

## 下一步

1. 請使用者完成 GAS 授權，然後用 Playwright 無痕實測匿名存取與寫入
2. 協助把現有的檢查項目（含新增的兩項）透過 JSON 匯出／匯入帶到 GAS 版
3. 視使用者決定 push 兩個 commit 到 GitHub

## 注意事項

- **試算表只動「上課表現紀錄」分頁**，9月～1月份聯絡簿分頁完全沒碰，維持原樣
- 「上課表現紀錄」原本是空白分頁，標題列由 `getSheet_()` 自動建立
- GAS 用 `HtmlService.createHtmlOutputFromFile`（非 Template），所以 index.html 裡既有的 template literal 不會出問題，不需改寫成字串串接
- `doGet()` 只吐 HTML，不呼叫任何需要 OAuth 的函式（符合專案慣例，避免截斷）
- 部署一律 `clasp deploy --deploymentId <見 gas/weburl.txt，已 gitignore>`，不可新建部署（會換網址）
- 改 root `index.html` 後要 `cp index.html gas/index.html` 再 push，兩份必須一致
- `.gitignore` 已排除 `*.bak` 與 `gas/weburl.txt`
- 名冊姓名務必從試算表或既有程式碼複製，勿憑記憶輸入（曾差點寫錯多個字，如 劉宸燁／柯祉妤／吳芊妤）
- 測試一律用 Playwright 開本機 index.html，不對正式試算表跑寫入測試
