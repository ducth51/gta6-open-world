// Traffic lights at all 121 junctions: poles with red, amber and green lamps on every corner, phases
// that run out of step from junction to junction, and the stop-line maths cruising drivers use to
// wait at a red. Pursuits ignore the lights; everybody else obeys them.
import * as THREE from 'three';
import { CELL, GRID, ROAD } from '../config.js';
import { services } from '../core/services.js';

const GREEN = 13, AMBER = 3, ALL_RED = 1.5;
const HALF = GREEN + AMBER + ALL_RED;
const TOTAL = HALF * 2;
const CORNER = ROAD / 2 + 0.85;
const KERB = 0.18;

/** 'green', 'amber' or 'red' for traffic running along `axis` ('x' east-west, 'z' north-south). */
export function lightState(axis, i, j, t) {
  const offset = ((i * 7 + j * 3) % 6) * 5;
  let p = (t + offset) % TOTAL;
  if (axis === 'x') p = (p + HALF) % TOTAL;
  if (p < GREEN) return 'green';
  if (p < GREEN + AMBER) return 'amber';
  return 'red';
}

export class TrafficLights {
  constructor(scene) {
    const n = (GRID + 1) * (GRID + 1) * 4;
    this.count = n;
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5, 6).translate(0, 2.5, 0);
    const headGeo = new THREE.BoxGeometry(0.48, 1.3, 0.48).translate(0, 5.25, 0);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.3 });
    this.poles = new THREE.InstancedMesh(poleGeo, dark, n);
    this.heads = new THREE.InstancedMesh(headGeo, dark, n);
    this.poles.castShadow = true;
    const lampGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const lamp = (color) => new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false }), n);
    this.lamps = { red: lamp(0xff3030), amber: lamp(0xffb020), green: lamp(0x38ff7a) };
    this.lampY = { red: 5.62, amber: 5.25, green: 4.88 };
    const m = new THREE.Matrix4();
    this.corners = [];
    this.hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const cx = i * CELL + ROAD / 2, cz = j * CELL + ROAD / 2;
        for (let c = 0; c < 4; c++) {
          const sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1;
          const index = (j * (GRID + 1) + i) * 4 + c;
          const x = cx + sx * CORNER, z = cz + sz * CORNER;
          m.makeTranslation(x, KERB, z);
          this.poles.setMatrixAt(index, m);
          this.heads.setMatrixAt(index, m);
          this.corners.push({ index, x: x - sx * 0.26, z: z - sz * 0.26, axis: sx * sz > 0 ? 'z' : 'x', i, j, shown: '' });
        }
      }
    }
    scene.add(this.poles, this.heads, this.lamps.red, this.lamps.amber, this.lamps.green);
    this.lastCheck = -1;
    this.update(0);
    services.lights = this;
  }

  /** Phases only change every few seconds, so the lamps are re-checked five times a second, not every frame. */
  update(t) {
    if (t >= this.lastCheck && t - this.lastCheck < 0.2) return;
    this.lastCheck = t;
    const m = new THREE.Matrix4();
    let dirty = false;
    for (const c of this.corners) {
      const state = lightState(c.axis, c.i, c.j, t);
      if (state === c.shown) continue;
      c.shown = state;
      dirty = true;
      for (const key of ['red', 'amber', 'green']) {
        if (key === state) this.lamps[key].setMatrixAt(c.index, m.makeTranslation(c.x, KERB + this.lampY[key], c.z));
        else this.lamps[key].setMatrixAt(c.index, this.hidden);
      }
    }
    if (!dirty) return;
    for (const key of ['red', 'amber', 'green']) this.lamps[key].instanceMatrix.needsUpdate = true;
  }

  /**
   * Metres to the stop line ahead of a car at (x, z) heading `yaw`, when it must stop there
   * (a red, or an amber it has time to stop for); Infinity when it may drive on.
   */
  stopDistance(x, z, yaw, speed) {
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    const alongX = Math.abs(sx) > Math.abs(sz);
    const dir = Math.sign(alongX ? sx : sz) || 1;
    const coord = alongX ? x : z, lane = alongX ? z : x;
    const half = ROAD / 2;
    const m = Math.round((lane - half) / CELL);
    if (m < 0 || m > GRID || Math.abs(lane - (m * CELL + half)) > half) return Infinity;
    const guess = Math.round((coord - half) / CELL);
    let best = Infinity, node = -1;
    for (let k = Math.max(0, guess - 1); k <= Math.min(GRID, guess + 1); k++) {
      const stopLine = k * CELL + half - dir * (half + 1.6);
      const ahead = (stopLine - coord) * dir;
      if (ahead >= -0.6 && ahead < best) { best = ahead; node = k; }
    }
    if (node < 0 || best > 32) return Infinity;
    const state = lightState(alongX ? 'x' : 'z', alongX ? node : m, alongX ? m : node, services.time);
    if (state === 'green') return Infinity;
    if (state === 'amber' && best < speed * 0.9 + 2.5) return Infinity;
    return Math.max(0, best);
  }
}
