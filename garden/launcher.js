(function () {
    'use strict';
    var windows=[], cloud=!!(window.google&&google.script&&google.script.run);
    function localRoster(universal){
        var seats=[],state,events=[],base={};
        if(universal){var config=JSON.parse(localStorage.getItem('ctu_class')||'{}'),names=Array.isArray(config.studentNames)?config.studentNames:[];var count=names.length||Math.min(100,Number(config.studentCount)||0);for(var i=0;i<count;i++)if(!names.length||String(names[i]||'').trim())seats.push(i+1);}
        else{
            if(typeof seatRoster!=='undefined')seats=Object.keys(seatRoster).map(Number);
            state=JSON.parse(localStorage.getItem('c408_points_local/state')||'null');
            if(state&&state.bundle){events=(state.bundle.events||[]).slice();base=state.bundle.settings&&state.bundle.settings.avatars||{};(state.pending||[]).forEach(function(b){if(b.type==='score')(b.seats||[]).forEach(function(s){events.push({seat:s.seat,type:'score',itemId:b.itemId,batchId:b.id});});if(b.type==='undo')events.push({type:'undo',originalBatchId:b.originalBatchId});});}
        }
        return {roster:window.SecretGarden.avatarRoster(seats,base,events),readAt:new Date().toISOString()};
    }
    window.addEventListener('message',function(e){
        var d=e.data;if(!d||d.type!=='garden:request'||typeof d.requestId!=='string'||d.requestId.length>30)return;
        windows=windows.filter(function(w){return !w.child.closed;});
        var item=windows.find(function(w){return w.child===e.source&&w.origin===e.origin&&w.channel===d.channel;});if(!item)return;
        function reply(data){if(!item.child.closed)item.child.postMessage({type:'garden:roster',channel:item.channel,requestId:d.requestId,roster:data.roster,readAt:data.readAt,error:data.error},item.origin);}
        if(cloud)google.script.run.withSuccessHandler(reply).withFailureHandler(function(err){reply({error:'無法讀取目前頭像：'+(err&&err.message||String(err))});}).getGardenRoster();
        else try{reply(localRoster(item.universal));}catch(err){reply({error:'無法讀取班級夥伴：'+err.message});}
    });
    document.querySelectorAll('[data-garden-launch]').forEach(function(button){button.addEventListener('click',function(){
        var universal=button.dataset.gardenLaunch==='universal',bytes=new Uint8Array(16);crypto.getRandomValues(bytes);var channel=Array.from(bytes).map(function(n){return n.toString(16).padStart(2,'0');}).join('');
        var url=cloud?new URL('https:/'+'/wukolo1206.github.io/classroom-timer/garden.html'):new URL('garden.html',location.href);
        url.searchParams.set('source',universal?'universal':'c408');url.hash=new URLSearchParams({channel:channel,parent:location.origin}).toString();
        var child=window.open(url.href,'_blank');
        if(child)windows.push({child:child,origin:url.origin,channel:channel,universal:universal});else{var msg=document.getElementById('noise-msg');if(msg)msg.textContent='花園視窗被擋住，請允許這個網站開啟新視窗後再試。';}
    });});
}());
