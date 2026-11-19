// Street events that find Sol while she free-roams: a mugger running down a tourist, an armoured
// truck cruising the avenues with its back door loose, and a Gilded Hand crew out to settle a score.
// One event runs at a time; each pays out when it is dealt with and quietly lapses when ignored.
import { LOOKS, randomLook } from '../entities/humanoid.js';
import { Pickup } from '../world/markers.js';
import { nearestNode, nodePos } from '../ai/roadGraph.js';
import { services } from '../core/services.js';
import { dist2, formatMoney, rng } from '../util/mathx.js';

const GAP = [38, 85];
const LAPSE_DISTANCE = 300;

export class AmbientEvents {
  constructor(game) {
    this.game = game;
    this.event = null;
    this.timer = rng.range(30, 55);
    this.completed = 0;
    this.earned = 0;
    services.events = this;
  }

  reset() { this.clear(); this.completed = 0; this.earned = 0; this.timer = rng.range(30, 55); }

  /** Frees everyone and everything the running event holds, leaving them to the ambient world. */
  clear() {
    if (!this.event) return;
    for (const e of this.event.actors ?? []) { e.persistent = false; e.mission = null; e.script = null; }
    for (const v of this.event.cars ?? []) { v.persistent = false; v.mission = null; }
    this.event = null;
  }

  objective() { return this.event ? { title: this.event.title, text: this.event.text } : null; }

  blips() {
    const f = this.event?.focus();
    return f ? [{ x: f.x, z: f.z, icon: 'event' }] : [];
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.event) { this.tick(dt); return; }
    if (g.missions.active || g.activities.busy || g.police.level > 0 || p.dead) return;
    // Nobody is out mugging tourists in a thunderstorm: the clock runs at half speed.
    this.timer -= g.weather.kind === 'storm' ? dt * 0.5 : dt;
    if (this.timer <= 0) {
      this.timer = rng.range(45, 90);
      this.start();
    }
  }

  start() {
    const roll = rng.next?.() ?? Math.random();
    const kind = roll < 0.4 ? mugging : roll < 0.72 ? armouredTruck : gangAmbush;
    this.event = kind(this.game, this);
    if (!this.event) return;
    this.event.age = 0;
    this.game.notify(`<b>${this.event.title}</b> — ${this.event.text}`);
    services.audio?.blip();
  }

  tick(dt) {
    const g = this.game, e = this.event;
    e.age += dt;
    const pp = g.player.vehicle ? g.player.vehicle.pos : g.player.pos;
    const f = e.focus();
    const status = e.update(dt);
    if (status === 'done') return this.finish(true);
    if (status && status.startsWith('fail')) return this.finish(false, status.slice(5));
    if (e.age > e.limit || (f && dist2(pp.x, pp.z, f.x, f.z) > LAPSE_DISTANCE) || g.player.dead) this.finish(false, 'The moment passed.');
  }

  finish(won, why = '') {
    const g = this.game, e = this.event;
    if (won) {
      this.completed++;
      this.earned += e.reward;
      g.player.money += e.reward;
      g.hud.banner('STREET JUSTICE', `${e.title}  ·  ${formatMoney(e.reward)}`, 'pass', 3);
      g.skills.add('shooting', 18);
      services.audio?.passed();
    } else if (why) g.notify(why);
    this.clear();
  }

  /** Drops a bag of cash that Sol can scoop up. */
  dropCash(x, z, amount) {
    const bag = new Pickup('cash', x, z, services.game.player.pos.y);
    bag.amount = amount;
    bag.life = 45;
    this.game.cashDrops.push(bag);
  }
}

/** A point on the ground around the player, between min and max metres away. */
function ringPoint(game, min, max) {
  const p = game.player;
  const a = rng.range(0, Math.PI * 2), r = rng.range(min, max);
  return { x: p.pos.x + Math.cos(a) * r, z: p.pos.z + Math.sin(a) * r };
}

function mugging(game, events) {
  const p = game.player;
  const victim = game.peds.spawnCivilianNear(p.pos.x, p.pos.z, GAP[0], GAP[1]);
  if (!victim) return null;
  const mugger = game.peds.spawn(LOOKS.gang, victim.pos.x - 4, victim.pos.z - 4, 'gang');
  mugger.weapon = 'pistol';
  mugger.hostile = false;
  mugger.health = mugger.maxHealth = 70;
  victim.persistent = mugger.persistent = true;
  const state = { robbed: false, bagTaken: false };
  victim.script = () => {
    const dx = victim.pos.x - mugger.pos.x, dz = victim.pos.z - mugger.pos.z, d = Math.hypot(dx, dz) || 1;
    if (state.robbed) return { wx: 0, wz: 0, face: null };
    return { wx: (dx / d) * 5.4, wz: (dz / d) * 5.4, face: null };
  };
  mugger.script = () => {
    const pl = game.player;
    if (!state.robbed) {
      const dx = victim.pos.x - mugger.pos.x, dz = victim.pos.z - mugger.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d < 1.5) { state.robbed = true; game.speech(victim, 'My bag! Somebody stop him!'); }
      return { wx: (dx / d) * 6.6, wz: (dz / d) * 6.6, face: null };
    }
    const dx = mugger.pos.x - pl.pos.x, dz = mugger.pos.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
    return { wx: (dx / d) * 6.8, wz: (dz / d) * 6.8, face: null };
  };
  return {
    title: 'Mugging', text: 'Chase down the mugger before he gets away.', limit: 70, reward: 260, actors: [victim, mugger],
    focus: () => (mugger.dead ? null : mugger.pos),
    update() {
      if (victim.dead) return 'fail:The tourist did not make it.';
      if (!mugger.dead) return null;
      events.dropCash(mugger.pos.x + 0.8, mugger.pos.z, rng.int(120, 260));
      game.speech(victim, 'Thank you, thank you!');
      return 'done';
    },
  };
}

function armouredTruck(game, events) {
  const p = game.player;
  const spot = ringPoint(game, 70, 130);
  const node = nearestNode(spot.x, spot.z);
  const at = nodePos(node.i, node.j);
  const truck = game.spawnTrafficVehicle('tidewater', at.x, at.z, 'cruise', 0x3d4a5a);
  truck.health = 300;
  truck.mission = 'event';
  truck.persistent = true;
  truck.ai.cruise = 15;
  void p;
  return {
    title: 'Armoured Truck', text: 'A cash truck is on the avenue. Wreck it and grab the bags.', limit: 160, reward: 150, cars: [truck],
    focus: () => (truck.dead ? null : truck.pos),
    update() {
      if (!truck.dead) {
        if (truck.health < 280 && truck.ai.mode === 'cruise') { truck.ai.mode = 'flee'; truck.ai.cruise = 24; }
        if (truck.ai.mode === 'flee') truck.ai.target = { x: game.player.pos.x, z: game.player.pos.z };
        return null;
      }
      for (let i = 0; i < 4; i++) events.dropCash(truck.pos.x + rng.range(-3, 3), truck.pos.z + rng.range(-3, 3), rng.int(250, 600));
      return 'done';
    },
  };
}

function gangAmbush(game, events) {
  const spot = ringPoint(game, 28, 44);
  const crew = [];
  for (let i = 0; i < 4; i++) {
    const g = game.peds.spawn(i === 0 ? LOOKS.kane : LOOKS.gang, spot.x + rng.range(-5, 5), spot.z + rng.range(-5, 5), 'gang');
    g.weapon = i % 2 ? 'smg' : 'pistol';
    g.hostile = true;
    g.persistent = true;
    g.mission = true;
    g.guardPoint = { x: g.pos.x, z: g.pos.z };
    crew.push(g);
  }
  void randomLook;
  return {
    title: 'Ambush', text: 'A Gilded Hand crew has spotted you. Take them down.', limit: 120, reward: 400, actors: crew,
    focus: () => crew.find((c) => !c.dead)?.pos ?? null,
    update() {
      if (!crew.every((c) => c.dead)) return null;
      events.dropCash(crew[0].pos.x, crew[0].pos.z, rng.int(180, 420));
      return 'done';
    },
  };
}
