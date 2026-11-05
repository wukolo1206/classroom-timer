"""Isolated garden browser verification; no production requests or student data."""
import functools, http.server, json, socketserver, threading, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FAKE = """(() => {
 window.micLevel=0.001;window.stoppedTracks=0;window.micRequests=0;
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.micRequests++;if(window.denyMic)throw {name:'NotAllowedError'};return {getTracks:()=>[{stop:()=>window.stoppedTracks++,addEventListener:()=>{}}]};}}});
 window.AudioContext=class {constructor(){this.state='running';}resume(){return Promise.resolve();}close(){return Promise.resolve();}createMediaStreamSource(){return {connect(){}};}createBiquadFilter(){return {frequency:{value:0},connect(){}};}createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(b){b.fill(window.micLevel);}};}};
})();"""

class Garden(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  class Quiet(http.server.SimpleHTTPRequestHandler):
   def log_message(self,*args): pass
  cls.server=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
  threading.Thread(target=cls.server.serve_forever,daemon=True).start()
  cls.url='http://127.0.0.1:%s/'%cls.server.server_address[1]
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch()
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def open(self,width=1366,direct=False):
  ctx=self.browser.new_context(viewport={'width':width,'height':768});self.addCleanup(ctx.close)
  ctx.add_init_script(FAKE);page=ctx.new_page();page.errors=[];page.on('pageerror',lambda e:page.errors.append(str(e)))
  page.goto(self.url+'garden.html');self.assertEqual(page.title(),'班級祕密花園')
  if not direct:page.select_option('#garden-session-mode','timed')
  return page
 def begin(self,p,spawn=15):
  p.click('#garden-demo');p.fill('#garden-minutes','1');p.fill('#garden-spawn-seconds',str(spawn));p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase === 'running'")
 def test_quiet_noise_recovery_and_collection(self):
  p=self.open();self.begin(p);p.clock.run_for(16000)
  self.assertEqual(p.locator('.garden-visitor').count(),1)
  p.evaluate('window.micLevel=.1');p.clock.run_for(3500);self.assertEqual(p.locator('#garden-scene').get_attribute('data-mood'),'resting')
  p.evaluate('window.micLevel=.001');p.clock.run_for(2500);self.assertEqual(p.locator('#garden-scene').get_attribute('data-mood'),'growing')
  p.clock.run_for(45000);self.assertEqual(p.locator('body').get_attribute('data-phase'),'ended')
  self.assertGreater(p.evaluate('window.stoppedTracks'),0);self.assertIn('1',p.inner_text('#garden-history'))
  self.assertEqual(p.errors,[])
 def test_teacher_pause_freezes_countdown_and_releases_mic(self):
  p=self.open();self.begin(p);p.clock.run_for(16000);p.click('#garden-pause');before=p.inner_text('#garden-clock');p.clock.run_for(10000)
  self.assertEqual(p.inner_text('#garden-clock'),before);self.assertGreater(p.evaluate('window.stoppedTracks'),0)
  p.click('#garden-pause');p.wait_for_function("document.body.dataset.phase === 'running'");p.clock.run_for(1000);self.assertNotEqual(p.inner_text('#garden-clock'),before)
 def test_denied_mic_does_not_start_timer_and_can_retry(self):
  p=self.open();p.click('#garden-demo');p.evaluate('window.denyMic=true');p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='idle'")
  self.assertIn('麥克風',p.inner_text('#garden-message'));self.assertEqual(p.inner_text('#garden-clock'),'10:00');self.assertTrue(p.is_enabled('#garden-start'))
  p.evaluate('window.denyMic=false');p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'")
 def test_no_signal_never_earns_visitors(self):
  p=self.open();p.evaluate('window.micLevel=0');self.begin(p);p.clock.run_for(18000)
  self.assertEqual(p.locator('.garden-visitor').count(),0);self.assertIn('收不到',p.inner_text('#garden-message'))
 def test_refresh_failure_keeps_current_progress(self):
  p=self.open();self.begin(p);p.clock.run_for(16000);p.click('#garden-refresh')
  self.assertEqual(p.locator('.garden-visitor').count(),1);self.assertIn('示範',p.inner_text('#garden-source'))
 def test_responsive_and_31_visitors(self):
  for width in [1366,1024,640,390]:
   with self.subTest(width=width):
    p=self.open(width);self.begin(p,spawn=1);p.clock.run_for(60000)
    self.assertEqual(p.locator('.garden-visitor').count(),31)
    self.assertFalse(p.evaluate('document.documentElement.scrollWidth>innerWidth'))
    boxes=p.locator('.garden-visitor').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})')
    scene=p.locator('#garden-scene').bounding_box()
    self.assertTrue(all(b['x']>=scene['x']-1 and b['right']<=scene['x']+scene['width']+1 for b in boxes))
    self.assertEqual(p.errors,[])
 def cloud_pair(self,delay=0):
  ctx=self.browser.new_context(viewport={'width':1366,'height':768});self.addCleanup(ctx.close);ctx.add_init_script(FAKE)
  launcher=(ROOT/'garden/launcher.js').read_text(encoding='utf-8')
  harness='''<button data-garden-launch="c408">open</button><script>
   window.calls=0;window.currentAvatar=8;window.rosterDelay=DELAY;
   window.google={script:{run:{withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getGardenRoster(){window.calls++;let ok=this.success,bad=this.failure;setTimeout(()=>{if(window.failRoster)bad({message:'offline'});else ok({roster:[{seat:1,avatar:window.currentAvatar},{seat:3,avatar:9}],readAt:'2026-11-05T00:00:00Z'});},window.rosterDelay);}}}};
   </script><script>'''+launcher+'</script>'
  def serve(route):
   from urllib.parse import urlparse
   path=urlparse(route.request.url).path
   if path=='/garden-launch-test':route.fulfill(body=harness,content_type='text/html');return
   rel=path.removeprefix('/classroom-timer/')
   file=(ROOT/rel).resolve()
   if file.is_relative_to(ROOT) and file.is_file():route.fulfill(path=str(file));return
   route.abort()
  harness=harness.replace('DELAY',str(delay));ctx.route('**/*',serve)
  parent=ctx.new_page();parent.goto('https://script.google.com/garden-launch-test')
  with parent.expect_popup() as pop:parent.click('button')
  child=pop.value;child.wait_for_load_state('domcontentloaded')
  if not delay:child.wait_for_function("document.getElementById('garden-source').textContent.includes('已更新')")
  child.select_option('#garden-session-mode','timed')
  return parent,child
 def test_cloud_refresh_changes_avatar_without_resetting_garden(self):
  parent,p=self.cloud_pair();p.fill('#garden-minutes','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(16000)
  seat=p.locator('.garden-visitor').get_attribute('data-seat');parent.evaluate('s=>window.currentAvatar=23',seat)
  if seat!='1':p.clock.run_for(15000)
  parent.evaluate('window.currentAvatar=23');p.click('#garden-refresh');p.wait_for_function("document.querySelector('[data-seat=\"1\"]').dataset.avatar==='23'")
  self.assertGreater(p.locator('.garden-visitor').count(),0);self.assertGreaterEqual(parent.evaluate('window.calls'),3)
 def test_cloud_refresh_failure_retains_previous_avatar(self):
  parent,p=self.cloud_pair();parent.evaluate('window.failRoster=true');p.click('#garden-refresh');p.wait_for_function("document.getElementById('garden-message').textContent.includes('offline')")
  self.assertIn('保留',p.inner_text('#garden-message'));p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='idle'");self.assertEqual(p.inner_text('#garden-clock'),'10:00')
 def test_forged_message_cannot_replace_roster(self):
  parent,p=self.cloud_pair();p.evaluate("window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',source:window.opener,data:{type:'garden:roster',roster:[{seat:99,avatar:23}]}}))")
  self.assertIn('2 位',p.inner_text('#garden-source'))
 def test_100_visitors_fit_inside_garden_without_overlap(self):
  p=self.open(390);p.evaluate("localStorage.setItem('c408_garden_roster',JSON.stringify({roster:Array.from({length:100},(_,i)=>({seat:i+1,avatar:i%24}))}))");p.reload();p.fill('#garden-minutes','2');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(120000)
  self.assertEqual(p.locator('.garden-visitor').count(),100)
  data=p.locator('.garden-visitor').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})')
  s=p.locator('#garden-scene').bounding_box()
  self.assertTrue(all(b['bottom']<=s['y']+s['height'] for b in data))
  self.assertFalse(any(min(a['right'],b['right'])-max(a['x'],b['x'])>1 and min(a['bottom'],b['bottom'])-max(a['y'],b['y'])>1 for i,a in enumerate(data) for b in data[i+1:]))
 def test_pending_audio_resume_releases_mic_when_page_hides(self):
  p=self.open();p.click('#garden-demo');p.evaluate('() => {AudioContext.prototype.resume=()=>new Promise(()=>{});}');p.click('#garden-start');p.wait_for_function('window.micRequests===1')
  p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
  self.assertGreater(p.evaluate('window.stoppedTracks'),0)
 def test_pending_roster_response_cannot_replace_demo_choice(self):
  parent,p=self.cloud_pair(delay=2000)
  p.click('#garden-demo');p.wait_for_timeout(2200)
  self.assertIn('示範模式',p.inner_text('#garden-source'));self.assertIn('31',p.inner_text('#garden-count'))
  parent.evaluate('window.rosterDelay=0');p.click('#garden-class-retry');p.wait_for_function("document.getElementById('garden-source').textContent.includes('已更新')")
  self.assertIn('2',p.inner_text('#garden-welcome-title'));self.assertFalse(p.is_visible('#garden-demo'))
 def test_interrupted_second_start_never_resumes_completed_session(self):
  p=self.open();self.begin(p);p.clock.run_for(60000)
  p.evaluate('() => {AudioContext.prototype.resume=()=>new Promise(()=>{});}');p.click('#garden-start');p.wait_for_function('window.micRequests>=2')
  p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
  self.assertEqual(p.locator('body').get_attribute('data-phase'),'idle')
  p.evaluate("() => {Object.defineProperty(document,'hidden',{configurable:true,value:false});AudioContext.prototype.resume=()=>Promise.resolve();}")
  p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");self.assertEqual(p.inner_text('#garden-clock'),'01:00')
 def test_local_scoring_avatar_changes_and_undo_are_read_without_writes(self):
  ctx=self.browser.new_context();self.addCleanup(ctx.close);ctx.add_init_script(FAKE)
  scripts=(ROOT/'garden/core.js').read_text(encoding='utf-8')+'\n'+(ROOT/'garden/launcher.js').read_text(encoding='utf-8')
  harness='<button data-garden-launch="c408">open</button><script>var seatRoster={1:["Test A"],3:["Test B"],8:["Test C"]};localStorage.setItem("c408_points_local/state",JSON.stringify({bundle:{settings:{avatars:{1:8}},events:[]},pending:[]}));</script><script>'+scripts+'</script>'
  ctx.route('**/garden-local-test',lambda r:r.fulfill(body=harness,content_type='text/html'))
  parent=ctx.new_page();parent.goto(self.url+'garden-local-test')
  with parent.expect_popup() as pop:parent.click('button')
  p=pop.value;p.wait_for_function("document.getElementById('garden-source').textContent.includes('已更新')")
  p.select_option('#garden-session-mode','timed');p.fill('#garden-minutes','1');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000)
  self.assertEqual(p.locator('[data-seat="1"]').get_attribute('data-avatar'),'8')
  parent.evaluate("() => {let s=JSON.parse(localStorage.getItem('c408_points_local/state'));s.bundle.events.push({seat:1,type:'score',batchId:'change',itemId:'avatar:23'});localStorage.setItem('c408_points_local/state',JSON.stringify(s));}")
  p.click('#garden-refresh');p.wait_for_function("document.querySelector('[data-seat=\"1\"]').dataset.avatar==='23'")
  parent.evaluate("() => {let s=JSON.parse(localStorage.getItem('c408_points_local/state'));s.bundle.events.push({type:'undo',originalBatchId:'change'});localStorage.setItem('c408_points_local/state',JSON.stringify(s));}")
  before=parent.evaluate("localStorage.getItem('c408_points_local/state')");p.click('#garden-refresh');p.wait_for_function("document.querySelector('[data-seat=\"1\"]').dataset.avatar==='8'")
  self.assertEqual(parent.evaluate("localStorage.getItem('c408_points_local/state')"),before)
  self.assertEqual(p.inner_text('#garden-count'),'3 / 3')
 def test_meter_and_next_visitor_countdown_pause_and_retreat(self):
  p=self.open(direct=True);self.assertEqual(p.locator('#garden-level').count(),1)
  p.click('#garden-demo');p.fill('#garden-spawn-seconds','2');p.fill('#garden-loud-seconds','3');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(3000)
  self.assertEqual(p.locator('.garden-visitor').count(),1);before=p.inner_text('#garden-next-seconds')
  p.evaluate('window.micLevel=.1');p.clock.run_for(500);self.assertIn('暫停',p.inner_text('#garden-meter-status'));p.clock.run_for(1000);self.assertEqual(p.inner_text('#garden-next-seconds'),before)
  self.assertEqual(p.locator('.visitor-body').first.evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')
  p.clock.run_for(2000);self.assertEqual(p.locator('.garden-visitor').count(),0)
  p.evaluate('window.micLevel=.001');p.clock.run_for(1500);self.assertEqual(p.locator('.garden-visitor').count(),1)
 def test_direct_detection_keeps_running_and_has_visible_elapsed_time(self):
  p=self.open(direct=True);p.click('#garden-demo');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(125000)
  self.assertEqual(p.locator('body').get_attribute('data-phase'),'running');self.assertEqual(p.inner_text('#garden-clock'),'02:05');self.assertIn('已偵測',p.inner_text('#garden-clock-label'))
 def test_full_class_unlocks_animated_garden_changes(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(18000)
  self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),'3');self.assertGreater(p.locator('.garden-butterfly').count(),0);self.assertGreater(p.locator('.garden-star').count(),0)
  self.assertIn('星光',p.inner_text('#garden-stage-label'));self.assertNotEqual(p.locator('.visitor-body').first.evaluate('(e)=>getComputedStyle(e).animationName'),'visitor-breathe')
 def test_manual_end_cannot_resume_as_a_new_direct_session(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000)
  p.on('dialog',lambda d:d.accept());p.click('#garden-end');self.assertEqual(p.locator('body').get_attribute('data-phase'),'ended')
  p.evaluate('() => {AudioContext.prototype.resume=()=>new Promise(()=>{});}');p.click('#garden-start');p.wait_for_function('window.micRequests>=2')
  p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
  self.assertEqual(p.locator('body').get_attribute('data-phase'),'idle')
 def test_new_garden_clears_previous_visitors_before_first_arrival(self):
  p=self.open();self.begin(p,spawn=1);p.clock.run_for(60000);self.assertEqual(p.locator('.garden-visitor').count(),31)
  p.click('#garden-again');self.assertEqual(p.locator('.garden-visitor').count(),0)
  self.assertEqual(p.locator('.garden-flower').count(),0)
  p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");self.assertEqual(p.locator('.garden-visitor').count(),0)
 def test_real_roster_welcome_shows_class_and_starts_without_demo(self):
  parent,p=self.cloud_pair();self.assertEqual(p.locator('#garden-welcome-title').count(),1)
  self.assertIn('2',p.inner_text('#garden-welcome-title'));self.assertFalse(p.is_visible('#garden-demo'))
  self.assertTrue(p.is_visible('#garden-welcome-start'));p.click('#garden-welcome-start');p.wait_for_function("document.body.dataset.phase==='running'")
  self.assertNotIn('示範',p.inner_text('#garden-source'));self.assertEqual(p.inner_text('#garden-count-label'),'班級夥伴')
 def test_direct_welcome_explains_missing_class_connection(self):
  p=self.open(direct=True);self.assertEqual(p.locator('#garden-welcome-title').count(),1)
  self.assertIn('班級',p.inner_text('#garden-welcome-detail'));self.assertFalse(p.is_visible('#garden-welcome-start'));self.assertIn('模擬',p.inner_text('#garden-demo'))
 def test_cached_welcome_never_claims_current_cloud_avatars(self):
  p=self.open();p.evaluate("localStorage.setItem('c408_garden_roster',JSON.stringify({roster:[{seat:1,avatar:8}]}))");p.reload()
  self.assertIn('上次',p.inner_text('#garden-welcome-title'));self.assertIn('上次',p.inner_text('#garden-welcome-start'));self.assertFalse(p.is_visible('#garden-demo'))
 def test_life_has_varied_props_and_actual_walk_positions(self):
  p=self.open();self.begin(p,spawn=1);p.clock.run_for(10000)
  self.assertGreater(p.locator('.visitor-travel').count(),0)
  self.assertGreaterEqual(len(set(p.locator('.garden-visitor').evaluate_all('(els)=>els.map(e=>e.dataset.activity)'))),3)
  self.assertEqual(p.locator('.activity-prop svg').count(),p.locator('.garden-visitor').count())
  moved=False
  for _ in range(8):
   before=p.locator('.garden-visitor').evaluate_all('(els)=>Object.fromEntries(els.map(e=>{let r=e.querySelector(".visitor-travel").getBoundingClientRect();return [e.dataset.seat,{x:r.x,y:r.y}]}))')
   p.clock.run_for(1000)
   after=p.locator('.garden-visitor').evaluate_all('(els)=>Object.fromEntries(els.map(e=>{let r=e.querySelector(".visitor-travel").getBoundingClientRect();return [e.dataset.seat,{x:r.x,y:r.y}]}))')
   moved=moved or any(k in after and abs(after[k]['x']-v['x'])>2 for k,v in before.items())
  self.assertTrue(moved);self.assertEqual(p.errors,[])
 def test_life_and_plants_freeze_during_teacher_pause(self):
  p=self.open();self.begin(p,spawn=1);p.clock.run_for(18000);p.click('#garden-pause')
  before=p.locator('.garden-visitor').evaluate_all('(els)=>els.map(e=>[e.dataset.seat,e.dataset.activity,e.style.getPropertyValue("--life-x"),e.style.getPropertyValue("--life-y")])')
  plants=p.locator('#garden-blooms').inner_html();p.clock.run_for(12000)
  after=p.locator('.garden-visitor').evaluate_all('(els)=>els.map(e=>[e.dataset.seat,e.dataset.activity,e.style.getPropertyValue("--life-x"),e.style.getPropertyValue("--life-y")])')
  self.assertEqual(before,after);self.assertEqual(plants,p.locator('#garden-blooms').inner_html())
 def test_flowers_grow_in_place_and_keep_adding(self):
  p=self.open();self.begin(p,spawn=1);p.clock.run_for(7000)
  self.assertEqual(p.locator('.garden-flower').count(),1);self.assertEqual(p.locator('.garden-flower').first.get_attribute('data-growth'),'sprout');p.evaluate('window.firstPlant=document.querySelector(".garden-flower")')
  p.clock.run_for(4000);self.assertEqual(p.locator('.garden-flower').first.get_attribute('data-growth'),'bud')
  p.clock.run_for(4000);self.assertEqual(p.locator('.garden-flower').first.get_attribute('data-growth'),'bloom');self.assertEqual(p.locator('.garden-flower').count(),2)
  self.assertTrue(p.evaluate('window.firstPlant===document.querySelector(".garden-flower")'))
 def test_reduced_motion_keeps_life_positions_still(self):
  p=self.open();p.emulate_media(reduced_motion='reduce');self.begin(p,spawn=1);p.clock.run_for(30000)
  self.assertGreater(p.locator('.activity-prop svg').count(),0)
  self.assertTrue(p.locator('.garden-visitor').evaluate_all('(els)=>els.every(e=>Math.abs(parseFloat(e.style.getPropertyValue("--life-x"))||0)<.01)'))
 def test_life_travel_stays_clear_of_other_visitors_and_hud(self):
  for width in [1366,1024,640,390]:
   with self.subTest(width=width):
    p=self.open(width);self.begin(p,spawn=1);p.clock.run_for(45000)
    rects=p.locator('.visitor-travel').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})')
    obs=p.locator('.garden-meter,.garden-next,.scene-caption').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})')
    overlap=lambda a,b:min(a['right'],b['right'])-max(a['x'],b['x'])>1 and min(a['bottom'],b['bottom'])-max(a['y'],b['y'])>1
    self.assertFalse(any(overlap(a,b) for i,a in enumerate(rects) for b in rects[i+1:]))
    self.assertFalse(any(overlap(a,b) for a in rects for b in obs))
    self.assertTrue(all(r['x']>=0 and r['right']<=width for r in rects));self.assertEqual(p.errors,[])
 def test_first_upgrade_adds_a_visible_meadow(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(6000)
  self.assertEqual(p.locator('.garden-meadow-patch').count(),0);p.clock.run_for(1500)
  self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),'1');self.assertEqual(p.locator('.garden-meadow-patch').count(),4)
 def test_no_signal_stops_plants_and_scene_butterflies(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(24000)
  self.assertGreater(p.locator('.garden-butterfly').count(),0);self.assertGreater(p.locator('.garden-flower[data-growth=bloom]').count(),0)
  p.evaluate('window.micLevel=0');p.clock.run_for(500)
  self.assertEqual(p.locator('.garden-butterfly').first.evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')
  self.assertEqual(p.locator('.garden-flower[data-growth=bloom]>svg').first.evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')

if __name__=='__main__':unittest.main()
