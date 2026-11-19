import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSlots, figureScale, isReserved, groundY, POND, BEDS } from '../garden3d/layout.js';

const minDist = (s) => { let d = Infinity; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) d = Math.min(d, Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1])); return d; };

test('31 seats fit, stay off reserved areas and keep figures apart', () => {
  const s = generateSlots(31);
  assert.equal(s.length, 31);
  s.forEach(([x, z]) => assert.equal(isReserved(x, z), false, `slot ${x},${z} is reserved`));
  assert.ok(minDist(s) >= 1.4, 'min distance ' + minDist(s));
});

test('100 seats still fit without overlap', () => {
  const s = generateSlots(100);
  assert.equal(s.length, 100);
  assert.ok(minDist(s) >= 0.9, 'min distance ' + minDist(s));
});

test('seats are deterministic and clamp to 1..100', () => {
  assert.deepEqual(generateSlots(31), generateSlots(31));
  assert.equal(generateSlots(0).length, 1);
  assert.equal(generateSlots(500).length, 100);
});

test('figures shrink only for large classes', () => {
  assert.equal(figureScale(31), 0.82);
  assert.equal(figureScale(45), 0.82);
  assert.ok(figureScale(100) < 0.6 && figureScale(100) >= 0.5);
});

test('pond centre and flower beds are reserved; pond floor is below the meadow', () => {
  assert.equal(isReserved(POND.x, POND.z), true);
  BEDS.forEach(([x, z]) => assert.equal(isReserved(x, z), true));
  assert.ok(groundY(POND.x, POND.z) < -0.2);
  assert.ok(Math.abs(groundY(-3, 3)) < 0.3);
});
