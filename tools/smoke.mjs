// Smoke test (Node 22+, standard library only): opens the game in headless Chrome through
// tools/playtest.mjs, runs one expression per system inside the page and checks each answer.
//
//   node serve.ts --port 8123            (in one terminal)
//   node tools/smoke.mjs http://localhost:8123/index.html
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:8080/index.html';
const playtest = join(dirname(fileURLToPath(import.meta.url)), 'playtest.mjs');

/** [name, expression run in the page, check on its JSON-decoded result]. */
const CHECKS = [
  ['new game starts', `(window.__game.startGame(null), window.__game.state)`, (v) => v === 'play'],
  ['storm wets the road', `(window.__game.weather.force('storm'), window.__game.weather.grip)`, (v) => v < 0.75],
  ['no two lights green at once', `import('./src/systems/trafficLights.js').then((m) => { for (let t = 0; t < 80; t += 0.5) if (m.lightState('x', 4, 4, t) === 'green' && m.lightState('z', 4, 4, t) === 'green') return false; return true; })`, (v) => v === true],
  ['ramp lifts a car at its top', `import('./src/world/rampLayout.js').then((m) => { const r = m.RAMPS[0], t = m.rampTop(r); return m.rampHeightAt(t.x - Math.sin(r.yaw) * 0.5, t.z - Math.cos(r.yaw) * 0.5) > 3; })`, (v) => v === true],
  ['skills level up', `(window.__game.skills.add('driving', 150), window.__game.skills.level('driving'))`, (v) => v === 2],
  ['garage perk buys', `(window.__game.player.money = 99999, window.__game.perks.buy('engine', window.__game.player))`, (v) => v === 'ok'],
  ['business buys and earns', `(() => { const g = window.__game, it = g.properties.items[0]; g.player.money = 99999; g.properties.buy(it); g.properties.update(60, g.input); return Math.round(it.stored); })()`, (v) => v >= 200],
  ['phone opens every page', `(() => { const g = window.__game; g.state = 'play'; g.openPhone(); for (const v of ['home', 'cab', 'benny', 'rosa', 'skills', 'garage', 'wardrobe', 'trophies', 'business', 'weather', 'stats', 'save']) { g.phone.view = v; g.phone.render(); if (!g.phone.viewEl.innerHTML) return v; } g.closePhone(); return 'ok'; })()`, (v) => v === 'ok'],
  ['every mission runs its steps', `(() => { const g = window.__game, m = g.missions; const bad = []; for (const def of m.list) { try { m.start(def); for (let i = 0; i < def.steps.length; i++) { m.stepIndex = i; def.steps[i].update(g, m.ctx, 0.016); def.steps[i].target?.(g, m.ctx); m.objective(); } } catch (e) { bad.push(def.id + ': ' + e.message); } m.fail('smoke'); } return bad; })()`, (v) => Array.isArray(v) && v.length === 0],
  ['street events start and clear', `(() => { const g = window.__game; g.police.clear(); const seen = new Set(); for (let i = 0; i < 24; i++) { g.events.start(); if (g.events.event) seen.add(g.events.event.title); for (let k = 0; k < 20; k++) g.events.tick(0.1); g.events.clear(); } return [...seen].length; })()`, (v) => v >= 2],
  ['helicopter arrives and can be shot down', `(() => { const g = window.__game; g.police.setLevel(4); g.air.spawn(); const h = g.air.heli; h.damage(999, 'player'); for (let i = 0; i < 400 && !h.done; i++) h.update(0.05); const down = h.done; g.air.clear(); g.police.clear(); return down; })()`, (v) => v === true],
  ['roadblock goes up ahead of a car', `(() => { const g = window.__game, p = g.player; const v = g.spawnVehicle('vortex', 400, 328, Math.PI / 2); p.enterVehicle(v); v.vx = 30; let made = null; for (let x = 300; x < 560 && !made; x += 40) { v.pos.x = x; made = g.roadblocks.setUp(v); } return !!made; })()`, (v) => v === true],
  ['wardrobe buys and wears', `(() => { const g = window.__game; g.player.money = 9999; return g.wardrobe.buy('neon', g.player) + g.wardrobe.worn; })()`, (v) => v === 'okneon'],
  ['achievement unlocks', `(() => { const g = window.__game; g.player.stats.carsStolen = 1; g.achievements.pollT = 0; g.achievements.update(0.1); return g.achievements.unlocked.has('wheels'); })()`, (v) => v === true],
  ['turf is fought for and taken', `(() => { const g = window.__game, tf = g.territories, t = tf.turfs[0]; tf.startFight(t); const n = t.crew.length; t.crew.forEach((c) => c.takeDamage(999, g.player)); tf.update(0.1); return [n, t.state]; })()`, (v) => v[0] >= 5 && v[1] === 'yours'],
  ['vigilante call is taken and won', `(() => { const g = window.__game, p = g.player; p.vehicle?.dispose; const car = g.spawnVehicle('police', 400, 328, 0); p.enterVehicle(car); g.police.clear(); g.vigilante.start(); const started = g.vigilante.active; g.vigilante.job.car.explode(); g.vigilante.update(0.1, g.input); return [started, g.vigilante.level]; })()`, (v) => v[0] === true && v[1] === 2],
  ['taxi fare is picked up and paid', `(() => { const g = window.__game, p = g.player; g.police.clear(); const cab = g.spawnVehicle('cab', 400, 328, 0); p.enterVehicle(cab); const before = p.money; g.taxi.start(); const j = g.taxi.job; cab.pos.set(j.pickup.x, 0, j.pickup.z); cab.vx = cab.vz = 0; g.taxi.update(0.1, g.input); const riding = g.taxi.job.stage; cab.pos.set(g.taxi.job.dest.x, 0, g.taxi.job.dest.z); g.taxi.update(0.1, g.input); const fares = g.taxi.fares; g.taxi.end(); return [riding, fares, p.money > before]; })()`, (v) => v[0] === 'ride' && v[1] === 1 && v[2] === true],
  ['store hold-up pays and brings the cops', `(() => { const g = window.__game, p = g.player; if (p.vehicle) p.exitVehicle(true); g.police.clear(); const s = g.holdups.stores[0]; p.pos.set(s.door.x, 0, s.door.z); p.giveWeapon('pistol', 12); p.selectWeapon('pistol'); const before = p.money; g.holdups.begin(s); for (let i = 0; i < 70; i++) g.holdups.update(0.1, g.input); return [p.money - before, g.police.level]; })()`, (v) => v[0] >= 450 && v[1] >= 2],
  ['pedestrians put up umbrellas in the rain', `(() => { const g = window.__game; g.weather.force('storm'); const p = g.peds.spawnCivilianNear(g.player.pos.x, g.player.pos.z, 10, 30); p.hasUmbrella = true; p.update(0.02); return p.body.umbrella.visible; })()`, (v) => v === true],
  ['gulls scatter and fly', `(() => { const g = window.__game; g.wildlife.scare(840, 120, 90); g.wildlife.update(0.1, { x: 840, z: 120 }, 0, 0); return g.wildlife.flocks[0].gulls[0].group.visible; })()`, (v) => v === true],
  ['radio host speaks', `(() => { const g = window.__game; return typeof g.chatter.say(0); })()`, (v) => v === 'string'],
  ['save and load round-trip', `(() => { const g = window.__game; g.player.money = 4321; g.save.write(g, 'smoke'); const d = g.save.read('smoke'); g.save.apply(g, d); return g.player.money; })()`, (v) => v === 4321],
];

const args = [playtest, url, 'wait:2500', ...CHECKS.map(([, expr]) => `eval:${expr}`)];
const out = execFileSync('node', args, { encoding: 'utf8', timeout: 120000 });
const answers = out.split('\n').filter((l) => l.startsWith('eval>')).map((l) => l.slice(5).trim());
let failed = 0;
CHECKS.forEach(([name, , ok], i) => {
  let value;
  try { value = JSON.parse(answers[i]); } catch { value = answers[i]; }
  const pass = answers[i] !== undefined && !String(answers[i]).startsWith('ERROR') && ok(value);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `  ->  ${answers[i]}`}`);
});
const errors = out.split('\n').filter((l) => /EXCEPTION|console\.error/.test(l));
if (errors.length) { failed++; console.log(errors.join('\n')); }
console.log(failed ? `${failed} problem(s)` : 'all checks passed');
process.exit(failed ? 1 : 0);
