# 秩序連動集點 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Follow TDD and backup existing code before edits.

**Goal:** 在秩序學生視窗選加扣1～5，確定後只計分一次。

**Architecture:** index.html只負責視窗草稿與確認；points/points.js提供window.c408PointsFromSeat請求入口，透過既有enqueue與flush保存並同步。視窗固定ID防重複，source標籤保留來源，status更新秩序頁回饋。

**Tech Stack:** 原生JS、既有集點佇列與Playwright。

## Task 1：測試与連動
- [x] 先在tests/test_points.py新增秩序頁扣2、加3、不計點、關閉、重設、冷啟動、重送、儲存失敗與復原測試；執行新增項目觀察失敗。
- [x] 備份index.html、points/points.js與tests/test_points.py至.bak。
- [x] 學生視窗加入select#seat-points-delta與#seat-points-error；秩序頁加入#seat-points-feedback。確定handler取草稿seat/delta/id，delta0直接關閉，非零呼叫bridge，僅accepted後關閉。
- [x] bridge懶初始化，驗證seat與±1～5，查pending與confirmed相同id拒絕重複套用，沿用enqueue並更新status；失敗回傳錯誤且不關閉。
- [x] python tools/embed_points.py同步嵌入資產與gas/index.html；執行前端整套24項及新增連動測試、node後端26情境、既有秩序分節回歸。

## Task 2：審查與正式部署
- [x] 獨立審查重送與本機失敗、確認按鈕時機、舊秩序不受影響。確認root/gas一致、SR未改、新碼無反引號。
- [x] 部署前唯讀備份秩序與集點現況，再push及更新既有deploymentId。
- [x] 正式頁測試連動加扣但不點秩序項目，確認集點與第二裝置，清除僅該測試批次，原秩序讀前後不變。
- [x] 更新CHANGELOG、DECISIONS、CLAUDEfrontmatter及handoff，提交不push。
