(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory();else root.GardenLife=factory();
}(typeof window==='object'?window:this,function(){
    'use strict';
    var activities=['flowers','picnic','watering','butterfly','reading'];
    var labels={flowers:'看花',picnic:'野餐',watering:'澆水',butterfly:'追蝴蝶',reading:'閱讀',walking:'散步'};
    function Life(options){this.random=options&&options.random||Math.random;this.reset();}
    Life.prototype.reset=function(){this.records={};};
    Life.prototype.frame=function(list,dt,bounds,active,reduced){
        var self=this,seen={},walkers=0,chases=0,limit=Math.min(3,Math.max(1,Math.floor(list.length/8)));
        var step=active&&!reduced&&Number.isFinite(dt)&&dt>0&&dt<=1500?dt:0;
        var rx=Math.max(0,Math.min(48,(bounds.width/(bounds.columns||8)-bounds.size-18)/2));
        var rowPitch=Number.isFinite(bounds.rowPitch)?bounds.rowPitch:bounds.height*.65/Math.max(1,bounds.rows);
        var ry=Math.max(0,Math.min(6,(rowPitch-bounds.size-24-16)/2));
        list.forEach(function(r){seen[r.seat]=true;});
        Object.keys(this.records).forEach(function(n){if(!seen[n])delete self.records[n];});
        list.forEach(function(r){
            var s=self.records[r.seat];
            if(!s){s={seat:r.seat,index:(r.seat*3+Math.floor(self.random()*5))%5,x:0,y:0,facing:1,walking:false,wait:5000+r.seat%7*700,elapsed:0,duration:0,cycle:0};self.records[r.seat]=s;}
            s.x=Math.max(-rx,Math.min(rx,s.x));s.y=Math.max(-ry,Math.min(ry,s.y));
            if(s.walking)walkers++;
        });
        return list.map(function(r){
            var s=self.records[r.seat];
            if(step){
                if(s.walking){s.elapsed+=step;var t=Math.min(1,s.elapsed/s.duration),ease=t*t*(3-2*t);s.x=Math.max(-rx,Math.min(rx,s.fromX+(s.toX-s.fromX)*ease));s.y=Math.max(-ry,Math.min(ry,s.fromY+(s.toY-s.fromY)*ease));if(t===1){s.walking=false;walkers--;s.index=(s.index+1+Math.floor(self.random()*4))%5;s.wait=7000+self.random()*6500;s.cycle++;}}
                else{s.wait-=step;if(s.wait<=0&&rx===0&&ry===0){s.index=(s.index+1+Math.floor(self.random()*4))%5;s.wait=7000+self.random()*6500;s.cycle++;}else if(s.wait<=0&&walkers<limit&&(rx>0||ry>0)){s.walking=true;walkers++;s.elapsed=0;s.duration=2200+self.random()*1800;s.fromX=s.x;s.fromY=s.y;s.toX=(s.x>=0?-1:1)*rx*(.55+self.random()*.4);s.toY=(self.random()>.5?1:-1)*ry*.7;s.facing=s.toX<s.x?-1:1;}}
            }
            var activity=s.walking&&!reduced?'walking':activities[s.index];if(activity==='butterfly'){if(chases>=2)activity='flowers';else chases++;}
            return {seat:r.seat,activity:activity,x:reduced?0:s.x,y:reduced?0:s.y,facing:s.facing,cycle:s.cycle};
        });
    };
    function flowersAt(ms,stage,frozenCount){
        if(!Number.isFinite(ms)||ms<0)return [];
        stage=Number.isInteger(stage)?stage:1;
        var cap=stage===0?8:48,count=Math.min(cap,Math.floor(ms/6000)),list=[];
        if(stage>=6&&Number.isInteger(frozenCount)&&frozenCount>=0)count=Math.min(count,frozenCount);
        for(var i=0;i<count;i++){var age=ms-(i+1)*6000;list.push({id:i,growth:age<3500?'sprout':age<7500||stage===0?'bud':'bloom',color:['#fff3d0','#f3c2ad','#e8d1ed'][i%3]});}
        return list;
    }
    function PlantGrowth(){this.reset();}
    PlantGrowth.prototype.reset=function(){this.births=[];this.lastMs=0;this.budgetMs=0;this.frozen=false;};
    PlantGrowth.prototype.frame=function(ms,stage){
        var valid=Number.isFinite(ms)&&ms>=this.lastMs,now=valid?ms:this.lastMs,delta=now-this.lastMs;this.lastMs=now;
        if(stage>=6)this.frozen=true;
        var cap=stage===0?8:48;
        if(!this.frozen){
            this.budgetMs+=delta;
            while(this.budgetMs>=6000&&this.births.length<cap){this.budgetMs-=6000;this.births.push(now-this.budgetMs);}
            if(this.births.length>=cap)this.budgetMs=0;
        }
        return this.births.map(function(birth,id){var age=now-birth;return {id:id,growth:age<3500?'sprout':age<7500||stage===0?'bud':'bloom',color:['#fff3d0','#f3c2ad','#e8d1ed'][id%3]};});
    };
    function groundLayout(width,height,count){
        count=Math.max(1,Math.min(100,Math.floor(count)||1));
        var columns=Math.min(width>=1000?12:width>=600?10:8,Math.max(3,count)),rows=Math.max(1,Math.ceil(count/columns)),cells=[];
        while(cells.length<count){cells=[];for(var r=0;r<rows;r++)for(var c=0;c<columns;c++){var x=(c+.5)/columns,foot=.46+(r+.5)*.42/rows;if(.03+.94*x>.65&&foot<.64)continue;cells.push({x:x,footY:foot});}if(cells.length<count)rows++;}
        var requiredHeight=Math.max(400,Math.ceil(rows*62/.42)),h=Math.max(requiredHeight,height||0),rowPitch=h*.42/rows;
        var size=Math.max(24,Math.min(68,width*.94/columns*.72,rowPitch-30)),stride=13;
        function gcd(a,b){while(b){var t=b;b=a%b;a=t;}return a;}
        while(gcd(stride,cells.length)!==1)stride+=2;
        var positions=[];for(var i=0;i<count;i++){var p=cells[i*stride%cells.length];positions.push({x:p.x,footY:p.footY,left:p.x*100,top:(p.footY*h-size*.88+(size+24)/2)/(h*.91)*100});}
        return {columns:columns,rows:rows,size:size,requiredHeight:requiredHeight,rowPitch:rowPitch,positions:positions};
    }
    var tinyFlower='<path d="M72 85V62M72 77Q57 65 59 75Q63 84 72 80M72 80Q87 68 86 78Q82 85 72 84" stroke="#7ca65d" stroke-width="3" fill="#98bd70"/><g fill="#f6cf9f"><ellipse cx="72" cy="53" rx="6" ry="10"/><ellipse cx="82" cy="62" rx="10" ry="6"/><ellipse cx="76" cy="70" rx="6" ry="10"/><ellipse cx="63" cy="62" rx="10" ry="6"/></g><circle cx="72" cy="62" r="5" fill="#dfb35c"/>';
    var props={
        flowers:tinyFlower+'<path class="life-sniff" d="M45 45Q54 39 60 45M47 36Q57 30 63 36" stroke="#fff5da" stroke-width="2" stroke-linecap="round" fill="none"/>',
        picnic:'<path d="M8 77L84 73L98 93L1 95Z" fill="#f4dfc4"/><path d="M10 83L91 81M5 90L95 88M23 77L19 94M45 76L45 94M65 75L70 93M82 76L90 92" stroke="#e4b3a7" stroke-width="3"/><path d="M3 72Q15 63 27 72L25 87H5Z" fill="#c49662"/><path d="M8 70Q14 52 23 69" stroke="#ac8050" stroke-width="3" fill="none"/><path d="M7 77H24M7 82H24" stroke="#e3c18d" stroke-width="2"/><ellipse cx="79" cy="84" rx="10" ry="4" fill="#fff6df"/><circle cx="79" cy="79" r="6" fill="#e9ab83"/><path d="M78 73Q77 68 82 69" stroke="#809d5b" stroke-width="2"/><rect x="58" y="78" width="8" height="10" rx="2" fill="#b5ced6"/>',
        watering:'<g class="life-can"><path d="M65 65L82 62L86 81L67 84Z" fill="#9ac7d1"/><path d="M82 65Q98 57 95 73L85 77" stroke="#7daab6" stroke-width="4" fill="none"/><path d="M67 73L54 68L49 72L67 81Z" fill="#9ac7d1"/><ellipse cx="73" cy="64" rx="8" ry="3" fill="#77a6b2"/></g><g class="life-water" fill="#b2dce4"><ellipse cx="45" cy="77" rx="2" ry="3"/><ellipse cx="40" cy="82" rx="2" ry="3"/><ellipse cx="48" cy="86" rx="2" ry="3"/></g><path d="M36 94V85M36 89Q24 78 28 86Q30 91 36 91M36 90Q48 80 44 88Q42 93 36 94" stroke="#84ad65" stroke-width="3" fill="#a3c47e"/>',
        butterfly:'<g class="life-mini-butterfly" transform="translate(74 20)"><g fill="#edc784"><ellipse cx="-6" cy="-2" rx="7" ry="9" transform="rotate(-25 -6 -2)"/><ellipse cx="6" cy="-2" rx="7" ry="9" transform="rotate(25 6 -2)"/><ellipse cx="-4" cy="7" rx="5" ry="5"/><ellipse cx="4" cy="7" rx="5" ry="5"/></g><path d="M0-7V10" stroke="#937c56" stroke-width="2"/></g>',
        reading:'<g class="life-book"><path d="M26 67Q39 60 50 67Q61 60 75 67L72 88Q60 82 50 89Q39 82 28 88Z" fill="#9fbdb2" stroke="#7f9f91" stroke-width="2"/><path d="M29 68Q41 64 49 69L49 85Q40 80 31 84ZM51 69Q62 64 72 68L69 84Q59 81 51 85Z" fill="#fff4d7"/><path d="M35 70L44 72M34 75L44 77M56 72L66 70M56 77L65 75" stroke="#d2c9a7" stroke-width="1.5"/></g>',
        walking:'<g class="life-footsteps" fill="#96b36d" opacity=".5"><ellipse cx="31" cy="88" rx="4" ry="2"/><ellipse cx="55" cy="94" rx="4" ry="2"/></g>'
    };
    function propSvg(activity){return '<svg viewBox="0 0 100 100" xmlns="http:/'+'/www.w3.org/2000/svg">'+(props[activity]||'')+'</svg>';}
    function plantSvg(color){return '<svg viewBox="0 0 42 68" xmlns="http:/'+'/www.w3.org/2000/svg"><path class="plant-stem" d="M21 62V24" stroke="#81a45e" stroke-width="3" stroke-linecap="round"/><path class="plant-leaves" d="M21 49Q0 31 8 46Q13 55 21 53M21 46Q42 29 35 44Q31 52 21 49" fill="#93b96d"/><g class="plant-bud"><ellipse cx="21" cy="24" rx="6" ry="9" fill="'+color+'"/><path d="M15 26L21 32L27 26" stroke="#81a45e" stroke-width="2" fill="none"/></g><g class="plant-blossom" fill="'+color+'"><ellipse cx="21" cy="12" rx="7" ry="10"/><ellipse cx="32" cy="22" rx="10" ry="7" transform="rotate(-20 32 22)"/><ellipse cx="27" cy="33" rx="7" ry="10" transform="rotate(-35 27 33)"/><ellipse cx="14" cy="33" rx="7" ry="10" transform="rotate(35 14 33)"/><ellipse cx="10" cy="22" rx="10" ry="7" transform="rotate(20 10 22)"/><circle cx="21" cy="24" r="6" fill="#e9bf6d"/></g></svg>';}
    function meadowSvg(n){var items='';for(var i=0;i<3;i++){var color=['#fff3d0','#f3c2ad','#e8d1ed'][(i+n)%3];items+='<g transform="translate('+(13+i*46)+' '+(26+i%2*10)+')"><path d="M0 40V0M0 25Q-14 14-12 25Q-6 32 0 30M0 28Q14 15 12 26Q6 34 0 32" stroke="#82a764" stroke-width="3" fill="#a1bf79"/><g fill="'+color+'"><ellipse cy="-9" rx="6" ry="9"/><ellipse cx="9" rx="9" ry="6"/><ellipse cy="9" rx="6" ry="9"/><ellipse cx="-9" rx="9" ry="6"/></g><circle r="5" fill="#e6bc69"/></g>'; }return '<svg viewBox="0 0 120 80" xmlns="http:/'+'/www.w3.org/2000/svg"><ellipse cx="60" cy="72" rx="57" ry="7" fill="#c7a77f"/><ellipse cx="60" cy="68" rx="54" ry="6" fill="#a28d6a"/>'+items+'</svg>';}
    function View(visitors,plants,meadow){this.visitors=visitors;this.plants=plants;this.meadow=meadow;this.life=new Life();this.plantGrowth=new PlantGrowth();this.flowerKey=null;}
    View.prototype.reset=function(){this.life.reset();this.plantGrowth.reset();this.flowerKey=null;};
    View.prototype.render=function(list,dt,bounds,active,reduced,quietMs,stage){
        var self=this,states=this.life.frame(list,dt,bounds,active,reduced);
        if(this.meadow){if(!stage)this.meadow.textContent='';else if(!this.meadow.children.length){[[19,87],[73,85],[35,70],[89,70]].forEach(function(p,i){var patch=self.meadow.ownerDocument.createElement('span');patch.className='garden-meadow-patch';patch.style.left=p[0]+'%';patch.style.top=p[1]+'%';patch.style.animationDelay=(i*.9)+'s';patch.innerHTML=meadowSvg(i);self.meadow.appendChild(patch);});}}
        states.forEach(function(s){var node=self.visitors.querySelector('[data-seat="'+s.seat+'"]');if(!node)return;node.style.setProperty('--life-x',s.x.toFixed(2)+'px');node.style.setProperty('--life-y',s.y.toFixed(2)+'px');node.style.setProperty('--life-facing',s.facing);node.dataset.lifeActive=active&&!reduced?'true':'false';if(node.dataset.activity!==s.activity){node.dataset.activity=s.activity;node.querySelector('.activity-prop').innerHTML=propSvg(s.activity);node.title=s.seat+'號正在'+labels[s.activity];}node.setAttribute('aria-label',s.seat+'號，正在'+labels[s.activity]);});
        var flowers=this.plantGrowth.frame(quietMs,stage),key=flowers.map(function(f){return f.id+':'+f.growth;}).join(',');if(key===this.flowerKey)return;this.flowerKey=key;
        var nodes=this.plants.children;while(nodes.length>flowers.length)this.plants.lastElementChild.remove();
        flowers.forEach(function(f){var node=self.plants.querySelector('[data-plant="'+f.id+'"]');if(!node){node=self.plants.ownerDocument.createElement('span');node.className='garden-flower';node.dataset.plant=f.id;node.innerHTML=plantSvg(f.color);var group=f.id%5,ring=Math.floor(f.id/5),anchor=[[19,84],[72,82],[31,63],[91,73],[48,91]][group];node.style.left=Math.max(6,Math.min(95,anchor[0]+Math.sin(ring*2.4+group)*Math.min(11,3+ring*.7)))+'%';node.style.top=Math.max(54,Math.min(94,anchor[1]+Math.cos(ring*2.4+group)*Math.min(7,2+ring*.5)))+'%';node.style.setProperty('--plant-delay',(-f.id*.8)+'s');self.plants.appendChild(node);}node.dataset.growth=f.growth;});
    };
    return {Life:Life,PlantGrowth:PlantGrowth,flowersAt:flowersAt,activities:activities,labels:labels,View:View,groundLayout:groundLayout};
}));
