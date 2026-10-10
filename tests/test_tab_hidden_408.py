# -*- coding: utf-8 -*-
"""408 版（index.html / GAS）⚙️ 分頁設定的「顯示」勾選（隱藏分頁）。

執行：python -m unittest discover -s tests -p test_tab_hidden_408.py -v
隱藏設定只存這台電腦的 timerTabHidden；GAS 以模擬 google.script.run 代替，不會連到正式試算表。
"""
import functools, http.server, json, os, shutil, socketserver, tempfile, threading, unittest

from playwright.sync_api import sync_playwright
from test_sr_408 import MOCK_GAS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALL = ['timer', 'group', 'exam', 'seat', 'weekly', 'sr', 'noise']


class TabHidden408(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='c408_tabs_')
        shutil.copy(os.path.join(ROOT, 'index.html'), os.path.join(cls.tmp, 'index.html'))

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%d/index.html' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def open(self, local=None, gas=False):
        ctx = self.browser.new_context(viewport={'width': 1366, 'height': 900})
        self.addCleanup(ctx.close)
        ctx.add_init_script('(() => { if (window !== window.top || sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded","1");'
                            ' const l = %s; for (const k in l) localStorage.setItem(k, l[k]); })()' % json.dumps(local or {}, ensure_ascii=False))
        if gas:
            ctx.add_init_script(MOCK_GAS)
        page = ctx.new_page()
        page._errs = []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page._dialogs = []
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        page.goto(self.url)
        page.wait_for_timeout(800)
        self.addCleanup(lambda: self.assertEqual(page._errs, []))
        return page

    def visible(self, page):
        return [k for k in ALL if page.is_visible('#tab-%s-btn' % k)]

    def active(self, page):
        return [k for k in ALL if 'tab-active' in (page.get_attribute('#tab-%s-btn' % k, 'class') or '')]

    def settings(self, page):
        page.click('#tab-order-btn')
        page.wait_for_timeout(300)

    def toggle(self, page, label, on):
        cb = page.locator('#tab-order-list > div', has_text=label).locator('input[type=checkbox]')
        cb.check() if on else cb.uncheck()

    def test_default_all_tabs_visible_with_checkboxes(self):
        page = self.open()
        self.assertEqual(self.visible(page), ALL)
        self.settings(page)
        boxes = page.locator('#tab-order-list input[type=checkbox]')
        self.assertEqual(boxes.count(), len(ALL))
        self.assertTrue(all(boxes.nth(i).is_checked() for i in range(len(ALL))))
        self.assertIn('預設畫面', page.locator('#tab-order-list > div').first.inner_text())

    def test_hide_tabs_persists_and_switches_away(self):
        page = self.open()
        self.assertEqual(self.active(page), ['timer'])
        self.settings(page)
        self.toggle(page, '倒數計時', False)
        self.toggle(page, '監考', False)
        # 「預設畫面」移到第一個沒隱藏的分頁
        self.assertIn('預設畫面', page.locator('#tab-order-list > div', has_text='小組討論').inner_text())
        page.click('#tab-order-save')
        page.wait_for_timeout(300)
        self.assertEqual(self.visible(page), ['group', 'seat', 'weekly', 'sr', 'noise'])
        self.assertEqual(self.active(page), ['group'])        # 原本在倒數計時 → 切到第一個顯示的分頁
        self.assertEqual(json.loads(page.evaluate("() => localStorage.getItem('timerTabHidden')")), ['timer', 'exam'])
        self.assertIsNotNone(page.query_selector('a[href*="sh150"]'))   # SH150 外部連結不受影響
        page.reload(); page.wait_for_timeout(800)
        self.assertEqual(self.visible(page), ['group', 'seat', 'weekly', 'sr', 'noise'])
        self.assertEqual(self.active(page), ['group'])

    def test_cancel_and_reset(self):
        page = self.open({'timerTabHidden': json.dumps(['exam'])})
        self.settings(page)
        self.toggle(page, '秩序登記', False)
        page.click('#tab-order-cancel')
        self.assertTrue(page.is_visible('#tab-seat-btn'))
        self.assertFalse(page.is_visible('#tab-exam-btn'))
        self.settings(page)
        page.click('#tab-order-reset')
        page.click('#tab-order-save')
        self.assertEqual(self.visible(page), ALL)
        self.assertEqual(json.loads(page.evaluate("() => localStorage.getItem('timerTabHidden')")), [])

    def test_must_keep_one_tab(self):
        page = self.open({'timerTabHidden': json.dumps(ALL[1:])})
        self.assertEqual(self.visible(page), ['timer'])
        self.settings(page)
        cb = page.locator('#tab-order-list > div', has_text='倒數計時').locator('input[type=checkbox]')
        cb.click()
        self.assertTrue(cb.is_checked())
        self.assertIn('至少要保留一個分頁', page._dialogs[-1])

    def test_corrupt_or_all_hidden_shows_everything(self):
        self.assertEqual(self.visible(self.open({'timerTabHidden': 'not json'})), ALL)
        self.assertEqual(self.visible(self.open({'timerTabHidden': json.dumps(ALL)})), ALL)

    def test_hidden_timer_with_running_countdown_lands_on_first_visible(self):
        state = {'totalSeconds': 300, 'initialTotalSeconds': 300, 'startTimestamp': 0, 'isPaused': True,
                 'currentEvent': '', 'currentActions': '', 'studentCount': 20, 'registeredStudents': []}
        page = self.open({'timerTabHidden': json.dumps(['timer']), 'timerActiveState': json.dumps(state)})
        self.assertEqual(self.active(page), ['group'])

    def test_gas_mode_hidden_stays_local(self):
        page = self.open(gas=True)
        self.settings(page)
        self.toggle(page, '音量計', False)
        page.click('#tab-order-save')
        page.wait_for_timeout(300)
        self.assertFalse(page.is_visible('#tab-noise-btn'))
        self.assertIn('saveSeatSettings', page.evaluate('() => window.__calls'))   # 順序照舊同步，隱藏只存本機
        self.assertEqual(json.loads(page.evaluate("() => localStorage.getItem('timerTabHidden')")), ['noise'])


if __name__ == '__main__':
    unittest.main()
