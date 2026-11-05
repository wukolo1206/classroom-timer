'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=path.join(__dirname,'../garden/life.js');
assert.ok(fs.existsSync(source),'garden life engine is missing');
const {Life,flowersAt,activities,groundLayout}=require(source);
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const people=Array.from({length:31},(_,i)=>({seat:i+1,avatar:i%24}));
const bounds={width:1200,height:540,rows:4,columns:8,size:64};
function advance(life,ms,active=true,reduced=false,list=people,box=bounds){let value;for(let t=0;t<ms;t+=100)value=life.frame(list,100,box,active,reduced);return value;}
test('people start with different recognizable activities',()=>{let life=new Life({random:()=>.5});let s=life.frame(people,0,bounds,true,false);assert.ok(new Set(s.map(x=>x.activity)).size>=4);assert.ok(activities.includes('picnic'));assert.ok(activities.includes('flowers'));});
test('walking changes real coordinates and stays in reserved space',()=>{let life=new Life({random:()=>.5});advance(life,7000);let a=life.frame(people,0,bounds,true,false);let b=advance(life,1000);assert.ok(b.some((v,i)=>Math.abs(v.x-a[i].x)>4));assert.ok(b.every(v=>Math.abs(v.x)<=34&&Math.abs(v.y)<=6));});
test('only a few people walk together and actions keep changing',()=>{let life=new Life({random:()=>.5}),seen=new Set();for(let i=0;i<900;i++){let s=life.frame(people,100,bounds,true,false);assert.ok(s.filter(v=>v.activity==='walking').length<=3);s.forEach(v=>seen.add(v.activity));}assert.ok(seen.has('walking'));assert.ok(seen.has('watering'));assert.ok(seen.has('reading'));});
test('pause and absent signal freeze position and activity clock',()=>{let life=new Life({random:()=>.5});advance(life,8000);let a=life.frame(people,0,bounds,false,false);let b=advance(life,9000,false);assert.deepEqual(b,a);});
test('avatar refresh does not restart activity or travel',()=>{let life=new Life({random:()=>.5});let a=advance(life,8000);let b=life.frame(people.map(v=>({...v,avatar:23})),0,bounds,true,false);assert.deepEqual(a,b);});
test('departures remove state and reset empties every participant',()=>{let life=new Life({random:()=>.5});advance(life,8000);let s=life.frame(people.slice(0,2),0,bounds,true,false);assert.equal(s.length,2);life.reset();assert.equal(life.frame([],0,bounds,true,false).length,0);});
test('reduced motion never walks; no time jumps fabricate movement',()=>{let life=new Life({random:()=>.5});let s=advance(life,80000,true,true);assert.ok(s.every(v=>v.x===0&&v.y===0&&v.activity!=='walking'));life.reset();let a=life.frame(people,0,bounds,true,false);assert.deepEqual(life.frame(people,30000,bounds,true,false),a);});
test('narrow screens and 100 students never travel outside available cell',()=>{let life=new Life({random:()=>.5});let s=advance(life,50000,true,false,Array.from({length:100},(_,i)=>({seat:i+1,avatar:0})),{width:367,height:1510,rows:13,columns:8,size:33});assert.ok(s.every(v=>Math.abs(v.x)<=1&&Math.abs(v.y)<=6));});
test('flowers grow sprout to bud to bloom without replacing existing identities',()=>{assert.equal(flowersAt(5999).length,0);assert.equal(flowersAt(6000)[0].growth,'sprout');assert.equal(flowersAt(10000)[0].growth,'bud');assert.equal(flowersAt(14000)[0].growth,'bloom');assert.equal(flowersAt(18000).length,3);assert.equal(flowersAt(18000)[0].id,flowersAt(6000)[0].id);});
test('flowers stay bounded during unlimited sessions',()=>{assert.equal(flowersAt(999999999).length,72);assert.deepEqual(flowersAt(NaN),[]);assert.deepEqual(flowersAt(-100),[]);});
test('ground layout places all feet on grass and reserves the pond',()=>{for(const width of [1366,1024,640,390])for(const n of [1,2,31,100]){const g=groundLayout(width,592,n);assert.equal(g.positions.length,n);assert.equal(new Set(g.positions.map(p=>p.x+','+p.footY)).size,n);assert.ok(g.positions.every(p=>p.footY>=.46&&p.footY<=.89));assert.ok(g.positions.every(p=>!(.03+.94*p.x>.65&&p.footY<.64)));assert.ok(g.size>=24&&g.size<=68);}});
test('a cramped cell still changes activities without pretending to walk',()=>{let l=new Life({random:()=>.5}),box={width:300,height:500,rows:10,columns:12,rowPitch:50,size:30},a=l.frame(people,0,box,true,false);let b=advance(l,20000,true,false,people,box);assert.ok(b.some((s,i)=>s.activity!==a[i].activity));assert.ok(b.every(s=>s.x===0&&s.y===0));});
console.log(count+' garden life scenarios passed');
