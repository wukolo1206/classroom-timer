/**
 * 班級計時器 — 座位檢查同步後端
 * 綁定於試算表「碧小408四上聯絡簿」，資料寫入「上課表現紀錄」分頁。
 *
 * 分頁欄位：A 日期 | B 座號 | C 姓名 | D 項目 | E 次數 | F 最後更新 | G 項目代碼
 * 一天一人一項一列，重複登記就把 E 欄 +1。
 */

var SHEET_NAME = '上課表現紀錄';
var HEADERS = ['日期', '座號', '姓名', '項目', '次數', '最後更新', '項目代碼'];

/** 網頁進入點：只負責吐出 HTML，不呼叫任何需要授權的函式 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('班級計時器')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0 || String(sh.getRange(1, 1).getValue()).trim() === '') {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

/** 讀回所有登記紀錄：{ '2026-08-30': { '4': { tilt: 2 } } } */
function getSeatRecords() {
  var sh = getSheet_();
  var rows = readAll_(sh);
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var date = dateKey_(rows[i][0]);
    var seat = String(rows[i][1]).trim();
    var count = parseInt(rows[i][4], 10);
    var key = String(rows[i][6] || '').trim();
    if (!date || !seat || !key || !(count > 0)) continue;
    if (!out[date]) out[date] = {};
    if (!out[date][seat]) out[date][seat] = {};
    out[date][seat][key] = (out[date][seat][key] || 0) + count;
  }
  return out;
}

/** 設定（檢查項目、座位表）存在文件屬性，所有裝置共用 */
function getSeatSettings() {
  var props = PropertiesService.getDocumentProperties();
  var items = props.getProperty('seatCheckItems');
  var layout = props.getProperty('seatLayout');
  return {
    items: items ? JSON.parse(items) : null,
    layout: layout || null
  };
}

function saveSeatSettings(items, layout) {
  var props = PropertiesService.getDocumentProperties();
  if (items) props.setProperty('seatCheckItems', JSON.stringify(items));
  if (layout) props.setProperty('seatLayout', layout);
  return true;
}

/** 開啟頁面時一次拿齊 */
function getSeatBundle() {
  return {
    records: getSeatRecords(),
    settings: getSeatSettings(),
    serverDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

/**
 * 登記一筆（delta 可為 +1 / -1）。
 * 同一天同一人同一項目只會有一列，次數在 E 欄累加；歸零就刪列。
 * 回傳該筆最新次數。
 */
function logSeatCheck(date, seat, name, itemKey, itemLabel, delta) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var rows = readAll_(sh);
    seat = String(seat).trim();
    date = String(date).trim();
    delta = parseInt(delta, 10) || 0;

    for (var i = 0; i < rows.length; i++) {
      if (dateKey_(rows[i][0]) === date && String(rows[i][1]).trim() === seat &&
          String(rows[i][6] || '').trim() === itemKey) {
        var rowNo = i + 2;
        var next = (parseInt(rows[i][4], 10) || 0) + delta;
        if (next <= 0) {
          sh.deleteRow(rowNo);
          return 0;
        }
        sh.getRange(rowNo, 4, 1, 3).setValues([[itemLabel, next, new Date()]]);
        return next;
      }
    }

    if (delta <= 0) return 0;
    sh.appendRow([date, Number(seat), name, itemLabel, delta, new Date(), itemKey]);
    return delta;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 直接設定某一格的次數（絕對值，重複呼叫結果一致）。
 * 前端以本機數字為準，網路重傳也不會多算或少算。
 */
function setSeatCount(date, seat, name, itemKey, itemLabel, count) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var rows = readAll_(sh);
    seat = String(seat).trim();
    date = String(date).trim();
    count = parseInt(count, 10) || 0;

    for (var i = 0; i < rows.length; i++) {
      if (dateKey_(rows[i][0]) === date && String(rows[i][1]).trim() === seat &&
          String(rows[i][6] || '').trim() === itemKey) {
        var rowNo = i + 2;
        if (count <= 0) { sh.deleteRow(rowNo); return 0; }
        sh.getRange(rowNo, 3, 1, 4).setValues([[name, itemLabel, count, new Date()]]);
        return count;
      }
    }
    if (count <= 0) return 0;
    sh.appendRow([date, Number(seat), name, itemLabel, count, new Date(), itemKey]);
    return count;
  } finally {
    lock.releaseLock();
  }
}

/** 清掉某一天某個人的所有登記；seat 省略則清整天 */
function clearSeatRecords(date, seat) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var rows = readAll_(sh);
    date = String(date).trim();
    var removed = 0;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (dateKey_(rows[i][0]) !== date) continue;
      if (seat && String(rows[i][1]).trim() !== String(seat).trim()) continue;
      sh.deleteRow(i + 2);
      removed++;
    }
    return removed;
  } finally {
    lock.releaseLock();
  }
}

/** 清掉全部登記紀錄（只動資料列，不動標題）*/
function clearSeatAll() {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 本機備份檔匯入：整份覆蓋「上課表現紀錄」的資料列。
 * rows 由前端整理好：[[日期, 座號, 姓名, 項目, 次數, 項目代碼], ...]
 */
function importSeatRecords(rows) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sh = getSheet_();
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
    if (!rows || !rows.length) return 0;

    var now = new Date();
    var out = rows.map(function (r) {
      return [r[0], Number(r[1]), r[2], r[3], Number(r[4]), now, r[5]];
    });
    sh.getRange(2, 1, out.length, HEADERS.length).setValues(out);
    return out.length;
  } finally {
    lock.releaseLock();
  }
}
