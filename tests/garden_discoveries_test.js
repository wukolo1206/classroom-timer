const assert=require('node:assert/strict'),D=require('../garden/discoveries.js');
let seed=31;const random=()=>((seed=seed*16807%2147483647)/2147483647);
let s=new D.Session({random}),seats=Array.from({length:31},(_,i)=>i+1),themes=[],presenters=[];
assert.equal(s.sync(0,seats).themeId,'bridge');
for(let i=1;i<=200;i++){
 let a=s.sync(i,seats);assert.equal(a.count,i);assert.ok(a.variant>=0&&a.variant<3);assert.equal(a.presenters.length,2);assert.equal(new Set(a.presenters).size,2);presenters.push(...a.presenters);
 assert.deepEqual(s.sync(i,seats.map(seat=>({seat,avatar:23}))),a);assert.deepEqual(s.snapshot(),a);
 if(i===1){assert.equal(a.themeId,'fountain');assert.equal(a.activityId,'basketball');}
 if(i<=8)assert.equal(a.unlockedIds.length,i);
 if((i-1)%4===0)themes.push(a.themeId);else assert.equal(a.themeId,themes.at(-1));
}
for(let i=0;i<themes.length-5;i+=6)assert.equal(new Set(themes.slice(i,i+6)).size,6);
for(let i=1;i<themes.length;i++)assert.notEqual(themes[i],themes[i-1]);
for(let i=0;i<presenters.length-30;i+=31)assert.equal(new Set(presenters.slice(i,i+31)).size,31);
s.reset();assert.equal(s.snapshot().count,0);assert.equal(s.sync(1,[7]).presenters.length,1);
let jump=new D.Session({random:()=>.5});assert.equal(jump.sync(200,seats).unlockedIds.length,8);
let z=new D.Session({random:()=>.5}),last;for(let i=1;i<=200;i++){let a=z.sync(i,seats);if(i>1)assert.notEqual(a.activityId,last);last=a.activityId;}
console.log('PASS discovery stability, 200 discoveries, theme bags, unlocks, presenter rounds and reset');

let invalid=new D.Session();assert.equal(invalid.sync(Infinity,[]).count,0);let saved=s.snapshot();saved.presenters.push(100);assert.notDeepEqual(saved,s.snapshot());

let gradual=new D.Session({random:()=>0});gradual.sync(0,[]);for(let i=1;i<=31;i++)gradual.sync(0,seats.slice(0,i));let debut=gradual.sync(1,seats);assert.deepEqual(debut.presenters,[2,3],'shuffle the full arrival roster at the first discovery');assert.deepEqual(gradual.sync(1,seats.map(seat=>({seat,avatar:22}))),debut);let firstRound=[...debut.presenters];for(let i=2;i<=16;i++)firstRound.push(...gradual.sync(i,seats).presenters);assert.equal(new Set(firstRound.slice(0,31)).size,31);console.log('PASS gradual arrivals receive a randomized full first presenter round');
