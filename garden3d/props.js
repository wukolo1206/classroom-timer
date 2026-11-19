// garden3d/props.js
// 3D props for partner activities (same ids as garden/life.js). Unknown ids (phase-3 discoveries) -> null.
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';

const M = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, flatShading: true }, extra));
const mats = { pot: M('#c9825a'), stem: M('#6f9d55'), wood: M('#b07a4f'), teal: M('#6fb3b8', { roughness: 0.5 }), page: M('#fbf6e6'), cover: M('#7d9bd1'), water: M('#a8dcef', { transparent: true, opacity: 0.85 }), wing: M('#f6c0d4', { side: THREE.DoubleSide }) };
const petal = ['#fff3d6', '#f7c2a8', '#cbb8ec'].map((c) => M(c));
let blanketTex = null;
function blanketMaterial() {
  if (!blanketTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#f4efe0' : '#e98a7a'; g.fillRect(x * 8, y * 8, 8, 8); }
    blanketTex = new THREE.CanvasTexture(c); blanketTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: blanketTex, roughness: 1 });
}
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

function flowers() {
  const g = new THREE.Group(); g.position.set(0.62, 0, 0.28);
  const pot = mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.18, 8), mats.pot); pot.position.y = 0.09; g.add(pot);
  const heads = [];
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), mats.stem); s.position.set((i - 1) * 0.06, 0.29, 0); g.add(s);
    const h = mesh(new THREE.IcosahedronGeometry(0.06, 0), petal[i]); h.position.set((i - 1) * 0.06, 0.41, 0); g.add(h); heads.push(h);
  }
  g.userData.animate = (t) => heads.forEach((h, i) => { h.position.x = (i - 1) * 0.06 + Math.sin(t * 1.6 + i) * 0.015; });
  return g;
}
function picnic() {
  const g = new THREE.Group();
  const blanket = mesh(new THREE.PlaneGeometry(1.15, 0.85), blanketMaterial(), false); blanket.rotation.x = -Math.PI / 2; blanket.position.set(0.05, 0.012, 0.18); g.add(blanket);
  const basket = mesh(new THREE.BoxGeometry(0.24, 0.14, 0.17), mats.wood); basket.position.set(0.5, 0.08, 0.32); g.add(basket);
  const handle = mesh(new THREE.TorusGeometry(0.09, 0.012, 4, 10, Math.PI), mats.wood); handle.position.set(0.5, 0.15, 0.32); g.add(handle);
  return g;
}
function watering() {
  const g = new THREE.Group(), can = new THREE.Group(); can.position.set(0.62, 0.5, 0.18); g.add(can);
  can.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.18, 10), mats.teal));
  const spout = mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.22, 6), mats.teal); spout.position.set(0.13, 0.04, 0); spout.rotation.z = -1.0; can.add(spout);
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.014, 4, 10, Math.PI), mats.teal); handle.position.set(-0.08, 0.06, 0); handle.rotation.z = Math.PI / 2; can.add(handle);
  const drops = [0, 1, 2].map(() => { const d = mesh(new THREE.SphereGeometry(0.022, 5, 4), mats.water, false); g.add(d); return d; });
  g.userData.animate = (t) => {
    const pour = Math.max(0, Math.sin(t * 1.8));
    can.rotation.z = -0.25 - pour * 0.45;
    drops.forEach((d, i) => { const k = (t * 1.4 + i / 3) % 1; d.visible = pour > 0.3; d.position.set(0.86 + k * 0.04, 0.5 - k * 0.45, 0.18); });
  };
  return g;
}
function butterfly() {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const wg = new THREE.CircleGeometry(0.1, 8); wg.translate(0.09, 0, 0);
  const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(new THREE.Mesh(wg, mats.wing)); const r = new THREE.Mesh(wg, mats.wing); r.rotation.y = Math.PI; rp.add(r); b.add(lp, rp);
  g.userData.animate = (t) => {
    b.position.set(Math.cos(t * 1.5) * 0.55, 1.5 + Math.sin(t * 3) * 0.08, Math.sin(t * 1.5) * 0.35);
    b.rotation.y = -t * 1.5; const f = Math.sin(t * 16) * 0.9; lp.rotation.y = f; rp.rotation.y = Math.PI - f;
  };
  g.userData.animate(0);
  return g;
}
function reading() {
  const g = new THREE.Group(), book = new THREE.Group(); book.position.set(0, 0.42, 0.34); book.rotation.x = -0.5; g.add(book);
  const left = new THREE.Group(), right = new THREE.Group(); book.add(left, right);
  [left, right].forEach((side, i) => {
    const cover = mesh(new THREE.BoxGeometry(0.2, 0.26, 0.012), mats.cover); cover.position.x = (i ? 1 : -1) * 0.1; side.add(cover);
    const page = mesh(new THREE.BoxGeometry(0.18, 0.24, 0.012), mats.page); page.position.set((i ? 1 : -1) * 0.1, 0, 0.012); side.add(page);
  });
  left.rotation.y = 0.35; right.rotation.y = -0.35;
  g.userData.animate = (t) => { right.rotation.y = -0.35 - Math.max(0, Math.sin(t * 0.7)) * 0.12; };
  return g;
}

const PAL = [['#deaa72', '#92b5bd', '#a3ba83'], ['#d8a3ad', '#b5a4c7', '#9cb9b2'], ['#b7c58d', '#e2b783', '#99b8cd']]; // = garden/activities.js palettes
const pal = (v) => PAL[Math.max(0, Math.min(2, Math.floor(v) || 0))];
function ball(color, r, line) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(r, 1), M(color)));
  if (line) [0, Math.PI / 2].forEach((a) => { const t = mesh(new THREE.TorusGeometry(r * 1.01, r * 0.07, 4, 16), M(line), false); t.rotation.y = a; g.add(t); });
  return g;
}
function racket(color) {
  const g = new THREE.Group();
  const head = mesh(new THREE.TorusGeometry(0.11, 0.016, 5, 16), M(color)); head.position.y = 0.24; g.add(head);
  const net = mesh(new THREE.CircleGeometry(0.1, 12), M('#f4f1e6', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }), false); net.position.y = 0.24; g.add(net);
  const handle = mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.24, 5), M('#8a6a4a')); handle.position.y = 0.02; g.add(handle);
  return g;
}
function soil(g) { const s = mesh(new THREE.CircleGeometry(0.26, 10), M('#8a6a4a'), false); s.rotation.x = -Math.PI / 2; s.position.set(0.55, 0.014, 0.36); g.add(s); }
function basketball() {
  const g = new THREE.Group(), b = ball('#e8894a', 0.13, '#5a3a2a'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.14 + Math.abs(Math.sin(t * 3)) * 0.45, 0.3); b.rotation.x = t * 2; };
  g.userData.animate(0); return g;
}
function soccer() {
  const g = new THREE.Group(), b = ball('#f6f4ec', 0.13, '#3c3c3c'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.5 + Math.sin(t * 1.5) * 0.15, 0.14, 0.42); b.rotation.z = -Math.sin(t * 1.5) * 1.2; };
  g.userData.animate(0); return g;
}
function volleyball(v) {
  const g = new THREE.Group(), b = ball('#f7f1d8', 0.13, pal(v)[1]); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.15, 1.65 + Math.abs(Math.sin(t * 2)) * 0.5, 0.35); b.rotation.y = t; };
  g.userData.animate(0); return g;
}
function tennis(v) {
  const g = new THREE.Group(), r = racket(pal(v)[0]); r.position.set(0.58, 0.3, 0.3); r.rotation.x = -1.1; g.add(r);
  const b = ball('#d6e65a', 0.06); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.48 + Math.abs(Math.sin(t * 4)) * 0.3, 0.42); };
  g.userData.animate(0); return g;
}
function baseball() {
  const g = new THREE.Group(), glove = mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#a0683f')); glove.position.set(0.58, 0.45, 0.3); glove.rotation.x = Math.PI; g.add(glove);
  const b = ball('#f6f4ec', 0.06, '#c8473d'); g.add(b);
  g.userData.animate = (t) => { b.position.set(0.58, 0.52 + Math.abs(Math.sin(t * 2.5)) * 0.4, 0.3); };
  g.userData.animate(0); return g;
}
function badminton(v) {
  const g = new THREE.Group(), r = racket(pal(v)[2]); r.position.set(0.58, 0.3, 0.3); r.rotation.x = -1.1; g.add(r);
  const sh = new THREE.Group(), skirt = mesh(new THREE.ConeGeometry(0.06, 0.1, 8, 1, true), M('#fbfaf2', { side: THREE.DoubleSide }));
  skirt.position.y = 0.05; const cork = mesh(new THREE.SphereGeometry(0.03, 6, 4), M('#e7d3b0')); sh.add(skirt, cork); g.add(sh);
  g.userData.animate = (t) => { const k = Math.abs(Math.sin(t * 2.2)); sh.position.set(0.58, 0.5 + k * 0.45, 0.42); sh.rotation.z = (1 - k) * 0.3; };
  g.userData.animate(0); return g;
}
function sowing(v) {
  const g = new THREE.Group(); soil(g);
  const bag = mesh(new THREE.SphereGeometry(0.1, 8, 6), M(pal(v)[0])); bag.scale.set(1, 1.2, 0.8); bag.position.set(0.55, 0.62, 0.28); g.add(bag);
  const seeds = [0, 1, 2, 3].map(() => { const s = mesh(new THREE.SphereGeometry(0.018, 4, 3), M('#6b4a2f'), false); g.add(s); return s; });
  g.userData.animate = (t) => seeds.forEach((s, i) => { const k = (t * 0.9 + i / 4) % 1; s.position.set(0.55 + (i - 1.5) * 0.04, 0.55 - k * 0.53, 0.33); });
  g.userData.animate(0); return g;
}
function planting(v) {
  const g = new THREE.Group(); soil(g);
  const sprout = new THREE.Group(); sprout.position.set(0.55, 0.014, 0.36); g.add(sprout);
  const stem = mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.2, 4), mats.stem); stem.position.y = 0.1; sprout.add(stem);
  [-1, 1].forEach((sd) => { const l = mesh(new THREE.SphereGeometry(0.05, 5, 3), M('#8dbb6a')); l.scale.set(1.5, 0.45, 0.8); l.position.set(sd * 0.05, 0.17, 0); l.rotation.z = sd * 0.5; sprout.add(l); });
  const trowel = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.12), M(pal(v)[1])); trowel.position.set(0.3, 0.3, 0.35); trowel.rotation.x = 0.6; g.add(trowel);
  g.userData.animate = (t) => { const k = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.6)); sprout.scale.setScalar(k); trowel.position.y = 0.3 + Math.sin(t * 2) * 0.05; };
  g.userData.animate(0); return g;
}

const MAKERS = { flowers, picnic, watering, butterfly, reading, basketball, soccer, volleyball, tennis, baseball, badminton, sowing, planting };
export const PROP_IDS = Object.keys(MAKERS);
export function createProp(activity, variant) { return MAKERS[activity] ? MAKERS[activity](variant || 0) : null; }
// Geometries are per prop. Shared module materials (mats / petal) are kept; per-prop ones are disposed.
const SHARED = new Set([...Object.values(mats), ...petal]);
export function disposeProp(g) {
  g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!SHARED.has(o.material)) o.material.dispose(); } });
}
