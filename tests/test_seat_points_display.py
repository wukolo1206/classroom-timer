import unittest
from tests import test_points as fixture

class SeatPointsDisplay(unittest.TestCase):
    open = fixture.Points.open
    @classmethod
    def setUpClass(cls):
        fixture.Points.setUpClass()
        cls.browser, cls.url = fixture.Points.browser, fixture.Points.url
    @classmethod
    def tearDownClass(cls): fixture.Points.tearDownClass()
    def test_shared_score_avatar_feedback_and_redraw(self):
        p = self.open()
        p.locator('#tab-seat-btn').click()
        card = p.locator('#seat-chart [data-seat="1"]')
        self.assertEqual(card.locator('.seat-point-avatar svg').count(), 1)
        self.assertEqual(card.locator('.seat-point-avatar').inner_html(),p.locator('[data-point-seat="1"] svg').evaluate('n=>n.outerHTML'))
        self.assertEqual(card.locator('.seat-point-score').inner_text(), '0')
        self.assertGreaterEqual(card.bounding_box()['width'], 130)
        result = p.evaluate("c408PointsBatchFromSeat({seats:[1,2],delta:-2,id:'display_test'})")
        self.assertTrue(result['accepted'])
        self.assertEqual(card.locator('.seat-point-score').inner_text(), '-2')
        self.assertEqual(card.locator('.points-negative').inner_text(), '-2')
        self.assertEqual(p.locator('#seat-chart [data-seat="3"] .seat-point-score').inner_text(), '0')
        p.locator('#seat-period-bar [data-period="1"]').click()
        self.assertEqual(card.locator('.seat-point-score').inner_text(), '-2')
        self.assertEqual(card.locator('.seat-point-avatar svg').count(), 1)
        p.locator('#tab-points-btn').click()
        self.assertEqual(p.locator('[data-point-seat="1"] .points-score').inner_text(), '-2')
        p.locator('#tab-seat-btn').click()
        p.reload(); p.locator('#tab-seat-btn').click()
        self.assertEqual(card.locator('.seat-point-score').inner_text(), '-2')
    def test_modal_confirm_shows_effect_on_seat_card(self):
        p=self.open();p.locator('#tab-seat-btn').click()
        p.locator('#seat-chart [data-seat="1"]').click()
        p.locator('#seat-points-delta').select_option('-2')
        p.locator('#seat-modal-done').click()
        self.assertEqual(p.locator('#seat-chart [data-seat="1"] .seat-point-score').inner_text(),'-2')
        self.assertEqual(p.locator('#seat-chart [data-seat="1"] .points-negative').inner_text(),'-2')
    def test_failed_storage_does_not_show_score_or_feedback(self):
        p = self.open(width=390)
        p.locator('#tab-seat-btn').click()
        p.evaluate("() => {Storage.prototype.setItem=function(){throw new Error('full')}}")
        result=p.evaluate("c408PointsFromSeat({seat:1,delta:-3,id:'display_fail'})")
        self.assertFalse(result['accepted'])
        self.assertEqual(p.locator('#seat-chart [data-seat="1"] .seat-point-score').inner_text(), '0')
        self.assertEqual(p.locator('#seat-chart .points-float').count(), 0)
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)

if __name__=='__main__': unittest.main()
