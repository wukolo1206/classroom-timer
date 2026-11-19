// garden3d/bridge.js
// Loaded as <script type="module"> after garden/app.js. If this module fails to load (old browser),
// window.Garden3D stays undefined and the garden simply stays 2D.
import { createGarden3D } from './stage3d.js?v=15acb00c53';

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
window.Garden3D = { supported: webglOk(), create: createGarden3D };
window.dispatchEvent(new Event('garden3d-ready'));
