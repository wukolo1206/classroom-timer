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
    var settings = pointSettings_().settings;
    return {roster:POINT_ROSTER.map(function (r) { return {seat:r[0],avatar:pointCollection_(events, settings, r[0]).current}; }),readAt:new Date().toISOString()};
  } finally { lock.releaseLock(); }
}
