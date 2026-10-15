# Shared Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Backup existing code before changes; TDD red/green.

**Goal:** 408討論與集點小組同源，跨裝置顯示最新資料。

**Architecture:** Code.gs對小組讀取合成pointSettings.groups的唯讀視圖；points模組保存／拉取後發布共享小組更新，index套用名稱、組數與卡片成員，統一入口開最新集點設定。既有兩個設定property不遷移、不覆寫。

**Tech Stack:** 原生JS、GAS DocumentProperties、Playwright與Node模擬。

## Task 1：後端
- [ ] 寫tests/shared_groups_backend_sim.js，先驗證現況失敗：getGroupSettings与getSeatSettings應含最新集點六組，property不變，無討論設定也可讀共享組，無集點組則舊版相容，無document lock可保存討論內容。
- [ ] 修改gas/Code.gs getGroupSettings合成{groupCount,groupNames,sharedGroups}，getSeatSettings改呼叫getGroupSettings，保存鎖使用script lock。
- [ ] 執行新增模擬及原seat_backend_sim.js通過。

## Task 2：前端
- [ ] 新增Playwright失敗案例涵蓋冷啟動共享六組、保存後更新討論、共享修改入口、回到小組讀最新、保留未保存草稿及舊資料不變。
- [ ] index新增c408ApplySharedGroups，把合法groups同步討論名称、組數與成員，renderGroupCards使用textContent顯示名冊成員。群數／改名在共享組存在時轉到統一編輯入口。
- [ ] points保存與pull後呼叫apply，新增c408PointsOpenSettings最新讀取再開編輯；本機版不用RPC，雲端失敗不打開舊草稿。切分頁／focus／可見15秒同步討論。
- [ ] embed_points同步root/gas，執行全部集點與小組回歸，不改universal。

## Task 3：審查與發布
- [ ] 獨立規格／品質審查；root/gas一致、SR不變、無新反引號或URL。
- [ ] 唯讀備份秩序與集點現況，push及部署原deploymentId。
- [ ] 正式兩個獨立瀏覽器唯讀比對既有六組名稱與成員及統一入口，无正式設定写入。
- [ ] 更新CHANGELOG/PITFALLS/DECISIONS/CLAUDE/handoff，提交不push。
