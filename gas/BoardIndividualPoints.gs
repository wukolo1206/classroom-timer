// Private authenticated server settlement; no browser-provided scores or context.
function boardIndividualFail_() { throw new Error('individual_points_unconfirmed'); }
function boardIndividualHex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function boardIndividualEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function boardIndividualRoster_(config) {
  if (!Array.isArray(POINT_ROSTER) || !POINT_ROSTER.length || POINT_ROSTER.length > 99) boardIndividualFail_();
  var seen = {};
  return POINT_ROSTER.map(function (row) {
    if (!Array.isArray(row) || !Number.isInteger(row[0]) || row[0] < 1 || row[0] > 99 || seen[row[0]] || typeof row[1] !== 'string') boardIndividualFail_();
    seen[row[0]] = true;
    return {seat:row[0],fingerprint:boardScoreFingerprint_(config.class_code,row[0],row[1])};
  }).sort(function (a,b) { return a.seat - b.seat; });
}
function boardIndividualManifest_(value, config, sid, roster) {
  boardScoreRecord_(value,['version','class_code','session_id','roster','scores','digest']);
  if (value.version !== 1 || value.class_code !== config.class_code || value.session_id !== sid || !Array.isArray(value.roster) || !value.roster.length || value.roster.length > 99 || !Array.isArray(value.scores) || value.scores.length !== value.roster.length || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) boardIndividualFail_();
  var cleanRoster = [], scores = [], previous = 0;
  value.roster.forEach(function (row,index) {
    boardScoreRecord_(row,['seat','fingerprint']);
    var score = value.scores[index];
    boardScoreRecord_(score,['seat','delta']);
    if (!Number.isInteger(row.seat) || row.seat <= previous || row.seat > 99 || typeof row.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(row.fingerprint) || score.seat !== row.seat || !Number.isSafeInteger(score.delta) || score.delta < 0 || score.delta > 1000000) boardIndividualFail_();
    previous = row.seat;
    cleanRoster.push({seat:row.seat,fingerprint:row.fingerprint});
    scores.push({seat:score.seat,delta:score.delta});
  });
  if (roster && JSON.stringify(cleanRoster) !== JSON.stringify(roster)) boardIndividualFail_();
  var digest = boardIndividualHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([1,config.class_code,sid,cleanRoster,scores]),Utilities.Charset.UTF_8));
  if (!boardIndividualEqual_(digest,value.digest)) boardIndividualFail_();
  return {version:1,class_code:config.class_code,session_id:sid,roster:cleanRoster,scores:scores,digest:digest};
}
function boardIndividualReceipt_(m, batchId) {
  var added = m.scores.filter(function (row) { return row.delta > 0; }).map(function (row) { return {seat:row.seat,delta:row.delta}; });
  return {status:'ok',class_code:m.class_code,session_id:m.session_id,batch_id:batchId,digest:m.digest,added:added,total:added.reduce(function (sum,row) { return sum + row.delta; },0)};
}
function boardIndividualExisting_(data, config, sid, batchId) {
  var matches = data.manifests.filter(function (m) { return m.request.id === batchId; });
  if (matches.length > 1) boardIndividualFail_();
  if (!matches.length) {
    if (data.events.some(function (e) { return e.batchId === batchId; })) boardIndividualFail_();
    return null;
  }
  var found = matches[0];
  boardScoreRecord_(found,['request','events']);
  boardScoreRecord_(found.request,['id','type','manifest']);
  if (found.request.type !== 'board_individual') boardIndividualFail_();
  var m = boardIndividualManifest_(found.request.manifest,config,sid,null);
  var positive = m.scores.filter(function (row) { return row.delta > 0; });
  if (found.events.length !== positive.length) boardIndividualFail_();
  found.events.forEach(function (event,index) {
    boardScoreRecord_(event,['id','batchId','time','seat','name','itemId','label','delta','type','originalBatchId','device']);
    var score = positive[index];
    if (event.id !== batchId + ':' + score.seat || event.batchId !== batchId || event.seat !== score.seat || event.delta !== score.delta || event.itemId !== 'board_individual' || event.label !== '個人畫板本次得點' || event.type !== 'score' || event.originalBatchId !== '' || event.device !== 'board_individual' || typeof event.name !== 'string' || typeof event.time !== 'string' || !isFinite(Date.parse(event.time))) boardIndividualFail_();
    if (event.name !== pointSeat_(event.seat).name) boardIndividualFail_();
    if (boardScoreFingerprint_(config.class_code,event.seat,event.name) !== m.roster.filter(function (row) { return row.seat === event.seat; })[0].fingerprint) boardIndividualFail_();
  });
  if (data.events.some(function (event) { return event.batchId === batchId && !found.events.some(function (reserved) { return reserved.id === event.id; }); })) boardIndividualFail_();
  return m;
}
function boardIndividualLocked_(config,sid,batchId,incoming,roster) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = pointSheet_(), data = pointRead_(sheet);
    var existing = boardIndividualExisting_(data,config,sid,batchId);
    if (existing) {
      pointComplete_(sheet,data);
      return boardIndividualReceipt_(existing,batchId);
    }
    if (!incoming) return null;
    // Recheck the current roster after the network gap, before reserving events.
    if (JSON.stringify(boardIndividualRoster_(config)) !== JSON.stringify(roster)) boardIndividualFail_();
    var m = boardIndividualManifest_(incoming,config,sid,roster);
    pointComplete_(sheet,data);
    var time = new Date().toISOString();
    var events = m.scores.filter(function (row) { return row.delta > 0; }).map(function (row) {
      return {id:batchId + ':' + row.seat,batchId:batchId,time:time,seat:row.seat,name:pointSeat_(row.seat).name,itemId:'board_individual',label:'個人畫板本次得點',delta:row.delta,type:'score',originalBatchId:'',device:'board_individual'};
    });
    var manifest = {request:{id:batchId,type:'board_individual',manifest:m},events:events};
    var json = JSON.stringify(manifest);
    if (json.length > 45000) boardIndividualFail_();
    pointAppend_(sheet,['manifest:' + batchId,batchId,time,0,'','',json,0,'_manifest','','board_individual'].map(pointEscape_));
    data.manifests.push(manifest);
    pointComplete_(sheet,data);
    return boardIndividualReceipt_(m,batchId);
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
function boardIndividualPost_(body) {
  var result;
  try {
    boardScoreRecord_(body,['api','class_code','session_id','timestamp','signature']);
    if (body.api !== 'boardIndividualPoints' || typeof body.class_code !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(body.class_code) || typeof body.session_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.session_id) || !Number.isSafeInteger(body.timestamp) || Math.abs(Date.now() - body.timestamp) > 300000 || typeof body.signature !== 'string' || !/^[a-f0-9]{64}$/.test(body.signature)) boardIndividualFail_();
    var config = boardScoreConfig_();
    if (config.class_code !== body.class_code) boardIndividualFail_();
    var signature = boardIndividualHex_(Utilities.computeHmacSha256Signature(JSON.stringify(['board-individual/1',body.class_code,body.session_id,body.timestamp]),config.token,Utilities.Charset.UTF_8));
    if (!boardIndividualEqual_(signature,body.signature)) boardIndividualFail_();
    var batchId = 'boardind:' + config.class_code + ':' + body.session_id;
    if (batchId.length > 120) boardIndividualFail_();
    result = boardIndividualLocked_(config,body.session_id,batchId,null,null);
    if (!result) {
      var roster = boardIndividualRoster_(config);
      var incoming = boardScoreFetch_(config,'individual-settlement',{session_id:body.session_id,context:{class_code:config.class_code,roster:roster}});
      // Validate even if another request reserved a batch during this callback.
      boardIndividualManifest_(incoming,config,body.session_id,roster);
      result = boardIndividualLocked_(config,body.session_id,batchId,incoming,roster);
    }
  } catch (error) {
    // Do not serialize exception messages, upstream bodies, request data or tokens.
    result = {status:'error',code:'individual_points_unconfirmed'};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
