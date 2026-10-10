# -*- coding: utf-8 -*-
"""408 版（index.html）秩序登記「每節課分開記錄」：前端＋真正的 gas/Code.gs（記憶體假試算表）一起驗。

執行：python -m unittest discover -s tests -p test_seat_period_408.py -v
google.script.run 由瀏覽器內的模擬器代替，背後執行 gas/Code.gs 本身；假試算表存在 sessionStorage，
重新整理仍保留。不連正式試算表。測試資料只用座號，不寫學生姓名。
"""
import datetime, functools, http.server, json, os, shutil, socketserver, tempfile, threading, unittest

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = ['日期', '座號', '姓名', '項目', '次數', '最後更新', '項目代碼']
DAY = '2026-10-12'          # 星期一

MOCK = r"""
(() => {
  if (window !== window.top) return;
  const CODE = __CODE__;
  const HEAD = __HEAD__;
  const ss = window.sessionStorage;
  let rows = JSON.parse(ss.getItem('__sheet') || 'null') || [HEAD.slice()];
  const props = JSON.parse(ss.getItem('__props') || '{}');
  const persist = () => { ss.setItem('__sheet', JSON.stringify(rows)); ss.setItem('__props', JSON.stringify(props)); };
  const sheet = {
    getLastRow: () => rows.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const x = []; for (let j = 0; j < nc; j++) x.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); o.push(x); } return o; },
        getValue() { return this.getValues()[0][0]; },
        setValues(v) { for (let i = 0; i < nr; i++) { if (!rows[r - 1 + i]) rows[r - 1 + i] = []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
        setValue(v) { return this.setValues([[v]]); },
        setFontWeight() { return this; },
      };
    },
    deleteRow(n) { rows.splice(n - 1, 1); },
    deleteRows(n, k) { rows.splice(n - 1, k); },
    appendRow(a) { rows.push(a.slice()); },
    setFrozenRows() {},
  };
  const svc = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    Utilities: { formatDate: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
    PropertiesService: { getDocumentProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      setProperties: (o) => { for (const k in o) props[k] = String(o[k]); }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    HtmlService: {}, ContentService: {},
  };
  const names = ['getSeatBundle', 'setSeatCount', 'clearSeatSlot', 'clearSeatDay', 'clearSeatAllV2', 'importSeatRecordsV2', 'getSeatRowsRaw',
                 'clearSeatRecords', 'clearSeatAll', 'importSeatRecords', 'saveSeatSettings', 'getSrRecords', 'saveSrRecords'];
  const api = new Function(...Object.keys(svc), CODE + '\nreturn {' + names.join(',') + '};')(...Object.values(svc));
  window.__calls = [];
  window.__sheetRows = () => rows;
  function runner(succ, fail) {
    return new Proxy({}, { get(_, name) {
      if (name === 'withSuccessHandler') return f => runner(f, fail);
      if (name === 'withFailureHandler') return f => runner(succ, f);
      return (...args) => {
        window.__calls.push(name);
        // __delay：後端「執行」前等多久；__respDelay：執行完（已取快照／已寫入）後，回覆再晚多久送達；
        // __lostReply：後端執行完但回覆遺失（前端收到網路錯誤）
        const delay = (JSON.parse(ss.getItem('__delay') || '{}'))[name] || 30;
        const resp = (JSON.parse(ss.getItem('__respDelay') || '{}'))[name] || 0;
        setTimeout(() => {
          if (!api[name]) { if (fail) fail(new Error('mock 沒有 ' + name)); return; }
          const failMap = JSON.parse(ss.getItem('__fail') || '{}');
          if (failMap[name] > 0) { failMap[name]--; ss.setItem('__fail', JSON.stringify(failMap)); if (fail) fail(new Error('模擬網路錯誤')); return; }
          let r, err = null;
          try { r = api[name](...JSON.parse(JSON.stringify(args))); } catch (e) { err = e; }
          persist();
          window.__execLog = (window.__execLog || []).concat([name]);
          const lost = JSON.parse(ss.getItem('__lostReply') || '{}');
          if (!err && lost[name] > 0) { lost[name]--; ss.setItem('__lostReply', JSON.stringify(lost)); err = new Error('網路逾時（回覆遺失）'); }
          setTimeout(() => { if (err) { if (fail) fail(err); } else if (succ) succ(r); }, resp);
        }, delay);
      };
    } });
  }
  window.google = { script: { get run() { return runner(null, null); } } };
})()
"""


class SeatPeriod408(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='seat408_')
        src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
        open(os.path.join(cls.tmp, 'index.html'), 'w', encoding='utf-8').write(src)
        # 回復模式（SEAT_PERIOD_UI=false）的版本
        assert src.count('var SEAT_PERIOD_UI = true;') == 1
        open(os.path.join(cls.tmp, 'rollback.html'), 'w', encoding='utf-8').write(src.replace('var SEAT_PERIOD_UI = true;', 'var SEAT_PERIOD_UI = false;'))
        code = open(os.path.join(ROOT, 'gas', 'Code.gs'), encoding='utf-8').read()
        cls.mock = MOCK.replace('__CODE__', json.dumps(code)).replace('__HEAD__', json.dumps(HEAD, ensure_ascii=False))

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:%d/' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # ── 工具 ──
    def open(self, at='10:35', sheet=None, local=None, session=None, page_name='index.html', gas=True):
        ctx = self.browser.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 1000})
        self.addCleanup(ctx.close)
        seed_s = dict(session or {})
        if sheet is not None:
            seed_s['__sheet'] = json.dumps([HEAD + ['節次']] + sheet, ensure_ascii=False)
        seed_l = {'timerTabOrder': json.dumps(['seat', 'timer', 'group', 'exam', 'weekly', 'sr'])}
        seed_l.update(local or {})
        ctx.add_init_script('(() => { if (window !== window.top || sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded","1");'
                            ' const s = %s, l = %s; for (const k in s) sessionStorage.setItem(k, s[k]); for (const k in l) localStorage.setItem(k, l[k]); })()'
                            % (json.dumps(seed_s, ensure_ascii=False), json.dumps(seed_l, ensure_ascii=False)))
        if gas:
            ctx.add_init_script(self.mock)
        page = ctx.new_page()
        h, m = map(int, at.split(':'))
        page.clock.install(time=datetime.datetime(2026, 10, 12, h, m))
        page._errs, page._dialogs = [], []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        page.goto(self.base + page_name)
        page.wait_for_timeout(300)
        page.click('#tab-seat-btn')
        self.settle(page)
        return page

    def settle(self, page, ms=2500):
        """等同步佇列送完（假 GAS 每次回應約 30ms）。"""
        page.wait_for_timeout(200)
        for _ in range(ms // 100):
            if page.evaluate("JSON.parse(localStorage.getItem('seatSyncQueue') || '[]').length") == 0:
                break
            page.wait_for_timeout(100)
        page.wait_for_timeout(150)

    def local(self, page):
        return json.loads(page.evaluate("localStorage.getItem('seatCheckRecords') || '{}'"))

    def sheet(self, page):
        rows = page.evaluate("window.__sheetRows ? window.__sheetRows() : JSON.parse(sessionStorage.getItem('__sheet') || '[]')")
        return [r for r in rows[1:]]

    def sheet_counts(self, page):
        out = {}
        for r in self.sheet(page):
            key = (r[0], str(r[1]), r[6], r[7] if len(r) > 7 else '')
            out[key] = r[4]
        return out

    def mode(self, page, label):
        page.click('#seat-modes button:has-text("%s")' % label)

    def tap(self, page, seat):
        page.click('#seat-chart button[data-seat="%s"]' % seat)

    def period(self, page, code):
        page.click('#seat-period-bar button[data-period="%s"]' % code)

    def selected_period(self, page):
        return page.evaluate("(() => { const b = [...document.querySelectorAll('#seat-period-bar button')].find(x => x.className.includes('bg-sky-600')); return b ? b.getAttribute('data-period') : null; })()")

    # ── 測試 ──
    def test_P01_auto_period_and_per_period_counts(self):
        p = self.open(at='10:35', sheet=[])
        self.assertEqual(self.selected_period(p), '3', '10:35 自動在第 3 節')
        self.assertIn('自動', p.inner_text('#seat-period-status'))
        self.mode(p, '座位歪了')
        self.tap(p, 5); self.tap(p, 5)
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2})
        self.period(p, '4')
        self.assertEqual(p.inner_text('#seat-count-total'), '0', '第 4 節從 0 開始')
        self.assertIn('手動', p.inner_text('#seat-period-status'))
        self.period(p, '3')
        self.assertEqual(p.inner_text('#seat-count-total'), '2')
        self.period(p, 'all')
        self.assertEqual(p.inner_text('#seat-count-total'), '2', '全天加總')
        self.tap(p, 5)
        self.assertIn('全天', p._dialogs[-1])
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2, '全天模式點座位不寫入')
        self.assertEqual(p._errs, [])

    def test_P02_auto_follows_time_and_back_to_auto(self):
        p = self.open(at='09:25', sheet=[])
        self.assertEqual(self.selected_period(p), '1', '下課 9:25 仍算第 1 節')
        p.clock.fast_forward('10:00')      # → 09:35
        p.wait_for_timeout(300)
        self.assertEqual(self.selected_period(p), '2')
        self.period(p, '5')                # 手動
        p.clock.fast_forward('01:00:00')
        p.wait_for_timeout(300)
        self.assertEqual(self.selected_period(p), '5', '手動後不再自動跳')
        p.click('#seat-period-status [data-period-action="auto"]')
        self.assertEqual(self.selected_period(p), '3', '回到自動 → 10:35 第 3 節')

    def test_P03_undo_goes_back_to_original_period(self):
        p = self.open(at='10:35', sheet=[])
        self.mode(p, '座位歪了')
        self.tap(p, 6)
        self.period(p, '4')
        self.tap(p, 6)
        self.period(p, '2')
        p.click('#seat-undo-btn')
        self.settle(p)
        loc = self.local(p)
        self.assertNotIn(DAY + '#4', loc, '復原扣回第 4 節')
        self.assertEqual(loc[DAY + '#3']['6']['tilt'], 1, '第 3 節不受影響')
        self.assertIn('已復原', p._dialogs[-1])

    def test_P04_modal_keeps_its_period_across_boundary(self):
        p = self.open(at='11:15', sheet=[])
        self.assertEqual(self.selected_period(p), '3')
        self.tap(p, 8)                     # 逐項登記 → 開彈窗
        p.wait_for_timeout(300)            # 等彈窗淡入
        self.assertIn('第3節', p.inner_text('#seat-modal-duty'))
        p.clock.fast_forward('10:00')      # → 11:25（第 4 節），彈窗開著
        p.wait_for_timeout(300)
        p.click('#seat-modal-list button:has-text("地上有垃圾")')
        self.assertEqual(self.local(p)[DAY + '#3']['8']['trash'], 1, '彈窗內仍記到第 3 節')
        p.click('#seat-modal-done')
        p.wait_for_timeout(200)
        self.assertEqual(self.selected_period(p), '4', '關掉彈窗才換節')

    def test_P05_clear_slot_vs_clear_day(self):
        t = '2026-10-12T00:00:00.000Z'
        sheet = [[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節'], [DAY, 6, '', '座位歪了', 1, t, 'tilt', '第3節'],
                 [DAY, 5, '', '座位歪了', 1, t, 'tilt', '第4節'], [DAY, 5, '', '座位歪了', 4, t, 'tilt', ''],
                 ['2026-10-13', 5, '', '座位歪了', 1, t, 'tilt', '第3節']]
        p = self.open(at='10:35', sheet=sheet)
        self.assertEqual(self.local(p)[DAY]['5']['tilt'], 4, '舊紀錄拉下來是未分節')
        p.click('#seat-clear-btn')
        self.settle(p)
        self.assertNotIn(DAY + '#3', self.local(p))
        self.assertEqual(sorted(k[3] for k in self.sheet_counts(p) if k[0] == DAY), ['', '第4節'])
        p.click('#seat-clear-day-btn')
        self.settle(p)
        self.assertEqual([k for k in self.local(p) if k.startswith(DAY)], [])
        self.assertEqual(list(self.sheet_counts(p)), [('2026-10-13', '5', 'tilt', '第3節')], '別天不動')

    def test_P06_unassigned_period_visible_and_editable(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 9, '', '座位歪了', 3, t, 'tilt', '']])
        self.assertTrue(p.is_visible('#seat-period-bar button[data-period=""]'), '有舊紀錄時出現「未分節」')
        self.period(p, '')
        self.assertEqual(p.inner_text('#seat-count-total'), '3')
        self.tap(p, 9)
        p.click('#seat-modal-list button:has-text("減 1")')
        p.click('#seat-modal-done')
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {(DAY, '9', 'tilt', ''): 2})

    def test_P07_reload_with_pending_clear_does_not_revive_old_value(self):
        t = '2026-10-12T00:00:00.000Z'
        queue = [{'id': 'jclr', 'type': 'clearDay', 'date': DAY, 'seat': ''},
                 {'id': 'jcnt', 'type': 'count', 'date': DAY + '#3', 'seat': '5', 'name': '', 'key': 'tilt', 'label': '座位歪了', 'count': 1}]
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']],
                      local={'seatCheckRecords': json.dumps({DAY + '#3': {'5': {'tilt': 1}}}), 'seatSyncQueue': json.dumps(queue)})
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 1, '本機不被雲端舊值 2 蓋掉')
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 1}, '雲端也是 1')

    def test_P08_pull_response_older_than_clear_is_dropped(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        p.evaluate("sessionStorage.setItem('__delay', JSON.stringify({ getSeatBundle: 800 }))")
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn')    # 發出一次慢的拉取
        p.wait_for_timeout(100)
        p.click('#seat-clear-btn')                            # 拉取回來前清除本節
        p.wait_for_timeout(1500)
        self.settle(p)
        self.assertNotIn(DAY + '#3', self.local(p), '慢的拉取回應不能把清掉的資料帶回來')
        self.assertEqual(self.sheet_counts(p), {})

    def test_P09_stats_period_filter_and_day_dedupe(self):
        recs = {DAY + '#3': {'5': {'tilt': 2}}, DAY + '#4': {'5': {'tilt': 1}}, '2026-10-13#3': {'6': {'trash': 1}}}
        p = self.open(at='10:35', sheet=[], local={'seatCheckRecords': json.dumps(recs)})
        self.settle(p)
        p.click('#seat-stats-btn')
        p.click('.seat-range-btn[data-range="all"]')
        self.assertIn('共 2 天', p.inner_text('#seat-stats-meta'), '同一天兩節算 1 天')
        p.click('.seat-pf-btn[data-pfilter="custom"]')
        for code in ['m', '1', '2', '4', 'n', '5', '6', '7', '']:
            p.click('#seat-pf-chips [data-chip="%s"]' % code)
        meta = p.inner_text('#seat-stats-meta')
        self.assertIn('第3節', meta)
        table = p.inner_text('#seat-stats-table')
        self.assertIn('2', table)
        rows = p.evaluate("[...document.querySelectorAll('#seat-stats-table tbody tr')].map(r => [r.children[0].innerText.trim(), r.children[r.children.length - 2].innerText.trim()])")
        self.assertEqual(dict(rows), {'5': '2', '6': '1'}, '只算第 3 節')
        p.click('.seat-range-btn[data-range="weekly"]')
        self.assertIn('共 1 週', p.inner_text('#seat-stats-meta'))
        with p.expect_download() as d:
            p.click('#seat-csv-detail-btn')
        path = os.path.join(self.tmp, 'detail.csv')
        d.value.save_as(path)
        text = open(path, encoding='utf-8-sig').read()
        self.assertIn('日期,節次,座號,姓名,項目,次數', text)
        self.assertIn(DAY + ',第3節,5,', text)
        self.assertNotIn(',第4節,', text)

    def test_P10_merge_import_keeps_cloud_only_rows(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[['2026-10-09', 7, '', '座位歪了', 1, t, 'tilt', '第1節']],
                      local={'seatCheckRecords': '{}'})
        p.evaluate("localStorage.setItem('seatCheckRecords', '{}')")   # 模擬這台電腦沒有那筆雲端資料
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#3': {'5': {'tilt': 3}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.click('#seat-import-merge')
        self.settle(p)
        sc = self.sheet_counts(p)
        self.assertEqual(sc.get(('2026-10-09', '7', 'tilt', '第1節')), 1, '雲端獨有的紀錄保留')
        self.assertEqual(sc.get((DAY, '5', 'tilt', '第3節')), 3)
        self.assertNotIn('importSeatRecordsV2', p.evaluate('window.__calls'))

    def test_P11_replace_import_downloads_snapshot_and_replaces(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[['2026-10-09', 7, '', '座位歪了', 1, t, 'tilt', '第1節'],
                                         ['2026-10-09', 8, '', '座位歪了', 1, t, 'tilt', '補課']])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#3': {'5': {'tilt': 3}}, '2026-10-09#?補課': {'8': {'tilt': 2}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        names = []
        p.on('download', lambda d: names.append(d.suggested_filename))
        p.click('#seat-import-replace')
        p.wait_for_timeout(600)
        self.settle(p)
        self.assertTrue(any('匯入前雲端' in n for n in names), names)
        self.assertTrue(any(n.startswith('秩序登記備份_') for n in names), names)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 3, ('2026-10-09', '8', 'tilt', '補課'): 2})

    def test_P12_permanent_error_pauses_and_can_skip(self):
        queue = [{'id': 'jbad', 'type': 'count', 'date': '10/12', 'seat': '5', 'name': '', 'key': 'tilt', 'label': 'x', 'count': 1},
                 {'id': 'jok', 'type': 'count', 'date': DAY + '#3', 'seat': '6', 'name': '', 'key': 'tilt', 'label': 'x', 'count': 1}]
        p = self.open(at='10:35', sheet=[], local={'seatSyncQueue': json.dumps(queue)})
        p.wait_for_timeout(500)
        self.assertIn('同步暫停', p.inner_text('#seat-sync-status'))
        self.assertEqual(len(json.loads(p.evaluate("localStorage.getItem('seatSyncQueue')"))), 2, '暫停時不丟資料')
        p.click('#seat-sync-status [data-sync-action="resolve"]')
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {(DAY, '6', 'tilt', '第3節'): 1})
        self.assertIn('已同步', p.inner_text('#seat-sync-status'))

    def test_P13_old_queue_jobs_without_type_are_sent_to_unassigned(self):
        queue = [{'date': DAY, 'seat': '5', 'name': '', 'key': 'tilt', 'label': '座位歪了', 'count': 3}]
        p = self.open(at='10:35', sheet=[], local={'seatSyncQueue': json.dumps(queue), 'seatCheckRecords': json.dumps({DAY: {'5': {'tilt': 3}}})})
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', ''): 3})

    def test_P14_transient_error_retries(self):
        p = self.open(at='10:35', sheet=[], session={'__fail': json.dumps({'setSeatCount': 1})})
        self.mode(p, '座位歪了')
        self.tap(p, 5)
        p.wait_for_timeout(400)
        self.assertIn('待同步', p.inner_text('#seat-sync-status'))
        p.clock.fast_forward('00:16')
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 1})

    def test_P15_rollback_mode_reads_writes_unassigned_only(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']], page_name='rollback.html')
        self.assertFalse(p.is_visible('#seat-period-bar'))
        self.mode(p, '座位歪了')
        self.tap(p, 6)
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2, (DAY, '6', 'tilt', ''): 1}, '分節資料不被改動')
        self.assertEqual(p._errs, [])

    def test_P16_local_mode_without_gas(self):
        p = self.open(at='10:35', gas=False)
        self.mode(p, '座位歪了')
        self.tap(p, 5)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 1)
        self.assertIn('本機模式', p.inner_text('#seat-sync-status'))
        p.click('#seat-clear-day-btn')
        self.assertEqual(self.local(p), {})
        self.assertEqual(p._errs, [])


    # ── 第 3 輪程式審查補測 ──
    def test_R01_pull_snapshot_taken_before_clear_arrives_after_clear_done(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        p.evaluate("sessionStorage.setItem('__respDelay', JSON.stringify({ getSeatBundle: 900 }))")
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn')    # 拉取：後端立刻取快照（含次數 2），回覆 0.9 秒後才到
        p.wait_for_timeout(120)
        p.click('#seat-clear-btn')                            # 清除本節：很快完成
        p.wait_for_timeout(1500)                              # 舊回覆在清除完成後才抵達
        p.evaluate("sessionStorage.setItem('__respDelay', '{}')")
        self.settle(p)
        self.assertNotIn(DAY + '#3', self.local(p), '舊快照不能把清掉的次數帶回本機')
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn')    # 再拉一次，也不能補送回雲端
        self.settle(p)
        self.assertEqual(self.sheet_counts(p), {})

    def test_R02_multi_day_clear_is_all_or_nothing_when_queue_save_fails(self):
        t = '2026-10-12T00:00:00.000Z'
        sheet = [[DAY, 5, '', '座位歪了', 1, t, 'tilt', '第3節'], ['2026-10-13', 5, '', '座位歪了', 1, t, 'tilt', '第3節']]
        p = self.open(at='10:35', sheet=sheet)
        p.evaluate("""() => { const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) { if (k === 'seatSyncQueue' && String(v).indexOf('clearDay') >= 0) throw new Error('QuotaExceeded'); return orig.call(this, k, v); }; }""")
        p.click('#seat-stats-btn')
        p.click('.seat-range-btn[data-range="all"]')
        p.click('#seat-purge-toggle')
        p.click('#seat-purge-range')
        p.wait_for_timeout(500)
        self.assertIn('儲存空間不足', p._dialogs[-1])
        self.assertEqual(set(self.local(p)), {DAY + '#3', '2026-10-13#3'}, '本機不動')
        self.assertEqual(len(self.sheet_counts(p)), 2, '雲端不動')
        self.assertNotIn('clearSeatDay', p.evaluate('window.__calls'))

    def test_R03_invalid_backup_is_rejected_not_silently_emptied(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#3': {'5': {'tilt': 'invalid'}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.wait_for_timeout(300)
        self.assertIn('不合格', p._dialogs[-1])
        self.assertFalse(p.evaluate("document.getElementById('seat-import-modal').classList.contains('show')"))
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2})

    def test_R04_undo_disabled_in_full_day_view(self):
        p = self.open(at='10:35', sheet=[])
        self.mode(p, '座位歪了')
        self.tap(p, 5)
        self.period(p, 'all')
        self.assertTrue(p.evaluate("document.getElementById('seat-undo-btn').disabled"))
        p.evaluate("document.getElementById('seat-undo-btn').disabled = false; document.getElementById('seat-undo-btn').click()")
        self.assertIn('全天', p._dialogs[-1])
        self.period(p, '3')
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 1, '全天時復原不扣')
        p.click('#seat-undo-btn')
        self.assertNotIn(DAY + '#3', self.local(p), '回到節次後復原堆疊還在')

    def test_R05_cross_midnight_follows_new_day(self):
        p = self.open(at='23:59', sheet=[])
        self.assertEqual(self.selected_period(p), '7')
        p.clock.fast_forward('02:00')
        p.wait_for_timeout(300)
        self.assertEqual(self.selected_period(p), 'm')
        self.assertIn('10/13', p.inner_text('#seat-check-date'))

    def test_R06_clear_one_student_keeps_others_pending_counts(self):
        p = self.open(at='10:35', sheet=[], session={'__delay': json.dumps({'setSeatCount': 600})})
        self.mode(p, '座位歪了')
        self.tap(p, 6); self.tap(p, 5); self.tap(p, 8)        # 6 在送出中，5、8 在排隊（408 沒有 7 號）
        p.click('#seat-modes button:has-text("逐項登記")')
        self.tap(p, 5)
        p.wait_for_timeout(300)
        p.click('#seat-modal-pass')                          # 清除 5 號本節
        q = json.loads(p.evaluate("localStorage.getItem('seatSyncQueue')"))
        pairs = [(j['type'], j.get('seat')) for j in q]
        self.assertIn(('count', '8'), pairs, '同節其他學生的待送工作保留')
        self.assertEqual(pairs[-1], ('clearSlot', '5'))
        self.assertLessEqual(pairs.count(('count', '5')), 1, '5 號只剩送出中的那一筆（無法撤回，由後面的清除蓋掉）')
        p.click('#seat-modal-done')
        self.settle(p, ms=6000)
        self.assertEqual(self.sheet_counts(p), {(DAY, '6', 'tilt', '第3節'): 1, (DAY, '8', 'tilt', '第3節'): 1})

    def test_R07_lost_reply_of_clear_is_not_executed_twice(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']],
                      session={'__lostReply': json.dumps({'clearSeatSlot': 1})})
        p.click('#seat-clear-btn')
        p.wait_for_timeout(400)
        self.assertIn('待同步', p.inner_text('#seat-sync-status'))
        p.clock.fast_forward('00:16')
        self.settle(p)
        self.assertEqual(len([c for c in p.evaluate('window.__execLog || []') if c == 'clearSeatSlot']), 2, '前端重送了一次')
        log = json.loads(json.loads(p.evaluate("sessionStorage.getItem('__props') || '{}'")).get('seatOpLog', '[]'))
        self.assertEqual(len([x for x in log if x.get('done')]), 1, '後端只真正執行一次')
        self.assertEqual(self.sheet_counts(p), {})
        self.assertIn('已同步', p.inner_text('#seat-sync-status'))

    # ── 第 2 輪程式審查（修正驗收）補測 ──
    def test_R08_queue_save_failure_restores_local_and_keeps_pending_counts(self):
        t = '2026-10-12T00:00:00.000Z'
        queue = [{'id': 'jfly', 'type': 'count', 'date': DAY + '#3', 'seat': '9', 'name': '', 'key': 'tilt', 'label': 'x', 'count': 1},
                 {'id': 'jzero', 'type': 'count', 'date': DAY + '#3', 'seat': '5', 'name': '', 'key': 'tilt', 'label': 'x', 'count': 0}]
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']],
                      local={'seatSyncQueue': json.dumps(queue), 'seatCheckRecords': json.dumps({DAY + '#3': {'9': {'tilt': 1}}})},
                      session={'__delay': json.dumps({'setSeatCount': 4000})})
        p.evaluate("""() => { const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) { if (k === 'seatSyncQueue' && String(v).indexOf('clearSlot') >= 0) throw new Error('QuotaExceeded'); return orig.call(this, k, v); }; }""")
        p.click('#seat-clear-btn')
        p.wait_for_timeout(300)
        self.assertIn('儲存空間不足', p._dialogs[-1])
        self.assertEqual(self.local(p).get(DAY + '#3', {}).get('9'), {'tilt': 1}, '本機還原')
        q = json.loads(p.evaluate("localStorage.getItem('seatSyncQueue')"))
        self.assertIn('jzero', [j['id'] for j in q], '原本排隊的「減到 0」工作還在')
        self.assertFalse(any(j['type'] == 'clearSlot' for j in q))
        self.assertNotIn('clearSeatSlot', p.evaluate('window.__calls'))

    def test_R09_restore_also_fails_still_no_clear_sent(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        p.evaluate("""() => { const orig = Storage.prototype.setItem; let recWrites = 0;
            Storage.prototype.setItem = function (k, v) {
              if (k === 'seatSyncQueue' && String(v).indexOf('clearSlot') >= 0) throw new Error('QuotaExceeded');
              if (k === 'seatCheckRecords' && ++recWrites >= 2) throw new Error('QuotaExceeded');   // 第 1 次（清除）成功，還原失敗
              return orig.call(this, k, v); }; }""")
        p.click('#seat-clear-btn')
        p.wait_for_timeout(300)
        self.assertIn('救援檔', p._dialogs[-1], '還原失敗時改為下載救援檔並暫停（不再承諾重新整理就會恢復）')
        self.assertNotIn('clearSeatSlot', p.evaluate('window.__calls'))
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2}, '試算表沒動')
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(500)
        p.click('#seat-sync-status [data-sync-action="resolve"]')   # 用試算表重建
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2, '從試算表重建')

    def test_R10_import_normalizes_seat_aliases(self):
        p = self.open(at='10:35', sheet=[])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#3': {'05': {'tilt': 2}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.wait_for_timeout(300)
        p.click('#seat-import-merge')
        self.settle(p)
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn'); self.settle(p)
        self.assertEqual(self.local(p), {DAY + '#3': {'5': {'tilt': 2}}}, '本機只有 5 號，沒有 05')
        self.assertEqual(p.inner_text('#seat-count-total'), '2')
        bad = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#4': {'05': {'tilt': 1}, '5': {'tilt': 1}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'c.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode('utf-8')}])
        p.wait_for_timeout(300)
        self.assertIn('同一人', p._dialogs[-1])


    # ── 第 3 輪程式審查（修正驗收）補測 ──
    def test_R11_import_normalizes_period_alias_too(self):
        p = self.open(at='10:35', sheet=[])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#?第3節': {'05': {'tilt': 2}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.wait_for_timeout(300)
        p.click('#seat-import-replace')
        p.wait_for_timeout(600)
        self.settle(p)
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn'); self.settle(p)
        self.assertEqual(self.local(p), {DAY + '#3': {'5': {'tilt': 2}}})
        self.period(p, 'all')
        self.assertEqual(p.inner_text('#seat-count-total'), '2')
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2})
        dup = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#?第4節': {'5': {'tilt': 1}}, DAY + '#4': {'5': {'tilt': 3}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'c.json', 'mimeType': 'application/json', 'buffer': json.dumps(dup).encode('utf-8')}])
        p.wait_for_timeout(300)
        self.assertIn('重複', p._dialogs[-1])

    def test_R12_restore_failure_downloads_rescue_and_stays_paused(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        names = []
        p.on('download', lambda d: names.append(d.suggested_filename))
        p.evaluate("""() => { const orig = Storage.prototype.setItem; let recWrites = 0;
            Storage.prototype.setItem = function (k, v) {
              if (k === 'seatSyncQueue' && String(v).indexOf('clearSlot') >= 0) throw new Error('QuotaExceeded');
              if (k === 'seatCheckRecords' && ++recWrites >= 2) throw new Error('QuotaExceeded');
              return orig.call(this, k, v); }; }""")
        p.click('#seat-clear-btn')
        p.wait_for_timeout(500)
        self.assertTrue(any('救援檔' in n for n in names), names)
        self.assertIn('還原失敗', p.inner_text('#seat-sync-status'))
        # 重新整理：仍暫停，不拉取合併、不補送
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(800)
        self.assertIn('還原失敗', p.inner_text('#seat-sync-status'))
        calls = p.evaluate('window.__calls')
        self.assertNotIn('setSeatCount', calls)
        self.assertNotIn('clearSeatSlot', calls)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2})
        # 處理：用試算表重建
        p.click('#seat-sync-status [data-sync-action="resolve"]')
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2)
        self.assertIn('已同步', p.inner_text('#seat-sync-status'))


    # ── 第 4 輪程式審查（修正驗收）補測 ──
    def test_R13_guard_write_failure_cancels_before_touching_anything(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        p.evaluate("""() => { const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) { if (k === 'seatCommitGuard') throw new Error('QuotaExceeded'); return orig.call(this, k, v); }; }""")
        p.click('#seat-clear-btn')
        p.wait_for_timeout(300)
        self.assertIn('沒有執行', p._dialogs[-1])
        self.assertEqual(self.local(p)[DAY + '#3']['5']['tilt'], 2)
        self.assertNotIn('clearSeatSlot', p.evaluate('window.__calls'))

    def test_R14_guard_survives_when_status_update_fails_and_blocks_push_after_reload(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#4': {'6': {'tilt': 1}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.wait_for_timeout(300)
        p.evaluate("""() => { const orig = Storage.prototype.setItem; let rec = 0;
            Storage.prototype.setItem = function (k, v) {
              if (k === 'seatSyncQueue' && String(v).indexOf('"import"') >= 0) throw new Error('QuotaExceeded');
              if (k === 'seatCheckRecords' && ++rec >= 2) throw new Error('QuotaExceeded');            // 還原失敗
              if (k === 'seatCommitGuard' && String(v).indexOf('failed') >= 0) throw new Error('QuotaExceeded');   // 連改狀態都失敗
              return orig.call(this, k, v); }; }""")
        p.click('#seat-import-replace')
        p.wait_for_timeout(900)
        self.assertTrue(p.evaluate("!!localStorage.getItem('seatCommitGuard')"), '動手前寫的保護標記還在')
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(800)
        self.assertIn('還原失敗', p.inner_text('#seat-sync-status'))
        self.assertNotIn('setSeatCount', p.evaluate('window.__calls'), '殘留的第 4 節紀錄不可被補傳')
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2})

    def test_R15_rebuild_keeps_unsynced_registrations_and_downloads_snapshot(self):
        t = '2026-10-12T00:00:00.000Z'
        p = self.open(at='10:35', sheet=[[DAY, 5, '', '座位歪了', 2, t, 'tilt', '第3節']])
        p.evaluate("""() => { const orig = Storage.prototype.setItem; let rec = 0;
            Storage.prototype.setItem = function (k, v) {
              if (k === 'seatSyncQueue' && String(v).indexOf('clearSlot') >= 0) throw new Error('QuotaExceeded');
              if (k === 'seatCheckRecords' && ++rec >= 2) throw new Error('QuotaExceeded');
              return orig.call(this, k, v); }; }""")
        p.click('#seat-clear-btn')
        p.wait_for_timeout(400)
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(500)   # 儲存恢復正常、仍暫停
        self.mode(p, '座位歪了')
        self.tap(p, 6)                                                  # 暫停期間新增一筆（排隊中、還沒送）
        p.wait_for_timeout(200)
        self.assertNotIn('setSeatCount', p.evaluate('window.__calls'))
        names = []
        p.on('download', lambda d: names.append(d.suggested_filename))
        p.click('#seat-sync-status [data-sync-action="resolve"]')
        self.settle(p, ms=4000)
        self.assertTrue(any('重建前現況' in n for n in names), names)
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '第3節'): 2, (DAY, '6', 'tilt', '第3節'): 1}, '暫停期間的登記有送出')
        self.settle(p)
        self.assertEqual(self.local(p)[DAY + '#3'], {'5': {'tilt': 2}, '6': {'tilt': 1}})

    def test_R16_import_trims_unknown_period_and_checks_legacy_array_duplicates(self):
        p = self.open(at='10:35', sheet=[])
        data = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#? 補課 ': {'5': {'tilt': 2}}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode('utf-8')}])
        p.wait_for_timeout(300)
        p.click('#seat-import-replace')
        p.wait_for_timeout(600)
        self.settle(p)
        p.click('#tab-timer-btn'); p.click('#tab-seat-btn'); self.settle(p)
        self.assertEqual(self.local(p), {DAY + '#?補課': {'5': {'tilt': 2}}})
        self.assertEqual(self.sheet_counts(p), {(DAY, '5', 'tilt', '補課'): 2})
        dup = {'type': 'seat-check', 'seatCheckRecords': {DAY + '#3': {'5': {'tilt': 9}}, DAY + '#?第3節': {'5': ['tilt']}}}
        p.set_input_files('#seat-import-input', files=[{'name': 'c.json', 'mimeType': 'application/json', 'buffer': json.dumps(dup).encode('utf-8')}])
        p.wait_for_timeout(300)
        self.assertIn('重複', p._dialogs[-1])


if __name__ == '__main__':
    unittest.main()
