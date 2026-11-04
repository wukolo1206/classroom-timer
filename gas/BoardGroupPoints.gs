// Authenticated frozen group settlement. Browser RPC never supplies ledger events.
function boardGroupFail_() { throw new Error('group_points_unconfirmed'); }
function boardGroupHex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function boardGroupEqual_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function boardGroupRoster_(config) {
  if (!Array.isArray(POINT_ROSTER) || !POINT_ROSTER.length || POINT_ROSTER.length > 99) boardGroupFail_();
  var seen = {};
  return POINT_ROSTER.map(function (r) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || r[0] < 1 || r[0] > 99 || seen[r[0]] || typeof r[1] !== 'string') boardGroupFail_();
    seen[r[0]] = true;
    return {seat:r[0],fingerprint:boardScoreFingerprint_(config.class_code,r[0],r[1])};
  }).sort(function (a,b) { return a.seat-b.seat; });
}
function boardGroupManifest_(m,config,sid,roster,digest) {
  boardScoreRecord_(m,['version','kind','class_code','session_id','roster','groups','recipients','scores','digest']);
  if (m.version !== 1 || m.kind !== 'group' || m.class_code !== config.class_code || m.session_id !== sid || !Array.isArray(m.roster) || !m.roster.length || m.roster.length > 99 || !Array.isArray(m.groups) || !m.groups.length || m.groups.length > 8 || !Array.isArray(m.recipients) || !m.recipients.length || m.recipients.length > 99 || !Array.isArray(m.scores) || m.scores.length !== m.roster.length || typeof m.digest !== 'string' || !/^[a-f0-9]{64}$/.test(m.digest)) boardGroupFail_();
  var known = {}, membership = {}, selected = {}, previous = 0;
  var cleanRoster = m.roster.map(function (r) {
    boardScoreRecord_(r,['seat','fingerprint']);
    if (!Number.isInteger(r.seat) || r.seat <= previous || r.seat > 99 || typeof r.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(r.fingerprint)) boardGroupFail_();
    previous = r.seat; known[r.seat] = true;
    return {seat:r.seat,fingerprint:r.fingerprint};
  });
  if (JSON.stringify(cleanRoster) !== JSON.stringify(roster)) boardGroupFail_();
  previous = 0;
  var groups = m.groups.map(function (g) {
    boardScoreRecord_(g,['group','seats','score']);
    if (!Number.isInteger(g.group) || g.group <= previous || g.group > 8 || !Array.isArray(g.seats) || g.seats.length > 99 || !Number.isSafeInteger(g.score) || Math.abs(g.score) > 1000000) boardGroupFail_();
    previous = g.group;
    var last = 0;
    var seats = g.seats.map(function (seat) {
      if (!Number.isInteger(seat) || seat <= last || !known[seat] || Object.prototype.hasOwnProperty.call(membership,seat)) boardGroupFail_();
      last = seat; membership[seat] = g.score;
      return seat;
    });
    return {group:g.group,seats:seats,score:g.score};
  });
  previous = 0;
  var recipients = m.recipients.map(function (seat) {
    if (!Number.isInteger(seat) || seat <= previous || !Object.prototype.hasOwnProperty.call(membership,seat)) boardGroupFail_();
    previous = seat; selected[seat] = true;
    return seat;
  });
  var scores = m.scores.map(function (s,index) {
    boardScoreRecord_(s,['seat','delta']);
    var expected = selected[s.seat] ? membership[s.seat] : 0;
    if (s.seat !== cleanRoster[index].seat || !Number.isSafeInteger(s.delta) || s.delta !== expected) boardGroupFail_();
    return {seat:s.seat,delta:s.delta};
  });
  var calculated = boardGroupHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([1,'group',config.class_code,sid,cleanRoster,groups,recipients,scores]),Utilities.Charset.UTF_8));
  if (!boardGroupEqual_(calculated,m.digest) || !boardGroupEqual_(calculated,digest)) boardGroupFail_();
  return {version:1,kind:'group',class_code:config.class_code,session_id:sid,roster:cleanRoster,groups:groups,recipients:recipients,scores:scores,digest:calculated};
}
function boardGroupReceipt_(m,batchId) {
  var added = m.scores.filter(function (s) { return s.delta !== 0; }).map(function (s) { return {seat:s.seat,delta:s.delta}; });
  return {status:'ok',class_code:m.class_code,session_id:m.session_id,batch_id:batchId,digest:m.digest,added:added,total:added.reduce(function (sum,s) { return sum+s.delta; },0)};
}
function boardGroupExisting_(data,config,sid,batchId,roster,digest) {
  var matches = data.manifests.filter(function (m) { return m.request.id === batchId; });
  if (matches.length > 1) boardGroupFail_();
  if (!matches.length) {
    if (data.events.some(function (e) { return e.batchId === batchId; })) boardGroupFail_();
    return null;
  }
  var found = matches[0];
  boardScoreRecord_(found,['request','events']);
  boardScoreRecord_(found.request,['id','type','manifest']);
  if (found.request.type !== 'board_group' || !Array.isArray(found.events)) boardGroupFail_();
  var m = boardGroupManifest_(found.request.manifest,config,sid,roster,digest);
  var nonzero = m.scores.filter(function (s) { return s.delta !== 0; });
  if (found.events.length !== nonzero.length) boardGroupFail_();
  found.events.forEach(function (event,index) {
    boardScoreRecord_(event,['id','batchId','time','seat','name','itemId','label','delta','type','originalBatchId','device']);
    var score = nonzero[index];
    if (event.id !== batchId + ':' + score.seat || event.batchId !== batchId || event.seat !== score.seat || event.delta !== score.delta || event.itemId !== 'board_group' || event.label !== '小組討論結算' || event.type !== 'score' || event.originalBatchId !== '' || event.device !== 'board_group' || typeof event.time !== 'string' || !isFinite(Date.parse(event.time)) || event.name !== pointSeat_(event.seat).name) boardGroupFail_();
  });
  data.events.forEach(function (event) {
    if (event.batchId !== batchId) return;
    var reserved = found.events.filter(function (e) { return e.id === event.id; });
    if (reserved.length !== 1 || JSON.stringify(reserved[0]) !== JSON.stringify(event)) boardGroupFail_();
  });
  return m;
}
function boardGroupLocked_(config,sid,batchId,digest,incoming,roster) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var current = boardGroupRoster_(config);
    if (roster && JSON.stringify(current) !== JSON.stringify(roster)) boardGroupFail_();
    var sheet = pointSheet_(), data = pointRead_(sheet);
    var existing = boardGroupExisting_(data,config,sid,batchId,current,digest);
    if (existing) {
      pointComplete_(sheet,data);
      return boardGroupReceipt_(existing,batchId);
    }
    if (!incoming) return null;
    var m = boardGroupManifest_(incoming,config,sid,current,digest);
    pointComplete_(sheet,data);
    var time = new Date().toISOString();
    var events = m.scores.filter(function (s) { return s.delta !== 0; }).map(function (s) {
      return {id:batchId + ':' + s.seat,batchId:batchId,time:time,seat:s.seat,name:pointSeat_(s.seat).name,itemId:'board_group',label:'小組討論結算',delta:s.delta,type:'score',originalBatchId:'',device:'board_group'};
    });
    var manifest = {request:{id:batchId,type:'board_group',manifest:m},events:events};
    var json = JSON.stringify(manifest);
    if (json.length > 45000) boardGroupFail_();
    pointAppend_(sheet,['manifest:' + batchId,batchId,time,0,'','',json,0,'_manifest','','board_group'].map(pointEscape_));
    data.manifests.push(manifest);
    pointComplete_(sheet,data);
    return boardGroupReceipt_(m,batchId);
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
function boardGroupPost_(body) {
  var result;
  try {
    boardScoreRecord_(body,['api','class_code','session_id','timestamp','digest','signature']);
    if (body.api !== 'boardGroupPoints' || typeof body.class_code !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(body.class_code) || typeof body.session_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.session_id) || !Number.isSafeInteger(body.timestamp) || Math.abs(Date.now()-body.timestamp) > 300000 || typeof body.digest !== 'string' || !/^[a-f0-9]{64}$/.test(body.digest) || typeof body.signature !== 'string' || !/^[a-f0-9]{64}$/.test(body.signature)) boardGroupFail_();
    var config = boardScoreConfig_();
    if (config.class_code !== body.class_code) boardGroupFail_();
    var signature = boardGroupHex_(Utilities.computeHmacSha256Signature(JSON.stringify(['board-group/1',body.class_code,body.session_id,body.timestamp,body.digest]),config.token,Utilities.Charset.UTF_8));
    if (!boardGroupEqual_(signature,body.signature)) boardGroupFail_();
    var batchId = 'boardgrp:' + config.class_code + ':' + body.session_id;
    if (batchId.length > 120) boardGroupFail_();
    result = boardGroupLocked_(config,body.session_id,batchId,body.digest,null,null);
    if (!result) {
      var roster = boardGroupRoster_(config);
      var incoming = boardScoreFetch_(config,'group-settlement',{session_id:body.session_id,digest:body.digest,context:{class_code:config.class_code,roster:roster}});
      // Validate before the second lock too: concurrent reservations cannot hide a bad callback.
      boardGroupManifest_(incoming,config,body.session_id,roster,body.digest);
      result = boardGroupLocked_(config,body.session_id,batchId,body.digest,incoming,roster);
    }
  } catch (error) { result = {status:'error',code:'group_points_unconfirmed'}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
