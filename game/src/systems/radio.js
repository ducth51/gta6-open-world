// Car radio: three stations of original, generated music (synthwave, lo-fi and a dembow beat),
// scheduled a sixteenth at a time with a Web Audio look-ahead clock. Plays in cars and on the title.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const STATIONS = [
  {
    name: 'Neon Tide FM 88.1', bpm: 100, wave: 'sawtooth',
    // Am - F - C - G: root notes and chord tones (MIDI).
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
    bass: [0, 2, 3, 6, 8, 10, 11, 14], arp: true,
  },
  {
    name: 'Palm Static 97.3', bpm: 80, wave: 'triangle',
    chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]],
    drums: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    bass: [0, 7, 10], arp: false, pad: true,
  },
  {
    name: 'Bassline Bay 104.5', bpm: 96, wave: 'square',
    chords: [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]],
    drums: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [2, 6, 10, 14] },
    bass: [0, 3, 6, 8, 11, 14], arp: false, stab: [3, 6, 11, 14],
  },
];

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.station = 0;
    this.on = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.level = 0;
    this.out = null;
  }

  get name() { return this.on ? STATIONS[this.station].name : 'Radio off'; }

  ensure() {
    const a = this.audio;
    if (!a.ready) return false;
    if (!this.out) {
      this.out = a.ctx.createGain();
      this.out.gain.value = 0;
      const delay = a.ctx.createDelay(); delay.delayTime.value = 0.28;
      const fb = a.ctx.createGain(); fb.gain.value = 0.28;
      this.wet = a.ctx.createGain(); this.wet.gain.value = 0.25;
      this.wet.connect(delay).connect(fb).connect(delay);
      delay.connect(this.out);
      this.out.connect(a.music);
    }
    if (!this.timer) { this.nextTime = a.ctx.currentTime + 0.05; this.timer = setInterval(() => this.schedule(), 25); }
    return true;
  }

  /** Fades the music to `level` (0..1). */
  setLevel(level) {
    if (!this.ensure()) return;
    this.level = level;
    this.out.gain.setTargetAtTime(this.on ? level : 0, this.audio.ctx.currentTime, 0.4);
  }

  next() {
    if (!this.on) { this.on = true; this.station = 0; } else if (this.station === STATIONS.length - 1) this.on = false; else this.station++;
    this.step = 0;
    this.setLevel(this.level || 1);
    return this.name;
  }

  schedule() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.on || this.level <= 0.001) { if (ctx) this.nextTime = ctx.currentTime + 0.05; return; }
    const st = STATIONS[this.station];
    const sixteenth = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(st, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(st, step, t, len) {
    const s = step % 16;
    const chord = st.chords[Math.floor(step / 16) % st.chords.length];
    const ctx = this.audio.ctx;
    if (st.drums.kick.includes(s)) this.kick(t);
    if (st.drums.snare.includes(s)) this.snare(t, st.pad ? 0.12 : 0.22);
    if (st.drums.hat.includes(s)) this.hat(t, st.pad ? 0.04 : 0.07);
    if (st.bass.includes(s)) this.voice(NOTE(chord[0] - 24), t, len * 1.8, 'sawtooth', 0.16, 500);
    if (st.arp) {
      const n = chord[s % chord.length] + (s % 8 >= 4 ? 12 : 0);
      this.voice(NOTE(n), t, len * 0.9, st.wave, 0.05, 2600, true);
    }
    if (st.pad && s === 0) for (const n of chord) this.voice(NOTE(n), t, len * 15, 'sine', 0.05, 1800, true);
    if (st.pad && (s === 6 || s === 14) && step % 32 < 16) this.voice(NOTE(chord[chord.length - 1] + 12), t, len * 3, 'triangle', 0.05, 2400, true);
    if (st.stab && st.stab.includes(s)) for (const n of chord) this.voice(NOTE(n + 12), t, len * 0.8, 'square', 0.025, 1800, true);
    if (s === 0 && step % 32 === 0 && st.arp) for (const n of chord) this.voice(NOTE(n), t, len * 30, 'sawtooth', 0.02, 900, true);
    void ctx;
  }

  voice(freq, t, dur, type, vol, cutoff, wet = false) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    if (wet) g.connect(this.wet);
    o.start(t); o.stop(t + dur + 0.02);
  }

  kick(t) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }

  snare(t, vol) {
    const ctx = this.audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(f).connect(g).connect(this.out); g.connect(this.wet); n.start(t, Math.random()); n.stop(t + 0.2);
  }

  hat(t, vol) {
    const ctx = this.audio.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.06);
  }
}
