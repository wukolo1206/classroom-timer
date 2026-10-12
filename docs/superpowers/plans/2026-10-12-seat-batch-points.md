# 本節學生批次扣點 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Follow TDD and back up existing code before edits.

**Goal:** 老師在秩序頁一次扣目前選定節次已登記學生的點數。

**Architecture:** index.html凍結本節學生清單並顯示確認視窗；points/points.js提供批次橋接，沿用enqueue/flush和既有復原。資料與GAS後端不變。

**Tech Stack:** 原生JS、GAS既有事件佇列、Playwright、Python unittest。

## Task 1：批次入口與橋接
- [x] 先備份index.html、points/points.js、tests/test_points.py到同目錄.bak。
- [x] 在tests/test_points.py新增本節批次測試，執行新增項目確認因缺少入口而失敗。造兩名本節學生（其中一人多次），另一人其他節次／日期；確認每人扣2且未登記者不扣。另驗空名單、全天、取消、儲存失敗重試、離線／回應遺失與整批復原。
- [x] 新增#seat-batch-points-btn與獨立確認視窗，凍結slot、有效且seatTotalOf(rec,n)>0的座號、ID；顯示學生清單和人數，#seat-batch-points-delta選-1～-5，取消不送分，非accepted保持草稿。
- [x] 新增window.c408PointsBatchFromSeat({seats:[1,2],delta:-2,id:'seat_batch_x'})，驗證非空有效唯一名冊與分值；對pending/confirmed相同ID比對完整學生目標與delta，沿用單批enqueue，不使用逐人迴圈呼叫橋接。
- [x] 執行python tools/embed_points.py同步root/gas。順序執行新增批次與既有個別連動測試、完整集點及秩序分節回歸；node tests/points_backend_sim.js驗26情境，確認SR原文與鏡像。

## Task 2：審查與發布
- [x] 獨立規格與品質審查，修復阻擋問題後重新驗證；不得以並行負載造成的測試逾時當成功，逐項確認。
- [x] 部署前唯讀備份秩序與集點現況；clasp push後沿用gas/weburl.txt原deploymentId更新。
- [x] 正式批次視窗讀既有本節學生清單與取消；使用集點批次橋接新增已知測試ID的兩人扣點，第二裝置核對、重送與整批復原，再清理僅該測試批次，確認原兩表與偏好一致。
- [x] 即時更新CHANGELOG、DECISIONS、CLAUDEfrontmatter及handoff，標記本計畫結果，提交限定檔案，不Git push。

## 使用者追加：集點單列操作
- [x] 備份index.html及points/points.css，將points-view與points-actions移入points-toolbar，所有按鈕ID及JS處理保持不變。
- [x] CSS重設toolbar內組別margin及間距，大螢幕可同列、小螢幕自然換行。執行embed_points.py同步。
- [x] 本機1366／1920同排、1024／390無橫向溢出；檢查全班加扣、紀錄、設定、重新同步入口可用，截圖留存。此為可逆版面調整，不新增鏡像CSS的單元測試。
- [x] 最終審查與GAS正式版確認操作列，一併更新交接及發布紀錄。
