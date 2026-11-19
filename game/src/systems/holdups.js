// Palm Mart hold-ups: three little corner stores will empty the till for anyone who walks in with a
// gun drawn. Press E at the door and keep your nerve for five seconds. It pays well and the alarm
// calls the cops at two stars the moment it starts. Each store needs a few hours to refill its till.
import { Marker } from '../world/markers.js';
import { services } from '../core/services.js';
import { dist2, formatMoney, rng } from '../util/mathx.js';

export const MARTS = ['mart1', 'mart2', 'mart3'];
const NERVE_SECONDS = 5;
const REFILL_SECONDS = 240;
const REACH = 4.5;

export class Holdups {
  constructor(game) {
    this.game = game;
    this.stores = MARTS.map((id) => {
      const lm = game.plan.landmarks[id];
      const marker = new Marker('job', 1.6, 3).place(lm.door.x, lm.door.z + 2);
      return { id, name: lm.name, door: { x: lm.door.x, z: lm.door.z + 2 }, marker, readyAt: 0 };
    });
    this.job = null;
    this.total = 0;
    services.holdups = this;
  }

  reset() { this.job = null; this.total = 0; for (const s of this.stores) s.readyAt = 0; }

  ready(s) { return services.time >= s.readyAt; }

  update(dt, input) {
    const g = this.game, p = g.player, t = services.time;
    for (const s of this.stores) { s.marker.show(this.ready(s)); s.marker.animate(t); }
    if (this.job) return this.run(dt);
    if (p.vehicle || p.dead || g.missions.active || g.activities.busy) return;
    for (const s of this.stores) {
      if (!this.ready(s) || dist2(p.pos.x, p.pos.z, s.door.x, s.door.z) > REACH) continue;
      if (p.weapon === 'fists') { g.hud.help(`<b>${s.name}</b><br>Draw a gun if you want the till.`); continue; }
      g.hud.help(`<b>${s.name}</b><br>Press <kbd>E</kbd> to hold it up. Hold your nerve for ${NERVE_SECONDS} seconds.`);
      if (input.tap('KeyE')) this.begin(s);
    }
  }

  begin(s) {
    const g = this.game;
    this.job = { store: s, elapsed: 0 };
    g.police.setLevel(Math.max(2, g.police.level));
    g.police.seen = true;
    g.hud.flashWanted();
    services.audio?.blip();
    g.dialogue.bark('<b>Clerk</b>: “Take it! Take the cash! Please!”', 3);
  }

  run(dt) {
    const g = this.game, p = g.player, j = this.job;
    const near = dist2(p.pos.x, p.pos.z, j.store.door.x, j.store.door.z) <= REACH + 1.5;
    if (p.dead || p.vehicle || !near || p.weapon === 'fists') {
      this.job = null;
      if (!p.dead) g.notify('You bailed before the till was open.');
      return;
    }
    j.elapsed += dt;
    g.hud.help(`<b>Hold-up</b><br>Stay put… ${Math.max(0, Math.ceil(NERVE_SECONDS - j.elapsed))}`);
    if (j.elapsed < NERVE_SECONDS) return;
    // A bigger gun gets a faster till: the shotgun clerk empties the drawer and the safe.
    const persuasion = { pistol: 1, smg: 1.2, shotgun: 1.35 }[p.weapon] ?? 1;
    const take = Math.round(rng.int(450, 1100) * persuasion);
    p.money += take;
    this.total += take;
    j.store.readyAt = services.time + REFILL_SECONDS;
    g.skills.add('shooting', 10);
    g.hud.banner('TILL EMPTIED', `${j.store.name}  ·  ${formatMoney(take)}`, 'pass', 2.8);
    services.audio?.cash();
    this.job = null;
  }

  blips() {
    return this.stores.filter((s) => this.ready(s)).map((s) => ({ x: s.door.x, z: s.door.z, icon: 'mart' }));
  }

  serialize() { return { total: this.total }; }

  restore(data) { this.reset(); this.total = data?.total ?? 0; }
}
