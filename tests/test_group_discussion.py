# -*- coding: utf-8 -*-
"""小組討論兩版：本機投影、加分復原與公平輪抽，不連正式 Google。"""
import json
import unittest

import test_seat_period_408 as seat408
import test_seat_period_universal as seat_universal


class GroupChecks:
    @classmethod
    def setUpClass(cls):
        cls.fixture.setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def open_group(self):
        fixture = self.fixture('runTest')
        fixture.addCleanup = self.addCleanup
        if self.prefix:
            p = fixture.open()
        else:
            p = fixture.open(gas=False)
        p.context.route('**/script.google.com/**', lambda r: r.abort())
        p.context.route('**/sheets.googleapis.com/**', lambda r: r.abort())
        p.click('#tab-group-btn')
        return p

    def stored(self, p, key, default='{}'):
        return json.loads(p.evaluate('(k) => localStorage.getItem(k)', self.prefix + key) or default)

    def reload_group(self, p):
        p.reload()
        p.wait_for_timeout(300)
        p.click('#tab-group-btn')

    def test_card_body_requires_selected_bonus(self):
        p = self.open_group()
        p.locator('#group-cards-grid .group-card').first.click(position={'x': 65, 'y': 65})
        self.assertEqual(self.stored(p, 'groupScores').get('1', 0), 0)

    def test_undo_restores_exact_score_and_is_cleared_on_reset(self):
        p = self.open_group()
        p.locator('#group-cards-grid .group-card').first.get_by_role('button', name='+2', exact=True).click()
        p.locator('#group-bonus-items-container button').filter(has_text='率先完成').click()
        p.locator('#group-cards-grid .group-card').first.click(position={'x': 65, 'y': 65})
        self.assertEqual(self.stored(p, 'groupScores')['1'], 4)
        p.click('#group-undo-score-btn')
        self.assertEqual(self.stored(p, 'groupScores')['1'], 2)
        self.assertIn('加分 +2', p.locator('#group-cards-grid .group-card').first.inner_text())
        p.click('#group-reset-scores-btn')
        self.assertTrue(p.is_disabled('#group-undo-score-btn'))
        self.assertEqual(self.stored(p, 'groupScores')['1'], 0)

    def test_draw_modes_persist_independently_after_reload(self):
        p = self.open_group()
        for mode, button, tag in [('number', 'number', 'number'), ('group', 'group', 'group'), ('both', 'both', 'both')]:
            p.click('#draw-mode-btn-' + mode)
            p.click('#do-draw-' + button + '-btn')
            p.wait_for_timeout(1300)
            self.assertIn('已抽 1 /', p.inner_text('#draw-' + tag + '-history-tag'))
        self.reload_group(p)
        for mode in ['number', 'group', 'both']:
            p.click('#draw-mode-btn-' + mode)
            self.assertIn('已抽 1 /', p.inner_text('#draw-' + mode + '-history-tag'))
        self.assertEqual(len(self.stored(p, 'groupDrawProgress')['groups']), 1)

    def test_completed_round_waits_for_explicit_reset(self):
        p = self.open_group()
        p.click('#draw-mode-btn-group')
        results = []
        for _ in range(6):
            p.click('#do-draw-group-btn')
            p.wait_for_timeout(1300)
            results.append(p.inner_text('#draw-result-display'))
        self.assertEqual(len(set(results)), 6)
        p.click('#do-draw-group-btn')
        p.wait_for_timeout(1300)
        self.assertIn('已抽 6 / 6', p.inner_text('#draw-group-history-tag'))
        self.assertEqual(len(self.stored(p, 'groupDrawHistory', '[]')), 6)
        p.click('#draw-group-reset-btn')
        self.assertIn('已抽 0 / 6', p.inner_text('#draw-group-history-tag'))
        self.reload_group(p)
        p.click('#draw-mode-btn-group')
        self.assertIn('已抽 0 / 6', p.inner_text('#draw-group-history-tag'))

    def test_projection_fits_default_task_and_eight_groups_and_exits(self):
        p = self.open_group()
        p.set_viewport_size({'width': 1366, 'height': 768})
        p.click('.group-count-btn[data-count="8"]')
        p.click('#group-projection-btn')
        p.evaluate('window.scrollTo(0, 0)')
        metrics = p.evaluate("""() => ({
            font: parseFloat(getComputedStyle(document.getElementById('group-tasks-list-display')).fontSize),
            bottom: document.getElementById('group-cards-grid').getBoundingClientRect().bottom,
            projected: document.body.classList.contains('group-projection'),
            width: document.documentElement.scrollWidth
        })""")
        self.assertGreaterEqual(metrics['font'], 24)
        self.assertLessEqual(metrics['bottom'], 768)
        self.assertTrue(metrics['projected'])
        self.assertLessEqual(metrics['width'], 1366)
        self.assertIn('已抽 0 /', p.inner_text('#group-projection-draw-status'))
        p.locator('#group-bonus-items-container button').filter(has_text='率先完成').click()
        self.assertLessEqual(p.locator('#group-draw-section').bounding_box()['y'] + p.locator('#group-draw-section').bounding_box()['height'], 768)
        p.click('#do-draw-number-btn')
        p.wait_for_timeout(1300)
        self.assertTrue(p.is_visible('#group-draw-result-backdrop'))
        self.assertIn('已抽 1 /', p.inner_text('#group-projection-draw-status'))
        p.click('#group-draw-result-close-btn')
        self.assertFalse(p.is_visible('#group-draw-result-backdrop'))
        p.click('#group-projection-btn')
        p.click('#tab-timer-btn')
        self.assertFalse(p.evaluate("document.body.classList.contains('group-projection')"))

    def test_reload_during_draw_keeps_reserved_result(self):
        p = self.open_group()
        p.click('#do-draw-number-btn')
        reserved = self.stored(p, 'groupDrawProgress')
        self.reload_group(p)
        self.assertEqual(p.inner_text('#draw-result-display'), reserved['lastResult']['text'])
        self.assertIn('已抽 1 /', p.inner_text('#draw-number-history-tag'))
        self.assertEqual(len(self.stored(p, 'groupDrawProgress')['history']), 1)

    def test_storage_failure_does_not_score_or_consume_draw(self):
        p = self.open_group()
        p.locator('#group-cards-grid .group-card').first.get_by_role('button', name='+2', exact=True).click()
        p.evaluate("""() => {
            window.__groupSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) {
                if (k.endsWith('groupScores') || k.endsWith('groupDrawProgress')) throw new DOMException('full', 'QuotaExceededError');
                return window.__groupSet.call(this,k,v);
            };
        }""")
        p.click('#group-undo-score-btn')
        self.assertEqual(self.stored(p, 'groupScores')['1'], 2)
        self.assertFalse(p.is_disabled('#group-undo-score-btn'))
        p.click('#do-draw-number-btn')
        p.wait_for_timeout(1300)
        self.assertIn('已抽 0 /', p.inner_text('#draw-number-history-tag'))
        self.assertEqual(self.stored(p, 'groupDrawProgress'), {})
        p.evaluate('() => { Storage.prototype.setItem = window.__groupSet; }')
        p.click('#group-undo-score-btn')
        self.assertEqual(self.stored(p, 'groupScores')['1'], 0)
        p.click('#do-draw-number-btn')
        p.wait_for_timeout(1300)
        self.assertIn('已抽 1 /', p.inner_text('#draw-number-history-tag'))

    def test_temporarily_smaller_groups_preserve_draws(self):
        p = self.open_group()
        p.click('#draw-mode-btn-group')
        for _ in range(6):
            p.click('#do-draw-group-btn')
            p.wait_for_timeout(1300)
        p.click('.group-count-btn[data-count="4"]')
        self.assertIn('已抽 4 / 4', p.inner_text('#draw-group-history-tag'))
        self.reload_group(p)
        p.click('.group-count-btn[data-count="6"]')
        p.click('#draw-mode-btn-group')
        self.assertIn('已抽 6 / 6', p.inner_text('#draw-group-history-tag'))


class Group408(GroupChecks, unittest.TestCase):
    fixture = seat408.SeatPeriod408
    prefix = ''


class GroupUniversal(GroupChecks, unittest.TestCase):
    fixture = seat_universal.SeatPeriodUniversal
    prefix = 'ctu_'

    def test_full_backup_includes_draw_progress_with_prefix(self):
        p = self.open_group()
        p.click('#do-draw-number-btn')
        p.wait_for_timeout(1300)
        with p.expect_download() as event:
            p.evaluate("window.ctuFullBackup('group-test')")
        data = json.loads(event.value.path().read_text(encoding='utf-8'))['data']
        self.assertIn('ctu_groupDrawProgress', data)
        self.assertNotIn('groupDrawProgress', data)
        self.assertEqual(json.loads(data['ctu_groupDrawProgress'])['numbers'], self.stored(p, 'groupDrawProgress')['numbers'])
