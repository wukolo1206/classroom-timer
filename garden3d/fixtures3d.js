// garden3d/fixtures3d.js
// Primary scenes that take the pond's place after moonlight (same ids as garden/fixtures.js).
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';

const M = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, flatShading: true }, extra));
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
const STONE = M('#b6c2b0'), PALE = M('#d8ddcf'), WATER = M('#b6dce1', { roughness: 0.2, emissive: '#b6dce1', emissiveIntensity: 0.25 }), FLOWER = M('#efc6be'), LEAF = M('#91ac73');

function foundation(g) {
  const a = mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.12, 24), M('#c6b49a')); a.position.y = 0.06; g.add(a);
  const b = mesh(new THREE.CylinderGeometry(1.32, 1.4, 0.1, 24), M('#e2d5b7')); b.position.y = 0.17; g.add(b);
}
function fountain() {
  const g = new THREE.Group(); foundation(g);
  const basin = mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.32, 20), STONE); basin.position.y = 0.38; g.add(basin);
  const w1 = mesh(new THREE.CircleGeometry(0.9, 20), WATER, false); w1.rotation.x = -Math.PI / 2; w1.position.y = 0.55; g.add(w1);
  const col = mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 10), STONE); col.position.y = 0.85; g.add(col);
  const top = mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.14, 16), PALE); top.position.y = 1.18; g.add(top);
  const w2 = mesh(new THREE.CircleGeometry(0.38, 16), WATER, false); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.26; g.add(w2);
  const drops = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) { const d = mesh(new THREE.SphereGeometry(0.035, 5, 4), WATER, false); d.userData = { j, i }; g.add(d); drops.push(d); }
  g.userData.animate = (t) => drops.forEach((d) => {
    const k = (t * 0.8 + d.userData.i / 6) % 1, ang = d.userData.j * 2.09, r = d.userData.j === 0 ? 0 : 0.55 * k;
    const h = d.userData.j === 0 ? 0.55 * Math.sin(k * Math.PI) : 0.45 * Math.sin(k * Math.PI);
    d.position.set(Math.cos(ang) * r, 1.3 + h, Math.sin(ang) * r);
  });
  g.userData.animate(0); return g;
}
function rabbit() {
  const g = new THREE.Group(); foundation(g);
  const ped = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.7), M('#b5bbaa')); ped.position.y = 0.4; g.add(ped);
  const body = mesh(new THREE.SphereGeometry(0.42, 14, 10), PALE); body.scale.set(1, 0.95, 0.85); body.position.y = 0.95; g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.3, 14, 10), PALE); head.position.y = 1.48; g.add(head);
  [-1, 1].forEach((sd) => {
    const ear = mesh(new THREE.SphereGeometry(0.1, 10, 8), PALE); ear.scale.set(1, 3.2, 0.6); ear.position.set(sd * 0.12, 1.92, 0); ear.rotation.z = -sd * 0.15; g.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.03, 6, 4), M('#738b7b'), false); eye.position.set(sd * 0.1, 1.52, 0.27); g.add(eye);
    const f = mesh(new THREE.IcosahedronGeometry(0.09, 0), FLOWER); f.position.set(sd * 0.6, 0.66, 0.25); g.add(f);
  });
  return g;
}
function birdbath() {
  const g = new THREE.Group(); foundation(g);
  const ped = mesh(new THREE.CylinderGeometry(0.16, 0.32, 0.85, 10), M('#c4c6b3')); ped.position.y = 0.62; g.add(ped);
  const bowl = mesh(new THREE.CylinderGeometry(0.78, 0.25, 0.24, 18), M('#dbe0cb')); bowl.position.y = 1.15; g.add(bowl);
  const w = mesh(new THREE.CircleGeometry(0.68, 18), WATER, false); w.rotation.x = -Math.PI / 2; w.position.y = 1.28; g.add(w);
  const birds = [['#a5cbd6', -0.45], ['#e8cc9c', 0.45]].map(([col, x]) => {
    const b = new THREE.Group(); b.position.set(x, 1.33, 0.1);
    const body = mesh(new THREE.SphereGeometry(0.13, 8, 6), M(col)); body.scale.set(1.3, 1, 1); b.add(body);
    const head = mesh(new THREE.SphereGeometry(0.085, 8, 6), M(col)); head.position.set(x < 0 ? 0.12 : -0.12, 0.12, 0); b.add(head);
    const beak = mesh(new THREE.ConeGeometry(0.03, 0.08, 4), M('#e4bb77')); beak.rotation.z = x < 0 ? -Math.PI / 2 : Math.PI / 2; beak.position.set(x < 0 ? 0.22 : -0.22, 0.12, 0); b.add(beak);
    g.add(b); return b;
  });
  g.userData.animate = (t) => birds.forEach((b, i) => { b.position.y = 1.33 + Math.max(0, Math.sin(t * 3 + i * 2)) * 0.12; });
  return g;
}
function arch() {
  const g = new THREE.Group(); foundation(g);
  const wood = M('#c3ad8c'), R = 1.05, H = 1.0;
  [-1, 1].forEach((sd) => { const p = mesh(new THREE.CylinderGeometry(0.07, 0.08, H, 8), wood); p.position.set(sd * R, 0.22 + H / 2, 0); g.add(p); });
  const pts = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * i / 24; pts.push(new THREE.Vector3(Math.cos(a) * R, 0.22 + H + Math.sin(a) * R, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(curve, 32, 0.07, 6), wood));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p, i) => new THREE.Vector3(p.x, p.y + Math.sin(i) * 0.04, 0.07))), 32, 0.035, 5), LEAF));
  const flowers = [];
  for (let i = 0; i < 9; i++) { const p = curve.getPoint(0.06 + i * 0.11), f = mesh(new THREE.IcosahedronGeometry(0.09, 0), FLOWER); f.position.set(p.x, p.y, 0.12); g.add(f); flowers.push(f); }
  g.userData.animate = (t) => flowers.forEach((f, i) => { f.rotation.y = Math.sin(t * 1.2 + i) * 0.4; });
  return g;
}
function windmill() {
  const g = new THREE.Group(); foundation(g);
  const tower = mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.7, 6), M('#e1d3ae')); tower.position.y = 1.07; g.add(tower);
  const roof = mesh(new THREE.ConeGeometry(0.62, 0.55, 6), M('#d2aa98')); roof.position.y = 2.2; g.add(roof);
  const door = mesh(new THREE.BoxGeometry(0.24, 0.36, 0.05), M('#b69c7e')); door.position.set(0, 0.4, 0.5); g.add(door);
  const blades = new THREE.Group(); blades.position.set(0, 1.75, 0.62); g.add(blades);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.BoxGeometry(0.16, 1.1, 0.03), M('#f1e3bf')); b.position.y = 0.55; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); blades.add(arm); }
  blades.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), M('#c4a482')));
  g.userData.animate = (t) => { blades.rotation.z = t * 0.8; };
  return g;
}

const MAKERS = { fountain, rabbit, birdbath, arch, windmill };
export const FIXTURE_IDS = Object.keys(MAKERS);
export function createFixture(id) { return MAKERS[id] ? MAKERS[id]() : null; }
export function disposeFixture(g) { g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
