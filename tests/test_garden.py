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
  child=pop.value;child.errors=[];child.on('pageerror',lambda e:child.errors.append(str(e)));child.wait_for_load_state('domcontentloaded')
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
 def test_meter_and_next_visitor_countdown_hold_without_retreat(self):
  p=self.open(direct=True);self.assertEqual(p.locator('#garden-level').count(),1)
  p.click('#garden-demo');p.fill('#garden-spawn-seconds','2');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(3000)
  self.assertEqual(p.locator('.garden-visitor').count(),1);before=p.inner_text('#garden-next-seconds')
  p.evaluate('window.micLevel=.1');p.clock.run_for(500);self.assertIn('暫停',p.inner_text('#garden-meter-status'));p.clock.run_for(1000);self.assertEqual(p.inner_text('#garden-next-seconds'),before)
  self.assertEqual(p.locator('.visitor-body').first.evaluate('(e)=>getComputedStyle(e).animationPlayState'),'paused')
  p.clock.run_for(2000);self.assertEqual(p.locator('.garden-visitor').count(),1)
  p.evaluate('window.micLevel=.001');p.clock.run_for(3500);self.assertEqual(p.locator('.garden-visitor').count(),2)
 def test_direct_detection_keeps_running_and_has_visible_elapsed_time(self):
  p=self.open(direct=True);p.click('#garden-demo');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(125000)
  self.assertEqual(p.locator('body').get_attribute('data-phase'),'running');self.assertEqual(p.inner_text('#garden-clock'),'02:05');self.assertIn('已偵測',p.inner_text('#garden-clock-label'))
 def test_full_class_unlocks_animated_garden_changes(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(38000)
  self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),'7');self.assertGreater(p.locator('.garden-butterfly').count(),0);self.assertGreater(p.locator('.garden-star').count(),0)
  self.assertIn('月光',p.inner_text('#garden-stage-label'));self.assertNotEqual(p.locator('.visitor-body').first.evaluate('(e)=>getComputedStyle(e).animationName'),'visitor-breathe')
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
  p.clock.run_for(4000);self.assertEqual(p.locator('.garden-flower').first.get_attribute('data-growth'),'bud');self.assertEqual(p.locator('.garden-flower').count(),2)
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
 def test_avatars_are_grounded_and_never_stand_in_the_pond(self):
  for width in [1366,1024,640,390]:
   with self.subTest(width=width):
    p=self.open(width);self.begin(p,spawn=1);p.clock.run_for(45000)
    self.assertEqual(p.locator('.ground-shadow').count(),31)
    data=p.locator('.ground-shadow').evaluate_all('(els)=>{let s=document.getElementById("garden-scene").getBoundingClientRect();return els.map(e=>{let r=e.getBoundingClientRect();return {x:(r.x+r.width/2-s.x)/s.width,y:(r.y+r.height/2-s.y)/s.height}})}')
    self.assertTrue(all(d['y']>=.44 and d['y']<=.9 for d in data));self.assertTrue(all(not(d['x']>.69 and d['y']<.61) for d in data))

 def test_eight_stage_painting_has_seven_unlocks_and_bounded_night(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'")
  self.assertTrue(p.evaluate('!!window.GardenPainting'), 'new painting renderer must be loaded')
  p.clock.run_for(2500)
  for stage in range(8):
   self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),str(stage))
   self.assertIn(str(stage+1)+'/8',p.inner_text('#garden-stage-label'))
   if stage<7:p.clock.run_for(5000)
  self.assertEqual(p.locator('.garden-butterfly').count(),3);self.assertEqual(p.locator('.garden-star').count(),12);self.assertEqual(p.locator('.garden-firefly').count(),5)
  plants=p.locator('.garden-flower').count();p.clock.run_for(60000)
  self.assertEqual(p.locator('.garden-flower').count(),plants);self.assertEqual(p.locator('.garden-star').count(),12);self.assertIn('新發現',p.inner_text('#garden-stage-label'));self.assertEqual(p.errors,[])
 def test_history_labels_legacy_four_stages_without_remapping(self):
  p=self.open();p.evaluate("localStorage.setItem('c408_garden_history',JSON.stringify([{at:'2026-11-01',visitors:[],stage:3},{at:'2026-11-02',visitors:[]},{at:'2026-11-03',visitors:[],schema:2,stageScheme:'garden-painting-8-v1',stageIndex:7,stageTotal:8,stageName:'月光成畫'}]))")
  p.reload();p.click('#garden-history-button');cards=p.locator('#garden-history article')
  self.assertIn('星光',cards.nth(0).inner_text());self.assertIn('4/4',cards.nth(0).inner_text());self.assertIn('未記錄階段',cards.nth(1).inner_text());self.assertIn('月光成畫',cards.nth(2).inner_text());self.assertIn('8/8',cards.nth(2).inner_text())
 def test_painting_png_download_has_no_hud_and_optional_seat_labels(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(5000)
  self.assertTrue(p.evaluate('!!window.GardenPainting'), 'PNG renderer must be loaded')
  no=p.evaluate('GardenPainting.capture(document.getElementById("garden-scene"),false)');yes=p.evaluate('GardenPainting.capture(document.getElementById("garden-scene"),true)')
  self.assertNotIn('教室音量',no);self.assertNotIn('foreignObject',no);self.assertNotIn('http://127.0.0.1',no);self.assertNotIn('<text',no);self.assertIn('<text',yes)
  with p.expect_download() as download:p.click('#garden-save')
  d=download.value;self.assertTrue(d.suggested_filename.endswith('.png'));self.assertIsNone(d.failure());self.assertIn('下載',p.inner_text('#garden-save-status'))
  from PIL import Image
  with Image.open(d.path()) as image:self.assertEqual(image.format,'PNG');self.assertGreater(image.width,300);self.assertGreater(image.height,300);self.assertGreater(sum(image.convert('RGB').getpixel((10,10))),150,'exported sky gradient must retain its colors')
 def test_finished_painting_retries_download_even_when_history_storage_full(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(5000)
  self.assertTrue(p.evaluate('!!window.GardenPainting'), 'PNG renderer must be loaded')
  p.evaluate("() => {window.goodPng=GardenPainting.toPng;GardenPainting.toPng=async()=>{throw Error('test canvas failure')};Storage.prototype.setItem=function(){throw Error('QuotaExceededError')}}")
  p.on('dialog',lambda d:d.accept());p.click('#garden-end');self.assertEqual(p.locator('body').get_attribute('data-phase'),'ended');self.assertTrue(p.is_enabled('#garden-save'))
  p.click('#garden-save');p.wait_for_function("document.getElementById('garden-save-status').textContent.includes('重試')");self.assertEqual(p.locator('body').get_attribute('data-phase'),'ended')
  p.evaluate('() => {GardenPainting.toPng=window.goodPng}')
  with p.expect_download() as download:p.click('#garden-save')
  self.assertIsNone(download.value.failure());self.assertEqual(p.locator('body').get_attribute('data-phase'),'ended')
 def test_ended_record_marks_eight_stage_scheme_and_new_garden_clears_art(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(5000);p.on('dialog',lambda d:d.accept());p.click('#garden-end')
  h=p.evaluate("JSON.parse(localStorage.getItem('c408_garden_history'))[0]")
  self.assertEqual(h.get('schema'),3);self.assertEqual(h.get('stageScheme'),'garden-living-8-v1');self.assertEqual(h.get('stageIndex'),0);self.assertEqual(h.get('stageTotal'),8);self.assertEqual(h.get('stageName'),'夥伴入園')
  self.assertIn('保存',p.inner_text('#garden-finish'));p.click('#garden-again');self.assertTrue(p.is_disabled('#garden-save'));self.assertEqual(p.locator('.garden-visitor').count(),0)

 def test_ended_painting_remains_frozen_after_roster_refresh(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.on('dialog',lambda d:d.accept());p.click('#garden-end')
  before=p.locator('#garden-visitors').inner_html();parent.evaluate('window.currentAvatar=23')
  self.assertTrue(p.is_disabled('#garden-refresh'),'ended artwork must stay frozen until next activity')
  p.clock.run_for(20000);self.assertEqual(p.locator('#garden-visitors').inner_html(),before)

 def test_scene_color_transitions_freeze_and_resume_with_life(self):
  p=self.open(direct=True)
  self.assertTrue(p.evaluate("typeof GardenPainting.setActive==='function'"),'stage transitions need the shared pause control')
  p.evaluate("() => {let s=document.getElementById('garden-scene');GardenPainting.update(s,6);GardenPainting.setActive(s,true)}")
  p.wait_for_timeout(180)
  p.evaluate("GardenPainting.setActive(document.getElementById('garden-scene'),false)");p.wait_for_timeout(60)
  color=p.locator('.sky-stop').first.evaluate('(e)=>getComputedStyle(e).stopColor');p.wait_for_timeout(350)
  self.assertEqual(p.locator('.sky-stop').first.evaluate('(e)=>getComputedStyle(e).stopColor'),color)
  p.evaluate("GardenPainting.setActive(document.getElementById('garden-scene'),true)");p.wait_for_timeout(250)
  self.assertNotEqual(p.locator('.sky-stop').first.evaluate('(e)=>getComputedStyle(e).stopColor'),color)

 def test_new_garden_resets_night_immediately_while_idle(self):
  p=self.open(direct=True);p.evaluate("() => {let s=document.getElementById('garden-scene');GardenPainting.update(s,7);GardenPainting.setActive(s,true);s.getAnimations({subtree:true}).filter(a=>a instanceof CSSTransition).forEach(a=>a.finish());}")
  p.click('#garden-demo')
  self.assertEqual(p.locator('.moon').evaluate('(e)=>getComputedStyle(e).opacity'),'0')
  self.assertEqual(p.locator('[data-layer="pond"]').evaluate('(e)=>getComputedStyle(e).opacity'),'0')

 def test_moon_is_visible_clear_of_volume_and_countdown_panels(self):
  for width in [1366,390]:
   with self.subTest(width=width):
    p=self.open(width,direct=True);p.evaluate("GardenPainting.update(document.getElementById('garden-scene'),7,true)")
    moon=p.locator('.moon').bounding_box();panels=p.locator('.garden-meter,.garden-next').all()
    for panel in panels:
     b=panel.bounding_box();self.assertFalse(min(moon['x']+moon['width'],b['x']+b['width'])>max(moon['x'],b['x']) and min(moon['y']+moon['height'],b['y']+b['height'])>max(moon['y'],b['y']),'moon should remain visible beside the HUD')

 def test_finished_art_can_be_saved_without_leaving_fullscreen(self):
  p=self.open();self.begin(p,spawn=1);p.click('#garden-fullscreen');p.wait_for_function('!!document.fullscreenElement');p.clock.run_for(60000)
  self.assertEqual(p.locator('#garden-finish-save').count(),1,'fullscreen finish card needs its own save shortcut');self.assertTrue(p.is_visible('#garden-finish-save'))
  with p.expect_download() as download:p.click('#garden-finish-save')
  self.assertIsNone(download.value.failure());self.assertIn('下載',p.inner_text('#garden-finish-save-status'))

 def test_saved_vector_preserves_reflected_props_and_swaying_plant_geometry(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(17000);p.click('#garden-pause')
  errors=p.evaluate("""() => {
   let scene=document.getElementById('garden-scene'),bounds=scene.getBoundingClientRect(),prop=scene.querySelector('.activity-prop svg'),plant=scene.querySelector('.garden-flower svg');
   prop.style.transform='scaleX(-1)';plant.style.transform='rotate(9deg)';let propShape=prop.querySelector('path,ellipse,circle'),plantShape=plant.querySelector('path');propShape.id='geometry-prop';plantShape.id='geometry-plant';
   let originals=[propShape,plantShape].map(e=>{let r=e.getBoundingClientRect();return {x:r.x-bounds.x,y:r.y-bounds.y,w:r.width,h:r.height}});
   let holder=document.createElement('div');holder.style.cssText='position:fixed;left:0;top:0;width:'+scene.clientWidth+'px;height:'+scene.clientHeight+'px;z-index:1000';holder.innerHTML=GardenPainting.capture(scene,false);document.body.appendChild(holder);
   let differences=['geometry-prop','geometry-plant'].map((id,i)=>{let r=holder.querySelector('#'+id).getBoundingClientRect(),a=originals[i];return Math.max(Math.abs(r.x-a.x),Math.abs(r.y-a.y),Math.abs(r.width-a.w),Math.abs(r.height-a.h))});holder.remove();return differences;
  }""")
  self.assertTrue(all(e<1 for e in errors),f'PNG vector geometry diverged from scene: {errors}')

 def test_continuing_scene_renderer_is_available(self):
  p=self.open(direct=True);self.assertTrue(p.evaluate("!!window.GardenFixtures"),"continuing scenery must be loaded")

 def test_first_discovery_adds_fountain_and_basketball_after_eight_stages(self):
  parent,p=self.cloud_pair();p.emulate_media(reduced_motion='reduce');p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'")
  self.assertTrue(p.evaluate('!!window.GardenFixtures'),'continuing scenery must be loaded')
  p.clock.run_for(38000);self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),'7');self.assertEqual(p.locator('[data-fixture="bridge"]').count(),1)
  p.clock.run_for(5000);self.assertEqual(p.locator('[data-fixture="fountain"]').count(),1);self.assertIn('新發現 1',p.inner_text('#garden-stage-label'));self.assertIn('噴水池',p.inner_text('#garden-stage-label'))
  self.assertGreater(p.locator('[data-activity="basketball"]').count(),0);self.assertLessEqual(p.locator('[data-life-presenting="true"]').count(),2)
  p.clock.run_for(20000);self.assertNotEqual(p.locator('.garden-fixture').last.get_attribute('data-fixture'),'fountain');self.assertEqual(p.errors,[])
 def test_fixture_fade_freezes_on_noise_and_teacher_pause(self):
  parent,p=self.cloud_pair();p.select_option('#garden-session-mode','direct');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(44000)
  self.assertTrue(p.evaluate('!!window.GardenFixtures'))
  self.assertEqual(p.locator('.garden-fixture').count(),2);p.evaluate('window.micLevel=.1');p.clock.run_for(500)
  before=p.locator('.garden-fixture').evaluate_all('(els)=>els.map(e=>[e.dataset.fixture,e.style.opacity])');p.clock.run_for(1000);self.assertEqual(p.locator('.garden-fixture').evaluate_all('(els)=>els.map(e=>[e.dataset.fixture,e.style.opacity])'),before)
  p.click('#garden-pause');p.clock.run_for(12000);self.assertEqual(p.locator('.garden-fixture').evaluate_all('(els)=>els.map(e=>[e.dataset.fixture,e.style.opacity])'),before)
  p.evaluate('window.micLevel=.001');p.click('#garden-pause');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(5000);self.assertEqual(p.locator('.garden-fixture').count(),2);p.clock.run_for(1000);self.assertEqual(p.locator('.garden-fixture').count(),1)
 def test_two_hundred_discoveries_keep_one_primary_scene_and_fixed_decorations(self):
  p=self.open(direct=True);self.assertTrue(p.evaluate('!!window.GardenDiscoveries'))
  results=p.evaluate("""() => {let s=document.getElementById('garden-scene'),d=new GardenDiscoveries.Session({random:()=>.37}),seen=new Set(),maximum=0;for(let i=1;i<=200;i++){let state=d.sync(i,[1,2,3]);GardenPainting.update(s,7,true,{discovery:state,dt:0,active:false,reduced:true});let groups=s.querySelectorAll('.garden-fixture');maximum=Math.max(maximum,groups.length);groups.forEach(g=>seen.add(g.dataset.fixture));}return {maximum,themes:[...seen],stars:s.querySelectorAll('.garden-star').length,flies:s.querySelectorAll('.garden-firefly').length,jets:s.querySelectorAll('.fixture-jet').length,birds:s.querySelectorAll('.fixture-bird').length};}""")
  self.assertEqual(results['maximum'],1);self.assertEqual(len(results['themes']),6);self.assertEqual(results['stars'],12);self.assertEqual(results['flies'],5);self.assertLessEqual(results['jets'],3);self.assertLessEqual(results['birds'],2)
 def test_all_primary_scenes_and_new_props_can_be_saved_to_png(self):
  p=self.open(direct=True);self.assertTrue(p.evaluate('!!window.GardenFixtures'))
  result=p.evaluate("""async () => {let s=document.getElementById('garden-scene'),sizes=[];for(let theme of GardenDiscoveries.themes){GardenPainting.update(s,7,true,{discovery:{themeId:theme.id},active:false,reduced:true,dt:0});let svg=GardenPainting.capture(s,false);let blob=await GardenPainting.toPng(svg);sizes.push(blob.size);if(!svg.includes('data-fixture="'+theme.id+'"'))throw Error('missing theme');}for(let a of GardenDiscoveries.activities){let host=document.createElement('div');host.className='garden-visitor';host.style.cssText='left:30%;top:65%;width:52px';host.innerHTML='<div class="visitor-travel"><span class="ground-shadow"></span><span class="activity-prop">'+GardenActivities.propSvg(a.id,2)+'</span><div class="visitor-body">'+c408PointAvatars.svg(8)+'</div><small>01號</small></div>';document.getElementById('garden-visitors').appendChild(host);let blob=await GardenPainting.toPng(GardenPainting.capture(s,true));sizes.push(blob.size);host.remove();}return sizes;}""")
  self.assertEqual(len(result),14);self.assertTrue(all(size>1000 for size in result))
 def test_new_discovery_summary_does_not_relabel_old_blessings(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(73000);p.on('dialog',lambda d:d.accept());p.click('#garden-end')
  record=p.evaluate("JSON.parse(localStorage.getItem('c408_garden_history'))[0]");self.assertEqual(record.get('schema'),3);self.assertEqual(record.get('discovery',{}).get('count'),1);self.assertEqual(record['discovery']['themeId'],'fountain')
  p.evaluate("() => {let list=JSON.parse(localStorage.getItem('c408_garden_history'));list.push({at:'2026-11-05',visitors:[],schema:2,stageScheme:'garden-painting-8-v1',stageIndex:7,stageName:'月光成畫',celebrations:4});localStorage.setItem('c408_garden_history',JSON.stringify(list));}")
  p.click('#garden-history-button');cards=p.locator('#garden-history article');self.assertIn('新發現 1',cards.first.inner_text());self.assertIn('噴水池',cards.first.inner_text());self.assertIn('4 次祝福',cards.last.inner_text());self.assertNotIn('新發現',cards.last.inner_text());self.assertNotIn('超標',cards.last.inner_text())

 def test_unlocked_props_fit_full_class_and_100_students_at_four_widths(self):
  for width in [1366,1024,640,390]:
   with self.subTest(width=width):
    p=self.open(width,direct=True);p.evaluate("localStorage.setItem('c408_garden_roster',JSON.stringify({roster:Array.from({length:100},(_,i)=>({seat:i+1,avatar:i%24}))}))");p.reload();p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(178000)
    self.assertEqual(p.locator('.garden-visitor').count(),100);self.assertEqual(p.locator('#garden-scene').get_attribute('data-stage'),'7');self.assertLessEqual(p.locator('.garden-fixture').count(),2)
    issues=p.evaluate("""() => {let scene=document.getElementById('garden-scene').getBoundingClientRect(),labels=[...document.querySelectorAll('.visitor-travel>small')].map(e=>e.getBoundingClientRect()),hud=[...document.querySelectorAll('.garden-hud,.scene-caption')].map(e=>e.getBoundingClientRect()),errors=[];let overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;document.querySelectorAll('.activity-prop svg').forEach(svg=>{svg.querySelectorAll('path,circle,ellipse,rect,polygon,line,polyline').forEach(e=>{let r=e.getBoundingClientRect();if(r.width<.1||r.height<.1)return;if(r.left<scene.left-1||r.right>scene.right+1||r.top<scene.top-1||r.bottom>scene.bottom+1||hud.some(b=>overlap(r,b))||labels.some(b=>overlap(r,b)))errors.push({activity:svg.closest('.garden-visitor').dataset.activity,x:r.x,y:r.y,w:r.width,h:r.height});});});return errors.slice(0,5);}""")
    self.assertEqual(issues,[]);self.assertEqual(p.errors,[])
 def test_fixture_individual_rotation_and_translation_survive_vector_export(self):
  p=self.open(direct=True)
  for theme,selector in [('windmill','.fixture-blades path'),('birdbath','.fixture-bird ellipse')]:
   with self.subTest(theme=theme):
    p.evaluate("theme=>GardenPainting.update(document.getElementById('garden-scene'),7,true,{discovery:{themeId:theme},active:false,reduced:true,dt:0})",theme)
    error=p.evaluate("""selector => {let scene=document.getElementById('garden-scene'),shape=scene.querySelector(selector),moving=shape.parentElement;moving.style.rotate='21deg';moving.style.translate='2px -3px';shape.id='fixture-export-geometry';let b=scene.getBoundingClientRect(),a=shape.getBoundingClientRect(),holder=document.createElement('div');holder.style.cssText='position:fixed;top:0;left:0';holder.innerHTML=GardenPainting.capture(scene,false);document.body.appendChild(holder);let r=holder.querySelector('#fixture-export-geometry').getBoundingClientRect(),error=Math.max(Math.abs(r.x-(a.x-b.x)),Math.abs(r.y-(a.y-b.y)),Math.abs(r.width-a.width),Math.abs(r.height-a.height));holder.remove();shape.removeAttribute('id');return error;}""",selector)
    self.assertLess(error,1)

 def test_handheld_balls_are_large_enough_to_recognize(self):
  p=self.open(direct=True);p.emulate_media(reduced_motion='reduce');p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.click('#garden-pause')
  for activity,minimum in [('basketball',.22),('soccer',.19),('volleyball',.22)]:
   with self.subTest(activity=activity):
    ratio=p.evaluate("""activity => {let n=document.querySelector('.garden-visitor');n.dataset.activity=activity;n.querySelector('.activity-prop').innerHTML=GardenActivities.propSvg(activity,0);return n.querySelector('.activity-prop circle').getBoundingClientRect().width/n.querySelector('.visitor-body svg').getBoundingClientRect().width;}""",activity)
    self.assertGreater(ratio,minimum,'held balls should be recognizable at classroom projection size')

 def test_noise_feedback_is_immediate_and_quiet_cannot_end_two_second_hold_early(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000)
  self.assertEqual(p.locator('#garden-noise-feedback').count(),1,'visible two-second feedback must be available')
  count=p.locator('.garden-visitor').count();p.evaluate('window.micLevel=.1');p.clock.run_for(100);self.assertTrue(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.inner_text('#garden-noise-count'),'②')
  p.evaluate('window.micLevel=.001');p.clock.run_for(1000);self.assertTrue(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.inner_text('#garden-noise-count'),'①');self.assertEqual(p.locator('.garden-visitor').count(),count);self.assertEqual(p.locator('#garden-scene').get_attribute('data-life-active'),'false')
  p.clock.run_for(1100);self.assertFalse(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.locator('#garden-scene').get_attribute('data-life-active'),'true');self.assertGreater(p.evaluate('window.micRequests'),0)
 def test_long_noise_never_removes_companions_or_loses_discoveries(self):
  p=self.open(direct=True);p.emulate_media(reduced_motion='reduce');p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.fill('#garden-upgrade-seconds','5');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(73000)
  self.assertEqual(p.locator('#garden-loud-seconds').count(),0);before=p.inner_text('#garden-stage-label');p.evaluate('window.micLevel=.1');p.clock.run_for(3000)
  self.assertTrue(p.is_visible('#garden-noise-feedback'));self.assertIn('放輕聲音',p.inner_text('#garden-noise-title'));p.clock.run_for(30000);self.assertEqual(p.locator('.garden-visitor').count(),31);self.assertEqual(p.inner_text('#garden-stage-label'),before);self.assertEqual(p.evaluate('window.stoppedTracks'),0)
  level=p.inner_text('#garden-level');p.evaluate('window.micLevel=.2');p.clock.run_for(500);self.assertNotEqual(p.inner_text('#garden-level'),level)
  p.evaluate('window.micLevel=.001');p.clock.run_for(2100);self.assertFalse(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.locator('.garden-visitor').count(),31)
 def test_noise_banner_fits_between_hud_and_people_at_four_widths(self):
  for width in [1366,1024,640,390]:
   with self.subTest(width=width):
    p=self.open(width,direct=True);p.set_viewport_size({'width':width,'height':600});p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(32000);p.evaluate('window.micLevel=.1');p.clock.run_for(200)
    self.assertTrue(p.is_visible('#garden-noise-feedback'))
    data=p.evaluate("""() => {let a=document.querySelector('.noise-banner').getBoundingClientRect(),items=[...document.querySelectorAll('.garden-meter,.garden-next,.visitor-body,.scene-caption')].map(e=>e.getBoundingClientRect()),overlap=b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;return {inside:a.left>=0&&a.right<=innerWidth,overlap:items.some(overlap)};}""");self.assertTrue(data['inside']);self.assertFalse(data['overlap']);self.assertEqual(p.errors,[])
 def test_teacher_pause_preserves_hold_and_png_excludes_feedback(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.evaluate('window.micLevel=.1');p.clock.run_for(100);p.evaluate('window.micLevel=.001');p.clock.run_for(500);p.click('#garden-pause')
  self.assertFalse(p.is_visible('#garden-noise-feedback'));p.clock.run_for(10000);p.click('#garden-pause');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(1000);self.assertTrue(p.is_visible('#garden-noise-feedback'))
  svg=p.evaluate('GardenPainting.capture(document.getElementById("garden-scene"),false)');self.assertNotIn('音量超標',svg);self.assertNotIn('noise-banner',svg)
  with p.expect_download() as download:p.click('#garden-save')
  self.assertIsNone(download.value.failure());p.clock.run_for(600);self.assertFalse(p.is_visible('#garden-noise-feedback'))

 def test_noise_feedback_keeps_100_people_and_clears_on_new_session(self):
  p=self.open(390,direct=True);p.set_viewport_size({'width':390,'height':600});p.evaluate("localStorage.setItem('c408_garden_roster',JSON.stringify({roster:Array.from({length:100},(_,i)=>({seat:i+1,avatar:i%24}))}))");p.reload();p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(102000);p.evaluate('window.micLevel=.1');p.clock.run_for(3000)
  self.assertEqual(p.locator('.garden-visitor').count(),100);self.assertTrue(p.is_visible('#garden-noise-feedback'))
  overlap=p.evaluate("""() => {let a=document.querySelector('.noise-banner').getBoundingClientRect();return [...document.querySelectorAll('.visitor-body,.garden-meter,.garden-next')].some(e=>{let b=e.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;});}""");self.assertFalse(overlap)
  p.on('dialog',lambda d:d.accept());p.click('#garden-end');self.assertFalse(p.is_visible('#garden-noise-feedback'));p.click('#garden-again');self.assertFalse(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.locator('.garden-visitor').count(),0);self.assertEqual(p.locator('#garden-scene').get_attribute('data-noise-stopped'),'false')
 def test_old_loud_seconds_setting_cannot_change_fixed_two_second_policy(self):
  p=self.open(direct=True);p.evaluate("localStorage.setItem('c408_garden_settings',JSON.stringify({loud:60,spawn:1,upgrade:5}))");p.reload();p.click('#garden-demo');self.assertEqual(p.locator('#garden-loud-seconds').count(),0);p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.evaluate('window.micLevel=.1');p.clock.run_for(100);p.evaluate('window.micLevel=.001');p.clock.run_for(2100);self.assertFalse(p.is_visible('#garden-noise-feedback'));self.assertNotIn('loud',p.evaluate("JSON.parse(localStorage.getItem('c408_garden_settings'))"))

 def test_center_noise_text_and_width_stay_fixed_while_countdown_remains(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.evaluate('window.micLevel=.1');p.clock.run_for(100)
  original=p.locator('.noise-copy').inner_text();self.assertIn('放輕聲音',original);self.assertEqual(p.inner_text('#garden-noise-count'),'②')
  rect=p.locator('.noise-copy').bounding_box();p.evaluate('window.micLevel=.001');p.clock.run_for(1000);self.assertEqual(p.inner_text('#garden-noise-count'),'①');self.assertEqual(p.locator('.noise-copy').inner_text(),original)
  p.evaluate('window.micLevel=.1');p.clock.run_for(1500);self.assertEqual(p.locator('.noise-copy').inner_text(),original);self.assertEqual(p.inner_text('#garden-noise-count'),'①');self.assertTrue(p.is_visible('#garden-noise-count'));after=p.locator('.noise-copy').bounding_box();self.assertAlmostEqual(rect['x'],after['x'],delta=.5);self.assertAlmostEqual(rect['width'],after['width'],delta=.5);self.assertAlmostEqual(rect['y'],after['y'],delta=.5);self.assertAlmostEqual(rect['height'],after['height'],delta=.5)
  p.evaluate('window.micLevel=.001');p.clock.run_for(1100);self.assertFalse(p.is_visible('#garden-noise-feedback'))

 def test_two_second_recovery_countdown_pauses_during_any_renewed_noise(self):
  p=self.open(direct=True);p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000);p.evaluate('window.micLevel=.1');p.clock.run_for(3100)
  self.assertEqual(p.inner_text('#garden-noise-count'),'②');text=p.locator('.noise-copy').inner_text();count=p.locator('.garden-visitor').count()
  p.evaluate('window.micLevel=.001');p.clock.run_for(1000);self.assertEqual(p.inner_text('#garden-noise-count'),'①')
  p.evaluate('window.micLevel=.1');p.clock.run_for(3000);self.assertEqual(p.inner_text('#garden-noise-count'),'①');self.assertTrue(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.locator('.garden-visitor').count(),count);self.assertEqual(p.locator('.noise-copy').inner_text(),text)
  p.evaluate('window.micLevel=.001');p.clock.run_for(1100);self.assertFalse(p.is_visible('#garden-noise-feedback'));self.assertEqual(p.locator('#garden-scene').get_attribute('data-life-active'),'true')

 def test_round_noise_count_is_visible_saved_and_reset_without_counting_continuous_noise(self):
  p=self.open(direct=True);self.assertEqual(p.locator('#garden-noise-total').count(),1,'round noise count must be visible');self.assertEqual(p.inner_text('#garden-noise-total'),'0');p.click('#garden-demo');p.fill('#garden-spawn-seconds','1');p.clock.install();p.click('#garden-start');p.wait_for_function("document.body.dataset.phase==='running'");p.clock.run_for(4000)
  p.evaluate('window.micLevel=.1');p.clock.run_for(3100);self.assertEqual(p.inner_text('#garden-noise-total'),'1');self.assertEqual(p.inner_text('#garden-noise-count'),'②')
  p.evaluate('window.micLevel=.001');p.clock.run_for(500);p.evaluate('window.micLevel=.1');p.clock.run_for(1500);self.assertEqual(p.inner_text('#garden-noise-total'),'2');p.clock.run_for(5000);self.assertEqual(p.inner_text('#garden-noise-total'),'2')
  p.on('dialog',lambda d:d.accept());p.click('#garden-end');self.assertIn('超標 2 次',p.inner_text('#garden-result'));h=p.evaluate("JSON.parse(localStorage.getItem('c408_garden_history'))[0]");self.assertEqual(h.get('noiseCount'),2)
  p.click('#garden-history-button');self.assertIn('超標 2 次',p.locator('#garden-history article').first.inner_text());p.click('#garden-again');self.assertEqual(p.inner_text('#garden-noise-total'),'0')

if __name__=='__main__':unittest.main()
