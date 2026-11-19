// Sixteen things worth doing in Palmera Bay, each checked twice a second against the state of the
// game. Unlocking one pays $250, shows a banner and lands on the phone's Achievements page.
import { services } from '../core/services.js';

/** Each test reads the game and the little running totals the tracker keeps (`t`). */
export const ACHIEVEMENTS = [
  { id: 'wheels', name: 'Wheels', text: 'Steal your first car.', test: (g) => g.player.stats.carsStolen >= 1 },
  { id: 'airtime', name: 'Airtime', text: 'Land a stunt jump of 25 metres or more.', test: (g) => g.stunts.bestJump >= 25 },
  { id: 'daredevil', name: 'Daredevil', text: 'Find all eight stunt jumps.', test: (g) => g.stunts.done.size >= 8 },
  { id: 'hotseat', name: 'Hot Seat', text: 'Reach four wanted stars.', test: (g, t) => t.peakStars >= 4 },
  { id: 'skyfall', name: 'Skyfall', text: 'Shoot down a police helicopter.', test: (g) => (g.stats.helisDowned ?? 0) >= 1 },
  { id: 'landlord', name: 'Landlord', text: 'Buy a business.', test: (g) => g.properties.ownedCount >= 1 },
  { id: 'mogul', name: 'Beach Mogul', text: 'Own all three businesses.', test: (g) => g.properties.ownedCount >= 3 },
  { id: 'tuned', name: 'Tuned Up', text: 'Reach level 3 in any garage upgrade.', test: (g) => ['engine', 'tyres', 'armor'].some((id) => g.perks.level(id) >= 3) },
  { id: 'wheelman', name: 'Wheelman', text: 'Reach level 4 driving skill.', test: (g) => g.skills.level('driving') >= 4 },
  { id: 'marksman', name: 'Marksman', text: 'Reach level 4 shooting skill.', test: (g) => g.skills.level('shooting') >= 4 },
  { id: 'homecoming', name: 'Home Again', text: 'Finish chapter one.', test: (g) => g.missions.index >= 5 },
  { id: 'lowtide', name: 'Low Tide', text: 'Finish chapter two.', test: (g) => g.missions.index >= g.missions.total },
  { id: 'justice', name: 'Street Justice', text: 'Settle three street events.', test: (g) => g.events.completed >= 3 },
  { id: 'rain', name: 'Singing in the Rain', text: 'Drive a kilometre in the rain.', test: (g, t) => t.rainMetres >= 1000 },
  { id: 'tokens', name: 'Token Hunter', text: 'Find every Sun Token.', test: (g) => g.activities.tokensFound.size >= g.activities.tokens.length },
  { id: 'drifter', name: 'Drift King', text: 'Bank $1,500 from drifting.', test: (g) => g.stunts.driftBanked >= 1500 },
];

export const ACHIEVEMENT_REWARD = 250;

export class Achievements {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.totals = { peakStars: 0, rainMetres: 0 };
    this.pollT = 0;
    services.achievements = this;
  }

  reset() {
    this.unlocked.clear();
    this.totals.peakStars = 0;
    this.totals.rainMetres = 0;
  }

  get count() { return this.unlocked.size; }

  /** A "now / goal" line for the trophies that count something, or '' for the rest. */
  progress(a) {
    const g = this.game, t = this.totals;
    const lines = {
      rain: `${Math.round(Math.min(1000, t.rainMetres))} / 1000 m`,
      drifter: `$${Math.min(1500, g.stunts.driftBanked)} / $1500`,
      justice: `${Math.min(3, g.events.completed)} / 3`,
      tokens: `${g.activities.tokensFound.size} / ${g.activities.tokens.length}`,
      daredevil: `${g.stunts.done.size} / 8`,
      airtime: `best ${Math.round(g.stunts.bestJump)} m`,
    };
    return lines[a.id] ?? '';
  }

  update(dt) {
    const g = this.game, t = this.totals;
    t.peakStars = Math.max(t.peakStars, g.police.level);
    const v = g.player.vehicle;
    if (v && g.weather.raining) t.rainMetres += v.speed * dt;
    this.pollT -= dt;
    if (this.pollT > 0) return;
    this.pollT = 0.5;
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id) || !a.test(g, t)) continue;
      this.unlock(a);
    }
  }

  unlock(a) {
    const g = this.game;
    this.unlocked.add(a.id);
    g.player.money += ACHIEVEMENT_REWARD;
    g.hud.banner('ACHIEVEMENT', `${a.name} — ${a.text}`, 'pass', 3.2);
    services.audio?.passed();
  }

  serialize() { return { ids: [...this.unlocked], totals: { ...this.totals } }; }

  restore(data) {
    this.reset();
    for (const id of data?.ids ?? []) this.unlocked.add(id);
    Object.assign(this.totals, data?.totals ?? {});
  }
}
