'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const p = require('node:path').join(__dirname, '../garden/core.js');
assert.ok(fs.existsSync(p), 'garden cooperation engine is missing');
const {Model, avatarRoster} = require(p);
let count = 0;
function test(label, fn) { fn(); count++; console.log('PASS ' + label); }
const roster = [{seat:1,avatar:8},{seat:3,avatar:9},{seat:8,avatar:12}];
function model(options) { return new Model(Object.assign({roster, durationMs:60000, threshold:50}, options)); }
function ticks(m, n, level) { for(let i=0;i<n;i++) m.tick(100,level); }
test('first visitor needs 15 seconds of valid quiet', () => {let m=model(); ticks(m,149,35); assert.equal(m.visible().length,0); m.tick(100,35); assert.equal(m.visible()[0].seat,1);});
test('brief burst keeps progress and sustained noise rests without removing visitors', () => {let m=model(); ticks(m,150,35); ticks(m,20,65); assert.equal(m.resting,false); ticks(m,10,65); assert.equal(m.resting,true); assert.equal(m.visible().length,1); let q=m.quietMs; ticks(m,10,35); assert.equal(m.quietMs,q); ticks(m,15,35); assert.equal(m.resting,false); assert.ok(m.quietMs>q);});
test('pause and missing microphone signal never grow garden or advance timer', () => {let m=model(); m.pause(); ticks(m,100,35); assert.equal(m.elapsedMs,0); m.resume(); ticks(m,100,null); assert.equal(m.elapsedMs,10000); assert.equal(m.quietMs,0);});
test('refresh updates current avatars without losing earned visitors or countdown', () => {let m=model(); ticks(m,160,35); let elapsed=m.elapsedMs; m.refresh([{seat:1,avatar:23},{seat:3,avatar:0},{seat:8,avatar:9}]); assert.equal(m.visible()[0].avatar,23); assert.equal(m.elapsedMs,elapsed); assert.equal(m.visible().length,1);});
test('everyone can arrive during a wholly quiet session, then no duplicates', () => {let m=model(); ticks(m,600,35); assert.equal(m.ended,true); assert.deepEqual(m.visible().map(x=>x.seat),[1,3,8]); ticks(m,100,35); assert.equal(m.visible().length,3); assert.equal(m.elapsedMs,60000);});
test('next session rotates first visitor without ranking', () => {let m=model({cursor:1}); ticks(m,150,35); assert.equal(m.visible()[0].seat,3);});
test('a complete class still rotates the first visitor next session', () => {let m=model();ticks(m,600,35);assert.equal(m.nextCursor(),1);});
test('refresh rejects duplicates and invalid avatars atomically', () => {let m=model(); assert.throws(()=>m.refresh([{seat:1,avatar:0},{seat:1,avatar:8}])); assert.throws(()=>m.refresh([{seat:1,avatar:24}])); assert.equal(m.roster.length,3);});
test('confirmed avatar purchase overrides base; undo restores previous purchase; reset does not change avatar', () => {let events=[{type:'score',seat:1,itemId:'avatar:8',batchId:'a'},{type:'score',seat:1,itemId:'avatar:9',batchId:'b'},{type:'undo',originalBatchId:'b'},{type:'reset'}]; assert.deepEqual(avatarRoster([1,3],{1:2},events),[{seat:1,avatar:8},{seat:3,avatar:3}]);});
test('large clock jumps do not fabricate quiet or visitors', () => {let m=model(); m.tick(20000,35); assert.equal(m.quietMs,0); assert.equal(m.elapsedMs,20000);});
console.log(count+' garden core scenarios passed');
