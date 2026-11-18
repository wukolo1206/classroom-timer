'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const file=path.join(__dirname,'../gas/GardenRoster.gs');
assert.ok(fs.existsSync(file),'read-only garden roster endpoint is missing');
let count=0;
function setup(events, base, missing, wrongHeaders) {
 let writes=0, unlocked=false;
 const headers=['ok']; const sheet={getLastRow:()=>2,getLastColumn:()=>11,getRange:()=>({getValues:()=>[wrongHeaders?['bad']:headers]})};
 const book={getSheetByName:n=>{assert.equal(n,'班級集點紀錄');return missing?null:sheet;},insertSheet:()=>{writes++;throw Error('write forbidden');}};
 const ctx=vm.createContext({console,JSON,Date,Number,Object,Array,String,Math,Error,POINT_HEADERS:headers,POINT_SHEET_NAME:'班級集點紀錄',POINT_SPREADSHEET_ID:'TEST',POINT_ROSTER:[[1,'Do not export'],[3,'Secret']],
 SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:()=>book,flush:()=>{throw Error('flush forbidden');}},
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{unlocked=true;}})},
 pointRead_:()=>({events,manifests:[]}),pointSettings_:()=>({settings:{avatars:base||{}}}),
 pointComplete_:()=>{throw Error('completion forbidden');},getPointBundle:()=>{throw Error('import forbidden');}
 });
 // GardenRoster.gs now reuses pointCollection_ from Points.gs; load it, then restore the isolated stubs.
 const stubs={POINT_HEADERS:ctx.POINT_HEADERS,POINT_SHEET_NAME:ctx.POINT_SHEET_NAME,POINT_SPREADSHEET_ID:ctx.POINT_SPREADSHEET_ID,POINT_ROSTER:ctx.POINT_ROSTER,pointRead_:ctx.pointRead_,pointSettings_:ctx.pointSettings_,pointComplete_:ctx.pointComplete_,getPointBundle:ctx.getPointBundle};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/Points.gs'),'utf8'),ctx);Object.assign(ctx,stubs);
 vm.runInContext(fs.readFileSync(file,'utf8'),ctx);return {ctx,check:()=>{assert.equal(writes,0);assert.equal(unlocked,true);}};
}
function test(n,fn){fn();count++;console.log('PASS '+n);}
test('avatar changes and undo are projected with no student names or points',()=>{let e=setup([{seat:1,type:'score',itemId:'avatar:8',batchId:'a'},{seat:1,type:'score',itemId:'avatar:9',batchId:'b'},{type:'undo',originalBatchId:'b'}],{1:2}); let r=JSON.parse(JSON.stringify(e.ctx.getGardenRoster()));assert.deepEqual(r.roster,[{seat:1,avatar:8},{seat:3,avatar:3}]);assert.ok(!JSON.stringify(r).includes('Secret'));e.check();});
test('free equip and draws: equip changes the garden avatar, a draw alone does not, undo reverts',()=>{let e=setup([{seat:1,type:'score',itemId:'draw:30',batchId:'d'},{seat:1,type:'score',itemId:'equip:30',batchId:'q'},{seat:3,type:'score',itemId:'draw:31',batchId:'d3'}],{});let r=JSON.parse(JSON.stringify(e.ctx.getGardenRoster()));assert.deepEqual(r.roster,[{seat:1,avatar:30},{seat:3,avatar:3}]);
 e=setup([{seat:1,type:'score',itemId:'draw:30',batchId:'d'},{seat:1,type:'score',itemId:'equip:30',batchId:'q'},{type:'undo',originalBatchId:'q',seat:1}],{});r=JSON.parse(JSON.stringify(e.ctx.getGardenRoster()));assert.equal(r.roster[0].avatar,1);e.check();});
test('missing sheet returns defaults without creating sheet',()=>{let e=setup([],{1:23},true);assert.equal(e.ctx.getGardenRoster().roster[0].avatar,23);e.check();});
test('invalid header fails closed and releases lock',()=>{let e=setup([],{},false,true);assert.throws(()=>e.ctx.getGardenRoster(),/表頭/);e.check();});
console.log(count+' read-only roster scenarios passed');
