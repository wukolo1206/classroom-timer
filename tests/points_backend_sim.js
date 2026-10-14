const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const file = path.join(__dirname, '../gas/Points.gs');
assert.ok(fs.existsSync(file), 'Points.gs backend is not implemented yet');
function env(documentLockUnavailable = false, activeSpreadsheetUnavailable = false, normalizeQuotes = false) {
  const rows = [], props = {}, touched = [], opened = [], cache = {}, auction = {sheets:null, fail:false}, quiz = {sheets:null, fail:false};
  let failAt = 0, writes = 0, locked = false, eventBlocks = 0, flushes = 0, flushFail = false;
  const lockTrace=[];
  function acquire() {assert.ok(!locked); locked=true; lockTrace.push('acquire');}
  function release() {assert.ok(locked); lockTrace.push('release'); locked=false;}
  const sheet = { getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => Array.from({length:nr}, (_, i) => Array.from({length:nc}, (_, j) => (rows[r+i-1] || [])[c+j-1] ?? '')),
      setValues: values => { if (r > 1 && values[0][8] !== '_manifest') eventBlocks++; for (let i=0;i<values.length;i++) { rows[r+i-1] = values[i].map(v=>normalizeQuotes && typeof v==='string' && v.startsWith("'") ? v.slice(1) : v); writes++; if (failAt && writes === failAt) throw Error('simulated write/response loss'); } } }),
    setFrozenRows: () => {} };
  const spreadsheet={getSheetByName: name => { touched.push(name); return rows.length ? sheet : null; }, insertSheet: name => {touched.push(name); return sheet;}};
  // 外部試算表 ID 正式值在不進版控的 gas/Private.gs；模擬用固定假 ID
  const ctx = vm.createContext({console, Date, JSON, Object, Array, Number, String, Math, Error, AUCTION_SPREADSHEET_ID: 'AUCTION_TEST_ID', QUIZ_SPREADSHEET_ID: 'QUIZ_TEST_ID',
    SpreadsheetApp: { getActiveSpreadsheet: () => activeSpreadsheetUnavailable ? null : spreadsheet, openById: id => {if (id === ctx.AUCTION_SPREADSHEET_ID) return auctionBook(); if (id === ctx.QUIZ_SPREADSHEET_ID) return quizBook(); opened.push(id); return spreadsheet;}, flush: () => {assert.ok(locked,'flush must execute under held lock'); lockTrace.push('flush'); flushes++; if(flushFail) throw Error('simulated flush failure');}},
    LockService: {getDocumentLock: () => documentLockUnavailable ? null : ({waitLock: acquire, releaseLock: release}), getScriptLock: () => ({waitLock: acquire, releaseLock: release})},
    PropertiesService: {getDocumentProperties: () => ({getProperty: k => props[k] ?? null, setProperty: (k,v) => {props[k]=v;}})},
    Utilities: {newBlob: value => ({getBytes: () => Buffer.from(value)})},
    CacheService: {getScriptCache: () => ({get: k => cache[k] ?? null, put: (k,v) => {cache[k]=v;}})}
  });
  function auctionBook() {
    if (auction.fail) throw Error('simulated auction outage');
    const table = rows => ({getLastRow: () => rows.length + 1, getRange: (r, c, nr, nc) => ({getValues: () => rows.slice(r-2, r-2+nr).map(x => x.slice(c-1, c-1+nc))})});
    return {getSheetByName: name => auction.sheets && auction.sheets[name] ? table(auction.sheets[name]) : null};
  }
  function quizBook() {
    if (quiz.fail) throw Error('simulated quiz outage');
    const pick = (rows, r, c, nr, nc) => rows.slice(r-2, r-2+nr).map(x => x.slice(c-1, c-1+nc));
    const shown = v => v instanceof Date ? (v.getMonth()+1)+'-'+v.getDate() : String(v);
    const table = rows => ({getLastRow: () => rows.length + 1, getRange: (r, c, nr, nc) => ({getValues: () => pick(rows, r, c, nr, nc), getDisplayValues: () => pick(rows, r, c, nr, nc).map(x => x.map(shown))})});
    return {getSheetByName: name => quiz.sheets && quiz.sheets[name] ? table(quiz.sheets[name]) : null};
  }
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return {ctx, rows, props, touched, opened, lockTrace, auction, quiz, clearCache: () => {for (const k in cache) delete cache[k];}, flushes: () => flushes, failFlush: value => {flushFail=value;}, eventBlocks: () => eventBlocks, fail: n => {writes=0; failAt=n;}};
}
function score(id, delta=1, seats=[1,2], device='A') {return {id,type:'score',seats:seats.map(seat => ({seat,name:seat===1?'游濬謙':'李晨睿'})),itemId:'focus',label:'認真上課',delta,device};}
function total(bundle, seat) {return bundle.events.filter(e=>e.seat===seat).reduce((n,e)=>n+e.delta,0);}
let count=0;
function test(name, fn) {fn(); count++; console.log('PASS '+name);}

function balance(id='import-dojo', totals={1:46,2:26}) {
  return {id,type:'balance',seats:score('x').seats,totals,device:'A'};
}
test('balance sets absolute totals from existing awards and keeps all history', () => {
  const e=env(); e.ctx.commitPointBatch(score('before',3));
  const before=JSON.stringify(e.rows);
  const out=e.ctx.commitPointBatch(balance());
  assert.equal(total(out,1),46); assert.equal(total(out,2),26);
  assert.equal(out.events.length,4);
  assert.ok(out.events.slice(2).every(x=>x.type==='balance'&&x.itemId==='balance'&&x.label==='點數設定'));
  assert.equal(JSON.stringify(e.rows.slice(0,4)),before);
  assert.ok(e.rows.every(r=>r.length===11));
  assert.ok(e.touched.every(x=>x==='班級集點紀錄'));
  assert.throws(()=>e.ctx.commitPointBatch({type:'undo',originalBatchId:'import-dojo',device:'A'}),/復原/);
});
test('balance retry preserves subsequent scores and rejects changed targets', () => {
  const e=env(), b=balance(); e.ctx.commitPointBatch(b);
  e.ctx.commitPointBatch(score('after',2));
  const out=e.ctx.commitPointBatch({...b,seats:b.seats.slice().reverse(),totals:{2:26,1:46}});
  assert.equal(total(out,1),48); assert.equal(total(out,2),28);
  assert.equal(out.events.length,4);
  assert.throws(()=>e.ctx.commitPointBatch(balance('import-dojo',{1:47,2:26})),/衝突/);
});
test('partial balance recovers before another device awards points', () => {
  const e=env(); e.ctx.commitPointBatch(score('before',3)); e.fail(2);
  assert.throws(()=>e.ctx.commitPointBatch(balance()),/simulated/); e.fail(0);
  let out=e.ctx.commitPointBatch(score('after',2,[1],'B'));
  assert.equal(total(out,1),48); assert.equal(total(out,2),26);
  out=e.ctx.commitPointBatch(balance());
  assert.equal(total(out,1),48); assert.equal(out.events.filter(x=>x.type==='balance').length,2);
});
test('balance includes immutable zero marker and validates matching bounded integer totals', () => {
  const e=env(); e.ctx.commitPointBatch(score('before',46,[1]));
  const b=balance('zero-delta');
  const out=e.ctx.commitPointBatch(b);
  assert.equal(out.events.find(x=>x.type==='balance'&&x.seat===1).delta,0);
  e.ctx.commitPointBatch(score('after',1,[1]));
  assert.equal(total(e.ctx.commitPointBatch(b),1),47);
  [null,[],{1:46},{1:46,2:26,3:0},{1:46.5,2:26},{1:'46',2:26},{1:1000001,2:26},{1:46,2:NaN}].forEach(totals=>assert.throws(()=>e.ctx.commitPointBatch(balance('bad',totals)),/總分/));
  const negative=e.ctx.commitPointBatch(balance('negative',{1:-1000000,2:1000000}));
  assert.equal(total(negative,1),-1000000); assert.equal(total(negative,2),1000000);
});
test('sound defaults for legacy saves and allows four choices with CAS', () => {
  const e=env(); let b=e.ctx.getPointBundle(); assert.equal(b.settings.sound,'chime');
  const settings=JSON.parse(JSON.stringify(b.settings)); delete settings.sound;
  settings.avatars['1']=23; settings.groups=[{id:'g1',name:'一組',seats:[1,2]}];
  let out=e.ctx.savePointSettings(settings,0); assert.equal(out.settings.sound,'chime');
  ['chime','dingdong','levelup','sparkle'].forEach(sound=>{
    const previous=out; out=e.ctx.savePointSettings({...out.settings,sound},out.revision);
    assert.equal(out.settings.sound,sound); assert.deepEqual(out.settings.items,settings.items);
    assert.equal(out.settings.avatars['1'],23); assert.deepEqual(out.settings.groups,settings.groups);
    assert.throws(()=>e.ctx.savePointSettings({...previous.settings,sound},previous.revision),/衝突/);
  });
  ['unknown','',null,1].forEach(sound=>assert.throws(()=>e.ctx.savePointSettings({...out.settings,sound},out.revision),/音效/));
});
test('reading legacy settings does not rewrite the stored property', () => {
  const e=env(), settings=JSON.parse(JSON.stringify(e.ctx.getPointBundle().settings)); delete settings.sound;
  const raw=JSON.stringify({settings,revision:8}); e.props.pointSettings=raw;
  assert.equal(e.ctx.getPointBundle().revision,8);
  assert.equal(e.props.pointSettings,raw);
});

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
test('server roster exactly matches authoritative index.html seatRoster', () => {
  const e=env(), code=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const list=code.match(/var seatRoster = (\{[\s\S]*?\});/)[1];
  const roster=vm.runInNewContext('('+list+')');
  const expected=Object.keys(roster).map(seat=>[Number(seat),roster[seat][0]]).sort((a,b)=>a[0]-b[0]);
  assert.equal(JSON.stringify(e.ctx.POINT_ROSTER),JSON.stringify(expected));
});
test('avatar purchase charges configured cost once, refuses low balance or stale price, undo reverses', () => {
  const e=env(), buy=(id,idx,delta=-5,seats=[1])=>({id,type:'score',seats:score('x',1,seats).seats,itemId:'avatar:'+idx,label:'任意',delta,device:'A'});
  assert.throws(()=>e.ctx.commitPointBatch(buy('a0',3)),/點數不足/);
  assert.equal(e.ctx.getPointBundle().events.length,0); assert.equal(e.rows.length,1);
  e.ctx.commitPointBatch(score('earn',4,[1]));
  assert.throws(()=>e.ctx.commitPointBatch(buy('a1',3)),/點數不足/);
  e.ctx.commitPointBatch(score('earn2',1,[1]));
  let out=e.ctx.commitPointBatch(buy('a2',3));
  assert.equal(total(out,1),0); const ev=out.events.find(x=>x.batchId==='a2');
  assert.equal(ev.itemId,'avatar:3'); assert.equal(ev.label,'更換角色'); assert.equal(ev.delta,-5);
  assert.equal(total(e.ctx.commitPointBatch(buy('a2',3)),1),0,'retry does not double charge');
  assert.throws(()=>e.ctx.commitPointBatch(buy('a3',24)),/換角色資料/);
  assert.throws(()=>e.ctx.commitPointBatch(buy('a4',3,-5,[1,2])),/換角色資料/);
  assert.throws(()=>e.ctx.commitPointBatch(buy('a5',3,5)),/換角色資料/);
  out=e.ctx.commitPointBatch({type:'undo',originalBatchId:'a2',device:'A'});
  assert.equal(total(out,1),5);
  const s=e.ctx.getPointBundle().settings; e.ctx.savePointSettings({...s,avatarCost:3},0);
  assert.equal(e.ctx.getPointBundle().settings.avatarCost,3);
  assert.throws(()=>e.ctx.commitPointBatch(buy('a6',4,-5)),/改為 3 點/);
  assert.equal(total(e.ctx.commitPointBatch(buy('a7',4,-3)),1),2);
  assert.throws(()=>e.ctx.savePointSettings({...s,avatarCost:0},1),/1～100/);
  assert.throws(()=>e.ctx.savePointSettings({...s,avatarCost:101},1),/1～100/);
});
test('auction wins after cutoff import once as deductions; old, unknown, ambiguous and outage are skipped', () => {
  const e=env(), since=e.ctx.AUCTION_IMPORT_SINCE.getTime(), t=n=>new Date(since+n*1000);
  e.ctx.commitPointBatch(score('earn',50,[1,2]));
  e.auction.sheets={'名冊_408':[['01','游O謙'],['02','李O睿'],['03','重O名'],['04','重O名']],
    '得標紀錄_408':[[new Date(since-1000),'舊商品','游O謙',30],[t(5),'POCKY\n一盒','游O謙',16],[t(6),'貼紙','（無人出價）',0],[t(7),'筆','路O人',5],[t(8),'橡皮擦','重O名',3],[t(9),'大獎','李O睿',120]]};
  e.auction.fail=true; let out=e.ctx.getPointBundle(); assert.equal(total(out,1),50,'outage does not block sync');
  e.auction.fail=false; out=e.ctx.getPointBundle();
  const imported=out.events.filter(x=>x.itemId==='auction_win');
  assert.deepEqual(imported.map(x=>[x.seat,x.delta,x.label,x.batchId]),[[1,-16,'拍賣得標：POCKY 一盒','auction408_'+t(5).getTime()+'_1'],[2,-120,'拍賣得標：大獎','auction408_'+t(9).getTime()+'_2']]);
  assert.equal(total(out,1),34); assert.equal(total(out,2),-70);
  e.clearCache(); out=e.ctx.getPointBundle(); assert.equal(out.events.filter(x=>x.itemId==='auction_win').length,2,'repeat import is idempotent');
  e.auction.sheets['得標紀錄_408'].push([t(20),'第二件','游O謙',4]);
  out=e.ctx.getPointBundle(); assert.equal(total(out,1),34,'cache throttles reads');
  e.clearCache(); out=e.ctx.getPointBundle(); assert.equal(total(out,1),30);
  assert.throws(()=>e.ctx.commitPointBatch({...score('x'),id:'auction408_1_1'}),/保留字/);
  assert.equal(out.events.filter(x=>x.itemId==='auction_win').length,3);
});
test('quiz scores import per submission: >=20 questions, 90+ gives 2, 80+ gives 1, once each, 408 only', () => {
  const e=env(), since=e.ctx.QUIZ_IMPORT_SINCE.getTime(), t=n=>new Date(since+n*1000);
  const fmt=d=>{const p=x=>String(x).padStart(2,'0'), l=new Date(d.getTime()+8*3600e3);return l.getUTCFullYear()+'/'+p(l.getUTCMonth()+1)+'/'+p(l.getUTCDate())+' '+p(l.getUTCHours())+':'+p(l.getUTCMinutes())+':'+p(l.getUTCSeconds());};
  e.quiz.sheets={
    '綜合練習成績單':[[new Date(since-1000),'408','01','游濬謙','general','國語','L1',20,100],
      [t(1),'408','01','游濬謙','general','國語','第1課＋第2課',20,95],
      [fmt(t(2)),'408','02','李晨睿','general','國語','第3課',25,85],
      [t(3),'408','02','李晨睿','general','國語','第3課',19,100],
      [t(4),'408','01','游濬謙','general','國語','第3課',20,79.5],
      [t(5),'402','01','別班','general','國語','第3課',20,100],
      [t(6),'408','07','空號','general','國語','第3課',20,100]],
    '期末考成績單':[[t(7),'408','01','游濬謙','exam','社會',new Date(2026,0,2),30,90]]};
  e.quiz.fail=true; let out=e.ctx.getPointBundle(); assert.equal(out.events.length,0,'outage does not block');
  e.quiz.fail=false; out=e.ctx.getPointBundle();
  const got=out.events.filter(x=>x.itemId==='quiz_award').map(x=>[x.seat,x.delta,x.label,x.batchId]);
  assert.deepEqual(got,[[1,2,'測驗加點：綜合練習 第1課＋第2課 95分','quiz408_general_'+t(1).getTime()+'_1'],
    [2,1,'測驗加點：綜合練習 第3課 85分','quiz408_general_'+t(2).getTime()+'_2'],
    [1,2,'測驗加點：測驗 1-2 90分','quiz408_exam_'+t(7).getTime()+'_1']]);
  e.clearCache(); out=e.ctx.getPointBundle(); assert.equal(out.events.filter(x=>x.itemId==='quiz_award').length,3,'idempotent');
  e.quiz.sheets['綜合練習成績單'].push([t(20),'408','01','游濬謙','general','國語','第1課＋第2課',20,95]);
  e.clearCache(); out=e.ctx.getPointBundle(); assert.equal(total(out,1),6,'each submission counts');
  assert.throws(()=>e.ctx.commitPointBatch({...score('x'),id:'quiz408_a_1_1'}),/保留字/);
  assert.equal(e.ctx.pointQuizDelta_(20,90),2); assert.equal(e.ctx.pointQuizDelta_(20,89.9),1); assert.equal(e.ctx.pointQuizDelta_(19,100),0); assert.equal(e.ctx.pointQuizDelta_(40,79),0);
});
test('per-student quiz thresholds from 集點加點標準 lower the bar only for that student', () => {
  const e=env(), since=e.ctx.QUIZ_IMPORT_SINCE.getTime(), t=n=>new Date(since+n*1000);
  e.quiz.sheets={
    '集點加點標準':[['02','李晨睿',60,70,'2026/10/14 10:00:00'],['03','王柏勛','',75,'x']],
    '期末考成績單':[[t(1),'408','02','李晨睿','exam','國語','L1',20,65],[t(2),'408','02','李晨睿','exam','國語','L1',20,72],
      [t(3),'408','03','王柏勛','exam','國語','L1',20,78],[t(4),'408','03','王柏勛','exam','國語','L1',20,79],[t(5),'408','01','游濬謙','exam','國語','L1',20,72],
      [t(6),'408','02','李晨睿','exam','國語','L1',19,100]]};
  const out=e.ctx.getPointBundle();
  assert.deepEqual(out.events.filter(x=>x.itemId==='quiz_award').map(x=>[x.seat,x.delta]),[[2,1],[2,2],[3,2],[3,2]]);
  assert.equal(e.ctx.pointQuizDelta_(20,79,{plus1:80,plus2:90}),0);
});
console.log(count+' backend scenarios passed');
