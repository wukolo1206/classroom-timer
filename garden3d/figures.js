// Avatar figures for the 3D garden: puffy "soft vinyl" figures grown from each avatar's silhouette.
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';

const A = window.c408PointAvatars;

export function avatarImageUrl(i) {
  const snack = window.c408SnackAvatars;
  if (i >= 24 && snack && snack.images[i - 24]) return snack.images[i - 24];
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(A.svg(i));
}
// Texture whose transparent pixels carry the nearest edge colour (canvas can't keep colour under alpha 0),
// so sampling at the puffy rim never picks up black fringes. Rows flipped to match CanvasTexture UVs.
export function bledTexture(im) {
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
export function loadAvatarTexture(i) {
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
export function labelTexture(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 44; const g = c.getContext('2d');
  g.fillStyle = '#fffbea'; g.beginPath(); g.roundRect(2, 2, 124, 40, 20); g.fill();
  g.fillStyle = '#2f4a35'; g.font = 'bold 26px "Noto Sans TC","Microsoft JhengHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Puffy figure: grow thickness from the avatar silhouette (distance to the edge -> rounded rim + soft dome).
const PUFF_N = 72, PUFF_SIZE = 1.55, puffyCache = {};
export function buildPuffy(canvas) {
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
export async function puffyFor(avatar) {
  if (!puffyCache[avatar]) puffyCache[avatar] = loadAvatarTexture(avatar).then((map) => {
    const { geo, back } = buildPuffy(map.userData.canvas);
    return { geo, mats: [new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.18 }), new THREE.MeshStandardMaterial({ color: back, roughness: 0.6 })] };
  });
  return puffyCache[avatar];
}
