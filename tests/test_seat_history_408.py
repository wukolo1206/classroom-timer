import json
import unittest
from test_seat_period_408 import SeatPeriod408, DAY


class SeatHistory408(SeatPeriod408):
    def history(self, gas=True):
        rows = [
            ['2026-10-09', 21, '', '座位歪了', 3, '', 'tilt', '第2節'],
            ['2026-10-09', 21, '', '講話', 2, '', 'talk', '第2節'],
            ['2026-10-09', 21, '', '座位歪了', 1, '', 'tilt', ''],
            ['2026-10-09', 22, '', '座位歪了', 4, '', 'tilt', '第2節'],
            [DAY, 21, '', '座位歪了', 2, '', 'tilt', '第3節'],
        ]
        local = {} if gas else {'seatCheckRecords': json.dumps({
            '2026-10-09#2': {'21': {'tilt': 3, 'talk': 2}, '22': {'tilt': 4}},
            '2026-10-09': {'21': {'tilt': 1}}, DAY+'#3': {'21': {'tilt': 2}}})}
        p = self.open(sheet=rows, local=local, gas=gas)
        self.period(p, '7')
        p.click('[data-srange="all"]')
        self.tap(p, 21)
        p.locator('#seat-modal-history').wait_for(state='visible')
        return p

    def test_H01_cold_history_actual_slot_minus_and_reload(self):
        p = self.history()
        self.assertIn('2026-10-09', p.inner_text('#seat-modal-history'))
        self.assertFalse(p.locator('#seat-modal-current').get_attribute('open') is not None)
        row = p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="tilt"]')
        row.locator('[data-history-action="minus"]').click()
        self.settle(p)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['tilt'], 2)
        self.assertNotIn(DAY+'#7', self.local(p))
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); self.settle(p)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['tilt'], 2)
        self.assertEqual(p._errs, [])

    def test_H02_clear_item_slot_and_day_are_precise(self):
        p = self.history()
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="tilt"] [data-history-action="item"]').click()
        self.settle(p)
        self.assertEqual(self.local(p)['2026-10-09#2']['21'], {'talk': 2})
        self.assertIn('2026-10-09', p._dialogs[-1]); self.assertIn('21', p._dialogs[-1])
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-action="slot"]').click()
        self.settle(p)
        self.assertEqual(self.local(p)['2026-10-09#2'], {'22': {'tilt': 4}})
        p.locator('[data-history-date="2026-10-09"] [data-history-action="day"]').click()
        self.settle(p)
        self.assertNotIn('2026-10-09', self.local(p))
        self.assertEqual(self.local(p)[DAY+'#3']['21'], {'tilt': 2})
        self.assertEqual(self.local(p)['2026-10-09#2']['22'], {'tilt': 4})

    def test_H03_cancel_and_legacy_and_local(self):
        p = self.history(gas=False)
        before = self.local(p)
        p.evaluate('window.confirm = () => false')
        p.locator('[data-history-date="2026-10-09"] [data-history-action="day"]').click()
        self.assertEqual(self.local(p), before)
        self.assertIn('未分節', p.inner_text('#seat-modal-history'))
        p.locator('[data-history-slot="2026-10-09"] [data-history-action="minus"]').click()
        self.assertNotIn('2026-10-09', self.local(p))

    def test_H04_all_day_and_scope_lock_and_today(self):
        p = self.history()
        p.click('#seat-modal-close'); self.period(p, 'all'); self.tap(p, 21); p.locator('#seat-modal-history').wait_for(state='visible')
        self.assertTrue(p.locator('#seat-modal').evaluate('(e)=>e.classList.contains("show")'))
        self.assertIn('2026-10-09', p.inner_text('#seat-modal-history'), p.inner_text('#seat-modal') + repr(p._errs))
        p.click('#seat-modal-close'); p.click('[data-srange="today"]'); self.tap(p, 21); p.locator('#seat-modal-history').wait_for(state='visible')
        self.assertNotIn('2026-10-09', p.inner_text('#seat-modal-history'))
        self.assertIn(DAY, p.inner_text('#seat-modal-history'), p.inner_text('#seat-modal'))

    def test_H05_pending_clear_survives_reload(self):
        p = self.history()
        p.evaluate("sessionStorage.setItem('__fail', JSON.stringify({clearSeatSlot: 20}))")
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-action="slot"]').click()
        p.wait_for_timeout(300)
        self.assertTrue(p.evaluate("JSON.parse(localStorage.getItem('seatSyncQueue')).length > 0"))
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(300)
        self.assertNotIn('21', self.local(p)['2026-10-09#2'])
        p.evaluate("sessionStorage.setItem('__fail', '{}')")
        p.clock.run_for(16000); self.settle(p)
        self.assertNotIn(('2026-10-09','21','tilt','第2節'), self.sheet_counts(p))

    def test_H06_storage_failure_visible_and_data_preserved(self):
        p = self.history()
        before = self.local(p)
        p.evaluate("""() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k==='seatCheckRecords') throw new Error('quota'); return orig.call(this,k,v); }; }""")
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-action="minus"]').first.click()
        self.assertEqual(self.local(p), before)
        self.assertTrue(p.inner_text('#seat-history-error'))
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-action="slot"]').click()
        self.assertEqual(self.local(p), before)
        self.assertTrue(p.inner_text('#seat-history-error'))
        self.assertEqual(p._errs, [])

    def test_H07_unknown_item_and_queue_storage_failure(self):
        p = self.history()
        row = p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="talk"]')
        self.assertIn('talk', row.inner_text())
        before = self.local(p)
        p.evaluate("""() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k==='seatSyncQueue') throw new Error('quota'); return orig.call(this,k,v); }; }""")
        row.locator('[data-history-action="minus"]').click()
        self.assertEqual(self.local(p), before)
        self.assertTrue(p.inner_text('#seat-history-error'))
        self.assertEqual(p._errs, [])
        self.assertFalse(any(x in ['commitPointBatch', 'undoPointBatch', 'savePointSettings', 'resetPoints'] for x in p.evaluate('window.__calls')))

    def test_H08_week_scope_and_auto_boundary_lock(self):
        p = self.history()
        p.click('#seat-modal-close'); p.click('[data-srange="week"]'); self.tap(p,21); p.locator('#seat-modal-history').wait_for(state='visible')
        self.assertIn(DAY, p.inner_text('#seat-modal-history'))
        self.assertNotIn('2026-10-09', p.inner_text('#seat-modal-history'))
        p.click('#seat-modal-close')
        p.click('[data-period-action="auto"]')
        p.click('[data-srange="all"]'); self.tap(p,21); p.locator('#seat-modal-history').wait_for(state='visible')
        before = p.inner_text('#seat-modal-history')
        p.clock.run_for(30*60*1000)
        self.assertEqual(p.inner_text('#seat-modal-history'), before)
        self.assertIn('第3節', p.inner_text('#seat-modal-current-label'))
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="talk"] [data-history-action="minus"]').click()
        self.settle(p)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['talk'],1)
        self.assertFalse(any(x in ['commitPointBatch', 'undoPointBatch', 'savePointSettings', 'resetPoints'] for x in p.evaluate('window.__calls')))

    def test_H09_pull_refreshes_history_without_changing_scope(self):
        p = self.history()
        p.evaluate("""() => { window.__sheetRows().push(['2026-10-08',21,'','舊項目',4,'','retired','第1節']); document.getElementById('tab-seat-btn').click(); }""")
        self.settle(p)
        row = p.locator('[data-history-slot="2026-10-08#1"] [data-history-key="retired"]')
        self.assertIn('4', row.inner_text())
        row.locator('[data-history-action="minus"]').click(); self.settle(p)
        self.assertEqual(self.local(p)['2026-10-08#1']['21']['retired'],3)
        self.assertEqual(p._errs, [])

    def test_H10_pending_minus_survives_reload_and_retries_absolute_count(self):
        p = self.history()
        p.evaluate("sessionStorage.setItem('__fail', JSON.stringify({setSeatCount: 20}))")
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="tilt"] [data-history-action="minus"]').click()
        p.locator('[data-history-slot="2026-10-09"] [data-history-action="minus"]').click()
        p.wait_for_timeout(300)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['tilt'], 2)
        self.assertNotIn('2026-10-09', self.local(p))
        p.reload(); p.wait_for_timeout(300); p.click('#tab-seat-btn'); p.wait_for_timeout(300)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['tilt'], 2)
        self.assertNotIn('2026-10-09', self.local(p))
        self.assertTrue(p.evaluate("JSON.parse(localStorage.getItem('seatSyncQueue')).length > 0"))
        p.evaluate("sessionStorage.setItem('__fail', '{}')")
        p.clock.run_for(16000); self.settle(p)
        self.assertEqual(self.sheet_counts(p)[('2026-10-09','21','tilt','第2節')], 2)
        self.assertNotIn(('2026-10-09','21','tilt',''), self.sheet_counts(p))
        self.assertEqual(p._errs, [])

    def test_H11_old_pull_after_count_ack_cannot_revive_larger_value(self):
        p = self.history()
        p.evaluate("""() => { sessionStorage.setItem('__delay',JSON.stringify({getSeatBundle:120})); sessionStorage.setItem('__respDelay',JSON.stringify({getSeatBundle:700})); document.getElementById('tab-seat-btn').click(); }""")
        p.wait_for_timeout(220)
        p.locator('[data-history-slot="2026-10-09#2"] [data-history-key="tilt"] [data-history-action="minus"]').click()
        self.settle(p)
        self.assertEqual(self.sheet_counts(p)[('2026-10-09','21','tilt','第2節')], 2)
        p.wait_for_timeout(1000)
        self.assertEqual(self.local(p)['2026-10-09#2']['21']['tilt'], 2)
        self.assertEqual(self.sheet_counts(p)[('2026-10-09','21','tilt','第2節')], 2)
        self.assertEqual(p._errs, [])


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(SeatHistory408(name) for name in loader.getTestCaseNames(SeatHistory408) if name.startswith('test_H'))
