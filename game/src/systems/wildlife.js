// Seagulls over the beach, the pier and Old Harbor: small flocks that wheel on their thermals with
// beating wings, cry now and then, and scatter skyward at gunfire or a speeding car. They stay home
// in storms and at night, and only the flocks near the player are animated.
import * as THREE from 'three';
import { services } from '../core/services.js';
import { CITY_SIZE } from '../config.js';
import { PIER, QUAY_Z } from '../world/cityPlan.js';
import { dist2, makeRng, rng } from '../util/mathx.js';

const bodyGeo = new THREE.BoxGeometry(0.16, 0.14, 0.5);
const wingGeo = new THREE.BoxGeometry(0.62, 0.02, 0.24).translate(0.31, 0, 0);
const headGeo = new THREE.BoxGeometry(0.1, 0.1, 0.12).translate(0, 0.06, 0.28);
const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.8 });
const grey = new THREE.MeshStandardMaterial({ color: 0xb7bcc4, roughness: 0.8 });

const FLOCKS = [
  { name: 'north beach', x: CITY_SIZE + 30, z: 120, r: 46, n: 7 },
  { name: 'pier', x: PIER.x0 + 40, z: PIER.z, r: 34, n: 8 },
  { name: 'south beach', x: CITY_SIZE + 30, z: 560, r: 52, n: 7 },
  { name: 'harbor east', x: 560, z: QUAY_Z - 18, r: 60, n: 6 },
  { name: 'harbor west', x: 160, z: QUAY_Z - 18, r: 60, n: 6 },
];

class Gull {
  constructor(flock, seed) {
    const r = makeRng(seed);
    this.flock = flock;
    this.phase = r.range(0, 6.28);
    this.radius = flock.r * r.range(0.45, 1);
    this.speed = r.range(0.12, 0.22) * (r.chance(0.5) ? 1 : -1);
    this.height = r.range(12, 26);
    this.flap = r.range(6, 9);
    this.scatter = 0;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, white);
    this.left = new THREE.Mesh(wingGeo, grey);
    this.right = new THREE.Mesh(wingGeo, grey);
    this.right.scale.x = -1;
    this.group.add(body, this.left, this.right, new THREE.Mesh(headGeo, white));
    this.group.visible = false;
    services.scene.add(this.group);
  }

  update(dt, t) {
    this.phase += this.speed * dt * (1 + this.scatter * 2);
    this.scatter = Math.max(0, this.scatter - dt * 0.12);
    const f = this.flock;
    const lift = this.scatter * 18;
    const x = f.x + Math.cos(this.phase) * this.radius;
    const z = f.z + Math.sin(this.phase) * this.radius;
    const y = this.height + lift + Math.sin(t * 0.6 + this.phase * 3) * 1.4;
    const g = this.group;
    g.position.set(x, y, z);
    const dir = Math.sign(this.speed);
    g.rotation.set(0, Math.atan2(-Math.sin(this.phase) * dir, Math.cos(this.phase) * dir), -0.28 * dir);
    const beat = Math.sin(t * this.flap * (1 + this.scatter) + this.phase * 5);
    this.left.rotation.z = beat * 0.55;
    this.right.rotation.z = -beat * 0.55;
  }
}

export class Wildlife {
  constructor() {
    this.flocks = FLOCKS.map((f, i) => ({ ...f, gulls: Array.from({ length: f.n }, (_, k) => new Gull(f, 700 + i * 31 + k)), cryT: rng.range(2, 8) }));
    this.t = 0;
    services.wildlife = this;
  }

  /** Gunfire or an engine at (x, z): every flock within r metres panics. */
  scare(x, z, r = 70) {
    for (const f of this.flocks) {
      if (dist2(f.x, f.z, x, z) > r + f.r) continue;
      for (const gull of f.gulls) gull.scatter = 1;
    }
  }

  update(dt, focus, night, rain) {
    this.t += dt;
    const stay = night < 0.55 && rain < 0.4;
    for (const f of this.flocks) {
      const near = stay && dist2(f.x, f.z, focus.x, focus.z) < 260;
      for (const gull of f.gulls) {
        gull.group.visible = near;
        if (near) gull.update(dt, this.t);
      }
      f.cryT -= dt;
      if (near && f.cryT <= 0) {
        f.cryT = rng.range(5, 14);
        if (dist2(f.x, f.z, focus.x, focus.z) < 110) services.audio?.gull({ x: f.x, z: f.z });
      }
    }
  }
}
