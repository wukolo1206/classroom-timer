/** Isolated append-only 408 points ledger. No existing worksheet is accessed.
 * _manifest rows reserve each request and immutable server-calculated targets before
 * any score rows are appended. They use the same 11 columns (JSON in item label),
 * never appear in the public events, and let retries finish interrupted batches.
 * All accepted manifests are completed under lock before a later operation runs.
 */
var POINT_SHEET_NAME = '班級集點紀錄';
// Existing bound workbook ID, copied from gas/.clasp.json parentId. Web apps
// cannot rely on the editor's active-spreadsheet context being available.
var POINT_SPREADSHEET_ID = '19zxbbVSalkk4OzfVYDWYVwDUKJyyvCBJD_NdKGHKfJA';
var POINT_HEADERS = ['事件編號', '批次編號', '紀錄時間', '座號', '姓名', '項目代碼', '項目名稱', '分值', '操作類型', '原批次編號', '來源裝置'];
var POINT_SETTINGS_KEY = 'pointSettings';
// Copied from index.html seatRoster; seat 7 intentionally absent.
var POINT_ROSTER = [[1,'游濬謙'],[2,'李晨睿'],[3,'王柏勛'],[4,'劉宸燁'],[5,'鄭又仁'],[6,'簡宇辰'],[8,'楊晨熙'],[9,'林宏哲'],[10,'李亦修'],[11,'汪昱辰'],[12,'李宸緯'],[13,'陳冠宇'],[14,'李茗堃'],[15,'林祐辰'],[16,'蔡秉浩'],[17,'蔡菲芸'],[18,'陳依婕'],[19,'陳依綺'],[20,'柯祉妤'],[21,'程旻薰'],[22,'陳玥筑'],[23,'王梓羽'],[24,'黃庭蓁'],[25,'李玉琳'],[26,'黃樂芙'],[27,'林忻'],[28,'沈盈萱'],[29,'游穠羽'],[30,'沈芷心'],[31,'吳苡熙'],[32,'吳芊妤']];

// 點數拍賣系統（另一個 GAS 專案）的資料試算表；408 得標自動轉成集點扣點。
// AUCTION_SPREADSHEET_ID 定義在 gas/Private.gs（不進版控：repo 公開）
// 此時間之前的得標老師已手動「拍賣扣點」，不可再匯入。
var AUCTION_IMPORT_SINCE = new Date('2026-10-14T06:30:00+08:00');

function pointError_(message) { throw new Error('永久：' + message); }
function pointText_(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) pointError_(field + '格式不正確');
  return value.trim();
}
function pointId_(value) {
  value = pointText_(value, 120, '編號');
  if (!/^[a-zA-Z0-9_:.-]+$/.test(value)) pointError_('編號格式不正確');
  return value;
}
function pointSeat_(seat) {
  if (typeof seat !== 'number' || !Number.isInteger(seat)) pointError_('座號格式不正確');
  for (var i = 0; i < POINT_ROSTER.length; i++) if (POINT_ROSTER[i][0] === seat) return {seat: seat, name: POINT_ROSTER[i][1]};
  pointError_('座號不在名冊');
}
function pointDelta_(delta) {
  if (typeof delta !== 'number' || !Number.isInteger(delta) || !delta || Math.abs(delta) > 100) pointError_('分值須為非零整數，範圍 -100 到 100');
  return delta;
}
function pointTargets_(seats) {
  if (!Array.isArray(seats) || !seats.length || seats.length > POINT_ROSTER.length) pointError_('學生清單格式不正確');
  var seen = {};
  return seats.map(function (s) {
    if (!s || typeof s !== 'object') pointError_('學生格式不正確');
    var target = pointSeat_(s.seat);
    if (s.name !== target.name || seen[target.seat]) pointError_('姓名不符或座號重複');
    seen[target.seat] = true;
    return target;
  }).sort(function (a,b) { return a.seat - b.seat; });
}
function pointAvatarIndex_(itemId) {
  var m = /^avatar:(\d{1,2})$/.exec(itemId || '');
  return m && Number(m[1]) <= 23 ? Number(m[1]) : null;
}
function pointAvatarCost_(settings) {
  var cost = settings && settings.avatarCost;
  return Number.isInteger(cost) && cost >= 1 && cost <= 100 ? cost : 5;
}
function pointBatch_(batch) {
  if (!batch || typeof batch !== 'object') pointError_('批次格式不正確');
  var type = batch.type;
  if (['score','undo','reset','balance'].indexOf(type) < 0) pointError_('操作類型不正確');
  var device = pointText_(batch.device, 100, '裝置');
  if (type === 'undo') {
    var original = pointId_(batch.originalBatchId);
    if (original.indexOf('undo:') === 0) pointError_('只能復原計分批次');
    return {request:{id:'undo:' + original, type:type, originalBatchId:original}, device:device};
  }
  var id = pointId_(batch.id);
  if (id.indexOf('undo:') === 0 || id.indexOf('manifest:') === 0 || id.indexOf('auction408_') === 0) pointError_('編號為保留字');
  var request = {id:id, type:type, seats:pointTargets_(batch.seats), device:device};
  if (type === 'balance') {
    if (!batch.totals || typeof batch.totals !== 'object' || Array.isArray(batch.totals) || Object.keys(batch.totals).length !== request.seats.length) pointError_('總分設定須與學生清單一致');
    request.totals = {};
    request.seats.forEach(function (target) {
      var total = batch.totals[target.seat];
      if (!Object.prototype.hasOwnProperty.call(batch.totals, String(target.seat)) || typeof total !== 'number' || !Number.isInteger(total) || Math.abs(total) > 1000000) pointError_('總分須為 -1000000 到 1000000 的整數');
      request.totals[target.seat] = total;
    });
  }
  if (type === 'score') {
    request.itemId = pointId_(batch.itemId);
    request.label = pointText_(batch.label, 80, '項目名稱');
    if (request.itemId === 'auction') {
      if (typeof batch.delta !== 'number' || !Number.isInteger(batch.delta) || batch.delta >= 0 || batch.delta < -1000000) pointError_('拍賣扣點須為 1 到 1000000 的正整數');
      request.delta = batch.delta;
      request.label = '拍賣扣點';
    } else request.delta = pointDelta_(batch.delta);
    if (request.itemId.indexOf('avatar:') === 0) {
      // Avatar purchase: one student, a deduction; price and balance are checked under lock.
      if (pointAvatarIndex_(request.itemId) === null || request.seats.length !== 1 || request.delta >= 0) pointError_('換角色資料不正確');
      request.label = '更換角色';
    }
  }
  return {request:request, device:device};
}
// Zero width space prevents formula evaluation without Sheets' apostrophe parser.
// Escape literal leading U+200B as well, so removing one prefix is lossless.
function pointEscape_(value) { return typeof value === 'string' && /^(?:\s*[=+@-]|'|\u200B)/.test(value) ? '\u200B' + value : value; }
function pointUnescape_(value) { return typeof value === 'string' && value.charAt(0) === '\u200B' ? value.slice(1) : value; }
function pointSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(POINT_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(POINT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(POINT_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,POINT_HEADERS.length).setValues([POINT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  var headers = sheet.getRange(1,1,1,POINT_HEADERS.length).getValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(POINT_HEADERS) || sheet.getLastColumn() > 11) pointError_('集點工作表表頭不符，停止寫入');
  return sheet;
}
function pointRead_(sheet) {
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,11).getValues() : [];
  var events = [], manifests = [], ids = {};
  rows.forEach(function (raw) {
    var r = raw.map(pointUnescape_);
    if (!r[0] || ids[r[0]]) pointError_('集點紀錄事件編號損壞或重複');
    ids[r[0]] = true;
    if (r[8] === '_manifest') {
      var m;
      try { m = JSON.parse(r[6]); } catch (err) { pointError_('集點批次資料損壞'); }
      if (!m || !m.request || !Array.isArray(m.events) || m.request.id !== r[1] || r[0] !== 'manifest:' + r[1]) pointError_('集點批次資料損壞');
      manifests.push(m);
    } else {
      if (['score','undo','reset','balance'].indexOf(r[8]) < 0 || typeof r[7] !== 'number' || !Number.isSafeInteger(r[7])) pointError_('集點紀錄格式損壞');
      var student = pointSeat_(r[3]);
      if (student.name !== r[4] || r[0] !== r[1] + ':' + r[3]) pointError_('集點紀錄名冊或編號損壞');
      events.push({id:r[0],batchId:r[1],time:r[2] instanceof Date ? r[2].toISOString() : String(r[2]),seat:r[3],name:r[4],itemId:r[5],label:r[6],delta:r[7],type:r[8],originalBatchId:r[9],device:r[10]});
    }
  });
  return {events:events, manifests:manifests};
}
function pointRow_(event) { return [event.id,event.batchId,event.time,event.seat,event.name,event.itemId,event.label,event.delta,event.type,event.originalBatchId,event.device].map(pointEscape_); }
function pointAppend_(sheet, row) { sheet.getRange(sheet.getLastRow()+1,1,1,11).setValues([row]); }
function pointComplete_(sheet, data) {
  var existing = {}, missing = [];
  data.events.forEach(function (event) { existing[event.id] = event; });
  data.manifests.forEach(function (manifest) {
    manifest.events.forEach(function (event) {
      if (existing[event.id]) {
        if (JSON.stringify(existing[event.id]) !== JSON.stringify(event)) pointError_('既有事件內容衝突');
      } else {
        existing[event.id] = event;
        missing.push(event);
      }
    });
  });
  // One Sheets round trip for all missing entries. Durable manifests remain the
  // source of truth if the service writes only a prefix or loses its response.
  if (missing.length) {
    sheet.getRange(sheet.getLastRow()+1,1,missing.length,11).setValues(missing.map(pointRow_));
    data.events = data.events.concat(missing);
  }
}
function pointDefaultSettings_() {
  return {items:[{id:'focus',label:'認真上課',delta:1},{id:'help',label:'主動幫忙',delta:1},{id:'teamwork',label:'合作',delta:1},{id:'unfinished',label:'未完成任務',delta:-1},{id:'disrupt',label:'影響秩序',delta:-1}],avatars:{},groups:[],muted:false,sound:'chime',avatarCost:5};
}
function pointSettings_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(POINT_SETTINGS_KEY);
  if (!raw) return {settings:pointDefaultSettings_(),revision:0};
  var stored;
  try { stored = JSON.parse(raw); } catch (err) { pointError_('集點設定資料損壞'); }
  if (!stored || !Number.isSafeInteger(stored.revision) || stored.revision < 0 || !stored.settings) pointError_('集點設定資料損壞');
  return stored;
}
function pointBundle_(data) {
  var config = pointSettings_();
  return {events:data.events,settings:config.settings,revision:config.revision,serverTime:new Date().toISOString()};
}
function getPointBundle() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = pointSheet_(), data = pointRead_(sheet);
    pointComplete_(sheet,data);
    pointImportAuction_(sheet,data);
    return pointBundle_(data);
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
function commitPointBatch(batch) {
  var clean = pointBatch_(batch), request = clean.request;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = pointSheet_(), data = pointRead_(sheet), found = null;
    data.manifests.forEach(function (m) { if (m.request.id === request.id) found = m; });
    if (found && JSON.stringify(found.request) !== JSON.stringify(request)) pointError_('批次編號內容衝突');
    pointComplete_(sheet,data);
    if (found) return pointBundle_(data);
    pointCommitLocked_(sheet, data, request, clean.device);
    return pointBundle_(data);
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
// Caller holds the script lock and has completed existing manifests.
function pointCommitLocked_(sheet, data, request, device) {
  var targets, totals = {}, originals = [];
  if (request.type === 'undo') {
    originals = data.events.filter(function (e) { return e.batchId === request.originalBatchId && e.type === 'score'; });
    if (!originals.length) pointError_('找不到可復原的計分批次');
    targets = originals.map(function (e) { return {seat:e.seat,name:e.name}; });
  } else targets = request.seats;
  data.events.forEach(function (e) { totals[e.seat] = (totals[e.seat] || 0) + e.delta; });
  if (request.type === 'score' && pointAvatarIndex_(request.itemId) !== null) {
    var cost = pointAvatarCost_(pointSettings_().settings), seat = request.seats[0].seat;
    if (request.delta !== -cost) pointError_('換角色扣點已改為 ' + cost + ' 點，請重新整理後再換');
    if ((totals[seat] || 0) < cost) pointError_('點數不足：換角色需要 ' + cost + ' 點，目前 ' + (totals[seat] || 0) + ' 點');
  }
  var time = new Date().toISOString();
  var events = targets.map(function (target, index) {
    var original = originals[index];
    var delta = request.type === 'score' ? request.delta : request.type === 'undo' ? -original.delta : request.type === 'balance' ? request.totals[target.seat] - (totals[target.seat] || 0) : -(totals[target.seat] || 0);
    if (!Number.isSafeInteger(delta)) pointError_('總分超出整數安全範圍');
    return {id:request.id + ':' + target.seat,batchId:request.id,time:time,seat:target.seat,name:target.name,itemId:request.type === 'score' ? request.itemId : request.type === 'undo' ? original.itemId : request.type === 'balance' ? 'balance' : 'reset',label:request.type === 'score' ? request.label : request.type === 'undo' ? original.label : request.type === 'balance' ? '點數設定' : '點數歸零',delta:delta,type:request.type,originalBatchId:request.originalBatchId || '',device:device};
  });
  var manifest = {request:request,events:events};
  var json = JSON.stringify(manifest);
  if (json.length > 45000) pointError_('批次資料太大');
  pointAppend_(sheet, ['manifest:' + request.id,request.id,time,0,'','',''+json,0,'_manifest',request.originalBatchId || '',device].map(pointEscape_));
  data.manifests.push(manifest);
  pointComplete_(sheet,data);
}
// 得標編號兩個專案必須一致：auction408_<得標時間毫秒>_<座號>（點數拍賣系統 程式碼.js 同名邏輯）。
function pointAuctionWins_() {
  var ss = SpreadsheetApp.openById(AUCTION_SPREADSHEET_ID);
  var roster = ss.getSheetByName('名冊_408'), wins = ss.getSheetByName('得標紀錄_408');
  if (!roster || !wins || roster.getLastRow() < 2 || wins.getLastRow() < 2) return [];
  var seatOf = {}, duplicate = {};
  roster.getRange(2,1,roster.getLastRow()-1,2).getValues().forEach(function (r) {
    var seat = Number(r[0]), name = String(r[1]).trim();
    if (!seat || !name) return;
    if (seatOf[name] !== undefined) duplicate[name] = true;
    seatOf[name] = seat;
  });
  return wins.getRange(2,1,wins.getLastRow()-1,4).getValues().map(function (r) {
    var time = r[0] instanceof Date ? r[0] : null, name = String(r[2]).trim(), amount = Number(r[3]);
    if (!time || time < AUCTION_IMPORT_SINCE || duplicate[name] || seatOf[name] === undefined || !Number.isInteger(amount) || amount <= 0 || amount > 1000000) return null;
    var item = String(r[1]).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60) || '商品';
    return {id:'auction408_' + time.getTime() + '_' + seatOf[name], seat:seatOf[name], item:item, amount:amount};
  }).filter(Boolean);
}
// 讀拍賣表失敗不影響集點同步；最多每 20 秒檢查一次，已匯入的編號靠 _manifest 去重。
function pointImportAuction_(sheet, data) {
  var cache = CacheService.getScriptCache();
  if (cache.get('auctionImportChecked')) return;
  var wins;
  try { wins = pointAuctionWins_(); } catch (err) { console.warn('拍賣得標讀取失敗：' + err.message); return; }
  cache.put('auctionImportChecked', '1', 20);
  var done = {};
  data.manifests.forEach(function (m) { done[m.request.id] = true; });
  wins.forEach(function (w) {
    if (done[w.id]) return;
    var target;
    try { target = pointSeat_(w.seat); } catch (err) { return; }
    pointCommitLocked_(sheet, data, {id:w.id,type:'score',seats:[target],itemId:'auction_win',label:'拍賣得標：' + w.item,delta:-w.amount}, 'auction408');
    done[w.id] = true;
  });
}
function pointValidateSettings_(settings) {
  if (!settings || typeof settings !== 'object' || !Array.isArray(settings.items) || !settings.items.length || settings.items.length > 40 || !Array.isArray(settings.groups) || settings.groups.length > 16 || !settings.avatars || Array.isArray(settings.avatars) || typeof settings.avatars !== 'object' || typeof settings.muted !== 'boolean') pointError_('集點設定格式不正確');
  var sound = typeof settings.sound === 'undefined' ? 'chime' : settings.sound;
  if (['chime','dingdong','levelup','sparkle'].indexOf(sound) < 0) pointError_('音效設定不正確');
  var avatarCost = typeof settings.avatarCost === 'undefined' ? 5 : settings.avatarCost;
  if (!Number.isInteger(avatarCost) || avatarCost < 1 || avatarCost > 100) pointError_('換角色扣點須為 1～100 的整數');
  var ids = {}, positive = false, negative = false;
  var items = settings.items.map(function (item) {
    if (!item) pointError_('項目格式不正確');
    var id = pointId_(item.id), delta = pointDelta_(item.delta);
    if (ids[id]) pointError_('項目編號重複'); ids[id] = true;
    if (delta > 0) positive = true; else negative = true;
    return {id:id,label:pointText_(item.label,80,'項目名稱'),delta:delta};
  });
  if (!positive || !negative) pointError_('必須保留加點與扣點項目');
  var avatars = {};
  Object.keys(settings.avatars).forEach(function (key) {
    var seat = pointSeat_(Number(key)).seat, avatar = settings.avatars[key];
    if (String(seat) !== key || !Number.isInteger(avatar) || avatar < 0 || avatar > 23) pointError_('角色格式不正確');
    avatars[key] = avatar;
  });
  var grouped = {}, groupIds = {};
  var groups = settings.groups.map(function (group) {
    if (!group || !Array.isArray(group.seats) || group.seats.length > POINT_ROSTER.length) pointError_('小組格式不正確');
    var id = pointId_(group.id);
    if (groupIds[id]) pointError_('小組編號重複'); groupIds[id] = true;
    var seats = group.seats.map(function (seat) {
      seat = pointSeat_(seat).seat;
      if (grouped[seat]) pointError_('學生不可重複分組'); grouped[seat] = true;
      return seat;
    }).sort(function (a,b) {return a-b;});
    return {id:id,name:pointText_(group.name,40,'組名'),seats:seats};
  });
  return {items:items,avatars:avatars,groups:groups,muted:settings.muted,sound:sound,avatarCost:avatarCost};
}
function savePointSettings(settings, revision) {
  var clean = pointValidateSettings_(settings);
  if (!Number.isSafeInteger(revision) || revision < 0) pointError_('設定修訂號不正確');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var old = pointSettings_();
    if (old.revision !== revision) pointError_('集點設定修訂衝突，請重新整理後再儲存');
    var result = {settings:clean,revision:revision+1}, json = JSON.stringify(result);
    if (Utilities.newBlob(json).getBytes().length > 8000) pointError_('集點設定太大');
    PropertiesService.getDocumentProperties().setProperty(POINT_SETTINGS_KEY,json);
    return result;
  } finally { lock.releaseLock(); }
}
