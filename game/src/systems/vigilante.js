// Vigilante duty: sit in a patrol car (steal one) and press V. Dispatch names a fleeing criminal's
// car; wreck it before the clock runs out. Each success raises the vigilante level: tougher cars,
// bigger payouts. Leave the patrol car for more than a few seconds and the call is dropped.
import { nearestNode, nodePos } from '../ai/roadGraph.js';
import { services } from '../core/services.js';
import { dist2, formatMoney, rng } from '../util/mathx.js';

const TARGETS = ['marlin', 'coupe', 'dune', 'vortex', 'tidewater'];
const COLORS = [0xd4af37, 0xff4f7a, 0x3d4a5a, 0xf5f5f5];
const MAX_LEVEL = 10;

export class Vigilante {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.job = null;
    this.completed = 0;
    this.streak = 0;
    services.vigilante = this;
  }

  reset() { this.level = 1; this.completed = 0; this.streak = 0; this.end(); }

  get active() { return !!this.job; }
  timer() { return this.job ? this.job.timeLeft : null; }
  objective() { return this.job ? { title: `Vigilante ${this.level}`, text: this.job.hint ?? 'Wreck the fleeing car.' } : null; }
  focus() { return this.job && !this.job.car.dead ? this.job.car.pos : null; }

  update(dt, input) {
    const g = this.game, p = g.player, v = p.vehicle;
    const inPatrol = !!v && v.isPolice && !v.dead;
    if (this.job) return this.run(dt, inPatrol);
    if (!inPatrol || g.missions.active || g.activities.busy || g.police.level > 0 || g.events.event) return;
    g.hud.help(`<b>Vigilante duty</b> — level ${this.level}<br>Press <kbd>V</kbd> to take a call.`);
    if (input.tap('KeyV')) this.start();
  }

  start() {
    const g = this.game, p = g.player;
    const a = rng.range(0, Math.PI * 2);
    const node = nearestNode(p.pos.x + Math.cos(a) * 130, p.pos.z + Math.sin(a) * 130);
    const at = nodePos(node.i, node.j);
    const model = TARGETS[Math.min(TARGETS.length - 1, Math.floor((this.level - 1) / 2))];
    const car = g.spawnTrafficVehicle(model, at.x, at.z, 'flee', rng.pick(COLORS));
    car.health = Math.min(car.def.health + 20 * (this.level - 1), 260);
    car.mission = 'vigilante';
    car.persistent = true;
    car.ai.cruise = 22 + this.level;
    this.job = { car, timeLeft: 80 + this.level * 6, lostT: 0, hint: null };
    g.hud.banner('VIGILANTE', `Dispatch: a ${car.def.name} is running. Wreck it.`, 'mission', 2.8);
    services.audio?.blip();
  }

  run(dt, inPatrol) {
    const g = this.game, j = this.job;
    j.timeLeft -= dt;
    if (j.car.dead) return this.finish(true);
    j.car.ai.target = { x: g.player.pos.x, z: g.player.pos.z };
    j.hint = inPatrol ? null : 'Get back in the patrol car!';
    j.lostT = inPatrol ? 0 : j.lostT + dt;
    if (j.timeLeft <= 0) return this.finish(false, 'The suspect got away.');
    if (j.lostT > 8) return this.finish(false, 'You left the patrol car.');
    if (dist2(j.car.pos.x, j.car.pos.z, g.player.pos.x, g.player.pos.z) > 420) this.finish(false, 'The suspect is out of range.');
  }

  finish(won, why = '') {
    const g = this.game;
    if (won) {
      // Back-to-back arrests pay a streak bonus of 10% each, up to 50%.
      this.streak++;
      const pay = Math.round(350 * this.level * (1 + 0.1 * Math.min(5, this.streak - 1)));
      g.player.money += pay;
      this.completed++;
      g.hud.banner('SUSPECT STOPPED', `Vigilante level ${this.level}  ·  ${formatMoney(pay)}`, 'pass', 3);
      g.skills.add('driving', 20);
      this.level = Math.min(MAX_LEVEL, this.level + 1);
      services.audio?.passed();
    } else { this.streak = 0; g.hud.banner('CALL DROPPED', why, 'fail', 2.6); }
    this.end();
  }

  end() {
    if (this.job) { this.job.car.mission = null; this.job.car.persistent = false; }
    this.job = null;
  }

  serialize() { return { level: this.level, completed: this.completed }; }

  restore(data) {
    this.reset();
    this.level = Math.max(1, Math.min(MAX_LEVEL, data?.level ?? 1));
    this.completed = data?.completed ?? 0;
  }
}
