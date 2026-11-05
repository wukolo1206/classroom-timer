'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const p = require('node:path').join(__dirname, '../garden/core.js');
assert.ok(fs.existsSync(p), 'garden cooperation engine is missing');
const {Model, avatarRoster} = require(p);
let count = 0;
function test(label, fn) { fn(); count++; console.log('PASS ' + label); }
const roster = [{seat:1,avatar:8},{seat:3,avatar:9},{seat:8,avatar:12}];
function model(options) { return new Model(Object.assign({roster, durationMs:60000, threshold:50,random:()=>0.999}, options)); }
function ticks(m, n, level) { for(let i=0;i<n;i++) m.tick(100,level); }
test('fixed next visitor countdown is shown and never shortens to fit the session',()=>{let m=model();ticks(m,149,35);assert.equal(m.nextMs(),100);m.tick(100,35);assert.equal(m.visible().length,1);assert.equal(m.nextMs(),15000);});
test('over target immediately pauses countdown, short noises do not remove visitors',()=>{let m=model();ticks(m,200,35);let progress=m.spawnProgressMs;ticks(m,20,65);assert.equal(m.resting,true);assert.equal(m.spawnProgressMs,progress);assert.equal(m.count,1);ticks(m,10,35);assert.equal(m.resting,false);assert.equal(m.spawnProgressMs,progress+1000);});
test('sustained noise removes one per interval, then quiet can invite them back',()=>{let m=model({durationMs:null});ticks(m,450,35);assert.equal(m.count,3);ticks(m,80,65);assert.equal(m.count,2);ticks(m,80,65);assert.equal(m.count,1);ticks(m,150,35);assert.equal(m.count,2);});
test('random order has no duplicates and is not tied to seat sorting',()=>{let m=model({random:()=>0});ticks(m,450,35);assert.deepEqual(m.visible().map(r=>r.seat),[3,8,1]);assert.equal(new Set(m.visible().map(r=>r.seat)).size,3);});
test('unlimited detection keeps running beyond two hours',()=>{let m=model({durationMs:null});m.tick(8000000,35);assert.equal(m.ended,false);assert.equal(m.durationMs,null);assert.equal(m.elapsedMs,8000000);assert.equal(m.count,0);});
test('full class unlocks flowers then butterflies then stars, and continues rewards',()=>{let m=model({durationMs:null,upgradeMs:5000});ticks(m,450,35);assert.equal(m.stage,0);ticks(m,50,35);assert.equal(m.stage,1);ticks(m,50,35);assert.equal(m.stage,2);ticks(m,50,35);assert.equal(m.stage,3);ticks(m,50,35);assert.equal(m.celebrations,1);assert.equal(m.count,3);});
test('noise pauses upgrade and removal resets only unfinished progress',()=>{let m=model({durationMs:null,upgradeMs:5000});ticks(m,500,35);assert.equal(m.stage,1);ticks(m,20,35);let progress=m.upgradeProgressMs;ticks(m,10,65);assert.equal(m.upgradeProgressMs,progress);ticks(m,70,65);assert.equal(m.count,2);assert.equal(m.upgradeProgressMs,0);assert.equal(m.stage,1);ticks(m,150,35);assert.equal(m.count,3);assert.equal(m.stage,1);});
test('pause and missing signal never grow garden or remove visitors',()=>{let m=model();m.pause();ticks(m,100,35);assert.equal(m.elapsedMs,0);m.resume();ticks(m,200,null);assert.equal(m.elapsedMs,20000);assert.equal(m.count,0);assert.equal(m.noisyMs,0);});
test('refresh updates current avatars without changing countdown or arrived seats',()=>{let m=model();ticks(m,160,35);let next=m.nextMs();m.refresh([{seat:1,avatar:23},{seat:3,avatar:0},{seat:8,avatar:9}]);assert.equal(m.visible()[0].avatar,23);assert.equal(m.nextMs(),next);assert.equal(m.count,1);});
test('timed mode stops at deadline and no later ticks add visitors',()=>{let m=model({durationMs:60000,spawnMs:1000});ticks(m,600,35);assert.equal(m.ended,true);assert.equal(m.count,3);let elapsed=m.elapsedMs;ticks(m,100,35);assert.equal(m.elapsedMs,elapsed);});
test('invalid refresh rejects atomically',()=>{let m=model();assert.throws(()=>m.refresh([{seat:1,avatar:0},{seat:1,avatar:8}]));assert.throws(()=>m.refresh([{seat:1,avatar:24}]));assert.equal(m.roster.length,3);});
test('confirmed purchase and undo still project the current avatar',()=>{let events=[{type:'score',seat:1,itemId:'avatar:8',batchId:'a'},{type:'score',seat:1,itemId:'avatar:9',batchId:'b'},{type:'undo',originalBatchId:'b'}];assert.deepEqual(avatarRoster([1,3],{1:2},events),[{seat:1,avatar:8},{seat:3,avatar:3}]);});
test('clock jumps do not fabricate progress or removals',()=>{let m=model();m.tick(20000,35);assert.equal(m.quietMs,0);assert.equal(m.count,0);});
console.log(count+' garden core scenarios passed');
