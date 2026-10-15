// Exercise the actual Code.gs with in-memory properties; no cloud access.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function makeEnv(initial) {
  const props = Object.assign({}, initial);
  const writes = [];
  const locks = [];
  const ctx = {
    PropertiesService: { getDocumentProperties: () => ({
      getProperty: key => key in props ? props[key] : null,
      setProperty: (key, value) => { writes.push(key); props[key] = value; }
    }) },
    LockService: {
      getDocumentLock: () => null,
      getScriptLock: () => ({
        waitLock: timeout => locks.push(['wait', timeout]),
        releaseLock: () => locks.push(['release'])
      })
    }
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const api = new Function(...Object.keys(ctx), code + '\nreturn {getGroupSettings,getSeatSettings,saveGroupSettings};')(...Object.values(ctx));
  return { props, writes, locks, api };
}

const groups = Array.from({length: 6}, (_, i) => ({id: 'g' + (i + 1), name: '共享組' + (i + 1), seats: i === 5 ? [] : [i + 1, i + 8]}));
const legacy = {groupCount: 6, groupNames: {}, topic: '保留題目', bonusItems: [{label: '合作', score: 2}], extra: {round: 3}};
const saved = {settings: {groups, avatars: {'1': 4}, items: [{id: 'focus'}], muted: true}, revision: 11};
const results = [];
function test(name, body) {
  try { body(); results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + e.message); }
}

test('six saved point groups overlay mismatched discussion names without writing any property', () => {
  const initial = {groupDiscussionSettings: JSON.stringify(legacy), pointSettings: JSON.stringify(saved)};
  const {api, props, writes} = makeEnv(initial);
  const result = api.getGroupSettings();
  assert.deepStrictEqual(result.groupNames, Object.fromEntries(groups.map((g, i) => [i + 1, g.name])));
  assert.strictEqual(result.groupCount, 6);
  assert.deepStrictEqual(result.sharedGroups, groups);
  assert.strictEqual(result.topic, legacy.topic);
  assert.deepStrictEqual(result.bonusItems, legacy.bonusItems);
  assert.deepStrictEqual(result.extra, legacy.extra);
  assert.deepStrictEqual(props, initial);
  assert.deepStrictEqual(writes, []);
});

test('seat settings return the same shared groups and preserve original seat fields', () => {
  const initial = {groupDiscussionSettings: JSON.stringify(legacy), pointSettings: JSON.stringify(saved), seatCheckItems: '[{"id":"tilt"}]', seatLayout: '1,2', timerTabOrder: '["seat","group"]'};
  const {api, props, writes} = makeEnv(initial);
  const seat = api.getSeatSettings();
  assert.deepStrictEqual(seat.groupSettings.sharedGroups, groups);
  assert.deepStrictEqual(seat.groupSettings, api.getGroupSettings());
  assert.deepStrictEqual(seat.items, [{id: 'tilt'}]);
  assert.strictEqual(seat.layout, '1,2');
  assert.deepStrictEqual(seat.tabOrder, ['seat', 'group']);
  assert.deepStrictEqual(props, initial);
  assert.deepStrictEqual(writes, []);
});

test('shared groups work without any legacy discussion settings', () => {
  const {api, writes} = makeEnv({pointSettings: JSON.stringify(saved)});
  assert.strictEqual(api.getGroupSettings().groupCount, 6);
  assert.deepStrictEqual(api.getGroupSettings().sharedGroups, groups);
  assert.deepStrictEqual(writes, []);
});

test('shared view includes revision 9 so clients can reject older RPC responses without property writes', () => {
  const initial = {groupDiscussionSettings: JSON.stringify(legacy), pointSettings: JSON.stringify(Object.assign({}, saved, {revision: 9}))};
  const {api, props, writes} = makeEnv(initial);
  assert.strictEqual(api.getGroupSettings().sharedGroupsRevision, 9);
  assert.strictEqual(api.getSeatSettings().groupSettings.sharedGroupsRevision, 9);
  assert.deepStrictEqual(props, initial);
  assert.deepStrictEqual(writes, []);
});

test('missing or zero saved point groups retain the complete legacy settings', () => {
  for (const point of [undefined, {settings: {groups: []}, revision: 0}]) {
    const initial = {groupDiscussionSettings: JSON.stringify(legacy)};
    if (point) initial.pointSettings = JSON.stringify(point);
    const {api, props, writes} = makeEnv(initial);
    const expected = point ? Object.assign({}, legacy, {sharedGroups: [], sharedGroupsRevision: 0}) : legacy;
    assert.deepStrictEqual(api.getGroupSettings(), expected);
    assert.deepStrictEqual(api.getSeatSettings().groupSettings, expected);
    assert.deepStrictEqual(props, initial);
    assert.deepStrictEqual(writes, []);
  }
  assert.strictEqual(makeEnv({}).api.getGroupSettings(), null);
});

test('saved empty groups without discussion settings announce removal and preserve revision', () => {
  const initial = {pointSettings: JSON.stringify({settings: {groups: []}, revision: 12})};
  const {api, props, writes} = makeEnv(initial);
  assert.deepStrictEqual(api.getGroupSettings(), {sharedGroups: [], sharedGroupsRevision: 12});
  assert.deepStrictEqual(api.getSeatSettings().groupSettings, api.getGroupSettings());
  assert.deepStrictEqual(props, initial);
  assert.deepStrictEqual(writes, []);
});

test('discussion save works with null document lock and never writes point settings', () => {
  const {api, props, writes, locks} = makeEnv({pointSettings: JSON.stringify(saved)});
  assert.strictEqual(api.saveGroupSettings(legacy), true);
  assert.deepStrictEqual(JSON.parse(props.groupDiscussionSettings), legacy);
  assert.strictEqual(props.pointSettings, JSON.stringify(saved));
  assert.deepStrictEqual(writes, ['groupDiscussionSettings']);
  assert.deepStrictEqual(locks, [['wait', 15000], ['release']]);
});

console.log(results.join('\n'));
if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
