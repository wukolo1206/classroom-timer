# -*- coding: utf-8 -*-
"""408 版（index.html / GAS）的「📚 SR 閱讀小卡」分頁。

執行：python -m unittest discover -s tests -p test_sr_408.py -v
GAS 以瀏覽器內的模擬 google.script.run 代替，只模擬 getSrRecords／saveSrRecords；
其他後端函式一律回傳失敗，不會連到正式試算表。測試檔不寫入任何學生姓名，姓名從頁面名冊讀。
"""
import functools, http.server, io, json, os, shutil, socketserver, tempfile, threading, unittest

import openpyxl
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MOCK_GAS = r"""
(() => {
  if (window !== window.top) return;
  const load = () => JSON.parse(sessionStorage.getItem('__cloud') || '{"json":null,"savedAt":0}');
  const save = c => sessionStorage.setItem('__cloud', JSON.stringify(c));
  window.__calls = [];
  const impl = {
    getSrRecords: () => load(),
    saveSrRecords: (json, savedAt) => {
      if (sessionStorage.getItem('__failSave')) throw new Error('模擬寫入失敗');
      const c = load();
      if (c.savedAt > savedAt) return { savedAt: c.savedAt, skipped: true };
      save({ json, savedAt });
      return { savedAt };
    }
  };
  function runner(succ, fail) {
    return new Proxy({}, { get(_, name) {
      if (name === 'withSuccessHandler') return f => runner(f, fail);
      if (name === 'withFailureHandler') return f => runner(succ, f);
      return (...args) => {
        window.__calls.push(name);
        setTimeout(() => {
          if (!impl[name]) { if (fail) fail(new Error('mock: ' + name)); return; }
          try { const r = impl[name](...args); if (succ) succ(r); } catch (e) { if (fail) fail(e); }
        }, 50);
      };
    } });
  }
  window.google = { script: { get run() { return runner(null, null); } } };
})()
"""


def xlsx_bytes(rows):
    wb = openpyxl.Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class Sr408(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='c408_sr_')
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

    def open(self, gas=False, cloud=None, local=None):
        ctx = self.browser.new_context(accept_downloads=True, viewport={'width': 1366, 'height': 900})
        self.addCleanup(ctx.close)
        seed = {'__cloud': json.dumps(cloud)} if cloud else {}
        ctx.add_init_script('(() => { if (window !== window.top || sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded","1");'
                            ' const s = %s, l = %s; for (const k in s) sessionStorage.setItem(k, s[k]); for (const k in l) localStorage.setItem(k, l[k]); })()'
                            % (json.dumps(seed, ensure_ascii=False), json.dumps(local or {}, ensure_ascii=False)))
        if gas:
            ctx.add_init_script(MOCK_GAS)
        page = ctx.new_page()
        page._errs = []
        page.on('pageerror', lambda e: page._errs.append(str(e)))
        page._dialogs = []
        page.on('dialog', lambda d: (page._dialogs.append(d.message), d.accept()))
        page.goto(self.url)
        page.wait_for_timeout(800)
        return page

    def sr(self, page):
        page.click('#tab-sr-btn')
        page.wait_for_function("() => { const f = document.getElementById('sr-frame'); return f && f.contentWindow && f.contentWindow.renderAll && f.contentDocument.getElementById('roster-tbody').children.length > 0; }", timeout=8000)
        page.wait_for_timeout(300)
        return page.query_selector('#sr-frame').content_frame()

    def local_sr(self, page):
        raw = page.evaluate("localStorage.getItem('c408_sr_records')")
        return json.loads(raw) if raw else None

    def cloud(self, page):
        return json.loads(page.evaluate("sessionStorage.getItem('__cloud') || 'null'") or 'null')

    def roster(self, page):
        return page.evaluate("Object.fromEntries(Object.entries(window.c408SeatRoster).map(([k, v]) => [k, v[0]]))")

    # ── 本機模式（GitHub Pages）──
    def test_L01_tab_and_roster_from_seatRoster(self):
        p = self.open()
        self.assertTrue(p.is_visible('#tab-sr-btn'))
        fr = self.sr(p)
        rows = fr.evaluate("[...document.querySelectorAll('#roster-tbody tr')].map(r => [r.children[1].innerText.trim(), r.children[2].innerText.trim()])")
        roster = self.roster(p)
        self.assertEqual(len(rows), len(roster))
        self.assertNotIn('07', [r[0] for r in rows], '07 號是空號，不列出')
        first = roster['1']
        self.assertEqual(rows[0][1], first[0] + '○' * (len(first) - 2) + first[-1], '畫面姓名遮罩')
        self.assertFalse(fr.is_visible('#btn-edit-roster'), '408 名冊在程式裡，不顯示修改名冊')
        self.assertIn('本機模式', p.inner_text('#sr-sync-status'))
        self.assertIn('408 導師', fr.evaluate("document.getElementById('parent-line-text').value"))
        self.assertEqual(p._errs, [])

    def test_L02_storage_separate_from_universal(self):
        p = self.open(local={'ctu_sr_records': '{"keep":1}'})
        fr = self.sr(p)
        fr.evaluate("t => { document.getElementById('paste-textarea').value = t; parsePastedText(); }", '2 411-417')
        p.wait_for_timeout(300)
        self.assertEqual(self.local_sr(p)['bySeat']['2']['terms']['115-1']['sr'], '411-417')
        self.assertEqual(p.evaluate("localStorage.getItem('ctu_sr_records')"), '{"keep":1}', '不可動全校版的資料')

    def test_L03_import_mismatch_no_roster_option(self):
        p = self.open()
        fr = self.sr(p)
        fr.evaluate("() => { window.confirm = m => { window.__asked = m; return false; }; }")
        data = xlsx_bytes([['座號', '學生姓名', 'SR(115-1)'], ['01', '甲同學', '400'], ['02', '乙同學', '410'], ['03', '丙同學', '420']])
        fr.set_input_files('#excel-file-input', files=[{'name': 'x.xlsx', 'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'buffer': data}])
        p.wait_for_timeout(800)
        self.assertFalse(fr.evaluate("!!document.getElementById('choice-modal')"), '408 版不提供用匯入資料改名冊')
        self.assertIn('對不上', fr.evaluate("window.__asked || ''"))
        self.assertIsNone(self.local_sr(p))

    # ── GAS 同步 ──
    def test_G01_pull_from_cloud_then_push_edit(self):
        cloud_doc = {'schema': 1, 'current': '115-1', 'bySeat': {'2': {'checked': True, 'terms': {'115-1': {'sr': '411-417'}}}}}
        p = self.open(gas=True, cloud={'json': json.dumps(cloud_doc), 'savedAt': 1000})
        fr = self.sr(p)
        self.assertEqual(fr.locator('#roster-tbody input[data-row="1"][data-col="sr"]').input_value(), '411-417', '開分頁時拿雲端資料')
        self.assertIn('已同步', p.inner_text('#sr-sync-status'))
        inp = fr.locator('#roster-tbody input[data-row="2"][data-col="sr"]')
        inp.fill('450-514'); inp.press('Tab')
        p.wait_for_timeout(2000)
        cloud = self.cloud(p)
        self.assertEqual(json.loads(cloud['json'])['bySeat']['3']['terms']['115-1']['sr'], '450-514', '修改要送到雲端')
        self.assertGreater(cloud['savedAt'], 1000)
        self.assertIn('已同步', p.inner_text('#sr-sync-status'))
        self.assertEqual(p._errs, [])

    def test_G02_newer_local_unsynced_is_kept_and_pushed(self):
        cloud_doc = {'schema': 1, 'current': '115-1', 'bySeat': {'2': {'checked': True, 'terms': {'115-1': {'sr': '300'}}}}}
        local_doc = {'schema': 1, 'current': '115-1', 'bySeat': {'2': {'checked': True, 'terms': {'115-1': {'sr': '411-417'}}}}}
        p = self.open(gas=True, cloud={'json': json.dumps(cloud_doc), 'savedAt': 1000},
                      local={'c408_sr_records': json.dumps(local_doc), 'c408_sr_sync_meta': json.dumps({'savedAt': 2000, 'dirty': True})})
        fr = self.sr(p)
        p.wait_for_timeout(800)
        self.assertEqual(fr.locator('#roster-tbody input[data-row="1"][data-col="sr"]').input_value(), '411-417', '本機較新且未同步：保留本機')
        self.assertEqual(json.loads(self.cloud(p)['json'])['bySeat']['2']['terms']['115-1']['sr'], '411-417', '並補送到雲端')

    def test_G03_older_local_replaced_by_cloud(self):
        cloud_doc = {'schema': 1, 'current': '115-1', 'bySeat': {'2': {'checked': True, 'terms': {'115-1': {'sr': '411-417'}}}}}
        local_doc = {'schema': 1, 'current': '115-1', 'bySeat': {'2': {'checked': True, 'terms': {'115-1': {'sr': '300'}}}}}
        p = self.open(gas=True, cloud={'json': json.dumps(cloud_doc), 'savedAt': 5000},
                      local={'c408_sr_records': json.dumps(local_doc), 'c408_sr_sync_meta': json.dumps({'savedAt': 2000, 'dirty': False})})
        fr = self.sr(p)
        self.assertEqual(fr.locator('#roster-tbody input[data-row="1"][data-col="sr"]').input_value(), '411-417', '另一台電腦改過：用雲端較新的')

    def test_G04_write_failure_shows_pending_and_keeps_local(self):
        p = self.open(gas=True)
        p.evaluate("sessionStorage.setItem('__failSave', '1')")
        fr = self.sr(p)
        inp = fr.locator('#roster-tbody input[data-row="0"][data-col="sr"]')
        inp.fill('394'); inp.press('Tab')
        p.wait_for_timeout(2000)
        self.assertIn('待同步', p.inner_text('#sr-sync-status'))
        self.assertEqual(self.local_sr(p)['bySeat']['1']['terms']['115-1']['sr'], '394', '寫入失敗時本機資料要留著')
        self.assertTrue(json.loads(p.evaluate("localStorage.getItem('c408_sr_sync_meta')"))['dirty'])
        # 恢復後重新整理：本機較新、未同步 → 補送
        p.evaluate("sessionStorage.removeItem('__failSave')")
        p.reload(); p.wait_for_timeout(800)
        self.sr(p)
        p.wait_for_timeout(800)
        self.assertEqual(json.loads(self.cloud(p)['json'])['bySeat']['1']['terms']['115-1']['sr'], '394')
        self.assertIn('已同步', p.inner_text('#sr-sync-status'))

    def test_G05_other_tabs_still_work(self):
        p = self.open(gas=True)
        for t in ('timer', 'group', 'exam', 'seat', 'weekly', 'sr', 'timer'):
            p.click('#tab-%s-btn' % t)
            p.wait_for_timeout(250)
        self.assertEqual(p._errs, [])


if __name__ == '__main__':
    unittest.main()
