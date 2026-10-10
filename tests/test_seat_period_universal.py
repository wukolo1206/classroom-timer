# -*- coding: utf-8 -*-
"""全校版（universal.html）秩序登記「每節課分開記錄」：只存本機（ctu_ 前綴）。

執行：python -m unittest discover -s tests -p test_seat_period_universal.py -v
只用虛構姓名。
"""
import datetime, functools, http.server, json, os, shutil, socketserver, tempfile, threading, unittest

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAY = '2026-10-12'
CLASS = {'className': '408', 'teacherName': '示範老師', 'leaderName': '', 'studentCount': 8,
         'studentNames': ['王小明', '李小華', '陳大同', '林美美', '張志強', '黃怡君', '吳家豪', '劉雅婷']}


class SeatPeriodUniversal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='seatu_')
        os.makedirs(os.path.join(cls.tmp, 'classroom-timer'))
        shutil.copy(os.path.join(ROOT, 'universal.html'), os.path.join(cls.tmp, 'classroom-timer', 'universal.html'))

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%d/classroom-timer/universal.html' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def open(self, at='10:35', records=None, extra=None):
        ctx = self.browser.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 1000})
        self.addCleanup(ctx.close)
        seed = {'ctu_timerTabHidden': '[]', 'ctu_class': json.dumps(CLASS, ensure_ascii=False),
                'ctu_meta': json.dumps({'schema': 1, 'sh150Import': {'result': 'declined'}}),
                'ctu_timerTabOrder': json.dumps(['seat', 'sh150', 'weekly', 'sr', 'timer', 'group'])}
        if records is not None:
            seed['ctu_seatCheckRecords'] = json.dumps(records)
        seed.update(extra or {})
        ctx.add_init_script('(() => { if (window !== window.top || sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded","1");'
                            ' const l = %s; for (const k in l) localStorage.setItem(k, l[k]); })()' % json.dumps(seed, ensure_ascii=False))
        page = ctx.new_page()
        h, m = map(int, at.split(':'))
        page.clock.install(time=datetime.datetime(2026, 10, 12, h, m))
        page._errs, page._dialogs = [], []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        page.goto(self.url)
        page.wait_for_timeout(400)
        page.click('#tab-seat-btn')
        page.wait_for_timeout(300)
        return page

    def local(self, page):
        return json.loads(page.evaluate("localStorage.getItem('ctu_seatCheckRecords') || '{}'"))

    def selected_period(self, page):
        return page.evaluate("(() => { const b = [...document.querySelectorAll('#seat-period-bar button')].find(x => x.className.includes('bg-sky-600')); return b ? b.getAttribute('data-period') : null; })()")

    def test_U01_per_period_and_storage_prefix(self):
        p = self.open(at='13:40')
        self.assertEqual(self.selected_period(p), '5')
        before = p.evaluate("Object.keys(localStorage)")
        p.click('#seat-modes button:has-text("座位歪了")')
        p.click('#seat-chart button[data-seat="2"]')
        p.click('#seat-period-bar button[data-period="6"]')
        self.assertEqual(p.inner_text('#seat-count-total'), '0')
        self.assertEqual(self.local(p), {DAY + '#5': {'2': {'tilt': 1}}})
        new_keys = [k for k in p.evaluate("Object.keys(localStorage)") if k not in before]
        self.assertTrue(all(k.startswith('ctu_') for k in new_keys), new_keys)
        self.assertIsNone(p.evaluate("localStorage.getItem('seatCheckRecords')"), '不可寫入 408 本機版的 key')
        self.assertIn('本機模式', p.inner_text('#seat-sync-status'))
        self.assertEqual(p._errs, [])

    def test_U02_legacy_unassigned_and_clear(self):
        recs = {DAY: {'3': {'tilt': 2}}, DAY + '#3': {'4': {'trash': 1}}, '2026-10-13#3': {'4': {'trash': 1}}}
        p = self.open(at='10:35', records=recs)
        self.assertTrue(p.is_visible('#seat-period-bar button[data-period=""]'))
        p.click('#seat-clear-btn')     # 清除本節（第 3 節）
        self.assertEqual(set(self.local(p)), {DAY, '2026-10-13#3'})
        p.click('#seat-clear-day-btn')
        self.assertEqual(set(self.local(p)), {'2026-10-13#3'})

    def test_U03_stats_filter_and_detail_csv_full_names(self):
        recs = {DAY + '#3': {'1': {'tilt': 2}}, DAY + '#4': {'1': {'tilt': 1}}, '2026-10-13#3': {'2': {'bag': 1}}}
        p = self.open(at='10:35', records=recs)
        p.click('#seat-stats-btn')
        p.click('.seat-range-btn[data-range="all"]')
        self.assertIn('共 2 天', p.inner_text('#seat-stats-meta'))
        p.click('.seat-pf-btn[data-pfilter="current"]')
        rows = p.evaluate("[...document.querySelectorAll('#seat-stats-table tbody tr')].map(r => [r.children[0].innerText.trim(), r.children[r.children.length - 2].innerText.trim()])")
        self.assertEqual(dict(rows), {'1': '2', '2': '1'}, '本節＝第 3 節')
        with p.expect_download() as d:
            p.click('#seat-csv-detail-btn')
        path = os.path.join(self.tmp, 'u_detail.csv')
        d.value.save_as(path)
        text = open(path, encoding='utf-8-sig').read()
        self.assertIn(DAY + ',第3節,1,王小明,座位歪了,2', text, 'CSV 用全名')
        self.assertNotIn('第4節', text)

    def test_U04_modal_and_undo_keep_slot(self):
        p = self.open(at='11:15')
        p.click('#seat-chart button[data-seat="3"]')
        p.wait_for_timeout(300)
        p.clock.fast_forward('10:00')
        p.wait_for_timeout(300)
        p.click('#seat-modal-list button:has-text("書包沒放好")')
        p.click('#seat-modal-done')
        p.wait_for_timeout(200)
        self.assertEqual(self.local(p), {DAY + '#3': {'3': {'bag': 1}}})
        self.assertEqual(self.selected_period(p), '4')
        p.click('#seat-modes button:has-text("座位歪了")')
        p.click('#seat-chart button[data-seat="3"]')
        p.click('#seat-period-bar button[data-period="1"]')
        p.click('#seat-undo-btn')
        self.assertEqual(self.local(p), {DAY + '#3': {'3': {'bag': 1}}}, '復原扣回第 4 節')

    def test_U05_full_backup_contains_period_records(self):
        recs = {DAY + '#3': {'1': {'tilt': 2}}}
        p = self.open(at='10:35', records=recs)
        with p.expect_download() as d:
            p.evaluate("ctuFullBackup('')")
        path = os.path.join(self.tmp, 'u_backup.json')
        d.value.save_as(path)
        data = json.load(open(path, encoding='utf-8'))['data']
        self.assertEqual(json.loads(data['ctu_seatCheckRecords']), recs)


if __name__ == '__main__':
    unittest.main()
