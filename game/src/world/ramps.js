// Stunt ramps: orange-and-white wedges on the beach strip and along the Old Harbor streets. Cars read
// `rampHeightAt` as extra ground under their wheels, so a ramp lifts them and, at its far end, throws
// them into the air. The stunt system watches the take-offs and landings.
import * as THREE from 'three';
import { MeshBuilder } from './meshBuilder.js';
import { groundHeight } from './cityPlan.js';
import { RAMPS, RAMP_LEN, RAMP_WIDTH, RAMP_RISE } from './rampLayout.js';

/** Builds every ramp as one mesh, a hazard stripe along each slope, and a pair of flag poles. */
export function buildRamps() {
  const group = new THREE.Group();
  group.name = 'ramps';
  const mb = new MeshBuilder();
  const w = RAMP_WIDTH, L = RAMP_LEN, h = RAMP_RISE;
  const wedge = (base) => {
    const strips = 6;
    for (let k = 0; k < strips; k++) {
      const z0 = (k / strips) * L, z1 = ((k + 1) / strips) * L;
      const color = k % 2 ? 0xfdf6ea : 0xff7a1a;
      mb.face(-w / 2, (h * z0) / L, z0, 0, (h * (z1 - z0)) / L, z1 - z0, w, 0, 0, color);
    }
    mb.tri([-w / 2, 0, 0], [-w / 2, 0, L], [-w / 2, h, L], 0xd85f10);
    mb.tri([w / 2, 0, 0], [w / 2, h, L], [w / 2, 0, L], 0xd85f10);
    mb.face(-w / 2, 0, L, w, 0, 0, 0, h, 0, base);
  };
  wedge(0x6b3510);
  const geo = mb.build();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xff3d8b, side: THREE.DoubleSide });
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6).translate(0, 1.6, 0);
  const flag = new THREE.PlaneGeometry(0.9, 0.55).translate(0.45, 2.9, 0);
  for (const r of RAMPS) {
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    holder.add(mesh);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pole, poleMat);
      p.position.set(side * (w / 2 + 0.6), 0, L + 0.4);
      const f = new THREE.Mesh(flag, flagMat);
      f.position.copy(p.position);
      holder.add(p, f);
    }
    holder.position.set(r.x, groundHeight(r.x, r.z), r.z);
    holder.rotation.y = r.yaw;
    group.add(holder);
  }
  return group;
}
