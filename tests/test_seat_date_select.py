# -*- coding: utf-8 -*-
"""Weekday dropdown: local UI only, with existing isolated browser fixture."""
import datetime, unittest
from tests import test_points as points_fixture

class DateSelect(unittest.TestCase):
    open=points_fixture.Points.open
    @classmethod
    def setUpClass(cls):
        points_fixture.Points.setUpClass();cls.browser=points_fixture.Points.browser;cls.url=points_fixture.Points.url
    @classmethod
    def tearDownClass(cls):points_fixture.Points.tearDownClass()
    def seat(self,width=1366,day=12):
        p=self.open(width=width)
        p.clock.install(time=datetime.datetime(2026,10,day,9,0,tzinfo=datetime.timezone.utc))
        p.reload();p.locator('#tab-seat-btn').click()
        return p
    def register(self,p,seat):
        p.locator('#seat-chart [data-seat="%d"]'%seat).click()
        p.locator('#seat-modal-list button').first.click();p.locator('#seat-modal-close').click()
    def test_day_switch_keeps_daily_records_and_focus(self):
        p=self.seat();s=p.locator('#seat-date-select')
        s.wait_for(state='visible',timeout=3000)
        self.assertEqual(s.input_value(),'2026-10-12')
        self.assertEqual(s.locator('option').count(),5)
        p.locator('#seat-period-bar [data-period="1"]').click();self.register(p,1)
        s.focus();s.select_option('2026-10-13')
        self.assertTrue(s.evaluate('n=>document.activeElement===n'))
        self.assertIn('星期二',p.locator('#seat-check-date').inner_text())
        self.assertEqual(p.locator('#seat-count-total').inner_text(),'0')
        self.register(p,2)
        s.select_option('2026-10-12');p.locator('#seat-period-bar [data-period="1"]').click()
        self.assertEqual(p.locator('#seat-count-total').inner_text(),'1')
        p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-modal.show').wait_for(state='visible')
        names=p.locator('#seat-batch-points-names').inner_text()
        self.assertTrue(names.startswith('1 '));self.assertNotIn('2 ',names)
        p.locator('#seat-batch-points-cancel').click()
        a=s.bounding_box();b=p.locator('#seat-period-bar button').first.bounding_box()
        self.assertLess(a['x'],b['x']);self.assertLess(abs(a['y']-b['y']),8)
    def test_mobile_and_weekend_value_are_honest(self):
        p=self.seat(width=390,day=17);s=p.locator('#seat-date-select')
        s.wait_for(state='visible',timeout=3000)
        self.assertEqual(s.input_value(),'2026-10-17')
        self.assertIn('星期六',s.locator('option:checked').inner_text())
        s.select_option('2026-10-12')
        self.assertIn('星期一',p.locator('#seat-check-date').inner_text())
        self.assertEqual(s.locator('option[value="2026-10-17"]').count(),1)
        s.select_option('2026-10-17')
        self.assertIn('星期六',p.locator('#seat-check-date').inner_text())
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)

if __name__=='__main__':unittest.main()
