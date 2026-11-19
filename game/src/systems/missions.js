// Runs the story across both chapters: shows the next mission's giver on the map, starts it on E,
// plays the dialogue, walks through its steps (with timers, targets, hints and progress), times the
// run, and pays out, fails or closes a chapter.
import { ALL_MISSIONS, chapterOf } from '../story/index.js';
import { Marker } from '../world/markers.js';
import { services } from '../core/services.js';
import { dist2, formatMoney } from '../util/mathx.js';

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Advice shown after a second failed attempt, by mission. */
const TIPS = {
  collection: 'Buy body armour at Bayside Arms and fight from behind the crates.',
  ledger: 'The van runs when hit. Ram it from behind, or take the SMG to it.',
  finale: 'Kane’s men carry shotguns. Bring armour and call Rosa from the phone (T) for a hot meal.',
  tail: 'Keep between 15 and 75 metres back. Cross junctions on green.',
  sunwheel: 'The helicopter keeps the stars up: break line of sight under the hotels, or shoot it down.',
  convoy: 'Get ahead of the vans and ram them head-on; a faster car helps (Fresh Coat has upgrades).',
  lowtide: 'Holt’s interceptor is quick. An engine tune from Fresh Coat will close the gap.',
};

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.active = null;
    this.stepIndex = 0;
    this.ctx = {};
    this.timeLeft = null;
    this.elapsed = 0;
    this.attempts = {};
    this.giverMarker = new Marker('mission', 1.8, 4);
    this.targetMarker = new Marker('target', 2.2, 6);
    this.targetMarker.show(false);
    this.cooldown = 0;
  }

  get list() { return ALL_MISSIONS; }
  get total() { return ALL_MISSIONS.length; }
  get next() { return ALL_MISSIONS[this.index] ?? null; }
  get finished() { return this.index >= ALL_MISSIONS.length; }
  get chapter() { return this.next ? chapterOf(this.next.id) : 2; }

  giverPos(def) { return this.game.plan.landmarks[def.giver].door; }

  /** The point the HUD, minimap and GPS route should lead to. */
  currentTarget() {
    if (!this.active) return null;
    const st = this.active.steps[this.stepIndex];
    const t = st?.target?.(this.game, this.ctx);
    return t ? { x: t.x, z: t.z } : null;
  }

  objective() {
    if (!this.active) return null;
    const st = this.active.steps[this.stepIndex];
    if (!st) return null;
    const prog = st.progress ? ` (${st.progress(this.game, this.ctx)})` : '';
    return { title: this.active.title, text: (this.ctx.hint ?? st.text) + prog };
  }

  update(dt, input) {
    const g = this.game;
    const t = services.time;
    this.cooldown -= dt;
    if (!this.active) {
      const m = this.next;
      this.targetMarker.show(false);
      if (!m) { this.giverMarker.show(false); return; }
      const p = this.giverPos(m);
      this.giverMarker.place(p.x, p.z).show(true);
      this.giverMarker.animate(t);
      const pp = g.player.vehicle ? g.player.vehicle.pos : g.player.pos;
      const near = this.cooldown <= 0 && dist2(pp.x, pp.z, p.x, p.z) < 3.2;
      if (near && g.police.level === 0) {
        const tries = this.attempts[m.id] ? ` (attempt ${this.attempts[m.id] + 1})` : '';
        g.hud.help(`<b>${m.title}</b>${tries}<br>Press <kbd>E</kbd> to start the mission.`);
        if (input.tap('KeyE')) this.start(m);
      } else if (near) g.hud.help('Lose the cops before starting a mission.');
      return;
    }
    this.giverMarker.show(false);
    this.elapsed += dt;
    const st = this.active.steps[this.stepIndex];
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Out of time.'); return; }
    }
    const result = st.update(g, this.ctx, dt);
    const target = st.target?.(g, this.ctx);
    if (target && !g.player.dead && st.marker !== false) {
      this.targetMarker.place(target.x, target.z, target.y).show(true);
      this.targetMarker.animate(t);
    } else this.targetMarker.show(false);
    if (result === 'done') this.advance();
    else if (typeof result === 'string' && result.startsWith('fail')) this.fail(result.slice(5));
  }

  start(def) {
    const g = this.game;
    this.active = def;
    this.ctx = {};
    this.stepIndex = 0;
    this.elapsed = 0;
    this.attempts[def.id] = this.attempts[def.id] ?? 0;
    def.setup?.(g, this.ctx);
    this.timeLeft = def.steps[0].seconds ?? null;
    g.hud.banner(def.title.toUpperCase(), `Chapter ${chapterOf(def.id)}  ·  mission ${this.index + 1} of ${this.total}`, 'mission', 3);
    g.dialogue.play(def.intro);
    services.audio?.blip();
  }

  advance() {
    this.stepIndex++;
    const def = this.active;
    this.ctx.hint = null;
    if (this.stepIndex >= def.steps.length) { this.pass(); return; }
    const st = def.steps[this.stepIndex];
    this.timeLeft = st.seconds ?? null;
    services.audio?.blip();
  }

  pass() {
    const g = this.game, def = this.active;
    g.player.money += def.reward;
    g.hud.banner('MISSION PASSED', `${def.title}  ·  ${formatMoney(def.reward)}  ·  ${clock(this.elapsed)}`, 'pass', 4.5);
    services.audio?.passed();
    g.dialogue.play(def.outro);
    def.onPass?.(g);
    this.cleanup();
    this.index++;
    this.active = null;
    this.cooldown = 6;
    g.stats.missionsPassed = this.index;
    if (def.chapterEnd) g.showChapterCard(def.chapterEnd);
    if (def.credits) g.showCredits();
    g.save.write(g, 'autosave');
    g.notify('Progress saved.');
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    const id = this.active.id;
    this.attempts[id] = (this.attempts[id] ?? 0) + 1;
    g.hud.banner('MISSION FAILED', reason, 'fail', 4);
    if (this.attempts[id] >= 2 && TIPS[id]) g.notify(`<b>Tip:</b> ${TIPS[id]}`);
    services.audio?.failed();
    this.cleanup();
    this.active = null;
    this.cooldown = 4;
    this.timeLeft = null;
  }

  /** Releases mission people and cars back to the ambient world. */
  cleanup() {
    for (const v of Object.values(this.ctx)) {
      const list = Array.isArray(v) ? v : [v];
      for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        if ('persistent' in e) e.persistent = false;
        if ('mission' in e) e.mission = null;
      }
    }
    this.targetMarker.show(false);
    this.ctx = {};
  }
}
