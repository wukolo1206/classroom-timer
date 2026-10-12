# -*- coding: utf-8 -*-
"""班級集點：獨立瀏覽器與模擬 GAS，絕不接正式試算表。"""
import functools, http.server, json, os, shutil, socketserver, tempfile, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK = r"""
(() => {
 if (window !== window.top) return;
 const key='__points_cloud';
 const load=()=>JSON.parse(sessionStorage.getItem(key)||'{"events":[],"settings":null,"revision":0,"serverTime":"2026-10-12T00:00:00Z"}');
 const save=b=>sessionStorage.setItem(key,JSON.stringify(b));
 window.__pointsCalls=[];
 function bundle(){const c=load();save(c);return c;}
 const impl={
 getPointBundle:bundle,
 commitPointBatch:b=>{
   if(sessionStorage.getItem('__pointsFail')) throw Error('模擬離線');
   const c=load();let id=b.id,seats=b.seats,delta=b.delta,label=b.label;
   if(b.type==='undo'){
     id='undo:'+b.originalBatchId;
     seats=c.events.filter(e=>e.batchId===b.originalBatchId).map(e=>({seat:e.seat,name:e.name,delta:-e.delta}));label='復原';
   }
   seats.forEach(s=>{
     if(c.events.some(e=>e.id===id+':'+s.seat))return;
     const d=b.type==='reset'?-c.events.filter(e=>e.seat===s.seat).reduce((n,e)=>n+e.delta,0):b.type==='undo'?s.delta:delta;
     c.events.push({id:id+':'+s.seat,batchId:id,time:'2026-10-12T01:00:00Z',seat:s.seat,name:s.name,itemId:b.itemId||'',label:label||'歸零',delta:d,type:b.type,originalBatchId:b.originalBatchId||'',device:b.device});
   });save(c);
   if(sessionStorage.getItem('__pointsLost')){sessionStorage.removeItem('__pointsLost');throw Error('回應遺失');}
   return c;
 },
 savePointSettings:(s,r)=>{const c=load();if(r!==c.revision)throw Error('設定已被其他裝置更新');c.settings=s;c.revision++;save(c);return {settings:s,revision:c.revision};}
 };
 function runner(ok,fail){return new Proxy({}, {get(_,name){
   if(name==='withSuccessHandler')return f=>runner(f,fail);
   if(name==='withFailureHandler')return f=>runner(ok,f);
   return (...args)=>{window.__pointsCalls.push(name);setTimeout(()=>{try{
     if(!impl[name])throw Error('mock: '+name);const x=impl[name](...args);if(ok)ok(x);
   }catch(e){if(fail)fail(e);}},Number(sessionStorage.getItem('__pointsDelay'))||30);};
 }});}
 window.google={script:{get run(){return runner(null,null);}}};
})();
"""

class Points(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.mkdtemp(prefix='points_test_')
        shutil.copy(os.path.join(ROOT,'index.html'),os.path.join(cls.tmp,'index.html'))
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self,*a):pass
        cls.srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Quiet,directory=cls.tmp))
        threading.Thread(target=cls.srv.serve_forever,daemon=True).start()
        cls.url='http://127.0.0.1:%d/index.html'%cls.srv.server_address[1]
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.srv.shutdown();shutil.rmtree(cls.tmp,ignore_errors=True)
    def open(self,gas=False,width=1366):
        ctx=self.browser.new_context(viewport={'width':width,'height':900});self.addCleanup(ctx.close)
        ctx.route('**/script.google.com/**',lambda r:r.abort())
        if gas:ctx.add_init_script(MOCK)
        p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
        p.on('dialog',lambda d:d.accept());p.goto(self.url)
        p.locator('#tab-points-btn').click(timeout=3000)
        p.wait_for_selector('#points-students .points-card');p.wait_for_timeout(150)
        self.addCleanup(lambda:self.assertEqual(errors,[]));return p
    def score(self,p,seat=1,item=0):
        p.locator('[data-point-seat="%s"]'%seat).click()
        p.locator('#points-award-items button').nth(item).click()
        p.wait_for_timeout(200)
    def value(self,p,seat=1):
        return int(p.locator('[data-point-seat="%s"] .points-score'%seat).inner_text())
    def test_local_add_deduct_undo_reload(self):
        p=self.open();self.assertEqual(p.locator('#points-students .points-card').count(),31)
        self.score(p);self.assertEqual(self.value(p),1)
        p.locator('[data-point-seat="1"]').click();p.locator('#points-award-negative').click()
        p.locator('#points-award-items button').first.click();self.assertEqual(self.value(p),0)
        p.locator('#points-undo').click();self.assertEqual(self.value(p),1)
        p.reload();p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),1)
        self.assertIn('本機',p.locator('#points-status').inner_text())
    def test_cloud_batch_all_reset_history(self):
        p=self.open(gas=True);p.locator('#points-all').click()
        p.locator('#points-award-items button').first.click();p.wait_for_timeout(200)
        self.assertEqual(p.locator('.points-score',has_text='1').count(),31)
        p.locator('#points-history').click();self.assertGreaterEqual(p.locator('#points-history-list tr').count(),31)
        p.locator('#points-history-close').click();p.locator('#points-reset').click();p.wait_for_timeout(200)
        self.assertEqual(self.value(p),0);p.locator('#points-refresh').click();p.wait_for_timeout(150)
        self.assertIn('已同步',p.locator('#points-status').inner_text())
    def test_cloud_response_lost_replay_no_duplicate(self):
        p=self.open(gas=True);p.evaluate("sessionStorage.setItem('__pointsLost','1')")
        self.score(p);self.assertEqual(self.value(p),1)
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(300)
        self.assertEqual(self.value(p),1)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).events.length"),1)
    def test_offline_queue_reload_recovery(self):
        p=self.open(gas=True);p.evaluate("sessionStorage.setItem('__pointsFail','1')")
        self.score(p);self.assertIn('待同步',p.locator('#points-status').inner_text())
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(150);self.assertEqual(self.value(p),1)
        p.evaluate("sessionStorage.removeItem('__pointsFail')");p.locator('#points-refresh').click();p.wait_for_timeout(250)
        self.assertEqual(self.value(p),1);self.assertIn('已同步',p.locator('#points-status').inner_text())
    def test_storage_failure_rejects_score(self):
        p=self.open();p.evaluate("(() => {Storage.prototype.setItem=function(){throw Error('quota');};})()")
        self.score(p);self.assertEqual(self.value(p),0)
        self.assertIn('儲存',p.locator('#points-message').inner_text())
    def test_mobile_and_negative_score(self):
        p=self.open(width=390);p.locator('[data-point-seat="1"]').click()
        p.locator('#points-award-negative').click();p.locator('#points-award-items button').first.click()
        self.assertEqual(self.value(p),-1)
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)
    def test_cloud_mode_does_not_import_local_points(self):
        p=self.open();self.score(p);self.assertEqual(self.value(p),1)
        p.context.add_init_script(MOCK);p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(200)
        self.assertEqual(self.value(p),0)
    def test_settings_groups_avatar_and_custom_delta(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-items input[aria-label="項目分值"]').first.fill('3')
        p.locator('#points-settings-groups input[aria-label="小組成員座號"]').first.fill('1,2')
        p.locator('#points-settings-avatars select').first.select_option('7')
        p.locator('#points-settings-save').click();p.wait_for_timeout(200)
        p.locator('#points-view-groups').click();p.locator('#points-groups button').first.click()
        p.locator('#points-award-items button').first.click();p.wait_for_timeout(200)
        p.locator('#points-view-students').click();self.assertEqual(self.value(p,1),3);self.assertEqual(self.value(p,2),3)
        p.locator('#points-view-groups').click();self.assertIn('6 點',p.locator('#points-groups').inner_text())
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(150)
        p.locator('#points-settings').click();self.assertEqual(p.locator('#points-settings-avatars select').first.input_value(),'7')
    def test_desktop_all_students_fit(self):
        p=self.open();p.set_viewport_size({'width':1366,'height':768})
        self.assertLessEqual(p.locator('#points-students .points-card').last.bounding_box()['y']+p.locator('#points-students .points-card').last.bounding_box()['height'],768)
    def test_repeated_undo_survives_reload(self):
        for gas in [False,True]:
            p=self.open(gas=gas);self.score(p);self.score(p)
            self.assertEqual(self.value(p),2)
            p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(200)
            p.locator('#points-undo').click();p.wait_for_timeout(200)
            self.assertEqual(self.value(p),1)
            self.assertFalse(p.locator('#points-undo').is_disabled())
            p.locator('#points-undo').click();p.wait_for_timeout(200)
            self.assertEqual(self.value(p),0)
    def test_group_award_feedback_is_visible(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-groups input[aria-label="小組成員座號"]').first.fill('1,2')
        p.locator('#points-settings-save').click();p.wait_for_timeout(200);p.locator('#points-view-groups').click()
        p.locator('#points-groups button').first.click();p.locator('#points-award-items button').first.click()
        p.wait_for_timeout(200)
        feedback=p.locator('#points-groups .points-float').first
        self.assertTrue(feedback.is_visible())
        self.assertIn('每人 +1',feedback.inner_text())
        p.locator('#points-reset').click();p.wait_for_timeout(200)
        p.locator('#points-view-students').click()
        self.assertEqual(self.value(p,1),0);self.assertEqual(self.value(p,2),0)
    def test_queued_settings_save_keeps_original_revision(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-items input[aria-label="項目名稱"]').first.fill('OLD STALE DRAFT')
        p.evaluate("""() => {
            const b=JSON.parse(sessionStorage.getItem('__points_cloud'));
            b.settings=JSON.parse(localStorage.getItem('c408_points_cloud/state')).defaults;
            b.settings.items[0].label='REMOTE NEW';b.revision++;
            sessionStorage.setItem('__points_cloud',JSON.stringify(b));
            sessionStorage.setItem('__pointsDelay','600');
            document.getElementById('points-refresh').click();
        }""")
        p.locator('#points-settings-save').click();p.locator('#points-settings-cancel').click()
        p.locator('[data-point-seat="1"]').click();p.locator('#points-award-items button').first.click()
        p.wait_for_timeout(700);p.locator('#points-settings').click()
        p.wait_for_timeout(2000)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).settings.items[0].label"),'REMOTE NEW')
        self.assertTrue(p.locator('#points-settings-modal').is_visible())
        self.assertIn('已被其他裝置更新',p.locator('#points-settings-message').inner_text())
    def test_settings_conflict_keeps_draft(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-items input[aria-label="項目名稱"]').first.fill('新的鼓勵項目')
        p.evaluate("const b=JSON.parse(sessionStorage.getItem('__points_cloud')); b.revision++; sessionStorage.setItem('__points_cloud',JSON.stringify(b))")
        p.locator('#points-settings-save').click();p.wait_for_timeout(150)
        self.assertTrue(p.locator('#points-settings-modal').is_visible())
        self.assertEqual(p.locator('#points-settings-items input[aria-label="項目名稱"]').first.input_value(),'新的鼓勵項目')
        self.assertTrue(p.locator('#points-settings-reload').is_visible())
    def test_local_settings_require_both_signs(self):
        p=self.open();p.locator('#points-settings').click()
        for i in range(p.locator('#points-settings-items input[aria-label="項目分值"]').count()):
            p.locator('#points-settings-items input[aria-label="項目分值"]').nth(i).fill('1')
        p.locator('#points-settings-save').click();p.wait_for_timeout(100)
        self.assertTrue(p.locator('#points-settings-modal').is_visible())
        self.assertIn('扣點',p.locator('#points-settings-message').inner_text())
    def test_group_members_reject_duplicates(self):
        p=self.open();p.locator('#points-settings').click()
        inputs=p.locator('#points-settings-groups input[aria-label="小組成員座號"]')
        inputs.nth(0).fill('1,2');inputs.nth(1).fill('2,3')
        p.locator('#points-settings-save').click()
        self.assertIn('重複',p.locator('#points-settings-message').inner_text())
    def test_multi_select_history_filter_and_undo_after_reload(self):
        p=self.open();p.locator('#points-multi').click()
        p.locator('[data-point-seat="1"]').click();p.locator('[data-point-seat="2"]').click()
        p.locator('#points-award-selected').click();p.locator('#points-award-items button').first.click()
        self.assertEqual(self.value(p,1),1);self.assertEqual(self.value(p,2),1)
        p.locator('#points-history').click();p.locator('#points-history-student').select_option('1')
        self.assertEqual(p.locator('#points-history-list tr').count(),1)
        p.locator('#points-history-close').click();p.reload();p.locator('#tab-points-btn').click()
        p.locator('#points-undo').click();self.assertEqual(self.value(p,1),0);self.assertEqual(self.value(p,2),0)

if __name__=='__main__':unittest.main()
