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

    def test_preview_page_still_loads(self):
        p = self.open('garden3d-preview.html')
        p.wait_for_function('window.__garden3d && __garden3d.standees.length >= 8', timeout=60000)
        self.assertEqual(p.locator('#g3-stages button').count(), 8)
        self.assertEqual(p.errors, [])


if __name__ == '__main__':
    unittest.main()
