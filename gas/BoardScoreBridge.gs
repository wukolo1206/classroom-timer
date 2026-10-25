// Private GAS-to-board proxy. Public RPC functions never accept browser context.
// ScriptProperties: BOARD_SCORE_BRIDGE_URL, BOARD_SCORE_BRIDGE_TOKEN,
// BOARD_SCORE_BRIDGE_CLASS (defaults to 408; isolated test bindings may use A01).
function boardScoreError_(message) {
  throw new Error(message);
}
function boardScoreRecord_(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) boardScoreError_('連動請求格式不正確');
  var actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(function (key) { return keys.indexOf(key) < 0; })) boardScoreError_('連動請求含有不支援的欄位');
}
function boardScoreId_(value, client) {
  var pattern = client ? /^[A-Za-z0-9_-]{8,64}$/ : /^[A-Za-z0-9_-]{1,80}$/;
  if (typeof value !== 'string' || !pattern.test(value)) boardScoreError_('連動操作識別格式不正確');
  return value;
}
function boardScoreConfig_() {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('BOARD_SCORE_BRIDGE_URL') || '';
  var token = props.getProperty('BOARD_SCORE_BRIDGE_TOKEN') || '';
  var classCode = props.getProperty('BOARD_SCORE_BRIDGE_CLASS') || '408';
  // Keep credentials on the one approved HTTPS origin and path. Do not follow
  // redirects, accept a browser URL, or put credentials in a query parameter.
  var expected = 'https:/' + '/teacherwu.xdai.tw/discuss';
  if (base !== expected && base !== expected + '/') boardScoreError_('尚未正確設定討論畫板連動網址');
  if (!token || /\s/.test(token) || !/^[A-Za-z0-9]{1,20}$/.test(classCode)) boardScoreError_('尚未正確設定討論畫板連動權限');
  return {base:expected,token:token,class_code:classCode};
}
function boardScoreFingerprint_(classCode, seat, name) {
  var normalized = name.normalize('NFC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim().replace(/\s+/g, ' ');
  if (!normalized) boardScoreError_('目前名冊姓名不完整，請先核對');
  var input = JSON.stringify(['discuss-roster/1',classCode,seat,normalized]);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,input,Utilities.Charset.UTF_8);
  return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('').slice(0,16);
}
function boardScoreContext_(config) {
  var stored;
  try { stored = pointSettings_(); } catch (error) { boardScoreError_('目前小組設定無法讀取，請先核對'); }
  var groups = stored && stored.settings && stored.settings.groups;
  if (!Array.isArray(groups) || !groups.length || groups.length > 8) boardScoreError_('連動需要目前已設定的 1～8 個小組，請先核對');
  if (!Array.isArray(POINT_ROSTER) || !POINT_ROSTER.length) boardScoreError_('目前名冊無法讀取，請先核對');
  var known = {}, used = {};
  var roster = POINT_ROSTER.map(function (row) {
    if (!Array.isArray(row) || !Number.isInteger(row[0]) || row[0] < 1 || row[0] > 99 || known[row[0]] || typeof row[1] !== 'string') boardScoreError_('目前名冊格式不正確，請先核對');
    known[row[0]] = true;
    return {seat:row[0],fingerprint:boardScoreFingerprint_(config.class_code,row[0],row[1])};
  }).sort(function (a,b) { return a.seat-b.seat; });
  var cleanGroups = groups.map(function (group,index) {
    if (!group || !Array.isArray(group.seats) || group.seats.length > 12) boardScoreError_('目前小組成員格式不正確，請先核對');
    var seats = group.seats.map(function (seat) {
      if (!Number.isInteger(seat) || !known[seat] || used[seat]) boardScoreError_('目前小組成員缺漏或重複，請先核對');
      used[seat] = true;
      return seat;
    }).sort(function (a,b) { return a-b; });
    return {group:index+1,seats:seats};
  });
  return {class_code:config.class_code,groups:cleanGroups,roster:roster};
}
function boardScoreContainsSecret_(value, token) {
  if (typeof value === 'string') return value.indexOf(token) >= 0;
  if (value && typeof value === 'object') return Object.keys(value).some(function (key) {
    return key.indexOf(token) >= 0 || boardScoreContainsSecret_(value[key],token);
  });
  return false;
}
function boardScoreFetch_(config, route, body) {
  var response, status, raw;
  try {
    response = UrlFetchApp.fetch(config.base + '/api/score-bridge/' + route, {
      method:'post',contentType:'application/json',headers:{Authorization:'Bearer ' + config.token},
      payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false
    });
    status = response.getResponseCode();
    if (status >= 200 && status < 300) raw = response.getContentText();
  } catch (error) {
    // Network failures may have occurred after the operation committed. Keep
    // the same operation identifiers and query /result before deciding to retry.
    boardScoreError_('討論畫板連線中斷，操作結果待確認，請保留原操作後重新查詢');
  }
  if (status === 401 || status === 403) boardScoreError_('討論畫板連動權限不符，請檢查私有設定');
  if (status === 400 || status === 409) boardScoreError_('班級、名冊、小組或場次已改變，請重新核對連動');
  if (status === 503) boardScoreError_('討論畫板暫時無法確認操作，請保留原操作後重新查詢');
  if (status < 200 || status >= 300) boardScoreError_('討論畫板暫時無法連線，請保留原操作後重新查詢');
  var value;
  try { value = JSON.parse(raw); } catch (error) { boardScoreError_('討論畫板回應無法確認，請保留原操作後重新查詢'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || boardScoreContainsSecret_(value,config.token)) boardScoreError_('討論畫板回應無法確認，請保留原操作後重新查詢');
  return value;
}
function getBoardScoreSnapshot() {
  if (arguments.length) boardScoreError_('連動讀取不接受瀏覽器提供的班級或成員資料');
  var config = boardScoreConfig_();
  return boardScoreFetch_(config,'read',{context:boardScoreContext_(config)});
}
function commitBoardScoreOperation(request) {
  boardScoreRecord_(request,['session_id','cid','op']);
  var sessionId = boardScoreId_(request.session_id,false), cid = boardScoreId_(request.cid,true);
  boardScoreRecord_(request.op,['op_id','type','data']);
  var opId = boardScoreId_(request.op.op_id,false), type = request.op.type, data = request.op.data;
  var keys;
  if (type === 'adjust_group_score') keys = ['group','delta','label','expected_state_version'];
  else if (type === 'clear_group_scores') keys = ['expected_state_version'];
  else if (type === 'undo_score_transaction') keys = ['target_id','expected_state_version'];
  else boardScoreError_('不支援這項討論畫板連動操作');
  boardScoreRecord_(data,keys);
  if (!Number.isSafeInteger(data.expected_state_version) || data.expected_state_version < 0) boardScoreError_('連動版本格式不正確，請重新讀取');
  var clean = {};
  if (type === 'adjust_group_score') {
    if (!Number.isInteger(data.group) || data.group < 1 || data.group > 8) boardScoreError_('連動組號格式不正確');
    if (!Number.isInteger(data.delta) || !data.delta || data.delta < -100 || data.delta > 100) boardScoreError_('小組加減分須為非零的 -100～100 整數');
    if (typeof data.label !== 'string' || data.label.length > 160) boardScoreError_('計分原因格式不正確');
    clean.group = data.group; clean.delta = data.delta; clean.label = data.label;
  }
  if (type === 'undo_score_transaction') clean.target_id = boardScoreId_(data.target_id,false);
  clean.expected_state_version = data.expected_state_version;
  var config = boardScoreConfig_();
  return boardScoreFetch_(config,'ops',{
    context:boardScoreContext_(config),session_id:sessionId,cid:cid,op:{op_id:opId,type:type,data:clean}
  });
}
function getBoardScoreResult(request) {
  boardScoreRecord_(request,['session_id','cid','op_id']);
  var body = {session_id:boardScoreId_(request.session_id,false),cid:boardScoreId_(request.cid,true),op_id:boardScoreId_(request.op_id,false)};
  // A delayed operation must remain queryable after changing session/groups.
  return boardScoreFetch_(boardScoreConfig_(),'result',body);
}
