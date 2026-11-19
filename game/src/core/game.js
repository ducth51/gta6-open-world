// The Game: builds Palmera Bay, owns every system, runs the frame (input, player, traffic, people,
// police, missions, activities, effects, camera, sky, HUD, audio), and handles the rules that cut
// across them: carjacking, deaths, WASTED and BUSTED, respawns, starting, pausing and quitting.
import * as THREE from 'three';
import { services } from './services.js';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js';
import { buildCityPlan, districtAt, PIER } from '../world/cityPlan.js';
import { ColliderWorld } from '../world/colliders.js';
import { buildCityMeshes } from '../world/cityMesh.js';
import { SkySystem } from '../world/sky.js';
import { Pickup } from '../world/markers.js';
import { Effects } from '../systems/effects.js';
import { AudioSystem } from '../systems/audio.js';
import { Radio } from '../systems/radio.js';
import { Player } from '../entities/player.js';
import { Vehicle, collideVehicles } from '../entities/vehicle.js';
import { LOOKS, randomLook } from '../entities/humanoid.js';
import { PedManager } from '../entities/peds.js';
import { TrafficManager } from '../systems/traffic.js';
import { PoliceSystem } from '../systems/police.js';
import { Combat } from '../systems/combat.js';
import { MissionSystem } from '../systems/missions.js';
import { Activities } from '../systems/activities.js';
import { SaveGame } from '../systems/saveGame.js';
import { LaneDriver } from '../ai/laneDriver.js';
import { nearestNode, neighbors } from '../ai/roadGraph.js';
import { Hud } from '../ui/hud.js';
import { Dialogue } from '../ui/dialogue.js';
import { Menus } from '../ui/menus.js';
import { INTRO_CARD } from '../story/characters.js';
import { START_HOUR, MINUTES_PER_SECOND, HOSPITAL_FEE, BUSTED_FEE, CITY_SIZE } from '../config.js';
import { clamp, dist2, rng, formatMoney } from '../util/mathx.js';

export class Game {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 3200);
    addEventListener('resize', () => this.resize());

    services.scene = this.scene;
    services.camera = this.camera;
    services.game = this;
    this.plan = buildCityPlan(7);
    services.plan = this.plan;
    this.colliders = new ColliderWorld();
    services.colliders = this.colliders;
    this.city = buildCityMeshes(this.plan, this.colliders);
    this.scene.add(this.city.group);
    this.sky = new SkySystem(this.scene);
    this.effects = new Effects(this.scene);
    services.effects = this.effects;
    this.audio = new AudioSystem();
    services.audio = this.audio;
    this.radio = new Radio(this.audio);

    this.input = new Input(renderer.domElement);
    this.cameraRig = new CameraRig(this.camera);
    this.vehicles = [];
    this.peds = new PedManager();
    this.traffic = new TrafficManager(this.plan);
    this.police = new PoliceSystem();
    this.combat = new Combat();
    this.hud = new Hud(this.plan);
    this.dialogue = new Dialogue(this.hud);
    this.save = new SaveGame();
    const home = this.plan.landmarks.safehouse.door;
    this.player = new Player(home.x, home.z + 3);
    this.player.mesh.visible = false;
    this.missions = new MissionSystem(this);
    this.activities = new Activities(this);
    this.menus = new Menus(this);
    this.cashDrops = [];
    this.stats = { missionsPassed: 0 };
    this.settings = { music: 0.75, sensitivity: 1 };
    this.loadSettings();
    this.hour = START_HOUR;
    this.state = 'title';
    this.stateT = 0;
    this.titleFocus = { x: 640, z: 360 };
    this.timeScale = 1;
    this.last = performance.now();
    this.frozen = false;
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  loadSettings() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('salt-neon.settings') ?? '{}')); } catch { /* defaults */ }
    this.applySettings();
  }

  applySettings() {
    this.input.sensitivity = this.settings.sensitivity;
    this.audio.setVolumes(0.8, this.settings.music * 0.7);
    try { localStorage.setItem('salt-neon.settings', JSON.stringify(this.settings)); } catch { /* private mode */ }
  }

  // ---------- Flow ----------
  showTitle() {
    this.state = 'title';
    this.hud.show(false);
    this.menus.showTitle();
    this.input.enabled = false;
    this.input.exitLock();
  }

  /** Starts a new game, or loads `slot` when given. */
  startGame(slot) {
    this.audio.init();
    this.menus.hideTitle();
    this.menus.hidePause();
    this.clearWorld();
    const home = this.plan.landmarks.safehouse.door;
    const p = this.player;
    p.dead = false; p.health = 100; p.armor = 0; p.vehicle = null;
    p.pos.set(home.x - 4, 0.18, home.z + 4);
    p.yaw = Math.PI;
    p.mesh.visible = true;
    this.missions.index = 0;
    this.police.clear();
    this.hour = START_HOUR;
    if (slot) {
      const data = this.save.read(slot);
      if (data) this.save.apply(this, data);
      this.notify('Save loaded.');
    } else {
      p.money = 500;
      for (const w of Object.values(p.weapons)) { if (w !== p.weapons.fists) { w.owned = false; w.clip = 0; w.ammo = 0; } }
      p.selectWeapon('fists');
      this.dialogue.play(INTRO_CARD.map((l) => ['Palmera Bay', l]));
      this.notify('Walk into the yellow marker (<kbd>E</kbd>) to begin. Press <kbd>M</kbd> for the map.');
    }
    this.cameraRig.yaw = Math.PI; this.cameraRig.pitch = -0.2;
    this.state = 'play';
    this.input.enabled = true;
    this.input.requestLock();
    this.hud.show(true);
    this.radio.on = true;
    this.radio.setLevel(0);
  }

  clearWorld() {
    this.missions.active && this.missions.fail('');
    for (const v of this.vehicles) v.dispose();
    this.vehicles = [];
    this.traffic.parkedLive.clear();
    for (const p of this.peds.list) p.dispose();
    this.peds.list = [];
    this.police.units = [];
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.exitLock();
    this.menus.showPause();
    this.audio.setEngine(false, 0, 0);
  }

  resume() {
    this.menus.hidePause();
    this.state = 'play';
    this.input.requestLock();
  }

  quitToTitle() {
    this.menus.hidePause();
    this.clearWorld();
    this.player.mesh.visible = false;
    this.police.clear();
    this.showTitle();
  }

  notify(text) { this.hud.notify(text); }
  speech(actor, text) { if (dist2(actor.pos.x, actor.pos.z, this.player.pos.x, this.player.pos.z) < 25) this.dialogue.bark(text); }
  showCredits() { setTimeout(() => this.menus.showCredits(), 6000); }

  // ---------- Spawning helpers used by missions ----------
  spawnVehicle(model, x, z, yaw, color) {
    const v = new Vehicle(model, x, z, yaw, color);
    this.vehicles.push(v);
    return v;
  }

  spawnTrafficVehicle(model, x, z, mode, color) {
    const v = new Vehicle(model, x, z, 0, color);
    const ai = new LaneDriver(v, mode);
    const a = nearestNode(x, z);
    ai.placeOnEdge(a, neighbors(a)[0], 0.5);
    v.ai = ai;
    v.driver = { npc: true };
    this.vehicles.push(v);
    return v;
  }

  // ---------- Cross-system rules ----------
  ejectDriver(v, thief) {
    const door = v.doorPoint();
    const ped = this.peds.spawn(v.isPolice ? LOOKS.cop : randomLook(rng), door.x, door.z, v.isPolice ? 'cop' : 'civ');
    ped.knock(-Math.cos(v.yaw) * -2, Math.sin(v.yaw) * -2, 2);
    if (ped.team === 'civ') { ped.panic(thief.pos.x, thief.pos.z, 10); this.speech(ped, rng.pick(['Hey! That\'s my car!', 'Not again!', 'Take it, take it!'])); }
    v.driver = null;
    this.police.report(v.isPolice ? 'copAssault' : 'carjack', v.pos.x, v.pos.z);
  }

  onPlayerEnteredVehicle(v) {
    this.traffic.releaseParked(v);
    v.persistent = true;
    if (this.lastCar && this.lastCar !== v) this.lastCar.persistent = false;
    this.lastCar = v;
    if (v.isPolice && this.police.level === 0 && v.ai) this.police.report('carjack', v.pos.x, v.pos.z);
    this.notify(`${v.def.name}`);
    this.audio.horn(null, 0);
  }

  onPlayerExitedVehicle() {}

  onPlayerCarContact(other, speed) {
    if (other.isPolice && !other.dead && speed > 4 && other.driver) this.police.report('copAssault', other.pos.x, other.pos.z);
  }

  radiusDamage(x, z, r, dmg, source, exclude) { this.combat.radiusDamage(x, z, r, dmg, source, exclude); }

  onVehicleDestroyed(v) {
    if (v.driver === 'player') { this.player.takeDamage(200, null, 'explosion'); }
    if (v.lastAttacker === 'player') this.police.report('explosion', v.pos.x, v.pos.z);
  }

  onActorKilled(actor, source, kind) {
    if (actor.isPlayer) { this.wasted(); return; }
    if (source === this.player || source?.isPlayer) {
      this.player.stats.kills++;
      if (actor.team === 'cop') this.police.report('copKilled', actor.pos.x, actor.pos.z);
      else if (actor.team === 'civ') this.police.report('murder', actor.pos.x, actor.pos.z);
      // Some people drop cash.
      if (rng.chance(actor.team === 'gang' ? 0.8 : 0.4)) {
        const bag = new Pickup('cash', actor.pos.x + 0.6, actor.pos.z, actor.pos.y);
        bag.amount = actor.team === 'gang' ? rng.int(60, 200) : rng.int(10, 60);
        bag.life = 30;
        this.cashDrops.push(bag);
      }
      if (actor.isBoss) this.dialogue.play([['Kane', 'You... were supposed to be... a nobody.']]);
    }
    this.peds.alert(actor.pos.x, actor.pos.z, 30);
  }

  /** Death: slow motion, WASTED, then the hospital takes a fee. */
  wasted() {
    if (this.state !== 'play') return;
    const p = this.player;
    if (p.vehicle) p.exitVehicle(true);
    p.dead = true;
    this.state = 'wasted';
    this.stateT = 4.5;
    this.timeScale = 0.35;
    this.hud.banner('WASTED', `Mercy Shores Hospital bill: ${formatMoney(HOSPITAL_FEE)}`, 'fail', 4.2);
    this.audio.wasted();
    if (this.missions.active) this.missions.fail('Sol was wasted.');
  }

  busted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.stateT = 4;
    this.timeScale = 0.5;
    this.hud.banner('BUSTED', `Bail and lost weapons: ${formatMoney(BUSTED_FEE)}`, 'fail', 3.8);
    this.audio.failed();
    if (this.missions.active) this.missions.fail('Sol was busted.');
  }

  respawn(where) {
    const p = this.player;
    if (p.vehicle) p.exitVehicle(true);
    const lm = this.plan.landmarks[where];
    p.dead = false; p.health = 100; p.armor = where === 'police' ? 0 : p.armor;
    p.body.fall = 0;
    p.pos.set(lm.door.x, 0, lm.door.z - 3);
    p.vel.set(0, 0, 0);
    p.mesh.visible = true;
    p.money = Math.max(0, p.money - (where === 'police' ? BUSTED_FEE : HOSPITAL_FEE));
    if (where === 'police') for (const [id, w] of Object.entries(p.weapons)) if (id !== 'fists') { w.ammo = Math.floor(w.ammo / 2); }
    this.police.clear();
    this.hour += 3;
    this.timeScale = 1;
    this.state = 'play';
    this.cameraRig.yaw = Math.PI;
    document.getElementById('fade').classList.remove('on');
  }

  // ---------- Frame ----------
  frame(now) {
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.frozen) this.update(realDt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  update(realDt) {
    const input = this.input;
    if (this.state === 'play' || this.state === 'pause' || this.state === 'map') {
      if (input.tapAny('Escape', 'KeyP')) {
        if (this.state === 'play') this.pause();
        else { this.menus.hidePause(); this.menus.hideMap(); this.resume(); }
      } else if (input.tapAny('KeyM')) {
        if (this.state === 'play') { this.state = 'map'; this.menus.showMap(); this.input.exitLock(); }
        else if (this.state === 'map') { this.menus.hideMap(); this.resume(); }
      }
    }
    if (this.state === 'pause' || this.state === 'map') { if (this.state === 'map') this.menus.drawMap(); return; }

    const dt = realDt * this.timeScale;
    services.time += dt;
    this.hour = (this.hour + (dt * MINUTES_PER_SECOND) / 60) % 24;
    const p = this.player;
    const playing = this.state !== 'title';
    const focus = playing ? (p.vehicle ? p.vehicle.pos : p.pos) : this.titleFocus;

    const mouse = playing && this.state === 'play' ? input.takeMouse() : { x: 0, y: 0 };
    if (this.state === 'play') p.update(dt, input, this.cameraRig);
    else if (playing) p.syncMesh(dt);

    this.traffic.update(dt, focus);
    const steps = dt > 1 / 45 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
      for (const v of this.vehicles) v.update(dt / steps);
      for (let i = 0; i < this.vehicles.length; i++) {
        const a = this.vehicles[i];
        for (let j = i + 1; j < this.vehicles.length; j++) {
          const b = this.vehicles[j];
          if (Math.abs(a.pos.x - b.pos.x) < 7 && Math.abs(a.pos.z - b.pos.z) < 7) collideVehicles(a, b);
        }
      }
    }
    this.peds.update(dt, focus);
    if (playing) {
      this.police.update(dt);
      if (this.state === 'play') {
        this.missions.update(dt, input);
        this.activities.update(dt, input);
      }
      this.updateCashDrops(dt);
    }
    this.dialogue.update(dt);
    this.effects.update(dt);

    if (playing) this.cameraRig.update(dt, p, mouse);
    else this.cameraRig.orbit(dt, this.titleFocus.x, 70, this.titleFocus.z, 190, 0.05);
    this.sky.update(this.hour, focus);
    this.city.update(services.time, this.sky.night);
    if (playing) this.hud.update(dt, this);
    this.updateAudio(dt, focus);

    if (this.state === 'wasted' || this.state === 'busted') {
      this.stateT -= realDt;
      if (this.stateT < 0.7) document.getElementById('fade').classList.add('on');
      if (this.stateT <= 0) this.respawn(this.state === 'wasted' ? 'hospital' : 'police');
    }
  }

  updateCashDrops(dt) {
    const p = this.player;
    for (const bag of this.cashDrops) {
      bag.animate(services.time);
      bag.life -= dt;
      if (bag.active && !p.vehicle && dist2(p.pos.x, p.pos.z, bag.x, bag.z) < 1.4) {
        p.money += bag.amount;
        this.audio.cash();
        this.notify(`+${formatMoney(bag.amount)}`);
        bag.setActive(false);
        bag.life = 0;
      }
    }
    this.cashDrops = this.cashDrops.filter((b) => { if (b.life > 0) return true; b.dispose(); return false; });
  }

  updateAudio(dt, focus) {
    const a = this.audio;
    if (!a.ready) return;
    a.setListener(this.camera.position.x, this.camera.position.z, this.cameraRig.yaw);
    const v = this.player.vehicle;
    const playing = this.state === 'play';
    a.setEngine(playing && !!v && !v.dead, v ? clamp(Math.abs(v.forwardSpeed) / v.def.maxSpeed, 0, 1) : 0, v ? v.controls.throttle : 0);
    this.radio.setLevel(this.state === 'title' ? 0.6 : playing && v ? 1 : 0);
    const beach = clamp(1 - Math.abs(focus.x - (CITY_SIZE + 40)) / 90, 0, 1) || (Math.abs(focus.z - PIER.z) < 10 && focus.x > CITY_SIZE ? 1 : 0);
    a.setAmbience(beach, services.time);
    void districtAt;
  }

  run() {
    const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
