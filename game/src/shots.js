// Screenshot scenes behind ?shot=<name>. Each one sets up a real moment of play with the game's own
// systems (a story mission at a given step, the police at a given level, a race, a firefight) and
// lets the simulation run for a few seconds with a simple autopilot on the controls, so the frame is
// what playing looks like. `window.__shotReady` turns true when the frame is ready to capture.
import { STORY_BY_ID } from './story/storyMissions.js';
import { RACES } from './systems/activities.js';
import { LaneDriver } from './ai/laneDriver.js';
import { nodePos } from './ai/roadGraph.js';
import { blockBounds } from './world/cityPlan.js';
import { reseedGameplay, clamp, wrapAngle } from './util/mathx.js';
import { services } from './core/services.js';

const SCENES = { title, chase, shootout, beach, map };

export function runShotScene(game, name) {
  reseedGameplay(4242);
  window.__shotReady = false;
  (SCENES[name] ?? chase)(game);
}

/** Lets the world run `seconds`, calling `each(dt)` before every frame, then freezes it. */
function settle(game, seconds, each) {
  let t = 0;
  game.shotHook = (dt) => {
    t += dt;
    each?.(dt, t);
    if (t >= seconds) { game.frozen = true; game.shotHook = null; window.__shotReady = true; }
  };
}

function quietStart(game) {
  game.startGame(null);
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
  game.hud.notices.length = 0;
  game.hud.displayMoney = game.player.money;
  game.hud.instantMoney = true;
  game.input.enabled = true;
  game.input.virtual = { held: new Set(), tapped: new Set(), fire: false, aim: false };
}

function putInCar(game, model, x, z, yaw, color, speed = 0) {
  const v = game.spawnVehicle(model, x, z, yaw, color);
  v.vx = Math.sin(yaw) * speed; v.vz = Math.cos(yaw) * speed;
  game.player.enterVehicle(v);
  game.hud.notices.length = 0;
  return v;
}

/** Holds the throttle and steers the player's car along a straight lane at `laneCoord`. */
function laneAutopilot(game, axis, laneCoord, yaw, maxSpeed) {
  const keys = game.input.virtual.held;
  return () => {
    const v = game.player.vehicle;
    if (!v) return;
    keys.clear();
    if (v.speed < maxSpeed) keys.add('KeyW');
    // Aim at a point 20 m down the lane and steer toward it.
    let tx = v.pos.x + Math.sin(yaw) * 20, tz = v.pos.z + Math.cos(yaw) * 20;
    if (axis === 'z') tz = laneCoord; else tx = laneCoord;
    const ang = wrapAngle(Math.atan2(tx - v.pos.x, tz - v.pos.z) - v.yaw);
    if (ang > 0.04) keys.add('KeyA');
    if (ang < -0.04) keys.add('KeyD');
  };
}

function startMissionAt(game, id, stepIndex) {
  const def = STORY_BY_ID[id];
  const m = game.missions;
  m.index = Math.max(m.index, Object.keys(STORY_BY_ID).indexOf(id));
  m.start(def);
  m.stepIndex = stepIndex;
  m.timeLeft = def.steps[stepIndex].seconds ?? null;
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
  game.hud.el.banner.classList.add('hidden');
  game.hud.bannerT = 0;
}

function addPursuer(game, model, x, z, yaw, speed) {
  const v = game.spawnVehicle(model, x, z, yaw);
  v.ai = new LaneDriver(v, 'pursuit');
  v.ai.target = { x: game.player.pos.x, z: game.player.pos.z };
  v.driver = { npc: true, cop: true };
  v.sirenOn = true;
  v.mission = 'police';
  v.vx = Math.sin(yaw) * speed; v.vz = Math.cos(yaw) * speed;
  game.police.units.push({ vehicle: v, officers: [], deployed: false });
  return v;
}

function addTraffic(game, model, x, z, yaw, speed, color) {
  const v = game.spawnVehicle(model, x, z, yaw, color);
  v.ai = new LaneDriver(v, 'cruise');
  v.ai.rejoin();
  v.driver = { npc: true };
  v.vx = Math.sin(yaw) * speed; v.vz = Math.cos(yaw) * speed;
  return v;
}

/** Cover: a three-star chase down Grand Ave in a Vortex GT, the gold courier van ahead. */
function chase(game) {
  quietStart(game);
  game.hour = 17.55;
  const z = 4 * 80 + 8 - 4;              // westbound lane of Vesper St
  const yaw = -Math.PI / 2;
  putInCar(game, 'vortex', 600, z, yaw, 0xffd25e, 30);
  game.player.money = 18450;
  game.player.giveWeapon('pistol', 60);
  startMissionAt(game, 'ledger', 1);
  const van = game.missions.ctx.van;
  van.pos.set(560, 0, z); van.yaw = yaw; van.vx = -24; van.vz = 0;
  van.ai.mode = 'flee'; van.ai.rejoin();
  van.health = 120;
  game.police.setLevel(3);
  game.police.seen = true;
  addPursuer(game, 'police', 622, z + 1, yaw, 30);
  addPursuer(game, 'police', 640, z + 7, yaw, 29);
  addPursuer(game, 'police', 668, z, yaw, 28);
  addTraffic(game, 'cab', 520, z + 8, Math.PI / 2, 10);
  addTraffic(game, 'marlin', 470, z + 8, Math.PI / 2, 10);
  addTraffic(game, 'tidewater', 700, z + 8, Math.PI / 2, 10);
  const drive = laneAutopilot(game, 'z', z, yaw, 33);
  settle(game, 2.6, (dt) => {
    drive();
    const rig = game.cameraRig;
    rig.freeLookT = 99;
    rig.yaw = game.player.vehicle.yaw + Math.PI - 0.55;
    rig.pitch = -0.17;
    game.police.seen = true;
  });
}

/** A firefight in the Gilded Hand yard: Collection Day, guards down 2 of 6, a car burning. */
function shootout(game) {
  quietStart(game);
  game.hour = 17.2;
  const b = blockBounds(1, 7);
  const p = game.player;
  p.giveWeapon('smg', 150); p.selectWeapon('smg');
  p.armor = 64; p.health = 78; p.money = 6120;
  startMissionAt(game, 'collection', 1);
  const guards = game.missions.ctx.guards;
  guards[0].takeDamage(500, p); guards[2].takeDamage(500, p);
  for (const g of guards) g.hostile = true;
  game.police.clear();
  p.pos.set(b.cx - 8, 0.18, b.z0 + 9);
  p.yaw = 0.3;
  // Bring the surviving guards into the crates in front of Sol.
  const spots = [[b.cx + 2, b.z0 + 22], [b.cx - 14, b.z0 + 26], [b.cx + 12, b.z0 + 30], [b.cx - 4, b.z0 + 34]];
  guards.filter((g) => !g.dead).forEach((g, i) => { g.pos.set(spots[i][0], 0.18, spots[i][1]); g.guardPoint = { x: spots[i][0], z: spots[i][1] }; });
  const wreck = game.spawnVehicle('marlin', b.cx + 9, b.z0 + 17, 1.1, 0x2f5d8a);
  wreck.health = 0; wreck.burnT = 99;
  const keys = game.input.virtual;
  keys.aim = false;
  let fireT = 0;
  settle(game, 2.2, (dt, t) => {
    const rig = game.cameraRig;
    const target = guards[1];
    const ang = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    rig.yaw = ang + 0.12;
    rig.pitch = -0.04;
    rig.freeLookT = 99;
    p.health = Math.max(p.health, 60);
    fireT += dt;
    keys.fire = t > 1.6;
    if (t > 1.5) for (const g of guards) if (!g.dead) g.health = Math.max(g.health, 40);
  });
}

/** The Shoreline Sprint along the beach at sunset: hotels, neon, the Sunwheel pier. */
function beach(game) {
  quietStart(game);
  game.hour = 17.85;
  const x = 10 * 80 + 8 - 4;
  const yaw = 0;
  putInCar(game, 'coupe', x, 150, yaw, 0x8fe3d0, 24);
  game.player.money = 9300;
  game.activities.startRace(RACES[0]);
  const race = game.activities.race;
  race.index = 2; race.elapsed = 24.6; race.timeLeft = RACES[0].limit + 3 - 24.6;
  game.hud.el.banner.classList.add('hidden'); game.hud.bannerT = 0;
  game.radio.on = true; game.radio.station = 0;
  addTraffic(game, 'vortex', x, 196, 0, 18, 0xff3b5c);
  addTraffic(game, 'cab', x + 8, 260, Math.PI, 10);
  addTraffic(game, 'dune', x + 8, 300, Math.PI, 10);
  for (let i = 0; i < 8; i++) {
    const p = game.peds.spawnCivilianNear(840, 200, 5, 40);
    if (p) { p.pos.x = 824 + (i % 4) * 5; p.pos.z = 150 + i * 9; p.persistent = true; }
  }
  const drive = laneAutopilot(game, 'x', x, yaw, 26);
  settle(game, 2.4, () => {
    drive();
    const rig = game.cameraRig;
    rig.freeLookT = 99;
    rig.yaw = game.player.vehicle.yaw + 0.5;
    rig.pitch = -0.13;
  });
}

/** The title screen over the bay with a save waiting to continue. */
function title(game) {
  if (!game.save.latest()) { quietStart(game); game.missions.index = 2; game.player.money = 4200; game.save.write(game, 'slot1'); game.quitToTitle(); }
  game.showTitle();
  game.hour = 17.7;
  settle(game, 2.5);
}

/** The full map with the next mission marked. */
function map(game) {
  quietStart(game);
  game.missions.index = 2;
  game.state = 'map';
  game.menus.showMap();
  settle(game, 0.5);
  void clamp; void nodePos; void services;
}
