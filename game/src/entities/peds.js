// People on the street: they stroll round the blocks and cross at corners, flee from gunfire and
// reckless drivers, get run over; police officers chase and arrest or shoot, gang members fight.
import { Actor } from './actor.js';
import { LOOKS, randomLook } from './humanoid.js';
import { services } from '../core/services.js';
import { CELL, GRID, ROAD, WEAPONS } from '../config.js';
import { blockBounds } from '../world/cityPlan.js';
import { clamp, dist2, rng, yawTo } from '../util/mathx.js';

const INSET = 2.2;

export class Ped extends Actor {
  constructor(look, x, z, team = 'civ') {
    super(look, x, z, team);
    this.state = 'walk';
    this.walkSpeed = rng.range(1.2, 1.7);
    this.corner = 0;
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.block = null;
    this.target = null;
    this.fleeFrom = null;
    this.stateT = 0;
    this.fireCd = rng.range(0.5, 1.5);
    this.hostile = team === 'gang';
    this.mission = null;
    this.accuracy = team === 'cop' ? 0.45 : 0.35;
    this.guardPoint = null;
    this.arrestT = 0;
    this.persistent = false;
    if (team === 'cop') { this.weapon = 'pistol'; this.health = this.maxHealth = 90; }
    if (team === 'gang') { this.weapon = rng.chance(0.4) ? 'smg' : 'pistol'; this.health = this.maxHealth = 80; }
    this.pickBlock(x, z);
  }

  pickBlock(x, z) {
    const bi = clamp(Math.floor((x - ROAD) / CELL), 0, GRID - 1), bj = clamp(Math.floor((z - ROAD) / CELL), 0, GRID - 1);
    this.block = blockBounds(bi, bj);
    this.block.bi = bi; this.block.bj = bj;
    const c = this.corners();
    let best = 0, bd = Infinity;
    c.forEach((p, i) => { const d = dist2(x, z, p.x, p.z); if (d < bd) { bd = d; best = i; } });
    this.corner = best;
  }

  corners() {
    const b = this.block;
    return [{ x: b.x0 + INSET, z: b.z0 + INSET }, { x: b.x1 - INSET, z: b.z0 + INSET }, { x: b.x1 - INSET, z: b.z1 - INSET }, { x: b.x0 + INSET, z: b.z1 - INSET }];
  }

  /** Startle: run from (x, z) for a while. */
  panic(x, z, t = 8) {
    if (this.dead || this.team !== 'civ') return;
    this.state = 'flee';
    this.fleeFrom = { x, z };
    this.stateT = t;
    if (rng.chance(0.3)) services.game?.speech(this, rng.pick(['Help!', 'Run!', 'Are you crazy?!', 'Call the cops!']));
  }

  onHurt(amount, source) {
    if (this.team === 'civ') this.panic(source?.pos?.x ?? this.pos.x, source?.pos?.z ?? this.pos.z, 12);
    if (this.team === 'gang') this.hostile = true;
    services.effects?.blood(this.pos.x, this.pos.y + 1.2, this.pos.z);
  }

  update(dt) {
    if (this.dead) { this.deadT += dt; this.syncMesh(dt); return; }
    const game = services.game;
    const player = game.player;
    this.fireCd -= dt;
    this.aimPitch = null;
    let wx = 0, wz = 0, face = null;
    if (this.team === 'cop') ({ wx, wz, face } = this.copBehaviour(dt, player, game));
    else if (this.team === 'gang') ({ wx, wz, face } = this.gangBehaviour(dt, player));
    else if (this.state === 'flee') {
      this.stateT -= dt;
      const dx = this.pos.x - this.fleeFrom.x, dz = this.pos.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      wx = (dx / d) * 6.2; wz = (dz / d) * 6.2;
      if (this.stateT <= 0) { this.state = 'walk'; this.pickBlock(this.pos.x, this.pos.z); }
    } else ({ wx, wz } = this.walkBehaviour());
    this.step(dt, wx, wz, face);
    this.syncMesh(dt);
  }

  walkBehaviour() {
    if (this.target) {
      // Crossing the street to the next block.
      const d = dist2(this.pos.x, this.pos.z, this.target.x, this.target.z);
      if (d < 0.8) { this.pickBlock(this.target.x, this.target.z); this.target = null; }
      else return { wx: ((this.target.x - this.pos.x) / d) * this.walkSpeed, wz: ((this.target.z - this.pos.z) / d) * this.walkSpeed };
    }
    const c = this.corners()[this.corner];
    const d = dist2(this.pos.x, this.pos.z, c.x, c.z);
    if (d < 0.7) {
      if (rng.chance(0.25)) this.crossStreet(c);
      this.corner = (this.corner + this.dir + 4) % 4;
      return { wx: 0, wz: 0 };
    }
    return { wx: ((c.x - this.pos.x) / d) * this.walkSpeed, wz: ((c.z - this.pos.z) / d) * this.walkSpeed };
  }

  crossStreet(c) {
    const b = this.block;
    const horizontal = rng.chance(0.5);
    const tx = horizontal ? (c.x < b.cx ? c.x - ROAD - INSET * 2 : c.x + ROAD + INSET * 2) : c.x;
    const tz = horizontal ? c.z : (c.z < b.cz ? c.z - ROAD - INSET * 2 : c.z + ROAD + INSET * 2);
    if (tx < ROAD || tz < ROAD || tx > GRID * CELL + ROAD || tz > GRID * CELL + ROAD) return;
    this.target = { x: tx, z: tz };
  }

  /** Shared by cops and gangsters: close in, keep a distance, shoot when the target is in sight. */
  fightTarget(dt, target, keep, speed) {
    const tp = target.vehicle ? target.vehicle.pos : target.pos;
    const d = dist2(this.pos.x, this.pos.z, tp.x, tp.z);
    const face = yawTo(this.pos.x, this.pos.z, tp.x, tp.z);
    const sees = d < 60 && services.colliders.lineOfSight(this.pos.x, this.pos.y + 1.5, this.pos.z, tp.x, tp.y + 1.2, tp.z);
    let wx = 0, wz = 0;
    if (d > keep || !sees) { wx = ((tp.x - this.pos.x) / d) * speed; wz = ((tp.z - this.pos.z) / d) * speed; }
    else {
      // Strafe around the target.
      const s = Math.sin(services.time * 0.8 + this.id) > 0 ? 1 : -1;
      wx = (-(tp.z - this.pos.z) / d) * 1.6 * s; wz = ((tp.x - this.pos.x) / d) * 1.6 * s;
    }
    if (sees && d < 45 && this.fireCd <= 0 && !target.dead) {
      const def = WEAPONS[this.weapon];
      this.fireCd = def.rate * (this.weapon === 'smg' ? 3 : 2.2) + rng.range(0.1, 0.6);
      services.game.combat.npcShoot(this, target, def, d);
    }
    if (sees && d < 45) this.aimPitch = Math.atan2(tp.y + 1.0 - (this.pos.y + 1.5), d);
    return { wx, wz, face: sees ? face : null };
  }

  gangBehaviour(dt, player) {
    if (this.hostile && !player.dead) {
      const d = dist2(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
      if (d < 70) return this.fightTarget(dt, player, 10, 4.5);
    }
    // Guard a spot until provoked; see the player up close and attack.
    if (this.guardPoint) {
      const d = dist2(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
      if (d < 22 && !player.dead) this.hostile = true;
      const gd = dist2(this.pos.x, this.pos.z, this.guardPoint.x, this.guardPoint.z);
      if (gd > 1.5) return { wx: ((this.guardPoint.x - this.pos.x) / gd) * 1.5, wz: ((this.guardPoint.z - this.pos.z) / gd) * 1.5, face: null };
      return { wx: 0, wz: 0, face: yawTo(this.pos.x, this.pos.z, player.pos.x, player.pos.z) };
    }
    return this.walkBehaviour();
  }

  copBehaviour(dt, player, game) {
    const level = game.police.level;
    if (level === 0 || player.dead) {
      // Stand down: walk back to the car or away.
      return { ...this.walkBehaviour(), face: null };
    }
    const tp = player.vehicle ? player.vehicle.pos : player.pos;
    const d = dist2(this.pos.x, this.pos.z, tp.x, tp.z);
    if (level >= 2 || game.police.lethal) return this.fightTarget(dt, player, 8, 6);
    // One star: run up and make the arrest.
    if (d < 1.8) { this.arrestT += dt; return { wx: 0, wz: 0, face: yawTo(this.pos.x, this.pos.z, tp.x, tp.z) }; }
    this.arrestT = Math.max(0, this.arrestT - dt);
    return { wx: ((tp.x - this.pos.x) / d) * 5.8, wz: ((tp.z - this.pos.z) / d) * 5.8, face: null };
  }
}

export class PedManager {
  constructor() {
    this.list = [];
    this.density = 34;
    this.spawnT = 0;
  }

  spawn(look, x, z, team = 'civ') {
    const p = new Ped(look, x, z, team);
    this.list.push(p);
    return p;
  }

  /** Puts a random pedestrian on a sidewalk corner of a block near (x, z). */
  spawnCivilianNear(x, z, minD, maxD) {
    for (let tries = 0; tries < 8; tries++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(minD, maxD);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (px < ROAD || pz < ROAD || px > GRID * CELL || pz > GRID * CELL) continue;
      const bi = Math.floor((px - ROAD) / CELL), bj = Math.floor((pz - ROAD) / CELL);
      const b = blockBounds(bi, bj);
      const side = rng.int(0, 3);
      const t = rng.range(INSET, b.x1 - b.x0 - INSET);
      const sx = side === 0 || side === 2 ? b.x0 + t : side === 1 ? b.x1 - INSET : b.x0 + INSET;
      const sz = side === 1 || side === 3 ? b.z0 + t : side === 0 ? b.z0 + INSET : b.z1 - INSET;
      const p = this.spawn(randomLook(rng), sx, sz, 'civ');
      return p;
    }
    return null;
  }

  /** Everyone within `r` of (x, z) runs. */
  alert(x, z, r) {
    for (const p of this.list) if (p.team === 'civ' && !p.dead && dist2(p.pos.x, p.pos.z, x, z) < r) p.panic(x, z, rng.range(6, 12));
  }

  update(dt, focus) {
    const game = services.game;
    for (const p of this.list) p.update(dt);
    this.runOver(game);
    // Despawn the far and the long dead; keep mission people.
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d = dist2(p.pos.x, p.pos.z, focus.x, focus.z);
      if ((!p.persistent && d > 150) || (p.dead && p.deadT > 30 && !p.mission) || (p.dead && d > 120)) {
        p.dispose();
        this.list.splice(i, 1);
      }
    }
    this.spawnT -= dt;
    const civs = this.list.filter((p) => p.team === 'civ').length;
    if (this.spawnT <= 0 && civs < this.density) {
      this.spawnT = 0.15;
      this.spawnCivilianNear(focus.x, focus.z, 45, 120);
    }
  }

  /** Cars hitting people: damage, knock-back, and a crime if Sol was driving. */
  runOver(game) {
    const victims = [...this.list];
    if (!game.player.vehicle && !game.player.dead) victims.push(game.player);
    for (const v of game.vehicles) {
      const speed = v.speed;
      if (speed < 2.5) continue;
      for (const p of victims) {
        if (p.dead || p.vehicle || p.knockT > 0) continue;
        if (Math.abs(p.pos.x - v.pos.x) > 4 || Math.abs(p.pos.z - v.pos.z) > 4) continue;
        for (const [cx, cz] of v.circles()) {
          const d = dist2(p.pos.x, p.pos.z, cx, cz);
          if (d > v.halfW + p.radius) continue;
          const dmg = speed > 7 ? speed * 6 : speed * 2;
          p.knock(v.vx * 0.9 + (p.pos.x - cx) * 2, v.vz * 0.9 + (p.pos.z - cz) * 2, Math.min(9, speed * 0.4));
          services.audio?.punch(p.pos);
          const source = v.driver === 'player' ? game.player : null;
          p.takeDamage(dmg, source, 'vehicle');
          if (source) game.police.report(p.team === 'cop' ? 'copAssault' : 'hitPed', p.pos.x, p.pos.z);
          break;
        }
      }
    }
  }
}

export { LOOKS };
