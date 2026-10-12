/* Isolated avatar library contract; no browser or production data. */
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var file = path.join(__dirname, '../points/avatars.js');
assert.ok(fs.existsSync(file), '24-character avatar library must exist');
var source = fs.readFileSync(file, 'utf8');
var sandbox = {window:{}};
vm.runInNewContext(source, sandbox);
var library = sandbox.window.c408PointAvatars;
assert.equal(library.labels.length, 24);
assert.equal(new Set(library.labels).size, 24);
var images = library.labels.map(function(label, i) {
  assert.ok(label.length > 1);
  var svg = library.svg(i);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 100 100"/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /<script|<foreignObject|on\w+=|(?:href|src)=|javascript:/i);
  assert.doesNotMatch(svg, /undefined|NaN|Infinity/);
  return svg;
});
assert.equal(new Set(images).size, 24);
[-1,24,99,NaN,Infinity,undefined,null,'bad',1.5,{},'<script>'].forEach(function(n) {
  assert.equal(library.svg(n), images[0], 'invalid avatar uses first character');
});
assert.equal(library.svg('23'), images[23]);
assert.deepEqual(Array.from(library.labels.slice(0,8)), ['薄荷芽芽','星星軟糖','桃桃小獸','布丁夥伴','雲朵泡泡','莓果毛球','森林豆豆','橘子圓圓']);
assert.ok(images[0].includes('M25 40 Q12 2 38 25 M62 25 Q88 2 75 40'));
assert.ok(images[1].includes('M24 34 L13 10 L43 25 M60 25 L88 10 L76 34'));
assert.ok(images[2].includes('M28 31 Q24 4 47 23 M54 23 Q78 4 72 31'));
assert.ok(images.slice(0,8).every(function(svg) {return svg.includes('M19 54 Q17 21 50 22 Q83 21 81 54');}));
assert.doesNotMatch(source, /`/);
console.log('PASS: 24 unique safe avatars, original 8 mapping, bounded fallback.');
