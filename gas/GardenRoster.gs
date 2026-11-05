/** Read-only avatar projection. Never use getPointBundle here: it imports points. */
function getGardenRoster() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(POINT_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(POINT_SHEET_NAME), events = [];
    if (sheet && sheet.getLastRow() > 0) {
      var headers = sheet.getRange(1,1,1,POINT_HEADERS.length).getValues()[0];
      if (JSON.stringify(headers) !== JSON.stringify(POINT_HEADERS) || sheet.getLastColumn() > 11) throw Error('集點工作表表頭不符，無法讀取夥伴');
      events = pointRead_(sheet).events;
    }
    var base = pointSettings_().settings.avatars || {}, map = {}, undone = {};
    POINT_ROSTER.forEach(function (r) { var n=r[0]; map[n]=Number.isInteger(base[n]) && base[n]>=0 && base[n]<24 ? base[n] : n%8; });
    events.forEach(function (e) { if (e.type==='undo') undone[e.originalBatchId]=true; });
    events.forEach(function (e) {
      var m=/^avatar:(\d{1,2})$/.exec(e.itemId||'');
      if (m && Number(m[1])<24 && e.type==='score' && !undone[e.batchId] && Object.prototype.hasOwnProperty.call(map,e.seat)) map[e.seat]=Number(m[1]);
    });
    return {roster:POINT_ROSTER.map(function (r) { return {seat:r[0],avatar:map[r[0]]}; }),readAt:new Date().toISOString()};
  } finally { lock.releaseLock(); }
}
