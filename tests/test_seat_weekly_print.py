import unittest,json
from pathlib import Path
from tests import test_points as fixture

class WeeklyPrint(unittest.TestCase):
    open=fixture.Points.open
    @classmethod
    def setUpClass(cls):
        fixture.Points.setUpClass();cls.browser=fixture.Points.browser;cls.url=fixture.Points.url
    @classmethod
    def tearDownClass(cls):fixture.Points.tearDownClass()
    def prepare(self,width=1366):
        p=self.open(width=width)
        p.evaluate("""() => {
            localStorage.setItem('seatCheckRecords',JSON.stringify({
                '2026-10-11#1':{'1':{talk:100}},
                '2026-10-12#1':{'1':{talk:2},'7':{talk:999}},
                '2026-10-12#2':{'1':{talk:3}},
                '2026-10-13':{'1':{talk:1},'2':{sit:2}},
                '2026-10-18#7':{'1':{removed:4}},
                '2026-10-19#1':{'1':{talk:1000}}
            }));
        }""")
        p.locator('#tab-seat-btn').click();p.locator('#seat-week-print-btn').click()
        p.locator('#seat-week-print-date').fill('2026-10-12');p.locator('#seat-week-print-date').dispatch_event('change')
        return p
    def frame(self,p):
        f=p.locator('#seat-week-print-frame').content_frame
        f.locator('.order-card').first.wait_for(state='visible')
        return f
    def test_exact_week_all_periods_legacy_unknown_and_no_writes(self):
        p=self.prepare();before=p.evaluate('JSON.stringify(localStorage)')
        self.assertEqual(p.locator('#seat-week-print-students input:checked').count(),2)
        f=self.frame(p);one=f.locator('.order-card[data-seat="1"]')
        self.assertEqual(one.locator('[data-week-total]').inner_text(),'10')
        self.assertEqual(one.locator('[data-day="2026-10-12"]').inner_text(),'5')
        self.assertEqual(one.locator('[data-day="2026-10-13"]').inner_text(),'1')
        self.assertEqual(one.locator('[data-day="2026-10-18"]').inner_text(),'4')
        self.assertEqual(one.locator('[data-item="talk"] strong').inner_text(),'6')
        self.assertEqual(one.locator('[data-item="removed"] strong').inner_text(),'4')
        self.assertEqual(f.locator('.order-card[data-seat="7"]').count(),0)
        p.locator('#seat-week-print-all').click();self.assertEqual(p.locator('#seat-week-print-students input:checked').count(),31)
        self.assertEqual(p.evaluate('JSON.stringify(localStorage)'),before)
        p.locator('#seat-week-print-date').fill('2026-10-19');p.locator('#seat-week-print-date').dispatch_event('change')
        self.assertEqual(p.locator('#seat-week-print-students input:checked').count(),1)
        self.assertEqual(self.frame(p).locator('[data-week-total]').inner_text(),'1000')
    def test_pdf_eight_cards_page_and_empty_week(self):
        p=self.prepare(width=390);p.locator('#seat-week-print-all').click()
        f=self.frame(p)
        self.assertEqual(f.locator('.order-sheet').count(),4)
        self.assertEqual(f.locator('.order-sheet').first.locator('.order-card').count(),8)
        self.assertTrue(f.locator('.order-card').evaluate_all('nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)'))
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)
        # Render exactly the isolated print document, as the iframe print action does.
        doc=f.locator('html').evaluate('n=>n.outerHTML');out=p.context.new_page();out.set_content(doc)
        pdf=out.pdf(prefer_css_page_size=True,print_background=True)
        import fitz
        parsed=fitz.open(stream=pdf,filetype='pdf');self.assertEqual(len(parsed),4)
        self.assertAlmostEqual(parsed[0].rect.width,595.28,delta=2)
        self.assertIn('10/12',parsed[0].get_text())
        p.locator('#seat-week-print-date').fill('2026-11-02');p.locator('#seat-week-print-date').dispatch_event('change')
        self.assertEqual(p.locator('#seat-week-print-students input:checked').count(),0)
        self.assertTrue(p.locator('#seat-week-print-go').is_disabled())
        p.locator('#seat-week-print-close').click();p.locator('#seat-week-print-modal').wait_for(state='hidden')
        self.assertFalse(p.locator('#seat-week-print-modal').is_visible())
    def test_dense_cards_print_button_and_keyboard_close(self):
        p=self.open();p.evaluate("() => localStorage.setItem('seatCheckItems',JSON.stringify(Array.from({length:20},(_,i)=>({key:'custom'+i,label:'測試項目'+i,color:i}))))")
        p.reload();p.locator('#tab-seat-btn').click();p.locator('#seat-week-print-btn').click()
        p.locator('#seat-week-print-all').click();f=self.frame(p)
        self.assertEqual(f.locator('.order-sheet').count(),8)
        self.assertEqual(f.locator('.order-sheet').first.locator('.order-card').count(),4)
        self.assertEqual(f.locator('.order-card').first.locator('[data-item]').count(),20)
        self.assertTrue(f.locator('.order-card').evaluate_all('nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)'))
        f.locator('body').evaluate("() => {window.__printed=0;window.print=function(){window.__printed++}}")
        p.locator('#seat-week-print-go').click()
        self.assertEqual(f.locator('body').evaluate('()=>window.__printed'),1)
        p.locator('#seat-week-print-close').press('Escape');p.locator('#seat-week-print-modal').wait_for(state='hidden')
        self.assertTrue(p.locator('#seat-week-print-btn').evaluate('n=>n===document.activeElement'))
    def test_long_labels_automatically_use_four_cards(self):
        p=self.open();p.evaluate("() => localStorage.setItem('seatCheckItems',JSON.stringify(Array.from({length:10},(_,i)=>({key:'long'+i,label:'文字項目'.repeat(5),color:i}))))")
        p.reload();p.locator('#tab-seat-btn').click();p.locator('#seat-week-print-btn').click();p.locator('#seat-week-print-all').click()
        f=self.frame(p)
        f.locator('.order-sheet.roomy').first.wait_for(state='visible',timeout=3000)
        self.assertEqual(f.locator('.order-sheet').count(),8)
        self.assertTrue(f.locator('.order-card').evaluate_all('nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)'))
        self.assertFalse(p.locator('#seat-week-print-go').is_disabled())

if __name__=='__main__':unittest.main()
