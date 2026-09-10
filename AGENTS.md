# AGENTS.md — 班級計時器

## 開始前

1. 讀 `CLAUDE.md`（技術框架、不能動的地方、部署後驗證清單）
2. 讀 `handoff.md`（上次停在哪、待辦事項）
3. 需要時再讀 `PITFALLS.md`、`DECISIONS.md`

## 結束時

動作完成當下就更新，不要等收工：

- `clasp deploy` 完成或功能里程碑 → `CHANGELOG.md`（新版本加頂端）
- 解決非顯而易見的 bug → `PITFALLS.md`（新坑加底部）；發現已知未修問題 → 更新頂端「已知風險」
- 做出非顯而易見的架構選擇 → `DECISIONS.md`
- 部署或修完 bug → `CLAUDE.md` frontmatter 的 `status`／`version`／`next_action`／`updated`
- **動過程式碼 → `git add -A` + `git commit`（commit 一律做，push 要先問）**
- 使用者說收工 → 執行 `/handoff`；沒有這個 skill 時（例如在 ChatGPT／Codex 裡），
  照全域規則的「收工四件事」手動做完：commit → frontmatter → handoff.md → 備份腳本

## 這個專案特別注意

- 改 root `index.html` 後必須 `cp index.html gas/index.html` 再 `clasp push`，兩份要一致
- 測試用 Playwright；測 GAS 版時內容在 iframe 裡，要先找出含 `#tab-seat-btn` 的 frame
- 對正式試算表或雲端設定做的驗證，事後一定要清掉測試列、還原被改掉的設定
