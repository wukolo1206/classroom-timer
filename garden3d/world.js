// 3D garden world: low-poly scene built from code, revealed stage by stage
// (follows docs/design/garden-eight-stages-v0.1.md: one main change per stage, fixed upper limits).
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';
import { POND, BEDS, pondE, groundY } from './layout.js?v=24350342a5';
import { createFixture, disposeFixture, FIXTURE_IDS } from './fixtures3d.js?v=7f8e32f3fd';

export const STAGE_NAMES = ['夥伴入園', '花圃甦醒', '綠意成蔭', '蝴蝶來訪', '池塘映光', '祕密花園', '晚霞時光', '月光成畫'];

// mood 0 = day, 1 = sunset, 2 = night; colours are lerped between the three keys
const MOODS = [
  { skyTop: '#b9dde4', skyMid: '#d6ebe3', skyBot: '#eef3df', fog: '#dcecdf', hemiSky: '#fffbea', hemiGround: '#8fae6c', hemi: 1.05, light: '#fff1d2', lightI: 2.2, lightPos: [9, 15, 7], exposure: 0.92, water: '#8fcbd6', disc: '#ffd977', discPos: [15, 6.5, -40], cloud: '#ffffff', cloudGlow: 0.45 },
  { skyTop: '#a3b3d9', skyMid: '#f2b8a8', skyBot: '#ffd9a2', fog: '#f1cfb2', hemiSky: '#ffd8b4', hemiGround: '#b4a27b', hemi: 1.0, light: '#ffb07a', lightI: 1.9, lightPos: [16, 5, -4], exposure: 0.95, water: '#f5b3a3', disc: '#ff9a5c', discPos: [18, 2.6, -40], cloud: '#ffd2c2', cloudGlow: 0.35 },
  { skyTop: '#1c2a52', skyMid: '#33467a', skyBot: '#5a6a94', fog: '#3b4a73', hemiSky: '#93a6d8', hemiGround: '#33423c', hemi: 0.6, light: '#bccbff', lightI: 0.75, lightPos: [-10, 14, -4], exposure: 1.0, water: '#3e5b86', disc: '#ff9a5c', discPos: [18, -12, -40], cloud: '#7d88b2', cloudGlow: 0.12 },
];

export function createWorld(scene) {
  let seed = 408;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const mats = {};
  const mat = (color, extra) => { const key = color + JSON.stringify(extra || {}); if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.92 }, extra)); return mats[key]; };
  const mesh = (geo, material, { cast = true, receive = true } = {}) => { const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = receive; return m; };
  const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---------- stage reveal system ----------
  let stage = 0, stageAt = 0, clock = 0, mood = 0, moodDrawn = -1;
  const reveals = [];
  function reveal(obj, from, opts = {}) {
    const r = Object.assign({ obj, from, until: 99, delay: 0, dur: 1.2, kind: 'grow', p: 0, depth: 1 }, opts);
    if (obj) { r.base = obj.scale.clone(); r.baseY = obj.position.y; obj.visible = false; }
    reveals.push(r); applyReveal(r); return obj;
  }
  function applyReveal(r) {
    const p = r.p;
    if (r.apply) r.apply(p);
    else if (r.kind === 'grow') r.obj.scale.copy(r.base).multiplyScalar(Math.max(0.0001, p < 1 ? easeOutBack(p) : 1));
    else if (r.kind === 'rise') r.obj.position.y = r.baseY - (1 - easeOut(p)) * r.depth;
    if (r.obj) r.obj.visible = p > 0.001;
  }

  // ---------- sky, fog, lights ----------
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 2; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog('#dcecdf', 24, 62);
  const hemi = new THREE.HemisphereLight('#fffbea', '#8fae6c', 1.05); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight('#fff1d2', 2.2);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunLight.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight, sunLight.target);

  // ---------- terrain ----------
  {
    const geo = new THREE.PlaneGeometry(90, 90, 70, 70); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
    const flat = geo.toNonIndexed(), fp = flat.attributes.position, colors = [], a = new THREE.Color('#b3d07c'), b = new THREE.Color('#98bb68'), c = new THREE.Color();
    for (let i = 0; i < fp.count; i += 3) {
      c.copy(a).lerp(b, rand() * 0.8);
      if (pondE(fp.getX(i), fp.getZ(i)) < 1.15) c.set('#a9bf82');
      for (let j = 0; j < 3; j++) colors.push(c.r, c.g, c.b);
    }
    flat.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); flat.computeVertexNormals();
    scene.add(mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), { cast: false }));
  }
  [[-22, -34, 16, 5, 9, '#a6c38b'], [2, -40, 22, 7, 10, '#b3cd97'], [26, -32, 15, 6, 8, '#9dbb84'], [-38, -18, 12, 4, 9, '#b6cf9a'], [38, -14, 13, 5, 9, '#adc891']]
    .forEach(([x, z, sx, sy, sz, col]) => { const h = mesh(new THREE.IcosahedronGeometry(1, 2), mat(col), { cast: false }); h.scale.set(sx, sy, sz); h.position.set(x, -1, z); scene.add(h); });
  // stepping-stone path (stage 1 — space is set up from the start)
  [[0.2, 8.6], [0.6, 7.3], [0.3, 6.0], [-0.3, 4.8], [-0.1, 3.5], [0.5, 2.3], [1.2, 1.2]].forEach(([x, z], i) => {
    const s = mesh(new THREE.CylinderGeometry(0.42 - i * 0.02, 0.46 - i * 0.02, 0.07, 9), mat('#efe2bf'), { cast: false }); s.position.set(x, groundY(x, z) + 0.03, z); s.rotation.y = rand(); scene.add(s);
  });

  // ---------- flower beds: 8 sprouts from stage 1, four beds bloom at stage 2 ----------
  const FLOWER_COLS = ['#fff3d6', '#f7c2a8', '#cbb8ec'].map((c) => new THREE.Color(c));
  const headGeo = new THREE.IcosahedronGeometry(0.13, 0), stemGeo = new THREE.ConeGeometry(0.05, 0.24, 4), leafGeo = new THREE.SphereGeometry(0.07, 5, 3);
  const headMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), stemMat = mat('#7aa45e');
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  BEDS.forEach((bd, bi) => {
    const n = 18, spots = [];
    while (spots.length < n) { const t = rand() * 6.28, r = Math.sqrt(rand()) * bd[2], x = bd[0] + Math.cos(t) * r, z = bd[1] + Math.sin(t) * r; if (pondE(x, z) > 1.4) spots.push([x, z, rand() * 0.6, FLOWER_COLS[Math.floor(rand() * 3)]]); }
    const heads = new THREE.InstancedMesh(headGeo, headMat, n), stems = new THREE.InstancedMesh(stemGeo, stemMat, n);
    heads.castShadow = stems.castShadow = true;
    spots.forEach((s, i) => heads.setColorAt(i, s[3]));
    scene.add(heads, stems);
    reveal(null, 1, { delay: bi * 0.5, dur: 2.2, apply: (p) => {
      heads.visible = stems.visible = p > 0.001;
      spots.forEach(([x, z, d], i) => {
        const k = clamp01((p - d * 0.6) / 0.4), y = groundY(x, z), e = k < 1 ? easeOutBack(k) : 1;
        S.setScalar(Math.max(0.0001, e)); P.set(x, y + 0.24 * e, z); M.compose(P, Q, S); heads.setMatrixAt(i, M);
        S.set(1, Math.max(0.0001, e), 1); P.set(x, y + 0.11 * e, z); M.compose(P, Q, S); stems.setMatrixAt(i, M);
      });
      heads.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
    } });
  });
  // 8 sprouts (stage 1) that open into buds at stage 2
  for (let i = 0; i < 8; i++) {
    const bd = BEDS[i % 4], x = bd[0] + (rand() - 0.5) * 1.6, z = bd[1] + (rand() - 0.5) * 1.2;
    const g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
    const stem = mesh(stemGeo, stemMat); stem.position.y = 0.11; g.add(stem);
    [-1, 1].forEach((sd) => { const l = mesh(leafGeo, mat('#8dbb6a')); l.scale.set(1.4, 0.5, 0.8); l.position.set(sd * 0.08, 0.14, 0); l.rotation.z = sd * 0.5; g.add(l); });
    scene.add(g); reveal(g, 0, { delay: 0.3 + i * 0.25, dur: 1 });
    const bud = mesh(headGeo, new THREE.MeshStandardMaterial({ color: FLOWER_COLS[i % 3], flatShading: true, roughness: 0.8 })); bud.position.set(x, groundY(x, z) + 0.25, z); bud.scale.setScalar(1.2);
    scene.add(bud); reveal(bud, 1, { delay: 0.4 + i * 0.2 });
  }

  // ---------- stage 3: three tree groups in the middle / back ----------
  const leafCols = ['#8fb36b', '#9cc077', '#7fa862', '#a9c97f', '#93b872'];
  const swayers = [];
  function tree(x, z, s, kind) {
    const g = new THREE.Group(); g.position.set(x, groundY(x, z), z); g.scale.setScalar(s);
    const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 6), mat('#a57d5a')); trunk.position.y = 0.65; g.add(trunk);
    const crown = new THREE.Group(); crown.position.y = 1.3; g.add(crown);
    if (kind === 'pine') [[1.0, 1.5, 0.4], [0.75, 1.2, 1.1], [0.5, 0.9, 1.7]].forEach(([r, h, y]) => { const c = mesh(new THREE.ConeGeometry(r, h, 7), mat('#7da463')); c.position.y = y; crown.add(c); });
    else [[0, 0.55, 0, 0.95], [0.55, 0.35, 0.2, 0.68], [-0.5, 0.4, -0.1, 0.72], [0.05, 1.05, 0.05, 0.62]].forEach(([dx, dy, dz, r]) => { const f = mesh(new THREE.IcosahedronGeometry(r, 1), mat(leafCols[Math.floor(rand() * 5)])); f.position.set(dx, dy, dz); crown.add(f); });
    crown.userData.phase = rand() * 6; swayers.push(crown); scene.add(g); return g;
  }
  function bush(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
    for (let i = 0; i < 3; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.42 * s, 1), mat(leafCols[(i + 1) % 5])); b.position.set((i - 1) * 0.38 * s, 0.25 * s, (rand() - 0.5) * 0.3); b.scale.y = 0.78; g.add(b); }
    scene.add(g); return g;
  }
  [
    [[-9, -5, 1.25], [-6.2, -8.6, 1.4, 'pine'], [-11.5, -1.5, 1.2], ['bush', -6.6, -3.6, 1.0]],
    [[-1.8, -11, 1.5], [2.6, -10.4, 1.3, 'pine'], [-4.6, -9.6, 1.05], ['bush', 0.4, -7.4, 0.9]],
    [[8.6, -7.6, 1.45], [12, -3.4, 1.2], [10.6, -11.5, 1.6, 'pine'], ['bush', 9.2, -2.4, 0.9]],
  ].forEach((group, gi) => group.forEach((t, i) => {
    const o = t[0] === 'bush' ? bush(t[1], t[2], t[3]) : tree(t[0], t[1], t[2], t[3]);
    reveal(o, 2, { delay: gi * 0.6 + i * 0.35, dur: 1.4 });
  }));

  // ---------- stage 4: butterflies (leave at night) ----------
  const butterflies = ['#f6c0d4', '#fde58e', '#c9b7f2'].map((col, i) => {
    const g = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 });
    const wg = new THREE.CircleGeometry(0.16, 8); wg.translate(0.15, 0, 0);
    const l = new THREE.Mesh(wg, wm), r = new THREE.Mesh(wg, wm); r.rotation.y = Math.PI;
    const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r); g.add(lp, rp);
    g.userData = { lp, rp, phase: i * 2.1, cx: BEDS[i][0], cz: BEDS[i][1] };
    scene.add(g); reveal(g, 3, { until: 7, delay: i * 0.8 }); return g;
  });

  const pondGroup = new THREE.Group(); scene.add(pondGroup); // pond + bridge: sinks away when a discovery scene takes its place
  // ---------- stage 5: pond (water rises out of the reserved hollow) ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: '#8fcbd6', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.93 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterMat);
  water.rotation.x = -Math.PI / 2; water.scale.set(POND.rx * 1.02, POND.rz * 1.02, 1); water.position.set(POND.x, -0.02, POND.z); water.receiveShadow = true;
  pondGroup.add(water); reveal(water, 4, { kind: 'rise', depth: 0.4, dur: 2.5 });
  for (let i = 0; i < 30; i++) {
    const t = (i / 30) * Math.PI * 2 + rand() * 0.1, rr = 1.06 + rand() * 0.06, x = POND.x + Math.cos(t) * POND.rx * rr, z = POND.z + Math.sin(t) * POND.rz * rr;
    const s = mesh(new THREE.DodecahedronGeometry(0.16 + rand() * 0.16, 0), mat(rand() > 0.5 ? '#cfc8b4' : '#bdb6a1'));
    s.position.set(x, groundY(x, z) + 0.04, z); s.rotation.set(rand() * 3, rand() * 3, 0); s.scale.y = 0.7; pondGroup.add(s);
    reveal(s, 4, { delay: 0.6 + i * 0.05, dur: 0.6 });
  }
  const sparkles = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    sp.rotation.x = -Math.PI / 2; sp.userData.phase = rand() * 6;
    const t = rand() * 6.28, r = Math.sqrt(rand()) * 0.75; sp.position.set(POND.x + Math.cos(t) * POND.rx * r, 0.0, POND.z + Math.sin(t) * POND.rz * r);
    pondGroup.add(sp); sparkles.push(sp);
  }
  let pondP = 0; reveal(null, 4, { delay: 2, dur: 1.5, apply: (p) => { pondP = p; } });
  function lily(x, z, flower, delay) {
    const pad = mesh(new THREE.CircleGeometry(0.34, 12, 0.4, Math.PI * 2 - 0.5), mat('#7fae69'), { cast: false });
    pad.rotation.x = -Math.PI / 2; pad.rotation.z = rand() * 6; pad.position.set(x, 0.0, z); pondGroup.add(pad); reveal(pad, 4, { delay, dur: 0.8 });
    if (!flower) return;
    const g = new THREE.Group(); g.position.set(x, 0.02, z);
    for (let i = 0; i < 7; i++) { const p = mesh(new THREE.ConeGeometry(0.07, 0.26, 4), mat('#f4a9c0')); p.position.set(Math.cos(i * 0.9) * 0.07, 0.1, Math.sin(i * 0.9) * 0.07); p.rotation.set(Math.sin(i * 0.9) * 0.6, 0, -Math.cos(i * 0.9) * 0.6); g.add(p); }
    const c = mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#ffd56b')); c.position.y = 0.1; g.add(c); pondGroup.add(g); reveal(g, 4, { delay: delay + 0.6 });
  }
  lily(5.8, 1.2, true, 2.2); lily(6.4, 0.3, false, 2.0); lily(2.9, 1.5, false, 2.4); lily(5.4, -0.9, false, 2.6);

  // ---------- stage 6: the wooden bridge ----------
  {
    const wood = mat('#c38e5f'), dark = mat('#9a6a45'), bridge = new THREE.Group();
    const x = POND.x - 0.4, z0 = POND.z - POND.rz - 0.7, z1 = POND.z + POND.rz + 0.7, n = 15;
    const arc = (t) => new THREE.Vector3(x, 0.12 + Math.sin(t * Math.PI) * 0.75, z0 + (z1 - z0) * t);
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = arc(t), q = arc(Math.min(1, t + 0.01)), r = arc(Math.max(0, t - 0.01));
      const plank = mesh(new THREE.BoxGeometry(1.25, 0.07, (z1 - z0) / n * 0.86), wood); plank.position.copy(p); plank.rotation.x = -Math.atan2(q.y - r.y, q.z - r.z); bridge.add(plank);
    }
    [-0.6, 0.6].forEach((dx) => {
      const pts = []; for (let i = 0; i <= 20; i++) { const p = arc(i / 20); pts.push(new THREE.Vector3(p.x + dx, p.y + 0.5, p.z)); }
      bridge.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.04, 5), dark));
      for (let i = 0; i <= 6; i++) { const p = arc(i / 6), post = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.56, 6), dark); post.position.set(p.x + dx, p.y + 0.25, p.z); bridge.add(post); }
    });
    pondGroup.add(bridge); reveal(bridge, 5, { kind: 'rise', depth: 1.4, dur: 2.4 });
  }

  // ---------- sky objects: sun, clouds, moon, stars, fireflies ----------
  function glow(col, size) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false })); s.scale.setScalar(size); return s;
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 12), new THREE.MeshBasicMaterial({ color: '#ffd977', fog: false }));
  const sunHalo = glow('rgba(255,236,180,.9)', 13); scene.add(sunDisc, sunHalo);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 12), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false, transparent: true, opacity: 0 }));
  moon.position.set(-10, 6.2, -34); const moonHalo = glow('rgba(220,230,255,.8)', 11); moonHalo.position.copy(moon.position); scene.add(moon, moonHalo);
  const clouds = [];
  [[-14, 8.5, -30], [6, 10, -36], [22, 8, -26], [-28, 9.5, -38]].forEach(([x, y, z]) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45, flatShading: true, fog: false });
    [[0, 0, 1.6], [1.6, -0.3, 1.2], [-1.6, -0.4, 1.1], [0.6, 0.6, 1.1]].forEach(([dx, dy, r]) => { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm); p.position.set(dx, dy, 0); p.scale.y = 0.75; g.add(p); });
    g.userData.mat = cm; scene.add(g); clouds.push(g);
  });
  const stars = [];
  for (let i = 0; i < 12; i++) {
    const s = glow('rgba(255,250,220,1)', 0.9 + rand() * 0.6); s.position.set(-30 + rand() * 60, 5.5 + rand() * 6, -42 + rand() * 6); s.userData.phase = rand() * 6; s.material.opacity = 0; scene.add(s); stars.push(s);
  }
  const fireflies = [];
  for (let i = 0; i < 5; i++) {
    const f = glow('rgba(255,244,150,1)', 0.45); f.material.opacity = 0; f.material.fog = true;
    f.userData = { bd: BEDS[i % 4], phase: rand() * 6 }; scene.add(f); fireflies.push(f);
  }
  const moonPath = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2), new THREE.MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0, depthWrite: false }));
  moonPath.rotation.x = -Math.PI / 2; moonPath.position.set(POND.x - 1.2, 0.01, POND.z - 0.2); pondGroup.add(moonPath);
  let nightP = 0; reveal(null, 7, { dur: 6, apply: (p) => { nightP = p; } });

  // ---------- discoveries: primary scene in the pond's place (6 s of quiet time to cross-fade, like garden/fixtures.js) ----------
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: '#a9c47c', roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
  lawn.rotation.x = -Math.PI / 2; lawn.scale.set(POND.rx * 1.18, POND.rz * 1.22, 1); lawn.position.set(POND.x, 0.05, POND.z); lawn.receiveShadow = true; lawn.visible = false; scene.add(lawn);
  let themeId = 'bridge', fixture = null, outgoing = null, fadeP = 1;
  function applyTheme() {
    const bridgeVis = themeId === 'bridge' ? fadeP : (outgoing && outgoing.id === 'bridge' ? 1 - fadeP : 0);
    pondGroup.position.y = -2.2 * (1 - bridgeVis); pondGroup.visible = bridgeVis > 0.001;
    lawn.material.opacity = 1 - bridgeVis; lawn.visible = bridgeVis < 0.999;
    if (fixture) fixture.scale.setScalar(Math.max(0.0001, easeOut(fadeP)));
    if (outgoing && outgoing.obj) outgoing.obj.scale.setScalar(Math.max(0.0001, 1 - fadeP));
    if (fadeP >= 1 && outgoing) { if (outgoing.obj) { scene.remove(outgoing.obj); disposeFixture(outgoing.obj); } outgoing = null; }
  }
  function setTheme(id, instant) {
    if (id !== 'bridge' && FIXTURE_IDS.indexOf(id) < 0) id = 'bridge';
    if (id === themeId) { if (instant && fadeP < 1) { fadeP = 1; applyTheme(); } return; }
    if (outgoing && outgoing.obj) { scene.remove(outgoing.obj); disposeFixture(outgoing.obj); }
    outgoing = { id: themeId, obj: fixture };
    themeId = id; fixture = createFixture(id);
    if (fixture) { fixture.position.set(POND.x, 0.04, POND.z); fixture.rotation.y = -0.28; scene.add(fixture); }
    fadeP = instant ? 1 : 0; applyTheme();
  }

  // ---------- mood (light & colour) ----------
  const cA = new THREE.Color(), cB = new THREE.Color();
  function lerpKey(key, m, out) {
    const i = m <= 1 ? 0 : 1, t = m <= 1 ? m : m - 1;
    return out.set(MOODS[i][key]).lerp(cB.set(MOODS[i + 1][key]), t);
  }
  function lerpNum(key, m) { const i = m <= 1 ? 0 : 1, t = m <= 1 ? m : m - 1; return MOODS[i][key] + (MOODS[i + 1][key] - MOODS[i][key]) * t; }
  function lerpVec(key, m, v) { const i = m <= 1 ? 0 : 1, t = m <= 1 ? m : m - 1, a = MOODS[i][key], b = MOODS[i + 1][key]; return v.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
  function applyMood(renderer) {
    if (Math.abs(mood - moodDrawn) > 0.002) {
      const g = skyCanvas.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#' + lerpKey('skyTop', mood, cA).getHexString()); grad.addColorStop(0.55, '#' + lerpKey('skyMid', mood, cA).getHexString()); grad.addColorStop(1, '#' + lerpKey('skyBot', mood, cA).getHexString());
      g.fillStyle = grad; g.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true; moodDrawn = mood;
    }
    lerpKey('fog', mood, scene.fog.color);
    lerpKey('hemiSky', mood, hemi.color); lerpKey('hemiGround', mood, hemi.groundColor); hemi.intensity = lerpNum('hemi', mood);
    lerpKey('light', mood, sunLight.color); sunLight.intensity = lerpNum('lightI', mood); lerpVec('lightPos', mood, sunLight.position);
    renderer.toneMappingExposure = lerpNum('exposure', mood);
    lerpKey('water', mood, waterMat.color); waterMat.emissive.copy(waterMat.color).multiplyScalar(0.32);
    lerpKey('disc', mood, sunDisc.material.color); lerpVec('discPos', mood, sunDisc.position); sunHalo.position.copy(sunDisc.position);
    sunHalo.material.opacity = clamp01(1.6 - mood) ; sunDisc.visible = mood < 1.9;
    clouds.forEach((c) => { lerpKey('cloud', mood, c.userData.mat.color); c.userData.mat.emissive.copy(c.userData.mat.color); c.userData.mat.emissiveIntensity = lerpNum('cloudGlow', mood); });
    const night = clamp01(mood - 1);
    moon.material.opacity = night; moonHalo.material.opacity = night * 0.8; moon.visible = moonHalo.visible = night > 0.01;
  }


  // ---------- per-frame ----------
  function update(dt, renderer) {
    clock += dt;
    reveals.forEach((r) => {
      const on = stage >= r.from && stage < r.until;
      const before = r.p;
      if (on) { if (clock - stageAt >= r.delay || r.p > 0) r.p = Math.min(1, r.p + dt / r.dur); }
      else r.p = Math.max(0, r.p - dt / (r.dur * 0.6));
      if (r.p !== before || r.apply && dt === 0) applyReveal(r);
    });
    const moodTarget = stage >= 7 ? 2 : stage >= 6 ? 1 : 0;
    if (mood !== moodTarget) { const step = dt / 6; mood = mood < moodTarget ? Math.min(moodTarget, mood + step) : Math.max(moodTarget, mood - step); }
    applyMood(renderer);
    if (fadeP < 1 && dt > 0) { fadeP = Math.min(1, fadeP + dt / 6); applyTheme(); }
    if (fixture && fixture.userData.animate) fixture.userData.animate(clock);
    const t = clock;
    swayers.forEach((c) => { c.rotation.z = Math.sin(t * 0.8 + c.userData.phase) * 0.035; });
    clouds.forEach((g, i) => { g.position.x += dt * (0.25 + i * 0.05); if (g.position.x > 40) g.position.x = -40; });
    const day = 1 - clamp01(mood - 1);
    sparkles.forEach((s) => { s.material.opacity = pondP * day * (0.15 + 0.55 * Math.max(0, Math.sin(t * 1.3 + s.userData.phase))); s.visible = s.material.opacity > 0.01; });
    butterflies.forEach((b) => {
      const u = b.userData, k = t * 0.45 + u.phase;
      b.position.set(u.cx + Math.sin(k) * 1.6, groundY(u.cx, u.cz) + 0.9 + Math.sin(k * 2.3) * 0.25, u.cz + Math.sin(k * 0.8) * 1.2);
      b.rotation.y = -k; const f = Math.sin(t * 14 + u.phase) * 0.9; u.lp.rotation.y = f; u.rp.rotation.y = Math.PI - f;
    });
    stars.forEach((s) => { s.material.opacity = nightP * (0.55 + 0.45 * Math.sin(t * 1.7 + s.userData.phase)); s.visible = nightP > 0.01; });
    fireflies.forEach((f) => {
      const u = f.userData, k = t * 0.35 + u.phase;
      f.position.set(u.bd[0] + Math.sin(k * 1.3) * 1.4, groundY(u.bd[0], u.bd[1]) + 0.6 + Math.sin(k * 2.1) * 0.3, u.bd[1] + Math.cos(k) * 1.1);
      f.material.opacity = nightP * (0.5 + 0.5 * Math.sin(t * 2.6 + u.phase)); f.visible = nightP > 0.01;
    });
    moonPath.material.opacity = nightP * pondP * (0.35 + 0.1 * Math.sin(t * 1.1)); moonPath.visible = moonPath.material.opacity > 0.01;
  }
  function setStage(n, instant) {
    stage = Math.max(0, Math.min(7, n)); stageAt = clock;
    if (instant) {
      mood = stage >= 7 ? 2 : stage >= 6 ? 1 : 0;
      reveals.forEach((r) => { r.p = stage >= r.from && stage < r.until ? 1 : 0; applyReveal(r); });
    }
  }
  return { groundY, POND, update, setStage, setTheme, get stage() { return stage; }, get mood() { return mood; }, get theme() { return { themeId, fade: fadeP }; } };
}
