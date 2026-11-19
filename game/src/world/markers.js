// Glowing world markers: the light columns that show where a mission, shop, race checkpoint or save
// point is, plus spinning pickups (Sun Tokens, health hearts, cash bags).
import * as THREE from 'three';
import { services } from '../core/services.js';
import { groundHeight } from './cityPlan.js';

const columnGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20).rotateX(Math.PI / 2);
const heartGeo = new THREE.OctahedronGeometry(0.4, 0);
const bagGeo = new THREE.SphereGeometry(0.4, 10, 8).scale(1, 0.85, 0.8);

export const MARKER_COLORS = { mission: 0xffd25e, shop: 0x4fa8ff, save: 0x5dff8a, race: 0xb06bff, job: 0xff7a1a, spray: 0x2de2c8, checkpoint: 0xff4fa0, target: 0xff3b3b };

export class Marker {
  constructor(kind, radius = 1.6, height = 3) {
    const color = MARKER_COLORS[kind] ?? 0xffffff;
    this.group = new THREE.Group();
    this.column = new THREE.Mesh(columnGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.column.scale.set(radius, height, radius);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.ring.scale.setScalar(radius);
    this.ring.position.y = 0.25;
    this.group.add(this.column, this.ring);
    this.kind = kind;
    this.radius = radius;
    services.scene.add(this.group);
    this.visible = true;
  }

  place(x, z, y = null) { this.group.position.set(x, (y ?? groundHeight(x, z)) + 0.0, z); this.x = x; this.z = z; return this; }

  show(v) { this.group.visible = v; this.visible = v; }

  animate(t) {
    if (!this.visible) return;
    const s = 1 + Math.sin(t * 3) * 0.06;
    this.ring.scale.setScalar(this.radius * s);
    this.column.material.opacity = 0.24 + Math.sin(t * 2.4) * 0.08;
  }

  dispose() { services.scene.remove(this.group); }
}

export class Pickup {
  constructor(kind, x, z, y = null) {
    this.kind = kind;
    const mat = kind === 'token'
      ? new THREE.MeshStandardMaterial({ color: 0xffd25e, metalness: 0.9, roughness: 0.25, emissive: 0xffa020, emissiveIntensity: 0.45 })
      : kind === 'health' ? new THREE.MeshStandardMaterial({ color: 0x5dff8a, emissive: 0x20ff60, emissiveIntensity: 0.6 })
        : kind === 'armor' ? new THREE.MeshStandardMaterial({ color: 0x4fa8ff, emissive: 0x2070ff, emissiveIntensity: 0.6 })
          : new THREE.MeshStandardMaterial({ color: 0x3c7a3a, roughness: 0.9 });
    this.mesh = new THREE.Mesh(kind === 'token' ? coinGeo : kind === 'cash' ? bagGeo : heartGeo, mat);
    this.x = x; this.z = z;
    this.baseY = (y ?? groundHeight(x, z)) + 1.0;
    this.mesh.position.set(x, this.baseY, z);
    this.mesh.castShadow = true;
    services.scene.add(this.mesh);
    this.active = true;
  }

  animate(t) {
    if (!this.active) return;
    this.mesh.rotation.y = t * 2.2;
    this.mesh.position.y = this.baseY + Math.sin(t * 2 + this.x) * 0.15;
  }

  setActive(v) { this.active = v; this.mesh.visible = v; }

  dispose() { services.scene.remove(this.mesh); }
}
