# 秩序當週小卡列印實作計畫

**Goal:** 依所選日期的星期一至星期日，唯讀統計學生每日／項目次數，勾選後A4多張小卡列印。
**Architecture:** index.html原秩序closure讀取現況紀錄並建立快照；獨立srcdoc iframe呈現與列印，避免干擾既有含氟／SR列印樣式。預設勾選本週有登記學生；正常每頁8張，項目多時4張。
**Tech Stack:** 原生JavaScript、HTML／CSS、Playwright、GAS原deployment。

- [x] 先寫星期邊界、全節次與未分節、學生選取、A4分頁及唯讀不寫入測試，確認失敗。
- [x] 備份index.html／gas鏡像，加入預覽視窗、日期／名單選取、統計與獨立列印文件。
- [x] 驗證PDF張數、裁切邊界、文字與手機操作，日期／座位回歸及來源稽核。
- [x] 沿用原GAS網址部署@47，正式唯讀預覽／選取／兩頁導航；確認原兩表與秩序設定不變。
- [x] 更新CHANGELOG／DECISIONS／frontmatter／handoff並提交指定檔案，不Git push。

**Acceptance:** 舊週與未來週不混入，同日各節次相加但不倍計；每人每日合計等於項目合計，已移除項目保留可追查。空週不自行選全班；全部名冊無空號7。列印不修改紀錄、點數、偏好；不修改SR／全校版／後端契約。
