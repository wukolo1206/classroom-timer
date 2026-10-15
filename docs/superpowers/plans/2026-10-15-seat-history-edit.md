# Seat History Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. TDD and .bak backups before code changes.

**Goal:** 408累計點開學生後，看到與修改實際日期、節次的紀錄。

**Architecture:** index學生modal新增範圍鎖定與歷史列，每列攜帶原slot/key，沿用addSeatCount及seatClearSlot/seatClearDays同步。正常本節編輯仍保留；歷史模式先顯示歷史，當前節次另行折疊。原GAS與集點後端不改。

**Tech Stack:** 原生JS、GAS既有RPC、Playwright既有SeatPeriod408 fixture。

## Tasks
- [ ] 新tests/test_seat_history_408.py用真實Code.gs模擬fixture，重現21號舊日有紀錄、目前空節次，累計視窗看不到的失敗。
- [ ] 備份index，實作歷史view/日期節次/項目減1與刪除、指定日節清除、取消保護、目前編輯折疊、全天允許歷史入口。
- [ ] 使用既有queue、opId及masking，不改正式資料；補同步後modal更新及儲存失敗訊息。
- [ ] 新測試先紅後綠、原秩序分節與集點回歸、獨立規格品質審查；鏡像一致、SR不變、無新反引號。
- [ ] 部署前唯讀備份秩序與集點，沿原deploymentId發布；正式只讀歷史，禁止刪除真實21號或其他資料。
- [ ] 更新CHANGELOG/PITFALLS/DECISIONS/CLAUDE/handoff並提交，Git不push。
