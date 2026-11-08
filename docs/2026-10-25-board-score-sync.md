# 408 GAS 與討論畫板本場點數同步

2026-10-25，已沿用原網址部署 GAS @60，畫板0.5.8；未push，全校版維持v1.22。

小組討論區按「連動討論畫板」，核對本場班級、科目、名稱及組員後確認。兩邊共享畫板本場分數，計時器的加減分、項目加分、精確復原及清空都會更新學生畫板；教師畫板的計分會由計時器讀回。

僅小組討論階段開放計分，換場必須重確認。離線、組員不符及結果未明時停用，不回退成本機加分。待確認操作固定原場次與識別碼保存，重新整理可查詢／重送；解除連動也不丟棄未明請求。共享模式暫停轉入個人集點，解除後恢復原本機分數。

## 程式與驗證

- `board-sync/board-sync.js` 是controller及GAS-only介面來源。修改後執行 `python tools/embed_board_sync.py`，維持root／gas鏡像；不可直接改嵌入區。
- `gas/BoardScoreBridge.gs` 僅用唯讀 `pointSettings_` 與 `POINT_ROSTER` 建立context；不能改成 `getPointBundle`，後者可能寫入匯入資料。
- GAS20個離線情境、controller模擬及mock Chrome測試通過。實際本機畫板API＋計時器google.script.run測試轉接＋教師／學生POST/SSE共10個情境通過，三尺寸無水平溢出／pageerror；超長自訂原因不建立待確認操作。
- 跨專案證據：`D:/備課ai/54_小組討論畫板/docs/score-sync-review/README.md`、verification.json及截圖。
- 測試只操作匿名本機資料；未連Google、VM或正式408，真iPad與正式GAS連線另驗。
- 原有回歸139項（小組19／集點55／秩序32／408 SR8／通用SR25）通過，SH150固定fixture日期後38/38通過。原實際日期跑177項有5失敗／1錯誤，均由SH150的第6週fixture與現行第8週／星期日不同造成；修改前相同原文可重現，固定2026-10-05後六項及完整38項全過。未修改SH150產品程式；詳細證據見畫板驗收紀錄。

## 部署接續

取得雙專案部署授權後，保留原私有設定及正式資料備份，再於GAS ScriptProperties增設 `BOARD_SCORE_BRIDGE_URL`、`BOARD_SCORE_BRIDGE_TOKEN`、`BOARD_SCORE_BRIDGE_CLASS`（預設408），與畫板VM私有 `SCORE_BRIDGE_BINDINGS` 的限班token配對。URL只接受 `https://teacherwu.xdai.tw/discuss`（尾斜線可有）。不得共用診斷的BOARD_SECRET，token不放HTML、Git或前端回應。沿用原deploymentId，不新建網址；先做正式匿名驗收，408只唯讀核對。無匿名GAS隔離環境時保留實際教師加分驗收，不能試寫408替代。

## 正式發布結果

實際GAS匿名六項、學生SSE與重整保留2點均通過；408唯讀回傳六組、目前場次closed，使用時先開新場。正式秩序477列及個人集點841列未變。臨時私有setup已移除，雲端六檔（正規化BOM/CRLF）核對一致，部署數仍2。詳見畫板docs/score-sync-review/live-release.md與兩邊handoff.md；真iPad及正式408實際課堂加點另驗。
