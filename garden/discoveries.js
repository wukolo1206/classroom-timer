(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory();else root.GardenDiscoveries=factory();
}(typeof window==='object'?window:this,function(){
    'use strict';
    var themes=[{id:'bridge',name:'木橋池塘'},{id:'fountain',name:'小噴水池'},{id:'rabbit',name:'兔子石像'},{id:'birdbath',name:'小鳥飲水台'},{id:'arch',name:'花藤拱門'},{id:'windmill',name:'小風車'}];
    var activities=[{id:'basketball',name:'籃球'},{id:'soccer',name:'足球'},{id:'volleyball',name:'排球'},{id:'tennis',name:'網球'},{id:'baseball',name:'棒球'},{id:'badminton',name:'羽球'},{id:'sowing',name:'播種'},{id:'planting',name:'移苗種花'}];
    function clone(value){return JSON.parse(JSON.stringify(value));}
    function Session(options){this.random=options&&options.random||Math.random;this.reset();}
    Session.prototype.shuffle=function(list){for(var i=list.length-1;i>0;i--){var j=Math.max(0,Math.min(i,Math.floor(this.random()*(i+1)))),t=list[i];list[i]=list[j];list[j]=t;}return list;};
    Session.prototype.reset=function(){this.themeBag=[];this.activityBag=[];this.seatBag=[];this.lastSeats=[];this.state={count:0,themeId:'bridge',themeName:'木橋池塘',activityId:null,activityName:'',unlockedIds:[],presenters:[],variant:0};};
    Session.prototype.snapshot=function(){return clone(this.state);};
    Session.prototype.nextTheme=function(){
        if(!this.themeBag.length){this.themeBag=this.shuffle(themes.map(function(t){return t.id;}));if(!this.state.count){var at=this.themeBag.indexOf('fountain');this.themeBag.splice(at,1);this.themeBag.unshift('fountain');}else if(this.themeBag[0]===this.state.themeId){var swap=this.themeBag[0];this.themeBag[0]=this.themeBag[1];this.themeBag[1]=swap;}}
        return this.themeBag.shift();
    };
    Session.prototype.choosePresenters=function(seats){
        var self=this;this.seatBag=this.seatBag.filter(function(n){return seats.indexOf(n)>=0;});
        seats.forEach(function(n){if(self.lastSeats.indexOf(n)<0&&self.seatBag.indexOf(n)<0)self.seatBag.push(n);});this.lastSeats=seats.slice();
        var chosen=[];for(var i=0;i<Math.min(2,seats.length);i++){if(!this.seatBag.length)this.seatBag=this.shuffle(seats.slice());if(chosen.indexOf(this.seatBag[0])>=0){var j=this.seatBag.findIndex(function(n){return chosen.indexOf(n)<0;});if(j>=0){var t=this.seatBag[0];this.seatBag[0]=this.seatBag[j];this.seatBag[j]=t;}}chosen.push(this.seatBag.shift());}return chosen;
    };
    Session.prototype.sync=function(count,visibleSeats){
        count=Number.isFinite(Number(count))?Math.max(0,Math.floor(Number(count))):this.state.count;if(count<this.state.count)this.reset();
        var seats=[],self=this;(visibleSeats||[]).forEach(function(v){var n=typeof v==='object'?v.seat:v;if(Number.isInteger(n)&&n>0&&seats.indexOf(n)<0)seats.push(n);});seats.sort(function(a,b){return a-b;});
        if(!this.state.count&&count>0){this.seatBag=this.shuffle(seats.slice());this.lastSeats=seats.slice();}
        while(this.state.count<count){var next=this.state.count+1,themeId=(next-1)%4===0?this.nextTheme():this.state.themeId;
            var unlocked=activities.slice(0,Math.min(8,next)).map(function(a){return a.id;}),activity;
            if(next<=8)activity=activities[next-1].id;
            else{if(!this.activityBag.length){this.activityBag=this.shuffle(unlocked.slice());if(this.activityBag[0]===this.state.activityId){var t=this.activityBag[0];this.activityBag[0]=this.activityBag[1];this.activityBag[1]=t;}}activity=this.activityBag.shift();}
            this.state={count:next,themeId:themeId,themeName:themes.find(function(t){return t.id===themeId;}).name,activityId:activity,activityName:activities.find(function(a){return a.id===activity;}).name,unlockedIds:unlocked,presenters:this.choosePresenters(seats),variant:Math.max(0,Math.min(2,Math.floor(self.random()*3)))};
        }return this.snapshot();
    };
    return {Session:Session,themes:themes,activities:activities};
}));
