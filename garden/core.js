(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SecretGarden = factory();
}(typeof window === 'object' ? window : this, function () {
    'use strict';
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
        this.loudGraceMs=Math.max(3000,Math.min(60000,Number(options.loudGraceMs)||8000));
        this.upgradeMs=Math.max(5000,Math.min(300000,Number(options.upgradeMs)||30000));
        this.present=[];this.queue=this.shuffle(this.roster.map(function(r){return r.seat;}));
        this.elapsedMs=0;this.quietMs=0;this.noisyMs=0;this.resting=false;this.paused=false;this.ended=false;this.count=0;
        this.spawnProgressMs=0;this.upgradeProgressMs=0;this.stage=0;this.celebrations=0;this.departures=0;
    }
    Model.prototype.shuffle=function(list){for(var i=list.length-1;i>0;i--){var j=Math.min(i,Math.max(0,Math.floor(this.random()*(i+1)))),v=list[i];list[i]=list[j];list[j]=v;}return list;};
    Model.prototype.visible=function(){var self=this;return this.present.map(function(seat){return self.roster.find(function(r){return r.seat===seat;});}).filter(Boolean);};
    Model.prototype.full=function(){return this.count===this.roster.length;};
    Model.prototype.nextMs=function(){return this.full()?this.upgradeMs-this.upgradeProgressMs:this.spawnMs-this.spawnProgressMs;};
    Model.prototype.refresh=function(list){var next=cleanRoster(list),has=function(n){return next.some(function(r){return r.seat===n;});};this.present=this.present.filter(has);this.queue=this.queue.filter(has);var self=this;next.forEach(function(r){if(self.present.indexOf(r.seat)<0&&self.queue.indexOf(r.seat)<0)self.queue.push(r.seat);});this.roster=next;this.count=this.present.length;};
    Model.prototype.pause=function(){this.paused=true;this.noisyMs=0;this.resting=false;};
    Model.prototype.resume=function(){if(!this.ended)this.paused=false;};
    Model.prototype.tick=function(ms,level){
        if(this.paused||this.ended||!Number.isFinite(ms)||ms<=0)return;
        var dt=this.durationMs===null?ms:Math.min(ms,this.durationMs-this.elapsedMs);this.elapsedMs+=dt;
        if(ms<=1500&&Number.isFinite(level)){
            if(level>this.threshold){this.resting=true;this.noisyMs+=dt;while(this.noisyMs>=this.loudGraceMs){this.noisyMs-=this.loudGraceMs;this.upgradeProgressMs=0;if(this.present.length){var seat=this.present.pop();this.queue.splice(Math.floor(this.random()*(this.queue.length+1)),0,seat);this.departures++;}this.count=this.present.length;}}
            else {
                this.noisyMs=0;this.resting=false;this.quietMs+=dt;var remaining=dt;
                if(!this.full()){this.spawnProgressMs+=remaining;remaining=0;while(this.spawnProgressMs>=this.spawnMs&&this.queue.length){this.spawnProgressMs-=this.spawnMs;this.present.push(this.queue.shift());this.count=this.present.length;}if(this.full()){remaining=this.spawnProgressMs;this.spawnProgressMs=0;}}
                if(this.full()){this.upgradeProgressMs+=remaining;while(this.upgradeProgressMs>=this.upgradeMs){this.upgradeProgressMs-=this.upgradeMs;if(this.stage<3)this.stage++;else this.celebrations++;}}
            }
        }else{this.noisyMs=0;this.resting=false;}
        if(this.durationMs!==null&&this.elapsedMs>=this.durationMs)this.ended=true;
    };
    return {Model:Model,avatarRoster:avatarRoster,cleanRoster:cleanRoster};
}));
