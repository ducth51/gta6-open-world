// Every sound is synthesised with Web Audio: gunshots, explosions, crashes, horns, punches, the
// player's engine, police sirens, waves and city hum, UI blips and the mission jingles. Positional
// sounds fade with distance and pan by their bearing from the camera.
import { clamp } from '../util/mathx.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.volume = { master: 0.8, sfx: 1, music: 0.55 };
  }

  /** Creates the audio graph; must run from a user gesture. */
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.volume.sfx; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.volume.music; this.music.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startEngine();
    this.startSiren();
    this.startAmbience();
    this.startWeatherLayers();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setVolumes(master, music) {
    this.volume.master = master; this.volume.music = music;
    if (this.master) { this.master.gain.value = master; this.music.gain.value = music; }
  }

  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }

  /** A gain + panner chain for a sound at pos; null when too far to hear. */
  spatial(pos, vol = 1, range = 160) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    let gain = vol, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return null;
      gain = vol / Math.pow(1 + d / 14, 1.3) * (1 - d / range);
      const ang = Math.atan2(dx, dz) - this.listener.yaw;
      pan = clamp(-Math.sin(ang), -1, 1) * 0.8;
    }
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(p).connect(this.sfx);
    return g;
  }

  noiseSource(duration) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = duration > 1.9;
    return s;
  }

  env(param, t, attack, peak, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  gunshot(pos, kind = 'pistol') {
    const out = this.spatial(pos, 1.1, 260); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const decay = kind === 'shotgun' ? 0.45 : kind === 'smg' ? 0.12 : 0.22;
    const n = this.noiseSource(decay); const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(kind === 'shotgun' ? 2500 : 4200, t); bp.frequency.exponentialRampToValueAtTime(300, t + decay);
    const g = ctx.createGain(); this.env(g.gain, t, 0.002, kind === 'shotgun' ? 1.2 : 0.9, decay);
    n.connect(bp).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + decay + 0.05);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const og = ctx.createGain(); this.env(og.gain, t, 0.002, 0.9, 0.16);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.2);
  }

  explosion(pos) {
    const out = this.spatial(pos, 2.2, 400); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSource(2); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(80, t + 1.6);
    const g = ctx.createGain(); this.env(g.gain, t, 0.01, 1.4, 1.7);
    n.connect(lp).connect(g).connect(out); n.start(t); n.stop(t + 1.9);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    const og = ctx.createGain(); this.env(og.gain, t, 0.01, 1.5, 0.9);
    o.connect(og).connect(out); o.start(t); o.stop(t + 1);
  }

  crash(pos, strength) {
    const out = this.spatial(pos, 0.5 + strength, 160); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSource(0.4); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const g = ctx.createGain(); this.env(g.gain, t, 0.003, 0.8, 0.3);
    n.connect(bp).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + 0.4);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220 + Math.random() * 160, t);
    const og = ctx.createGain(); this.env(og.gain, t, 0.002, 0.15 * strength, 0.25);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.3);
  }

  punch(pos) {
    const out = this.spatial(pos, 0.9, 60); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    const g = ctx.createGain(); this.env(g.gain, t, 0.002, 1, 0.12);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.15);
  }

  horn(pos, vol = 0.7) {
    const out = this.spatial(pos, vol, 140); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.setValueAtTime(0.25, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    lp.connect(g).connect(out);
    for (const f of [370, 466]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.5); }
  }

  tone(freq, dur, type = 'sine', vol = 0.25, when = 0, dest = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); this.env(g.gain, t, 0.01, vol, dur);
    o.connect(g).connect(dest ?? this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  click() { this.tone(900, 0.04, 'square', 0.1); }
  reload() { this.tone(500, 0.05, 'square', 0.12); this.tone(700, 0.05, 'square', 0.12, 0.25); }
  blip() { this.tone(880, 0.08, 'triangle', 0.18); }
  pickup() { this.tone(660, 0.1, 'triangle', 0.25); this.tone(990, 0.15, 'triangle', 0.25, 0.08); }
  cash() { [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, i * 0.06)); }
  passed() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.12, i * 0.13)); }
  failed() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.12, i * 0.22)); }
  wasted() { this.tone(110, 1.8, 'sawtooth', 0.2); this.tone(82, 2.2, 'sine', 0.3, 0.1); }

  startEngine() {
    const ctx = this.ctx;
    this.engine = { gain: ctx.createGain(), lp: ctx.createBiquadFilter(), o1: ctx.createOscillator(), o2: ctx.createOscillator() };
    const e = this.engine;
    e.o1.type = 'sawtooth'; e.o2.type = 'square';
    e.lp.type = 'lowpass'; e.lp.frequency.value = 600;
    e.gain.gain.value = 0;
    e.o1.connect(e.lp); e.o2.connect(e.lp); e.lp.connect(e.gain).connect(this.sfx);
    e.o1.start(); e.o2.start();
  }

  /** Engine note for the player's car: speed 0..1 of top speed, throttle -1..1; on=false mutes. */
  setEngine(on, speedNorm, throttle) {
    if (!this.ready || !this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    const gears = 5;
    const g = Math.min(gears - 1, Math.floor(speedNorm * gears));
    const rpm = on ? 0.18 + ((speedNorm * gears - g) * 0.7 + g * 0.05) : 0;
    e.o1.frequency.setTargetAtTime(38 + rpm * 110, t, 0.05);
    e.o2.frequency.setTargetAtTime(19 + rpm * 55, t, 0.05);
    e.lp.frequency.setTargetAtTime(380 + rpm * 1300 + Math.abs(throttle) * 300, t, 0.05);
    e.gain.gain.setTargetAtTime(on ? 0.06 + Math.abs(throttle) * 0.07 : 0, t, 0.08);
  }

  startSiren() {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner();
    o.connect(g).connect(p).connect(this.sfx);
    o.start(); lfo.start();
    this.siren = { g, p };
  }

  /** Volume of the nearest siren (0..1) and its bearing pan. */
  setSiren(level, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.siren.g.gain.setTargetAtTime(level * 0.09, t, 0.2);
    this.siren.p.pan.setTargetAtTime(pan, t, 0.2);
  }

  startAmbience() {
    const ctx = this.ctx;
    const n = this.noiseSource(2); n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0.03;
    n.connect(lp).connect(g).connect(this.sfx); n.start();
    const w = this.noiseSource(2); w.loop = true;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 700;
    const wg = ctx.createGain(); wg.gain.value = 0;
    w.connect(wl).connect(wg).connect(this.sfx); w.start();
    this.ambience = { city: g, waves: wg };
  }

  /** Waves louder near the beach, city hum elsewhere. */
  setAmbience(beach, time) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const swell = 0.5 + 0.5 * Math.sin(time * 0.7);
    this.ambience.waves.gain.setTargetAtTime(beach * (0.04 + swell * 0.07), t, 0.3);
    this.ambience.city.gain.setTargetAtTime(0.012 + (1 - beach) * 0.025, t, 0.3);
  }

  /** Two always-running layers, silent until asked for: hissing rain and a chopping helicopter rotor. */
  startWeatherLayers() {
    const ctx = this.ctx;
    const rain = this.noiseSource(2); rain.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
    const rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(rainGain).connect(this.sfx); rain.start();

    const air = this.noiseSource(2); air.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 240;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13;
    const depth = ctx.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    air.connect(low).connect(chop).connect(out).connect(pan).connect(this.sfx);
    air.start(); lfo.start();
    this.layers = { rain: rainGain, rotor: out, rotorPan: pan };
  }

  /** A seagull's cry: two quick falling whistles, quieter with distance. */
  gull(pos) {
    const out = this.spatial(pos, 0.5, 130); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 0.22].forEach((delay, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(1500 - i * 150, t + delay); o.frequency.exponentialRampToValueAtTime(820, t + delay + 0.2);
      const g = ctx.createGain(); this.env(g.gain, t + delay, 0.02, 0.35, 0.2);
      o.connect(g).connect(out); o.start(t + delay); o.stop(t + delay + 0.26);
    });
  }

  /** Rain loudness 0..1. */
  setRain(level) {
    if (!this.ready || !this.layers) return;
    this.layers.rain.gain.setTargetAtTime(level * 0.1, this.ctx.currentTime, 0.6);
  }

  /** Helicopter rotor loudness 0..1 and its pan; 0 silences it. */
  setRotor(level, pan = 0) {
    if (!this.ready || !this.layers) return;
    const t = this.ctx.currentTime;
    this.layers.rotor.gain.setTargetAtTime(level * 0.55, t, 0.15);
    this.layers.rotorPan.pan.setTargetAtTime(pan * 0.8, t, 0.15);
  }

  /** A long low roll of thunder. */
  thunder(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSource(2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(60, t + 2.4);
    const g = ctx.createGain(); this.env(g.gain, t, 0.25, 1.1 * strength, 2.3);
    n.connect(lp).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 2.7);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(52, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    const og = ctx.createGain(); this.env(og.gain, t, 0.3, 0.7 * strength, 1.8);
    o.connect(og).connect(this.sfx); o.start(t); o.stop(t + 2.2);
  }
}
