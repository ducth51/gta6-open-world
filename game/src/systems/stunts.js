// Stunts for cash: eight stunt jumps off the ramps around Palmera Bay (distance and air time pay out,
// the first clean jump off each ramp counts toward a bonus), and drift scoring that banks money when
// a long slide ends without a crash.
import { buildRamps } from '../world/ramps.js';
import { RAMPS, rampTop } from '../world/rampLayout.js';
import { services } from '../core/services.js';
import { dist2, formatMoney } from '../util/mathx.js';

const MIN_AIR = 0.65;

export class StuntSystem {
  constructor(game) {
    this.game = game;
    this.group = buildRamps();
    services.scene.add(this.group);
    services.stunts = this;
    this.done = new Set();
    this.drift = { score: 0, hold: 0 };
    this.bestJump = 0;
    this.lastPayout = null;
    this.driftBanked = 0;
  }

  reset() {
    this.done.clear();
    this.drift.score = 0; this.drift.hold = 0;
    this.bestJump = 0;
    this.driftBanked = 0;
    this.lastPayout = null;
  }

  /** The ramp whose top end is nearest to (x, z), or null when none is close. */
  rampNear(x, z, within = 14) {
    let best = null, bd = within;
    for (const r of RAMPS) {
      const top = rampTop(r);
      const d = dist2(x, z, top.x, top.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  onTakeoff(v) {
    v.jumpRamp = this.rampNear(v.pos.x, v.pos.z);
    if (v.driver === 'player') this.game.cameraRig.shake(0.18);
  }

  onLanded(v, airT) {
    if (v.driver !== 'player' || airT < MIN_AIR || !v.takeoff) return;
    const metres = dist2(v.pos.x, v.pos.z, v.takeoff.x, v.takeoff.z);
    const g = this.game;
    const prize = Math.round(metres * 6 + airT * 40);
    g.player.money += prize;
    g.skills.add('driving', 12 + metres * 0.6);
    this.bestJump = Math.max(this.bestJump, metres);
    this.lastPayout = { text: `STUNT JUMP  ${Math.round(metres)} m  ·  ${airT.toFixed(1)} s air`, prize, t: 3.2 };
    g.hud.banner('STUNT JUMP', `${Math.round(metres)} m in the air  ·  ${formatMoney(prize)}`, 'pass', 2.4);
    services.audio?.cash();
    const ramp = v.jumpRamp;
    if (ramp && !this.done.has(ramp.id)) {
      this.done.add(ramp.id);
      g.notify(`<b>${ramp.name}</b> — stunt jump ${this.done.size}/${RAMPS.length} found.`);
      if (this.done.size === RAMPS.length) {
        g.player.money += 8000;
        g.hud.banner('ALL STUNT JUMPS', '+$8,000 — Palmera Bay has never seen driving like it', 'pass', 4);
      }
    }
    v.jumpRamp = null;
  }

  update(dt) {
    const g = this.game, v = g.player.vehicle;
    const d = this.drift;
    if (this.lastPayout) { this.lastPayout.t -= dt; if (this.lastPayout.t <= 0) this.lastPayout = null; }
    if (!v || v.dead || v.airborne) { this.bankDrift(); d.hold = 0; return; }
    const slide = Math.abs(v.lateral ?? 0);
    if (services.time - v.lastHit < 0.35) { d.score = 0; d.hold = 0; return; }
    if (v.speed > 9 && slide > 4.2) {
      d.score += dt * (slide - 3) * v.speed * 0.45;
      d.hold = 0.9;
    } else if (d.score > 0) {
      d.hold -= dt;
      if (d.hold <= 0) this.bankDrift();
    }
  }

  bankDrift() {
    const d = this.drift;
    const pay = Math.floor(d.score / 6);
    if (pay >= 25) {
      this.game.player.money += pay;
      this.driftBanked += pay;
      this.lastPayout = { text: `DRIFT  +${formatMoney(pay)}`, prize: pay, t: 2.4 };
      this.game.skills.add('driving', pay / 12);
      services.audio?.cash();
    }
    d.score = 0;
  }

  /** One line for the HUD: the live drift, or the last payout while it lingers; null when idle. */
  hudLine() {
    const v = this.game.player.vehicle;
    if (v?.airborne && v.airT > 0.2) return `IN THE AIR  ${v.airT.toFixed(1)} s`;
    if (this.drift.score > 60) return `DRIFT  ${Math.floor(this.drift.score / 6)}`;
    return this.lastPayout ? this.lastPayout.text : null;
  }

  blips() {
    return RAMPS.filter((r) => !this.done.has(r.id)).map((r) => ({ x: r.x, z: r.z, icon: 'ramp' }));
  }

  serialize() { return { done: [...this.done], best: this.bestJump, drift: this.driftBanked }; }

  restore(data) {
    this.reset();
    if (!data) return;
    for (const id of data.done ?? []) this.done.add(id);
    this.bestJump = data.best ?? 0;
    this.driftBanked = data.drift ?? 0;
  }
}
