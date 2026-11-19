// Sol's wardrobe: five outfits to buy from the phone and change into at any time. Cosmetic, but the
// city notices: the colours show on foot, in the pause screen's portrait of her and in every cutscene.
import { LOOKS } from './humanoid.js';
import { formatMoney } from '../util/mathx.js';

export const OUTFITS = [
  { id: 'sunset', name: 'Sunset Runner', price: 0, look: LOOKS.player },
  { id: 'harbor', name: 'Harbor Crew', price: 600, look: { skin: 0xc98b62, hair: 0x1a120c, shirt: 0xe8a640, pants: 0x2c3e66, shoes: 0x3a3a3a, cap: 0x2c3e66, longHair: true } },
  { id: 'neon', name: 'Neon Night', price: 1400, look: { skin: 0xc98b62, hair: 0x1a120c, shirt: 0x8a3dff, pants: 0x16162a, shoes: 0x2de2c8, longHair: true } },
  { id: 'salt', name: 'Salt White', price: 2200, look: { skin: 0xc98b62, hair: 0x3b2414, shirt: 0xf5f0e6, pants: 0xf5f0e6, shoes: 0xd4af37, longHair: true } },
  { id: 'heist', name: 'Heist Black', price: 3500, look: { skin: 0xc98b62, hair: 0x1a120c, shirt: 0x15161a, pants: 0x15161a, shoes: 0x0c0c0e, cap: 0x15161a, longHair: false } },
];

export class Wardrobe {
  constructor() {
    this.owned = new Set(['sunset']);
    this.worn = 'sunset';
  }

  reset(player) {
    this.owned = new Set(['sunset']);
    this.wear('sunset', player);
  }

  outfit(id) { return OUTFITS.find((o) => o.id === id); }

  /** The cheapest outfit Sol does not own yet, or null once the wardrobe is full. */
  nextToBuy() {
    return OUTFITS.filter((o) => !this.owned.has(o.id)).sort((a, b) => a.price - b.price)[0] ?? null;
  }

  /** Changes Sol into an outfit she owns. */
  wear(id, player) {
    const o = this.outfit(id);
    if (!o || !this.owned.has(id)) return false;
    this.worn = id;
    player.reskin(o.look);
    return true;
  }

  /** Buys an outfit and puts it on; returns 'ok', 'poor' or 'owned'. */
  buy(id, player) {
    const o = this.outfit(id);
    if (!o || this.owned.has(id)) return 'owned';
    if (player.money < o.price) return 'poor';
    player.money -= o.price;
    this.owned.add(id);
    this.wear(id, player);
    return 'ok';
  }

  /** Phone rows: name, state and the action each button triggers. */
  rows() {
    return OUTFITS.map((o) => ({
      id: o.id, name: o.name,
      state: this.worn === o.id ? 'wearing' : this.owned.has(o.id) ? 'wear' : formatMoney(o.price),
    }));
  }

  serialize() { return { owned: [...this.owned], worn: this.worn }; }

  restore(data, player) {
    this.owned = new Set(['sunset', ...(data?.owned ?? [])]);
    this.wear(this.owned.has(data?.worn) ? data.worn : 'sunset', player);
  }
}
