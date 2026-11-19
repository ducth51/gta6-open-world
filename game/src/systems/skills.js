// Sol's skills: driving, shooting, stamina and strength all grow with use, from level 1 to 6, and each
// level nudges the rules a little in her favour (grip, spread, sprint endurance, punch power).
import { services } from '../core/services.js';
import { clamp } from '../util/mathx.js';

export const SKILLS = {
  driving: { name: 'Driving', blurb: 'More grip and sharper steering in cars.' },
  shooting: { name: 'Shooting', blurb: 'Tighter spread with every gun.' },
  stamina: { name: 'Stamina', blurb: 'Sprint for longer before you tire.' },
  strength: { name: 'Strength', blurb: 'Punches hit much harder.' },
};

/** Total experience needed to reach level n + 1. */
const LEVEL_XP = [0, 120, 300, 580, 980, 1500];
export const MAX_LEVEL = LEVEL_XP.length;
/** Cash for reaching a level: this many dollars times the new level. */
const LEVEL_BONUS = 60;

export class Skills {
  constructor(game) {
    this.game = game;
    this.xp = {};
    this.reset();
    services.skills = this;
  }

  reset() { for (const id of Object.keys(SKILLS)) this.xp[id] = 0; }

  level(id) {
    let level = 1;
    while (level < MAX_LEVEL && this.xp[id] >= LEVEL_XP[level]) level++;
    return level;
  }

  /** { level, into, need } where into/need measure progress through the current level. */
  progress(id) {
    const level = this.level(id);
    if (level >= MAX_LEVEL) return { level, into: 1, need: 1 };
    return { level, into: this.xp[id] - LEVEL_XP[level - 1], need: LEVEL_XP[level] - LEVEL_XP[level - 1] };
  }

  add(id, amount) {
    if (!(id in this.xp) || amount <= 0) return;
    const before = this.level(id);
    this.xp[id] += amount;
    const now = this.level(id);
    if (now > before) {
      const bonus = LEVEL_BONUS * now;
      this.game.player.money += bonus;
      this.game.notify(`<b>${SKILLS[id].name}</b> skill is now level ${now}. Bonus $${bonus}.`);
      services.audio?.pickup();
    }
  }

  /** Passive training: fast driving builds the driving skill. */
  update(dt) {
    const v = this.game.player.vehicle;
    if (v && !v.dead && v.speed > 22) this.add('driving', dt * 1.4);
  }

  gripBonus() { return 1 + 0.035 * (this.level('driving') - 1); }
  steerBonus() { return 1 + 0.04 * (this.level('driving') - 1); }
  spreadMul() { return 1 - 0.09 * (this.level('shooting') - 1); }
  staminaDrain() { return clamp(1 - 0.14 * (this.level('stamina') - 1), 0.25, 1); }
  punchMul() { return 1 + 0.18 * (this.level('strength') - 1); }

  serialize() { return { ...this.xp }; }

  restore(data) {
    this.reset();
    if (!data) return;
    for (const id of Object.keys(SKILLS)) if (typeof data[id] === 'number') this.xp[id] = data[id];
  }
}
