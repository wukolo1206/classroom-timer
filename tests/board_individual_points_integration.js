'use strict';
// Local contract integration: real Node service + real GAS source, in-memory cloud services.
// Optional BOARD_WORKTREE overrides the adjacent board checkout; no external HTTP is used.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const boardRoot = process.env.BOARD_WORKTREE || [path.join(__dirname, '../../board-individual-points'), path.join(__dirname, '../../54_小組討論畫板')].find(p => fs.existsSync(path.join(p, 'center/server/individual-settlement.js')));
assert(boardRoot, 'Set BOARD_WORKTREE to the discussion-board checkout');
const {Session} = require(path.join(boardRoot, 'center/server/session'));
const {fingerprint} = require(path.join(boardRoot, 'center/server/classes'));
const {buildManifest, receiptFor, createSettlementService} = require(path.join(boardRoot, 'center/server/individual-settlement'));

// Reuse only the existing VM fixture definitions, without executing its test suite.
const fixtureSource = fs.readFileSync(path.join(__dirname, 'board_individual_points_sim.js'), 'utf8');
const fixtureEnd = fixtureSource.indexOf('let count=0;');
assert(fixtureEnd > 0, 'GAS fixture boundary must be present');
const fixture = vm.createContext({require, __dirname, console, Buffer});
vm.runInContext(fixtureSource.slice(0, fixtureEnd) + '\nglobalThis.makeGasEnv = env;', fixture);

async function scenario({zero = false, loseReply = false}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gas-individual-contract-'));
  try {
    const gas = fixture.makeGasEnv();
    let roster = [{seat:1,name:'Alpha'}, {seat:2,name:'Beta'}];
    gas.ctx.POINT_ROSTER = roster.map(p => [p.seat,p.name]);
    const config = {dir:temp,id:zero?'zero_session':'scored_session',classCode:'A01',
      individualRoster:() => roster.map(p => ({seat:p.seat,fingerprint:fingerprint('A01',p.seat,p.name)}))};
    // Match api.js/session-launch.js: new individual sessions freeze roster in init.
    const session = Session.create(config,{mode:'individual',individual_roster:config.individualRoster(),groups:[{group:1,seats:[1]},{group:2,seats:[2]}]});
    let opId = 0;
    function send(type,data={}) {
      const result = session.commit('teacher',{kind:'teacher'},[{op_id:'integration_'+(++opId),type,
        data:{...data,expected_state_version:session.cfg.state_version}}]).results[0];
      assert.equal(result.status,'ok');
    }
    send('set_status',{to:'discussion'});
    if (!zero) {send('award_individual_point',{group:1});send('award_individual_point',{group:1});}
    send('set_status',{to:'closed'});
    const expectedManifest = buildManifest('A01',session,roster);
    const expectedReceipt = receiptFor(expectedManifest);
    const pendingPath = path.join(temp,'individual-settlement-pending.json');
    const receiptPath = path.join(temp,'individual-settlement.json');
    let callbacks = 0, requests = 0, failReply = loseReply, forbidFreshLoad = false;
    const classes = {sessionDir:(code,sid) => {assert.equal(code,'A01');assert.equal(sid,session.id);return temp;},getRoster:() => roster};
    let service;
    service = createSettlementService({classes,
      loadSession:(code,sid) => {assert(!forbidFreshLoad,'retry must use pending or receipt');assert.equal(sid,session.id);return {session,close(){}};},
      bindings:[{class_code:'A01',token:gas.props.BOARD_SCORE_BRIDGE_TOKEN}],
      gasUrl:'https://script.google.com/macros/s/LOCAL_TEST_DEPLOYMENT/exec',
      fetchImpl:async (url,opts) => {
        requests++;
        assert.equal(url,'https://script.google.com/macros/s/LOCAL_TEST_DEPLOYMENT/exec');
        assert.deepEqual(JSON.parse(fs.readFileSync(pendingPath,'utf8')),expectedManifest,'Node must persist pending before transport');
        const signedBody = JSON.parse(opts.body);
        assert.deepEqual(Object.keys(signedBody).sort(),['api','class_code','session_id','signature','timestamp']);
        const result = JSON.parse(JSON.stringify(gas.call(signedBody))); // Real doPost -> HMAC -> durable GAS helpers.
        assert.deepEqual(result,expectedReceipt);
        if (failReply) {failReply = false;throw Error('simulated lost HTTP reply after GAS commit');}
        return {ok:true,json:async () => result};
      }});
    gas.ctx.UrlFetchApp.fetch = (url,opts) => {
      callbacks++;
      assert.equal(url,'https://teacherwu.xdai.tw/discuss/api/score-bridge/individual-settlement');
      assert.equal(opts.headers.Authorization,'Bearer '+gas.props.BOARD_SCORE_BRIDGE_TOKEN);
      assert.equal(opts.followRedirects,false);
      const body = JSON.parse(opts.payload);
      const actual = service.readForGas('A01',body.session_id,body.context); // Real callback + real buildManifest.
      assert.deepEqual(actual,expectedManifest);
      return {getResponseCode:() => 200,getContentText:() => JSON.stringify(actual)};
    };
    if (loseReply) {
      await assert.rejects(service.settle('A01',session.id),/settlement_pending/);
      assert(!fs.existsSync(receiptPath));
      assert(fs.existsSync(pendingPath));
      // New context must not regenerate the original batch after its reply was lost.
      roster = [{seat:1,name:'Alpha'}, {seat:2,name:'Changed zero score student'}];
      gas.ctx.POINT_ROSTER = roster.map(p => [p.seat,p.name]);
      forbidFreshLoad = true;
    }
    const receipt = await service.settle('A01',session.id);
    assert.deepEqual(receipt,expectedReceipt);
    assert.deepEqual(JSON.parse(fs.readFileSync(receiptPath,'utf8')),{manifest:expectedManifest,receipt:expectedReceipt});
    assert.equal(callbacks,1,'GAS retry reads immutable ledger without callback');
    assert.equal(gas.rows.filter(row => row[8] === '_manifest').length,1);
    const scores = gas.rows.filter(row => row[8] === 'score');
    assert.equal(scores.length,zero?0:1);
    assert.equal(gas.rows.length,zero?2:3,'header + single manifest + positive score only');
    if (!zero) {assert.equal(scores[0][3],1);assert.equal(scores[0][7],2);assert.equal(scores[0][5],'board_individual');}
    const before = JSON.stringify(gas.rows), requestCount = requests;
    forbidFreshLoad = true;
    assert.deepEqual(await service.settle('A01',session.id),expectedReceipt);
    assert.equal(requests,requestCount,'saved Node receipt bypasses transport');
    assert.equal(JSON.stringify(gas.rows),before);
    const privateFiles = fs.readFileSync(pendingPath,'utf8') + fs.readFileSync(receiptPath,'utf8');
    assert(!privateFiles.includes(gas.props.BOARD_SCORE_BRIDGE_TOKEN));
    assert(!privateFiles.includes('script.google.com'));
    console.log('PASS real Node/GAS '+(zero?'all-zero':'positive')+(loseReply?' lost reply retry':' settlement')+'; stable ledger and saved receipt');
  } finally {
    // Only delete the exact temporary directory created by this test.
    assert(temp.startsWith(path.join(os.tmpdir(),'node-gas-individual-contract-')));
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
(async () => {
  await scenario({});
  await scenario({loseReply:true});
  await scenario({zero:true});
  await scenario({zero:true,loseReply:true});
  console.log('4 real Node/GAS integration scenarios passed');
})().catch(error => {console.error(error);process.exitCode=1;});
