(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SecretGarden = factory();
}(typeof window === 'object' ? window : this, function () {
    'use strict';
    var STAGE_SCHEME='garden-living-8-v1';
    var stageNames=Object.freeze(['夥伴入園','花圃甦醒','綠意成蔭','蝴蝶來訪','池塘映光','祕密花園','晚霞時光','月光成畫']);
    var legacyStageNames=['迎接夥伴','花朵盛開','蝴蝶來訪','星光花園'];
    function stageMetadata(index){
        if(!Number.isInteger(index)||index<0||index>=stageNames.length)throw Error('花園階段不正確');
        return {schema:3,stageScheme:STAGE_SCHEME,stageIndex:index,stageTotal:stageNames.length,stageName:stageNames[index]};
    }
    function recordStage(record){
        record=record||{};
        if((record.stageScheme===STAGE_SCHEME||record.stageScheme==='garden-painting-8-v1')&&Number.isInteger(record.stageIndex)&&record.stageIndex>=0&&record.stageIndex<stageNames.length){var meta=stageMetadata(record.stageIndex);if(record.stageScheme!==STAGE_SCHEME){meta.schema=2;meta.stageScheme=record.stageScheme;}if(typeof record.stageName==='string'&&record.stageName.trim())meta.stageName=record.stageName;return meta;}
        if(!record.stageScheme&&Number.isInteger(record.stage)&&record.stage>=0&&record.stage<legacyStageNames.length)return {stageScheme:'legacy-4',stageIndex:record.stage,stageTotal:4,stageName:legacyStageNames[record.stage]};
        return {stageScheme:null,stageIndex:null,stageTotal:null,stageName:'未記錄階段'};
    }
    function cleanRoster(list) {
        if (!Array.isArray(list) || !list.length || list.length > 100) throw Error('沒有可用的班級夥伴');
        var seen = {};
        return list.map(function (r) {
            if (!r || !Number.isInteger(r.seat) || r.seat < 1 || r.seat > 100 || seen[r.seat] || !Number.isInteger(r.avatar) || r.avatar < 0 || r.avatar > 23) throw Error('夥伴資料格式不正確');
            seen[r.seat] = true; return {seat:r.seat,avatar:r.avatar};
        }).sort(function (a,b) { return a.seat-b.seat; });
    }
    function avatarRoster(seats, base, events) {
        var map = {}, undone = {}; base = base || {}; events = events || [];
        seats.forEach(function (n) { map[n] = Number.isInteger(base[n]) && base[n]>=0 && base[n]<24 ? base[n] : n%8; });
        events.forEach(function (e) { if (e.type==='undo') undone[e.originalBatchId]=true; });
        events.forEach(function (e) { var m = /^avatar:(\d{1,2})$/.exec(e.itemId||''); if (m && Number(m[1])<24 && e.type==='score' && !undone[e.batchId] && Object.prototype.hasOwnProperty.call(map,e.seat)) map[e.seat]=Number(m[1]); });
        return cleanRoster(seats.map(function (n) { return {seat:n,avatar:map[n]}; }));
    }
    function Model(options) {
        this.roster=cleanRoster(options.roster);
        this.durationMs=options.durationMs===null?null:Math.max(60000,Math.min(7200000,Number(options.durationMs)||600000));
        this.threshold=Number(options.threshold)||50;
        this.random=typeof options.random==='function'?options.random:Math.random;
        this.spawnMs=Math.max(1000,Math.min(300000,Number(options.spawnMs)||15000));
        this.upgradeMs=Math.max(5000,Math.min(300000,Number(options.upgradeMs)||30000));
        this.present=[];this.queue=this.shuffle(this.roster.map(function(r){return r.seat;}));
        this.elapsedMs=0;this.quietMs=0;this.noisyMs=0;this.holdRemainingMs=0;this.resting=false;this.paused=false;this.ended=false;this.count=0;
        this.spawnProgressMs=0;this.upgradeProgressMs=0;this.stage=0;this.celebrations=0;this.departures=0;
    }
    Object.defineProperty(Model.prototype,'discoveryCount',{get:function(){return this.celebrations;}});
    Object.defineProperty(Model.prototype,'stageIndex',{get:function(){return this.stage;}});
    Model.prototype.shuffle=function(list){for(var i=list.length-1;i>0;i--){var j=Math.min(i,Math.max(0,Math.floor(this.random()*(i+1)))),v=list[i];list[i]=list[j];list[j]=v;}return list;};
    Model.prototype.visible=function(){var self=this;return this.present.map(function(seat){return self.roster.find(function(r){return r.seat===seat;});}).filter(Boolean);};
    Model.prototype.full=function(){return this.count===this.roster.length;};
    Model.prototype.nextMs=function(){return this.full()?this.upgradeMs-this.upgradeProgressMs:this.spawnMs-this.spawnProgressMs;};
    Model.prototype.refresh=function(list){var next=cleanRoster(list),has=function(n){return next.some(function(r){return r.seat===n;});};this.present=this.present.filter(has);this.queue=this.queue.filter(has);var self=this;next.forEach(function(r){if(self.present.indexOf(r.seat)<0&&self.queue.indexOf(r.seat)<0)self.queue.push(r.seat);});this.roster=next;this.count=this.present.length;};
    Model.prototype.pause=function(){this.paused=true;};
    Model.prototype.resume=function(){if(!this.ended)this.paused=false;};
    Model.prototype.tick=function(ms,level){
        if(this.paused||this.ended||!Number.isFinite(ms)||ms<=0)return;
        var dt=this.durationMs===null?ms:Math.min(ms,this.durationMs-this.elapsedMs);this.elapsedMs+=dt;
        if(ms<=1500&&Number.isFinite(level)){
            var remaining=dt;
            if(level>this.threshold){
                this.noisyMs+=dt;
                if(!this.resting){this.resting=true;this.holdRemainingMs=2000;}
                else this.holdRemainingMs=Math.max(0,this.holdRemainingMs-dt);
            }else {
                this.noisyMs=0;
                // Only sampled time beyond the minimum stop may advance the garden.
                remaining=Math.max(0,dt-this.holdRemainingMs);
                this.holdRemainingMs=Math.max(0,this.holdRemainingMs-dt);
                this.resting=this.holdRemainingMs>0;
                this.quietMs+=remaining;
                if(!this.full()){this.spawnProgressMs+=remaining;remaining=0;while(this.spawnProgressMs>=this.spawnMs&&this.queue.length){this.spawnProgressMs-=this.spawnMs;this.present.push(this.queue.shift());this.count=this.present.length;}if(this.full()){remaining=this.spawnProgressMs;this.spawnProgressMs=0;}}
                if(this.full()){this.upgradeProgressMs+=remaining;while(this.upgradeProgressMs>=this.upgradeMs){this.upgradeProgressMs-=this.upgradeMs;if(this.stage<stageNames.length-1)this.stage++;else this.celebrations++;}}
            }
        }
        if(this.durationMs!==null&&this.elapsedMs>=this.durationMs)this.ended=true;
    };
    return {Model:Model,avatarRoster:avatarRoster,cleanRoster:cleanRoster,stageNames:stageNames,STAGE_SCHEME:STAGE_SCHEME,stageMetadata:stageMetadata,recordStage:recordStage};
}));
