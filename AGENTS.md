# AGENTS.md — 班級計時器

## 開始前

1. 讀 `CLAUDE.md`（技術框架、不能動的地方、部署後驗證清單）
2. 讀 `handoff.md`（上次停在哪、待辦事項）
3. 需要時再讀 `PITFALLS.md`、`DECISIONS.md`

## 做完一件事的當下就更新（不要等收工）

- `clasp deploy` 完成或功能里程碑 → `CHANGELOG.md`（新版本加頂端）
- 解決非顯而易見的 bug → `PITFALLS.md`（新坑加底部）；發現已知未修問題 → 更新頂端「已知風險」
- 做出非顯而易見的架構選擇 → `DECISIONS.md`

## 使用者說「收工」時：四件事，缺一不可

**這不是「更新文件」清單。第 1 和第 4 項不是文件，卻最常被漏掉。**

**1. `git commit`（最常被漏掉的一件）**

```bash
git status --short          # 有東西就代表要 commit
git add -A
git commit                  # 訊息寫清楚做了什麼
```

**commit 一律做，不需要問使用者。push 才要先問。** 這兩件事不同。

> 2026-09-10 的教訓：一整天 2300 行改動全部只躺在工作區，
> 因為當時的收工流程裡沒有這一條。見 `PITFALLS.md` 最後一則。

**2. `CLAUDE.md` frontmatter** —— 更新 `status` / `version` / `next_action` / `updated` 四欄，
不動其他內容。檔案必須維持 UTF-8 無 BOM。

**3. `handoff.md`** —— 記錄停在哪、本次驗證了什麼、下次接續什麼、有什麼地雷。

**4. 執行備份腳本（整台電腦一次，不是每個專案一次）**

```
G:\我的雲端硬碟\AI設定同步\收工.bat
```

它備份的是 `C:\Users\wu\` 底下的 AI 設定、記憶與憑證 —— 那些雲端硬碟碰不到，
不跑這步，換到另一台電腦就沒有。跑完要等 Google 雲端硬碟顯示「已完成同步處理」。

**換到另一台電腦開工前**，該台先跑 `G:\我的雲端硬碟\AI設定同步\開工.bat`。

若同一次動到多個專案，第 1～3 項每個專案各做一次，第 4 項整台只做一次。

## 這個專案特別注意

- 改 root `index.html` 後必須 `cp index.html gas/index.html` 再 `clasp push`，兩份要一致
- 測試用 Playwright；測 GAS 版時內容在 iframe 裡，要先找出含 `#tab-seat-btn` 的 frame
- 對正式試算表或雲端設定做的驗證，事後一定要清掉測試列、還原被改掉的設定
- `sh150-tracker/` 是獨立 repo（分支 `main`），收工時也要在裡面 `git status`、commit；push 一樣要先問。規則見 CLAUDE.md「子資料夾 sh150-tracker/」
