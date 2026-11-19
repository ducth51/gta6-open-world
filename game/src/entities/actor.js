// What every person in the city shares, the player included: a body, health and armour, walking
// with collision against buildings and cars, jumping, being run over, and dying.
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { services } from '../core/services.js';
import { GRAVITY, CELL, ROAD, CITY_SIZE } from '../config.js';
import { clamp, dampAngle } from '../util/mathx.js';
import { groundHeight, clampToWorld } from '../world/cityPlan.js';

const _out = { x: 0, z: 0 };
let nextId = 1;

export class Actor {
  constructor(look, x, z, team = 'civ') {
    this.id = nextId++;
    this.team = team;
    this.body = new Humanoid(look);
    this.mesh = this.body.root;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.35;
    this.height = 1.8;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.dead = false;
    this.deadT = 0;
    this.onGround = true;
    this.vehicle = null;
    this.weapon = 'fists';
    this.knockT = 0;
    this.aimPitch = null;
    this.moveSpeed = 0;
    services.scene.add(this.mesh);
  }

  get isPlayer() { return false; }

  /** Walks with desired horizontal velocity (dx, dz), resolving collisions; call once per step. */
  step(dt, wantX, wantZ, faceYaw = null) {
    if (this.vehicle) return;
    const accel = this.onGround ? 14 : 3;
    if (this.knockT > 0) this.knockT -= dt;
    else {
      this.vel.x += clamp(wantX - this.vel.x, -accel * dt, accel * dt) * 1.0;
      this.vel.z += clamp(wantZ - this.vel.z, -accel * dt, accel * dt) * 1.0;
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    clampToWorld(this.pos);
    const hit = services.colliders.resolveCircle(this.pos.x, this.pos.z, this.radius, this.pos.y + 0.3, 1.4, _out);
    if (hit) {
      this.pos.x = _out.x; this.pos.z = _out.z;
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= hit.nx * vn; this.vel.z -= hit.nz * vn; }
    }
    // Stand on the street, the kerb, a crate's top or the pier deck.
    let floor = groundHeight(this.pos.x, this.pos.z);
    if (onBlock(this.pos.x, this.pos.z)) floor = Math.max(floor, 0.18);
    const top = services.colliders.floorAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (top > floor) floor = top;
    if (this.pos.y <= floor) { this.pos.y = floor; this.vel.y = 0; this.onGround = true; } else this.onGround = this.pos.y - floor < 0.05;
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (faceYaw !== null) this.yaw = dampAngle(this.yaw, faceYaw, 12, dt);
    else if (this.moveSpeed > 0.4) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
  }

  jump() { if (this.onGround && !this.vehicle) { this.vel.y = 7.2; this.onGround = false; } }

  /** Applies damage; armour soaks most of it. Returns true if this killed the actor. */
  takeDamage(amount, source = null, kind = 'bullet') {
    if (this.dead) return false;
    if (this.armor > 0 && kind !== 'fall') {
      const soak = Math.min(this.armor, amount * 0.7);
      this.armor -= soak;
      amount -= soak;
    }
    this.health -= amount;
    this.lastAttacker = source;
    this.onHurt?.(amount, source, kind);
    if (this.health <= 0) {
      this.health = 0;
      this.die(source, kind);
      return true;
    }
    return false;
  }

  /** Knocks the actor away, as a car does. */
  knock(vx, vz, up = 4) {
    this.vel.set(vx, up, vz);
    this.knockT = 0.7;
    this.onGround = false;
  }

  die(source, kind) {
    this.dead = true;
    this.deadT = 0;
    services.game?.onActorKilled(this, source, kind);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.body.animate(dt, this.moveSpeed, this.aimPitch, this.dead, !this.onGround);
    this.body.setWeapon(this.weapon);
  }

  dispose() { services.scene.remove(this.mesh); }
}

/** True on a block's sidewalk (raised kerb) rather than on the road. */
export function onBlock(x, z) {
  const lx = ((x % CELL) + CELL) % CELL, lz = ((z % CELL) + CELL) % CELL;
  return lx >= ROAD && lz >= ROAD && x < CITY_SIZE && z < CITY_SIZE && x > 0 && z > 0;
}
