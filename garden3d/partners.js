// garden3d/partners.js
// Partner figures in the 3D garden: stable seat -> slot, arrive / leave animations, avatar swaps.
import * as THREE from '../vendor/three/three.module.min.js?v=3e690ac7d1';
import { puffyFor, labelTexture } from './figures.js?v=84a4a7c24a';
import { generateSlots, figureScale, groundY } from './layout.js?v=24350342a5';
import { createProp, disposeProp } from './props.js?v=ac4f7668e4';

const MOTIONS = ['sway', 'hop', 'turn', 'float'];
const baseGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.09, 24);
const baseMat = new THREE.MeshStandardMaterial({ color: '#eadcc0', roughness: 0.6 });
const labelGeo = new THREE.PlaneGeometry(0.66, 0.23);
// Life engine offsets are pixels (|x| <= 48, |y| <= 6); map them to a small walk around the seat.
const WALK_X = 0.45, WALK_Z = 0.18;
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

export class Partners {
  constructor(scene, home) {
    this.scene = scene;
    this.home = home; // audience position: figures face it, so camera sway shows their thickness
    this.items = new Map();
    this.capacity = 31;
    this.slots = generateSlots(31);
    this.scale = figureScale(31);
  }

  setCapacity(n) {
    const cap = Math.max(31, Math.min(100, Math.floor(n) || 31));
    if (cap === this.capacity) return;
    this.capacity = cap;
    this.slots = generateSlots(cap);
    this.scale = figureScale(cap);
    this.items.forEach((it) => this.place(it));
  }

  freeSlot() {
    const used = new Set();
    this.items.forEach((it) => { if (!it.leaving) used.add(it.slot); });
    for (let i = 0; i < this.slots.length; i++) if (!used.has(i)) return i;
    return -1;
  }

  place(it) {
    const [sx, sz] = this.slots[it.slot], k = this.scale / 0.82; // big classes: shorter walks so neighbours never touch
    const x = sx + it.ox * k, z = sz + it.oz * k;
    it.group.position.set(x, groundY(x, z), z);
    it.group.rotation.y = Math.atan2(this.home.x - sx, this.home.z - sz);
  }

  // list: [{seat, avatar}] = model.visible(); now: wall-clock seconds; instant: skip arrive/leave animation
  sync(list, now, instant) {
    const wanted = new Map(list.map((r) => [r.seat, r.avatar]));
    [...this.items.entries()].forEach(([seat, it]) => {
      if (wanted.has(seat) || it.leaving) return;
      if (instant) this.drop(seat); else { it.leaving = true; it.changedAt = now; }
    });
    list.forEach((r) => {
      const it = this.items.get(r.seat);
      if (it && !it.leaving) { if (it.avatar !== r.avatar) this.setAvatar(it, r.avatar); return; }
      if (it) this.drop(r.seat); // came back while still fading out
      const slot = this.freeSlot();
      if (slot >= 0) this.add(r.seat, r.avatar, slot, now, instant);
    });
  }

  // states: garden/life.js Life.frame() output for this frame (same engine as the 2D garden)
  applyLife(states) {
    (states || []).forEach((s) => {
      const it = this.items.get(s.seat);
      if (!it || it.leaving) return;
      it.ox = Math.max(-1, Math.min(1, (s.x || 0) / 48)) * WALK_X;
      it.oz = Math.max(-1, Math.min(1, (s.y || 0) / 6)) * WALK_Z;
      it.facing = s.facing < 0 ? -1 : 1;
      this.place(it);
      if (s.activity !== it.activity) {
        it.activity = s.activity;
        if (it.prop) { it.group.remove(it.prop); disposeProp(it.prop); it.prop = null; }
        const prop = createProp(s.activity);
        if (prop) { it.prop = prop; it.group.add(prop); }
      }
    });
  }

  add(seat, avatar, slot, now, instant) {
    const group = new THREE.Group(), body = new THREE.Group();
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.04; base.castShadow = base.receiveShadow = true;
    const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(String(seat).padStart(2, '0') + '號'), transparent: true }));
    label.position.set(0, 0.16, 0.56); label.rotation.x = -0.35;
    body.position.y = 0.08;
    group.add(base, body, label);
    const it = { seat, avatar: null, slot, group, body, label, figure: null, motion: MOTIONS[seat % 4], phase: seat * 0.7, changedAt: instant ? -99 : now, leaving: false, activity: null, prop: null, ox: 0, oz: 0, facing: 1 };
    this.items.set(seat, it);
    this.place(it);
    group.scale.setScalar(instant ? this.scale : 0.0001);
    this.scene.add(group);
    this.setAvatar(it, avatar);
  }

  setAvatar(it, avatar) {
    it.avatar = avatar;
    puffyFor(avatar).then((fig) => {
      if (this.items.get(it.seat) !== it || it.avatar !== avatar) return; // left or changed again meanwhile
      if (it.figure) it.body.remove(it.figure);
      const m = new THREE.Mesh(fig.geo, fig.mats);
      m.castShadow = m.receiveShadow = true; m.position.y = -0.02;
      it.figure = m; it.body.add(m);
    }).catch(() => { /* keep base + seat label; the 2D garden underneath still has the avatar */ });
  }

  drop(seat) {
    const it = this.items.get(seat);
    if (!it) return;
    this.scene.remove(it.group);
    if (it.prop) disposeProp(it.prop);
    it.label.material.map.dispose(); it.label.material.dispose();
    this.items.delete(seat);
  }

  reset() { [...this.items.keys()].forEach((s) => this.drop(s)); }

  update(clock, now, reduced) {
    [...this.items.entries()].forEach(([seat, it]) => {
      const age = now - it.changedAt, b = it.body;
      if (it.leaving) {
        const k = reduced ? 1 : Math.min(1, age / 0.4);
        it.group.scale.setScalar(Math.max(0.0001, this.scale * (1 - k)));
        if (k >= 1) this.drop(seat);
        return;
      }
      const grow = reduced || age >= 0.7 ? 1 : Math.max(0.0001, easeOutBack(age / 0.7));
      it.group.scale.setScalar(this.scale * grow);
      b.rotation.set(0, 0, 0); b.position.y = 0.08;
      if (reduced) return;
      const k = clock * 2 + it.phase;
      if (it.prop && it.prop.userData.animate) it.prop.userData.animate(clock + it.phase);
      if (it.activity === 'walking') { b.rotation.y = it.facing * 0.6; b.position.y = 0.08 + Math.abs(Math.sin(k * 2.2)) * 0.12; return; }
      if (it.motion === 'sway') b.rotation.z = Math.sin(k) * 0.07;
      else if (it.motion === 'hop') b.position.y = 0.08 + Math.abs(Math.sin(k * 0.9)) * 0.16;
      else if (it.motion === 'turn') b.rotation.y = Math.sin(k * 0.5) * 0.5;
      else b.position.y = 0.12 + Math.sin(k * 0.7) * 0.06;
    });
  }

  debug() {
    const out = {};
    this.items.forEach((it, seat) => { if (!it.leaving) out[seat] = { avatar: it.avatar, slot: it.slot, x: it.group.position.x, z: it.group.position.z, ready: !!it.figure, activity: it.activity, prop: !!it.prop, slotX: this.slots[it.slot][0], slotZ: this.slots[it.slot][1] }; });
    return out;
  }
}
