// Sol's phone (press T): call a Bay Cab to any landmark, have Benny deliver the last car she drove,
// ask Rosa for a hot meal, check the skills, businesses, weather and lifetime stats, or save the game.
// The city keeps its place while the phone is out: the game state is 'phone' and the world holds still.
import { SKILLS, MAX_LEVEL } from '../systems/skills.js';
import { WEATHER_KINDS } from '../systems/weather.js';
import { nearestNode, nodePos } from '../ai/roadGraph.js';
import { PERKS } from '../systems/garagePerks.js';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '../systems/achievements.js';
import { LANE_OFFSET, TAXI_BASE_FARE, TAXI_METRES_PER_DOLLAR, DELIVERY_FEE, MEAL_COOLDOWN } from '../config.js';
import { services } from '../core/services.js';
import { dist2, formatMoney } from '../util/mathx.js';

const APPS = [
  ['cab', 'Bay Cab', 'Ride to a landmark'],
  ['benny', 'Benny', 'Your last car, delivered'],
  ['rosa', 'Rosa', 'A hot meal and a good lecture'],
  ['skills', 'Skills', 'Driving, shooting, stamina, strength'],
  ['garage', 'Garage', 'Engine, tyres and armour'],
  ['wardrobe', 'Wardrobe', 'Change into something nicer'],
  ['business', 'Business', 'Properties, turf and income'],
  ['trophies', 'Trophies', 'Achievements and rewards'],
  ['weather', 'Weather', 'Forecast for Palmera Bay'],
  ['stats', 'Stats', 'Everything Sol has done'],
  ['save', 'Save', 'Write to the bungalow slot'],
];

/** What the Bay Cab charges to take Sol from (x, z) to a door. */
const fareFor = (x, z, door) => TAXI_BASE_FARE + Math.round(dist2(x, z, door.x, door.z) / TAXI_METRES_PER_DOLLAR);

export class Phone {
  constructor(game) {
    this.game = game;
    this.view = 'home';
    this.mealReadyAt = 0;
    this.root = document.createElement('div');
    this.root.id = 'phone-screen';
    this.root.className = 'screen hidden';
    this.root.innerHTML = '<div class="phone-body"><div class="phone-head"><span id="phone-time"></span><span id="phone-sky"></span></div><div id="phone-view"></div><div class="phone-foot"><button data-act="home">Home</button><button data-act="close">Close</button></div></div>';
    document.body.appendChild(this.root);
    this.viewEl = this.root.querySelector('#phone-view');
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      e.stopPropagation();
      services.audio?.init();
      services.audio?.blip();
      this.act(t.dataset.act);
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  show() {
    this.view = 'home';
    this.root.classList.remove('hidden');
    this.render();
  }

  hide() { this.root.classList.add('hidden'); }

  act(name) {
    if (name === 'close') return this.game.closePhone();
    if (name === 'home') this.view = 'home';
    else if (name.startsWith('app:')) this.view = name.slice(4);
    else if (name.startsWith('ride:')) { this.ride(name.slice(5)); return; }
    else if (name.startsWith('outfit:')) { this.outfit(name.slice(7)); return; }
    else if (name === 'summon') { this.summon(); return; }
    else if (name === 'meal') { this.meal(); return; }
    else if (name === 'save') { this.save(); return; }
    this.render();
  }

  render() {
    const g = this.game;
    const h = g.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.root.querySelector('#phone-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.root.querySelector('#phone-sky').textContent = g.weather.label;
    const views = {
      home: () => this.home(), cab: () => this.cab(), benny: () => this.benny(), rosa: () => this.rosa(), skills: () => this.skills(),
      garage: () => this.garage(), wardrobe: () => this.wardrobe(), trophies: () => this.trophies(), business: () => this.business(), weather: () => this.weather(), stats: () => this.stats(), save: () => this.saveView(),
    };
    this.viewEl.innerHTML = (views[this.view] ?? views.home)();
  }

  home() {
    return `<div class="phone-grid">${APPS.map(([id, name, hint]) => `<button class="app" data-act="app:${id}"><b>${name}</b><small>${hint}</small></button>`).join('')}</div>`;
  }

  cab() {
    const g = this.game, p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos;
    const busy = g.missions.active || g.police.level > 0 || g.activities.busy;
    const rows = Object.values(g.plan.landmarks).map((lm) => {
      const fare = fareFor(pp.x, pp.z, lm.door);
      return `<button class="row" data-act="ride:${lm.id}" ${busy || p.money < fare ? 'disabled' : ''}><span>${lm.name ?? lm.id}</span><span>${formatMoney(fare)}</span></button>`;
    });
    const note = busy ? '<p class="note">The cab will not come during a mission, a race or while the cops are after you.</p>' : '';
    return `<h3>Bay Cab</h3>${note}<div class="phone-list">${rows.join('')}</div>`;
  }

  ride(id) {
    const g = this.game, lm = g.plan.landmarks[id];
    if (!lm || g.missions.active || g.police.level > 0 || g.activities.busy) return;
    const p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos;
    const fare = fareFor(pp.x, pp.z, lm.door);
    if (p.money < fare) { g.notify('Not enough cash for the fare.'); return; }
    p.money -= fare;
    g.closePhone();
    g.teleportPlayer(lm.door.x, lm.door.z + 3);
    g.notify(`The cab drops you at ${lm.name ?? id}. ${formatMoney(fare)}.`);
  }

  benny() {
    const g = this.game;
    const car = g.lastCarModel;
    const text = car ? `Benny will drop off your <b>${car.name}</b> near you.` : 'Benny has no car of yours on file yet. Steal one first.';
    return `<h3>Benny Two-Tones</h3><p>${text}</p><button class="big" data-act="summon" ${car ? '' : 'disabled'}>Bring it round — ${formatMoney(DELIVERY_FEE)}</button>`;
  }

  summon() {
    const g = this.game, p = g.player;
    const car = g.lastCarModel;
    if (!car) return;
    if (p.money < DELIVERY_FEE) { g.notify('Benny wants his money up front.'); return; }
    if (g.lastCar && !g.lastCar.dead && g.vehicles.includes(g.lastCar) && g.lastCar !== p.vehicle) {
      g.lastCar.dispose();
      g.vehicles.splice(g.vehicles.indexOf(g.lastCar), 1);
    }
    const fx = Math.sin(g.cameraRig.yaw), fz = Math.cos(g.cameraRig.yaw);
    const n = nearestNode(p.pos.x + fx * 50, p.pos.z + fz * 50);
    const at = nodePos(n.i, n.j);
    const v = g.spawnVehicle(car.id, at.x + 14, at.z + LANE_OFFSET, Math.PI / 2, car.color);
    v.persistent = true;
    g.lastCar = v;
    p.money -= DELIVERY_FEE;
    g.deliveryBlip = { x: v.pos.x, z: v.pos.z, t: 120 };
    g.closePhone();
    g.notify(`Benny dropped your ${car.name} down the street. Look for the blip.`);
  }

  rosa() {
    const g = this.game, p = g.player;
    const wait = Math.max(0, Math.ceil(this.mealReadyAt - services.time));
    const hurt = p.health < p.maxHealth;
    const lines = wait > 0 ? `Rosa says the kitchen needs ${wait} more seconds.` : hurt ? 'Rosa has a plate waiting. Come hungry.' : 'You look fine, mija. Come back when you are hurt.';
    return `<h3>Rosa's Diner</h3><p>${lines}</p><button class="big" data-act="meal" ${wait > 0 || !hurt ? 'disabled' : ''}>Order the special — free</button>`;
  }

  meal() {
    const g = this.game, p = g.player;
    if (services.time < this.mealReadyAt || p.health >= p.maxHealth) return;
    p.health = p.maxHealth;
    this.mealReadyAt = services.time + MEAL_COOLDOWN;
    services.audio?.pickup();
    g.notify('Rosa sends over her special. Health restored.');
    this.render();
  }

  skills() {
    const g = this.game;
    const rows = Object.entries(SKILLS).map(([id, s]) => {
      const pr = g.skills.progress(id);
      const pct = pr.level >= MAX_LEVEL ? 100 : Math.round((pr.into / pr.need) * 100);
      return `<div class="skill"><div><b>${s.name}</b> <span>Lv ${pr.level}${pr.level >= MAX_LEVEL ? ' (max)' : ''}</span></div><div class="meter"><i style="width:${pct}%"></i></div><small>${s.blurb}</small></div>`;
    });
    return `<h3>Skills</h3>${rows.join('')}`;
  }

  garage() {
    const perks = this.game.perks;
    const rows = PERKS.map((p) => {
      const price = perks.price(p.id);
      return `<div class="row static"><span><b>${p.name}</b><small>${p.blurb}</small></span><span>Lv ${perks.level(p.id)}/${p.prices.length}${price === null ? ' MAX' : `<br>${formatMoney(price)}`}</span></div>`;
    });
    return `<h3>Garage</h3><div class="phone-list">${rows.join('')}</div><p class="note">Invested so far: ${formatMoney(perks.spent())}. Buy upgrades by driving into the Fresh Coat garage and pressing 1, 2 or 3.</p>`;
  }

  wardrobe() {
    const rows = this.game.wardrobe.rows().map((r) => `<button class="row" data-act="outfit:${r.id}" ${r.state === 'wearing' ? 'disabled' : ''}><span>${r.name}</span><span>${r.state}</span></button>`);
    const next = this.game.wardrobe.nextToBuy();
    const hint = next ? `Next in the shop: ${next.name} for ${formatMoney(next.price)}.` : 'The wardrobe is complete.';
    return `<h3>Wardrobe</h3><div class="phone-list">${rows.join('')}</div><p class="note">${hint} Buying an outfit puts it straight on.</p>`;
  }

  outfit(id) {
    const g = this.game, w = g.wardrobe;
    const result = w.owned.has(id) ? (w.wear(id, g.player) ? 'ok' : 'none') : w.buy(id, g.player);
    if (result === 'poor') g.notify('Not enough cash for that outfit.');
    else if (result === 'ok') { services.audio?.pickup(); g.notify(`Sol changes into ${w.outfit(id).name}.`); }
    this.render();
  }

  trophies() {
    const a = this.game.achievements;
    const rows = ACHIEVEMENTS.map((t) => `<div class="row static ${a.unlocked.has(t.id) ? 'done' : ''}"><span><b>${t.name}</b><small>${t.text}</small></span><span>${a.unlocked.has(t.id) ? '✔' : `<small>${a.progress(t)}</small>`}</span></div>`);
    return `<h3>Trophies</h3><p class="note">${a.count}/${ACHIEVEMENTS.length} unlocked · ${formatMoney(ACHIEVEMENT_REWARD)} each</p><div class="phone-list">${rows.join('')}</div>`;
  }

  business() {
    const g = this.game, pr = g.properties, tf = g.territories;
    const rows = pr.items.map((it) => `<div class="row static"><span><b>${it.def.name}</b><small>${it.owned ? `${formatMoney(it.def.income)}/hr — ${formatMoney(it.stored)} waiting` : `For sale: ${formatMoney(it.def.price)}`}</small></span><span>${it.owned ? 'OWNED' : ''}</span></div>`);
    const turf = tf.turfs.map((t) => `<div class="row static"><span><b>${t.def.name}</b><small>${formatMoney(t.def.income)}/hr when taken</small></span><span>${t.state === 'yours' ? 'YOURS' : t.state === 'contested' ? 'FIGHT' : ''}</span></div>`);
    return `<h3>Business</h3><div class="phone-list">${rows.join('')}${turf.join('')}</div><p class="note">Businesses: ${formatMoney(pr.hourlyIncome)} an hour; turf: ${formatMoney(tf.hourlyIncome)} an hour. Collect business cash at the door.</p>`;
  }

  weather() {
    const w = this.game.weather;
    const rows = Object.entries(WEATHER_KINDS).map(([id, k]) => `<span class="${id === w.kind ? 'on' : ''}">${k.label}</span>`).join('');
    return `<h3>Weather</h3><p>${w.forecast()}</p><div class="chips">${rows}</div><p class="note">Wet roads cut tyre grip by up to a third.</p>`;
  }

  stats() {
    const g = this.game, p = g.player, s = p.stats, st = g.stunts, ev = g.events;
    const rows = [
      ['Story missions', `${g.missions.index}/${g.missions.total}`], ['Sun Tokens', `${g.activities.tokensFound.size}/${g.activities.tokens.length}`],
      ['Stunt jumps', `${st.done.size}/8 (best ${Math.round(st.bestJump)} m)`], ['Drift winnings', formatMoney(st.driftBanked)],
      ['Street events', `${ev.completed} (${formatMoney(ev.earned)})`], ['Kills', s.kills], ['Cars stolen', s.carsStolen],
      ['Distance', `${(s.distance / 1000).toFixed(1)} km`], ['Shots fired', s.shots],
    ];
    return `<h3>Stats</h3><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  }

  saveView() {
    return '<h3>Save</h3><p>Write progress to the bungalow slot. Missions also autosave when you pass them.</p><button class="big" data-act="save">Save game</button>';
  }

  save() {
    const g = this.game;
    g.save.write(g, 'slot1');
    services.audio?.cash();
    g.notify('Game saved from the phone.');
    g.closePhone();
  }
}
