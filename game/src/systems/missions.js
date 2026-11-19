// Runs the story: shows the next mission's giver on the map, starts it on E, plays the dialogue,
// walks through its steps (with timers, targets and progress), and pays out or fails it.
import { STORY } from '../story/storyMissions.js';
import { Marker } from '../world/markers.js';
import { services } from '../core/services.js';
import { dist2, formatMoney } from '../util/mathx.js';

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.active = null;
    this.stepIndex = 0;
    this.ctx = {};
    this.timeLeft = null;
    this.giverMarker = new Marker('mission', 1.8, 4);
    this.targetMarker = new Marker('target', 2.2, 6);
    this.targetMarker.show(false);
    this.cooldown = 0;
  }

  get next() { return STORY[this.index] ?? null; }
  get finished() { return this.index >= STORY.length; }

  giverPos(def) { return this.game.plan.landmarks[def.giver].door; }

  /** The point the HUD, minimap and GPS route should lead to. */
  currentTarget() {
    if (this.active) {
      const st = this.active.steps[this.stepIndex];
      const t = st?.target?.(this.game, this.ctx);
      return t ? { x: t.x, z: t.z } : null;
    }
    return null;
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
      if (this.cooldown <= 0 && dist2(pp.x, pp.z, p.x, p.z) < 3.2 && g.police.level === 0) {
        g.hud.help(`<b>${m.title}</b><br>Press <kbd>E</kbd> to start the mission.`);
        if (input.tap('KeyE')) this.start(m);
      } else if (this.cooldown <= 0 && dist2(pp.x, pp.z, p.x, p.z) < 3.2) g.hud.help('Lose the cops before starting a mission.');
      return;
    }
    this.giverMarker.show(false);
    const st = this.active.steps[this.stepIndex];
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Out of time.'); return; }
    }
    const result = st.update(g, this.ctx, dt);
    const target = st.target?.(g, this.ctx);
    if (target && !g.player.dead) {
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
    def.setup?.(g, this.ctx);
    this.timeLeft = def.steps[0].seconds ?? null;
    g.hud.banner(def.title.toUpperCase(), 'Story mission', 'mission', 3);
    g.dialogue.play(def.intro);
    services.audio?.blip();
  }

  advance() {
    this.stepIndex++;
    const def = this.active;
    if (this.stepIndex >= def.steps.length) { this.pass(); return; }
    const st = def.steps[this.stepIndex];
    this.timeLeft = st.seconds ?? null;
    services.audio?.blip();
  }

  pass() {
    const g = this.game, def = this.active;
    g.player.money += def.reward;
    g.hud.banner('MISSION PASSED', `${def.title}  ·  ${formatMoney(def.reward)}`, 'pass', 4.5);
    services.audio?.passed();
    g.dialogue.play(def.outro);
    def.onPass?.(g);
    this.cleanup();
    this.index++;
    this.active = null;
    this.cooldown = 6;
    g.stats.missionsPassed = this.index;
    if (def.credits) g.showCredits();
    g.save.write(g, 'autosave');
    g.notify('Progress saved.');
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    g.hud.banner('MISSION FAILED', reason, 'fail', 4);
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
