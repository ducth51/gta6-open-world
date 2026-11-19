// Sol, the player: camera-relative running, sprinting and jumping, getting into (and stealing) cars,
// driving them, aiming over the shoulder, shooting and punching, switching and reloading weapons.
import { Actor } from './actor.js';
import { LOOKS } from './humanoid.js';
import { services } from '../core/services.js';
import { WEAPONS, WEAPON_ORDER } from '../config.js';
import { dist2 } from '../util/mathx.js';

export class Player extends Actor {
  constructor(x, z) {
    super(LOOKS.player, x, z, 'player');
    this.money = 500;
    this.weapons = { fists: { owned: true, clip: 0, ammo: 0 } };
    for (const id of WEAPON_ORDER) if (id !== 'fists') this.weapons[id] = { owned: false, clip: 0, ammo: 0 };
    this.weaponIndex = 0;
    this.fireCd = 0;
    this.reloadT = 0;
    this.aiming = false;
    this.sprintStamina = 1;
    this.stats = { kills: 0, carsStolen: 0, distance: 0, shots: 0 };
    this.radioOn = true;
  }

  get isPlayer() { return true; }

  onHurt(amount, source, kind) {
    services.game?.hud.hurt();
    if (kind === 'bullet' || kind === 'melee') services.effects?.blood(this.pos.x, this.pos.y + 1.2, this.pos.z);
    if (kind === 'vehicle') services.game?.cameraRig.shake(0.5);
  }
  get weaponDef() { return WEAPONS[this.weapon]; }

  giveWeapon(id, ammo) {
    const w = this.weapons[id];
    if (!w.owned) { w.owned = true; w.clip = Math.min(WEAPONS[id].clip, ammo); ammo -= w.clip; }
    w.ammo += ammo;
  }

  selectWeapon(id) {
    if (!this.weapons[id]?.owned) return;
    this.weapon = id;
    this.weaponIndex = WEAPON_ORDER.indexOf(id);
    this.reloadT = 0;
  }

  cycleWeapon(dir) {
    for (let i = 1; i <= WEAPON_ORDER.length; i++) {
      const id = WEAPON_ORDER[(this.weaponIndex + dir * i + WEAPON_ORDER.length * 4) % WEAPON_ORDER.length];
      const w = this.weapons[id];
      if (w.owned && (id === 'fists' || w.clip + w.ammo > 0)) { this.selectWeapon(id); return; }
    }
  }

  update(dt, input, rig) {
    if (this.dead) { this.syncMesh(dt); return; }
    this.fireCd -= dt;
    if (this.vehicle) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input, rig);
    if (input.tap('KeyF')) this.vehicle ? this.exitVehicle() : this.tryEnterVehicle();
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
  }

  updateOnFoot(dt, input, rig) {
    const f = input.axis('KeyS', 'KeyW'), s = input.axis('KeyA', 'KeyD');
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    this.aiming = input.aim && this.weapon !== 'fists';
    const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw);
    const rx = -fz, rz = fx;
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    if (sprint && len > 0 && !this.aiming) this.sprintStamina = Math.max(0, this.sprintStamina - dt * 0.12);
    else this.sprintStamina = Math.min(1, this.sprintStamina + dt * 0.2);
    const speed = this.aiming ? 2.6 : sprint && this.sprintStamina > 0.05 ? 7.6 : 4.3;
    const faceYaw = this.aiming || (input.fire && this.weapon !== 'fists') ? rig.yaw : null;
    this.step(dt, mx * speed, mz * speed, faceYaw);
    if (input.tap('Space')) this.jump();
    this.aimPitch = this.aiming || (input.fire && this.weapon !== 'fists') ? rig.pitch + 0.08 : null;
    this.stats.distance += this.moveSpeed * dt;

    const wheel = input.takeWheel();
    if (wheel) this.cycleWeapon(wheel > 0 ? 1 : -1);
    if (input.tap('KeyQ')) this.cycleWeapon(-1);
    if (input.tap('KeyE')) this.cycleWeapon(1);
    WEAPON_ORDER.forEach((id, i) => { if (input.tap('Digit' + (i + 1))) this.selectWeapon(id); });
    if (input.tap('KeyR')) this.startReload();
    if (input.fire && this.fireCd <= 0 && this.reloadT <= 0) this.fire(rig);
    this.syncMesh(dt);
  }

  updateDriving(dt, input) {
    const v = this.vehicle;
    v.controls.throttle = input.axis('KeyS', 'KeyW');
    v.controls.steer = input.axis('KeyA', 'KeyD');
    v.controls.handbrake = input.down('Space');
    if (input.tap('KeyH')) services.audio?.horn(v.pos);
    if (input.tap('KeyR')) services.game?.radio.next();
    if (input.tap('KeyG') && v.isPolice) v.sirenOn = !v.sirenOn;
    this.pos.copy(v.pos);
    this.yaw = v.yaw;
    this.stats.distance += v.speed * dt;
    if (v.dead) this.exitVehicle(true);
  }

  fire(rig) {
    const id = this.weapon;
    const def = WEAPONS[id];
    if (def.melee) {
      this.fireCd = def.rate;
      this.body.punch();
      services.game.combat.melee(this, def);
      return;
    }
    const w = this.weapons[id];
    if (w.clip <= 0) { this.startReload(); this.fireCd = 0.3; if (w.ammo <= 0) services.audio?.click(); return; }
    w.clip--;
    this.fireCd = def.rate;
    this.stats.shots++;
    services.game.combat.playerShoot(this, def, rig);
    if (w.clip <= 0 && w.ammo > 0) this.startReload();
  }

  startReload() {
    const def = this.weaponDef, w = this.weapons[this.weapon];
    if (def.melee || this.reloadT > 0 || w.ammo <= 0 || w.clip >= def.clip) return;
    this.reloadT = def.reload;
    services.audio?.reload();
  }

  finishReload() {
    const def = this.weaponDef, w = this.weapons[this.weapon];
    const take = Math.min(def.clip - w.clip, w.ammo);
    w.clip += take; w.ammo -= take;
  }

  /** Gets into the nearest car within reach, pulling out whoever is driving it. */
  tryEnterVehicle() {
    const game = services.game;
    let best = null, bestD = 4.2;
    for (const v of game.vehicles) {
      if (v.dead || v.locked) continue;
      const d = dist2(this.pos.x, this.pos.z, v.pos.x, v.pos.z) - v.halfW;
      if (d < bestD) { best = v; bestD = d; }
    }
    if (!best) return false;
    if (best.driver && best.driver !== 'player') game.ejectDriver(best, this);
    this.enterVehicle(best);
    return true;
  }

  enterVehicle(v) {
    this.vehicle = v;
    v.driver = 'player';
    this.mesh.visible = false;
    this.aiming = false;
    this.aimPitch = null;
    this.vel.set(0, 0, 0);
    if (!v.owned) { v.owned = true; this.stats.carsStolen++; }
    services.game?.onPlayerEnteredVehicle(v);
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!force && v.speed > 9) return;
    v.driver = null;
    v.controls.throttle = 0; v.controls.steer = 0;
    const door = v.doorPoint();
    this.pos.set(door.x, v.pos.y, door.z);
    this.vehicle = null;
    this.mesh.visible = true;
    v.sirenOn = false;
    services.game?.onPlayerExitedVehicle(v);
  }
}
