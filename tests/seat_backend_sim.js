// 秩序登記後端（gas/Code.gs）分節功能的模擬測試：用記憶體假試算表跑 GAS 函式。
// 由 tests/test_seat_backend.py 呼叫；也可直接 node tests/seat_backend_sim.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function makeEnv() {
  const sheet = {
    rows: [],            // rows[0] 是表頭列；每列是陣列
    frozen: 0,
    getLastRow() { return this.rows.length; },
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = sh.rows[r - 1 + i] || [];
            const o = [];
            for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(o);
          }
          return out;
        },
        getValue() { return this.getValues()[0][0]; },
        setValues(vals) {
          if (sh.failNextSetValues) { sh.failNextSetValues = false; throw new Error('模擬逾時'); }
          for (let i = 0; i < nr; i++) {
            if (!sh.rows[r - 1 + i]) sh.rows[r - 1 + i] = [];
            for (let j = 0; j < nc; j++) sh.rows[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          return this;
        },
        setValue(v) { return this.setValues([[v]]); },
        setFontWeight() { return this; },
      };
    },
    deleteRow(n) { this.rows.splice(n - 1, 1); },
    deleteRows(n, k) { this.rows.splice(n - 1, k); },
    appendRow(arr) { this.rows.push(arr.slice()); },
    setFrozenRows(n) { this.frozen = n; },
  };
  const props = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    Utilities: { formatDate: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
    PropertiesService: { getDocumentProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { if (props.__limit && String(v).length > props.__limit) throw new Error('超過大小'); props[k] = v; },
      setProperties: (o) => Object.assign(props, o),
      deleteProperty: (k) => { delete props[k]; },
    }) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    HtmlService: {}, ContentService: {},
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const names = ['getSeatRecords', 'setSeatCount', 'clearSeatRecords', 'clearSeatSlot', 'clearSeatDay', 'clearSeatAllV2',
                 'clearSeatAll', 'importSeatRecords', 'importSeatRecordsV2', 'getSeatRowsRaw', 'logSeatCheck', 'getSheet_'];
  const fn = new Function(...Object.keys(ctx), code + '\nreturn {' + names.join(',') + '};');
  const api = fn(...Object.values(ctx));
  return { sheet, props, api };
}

const results = [];
function test(name, body) {
  try { body(); results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + e.message); }
}
function permanent(fn) {
  try { fn(); } catch (e) { return /^永久：/.test(e.message) ? e.message : 'NOT-PERMANENT ' + e.message; }
  return 'NO-THROW';
}

const HEAD = ['日期', '座號', '姓名', '項目', '次數', '最後更新', '項目代碼'];

test('舊 7 欄資料讀回為未分節，並只補 H1 表頭', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.slice(), ['2026-10-09', 5, '甲', '坐姿', 2, new Date(), 'tilt']];
  const rec = api.getSeatRecords();
  assert.deepStrictEqual(rec, { '2026-10-09': { '5': { tilt: 2 } } });
  assert.strictEqual(sheet.rows[0][7], '節次');
  assert.deepStrictEqual(sheet.rows[0].slice(0, 7), HEAD);
});

test('分節寫入：H 欄文字、重送不重複、不同節分開', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次')];
  api.setSeatCount('2026-10-10#3', '5', '甲', 'tilt', '坐姿', 2);
  api.setSeatCount('2026-10-10#3', '5', '甲', 'tilt', '坐姿', 2);   // 重送
  api.setSeatCount('2026-10-10#4', '5', '甲', 'tilt', '坐姿', 1);
  api.setSeatCount('2026-10-10#m', '5', '甲', 'tilt', '坐姿', 1);
  assert.strictEqual(sheet.rows.length, 4);
  assert.deepStrictEqual(sheet.rows.slice(1).map(r => r[7]), ['第3節', '第4節', '早自習']);
  assert.deepStrictEqual(api.getSeatRecords(), {
    '2026-10-10#3': { '5': { tilt: 2 } }, '2026-10-10#4': { '5': { tilt: 1 } }, '2026-10-10#m': { '5': { tilt: 1 } } });
  api.setSeatCount('2026-10-10#3', '5', '甲', 'tilt', '坐姿', 0);
  assert.strictEqual(sheet.rows.length, 3, '次數 0 刪列');
});

test('舊頁面只送日期：寫到未分節列，不碰分節列', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  api.setSeatCount('2026-10-10', '5', '甲', 'tilt', '坐姿', 7);
  assert.strictEqual(sheet.rows[1][4], 2, '第 3 節不被覆寫');
  assert.strictEqual(sheet.rows[2][4], 7);
  assert.strictEqual(sheet.rows[2][7], '');
});

test('舊 clearSeatRecords 只清未分節', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'),
    ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節'],
    ['2026-10-10', 5, '甲', '坐姿', 1, new Date(), 'tilt', '']];
  assert.strictEqual(api.clearSeatRecords('2026-10-10'), 1);
  assert.strictEqual(sheet.rows.length, 2);
  assert.strictEqual(sheet.rows[1][7], '第3節');
});

test('清除本節（可限定座號）與清除全天', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'),
    ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節'],
    ['2026-10-10', 6, '乙', '坐姿', 1, new Date(), 'tilt', '第3節'],
    ['2026-10-10', 5, '甲', '坐姿', 1, new Date(), 'tilt', '第4節'],
    ['2026-10-10', 5, '甲', '坐姿', 1, new Date(), 'tilt', ''],
    ['2026-10-11', 5, '甲', '坐姿', 1, new Date(), 'tilt', '第3節']];
  assert.strictEqual(api.clearSeatSlot('op1', '2026-10-10#3', '5'), 1, '只刪 5 號第 3 節');
  assert.strictEqual(api.clearSeatSlot('op2', '2026-10-10#3'), 1, '第 3 節剩下的乙');
  assert.strictEqual(api.clearSeatSlot('op3', '2026-10-10'), 1, '清未分節');
  assert.strictEqual(api.clearSeatDay('op4', '2026-10-10'), 1, '10/10 剩第 4 節');
  assert.deepStrictEqual(Object.keys(api.getSeatRecords()), ['2026-10-11#3']);
});

test('同一個 opId 重送不再執行（之後登記的不被刪）', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  assert.strictEqual(api.clearSeatDay('dup', '2026-10-10'), 1);
  api.setSeatCount('2026-10-10#3', '5', '甲', 'tilt', '坐姿', 1);
  assert.strictEqual(api.clearSeatDay('dup', '2026-10-10'), 1, '回覆上次結果');
  assert.strictEqual(sheet.rows.length, 2, '新登記仍在');
});

test('舊 clearSeatAll／importSeatRecords 拒絕；V2 清除全部可用', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  assert.match(permanent(() => api.clearSeatAll()), /頁面版本太舊/);
  assert.match(permanent(() => api.importSeatRecords([['2026-10-10', 5, '甲', '坐姿', 1, 'tilt']])), /頁面版本太舊/);
  assert.strictEqual(sheet.rows.length, 2);
  assert.strictEqual(api.clearSeatAllV2('all1'), 1);
  assert.strictEqual(sheet.rows.length, 1);
});

test('取代匯入：資料變少不殘留舊列與舊 H，未知節次可還原', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次')];
  for (let i = 1; i <= 5; i++) sheet.rows.push(['2026-10-0' + i, i, 'x', '坐姿', 1, new Date(), 'tilt', '第' + i + '節']);
  const r = api.importSeatRecordsV2('imp1', [
    ['2026-10-10#3', '5', '甲', '坐姿', 2, 'tilt'],
    ['2026-10-10', '6', '乙', '坐姿', 1, 'tilt'],
    ['2026-10-10#?補課', '7', '丙', '坐姿', 3, 'tilt']]);
  assert.deepStrictEqual(r, { written: 3 });
  assert.strictEqual(sheet.rows.length, 4);
  assert.deepStrictEqual(sheet.rows.slice(1).map(x => x[7]), ['第3節', '', '補課']);
  assert.deepStrictEqual(Object.keys(api.getSeatRecords()).sort(), ['2026-10-10', '2026-10-10#3', '2026-10-10#?補課']);
});

test('取代匯入：不合格或重複的列整批拒絕，試算表不動', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  const before = JSON.stringify(sheet.rows);
  assert.match(permanent(() => api.importSeatRecordsV2('bad1', [['2026-02-31#3', '5', '甲', '坐姿', 1, 'tilt']])), /日期不存在/);
  assert.match(permanent(() => api.importSeatRecordsV2('bad2', [['2026-10-10#9', '5', '甲', '坐姿', 1, 'tilt']])), /節次代碼不正確/);
  assert.match(permanent(() => api.importSeatRecordsV2('bad3', [['2026-10-10#3', '5', '甲', '坐姿', 1.5, 'tilt']])), /次數不正確/);
  assert.match(permanent(() => api.importSeatRecordsV2('bad4', [['2026-10-10#3', '5', '甲', '坐姿', 1, 'tilt'], ['2026-10-10#3', '5', '甲', '坐姿', 2, 'tilt']])), /重複/);
  assert.strictEqual(JSON.stringify(sheet.rows), before);
});

test('取代匯入：寫入失敗時試算表沒有被清空', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節'], ['2026-10-10', 6, '乙', '坐姿', 1, new Date(), 'tilt', '']];
  sheet.failNextSetValues = true;
  assert.throws(() => api.importSeatRecordsV2('fail1', [['2026-10-11#1', '5', '甲', '坐姿', 1, 'tilt']]));
  assert.strictEqual(sheet.rows.length, 3, '原資料還在');
  // 失敗的 opId 沒有被記成已完成，重送會真的執行
  const r = api.importSeatRecordsV2('fail1', [['2026-10-11#1', '5', '甲', '坐姿', 1, 'tilt']]);
  assert.deepStrictEqual(r, { written: 1 });
  assert.strictEqual(sheet.rows.length, 2);
});

test('雲端快照 getSeatRowsRaw 回傳 A～H', () => {
  const { sheet, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), [new Date(2026, 9, 10), 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  const raw = api.getSeatRowsRaw();
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].length, 8);
  assert.strictEqual(raw[0][0], '2026-10-10');
  assert.strictEqual(raw[0][7], '第3節');
});

test('時段鍵格式錯誤是永久錯誤', () => {
  const { api } = makeEnv();
  assert.match(permanent(() => api.setSeatCount('10/10', '5', '甲', 'tilt', '坐姿', 1)), /時段格式不正確/);
  assert.match(permanent(() => api.clearSeatSlot('', '2026-10-10#3')), /缺少操作編號/);
});

test('操作紀錄寫不進去時，清除仍算成功、不拋錯', () => {
  const { sheet, props, api } = makeEnv();
  sheet.rows = [HEAD.concat('節次'), ['2026-10-10', 5, '甲', '坐姿', 2, new Date(), 'tilt', '第3節']];
  props.__limit = 300;   // 讓 setProperty 超過 300 字就拋錯
  for (let i = 0; i < 20; i++) api.clearSeatDay('pre' + i, '2026-10-0' + (i % 9 + 1));
  assert.strictEqual(api.clearSeatDay('final', '2026-10-10'), 1);
  assert.strictEqual(sheet.rows.length, 1);
  assert.ok(String(props.seatOpLog || '').length <= 300);
  assert.ok(String(props.seatOpLog).indexOf('final') >= 0, '最新一筆有留下');
});

console.log(results.join('\n'));
if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
