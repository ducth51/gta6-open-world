// Weather over Palmera Bay: sea haze, overcast, rain and thunderstorms roll in and out on their own.
// Rain is a field of streaks that follows the camera, roads turn dark and glossy and lose grip,
// the sky and fog sink toward grey, and lightning flashes the whole city before the thunder arrives.
import * as THREE from 'three';
import { services } from '../core/services.js';
import { rng, clamp } from '../util/mathx.js';

export const WEATHER_KINDS = {
  clear: { label: 'Clear skies', rain: 0, dark: 0 },
  haze: { label: 'Sea haze', rain: 0, dark: 0.14 },
  overcast: { label: 'Overcast', rain: 0, dark: 0.34 },
  rain: { label: 'Rain', rain: 0.55, dark: 0.5 },
  storm: { label: 'Thunderstorm', rain: 1, dark: 0.78, lightning: true },
};

/** What can follow what: storms build up and fade out rather than appearing from nowhere. */
const NEXT = {
  clear: ['haze', 'clear', 'overcast'],
  haze: ['clear', 'overcast', 'overcast'],
  overcast: ['rain', 'clear', 'haze', 'rain'],
  rain: ['storm', 'overcast', 'clear', 'rain'],
  storm: ['rain', 'overcast'],
};

const DROPS = 1300;
const BOX = 80;
const GREY = new THREE.Color(0x67788c);
const _c = new THREE.Color();

export class WeatherSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.kind = 'clear';
    this.rain = 0;
    this.dark = 0;
    this.wet = 0;
    this.flash = 0;
    this.timer = rng.range(80, 150);
    this.strikeT = 6;
    this.afterglow = 0;
    this.thunder = [];
    this.stormBlend = 0;

    this.dropX = new Float32Array(DROPS);
    this.dropY = new Float32Array(DROPS);
    this.dropZ = new Float32Array(DROPS);
    this.dropV = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) {
      this.dropX[i] = rng.range(0, BOX); this.dropZ[i] = rng.range(0, BOX);
      this.dropY[i] = rng.range(0, 48); this.dropV[i] = rng.range(34, 46);
    }
    this.positions = new Float32Array(DROPS * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.4, depthWrite: false });
    this.streaks = new THREE.LineSegments(geo, this.material);
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);
    this.geo = geo;

    this.surfaces = (city?.wet ?? []).map((m) => ({ m, rough: m.roughness, color: m.color.clone(), metal: m.metalness }));
    services.weather = this;
  }

  get grip() { return 1 - 0.3 * this.wet; }
  get label() { return WEATHER_KINDS[this.kind].label; }
  get raining() { return this.rain > 0.15; }

  /** Starts a new game under a given sky. */
  reset(kind = 'clear') {
    this.force(kind);
    this.timer = rng.range(80, 150);
    this.thunder.length = 0;
    this.flash = 0;
  }

  /** Jumps straight to a kind of weather (screenshot scenes, the phone's forecast app). */
  force(kind) {
    this.kind = kind;
    const k = WEATHER_KINDS[kind];
    this.rain = k.rain; this.dark = k.dark;
    this.wet = k.rain > 0.2 ? 1 : 0;
    this.timer = rng.range(90, 160);
  }

  /** What the weather forecast on the phone says. */
  forecast() {
    const next = NEXT[this.kind].map((k) => WEATHER_KINDS[k].label.toLowerCase());
    const left = Math.max(1, Math.round(this.timer / 60));
    return `${this.label} for about ${left} more in-game hour${left > 1 ? 's' : ''}; then ${[...new Set(next)].slice(0, 2).join(' or ')}.`;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.kind = rng.pick(NEXT[this.kind]);
      this.timer = rng.range(70, 170);
    }
    const goal = WEATHER_KINDS[this.kind];
    this.rain += clamp(goal.rain - this.rain, -dt * 0.12, dt * 0.12);
    this.dark += clamp(goal.dark - this.dark, -dt * 0.1, dt * 0.1);
    this.wet = clamp(this.wet + (this.rain > 0.15 ? 0.05 : -0.012) * dt, 0, 1);
    this.stormBlend += clamp((goal.lightning ? 1 : 0) - this.stormBlend, -dt * 0.2, dt * 0.2);

    if (goal.lightning && this.stormBlend > 0.7) {
      this.strikeT -= dt;
      if (this.strikeT <= 0) this.strike();
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.afterglow > 0) {
      this.afterglow -= dt;
      if (this.afterglow <= 0) this.flash = Math.max(this.flash, 0.65);
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      this.thunder[i] -= dt;
      if (this.thunder[i] <= 0) { services.audio?.thunder(rng.range(0.6, 1)); this.thunder.splice(i, 1); }
    }
    services.audio?.setRain(this.rain);
    this.moveRain(dt);
  }

  strike() {
    this.strikeT = rng.range(5, 14);
    this.flash = 1;
    this.afterglow = 0.16;
    this.thunder.push(rng.range(0.4, 2.8));
    services.game?.cameraRig.shake(0.05);
  }

  moveRain(dt) {
    const cam = services.camera;
    const count = Math.floor(DROPS * this.rain);
    this.geo.setDrawRange(0, count * 2);
    this.material.opacity = 0.26 + this.rain * 0.36;
    if (!cam || count === 0) return;
    const cx = cam.position.x, cz = cam.position.z, base = cam.position.y - 14;
    const slant = 3 + this.stormBlend * 5;
    const P = this.positions;
    for (let i = 0; i < count; i++) {
      let y = this.dropY[i] - this.dropV[i] * dt;
      if (y < 0) { y += 52; this.dropX[i] = rng.range(0, BOX); this.dropZ[i] = rng.range(0, BOX); }
      this.dropY[i] = y;
      const x = cx + ((((this.dropX[i] - cx) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
      const z = cz + ((((this.dropZ[i] - cz) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
      const wy = Math.max(0.05, base + y);
      const j = i * 6;
      P[j] = x; P[j + 1] = wy; P[j + 2] = z;
      P[j + 3] = x + slant * 0.04; P[j + 4] = wy + 1.1; P[j + 5] = z + slant * 0.02;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  /** Dims and greys the sky, sun and fog for the weather, and lights the lightning. Runs after the sky. */
  apply(sky) {
    const d = this.dark;
    const u = sky.uniforms;
    u.zenith.value.lerp(_c.copy(GREY).multiplyScalar(0.55), d * 0.8);
    u.horizon.value.lerp(GREY, d * 0.75);
    u.sunColor.value.multiplyScalar(1 - d * 0.85);
    sky.sun.intensity *= 1 - d * 0.78;
    sky.hemi.intensity = sky.hemi.intensity * (1 - d * 0.28) + this.flash * 3.2;
    sky.sun.intensity += this.flash * 2.5;
    const fog = this.scene.fog;
    fog.color.lerp(_c.copy(GREY).multiplyScalar(0.55 + (1 - sky.night) * 0.45), d * 0.7);
    fog.far *= 1 - this.rain * 0.55 - d * 0.1;
    fog.near *= 1 - this.rain * 0.5;
    if (this.flash > 0) fog.color.lerp(_c.setHex(0xcfd8ff), this.flash * 0.5);
    for (const s of this.surfaces) {
      s.m.roughness = s.rough - 0.62 * this.wet;
      s.m.metalness = s.metal + 0.22 * this.wet;
      s.m.color.copy(s.color).multiplyScalar(1 - 0.34 * this.wet);
    }
  }
}
