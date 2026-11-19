// Businesses Sol can buy with her takings: a beach club, a salvage yard and a car wash. Each one
// earns money by the in-game hour; the cash piles up (to eight hours' worth) behind the door until
// she walks in and collects it. Marker colours say what is for sale and what is already hers.
import { Marker } from '../world/markers.js';
import { services } from '../core/services.js';
import { dist2, formatMoney } from '../util/mathx.js';

export const PROPERTY_DEFS = [
  { id: 'carwash', landmark: 'carwash', name: 'Sunbright Car Wash', price: 9000, income: 210, blurb: 'Suds, sponges and a back room nobody asks about.' },
  { id: 'lounge', landmark: 'lounge', name: 'Neon Lounge', price: 18000, income: 420, blurb: 'A beach club that never closes before sunrise.' },
  { id: 'salvage', landmark: 'salvage', name: 'Dockside Salvage', price: 26000, income: 640, blurb: 'Wrecks go in, parts and cash come out.' },
];

const MAX_HOURS = 8;
/** Real seconds in one in-game hour (one game minute passes per real second). */
const HOUR_SECONDS = 60;

export class Properties {
  constructor(game) {
    this.game = game;
    this.items = PROPERTY_DEFS.map((def) => {
      const door = game.plan.landmarks[def.landmark].door;
      const marker = new Marker('property', 2.2, 4).place(door.x, door.z + 2.5);
      return { def, door, marker, owned: false, stored: 0 };
    });
    services.properties = this;
  }

  reset() {
    for (const it of this.items) { it.owned = false; it.stored = 0; }
    this.paint();
  }

  get ownedCount() { return this.items.filter((it) => it.owned).length; }
  get hourlyIncome() { return this.items.reduce((sum, it) => sum + (it.owned ? it.def.income : 0), 0); }
  get waiting() { return this.items.reduce((sum, it) => sum + it.stored, 0); }
  /** Owning every business makes them cooperate: all of them earn 15% more. */
  get bonus() { return this.ownedCount === this.items.length ? 1.15 : 1; }

  paint() {
    for (const it of this.items) it.marker.setKind(it.owned ? 'owned' : 'property');
  }

  update(dt, input) {
    const g = this.game, p = g.player, t = services.time;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    for (const it of this.items) {
      const { def, door, marker } = it;
      if (it.owned) it.stored = Math.min(def.income * MAX_HOURS, it.stored + (def.income * this.bonus * dt) / HOUR_SECONDS);
      marker.animate(t);
      if (p.dead || p.vehicle || g.missions.active || g.activities.busy) continue;
      if (dist2(pp.x, pp.z, door.x, door.z + 2.5) > 3.4) continue;
      if (!it.owned) {
        g.hud.help(`<b>${def.name}</b> is for sale — ${formatMoney(def.price)}<br>${def.blurb}<br>Press <kbd>E</kbd> to buy it.`);
        if (input.tap('KeyE')) this.buy(it);
      } else if (it.stored >= 1) {
        g.hud.help(`<b>${def.name}</b><br>${formatMoney(it.stored)} waiting — press <kbd>E</kbd> to collect.`);
        if (input.tap('KeyE')) this.collect(it);
      } else g.hud.help(`<b>${def.name}</b><br>Earning ${formatMoney(def.income)} an hour.`);
    }
  }

  buy(it) {
    const g = this.game;
    if (g.player.money < it.def.price) { g.notify('You cannot afford it yet.'); services.audio?.click(); return; }
    g.player.money -= it.def.price;
    it.owned = true;
    it.stored = 0;
    this.paint();
    services.audio?.passed();
    g.hud.banner('PROPERTY BOUGHT', `${it.def.name}  ·  ${formatMoney(it.def.income)} an hour`, 'pass', 3.5);
  }

  collect(it) {
    const g = this.game;
    const amount = Math.floor(it.stored);
    it.stored -= amount;
    g.player.money += amount;
    services.audio?.cash();
    g.notify(`Collected ${formatMoney(amount)} from ${it.def.name}.`);
  }

  blips() {
    return this.items.map((it) => ({ x: it.door.x, z: it.door.z, icon: it.owned ? 'owned' : 'property' }));
  }

  serialize() { return this.items.map((it) => ({ id: it.def.id, owned: it.owned, stored: Math.floor(it.stored) })); }

  restore(list) {
    this.reset();
    for (const row of list ?? []) {
      const it = this.items.find((x) => x.def.id === row.id);
      if (!it) continue;
      it.owned = !!row.owned;
      it.stored = row.stored ?? 0;
    }
    this.paint();
  }
}
