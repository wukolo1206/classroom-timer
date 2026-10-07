# -*- coding: utf-8 -*-
"""全校版 SH150 學校表單填報：本機驗收（計算 C、設定 S、介面 U、資料隔離 D、回歸 R）。

執行：python -m unittest discover -s tests -p test_sh150_school_form.py -v
只用虛構資料；Google 表單網址一律由 Playwright 攔截，不連正式學校表單。
"""
import functools, hashlib, http.server, io, json, os, re, shutil, socketserver, tempfile, threading, unittest
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'universal.html')
FORM = 'https://docs.google.com/forms/d/e/1FAIpQLScMjfAwV9ZSrQt0eS_qd9Aku18SX_txnINZXc6sE5lAQ3PX2Q/viewform'
DATE_PARAMS = ['entry.682543904_' + x for x in ('year', 'month', 'day', 'hour', 'minute')]
CORE = {'teacherName': 'entry.1346505626', 'className': 'entry.1762303383',
        'studentTotal': 'entry.1337826514', 'teacherTotal': 'entry.1653264987'}


def compact(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def week_records(records, teacher_runs=None):
    return {'version': 2, 'currentWeek': 6, 'allWeeksData': {
        '6': {'records': records, 'teacherRuns': teacher_runs or {'1': 0, '2': 0, '3': 0, '4': 0, '5': 0}}}}


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='ctu_form_')
        os.makedirs(os.path.join(cls.tmp, 'classroom-timer'))
        shutil.copy(SRC, os.path.join(cls.tmp, 'classroom-timer', 'universal.html'))
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        handler = functools.partial(Quiet, directory=cls.tmp)
        cls.srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%d/classroom-timer/universal.html' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def open(self, storage=None, cls_cfg=None, viewport=(1366, 900)):
        """開一個獨立 context；storage 是要預先放進 localStorage 的 key→字串。"""
        ctx = self.browser.new_context(accept_downloads=True, viewport={'width': viewport[0], 'height': viewport[1]})
        self.opened = []
        def google(route):
            self.opened.append(route.request.url)
            route.fulfill(status=200, content_type='text/html', body='<html><body>測試攔截</body></html>')
        ctx.route('https://docs.google.com/**', google)
        ctx.route('https://forms.gle/**', google)
        page = ctx.new_page()
        page._errs = []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page._dialogs = []
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        init = {'ctu_timerTabHidden': '[]',
                'ctu_class': json.dumps(cls_cfg or {'className': '101', 'teacherName': '示範老師', 'leaderName': '甲、乙',
                                                    'studentCount': 30, 'studentNames': []}, ensure_ascii=False)}
        init.update(storage or {})
        ctx.add_init_script('(() => { if (sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded", "1");'
                            ' const s = %s; for (const k in s) localStorage.setItem(k, s[k]); })()' % json.dumps(init, ensure_ascii=False))
        page.goto(self.url)
        page.wait_for_timeout(700)
        self.addCleanup(ctx.close)
        return page

    def sh150(self, page):
        page.click('#tab-sh150-btn')
        page.wait_for_function("() => { const f = document.getElementById('sh150-frame'); return f && f.contentWindow && f.contentWindow.ctuGetSh150ReportSnapshot; }", timeout=8000)
        page.wait_for_timeout(300)
        return page.frame_locator('#sh150-frame')

    def storage(self, page):
        return page.evaluate("() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; }")

    def summarize(self, page, snapshot, roster=30, extra=0):
        return page.evaluate("([s, r, e]) => ctuSchoolForm.summarizeWeek(s, r, e)", [snapshot, roster, extra])


def snap(records, teacher=None, week=6):
    return {'week': week, 'records': records, 'teacherRuns': teacher or {}, 'rosterCount': 30,
            'dates': [{'day': d, 'ymd': '2026-10-%02d' % (4 + d)} for d in range(1, 6)]}


class TestCalc(Base):
    def test_C01_example(self):
        p = self.open()
        s = snap({'1_1': {'run': 1, 'jump': 150}, '2_1': {'run': 2, 'jump': 100}, '3_2': {'run': 0, 'jump': 100}},
                 {'1': 2, '2': 1})
        r = self.summarize(p, s)
        self.assertEqual(r['studentTotal'], 4)
        self.assertEqual(r['teacherTotal'], 3)
        self.assertEqual(r['studentJumpTotal'], 350)
        self.assertEqual(r['studentRunTotal'] + r['studentJumpLaps'] + 2 * r['teacherRunTotal'], 10)
        r2 = self.summarize(p, s, extra=2)
        self.assertEqual(r2['teacherTotal'], 5)
        self.assertEqual(r2['teacherRunTotal'], 3)
        self.assertEqual(s['records']['1_1'], {'run': 1, 'jump': 150})   # 輸入未被改動

    def test_C02_class_sum_before_floor(self):
        p = self.open()
        r = self.summarize(p, snap({'1_1': {'jump': 100}, '2_1': {'jump': 100}}))
        self.assertEqual(r['studentJumpLaps'], 1)
        self.assertEqual(r['studentTotal'], 1)

    def test_C03_daily_floor_not_weekly(self):
        p = self.open()
        r = self.summarize(p, snap({'1_1': {'jump': 199}, '1_2': {'jump': 1}}))
        self.assertEqual(r['studentJumpLaps'], 0)
        self.assertEqual(r['studentJumpTotal'], 200)

    def test_C04_empty_and_teacher_only(self):
        p = self.open()
        r = self.summarize(p, snap({}))
        self.assertFalse(r['hasRecords'])
        self.assertEqual(r['studentTotal'], 0)
        r = self.summarize(p, snap({}, {'3': 3}))
        self.assertTrue(r['hasRecords'])
        self.assertEqual(r['studentTotal'], 0)
        self.assertEqual(r['teacherTotal'], 3)

    def test_C05_out_of_roster_seat_counted(self):
        p = self.open()
        r = self.summarize(p, snap({'40_1': {'run': 2}}), roster=30)
        self.assertEqual(r['studentTotal'], 2)
        self.assertEqual(r['recordedOutOfRosterSeats'], [40])
        self.assertTrue(any('40' in w for w in r['warnings']))

    def test_C06_invalid_values(self):
        p = self.open()
        ok = self.summarize(p, snap({'1_1': {'run': '3', 'jump': '200'}}))
        self.assertEqual(ok['errors'], [])
        self.assertEqual(ok['studentTotal'], 4)
        for bad in [-1, 1.5, 'abc', None]:
            val = bad if bad is not None else 'NaN'
            r = self.summarize(p, snap({'1_1': {'run': val}}))
            self.assertTrue(r['errors'], 'run=%r 應判定有誤' % (bad,))
        r = p.evaluate("() => ctuSchoolForm.summarizeWeek({week: 6, records: {'1_1': {run: Infinity}}, teacherRuns: {}, dates: []}, 30, 0)")
        self.assertTrue(r['errors'])
        r = self.summarize(p, snap({'1_6': {'run': 5}, 'x_1': {'run': 5}, '1_1': {'run': 1}}))
        self.assertEqual(r['studentTotal'], 1)
        self.assertEqual(len([w for w in r['warnings'] if '未計入' in w]), 2)
        r = self.summarize(p, snap({'1_1': {'run': 1}}), extra=-1)
        self.assertTrue(r['errors'])

    def test_C07_selected_week_from_frame_memory(self):
        rec = {'version': 2, 'currentWeek': 6, 'allWeeksData': {
            '3': {'records': {'1_1': {'run': 3, 'jump': 0}}, 'teacherRuns': {'1': 1}},
            '6': {'records': {'1_1': {'run': 9, 'jump': 0}}, 'teacherRuns': {}}}}
        p = self.open({'ctu_sh150_records': json.dumps(rec)})
        f = self.sh150(p)
        f.locator('#weekNum').fill('3'); f.locator('#weekNum').dispatch_event('change'); p.wait_for_timeout(300)
        s = p.evaluate("() => document.getElementById('sh150-frame').contentWindow.ctuGetSh150ReportSnapshot()")
        self.assertEqual(s['week'], 3)
        self.assertEqual(s['records']['1_1']['run'], 3)
        self.assertEqual(len(s['dates']), 5)
        self.assertRegex(s['dates'][0]['ymd'], r'^\d{4}-\d{2}-\d{2}$')
        # 深拷貝：改快照不影響框架
        p.evaluate("() => { const w = document.getElementById('sh150-frame').contentWindow; const s = w.ctuGetSh150ReportSnapshot(); s.records['1_1'].run = 99; }")
        s2 = p.evaluate("() => document.getElementById('sh150-frame').contentWindow.ctuGetSh150ReportSnapshot()")
        self.assertEqual(s2['records']['1_1']['run'], 3)
        # 記憶體優先：框架改了但還沒存，快照仍取記憶體資料
        p.evaluate("() => { const w = document.getElementById('sh150-frame').contentWindow; w.eval('records[\"2_1\"] = {run: 4, jump: 0}'); }")
        s3 = p.evaluate("() => document.getElementById('sh150-frame').contentWindow.ctuGetSh150ReportSnapshot()")
        self.assertEqual(s3['records']['2_1']['run'], 4)
        self.assertEqual(p._errs, [])


SPORT_KEYS_SAMPLE = {
    'ctu_sh150_records': compact(week_records({'1_1': {'run': 1, 'jump': 150}, '2_1': {'run': 2, 'jump': 100}, '3_2': {'run': 0, 'jump': 100}},
                                                 {'1': 2, '2': 1, '3': 0, '4': 0, '5': 0})),
    'ctu_weeklyRecordData': compact({'1': {'1': 'done'}}),
    'ctu_seatCheckRecords': compact({'2026-10-05': {'1': {'tilt': 1}}}),
    'ctu_groupScores': compact({'1': 3}),
}


class UIBase(Base):
    def open_report(self, page):
        f = self.sh150(page)
        f.locator('#weekNum').fill('6'); f.locator('#weekNum').dispatch_event('change'); page.wait_for_timeout(200)
        f.locator('button:has-text("填報學校本週資料")').click()
        page.wait_for_selector('#school-report-modal.show')
        page.wait_for_timeout(350)
        return f

    def body(self, page):
        return page.inner_text('#school-report-body')

    def confirm(self, page):
        # 只有出現提醒時才需要勾選核對
        if page.is_visible('#school-report-confirm'):
            page.check('#school-report-confirm')

    def non_form_keys(self, page):
        return {k: v for k, v in self.storage(page).items() if k != 'ctu_school_form_config'}


class TestConfig(UIBase):
    def test_S01_default_without_key(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        before = self.storage(p)
        self.open_report(p)
        self.assertNotIn('ctu_school_form_config', self.storage(p))
        v = p.evaluate('() => ctuSchoolForm.validateConfig(ctuSchoolForm.defaultConfig())')
        self.assertTrue(v['valid'])
        self.assertEqual(v['normalized']['verification']['status'], 'verified')     # 內建設定已由維護者實測
        self.assertEqual(v['normalized']['verification']['reportedAt'], 'verified')
        self.assertFalse(p.is_disabled('#school-report-open'))                       # 沒有提醒時不必勾選即可開啟
        self.assertEqual(self.non_form_keys(p), {k: v for k, v in before.items()})

    def test_S02_reject_bad_urls(self):
        p = self.open()
        bad = ['http://docs.google.com/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform',
               'https://docs.google.com.evil.example/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform',
               'https://docs.google.com/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/formResponse',
               'https://user:pw@docs.google.com/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform',
               'https://docs.google.com/forms/d/1abcEXAMPLE/edit',
               'https://forms.gle/abcdef',
               'https://docs.google.com/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform?x=' + 'a' * 17000]
        for u in bad:
            r = p.evaluate('u => ctuSchoolForm.parsePrefillTemplate(u)', u)
            self.assertTrue(r['errors'], u[:80])
        self.open_report(p)
        p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.fill('#school-form-paste', bad[1]); p.click('#school-form-body button:has-text("解析連結")')
        self.assertIn('docs.google.com', p.inner_text('#school-form-msg'))
        self.assertNotIn('ctu_school_form_config', self.storage(p))
        self.assertEqual(self.opened, [])
        ok = p.evaluate('u => ctuSchoolForm.parsePrefillTemplate(u)', 'https://docs.google.com/forms/u/1/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform?authuser=1')
        self.assertEqual(ok['formUrl'], 'https://docs.google.com/forms/d/e/1FAIpQLSdEXAMPLEexampleEXAMPLE00/viewform')

    def test_S03_invalid_config_and_unknown_schema(self):
        p = self.open()
        base = p.evaluate('() => ctuSchoolForm.defaultConfig()')
        dup = json.loads(json.dumps(base)); dup['bindings']['className'] = dup['bindings']['teacherName']
        miss = json.loads(json.dumps(base)); del miss['bindings']['studentTotal']
        newer = json.loads(json.dumps(base)); newer['schema'] = 2
        for cfg in [dup, miss, newer, [], 'x', None]:
            self.assertFalse(p.evaluate('c => ctuSchoolForm.validateConfig(c).valid', cfg))
        raw = json.dumps(newer)
        p2 = self.open(dict(SPORT_KEYS_SAMPLE, ctu_school_form_config=raw))
        self.open_report(p2)
        self.assertIn('無法自動帶入', self.body(p2))
        self.assertTrue(p2.is_disabled('#school-report-open'))
        p2.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        p2.click('#school-report-copy'); p2.wait_for_timeout(300)
        self.assertIn('已複製', p2.inner_text('#school-report-msg'))
        p2.click('#school-report-settings'); p2.wait_for_timeout(200)
        self.assertIn('無法辨識', p2.inner_text('#school-form-body'))
        self.assertEqual(self.storage(p2)['ctu_school_form_config'], raw)   # 原字串保留

    def test_S04_url_encoding(self):
        p = self.open()
        r = p.evaluate('''() => {
            const rep = ctuSchoolForm.summarizeWeek({week: 6, records: {'1_1': {run: 1, jump: 150}, '2_1': {run: 2, jump: 100}, '3_2': {jump: 100}},
                teacherRuns: {'1': 2, '2': 1}, dates: []}, 30, 0);
            rep.classInfo = {className: '101', teacherName: '示範 & A+老師#1'};
            return ctuSchoolForm.buildPrefillUrl(ctuSchoolForm.defaultConfig(), rep, ctuSchoolForm.taipeiNow());
        }''')
        self.assertEqual(r['errors'], [])
        q = parse_qs(urlparse(r['url']).query)
        self.assertEqual(q[CORE['teacherName']], ['示範 & A+老師#1'])
        self.assertEqual(q[CORE['className']], ['101'])
        self.assertEqual(q[CORE['studentTotal']], ['4'])
        self.assertEqual(q[CORE['teacherTotal']], ['3'])
        self.assertEqual(q['usp'], ['pp_url'])
        self.assertEqual(set(q), {'usp'} | set(CORE.values()) | set(DATE_PARAMS))
        self.assertTrue(r['url'].startswith(FORM + '?'))

    def test_S04b_reported_at_taipei(self):
        p = self.open()
        # 2026-12-31 16:05 UTC = 2027-01-01 00:05 臺灣：午夜＋跨年，數字不補零
        r = p.evaluate('''() => {
            const rep = ctuSchoolForm.summarizeWeek({week: 6, records: {}, teacherRuns: {}, dates: []}, 30, 0);
            rep.classInfo = {className: '101', teacherName: '示範老師'};
            return ctuSchoolForm.buildPrefillUrl(ctuSchoolForm.defaultConfig(), rep, ctuSchoolForm.taipeiNow(new Date(Date.UTC(2026, 11, 31, 16, 5))));
        }''')
        q = parse_qs(urlparse(r['url']).query)
        got = {k.split('_')[1]: q[k][0] for k in DATE_PARAMS}
        self.assertEqual(got, {'year': '2027', 'month': '1', 'day': '1', 'hour': '0', 'minute': '5'})
        self.assertEqual(q[CORE['studentTotal']], ['0'])
        r2 = p.evaluate('''() => ctuSchoolForm.taipeiNow(new Date(Date.UTC(2026, 9, 7, 5, 5)))''')
        self.assertEqual((r2['hour'], r2['minute']), ('13', '05'))

    def test_S05_template_whitelist(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        tpl = (FORM.replace('/d/e/', '/u/2/d/e/') + '?usp=pp_url&authuser=2&pli=1'
               '&entry.1346505626=示範導師&entry.1762303383=101&entry.1337826514=123456&entry.1653264987=654321'
               '&entry.682543904_year=2026&entry.682543904_month=10&entry.999000111=私密回答&entry.1599335291=photo')
        r = p.evaluate('u => ctuSchoolForm.parsePrefillTemplate(u)', tpl)
        names = [e['name'] for e in r['entries']]
        self.assertNotIn('authuser', names); self.assertNotIn('pli', names)
        self.open_report(p)
        p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.fill('#school-form-paste', tpl); p.click('#school-form-body button:has-text("解析連結")'); p.wait_for_timeout(200)
        rows = p.locator('#school-form-draft select')
        roles = {'entry.1346505626': 'teacherName', 'entry.1762303383': 'className', 'entry.1337826514': 'studentTotal', 'entry.1653264987': 'teacherTotal'}
        for i in range(rows.count()):
            name = p.locator('#school-form-draft code').nth(i).inner_text()
            rows.nth(i).select_option(roles.get(name, ''))
        p.click('#school-form-draft button:has-text("儲存新設定")'); p.wait_for_timeout(200)
        stored = self.storage(p)['ctu_school_form_config']
        for secret in ['私密回答', '123456', '654321', '示範導師', 'authuser', 'pli', 'photo', '1599335291', '999000111']:
            self.assertNotIn(secret, stored)
        cfg = json.loads(stored)
        self.assertEqual(cfg['bindings'], CORE)
        self.assertEqual(cfg['formUrl'], FORM)
        url = p.evaluate('''c => { const r = ctuSchoolForm.summarizeWeek({week: 6, records: {}, teacherRuns: {'1': 1}, dates: []}, 30, 0);
            r.classInfo = {className: '101', teacherName: '示範老師'}; return ctuSchoolForm.buildPrefillUrl(c, r, ctuSchoolForm.taipeiNow()).url; }''', cfg)
        self.assertEqual(set(parse_qs(urlparse(url).query)), {'usp'} | set(CORE.values()))   # 新範本沒有選日期欄位 → 不輸出日期

    def test_S06_change_cancel_fail_reset(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        sports = {k: v for k, v in self.storage(p).items() if k in SPORT_KEYS_SAMPLE}
        self.open_report(p)
        p.click('#school-report-settings'); p.wait_for_timeout(200)
        other = 'https://docs.google.com/forms/d/e/1FAIpQLSdOTHERotherOTHERother00/viewform?usp=pp_url&entry.11=a&entry.22=b&entry.33=1&entry.44=2'
        # 取消：設定不變
        p.fill('#school-form-paste', other); p.click('#school-form-body button:has-text("解析連結")'); p.wait_for_timeout(200)
        p.click('#school-form-draft button:has-text("取消")')
        self.assertNotIn('ctu_school_form_config', self.storage(p))
        # 換表單
        p.fill('#school-form-paste', other); p.click('#school-form-body button:has-text("解析連結")'); p.wait_for_timeout(200)
        for i, role in enumerate(['teacherName', 'className', 'studentTotal', 'teacherTotal']):
            p.locator('#school-form-draft select').nth(i).select_option(role)
        p.click('#school-form-draft button:has-text("儲存新設定")'); p.wait_for_timeout(200)
        cfg = json.loads(self.storage(p)['ctu_school_form_config'])
        self.assertEqual(cfg['revision'], 2)
        self.assertEqual(cfg['verification']['status'], 'unverified')
        self.assertIn('OTHERother', cfg['formUrl'])
        saved = self.storage(p)['ctu_school_form_config']
        # 寫入失敗：不報成功、原設定不變
        p.evaluate("() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'ctu_school_form_config') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; }")
        p.fill('#school-form-paste', FORM + '?entry.1=a&entry.2=b&entry.3=c&entry.4=d'); p.click('#school-form-body button:has-text("解析連結")'); p.wait_for_timeout(200)
        for i, role in enumerate(['teacherName', 'className', 'studentTotal', 'teacherTotal']):
            p.locator('#school-form-draft select').nth(i).select_option(role)
        p.click('#school-form-draft button:has-text("儲存新設定")'); p.wait_for_timeout(300)
        self.assertTrue(any('沒有儲存' in m for m in p._dialogs))
        self.assertNotIn('已儲存', p.inner_text('#school-form-msg'))
        self.assertEqual(self.storage(p)['ctu_school_form_config'], saved)
        p.reload(); p.wait_for_timeout(700)
        # 重設：只移除本功能 key
        self.open_report(p); p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.click('#school-form-reset'); p.wait_for_timeout(200)
        self.assertNotIn('ctu_school_form_config', self.storage(p))
        self.assertEqual({k: v for k, v in self.storage(p).items() if k in SPORT_KEYS_SAMPLE}, sports)

    def test_S07_export_import_and_full_backup(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        self.open_report(p); p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.click('#school-form-body summary'); p.fill('#school-form-classes', '101\n102')
        p.click('#school-form-body button:has-text("儲存班級選項")'); p.wait_for_timeout(200)
        with p.expect_download() as d:
            p.click('#school-form-export')
        f = os.path.join(self.tmp, 'form_cfg.json'); d.value.save_as(f)
        exported = io.open(f, encoding='utf-8').read()
        self.assertNotIn('示範老師', exported); self.assertNotIn('sh150_records', exported)
        p.click('#school-form-close'); p.click('#school-report-close'); p.wait_for_timeout(200)
        p.click('#ctu-backup-btn'); p.wait_for_timeout(200)
        with p.expect_download() as d2:
            p.click('#backup-download')
        full = json.load(io.open(d2.value.path(), encoding='utf-8'))
        self.assertIn('ctu_school_form_config', full['data'])
        # 另一台：只匯入設定，其他 key 不動
        q = self.open(SPORT_KEYS_SAMPLE)
        before = self.storage(q)
        self.open_report(q); q.click('#school-report-settings'); q.wait_for_timeout(200)
        q.set_input_files('#school-form-import', f); q.wait_for_timeout(400)
        after = self.storage(q)
        self.assertEqual(json.loads(after['ctu_school_form_config'])['classOptions'], ['101', '102'])
        self.assertEqual({k: v for k, v in after.items() if k != 'ctu_school_form_config'}, before)
        # 舊完整備份（沒有新 key）仍可還原
        old = dict(full); old['data'] = {k: v for k, v in full['data'].items() if k != 'ctu_school_form_config'}
        fo = os.path.join(self.tmp, 'old_full.json'); io.open(fo, 'w', encoding='utf-8').write(json.dumps(old, ensure_ascii=False))
        q.click('#school-form-close'); q.click('#school-report-close'); q.wait_for_timeout(200)
        q.click('#ctu-backup-btn'); q.wait_for_timeout(200)
        with q.expect_download():
            q.set_input_files('#backup-restore-input', fo); q.wait_for_timeout(600)
        q.wait_for_load_state('load'); q.wait_for_timeout(700)
        st = self.storage(q)
        self.assertNotIn('ctu_school_form_config', st)
        self.assertEqual(st['ctu_sh150_records'], SPORT_KEYS_SAMPLE['ctu_sh150_records'])


class TestUI(UIBase):
    def test_U01_class_and_teacher_checks(self):
        p = self.open(SPORT_KEYS_SAMPLE, {'className': '4XX', 'teacherName': '示範老師', 'studentCount': 30, 'studentNames': []})
        self.open_report(p)
        self.assertIn('不在學校表單的選項', self.body(p))
        self.assertTrue(p.is_disabled('#school-report-open'))
        self.assertTrue(p.is_visible('#school-report-blank'))
        p2 = self.open(SPORT_KEYS_SAMPLE, {'className': '101', 'teacherName': 'OOO 老師', 'studentCount': 30, 'studentNames': []})
        self.open_report(p2)
        self.assertIn('導師姓名還是預設值', self.body(p2))
        p3 = self.open(SPORT_KEYS_SAMPLE, {'className': '413', 'teacherName': '王示範老師', 'studentCount': 30, 'studentNames': []})
        self.open_report(p3)
        self.assertFalse(p3.is_disabled('#school-report-open'))
        # 名冊外座號有紀錄 → 有提醒 → 要先勾選核對
        p4 = self.open(dict(SPORT_KEYS_SAMPLE, ctu_sh150_records=compact(week_records({'40_1': {'run': 2}}))), {'className': '413', 'teacherName': '王示範老師', 'studentCount': 30})
        self.open_report(p4)
        self.assertTrue(p4.is_disabled('#school-report-open'))
        p4.check('#school-report-confirm')
        self.assertFalse(p4.is_disabled('#school-report-open'))
        self.assertIn('學生填報圈數', self.body(p3)); self.assertIn('4 圈', self.body(p3)); self.assertIn('3 圈', self.body(p3))
        self.assertNotIn('408', self.body(p3))

    def test_U02_extra_laps_reset(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        f = self.open_report(p)
        p.fill('#school-report-extra', '2'); p.dispatch_event('#school-report-extra', 'change'); p.wait_for_timeout(200)
        self.assertIn('5 圈', self.body(p)); self.assertIn('不含於原 SH150 列印總數', self.body(p))
        self.assertIn('跳繩依每天全班加總，每 200 下換算 1 圈', self.body(p))
        p.click('#school-report-close')
        f.locator('button:has-text("填報學校本週資料")').click(); p.wait_for_timeout(300)
        self.assertEqual(p.input_value('#school-report-extra'), '0')
        self.assertEqual(self.storage(p)['ctu_sh150_records'], SPORT_KEYS_SAMPLE['ctu_sh150_records'])
        p.fill('#school-report-extra', '1.5'); p.dispatch_event('#school-report-extra', 'change'); p.wait_for_timeout(200)
        self.assertIn('正整數', self.body(p))

    def test_U03_clipboard(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        p.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        self.open_report(p)
        p.click('#school-report-copy'); p.wait_for_timeout(300)
        self.assertIn('已複製', p.inner_text('#school-report-msg'))
        text = p.evaluate('navigator.clipboard.readText()')
        self.assertIn('學生當週運動總圈數：4', text); self.assertIn('導師當週運動總圈數：3（尚未乘 2）', text)
        self.assertIn('第 6 週', text); self.assertIn('班級：101', text)
        p.evaluate("() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); }")
        p.click('#school-report-copy'); p.wait_for_timeout(300)
        self.assertNotIn('已複製', p.inner_text('#school-report-msg'))
        self.assertTrue(p.is_visible('#school-report-copytext'))
        self.assertIn('學生當週運動總圈數：4', p.input_value('#school-report-copytext'))
        p.evaluate("() => { Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true}); }")
        p.click('#school-report-copy'); p.wait_for_timeout(300)
        self.assertIn('全選', p.inner_text('#school-report-msg'))

    def test_U04_open_link_and_offline(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        self.open_report(p)
        self.confirm(p)
        with p.context.expect_page() as pop:
            p.click('#school-report-open')
        pop.value.wait_for_load_state()
        self.assertEqual(len(self.opened), 1)
        q = parse_qs(urlparse(self.opened[0]).query)
        self.assertEqual(q[CORE['studentTotal']], ['4']); self.assertEqual(q[CORE['teacherTotal']], ['3'])
        self.assertTrue(p.is_visible('#school-report-link'))
        self.assertEqual(p.get_attribute('#school-report-link', 'rel'), 'noopener noreferrer')
        whole = p.inner_text('body')
        for bad in ['已完成繳交', '繳交成功', '同步成功', '提交成功', '學校已收到']:
            self.assertNotIn(bad, whole)
        self.assertFalse(p.is_visible('#school-report-verify'))      # 內建設定已核對
        q = parse_qs(urlparse(self.opened[0]).query)
        self.assertIn('entry.682543904_hour', q)                       # 自動帶入填報時間
        # 換過表單（未核對）時，開啟後才出現「記錄為已核對」
        p.evaluate("() => { const c = ctuSchoolForm.defaultConfig(); c.verification.status = 'unverified'; localStorage.setItem('ctu_school_form_config', JSON.stringify(c)); }")
        p.click('#school-report-close'); self.open_report(p); self.confirm(p)
        with p.context.expect_page():
            p.click('#school-report-open')
        self.assertTrue(p.is_visible('#school-report-verify'))
        p.click('#school-report-verify'); p.wait_for_timeout(200)
        self.assertEqual(json.loads(self.storage(p)['ctu_school_form_config'])['verification']['status'], 'verified')
        p.context.set_offline(True)
        p.click('#school-report-close'); p.wait_for_timeout(100)
        self.open_report(p)
        self.assertIn('4 圈', self.body(p))
        p.context.set_offline(False)

    def test_U05_mobile_width(self):
        p = self.open(SPORT_KEYS_SAMPLE, viewport=(375, 740))
        self.open_report(p)
        for sel in ['#school-report-open', '#school-report-copy', '#school-report-settings', '#school-report-close']:
            box = p.locator(sel).bounding_box()
            self.assertTrue(box and box['x'] >= 0 and box['x'] + box['width'] <= 375, sel)
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'), 375)
        h = p.evaluate("() => { const m = document.querySelector('#school-report-modal .modal-content'); return [m.clientHeight, window.innerHeight, getComputedStyle(m).overflowY]; }")
        self.assertLessEqual(h[0], h[1]); self.assertEqual(h[2], 'auto')
        p.locator('#school-report-close').scroll_into_view_if_needed(); p.click('#school-report-close')

    def test_U06_repeat_open_close(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        f = self.open_report(p)
        for _ in range(10):
            p.click('#school-report-settings'); p.wait_for_timeout(50); p.click('#school-form-close')
            p.click('#school-report-close')
            p.click('#tab-weekly-btn'); p.click('#tab-sh150-btn')
            f.locator('button:has-text("填報學校本週資料")').click(); p.wait_for_timeout(60)
        self.confirm(p)
        with p.context.expect_page():
            p.click('#school-report-open')
        p.wait_for_timeout(500)
        self.assertEqual(len(self.opened), 1)
        self.assertEqual(p._errs, [])

    def test_U07_file_url(self):
        tmpf = os.path.join(self.tmp, 'local_copy.html'); shutil.copy(SRC, tmpf)
        ctx = self.browser.new_context()
        self.addCleanup(ctx.close)
        ctx.add_init_script('(() => { if (sessionStorage.getItem("__s")) return; sessionStorage.setItem("__s", "1");'
                            ' const s = %s; for (const k in s) localStorage.setItem(k, s[k]); })()' % json.dumps(dict(SPORT_KEYS_SAMPLE,
                            ctu_timerTabHidden='[]', ctu_class=json.dumps({'className': '101', 'teacherName': '示範老師', 'studentCount': 30}))))
        p = ctx.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto('file:///' + tmpf.replace('\\', '/')); p.wait_for_timeout(800)
        self.open_report(p)
        self.assertIn('4 圈', self.body(p))
        p.evaluate("() => { Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true}); }")
        p.click('#school-report-copy'); p.wait_for_timeout(200)
        self.assertIn('學生當週運動總圈數：4', p.input_value('#school-report-copytext'))
        self.assertEqual(errs, [])

    def test_U08_not_ready_and_changed_data(self):
        p = self.open(dict(SPORT_KEYS_SAMPLE, ctu_timerTabOrder='["timer","sh150","weekly","seat","group"]'))   # SH150 不是首頁 → 框架尚未載入
        p.evaluate('() => window.ctuOpenSchoolReport()'); p.wait_for_timeout(200)
        self.assertTrue(any('還沒載入' in m for m in p._dialogs))
        f = self.open_report(p)
        self.confirm(p)
        p.evaluate("() => document.getElementById('sh150-frame').contentWindow.eval('records[\"5_3\"] = {run: 7, jump: 0}')")
        p.click('#school-report-open'); p.wait_for_timeout(300)
        self.assertEqual(self.opened, [])
        self.assertIn('資料剛剛有變動', p.inner_text('#school-report-msg'))
        self.assertIn('11 圈', self.body(p))
        self.assertIn('和已存檔的不一樣', self.body(p))
        self.assertEqual(p._errs, [])


class TestIsolation(UIBase):
    def test_D01_D02_only_new_key_written(self):
        sentinels = dict(SPORT_KEYS_SAMPLE)
        sentinels.update({'sh150_class_config': '{"className":"舊班"}', 'sh150_universal_all_records': '{"version":2}',
                          'seatCheckRecords': '{"x":1}', 'timerTabOrder': '["timer"]', 'ctu_meta': json.dumps({'schema': 1, 'sh150Import': {'result': 'declined'}})})
        p = self.open(sentinels)
        before = self.storage(p)
        p.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        self.open_report(p)
        p.click('#school-report-copy'); self.confirm(p)
        with p.context.expect_page():
            p.click('#school-report-open')
        p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.click('#school-form-body summary'); p.fill('#school-form-classes', '101\n102')
        p.click('#school-form-body button:has-text("儲存班級選項")'); p.wait_for_timeout(200)
        p.click('#school-form-reset'); p.wait_for_timeout(200)
        after = self.storage(p)
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        self.assertEqual(changed - {'ctu_school_form_config'}, set(), {k: (before.get(k), after.get(k)) for k in changed})
        for k in ['sh150_class_config', 'sh150_universal_all_records', 'seatCheckRecords', 'timerTabOrder']:
            self.assertEqual(hashlib.sha256(after[k].encode()).hexdigest(), hashlib.sha256(before[k].encode()).hexdigest())

    def test_D03_html_is_text(self):
        evil = '<img src=x onerror=window.hitT=1>'
        p = self.open(SPORT_KEYS_SAMPLE, {'className': '101', 'teacherName': evil, 'studentCount': 30})
        self.open_report(p)
        self.assertIn(evil, self.body(p))
        p.click('#school-report-settings'); p.wait_for_timeout(200)
        p.fill('#school-form-paste', FORM + '?entry.1=' + evil + '&entry.2=b'); p.click('#school-form-body button:has-text("解析連結")'); p.wait_for_timeout(300)
        self.assertIn('<img', p.inner_text('#school-form-draft'))
        self.assertFalse(p.evaluate('!!window.hitT'))
        self.assertEqual(p._errs, [])


class TestRegression(UIBase):
    def test_R01_sh150_existing_flows(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        f = self.sh150(p)
        f.locator('#weekNum').fill('6'); f.locator('#weekNum').dispatch_event('change'); p.wait_for_timeout(200)
        f.locator('#studentGrid .student-card').nth(3).click(); p.wait_for_timeout(200)
        f.locator('#inputRun').fill('2'); f.locator('#inputRun').press('Enter'); p.wait_for_timeout(300)
        rec = json.loads(self.storage(p)['ctu_sh150_records'])
        self.assertEqual(rec['allWeeksData']['6']['records'][next(k for k in rec['allWeeksData']['6']['records'] if k.startswith('4_'))]['run'], 2)
        self.assertIn('1_1', rec['allWeeksData']['6']['records'])
        f.locator('button:has-text("上一週")').click(); f.locator('button:has-text("下一週")').click(); p.wait_for_timeout(200)
        self.assertEqual(f.locator('#weekNum').input_value(), '6')
        self.assertGreaterEqual(f.locator('#printTableBody tr, .print-table tbody tr').count(), 30)
        btns = f.locator('.controls button').all_inner_texts()
        self.assertLess(btns.index('🖨️ A4 直接列印'), btns.index('📤 填報學校本週資料'))
        self.assertLess(btns.index('📤 填報學校本週資料'), btns.index('🗑️ 清空本週'))
        self.assertEqual(p._errs, [])

    def test_R02_tabs_backup_source(self):
        p = self.open(SPORT_KEYS_SAMPLE)
        for t in ['timer', 'seat', 'sh150', 'weekly', 'group']:
            p.click('#tab-%s-btn' % t); p.wait_for_timeout(150)
            self.assertFalse(p.is_hidden('#panel-%s' % t))
        ver = re.search(r"CTU_VERSION = '([^']+)'", io.open(SRC, encoding='utf-8').read()).group(1)
        self.assertIn(ver, p.inner_text('#ctu-version'))
        src = io.open(SRC, encoding='utf-8').read()
        self.assertIn('ctuGetSh150ReportSnapshot', src); self.assertIn('ctuSchoolForm', src)
        self.assertEqual(p._errs, [])


if __name__ == '__main__':
    unittest.main()
