// The Palmera Bay Police Department: crimes raise a one-to-five star wanted level, patrol cars and
// riot vans are dispatched to chase and ram, officers jump out to arrest or open fire, and breaking
// line of sight long enough makes the stars flash and fade.
import { Vehicle } from '../entities/vehicle.js';
import { LaneDriver } from '../ai/laneDriver.js';
import { LOOKS } from '../entities/humanoid.js';
import { services } from '../core/services.js';
import { dist2, rng, clamp } from '../util/mathx.js';

const CARS_FOR_LEVEL = [0, 1, 2, 3, 4, 6];
const CRIMES = {
  carjack: { min: 1, add: 0, witnessed: true },
  assault: { min: 1, add: 0, witnessed: true },
  shotsFired: { min: 1, add: 0, witnessed: true },
  hitPed: { min: 1, add: 0, witnessed: true },
  murder: { min: 2, add: 0.5 },
  copAssault: { min: 2, add: 0.5 },
  copKilled: { min: 3, add: 1 },
  explosion: { min: 2, add: 0.5 },
  mission: { min: 2, add: 0 },
};

export class PoliceSystem {
  constructor() {
    this.heat = 0;
    this.unseenT = 0;
    this.seen = false;
    this.units = [];
    this.spawnT = 0;
    this.lastSeen = null;
    this.lethal = false;
    this.bustT = 0;
    this.enabled = true;
  }

  get level() { return Math.floor(this.heat); }
  get searching() { return this.level > 0 && !this.seen; }

  /** A crime at (x, z). Witnessed crimes only count if people or police are around. */
  report(crime, x, z) {
    if (!this.enabled) return;
    const c = CRIMES[crime];
    if (!c) return;
    const game = services.game;
    if (c.witnessed && this.level === 0) {
      const witnesses = game.peds.list.some((p) => !p.dead && dist2(p.pos.x, p.pos.z, x, z) < 35) || this.copsNear(x, z, 70);
      if (!witnesses) return;
      if (crime === 'carjack' && !this.copsNear(x, z, 70) && rng.chance(0.55)) return;
    }
    const before = this.level;
    this.heat = clamp(Math.max(this.heat + c.add, c.min + 0.01, this.heat), 0, 5.99);
    if (crime === 'copKilled' || crime === 'copAssault') this.lethal = true;
    if (this.level > before) {
      this.unseenT = 0;
      this.seen = true;
      this.lastSeen = { x, z };
      game.hud?.flashWanted();
    }
  }

  setLevel(n) { this.heat = n > 0 ? n + 0.01 : 0; this.unseenT = 0; if (n === 0) this.lethal = false; }

  clear() {
    this.heat = 0;
    this.lethal = false;
    this.unseenT = 0;
    for (const u of this.units) {
      if (u.vehicle.ai) { u.vehicle.ai.mode = 'cruise'; u.vehicle.sirenOn = false; u.vehicle.mission = null; }
      for (const o of u.officers) o.persistent = false;
    }
    this.units = [];
  }

  copsNear(x, z, r) {
    const game = services.game;
    return game.peds.list.some((p) => p.team === 'cop' && !p.dead && dist2(p.pos.x, p.pos.z, x, z) < r)
      || game.vehicles.some((v) => v.isPolice && !v.dead && v.driver && dist2(v.pos.x, v.pos.z, x, z) < r);
  }

  update(dt) {
    const game = services.game;
    const player = game.player;
    const pp = player.vehicle ? player.vehicle.pos : player.pos;
    this.units = this.units.filter((u) => !u.vehicle.dead || u.officers.some((o) => !o.dead));
    if (this.level === 0 || player.dead) {
      this.updateSiren(pp);
      return;
    }

    // Dispatch more units until the level's quota is met.
    const live = this.units.filter((u) => !u.vehicle.dead).length;
    this.spawnT -= dt;
    if (live < CARS_FOR_LEVEL[this.level] && this.spawnT <= 0) {
      this.spawnT = 2.5;
      this.dispatch(pp);
    }

    // Sight: any officer or patrol car with a clear view.
    let seen = false;
    for (const u of this.units) {
      const v = u.vehicle;
      if (!v.dead && v.driver) {
        const d = dist2(v.pos.x, v.pos.z, pp.x, pp.z);
        if (d < 28 || (d < 90 && services.colliders.lineOfSight(v.pos.x, 1.6, v.pos.z, pp.x, pp.y + 1, pp.z))) seen = true;
        v.ai.target = { x: pp.x, z: pp.z };
        v.sirenOn = true;
        // Officers bail out when the suspect is on foot or stopped nearby.
        const stopped = !player.vehicle || player.vehicle.speed < 3;
        if (!u.deployed && stopped && d < 20 && v.speed < 6) this.deploy(u);
        if (u.deployed) { v.ai.mode = 'park'; v.driver = null; }
      }
      for (const o of u.officers) {
        if (o.dead) continue;
        const d = dist2(o.pos.x, o.pos.z, pp.x, pp.z);
        if (d < 25 || (d < 70 && services.colliders.lineOfSight(o.pos.x, o.pos.y + 1.6, o.pos.z, pp.x, pp.y + 1.2, pp.z))) seen = true;
      }
    }
    this.seen = seen;
    if (seen) { this.unseenT = 0; this.lastSeen = { x: pp.x, z: pp.z }; }
    else {
      this.unseenT += dt;
      if (this.unseenT > 7 + this.level * 3.5) {
        this.clear();
        game.notify('You lost the cops.');
      }
    }
    this.checkBusted(dt, player);
    this.updateSiren(pp);
  }

  /** Sends a patrol car (or a riot van at five stars) toward the player from out of sight. */
  dispatch(pp) {
    const game = services.game;
    const model = this.level >= 5 && rng.chance(0.5) ? 'bastion' : 'police';
    const v = game.traffic.spawnCar(pp.x, pp.z, 110, 200, model, 'pursuit');
    if (!v) return;
    v.ai.target = { x: pp.x, z: pp.z };
    v.sirenOn = true;
    v.driver = { npc: true, cop: true };
    v.mission = 'police';
    this.units.push({ vehicle: v, officers: [], deployed: false });
  }

  deploy(unit) {
    const game = services.game;
    const v = unit.vehicle;
    unit.deployed = true;
    const n = v.model === 'bastion' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const rx = -Math.cos(v.yaw) * side * (v.halfW + 0.8), rz = Math.sin(v.yaw) * side * (v.halfW + 0.8);
      const o = game.peds.spawn(v.model === 'bastion' ? LOOKS.swat : LOOKS.cop, v.pos.x + rx, v.pos.z + rz - i * 0.5, 'cop');
      if (v.model === 'bastion') { o.weapon = 'smg'; o.armor = 50; }
      o.persistent = true;
      unit.officers.push(o);
    }
  }

  checkBusted(dt, player) {
    if (this.level > 2 || player.dead) { this.bustT = 0; return; }
    const game = services.game;
    const pp = player.vehicle ? player.vehicle.pos : player.pos;
    const slow = player.vehicle ? player.vehicle.speed < 1.5 : player.moveSpeed < 2.8;
    let close = false;
    for (const p of game.peds.list) {
      if (p.team === 'cop' && !p.dead && dist2(p.pos.x, p.pos.z, pp.x, pp.z) < (player.vehicle ? 3.2 : 1.9)) close = true;
    }
    if (close && slow) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 2);
    if (this.bustT > (player.vehicle ? 2.5 : 1.6)) { this.bustT = 0; game.busted(); }
  }

  updateSiren(pp) {
    const game = services.game;
    let best = Infinity, pan = 0;
    for (const v of game.vehicles) {
      if (!v.sirenOn || v.dead) continue;
      const d = dist2(v.pos.x, v.pos.z, pp.x, pp.z);
      if (d < best) { best = d; pan = clamp((v.pos.x - pp.x) / 40, -1, 1) * 0; }
    }
    services.audio?.setSiren(best < 160 ? 1 - best / 160 : 0, pan);
  }
}
