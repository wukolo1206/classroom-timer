# -*- coding: utf-8 -*-
"""「🔊 音量計」分頁：全校版（universal.html）與 408 版（index.html / GAS）本機驗收。

執行：python -m unittest discover -s tests -p test_noise_meter.py -v
用 Chromium 假麥克風（--use-fake-device-for-media-stream）；資料只在測試用的暫存瀏覽器 context。
"""
import functools, http.server, json, os, shutil, socketserver, tempfile, threading, unittest

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'universal.html')
CLASS = {'className': '305', 'teacherName': '示範老師', 'leaderName': '', 'studentCount': 3, 'studentNames': ['甲生', '乙生', '丙生']}
ALL_TABS = ['sh150', 'weekly', 'sr', 'timer', 'seat', 'group', 'noise']
SHOW_NOISE = {'ctu_timerTabHidden': '[]', 'ctu_timerTabKnown': json.dumps(ALL_TABS)}


class NoiseMeter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='ctu_noise_')
        os.makedirs(os.path.join(cls.tmp, 'classroom-timer'))
        shutil.copy(SRC, os.path.join(cls.tmp, 'classroom-timer', 'universal.html'))

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%d/classroom-timer/universal.html' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def open(self, storage=None, init_js=''):
        ctx = self.browser.new_context(viewport={'width': 1366, 'height': 900})
        page = ctx.new_page()
        page._errs = []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page._dialogs = []
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        init = {'ctu_class': json.dumps(CLASS, ensure_ascii=False),
                'ctu_meta': json.dumps({'schema': 1, 'sh150Import': {'result': 'declined'}})}
        init.update(storage or {})
        ctx.add_init_script('(() => { if (sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded", "1");'
                            ' const s = %s; for (const k in s) localStorage.setItem(k, s[k]); })()' % json.dumps(init, ensure_ascii=False))
        if init_js:
            ctx.add_init_script(init_js)
        page.goto(self.url)
        page.wait_for_timeout(600)
        self.addCleanup(ctx.close)
        self.addCleanup(lambda: self.assertEqual(page._errs, []))
        return page

    def state(self, page):
        return page.evaluate('() => window.ctuNoiseState()')

    def stored(self, page, key):
        raw = page.evaluate('k => localStorage.getItem(k)', key)
        return json.loads(raw) if raw else None

    def start(self, page):
        page.click('#tab-noise-btn')
        page.click('#noise-start')
        page.wait_for_function('() => { const s = window.ctuNoiseState(); return s.running && s.level !== null; }', timeout=5000)

    # ── 分頁顯示 ──
    def test_new_teacher_tab_hidden_but_listed_in_settings(self):
        page = self.open()
        self.assertFalse(page.is_visible('#tab-noise-btn'))
        page.click('#tab-order-btn')
        page.wait_for_timeout(300)
        self.assertIn('🔊 音量計', page.inner_text('#tab-order-list'))

    def test_teacher_with_saved_tabs_does_not_suddenly_see_noise(self):
        page = self.open({'ctu_timerTabHidden': json.dumps(['group'])})   # v1.17 以前存的設定，沒有 timerTabKnown
        self.assertFalse(page.is_visible('#tab-noise-btn'))
        self.assertFalse(page.is_visible('#tab-group-btn'))
        self.assertTrue(page.is_visible('#tab-timer-btn'))
        # 在 ⚙️ 打開音量計 → 重新整理後保留
        page.click('#tab-order-btn')
        row = page.locator('#tab-order-list > div', has_text='音量計')
        row.locator('input[type=checkbox]').check()
        page.click('#tab-order-save')
        self.assertTrue(page.is_visible('#tab-noise-btn'))
        self.assertEqual(self.stored(page, 'ctu_timerTabKnown'), ALL_TABS)
        page.reload(); page.wait_for_timeout(600)
        self.assertTrue(page.is_visible('#tab-noise-btn'))
        self.assertFalse(page.is_visible('#tab-group-btn'))

    # ── 偵測 ──
    def test_measures_level_and_stops_when_leaving_tab(self):
        page = self.open(SHOW_NOISE)
        self.start(page)
        self.assertRegex(page.inner_text('#noise-db'), r'^\d+$')
        self.assertEqual(page.inner_text('#noise-start'), '⏸ 停止偵測')
        page.wait_for_function('() => window.ctuNoiseState().stats.ms >= 1500', timeout=5000)
        s = self.state(page)
        self.assertIn(s['status'], ('green', 'yellow', 'red'))
        self.assertEqual(s['stats']['ms'], s['stats']['green'] + s['stats']['yellow'] + s['stats']['red'])
        self.assertRegex(page.get_attribute('#noise-display', 'class'), r'noise-(green|yellow|red)')
        # 切到別的分頁 → 麥克風關閉
        page.click('#tab-weekly-btn')
        self.assertFalse(self.state(page)['running'])
        page.click('#tab-noise-btn')
        self.assertEqual(page.inner_text('#noise-start'), '▶ 開始偵測')
        self.assertEqual(page.inner_text('#noise-db'), '--')
        self.assertIn('麥克風已關閉', page.inner_text('#noise-msg'))

    def test_silent_buffers_are_ignored(self):
        # 模擬麥克風送出全 0（被靜音）：不顯示怪數字，3 秒後提示
        js = ('const _orig = AnalyserNode.prototype.getFloatTimeDomainData;'
              'AnalyserNode.prototype.getFloatTimeDomainData = function (b) { b.fill(0); };')
        page = self.open(SHOW_NOISE, init_js=js)
        page.click('#tab-noise-btn')
        page.click('#noise-start')
        page.wait_for_function("() => document.getElementById('noise-msg').textContent.indexOf('收不到聲音') > -1", timeout=6000)
        s = self.state(page)
        self.assertTrue(s['running'])
        self.assertIsNone(s['level'])
        self.assertEqual(page.inner_text('#noise-db'), '--')
        self.assertEqual(s['stats']['ms'], 0)

    def test_stop_button_and_reset_stats(self):
        page = self.open(SHOW_NOISE)
        self.start(page)
        page.wait_for_function('() => window.ctuNoiseState().stats.ms >= 500', timeout=5000)
        page.click('#noise-start')
        self.assertFalse(self.state(page)['running'])
        self.assertEqual(page.inner_text('#noise-status'), '已停止')
        page.click('#noise-stat-reset')
        self.assertEqual(self.state(page)['stats']['ms'], 0)
        self.assertEqual(page.inner_text('#noise-stat-time'), '0:00')
        self.assertEqual(page.inner_text('#noise-stat-peak'), '--')

    # ── 校正與門檻 ──
    def test_calibration_aligns_and_persists(self):
        page = self.open(SHOW_NOISE)
        page.click('#tab-noise-btn')
        page.click('#noise-settings summary')
        page.fill('#noise-cal-input', '60')
        page.click('#noise-cal-apply')                      # 還沒開始偵測 → 提醒、不改設定
        self.assertIn('先按', page._dialogs[-1])
        self.assertIsNone(self.stored(page, 'ctu_noiseSettings'))
        page.click('#noise-start')
        page.wait_for_function('() => window.ctuNoiseState().level !== null', timeout=5000)
        page.click('#noise-cal-apply')
        self.assertIn('已對齊', page.inner_text('#noise-msg'))
        cfg = self.stored(page, 'ctu_noiseSettings')
        self.assertTrue(cfg['calibrated'])
        self.assertTrue(20 < cfg['offset'] < 200)
        self.assertIn('已校正', page.inner_text('#noise-cal-state'))
        page.reload(); page.wait_for_timeout(600)
        page.click('#tab-noise-btn')
        self.assertAlmostEqual(self.state(page)['offset'], cfg['offset'], places=6)
        page.click('#noise-settings summary')
        page.click('#noise-cal-reset')
        self.assertFalse(self.stored(page, 'ctu_noiseSettings')['calibrated'])
        self.assertEqual(self.stored(page, 'ctu_noiseSettings')['offset'], 95)

    def test_threshold_validation_and_mode(self):
        page = self.open(SHOW_NOISE)
        page.click('#tab-noise-btn')
        page.click('#noise-settings summary')
        page.fill('#noise-th-study-y', '70'); page.fill('#noise-th-study-r', '60')
        page.click('#noise-th-save')
        self.assertIn('小於', page._dialogs[-1])
        self.assertIsNone(self.stored(page, 'ctu_noiseSettings'))
        page.fill('#noise-th-study-y', '45'); page.fill('#noise-th-study-r', '58')
        page.select_option('#noise-win', '3')
        page.click('#noise-th-save')
        cfg = self.stored(page, 'ctu_noiseSettings')
        self.assertEqual(cfg['th']['study'], {'y': 45, 'r': 58})
        self.assertEqual(cfg['win'], 3)
        page.click('[data-noise-mode="discuss"]')
        self.assertIn('active', page.get_attribute('[data-noise-mode="discuss"]', 'class'))
        self.assertEqual(self.stored(page, 'ctu_noiseSettings')['mode'], 'discuss')
        # 黃燈標記位置跟著情境換：討論 62 → (62-30)/60
        left = page.evaluate("() => document.getElementById('noise-mark-y').style.left")
        self.assertAlmostEqual(float(left.rstrip('%')), (62 - 30) / 60 * 100, places=3)
        page.click('#noise-th-reset')
        self.assertEqual(self.stored(page, 'ctu_noiseSettings')['th']['study'], {'y': 40, 'r': 60})

    def test_study_yellow_label_is_sound(self):
        # 安靜自習：40 分貝以上顯示「有聲音」（固定校正值讓 dBFS -50 → 45 分貝）
        page = self.open(dict(SHOW_NOISE, ctu_noiseSettings=json.dumps({'offset': 95, 'calibrated': True})))
        self.start(page)
        page.evaluate("() => { window.__lv = -50; AnalyserNode.prototype.getFloatTimeDomainData = function (b) { b.fill(Math.pow(10, window.__lv / 20)); }; }")
        page.wait_for_function("() => document.getElementById('noise-db').textContent === '45'", timeout=5000)
        self.assertEqual(page.inner_text('#noise-status'), '有聲音')
        page.evaluate("() => { window.__lv = -60; }")    # 35 分貝 → 很安靜
        page.wait_for_function("() => document.getElementById('noise-db').textContent === '35'", timeout=5000)
        self.assertEqual(page.inner_text('#noise-status'), '很安靜 👍')

    def test_corrupt_settings_fall_back_to_defaults(self):
        bad = json.dumps({'mode': 'party', 'th': {'study': {'y': 80, 'r': 40}}, 'offset': 'x', 'win': 9})
        page = self.open(dict(SHOW_NOISE, ctu_noiseSettings=bad))
        page.click('#tab-noise-btn')
        s = self.state(page)
        self.assertEqual(s['mode'], 'study')
        self.assertEqual(s['offset'], 95)
        self.assertEqual(page.input_value('#noise-th-study-y'), '40')
        self.assertEqual(page.input_value('#noise-win'), '2')

    # ── 麥克風錯誤 ──
    def mic_error(self, name):
        js = ('navigator.mediaDevices.getUserMedia = function () {'
              ' return Promise.reject(new DOMException("x", "%s")); };' % name)
        page = self.open(SHOW_NOISE, init_js=js)
        page.click('#tab-noise-btn')
        page.click('#noise-start')
        page.wait_for_timeout(300)
        self.assertFalse(self.state(page)['running'])
        self.assertTrue(page.is_enabled('#noise-start'))
        return page.inner_text('#noise-msg')

    def test_mic_denied_message(self):
        self.assertIn('封鎖', self.mic_error('NotAllowedError'))

    def test_no_mic_message(self):
        self.assertIn('找不到麥克風', self.mic_error('NotFoundError'))

    def test_mic_busy_message(self):
        self.assertIn('其他程式', self.mic_error('NotReadableError'))



class Noise408(unittest.TestCase):
    """408 版：分頁一律顯示；GAS 網址不能用麥克風，改顯示 GitHub Pages 連結。"""
    @classmethod
    def setUpClass(cls):
        from test_sr_408 import MOCK_GAS
        cls.mock_gas = MOCK_GAS
        cls.tmp = tempfile.mkdtemp(prefix='c408_noise_')
        shutil.copy(os.path.join(ROOT, 'index.html'), os.path.join(cls.tmp, 'index.html'))

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%d/index.html' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def open(self, gas=False, query=''):
        ctx = self.browser.new_context(viewport={'width': 1366, 'height': 900})
        self.addCleanup(ctx.close)
        if gas:
            ctx.add_init_script(self.mock_gas)
        page = ctx.new_page()
        page._errs = []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        page.goto(self.url + query)
        page.wait_for_timeout(800)
        self.addCleanup(lambda: self.assertEqual(page._errs, []))
        return page

    def test_pages_tab_visible_measures_and_settings_persist(self):
        page = self.open()
        self.assertTrue(page.is_visible('#tab-noise-btn'))
        page.click('#tab-noise-btn')
        self.assertFalse(page.is_visible('#noise-gas-note'))
        page.click('#noise-start')
        page.wait_for_function('() => { const s = window.ctuNoiseState(); return s.running && s.level !== null; }', timeout=5000)
        self.assertRegex(page.inner_text('#noise-db'), r'^\d+$')
        page.click('[data-noise-mode="discuss"]')
        self.assertEqual(json.loads(page.evaluate("() => localStorage.getItem('c408_noiseSettings')"))['mode'], 'discuss')
        self.assertIsNone(page.evaluate("() => localStorage.getItem('ctu_noiseSettings')"))
        page.reload(); page.wait_for_timeout(800)
        page.click('#tab-noise-btn')
        self.assertEqual(page.evaluate('() => window.ctuNoiseState().mode'), 'discuss')
        page.click('#tab-timer-btn')
        self.assertFalse(page.evaluate('() => window.ctuNoiseState().running'))

    def test_query_opens_noise_tab(self):
        page = self.open(query='?tab=noise')
        self.assertTrue(page.is_visible('#panel-noise'))
        self.assertIn('tab-active', page.get_attribute('#tab-noise-btn', 'class'))

    def test_gas_shows_pages_link_instead_of_mic(self):
        page = self.open(gas=True)
        page.click('#tab-noise-btn')
        self.assertTrue(page.is_visible('#noise-gas-note'))
        self.assertFalse(page.is_visible('#noise-start'))
        self.assertEqual(page.get_attribute('#noise-gas-note a', 'href'), 'https://wukolo1206.github.io/classroom-timer/?tab=noise')
        self.assertIn('不能使用麥克風', page.inner_text('#noise-msg'))


if __name__ == '__main__':
    unittest.main()
