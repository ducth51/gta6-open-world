// Bay Cab fares: sit in a yellow cab and press V. A passenger is waiting outside a landmark; pick
// them up, take them to another one before the meter's patience runs out, and keep the cab in one
// piece for the tip. Five fares make a shift, and a shift pays a bonus.
import { Marker } from '../world/markers.js';
import { randomLook } from '../entities/humanoid.js';
import { services } from '../core/services.js';
import { dist2, formatMoney, rng } from '../util/mathx.js';

const SHIFT_FARES = 5;
const SHIFT_BONUS = 600;

export class TaxiJob {
  constructor(game) {
    this.game = game;
    this.job = null;
    this.fares = 0;
    this.earned = 0;
    this.marker = new Marker('checkpoint', 3, 7);
    this.marker.show(false);
    services.taxi = this;
  }

  reset() { this.end(); this.fares = 0; this.earned = 0; }

  get active() { return !!this.job; }

  /** Where the GPS should lead: the passenger, then the drop-off. */
  target() {
    const j = this.job;
    if (!j) return null;
    return j.stage === 'pickup' ? j.pickup : j.dest;
  }

  objective() {
    const j = this.job;
    if (!j) return null;
    const text = j.hint ?? (j.stage === 'pickup' ? `Pick up the passenger outside ${j.pickupName}.` : `Take the passenger to ${j.destName}. (${this.shiftCount + 1}/${SHIFT_FARES})`);
    return { title: 'Bay Cab fare', text };
  }

  timer() { return this.job && this.job.stage === 'ride' ? this.job.timeLeft : null; }

  get shiftCount() { return this.fares % SHIFT_FARES; }

  update(dt, input) {
    const g = this.game, p = g.player, v = p.vehicle;
    const inCab = !!v && v.def.taxi && !v.dead;
    this.marker.animate(services.time);
    if (!this.job) {
      if (!inCab || g.missions.active || g.activities.busy || g.vigilante.active || g.police.level > 0 || g.events.event) return;
      g.hud.help(`<b>Bay Cab</b> — ${this.fares} fare${this.fares === 1 ? '' : 's'} so far<br>Press <kbd>V</kbd> to take a fare.`);
      if (input.tap('KeyV')) this.start();
      return;
    }
    const j = this.job;
    j.hint = inCab ? null : 'Get back in the cab!';
    j.lostT = inCab ? 0 : j.lostT + dt;
    if (j.lostT > 12) return this.finish(false, 'You left the cab. The passenger found another ride.');
    if (g.police.level > 1) return this.finish(false, 'The passenger bailed out of the cab. Too much heat.');
    if (j.stage === 'pickup') {
      if (inCab && v.speed < 5 && dist2(v.pos.x, v.pos.z, j.pickup.x, j.pickup.z) < 7) this.board(v);
      return;
    }
    j.timeLeft -= dt;
    if (j.timeLeft <= 0) return this.finish(false, 'Too slow. The passenger got out and walked.');
    if (inCab && v.speed < 6 && dist2(v.pos.x, v.pos.z, j.dest.x, j.dest.z) < 7) this.dropOff(v);
  }

  start() {
    const g = this.game, p = g.player;
    const options = Object.values(g.plan.landmarks).filter((l) => l.id !== 'park' && dist2(l.door.x, l.door.z, p.pos.x, p.pos.z) > 70);
    const spot = rng.pick(options);
    const passenger = g.peds.spawn(randomLook(rng), spot.door.x + 2.2, spot.door.z + 2.4, 'civ');
    passenger.persistent = true;
    passenger.script = () => ({ wx: 0, wz: 0, face: null });
    this.job = { stage: 'pickup', pickup: { x: spot.door.x, z: spot.door.z + 3 }, pickupName: spot.name, passenger, lostT: 0, hint: null };
    this.marker.place(this.job.pickup.x, this.job.pickup.z).show(true);
    g.hud.banner('BAY CAB', 'A fare is waiting. Pick them up.', 'mission', 2);
    services.audio?.blip();
  }

  board(cab) {
    const g = this.game, j = this.job;
    const far = Object.values(g.plan.landmarks).filter((l) => l.id !== 'park' && dist2(l.door.x, l.door.z, j.pickup.x, j.pickup.z) > 160);
    const spot = rng.pick(far);
    j.stage = 'ride';
    j.dest = { x: spot.door.x, z: spot.door.z + 3 };
    j.destName = spot.name;
    j.distance = dist2(j.pickup.x, j.pickup.z, j.dest.x, j.dest.z);
    j.timeLeft = 22 + j.distance / 9;
    j.startHealth = cab.health;
    j.passenger.mesh.visible = false;
    this.marker.place(j.dest.x, j.dest.z);
    g.hud.banner('FARE ON', `Destination: ${spot.name}`, 'mission', 1.8);
    services.audio?.blip();
  }

  dropOff(cab) {
    const g = this.game, j = this.job;
    const crash = Math.max(0, j.startHealth - cab.health);
    const pay = Math.max(80, Math.round(120 + j.distance * 0.9 + j.timeLeft * 4 - crash * 2));
    g.player.money += pay;
    this.fares++;
    this.earned += pay;
    services.audio?.cash();
    g.notify(`Fare paid: ${formatMoney(pay)}${crash > 8 ? ' (the dents cost you the tip)' : ''}.`);
    j.passenger.mesh.visible = true;
    j.passenger.pos.set(cab.doorPoint().x, cab.pos.y, cab.doorPoint().z);
    g.skills.add('driving', 8);
    this.release(j);
    if (this.fares % SHIFT_FARES === 0) {
      g.player.money += SHIFT_BONUS;
      g.hud.banner('SHIFT COMPLETE', `${SHIFT_FARES} fares  ·  bonus ${formatMoney(SHIFT_BONUS)}`, 'pass', 3.4);
      this.end();
    } else this.start();
  }

  finish(won, why = '') {
    if (!won) this.game.hud.banner('FARE LOST', why, 'fail', 3);
    this.end();
  }

  release(j) {
    j.passenger.script = null;
    j.passenger.persistent = false;
    j.passenger.mesh.visible = true;
  }

  end() {
    if (this.job) this.release(this.job);
    this.job = null;
    this.marker.show(false);
  }

  serialize() { return { fares: this.fares, earned: this.earned }; }

  restore(data) {
    this.reset();
    this.fares = data?.fares ?? 0;
    this.earned = data?.earned ?? 0;
  }
}
