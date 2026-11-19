// Air support: from three stars the PBPD sends a helicopter. It circles over the suspect with a
// searchlight cone, keeps the stars from fading while it can see them, opens fire from four stars,
// and can be shot out of the sky. Built from boxes and spheres like every vehicle in the city.
import * as THREE from 'three';
import { services } from '../core/services.js';
import { groundHeight } from '../world/cityPlan.js';
import { WEAPONS, AIR_SUPPORT_LEVEL, GUNNER_LEVEL } from '../config.js';
import { clamp, damp, dampAngle, dist2, rng } from '../util/mathx.js';

const hull = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.55, roughness: 0.35 });
const stripe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.4 });
const glass = new THREE.MeshStandardMaterial({ color: 0x9ed4ff, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.7 });
const metal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.6, metalness: 0.5 });
const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
const coneGeo = new THREE.CylinderGeometry(0.35, 4.6, 1, 22, 1, true).translate(0, -0.5, 0);

export class PoliceHeli {
  constructor(x, z, altitude = 46) {
    this.group = new THREE.Group();
    const add = (geo, mat, x0, y0, z0, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x0, y0, z0);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(new THREE.SphereGeometry(1.5, 14, 10).scale(1, 0.92, 1.8), hull, 0, 0, 0);
    add(new THREE.SphereGeometry(1.1, 12, 8).scale(1, 0.85, 1), glass, 0, 0.25, 1.65);
    add(new THREE.BoxGeometry(2.7, 0.18, 1.2), stripe, 0, 0.1, -0.2);
    add(new THREE.BoxGeometry(0.42, 0.42, 4.6), hull, 0, 0.35, -3.6);
    add(new THREE.BoxGeometry(0.1, 1.4, 0.9), hull, 0, 1.0, -5.7);
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.28, 1.0, -5.8);
    add(new THREE.BoxGeometry(0.06, 1.5, 0.14), metal, 0, 0, 0, this.tailRotor);
    add(new THREE.BoxGeometry(0.06, 0.14, 1.5), metal, 0, 0, 0, this.tailRotor);
    this.group.add(this.tailRotor);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.1, 3.2), metal, s * 1.05, -1.5, 0.2);
      add(new THREE.BoxGeometry(0.08, 0.8, 0.08), metal, s * 1.05, -1.1, 1.0);
      add(new THREE.BoxGeometry(0.08, 0.8, 0.08), metal, s * 1.05, -1.1, -0.6);
    }
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), metal, 0, 1.6, 0);
    this.rotor = new THREE.Group();
    this.rotor.position.y = 1.95;
    add(new THREE.BoxGeometry(8.6, 0.07, 0.34), metal, 0, 0, 0, this.rotor);
    add(new THREE.BoxGeometry(0.34, 0.07, 8.6), metal, 0, 0, 0, this.rotor);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    this.rotor.add(disc);
    this.group.add(this.rotor);
    this.beam = new THREE.Mesh(coneGeo, coneMat);
    this.beam.frustumCulled = false;
    this.glow = new THREE.PointLight(0xfff0cc, 0, 38, 1.4);
    services.scene.add(this.group, this.beam, this.glow);

    this.pos = new THREE.Vector3(x, altitude, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.orbit = rng.range(0, Math.PI * 2);
    this.altitude = altitude;
    this.health = 320;
    this.dead = false;
    this.leaving = false;
    this.done = false;
    this.fireCd = 2;
    this.spin = 0;
    this.lastAttacker = null;
    this.tilt = 0;
    this.sync();
  }

  get alive() { return !this.dead && !this.done; }

  damage(amount, source) {
    if (this.dead) return;
    this.health -= amount;
    this.lastAttacker = source;
    services.effects?.sparks(this.pos.x, this.pos.y, this.pos.z, 6);
    if (this.health <= 0) {
      this.dead = true;
      this.vel.multiplyScalar(0.4);
      if (source === 'player' || source?.isPlayer) {
        services.game.police.report('heliDown', this.pos.x, this.pos.z);
        services.game.stats.helisDowned = (services.game.stats.helisDowned ?? 0) + 1;
      }
    }
  }

  update(dt) {
    const g = services.game, player = g.player;
    const pp = player.vehicle ? player.vehicle.pos : player.pos;
    this.rotor.rotation.y += dt * (this.dead ? 10 : 42);
    this.tailRotor.rotation.x += dt * 55;
    if (this.dead) return this.fall(dt);

    if (this.leaving) {
      const dx = this.pos.x - pp.x, dz = this.pos.z - pp.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x = damp(this.vel.x, (dx / d) * 36, 1.2, dt);
      this.vel.z = damp(this.vel.z, (dz / d) * 36, 1.2, dt);
      this.vel.y = damp(this.vel.y, 5, 1, dt);
      if (d > 320) this.done = true;
    } else {
      const lead = player.vehicle ? 1.1 : 0.3;
      const tx = pp.x + (player.vehicle ? player.vehicle.vx * lead : 0), tz = pp.z + (player.vehicle ? player.vehicle.vz * lead : 0);
      this.orbit += dt * 0.34;
      const radius = 24 + (g.police.level >= 4 ? -5 : 0);
      const gx = tx + Math.cos(this.orbit) * radius, gz = tz + Math.sin(this.orbit) * radius;
      const gy = groundHeight(pp.x, pp.z) + this.altitude;
      const k = clamp(dist2(this.pos.x, this.pos.z, gx, gz) * 0.9, 0, 44);
      const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x = damp(this.vel.x, (dx / d) * k, 1.8, dt);
      this.vel.z = damp(this.vel.z, (dz / d) * k, 1.8, dt);
      this.vel.y = damp(this.vel.y, clamp((gy - this.pos.y) * 0.8, -8, 8), 2, dt);
      this.shoot(dt, pp, g);
    }
    this.pos.addScaledVector(this.vel, dt);
    const face = this.leaving ? Math.atan2(this.vel.x, this.vel.z) : Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, face, 2.2, dt);
    this.tilt = damp(this.tilt, clamp(Math.hypot(this.vel.x, this.vel.z) * 0.011, 0, 0.42), 3, dt);
    this.sync();
    this.aimBeam(pp, g.sky?.night ?? 0);
    const d = dist2(this.pos.x, this.pos.z, pp.x, pp.z);
    services.audio?.setRotor(clamp(1 - d / 230, 0, 1) * 0.9, clamp((this.pos.x - pp.x) / 80, -1, 1));
  }

  /** From four stars a gunner leans out and fires on the suspect. */
  shoot(dt, pp, g) {
    this.fireCd -= dt;
    const level = g.police.level;
    if (level < GUNNER_LEVEL || this.fireCd > 0) return;
    const d = dist2(this.pos.x, this.pos.z, pp.x, pp.z);
    if (d > 70 || !services.colliders.lineOfSight(this.pos.x, this.pos.y - 1, this.pos.z, pp.x, pp.y + 1, pp.z)) return;
    this.fireCd = rng.range(level >= 5 ? 0.35 : 0.7, level >= 5 ? 0.9 : 1.6);
    const gunner = { pos: { x: this.pos.x, y: this.pos.y - 1.4, z: this.pos.z }, yaw: this.yaw, accuracy: 0.34, weapon: 'smg' };
    g.combat.npcShoot(gunner, g.player, WEAPONS.smg, d);
  }

  fall(dt) {
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.yaw += dt * 5;
    this.tilt = damp(this.tilt, 0.5, 2, dt);
    this.beam.visible = false;
    this.glow.intensity = 0;
    if (rng.chance(dt * 40)) services.effects?.smoke(this.pos.x, this.pos.y, this.pos.z, 1.8, 0.2);
    services.effects?.fire(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.sync();
    if (this.pos.y <= groundHeight(this.pos.x, this.pos.z) + 1) {
      services.effects?.explosion(this.pos.x, this.pos.y + 0.6, this.pos.z);
      services.audio?.explosion(this.pos);
      services.game.radiusDamage(this.pos.x, this.pos.z, 11, 120, this.lastAttacker === 'player' || this.lastAttacker?.isPlayer ? 'player' : null, null);
      this.done = true;
    }
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.tilt, this.yaw, Math.sin(this.orbit * 3) * 0.05);
  }

  /** The searchlight reaches from the nose down to the ground under the suspect. */
  aimBeam(pp, night) {
    const gy = groundHeight(pp.x, pp.z);
    const dx = pp.x - this.pos.x, dy = gy - this.pos.y, dz = pp.z - this.pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    this.beam.position.copy(this.pos).y -= 1;
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    this.beam.scale.set(1, len, 1);
    this.beam.visible = true;
    coneMat.opacity = 0.045 + night * 0.16;
    this.glow.position.set(pp.x, gy + 3, pp.z);
    this.glow.intensity = 3 + night * 26;
  }

  dispose() {
    services.scene.remove(this.group, this.beam, this.glow);
    services.audio?.setRotor(0, 0);
  }
}

export class AirSupport {
  constructor(game) {
    this.game = game;
    this.heli = null;
    this.wantT = 0;
    services.air = this;
  }

  get active() { return !!this.heli && this.heli.alive; }

  update(dt) {
    const g = this.game, p = g.player;
    const wanted = g.police.level >= AIR_SUPPORT_LEVEL && !p.dead;
    if (wanted) {
      if (!this.heli) { this.wantT += dt; if (this.wantT > 7) this.spawn(); }
      else if (this.heli.leaving) this.heli.leaving = false;
    } else {
      this.wantT = 0;
      if (this.heli && !this.heli.leaving && !this.heli.dead) this.heli.leaving = true;
    }
    if (!this.heli) return;
    this.heli.update(dt);
    if (this.heli.done) { this.heli.dispose(); this.heli = null; this.wantT = -12; }
  }

  spawn() {
    const g = this.game, p = g.player;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    const a = rng.range(0, Math.PI * 2);
    this.heli = new PoliceHeli(pp.x + Math.cos(a) * 280, pp.z + Math.sin(a) * 280);
    g.notify('A police helicopter is closing in.');
  }

  /** Does the helicopter have eyes on (pp)? Keeps the stars from fading. */
  canSee(pp) {
    const h = this.heli;
    if (!h || !h.alive || h.leaving) return false;
    if (dist2(h.pos.x, h.pos.z, pp.x, pp.z) > 95) return false;
    return services.colliders.lineOfSight(h.pos.x, h.pos.y - 1, h.pos.z, pp.x, pp.y + 1, pp.z);
  }

  /** Where bullets can hit it: a tall cylinder around the fuselage. */
  hitShape() {
    const h = this.heli;
    return h && !h.done ? { x: h.pos.x, z: h.pos.z, r: 2.4, y0: h.pos.y - 1.6, y1: h.pos.y + 2.2, heli: h } : null;
  }

  clear() {
    if (this.heli) { this.heli.dispose(); this.heli = null; }
    this.wantT = 0;
  }
}
