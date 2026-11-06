const assert=require('node:assert/strict'),A=require('../garden/activities.js');
let ids=['basketball','soccer','volleyball','tennis','baseball','badminton','sowing','planting','watering'];
for(let id of ids){let seen=new Set();for(let v=0;v<3;v++){let svg=A.propSvg(id,v);assert.ok(svg.includes('viewBox="0 0 100 100"'));assert.ok(svg.includes('life-'+id));seen.add(svg);}assert.equal(seen.size,3);assert.ok(A.labels[id]);}
console.log('PASS eight activity vectors and three palettes including watering');
