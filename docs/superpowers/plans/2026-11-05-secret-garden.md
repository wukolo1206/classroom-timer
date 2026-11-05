# Secret Garden Implementation Plan

> Inline execution in the existing latest clean worktree; no agents. Use executing-plans, test-driven-development and verification-before-completion.

**Goal:** 平面花園音量遊戲沿用當前計分頭像，保留原計時器與帳本。

**Architecture:** 獨立 garden.html + garden/{core.js,app.js,garden.css,scene.svg}，共用既有 avatars.js；garden/launcher.js 嵌入兩版。新增唯讀 GAS 投影接口。

**Tech Stack:** 原生 JS、SVG、Web Audio、GAS、Node assertion、Playwright。

### 1. 合作流程與頭像推導
- [x] 新增 tests/garden_core_test.js：從公開 API 驗證短聲容忍、連續超標、復原、講解暫停、結束、跨場輪替、頭像更新保留進度、無效名冊拒絕。
- [x] Run `node tests/garden_core_test.js`，先確認缺少核心而失敗。
- [x] 新增 garden/core.js：UMD 匯出 Model 與 avatarRoster；Model.tick(ms, level)、refresh(roster)、pause()、resume()，無效數據不累積。
- [x] 再跑核心測試直到通過。

### 2. 唯讀雲端與開啟入口
- [x] 新增 tests/garden_roster_test.js，模擬 Google 服務，任何寫表／匯入即失敗；驗證換角色與復原、缺表不建立、錯表頭拒絕。
- [x] Run `node tests/garden_roster_test.js` 先失敗，再新增 gas/GardenRoster.gs，唯一公開入口 getGardenRoster。
- [x] 新增 garden/launcher.js：點擊立即開視窗，限定來源、視窗和隨機通道；刷新每次重新讀取，不快取假裝成功。內嵌到 index.html 與 universal.html；同步 gas/index.html 和 .claspignore。

### 3. 花園與聲音互動
- [x] 新增 tests/test_garden.py：假麥克風、跨頁名冊、更新角色、權限拒絕、啟動競態、講解暫停、離頁關麥克風、四尺寸無橫向溢出。
- [x] Run `python -m unittest discover -s tests -p test_garden.py -v` 先確認缺頁失敗。
- [x] 新增 HTML/CSS/原創 SVG 場景與 app.js，直接引用既有角色 SVG；本機成果分來源保存，失敗有可見提示。
- [x] 測試通過後截圖檢視 1366、1024、640、390；檢查 31 角色可見與 reduced-motion。

### 4. 驗證與交付
- [x] 執行核心／GAS／瀏覽器新測試及既有音量計、頭像、集點後端檢查；逐項比對未改帳本邏輯及內嵌工具。
- [x] 修改既有檔案先備份 .bak。更新 CHANGELOG、DECISIONS、AGENTS／CLAUDE frontmatter 與 handoff；部署版本仍 @64。
- [x] 提交本次功能，交付本機預覽、驗證結果與上線所需核可；不 push／部署。
