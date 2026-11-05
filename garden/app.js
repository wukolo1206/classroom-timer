(function () {
    'use strict';
    var $=function(id){return document.getElementById(id);}, engine=window.SecretGarden;
    var params=new URLSearchParams(location.hash.slice(1)), channel=params.get('channel'), parentOrigin=params.get('parent');
    var source=new URLSearchParams(location.search).get('source')==='universal'?'universal':'c408';
    var prefix=source==='universal'?'ctu_garden_':'c408_garden_';
    var roster=[], model=null, media=null, openingMedia=null, phase='idle', demo=false, fresh=false, pending=null, requestSeq=0, operation=0, tickTimer=null, lastTick=0, silentMs=0, archived=false, renderKey='', bloomCount=-1;
    var cfg={minutes:10,study:50,discuss:65}, cursor=0;
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
        window.opener.postMessage({type:'garden:request',channel:channel,requestId:id},parentOrigin);
        return promise;
    }
    window.addEventListener('message',function(e){
        var d=e.data;if(!pending||e.source!==window.opener||e.origin!==parentOrigin||!d||d.type!=='garden:roster'||d.channel!==channel||d.requestId!==pending.id)return;
        var p=pending;pending=null;clearTimeout(p.timer);
        try{if(d.error)throw Error(d.error);var list=engine.cleanRoster(d.roster);fresh=true;roster=list;if(model)model.refresh(list);write('roster',{roster:list,readAt:d.readAt});$('garden-source').textContent=(source==='universal'?'本機班級':'目前計分頭像')+' · 已更新 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})+' · '+list.length+' 位夥伴';renderKey='';render();p.resolve(list);}catch(err){fresh=false;p.reject(err);}
    });
    function setPhase(next){phase=next;document.body.dataset.phase=phase;var busy=phase==='opening'||phase==='running'||phase==='paused';$('garden-start').disabled=busy;$('garden-demo').disabled=busy;$('garden-end').disabled=!busy||phase==='opening';$('garden-pause').disabled=phase!=='running'&&phase!=='paused';$('garden-pause').textContent=phase==='paused'?'▶':'Ⅱ';$('garden-pause').setAttribute('aria-label',phase==='paused'?'繼續活動':'講解暫停');['minutes','activity','mode'].forEach(function(k){$('garden-'+k).disabled=busy;});}
    function stopMedia(){
        clearInterval(tickTimer);tickTimer=null;
        var old=media||openingMedia;media=null;openingMedia=null;if(old){old.stream.getTracks().forEach(function(t){t.stop();});try{if(old.ctx)old.ctx.close();}catch(e){}}
    }
    function format(ms){var s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
    function visitorPosition(i){var rows=Math.max(1,Math.ceil(roster.length/8)),slots=rows*8,stride=slots%13===0?17:13,index=(i*stride)%slots,row=Math.floor(index/8),col=index%8;return {x:7+col*12.2,y:24+(row+.5)*65/rows};}
    function layoutVisitors(){var box=$('garden-visitors'),rows=Math.max(1,Math.ceil(roster.length/8)),scene=$('garden-scene');var required=rows*76/(.65*.91);scene.style.minHeight=Math.max(400,required)+'px';var size=Math.max(25,Math.min(80,box.clientWidth/8*.72,box.clientHeight*.65/rows-24));box.style.setProperty('--visitor-size',size+'px');}
    function renderVisitors(){
        var list=model?model.visible():[], key=list.map(function(r){return r.seat+':'+r.avatar;}).join(',');
        if(key===renderKey)return;renderKey=key;
        var box=$('garden-visitors');
        Array.from(box.children).forEach(function(node){if(!list.some(function(r){return Number(node.dataset.seat)===r.seat;}))node.remove();});
        list.forEach(function(r,i){var node=box.querySelector('[data-seat="'+r.seat+'"]');if(!node){node=document.createElement('div');node.className='garden-visitor';node.dataset.seat=r.seat;node.innerHTML='<div class="visitor-body"></div><small></small>';box.appendChild(node);}if(node.dataset.avatar!==String(r.avatar)){node.querySelector('.visitor-body').innerHTML=window.c408PointAvatars.svg(r.avatar);node.dataset.avatar=r.avatar;}node.querySelector('small').textContent=String(r.seat).padStart(2,'0')+'號';node.setAttribute('aria-label',r.seat+'號 '+window.c408PointAvatars.labels[r.avatar]);var p=visitorPosition(i);node.style.left=p.x+'%';node.style.top=p.y+'%';node.style.zIndex=Math.floor(p.y);node.style.setProperty('--delay',(-i*.7)+'s');});
    }
    function renderBlooms(){var count=model?Math.floor(model.quietMs/10000):0;count=Math.min(18,count);if(count===bloomCount)return;bloomCount=count;var box=$('garden-blooms');box.textContent='';for(var i=0;i<count;i++){var b=document.createElement('span');b.className='garden-bloom';b.textContent='✿';b.style.left=(14+(i*137%74))+'%';b.style.top=(64+(i*71%27))+'%';b.style.setProperty('--flower',['#f9e7ae','#f2bca7','#fff7dd'][i%3]);box.appendChild(b);}}
    function render(){
        $('garden-count').textContent=(model?model.visible().length:0)+' / '+roster.length;
        $('garden-clock').textContent=format(model?model.durationMs-model.elapsedMs:Number($('garden-minutes').value)*60000);
        $('garden-activity-label').textContent=$('garden-activity').value;
        var mood=phase==='running'?(model&&model.resting?'resting':'growing'):phase==='paused'?'paused':'idle';
        $('garden-scene').dataset.mood=mood;
        $('garden-caption').textContent=phase==='ended'?'今天的專注，已成為花園的一部分':phase==='paused'?'老師說明中，夥伴休息一下':phase==='running'?(silentMs>=3000?'花園正在等麥克風的聲音':model.resting?'放輕聲音，夥伴就會繼續活動':'花園正在慢慢成長'):'花園正在等大家';
        layoutVisitors();renderVisitors();renderBlooms();
    }
    function archive(){
        if(archived||!model)return;archived=true;
        var entry={at:new Date().toISOString(),durationMs:model.elapsedMs,quietMs:model.quietMs,visitors:model.visible(),total:model.roster.length,demo:demo};
        var list=read('history',[]);if(!Array.isArray(list))list=[];write('history',[entry].concat(list).slice(0,12));
        if(!demo){cursor=model.nextCursor();write('cursor',cursor);}
        showHistory();
    }
    function finish(){operation++;stopMedia();setPhase('ended');$('garden-finish').hidden=false;$('garden-result').textContent='一起迎來 '+model.visible().length+' / '+roster.length+' 位夥伴，累積 '+Math.floor(model.quietMs/60000)+' 分 '+Math.floor(model.quietMs%60000/1000)+' 秒合宜音量。'+(demo?'（示範花園）':'');archive();render();message('活動結束，麥克風已關閉。');}
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
            if(!resuming){var min=Number($('garden-minutes').value);if(!Number.isInteger(min)||min<1||min>120)throw Error('活動時間請填 1～120 的整數分鐘。');model=new engine.Model({roster:roster,durationMs:min*60000,threshold:cfg[$('garden-mode').value],cursor:demo?0:cursor});archived=false;renderKey='';bloomCount=-1;}else model.resume();
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
        var level=sum>0?10*Math.log10(sum/media.buf.length)+95:null;
        if(level===null){silentMs+=dt;if(silentMs>=3000)message('收不到聲音，請檢查麥克風的靜音開關；花園暫停成長。',true);}else{if(silentMs>=3000)message('聲音已恢復，花園繼續成長。');silentMs=0;}
        model.threshold=cfg[$('garden-mode').value];model.tick(dt,level);render();if(model.ended)finish();
    }
    function showHistory(){
        var box=$('garden-history'),list=read('history',[]);box.textContent='';
        if(!Array.isArray(list)||!list.length){box.textContent='還沒有收藏。完成一次活動，就會留下一座花園。';return;}
        list.slice(0,12).forEach(function(h){if(!h||!Array.isArray(h.visitors)||typeof h.at!=='string')return;var card=document.createElement('article'),title=document.createElement('strong'),text=document.createElement('p'),icons=document.createElement('div');title.textContent=new Date(h.at).toLocaleDateString('zh-TW',{month:'long',day:'numeric'})+(h.demo?' · 示範':' · 班級花園');text.textContent=h.visitors.length+' 位夥伴 · 合宜音量 '+Math.floor((Number(h.quietMs)||0)/60000)+' 分鐘';icons.className='history-avatars';h.visitors.filter(function(r){return r&&Number.isInteger(r.avatar)&&r.avatar>=0&&r.avatar<24;}).slice(0,31).forEach(function(r){icons.insertAdjacentHTML('beforeend',window.c408PointAvatars.svg(r.avatar));});card.append(title,text,icons);box.appendChild(card);});
    }
    $('garden-demo').onclick=function(){if(pending){var p=pending;pending=null;clearTimeout(p.timer);p.reject({cancelled:true,message:'已切換示範夥伴'});}demo=true;fresh=false;roster=engine.cleanRoster(Array.from({length:31},function(_,i){return {seat:i+1,avatar:(i+8)%24};}));$('garden-source').textContent='示範模式 · 31 位示範夥伴，與真實班級配對無關';$('garden-demo').textContent='示範夥伴已就緒';message('選好時間後，按「開始照顧花園」。');render();};
    $('garden-refresh').onclick=async function(){this.disabled=true;try{await requestRoster();message(demo?'目前使用示範夥伴。':'已更新目前頭像，花園進度保留。');}catch(e){if(!e.cancelled){fresh=false;message(e.message+' 已載入的夥伴與進度都保留。',true);}}finally{this.disabled=false;}};
    $('garden-start').onclick=function(){var n=Number($('garden-minutes').value);if(!Number.isInteger(n)||n<1||n>120){message('活動時間請填 1～120 的整數分鐘。',true);return;}acquire(false);};
    $('garden-pause').onclick=function(){if(phase==='paused')acquire(true);else pause();};
    $('garden-end').onclick=function(){if(model&&window.confirm('結束這次活動並收藏目前的花園嗎？'))finish();};
    $('garden-again').onclick=function(){model=null;renderKey='';bloomCount=-1;setPhase('idle');$('garden-finish').hidden=true;$('garden-welcome').hidden=false;render();$('garden-start').focus();};
    $('garden-history-button').onclick=function(){$('garden-history').hidden=!$('garden-history').hidden;showHistory();};
    $('garden-fullscreen').onclick=function(){var promise=document.fullscreenElement?document.exitFullscreen():$('garden-shell').requestFullscreen&&$('garden-shell').requestFullscreen();if(promise&&promise.catch)promise.catch(function(){message('這個瀏覽器未開放全螢幕，可使用瀏覽器的放大功能。');});};
    ['study','discuss'].forEach(function(k){var input=$('garden-'+k+'-threshold');input.oninput=function(){cfg[k]=Number(input.value);$('garden-'+k+'-value').textContent=input.value;write('settings',cfg);};});
    $('garden-minutes').oninput=function(){if(!model)render();};$('garden-minutes').onchange=function(){var n=Number(this.value);if(Number.isInteger(n)&&n>=1&&n<=120){cfg.minutes=n;write('settings',cfg);}};
    $('garden-activity').onchange=render;
    document.addEventListener('visibilitychange',function(){if(document.hidden)pause('已離開花園，活動與麥克風已暫停。回來後按上方繼續。');});
    window.addEventListener('pagehide',function(){operation++;stopMedia();});
    window.addEventListener('resize',layoutVisitors);
    var saved=read('settings',{});if(saved&&typeof saved==='object'){['study','discuss'].forEach(function(k){if(Number.isFinite(saved[k])&&saved[k]>=30&&saved[k]<=95)cfg[k]=saved[k];});if(Number.isInteger(saved.minutes)&&saved.minutes>=1&&saved.minutes<=120)cfg.minutes=saved.minutes;}
    $('garden-minutes').value=cfg.minutes;['study','discuss'].forEach(function(k){$('garden-'+k+'-threshold').value=cfg[k];$('garden-'+k+'-value').textContent=cfg[k];});
    cursor=Number(read('cursor',0))||0;
    var cached=read('roster',null);if(cached)try{roster=engine.cleanRoster(cached.roster);$('garden-source').textContent='上次載入的夥伴 · '+roster.length+' 位。開始前請更新以取得目前頭像。';}catch(e){}
    if(hasParent())requestRoster().catch(function(e){if(!e.cancelled)message(e.message,true);});
    setPhase('idle');render();showHistory();
}());
