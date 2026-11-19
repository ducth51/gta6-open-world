// Saving and loading: story progress, cash, weapons, armour, collectibles, race records and the
// clock go to localStorage; loading puts Sol back at her bungalow with all of it.
const KEY = 'salt-neon.save.';

export class SaveGame {
  available(slot = 'slot1') { return !!this.read(slot); }

  latest() {
    const a = this.read('slot1'), b = this.read('autosave');
    if (!a) return b ? 'autosave' : null;
    if (!b) return 'slot1';
    return a.savedAt >= b.savedAt ? 'slot1' : 'autosave';
  }

  read(slot) {
    try {
      const raw = localStorage.getItem(KEY + slot);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  write(game, slot = 'slot1') {
    const p = game.player;
    const data = {
      version: 1,
      savedAt: Date.now(),
      mission: game.missions.index,
      money: p.money,
      health: Math.max(50, p.health),
      armor: p.armor,
      weapons: p.weapons,
      weapon: p.weapon,
      tokens: [...game.activities.tokensFound],
      bestTimes: game.activities.bestTimes,
      hour: game.hour,
      stats: p.stats,
      skills: game.skills.serialize(),
      perks: game.perks.serialize(),
      achievements: game.achievements.serialize(),
      turf: game.territories.serialize(),
      vigilante: game.vigilante.serialize(),
      taxi: game.taxi.serialize(),
      holdups: game.holdups.serialize(),
      outfit: game.wardrobe.serialize(),
      helisDowned: game.stats.helisDowned ?? 0,
      stunts: game.stunts.serialize(),
      properties: game.properties.serialize(),
      events: { completed: game.events.completed, earned: game.events.earned },
      car: game.lastCarModel,
    };
    try { localStorage.setItem(KEY + slot, JSON.stringify(data)); return true; } catch { return false; }
  }

  /** Applies a save to a freshly started game. */
  apply(game, data) {
    const p = game.player;
    game.missions.index = data.mission ?? 0;
    p.money = data.money ?? 500;
    p.health = data.health ?? 100;
    p.armor = data.armor ?? 0;
    if (data.weapons) for (const [id, w] of Object.entries(data.weapons)) if (p.weapons[id]) Object.assign(p.weapons[id], w);
    p.selectWeapon(data.weapon ?? 'fists');
    for (const i of data.tokens ?? []) { game.activities.tokensFound.add(i); game.activities.tokens[i]?.setActive(false); }
    game.activities.bestTimes = data.bestTimes ?? {};
    game.hour = data.hour ?? game.hour;
    if (data.stats) Object.assign(p.stats, data.stats);
    game.skills.restore(data.skills);
    game.perks.restore(data.perks);
    game.achievements.restore(data.achievements);
    game.territories.restore(data.turf);
    game.vigilante.restore(data.vigilante);
    game.taxi.restore(data.taxi);
    game.holdups.restore(data.holdups);
    game.wardrobe.restore(data.outfit, p);
    game.stats.helisDowned = data.helisDowned ?? 0;
    game.stunts.restore(data.stunts);
    game.properties.restore(data.properties);
    game.events.completed = data.events?.completed ?? 0;
    game.events.earned = data.events?.earned ?? 0;
    game.lastCarModel = data.car ?? null;
  }
}
