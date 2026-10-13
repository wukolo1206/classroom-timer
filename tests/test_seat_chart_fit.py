import unittest
from tests import test_points as fixture

class SeatChartFit(unittest.TestCase):
    open=fixture.Points.open
    @classmethod
    def setUpClass(cls):
        fixture.Points.setUpClass();cls.browser=fixture.Points.browser;cls.url=fixture.Points.url
    @classmethod
    def tearDownClass(cls):fixture.Points.tearDownClass()
    def test_all_columns_fit_at_desktop_and_zoomed_widths(self):
        for width in [1024,1152,1280,1366,1920]:
            p=self.open(width=width);p.locator('#tab-seat-btn').click()
            bounds=p.evaluate("""()=>{var chart=document.getElementById('seat-chart'),box=chart.parentElement.getBoundingClientRect();return Array.from(chart.querySelectorAll('button[data-seat]')).map(n=>{var r=n.getBoundingClientRect();return {seat:n.dataset.seat,left:r.left,right:r.right,boxLeft:box.left,boxRight:box.right}})}""")
            self.assertTrue(all(b['left']>=b['boxLeft']-1 and b['right']<=b['boxRight']+1 for b in bounds),(width,bounds))
            # Click the rightmost student without horizontal scrolling.
            right=p.locator('#seat-chart>div').nth(1).locator('button[data-seat]').last
            right.click();p.locator('#seat-modal.show').wait_for(state='visible')
            self.assertEqual(p.locator('#seat-modal-num').inner_text(),right.get_attribute('data-seat'))
            p.context.close()
    def test_mobile_scroll_reaches_both_edges(self):
        p=self.open(width=390);p.locator('#tab-seat-btn').click()
        p.locator('#seat-chart').evaluate('n=>n.parentElement.scrollLeft=0')
        first=p.locator('#seat-chart>div').nth(1).locator('button[data-seat]').first
        first.click();p.locator('#seat-modal-close').click()
        last=p.locator('#seat-chart>div').nth(1).locator('button[data-seat]').last
        last.click();p.locator('#seat-modal.show').wait_for(state='visible')
        self.assertEqual(p.locator('#seat-modal-num').inner_text(),last.get_attribute('data-seat'))
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)
    def test_top_has_two_control_rows_and_sidebar_batch_button(self):
        p=self.open();p.locator('#tab-seat-btn').click()
        self.assertTrue(p.locator('#seat-batch-points-btn').evaluate("n=>!!n.closest('#seat-summary-card')"))
        for name in ['seat-period-status','seat-week-label','seat-point-tools']:
            self.assertTrue(p.locator('#'+name).evaluate("n=>!!n.closest('#seat-summary-card')"))
        calendar=p.locator('#seat-calendar-line').bounding_box()
        modes=p.locator('#seat-mode-line').bounding_box()
        chart=p.locator('#seat-chart').bounding_box()
        self.assertLess(calendar['y'],modes['y']);self.assertLess(modes['y'],chart['y'])
        self.assertLess(chart['y']-(modes['y']+modes['height']),75)

if __name__=='__main__':unittest.main()
