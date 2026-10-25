/* Board score state is separate from the timer's local score store. */
(function(root) {
    'use strict';
    function createBoardScoreSync(options) {
        var key = 'c408_board_score_sync_v1', epoch = 0, busy = false, polling = false;
        var state = {linked:false,engaged:false,snapshot:null,preview:null,pending:null,last:null,online:false,message:'尚未連動',context:null,cid:null,storageBlocked:false};
        function identifier(v,client) {return typeof v==='string' && (client?/^[A-Za-z0-9_-]{8,64}$/:/^[A-Za-z0-9_-]{1,80}$/).test(v);}
        function record(value,keys) {return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && Object.keys(value).every(function(k){return keys.indexOf(k)!==-1;});}
        function validData(type,d) {
            var keys=type==='adjust_group_score'?['group','delta','label','expected_state_version']:type==='clear_group_scores'?['expected_state_version']:type==='undo_score_transaction'?['target_id','expected_state_version']:null;
            if(!keys || !record(d,keys) || !Number.isSafeInteger(d.expected_state_version) || d.expected_state_version<0)return false;
            if(type==='clear_group_scores')return true;
            if(type==='undo_score_transaction')return identifier(d.target_id,false);
            return Number.isInteger(d.group) && d.group>=1 && d.group<=8 && Number.isInteger(d.delta) && d.delta!==0 && Math.abs(d.delta)<=100 && typeof d.label==='string' && d.label.length<=160;
        }
        function validPending(p) {
            return record(p,['session_id','cid','op']) && identifier(p.session_id,false) && identifier(p.cid,true) && record(p.op,['op_id','type','data']) && identifier(p.op.op_id,false) && validData(p.op.type,p.op.data);
        }
        function validLast(last) {
            return record(last,['id','session_id','type','data']) && identifier(last.id,false) && /^p[0-9]+$/.test(last.id) && identifier(last.session_id,false) && ['adjust_group_score','clear_group_scores'].indexOf(last.type)!==-1 && validData(last.type,last.data);
        }
        try {
            var raw=options.storage.getItem(key),saved=raw===null?null:JSON.parse(raw);
            if(saved!==null && (!record(saved,['cid','pending','last']) || !identifier(saved.cid,true) || (saved.pending!==null && (!validPending(saved.pending) || saved.pending.cid!==saved.cid))))throw Error('invalid saved state');
            if (saved!==null) { state.pending=saved.pending; state.last=validLast(saved.last)?saved.last:null; state.cid=saved.cid; }
        } catch(e) { state.storageBlocked=true;state.engaged=true;state.message='連動紀錄無法讀取，已停止同步並保留原紀錄，請交由維護者檢查。'; }
        state.cid = state.cid || options.id();
        if(state.pending)state.message='有尚未確認的舊場操作，請先查詢結果；本場分數尚未讀取。';
        function emit() { if(options.change) options.change(state); }
        function persist() {
            if(state.storageBlocked)return false;
            try { options.storage.setItem(key,JSON.stringify({cid:state.cid,pending:state.pending,last:state.last})); return true; }
            catch(e) { state.message='無法保存待確認操作，已停止送出。';state.online=false;emit();return false; }
        }
        function valid(s) { return s && identifier(s.session_id,false) && Number.isSafeInteger(s.state_version) && s.state_version>=0 && s.groups && options.validate(s); }
        function writable() {
            return !state.storageBlocked && (!options.isOnline || options.isOnline()) && state.linked && state.online && !busy && !state.pending && state.snapshot && state.snapshot.status==='discussion' && state.snapshot.mode==='group' && state.context===options.context() && valid(state.snapshot);
        }
        function accept(s) {
            if(!valid(s)) {state.online=false;state.message='分組或名冊不符，請重新核對連動。';return false;}
            if(state.snapshot && s.session_id!==state.snapshot.session_id) {
                state.preview=s;state.linked=false;state.online=false;epoch++;state.message='場次已更換，請核對後重新連動本場。';return false;
            }
            if(!state.snapshot || s.state_version>=state.snapshot.state_version) state.snapshot=s;
            state.online=true;
            if(state.context!==options.context()) {state.online=false;state.message='本機分組或名冊有變，請重新核對連動。';return false;}
            return true;
        }
        async function preview() {
            if(state.storageBlocked)return false;
            var generation=++epoch;state.linked=false;state.online=false;state.preview=null;state.message='正在讀取場次…';emit();
            try {var s=await options.rpc('getBoardScoreSnapshot');if(generation!==epoch)return; if(!valid(s))throw Error('分組或名冊不符，無法連動。');state.preview=s;state.message='請核對班級、科目、討論名稱與各組成員。';}
            catch(e) {if(generation===epoch)state.message=e.message || '讀取失敗';}
            emit();
        }
        function confirm() {
            if(state.storageBlocked || !state.preview || state.pending || !valid(state.preview))return false;
            epoch++;state.snapshot=state.preview;state.preview=null;state.context=options.context();state.linked=true;state.engaged=true;state.online=true;if(state.last && state.last.session_id!==state.snapshot.session_id)state.last=null;persist();state.message='已連動；本場分數以畫板為準。';emit();return true;
        }
        async function refresh() {
            if(!state.linked || polling)return;
            var generation=epoch;polling=true;
            try {var s=await options.rpc('getBoardScoreSnapshot');if(generation!==epoch)return; if(accept(s))state.message=state.pending?'操作待確認，請查詢／重送。':(writable()?'同步完成':'本階段僅供讀取');}
            catch(e) {if(generation===epoch){state.online=false;state.message=(e.message || '連線失敗')+'；計分暫停，請重新讀取。';}}
            finally {polling=false;emit();}
        }
        function success(r) {return !!r && (r.status==='ok' || (r.status==='dup' && success(r.result)));}
        function retry(r) {return r && (r.status==='retry'||r.type==='retry');}
        function finish(result,snapshot) {
            var resolved=result;
            while(resolved && resolved.status==='dup')resolved=resolved.result;
            if(!resolved || ['ok','rejected'].indexOf(resolved.status)===-1) {state.online=false;state.message='尚未確認，請查詢／重送原操作。';return;}
            var pending=state.pending;
            if(success(result)) {
                var inner=resolved;
                if(pending.op.type!=='undo_score_transaction') state.last={id:inner.transaction_id || (snapshot && snapshot.last_score_transaction),session_id:pending.session_id,type:pending.op.type,data:pending.op.data};
                else state.last=null;
                state.message='操作已確認。';
            } else state.message='操作遭拒絕：'+(resolved && (resolved.reason || resolved.error || resolved.message) || '版本衝突，請確認最新分數後再操作');
            state.pending=null;
            if(!persist()) {state.pending=pending;return;}
            if(snapshot)accept(snapshot);else state.online=false;
        }
        async function send() {
            if(!state.pending || busy)return false;
            var generation=epoch;busy=true;emit();
            try {var response=await options.rpc('commitBoardScoreOperation',state.pending);if(generation!==epoch)return false;finish(response.result,response.snapshot);return !state.pending;}
            catch(e) {if(generation===epoch){state.online=false;state.message=(e.message||'回應遺失')+'；結果未明，請查詢／重送。';}return false;}
            finally {busy=false;emit();}
        }
        async function operation(type,data) {
            if(!writable()) {state.message='目前無法連動計分，請確認連線、場次與待確認操作。';emit();return false;}
            data.expected_state_version=state.snapshot.state_version;
            var request={session_id:state.snapshot.session_id,cid:state.cid,op:{op_id:options.id(),type:type,data:data}};
            if(!validPending(request)) {
                state.message=typeof data.label==='string' && data.label.length>160?'計分原因超過160字，請先修改加分項目；這次操作尚未送出。':'計分內容或組號格式不正確，這次操作尚未送出，請重新核對。';
                emit();return false;
            }
            state.pending=request;
            if(!persist()){state.pending=null;return false;}
            return send();
        }
        async function recover() {
            if(state.storageBlocked || !state.pending || busy)return false;
            var generation=epoch;busy=true;emit();
            try {
                var p=state.pending,r=await options.rpc('getBoardScoreResult',{session_id:p.session_id,cid:p.cid,op_id:p.op.op_id});
                if(generation!==epoch)return false;
                if(r.found) {finish(r.result,null);if(state.linked)state.online=false;return true;}
                if(r.current_session_id!==p.session_id){state.online=false;state.message='舊場操作尚未確認，已保留紀錄；不能送入新場。';return false;}
                busy=false;return await send();
            }catch(e){if(generation===epoch){state.online=false;state.message='查詢失敗，原操作仍保留：'+(e.message||'連線失敗');}return false;}
            finally {busy=false;emit();}
        }
        function disconnect() {epoch++;state.linked=false;state.engaged=false;state.online=false;state.preview=null;state.snapshot=null;state.message=state.pending?'已解除；仍保留未確認操作，請先查詢結果。':'已解除，恢復本機分數。';emit();}
        return {state:state,preview:preview,confirm:confirm,refresh:refresh,recover:recover,disconnect:disconnect,canScore:writable,
            offline:function(){state.online=false;state.message='網路已離線，連動計分暫停；待確認操作仍會保留。';emit();},
            active:function(){return state.engaged || !!state.pending;},
            adjust:function(group,delta,label){if(!Number.isInteger(delta)||!delta||Math.abs(delta)>100)return Promise.resolve(false);return operation('adjust_group_score',{group:group,delta:delta,label:label||'加減分'});},
            clear:function(){return operation('clear_group_scores',{});},
            undo:function(){if(!state.last || !state.snapshot || state.last.session_id!==state.snapshot.session_id)return Promise.resolve(false);return operation('undo_score_transaction',{target_id:state.last.id});}
        };
    }
    if(typeof module==='object' && module.exports)module.exports={createBoardScoreSync:createBoardScoreSync};
    if(!root.document)return;
    root.createBoardScoreSync=createBoardScoreSync;
})(typeof window==='undefined'?globalThis:window);

/* GAS-only adapter. No endpoint or credential is present in this asset. */
(function() {
    'use strict';
    if(typeof window==='undefined' || !window.document || !window.google || !google.script || !google.script.run)return;
    var host=document.getElementById('group-score-section');
    if(!host)return;
    var panel=document.createElement('section');
    panel.id='board-score-sync-panel';
    panel.className='mb-3 p-3 border rounded-xl bg-sky-50 text-slate-700';
    panel.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:100%;overflow-wrap:anywhere';
    panel.setAttribute('aria-label','討論畫板連動');
    function button(id,text,fn) {var b=document.createElement('button');b.id=id;b.type='button';b.textContent=text;b.className='px-3 py-2 rounded-lg border bg-white font-bold';b.addEventListener('click',fn);panel.appendChild(b);return b;}
    var link=button('board-score-link','連動討論畫板',function(){controller.preview();});
    var confirmButton=button('board-score-confirm','確認連動本場',function(){controller.confirm();});
    var refresh=button('board-score-refresh','重新讀取',function(){controller.refresh();});
    var recover=button('board-score-recover','查詢／重送待確認操作',function(){controller.recover();});
    var disconnect=button('board-score-disconnect','解除連動',function(){controller.disconnect();});
    var status=document.createElement('p');status.id='board-score-status';status.style.cssText='flex-basis:100%;margin:0';status.setAttribute('role','status');panel.appendChild(status);
    var preview=document.createElement('pre');preview.id='board-score-preview';preview.style.cssText='white-space:pre-wrap;max-width:100%;margin:0;flex-basis:100%;font:inherit';panel.appendChild(preview);
    host.insertBefore(panel,host.firstChild);
    function groups() {
        if(typeof groupSharedGroups!=='undefined' && groupSharedGroups)return groupSharedGroups.map(function(g){return g.seats.slice().map(Number).sort(function(a,b){return a-b;});});
        if(window.c408PointsGroupMembers){var value=window.c408PointsGroupMembers();if(value)return value.map(function(g){return g.seats.map(function(s){return Number(s.seat);}).sort(function(a,b){return a-b;});});}
        return null;
    }
    function context() {return JSON.stringify({groups:groups(),count:groupCount,roster:seatRoster});}
    function validate(s) {
        var local=groups(),ids=Object.keys(s.groups||{});
        return s.mode==='group' && local && ids.length===local.length && ids.length===groupCount && ids.length<=8 && ids.every(function(id){return local[Number(id)-1] && JSON.stringify(s.groups[id].seats.slice().map(Number).sort(function(a,b){return a-b;}))===JSON.stringify(local[Number(id)-1]);});
    }
    function rpc(name,arg) {
        return new Promise(function(resolve,reject){
            var done=false,timer=setTimeout(function(){done=true;reject(Error('連線逾時'));},15000);
            function success(value){if(done)return;done=true;clearTimeout(timer);resolve(value);}
            function failure(error){if(done)return;done=true;clearTimeout(timer);reject(error || Error('連線失敗'));}
            try {var run=google.script.run.withSuccessHandler(success).withFailureHandler(failure);if(name==='getBoardScoreSnapshot')run.getBoardScoreSnapshot();else if(name==='commitBoardScoreOperation')run.commitBoardScoreOperation(arg);else run.getBoardScoreResult(arg);}catch(e){failure(e);}
        });
    }
    function controls() {
        var s=controller.state,active=controller.active(),enabled=controller.canScore();
        var transfer=document.getElementById('group-to-points-btn');
        if(transfer){transfer.disabled=active;transfer.title=active?'連動期間暫停轉入個人集點，避免重複發點。':'';}
        var undo=document.getElementById('group-undo-score-btn');
        if(undo && active){undo.disabled=!enabled || !s.last;undo.textContent=s.last?('復原上一筆：'+(s.last.type==='clear_group_scores'?'全班清空':('第'+s.last.data.group+'組 '+s.last.data.label+' '+s.last.data.delta))):'復原上一筆（尚無本機已確認操作）';}
        else if(undo)undo.textContent='復原上一筆';
        var clear=document.getElementById('group-reset-scores-btn');if(clear)clear.disabled=active && !enabled;
        document.querySelectorAll('#group-cards-grid .group-card button').forEach(function(b){if(/^[+-][12]$/.test(b.textContent))b.disabled=active && !enabled;});
        link.hidden=!!s.preview;confirmButton.hidden=!s.preview;confirmButton.disabled=!!s.pending;
        refresh.hidden=!s.linked;recover.hidden=!s.pending;disconnect.hidden=!active && !s.preview;
        status.textContent=(s.engaged && s.snapshot?'已連動：'+s.snapshot.class_code+'／'+s.snapshot.title+'。':'')+s.message+(active?' 連動期間暫停轉入個人集點。':'');
        preview.textContent=s.preview?('班級：'+s.preview.class_code+'　科目：'+s.preview.subject+'\n討論：'+s.preview.title+'\n'+Object.keys(s.preview.groups).map(function(id){return '第'+id+'組：'+s.preview.groups[id].seats.map(function(n){return n+' '+(seatRoster[n]?seatRoster[n][0]:'（名冊缺漏）');}).join('、');}).join('\n')):'';
    }
    var controller=window.c408BoardSync=createBoardScoreSync({rpc:rpc,storage:localStorage,isOnline:function(){return navigator.onLine!==false;},id:function(){return 'timer_'+(window.crypto && crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2));},validate:validate,context:context,change:function(){renderGroupCards();controls();}});
    window.c408BoardSyncControls=controls;
    window.c408BoardScore=function(id){var s=controller.state;return controller.active()?(s.snapshot && s.snapshot.groups[id]?s.snapshot.groups[id].score:'—'):(groupScores[id] || 0);};
    window.c408BoardUndo=function(){var last=controller.state.last;if(!last)return;var all=last.type==='clear_group_scores';if(confirm('復原'+(all?'全班清空分數（影響所有組）':'第'+last.data.group+'組 '+last.data.label+' '+last.data.delta)+'？'))controller.undo();};
    var interval=null;
    function visible(){return !document.hidden && window.c408CurrentTab==='group';}
    function visibility(){if(interval){clearInterval(interval);interval=null;}if(visible()){controller.refresh();interval=setInterval(function(){if(visible())controller.refresh();},2000);}}
    window.c408BoardSyncVisibility=visibility;
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('offline',function(){controller.offline();});
    window.addEventListener('online',visibility);
    controls();visibility();
})();
