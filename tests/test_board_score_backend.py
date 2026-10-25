"""Actual GAS bridge exercised with anonymous in-memory services; no cloud access."""
import pathlib
import subprocess
import unittest


class BoardScoreBridgeBackendTest(unittest.TestCase):
    def test_anonymous_gas_simulation(self):
        script = pathlib.Path(__file__).with_name('board_score_bridge_sim.js')
        completed = subprocess.run(['node', str(script)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn('20 scenarios; 0 failed', completed.stdout)


if __name__ == '__main__':
    unittest.main()
