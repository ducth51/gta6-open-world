// Subtitled dialogue: queues lines of [speaker, text], shows each long enough to read, and lets
// passers-by shout short lines of their own.
import { services } from '../core/services.js';

export class Dialogue {
  constructor(hud) {
    this.hud = hud;
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.barks = [];
  }

  play(lines) {
    if (!lines) return;
    for (const [who, text] of lines) this.queue.push({ who, text, t: 1.6 + text.length * 0.055 });
  }

  bark(text) { this.barks.push({ text, t: 2 }); }

  skip() { this.current = null; this.t = 0; }

  get busy() { return !!this.current || this.queue.length > 0; }

  update(dt) {
    if (this.current) {
      this.t -= dt;
      if (this.t <= 0) this.current = null;
    }
    if (!this.current && this.queue.length) {
      this.current = this.queue.shift();
      this.t = this.current.t;
      services.audio?.tone(520, 0.05, 'triangle', 0.06);
    }
    for (const b of this.barks) b.t -= dt;
    this.barks = this.barks.filter((b) => b.t > 0);
    if (this.current) this.hud.subtitle(`<b>${this.current.who}:</b> ${this.current.text}`);
    else if (this.barks.length) this.hud.subtitle(`<i>${this.barks[this.barks.length - 1].text}</i>`);
    else this.hud.subtitle(null);
  }
}
