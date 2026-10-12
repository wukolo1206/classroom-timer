(function () {
    'use strict';
    var cloud = !!(window.google && google.script && google.script.run);
    var key = cloud ? 'c408_points_cloud/state' : 'c408_points_local/state';
    var state, stateRaw = null, roster, ready = false, selected = [], multi = false, view = 'students', negative = false;
    var chain = Promise.resolve(), busy = 0, lastError = '', lastSync = '', settingsDraft = null, draftRevision = 0;
    var feedback=null;
    var colors = ['#8bcdb0','#b3a3eb','#ffb4ad','#f5d475','#91cbea','#dfa3d8','#a6d57c','#ffbb7e'];
    var labels = ['薄荷芽芽','星星軟糖','桃桃小獸','布丁夥伴','雲朵泡泡','莓果毛球','森林豆豆','橘子圓圓'];
    function el(id) { return document.getElementById(id); }
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    function id() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,11); }
    function defaults() {
        var names = {}; try { names = JSON.parse(localStorage.getItem('groupNames') || '{}'); } catch (_) {}
        var groups = []; for (var i=1;i<=8;i++) groups.push({id:'g'+i,name:names[i] || ('第 '+i+' 組'),seats:[]});
        return {items:[{id:'focus',label:'認真上課',delta:1},{id:'help',label:'主動幫忙',delta:1},{id:'teamwork',label:'合作',delta:1},{id:'unfinished',label:'未完成任務',delta:-1},{id:'disrupt',label:'影響秩序',delta:-1}],avatars:{},groups:groups,muted:false};
    }
    function store(next) {
        try {
            if(localStorage.getItem(key)!==stateRaw){message('另一個分頁已更新本機資料，這次操作未接受。請重新整理此頁，保留其他分頁的待同步操作。');return false;}
            var serialized=JSON.stringify(next);localStorage.setItem(key,serialized);stateRaw=serialized;state = next;return true;
        }
        catch (_) { message('本機儲存失敗：請確認瀏覽器允許儲存並有足夠空間，再重試。這次操作尚未接受。'); return false; }
    }
    function message(s) { el('points-message').textContent = s || ''; }
    function settings() { return state.bundle.settings || state.defaults; }
    function seats() { return Object.keys(roster).map(Number).sort(function(a,b){return a-b;}); }
    function targets(list) { return list.map(function(n){return {seat:n,name:roster[n][0]};}); }
    function rpc(name,args) {
        return new Promise(function(resolve,reject) {
            var r = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
            r[name].apply(r,args);
        });
    }
    function serial(fn) {
        chain = chain.then(async function(){ busy++; status(); try { await fn(); } catch (e) { lastError=e.message || String(e); message(lastError + '。操作已保留；請檢查連線後按「重新同步」。若持續失敗請保留此畫面並聯絡管理者。'); } finally { busy--; status(); } });
        return chain;
    }
    function status() {
        if (!ready) return;
        el('points-status').textContent = cloud ? (state.pending.length ? '☁ 待同步 '+state.pending.length+' 筆'+(lastError?'（失敗）':'') : lastError ? '☁ 同步失敗' : busy ? '☁ 同步中' : '☁ 已同步'+(lastSync?' · '+lastSync:'')) : '○ 本機模式 · 僅保存在這台瀏覽器';
        el('points-undo').disabled = !state.lastUndo || !!state.pending.length;
        el('points-reset').disabled = !!state.pending.length;
    }
    function allEvents() {
        var events = [], known = {};
        state.bundle.events.forEach(function(e){if(!known[e.id]){known[e.id]=true;events.push(e);}});
        state.pending.forEach(function(b){if(b.type==='score')b.seats.forEach(function(s){var eid=b.id+':'+s.seat;if(!known[eid]){known[eid]=true;events.push({id:eid,batchId:b.id,time:b.time,seat:s.seat,name:s.name,label:b.label,delta:b.delta,type:b.type,pending:true});}});});
        return events;
    }
    function totals() { var t={};allEvents().forEach(function(e){t[e.seat]=(t[e.seat]||0)+e.delta;});return t; }
    function avatar(n) {
        n = Number(n)||0; n=Math.max(0,Math.min(7,n));
        var ears=n%3===0?'<path d="M25 40 Q12 2 38 25 M62 25 Q88 2 75 40" fill="'+colors[n]+'"/>':n%3===1?'<path d="M24 34 L13 10 L43 25 M60 25 L88 10 L76 34" fill="'+colors[n]+'"/>':'<path d="M28 31 Q24 4 47 23 M54 23 Q78 4 72 31" fill="'+colors[n]+'"/>';
        return '<svg viewBox="0 0 100 100" aria-label="'+labels[n]+'" role="img">'+ears+'<ellipse cx="50" cy="86" rx="30" ry="5" fill="#edf0fa"/><path d="M19 54 Q17 21 50 22 Q83 21 81 54 L84 70 Q84 85 69 84 L61 78 L39 78 L31 84 Q16 85 16 70 Z" fill="'+colors[n]+'"/><ellipse cx="50" cy="64" rx="21" ry="18" fill="#ffffff55"/><circle cx="36" cy="48" r="4" fill="#33425b"/><circle cx="64" cy="48" r="4" fill="#33425b"/><circle cx="35" cy="47" r="1" fill="white"/><circle cx="63" cy="47" r="1" fill="white"/><ellipse cx="26" cy="58" rx="6" ry="4" fill="#f38ea566"/><ellipse cx="74" cy="58" rx="6" ry="4" fill="#f38ea566"/><path d="M43 59 Q50 67 57 59" fill="none" stroke="#33425b" stroke-width="2.5" stroke-linecap="round"/>'+ (n%2?'<path d="M49 27 L52 33 L59 34 L54 39 L55 46 L49 42 L43 46 L44 39 L39 34 L46 33 Z" fill="#fff6b8"/>':'<path d="M45 26 Q40 12 51 14 Q63 15 54 27" fill="#ffffff88"/>')+'</svg>';
    }
    function button(text, fn, cls) { var b=document.createElement('button');b.type='button';b.textContent=text;if(cls)b.className=cls;b.onclick=fn;return b; }
    function render() {
        var t=totals(), box=el('points-students');box.textContent='';
        seats().forEach(function(n){
            var b=button('',function(){if(multi){var at=selected.indexOf(n);if(at<0)selected.push(n);else selected.splice(at,1);render();}else{selected=[n];render();openAward();}},'points-card'+(selected.indexOf(n)>=0?' selected':''));
            b.dataset.pointSeat=n;b.innerHTML=avatar(settings().avatars[n]===undefined?n%8:settings().avatars[n]);
            var s=document.createElement('span');s.className='points-seat';s.textContent=n+' 號';b.appendChild(s);
            s=document.createElement('span');s.className='points-name';s.textContent=roster[n][0];b.appendChild(s);
            s=document.createElement('strong');s.className='points-score';s.textContent=t[n]||0;b.appendChild(s);box.appendChild(b);
        });
        box.hidden=view==='groups';var groups=el('points-groups');groups.textContent='';groups.hidden=view!=='groups';
        settings().groups.forEach(function(g){var node=document.createElement('div');node.className='points-group';node.dataset.pointGroup=g.id;var title=document.createElement('strong');title.textContent=g.name+' · '+g.seats.reduce(function(sum,n){return sum+(t[n]||0);},0)+' 點';node.appendChild(title);var names=document.createElement('p');names.className='points-help';names.textContent=g.seats.map(function(n){return n+' '+roster[n][0];}).join('、')||'尚未設定成員';node.appendChild(names);var b=g.seats.length?button('整組加扣點',function(){selected=g.seats.slice();openAward();}):button('設定小組成員',openSettings);node.appendChild(b);groups.appendChild(node);});
        if(!settings().groups.length){var empty=document.createElement('div');empty.className='points-empty';empty.textContent='尚未設定小組，先加入組名與成員就能整組加扣點。';empty.appendChild(button('設定小組',openSettings));groups.appendChild(empty);}
        el('points-selected-count').textContent=selected.length?'已選 '+selected.length+' 人':'點學生卡片加扣點';
        el('points-multi').textContent=multi?'✓ 多選中':'多選學生';status();showFeedback();
    }
    var previousFocus=null;
    function modal(id,show) {el(id).hidden=!show;if(show){previousFocus=document.activeElement;var focus=el(id).querySelector('button,input,select');if(focus)focus.focus();}else if(previousFocus){previousFocus.focus();previousFocus=null;}}
    function openAward(){if(!selected.length){message('請先選取學生，或在設定中加入小組成員。');return;}negative=false;el('points-award-title').textContent='為 '+selected.length+' 位學生加扣點';awardItems();modal('points-award',true);}
    function awardItems(){var box=el('points-award-items');box.textContent='';settings().items.filter(function(i){return negative?i.delta<0:i.delta>0;}).forEach(function(i){box.appendChild(button(i.label+' '+(i.delta>0?'+':'')+i.delta,function(){score(i);},'points-primary'));});if(!box.children.length)box.textContent='目前沒有這類項目，請到設定新增。';}
    function floatOn(card,text,delta){if(!card)return;var s=document.createElement('span');s.className='points-float'+(delta<0?' points-negative':'');s.textContent=text;card.appendChild(s);setTimeout(function(){s.remove();},Math.max(0,feedback.until-Date.now()));}
    function showFeedback(){if(!feedback||Date.now()>=feedback.until)return;var list=feedback.list,delta=feedback.delta,value=(delta>0?'+':'')+delta;Array.from(el('panel-points').querySelectorAll('.points-float')).forEach(function(n){n.remove();});if(view==='groups'){settings().groups.forEach(function(g){var count=g.seats.filter(function(n){return list.indexOf(n)>=0;}).length;if(!count)return;var card=Array.from(el('points-groups').children).find(function(n){return n.dataset.pointGroup===g.id;});floatOn(card,(count===g.seats.length?'每人 ':count+' 人各 ')+value,delta);});}else list.forEach(function(n){floatOn(document.querySelector('[data-point-seat="'+n+'"]'),value,delta);});}
    function animate(list,delta){feedback={list:list.slice(),delta:delta,until:Date.now()+1100};showFeedback();if(!settings().muted){try{var ac=new(window.AudioContext||window.webkitAudioContext)();var o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=delta>0?620:320;g.gain.value=.045;o.start();g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.18);o.stop(ac.currentTime+.2);setTimeout(function(){ac.close();},350);}catch(_){}}}
    function score(item){var b={id:id(),type:'score',seats:targets(selected),itemId:item.id,label:item.label,delta:item.delta,device:state.device,time:new Date().toISOString()};if(enqueue(b)){modal('points-award',false);animate(selected,item.delta);}}
    function localApply(next,b){var events=next.bundle.events, list=b.seats;
        if(b.type==='undo')list=events.filter(function(e){return e.batchId===b.originalBatchId;}).map(function(e){return {seat:e.seat,name:e.name,delta:-e.delta};});
        list.forEach(function(s){var d=b.type==='score'?b.delta:b.type==='undo'?s.delta:-events.filter(function(e){return e.seat===s.seat;}).reduce(function(sum,e){return sum+e.delta;},0);events.push({id:b.id+':'+s.seat,batchId:b.id,time:b.time,seat:s.seat,name:s.name,itemId:b.itemId||'',label:b.type==='undo'?'復原':b.type==='reset'?'歸零':b.label,delta:d,type:b.type,originalBatchId:b.originalBatchId||'',device:b.device});});
    }
    function reconcileUndo(next){var undone={};next.bundle.events.forEach(function(e){if(e.type==='undo')undone[e.originalBatchId]=true;});next.undoStack=next.undoStack.filter(function(batchId){return !undone[batchId];});next.lastUndo=next.undoStack.length?next.undoStack[next.undoStack.length-1]:null;}
    function enqueue(b){var next=copy(state);if(cloud)next.pending.push(b);else localApply(next,b);if(b.type==='score')next.undoStack.push(b.id);else if(b.type==='undo')next.undoStack=next.undoStack.filter(function(batchId){return batchId!==b.originalBatchId;});else next.undoStack=[];reconcileUndo(next);if(!store(next))return false;lastError='';message('');render();if(cloud)sync(false);return true;}
    async function flush(){while(state.pending.length){var b=state.pending[0], bundle=await rpc('commitPointBatch',[b]);var next=copy(state);next.bundle=bundle;next.pending.shift();reconcileUndo(next);if(!store(next))throw Error('雲端可能已接受操作，但本機儲存失敗。待送編號已保留，請恢復儲存後重新同步');render();} }
    function sync(pull){if(!cloud)return;return serial(async function(){await flush();if(pull){var bundle=await rpc('getPointBundle',[]);var next=copy(state);next.bundle=bundle;reconcileUndo(next);if(!store(next))throw Error('同步資料無法儲存');}lastError='';lastSync=new Date().toLocaleTimeString();message('');render();});}
    function undo(){if(state.pending.length){message('請先完成待同步操作。');return;}if(!state.lastUndo)return;enqueue({id:'undo:'+state.lastUndo,type:'undo',originalBatchId:state.lastUndo,device:state.device,time:new Date().toISOString()});}
    function reset(){if(state.pending.length){message('請先完成待同步操作。');return;}var list=selected.length?selected.slice():seats();if(!window.confirm('確定將'+(selected.length?'選取的 '+list.length+' 位学生':'全班')+'點數歸零？歷史紀錄會保留。'))return;enqueue({id:id(),type:'reset',seats:targets(list),device:state.device,time:new Date().toISOString()});}
    function history(){var box=el('points-history-student');box.textContent='';var option=document.createElement('option');option.value='';option.textContent='全班';box.appendChild(option);seats().forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n+' '+roster[n][0];box.appendChild(o);});renderHistory();modal('points-history-modal',true);}
    function renderHistory(){var student=el('points-history-student').value,date=el('points-history-date').value,box=el('points-history-list');box.textContent='';allEvents().slice().reverse().filter(function(e){return (!student||Number(student)===e.seat)&&(!date||localDate(e.time)===date);}).forEach(function(e){var row=document.createElement('tr');[new Date(e.time).toLocaleString(),e.seat+' '+e.name,e.label+(e.type==='undo'?'（復原）':e.type==='reset'?'（歸零）':'')+(e.pending?' · 待同步':''),(e.delta>0?'+':'')+e.delta].forEach(function(s){var td=document.createElement('td');td.textContent=s;row.appendChild(td);});box.appendChild(row);});}
    function localDate(time){var d=new Date(time);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function input(value,type){var i=document.createElement('input');i.value=value;i.type=type||'text';return i;}
    function openSettings(){settingsDraft=copy(settings());if(!settingsDraft.groups.length)settingsDraft.groups=defaults().groups;draftRevision=state.bundle.revision;el('points-settings-message').textContent='';el('points-settings-reload').hidden=true;renderSettings();modal('points-settings-modal',true);}
    function renderSettings(){var items=el('points-settings-items');items.textContent='';settingsDraft.items.forEach(function(item,idx){var row=document.createElement('div');row.className='points-item-row';var name=input(item.label);name.maxLength=80;name.setAttribute('aria-label','項目名稱');name.oninput=function(){item.label=name.value;};var delta=input(item.delta,'number');delta.min=-100;delta.max=100;delta.setAttribute('aria-label','項目分值');delta.oninput=function(){item.delta=Number(delta.value);};row.appendChild(name);row.appendChild(delta);row.appendChild(button('刪除',function(){settingsDraft.items.splice(idx,1);renderSettings();}));items.appendChild(row);});
        var groups=el('points-settings-groups');groups.textContent='';settingsDraft.groups.forEach(function(g,idx){var row=document.createElement('div');row.className='points-group-row';var name=input(g.name);name.maxLength=40;name.setAttribute('aria-label','小組名稱');name.oninput=function(){g.name=name.value;};var members=input(g.seats.join(', '));members.placeholder='座號，例如 1, 2, 3';members.setAttribute('aria-label','小組成員座號');members.oninput=function(){g.seatsText=members.value;};if(g.seatsText!==undefined)members.value=g.seatsText;row.appendChild(name);row.appendChild(members);row.appendChild(button('刪除',function(){settingsDraft.groups.splice(idx,1);renderSettings();}));groups.appendChild(row);});
        var avatars=el('points-settings-avatars');avatars.textContent='';seats().forEach(function(n){var row=document.createElement('div');row.className='points-avatar-row';var name=document.createElement('span');name.textContent=n+' '+roster[n][0];row.appendChild(name);var select=document.createElement('select');select.setAttribute('aria-label',n+' 號角色');labels.forEach(function(label,i){var o=document.createElement('option');o.value=i;o.textContent=label;select.appendChild(o);});select.value=settingsDraft.avatars[n]===undefined?n%8:settingsDraft.avatars[n];select.onchange=function(){settingsDraft.avatars[n]=Number(select.value);};row.appendChild(select);avatars.appendChild(row);});el('points-settings-muted').checked=settingsDraft.muted;
    }
    function validatedDraft(){var s=copy(settingsDraft),seen={};s.muted=el('points-settings-muted').checked;if(!s.items.length||s.items.length>40)throw Error('請保留 1～40 個項目。');s.items.forEach(function(i){i.label=i.label.trim();if(!i.label||!Number.isInteger(i.delta)||!i.delta||Math.abs(i.delta)>100)throw Error('項目名稱不可空白，分值須為 −100～100 的非零整數。');});if(!s.items.some(function(i){return i.delta>0;})||!s.items.some(function(i){return i.delta<0;}))throw Error('必須保留至少一個加點與扣點項目。');if(s.groups.length>16)throw Error('小組最多 16 組。');s.groups.forEach(function(g){g.name=g.name.trim();if(!g.name)throw Error('小組名稱不可空白。');if(g.seatsText!==undefined){var raw=g.seatsText.trim();g.seats=raw?raw.split(/[\s,，、]+/).map(Number):[];delete g.seatsText;}g.seats.forEach(function(n){if(!Number.isInteger(n)||!roster[n])throw Error('小組成員須填有效座號。');if(seen[n])throw Error(n+' 號重複加入小組，每位學生最多一組。');seen[n]=true;});});return s;}
    function saveSettings(){var s,revision=draftRevision;try{s=validatedDraft();}catch(e){el('points-settings-message').textContent=e.message;return;}if(!cloud){var next=copy(state);next.bundle.settings=s;next.bundle.revision++;if(store(next)){modal('points-settings-modal',false);render();}return;}el('points-settings-save').disabled=true;serial(async function(){try{await flush();var result=await rpc('savePointSettings',[s,revision]);var next=copy(state);next.bundle.settings=result.settings;next.bundle.revision=result.revision;if(!store(next))throw Error('雲端設定已儲存，本機儲存失敗，請重新同步。');modal('points-settings-modal',false);render();}catch(e){el('points-settings-message').textContent=e.message+'。草稿已保留；重新載入最新設定會捨棄草稿，或按取消稍後處理。';el('points-settings-reload').hidden=false;}finally{el('points-settings-save').disabled=false;}});}
    function init(){roster=window.c408SeatRoster||{};var raw;try{raw=localStorage.getItem(key);stateRaw=raw;state=raw?JSON.parse(raw):null;}catch(e){message('本機資料無法讀取，請保留瀏覽器資料並聯絡管理者。');return false;}if(!state)state={bundle:{events:[],settings:null,revision:0},defaults:defaults(),pending:[],lastUndo:null,undoStack:[],device:'device_'+id()};if(!state.bundle||!Array.isArray(state.bundle.events)||!Array.isArray(state.pending)){message('本機資料格式異常，請勿清除資料，請聯絡管理者。');return false;}if(!Array.isArray(state.undoStack))state.undoStack=state.lastUndo?[state.lastUndo]:[];reconcileUndo(state);ready=true;
        el('points-all').onclick=function(){selected=seats();render();openAward();};el('points-award-selected').onclick=openAward;el('points-multi').onclick=function(){multi=!multi;selected=[];render();};el('points-view-students').onclick=function(){view='students';render();};el('points-view-groups').onclick=function(){view='groups';render();};el('points-award-positive').onclick=function(){negative=false;awardItems();};el('points-award-negative').onclick=function(){negative=true;awardItems();};el('points-award-close').onclick=function(){modal('points-award',false);};el('points-undo').onclick=undo;el('points-reset').onclick=reset;el('points-refresh').onclick=function(){sync(true);};el('points-history').onclick=history;el('points-history-close').onclick=function(){modal('points-history-modal',false);};el('points-history-student').onchange=renderHistory;el('points-history-date').onchange=renderHistory;el('points-settings').onclick=openSettings;el('points-settings-cancel').onclick=function(){modal('points-settings-modal',false);};el('points-settings-save').onclick=saveSettings;el('points-settings-add-item').onclick=function(){settingsDraft.items.push({id:id(),label:'新項目',delta:1});renderSettings();};el('points-settings-add-group').onclick=function(){settingsDraft.groups.push({id:id(),name:'新小組',seats:[]});renderSettings();};el('points-settings-reload').onclick=function(){serial(async function(){var bundle=await rpc('getPointBundle',[]);var next=copy(state);next.bundle=bundle;if(store(next)){openSettings();render();}});};
        document.addEventListener('keydown',function(e){var dialog=document.querySelector('.points-modal:not([hidden])');if(!dialog)return;if(e.key==='Escape'){modal(dialog.id,false);return;}if(e.key==='Tab'){var controls=Array.from(dialog.querySelectorAll('button,input,select')).filter(function(n){return !n.disabled&&!n.hidden&&n.getClientRects().length;});if(!controls.length)return;var first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
        window.addEventListener('focus',function(){if(window.c408CurrentTab==='points'&&!document.hidden)sync(true);});document.addEventListener('visibilitychange',function(){if(!document.hidden&&window.c408CurrentTab==='points')sync(true);});setInterval(function(){if(window.c408CurrentTab==='points'&&!document.hidden&&!busy)sync(true);},15000);return true;
    }
    window.c408PointsShow=function(){if(!ready&&!init())return;render();sync(true);};
})();
