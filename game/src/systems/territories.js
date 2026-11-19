// Gilded Hand turf: four blocks in Saltmarsh and Old Harbor are held by rival crews. Walk onto one and
// the crew comes out shooting; wipe them out and the block is Sol's, paying out by the in-game hour.
// Leave a fight and the crew goes back to its corner. Ownership is part of the save.
import { LOOKS } from '../entities/humanoid.js';
import { blockBounds } from '../world/cityPlan.js';
import { services } from '../core/services.js';
import { dist2, formatMoney, rng } from '../util/mathx.js';

export const TURFS = [
  { id: 'rustyard', name: 'Rust Yard', bi: 0, bj: 6, crew: 5, income: 220 },
  { id: 'chandler', name: 'Chandler Row', bi: 2, bj: 6, crew: 5, income: 260 },
  { id: 'netloft', name: 'Net Loft', bi: 4, bj: 9, crew: 6, income: 320 },
  { id: 'cranefoot', name: 'Crane Foot', bi: 7, bj: 9, crew: 6, income: 380 },
];

const HOUR_SECONDS = 60;

export class Territories {
  constructor(game) {
    this.game = game;
    this.turfs = TURFS.map((def) => ({ def, block: blockBounds(def.bi, def.bj), state: 'rival', crew: [] }));
    this.payT = HOUR_SECONDS;
    services.territories = this;
  }

  reset() {
    for (const t of this.turfs) { this.release(t); t.state = 'rival'; }
    this.payT = HOUR_SECONDS;
  }

  get ownedCount() { return this.turfs.filter((t) => t.state === 'yours').length; }
  get hourlyIncome() { return this.turfs.reduce((sum, t) => sum + (t.state === 'yours' ? t.def.income : 0), 0); }

  /** Hands the crew back to the ordinary world: they stay where they stand and may wander off. */
  release(t) {
    for (const p of t.crew) { p.persistent = false; p.mission = null; p.guardPoint = null; }
    t.crew = [];
  }

  /** Removes a crew from the street altogether (Sol walked away from the fight). */
  disband(t) {
    const g = this.game;
    for (const c of t.crew) c.dispose();
    g.peds.list = g.peds.list.filter((c) => !t.crew.includes(c));
    t.crew = [];
  }

  /** After the street is wiped (quit to title, a reload): contested blocks go back to their rivals. */
  clearCrews() {
    for (const t of this.turfs) {
      t.crew = [];
      if (t.state === 'contested') t.state = 'rival';
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    for (const t of this.turfs) {
      const d = dist2(pp.x, pp.z, t.block.cx, t.block.cz);
      if (t.state === 'rival' && d < 46 && !g.missions.active && !p.dead && g.police.level < 3) this.startFight(t);
      else if (t.state === 'contested') {
        if (t.crew.every((c) => c.dead)) this.capture(t);
        else if (d > 150 || p.dead) { this.disband(t); t.state = 'rival'; }
      }
    }
    this.payT -= dt;
    if (this.payT <= 0) {
      this.payT += HOUR_SECONDS;
      const pay = this.hourlyIncome;
      if (pay > 0 && !p.dead) { p.money += pay; g.notify(`Turf income: ${formatMoney(pay)} from ${this.ownedCount} block${this.ownedCount > 1 ? 's' : ''}.`); }
    }
  }

  startFight(t) {
    const g = this.game, b = t.block;
    t.state = 'contested';
    t.crew = [];
    for (let i = 0; i < t.def.crew; i++) {
      // Crews stand on the sidewalks round the block, never inside its buildings.
      const side = i % 4, along = rng.range(8, 56);
      const x = side === 1 ? b.x1 - 2.5 : side === 3 ? b.x0 + 2.5 : b.x0 + along;
      const z = side === 0 ? b.z0 + 2.5 : side === 2 ? b.z1 - 2.5 : b.z0 + along;
      const c = g.peds.spawn(i === 0 ? LOOKS.kane : LOOKS.gang, x, z, 'gang');
      c.weapon = i % 3 === 0 ? 'smg' : 'pistol';
      c.hostile = true;
      c.persistent = true;
      c.mission = true;
      c.guardPoint = { x, z };
      t.crew.push(c);
    }
    g.hud.banner(t.def.name.toUpperCase(), 'Rival crew — clear the block to take the turf', 'mission', 2.6);
    services.audio?.blip();
  }

  capture(t) {
    const g = this.game;
    this.release(t);
    t.state = 'yours';
    g.player.money += 300 + t.def.income;
    g.skills.add('shooting', 30);
    g.hud.banner('TURF TAKEN', `${t.def.name}  ·  ${formatMoney(t.def.income)} an hour`, 'pass', 3.5);
    services.audio?.passed();
  }

  blips() {
    return this.turfs.map((t) => ({ x: t.block.cx, z: t.block.cz, icon: t.state === 'yours' ? 'turfOwned' : 'turf' }));
  }

  serialize() { return this.turfs.filter((t) => t.state === 'yours').map((t) => t.def.id); }

  restore(ids) {
    this.reset();
    for (const t of this.turfs) if (ids?.includes(t.def.id)) t.state = 'yours';
  }
}
