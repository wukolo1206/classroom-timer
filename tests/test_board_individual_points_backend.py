"""Individual settlement against in-memory GAS services; never touches cloud data."""
import pathlib
import subprocess
import unittest


class BoardIndividualPointsBackendTest(unittest.TestCase):
    def test_signed_individual_settlement_simulation(self):
        script = pathlib.Path(__file__).with_name('board_individual_points_sim.js')
        result = subprocess.run(['node', str(script)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('11 individual points scenarios passed', result.stdout)


if __name__ == '__main__':
    unittest.main()
