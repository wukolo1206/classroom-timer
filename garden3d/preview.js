// 3D garden prototype (stage "池塘映光") — standalone, does not touch the production garden.
// Low-poly scene is built from code (no external models); avatars become billboard standees.
import * as THREE from '../vendor/three/three.module.min.js';

const $ = (id) => document.getElementById(id);
const A = window.c408PointAvatars;
const canvas = $('g3-canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = gradientTexture(['#b9dde4', '#d6ebe3', '#eef3df']);
scene.fog = new THREE.Fog('#dcecdf', 24, 62);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight('#fffbea', '#8fae6c', 1.05));
const sunLight = new THREE.DirectionalLight('#fff1d2', 2.2);
sunLight.position.set(9, 15, 7);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight);

// ---------- helpers ----------
const mats = {};
function mat(color, extra) {
  const key = color + JSON.stringify(extra || {});
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.92 }, extra));
  return mats[key];
}
function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function gradientTexture(stops) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach((s, i) => grad.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let seed = 408;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

// ---------- terrain ----------
const POND = { x: 4.4, z: 0.6, rx: 3.4, rz: 2.2 };
function pondE(x, z) { return ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2; }
function groundY(x, z) {
  const r = Math.hypot(x, z), k = Math.min(1, Math.max(0, (r - 7) / 12));
  let h = (0.16 * Math.sin(x * 0.45) * Math.cos(z * 0.38) + 0.08 * Math.sin(x * 1.1 + z * 0.7)) * (0.35 + 0.65 * k) + k * k * 1.6;
  const e = pondE(x, z);
  if (e < 1.25) h = h * Math.max(0, (e - 1) / 0.25) - 0.28 * Math.min(1, (1.25 - e) / 0.35);
  return h;
}
{
  const geo = new THREE.PlaneGeometry(90, 90, 70, 70); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [], a = new THREE.Color('#b3d07c'), b = new THREE.Color('#98bb68'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundY(x, z));
  }
  const flat = geo.toNonIndexed(); const fp = flat.attributes.position;
  for (let i = 0; i < fp.count; i += 3) {
    c.copy(a).lerp(b, rand() * 0.8);
    if (pondE(fp.getX(i), fp.getZ(i)) < 1.15) c.set('#b6c58e');
    for (let j = 0; j < 3; j++) colors.push(c.r, c.g, c.b);
  }
  flat.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  scene.add(mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), { cast: false }));
}
// distant hills
[[-22, -34, 16, 5, 9, '#a6c38b'], [2, -40, 22, 7, 10, '#b3cd97'], [26, -32, 15, 6, 8, '#9dbb84'], [-38, -18, 12, 4, 9, '#b6cf9a'], [38, -14, 13, 5, 9, '#adc891']]
  .forEach(([x, z, sx, sy, sz, col]) => { const h = mesh(new THREE.IcosahedronGeometry(1, 2), mat(col), { cast: false }); h.scale.set(sx, sy, sz); h.position.set(x, -1, z); scene.add(h); });

// ---------- pond ----------
const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#8fcbd6', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.93 }));
water.rotation.x = -Math.PI / 2; water.scale.set(POND.rx * 1.02, POND.rz * 1.02, 1); water.position.set(POND.x, -0.02, POND.z); water.receiveShadow = true;
scene.add(water);
for (let i = 0; i < 30; i++) {
  const t = (i / 30) * Math.PI * 2 + rand() * 0.1, rr = 1.06 + rand() * 0.06;
  const x = POND.x + Math.cos(t) * POND.rx * rr, z = POND.z + Math.sin(t) * POND.rz * rr;
  const s = mesh(new THREE.DodecahedronGeometry(0.16 + rand() * 0.16, 0), mat(rand() > 0.5 ? '#cfc8b4' : '#bdb6a1'));
  s.position.set(x, groundY(x, z) + 0.04, z); s.rotation.set(rand() * 3, rand() * 3, 0); s.scale.y = 0.7; scene.add(s);
}
const sparkles = [];
for (let i = 0; i < 9; i++) {
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
  sp.rotation.x = -Math.PI / 2; sp.userData.phase = rand() * 6;
  const t = rand() * 6.28, r = Math.sqrt(rand()) * 0.75;
  sp.position.set(POND.x + Math.cos(t) * POND.rx * r, 0.0, POND.z + Math.sin(t) * POND.rz * r); scene.add(sp); sparkles.push(sp);
}
function lily(x, z, flower) {
  const pad = mesh(new THREE.CircleGeometry(0.34, 12, 0.4, Math.PI * 2 - 0.5), mat('#7fae69'), { cast: false });
  pad.rotation.x = -Math.PI / 2; pad.rotation.z = rand() * 6; pad.position.set(x, 0.0, z); scene.add(pad);
  if (!flower) return;
  const g = new THREE.Group(); g.position.set(x, 0.02, z);
  for (let i = 0; i < 7; i++) { const p = mesh(new THREE.ConeGeometry(0.07, 0.26, 4), mat('#f4a9c0')); p.position.set(Math.cos(i * 0.9) * 0.07, 0.1, Math.sin(i * 0.9) * 0.07); p.rotation.set(Math.sin(i * 0.9) * 0.6, 0, -Math.cos(i * 0.9) * 0.6); g.add(p); }
  const c = mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#ffd56b')); c.position.y = 0.1; g.add(c); scene.add(g);
}
lily(5.8, 1.2, true); lily(6.4, 0.3, false); lily(2.9, 1.5, false); lily(3.4, -0.6, true); lily(5.4, -0.9, false);

// ---------- bridge (arched, across the pond) ----------
{
  const wood = mat('#c38e5f'), dark = mat('#9a6a45');
  const x = POND.x - 0.4, z0 = POND.z - POND.rz - 0.7, z1 = POND.z + POND.rz + 0.7, n = 15;
  const arc = (t) => new THREE.Vector3(x, 0.12 + Math.sin(t * Math.PI) * 0.75, z0 + (z1 - z0) * t);
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = arc(t), q = arc(Math.min(1, t + 0.01)), r = arc(Math.max(0, t - 0.01));
    const plank = mesh(new THREE.BoxGeometry(1.25, 0.07, (z1 - z0) / n * 0.86), wood);
    plank.position.copy(p); plank.rotation.x = -Math.atan2(q.y - r.y, q.z - r.z); scene.add(plank);
  }
  [-0.6, 0.6].forEach((dx) => {
    const pts = []; for (let i = 0; i <= 20; i++) { const p = arc(i / 20); pts.push(new THREE.Vector3(p.x + dx, p.y + 0.5, p.z)); }
    scene.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.04, 5), dark));
    for (let i = 0; i <= 6; i++) { const p = arc(i / 6), post = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.56, 6), dark); post.position.set(p.x + dx, p.y + 0.25, p.z); scene.add(post); }
  });
}

// ---------- trees, bushes, flowers, path ----------
const leafCols = ['#8fb36b', '#9cc077', '#7fa862', '#a9c97f', '#93b872'];
const swayers = [];
function tree(x, z, s, kind) {
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z); g.scale.setScalar(s);
  const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 6), mat('#a57d5a')); trunk.position.y = 0.65; g.add(trunk);
  const crown = new THREE.Group(); crown.position.y = 1.3; g.add(crown);
  if (kind === 'pine') {
    [[1.0, 1.5, 0.4], [0.75, 1.2, 1.1], [0.5, 0.9, 1.7]].forEach(([r, h, y]) => { const c = mesh(new THREE.ConeGeometry(r, h, 7), mat('#7da463')); c.position.y = y; crown.add(c); });
  } else {
    [[0, 0.55, 0, 0.95], [0.55, 0.35, 0.2, 0.68], [-0.5, 0.4, -0.1, 0.72], [0.05, 1.05, 0.05, 0.62]].forEach(([dx, dy, dz, r]) => {
      const f = mesh(new THREE.IcosahedronGeometry(r, 1), mat(leafCols[Math.floor(rand() * leafCols.length)])); f.position.set(dx, dy, dz); crown.add(f);
    });
  }
  crown.userData.phase = rand() * 6; swayers.push(crown); scene.add(g);
}
[[-9, -5, 1.25], [-6, -9, 1.4, 'pine'], [-1.8, -11, 1.5], [3.5, -10.5, 1.3, 'pine'], [8.5, -8, 1.45], [12, -3.5, 1.2], [-12.5, -1, 1.35, 'pine'], [13, 3, 1.25], [-11, 5, 1.2], [-4.5, -7.5, 1.0], [10.5, -12, 1.6, 'pine'], [-15, -8, 1.6]]
  .forEach(([x, z, s, k]) => tree(x, z, s, k));
function bush(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.42 * s, 1), mat(leafCols[(i + 1) % 5])); b.position.set((i - 1) * 0.38 * s, 0.25 * s, (rand() - 0.5) * 0.3); b.scale.y = 0.78; g.add(b); }
  scene.add(g);
}
[[-6.5, 0.5, 1.1], [-5, -3, 0.9], [8.6, 2.6, 1], [0.6, -3.4, 0.9], [8.4, -2.2, 0.8], [-7.6, 3.6, 0.8]].forEach(([x, z, s]) => bush(x, z, s));
{
  const N = 260, head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.085, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), N);
  const stem = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat('#7aa45e'), N);
  const cols = ['#f4a9c0', '#ffd56b', '#ffffff', '#c9b7f2', '#f7b787'].map((c) => new THREE.Color(c)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  const beds = [[-4.2, 2.4, 2.4], [-1.5, -1.6, 1.8], [8.2, 4.4, 1.6], [-8.5, -2.5, 2.2], [1.2, 7.2, 3.2]];
  let i = 0;
  while (i < N) {
    const bd = beds[i % beds.length], t = rand() * 6.28, r = Math.sqrt(rand()) * bd[2], x = bd[0] + Math.cos(t) * r, z = bd[1] + Math.sin(t) * r;
    if (pondE(x, z) < 1.4) { rand(); continue; }
    const y = groundY(x, z);
    m.compose(new THREE.Vector3(x, y + 0.22, z), q, sc); head.setMatrixAt(i, m); head.setColorAt(i, cols[Math.floor(rand() * cols.length)]);
    m.compose(new THREE.Vector3(x, y + 0.1, z), q, sc); stem.setMatrixAt(i, m); i++;
  }
  head.castShadow = stem.castShadow = true; scene.add(head, stem);
}
[[0.2, 8.6], [0.6, 7.3], [0.3, 6.0], [-0.3, 4.8], [-0.1, 3.5], [0.5, 2.3], [1.2, 1.2]].forEach(([x, z], i) => {
  const s = mesh(new THREE.CylinderGeometry(0.42 - i * 0.02, 0.46 - i * 0.02, 0.07, 9), mat('#efe2bf'), { cast: false }); s.position.set(x, groundY(x, z) + 0.03, z); s.rotation.y = rand(); scene.add(s);
});

// ---------- sky: sun + clouds ----------
{
  const sun = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 12), new THREE.MeshBasicMaterial({ color: '#ffd977', fog: false }));
  sun.position.set(18, 16, -40); scene.add(sun);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,190,.9)'); grad.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false })); halo.scale.setScalar(13); halo.position.copy(sun.position); scene.add(halo);
}
const clouds = [];
[[-14, 12, -30], [6, 14, -36], [22, 11, -26], [-28, 13, -38]].forEach(([x, y, z]) => {
  const g = new THREE.Group(); g.position.set(x, y, z);
  [[0, 0, 1.6], [1.6, -0.3, 1.2], [-1.6, -0.4, 1.1], [0.6, 0.6, 1.1]].forEach(([dx, dy, r]) => { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45, flatShading: true, fog: false })); p.position.set(dx, dy, 0); p.scale.y = 0.75; g.add(p); });
  scene.add(g); clouds.push(g);
});

// ---------- butterflies ----------
const butterflies = ['#f6c0d4', '#fde58e', '#c9b7f2'].map((col, i) => {
  const g = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 });
  const wg = new THREE.CircleGeometry(0.16, 8); wg.translate(0.15, 0, 0);
  const l = new THREE.Mesh(wg, wm), r = new THREE.Mesh(wg, wm); r.rotation.y = Math.PI;
  const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r); g.add(lp, rp);
  g.userData = { lp, rp, phase: i * 2.1, cx: [-4.2, 7.8, -1.5][i], cz: [2.4, 4.2, -1.6][i] };
  scene.add(g); return g;
});

// ---------- avatar standees ----------
// Hand-picked, staggered so a front standee never hides one directly behind it (camera looks from +z).
const slots = [[-1.6, 3.4], [2.0, 4.6], [-3.6, 2.2], [-0.6, 0.8], [-2.6, 5.2], [-5.4, 3.8], [0.6, -1.8], [-2.4, -0.8], [2.8, 6.6], [-4.6, 0.2], [-1.2, 6.6], [-6.2, 1.6]];
const DEMO = [13, 24, 14, 25, 3, 30, 8, 33, 18, 27, 21, 36];
const standees = [];
let nextSeat = 1;

function avatarImageUrl(i) {
  const snack = window.c408SnackAvatars;
  if (i >= 24 && snack && snack.images[i - 24]) return snack.images[i - 24];
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(A.svg(i));
}
// Texture whose transparent pixels carry the nearest edge colour (canvas can't keep colour under alpha 0),
// so sampling at the puffy rim never picks up black fringes. Rows flipped to match CanvasTexture UVs.
function bledTexture(im) {
  const W = im.width, d = new Uint8ClampedArray(im.data), known = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) known[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < 8; pass++) {
    const add = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      if (x > 0 && known[i - 1]) { r += d[i * 4 - 4]; g += d[i * 4 - 3]; b += d[i * 4 - 2]; n++; }
      if (x < W - 1 && known[i + 1]) { r += d[i * 4 + 4]; g += d[i * 4 + 5]; b += d[i * 4 + 6]; n++; }
      if (y > 0 && known[i - W]) { const q = (i - W) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; n++; }
      if (y < W - 1 && known[i + W]) { const q = (i + W) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; n++; }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    for (let a = 0; a < add.length; a += 4) { const i = add[a]; d[i * 4] = add[a + 1]; d[i * 4 + 1] = add[a + 2]; d[i * 4 + 2] = add[a + 3]; known[i] = 1; }
  }
  const flipped = new Uint8Array(d.length);
  for (let y = 0; y < W; y++) flipped.set(d.subarray((W - 1 - y) * W * 4, (W - y) * W * 4), y * W * 4);
  for (let k = 3; k < flipped.length; k += 4) flipped[k] = 255;
  const t = new THREE.DataTexture(flipped, W, W, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
function loadAvatarTexture(i) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, 256, 256);
      const t = bledTexture(cx.getImageData(0, 0, 256, 256)); t.userData.canvas = c; resolve(t);
    };
    img.onerror = () => reject(new Error('頭貼 ' + i + ' 載入失敗'));
    img.src = avatarImageUrl(i);
  });
}
function labelTexture(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 44; const g = c.getContext('2d');
  g.fillStyle = '#fffbea'; g.beginPath(); g.roundRect(2, 2, 124, 40, 20); g.fill();
  g.fillStyle = '#2f4a35'; g.font = 'bold 26px "Noto Sans TC","Microsoft JhengHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Puffy figure: grow thickness from the avatar silhouette (distance to the edge -> rounded rim + soft dome).
const PUFF_N = 88, PUFF_SIZE = 1.55, puffyCache = {};
function buildPuffy(canvas) {
  const N = PUFF_N, px = canvas.getContext('2d').getImageData(0, 0, 256, 256).data, step = 256 / N;
  const inside = new Uint8Array(N * N), dist = new Float32Array(N * N);
  let r = 0, g = 0, b = 0, n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = Math.floor((i + 0.5) * step), y = Math.floor((j + 0.5) * step), k = (y * 256 + x) * 4;
    if (px[k + 3] > 110) { inside[j * N + i] = 1; r += px[k]; g += px[k + 1]; b += px[k + 2]; n++; }
  }
  // two-pass chamfer distance to the nearest outside cell
  const BIG = 1e6, at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : dist[j * N + i];
  for (let k = 0; k < N * N; k++) dist[k] = inside[k] ? BIG : 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; if (!dist[k]) continue; dist[k] = Math.min(dist[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; if (!dist[k]) continue; dist[k] = Math.min(dist[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
  let dmax = 1; for (let k = 0; k < N * N; k++) dmax = Math.max(dmax, dist[k]);
  const V = N + 1, T = 0.14, RIM = 9, pos = [], uv = [], idx = [];
  const cellIn = (i, j) => i >= 0 && j >= 0 && i < N && j < N && inside[j * N + i];
  for (let side = 0; side < 2; side++) for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const c = [cellIn(i - 1, j - 1), cellIn(i, j - 1), cellIn(i - 1, j), cellIn(i, j)], all = c.every(Boolean);
    let h = 0;
    if (all) { const d = (at(i - 1, j - 1) + at(i, j - 1) + at(i - 1, j) + at(i, j)) / 4, e = Math.min(d, RIM) / RIM; h = T * (Math.sqrt(1 - (1 - e) ** 2) + 0.45 * d / dmax); }
    pos.push((i / N - 0.5) * PUFF_SIZE, (1 - j / N) * PUFF_SIZE, side ? -h * 0.6 : h);
    uv.push(i / N, 1 - j / N);
  }
  const off = V * V;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!inside[j * N + i]) continue;
    const a = j * V + i, bb = a + 1, c = a + V, d = c + 1;
    idx.push(a, c, bb, bb, c, d);
  }
  const front = idx.length;
  // round off the staircase silhouette: move rim vertices (h = 0) toward the mean of neighbouring rim vertices
  const nb = new Map(), link = (u, v) => { if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
  for (let k = 0; k < front; k += 3) for (let e = 0; e < 3; e++) { const u = idx[k + e], v = idx[k + (e + 1) % 3]; link(u, v); link(v, u); }
  const rim = [...nb.keys()].filter((u) => pos[u * 3 + 2] === 0), isRim = new Set(rim);
  for (let it = 0; it < 3; it++) {
    const next = rim.map((u) => { let sx = 0, sy = 0, c = 0; nb.get(u).forEach((v) => { if (isRim.has(v)) { sx += pos[v * 3]; sy += pos[v * 3 + 1]; c++; } }); return c ? [(pos[u * 3] + sx / c) / 2, (pos[u * 3 + 1] + sy / c) / 2] : [pos[u * 3], pos[u * 3 + 1]]; });
    rim.forEach((u, q) => { pos[u * 3] = pos[(u + off) * 3] = next[q][0]; pos[u * 3 + 1] = pos[(u + off) * 3 + 1] = next[q][1]; });
  }
  for (const u of rim) { uv[u * 2] = uv[(u + off) * 2] = pos[u * 3] / PUFF_SIZE + 0.5; uv[u * 2 + 1] = uv[(u + off) * 2 + 1] = pos[u * 3 + 1] / PUFF_SIZE; }
  for (let k = 0; k < front; k += 3) idx.push(idx[k] + off, idx[k + 2] + off, idx[k + 1] + off);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.addGroup(0, front, 0); geo.addGroup(front, front, 1);
  geo.computeVertexNormals();
  const back = new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear().multiplyScalar(0.82);
  return { geo, back };
}
async function puffyFor(avatar) {
  if (!puffyCache[avatar]) puffyCache[avatar] = loadAvatarTexture(avatar).then((map) => {
    const { geo, back } = buildPuffy(map.userData.canvas);
    return { geo, mats: [new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.18 }), new THREE.MeshStandardMaterial({ color: back, roughness: 0.6 })] };
  });
  return puffyCache[avatar];
}
async function addStandee() {
  if (standees.length >= slots.length) return;
  const seat = nextSeat++, avatar = DEMO[(seat - 1) % DEMO.length], [x, z] = slots[standees.length];
  const fig = await puffyFor(avatar);
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
  const base = mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.09, 24), mat('#eadcc0', { flatShading: false, roughness: 0.6 })); base.position.y = 0.04; g.add(base);
  const body = new THREE.Group(); body.position.y = 0.08; g.add(body);
  const figure = mesh(fig.geo, fig.mats); figure.position.y = -0.02; body.add(figure);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.23), new THREE.MeshBasicMaterial({ map: labelTexture(String(seat).padStart(2, '0') + '號'), transparent: true }));
  label.position.set(0, 0.16, 0.56); label.rotation.x = -0.35; g.add(label);
  // face the audience (camera home position), not the moving camera, so orbit/drag reveals the thickness
  g.rotation.y = Math.atan2(target.x - x, target.z + 13 - z);
  g.userData = { body, motion: ['sway', 'hop', 'turn', 'float'][seat % 4], born: clock, phase: seat * 0.7, name: A.labels[avatar] };
  g.scale.setScalar(0.001); scene.add(g); standees.push(g);
  puff(x, g.position.y, z);
  $('g3-banner').textContent = String(seat).padStart(2, '0') + '號 ' + A.labels[avatar] + ' 來到花園了！';
}
const puffs = [];
function puff(x, y, z) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.06, z); ring.userData.born = clock; scene.add(ring); puffs.push(ring);
}

// ---------- camera, input, loop ----------
let clock = 0, paused = false, orbit = !reducedMotion, drag = 0, dragX = null, last = performance.now();
const target = new THREE.Vector3(0.9, 0.9, 1.8);
function placeCamera() {
  const aspect = camera.aspect, R = aspect < 0.8 ? 15.5 : aspect < 1.2 ? 14 : 12.5, H = aspect < 1.2 ? 5.4 : 4.4;
  const a = drag + (orbit ? Math.sin(clock * 0.06) * 0.42 : 0);
  camera.position.set(target.x + Math.sin(a) * R, target.y + H, target.z + Math.cos(a) * R);
  camera.lookAt(target);
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 0.8 ? 54 : camera.aspect < 1.2 ? 46 : 38; camera.updateProjectionMatrix();
}
let saver = false;
function applyQuality() {
  renderer.setPixelRatio(saver ? 1 : Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !saver; sunLight.castShadow = !saver;
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  resize();
}
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (dragX === null) return; drag = Math.max(-1.2, Math.min(1.2, drag - (e.clientX - dragX) * 0.005)); dragX = e.clientX; });
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });
addEventListener('resize', resize);

function easeOutBack(t) { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }
const tmp = new THREE.Vector3();
let frames = 0, fpsAt = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) clock += dt;
  const t = clock;
  swayers.forEach((c) => { c.rotation.z = Math.sin(t * 0.8 + c.userData.phase) * 0.035; });
  clouds.forEach((g, i) => { g.position.x += paused ? 0 : dt * (0.25 + i * 0.05); if (g.position.x > 40) g.position.x = -40; });
  sparkles.forEach((s) => { s.material.opacity = 0.15 + 0.55 * Math.max(0, Math.sin(t * 1.3 + s.userData.phase)); });
  butterflies.forEach((b) => {
    const u = b.userData, k = t * 0.45 + u.phase;
    b.position.set(u.cx + Math.sin(k) * 1.6, groundY(u.cx, u.cz) + 0.9 + Math.sin(k * 2.3) * 0.25, u.cz + Math.sin(k * 0.8) * 1.2);
    b.rotation.y = -k; const f = Math.sin(t * 14 + u.phase) * 0.9; u.lp.rotation.y = f; u.rp.rotation.y = Math.PI - f;
  });
  standees.forEach((g) => {
    const u = g.userData, age = t - u.born, k = t * 2 + u.phase;
    g.scale.setScalar(age < 0.7 ? Math.max(0.001, easeOutBack(age / 0.7)) : 1);
    const b = u.body; b.rotation.set(0, 0, 0); b.position.y = 0.08;
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
    $('g3-info').textContent = standees.length + ' 位夥伴 · ' + renderer.info.render.calls + ' 次繪製 · ' + (saver ? '省電' : '高') + '畫質';
    frames = 0; fpsAt = now;
  }
}

$('g3-add').onclick = () => { addStandee().catch((e) => { $('g3-banner').textContent = e.message; }); };
$('g3-pause').onclick = function () {
  paused = !paused; this.setAttribute('aria-pressed', paused); document.body.dataset.paused = paused;
  this.textContent = paused ? '恢復合宜音量' : '模擬超標（暫停）';
  $('g3-banner').textContent = paused ? '音量超標，花園先停一下' : '合宜音量，花園繼續成長';
};
$('g3-orbit').onclick = function () { orbit = !orbit; this.setAttribute('aria-pressed', orbit); };
$('g3-orbit').setAttribute('aria-pressed', orbit);
$('g3-quality').onclick = function () { saver = !saver; this.setAttribute('aria-pressed', saver); applyQuality(); };
$('g3-save').onclick = () => {
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) { $('g3-banner').textContent = '這個瀏覽器無法保存圖片'; return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '3D花園試作.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
};

applyQuality();
renderer.setAnimationLoop(frame);
(async () => { for (let i = 0; i < 5; i++) await addStandee(); $('g3-banner').textContent = '池塘映光 · 5 位夥伴已到'; })()
  .catch((e) => { $('g3-banner').textContent = e.message; });
window.__garden3d = { scene, renderer, standees, addStandee, setDrag: (v) => { drag = v; }, setOrbit: (v) => { orbit = v; }, setPaused: (v) => { if (paused !== v) $('g3-pause').click(); } };
