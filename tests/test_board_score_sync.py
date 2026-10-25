"""Anonymous browser/RPC checks. All non-local requests are intercepted."""
from pathlib import Path
import functools, http.server, threading, unittest, subprocess, json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
MOCK = r"""
window.__calls=[];window.__board={class_code:'A01',session_id:'s1',status:'discussion',mode:'group',subject:'數學',title:'匿名討論',state_version:1,groups:{1:{seats:[1],score:0},2:{seats:[2],score:0},3:{seats:[3],score:0},4:{seats:[4],score:0}},last_score_transaction:null};
window.google={script:{run:new Proxy({}, {get(_,key){if(key==='withSuccessHandler')return function(ok){return runner(ok,function(){});};if(key==='withFailureHandler')return function(fail){return runner(function(){},fail);};return function(){};}})}};
function runner(ok,fail){return new Proxy({}, {get(_,key){if(key==='withSuccessHandler')return f=>runner(f,fail);if(key==='withFailureHandler')return f=>runner(ok,f);return function(arg){
 if(!key.includes('BoardScore'))return;
 window.__calls.push({name:key,arg:arg});
 setTimeout(function(){if(window.__fail){fail(new Error('mock offline'));return;}
 if(key==='getBoardScoreSnapshot'){ok(JSON.parse(JSON.stringify(window.__board)));return;}
 if(key==='getBoardScoreResult'){ok({found:false,current_session_id:window.__board.session_id});return;}
 var s=window.__board,op=arg.op,d=op.data,result={status:'ok'};
 if(d.expected_state_version!==s.state_version)result={status:'rejected',reason:'state_version'};
 else if(op.type==='adjust_group_score' && s.groups[d.group].score+d.delta<0)result={status:'rejected',reason:'score_bounds'};
 else {window.__before=JSON.parse(JSON.stringify(s.groups));if(op.type==='adjust_group_score')s.groups[d.group].score+=d.delta;else if(op.type==='clear_group_scores')Object.values(s.groups).forEach(g=>g.score=0);else s.groups=window.__undo;s.state_version++;s.last_score_transaction='p'+s.state_version;result.transaction_id=s.last_score_transaction;if(op.type!=='undo_score_transaction')window.__undo=window.__before;}
 ok({result:result,snapshot:JSON.parse(JSON.stringify(s))});},20);
 };}});}
"""
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
class BoardSyncBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.p=sync_playwright().start();cls.browser=cls.p.chromium.launch(headless=True,channel='chrome')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.p.stop();cls.server.shutdown();cls.server.server_close()
    def page(self,gas=True,width=1280):
        p=self.browser.new_page(viewport={'width':width,'height':900})
        p.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1:') else route.abort())
        p.add_init_script("localStorage.setItem('groupScores',JSON.stringify({1:7,2:0,3:0,4:0}));localStorage.setItem('groupCount','4');")
        if gas:p.add_init_script(MOCK)
        p.goto('http://127.0.0.1:'+str(self.server.server_port)+'/index.html',wait_until='networkidle')
        p.add_style_tag(content='.hidden{display:none!important}')
        p.evaluate("""() => {window.c408ApplySharedGroups([1,2,3,4].map(n=>({name:'?'+n+'?',seats:[n]})),1);}""")
        p.locator('#tab-group-btn').click()
        return p
    def link(self,p):
        p.locator('#board-score-link').click();p.wait_for_function('c408BoardSync.state.preview !== null')
        self.assertFalse(p.evaluate('c408BoardSync.state.linked'))
        self.assertIn('數學',p.locator('#board-score-preview').inner_text())
        p.locator('#board-score-confirm').click()
    def test_sync_actions_and_local_restore(self):
        p=self.page();self.link(p)
        p.locator('#group-cards-grid .group-card').first.get_by_role('button',name='+2',exact=True).click()
        p.wait_for_function('c408BoardSync.state.snapshot.groups[1].score===2 && !c408BoardSync.state.pending')
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('groupScores'))[1]"),7)
        self.assertTrue(p.locator('#group-to-points-btn').is_disabled())
        p.on('dialog',lambda d:d.accept());p.locator('#group-undo-score-btn').click()
        p.wait_for_function('c408BoardSync.state.snapshot.groups[1].score===0 && !c408BoardSync.state.pending')
        p.evaluate('window.__board.groups[1].score=5;window.__board.state_version++;c408BoardSync.refresh()')
        p.wait_for_function('c408BoardSync.state.snapshot.groups[1].score===5')
        p.locator('#group-reset-scores-btn').click();p.wait_for_function('c408BoardSync.state.snapshot.groups[1].score===0 && !c408BoardSync.state.pending')
        p.locator('#group-undo-score-btn').click();p.wait_for_function('c408BoardSync.state.snapshot.groups[1].score===5 && !c408BoardSync.state.pending')
        p.locator('#board-score-disconnect').click()
        self.assertEqual(p.evaluate('c408BoardScore(1)'),7)
        self.assertFalse(p.locator('#group-to-points-btn').is_disabled());p.close()
    def test_offline_new_session_and_context_pause(self):
        p=self.page();self.link(p)
        p.evaluate('window.__fail=true;c408BoardSync.adjust(1,2,"測試")');p.wait_for_function('c408BoardSync.state.pending && !c408BoardSync.state.online')
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('groupScores'))[1]"),7)
        p.evaluate('window.__fail=false;window.__board.session_id="s2";c408BoardSync.recover()');p.wait_for_function('c408BoardSync.state.message.includes("舊場")')
        self.assertEqual(p.evaluate('__calls.filter(c=>c.name==="commitBoardScoreOperation").length'),1)
        p.close()
        p=self.page();self.link(p)
        p.evaluate('c408ApplySharedGroups([4,2,3,1].map(n=>({name:"?",seats:[n]})),2)')
        self.assertFalse(p.evaluate('c408BoardSync.canScore()'));p.close()
    def test_local_gating_and_responsive_preview(self):
        p=self.page(gas=False);self.assertEqual(p.locator('#board-score-sync-panel').count(),0);p.close()
        for width in [1280,768,390]:
            p=self.page(width=width);self.link(p)
            self.assertLessEqual(p.locator('#board-score-sync-panel').bounding_box()['width'],width)
            p.close()
    def test_poll_only_visible_group(self):
        p=self.page();self.link(p)
        p.locator('#tab-exam-btn').click();before=p.evaluate('__calls.length');p.wait_for_timeout(2200)
        self.assertEqual(p.evaluate('__calls.length'),before)
        p.locator('#tab-group-btn').click();p.wait_for_function('__calls.length>'+str(before));p.close()
    def test_browser_offline_immediate_pause(self):
        p=self.page();self.link(p)
        before=p.evaluate('__calls.length')
        p.context.set_offline(True)
        p.wait_for_function('!navigator.onLine && !c408BoardSync.canScore()')
        self.assertTrue(p.locator('#group-cards-grid .group-card').first.get_by_role('button',name='+2',exact=True).is_disabled())
        self.assertFalse(p.evaluate('c408BoardSync.adjust(1,2,"offline")'))
        self.assertEqual(p.evaluate('__calls.length'),before)
        p.context.set_offline(False);p.close()
    def test_invalid_persisted_schema_blocks_sync(self):
        p=self.page()
        raw=json.dumps({'cid':'x','pending':{'session_id':'s1','cid':'x','op':{'op_id':'op1','type':'clear_group_scores','data':{'expected_state_version':1}}},'last':None})
        p.evaluate('(raw)=>localStorage.setItem("c408_board_score_sync_v1",raw)',raw)
        p.reload(wait_until='networkidle');p.add_style_tag(content='.hidden{display:none!important}')
        p.locator('#tab-group-btn').click()
        self.assertTrue(p.evaluate('c408BoardSync.state.storageBlocked'))
        self.assertTrue(p.locator('#group-to-points-btn').is_disabled())
        p.locator('#board-score-link').click()
        self.assertEqual(p.evaluate('__calls.length'),0)
        self.assertEqual(p.evaluate('localStorage.getItem("c408_board_score_sync_v1")'),raw)
        p.close()
    def test_source_and_mirror(self):
        self.assertEqual((ROOT/'index.html').read_bytes(),(ROOT/'gas/index.html').read_bytes())
        source=(ROOT/'board-sync/board-sync.js').read_text(encoding='utf-8-sig')
        self.assertNotIn('`',source)
        subprocess.run(['node',str(ROOT/'tests/board_score_sync_sim.js')],check=True,capture_output=True)
if __name__=='__main__': unittest.main()
