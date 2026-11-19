// Life on the bay: pastel sailboats tacking up and down the coast and two ferries, all drifting past
// the beach on their own lines, bobbing on the swell. They are scenery (nobody boards them), but they
// fill the title flyover and every view out over the water.
import * as THREE from 'three';
import { OCEAN_X, CITY_SIZE } from '../config.js';
import { WATER_LEVEL } from './cityPlan.js';
import { makeRng } from '../util/mathx.js';

const hullMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
const sailMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide });
const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.6 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x20343f, metalness: 0.7, roughness: 0.2 });

const SPAN = { z0: -150, z1: CITY_SIZE + 160 };

function triangle(a, b, c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

function sailboat(r) {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 5.6), hullMat(r.pick([0xffffff, 0xff7a59, 0x2de2c8, 0xffd25e, 0x4f7cff])));
  hull.position.y = 0.35;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), hull.material);
  bow.position.set(0, 0.35, 3.5);
  bow.scale.set(1, 0.47, 1);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.8), glassMat);
  cabin.position.set(0, 1.0, -0.4);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 7.4, 6), mastMat);
  mast.position.set(0, 4.2, 0.6);
  const color = r.pick([0xffffff, 0xfff1c9, 0xffb3c7, 0xa8f0d8]);
  const main = new THREE.Mesh(triangle([0, 1.2, -2.3], [0, 1.2, 0.5], [0, 7.4, 0.55]), sailMat(color));
  const jib = new THREE.Mesh(triangle([0, 1.1, 3.6], [0, 1.2, 0.8], [0, 6.2, 0.7]), sailMat(color));
  root.add(hull, bow, cabin, mast, main, jib);
  return root;
}

function ferry() {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 26), hullMat(0xf5f5f5));
  hull.position.y = 0.9;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.5, 26.1), hullMat(0xff3d8b));
  stripe.position.y = 1.6;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 1.8, 15), hullMat(0xe9e4da));
  deck.position.set(0, 3.0, -2);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.7, 14), glassMat);
  windows.position.set(0, 3.3, -2);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 4), hullMat(0xf5f5f5));
  bridge.position.set(0, 4.6, 4);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.4, 8), hullMat(0xffd25e));
  funnel.position.set(0, 5.1, -6);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(3.5, 5, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), hull.material);
  bow.position.set(0, 0.9, 15.4);
  bow.scale.set(1, 0.31, 1);
  root.add(hull, stripe, deck, windows, bridge, funnel, bow);
  return root;
}

export class BayTraffic {
  constructor(scene) {
    const r = makeRng(2026);
    this.boats = [];
    const lanes = [OCEAN_X + 70, OCEAN_X + 120, OCEAN_X + 175, OCEAN_X + 240, OCEAN_X + 310, OCEAN_X + 90, OCEAN_X + 205];
    lanes.forEach((x, i) => {
      const mesh = sailboat(r);
      this.boats.push({ mesh, x, z: r.range(SPAN.z0, SPAN.z1), speed: (r.chance(0.5) ? 1 : -1) * r.range(1.6, 3.2), phase: r.range(0, 6.28), heel: 0.08 + 0.03 * (i % 3) });
    });
    [{ x: OCEAN_X + 380, speed: 5.5 }, { x: OCEAN_X + 450, speed: -4.8 }].forEach((f, i) => {
      this.boats.push({ mesh: ferry(), x: f.x, z: i ? SPAN.z1 - 200 : SPAN.z0 + 100, speed: f.speed, phase: i * 2, heel: 0.02 });
    });
    for (const b of this.boats) scene.add(b.mesh);
  }

  update(t, dt) {
    for (const b of this.boats) {
      b.z += b.speed * dt;
      if (b.z > SPAN.z1) b.z = SPAN.z0;
      if (b.z < SPAN.z0) b.z = SPAN.z1;
      const m = b.mesh;
      m.position.set(b.x, WATER_LEVEL - 0.05 + Math.sin(t * 0.9 + b.phase) * 0.12, b.z);
      m.rotation.set(Math.sin(t * 0.7 + b.phase) * 0.025, b.speed > 0 ? 0 : Math.PI, Math.sin(t * 0.5 + b.phase * 2) * b.heel);
    }
  }
}
