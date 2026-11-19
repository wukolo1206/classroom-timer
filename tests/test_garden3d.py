# tests/test_garden3d.py
"""3D garden checks (SwiftShader WebGL); isolated server, no production requests or student data."""
import functools, http.server, socketserver, sys, threading, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_garden import FAKE  # fake microphone / AudioContext shared with the 2D suite

ROOT = Path(__file__).resolve().parents[1]
GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
NO_WEBGL = "(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return /webgl/.test(k) ? null : g.call(this, k, ...a); }; })();"
UNTIL = "const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };"


class Garden3D(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        cls.server = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:%s/' % cls.server.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=GL_ARGS)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def open(self, path='garden.html', width=1366, webgl=True, enable=False):
        ctx = self.browser.new_context(viewport={'width': width, 'height': 768})
        self.addCleanup(ctx.close)
        ctx.add_init_script(FAKE)
        if not webgl:
            ctx.add_init_script(NO_WEBGL)
        if enable:
            ctx.add_init_script("localStorage.setItem('c408_garden_renderer3d','true')")
        page = ctx.new_page(); page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        page.goto(self.url + path)
        return page

    def test_controller_swaps_avatar_and_fits_hundred_partners(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px'; document.body.appendChild(box);
          const g = window.Garden3D.create(box, { reducedMotion: true });
          g.setState({ visible: [{ seat: 1, avatar: 3 }], rosterSize: 31, stage: 0, active: true, reduced: true, idle: false });
          await until(() => g.debug().partners[1] && g.debug().partners[1].ready);
          const a = g.debug().partners[1].avatar;
          g.setState({ visible: [{ seat: 1, avatar: 25 }] });
          await until(() => g.debug().partners[1].avatar === 25 && g.debug().partners[1].ready);
          const b = g.debug().partners[1];
          g.setState({ visible: Array.from({ length: 100 }, (_, i) => ({ seat: i + 1, avatar: i %% 38 })), rosterSize: 100 });
          const pts = Object.values(g.debug().partners); let md = 99;
          for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) md = Math.min(md, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
          g.setState({ idle: true, visible: [] });
          const afterIdle = Object.keys(g.debug().partners).length, stage = g.debug().stage;
          g.dispose();
          return { a, b: b.avatar, ready: b.ready, n: pts.length, md, afterIdle, stage, canvases: box.querySelectorAll('canvas').length };
        }""" % UNTIL)
        self.assertEqual(r['a'], 3)
        self.assertEqual(r['b'], 25)
        self.assertTrue(r['ready'])
        self.assertEqual(r['n'], 100)
        self.assertGreaterEqual(r['md'], 0.9)
        self.assertEqual(r['afterIdle'], 0)
        self.assertEqual(r['stage'], 0)
        self.assertEqual(r['canvases'], 0)
        self.assertEqual(p.errors, [])

    def test_life_states_move_partners_and_swap_props(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px'; document.body.appendChild(box);
          const g = window.Garden3D.create(box, { reducedMotion: false });
          const vis = [{ seat: 1, avatar: 3 }, { seat: 2, avatar: 25 }];
          g.setState({ visible: vis, rosterSize: 31, stage: 0, active: true, reduced: false, idle: false, life: [] });
          await until(() => g.debug().partners[1] && g.debug().partners[1].ready);
          const base = g.debug().partners[1];
          g.setState({ life: [{ seat: 1, activity: 'picnic', x: 48, y: 6, facing: 1 }, { seat: 2, activity: 'butterfly', x: 0, y: 0, facing: -1 }] });
          const a = g.debug().partners;
          g.setState({ life: [{ seat: 1, activity: 'reading', x: 0, y: 0, facing: 1 }, { seat: 2, activity: 'basketball', x: 0, y: 0, facing: 1 }] });
          const b = g.debug().partners;
          g.dispose();
          return { dx: a[1].x - base.slotX, dz: a[1].z - base.slotZ, a1: a[1].activity, a1p: a[1].prop, a2: a[2].activity, a2p: a[2].prop,
                   b1: b[1].activity, b1p: b[1].prop, b2: b[2].activity, b2p: b[2].prop, backX: b[1].x - base.slotX };
        }""" % UNTIL)
        self.assertEqual((r['a1'], r['a1p'], r['a2'], r['a2p']), ('picnic', True, 'butterfly', True))
        self.assertEqual((r['b1'], r['b1p'], r['b2'], r['b2p']), ('reading', True, 'basketball', False))
        self.assertAlmostEqual(r['dx'], 0.45, places=2)
        self.assertAlmostEqual(r['dz'], 0.18, places=2)
        self.assertAlmostEqual(r['backX'], 0.0, places=2)
        self.assertEqual(p.errors, [])

    def test_3d_activities_match_the_2d_garden(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'timed')
        p.click('#garden-demo'); p.fill('#garden-minutes', '5'); p.fill('#garden-spawn-seconds', '1')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(6000)
        pairs = p.evaluate("""() => { const d = window.__gardenDebug3d().partners;
          return Object.keys(d).map((s) => [d[s].activity, (document.querySelector('.garden-visitor[data-seat="' + s + '"]') || {}).dataset?.activity]); }""")
        self.assertGreaterEqual(len(pairs), 4)
        for a3, a2 in pairs:
            self.assertEqual(a3, a2)
        self.assertEqual(p.errors, [])

    def test_preview_page_still_loads(self):
        p = self.open('garden3d-preview.html')
        p.wait_for_function('window.__garden3d && __garden3d.standees.length >= 8', timeout=60000)
        self.assertEqual(p.locator('#g3-stages button').count(), 8)
        self.assertEqual(p.errors, [])

    def test_default_is_2d_and_toggle_persists(self):
        p = self.open()
        p.wait_for_function("window.Garden3D !== undefined")
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '2d')
        self.assertTrue(p.locator('#garden-3d').is_hidden())
        self.assertEqual(p.locator('#garden-3d canvas').count(), 0)
        p.check('#garden-3d-toggle')
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '3d')
        self.assertEqual(p.locator('#garden-3d canvas').count(), 1)
        p.reload()
        p.wait_for_function("window.Garden3D !== undefined && document.body.dataset.renderer === '3d'")
        self.assertTrue(p.is_checked('#garden-3d-toggle'))
        p.uncheck('#garden-3d-toggle')
        self.assertEqual(p.locator('#garden-3d canvas').count(), 0)
        self.assertEqual(p.errors, [])

    def test_without_webgl_toggle_is_disabled(self):
        p = self.open(webgl=False, enable=True)
        p.wait_for_function("window.Garden3D !== undefined")
        self.assertTrue(p.is_disabled('#garden-3d-toggle'))
        self.assertEqual(p.get_attribute('body', 'data-renderer'), '2d')
        self.assertIn('不支援', p.inner_text('#garden-3d-note'))
        self.assertEqual(p.errors, [])

    def test_partners_follow_arrivals_and_freeze_on_teacher_pause(self):
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'timed')
        p.click('#garden-demo'); p.fill('#garden-minutes', '5'); p.fill('#garden-spawn-seconds', '1')
        p.clock.install(); p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.clock.run_for(5500)
        visible = int(p.inner_text('#garden-count').split('/')[0])
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertGreaterEqual(visible, 4)
        self.assertEqual(len(dbg['partners']), visible)
        self.assertGreater(dbg['clock'], 0)
        p.click('#garden-pause')
        held = p.evaluate('window.__gardenDebug3d().clock')
        p.clock.run_for(3000)
        self.assertEqual(p.evaluate('window.__gardenDebug3d().clock'), held)
        self.assertEqual(p.errors, [])

    def test_full_class_reaches_moonlight_and_new_garden_resets(self):
        # Real time instead of p.clock: a faked clock fires ~60 rAF frames per simulated second, and every
        # frame is a full software (SwiftShader) render of 31 figures — minutes of CPU. Real time renders far fewer frames.
        p = self.open(width=800, enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.select_option('#garden-session-mode', 'direct')
        p.click('#garden-demo'); p.fill('#garden-spawn-seconds', '1'); p.fill('#garden-upgrade-seconds', '5')
        p.click('#garden-start')
        p.wait_for_function("document.body.dataset.phase === 'running'")
        p.wait_for_function("window.__gardenDebug3d() && window.__gardenDebug3d().stage === 7", timeout=180000)
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertEqual(dbg['stage'], 7)
        self.assertEqual(len(dbg['partners']), 31)
        p.on('dialog', lambda d: d.accept())
        p.click('#garden-end'); p.click('#garden-again')
        dbg = p.evaluate('window.__gardenDebug3d()')
        self.assertEqual(dbg['stage'], 0)
        self.assertEqual(len(dbg['partners']), 0)
        self.assertEqual(p.errors, [])


if __name__ == '__main__':
    unittest.main()
