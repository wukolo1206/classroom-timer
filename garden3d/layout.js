// garden3d/layout.js
// Pure layout for the 3D garden (no three.js): terrain height, reserved areas, partner seats.
export const POND = { x: 4.4, z: 0.6, rx: 3.4, rz: 2.2 };
// [x, z, radius] — four flower beds (design v0.1: blooms stay in the corners / beds)
export const BEDS = [[-4.2, 5.7, 1.25], [-7.0, 0.4, 1.3], [5.4, 5.7, 1.2], [1.2, -2.7, 1.2]];
export const pondE = (x, z) => ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;

export function groundY(x, z) {
  const r = Math.hypot(x, z), k = Math.min(1, Math.max(0, (r - 7) / 12));
  let h = (0.16 * Math.sin(x * 0.45) * Math.cos(z * 0.38) + 0.08 * Math.sin(x * 1.1 + z * 0.7)) * (0.35 + 0.65 * k) + k * k * 1.6;
  const e = pondE(x, z);
  if (e < 1.25) h = h * Math.max(0, (e - 1) / 0.25) - 0.28 * Math.min(1, (1.25 - e) / 0.35);
  return h;
}

// Pond (and its banks), the bridge line, the stepping-stone path and flower beds never get a partner.
export function isReserved(x, z) {
  if (pondE(x, z) < 2.2) return true;
  if (Math.abs(x - (POND.x - 0.4)) < 1.2 && z > -3.2 && z < 4.4) return true;
  if (Math.abs(x - 0.45) < 0.7 && z > 1.2) return true;
  return BEDS.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r * 0.85);
}

// Meadow = left / centre area plus a front strip in front of the pond.
const onMeadow = (x, z) => z >= -2.2 && z <= 7.2 && x >= -9.6 && (x < 1.3 || (z > 4.9 && x < 8.2));
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

function grid(spacing) {
  const out = [];
  let row = 0;
  for (let z = -2.0; z <= 7.2; z += spacing * 0.75, row++) {
    for (let x = -9.6 + (row % 2) * spacing / 2; x <= 8.2; x += spacing) {
      if (onMeadow(x, z) && !isReserved(x, z)) out.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
    }
  }
  return out;
}

// Staggered hex grid that shrinks until `count` seats fit; ordered centre-first with a fixed jitter
// so a partial class is spread out rather than packed in one corner.
export function generateSlots(count) {
  const n = Math.max(1, Math.min(100, Math.floor(count) || 1));
  let spacing = 1.6;
  for (let tries = 0; tries < 40; tries++) {
    const g = grid(spacing);
    if (g.length >= n) {
      return g.map(([x, z]) => [x, z, Math.hypot(x + 0.8, (z - 3.4) * 1.1) + hash(x, z) * 5])
        .sort((a, b) => a[2] - b[2]).slice(0, n).map(([x, z]) => [x, z]);
    }
    spacing *= 0.95;
  }
  throw new Error('garden3d: cannot fit ' + n + ' partners');
}

export function figureScale(count) {
  return count <= 45 ? 0.82 : Math.max(0.5, 0.82 * Math.sqrt(45 / count));
}
