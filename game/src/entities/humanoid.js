// Low-poly people: a jointed body (hips, torso, head, arms, legs) with walk, run, aim, punch, sit
// and fall poses. Shared geometries and a material cache keep dozens of them cheap.
import * as THREE from 'three';
import { makeRng } from '../util/mathx.js';

const geo = {
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 0.31, 0),
  head: new THREE.BoxGeometry(0.26, 0.3, 0.27).translate(0, 0.15, 0),
  hair: new THREE.BoxGeometry(0.28, 0.12, 0.29).translate(0, 0.27, -0.01),
  arm: new THREE.BoxGeometry(0.13, 0.62, 0.14).translate(0, -0.28, 0),
  hand: new THREE.BoxGeometry(0.11, 0.11, 0.12).translate(0, -0.62, 0),
  leg: new THREE.BoxGeometry(0.19, 0.9, 0.2).translate(0, -0.45, 0),
  shoe: new THREE.BoxGeometry(0.2, 0.1, 0.3).translate(0, -0.9, 0.05),
  cap: new THREE.BoxGeometry(0.3, 0.08, 0.38).translate(0, 0.33, 0.04),
  gun: new THREE.BoxGeometry(0.07, 0.34, 0.12).translate(0, -0.78, 0.05),
  longGun: new THREE.BoxGeometry(0.08, 0.72, 0.13).translate(0, -0.88, 0.05),
  badge: new THREE.BoxGeometry(0.08, 0.08, 0.02).translate(0.12, 0.48, 0.15),
};
const umbrellaGeo = {
  pole: new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5).translate(0, 0.5, 0),
  canopy: new THREE.ConeGeometry(0.62, 0.3, 10),
};
const shadowGeo = new THREE.CircleGeometry(0.45, 12).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

const mats = new Map();
function mat(hex) {
  let m = mats.get(hex);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 }); mats.set(hex, m); }
  return m;
}

const SKIN = [0xf1c8a4, 0xd9a07a, 0xb07650, 0x8a5634, 0x5e3a22, 0xe8b88e];
const HAIR = [0x1a120c, 0x3b2414, 0x6b4a2a, 0xc9a050, 0x8a2a1a, 0x222222, 0xdcdcdc];
const SHIRTS = [0xff6f61, 0x2de2c8, 0xffd25e, 0xffffff, 0x4f7cff, 0xff4fa0, 0x7dd36a, 0xf2a65a, 0x9b6bff, 0x30343a];
const PANTS = [0x2c3e66, 0x3a3a3a, 0xc8b48a, 0x5a4636, 0x1e1e24, 0x6f8fa8, 0xe8e2d0];

/** Appearance presets for story characters and roles. */
export const LOOKS = {
  player: { skin: 0xc98b62, hair: 0x1a120c, shirt: 0xff4f7a, pants: 0x23263a, shoes: 0xffffff, longHair: true },
  cop: { skin: null, hair: null, shirt: 0x2b4a8a, pants: 0x1c2438, shoes: 0x111111, cap: 0x1c2438, badge: true },
  swat: { skin: null, hair: null, shirt: 0x22252b, pants: 0x22252b, shoes: 0x111111, cap: 0x111111 },
  gang: { skin: null, hair: null, shirt: 0xd4af37, pants: 0x151515, shoes: 0x151515, cap: 0x151515 },
  rosa: { skin: 0xb07650, hair: 0xdcdcdc, shirt: 0x2de2c8, pants: 0x3a3a3a, shoes: 0x222222, longHair: true },
  benny: { skin: 0xf1c8a4, hair: 0x3b2414, shirt: 0xffd25e, pants: 0x5a4636, shoes: 0x3b2414, cap: 0xff4f7a },
  holt: { skin: 0xd9a07a, hair: 0x6b4a2a, shirt: 0xe8e2d0, pants: 0x3a3a3a, shoes: 0x111111 },
  kane: { skin: 0xf1c8a4, hair: 0xdcdcdc, shirt: 0xf5f0e6, pants: 0xf5f0e6, shoes: 0xd4af37 },
};

export function randomLook(rng) {
  return { skin: rng.pick(SKIN), hair: rng.pick(HAIR), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), shoes: rng.pick([0x111111, 0xffffff, 0x6b4a2a]), longHair: rng.chance(0.4), cap: rng.chance(0.15) ? rng.pick(SHIRTS) : null };
}

let lookRng = makeRng(555);

export class Humanoid {
  constructor(look) {
    const l = { ...look };
    l.skin ??= lookRng.pick(SKIN);
    l.hair ??= lookRng.pick(HAIR);
    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.root.add(this.hips);
    const part = (g, color, parent) => { const m = new THREE.Mesh(g, mat(color)); m.castShadow = true; parent.add(m); return m; };
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    part(geo.torso, l.shirt, this.torso);
    if (l.badge) part(geo.badge, 0xffd25e, this.torso);
    this.neck = new THREE.Group(); this.neck.position.y = 0.64; this.torso.add(this.neck);
    part(geo.head, l.skin, this.neck);
    part(geo.hair, l.hair, this.neck);
    if (l.longHair) { const h = part(geo.hair, l.hair, this.neck); h.scale.set(1, 2.6, 0.45); h.position.set(0, -0.35, -0.12); }
    if (l.cap) part(geo.cap, l.cap, this.neck);
    this.armL = new THREE.Group(); this.armL.position.set(0.32, 0.58, 0); this.torso.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-0.32, 0.58, 0); this.torso.add(this.armR);
    part(geo.arm, l.shirt, this.armL); part(geo.hand, l.skin, this.armL);
    part(geo.arm, l.shirt, this.armR); part(geo.hand, l.skin, this.armR);
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0, 0); this.hips.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0, 0); this.hips.add(this.legR);
    part(geo.leg, l.pants, this.legL); part(geo.shoe, l.shoes, this.legL);
    part(geo.leg, l.pants, this.legR); part(geo.shoe, l.shoes, this.legR);
    this.gun = new THREE.Mesh(geo.gun, mat(0x222428)); this.armR.add(this.gun);
    this.longGun = new THREE.Mesh(geo.longGun, mat(0x2a2a2e)); this.armR.add(this.longGun);
    this.gun.visible = this.longGun.visible = false;
    this.blob = new THREE.Mesh(shadowGeo, shadowMat);
    this.blob.position.y = 0.03;
    this.root.add(this.blob);
    // A rain umbrella held over the head: pole, canopy and a ring of trim, hidden until it rains.
    this.umbrella = new THREE.Group();
    const canopyColor = l.shirt;
    const pole = new THREE.Mesh(umbrellaGeo.pole, mat(0x2a2a2e));
    const canopy = new THREE.Mesh(umbrellaGeo.canopy, mat(canopyColor));
    canopy.position.y = 0.9;
    canopy.castShadow = true;
    this.umbrella.add(pole, canopy);
    this.umbrella.position.set(-0.12, 1.1, 0.12);
    this.umbrella.visible = false;
    this.torso.add(this.umbrella);
    this.phase = 0;
    this.punchT = 0;
    this.fall = 0;
  }

  setWeapon(id) {
    this.gun.visible = id === 'pistol';
    this.longGun.visible = id === 'smg' || id === 'shotgun';
  }

  punch() { this.punchT = 0.3; }

  /** Opens or folds the umbrella (a pedestrian's answer to the rain). */
  setUmbrella(open) { this.umbrella.visible = open; }

  /**
   * Poses the body. speed in m/s, aim: pitch in radians or null, dead: bool, dt seconds.
   */
  animate(dt, speed, aimPitch, dead, airborne = false) {
    if (dead) {
      this.fall = Math.min(1, this.fall + dt * 3);
      this.hips.rotation.x = -this.fall * Math.PI / 2;
      this.hips.position.y = 0.95 - this.fall * 0.75;
      this.armL.rotation.set(-this.fall * 2.6, 0, -0.3);
      this.armR.rotation.set(-this.fall * 2.6, 0, 0.3);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.blob.visible = false;
      return;
    }
    if (this.fall > 0) { this.fall = 0; this.hips.rotation.x = 0; this.hips.position.y = 0.95; this.blob.visible = true; }
    const run = Math.min(speed / 6, 1.4);
    this.phase += dt * (3 + speed * 1.7);
    const swing = Math.sin(this.phase) * Math.min(1, speed / 2) * (0.5 + run * 0.35);
    this.legL.rotation.x = airborne ? -0.6 : swing;
    this.legR.rotation.x = airborne ? 0.3 : -swing;
    this.hips.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * 0.05 * Math.min(1, speed / 3);
    this.torso.rotation.x = run * 0.14;
    this.armL.rotation.set(-swing * 0.9, 0, -0.08);
    if (aimPitch !== null && aimPitch !== undefined) {
      this.armR.rotation.set(-Math.PI / 2 - aimPitch, 0, 0);
      this.armL.rotation.set(-Math.PI / 2 - aimPitch + 0.15, 0, 0.45);
      this.torso.rotation.x = 0;
    } else if (this.punchT > 0) {
      this.punchT -= dt;
      const p = Math.sin((1 - this.punchT / 0.3) * Math.PI);
      this.armR.rotation.set(-Math.PI / 2 * p - 0.2, 0, 0);
    } else this.armR.rotation.set(swing * 0.9, 0, 0.08);
  }

  /** Seated pose for drivers seen through the windows. */
  sit() {
    this.legL.rotation.x = this.legR.rotation.x = -Math.PI / 2;
    this.armL.rotation.set(-1.1, 0, 0); this.armR.rotation.set(-1.1, 0, 0);
    this.hips.position.y = 0.5;
    this.blob.visible = false;
  }
}
