// Shooting and fighting: hitscan bullets from the crosshair with spread and pellets, NPC fire with
// distance-based accuracy, fists, explosions' blast radius, and the crimes each of these reports.
import * as THREE from 'three';
import { services } from '../core/services.js';
import { rayCylinder } from '../world/colliders.js';
import { dist2, rng, clamp } from '../util/mathx.js';

const _dir = new THREE.Vector3();

export class Combat {
  /** Every actor that bullets can hit, except `skip`. */
  targets(skip) {
    const game = services.game;
    const list = [];
    for (const p of game.peds.list) if (!p.dead && p !== skip) list.push(p);
    if (game.player !== skip && !game.player.dead && !game.player.vehicle) list.push(game.player);
    return list;
  }

  /** Casts one bullet; returns { dist, actor, vehicle } of the first thing hit. */
  castBullet(ox, oy, oz, dx, dy, dz, range, skip, skipVehicle = null) {
    let best = services.colliders.raycast(ox, oy, oz, dx, dy, dz, range);
    let actor = null, vehicle = null, heli = null;
    for (const a of this.targets(skip)) {
      if (Math.abs(a.pos.x - ox) > range + 2 || Math.abs(a.pos.z - oz) > range + 2) continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.z, 0.42, a.pos.y, a.pos.y + 1.85);
      if (t >= 0 && t < best) { best = t; actor = a; vehicle = null; }
    }
    for (const v of services.game.vehicles) {
      if (v === skipVehicle || Math.abs(v.pos.x - ox) > range + 4 || Math.abs(v.pos.z - oz) > range + 4) continue;
      for (const [cx, cz] of v.circles()) {
        const t = rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, v.halfW, v.pos.y + 0.2, v.pos.y + 0.4 + v.def.body + v.def.cabin);
        if (t >= 0 && t < best) { best = t; vehicle = v; actor = null; }
      }
    }
    // The police helicopter is a tall cylinder high above the street.
    const shape = services.air?.hitShape();
    if (shape) {
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, shape.x, shape.z, shape.r, shape.y0, shape.y1);
      if (t >= 0 && t < best) { best = t; heli = shape.heli; actor = null; vehicle = null; }
    }
    return { dist: best, actor, vehicle, heli };
  }

  /** The player fires the current gun from the crosshair. */
  playerShoot(player, def, rig) {
    const game = services.game;
    const cam = services.camera;
    const pellets = def.pellets ?? 1;
    const fwd = rig.forward(_dir).clone();
    // Start the ray level with the player so nothing behind them is hit.
    const startT = Math.max(0, (player.pos.x - cam.position.x) * fwd.x + (player.pos.z - cam.position.z) * fwd.z) + 0.4;
    const ox = cam.position.x + fwd.x * startT, oy = cam.position.y + fwd.y * startT, oz = cam.position.z + fwd.z * startT;
    const rx = -Math.cos(player.yaw), rz = Math.sin(player.yaw);
    const mx = player.pos.x + rx * 0.38 + Math.sin(player.yaw) * 0.75, my = player.pos.y + 1.42, mz = player.pos.z + rz * 0.38 + Math.cos(player.yaw) * 0.75;
    services.effects.muzzle(mx, my, mz);
    services.audio.gunshot(player.pos, player.weapon);
    rig.shake(def.pellets ? 0.25 : 0.07);
    let hitSomething = false;
    for (let i = 0; i < pellets; i++) {
      const spread = (def.spread ?? 0) * (player.aiming ? 0.6 : 1.4) * (player.moveSpeed > 3 ? 1.6 : 1) * (services.skills?.spreadMul() ?? 1);
      const dx = fwd.x + rng.range(-spread, spread), dy = fwd.y + rng.range(-spread, spread), dz = fwd.z + rng.range(-spread, spread);
      const l = Math.hypot(dx, dy, dz);
      const hit = this.castBullet(ox, oy, oz, dx / l, dy / l, dz / l, def.range, player);
      const d = Math.min(hit.dist, def.range);
      const hx = ox + (dx / l) * d, hy = oy + (dy / l) * d, hz = oz + (dz / l) * d;
      if (i < 3) services.effects.tracer(mx, my, mz, hx, hy, hz);
      if (hit.actor) {
        const fall = clamp(1.2 - d / def.range, 0.5, 1);
        const head = hy > hit.actor.pos.y + 1.5;
        hit.actor.takeDamage(def.damage * fall * (head ? 2.2 : 1), player, 'bullet');
        hitSomething = true;
      } else if (hit.vehicle) {
        hit.vehicle.damage(def.damage * 0.35, 'player');
        if (hit.vehicle.driver && hit.vehicle.driver !== 'player') this.scareDriver(hit.vehicle);
        services.effects.sparks(hx, hy, hz, 5);
        hitSomething = true;
      } else if (hit.heli) {
        hit.heli.damage(def.damage * 0.8, 'player');
        hitSomething = true;
      } else if (hit.dist < def.range) services.effects.dust(hx, hy, hz, 4);
    }
    if (hitSomething) { game.hud.hitmarker(); services.skills?.add('shooting', 0.9); }
    game.peds.alert(player.pos.x, player.pos.z, 40);
    services.wildlife?.scare(player.pos.x, player.pos.z, 55);
    game.police.report('shotsFired', player.pos.x, player.pos.z);
  }

  scareDriver(v) {
    if (v.ai && v.ai.mode === 'cruise') v.ai.panic = 1;
  }

  /** An NPC shoots at `target` from `distance` metres; misses grow with range and speed. */
  npcShoot(shooter, target, def, distance) {
    const tp = target.vehicle ? target.vehicle.pos : target.pos;
    const sx = shooter.pos.x + Math.sin(shooter.yaw) * 0.6, sy = shooter.pos.y + 1.42, sz = shooter.pos.z + Math.cos(shooter.yaw) * 0.6;
    const moving = target.vehicle ? target.vehicle.speed : target.moveSpeed;
    const chance = clamp(shooter.accuracy * (1.25 - distance / 50) - moving * 0.015, 0.05, 0.8);
    const pellets = def.pellets ?? 1;
    services.effects.muzzle(sx, sy, sz);
    services.audio.gunshot(shooter.pos, shooter.weapon);
    for (let i = 0; i < pellets; i++) {
      const hit = rng.chance(chance);
      const ex = tp.x + (hit ? rng.range(-0.2, 0.2) : rng.range(-2.5, 2.5)), ey = tp.y + (hit ? rng.range(0.9, 1.6) : rng.range(0.2, 2.6)), ez = tp.z + (hit ? rng.range(-0.2, 0.2) : rng.range(-2.5, 2.5));
      services.effects.tracer(sx, sy, sz, ex, ey, ez, [1, 0.6, 0.4]);
      if (!hit) continue;
      if (target.vehicle) {
        target.vehicle.damage(def.damage * 0.3, shooter);
        if (rng.chance(0.25)) target.takeDamage(def.damage * 0.4, shooter, 'bullet');
        services.effects.sparks(ex, ey, ez, 4);
      } else {
        target.takeDamage(def.damage * (target.isPlayer ? 0.55 : 1), shooter, 'bullet');
      }
    }
  }

  /** A punch: the nearest person in front within reach. */
  melee(attacker, def) {
    const game = services.game;
    let best = null, bd = def.range;
    for (const a of this.targets(attacker)) {
      const d = dist2(attacker.pos.x, attacker.pos.z, a.pos.x, a.pos.z);
      if (d > bd) continue;
      const ang = Math.atan2(a.pos.x - attacker.pos.x, a.pos.z - attacker.pos.z) - attacker.yaw;
      if (Math.cos(ang) < 0.3) continue;
      best = a; bd = d;
    }
    if (!best) return;
    services.audio.punch(best.pos);
    const power = attacker.isPlayer ? services.skills?.punchMul() ?? 1 : 1;
    best.takeDamage(def.damage * power, attacker, 'melee');
    best.knock(Math.sin(attacker.yaw) * 3 * power, Math.cos(attacker.yaw) * 3 * power, 2);
    if (attacker.isPlayer) {
      services.skills?.add('strength', 4);
      game.hud.hitmarker();
      game.police.report(best.team === 'cop' ? 'copAssault' : 'assault', best.pos.x, best.pos.z);
    }
  }

  /** Blast damage falling off with distance; cars caught in it can chain-explode. */
  radiusDamage(x, z, r, damage, source, exclude) {
    const game = services.game;
    for (const a of [...game.peds.list, game.player]) {
      if (a.dead) continue;
      const p = a.vehicle ? a.vehicle.pos : a.pos;
      const d = dist2(p.x, p.z, x, z);
      if (d > r) continue;
      const k = 1 - d / r;
      if (a.vehicle && a.vehicle === exclude) { a.takeDamage(damage, source, 'explosion'); continue; }
      a.takeDamage(damage * k, source, 'explosion');
      if (!a.vehicle) a.knock(((p.x - x) / (d || 1)) * 10 * k, ((p.z - z) / (d || 1)) * 10 * k, 6 * k);
    }
    for (const v of game.vehicles) {
      if (v === exclude || v.dead) continue;
      const d = dist2(v.pos.x, v.pos.z, x, z);
      if (d > r) continue;
      v.damage(damage * (1 - d / r) * 0.8, source);
      v.vx += ((v.pos.x - x) / (d || 1)) * 6; v.vz += ((v.pos.z - z) / (d || 1)) * 6;
    }
    game.cameraRig.shake(clamp(1 - dist2(game.player.pos.x, game.player.pos.z, x, z) / 60, 0, 1));
    game.peds.alert(x, z, 60);
    if (source === 'player' || source?.isPlayer) game.police.report('explosion', x, z);
  }
}
