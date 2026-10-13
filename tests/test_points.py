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
   if(/^avatar:/.test(b.itemId||'')&&!c.events.some(e=>e.batchId===b.id)){
     const cost=(c.settings&&c.settings.avatarCost)||5,bal=c.events.filter(e=>e.seat===b.seats[0].seat).reduce((n,e)=>n+e.delta,0);
     if(sessionStorage.getItem('__pointsAvatarReject')||bal<cost)throw Error('永久：點數不足：換角色需要 '+cost+' 點，目前 '+bal+' 點');
     if(delta!==-cost)throw Error('永久：換角色扣點已改為 '+cost+' 點，請重新整理後再換');
   }
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
        p.wait_for_function("document.getElementById('points-status').textContent.includes('已同步')")
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
    def test_settings_groups_avatar_and_quick_five(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-groups input[aria-label="小組成員座號"]').first.fill('1,2')
        p.locator('#points-settings-save').click();p.wait_for_timeout(200)
        p.locator('#points-view-groups').click();p.locator('#points-groups button').first.click()
        p.locator('#points-award-items button').nth(4).click();p.wait_for_timeout(200)
        p.locator('#points-view-students').click();self.assertEqual(self.value(p,1),5);self.assertEqual(self.value(p,2),5)
        p.locator('#points-view-groups').click();self.assertIn('10 點',p.locator('#points-groups').inner_text())
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(150)
        p.locator('#points-view-students').click();self.assertEqual(self.value(p,1),5)
    def test_desktop_all_students_fit(self):
        p=self.open();p.set_viewport_size({'width':1366,'height':768})
        self.assertLessEqual(p.locator('#points-students .points-card').last.bounding_box()['y']+p.locator('#points-students .points-card').last.bounding_box()['height'],768)
    def test_avatar_gallery_twenty_four_and_saved_selection(self):
        p=self.open(gas=True);self.score(p,1,4);p.locator('#points-settings').click()
        p.locator('#points-settings-avatars .points-avatar-picker').first.click(timeout=3000)
        self.assertEqual(p.locator('#points-avatar-gallery .points-avatar-choice').count(),24)
        p.locator('#points-avatar-gallery [data-avatar="23"]').click()
        self.assertFalse(p.locator('#points-avatar-modal').is_visible());p.wait_for_timeout(300)
        p.locator('#points-settings-cancel').click();self.assertEqual(self.value(p),0)
        bought=p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).events.filter(e=>e.itemId==='avatar:23')")
        self.assertEqual([(e['seat'],e['delta'],e['label']) for e in bought],[(1,-5,'更換角色')])
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(150)
        p.locator('#points-settings').click();p.locator('#points-settings-avatars .points-avatar-picker').first.click()
        self.assertEqual(p.locator('#points-avatar-gallery [aria-pressed="true"]').get_attribute('data-avatar'),'23')
    def test_award_animates_selected_character(self):
        p=self.open();self.score(p,1,4)
        card=p.locator('[data-point-seat="1"]')
        self.assertTrue(card.evaluate("n=>n.classList.contains('points-celebrate')"))
        self.assertGreater(card.locator('svg').evaluate('n=>n.getAnimations().length'),0)
        self.assertFalse(p.locator('[data-point-seat="2"]').evaluate("n=>n.classList.contains('points-celebrate')"))
        p.wait_for_timeout(1200)
        self.assertFalse(card.evaluate("n=>n.classList.contains('points-celebrate')"))
    def test_avatar_selection_preserves_muted_draft(self):
        p=self.open();self.score(p,1,4);p.locator('#points-settings').click();p.locator('#points-settings-muted').check()
        p.locator('#points-settings-avatars .points-avatar-picker').first.click();p.locator('#points-avatar-gallery [data-avatar="23"]').click()
        self.assertTrue(p.locator('#points-settings-muted').is_checked())
        p.locator('#points-settings-save').click()
        self.assertTrue(p.evaluate("JSON.parse(localStorage.getItem('c408_points_local/state')).bundle.settings.muted"))
    def test_avatar_selection_restores_keyboard_focus(self):
        p=self.open();self.score(p,1,4);p.locator('#points-settings').click()
        p.locator('#points-settings-avatars .points-avatar-picker').first.click();p.locator('#points-avatar-gallery [data-avatar="23"]').click()
        self.assertTrue(p.locator('#points-settings-avatars .points-avatar-picker').first.evaluate('n=>document.activeElement===n'))
    def avatar_of(self,p,seat=1):
        return p.locator('[data-point-seat="%s"] svg'%seat).evaluate('n=>n.outerHTML')
    def buy(self,p,seat,idx):
        p.locator('[data-point-seat="%s"]'%seat).click();p.locator('#points-award-avatar').click()
        p.locator('#points-avatar-gallery [data-avatar="%s"]'%idx).click();p.wait_for_timeout(300)
    def test_avatar_purchase_insufficient_points_blocked(self):
        for gas in [False,True]:
            p=self.open(gas=gas);before=self.avatar_of(p);self.score(p,1,3)
            self.buy(p,1,20)
            self.assertTrue(p.locator('#points-avatar-modal').is_visible())
            self.assertIn('點數不足',p.locator('#points-avatar-preview').inner_text())
            p.locator('#points-avatar-close').click()
            self.assertEqual(self.value(p),4);self.assertEqual(self.avatar_of(p),before)
    def test_avatar_purchase_deducts_and_undo_restores(self):
        for gas in [False,True]:
            p=self.open(gas=gas);before=self.avatar_of(p);self.score(p,1,4);self.score(p,1,4)
            self.buy(p,1,20);self.assertEqual(self.value(p),5);after=self.avatar_of(p);self.assertNotEqual(after,before)
            p.locator('[data-point-seat="1"]').click();p.locator('#points-award-avatar').click()
            p.locator('#points-avatar-gallery [data-avatar="20"]').click();p.wait_for_timeout(200)
            self.assertEqual(self.value(p),5,'選目前的角色不扣點')
            p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(300)
            self.assertEqual(self.avatar_of(p),after);self.assertEqual(self.value(p),5)
            p.locator('#points-undo').click();p.wait_for_timeout(400)
            self.assertEqual(self.value(p),10);self.assertEqual(self.avatar_of(p),before)
            p.locator('#points-history').click();self.assertIn('更換角色',p.locator('#points-history-list').inner_text())
    def test_avatar_button_single_student_only_and_custom_cost(self):
        p=self.open();p.locator('#points-settings').click()
        p.locator('#points-settings-avatar-cost').fill('3');p.locator('#points-settings-save').click();p.wait_for_timeout(200)
        p.locator('#points-multi').click();p.locator('[data-point-seat="1"]').click();p.locator('[data-point-seat="2"]').click()
        p.locator('#points-award-selected').click();self.assertFalse(p.locator('#points-award-avatar').is_visible())
        p.locator('#points-award-close').click();p.locator('#points-multi').click()
        self.score(p,1,2);p.locator('[data-point-seat="1"]').click()
        self.assertIn('扣 3 點',p.locator('#points-award-avatar').inner_text())
        p.locator('#points-award-avatar').click();p.locator('#points-avatar-gallery [data-avatar="21"]').click();p.wait_for_timeout(200)
        self.assertEqual(self.value(p),0)
        p.locator('#points-settings').click();p.locator('#points-settings-avatar-cost').fill('0');p.locator('#points-settings-save').click()
        self.assertIn('1～100',p.locator('#points-settings-feedback').inner_text())
    def test_avatar_server_rejection_drops_pending_and_keeps_queue(self):
        p=self.open(gas=True);before=self.avatar_of(p);self.score(p,1,4);p.wait_for_timeout(300)
        p.evaluate("sessionStorage.setItem('__pointsAvatarReject','1')")
        self.buy(p,1,20);p.wait_for_timeout(500)
        self.assertIn('換角色沒有完成',p.locator('#points-message').inner_text())
        self.assertEqual(self.value(p),5);self.assertEqual(self.avatar_of(p),before)
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('c408_points_cloud/state')).pending.length"),0)
        p.evaluate("sessionStorage.removeItem('__pointsAvatarReject')");self.score(p,2,0);p.wait_for_timeout(400)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).events.filter(e=>e.seat===2).length"),1)
    def test_save_validation_feedback_visible_next_to_button(self):
        p=self.open();p.locator('#points-settings').click()
        p.locator('#points-settings-groups input[aria-label="小組成員座號"]').first.fill('999')
        p.locator('#points-settings-save').click()
        notice=p.locator('#points-settings-feedback')
        self.assertIn('有效座號',notice.inner_text(timeout=3000))
        rect=notice.bounding_box();self.assertGreaterEqual(rect['y'],0);self.assertLess(rect['y']+rect['height'],900)
        self.assertFalse(p.locator('#points-settings-save').is_disabled())
    def test_save_progress_then_confirmed_completion(self):
        p=self.open(gas=True);p.evaluate("sessionStorage.setItem('__pointsDelay','500')")
        p.locator('#points-settings').click();p.locator('#points-settings-save').click()
        self.assertIn('儲存中',p.locator('#points-settings-save').inner_text())
        self.assertTrue(p.locator('#points-settings-save').is_disabled())
        p.wait_for_timeout(650);self.assertFalse(p.locator('#points-settings-modal').is_visible())
        self.assertIn('設定已儲存',p.locator('#points-message').inner_text())
    def test_sound_choice_preview_and_reload(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-sound').select_option('levelup',timeout=3000)
        p.locator('#points-settings-sound-preview').click()
        p.locator('#points-settings-save').click();p.wait_for_timeout(200)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).settings.sound"),'levelup')
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(200);p.locator('#points-settings').click()
        self.assertEqual(p.locator('#points-settings-sound').input_value(),'levelup')
    def test_auction_single_charge_and_undo(self):
        for gas in [False,True]:
            p=self.open(gas=gas);p.locator('[data-point-seat="1"]').click();p.locator('#points-award-negative').click()
            p.locator('#points-auction-value').fill('120',timeout=3000)
            p.locator('#points-auction-submit').click();p.wait_for_timeout(200)
            self.assertEqual(self.value(p),-120)
            p.locator('#points-undo').click();p.wait_for_timeout(200);self.assertEqual(self.value(p),0)
            p.locator('[data-point-seat="1"]').click();p.locator('#points-award-negative').click()
            p.locator('#points-auction-value').fill('0');p.locator('#points-auction-submit').click()
            self.assertEqual(self.value(p),0);self.assertTrue(p.locator('#points-award').is_visible())
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
        p.locator('#points-settings-groups input[aria-label="小組名稱"]').first.fill('OLD STALE DRAFT')
        p.evaluate("""() => {
            const b=JSON.parse(sessionStorage.getItem('__points_cloud'));
            b.settings=JSON.parse(localStorage.getItem('c408_points_cloud/state')).defaults;
            b.settings.groups[0].name='REMOTE NEW';b.revision++;
            sessionStorage.setItem('__points_cloud',JSON.stringify(b));
            sessionStorage.setItem('__pointsDelay','600');
            document.getElementById('points-refresh').click();
        }""")
        p.locator('#points-settings-save').click();p.locator('#points-settings-cancel').click()
        p.locator('[data-point-seat="1"]').click();p.locator('#points-award-items button').first.click()
        p.wait_for_timeout(700);p.locator('#points-settings').click()
        p.wait_for_timeout(2000)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).settings.groups[0].name"),'REMOTE NEW')
        self.assertTrue(p.locator('#points-settings-modal').is_visible())
        self.assertIn('已被其他裝置更新',p.locator('#points-settings-message').inner_text())
    def test_settings_conflict_keeps_draft(self):
        p=self.open(gas=True);p.locator('#points-settings').click()
        p.locator('#points-settings-groups input[aria-label="小組名稱"]').first.fill('新的鼓勵項目')
        p.evaluate("const b=JSON.parse(sessionStorage.getItem('__points_cloud')); b.revision++; sessionStorage.setItem('__points_cloud',JSON.stringify(b))")
        p.locator('#points-settings-save').click();p.wait_for_timeout(150)
        self.assertTrue(p.locator('#points-settings-modal').is_visible())
        self.assertEqual(p.locator('#points-settings-groups input[aria-label="小組名稱"]').first.input_value(),'新的鼓勵項目')
        self.assertTrue(p.locator('#points-settings-reload').is_visible())
    def test_quick_points_one_to_five_without_reason(self):
        for gas in [False,True]:
            p=self.open(gas=gas);expected=0
            for sign in [1,-1]:
                for n in range(1,6):
                    p.locator('[data-point-seat="1"]').click()
                    if sign<0:p.locator('#points-award-negative').click()
                    buttons=p.locator('#points-award-items button')
                    self.assertEqual(buttons.all_text_contents(),[(('+' if sign>0 else '−')+str(i)) for i in range(1,6)])
                    self.assertEqual(p.locator('#points-award input:not(#points-auction-value)').count(),0)
                    buttons.nth(n-1).click();p.wait_for_timeout(120)
                    expected+=sign*n;self.assertEqual(self.value(p),expected)
            p.locator('#points-settings').click()
            self.assertFalse(p.locator('#points-settings-items').is_visible())
            p.locator('#points-settings-cancel').click()
            key='c408_points_cloud/state' if gas else 'c408_points_local/state'
            labels=p.evaluate("key=>JSON.parse(localStorage.getItem(key)).bundle.events.map(e=>e.label)",key)
            self.assertEqual(labels,['加點']*5+['扣點']*5)
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

    def seat_open(self,p,seat=1):
        p.locator('#tab-seat-btn').click()
        p.locator('#seat-modes button').first.click()
        p.locator('#seat-chart button[data-seat="%s"]'%seat).click()
        p.wait_for_selector('#seat-modal.show')

    def batch_register(self,p,seat):
        if not p.locator('#seat-chart').is_visible():p.locator('#tab-seat-btn').click()
        p.locator('#seat-modes button').first.click()
        p.locator('#seat-chart button[data-seat="%s"]'%seat).click()
        p.wait_for_selector('#seat-modal.show')

    def batch_prepare(self,p):
        if not p.locator('#seat-chart').is_visible():p.locator('#tab-seat-btn').click()
        p.locator('#seat-period-bar [data-period="1"]').click()
        self.batch_register(p,1)
        p.locator('#seat-modal-list button').first.click()
        p.locator('#seat-modal-list button').first.click()
        p.locator('#seat-modal-list button').nth(2).click()
        p.locator('#seat-modal-close').click()
        self.batch_register(p,2);p.locator('#seat-modal-list button').first.click()
        p.locator('#seat-modal-close').click()

    def test_seat_batch_ui_once_each_and_undo(self):
        p=self.open();self.batch_prepare(p)
        before=p.evaluate("localStorage.getItem('seatCheckRecords')")
        p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-modal.show').wait_for(state='visible')
        self.assertIn('2 位',p.locator('#seat-batch-points-summary').inner_text())
        p.locator('#seat-batch-points-delta').select_option('-2')
        p.locator('#seat-batch-points-confirm').click()
        self.assertEqual(p.evaluate("localStorage.getItem('seatCheckRecords')"),before)
        p.locator('#tab-points-btn').click()
        self.assertEqual([self.value(p,n) for n in [1,2,3]],[-2,-2,0])
        p.locator('#points-undo').click()
        self.assertEqual([self.value(p,n) for n in [1,2]], [0,0])

    def test_seat_batch_cancel_empty_and_allday(self):
        p=self.open();p.locator('#tab-seat-btn').click()
        p.locator('#seat-batch-points-btn').click()
        self.assertFalse(p.locator('#seat-batch-points-modal').is_visible())
        self.batch_prepare(p);p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-cancel').click()
        p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-modal').click(position={'x':5,'y':5})
        p.locator('#seat-batch-points-modal').wait_for(state='hidden')
        self.assertFalse(p.locator('#seat-batch-points-modal').is_visible())
        p.locator('#seat-period-bar [data-period="all"]').click()
        self.assertTrue(p.locator('#seat-batch-points-btn').is_disabled())
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),0)

    def test_seat_batch_storage_failure_keeps_modal(self):
        p=self.open();self.batch_prepare(p);p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-delta').select_option('-3')
        p.evaluate("(() => {window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};})()")
        p.locator('#seat-batch-points-confirm').click()
        self.assertTrue(p.locator('#seat-batch-points-modal').is_visible())
        self.assertIn('儲存',p.locator('#seat-batch-points-error').inner_text())
        self.assertEqual(p.locator('#seat-batch-points-delta').input_value(),'-3')
        p.evaluate('(() => {Storage.prototype.setItem=window.__originalSet;})()')
        p.locator('#seat-batch-points-confirm').click();p.locator('#tab-points-btn').click()
        self.assertEqual([self.value(p,n) for n in [1,2]],[-3,-3])

    def test_seat_batch_only_selected_lesson_frozen_and_mobile(self):
        p=self.open(width=390);p.locator('#tab-seat-btn').click()
        p.locator('#seat-period-bar [data-period="2"]').click()
        self.batch_register(p,3);p.locator('#seat-modal-list button').first.click();p.locator('#seat-modal-close').click()
        p.locator('#seat-period-bar [data-period="1"]').click();self.batch_prepare(p)
        p.evaluate("""() => {
            const records=JSON.parse(localStorage.getItem('seatCheckRecords'));
            const slot=Object.keys(records).find(k=>k.endsWith('#1'));
            const item=Object.keys(records[slot]['1'])[0];
            records['2026-01-01#1']={'4':{[item]:1}};
            records[slot]['7']={[item]:1};records[slot]['5']={[item]:0};
            localStorage.setItem('seatCheckRecords',JSON.stringify(records));
        }""")
        p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-modal.show').wait_for(state='visible')
        summary=p.locator('#seat-batch-points-summary').inner_text()
        self.assertIn('第1節',summary);self.assertIn('2 位',summary)
        self.assertNotIn('3 ',p.locator('#seat-batch-points-names').inner_text())
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'),391)
        p.locator('#seat-period-bar [data-period="2"]').evaluate('n=>n.click()')
        self.assertEqual(p.locator('#seat-batch-points-summary').inner_text(),summary)
        p.locator('#seat-batch-points-confirm').click();p.locator('#tab-points-btn').click()
        self.assertEqual([self.value(p,n) for n in [1,2,3,4,5]],[-1,-1,0,0,0])

    def test_seat_batch_keyboard_cancel_and_focus_trap(self):
        p=self.open();self.batch_prepare(p);p.locator('#seat-batch-points-btn').click()
        p.locator('#seat-batch-points-delta').press('Shift+Tab')
        self.assertTrue(p.locator('#seat-batch-points-confirm').evaluate('n=>document.activeElement===n'))
        p.locator('#seat-batch-points-confirm').press('Tab')
        self.assertTrue(p.locator('#seat-batch-points-delta').evaluate('n=>document.activeElement===n'))
        p.locator('#seat-batch-points-delta').press('Escape')
        p.locator('#seat-batch-points-modal').wait_for(state='hidden')
        self.assertTrue(p.locator('#seat-batch-points-btn').evaluate('n=>document.activeElement===n'))
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),0)

    def test_seat_batch_bridge_pending_confirmed_dedup_validation(self):
        p=self.open(gas=True);p.evaluate("sessionStorage.setItem('__pointsFail','1')")
        req={'seats':[2,1,1],'delta':-2,'id':'seat_batch_test'}
        self.assertTrue(p.evaluate('b=>window.c408PointsBatchFromSeat(b)',req)['accepted'])
        self.assertTrue(p.evaluate('b=>window.c408PointsBatchFromSeat(b)',req)['duplicate'])
        for seats,delta in [([1],-2),([1,2],-3),([], -2),([7],-2),([1],2)]:
            self.assertFalse(p.evaluate('b=>window.c408PointsBatchFromSeat(b)',dict(req,seats=seats,delta=delta))['accepted'])
        p.wait_for_timeout(200)
        self.assertEqual(len(p.evaluate("JSON.parse(localStorage.getItem('c408_points_cloud/state')).pending")),1)
        p.evaluate("sessionStorage.removeItem('__pointsFail');sessionStorage.setItem('__pointsLost','1')")
        p.locator('#points-refresh').click();p.wait_for_timeout(250)
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(300)
        self.assertTrue(p.evaluate('b=>window.c408PointsBatchFromSeat(b)',req)['duplicate'])
        self.assertFalse(p.evaluate('b=>window.c408PointsBatchFromSeat(b)',dict(req,seats=[1]))['accepted'])
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).events.length"),2)
        p.locator('#points-undo').click();p.wait_for_timeout(200)
        self.assertEqual([self.value(p,n) for n in [1,2]], [0,0])

    def test_seat_add_deduct_default_close_and_reset_draft(self):
        p=self.open();self.seat_open(p)
        self.assertEqual(p.locator('#seat-points-delta').input_value(),'0')
        p.locator('#seat-points-delta').select_option('-2')
        p.locator('#seat-modal-done').click()
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),-2)
        self.seat_open(p,2);self.assertEqual(p.locator('#seat-points-delta').input_value(),'0')
        p.locator('#seat-points-delta').select_option('3');p.locator('#seat-modal-done').click()
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p,2),3)
        self.seat_open(p);p.locator('#seat-modal-done').click()
        self.seat_open(p);p.locator('#seat-points-delta').select_option('5')
        p.locator('#seat-modal-close').click();self.seat_open(p)
        self.assertEqual(p.locator('#seat-points-delta').input_value(),'0')
        p.locator('#seat-modal-close').click();p.locator('#tab-points-btn').click()
        self.assertEqual(self.value(p),-2)
        p.locator('#points-history').click()
        self.assertIn('秩序登記',p.locator('#points-history-list').inner_text())

    def test_seat_cold_start_and_existing_undo(self):
        p=self.open();p.reload();self.seat_open(p)
        p.locator('#seat-points-delta').select_option('3');p.locator('#seat-modal-done').click()
        self.assertIn('本機',p.locator('#seat-points-feedback').inner_text())
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),3)
        p.locator('#points-undo').click();self.assertEqual(self.value(p),0)

    def test_seat_storage_failure_keeps_draft_and_retry(self):
        p=self.open();self.seat_open(p)
        p.evaluate("(() => {window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};})()")
        p.locator('#seat-points-delta').select_option('-2');p.locator('#seat-modal-done').click()
        self.assertTrue(p.locator('#seat-modal').is_visible())
        self.assertIn('儲存',p.locator('#seat-points-error').inner_text())
        self.assertEqual(p.locator('#seat-points-delta').input_value(),'-2')
        p.evaluate('(() => {Storage.prototype.setItem=window.__originalSet;})()');p.locator('#seat-modal-done').click()
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),-2)

    def test_seat_pending_reload_response_lost_and_duplicate(self):
        p=self.open(gas=True);p.reload();self.seat_open(p)
        p.evaluate("sessionStorage.setItem('__pointsLost','1')")
        p.locator('#seat-points-delta').select_option('3');p.locator('#seat-modal-done').click()
        p.wait_for_timeout(200)
        self.assertIn('待同步',p.locator('#seat-points-feedback').inner_text())
        batch=p.evaluate("JSON.parse(localStorage.getItem('c408_points_cloud/state')).pending[0]")
        result=p.evaluate('b=>window.c408PointsFromSeat({seat:1,delta:3,id:b.id})',batch)
        self.assertTrue(result['accepted']);self.assertTrue(result['duplicate'])
        p.reload();p.locator('#tab-points-btn').click();p.wait_for_timeout(300)
        self.assertEqual(self.value(p),3)
        self.assertEqual(p.evaluate("JSON.parse(sessionStorage.getItem('__points_cloud')).events.length"),1)
        result=p.evaluate('b=>window.c408PointsFromSeat({seat:1,delta:3,id:b.id})',batch)
        self.assertTrue(result['duplicate']);self.assertEqual(self.value(p),3)

    def test_seat_local_duplicate_validation_and_concurrent_tab_guard(self):
        p=self.open()
        request={'seat':1,'delta':3,'id':'seat-test-fixed'}
        self.assertTrue(p.evaluate('b=>window.c408PointsFromSeat(b)',request)['accepted'])
        self.assertTrue(p.evaluate('b=>window.c408PointsFromSeat(b)',request)['duplicate'])
        self.assertEqual(self.value(p),3)
        for seat,delta in [(7,1),(1,0),(1,6),(1,1.5)]:
            self.assertFalse(p.evaluate('b=>window.c408PointsFromSeat(b)',dict(seat=seat,delta=delta,id='invalid'))['accepted'])
        other=p.context.new_page();other.goto(self.url);other.locator('#tab-points-btn').click()
        self.score(other,seat=2)
        result=p.evaluate('b=>window.c408PointsFromSeat(b)',dict(seat=1,delta=2,id='stale-page'))
        self.assertFalse(result['accepted']);self.assertIn('分頁',result['error'])
        self.assertEqual(other.evaluate("JSON.parse(localStorage.getItem('c408_points_local/state')).bundle.events.length"),2)

    def test_seat_original_count_immediate_and_close_never_submits(self):
        p=self.open();self.seat_open(p)
        p.locator('#seat-modal-list button').first.click()
        before=p.evaluate("localStorage.getItem('seatCheckRecords')")
        self.assertIsNotNone(before)
        p.locator('#seat-points-delta').select_option('-2')
        p.locator('#seat-modal').click(position={'x':5,'y':5})
        self.assertEqual(p.evaluate("localStorage.getItem('seatCheckRecords')"),before)
        p.locator('#tab-points-btn').click();self.assertEqual(self.value(p),0)

    def test_seat_offline_reload_status_and_reconnect(self):
        p=self.open(gas=True);self.seat_open(p)
        p.evaluate("sessionStorage.setItem('__pointsFail','1')")
        p.locator('#seat-points-delta').select_option('-2');p.locator('#seat-modal-done').click()
        p.wait_for_timeout(200);p.reload();p.locator('#tab-seat-btn').click();p.wait_for_timeout(200)
        self.assertIn('待同步',p.locator('#seat-points-feedback').inner_text())
        self.assertIn('重新同步',p.locator('#seat-points-feedback').inner_text())
        p.evaluate("sessionStorage.removeItem('__pointsFail')")
        p.locator('#tab-points-btn').click();p.wait_for_timeout(300)
        self.assertEqual(self.value(p),-2)
        self.assertIn('已同步',p.locator('#seat-points-feedback').inner_text())

if __name__=='__main__':unittest.main()
