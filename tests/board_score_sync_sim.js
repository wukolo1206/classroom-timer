const assert = require('node:assert/strict');
const {createBoardScoreSync} = require('../board-sync/board-sync.js');
const snap = (version=1, session='s1', score=0) => ({class_code:'A01', session_id:session,status:'discussion',mode:'group',subject:'數學',title:'匿名討論',state_version:version,groups:{1:{seats:[1],score}},last_score_transaction:'p'+version});
function harness(seed) {
 let values=Object.assign({},seed), calls=[], queue=[];
 let storage={getItem:k=>values[k]||null,setItem:(k,v)=>{values[k]=v;}};
 let rpc=(name,arg)=>new Promise((resolve,reject)=>{calls.push({name,arg});queue.push({resolve,reject});});
 let c=createBoardScoreSync({rpc,storage,id:()=> 'timer_id'+(calls.length+1),validate:()=>true,context:()=> 'groups-v1'});
 return {c,values,calls,queue,storage};
}
async function connect(h) {let p=h.c.preview();h.queue.shift().resolve(snap());await p;assert.equal(h.c.state.linked,false);h.c.confirm();assert.equal(h.c.state.linked,true);}
(async()=>{
 let h=harness();await connect(h);
 let p=h.c.adjust(1,2,'項目');assert.equal(h.c.state.snapshot.groups[1].score,0);assert(h.c.state.pending);assert.equal(await h.c.adjust(1,1,'加分'),false);h.queue.shift().resolve({result:{status:'ok'},snapshot:snap(2,'s1',2)});await p;assert.equal(h.c.state.snapshot.groups[1].score,2);assert.equal(h.c.state.pending,null);assert.equal(h.c.state.last.id,'p2');
 p=h.c.undo();assert.equal(h.calls.at(-1).arg.op.data.target_id,'p2');h.queue.shift().resolve({result:{status:'ok'},snapshot:snap(3)});await p;
 p=h.c.adjust(1,-1,'扣分');let request=h.calls.at(-1).arg;h.queue.shift().reject(Error('lost response'));await p;assert(h.c.state.pending);assert(!h.c.canScore());
 const h2=harness(h.values);assert(h2.c.state.pending);p=h2.c.recover();h2.queue.shift().resolve({found:false,current_session_id:'s1'});await Promise.resolve();assert.deepEqual(h2.calls.at(-1).arg,request);h2.queue.shift().resolve({result:{status:'dup',result:{status:'ok',transaction_id:'p4'}},snapshot:snap(4)});await p;assert.equal(h2.c.state.pending,null);
 // An old poll cannot overwrite a newer commit.
 h=harness();await connect(h);let poll=h.c.refresh();p=h.c.adjust(1,2,'加分');h.queue[1].resolve({result:{status:'ok'},snapshot:snap(5,'s1',2)});await p;h.queue[0].resolve(snap(2));await poll;assert.equal(h.c.state.snapshot.state_version,5);
 // A new session blocks writes and requires preview confirmation.
 p=h.c.refresh();h.queue.at(-1).resolve(snap(1,'s2'));await p;assert(!h.c.canScore());assert.equal(h.c.state.preview.session_id,'s2');
 // Disconnect invalidates in-flight reads and preserves unresolved operation.
 h=harness();await connect(h);p=h.c.adjust(1,1,'加分');h.c.disconnect();assert(h.c.state.pending);h.queue.shift().resolve({result:{status:'ok'},snapshot:snap(2,'s1',1)});await p;assert.equal(h.c.state.linked,false);assert(h.c.state.pending);
 // Refuse persistence failures before any RPC write.
 h=harness();await connect(h);h.storage.setItem=()=>{throw Error('full');};assert.equal(await h.c.adjust(1,1,'加分'),false);assert.equal(h.calls.length,1);
 // Invalid deltas never reach RPC; non-discussion and local context changes pause.
 h=harness();await connect(h);for(const n of [0,101,-101,1.5]) assert.equal(await h.c.adjust(1,n,'bad'),false);h.c.state.snapshot.status='ended';assert(!h.c.canScore());

 // A malformed response is not proof of failure or success; preserve the request.
 h=harness();await connect(h);p=h.c.adjust(1,2,'bonus');h.queue.shift().resolve({snapshot:snap(2)});await p;assert(h.c.state.pending);assert(!h.c.canScore());
 // A duplicate rejected request must remain rejected, with no undo target.
 h=harness();await connect(h);p=h.c.adjust(1,2,'bonus');h.queue.shift().resolve({result:{status:'dup',result:{status:'rejected',reason:'state_version'}},snapshot:snap(2)});await p;assert.equal(h.c.state.pending,null);assert.equal(h.c.state.last,null);assert(h.c.state.message.includes('state_version'));
 // Storage recovery proves the result, preserving the confirmed target id.
 h=harness();await connect(h);p=h.c.clear();h.queue.shift().reject(Error('offline'));await p;const restored=harness(h.values);p=restored.c.recover();restored.queue.shift().resolve({found:true,current_session_id:'s2',result:{status:'ok',transaction_id:'p2'}});await p;assert.equal(restored.c.state.last.id,'p2');assert.equal(restored.c.state.pending,null);
 // Once a different current session is known, do not submit an old pending request.
 h=harness();await connect(h);p=h.c.adjust(1,1,'bonus');h.queue.shift().reject(Error('lost'));await p;p=h.c.recover();h.queue.shift().resolve({found:false,current_session_id:'s2'});await p;assert.equal(h.calls.filter(c=>c.name==='commitBoardScoreOperation').length,1);assert(h.c.state.pending);
 // Context mutation is checked on every scoring call, before an RPC is sent.
 let context='v1',valid=true;h=harness();h.c=createBoardScoreSync({rpc:(name,arg)=>new Promise((resolve,reject)=>{h.calls.push({name,arg});h.queue.push({resolve,reject});}),storage:h.storage,id:()=> 'contextid',validate:()=>valid,context:()=>context});await connect(h);context='v2';assert.equal(await h.c.adjust(1,1,'bonus'),false);assert.equal(h.calls.length,1);valid=false;assert(!h.c.canScore());
 // Browser offline state immediately gates writes before the next poll.
 h=harness();let network=true,offlineCalls=0;h.c=createBoardScoreSync({rpc:()=>{offlineCalls++;throw Error('must not submit');},storage:h.storage,id:()=> 'offline',validate:()=>true,context:()=> 'x',isOnline:()=>network});h.c.state.linked=true;h.c.state.online=true;h.c.state.context='x';h.c.state.snapshot=snap();network=false;assert.equal(await h.c.adjust(1,1,'bonus'),false);assert.equal(offlineCalls,0);assert.equal(h.c.state.pending,null);
 // Damaged persisted operations are preserved and cannot be submitted or overwritten.
 for(const raw of ['{invalid',JSON.stringify({cid:'valid',pending:{session_id:'s1',cid:'valid',op:{op_id:'bad',type:'unknown',data:{}}}})]) {h=harness({c408_board_score_sync_v1:raw});assert(h.c.state.storageBlocked);assert(h.c.active());assert.equal(await h.c.recover(),false);assert.equal(h.calls.length,0);assert.equal(h.values.c408_board_score_sync_v1,raw);}
 // Persisted requests must match exactly the GAS identifier and record schema.
 const good={session_id:'session_1',cid:'client_123',op:{op_id:'operation_1',type:'adjust_group_score',data:{group:1,delta:2,label:'bonus',expected_state_version:1}}};
 const invalid=[];
 for(const cid of ['x','client.invalid','client:invalid','c'.repeat(65)])invalid.push({...good,cid});
 for(const id of ['session.invalid','session:invalid','s'.repeat(81)])invalid.push({...good,session_id:id});
 for(const id of ['op.invalid','op:invalid','o'.repeat(81)])invalid.push({...good,op:{...good.op,op_id:id}});
 invalid.push({...good,extra:true},{...good,op:{...good.op,extra:true}},{...good,op:{...good.op,data:{...good.op.data,extra:true}}},{...good,op:{...good.op,data:{...good.op.data,expected_state_version:Number.MAX_SAFE_INTEGER+1}}});
 for(const request of invalid){const raw=JSON.stringify({cid:request.cid,pending:request,last:null});h=harness({c408_board_score_sync_v1:raw});assert(h.c.state.storageBlocked,raw);assert.equal(await h.c.recover(),false);assert.equal(h.calls.length,0);assert.equal(h.values.c408_board_score_sync_v1,raw);}
 for(const saved of [false,0,{cid:good.cid,pending:false,last:null},{cid:good.cid,pending:'',last:null}]){h=harness({c408_board_score_sync_v1:JSON.stringify(saved)});assert(h.c.state.storageBlocked);}
 const edge={session_id:'s'.repeat(80),cid:'c'.repeat(64),op:{...good.op,op_id:'o'.repeat(80),data:{...good.op.data,expected_state_version:Number.MAX_SAFE_INTEGER}}};
 for(const accepted of [good,edge]){const goodRaw=JSON.stringify({cid:accepted.cid,pending:accepted,last:null});h=harness({c408_board_score_sync_v1:goodRaw});assert(!h.c.state.storageBlocked);assert.deepEqual(h.c.state.pending,accepted);}
 for(const last of [{id:'x',session_id:'session_1',type:'adjust_group_score',data:good.op.data},{id:'p2',session_id:'bad.session',type:'adjust_group_score',data:good.op.data},{id:'p2',session_id:'session_1',type:'unknown',data:good.op.data},{id:'p2',session_id:'session_1',type:'clear_group_scores',data:{extra:true,expected_state_version:1}}]){h=harness({c408_board_score_sync_v1:JSON.stringify({cid:good.cid,pending:null,last})});assert.equal(h.c.state.last,null);}
 // Reject invalid user-authored operations before persistence or RPC.
 h=harness();await connect(h);const savedBefore=h.values.c408_board_score_sync_v1;
 for(const args of [[1,2,'a'.repeat(161)],[0,1,'bonus'],[9,1,'bonus'],[1.5,1,'bonus']]){p=h.c.adjust(...args);assert.equal(h.calls.length,1);assert.equal(await p,false);assert.equal(h.c.state.pending,null);assert.equal(h.values.c408_board_score_sync_v1,savedBefore);}
 p=h.c.adjust(1,2,'a'.repeat(160));assert.equal(h.calls.length,2);assert.equal(h.calls.at(-1).arg.op.data.label.length,160);h.queue.shift().resolve({result:{status:'ok',transaction_id:'p2'},snapshot:snap(2,'s1',2)});await p;assert.equal(h.c.state.pending,null);
 console.log('board score sync controller: all scenarios passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
