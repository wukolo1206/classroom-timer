const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const file = path.join(__dirname, '../gas/Points.gs');
assert.ok(fs.existsSync(file), 'Points.gs backend is not implemented yet');
function env(documentLockUnavailable = false, activeSpreadsheetUnavailable = false, normalizeQuotes = false) {
  const rows = [], props = {}, touched = [], opened = [];
  let failAt = 0, writes = 0, locked = false, eventBlocks = 0, flushes = 0, flushFail = false;
  const lockTrace=[];
  function acquire() {assert.ok(!locked); locked=true; lockTrace.push('acquire');}
  function release() {assert.ok(locked); lockTrace.push('release'); locked=false;}
  const sheet = { getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => Array.from({length:nr}, (_, i) => Array.from({length:nc}, (_, j) => (rows[r+i-1] || [])[c+j-1] ?? '')),
      setValues: values => { if (r > 1 && values[0][8] !== '_manifest') eventBlocks++; for (let i=0;i<values.length;i++) { rows[r+i-1] = values[i].map(v=>normalizeQuotes && typeof v==='string' && v.startsWith("'") ? v.slice(1) : v); writes++; if (failAt && writes === failAt) throw Error('simulated write/response loss'); } } }),
    setFrozenRows: () => {} };
  const spreadsheet={getSheetByName: name => { touched.push(name); return rows.length ? sheet : null; }, insertSheet: name => {touched.push(name); return sheet;}};
  const ctx = vm.createContext({console, Date, JSON, Object, Array, Number, String, Math, Error,
    SpreadsheetApp: { getActiveSpreadsheet: () => activeSpreadsheetUnavailable ? null : spreadsheet, openById: id => {opened.push(id); return spreadsheet;}, flush: () => {assert.ok(locked,'flush must execute under held lock'); lockTrace.push('flush'); flushes++; if(flushFail) throw Error('simulated flush failure');}},
    LockService: {getDocumentLock: () => documentLockUnavailable ? null : ({waitLock: acquire, releaseLock: release}), getScriptLock: () => ({waitLock: acquire, releaseLock: release})},
    PropertiesService: {getDocumentProperties: () => ({getProperty: k => props[k] ?? null, setProperty: (k,v) => {props[k]=v;}})},
    Utilities: {newBlob: value => ({getBytes: () => Buffer.from(value)})}
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return {ctx, rows, props, touched, opened, lockTrace, flushes: () => flushes, failFlush: value => {flushFail=value;}, eventBlocks: () => eventBlocks, fail: n => {writes=0; failAt=n;}};
}
function score(id, delta=1, seats=[1,2], device='A') {return {id,type:'score',seats:seats.map(seat => ({seat,name:seat===1?'游濬謙':'李晨睿'})),itemId:'focus',label:'認真上課',delta,device};}
function total(bundle, seat) {return bundle.events.filter(e=>e.seat===seat).reduce((n,e)=>n+e.delta,0);}
let count=0;
function test(name, fn) {fn(); count++; console.log('PASS '+name);}

test('expanded avatar settings allow index 23 and reject 24', () => {
  const e=env(), settings=JSON.parse(JSON.stringify(e.ctx.getPointBundle().settings));
  settings.avatars['1']=23;
  assert.equal(e.ctx.savePointSettings(settings,0).settings.avatars['1'],23);
  settings.avatars['1']=24;
  assert.throws(()=>e.ctx.savePointSettings(settings,1),/角色/);
});

test('auction charges 120 once, rejects positive or fractional amount, undo restores', () => {
  const e=env(), b={...score('auction120',-120,[1]),itemId:'auction',label:'拍賣扣點'};
  let out=e.ctx.commitPointBatch(b);assert.equal(total(out,1),-120);
  out=e.ctx.commitPointBatch(b);assert.equal(total(out,1),-120);
  assert.throws(()=>e.ctx.commitPointBatch({...b,id:'bad1',delta:120}));
  assert.throws(()=>e.ctx.commitPointBatch({...b,id:'bad2',delta:-1.2}));
  out=e.ctx.commitPointBatch({type:'undo',originalBatchId:b.id,device:'A'});assert.equal(total(out,1),0);
});
test('sheet RPCs flush while held before release, including partial exceptions', () => {
  const e=env(); e.ctx.getPointBundle();
  assert.deepEqual(e.lockTrace,['acquire','flush','release']);
  e.lockTrace.length=0; e.fail(2);
  assert.throws(()=>e.ctx.commitPointBatch(score('flush-partial')),/simulated/);
  assert.deepEqual(e.lockTrace,['acquire','flush','release']);
  e.fail(0); e.lockTrace.length=0;
  e.ctx.commitPointBatch(score('flush-partial'));
  assert.deepEqual(e.lockTrace,['acquire','flush','release']);
  e.failFlush(true); e.lockTrace.length=0;
  assert.throws(()=>e.ctx.getPointBundle(),/flush failure/);
  assert.deepEqual(e.lockTrace,['acquire','flush','release']);
  e.failFlush(false); assert.equal(e.ctx.getPointBundle().events.length,2);
});
test('literal quotes and zero width prefixes survive Sheets quote normalization', () => {
  const e=env(false,false,true);
  const labels=["'=1+1","'plain","''",'\u200B=1+1','\u200B\u200Bplain','=1+1','  +2','@client','-1'];
  labels.forEach((label,i)=>{
    const b={...score('quoted'+i,1,[1]),label};
    const expected=label.trim(); // The public API intentionally normalizes surrounding whitespace.
    assert.equal(e.ctx.commitPointBatch(b).events[i].label,expected);
    assert.equal(e.ctx.getPointBundle().events[i].label,expected);
    assert.equal(e.ctx.commitPointBatch(b).events[i].label,expected);
    assert.equal(e.ctx.pointUnescape_(e.ctx.pointEscape_(label)),label);
  });
  assert.equal(e.ctx.getPointBundle().events.length,labels.length);
});
test('webapp works when document lock is unavailable', () => {
  const e=env(true);
  assert.equal(e.ctx.getPointBundle().revision,0);
  assert.equal(e.ctx.commitPointBatch(score('webapp')).events.length,2);
  const s=e.ctx.getPointBundle().settings;
  assert.equal(e.ctx.savePointSettings(s,0).revision,1);
});
test('whole roster score writes one event block', () => {
  const e=env(); const seats=Array.from(e.ctx.POINT_ROSTER, r=>({seat:r[0],name:r[1]}));
  assert.equal(e.ctx.commitPointBatch({...score('all'),seats}).events.length,31);
  assert.equal(e.eventBlocks(),1);
});
test('webapp opens existing bound spreadsheet when active spreadsheet is null', () => {
  const e=env(true,true);
  assert.equal(e.ctx.commitPointBatch(score('bound')).events.length,2);
  assert.ok(e.opened.length);
  const boundId=JSON.parse(fs.readFileSync(path.join(__dirname,'../gas/.clasp.json'),'utf8')).parentId;
  assert.ok(e.opened.every(id=>id===boundId));
  assert.ok(e.touched.every(name=>name==='班級集點紀錄'));
});
test('score, negative totals, duplicate response, same ID conflict, only new sheet', () => {
  const e=env(), b=score('s1',-3); let out=e.ctx.commitPointBatch(b);
  assert.equal(out.events.length,2); assert.equal(total(out,1),-3);
  out=e.ctx.commitPointBatch(b); assert.equal(out.events.length,2);
  assert.throws(()=>e.ctx.commitPointBatch(score('s1',2)),/衝突/);
  assert.ok(e.touched.every(n=>n==='班級集點紀錄'));
});
test('partial write retry fills missing and durable manifest rejects changed seats', () => {
  const e=env(); e.ctx.getPointBundle(); e.fail(2);
  assert.throws(()=>e.ctx.commitPointBatch(score('partial')),/simulated/);
  e.fail(0); assert.throws(()=>e.ctx.commitPointBatch(score('partial',1,[1])),/衝突/);
  assert.equal(e.ctx.commitPointBatch(score('partial')).events.length,2);
});
test('two device interleaving and double undo canonical server reversal', () => {
  const e=env(); e.ctx.commitPointBatch(score('a',3)); e.ctx.commitPointBatch(score('b',-1,[1],'B'));
  const undo={id:'client-undo',type:'undo',originalBatchId:'a',device:'A'};
  let out=e.ctx.commitPointBatch(undo); assert.equal(total(out,1),-1); assert.equal(total(out,2),0);
  out=e.ctx.commitPointBatch({...undo,id:'different',device:'B'}); assert.equal(out.events.length,5);
  assert.ok(out.events.filter(x=>x.type==='undo').every(x=>x.batchId==='undo:a'));
});
test('response lost after complete batch does not double apply on repeat', () => {
  const e=env(); e.ctx.getPointBundle(); e.fail(3);
  assert.throws(()=>e.ctx.commitPointBatch(score('lost',5)),/simulated/);
  e.fail(0); const out=e.ctx.commitPointBatch(score('lost',5));
  assert.equal(out.events.length,2); assert.equal(total(out,1),5);
});
test('reset repeat after new score does not remove new points', () => {
  const e=env(); e.ctx.commitPointBatch(score('a',4));
  const reset={id:'r1',type:'reset',seats:score('x').seats,device:'A'};
  let out=e.ctx.commitPointBatch(reset); assert.equal(total(out,1),0);
  e.ctx.commitPointBatch(score('b',2)); out=e.ctx.commitPointBatch(reset); assert.equal(total(out,1),2);
});
test('partial reset recovers before another device scores', () => {
  const e=env(); e.ctx.commitPointBatch(score('a',4)); e.fail(2);
  const reset={id:'r1',type:'reset',seats:score('x').seats,device:'A'};
  assert.throws(()=>e.ctx.commitPointBatch(reset)); e.fail(0);
  let out=e.ctx.commitPointBatch(score('b',2,[1],'B')); assert.equal(total(out,1),2); assert.equal(total(out,2),0);
  out=e.ctx.commitPointBatch(reset); assert.equal(total(out,1),2);
});
test('header refusal preserves existing data', () => {
  const e=env(); e.rows.push(['unrelated']); const before=JSON.stringify(e.rows);
  assert.throws(()=>e.ctx.commitPointBatch(score('a')), /表頭/); assert.equal(JSON.stringify(e.rows),before);
});
test('malformed inputs reject without events', () => {
  const e=env();
  [null,score('x',0),score('x',101),score('x',1.5),score('undo:bad'),{...score('x'),type:'bad'},score('x',1,[7]),{...score('x'),seats:[{seat:1,name:'wrong'}]},score('x',1,[1,1])].forEach(b=>assert.throws(()=>e.ctx.commitPointBatch(b)));
  assert.equal(e.ctx.getPointBundle().events.length,0);
  assert.throws(()=>e.ctx.commitPointBatch({id:'u',type:'undo',originalBatchId:'unknown',device:'A'}));
});
test('settings default, CAS, both signs, avatars, groups and bounded size', () => {
  const e=env(), b=e.ctx.getPointBundle(); assert.equal(b.revision,0);
  const s={items:[{id:'plus',label:'認真',delta:1},{id:'minus',label:'秩序',delta:-1}],avatars:{1:7},groups:[{id:'g1',name:'一組',seats:[1,2]}],muted:false};
  assert.equal(e.ctx.savePointSettings(s,0).revision,1);
  assert.throws(()=>e.ctx.savePointSettings(s,0),/衝突/);
  [{...s,items:[s.items[0]]},{...s,avatars:{1:24}},{...s,groups:[...s.groups,{id:'g2',name:'二組',seats:[1]}]},{...s,muted:'yes'}].forEach(x=>assert.throws(()=>e.ctx.savePointSettings(x,1)));
  assert.equal(e.ctx.getPointBundle().revision,1);
});
test('formula text is escaped in sheet and round trips', () => {
  const e=env(); const b={...score('safe',1,[1]),label:'=1+1',device:'@client'}; const out=e.ctx.commitPointBatch(b);
  assert.equal(out.events[0].label,'=1+1'); assert.equal(out.events[0].device,'@client');
  assert.ok(e.rows.slice(1).every(r=>r.every(v=>typeof v!=='string'||!/^\s*[=+@-]/.test(v))));
});
test('zero total reset records immutable zero marker and retry survives later scoring', () => {
  const e=env(), reset={id:'zero',type:'reset',seats:score('x',1,[1]).seats,device:'A'};
  assert.equal(e.ctx.commitPointBatch(reset).events[0].delta,0);
  e.ctx.commitPointBatch(score('later',1,[1]));
  assert.equal(total(e.ctx.commitPointBatch(reset),1),1);
});
test('settings byte budget refuses oversized Chinese data without replacing config', () => {
  const e=env(); const s={items:Array.from({length:40},(_,i)=>({id:'i'+i,label:'課'.repeat(80),delta:i%2?1:-1})),avatars:{},groups:[],muted:false};
  assert.throws(()=>e.ctx.savePointSettings(s,0),/太大/); assert.equal(e.ctx.getPointBundle().revision,0);
});
test('server roster exactly matches existing Code.gs source list', () => {
  const e=env(), code=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
  const list=code.match(/var students = (\[[\s\S]*?\]);/)[1];
  assert.equal(JSON.stringify(e.ctx.POINT_ROSTER),JSON.stringify(vm.runInNewContext(list)));
});
console.log(count+' backend scenarios passed');
