// 3D garden prototype — all 8 stages + puffy partner figures. Standalone; the production garden is untouched.
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';
import { createWorld, STAGE_NAMES } from './world.js?v=22c4b0b85a';
import { generateSlots, figureScale } from './layout.js?v=24350342a5';
import { puffyFor, labelTexture } from './figures.js?v=84a4a7c24a';
import { createProp, disposeProp } from './props.js?v=d606433c39';

const $ = (id) => document.getElementById(id);
const A = window.c408PointAvatars;
const canvas = $('g3-canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const life = window.GardenLife ? new window.GardenLife.Life() : null; // same activity engine as the real garden
const discoveries = window.GardenDiscoveries ? new window.GardenDiscoveries.Session() : null;
let discovery = null, discoveryCount = 0;
const MAX_PARTNERS = 31, FIG_SCALE = figureScale(MAX_PARTNERS);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const world = createWorld(scene);
const { groundY } = world;
const slots = generateSlots(MAX_PARTNERS);

// ---------- partners ----------
const standees = [];
let nextSeat = 1;
const avatarFor = (seat) => (seat * 7 + 3) % A.count; // spread across both series
const target = new THREE.Vector3(0.2, 1.3, 2.0);
const baseMat = new THREE.MeshStandardMaterial({ color: '#eadcc0', roughness: 0.6 });
const baseGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.09, 24);
const labelGeo = new THREE.PlaneGeometry(0.66, 0.23);
async function addStandee() {
  if (standees.length >= Math.min(MAX_PARTNERS, slots.length)) return false;
  const seat = nextSeat++, avatar = avatarFor(seat), [x, z] = slots[standees.length];
  const fig = await puffyFor(avatar);
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
  const base = new THREE.Mesh(baseGeo, baseMat); base.position.y = 0.04; base.castShadow = base.receiveShadow = true; g.add(base);
  const body = new THREE.Group(); body.position.y = 0.08; g.add(body);
  const figure = new THREE.Mesh(fig.geo, fig.mats); figure.castShadow = figure.receiveShadow = true; figure.position.y = -0.02; body.add(figure);
  const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(String(seat).padStart(2, '0') + '號'), transparent: true }));
  label.position.set(0, 0.16, 0.56); label.rotation.x = -0.35; g.add(label);
  // face the audience (camera home position) so orbit / drag reveals the figure's thickness
  g.rotation.y = Math.atan2(target.x - x, target.z + 13 - z);
  g.userData = { body, motion: ['sway', 'hop', 'turn', 'float'][seat % 4], born: clock, phase: seat * 0.7, seat, slotX: x, slotZ: z, activity: null, prop: null, walking: false, facing: 1 };
  g.scale.setScalar(0.001); scene.add(g); standees.push(g);
  puff(x, g.position.y, z);
  say(String(seat).padStart(2, '0') + '號 ' + A.labels[avatar] + ' 來到花園了！');
  return true;
}
const puffs = [];
function puff(x, y, z) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.06, z); ring.userData.born = clock; scene.add(ring); puffs.push(ring);
}

// ---------- stage UI ----------
const chips = $('g3-stages');
STAGE_NAMES.forEach((name, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = (i + 1) + ' ' + name; b.dataset.stage = i;
  b.onclick = () => { stopAuto(); goStage(i, false); };
  chips.appendChild(b);
});
function goStage(i, instant) {
  world.setStage(i, instant);
  chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.stage) === i));
  $('g3-title').textContent = '3D 花園試作 · ' + (i + 1) + '/8 ' + STAGE_NAMES[i];
  say('解鎖「' + STAGE_NAMES[i] + '」');
}
function say(text) { $('g3-banner').textContent = text; }

// auto play: partners arrive one by one, then the 7 upgrades
let autoTimer = null;
function stopAuto() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } $('g3-auto').setAttribute('aria-pressed', 'false'); }
async function autoStep() {
  autoTimer = null;
  if (paused) { autoTimer = setTimeout(autoStep, 300); return; }
  if (standees.length < Math.min(MAX_PARTNERS, slots.length)) { await addStandee(); autoTimer = setTimeout(autoStep, 450); return; }
  if (world.stage < 7) { goStage(world.stage + 1, false); autoTimer = setTimeout(autoStep, world.stage >= 5 ? 7500 : 5000); return; }
  stopAuto(); say('月光成畫 · 花園完成！');
}

// ---------- camera, input, loop ----------
let clock = 0, paused = false, orbit = !reducedMotion, drag = 0, dragX = null, last = performance.now(), saver = false;
function placeCamera() {
  const aspect = camera.aspect, R = aspect < 0.8 ? 17 : aspect < 1.2 ? 15 : 13.5, H = aspect < 1.2 ? 4.8 : 4.0;
  const a = drag + (orbit ? Math.sin(clock * 0.06) * 0.42 : 0);
  camera.position.set(target.x + Math.sin(a) * R, target.y + H, target.z + Math.cos(a) * R);
  camera.lookAt(target);
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 54 : camera.aspect < 1.2 ? 46 : 38; camera.updateProjectionMatrix();
}
function applyQuality() {
  renderer.setPixelRatio(saver ? 1 : Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !saver;
  scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = !saver; if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  resize();
}
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (dragX === null) return; drag = Math.max(-1.2, Math.min(1.2, drag - (e.clientX - dragX) * 0.005)); dragX = e.clientX; });
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });
addEventListener('resize', resize);

const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
function applyLifeFrame(ms) {
  if (!life || !standees.length) return;
  const states = life.frame(standees.map((g) => ({ seat: g.userData.seat })), ms, { width: 1200, columns: 8, size: 60, rowPitch: 140, height: 600, rows: 4 }, !paused, reducedMotion, discovery);
  states.forEach((s) => {
    const g = standees.find((o) => o.userData.seat === s.seat); if (!g) return; const u = g.userData;
    const x = u.slotX + (s.x / 48) * 0.45 * FIG_SCALE / 0.82, z = u.slotZ + (s.y / 6) * 0.18 * FIG_SCALE / 0.82;
    g.position.set(x, groundY(x, z), z); u.walking = s.activity === 'walking'; u.facing = s.facing;
    if (s.activity !== u.activity || (s.variant || 0) !== u.variant) { u.activity = s.activity; u.variant = s.variant || 0; if (u.prop) { g.remove(u.prop); disposeProp(u.prop); } u.prop = createProp(s.activity, s.variant); if (u.prop) g.add(u.prop); }
    u.presenting = !!s.presenting;
  });
}
let frames = 0, fpsAt = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = paused ? 0 : real;
  clock += dt;
  world.update(dt, renderer);
  applyLifeFrame(dt * 1000);
  standees.forEach((g) => {
    const u = g.userData, age = clock - u.born, k = clock * 2 + u.phase, b = u.body;
    g.scale.setScalar(FIG_SCALE * (u.presenting ? 1.1 : 1) * (age < 0.7 ? Math.max(0.001, easeOutBack(age / 0.7)) : 1));
    b.rotation.set(0, 0, 0); b.position.y = 0.08;
    if (u.prop && u.prop.userData.animate && !reducedMotion) u.prop.userData.animate(clock + u.phase);
    if (u.walking && !reducedMotion) { b.rotation.y = u.facing * 0.6; b.position.y = 0.08 + Math.abs(Math.sin(k * 2.2)) * 0.12; return; }
    if (u.motion === 'sway') b.rotation.z = Math.sin(k) * 0.07;
    else if (u.motion === 'hop') b.position.y = 0.08 + Math.abs(Math.sin(k * 0.9)) * 0.16;
    else if (u.motion === 'turn') b.rotation.y = Math.sin(k * 0.5) * 0.5;
    else b.position.y = 0.12 + Math.sin(k * 0.7) * 0.06;
  });
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i], age = clock - p.userData.born; p.scale.setScalar(1 + age * 3); p.material.opacity = Math.max(0, 0.9 - age * 1.4);
    if (age > 0.7) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); puffs.splice(i, 1); }
  }
  placeCamera();
  renderer.render(scene, camera);
  frames++;
  if (now - fpsAt >= 1000) {
    $('g3-fps').textContent = Math.round(frames * 1000 / (now - fpsAt));
    $('g3-info').textContent = standees.length + ' 位夥伴 · ' + Math.round(renderer.info.render.triangles / 1000) + 'k 三角形 · ' + (saver ? '省電' : '高') + '畫質';
    frames = 0; fpsAt = now;
  }
}

// ---------- buttons ----------
$('g3-add').onclick = () => { addStandee().catch((e) => say(e.message)); };
$('g3-all').onclick = async () => { while (await addStandee()) { /* fill to 31 */ } say('全員 ' + standees.length + ' 位到齊'); };
$('g3-discover').onclick = () => {
  if (!discoveries) return;
  stopAuto(); if (world.stage < 7) goStage(7, true);
  discoveryCount++;
  discovery = discoveries.sync(discoveryCount, standees.map((g) => g.userData.seat));
  world.setTheme(discovery.themeId, reducedMotion);
  say('新發現 ' + discovery.count + '：' + discovery.themeName + ' · ' + discovery.activityName);
};
$('g3-auto').onclick = function () {
  if (autoTimer) { stopAuto(); return; }
  this.setAttribute('aria-pressed', 'true');
  standees.splice(0).forEach((g) => scene.remove(g)); nextSeat = 1; goStage(0, true);
  if (discoveries) { discoveries.reset(); discovery = null; discoveryCount = 0; world.setTheme('bridge', true); } say('自動播放：夥伴陸續入園…');
  autoTimer = setTimeout(autoStep, 600);
};
$('g3-pause').onclick = function () {
  paused = !paused; this.setAttribute('aria-pressed', paused); document.body.dataset.paused = paused;
  this.textContent = paused ? '恢復合宜音量' : '模擬超標（暫停）';
  say(paused ? '音量超標，花園先停一下' : '合宜音量，花園繼續成長');
};
$('g3-fold').onclick = function () { const body = $('g3-body'), open = body.hidden; body.hidden = !open; this.setAttribute('aria-expanded', open); this.textContent = open ? '收合' : '展開'; };
$('g3-orbit').onclick = function () { orbit = !orbit; this.setAttribute('aria-pressed', orbit); };
$('g3-orbit').setAttribute('aria-pressed', orbit);
$('g3-quality').onclick = function () { saver = !saver; this.setAttribute('aria-pressed', saver); applyQuality(); };
$('g3-save').onclick = () => {
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) { say('這個瀏覽器無法保存圖片'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '3D花園_' + STAGE_NAMES[world.stage] + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
};

applyQuality();
goStage(4, true);
renderer.setAnimationLoop(frame);
(async () => { for (let i = 0; i < 8; i++) await addStandee(); say('池塘映光 · 選上方階段，或按「自動播放」看全流程'); })().catch((e) => say(e.message));
window.__garden3d = {
  world, standees, addStandee, goStage, renderer,
  setDrag: (v) => { drag = v; }, setOrbit: (v) => { orbit = v; }, setPaused: (v) => { if (paused !== v) $('g3-pause').click(); },
  lifeTick: (ms) => { for (let t = 0; t < ms; t += 100) applyLifeFrame(100); },
  fastForward: (sec) => { for (let i = 0; i < sec * 20; i++) world.update(0.05, renderer); clock += sec; },
};
