// Things to do between story missions: two street races, Bay Couriers delivery runs, fifteen hidden
// Sun Tokens, the Bayside Arms counter, the Fresh Coat respray, health and armour pickups and the
// save point at Sol's bungalow.
import { Marker, Pickup } from '../world/markers.js';
import { nodePos } from '../ai/roadGraph.js';
import { services } from '../core/services.js';
import { WEAPONS, CITY_SIZE } from '../config.js';
import { PIER } from '../world/cityPlan.js';
import { dist2, formatMoney, makeRng, rng } from '../util/mathx.js';

export const RACES = [
  { id: 'shoreline', name: 'Shoreline Sprint', limit: 95, prize: 1200, path: [[10, 1], [10, 4], [10, 7], [10, 10], [7, 10], [4, 10], [4, 7], [6, 7]] },
  { id: 'glassloop', name: 'Glasswater Loop', limit: 70, prize: 900, path: [[3, 2], [5, 2], [7, 2], [7, 4], [7, 6], [5, 6], [3, 6], [3, 4], [3, 2]] },
];

const SHOP_ITEMS = [
  { key: 'Digit1', id: 'pistol' }, { key: 'Digit2', id: 'smg' }, { key: 'Digit3', id: 'shotgun' }, { key: 'Digit4', id: 'armor', name: 'Body armour', price: 250 },
];

export class Activities {
  constructor(game) {
    this.game = game;
    const lm = game.plan.landmarks;
    this.markers = {
      shop: new Marker('shop').place(lm.gunshop.door.x, lm.gunshop.door.z),
      spray: new Marker('spray', 3.2, 3).place(lm.spray.door.x, lm.spray.door.z + 6),
      save: new Marker('save').place(lm.safehouse.door.x + 6, lm.safehouse.door.z),
      job: new Marker('job').place(lm.park.door.x, lm.park.door.z),
    };
    this.raceStarts = RACES.map((r) => {
      const p = nodePos(r.path[0][0], r.path[0][1]);
      return { race: r, marker: new Marker('race', 2.6, 3).place(p.x + 0.01, p.z) };
    });
    this.checkpoint = new Marker('checkpoint', 4, 7);
    this.checkpoint.show(false);
    this.race = null;
    this.courier = null;
    this.bestTimes = {};
    this.tokensFound = new Set();
    this.tokens = this.placeTokens();
    this.pickups = [
      new Pickup('health', lm.hospital.door.x + 4, lm.hospital.door.z),
      new Pickup('health', PIER.x0 + 30, PIER.z, PIER.deck),
      new Pickup('health', lm.park.block.cx + 10, lm.park.block.cz + 10, 0.2),
      new Pickup('armor', lm.police.door.x - 6, lm.police.door.z),
    ];
    for (const p of this.pickups) p.respawn = 0;
  }

  /** Fifteen Sun Tokens hidden around the city, the beach and the pier. */
  placeTokens() {
    const r = makeRng(1515);
    const plan = this.game.plan;
    const spots = [
      { x: PIER.x1 - 6, z: PIER.z, y: PIER.deck }, { x: CITY_SIZE + 30, z: 30 }, { x: CITY_SIZE + 28, z: 700 },
      { x: plan.landmarks.park.block.cx, z: plan.landmarks.park.block.cz + 2, y: 1.2 },
      { x: 150, z: CITY_SIZE + 14 }, { x: 470, z: CITY_SIZE + 12 },
    ];
    while (spots.length < 15) {
      const b = r.pick(plan.blocks);
      const side = r.int(0, 3);
      const t = r.range(6, 58);
      spots.push(side === 0 ? { x: b.x0 + t, z: b.z0 + 1.6 } : side === 1 ? { x: b.x1 - 1.6, z: b.z0 + t } : side === 2 ? { x: b.x0 + t, z: b.z1 - 1.6 } : { x: b.x0 + 1.6, z: b.z0 + t });
    }
    return spots.map((s, i) => { const p = new Pickup('token', s.x, s.z, s.y ?? (s.x < CITY_SIZE && s.z < CITY_SIZE ? 0.18 : null)); p.index = i; return p; });
  }

  get busy() { return !!this.race || !!this.courier; }

  /** Blips for the minimap and the big map. */
  blips() {
    const out = [];
    const lm = this.game.plan.landmarks;
    out.push({ x: lm.gunshop.door.x, z: lm.gunshop.door.z, icon: 'guns' }, { x: lm.spray.door.x, z: lm.spray.door.z, icon: 'spray' }, { x: lm.safehouse.door.x, z: lm.safehouse.door.z, icon: 'save' }, { x: lm.park.door.x, z: lm.park.door.z, icon: 'job' }, { x: lm.hospital.door.x, z: lm.hospital.door.z, icon: 'hospital' }, { x: lm.police.door.x, z: lm.police.door.z, icon: 'police' });
    if (!this.busy) for (const s of this.raceStarts) out.push({ x: s.marker.x, z: s.marker.z, icon: 'race' });
    return out;
  }

  /** Where the GPS should lead while a race or courier job runs. */
  currentTarget() {
    if (this.race) return this.race.points[this.race.index];
    if (this.courier) return this.courier.dest;
    return null;
  }

  objective() {
    if (this.race) return { title: this.race.def.name, text: `Checkpoint ${this.race.index}/${this.race.points.length - 1}` };
    if (this.courier) return { title: 'Bay Couriers', text: `Deliver the parcel to ${this.courier.destName}. (${this.courier.done + 1}/${this.courier.total})` };
    return null;
  }

  timer() {
    if (this.race) return this.race.timeLeft;
    if (this.courier) return this.courier.timeLeft;
    return null;
  }

  update(dt, input) {
    const g = this.game, t = services.time;
    const p = g.player;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    for (const m of Object.values(this.markers)) m.animate(t);
    for (const s of this.raceStarts) { s.marker.show(!this.busy && !g.missions.active); s.marker.animate(t); }
    this.checkpoint.animate(t);
    for (const tok of this.tokens) {
      tok.animate(t);
      if (tok.active && !p.dead && dist2(pp.x, pp.z, tok.x, tok.z) < 1.8) this.collectToken(tok);
    }
    for (const pk of this.pickups) {
      pk.animate(t);
      if (!pk.active) { pk.respawn -= dt; if (pk.respawn <= 0) pk.setActive(true); continue; }
      if (!p.vehicle && !p.dead && dist2(pp.x, pp.z, pk.x, pk.z) < 1.5) {
        if (pk.kind === 'health' && p.health < p.maxHealth) { p.health = p.maxHealth; pk.setActive(false); pk.respawn = 60; services.audio.pickup(); g.notify('Health restored.'); }
        if (pk.kind === 'armor' && p.armor < 100) { p.armor = 100; pk.setActive(false); pk.respawn = 90; services.audio.pickup(); g.notify('Body armour picked up.'); }
      }
    }
    if (p.dead) return;
    if (this.race) this.updateRace(dt, pp);
    else if (this.courier) this.updateCourier(dt, pp);
    if (g.missions.active) return;
    const near = (m, r = m.radius + 1) => dist2(pp.x, pp.z, m.x, m.z) < r;
    if (!p.vehicle && near(this.markers.shop)) this.shop(input);
    else if (p.vehicle && near(this.markers.spray, 4.5)) this.spray(input);
    else if (!p.vehicle && near(this.markers.save)) {
      g.hud.help('Press <kbd>E</kbd> to save your game.');
      if (input.tap('KeyE')) { g.save.write(g, 'slot1'); services.audio.cash(); g.notify('Game saved at Sol’s Bungalow.'); }
    } else if (!this.busy && near(this.markers.job, 3)) {
      g.hud.help('<b>Bay Couriers</b><br>Press <kbd>E</kbd> to take four delivery runs. Any car will do.');
      if (input.tap('KeyE')) this.startCourier();
    } else if (!this.busy) {
      for (const s of this.raceStarts) {
        if (!near(s.marker, 4)) continue;
        const best = this.bestTimes[s.race.id];
        g.hud.help(`<b>${s.race.name}</b> — ${formatMoney(s.race.prize)} prize${best ? `, best ${best.toFixed(1)}s` : ''}<br>${p.vehicle ? 'Press <kbd>E</kbd> to race.' : 'You need a car to race.'}`);
        if (p.vehicle && input.tap('KeyE')) this.startRace(s.race);
      }
    }
  }

  collectToken(tok) {
    const g = this.game;
    tok.setActive(false);
    this.tokensFound.add(tok.index);
    g.player.money += 100;
    services.audio.cash();
    const n = this.tokensFound.size;
    g.notify(`Sun Token ${n}/${this.tokens.length} found. +$100`);
    if (n === this.tokens.length) { g.player.money += 5000; g.hud.banner('ALL SUN TOKENS', '+$5,000 and the city salutes you', 'pass', 4); }
  }

  shop(input) {
    const g = this.game, p = g.player;
    const lines = SHOP_ITEMS.map((it, i) => {
      if (it.id === 'armor') return `<kbd>${i + 1}</kbd> ${it.name} — ${formatMoney(it.price)}`;
      const w = WEAPONS[it.id];
      return p.weapons[it.id].owned ? `<kbd>${i + 1}</kbd> ${w.name} ammo ×${w.ammoPack} — ${formatMoney(w.ammoPrice)}` : `<kbd>${i + 1}</kbd> ${w.name} — ${formatMoney(w.price)}`;
    });
    g.hud.help(`<b>Bayside Arms</b><br>${lines.join('<br>')}`);
    for (const it of SHOP_ITEMS) {
      if (!input.tap(it.key)) continue;
      if (it.id === 'armor') { this.buy(it.price, () => { p.armor = 100; }, 'Body armour'); continue; }
      const w = WEAPONS[it.id];
      if (p.weapons[it.id].owned) this.buy(w.ammoPrice, () => p.giveWeapon(it.id, w.ammoPack), `${w.name} ammo`);
      else this.buy(w.price, () => { p.giveWeapon(it.id, w.clip * 3); p.selectWeapon(it.id); }, w.name);
    }
  }

  buy(price, give, what) {
    const g = this.game;
    if (g.player.money < price) { g.notify('Not enough cash.'); services.audio.click(); return; }
    g.player.money -= price;
    give();
    services.audio.cash();
    g.notify(`Bought: ${what}.`);
  }

  spray(input) {
    const g = this.game, v = g.player.vehicle;
    g.hud.help('<b>Fresh Coat</b><br>Press <kbd>E</kbd>: repair, new paint, new plates — $200.');
    if (!input.tap('KeyE')) return;
    if (g.player.money < 200) { g.notify('Not enough cash.'); return; }
    g.player.money -= 200;
    v.health = v.def.health; v.burnT = 0;
    const colors = v.def.colors.length > 1 ? v.def.colors.filter((c) => c !== v.color) : [0x2de2c8, 0xff4fa0, 0xffd25e];
    v.color = rng.pick(colors);
    // Paint materials are shared between cars of a colour, so give this one its own.
    const old = v.parts.paint, fresh = old.clone();
    fresh.color.setHex(v.color);
    v.parts.body.traverse((m) => { if (m.isMesh && m.material === old) m.material = fresh; });
    v.parts.paint = fresh;
    if (g.police.level > 0 && !g.police.seen) { g.police.clear(); g.notify('Fresh paint, fresh plates. The cops lost you.'); }
    else g.notify('Repaired and resprayed.');
    services.audio.cash();
  }

  // ---- Races ----
  startRace(def) {
    const g = this.game;
    this.race = { def, points: def.path.map(([i, j]) => nodePos(i, j)), index: 1, timeLeft: def.limit + 3, elapsed: -3, countdown: 3 };
    g.hud.banner(def.name.toUpperCase(), 'Hit every checkpoint before the clock runs out', 'mission', 2.5);
    services.audio.blip();
  }

  updateRace(dt, pp) {
    const g = this.game, r = this.race;
    r.timeLeft -= dt; r.elapsed += dt;
    const cp = r.points[r.index];
    this.checkpoint.place(cp.x, cp.z).show(true);
    if (r.elapsed < 0 && g.player.vehicle) { g.player.vehicle.vx *= 0.8; g.player.vehicle.vz *= 0.8; g.hud.help(`<b>${Math.ceil(-r.elapsed)}</b>`); }
    if (!g.player.vehicle) { g.hud.help('Get back in a car!'); }
    if (r.timeLeft <= 0) { this.endRace(false); return; }
    if (g.player.vehicle && dist2(pp.x, pp.z, cp.x, cp.z) < 9) {
      services.audio.blip();
      r.index++;
      if (r.index >= r.points.length) this.endRace(true);
    }
  }

  endRace(won) {
    const g = this.game, r = this.race;
    this.race = null;
    this.checkpoint.show(false);
    if (!won) { g.hud.banner('RACE LOST', 'Out of time', 'fail', 3); services.audio.failed(); return; }
    const time = r.elapsed;
    const first = !this.bestTimes[r.def.id];
    const prize = first ? r.def.prize : Math.round(r.def.prize / 4);
    if (!this.bestTimes[r.def.id] || time < this.bestTimes[r.def.id]) this.bestTimes[r.def.id] = time;
    g.player.money += prize;
    g.hud.banner('RACE WON', `${time.toFixed(1)} s  ·  ${formatMoney(prize)}`, 'pass', 4);
    services.audio.passed();
  }

  // ---- Bay Couriers ----
  startCourier() {
    this.courier = { done: 0, total: 4, earned: 0 };
    this.nextDelivery();
    this.game.hud.banner('BAY COURIERS', 'Four parcels. Speed pays.', 'mission', 2.5);
  }

  nextDelivery() {
    const g = this.game, c = this.courier;
    const options = Object.values(g.plan.landmarks).filter((l) => l.id !== 'park');
    const pp = g.player.pos;
    let dest;
    do dest = rng.pick(options); while (dist2(dest.door.x, dest.door.z, pp.x, pp.z) < 150 && rng.chance(0.85));
    c.dest = { x: dest.door.x, z: dest.door.z };
    c.destName = dest.name;
    c.timeLeft = 16 + dist2(dest.door.x, dest.door.z, pp.x, pp.z) / 11;
    this.checkpoint.place(c.dest.x, c.dest.z).show(true);
  }

  updateCourier(dt, pp) {
    const g = this.game, c = this.courier;
    c.timeLeft -= dt;
    if (c.timeLeft <= 0) {
      g.hud.banner('DELIVERY LATE', `Earned ${formatMoney(c.earned)}`, 'fail', 3);
      this.courier = null; this.checkpoint.show(false); services.audio.failed();
      return;
    }
    if (dist2(pp.x, pp.z, c.dest.x, c.dest.z) < 6) {
      const pay = 250 + Math.round(c.timeLeft * 8) + c.done * 100;
      c.earned += pay; c.done++;
      g.player.money += pay;
      services.audio.cash();
      g.notify(`Delivered! +${formatMoney(pay)}`);
      if (c.done >= c.total) { g.hud.banner('JOB DONE', `Bay Couriers paid ${formatMoney(c.earned)}`, 'pass', 3.5); this.courier = null; this.checkpoint.show(false); services.audio.passed(); }
      else this.nextDelivery();
    }
  }
}
