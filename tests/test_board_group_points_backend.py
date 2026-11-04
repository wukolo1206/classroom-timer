"""In-memory signed group settlement; never accesses Google or a real ledger."""
import pathlib
import subprocess
import unittest


class BoardGroupPointsBackendTest(unittest.TestCase):
    def test_signed_group_settlement_simulation(self):
        script = pathlib.Path(__file__).with_name('board_group_points_sim.js')
        result = subprocess.run(['node', str(script)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('12 group points scenarios passed', result.stdout)


if __name__ == '__main__':
    unittest.main()
