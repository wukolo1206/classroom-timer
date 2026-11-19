// garden3d/stage3d.js
// Production 3D garden controller: owns renderer, camera and loop; app.js pushes state via setState().
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';
import { createWorld } from './world.js?v=22c4b0b85a';
import { Partners } from './partners.js?v=79d83b2810';

export function createGarden3D(container, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'garden-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const world = createWorld(scene);
  const target = new THREE.Vector3(0.2, 1.3, 2.0);
  const home = new THREE.Vector3(target.x, 0, target.z + 13);
  const partners = new Partners(scene, home);
  let state = { visible: [], rosterSize: 31, stage: 0, active: false, reduced: !!options.reducedMotion, idle: true };
  let clock = 0, last = performance.now(), first = true;
  const nowS = () => performance.now() / 1000;

  // next: any subset of {visible, rosterSize, stage, active, reduced, idle}
  function setState(next) {
    const s = Object.assign({}, state, next);
    if (s.idle && (!state.idle || first)) { partners.reset(); world.setStage(0, true); }
    if (s.stage !== world.stage) world.setStage(s.stage, first || s.reduced || Math.abs(s.stage - world.stage) > 1);
    world.setTheme((s.discovery && s.discovery.themeId) || 'bridge', first || s.reduced || s.idle);
    partners.setCapacity(s.rosterSize);
    partners.sync(s.visible, nowS(), first || s.reduced);
    if (s.life) partners.applyLife(s.life);
    state = s; first = false;
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 54 : camera.aspect < 1.2 ? 46 : 38;
    camera.updateProjectionMatrix();
  }

  function frame(t) {
    const real = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
    const dt = state.active ? real : 0; // noise / teacher pause / no signal / ended: everything holds still
    clock += dt;
    world.update(dt, renderer);
    partners.update(clock, nowS(), state.reduced);
    const aspect = camera.aspect, R = aspect < 0.8 ? 17 : aspect < 1.2 ? 15 : 13.5, H = aspect < 1.2 ? 4.8 : 4.0;
    const a = state.reduced ? 0 : Math.sin(clock * 0.06) * 0.3;
    camera.position.set(target.x + Math.sin(a) * R, target.y + H, target.z + Math.cos(a) * R);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  function dataUrlToBlob(url) {
    const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }
  let captures = 0;
  // One high-resolution frame as PNG. The HUD is DOM, so it is never part of the image.
  async function capture({ seats = false, width = 1800 } = {}) {
    captures++;
    const css = canvas.clientWidth || container.clientWidth || 1, before = renderer.getPixelRatio();
    partners.setLabelsVisible(!!seats);
    renderer.setPixelRatio(Math.min(3, Math.max(1, width / css))); resize();
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png'); // read before the size is restored (restoring clears the buffer)
    partners.setLabelsVisible(true);
    renderer.setPixelRatio(before); resize();
    renderer.render(scene, camera);
    return dataUrlToBlob(url);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  renderer.setAnimationLoop(frame);

  return {
    setState,
    capture,
    dispose() { renderer.setAnimationLoop(null); ro.disconnect(); partners.reset(); renderer.dispose(); canvas.remove(); },
    debug() { return { stage: world.stage, mood: world.mood, clock, theme: world.theme, captures, labelsVisible: partners.labelsVisible, partners: partners.debug() }; },
  };
}
