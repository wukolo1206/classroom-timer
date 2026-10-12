# 班級集點 Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development 逐項執行，實作後先規格審查再品質審查。使用者已同意照設計實作，持續執行不另問是否繼續。

**Goal:** 408 學生角色卡片、加扣點、批次、分組、歷史、復原與跨裝置同步。

**Architecture:** GAS 新增 Points.gs，僅追加「班級集點紀錄」，設定放文件屬性 pointSettings；原 Code.gs 與原工作表不修改。前端獨立開發於 points/points.js、points/points.css，再由 tools/embed_points.py 注入 root HTML 並同步 GAS。

**Tech Stack:** 原生 JavaScript、GAS、Node 記憶體試算表測試、Python Playwright。

## API 契約

`getPointBundle()` 回傳 `{events, settings, revision, serverTime}`。事件 `{id,batchId,time,seat,name,itemId,label,delta,type,originalBatchId,device}`。

`commitPointBatch(batch)` 其中 batch `{id,type:'score'|'undo'|'reset',seats:[{seat,name}],itemId,label,delta,originalBatchId,device}`；回傳完整 bundle。score 以 batch.id + ':' + seat 去重；undo 以 'undo:' + originalBatchId 作唯一批次並由伺服器計算；reset 重送維持原批次，按雲端現值計算。舊操作內容不符拒絕。

`savePointSettings(settings, revision)` 回傳 `{settings,revision}`。設定 `{items:[{id,label,delta}],avatars:{seat:0..23},groups:[{id,name,seats:[number]}],muted:boolean}`（@39 擴充角色，0～7 保留）。若修訂衝突則失敗，前端保留草稿提示重載。

## Task 1：後端與可靠記帳

- [x] 建立 tests/points_backend_sim.js，Node mock 真實執行 Points.gs；先測缺少 API 的失敗，再加入記帳去重、負分、多人、復原、歸零、設定衝突與表頭保護。
- [x] 新建 gas/Points.gs，鎖內讀取指定工作表、驗證表頭、建立與追加；用固定欄位轉 event。原有工作表不可寫入，失敗保留可重試操作。
- [x] 執行 `node tests/points_backend_sim.js`，全部 PASS。獨立審查規格與品質，處理高優先問題。

## Task 2：前端與整合

- [x] 建立 tests/test_points.py，用 HTTP 暫存副本與獨立瀏覽器；先確認新分頁缺少而失敗，再實作。
- [x] 新建 points/points.js、points/points.css，公開 `window.c408PointsShow()`；DOM 均以 textContent 或固定圖形建立。前端 RPC 對應上述契約，雲端與本機 mode 分開儲存。
- [x] 持久化待送佇列在操作前；RPC 失敗不移除，未知回應重試同 id；顯示已入帳 + 未確認事件並按 id 排除重複。只傳一個操作，刷新與保存不重疊。
- [x] 新建 tools/embed_points.py，將 `<!-- POINTS_STYLE_START -->` 與 `<!-- POINTS_SCRIPT_START -->` 區塊注入 index.html；備份既有 HTML 與 gas/index.html 至 .bak 後複製。
- [x] index.html 新增 tab-points-btn、panel-points 與 defaultTabOrder 的 points，按鈕事件與 switchTab 接上 show。調整既有分頁測試預期新分頁。
- [x] `python -B -m unittest discover -s tests -p test_points.py -v`；測批次、設定、歷史、重新整理、失敗續送、復原與窄畫面。

## Task 3：驗證、文件與發布

- [x] 獨立規格審查，通過後品質審查，所有重要問題修復並重測。
- [x] `node tests/points_backend_sim.js`、`node tests/seat_backend_sim.js` 與 Python 既有相關回歸；檢查 Node 語法、鏡像及內嵌 SR 未變。
- [x] 更新 CHANGELOG、DECISIONS、CLAUDE frontmatter、新工作表授權例外與 handoff；實作里程碑寫當下，不等 session 結束。
- [x] 讀 deploy-gas 技能，檢查既有部署憑證；先 `python tools/backup_seat_sheet.py`，成功才既有 deploymentId 更新。無可用授權時保留測試完的成果並說明阻礙，不另建部署、不 push。
- [x] 部署驗證 GAS 新分頁及原導覽，測試資料只用新工作表並清理。更新实际版號、驗證限制與本機 commit。
