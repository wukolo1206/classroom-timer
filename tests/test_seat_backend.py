# -*- coding: utf-8 -*-
"""秩序登記後端（gas/Code.gs）分節功能：以 Node 記憶體假試算表模擬（tests/seat_backend_sim.js）。

執行：python -m unittest discover -s tests -p test_seat_backend.py -v
"""
import os, subprocess, unittest

HERE = os.path.dirname(os.path.abspath(__file__))


class SeatBackend(unittest.TestCase):
    def test_simulation(self):
        r = subprocess.run(['node', os.path.join(HERE, 'seat_backend_sim.js')], capture_output=True, text=True, encoding='utf-8')
        print(r.stdout)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn('FAIL', r.stdout)


if __name__ == '__main__':
    unittest.main()
