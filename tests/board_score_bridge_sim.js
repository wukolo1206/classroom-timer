// Run the actual GAS bridge against isolated in-memory service doubles.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bridgePath = path.join(__dirname, '..', 'gas', 'BoardScoreBridge.gs');
const source = fs.existsSync(bridgePath) ? fs.readFileSync(bridgePath, 'utf8') : '';
const tests = [];
const TOKEN = 'anonymous-test-token-12345';
const DEFAULT_ROSTER = [[1, ' 王\u200b甲 '], [2, 'e\u0301  乙'], [8, '匿名丙']];
function env(options = {}) {
  const calls = [], writes = [];
  const props = Object.assign({BOARD_SCORE_BRIDGE_URL:'https://teacherwu.xdai.tw/discuss', BOARD_SCORE_BRIDGE_TOKEN:TOKEN, BOARD_SCORE_BRIDGE_CLASS:'A01'}, options.props);
  const ctx = {
    POINT_ROSTER: options.roster || DEFAULT_ROSTER,
    pointSettings_: () => ({settings:{groups:options.groups || [{id:'g-a',name:'不外傳組名',seats:[2,1]},{id:'g-b',seats:[8]}]},revision:9}),
    getPointBundle: () => { throw new Error('write-capable bundle must never be called'); },
    PropertiesService:{getScriptProperties:() => ({getProperty:key => props[key] || null, setProperty:() => writes.push('property')})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(alg, text) => Array.from(crypto.createHash(alg).update(text,'utf8').digest()).map(x=>x > 127 ? x-256 : x)},
    UrlFetchApp:{fetch:(url, config) => {
      calls.push({url,config,body:JSON.parse(config.payload)});
      if (options.failure) throw new Error('internal detail ' + TOKEN);
      return {getResponseCode:()=> options.status || 200, getContentText:()=> options.raw === undefined ? JSON.stringify(options.response || {class_code:'A01',session_id:'s-1',state_version:3,groups:{}}) : options.raw};
    }}
  };
  vm.createContext(ctx); vm.runInContext(source,ctx);
  const invoke = (fn, ...args) => {
    assert.equal(typeof ctx[fn], 'function', fn + ' must be implemented');
    return JSON.parse(JSON.stringify(ctx[fn](...args)));
  };
  return {ctx,calls,writes,invoke};
}
function operation(type='adjust_group_score', data={group:1,delta:2,label:'合作',expected_state_version:3}) {
  return {session_id:'s-1',cid:'timer-client-1',op:{op_id:'op-1',type,data}};
}
function resultRequest() { return {session_id:'s-1',cid:'timer-client-1',op_id:'op-1'}; }
function test(name, body) { tests.push([name,body]); }
function expectRejected(e, name, req) { assert.throws(()=>e.invoke(name,req)); assert.equal(e.calls.length,0); }

test('read uses private endpoint/header and generates server context without any local write',()=>{
  const e=env(); const result=e.invoke('getBoardScoreSnapshot');
  assert.equal(result.session_id,'s-1'); assert.deepEqual(e.writes,[]); assert.equal(e.calls.length,1);
  const call=e.calls[0]; assert.equal(call.url,'https://teacherwu.xdai.tw/discuss/api/score-bridge/read');
  assert.equal(call.config.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(call.config.method,'post'); assert.equal(call.config.contentType,'application/json');
  assert.equal(call.config.followRedirects,false); assert.equal(call.config.muteHttpExceptions,true);
  assert.deepEqual(call.body.context.groups,[{group:1,seats:[1,2]},{group:2,seats:[8]}]);
  assert.equal(call.body.context.class_code,'A01');
  assert.deepEqual(call.body.context.roster,DEFAULT_ROSTER.map(([seat,name])=>({seat,fingerprint:crypto.createHash('sha256').update(JSON.stringify(['discuss-roster/1','A01',seat,name.normalize('NFC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim().replace(/\s+/g,' ')])).digest('hex').slice(0,16)})));
  assert.equal(JSON.stringify(call.body).includes('匿名丙'),false);
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
});
test('missing class defaults to 408 while test configuration remains private',()=>{
  const e=env({props:{BOARD_SCORE_BRIDGE_CLASS:''}});e.invoke('getBoardScoreSnapshot');assert.equal(e.calls[0].body.context.class_code,'408');
});
test('adjust operation preserves ids, exact delta and version with server context',()=>{
  const response={result:{status:'ok',op_id:'op-1'},snapshot:{session_id:'s-1',state_version:4}};
  const e=env({response});assert.deepEqual(e.invoke('commitBoardScoreOperation',operation()),response);
  assert.equal(e.calls[0].url,'https://teacherwu.xdai.tw/discuss/api/score-bridge/ops');
  const body=e.calls[0].body;assert.deepEqual(body.op,operation().op);assert.equal(body.cid,'timer-client-1');assert.equal(body.session_id,'s-1');assert.equal(body.context.class_code,'A01');
});
test('clear and undo forward only their allowlisted data',()=>{
  for (const [type,data] of [['clear_group_scores',{expected_state_version:4}],['undo_score_transaction',{target_id:'p4',expected_state_version:4}]]) {
    const e=env();e.invoke('commitBoardScoreOperation',operation(type,data));assert.deepEqual(e.calls[0].body.op,{op_id:'op-1',type,data});
  }
});
test('same operation can be resent unchanged and dup/rejected/retry remain direct JSON',()=>{
  for (const status of ['ok','dup','rejected','retry']) {
    const response={result:{status,reason:'state_version'},snapshot:{session_id:'s-1'}};
    const e=env({response});assert.deepEqual(e.invoke('commitBoardScoreOperation',operation()),response);e.invoke('commitBoardScoreOperation',operation());assert.deepEqual(e.calls[0].body,e.calls[1].body);
  }
});
test('result lookup is read-only and works even after current groups change',()=>{
  const response={found:true,result:{status:'ok'},current_session_id:'s-2'};
  const e=env({response,groups:[]});e.ctx.pointSettings_=()=>{throw new Error('result must not read current groups');};
  assert.deepEqual(e.invoke('getBoardScoreResult',resultRequest()),response);
  assert.equal(e.calls[0].url,'https://teacherwu.xdai.tw/discuss/api/score-bridge/result');assert.deepEqual(e.calls[0].body,resultRequest());assert.deepEqual(e.writes,[]);
});
test('reject browser supplied context, class, token, URLs and unknown outer fields',()=>{
  for (const key of ['context','class_code','token','url','ops','extra']) {
    expectRejected(env(),'commitBoardScoreOperation',Object.assign(operation(),{[key]:'injected'}));
    expectRejected(env(),'getBoardScoreResult',Object.assign(resultRequest(),{[key]:'injected'}));
  }
});
test('reject unknown operation or data fields, including array/object tricks',()=>{
  const cases=[operation('award_group_score',{}),operation('adjust_group_score',{...operation().op.data,context:{}}),operation('clear_group_scores',{expected_state_version:3,group:1}),operation('undo_score_transaction',{target_id:'p3',expected_state_version:3,delta:1})];
  for (const request of cases) expectRejected(env(),'commitBoardScoreOperation',request);
  const e=env();const r=operation();r.op.extra=true;expectRejected(e,'commitBoardScoreOperation',r);
  for (const request of [null,[],{},'text']) expectRejected(env(),'commitBoardScoreOperation',request);
});
test('delta validates nonzero integers within bounds without clamping',()=>{
  for (const delta of [-101,101,0,1.5,'2',NaN,Infinity]) expectRejected(env(),'commitBoardScoreOperation',operation('adjust_group_score',{...operation().op.data,delta}));
  for (const delta of [-100,-1,1,100]) {const e=env();e.invoke('commitBoardScoreOperation',operation('adjust_group_score',{...operation().op.data,delta}));assert.equal(e.calls[0].body.op.data.delta,delta);}
});
test('reject malformed identifiers, group numbers, versions and labels',()=>{
  for (const key of ['session_id','cid']) for (const value of ['',{},'has spaces','x'.repeat(100)]) expectRejected(env(),'commitBoardScoreOperation',{...operation(),[key]:value});
  for (const op_id of ['',{},'with/slash','x'.repeat(81)]) expectRejected(env(),'commitBoardScoreOperation',{...operation(),op:{...operation().op,op_id}});
  for (const group of [0,9,1.5,'1']) expectRejected(env(),'commitBoardScoreOperation',operation('adjust_group_score',{...operation().op.data,group}));
  for (const expected_state_version of [-1,1.5,'3',Number.MAX_SAFE_INTEGER+1]) expectRejected(env(),'commitBoardScoreOperation',operation('clear_group_scores',{expected_state_version}));
  for (const label of [{},'x'.repeat(161)]) expectRejected(env(),'commitBoardScoreOperation',operation('adjust_group_score',{...operation().op.data,label}));
});
test('snapshot browser context injection is rejected',()=>expectRejected(env(),'getBoardScoreSnapshot',{context:{class_code:'OTHER'}}));
test('invalid/missing private configuration never contacts remote',()=>{
  for (const props of [{BOARD_SCORE_BRIDGE_URL:''},{BOARD_SCORE_BRIDGE_TOKEN:''},{BOARD_SCORE_BRIDGE_TOKEN:'bad\r\nheader'},{BOARD_SCORE_BRIDGE_CLASS:'bad-class'}]) expectRejected(env({props}),'getBoardScoreSnapshot');
});
test('configured URL rejects credentials, queries, fragments, redirect schemes and malformed hosts',()=>{
  for (const url of ['http://board.example.test','https://user:password@board.example.test','https://board.example.test?token=secret','https://board.example.test/#secret','https://board.example.test\\@evil.test','https://','https://board.example.test:99999','https://board.example.test/../outside','https://board.example.test/%2e%2e/path','https://board.example.test','https://teacherwu.xdai.tw/discuss/other','https://teacherwu.xdai.tw/discuss?secret=x','https://teacherwu.xdai.tw/discuss#x']) expectRejected(env({props:{BOARD_SCORE_BRIDGE_URL:url}}),'getBoardScoreSnapshot');
});
test('valid base path is retained and trailing slash normalized',()=>{
  const e=env({props:{BOARD_SCORE_BRIDGE_URL:'https://teacherwu.xdai.tw/discuss/'}});e.invoke('getBoardScoreSnapshot');assert.equal(e.calls[0].url,'https://teacherwu.xdai.tw/discuss/api/score-bridge/read');
});
test('invalid/empty/oversized groups fail closed without changing point settings',()=>{
  for (const groups of [[],Array.from({length:9},()=>({seats:[]})),[{seats:[1,1]}],[{seats:[1]},{seats:[1]}],[{seats:[99]}],[{seats:['1']}],[{seats:[1]},null]]) {const e=env({groups});expectRejected(e,'getBoardScoreSnapshot');assert.deepEqual(e.writes,[]);}
});
test('bad roster rows, duplicates and missing names fail closed',()=>{
  for (const roster of [[],[[1,'']],[['1','匿名']],[[1,'甲'],[1,'乙']],[[0,'甲']],[[1,{}]]]) expectRejected(env({roster}),'getBoardScoreSnapshot');
});
test('upstream HTTP errors are friendly and do not leak body or secret',()=>{
  for (const status of [301,400,401,403,409,500]) {const e=env({status,raw:JSON.stringify({token:TOKEN,stack:'private details'})});assert.throws(()=>e.invoke('getBoardScoreSnapshot'),err=>!err.message.includes(TOKEN)&&!err.message.includes('private details'));assert.equal(e.calls.length,1);}
});
test('network errors do not leak request header or internal exception',()=>{
  const e=env({failure:true});assert.throws(()=>e.invoke('commitBoardScoreOperation',operation()),err=>!err.message.includes(TOKEN)&&!err.message.includes('internal detail'));
});
test('invalid JSON and token echoed in remote responses never reach browser',()=>{
  for (const raw of ['<html>error</html>','null','[]','5',JSON.stringify({unexpected:TOKEN}),JSON.stringify({nested:{value:'Bearer '+TOKEN}})]) {
    const e=env({raw});assert.throws(()=>e.invoke('getBoardScoreSnapshot'),err=>!err.message.includes(TOKEN));
  }
});
test('source uses no template literals, write-capable services or private literals',()=>{
  assert.equal(source.includes(String.fromCharCode(96)),false);assert.equal(/getPointBundle\s*\(|SpreadsheetApp|setProperty\s*\(/.test(source),false);
});
let failed=0;
for (const [name,body] of tests) {try{body();console.log('PASS '+name);}catch(err){failed++;console.log('FAIL '+name+' :: '+err.message);}}
console.log(tests.length+' scenarios; '+failed+' failed');
process.exitCode=failed?1:0;
