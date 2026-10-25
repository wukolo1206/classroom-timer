const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),path=require('path');
const root=path.join(__dirname,'../gas');
function env(){
 const rows=[],trace=[]; let locked=false,fail=0,writes=0,fetches=0,next,hook;
 const props={BOARD_SCORE_BRIDGE_URL:'https://teacherwu.xdai.tw/discuss',BOARD_SCORE_BRIDGE_CLASS:'A01',BOARD_SCORE_BRIDGE_TOKEN:'testOnlyClassToken'};
 const sheet={getLastRow:()=>rows.length,getLastColumn:()=>rows.length?11:0,setFrozenRows:()=>{},getRange:(r,c,n=1,k=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:k},(_,j)=>(rows[r+i-1]||[])[c+j-1]??'')),setValues:v=>{assert(locked);for(let i=0;i<v.length;i++){rows[r+i-1]=v[i];if(++writes===fail)throw Error('lost response');}}})};
 const book={getSheetByName:n=>{assert.equal(n,'班級集點紀錄');return sheet;},insertSheet:()=>sheet};
 const ctx=vm.createContext({Date,JSON,Number,Object,Array,String,Math,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]}),getDocumentProperties:()=>{throw Error('settings forbidden');}},
 SpreadsheetApp:{getActiveSpreadsheet:()=>{assert(locked);return book;},flush:()=>{assert(locked);trace.push('flush');}},
 LockService:{getScriptLock:()=>({waitLock:()=>{assert(!locked);locked=true;trace.push('lock');},releaseLock:()=>{assert(locked);locked=false;trace.push('release');}})},
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>Array.from(crypto.createHash(a).update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest())},
 UrlFetchApp:{fetch:(url,opt)=>{assert(!locked,'network must not hold lock');fetches++;assert.equal(url,props.BOARD_SCORE_BRIDGE_URL+'/api/score-bridge/individual-settlement');assert.equal(opt.followRedirects,false);assert.equal(opt.headers.Authorization,'Bearer '+props.BOARD_SCORE_BRIDGE_TOKEN);const body=JSON.parse(opt.payload);assert.deepEqual(Object.keys(body).sort(),['context','session_id']);assert.deepEqual(Object.keys(body.context).sort(),['class_code','roster']);if(hook)hook();return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(next||manifest(body.session_id,body.context.roster))};}},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}});
 ['Points.gs','BoardScoreBridge.gs','Code.gs'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx));
 const target=path.join(root,'BoardIndividualPoints.gs');if(fs.existsSync(target))vm.runInContext(fs.readFileSync(target,'utf8'),ctx);
 ctx.POINT_ROSTER=[[1,'甲'],[2,'乙'],[3,'丙']];
 function req(sid='session_1',extra={}){const b={api:'boardIndividualPoints',class_code:'A01',session_id:sid,timestamp:Date.now(),...extra};b.signature=crypto.createHmac('sha256',props.BOARD_SCORE_BRIDGE_TOKEN).update(JSON.stringify(['board-individual/1',b.class_code,b.session_id,b.timestamp])).digest('hex');return b;}
 const call=b=>ctx.doPost({postData:{contents:JSON.stringify(b||req())}});
 return{ctx,rows,trace,props,req,call,fetches:()=>fetches,fail:n=>{fail=n;writes=0;},next:v=>next=v,hook:f=>hook=f};
}
function manifest(sid,roster,scores){scores=scores||roster.map((r,i)=>({seat:r.seat,delta:i===0?5:i===1?1000000:0}));return{version:1,class_code:'A01',session_id:sid,roster,scores,digest:crypto.createHash('sha256').update(JSON.stringify([1,'A01',sid,roster,scores])).digest('hex')};}
let count=0;function test(n,f){f();console.log('PASS '+n);count++;}
test('signed settlement appends once with one manifest, positive events, receipt only',()=>{const e=env(),out=e.call();assert.equal(out.status,'ok');assert.deepEqual(out.added,[{seat:1,delta:5},{seat:2,delta:1000000}]);assert.equal(out.total,1000005);assert.equal(e.rows.length,4);assert(e.rows.every(r=>r.length===11));assert.equal(e.rows.filter(r=>r[8]==='_manifest').length,1);assert.deepEqual(e.call(),out);assert.equal(e.fetches(),1);assert.deepEqual(e.trace.slice(0,7),['lock','flush','release','lock','flush','release','lock']);});
test('auth and exact shape reject before spreadsheet or network and do not echo',()=>{for(const change of [{class_code:'B01'},{timestamp:0},{timestamp:1.5},{session_id:'../bad'},{scores:[]},{signature:'f'.repeat(64)}]){const e=env();const b=e.req('session_1',change);if(change.signature)b.signature=change.signature;const out=e.call(b);assert.equal(out.status,'error');assert.deepEqual(Object.keys(out).sort(),['code','status']);assert.equal(e.rows.length,0);assert.equal(e.fetches(),0);assert(!JSON.stringify(out).includes(e.props.BOARD_SCORE_BRIDGE_TOKEN));}});
test('all zero keeps empty manifest and stable receipt',()=>{const e=env();e.hook(()=>{});const roster=e.ctx.POINT_ROSTER.map(r=>({seat:r[0],fingerprint:e.ctx.boardScoreFingerprint_('A01',r[0],r[1])}));e.next(manifest('zero_session',roster,roster.map(r=>({seat:r.seat,delta:0}))));const out=e.call(e.req('zero_session'));assert.equal(out.status,'ok');assert.equal(out.total,0);assert.deepEqual(out.added,[]);assert.equal(e.rows.length,2);assert.deepEqual(e.call(e.req('zero_session')),out);});
test('partial write fills original events; lost response ignores new board state and context',()=>{for(const failAt of [2,3,4]){const e=env();e.fail(failAt);assert.equal(e.call().status,'error');e.fail(0);e.next({bad:'changed board'});const out=e.call();assert.equal(out.status,'ok');assert.equal(e.rows.length,4);assert.equal(e.fetches(),1);e.ctx.POINT_ROSTER[2][1]='changed zero score student';assert.deepEqual(e.call(),out);assert.equal(e.fetches(),1);}});
test('bad manifest digest, shape, bounds, roster and duplicates write nothing',()=>{for(const mutate of [m=>m.digest='0'.repeat(64),m=>m.extra=1,m=>m.scores[0].delta=-1,m=>m.scores[0].delta=1000001,m=>m.scores[0].delta=0.1,m=>m.roster[0].fingerprint='0'.repeat(16),m=>m.scores[1].seat=1,m=>m.scores.pop()]){const e=env(),roster=e.ctx.POINT_ROSTER.map(r=>({seat:r[0],fingerprint:e.ctx.boardScoreFingerprint_('A01',r[0],r[1])})),m=manifest('session_1',roster);mutate(m);e.next(m);assert.equal(e.call().status,'error');assert(e.rows.length<=1);}});
test('parallel second check uses existing reservation',()=>{const e=env();e.hook(()=>{e.hook(null);assert.equal(e.call().status,'ok');});assert.equal(e.call().status,'ok');assert.equal(e.rows.length,4);});
test('ordinary RPC rejects reserved prefix and item',()=>{const e=env(),b={id:'normal',type:'score',seats:[{seat:1,name:'甲'}],device:'A',itemId:'focus',label:'x',delta:1};assert.throws(()=>e.ctx.pointBatch_({...b,id:'boardind:A01:session_1'}));assert.throws(()=>e.ctx.pointBatch_({...b,itemId:'board_individual'}));});

test('current roster changing during network gap cannot reserve a stale manifest',()=>{
 const e=env();e.hook(()=>{e.ctx.POINT_ROSTER[0][1]='new name';});
 assert.equal(e.call().status,'error');assert.equal(e.rows.length,1);
});
test('existing manifest corruption fails closed without callback or overwritten rows',()=>{
 for(const kind of ['digest','event','identity','orphan','roster']){
  const e=env();assert.equal(e.call().status,'ok');
  if(kind==='roster')e.ctx.POINT_ROSTER[0][1]='changed positive student';
  else if(kind==='orphan')e.rows.splice(1,1);
  else {const m=JSON.parse(e.rows[1][6]);if(kind==='digest')m.request.manifest.digest='0'.repeat(64);if(kind==='event')m.events[0].delta++;if(kind==='identity')m.request.manifest.class_code='B01';e.rows[1][6]=JSON.stringify(m);}
  const before=JSON.stringify(e.rows);assert.equal(e.call().status,'error');assert.equal(JSON.stringify(e.rows),before);assert.equal(e.fetches(),1);
 }
});
test('upstream failures never leak secrets and release the lock for retries',()=>{
 const e=env();e.hook(()=>{throw Error(e.props.BOARD_SCORE_BRIDGE_TOKEN);});
 const out=e.call();assert.deepEqual(out,{status:'error',code:'individual_points_unconfirmed'});
 assert(!JSON.stringify(out).includes(e.props.BOARD_SCORE_BRIDGE_TOKEN));
 e.hook(null);assert.equal(e.call().status,'ok');
});
test('fresh signature repeats retain original signed request identity and score events',()=>{
 const e=env(),first=e.req();assert.equal(e.call(first).status,'ok');
 const manifestRow=JSON.parse(e.rows[1][6]);assert(!JSON.stringify(manifestRow).includes('timestamp'));
 assert(!JSON.stringify(manifestRow).includes(e.props.BOARD_SCORE_BRIDGE_TOKEN));
 const second=e.req('session_1',{timestamp:first.timestamp+1});assert.equal(e.call(second).status,'ok');assert.equal(e.rows.length,4);assert.equal(e.fetches(),1);
});
console.log(count+' individual points scenarios passed');

