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
        this.durationMs=Math.max(60000,Math.min(7200000,Number(options.durationMs)||600000));
        this.threshold=Number(options.threshold)||50;
        this.cursor=Math.max(0,Math.floor(Number(options.cursor)||0))%this.roster.length;
        this.order=this.roster.slice(this.cursor).concat(this.roster.slice(0,this.cursor)).map(function(r){return r.seat;});
        this.elapsedMs=0;this.quietMs=0;this.noisyMs=0;this.recoveryMs=0;this.resting=false;this.paused=false;this.ended=false;this.count=0;
        this.firstMs=15000;
        this.stepMs=this.roster.length>1?(this.durationMs*.85-this.firstMs)/(this.roster.length-1):this.durationMs;
    }
    Model.prototype.visible=function(){var self=this;return this.order.slice(0,this.count).map(function(seat){return self.roster.find(function(r){return r.seat===seat;});}).filter(Boolean);};
    Model.prototype.refresh=function(list){var next=cleanRoster(list), kept=this.order.filter(function(n){return next.some(function(r){return r.seat===n;});});next.forEach(function(r){if(kept.indexOf(r.seat)<0)kept.push(r.seat);});var visible=this.visible().filter(function(r){return next.some(function(n){return n.seat===r.seat;});}).map(function(r){return r.seat;});this.roster=next;this.order=visible.concat(kept.filter(function(n){return visible.indexOf(n)<0;}));this.count=visible.length;};
    Model.prototype.pause=function(){this.paused=true;this.noisyMs=0;this.recoveryMs=0;};
    Model.prototype.nextCursor=function(){var advance=this.count%this.roster.length;return (this.cursor+Math.max(1,advance))%this.roster.length;};
    Model.prototype.resume=function(){if(!this.ended)this.paused=false;};
    Model.prototype.tick=function(ms,level){
        if(this.paused||this.ended||!Number.isFinite(ms)||ms<=0)return;
        var dt=Math.min(ms,this.durationMs-this.elapsedMs);this.elapsedMs+=dt;
        if(ms<=1500&&Number.isFinite(level)){
            if(level>this.threshold){this.noisyMs+=dt;this.recoveryMs=0;if(this.noisyMs>=3000)this.resting=true;}
            else {this.noisyMs=0;if(this.resting){if(level<=this.threshold-2)this.recoveryMs+=dt;else this.recoveryMs=0;if(this.recoveryMs>=2000){this.resting=false;this.recoveryMs=0;}}else this.quietMs+=dt;}
            if(!this.resting&&this.quietMs>=this.firstMs)this.count=Math.max(this.count,Math.min(this.roster.length,1+Math.floor((this.quietMs-this.firstMs)/Math.max(1,this.stepMs))));
        }else{this.noisyMs=0;this.recoveryMs=0;}
        if(this.elapsedMs>=this.durationMs)this.ended=true;
    };
    return {Model:Model,avatarRoster:avatarRoster,cleanRoster:cleanRoster};
}));
