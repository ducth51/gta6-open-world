// Small numeric helpers and a seedable random generator shared by every system.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach of `current` to `target`. */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const dampAngle = (current, target, rate, dt) => current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
export const distSq2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
/** Yaw (radians) that faces from a to b, matching three.js rotation.y for a model built facing +z. */
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

/** mulberry32: a tiny deterministic PRNG, so the same seed always builds the same city. */
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/** The game-wide generator for gameplay randomness; reseeded by screenshot scenes for repeatable frames. */
export const rng = makeRng(20261119);
export function reseedGameplay(seed) { Object.assign(rng, makeRng(seed)); }

export function formatMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
