/**
 * 班級計時器 — 座位檢查同步後端
 * 綁定於試算表「碧小408四上聯絡簿」，資料寫入「上課表現紀錄」分頁。
 *
 * 分頁欄位：A 日期 | B 座號 | C 姓名 | D 項目 | E 次數 | F 最後更新 | G 項目代碼
 * 一天一人一項一列，重複登記就把 E 欄 +1。
 */

var SHEET_NAME = '上課表現紀錄';
var HEADERS = ['日期', '座號', '姓名', '項目', '次數', '最後更新', '項目代碼'];
var WEEKLY_RECORDS_PROPERTY = 'weeklyRecordData';
var WEEKLY_SETTINGS_PROPERTY = 'weeklyRecordSettings';
var GROUP_SETTINGS_PROPERTY = 'groupDiscussionSettings';

/** 網頁進入點：支援班級紀錄器 HTML 介面與 SH150 運動登記 REST API */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'sh150') {
    return handleSh150Get_(e);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('班級紀錄器')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var contents = (e && e.postData) ? e.postData.contents : '{}';
    var body = JSON.parse(contents);
    if (body.api === 'sh150' || body.action === 'save_sh150' || body.records) {
      return handleSh150Post_(body);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleSh150Get_(e) {
  var params = e.parameter || {};
  var action = params.action || "getWeek";
  var week = parseInt(params.week) || 1;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("SH150運動明細");
  var data = sheet ? sheet.getDataRange().getValues() : [];
  
  var records = {};
  var teacherRuns = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rWeek = parseInt(row[1]);
    var rDay = parseInt(row[2]);
    var rSeat = parseInt(row[3]);
    var rRun = Number(row[5]) || 0;
    var rJump = Number(row[6]) || 0;
    var tRun = Number(row[9]) || 0;
    
    if (rWeek === week) {
      if (rSeat > 0 && rDay >= 1 && rDay <= 5) {
        records[rSeat + "_" + rDay] = { run: rRun, jump: rJump };
      }
      if (tRun > 0 && rDay >= 1 && rDay <= 5) {
        teacherRuns[String(rDay)] = tRun;
      }
    }
  }
  
  var response = {
    status: "success",
    week: week,
    records: records,
    teacherRuns: teacherRuns,
    serverTime: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSh150Post_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var week = parseInt(body.week) || 1;
    var records = body.records || {};
    var teacherRuns = body.teacherRuns || {};
    var source = body.source || "408_web_app";
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SH150運動明細");
    if (!sheet) {
      sheet = ss.insertSheet("SH150運動明細");
      sheet.appendRow(["紀錄時間", "週次", "星期", "座號", "姓名", "跑步圈數", "跳繩下數", "跳繩折算圈數", "個人當日總圈數", "導師跑步圈數", "全班加權總圈數", "來源設備"]);
    }
    
    var data = sheet.getDataRange().getValues();
    var existingRowMap = {};
    
    for (var i = 1; i < data.length; i++) {
      var rW = parseInt(data[i][1]);
      var rD = parseInt(data[i][2]);
      var rS = parseInt(data[i][3]);
      if (rW && rD && rS) {
        existingRowMap[rW + "_" + rD + "_" + rS] = (i + 1);
      }
    }
    
    var nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    var students = [
      [1, "游濬謙"], [2, "李晨睿"], [3, "王柏勛"], [4, "劉宸燁"], [5, "鄭又仁"],
      [6, "簡宇辰"], [8, "楊晨熙"], [9, "林宏哲"], [10, "李亦修"], [11, "汪昱辰"],
      [12, "李宸緯"], [13, "陳冠宇"], [14, "李茗堃"], [15, "林祐辰"], [16, "蔡秉浩"],
      [17, "蔡菲芸"], [18, "陳依婕"], [19, "陳依錡"], [20, "柯祉妤"], [21, "程旻薰"],
      [22, "陳玥筑"], [23, "王梓羽"], [24, "黃庭蓁"], [25, "李玉琳"], [26, "黃樂芙"],
      [27, "林忻"], [28, "沈盈萱"], [29, "游禧羽"], [30, "沈芷心"], [31, "吳玟熙"],
      [32, "吳芊妤"]
    ];
    
    var appendRows = [];
    
    for (var d = 1; d <= 5; d++) {
      var tRun = Number(teacherRuns[String(d)]) || 0;
      
      for (var sIdx = 0; sIdx < students.length; sIdx++) {
        var seat = students[sIdx][0];
        var name = students[sIdx][1];
        var key = seat + "_" + d;
        var mapKey = week + "_" + d + "_" + seat;
        
        var rec = records[key] || { run: 0, jump: 0 };
        var runVal = Number(rec.run) || 0;
        var jumpVal = Number(rec.jump) || 0;
        var jumpConv = Math.floor(jumpVal / 200);
        var stuTotal = runVal + jumpConv;
        var dayGrand = stuTotal + (tRun * 2);
        
        var targetRowIndex = existingRowMap[mapKey];
        
        if (targetRowIndex) {
          sheet.getRange(targetRowIndex, 1, 1, 12).setValues([[
            nowStr, week, d, seat, name, runVal, jumpVal, jumpConv, stuTotal, tRun, dayGrand, source
          ]]);
        } else if (runVal > 0 || jumpVal > 0 || tRun > 0) {
          appendRows.push([
            nowStr, week, d, seat, name, runVal, jumpVal, jumpConv, stuTotal, tRun, dayGrand, source
          ]);
        }
      }
    }
    
    if (appendRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, 12).setValues(appendRows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "已即時同步至 Google 試算表",
      updatedAt: nowStr
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
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

/** 設定（檢查項目、座位表、小組討論設定）存在文件屬性，所有裝置共用 */
function getSeatSettings() {
  var props = PropertiesService.getDocumentProperties();
  var items = props.getProperty('seatCheckItems');
  var layout = props.getProperty('seatLayout');
  var tabs = props.getProperty('timerTabOrder');
  var group = props.getProperty(GROUP_SETTINGS_PROPERTY);
  return {
    items: items ? JSON.parse(items) : null,
    layout: layout || null,
    tabOrder: tabs ? JSON.parse(tabs) : null,
    groupSettings: group ? JSON.parse(group) : null
  };
}

function saveSeatSettings(items, layout, tabOrder) {
  var props = PropertiesService.getDocumentProperties();
  if (items) props.setProperty('seatCheckItems', JSON.stringify(items));
  if (layout) props.setProperty('seatLayout', layout);
  if (tabOrder && tabOrder.length) props.setProperty('timerTabOrder', JSON.stringify(tabOrder));
  return true;
}

/** 讀取小組討論設定（跨裝置同步） */
function getGroupSettings() {
  var raw = PropertiesService.getDocumentProperties().getProperty(GROUP_SETTINGS_PROPERTY);
  if (!raw) return null;
  try { return JSON.parse(raw) || null; } catch (e) { return null; }
}

/** 儲存小組討論設定（包含題目任務、加分項目、組數與組名） */
function saveGroupSettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    PropertiesService.getDocumentProperties().setProperty(GROUP_SETTINGS_PROPERTY, JSON.stringify(settings));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** 開啟頁面時一次拿齊 */
function getSeatBundle() {
  return {
    records: getSeatRecords(),
    settings: getSeatSettings(),
    serverDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

/** 每週記錄存文件屬性，不建立新的試算表分頁。 */
function getWeeklyRecords_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(WEEKLY_RECORDS_PROPERTY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function getWeeklySettings_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(WEEKLY_SETTINGS_PROPERTY);
  if (!raw) return null;
  try { return JSON.parse(raw) || null; } catch (e) { return null; }
}

function getWeeklyBundle() {
  return {
    records: getWeeklyRecords_(),
    settings: getWeeklySettings_(),
    tabOrder: getSeatSettings().tabOrder,
    serverDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

/** 儲存每週表的標題、班級與每週日期標籤。 */
function saveWeeklySettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  var weeks = [];
  var source = Array.isArray(settings.weeks) ? settings.weeks : [];
  for (var i = 0; i < 20; i++) {
    var src = source[i] || {};
    if (typeof src === 'string') src = { label: src };
    weeks.push({
      label: String(src.label || (i + 1)).trim().slice(0, 16) || String(i + 1),
      date: String(src.date || '').trim().slice(0, 16),
      year: String(src.year || (i < 17 ? '115' : '116')).trim().slice(0, 8)
    });
  }
  var excludedSeats = [];
  var excludedSource = Array.isArray(settings.excludedSeats) ? settings.excludedSeats : [];
  var excludedSeen = {};
  excludedSource.forEach(function (value) {
    var seat = parseInt(value, 10);
    if (seat >= 1 && seat <= 34 && !excludedSeen[seat]) {
      excludedSeen[seat] = true;
      excludedSeats.push(seat);
    }
  });
  excludedSeats.sort(function (a, b) { return a - b; });
  var clean = {
    title: String(settings.title || '新北市三重區碧華國小校115學年第1學期含氟漱口水實施記錄表').trim().slice(0, 80) || '新北市三重區碧華國小校115學年第1學期含氟漱口水實施記錄表',
    subtitle: String(settings.subtitle || '四年8班').trim().slice(0, 80) || '四年8班',
    excludedSeats: excludedSeats,
    weeks: weeks
  };
  PropertiesService.getDocumentProperties().setProperty(WEEKLY_SETTINGS_PROPERTY, JSON.stringify(clean));
  return true;
}

/** 直接設定每週某一格的狀態，重送結果一致。state 為 done、missed 或空白。 */
function setWeeklyCell(week, seat, state) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    week = parseInt(week, 10);
    seat = String(seat).trim();
    state = String(state || '');
    if (!(week >= 1 && week <= 20) || !seat) return false;
    if (state !== 'done' && state !== 'missed') state = '';

    var props = PropertiesService.getDocumentProperties();
    var records = getWeeklyRecords_();
    if (state) {
      if (!records[seat] || typeof records[seat] !== 'object') records[seat] = {};
      records[seat][String(week)] = state;
    } else if (records[seat]) {
      delete records[seat][String(week)];
      if (!Object.keys(records[seat]).length) delete records[seat];
    }
    if (Object.keys(records).length) props.setProperty(WEEKLY_RECORDS_PROPERTY, JSON.stringify(records));
    else props.deleteProperty(WEEKLY_RECORDS_PROPERTY);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function clearWeeklyRecords() {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    PropertiesService.getDocumentProperties().deleteProperty(WEEKLY_RECORDS_PROPERTY);
    return true;
  } finally {
    lock.releaseLock();
  }
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
