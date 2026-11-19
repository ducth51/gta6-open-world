// One car: arcade driving physics (grip, handbrake drifts, braking and reverse), collisions with the
// city, damage with smoke, fire and explosion, lights, sirens and the mesh that follows it all.
import * as THREE from 'three';
import { CAR_MODELS, buildCarMesh, wreckMaterial } from './carModels.js';
import { services } from '../core/services.js';
import { clamp, damp, rng } from '../util/mathx.js';
import { groundHeight, clampToWorld } from '../world/cityPlan.js';

const _out = { x: 0, z: 0 };
let nextId = 1;

export class Vehicle {
  constructor(modelId, x, z, yaw, color) {
    this.id = nextId++;
    this.model = modelId;
    this.def = CAR_MODELS[modelId];
    this.color = color ?? rng.pick(this.def.colors);
    this.parts = buildCarMesh(this.def, this.color);
    this.mesh = this.parts.root;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.vx = 0; this.vz = 0;
    this.steerAngle = 0;
    this.health = this.def.health;
    this.dead = false;
    this.burnT = 0;
    this.driver = null;
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.sirenOn = false;
    this.braking = false;
    this.halfW = this.def.w / 2;
    this.halfLen = this.def.len / 2;
    this.smokeT = 0;
    this.roll = 0; this.pitch = 0;
    this.lastHit = 0;
    this.locked = false;
    this.mission = null;
    this.wreckT = 0;
    services.scene.add(this.mesh);
    this.syncMesh(0);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get isPolice() { return !!this.def.police; }

  /** Centres of the two circles approximating the body, front then rear. */
  circles() {
    const off = this.halfLen - this.halfW;
    const fx = Math.sin(this.yaw) * off, fz = Math.cos(this.yaw) * off;
    return [[this.pos.x + fx, this.pos.z + fz], [this.pos.x - fx, this.pos.z - fz]];
  }

  /** Point beside the driver's door, where people get in and out. */
  doorPoint() {
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const side = -(this.halfW + 0.7);
    return { x: this.pos.x + rx * side, z: this.pos.z + rz * side };
  }

  update(dt) {
    this.physics(dt);
    this.collideStatic();
    this.updateDamageState(dt);
    this.syncMesh(dt);
  }

  physics(dt) {
    const d = this.def;
    const c = this.dead || !this.driver ? { throttle: 0, steer: 0, handbrake: !this.dead && !this.driver } : this.controls;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    this.braking = false;
    if (c.throttle > 0) {
      if (vF < -0.5) { vF = Math.min(0, vF + 24 * c.throttle * dt); this.braking = true; }
      else vF += d.accel * c.throttle * Math.max(0, 1 - (vF / d.maxSpeed) ** 2) * dt;
    } else if (c.throttle < 0) {
      if (vF > 0.5) { vF = Math.max(0, vF + 24 * c.throttle * dt); this.braking = true; }
      else if (vF > -d.maxSpeed * 0.3) vF += d.accel * 0.6 * c.throttle * dt;
    } else {
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), (1.6 + Math.abs(vF) * 0.03) * dt);
    }
    if (c.handbrake) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 7 * dt); this.braking = true; }
    const grip = c.handbrake ? 1.4 : d.grip * (Math.abs(vR) > 7 ? 0.55 : 1);
    vR *= Math.exp(-grip * dt);

    this.steerAngle = damp(this.steerAngle, c.steer, 7, dt);
    const sf = clamp(Math.abs(vF) / 5, 0, 1) * (1 - 0.5 * clamp(Math.abs(vF) / d.maxSpeed, 0, 1));
    const yawRate = -this.steerAngle * d.steer * sf * Math.sign(vF || 1) * (c.handbrake ? 1.45 : 1);
    this.yaw += yawRate * dt;

    // Normally the velocity follows the new heading; on the handbrake it keeps the old one and slides.
    const keep = c.handbrake ? 0 : 1;
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw);
    const ffx = fx + (nfx - fx) * keep, ffz = fz + (nfz - fz) * keep;
    this.vx = ffx * vF + rx * vR;
    this.vz = ffz * vF + rz * vR;
    this.lateral = vR;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    clampToWorld(this.pos);
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.accelVis = (vF - (this._lastVF ?? vF)) / Math.max(dt, 1e-4);
    this._lastVF = vF;
  }

  collideStatic() {
    const col = services.colliders;
    const circles = this.circles();
    for (const [cx, cz] of circles) {
      const hit = col.resolveCircle(cx, cz, this.halfW + 0.05, this.pos.y + 0.2, 1.3, _out);
      if (!hit) continue;
      this.pos.x += _out.x - cx;
      this.pos.z += _out.z - cz;
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.vx -= hit.nx * vn * 1.3;
        this.vz -= hit.nz * vn * 1.3;
        this.vx *= 0.9; this.vz *= 0.9;
        this.impact(-vn, cx - hit.nx * this.halfW, cz - hit.nz * this.halfW);
      }
    }
  }

  /** A crash of closing speed `s` at (x, z): sparks, a thud and damage when hard enough. */
  impact(s, x, z, other = null) {
    if (s < 3) return;
    const now = services.time;
    if (now - this.lastHit > 0.25) {
      services.audio?.crash(this.pos, Math.min(1, s / 18));
      services.effects?.sparks(x, this.pos.y + 0.6, z, Math.min(20, s * 1.2));
      this.lastHit = now;
    }
    if (s > 6) this.damage((s - 6) * 3.2 * (other ? 0.8 : 1), other?.driver ?? null);
    if (this.driver === 'player' && s > 8) services.game?.cameraRig.shake(Math.min(0.6, s / 40));
  }

  damage(amount, source) {
    if (this.dead) return;
    this.health -= amount;
    if (source === 'player' || source?.isPlayer) this.lastAttacker = 'player';
    if (this.health <= 0 && this.burnT <= 0) {
      this.health = 0;
      this.burnT = 3.5;
    }
  }

  updateDamageState(dt) {
    if (this.dead) {
      this.wreckT += dt;
      if (this.wreckT < 8 && rng.chance(dt * 12)) services.effects?.smoke(this.pos.x, this.pos.y + 1.2, this.pos.z, 1.6, 0.25);
      return;
    }
    const hp = this.health / this.def.health;
    this.smokeT -= dt;
    if (hp < 0.4 && this.smokeT <= 0) {
      this.smokeT = hp <= 0 ? 0.03 : 0.12;
      const fx = Math.sin(this.yaw) * this.halfLen * 0.7, fz = Math.cos(this.yaw) * this.halfLen * 0.7;
      services.effects?.smoke(this.pos.x + fx, this.pos.y + 1.0, this.pos.z + fz, hp <= 0 ? 1.2 : 0.8, hp < 0.2 ? 0.15 : 0.55);
      if (hp <= 0) services.effects?.fire(this.pos.x + fx, this.pos.y + 1.0, this.pos.z + fz);
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      if (this.burnT <= 0) this.explode();
    }
    // Tyre smoke when sliding hard.
    if (Math.abs(this.lateral ?? 0) > 5.5 && this.speed > 8 && rng.chance(dt * 30)) {
      const bx = -Math.sin(this.yaw) * this.halfLen * 0.7, bz = -Math.cos(this.yaw) * this.halfLen * 0.7;
      services.effects?.smoke(this.pos.x + bx, this.pos.y + 0.3, this.pos.z + bz, 1.0, 0.85, true);
    }
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.burnT = 0;
    this.health = 0;
    services.effects?.explosion(this.pos.x, this.pos.y + 0.8, this.pos.z);
    services.audio?.explosion(this.pos);
    services.game?.radiusDamage(this.pos.x, this.pos.z, 7, 140, this.lastAttacker === 'player' ? 'player' : null, this);
    this.parts.body.traverse((m) => { if (m.isMesh && m.material !== this.parts.headMat) m.material = wreckMaterial(); });
    this.parts.headMat.emissiveIntensity = 0;
    this.parts.tailMat.emissiveIntensity = 0;
    this.vx *= 0.3; this.vz *= 0.3;
    this.sirenOn = false;
    services.game?.onVehicleDestroyed(this);
  }

  syncMesh(dt) {
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;
    const vF = this.forwardSpeed;
    for (const w of this.parts.wheels) w.rotation.x += (vF * dt) / 0.38;
    for (const p of this.parts.frontWheels) p.rotation.y = -this.steerAngle * 0.5;
    if (dt > 0) {
      this.roll = damp(this.roll, clamp(this.steerAngle * vF * 0.004 + (this.lateral ?? 0) * 0.01, -0.09, 0.09), 6, dt);
      this.pitch = damp(this.pitch, clamp(-(this.accelVis || 0) * 0.004, -0.05, 0.05), 6, dt);
    }
    this.parts.body.rotation.z = this.roll;
    this.parts.body.rotation.x = this.pitch;
    if (!this.dead) {
      const night = services.game?.sky.night ?? 0;
      this.parts.headMat.emissiveIntensity = 0.3 + night * 2.5;
      this.parts.tailMat.emissiveIntensity = this.braking ? 2.6 : 0.4 + night * 0.8;
      if (this.parts.sirenMats.length) {
        const t = services.time * 9;
        const on = this.sirenOn;
        this.parts.sirenMats[0].emissiveIntensity = on ? (Math.sin(t) > 0 ? 5 : 0.2) : 0.15;
        this.parts.sirenMats[1].emissiveIntensity = on ? (Math.sin(t) > 0 ? 0.2 : 5) : 0.15;
      }
    }
  }

  dispose() {
    services.scene.remove(this.mesh);
  }
}

/** Pushes overlapping cars apart and trades momentum along the contact normal. */
export function collideVehicles(a, b) {
  const ca = a.circles(), cb = b.circles();
  const r = a.halfW + b.halfW;
  for (const [ax, az] of ca) for (const [bx, bz] of cb) {
    const dx = bx - ax, dz = bz - az;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = r - d;
    const ma = a.def.mass * (a.dead ? 3 : 1), mb = b.def.mass * (b.dead ? 3 : 1);
    const ta = mb / (ma + mb), tb = ma / (ma + mb);
    a.pos.x -= nx * pen * ta; a.pos.z -= nz * pen * ta;
    b.pos.x += nx * pen * tb; b.pos.z += nz * pen * tb;
    const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rel < 0) {
      const j = -(1.35 * rel) / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz;
      b.vx += (j / mb) * nx; b.vz += (j / mb) * nz;
      const px = (ax + bx) / 2, pz = (az + bz) / 2;
      a.impact(-rel, px, pz, b);
      b.impact(-rel, px, pz, a);
      if (a.driver === 'player' || b.driver === 'player') services.game?.onPlayerCarContact(a.driver === 'player' ? b : a, -rel);
    }
  }
}
