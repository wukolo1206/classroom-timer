(function () {
    'use strict';
    var $=function(id){return document.getElementById(id);}, engine=window.SecretGarden;
    var params=new URLSearchParams(location.hash.slice(1)), channel=params.get('channel'), parentOrigin=params.get('parent');
    var source=new URLSearchParams(location.search).get('source')==='universal'?'universal':'c408';
    var prefix=source==='universal'?'ctu_garden_':'c408_garden_';
    var roster=[], model=null, media=null, openingMedia=null, phase='idle', demo=false, fresh=false, pending=null, requestSeq=0, operation=0, tickTimer=null, lastTick=0, silentMs=0, archived=false, renderKey=null;
    var cfg={minutes:10,study:50,discuss:65,session:'direct',spawn:15,upgrade:30},lastLevel=null,wildlifeKey='',discoveries=new window.GardenDiscoveries.Session(),discovery=null;
    var lifeView=new window.GardenLife.View($('garden-visitors'),$('garden-blooms'),$('garden-meadow')),reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)'),grounded=null,finishedArt=null,saving=false,archiveSaved=false;
    window.GardenPainting.mount($('garden-scene'));
    function read(key,fallback){try{var v=JSON.parse(localStorage.getItem(prefix+key));return v===null?fallback:v;}catch(e){return fallback;}}
    function write(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));return true;}catch(e){message('這台瀏覽器無法保存收藏；本次仍可繼續。',true);return false;}}
    function message(text,error){$('garden-message').textContent=text;$('garden-message').dataset.error=error?'true':'false';}
    function allowedParent(origin){try{var u=new URL(origin);return origin===location.origin||(u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname.endsWith('.googleusercontent.com')));}catch(e){return false;}}
    function hasParent(){return !!(window.opener&&!window.opener.closed&&channel&&/^[a-f0-9]{32}$/.test(channel)&&allowedParent(parentOrigin));}
    function requestRoster(){
        if(demo)return Promise.resolve(roster);
        if(!hasParent())return Promise.reject(Error('請保留原班級頁面，並由那裡的「音量計 → 班級祕密花園」重新開啟，才能更新目前頭像。'));
        if(pending)return pending.promise;
        var id=String(++requestSeq), resolve, reject;
        var promise=new Promise(function(a,b){resolve=a;reject=b;});
        var timer=setTimeout(function(){if(pending&&pending.id===id){pending=null;reject(Error('更新逾時，請確認原班級頁面仍開啟，再試一次。'));}},15000);
        pending={id:id,promise:promise,resolve:resolve,reject:reject,timer:timer};
        renderWelcome();
        window.opener.postMessage({type:'garden:request',channel:channel,requestId:id},parentOrigin);
        return promise;
    }
    window.addEventListener('message',function(e){
        var d=e.data;if(!pending||e.source!==window.opener||e.origin!==parentOrigin||!d||d.type!=='garden:roster'||d.channel!==channel||d.requestId!==pending.id)return;
        var p=pending;pending=null;clearTimeout(p.timer);
        try{if(d.error)throw Error(d.error);var list=engine.cleanRoster(d.roster);if(phase==='ended'){write('roster',{roster:list,readAt:d.readAt});p.resolve(list);return;}fresh=true;roster=list;if(model)model.refresh(list);write('roster',{roster:list,readAt:d.readAt});$('garden-source').textContent=(source==='universal'?'本機班級':'目前計分頭像')+' · 已更新 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})+' · '+list.length+' 位夥伴';renderKey=null;render();p.resolve(list);}catch(err){fresh=false;p.reject(err);}
    });
    function setPhase(next){phase=next;document.body.dataset.phase=phase;var busy=phase==='opening'||phase==='running'||phase==='paused';$('garden-start').disabled=busy;$('garden-welcome-start').disabled=busy;$('garden-class-retry').disabled=busy||!!pending;$('garden-demo').disabled=busy;$('garden-end').disabled=!busy||phase==='opening';$('garden-refresh').disabled=phase==='ended';$('garden-pause').disabled=phase!=='running'&&phase!=='paused';$('garden-pause').textContent=phase==='paused'?'▶':'Ⅱ';$('garden-pause').setAttribute('aria-label',phase==='paused'?'繼續活動':'講解暫停');['minutes','activity','mode','session-mode','spawn-seconds','upgrade-seconds'].forEach(function(k){$('garden-'+k).disabled=busy;});}
    function renderWelcome(){
        var ready=roster.length>0,busy=phase==='opening'||phase==='running'||phase==='paused';
        $('garden-demo').hidden=ready;$('garden-welcome-start').hidden=!ready;$('garden-welcome-start').disabled=busy;$('garden-class-retry').hidden=!hasParent()||fresh;$('garden-class-retry').disabled=busy||!!pending;
        $('garden-class-retry').textContent=demo?'改用班級夥伴':'重新讀取班級頭像';$('garden-count-label').textContent=demo?'示範夥伴':fresh?'班級夥伴':ready?'上次夥伴':'班級夥伴';
        if(demo){$('garden-welcome-title').textContent='目前是試玩模式';$('garden-welcome-detail').textContent='這31位是模擬角色，不是學生目前的配對。要使用班級頭像，請由原班級頁面的音量計開啟。';$('garden-welcome-start').textContent='開始試玩';}
        else if(ready){$('garden-welcome-title').textContent=fresh?'已載入 '+roster.length+' 位班級夥伴':'上次載入的 '+roster.length+' 位夥伴';$('garden-welcome-detail').textContent=fresh?'已帶入班級目前的頭像。可直接開始，或先調整下方的時間與音量設定。':'這是上次保存的頭像，尚未確認最新配對。要更新，請保留原班級頁面並按「更新夥伴」。';$('garden-welcome-start').textContent=fresh?'開始照顧花園':'使用上次頭像開始';}
        else{$('garden-welcome-title').textContent=pending?'正在讀取班級頭像…':'請先載入班級夥伴';$('garden-welcome-detail').textContent=pending?'正在連接原班級頁面，讀取學生目前的計分頭像。請稍候。':'請從原班級頁面「音量計 → 開啟班級祕密花園」進入，才能帶入學生目前的計分頭像。下方試玩只使用模擬角色。';}
    }
    function stopMedia(){
        clearInterval(tickTimer);tickTimer=null;lastLevel=null;
        var old=media||openingMedia;media=null;openingMedia=null;if(old){old.stream.getTracks().forEach(function(t){t.stop();});try{if(old.ctx)old.ctx.close();}catch(e){}}
    }
    function format(ms,elapsed){var s=Math.max(0,elapsed?Math.floor(ms/1000):Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
    function layoutVisitors(){var box=$('garden-visitors'),scene=$('garden-scene'),w=scene.clientWidth,need=window.GardenLife.groundLayout(w,0,roster.length||1);if(scene.style.minHeight!==need.requiredHeight+'px')scene.style.minHeight=need.requiredHeight+'px';var next=window.GardenLife.groundLayout(w,scene.clientHeight,roster.length||1);var key=[w,scene.clientHeight,next.rows,next.columns,next.size].join(':');if(!grounded||grounded.key!==key)renderKey=null;next.key=key;grounded=next;box.style.setProperty('--visitor-size',next.size+'px');}
    function renderVisitors(){
        var list=model?model.visible():[], key=list.map(function(r){return r.seat+':'+r.avatar;}).join(',');
        if(key===renderKey)return;renderKey=key;
        var box=$('garden-visitors');
        Array.from(box.children).forEach(function(node){if(!list.some(function(r){return Number(node.dataset.seat)===r.seat;}))node.remove();});
        list.forEach(function(r,i){var node=box.querySelector('[data-seat="'+r.seat+'"]');if(!node){node=document.createElement('div');node.className='garden-visitor';node.dataset.seat=r.seat;node.dataset.motion=['sway','hop','turn','float'][r.seat%4];node.innerHTML='<div class="visitor-travel"><span class="ground-shadow" aria-hidden="true"></span><span class="activity-prop" aria-hidden="true"></span><div class="visitor-body"></div><small></small></div>';box.appendChild(node);}if(node.dataset.avatar!==String(r.avatar)){node.querySelector('.visitor-body').innerHTML=window.c408PointAvatars.svg(r.avatar);node.dataset.avatar=r.avatar;}node.querySelector('small').textContent=String(r.seat).padStart(2,'0')+'號';node.setAttribute('aria-label',r.seat+'號 '+window.c408PointAvatars.labels[r.avatar]);var p=grounded.positions[i];node.style.left=p.left+'%';node.style.top=p.top+'%';node.style.zIndex=Math.floor(p.footY*1000);node.style.setProperty('--delay',(-i*.7)+'s');});
    }
    function renderLife(dt){var box=$('garden-visitors'),active=phase==='running'&&!!model&&!model.resting&&Number.isFinite(lastLevel);$('garden-scene').dataset.lifeActive=active?'true':'false';lifeView.render(model?model.visible():[],Number.isFinite(dt)?dt:0,{width:box.clientWidth,height:box.clientHeight,rows:grounded.rows,columns:grounded.columns,rowPitch:grounded.rowPitch,size:grounded.size},active,reducedMotion.matches,model?model.quietMs:0,model?model.stage:0,discovery);}
    function renderUpgrades(dt){
        var stage=model?model.stage:0,rewards=model?model.celebrations:0;
        window.GardenPainting.update($('garden-scene'),stage,!model,{discovery:discovery,dt:dt,active:$('garden-scene').dataset.lifeActive==='true',reduced:reducedMotion.matches});
        $('garden-stage-label').textContent=engine.stageNames[stage]+' · '+(stage+1)+'/8'+(rewards?' · 新發現 '+rewards+' · '+discovery.themeName:'');
        $('garden-save').disabled=!model||saving;$('garden-finish-save').disabled=!model||saving;
        if(stage===wildlifeKey)return;wildlifeKey=stage;var box=$('garden-wildlife');box.textContent='';
        if(stage>=3)for(var i=0;i<3;i++){var butterfly=document.createElement('span');butterfly.className='garden-butterfly';butterfly.style.left=[20,68,85][i]+'%';butterfly.style.top=[55,62,43][i]+'%';butterfly.style.setProperty('--delay',(-i*1.7)+'s');butterfly.innerHTML='<svg viewBox="0 0 50 40"><g fill="'+['#e9ba78','#ceb3df','#efc1b5'][i]+'"><ellipse cx="15" cy="12" rx="11" ry="13"/><ellipse cx="35" cy="12" rx="11" ry="13"/><circle cx="17" cy="28" r="8"/><circle cx="33" cy="28" r="8"/></g><path d="M25 8V34" stroke="#77634d" stroke-width="2"/></svg>';box.appendChild(butterfly);}
    }
    function renderFeedback(){
        var target=cfg[$('garden-mode').value],active=phase==='running',valid=active&&Number.isFinite(lastLevel),over=valid&&lastLevel>target,blocked=active&&!!model&&model.resting;
        $('garden-target').textContent=target;$('garden-level').textContent=valid?Math.round(lastLevel):'--';$('garden-meter-fill').style.width=(valid?Math.max(0,Math.min(100,(lastLevel-20)/80*100)):0)+'%';$('garden-meter-limit').style.left=((target-20)/80*100)+'%';var track=$('garden-meter').querySelector('[role=meter]');if(valid)track.setAttribute('aria-valuenow',Math.max(20,Math.min(100,Math.round(lastLevel))));else track.removeAttribute('aria-valuenow');$('garden-meter').dataset.state=over?'over':blocked?'holding':valid?'good':'idle';
        $('garden-meter-status').textContent=phase==='paused'?'老師暫停，麥克風已關閉':!active?'等候開始偵測':!valid?'等待麥克風訊號':blocked?(over?'音量超標，花園暫停': '音量已合宜，等待暫停結束'):'音量合宜，倒數前進中';
        var full=model&&model.full(),total=full?model.upgradeMs:model?model.spawnMs:cfg.spawn*1000,next=model?model.nextMs():total;
        $('garden-next-label').textContent=full?(model.stage<7?engine.stageNames[model.stage+1]:'下一次新發現'):'下一位夥伴';$('garden-next-seconds').textContent=Math.ceil(next/1000);$('garden-next-state').textContent=phase==='paused'?'老師暫停':blocked?'倒數暫停':phase==='ended'?'本次活動已結束':valid?'累積合宜音量':'合宜音量就會前進';$('garden-next').dataset.paused=(!valid||blocked)?'true':'false';$('garden-next-fill').style.width=Math.max(0,Math.min(100,(1-next/total)*100))+'%';
    }
    var noiseKey=null;
    function renderNoise(){
        var scene=$('garden-scene'),shown=phase==='running'&&!!model&&model.resting,box=$('garden-noise-feedback');
        scene.dataset.noiseStopped=shown?'true':'false';box.hidden=!shown;if(!shown){noiseKey=null;return;}
        var seconds=Math.ceil(model.holdRemainingMs/1000),glyph=seconds===2?'②':seconds===1?'①':'…';
        if(glyph!==noiseKey){noiseKey=glyph;$('garden-noise-count').textContent=glyph;}
        var hud=$('garden-scene').querySelector('.garden-hud'),top=hud.offsetTop+hud.offsetHeight+8;
        var foot=Math.min.apply(null,grounded.positions.map(function(p){return p.footY;}))*scene.clientHeight-grounded.size*.88;
        var space=foot-8-top,banner=box.querySelector('.noise-banner');banner.classList.toggle('compact',space<80);
        banner.style.top=(top+Math.max(0,Math.min(18,(space-banner.offsetHeight)/2)))+'px';
    }
    function render(dt){
        discovery=discoveries.sync(model?model.discoveryCount:0,model?model.visible().map(function(r){return r.seat;}):[]);
        $('garden-count').textContent=(model?model.visible().length:0)+' / '+roster.length;
        var timed=model?model.durationMs!==null:$('garden-session-mode').value==='timed';$('garden-minutes-wrap').hidden=$('garden-session-mode').value!=='timed';$('garden-clock-label').textContent=timed?'剩餘時間':'已偵測';$('garden-clock').setAttribute('aria-label',timed?'剩餘時間':'已偵測時間');$('garden-clock').textContent=format(model?(timed?model.durationMs-model.elapsedMs:model.elapsedMs):timed?Number($('garden-minutes').value)*60000:0,!timed);
        $('garden-activity-label').textContent=$('garden-activity').value;
        var mood=phase==='running'?(model&&model.resting?'resting':'growing'):phase==='paused'?'paused':'idle';
        $('garden-scene').dataset.mood=mood;
        $('garden-caption').textContent=phase==='ended'?'今天的專注，已成為花園的一部分':phase==='paused'?'老師說明中，夥伴休息一下':phase==='running'?(silentMs>=3000?'花園正在等麥克風的聲音':model.resting?'花園先停一下，夥伴都在這裡':model.full()?(model.stage===7?discovery.count?'新發現 '+discovery.count+'：'+discovery.activityName:'月光花園完成，新的日常即將開始':'全員到齊，一起讓花園升級'):'花園正在慢慢成長'):'花園正在等大家';
        layoutVisitors();renderVisitors();renderLife(dt);renderUpgrades(dt);window.GardenPainting.setActive($('garden-scene'),$('garden-scene').dataset.lifeActive==='true');renderFeedback();renderNoise();renderWelcome();
    }
    function archive(){
        if(archived||!model)return;archived=true;
        var entry={at:new Date().toISOString(),durationMs:model.elapsedMs,quietMs:model.quietMs,visitors:model.visible(),total:model.roster.length,demo:demo,stage:model.stage,celebrations:model.celebrations};Object.assign(entry,engine.stageMetadata(model.stage));entry.discovery={count:discovery.count,themeId:discovery.themeId,themeName:discovery.themeName,unlockedIds:discovery.unlockedIds.slice()};
        // Current records carry their own stage scheme.
        var list=read('history',[]);if(!Array.isArray(list))list=[];archiveSaved=write('history',[entry].concat(list).slice(0,12));
        showHistory();
    }
    function finish(){operation++;model.ended=true;stopMedia();setPhase('ended');$('garden-finish').hidden=false;$('garden-result').textContent='一起迎來 '+model.visible().length+' / '+roster.length+' 位夥伴，累積 '+Math.floor(model.quietMs/60000)+' 分 '+Math.floor(model.quietMs%60000/1000)+' 秒合宜音量。'+(demo?'（示範花園）':'');archive();render();finishedArt={plain:window.GardenPainting.capture($('garden-scene'),false),seats:window.GardenPainting.capture($('garden-scene'),true)};message(archiveSaved?'活動結束，麥克風已關閉。可保存這幅花園畫；活動紀錄已留下摘要。':'活動結束，麥克風已關閉。瀏覽器無法儲存活動摘要，仍可保存這幅花園畫。',!archiveSaved);}
    function pause(reason){if(phase!=='running'&&phase!=='opening')return;operation++;var resumable=model&&!model.ended;if(resumable)model.pause();stopMedia();setPhase(resumable?'paused':'idle');message(reason||'講解暫停中，倒數與麥克風都已暫停。');render();}
    function errorText(e){if(e&&e.name==='NotAllowedError')return '麥克風尚未允許。請在網址列的網站權限允許麥克風，再按開始。';if(e&&e.name==='NotFoundError')return '找不到麥克風，請確認這台電腦已接上麥克風。';return '無法開始：'+(e&&e.message||'請檢查麥克風是否被其他程式使用。');}
    async function acquire(resuming){
        if(phase==='opening'||phase==='running')return;
        var token=++operation;setPhase('opening');message('正在準備麥克風與夥伴…');var stream=null,ctx=null;
        try{
            if(!resuming){if(!demo&&hasParent())await requestRoster();if(!roster.length)throw Error('請先由班級頁面載入夥伴，或按「先用示範夥伴看看」。');}
            if(token!==operation)return;
            if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error('請透過 HTTPS 網址開啟，並使用支援麥克風的瀏覽器。');
            stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
            if(token!==operation){stream.getTracks().forEach(function(t){t.stop();});return;}
            openingMedia={stream:stream,ctx:null};var AC=window.AudioContext||window.webkitAudioContext;ctx=new AC();openingMedia.ctx=ctx;await ctx.resume();
            if(token!==operation){stream.getTracks().forEach(function(t){t.stop();});ctx.close();return;}
            var src=ctx.createMediaStreamSource(stream),hp=ctx.createBiquadFilter(),an=ctx.createAnalyser();hp.type='highpass';hp.frequency.value=100;an.fftSize=4096;src.connect(hp);hp.connect(an);
            if(!resuming){var min=Number($('garden-minutes').value);model=new engine.Model({roster:roster,durationMs:$('garden-session-mode').value==='direct'?null:min*60000,threshold:cfg[$('garden-mode').value],spawnMs:cfg.spawn*1000,upgradeMs:cfg.upgrade*1000});archived=false;archiveSaved=false;finishedArt=null;renderKey=null;discoveries.reset();window.GardenPainting.update($('garden-scene'),0,true);lifeView.reset();wildlifeKey='';}else model.resume();
            media={stream:stream,ctx:ctx,an:an,buf:new Float32Array(an.fftSize)};openingMedia=null;silentMs=0;
            stream.getTracks().forEach(function(t){t.addEventListener('ended',function(){if(media)pause('麥克風已中斷，活動已暫停。確認連線後按繼續。');});});
            $('garden-welcome').hidden=true;$('garden-finish').hidden=true;setPhase('running');lastTick=performance.now();
            tickTimer=setInterval(tick,100);message(demo?'示範活動進行中；這些不是班上目前的角色配對。':!fresh?'使用上次載入的夥伴；要取得最新頭像，請由原班級頁面開啟。':'活動進行中。老師說明時，可按上方「Ⅱ」暫停。');render();$('garden-shell').scrollIntoView({block:'start',behavior:'auto'});
        }catch(e){if(stream)stream.getTracks().forEach(function(t){t.stop();});if(ctx)try{ctx.close();}catch(err){}if(token===operation){openingMedia=null;setPhase(resuming?'paused':'idle');message(errorText(e),true);render();}}
    }
    function tick(){
        if(!media||phase!=='running')return;
        var now=performance.now(),dt=now-lastTick;lastTick=now;media.an.getFloatTimeDomainData(media.buf);var sum=0;
        for(var i=0;i<media.buf.length;i++)sum+=media.buf[i]*media.buf[i];
        var level=sum>0?10*Math.log10(sum/media.buf.length)+95:null;lastLevel=level;
        if(level===null){silentMs+=dt;if(silentMs>=3000)message('收不到聲音，請檢查麥克風的靜音開關；花園暫停成長。',true);}else{if(silentMs>=3000)message('聲音已恢復，花園繼續成長。');silentMs=0;}
        model.threshold=cfg[$('garden-mode').value];var quietBefore=model.quietMs;model.tick(dt,level);render(Math.max(0,model.quietMs-quietBefore));if(model.ended)finish();
    }
    function showHistory(){
        var box=$('garden-history'),list=read('history',[]);box.textContent='';
        if(!Array.isArray(list)||!list.length){box.textContent='還沒有活動紀錄。結束一次活動後會留下摘要；想保留畫面，請按「保存花園畫」。';return;}
        list.slice(0,12).forEach(function(h){if(!h||!Array.isArray(h.visitors)||typeof h.at!=='string')return;var card=document.createElement('article'),title=document.createElement('strong'),text=document.createElement('p'),icons=document.createElement('div');title.textContent=new Date(h.at).toLocaleDateString('zh-TW',{month:'long',day:'numeric'})+(h.demo?' · 示範':' · 班級花園');text.textContent=h.visitors.length+' 位夥伴 · 合宜音量 '+Math.floor((Number(h.quietMs)||0)/60000)+' 分鐘 · '+engine.recordStage(h).stageName+(engine.recordStage(h).stageTotal?' · '+(engine.recordStage(h).stageIndex+1)+'/'+engine.recordStage(h).stageTotal:'')+(h.schema===3&&h.discovery&&Number.isInteger(h.discovery.count)?' · 新發現 '+h.discovery.count+(h.discovery.themeName?' · '+h.discovery.themeName:''):(h.celebrations?' · '+h.celebrations+' 次祝福':''));icons.className='history-avatars';h.visitors.filter(function(r){return r&&Number.isInteger(r.avatar)&&r.avatar>=0&&r.avatar<24;}).slice(0,31).forEach(function(r){icons.insertAdjacentHTML('beforeend',window.c408PointAvatars.svg(r.avatar));});card.append(title,text,icons);box.appendChild(card);});
    }
    $('garden-demo').onclick=function(){if(pending){var p=pending;pending=null;clearTimeout(p.timer);p.reject({cancelled:true,message:'已切換示範夥伴'});}demo=true;fresh=false;roster=engine.cleanRoster(Array.from({length:31},function(_,i){return {seat:i+1,avatar:(i+8)%24};}));$('garden-source').textContent='示範模式 · 31 位示範夥伴，與真實班級配對無關';$('garden-demo').textContent='示範夥伴已就緒';message('選好時間後，按「開始照顧花園」。');render();};
    $('garden-refresh').onclick=async function(){this.disabled=true;var wasDemo=demo,oldRoster=roster;if(demo&&hasParent())demo=false;try{await requestRoster();message(demo?'目前使用示範夥伴。':'已更新目前頭像，花園進度保留。');}catch(e){if(!e.cancelled){if(wasDemo){demo=true;roster=oldRoster;}fresh=false;message(e.message+' 已載入的夥伴與進度都保留。',true);}}finally{this.disabled=phase==='ended';render();}};
    $('garden-start').onclick=function(){var n=Number($('garden-minutes').value);if($('garden-session-mode').value==='timed'&&(!Number.isInteger(n)||n<1||n>120)){message('活動時間請填 1～120 的整數分鐘。',true);return;}var bounds={spawn:[1,300],upgrade:[5,300]};for(var k in bounds){var v=Number($('garden-'+k+'-seconds').value);if(!Number.isInteger(v)||v<bounds[k][0]||v>bounds[k][1]){message('秒數設定請填欄位範圍內的整數。',true);return;}cfg[k]=v;}write('settings',cfg);acquire(false);};
    $('garden-welcome-start').onclick=function(){$('garden-start').click();};
    $('garden-class-retry').onclick=function(){$('garden-refresh').click();};
    $('garden-pause').onclick=function(){if(phase==='paused')acquire(true);else pause();};
    $('garden-end').onclick=function(){if(model&&window.confirm('結束這次活動並保留活動摘要嗎？'))finish();};
    $('garden-again').onclick=function(){model=null;finishedArt=null;renderKey=null;discoveries.reset();lifeView.reset();setPhase('idle');$('garden-finish').hidden=true;$('garden-welcome').hidden=false;render();$('garden-start').focus();};
    function saveStatus(text){$('garden-save-status').textContent=text;$('garden-finish-save-status').textContent=text;}
    $('garden-finish-save').onclick=function(){$('garden-save').click();};
    $('garden-save').onclick=async function(){
        if(!model||saving)return;saving=true;this.disabled=true;$('garden-finish-save').disabled=true;saveStatus('正在準備花園畫…');
        try{var include=$('garden-save-seats').checked,svg=finishedArt?finishedArt[include?'seats':'plain']:window.GardenPainting.capture($('garden-scene'),include);var blob=await window.GardenPainting.toPng(svg);window.GardenPainting.download(blob,'班級花園_'+new Date().toLocaleDateString('sv-SE')+'.png');saveStatus('已送出PNG下載，請查看這台裝置的下載項目。');}
        catch(e){saveStatus('暫時無法產生圖片，請重試；目前花園仍保留，可再次保存。');}
        finally{saving=false;this.disabled=!model;$('garden-finish-save').disabled=!model;}
    };
    $('garden-history-button').onclick=function(){$('garden-history').hidden=!$('garden-history').hidden;showHistory();};
    $('garden-fullscreen').onclick=function(){var promise=document.fullscreenElement?document.exitFullscreen():$('garden-shell').requestFullscreen&&$('garden-shell').requestFullscreen();if(promise&&promise.catch)promise.catch(function(){message('這個瀏覽器未開放全螢幕，可使用瀏覽器的放大功能。');});};
    ['study','discuss'].forEach(function(k){var input=$('garden-'+k+'-threshold');input.oninput=function(){cfg[k]=Number(input.value);$('garden-'+k+'-value').textContent=input.value;write('settings',cfg);};});
    $('garden-minutes').oninput=function(){if(!model)render();};$('garden-minutes').onchange=function(){var n=Number(this.value);if(Number.isInteger(n)&&n>=1&&n<=120){cfg.minutes=n;write('settings',cfg);}};
    $('garden-activity').onchange=render;
    $('garden-session-mode').onchange=function(){cfg.session=this.value;write('settings',cfg);if(phase==='idle'&&model&&model.ended)model=null;render();};
    ['spawn','upgrade'].forEach(function(k){$('garden-'+k+'-seconds').onchange=function(){var n=Number(this.value),lo=k==='spawn'?1:5,hi=300;if(Number.isInteger(n)&&n>=lo&&n<=hi){cfg[k]=n;write('settings',cfg);if(!model)render();}};});
    document.addEventListener('visibilitychange',function(){if(document.hidden)pause('已離開花園，活動與麥克風已暫停。回來後按上方繼續。');});
    window.addEventListener('pagehide',function(){operation++;stopMedia();});
    window.addEventListener('resize',function(){renderKey=null;render();});
    var saved=read('settings',{});if(saved&&typeof saved==='object'){['study','discuss'].forEach(function(k){if(Number.isFinite(saved[k])&&saved[k]>=30&&saved[k]<=95)cfg[k]=saved[k];});if(Number.isInteger(saved.minutes)&&saved.minutes>=1&&saved.minutes<=120)cfg.minutes=saved.minutes;if(saved.session==='timed')cfg.session='timed';['spawn','upgrade'].forEach(function(k){var lo=k==='spawn'?1:5,hi=300;if(Number.isInteger(saved[k])&&saved[k]>=lo&&saved[k]<=hi)cfg[k]=saved[k];});}
    $('garden-minutes').value=cfg.minutes;['study','discuss'].forEach(function(k){$('garden-'+k+'-threshold').value=cfg[k];$('garden-'+k+'-value').textContent=cfg[k];});
    $('garden-session-mode').value=cfg.session;['spawn','upgrade'].forEach(function(k){$('garden-'+k+'-seconds').value=cfg[k];});
    var cached=read('roster',null);if(cached)try{roster=engine.cleanRoster(cached.roster);$('garden-source').textContent='上次載入的夥伴 · '+roster.length+' 位。開始前請更新以取得目前頭像。';}catch(e){}
    if(hasParent())requestRoster().catch(function(e){if(!e.cancelled)message(e.message,true);render();});
    setPhase('idle');render();showHistory();
}());
