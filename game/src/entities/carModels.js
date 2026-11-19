// The cars of Palmera Bay: handling numbers and low-poly bodies for each model, all original
// designs (Vortex GT, Marlin, Paloma Coupe, Tidewater Van, Dune Hopper, Bay Cab, PBPD Interceptor,
// Bastion riot van), built from boxes and cylinders.
import * as THREE from 'three';

export const CAR_MODELS = {
  vortex: { name: 'Vortex GT', w: 1.95, len: 4.5, body: 0.5, cabin: 0.5, cabinLen: 1.9, cabinZ: -0.35, maxSpeed: 56, accel: 15, grip: 9, steer: 2.3, mass: 1.1, health: 90, price: 'sport', colors: [0xff3b5c, 0xffd25e, 0x2de2c8, 0xff7a1a, 0xf5f5f5] },
  marlin: { name: 'Marlin', w: 1.9, len: 4.7, body: 0.62, cabin: 0.6, cabinLen: 2.4, cabinZ: -0.2, maxSpeed: 42, accel: 9.5, grip: 7.5, steer: 2.0, mass: 1.3, health: 110, colors: [0x2f5d8a, 0x9aa3ad, 0x5a2a3a, 0xe8e2d0, 0x30343a, 0x6f8f5f] },
  coupe: { name: 'Paloma Coupe', w: 1.85, len: 4.3, body: 0.56, cabin: 0.55, cabinLen: 1.9, cabinZ: -0.25, maxSpeed: 47, accel: 11.5, grip: 8.5, steer: 2.2, mass: 1.15, health: 100, colors: [0xff8fb0, 0x8fe3d0, 0xf2f2f2, 0xb08cff] },
  tidewater: { name: 'Tidewater Van', w: 2.1, len: 5.2, body: 1.25, cabin: 0.65, cabinLen: 4.4, cabinZ: -0.3, maxSpeed: 33, accel: 6.5, grip: 6.5, steer: 1.7, mass: 2.0, health: 150, van: true, colors: [0xf5f5f5, 0xe8d7a8, 0x6fb6e8, 0x8a8f96] },
  dune: { name: 'Dune Hopper', w: 2.0, len: 4.9, body: 0.75, cabin: 0.65, cabinLen: 1.7, cabinZ: 0.55, maxSpeed: 39, accel: 9, grip: 7, steer: 1.9, mass: 1.6, health: 140, pickup: true, colors: [0xc0392b, 0xd68910, 0x1e8449, 0x3a3a3a, 0xe8e2d0] },
  cab: { name: 'Bay Cab', w: 1.9, len: 4.7, body: 0.62, cabin: 0.6, cabinLen: 2.4, cabinZ: -0.2, maxSpeed: 41, accel: 9.5, grip: 7.5, steer: 2.0, mass: 1.3, health: 110, taxi: true, colors: [0xffc21a] },
  police: { name: 'PBPD Interceptor', w: 1.95, len: 4.8, body: 0.62, cabin: 0.58, cabinLen: 2.3, cabinZ: -0.2, maxSpeed: 50, accel: 13.5, grip: 8.5, steer: 2.2, mass: 1.4, health: 140, police: true, colors: [0x15181e] },
  bastion: { name: 'Bastion', w: 2.3, len: 5.6, body: 1.35, cabin: 0.7, cabinLen: 4.8, cabinZ: -0.3, maxSpeed: 38, accel: 9, grip: 7, steer: 1.7, mass: 2.6, health: 260, van: true, police: true, colors: [0x1c1f24] },
};

export const TRAFFIC_MIX = ['marlin', 'marlin', 'coupe', 'coupe', 'cab', 'tidewater', 'dune', 'marlin', 'vortex', 'coupe'];

const bodyMats = new Map();
function paint(hex) {
  let m = bodyMats.get(hex);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.55, roughness: 0.32 }); bodyMats.set(hex, m); }
  return m;
}
const M = {
  glass: new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.8, roughness: 0.12 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.9, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 0.4, roughness: 0.35 }),
  wreck: new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 1 }),
};
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8).rotateZ(Math.PI / 2);
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * Builds a car body facing +z. Returns { root, body, wheels, frontWheels, headMat, tailMat, sirenMats }.
 */
export function buildCarMesh(def, color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pm = paint(color);
  const { w, len, body: bh, cabin: ch, cabinLen, cabinZ } = def;
  const base = 0.32;
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.set(w + 0.5, 1, len + 0.6);
  shadow.position.y = 0.03;
  root.add(shadow);

  box(w, bh, len, pm, 0, base + bh / 2, 0, body);
  if (!def.van) {
    // Sloped hood and boot read as a car rather than a brick.
    const hood = box(w * 0.98, 0.12, len * 0.28, pm, 0, base + bh + 0.02, len * 0.33, body);
    hood.rotation.x = 0.06;
  }
  const cabin = box(w * 0.84, ch, cabinLen, M.glass, 0, base + bh + ch / 2, cabinZ, body);
  const roofMat = def.police && !def.van ? M.white : pm;
  box(w * 0.86, 0.08, cabinLen * 0.9, roofMat, 0, base + bh + ch + 0.03, cabinZ - 0.02, body);
  // Pillars and a belt line frame the glass so the cabin reads as windows, not a black box.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      if (sz === 0 && cabinLen < 2.2) continue;
      box(0.09, ch, 0.12, roofMat, sx * w * 0.42, base + bh + ch / 2, cabinZ + sz * (cabinLen / 2 - 0.06), body);
    }
    box(0.05, 0.05, cabinLen, M.rim, sx * w * 0.43, base + bh + 0.02, cabinZ, body);
  }
  if (def.pickup) {
    box(0.12, 0.35, len * 0.42, pm, w / 2 - 0.06, base + bh + 0.17, -len * 0.25, body);
    box(0.12, 0.35, len * 0.42, pm, -w / 2 + 0.06, base + bh + 0.17, -len * 0.25, body);
    box(w, 0.35, 0.12, pm, 0, base + bh + 0.17, -len / 2 + 0.06, body);
  }
  if (def.police && !def.van) {
    box(w + 0.02, 0.3, len * 0.42, M.white, 0, base + bh * 0.55, 0.1, body);
  }
  // Bumpers.
  box(w + 0.04, 0.22, 0.18, M.trim, 0, base + 0.12, len / 2, body);
  box(w + 0.04, 0.22, 0.18, M.trim, 0, base + 0.12, -len / 2, body);
  // Lights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) {
    box(0.42, 0.14, 0.06, headMat, s * (w / 2 - 0.3), base + bh * 0.72, len / 2 + 0.01, body);
    box(0.42, 0.14, 0.06, tailMat, s * (w / 2 - 0.3), base + bh * 0.72, -len / 2 - 0.01, body);
  }
  const sirenMats = [];
  if (def.police) {
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2050ff, emissiveIntensity: 0.2 });
    const y = base + bh + ch + 0.14;
    box(w * 0.38, 0.14, 0.3, red, -w * 0.2, y, cabinZ + 0.1, body);
    box(w * 0.38, 0.14, 0.3, blue, w * 0.2, y, cabinZ + 0.1, body);
    sirenMats.push(red, blue);
  }
  if (def.taxi) {
    box(0.7, 0.22, 0.3, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe08a, emissiveIntensity: 0.5 }), 0, base + bh + ch + 0.18, cabinZ, body);
    box(w + 0.02, 0.1, len * 0.6, M.trim, 0, base + bh * 0.5, 0, body);
  }
  // Wheels.
  const wheels = [], frontWheels = [];
  const wx = w / 2 - 0.12, wz = len / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, 0.38, sz * wz);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, M.tyre); tyre.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, M.rim);
    spin.add(tyre, rim);
    pivot.add(spin);
    root.add(pivot);
    wheels.push(spin);
    if (sz > 0) frontWheels.push(pivot);
  }
  return { root, body, wheels, frontWheels, headMat, tailMat, sirenMats, paint: pm, cabin };
}

export function wreckMaterial() { return M.wreck; }
