(function () {
    'use strict';
    var cloud = !!(window.google && google.script && google.script.run);
    var key = cloud ? 'c408_points_cloud/state' : 'c408_points_local/state';
    var state, stateRaw = null, roster, ready = false, selected = [], multi = false, view = 'students', negative = false;
    var chain = Promise.resolve(), busy = 0, lastError = '', lastSync = '', settingsDraft = null, draftRevision = 0;
    var feedback=null;
    var avatarTarget=null, notice='';
    function el(id) { return document.getElementById(id); }
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    function id() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,11); }
    function defaults() {
        var names = {}; try { names = JSON.parse(localStorage.getItem('groupNames') || '{}'); } catch (_) {}
        var groups = []; for (var i=1;i<=8;i++) groups.push({id:'g'+i,name:names[i] || ('第 '+i+' 組'),seats:[]});
        return {items:[{id:'focus',label:'認真上課',delta:1},{id:'help',label:'主動幫忙',delta:1},{id:'teamwork',label:'合作',delta:1},{id:'unfinished',label:'未完成任務',delta:-1},{id:'disrupt',label:'影響秩序',delta:-1}],avatars:{},groups:groups,muted:false,avatarCost:5};
    }
    function store(next) {
        try {
            if(localStorage.getItem(key)!==stateRaw){message('另一個分頁已更新本機資料，這次操作未接受。請重新整理此頁，保留其他分頁的待同步操作。');return false;}
            var serialized=JSON.stringify(next);localStorage.setItem(key,serialized);stateRaw=serialized;state = next;return true;
        }
        catch (_) { message('本機儲存失敗：請確認瀏覽器允許儲存並有足夠空間，再重試。這次操作尚未接受。'); return false; }
    }
    function message(s) { el('points-message').textContent = s || ''; if(s&&el('seat-points-feedback'))el('seat-points-feedback').textContent='集點：'+s; }
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
        if(el('seat-points-feedback'))el('seat-points-feedback').textContent='集點：'+el('points-status').textContent+(cloud&&(state.pending.length||lastError)?' · 到「班級集點」按「重新同步」重試':'');
    }
    function allEvents() {
        var events = [], known = {};
        state.bundle.events.forEach(function(e){if(!known[e.id]){known[e.id]=true;events.push(e);}});
        state.pending.forEach(function(b){if(b.type==='score')b.seats.forEach(function(s){var eid=b.id+':'+s.seat;if(!known[eid]){known[eid]=true;events.push({id:eid,batchId:b.id,time:b.time,seat:s.seat,name:s.name,itemId:b.itemId||'',label:b.label,delta:b.delta,type:b.type,pending:true});}});});
        return events;
    }
    function totals() { var t={};allEvents().forEach(function(e){t[e.seat]=(t[e.seat]||0)+e.delta;});return t; }
    function avatar(n) { return window.c408PointAvatars.svg(n); }
    function avatarCost(){var c=settings().avatarCost;return Number.isInteger(c)&&c>=1&&c<=100?c:5;}
    function avatarIndex(itemId){var m=/^avatar:(\d{1,2})$/.exec(itemId||'');return m&&Number(m[1])<=23?Number(m[1]):null;}
    // 角色由「最後一筆未復原的換角色扣點」決定；沒有就用設定裡的初始角色。
    function avatarMap(){var map={},undone={},events=allEvents(),base=settings().avatars;seats().forEach(function(n){map[n]=base[n]===undefined?n%8:base[n];});events.forEach(function(e){if(e.type==='undo')undone[e.originalBatchId]=true;});state.pending.forEach(function(b){if(b.type==='undo')undone[b.originalBatchId]=true;});events.forEach(function(e){var idx=avatarIndex(e.itemId);if(idx!==null&&e.type==='score'&&!undone[e.batchId]&&roster[e.seat])map[e.seat]=idx;});return map;}
    // 秩序「本節依登記次數扣點」：每生一筆，編號 seatpd_<節>_s<座號>_to<累計登記次數>；已扣＝該節未復原的扣點合計。
    function seatSlotId(slot){return String(slot).replace('#','_p').replace(/[^A-Za-z0-9_-]/g,'');}
    function seatDeductedMap(slot){var prefix='seatpd_'+seatSlotId(slot)+'_s',undone={},out={};allEvents().forEach(function(e){if(e.type==='undo')undone[e.originalBatchId]=true;});state.pending.forEach(function(b){if(b.type==='undo')undone[b.originalBatchId]=true;});allEvents().forEach(function(e){if(e.type==='score'&&String(e.batchId).indexOf(prefix)===0&&!undone[e.batchId]&&e.delta<0)out[e.seat]=(out[e.seat]||0)-e.delta;});return out;}
    function seatDeductPlan(slot,counts){var done=seatDeductedMap(slot),seen={};Object.keys(counts||{}).concat(Object.keys(done)).forEach(function(n){seen[Number(n)]=true;});return Object.keys(seen).map(Number).filter(function(n){return roster[n];}).sort(function(a,b){return a-b;}).map(function(n){var count=Math.max(0,Number(counts[n])||0),d=done[n]||0;return {seat:n,name:roster[n][0],count:count,done:d,remaining:Math.max(0,count-d)};}).filter(function(x){return x.count>0||x.done>0;});}
    function decorateSeat(card,t,map,ded) {
        if(!ready||!card)return;
        var n=Number(card.dataset.seat), icon=card.querySelector('.seat-point-avatar'), score=card.querySelector('.seat-point-score');
        if(!roster[n]||!icon||!score)return;
        var choice=(map||avatarMap())[n];
        if(icon.dataset.avatar!==String(choice)){icon.innerHTML=avatar(choice);icon.dataset.avatar=String(choice);}
        score.textContent=(t||totals())[n]||0;
        if(ded===undefined){var activeSlot=window.c408SeatActiveSlot&&window.c408SeatActiveSlot();ded=activeSlot?seatDeductedMap(activeSlot):{};}
        var badge=card.querySelector('.seat-deduct-badge');
        if(ded[n]){if(!badge){badge=document.createElement('span');badge.className='seat-deduct-badge';card.appendChild(badge);}badge.textContent='已扣 '+ded[n];badge.title='本節已依登記次數扣 '+ded[n]+' 點';}else if(badge)badge.remove();
        score.setAttribute('aria-label',score.textContent+' 點');
        if(!card.isConnected&&feedback&&Date.now()<feedback.until&&feedback.list.indexOf(n)>=0)floatOn(card,(feedback.delta>0?'+':'')+feedback.delta,feedback.delta);
    }
    function renderSeatPoints(){var t=totals(),map=avatarMap(),slot=window.c408SeatActiveSlot&&window.c408SeatActiveSlot(),ded=slot?seatDeductedMap(slot):{};document.querySelectorAll('#seat-chart [data-seat]').forEach(function(card){decorateSeat(card,t,map,ded);});if(window.c408SeatRefreshDeduct)window.c408SeatRefreshDeduct();}
    function button(text, fn, cls) { var b=document.createElement('button');b.type='button';b.textContent=text;if(cls)b.className=cls;b.onclick=fn;return b; }
    function render() {
        var t=totals(), map=avatarMap(), box=el('points-students');el('points-class-total').textContent='全班 '+seats().reduce(function(sum,n){return sum+(t[n]||0);},0)+' 點';box.textContent='';
        seats().forEach(function(n){
            var b=button('',function(){if(multi){var at=selected.indexOf(n);if(at<0)selected.push(n);else selected.splice(at,1);render();}else{selected=[n];render();openAward();}},'points-card'+(selected.indexOf(n)>=0?' selected':''));
            b.dataset.pointSeat=n;b.innerHTML=avatar(map[n]);
            var s=document.createElement('span');s.className='points-seat';s.textContent=n+' 號';b.appendChild(s);
            s=document.createElement('span');s.className='points-name';s.textContent=roster[n][0];b.appendChild(s);
            s=document.createElement('strong');s.className='points-score';s.textContent=t[n]||0;b.appendChild(s);box.appendChild(b);
        });
        box.hidden=view==='groups';var groups=el('points-groups');groups.textContent='';groups.hidden=view!=='groups';
        settings().groups.forEach(function(g){var node=document.createElement('div');node.className='points-group';node.dataset.pointGroup=g.id;var title=document.createElement('strong');title.textContent=g.name+' · '+g.seats.reduce(function(sum,n){return sum+(t[n]||0);},0)+' 點';node.appendChild(title);var names=document.createElement('p');names.className='points-help';names.textContent=g.seats.map(function(n){return n+' '+roster[n][0];}).join('、')||'尚未設定成員';node.appendChild(names);var b=g.seats.length?button('整組加扣點',function(){selected=g.seats.slice();openAward();}):button('設定小組成員',openSettings);node.appendChild(b);groups.appendChild(node);});
        if(!settings().groups.length){var empty=document.createElement('div');empty.className='points-empty';empty.textContent='尚未設定小組，先加入組名與成員就能整組加扣點。';empty.appendChild(button('設定小組',openSettings));groups.appendChild(empty);}
        el('points-selected-count').textContent=selected.length?'已選 '+selected.length+' 人':'點學生卡片加扣點';
        el('points-multi').textContent=multi?'✓ 多選中':'多選學生';renderSeatPoints();status();showFeedback();
    }
    var previousFocus={};
    function modal(id,show) {el(id).hidden=!show;if(show){previousFocus[id]=document.activeElement;var focus=el(id).querySelector('button,input,select');if(focus)focus.focus();}else if(previousFocus[id]){previousFocus[id].focus();delete previousFocus[id];}}
    function openAward(){if(!selected.length){message('請先選取學生，或在設定中加入小組成員。');return;}negative=false;el('points-auction-value').value='';el('points-auction-message').textContent='';el('points-award-title').textContent='為 '+selected.length+' 位學生加扣點';var change=el('points-award-avatar');change.hidden=selected.length!==1;change.textContent='🎭 換角色（扣 '+avatarCost()+' 點）';awardItems();modal('points-award',true);}
    function awardItems(){el('points-auction').hidden=!negative;var box=el('points-award-items');box.textContent='';[1,2,3,4,5].forEach(function(n){var delta=negative?-n:n;box.appendChild(button((negative?'−':'+')+n,function(){score({id:'quick_'+(negative?'minus_':'plus_')+n,label:negative?'扣點':'加點',delta:delta});},'points-primary'));});}
    function auction(){var raw=el('points-auction-value').value.trim(), amount=Number(raw);if(!/^\d+$/.test(raw)||!Number.isInteger(amount)||amount<1||amount>1000000){el('points-auction-message').textContent='請輸入 1～1,000,000 的正整數。';return;}score({id:'auction',label:'拍賣扣點',delta:-amount});}
    function celebrate(card){if(!card||feedback.delta<=0)return;card.classList.add('points-celebrate');setTimeout(function(){card.classList.remove('points-celebrate');},Math.max(0,feedback.until-Date.now()));}
    function floatOn(card,text,delta){if(!card)return;var s=document.createElement('span');s.className='points-float'+(delta<0?' points-negative':'');s.textContent=text;card.appendChild(s);celebrate(card);setTimeout(function(){s.remove();},Math.max(0,feedback.until-Date.now()));}
    function showFeedback(){if(!feedback||Date.now()>=feedback.until)return;var list=feedback.list,delta=feedback.delta,value=(delta>0?'+':'')+delta;Array.from(document.querySelectorAll('#panel-points .points-float,#seat-chart .points-float')).forEach(function(n){n.remove();});if(view==='groups'){settings().groups.forEach(function(g){var count=g.seats.filter(function(n){return list.indexOf(n)>=0;}).length;if(!count)return;var card=Array.from(el('points-groups').children).find(function(n){return n.dataset.pointGroup===g.id;});floatOn(card,(count===g.seats.length?'每人 ':count+' 人各 ')+value,delta);});}else list.forEach(function(n){floatOn(document.querySelector('[data-point-seat="'+n+'"]'),value,delta);});list.forEach(function(n){floatOn(document.querySelector('#seat-chart [data-seat="'+n+'"]'),value,delta);});}
    function playSound(delta,kind,preview){if(!preview&&settings().muted)return;kind=kind||settings().sound||'chime';var patterns={chime:[[620,0,.18]],dingdong:[[880,0,.15],[660,.16,.22]],levelup:[[523,0,.1],[659,.11,.1],[784,.22,.2]],sparkle:[[1047,0,.07],[1319,.08,.07],[1568,.16,.18]]};try{var ac=new(window.AudioContext||window.webkitAudioContext)();(patterns[kind]||patterns.chime).forEach(function(note){var o=ac.createOscillator(),g=ac.createGain(),start=ac.currentTime+note[1];o.connect(g);g.connect(ac.destination);o.frequency.value=note[0]*(delta<0?.65:1);g.gain.setValueAtTime(.001,start);g.gain.linearRampToValueAtTime(.055,start+.012);g.gain.exponentialRampToValueAtTime(.001,start+note[2]);o.start(start);o.stop(start+note[2]+.025);});setTimeout(function(){ac.close();},800);}catch(e){if(preview)settingsNotice('這台裝置無法播放音效，請檢查瀏覽器聲音設定。',true);}}
    // 測驗平台交卷達標由後端匯入；同步收到新的加點時，照手動加點一樣播放效果並顯示原因。
    function announceArrivals(before,events){var fresh=events.filter(function(e){return !before[e.id]&&e.device==='quiz408'&&e.delta>0&&Date.now()-Date.parse(e.time)<600000&&roster[e.seat];});if(!fresh.length)return;var groups={};fresh.forEach(function(e){(groups[e.delta]=groups[e.delta]||[]).push(e.seat);});Object.keys(groups).sort(function(a,b){return b-a;}).forEach(function(delta,i){setTimeout(function(){animate(groups[delta],Number(delta));},i*1300);});notice='🎉 '+fresh.map(function(e){return e.seat+' 號 '+roster[e.seat][0]+' +'+e.delta+'（'+String(e.label||'').replace(/^測驗加點：/,'')+'）';}).join('、');var shown=notice;message(notice);setTimeout(function(){if(notice===shown){notice='';message('');}},60000);}
    function animate(list,delta){feedback={list:list.slice(),delta:delta,until:Date.now()+1100};showFeedback();playSound(delta);}
    function score(item){var b={id:id(),type:'score',seats:targets(selected),itemId:item.id,label:item.label,delta:item.delta,device:state.device,time:new Date().toISOString()};if(enqueue(b)){modal('points-award',false);animate(selected,item.delta);}}
    function localApply(next,b){var events=next.bundle.events, list=b.seats;
        if(b.type==='undo')list=events.filter(function(e){return e.batchId===b.originalBatchId;}).map(function(e){return {seat:e.seat,name:e.name,delta:-e.delta};});
        list.forEach(function(s){var d=b.type==='score'?b.delta:b.type==='undo'?s.delta:-events.filter(function(e){return e.seat===s.seat;}).reduce(function(sum,e){return sum+e.delta;},0);events.push({id:b.id+':'+s.seat,batchId:b.id,time:b.time,seat:s.seat,name:s.name,itemId:b.itemId||'',label:b.type==='undo'?'復原':b.type==='reset'?'歸零':b.label,delta:d,type:b.type,originalBatchId:b.originalBatchId||'',device:b.device});});
    }
    function reconcileUndo(next){var undone={};next.bundle.events.forEach(function(e){if(e.type==='undo')undone[e.originalBatchId]=true;});next.undoStack=next.undoStack.filter(function(batchId){return !undone[batchId];});next.lastUndo=next.undoStack.length?next.undoStack[next.undoStack.length-1]:null;}
    function enqueue(b){var next=copy(state);if(cloud)next.pending.push(b);else localApply(next,b);if(b.type==='score')next.undoStack.push(b.id);else if(b.type==='undo')next.undoStack=next.undoStack.filter(function(batchId){return batchId!==b.originalBatchId;});else next.undoStack=[];reconcileUndo(next);if(!store(next))return false;lastError='';notice='';message('');render();if(cloud)sync(false);return true;}
    async function flush(){while(state.pending.length){var b=state.pending[0], bundle;try{bundle=await rpc('commitPointBatch',[b]);}catch(e){var text=e&&e.message||String(e);if(String(b.id).indexOf('seatpd_')===0&&/批次編號內容衝突/.test(text)){var same=copy(state);same.pending.shift();same.undoStack=same.undoStack.filter(function(x){return x!==b.id;});reconcileUndo(same);if(!store(same))throw e;render();continue;}if(avatarIndex(b.itemId)===null||!/點數不足|換角色扣點已改為/.test(text))throw e;var dropped=copy(state);dropped.pending.shift();dropped.undoStack=dropped.undoStack.filter(function(x){return x!==b.id;});reconcileUndo(dropped);if(!store(dropped))throw e;render();notice='換角色沒有完成：'+text.replace(/^(Error:\s*)?永久：/,'')+'。角色與點數維持原樣。';message(notice);continue;}var next=copy(state);next.bundle=bundle;next.pending.shift();reconcileUndo(next);if(!store(next))throw Error('雲端可能已接受操作，但本機儲存失敗。待送編號已保留，請恢復儲存後重新同步');render();} }
    function sync(pull){if(!cloud)return;return serial(async function(){await flush();var before=null;if(pull){before={};state.bundle.events.forEach(function(e){before[e.id]=true;});var bundle=await rpc('getPointBundle',[]);var next=copy(state);next.bundle=bundle;reconcileUndo(next);if(!store(next))throw Error('同步資料無法儲存');}lastError='';lastSync=new Date().toLocaleTimeString();message(notice);render();if(before)announceArrivals(before,state.bundle.events);});}
    function undo(){if(state.pending.length){message('請先完成待同步操作。');return;}if(!state.lastUndo)return;enqueue({id:'undo:'+state.lastUndo,type:'undo',originalBatchId:state.lastUndo,device:state.device,time:new Date().toISOString()});}
    function reset(){if(state.pending.length){message('請先完成待同步操作。');return;}var list=selected.length?selected.slice():seats();if(!window.confirm('確定將'+(selected.length?'選取的 '+list.length+' 位学生':'全班')+'點數歸零？歷史紀錄會保留。'))return;enqueue({id:id(),type:'reset',seats:targets(list),device:state.device,time:new Date().toISOString()});}
    function history(){var box=el('points-history-student');box.textContent='';var option=document.createElement('option');option.value='';option.textContent='全班';box.appendChild(option);seats().forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n+' '+roster[n][0];box.appendChild(o);});renderHistory();modal('points-history-modal',true);}
    function renderHistory(){var student=el('points-history-student').value,date=el('points-history-date').value,box=el('points-history-list');box.textContent='';allEvents().slice().reverse().filter(function(e){return (!student||Number(student)===e.seat)&&(!date||localDate(e.time)===date);}).forEach(function(e){var row=document.createElement('tr');[new Date(e.time).toLocaleString(),e.seat+' '+e.name,e.label+(avatarIndex(e.itemId)!==null?'：'+window.c408PointAvatars.labels[avatarIndex(e.itemId)]:'')+(e.type==='undo'?'（復原）':e.type==='reset'?'（歸零）':'')+(e.pending?' · 待同步':''),(e.delta>0?'+':'')+e.delta].forEach(function(s){var td=document.createElement('td');td.textContent=s;row.appendChild(td);});box.appendChild(row);});}
    function localDate(time){var d=new Date(time);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function input(value,type){var i=document.createElement('input');i.value=value;i.type=type||'text';return i;}
    function openSettings(){settingsDraft=copy(settings());if(!settingsDraft.groups.length)settingsDraft.groups=defaults().groups;draftRevision=state.bundle.revision;settingsNotice('');el('points-settings-reload').hidden=true;renderSettings();modal('points-settings-modal',true);}
    function renderSettings(){var items=el('points-settings-items');items.textContent='';settingsDraft.items.forEach(function(item,idx){var row=document.createElement('div');row.className='points-item-row';var name=input(item.label);name.maxLength=80;name.setAttribute('aria-label','項目名稱');name.oninput=function(){item.label=name.value;};var delta=input(item.delta,'number');delta.min=-100;delta.max=100;delta.setAttribute('aria-label','項目分值');delta.oninput=function(){item.delta=Number(delta.value);};row.appendChild(name);row.appendChild(delta);row.appendChild(button('刪除',function(){settingsDraft.items.splice(idx,1);renderSettings();}));items.appendChild(row);});
        var groups=el('points-settings-groups');groups.textContent='';settingsDraft.groups.forEach(function(g,idx){var row=document.createElement('div');row.className='points-group-row';var name=input(g.name);name.maxLength=40;name.setAttribute('aria-label','小組名稱');name.oninput=function(){g.name=name.value;};var members=input(g.seats.join(', '));members.placeholder='座號，例如 1, 2, 3';members.setAttribute('aria-label','小組成員座號');members.oninput=function(){g.seatsText=members.value;};if(g.seatsText!==undefined)members.value=g.seatsText;row.appendChild(name);row.appendChild(members);row.appendChild(button('刪除',function(){settingsDraft.groups.splice(idx,1);renderSettings();}));groups.appendChild(row);});
        var avatars=el('points-settings-avatars'),map=avatarMap();avatars.textContent='';el('points-settings-avatar-cost').value=settingsDraft.avatarCost===undefined?5:settingsDraft.avatarCost;seats().forEach(function(n){var row=document.createElement('div');row.className='points-avatar-row';var name=document.createElement('span');name.textContent=n+' '+roster[n][0];row.appendChild(name);var idx=map[n];var picker=button('',function(){openAvatarGallery(n);},'points-avatar-picker');picker.innerHTML=avatar(idx);picker.dataset.avatar=idx;picker.dataset.pointAvatarSeat=n;picker.setAttribute('aria-label',n+' 號換角色，扣 '+avatarCost()+' 點');var caption=document.createElement('span');caption.textContent=window.c408PointAvatars.labels[idx]+' · 換角色';picker.appendChild(caption);row.appendChild(picker);avatars.appendChild(row);});el('points-settings-muted').checked=settingsDraft.muted;el('points-settings-sound').value=settingsDraft.sound||'chime';
    }
    function openAvatarGallery(seat){avatarTarget=seat;var current=seat===null?null:avatarMap()[seat];el('points-avatar-title').textContent=seat===null?'角色圖鑑 · 24 款':seat+' 號 '+roster[seat][0]+' · 換角色（扣 '+avatarCost()+' 點，目前 '+(totals()[seat]||0)+' 點）';var box=el('points-avatar-gallery');box.textContent='';el('points-avatar-preview').textContent='';window.c408PointAvatars.labels.forEach(function(label,idx){var choice=button('',function(){if(avatarTarget!==null){var chosenSeat=avatarTarget;if(!buyAvatar(chosenSeat,idx))return;modal('points-avatar-modal',false);if(!el('points-settings-modal').hidden){renderSettings();var restored=el('points-settings-avatars').querySelector('[data-point-avatar-seat="'+chosenSeat+'"]');if(restored)restored.focus();}}else{var preview=el('points-avatar-preview');preview.innerHTML=avatar(idx);var text=document.createElement('strong');text.textContent=label;preview.appendChild(text);Array.from(box.children).forEach(function(n){n.setAttribute('aria-pressed',n.dataset.avatar===String(idx)?'true':'false');});}},'points-avatar-choice');choice.dataset.avatar=idx;choice.setAttribute('aria-pressed',current===idx?'true':'false');choice.innerHTML=avatar(idx);var name=document.createElement('span');name.textContent=label;choice.appendChild(name);box.appendChild(choice);});modal('points-avatar-modal',true);}
    // 換角色＝一筆扣點；點數不足不能換，選目前的角色不扣點。
    function buyAvatar(seat,idx){var preview=el('points-avatar-preview');if(avatarMap()[seat]===idx)return true;var cost=avatarCost(),balance=totals()[seat]||0,label=window.c408PointAvatars.labels[idx];if(balance<cost){preview.textContent='點數不足：換角色需要 '+cost+' 點，'+seat+' 號目前 '+balance+' 點。';return false;}if(!window.confirm(seat+' 號 '+roster[seat][0]+' 換成「'+label+'」，扣 '+cost+' 點（目前 '+balance+' 點）？'))return false;var b={id:id(),type:'score',seats:targets([seat]),itemId:'avatar:'+idx,label:'更換角色',delta:-cost,device:state.device,time:new Date().toISOString()};if(!enqueue(b)){preview.textContent=el('points-message').textContent||'本機儲存失敗，角色沒有更換。';return false;}animate([seat],-cost);return true;}
    function validatedDraft(){var s=copy(settingsDraft),seen={};s.muted=el('points-settings-muted').checked;s.sound=el('points-settings-sound').value;s.avatarCost=Number(el('points-settings-avatar-cost').value);if(!Number.isInteger(s.avatarCost)||s.avatarCost<1||s.avatarCost>100)throw Error('換角色扣點須為 1～100 的整數。');if(!s.items.length||s.items.length>40)throw Error('請保留 1～40 個項目。');s.items.forEach(function(i){i.label=i.label.trim();if(!i.label||!Number.isInteger(i.delta)||!i.delta||Math.abs(i.delta)>100)throw Error('項目名稱不可空白，分值須為 −100～100 的非零整數。');});if(!s.items.some(function(i){return i.delta>0;})||!s.items.some(function(i){return i.delta<0;}))throw Error('必須保留至少一個加點與扣點項目。');if(s.groups.length>16)throw Error('小組最多 16 組。');s.groups.forEach(function(g){g.name=g.name.trim();if(!g.name)throw Error('小組名稱不可空白。');if(g.seatsText!==undefined){var raw=g.seatsText.trim();g.seats=raw?raw.split(/[\s,，、]+/).map(Number):[];delete g.seatsText;}g.seats.forEach(function(n){if(!Number.isInteger(n)||!roster[n])throw Error('小組成員須填有效座號。');if(seen[n])throw Error(n+' 號重複加入小組，每位學生最多一組。');seen[n]=true;});});return s;}
    function settingsNotice(text,error){el('points-settings-message').textContent=text;var notice=el('points-settings-feedback');notice.textContent=text;notice.classList.toggle('points-save-error',!!error);if(text&&!el('points-settings-modal').hidden)notice.scrollIntoView({block:'nearest'});}
    function saveSettings(){var s,revision=draftRevision;try{s=validatedDraft();}catch(e){settingsNotice(e.message,true);return;}if(!cloud){var next=copy(state);next.bundle.settings=s;next.bundle.revision++;if(store(next)){modal('points-settings-modal',false);render();message('設定已儲存（本機）。');}else settingsNotice('本機儲存失敗，請確認瀏覽器儲存空間與權限。',true);return;}var saveButton=el('points-settings-save');saveButton.disabled=true;saveButton.textContent='儲存中…';settingsNotice('正在儲存設定，請稍候…');serial(async function(){try{await flush();var result=await rpc('savePointSettings',[s,revision]);var next=copy(state);next.bundle.settings=result.settings;next.bundle.revision=result.revision;if(!store(next))throw Error('雲端設定已儲存，本機儲存失敗，請重新同步。');modal('points-settings-modal',false);render();message('設定已儲存並同步至雲端。');}catch(e){settingsNotice(e.message+'。草稿已保留；可重新載入最新設定（會捨棄草稿），或取消稍後處理。',true);el('points-settings-reload').hidden=false;}finally{saveButton.disabled=false;saveButton.textContent='儲存設定';}});}
    function init(){roster=window.c408SeatRoster||{};var raw;try{raw=localStorage.getItem(key);stateRaw=raw;state=raw?JSON.parse(raw):null;}catch(e){message('本機資料無法讀取，請保留瀏覽器資料並聯絡管理者。');return false;}if(!state)state={bundle:{events:[],settings:null,revision:0},defaults:defaults(),pending:[],lastUndo:null,undoStack:[],device:'device_'+id()};if(!state.bundle||!Array.isArray(state.bundle.events)||!Array.isArray(state.pending)){message('本機資料格式異常，請勿清除資料，請聯絡管理者。');return false;}if(!Array.isArray(state.undoStack))state.undoStack=state.lastUndo?[state.lastUndo]:[];reconcileUndo(state);ready=true;
        el('points-all').onclick=function(){selected=seats();render();openAward();};el('points-award-selected').onclick=openAward;el('points-multi').onclick=function(){multi=!multi;selected=[];render();};el('points-view-students').onclick=function(){view='students';render();};el('points-view-groups').onclick=function(){view='groups';render();};el('points-award-positive').onclick=function(){negative=false;awardItems();};el('points-award-negative').onclick=function(){negative=true;awardItems();};el('points-auction-submit').onclick=auction;el('points-award-close').onclick=function(){modal('points-award',false);};el('points-award-avatar').onclick=function(){var seat=selected[0];modal('points-award',false);openAvatarGallery(seat);};el('points-undo').onclick=undo;el('points-reset').onclick=reset;el('points-refresh').onclick=function(){sync(true);};el('points-history').onclick=history;el('points-history-close').onclick=function(){modal('points-history-modal',false);};el('points-history-student').onchange=renderHistory;el('points-history-date').onchange=renderHistory;el('points-settings-sound').onchange=function(){if(settingsDraft)settingsDraft.sound=this.value;};el('points-settings-sound-preview').onclick=function(){playSound(1,el('points-settings-sound').value,true);};el('points-settings-muted').onchange=function(){if(settingsDraft)settingsDraft.muted=this.checked;};el('points-avatar-close').onclick=function(){modal('points-avatar-modal',false);};el('points-avatars-browse').onclick=function(){openAvatarGallery(null);};el('points-settings').onclick=openSettings;el('points-settings-cancel').onclick=function(){modal('points-settings-modal',false);};el('points-settings-save').onclick=saveSettings;el('points-settings-add-item').onclick=function(){settingsDraft.items.push({id:id(),label:'新項目',delta:1});renderSettings();};el('points-settings-add-group').onclick=function(){settingsDraft.groups.push({id:id(),name:'新小組',seats:[]});renderSettings();};el('points-settings-reload').onclick=function(){serial(async function(){var bundle=await rpc('getPointBundle',[]);var next=copy(state);next.bundle=bundle;if(store(next)){openSettings();render();}});};
        document.addEventListener('keydown',function(e){var dialogs=Array.from(document.querySelectorAll('.points-modal:not([hidden])')),dialog=dialogs[dialogs.length-1];if(!dialog)return;if(e.key==='Escape'){modal(dialog.id,false);return;}if(e.key==='Tab'){var controls=Array.from(dialog.querySelectorAll('button,input,select')).filter(function(n){return !n.disabled&&!n.hidden&&n.getClientRects().length;});if(!controls.length)return;var first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
        window.addEventListener('focus',function(){if((window.c408CurrentTab==='points'||window.c408CurrentTab==='seat')&&!document.hidden)sync(true);});document.addEventListener('visibilitychange',function(){if(!document.hidden&&(window.c408CurrentTab==='points'||window.c408CurrentTab==='seat'))sync(true);});setInterval(function(){if((window.c408CurrentTab==='points'||window.c408CurrentTab==='seat')&&!document.hidden&&!busy)sync(true);},15000);return true;
    }
    window.c408PointsDecorateSeat=function(card){decorateSeat(card);};
    window.c408PointsSeatDeductPlan=function(slot,counts){if(!ready&&!init())return null;return seatDeductPlan(slot,counts);};
    // 依登記次數扣點：只補扣尚未扣的次數；整批一次寫入本機，任何一筆失敗就全部不接受。
    window.c408PointsDeductSeatCounts=function(request){
        if(!ready&&!init())return {accepted:false,error:el('points-message').textContent||'集點資料無法讀取。'};
        if(!request||typeof request.slot!=='string'||!/^\d{4}-\d{2}-\d{2}(#[A-Za-z0-9]+)?$/.test(request.slot)||!request.counts)return {accepted:false,error:'請先選一節再扣點。'};
        var plan=seatDeductPlan(request.slot,request.counts).filter(function(x){return x.remaining>0;});
        if(!plan.length)return {accepted:true,duplicate:true,deducted:[]};
        var known={};allEvents().forEach(function(e){known[e.batchId]=true;});state.pending.forEach(function(b){known[b.id]=true;});
        var next=copy(state),time=new Date().toISOString(),done=[];
        plan.forEach(function(x){var id='seatpd_'+seatSlotId(request.slot)+'_s'+x.seat+'_to'+x.count;if(known[id])return;var b={id:id,type:'score',seats:targets([x.seat]),itemId:'seat_period_deduct',label:('秩序登記：'+String(request.label||request.slot)+' 登記 '+x.count+' 次').slice(0,80),delta:-x.remaining,device:state.device,time:time};if(cloud)next.pending.push(b);else localApply(next,b);next.undoStack.push(id);done.push({seat:x.seat,delta:-x.remaining});});
        if(!done.length)return {accepted:true,duplicate:true,deducted:[]};
        reconcileUndo(next);
        if(!store(next))return {accepted:false,error:el('points-message').textContent||'本機儲存失敗，這次扣點尚未接受。'};
        lastError='';notice='';message('');render();if(cloud)sync(false);
        var groups={};done.forEach(function(x){(groups[x.delta]=groups[x.delta]||[]).push(x.seat);});
        Object.keys(groups).sort(function(a,b){return a-b;}).forEach(function(delta,i){setTimeout(function(){animate(groups[delta],Number(delta));},i*1300);});
        status();return {accepted:true,duplicate:false,deducted:done};
    };
    window.c408PointsShow=function(){if(!ready&&!init())return;render();sync(true);};
    window.c408PointsSeatShow=function(){if(!ready&&!init())return;render();sync(true);};
    window.c408PointsBatchFromSeat=function(request){
        if(!ready&&!init())return {accepted:false,error:el('points-message').textContent||'集點資料無法讀取。'};
        if(!request||!Array.isArray(request.seats)||!request.seats.length||request.seats.some(function(n){return !Number.isInteger(n)||!roster[n];})||!Number.isInteger(request.delta)||request.delta>=0||request.delta<-5||typeof request.id!=='string'||!/^[-A-Za-z0-9_:]{1,100}$/.test(request.id))return {accepted:false,error:'請選擇有效學生及每人扣 1～5 點。'};
        var list=Array.from(new Set(request.seats)).sort(function(a,b){return a-b;});
        var pending=state.pending.find(function(b){return b.id===request.id;});
        var confirmed=state.bundle.events.filter(function(e){return e.batchId===request.id;});
        var itemId='seat_batch_points_minus_'+Math.abs(request.delta);
        if(pending||confirmed.length){
            var entries=pending?pending.seats:confirmed;
            var actual=entries.map(function(e){return e.seat;}).sort(function(a,b){return a-b;});
            var same=JSON.stringify(actual)===JSON.stringify(list)&&(pending?pending.type==='score'&&pending.delta===request.delta&&pending.itemId===itemId:confirmed.every(function(e){return e.type==='score'&&e.delta===request.delta&&e.itemId===itemId;}));
            if(!same)return {accepted:false,error:'這個計分編號已用於不同操作，請取消後重新開啟扣點視窗。'};
            status();return {accepted:true,duplicate:true};
        }
        var b={id:request.id,type:'score',seats:targets(list),itemId:itemId,label:'秩序登記：本節批次扣點',delta:request.delta,device:state.device,time:new Date().toISOString()};
        if(!enqueue(b))return {accepted:false,error:el('points-message').textContent||'本機儲存失敗，這次集點尚未接受。'};
        animate(list,request.delta);status();return {accepted:true,duplicate:false};
    };
    window.c408PointsFromSeat=function(request){
        if(!ready&&!init())return {accepted:false,error:el('points-message').textContent||'集點資料無法讀取。'};
        if(!request||!Number.isInteger(request.seat)||!roster[request.seat]||!Number.isInteger(request.delta)||!request.delta||Math.abs(request.delta)>5||typeof request.id!=='string'||!/^[-A-Za-z0-9_:]{1,100}$/.test(request.id))return {accepted:false,error:'請選擇有效學生及加扣 1～5 點。'};
        var pending=state.pending.find(function(b){return b.id===request.id;});
        var confirmed=state.bundle.events.filter(function(e){return e.batchId===request.id;});
        if(pending||confirmed.length){
            var same=pending?pending.type==='score'&&pending.delta===request.delta&&pending.seats.length===1&&pending.seats[0].seat===request.seat:confirmed.length===1&&confirmed[0].type==='score'&&confirmed[0].seat===request.seat&&confirmed[0].delta===request.delta;
            if(!same)return {accepted:false,error:'這個計分編號已用於不同操作，請關閉後重新開啟學生視窗。'};
            status();return {accepted:true,duplicate:true};
        }
        var b={id:request.id,type:'score',seats:targets([request.seat]),itemId:'seat_points_'+(request.delta>0?'plus_':'minus_')+Math.abs(request.delta),label:'秩序登記：'+(request.delta>0?'加點':'扣點'),delta:request.delta,device:state.device,time:new Date().toISOString()};
        if(!enqueue(b))return {accepted:false,error:el('points-message').textContent||'本機儲存失敗，這次集點尚未接受。'};
        animate([request.seat],request.delta);status();return {accepted:true,duplicate:false};
    };
})();
