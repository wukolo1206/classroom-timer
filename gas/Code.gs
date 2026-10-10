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
var SR_META_PROPERTY = 'srRecordsMeta';       // { chunks, savedAt, updatedAt }
var SR_CHUNK_PREFIX = 'srRecords_';           // SR 閱讀小卡整份 JSON 分段存（文件屬性單筆上限 9KB）
var SR_CHUNK_CHARS = 2000;                    // 中文 UTF-8 一字 3 bytes，2000 字約 6KB，留餘裕

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

var SEAT_COLS = 8;            // A～G 原有欄位＋H 節次（只在最後面新增，A～G 順序不動）
var SEAT_PERIOD_HEADER = '節次';
// 節次代碼 ↔ H 欄文字（前端 SEAT_PERIODS 用同一組代碼）；H 空白＝未分節
var SEAT_PERIOD_TEXT = { m: '早自習', '1': '第1節', '2': '第2節', '3': '第3節', '4': '第4節', n: '午休', '5': '第5節', '6': '第6節', '7': '第7節' };
var SEAT_OP_LOG_PROPERTY = 'seatOpLog';   // 最近處理過的清除／匯入 opId，避免重新整理後重送又執行一次
var SEAT_OP_LOG_MAX = 100;
var seatOpTouched_ = false;   // 這次操作是否已經開始寫入或刪除試算表（判斷失敗時能不能安全重試）   // 每筆約 40 字，100 筆約 4KB，留在文件屬性單筆 9KB 上限內

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0 || String(sh.getRange(1, 1).getValue()).trim() === '') {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // 只補 H1 這一格表頭，其他表頭不動
  if (String(sh.getRange(1, SEAT_COLS).getValue()).trim() === '') {
    sh.getRange(1, SEAT_COLS).setValue(SEAT_PERIOD_HEADER).setFontWeight('bold');
  }
  return sh;
}

function readAll_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SEAT_COLS).getValues();
}

function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function permanentError_(msg) { return new Error('永久：' + msg); }

/** 座號正規化：'05'、5、' 5 ' 都視為 '5' */
function normSeat_(v) {
  var t = String(v == null ? '' : v).trim();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}
function rowH_(r) { return String(r[7] == null ? '' : r[7]).trim(); }

/** 時段鍵 → { date, h }：'2026-10-10'＝未分節（h 空白）、'2026-10-10#3'、'2026-10-10#?原文'（對照表以外的 H 文字） */
function parseSlot_(key) {
  var m = /^(\d{4}-\d{2}-\d{2})(?:#(.+))?$/.exec(String(key || '').trim());
  if (!m) throw permanentError_('時段格式不正確：' + key);
  if (!validDate_(m[1])) throw permanentError_('日期不存在：' + m[1]);
  var code = m[2];
  if (code === undefined) return { date: m[1], h: '' };
  if (code.charAt(0) === '?') {
    var raw = code.slice(1).trim();
    if (!raw) throw permanentError_('節次文字是空的：' + key);
    return { date: m[1], h: raw };
  }
  if (!SEAT_PERIOD_TEXT.hasOwnProperty(code)) throw permanentError_('節次代碼不正確：' + key);
  return { date: m[1], h: SEAT_PERIOD_TEXT[code] };
}

/** 試算表一列的日期＋H 欄 → 時段鍵 */
function slotOfRow_(dateCell, hCell) {
  var date = dateKey_(dateCell);
  var h = String(hCell == null ? '' : hCell).trim();
  if (!h) return date;
  for (var code in SEAT_PERIOD_TEXT) if (SEAT_PERIOD_TEXT[code] === h) return date + '#' + code;
  return date + '#?' + h;
}

function validDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** 讀回所有登記紀錄：{ '2026-10-10#3': { '4': { tilt: 2 } }, '2026-08-30': {…未分節…} } */
function getSeatRecords() {
  var sh = getSheet_();
  var rows = readAll_(sh);
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var date = dateKey_(rows[i][0]);
    var seat = normSeat_(rows[i][1]);
    var count = parseInt(rows[i][4], 10);
    var key = String(rows[i][6] || '').trim();
    if (!date || !seat || !key || !(count > 0)) continue;
    var slot = slotOfRow_(rows[i][0], rows[i][7]);
    if (!out[slot]) out[slot] = {};
    if (!out[slot][seat]) out[slot][seat] = {};
    out[slot][seat][key] = (out[slot][seat][key] || 0) + count;
  }
  return out;
}

/** 匯入前的雲端快照：A～H 原始列（日期轉成文字） */
function getSeatRowsRaw() {
  var sh = getSheet_();
  return readAll_(sh).map(function (r) {
    return [dateKey_(r[0]), String(r[1]), String(r[2]), String(r[3]), Number(r[4]) || 0,
            r[5] instanceof Date ? r[5].toISOString() : String(r[5]), String(r[6]), String(r[7] == null ? '' : r[7])];
  });
}

// ── 清除／匯入去重：同一個 opId 只執行一次，重送直接回覆上次結果 ──
function seatOpLog_() {
  try { return JSON.parse(PropertiesService.getDocumentProperties().getProperty(SEAT_OP_LOG_PROPERTY) || '[]') || []; }
  catch (e) { return []; }
}
function withSeatOp_(opId, fn) {
  opId = String(opId || '').trim();
  if (!opId) throw permanentError_('缺少操作編號，請重新整理頁面');
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var log = seatOpLog_();
    for (var i = 0; i < log.length; i++) {
      if (log[i].id !== opId) continue;
      // 已完成：直接回覆上次結果
      if (log[i].done) return log[i].result;
      // 「進行中」：上次可能已經做完、只是沒記到完成（或執行到一半逾時）。結果不確定，
      // 不自動重做（重做可能刪掉之後其他裝置新增的資料），請老師重新整理確認。
      throw permanentError_('上一次的清除／匯入結果不確定（可能已完成但沒有收到確認）。為了不誤刪之後新增的資料，不會自動再做一次。請重新整理確認畫面；資料若還在，再操作一次。');
    }
    log.push({ id: opId, done: false });
    // 先把「進行中」存起來；存不進去就不執行（否則重送時無法辨識是否已做過）
    if (!saveSeatOpLog_(log)) throw new Error('暫時無法記錄操作，稍後自動重試');
    var result;
    seatOpTouched_ = false;
    try {
      result = fn();
    } catch (e) {
      // 還沒動到試算表就失敗：移除「進行中」，重試可正常執行。
      // 已經開始寫入／刪除才失敗：試算表可能改了一半，維持「進行中」，重送時會被當成結果不確定而暫停，不自動重做。
      if (!seatOpTouched_) saveSeatOpLog_(log.filter(function (x) { return x.id !== opId; }));
      throw e;
    }
    log[log.length - 1] = { id: opId, done: true, result: result };
    saveSeatOpLog_(log);   // 這一步失敗時紀錄停在「進行中」，重送會被當成結果不確定而暫停（見上）
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** 保存操作紀錄：超過大小就少留舊的幾筆再試；完全存不進去回傳 false */
function saveSeatOpLog_(log) {
  if (log.length > SEAT_OP_LOG_MAX) log = log.slice(log.length - SEAT_OP_LOG_MAX);
  if (!log.length) {
    try { PropertiesService.getDocumentProperties().setProperty(SEAT_OP_LOG_PROPERTY, '[]'); return true; } catch (e) { return false; }
  }
  for (var keep = log.length; keep > 0; keep = Math.floor(keep / 2)) {
    try {
      PropertiesService.getDocumentProperties().setProperty(SEAT_OP_LOG_PROPERTY, JSON.stringify(log.slice(log.length - keep)));
      return true;
    } catch (e) {}
  }
  return false;
}

/** 由下往上刪除符合條件的列，回傳刪除筆數 */
function deleteSeatRowsWhere_(sh, test) {
  var rows = readAll_(sh);
  var removed = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (!test(rows[i])) continue;
    seatOpTouched_ = true;
    sh.deleteRow(i + 2);
    removed++;
  }
  return removed;
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

/** SR 閱讀小卡：讀回整份資料（前端 sr-reading/sr-tool.html 的 ctu_sr_records 格式）。沒有資料時 json 為 null。 */
function getSrRecords() {
  var props = PropertiesService.getDocumentProperties();
  var meta = null;
  try { meta = JSON.parse(props.getProperty(SR_META_PROPERTY) || 'null'); } catch (e) { meta = null; }
  if (!meta || !(meta.chunks > 0)) return { json: null, savedAt: 0 };
  var parts = [];
  for (var i = 0; i < meta.chunks; i++) {
    var part = props.getProperty(SR_CHUNK_PREFIX + i);
    if (part === null) return { json: null, savedAt: 0 };   // 分段不完整就當作沒有，不回傳壞資料
    parts.push(part);
  }
  return { json: parts.join(''), savedAt: Number(meta.savedAt) || 0 };
}

/**
 * SR 閱讀小卡：整份覆寫（送整份＋前端修改時間，重送結果相同）。
 * 只寫文件屬性，不動任何試算表分頁。比雲端舊的資料不覆蓋。
 */
function saveSrRecords(json, savedAt) {
  json = String(json || '');
  savedAt = Number(savedAt) || 0;
  if (json.length > 300000) throw new Error('SR 資料太大');
  var obj;
  try { obj = JSON.parse(json); } catch (e) { throw new Error('SR 資料格式錯誤'); }
  if (!obj || typeof obj !== 'object' || !obj.bySeat || typeof obj.bySeat !== 'object') throw new Error('SR 資料格式錯誤');

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getDocumentProperties();
    var old = null;
    try { old = JSON.parse(props.getProperty(SR_META_PROPERTY) || 'null'); } catch (e) { old = null; }
    if (old && Number(old.savedAt) > savedAt) return { savedAt: Number(old.savedAt), skipped: true };

    var chunks = Math.max(1, Math.ceil(json.length / SR_CHUNK_CHARS));
    var data = {};
    for (var i = 0; i < chunks; i++) data[SR_CHUNK_PREFIX + i] = json.slice(i * SR_CHUNK_CHARS, (i + 1) * SR_CHUNK_CHARS);
    data[SR_META_PROPERTY] = JSON.stringify({ chunks: chunks, savedAt: savedAt, updatedAt: new Date().toISOString() });
    props.setProperties(data);
    // 舊資料若分段比較多，刪掉多出來的
    for (var j = chunks; old && j < (old.chunks || 0); j++) props.deleteProperty(SR_CHUNK_PREFIX + j);
    return { savedAt: savedAt };
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
 * 舊版的「+1／-1」登記（前端已不呼叫，保留給舊頁面）。只作用在未分節（H 空白）的列。
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
          String(rows[i][6] || '').trim() === itemKey && String(rows[i][7] == null ? '' : rows[i][7]).trim() === '') {
        var next = (parseInt(rows[i][4], 10) || 0) + delta;
        if (next <= 0) { sh.deleteRow(i + 2); return 0; }
        sh.getRange(i + 2, 3, 1, 4).setValues([[name, itemLabel, next, new Date()]]);
        return next;
      }
    }
    if (delta <= 0) return 0;
    sh.appendRow([date, Number(seat), name, itemLabel, delta, new Date(), itemKey, '']);
    return delta;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 直接把某時段某人某項設成 count（絕對值，重送結果相同）。
 * slot：時段鍵（'2026-10-10#3'）；舊頁面只送日期＝未分節。count 0 就刪列。
 */
function setSeatCount(slot, seat, name, itemKey, itemLabel, count) {
  var p = parseSlot_(slot);
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var rows = readAll_(sh);
    seat = normSeat_(seat);
    itemKey = String(itemKey || '').trim();
    count = parseInt(count, 10) || 0;
    if (!seat || !itemKey) throw permanentError_('座號或項目代碼是空的');

    // 同一格可能有重複列（舊資料）：第一列設成 count，其餘刪除；count 0 就全部刪除
    var hits = [];
    for (var i = 0; i < rows.length; i++) {
      if (dateKey_(rows[i][0]) === p.date && normSeat_(rows[i][1]) === seat &&
          String(rows[i][6] || '').trim() === itemKey && rowH_(rows[i]) === p.h) hits.push(i + 2);
    }
    var keepRow = count > 0 && hits.length ? hits[0] : null;
    for (var j = hits.length - 1; j >= 0; j--) if (hits[j] !== keepRow) sh.deleteRow(hits[j]);
    if (count <= 0) return 0;
    if (keepRow) { sh.getRange(keepRow, 3, 1, 4).setValues([[name, itemLabel, count, new Date()]]); return count; }
    sh.appendRow([p.date, Number(seat), name, itemLabel, count, new Date(), itemKey, p.h]);
    return count;
  } finally {
    lock.releaseLock();
  }
}

/** 舊頁面的「清除某日」：只清未分節（H 空白）的列，不會刪到分節資料 */
function clearSeatRecords(date, seat) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    date = String(date).trim();
    return deleteSeatRowsWhere_(getSheet_(), function (r) {
      if (dateKey_(r[0]) !== date) return false;
      if (rowH_(r) !== '') return false;
      return !seat || normSeat_(r[1]) === normSeat_(seat);
    });
  } finally {
    lock.releaseLock();
  }
}

/** 清除某時段（可限定座號） */
function clearSeatSlot(opId, slot, seat) {
  var p = parseSlot_(slot);
  return withSeatOp_(opId, function () {
    return deleteSeatRowsWhere_(getSheet_(), function (r) {
      if (dateKey_(r[0]) !== p.date) return false;
      if (rowH_(r) !== p.h) return false;
      return !seat || normSeat_(r[1]) === normSeat_(seat);
    });
  });
}

/** 清除某日所有節次＋未分節（可限定座號） */
function clearSeatDay(opId, date, seat) {
  date = String(date || '').trim();
  if (!validDate_(date)) throw permanentError_('日期不正確：' + date);
  return withSeatOp_(opId, function () {
    return deleteSeatRowsWhere_(getSheet_(), function (r) {
      if (dateKey_(r[0]) !== date) return false;
      return !seat || normSeat_(r[1]) === normSeat_(seat);
    });
  });
}

function clearSeatAllV2(opId) {
  return withSeatOp_(opId, function () {
    var sh = getSheet_();
    var last = sh.getLastRow();
    if (last > 1) { seatOpTouched_ = true; sh.deleteRows(2, last - 1); }
    return last > 1 ? last - 1 : 0;
  });
}

/** 舊頁面入口：會刪到分節資料，拒絕執行 */
function clearSeatAll() {
  throw permanentError_('頁面版本太舊，請重新整理後再清除');
}
function importSeatRecords(rows) {
  throw permanentError_('頁面版本太舊，請重新整理後再匯入');
}

/**
 * 取代匯入：rows 每列 [時段鍵, 座號, 姓名, 項目名稱, 次數, 項目代碼]。
 * 全部驗證通過才動試算表；先從第 2 列覆寫、再刪掉多出來的舊列（不經過整張清空），寫完讀回逐筆比對。
 */
function importSeatRecordsV2(opId, rows) {
  if (!Array.isArray(rows)) throw permanentError_('匯入資料格式不正確');
  var now = new Date();
  var out = [], expect = {}, seen = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!Array.isArray(r) || r.length < 6) throw permanentError_('第 ' + (i + 1) + ' 筆欄位不足');
    var p = parseSlot_(r[0]);
    var seat = normSeat_(r[1]);
    var count = Number(r[4]);
    var key = String(r[5] || '').trim();
    if (!/^\d{1,3}$/.test(seat) || Number(seat) < 1) throw permanentError_('第 ' + (i + 1) + ' 筆座號不正確：' + r[1]);
    if (!(Number.isSafeInteger ? Number.isSafeInteger(count) : count % 1 === 0) || count < 1 || count > 99999) throw permanentError_('第 ' + (i + 1) + ' 筆次數不正確：' + r[4]);
    if (!key) throw permanentError_('第 ' + (i + 1) + ' 筆缺少項目代碼');
    // 識別鍵用正規化後的時段（'日期#?第3節' 與 '日期#3' 視為同一個）與座號（'05'＝'5'）
    var id = slotOfRow_(p.date, p.h) + '|' + seat + '|' + key;
    if (seen[id]) throw permanentError_('第 ' + (i + 1) + ' 筆與前面重複：' + id);
    seen[id] = true;
    expect[id] = count;
    out.push([p.date, Number(seat), String(r[2] == null ? '' : r[2]), String(r[3] == null ? '' : r[3]), count, now, key, p.h]);
  }
  return withSeatOp_(opId, function () {
    var sh = getSheet_();
    var oldRows = Math.max(0, sh.getLastRow() - 1);
    seatOpTouched_ = true;
    if (out.length) sh.getRange(2, 1, out.length, SEAT_COLS).setValues(out);
    if (oldRows > out.length) sh.deleteRows(2 + out.length, oldRows - out.length);
    // 讀回逐筆比對
    var back = getSeatRecords(), got = 0, bad = [];
    Object.keys(back).forEach(function (slot) {
      Object.keys(back[slot]).forEach(function (seat) {
        Object.keys(back[slot][seat]).forEach(function (key) {
          var id = slot + '|' + seat + '|' + key;
          got++;
          if (expect[id] !== back[slot][seat][key]) bad.push(id);
        });
      });
    });
    if (got !== out.length) bad.push('筆數 ' + got + '≠' + out.length);
    if (bad.length) throw permanentError_('匯入後核對不一致：' + bad.slice(0, 5).join('、') + '。請用匯入前下載的雲端快照與本機備份還原');
    return { written: out.length };
  });
}
