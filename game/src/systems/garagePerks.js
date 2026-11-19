// Garage upgrades bought at Fresh Coat: an engine tune, racing tyres and armour plating, three levels
// each. They belong to Sol, not to one car: whatever she is driving gets them while she is at the wheel.
import { services } from '../core/services.js';
import { formatMoney } from '../util/mathx.js';

export const PERKS = [
  { id: 'engine', name: 'Engine tune', key: 'Digit1', prices: [1500, 3500, 7000], blurb: '+7% pull and top speed per level' },
  { id: 'tyres', name: 'Racing tyres', key: 'Digit2', prices: [1200, 2800, 5500], blurb: '+8% grip per level' },
  { id: 'armor', name: 'Armour plating', key: 'Digit3', prices: [2000, 4500, 9000], blurb: 'Cars take 20% less damage per level' },
];

export class GaragePerks {
  constructor() {
    this.levels = {};
    this.reset();
    services.perks = this;
  }

  reset() { for (const p of PERKS) this.levels[p.id] = 0; }

  level(id) { return this.levels[id] ?? 0; }

  /** Price of the next level of a perk, or null when it is maxed out. */
  price(id) {
    const perk = PERKS.find((p) => p.id === id);
    return perk?.prices[this.level(id)] ?? null;
  }

  /** Everything Sol has paid for upgrades so far. */
  spent() {
    return PERKS.reduce((sum, p) => sum + p.prices.slice(0, this.level(p.id)).reduce((a, b) => a + b, 0), 0);
  }

  engineBoost() { return 1 + 0.07 * this.level('engine'); }
  gripBoost() { return 1 + 0.08 * this.level('tyres'); }
  damageTaken() { return 1 - 0.2 * this.level('armor'); }

  /** Buys the next level; returns 'ok', 'poor' (not enough cash) or 'max'. */
  buy(id, player) {
    const price = this.price(id);
    if (price === null) return 'max';
    if (player.money < price) return 'poor';
    player.money -= price;
    this.levels[id]++;
    return 'ok';
  }

  /** The shop's menu lines, one per perk, with the key to press. */
  shopLines() {
    return PERKS.map((p, i) => {
      const price = this.price(p.id);
      const state = price === null ? 'MAX' : `${formatMoney(price)}`;
      return `<kbd>${i + 1}</kbd> ${p.name} <small>Lv ${this.level(p.id)}/${p.prices.length}</small> — ${state}`;
    });
  }

  serialize() { return { ...this.levels }; }

  restore(data) {
    this.reset();
    for (const p of PERKS) if (Number.isInteger(data?.[p.id])) this.levels[p.id] = Math.min(p.prices.length, Math.max(0, data[p.id]));
  }
}
