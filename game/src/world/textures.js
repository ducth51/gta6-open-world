// Procedural canvas textures: building facades (day and lit-window night maps), asphalt with lane
// markings, crossings, sidewalks, sand, grass and neon sign lettering. Nothing is loaded from disk.
import * as THREE from 'three';
import { makeRng } from '../util/mathx.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

function noise(ctx, w, h, amount, rng, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng.int(0, w), rng.int(0, h), rng.int(1, 3), rng.int(1, 3));
  }
}

/** Windows per texture tile and metres per window, for each facade style. */
export const FACADE_SCALE = {
  glass: { cols: 8, rows: 8, cellW: 3.2, cellH: 3.6 },
  concrete: { cols: 8, rows: 8, cellW: 3.6, cellH: 3.4 },
  stucco: { cols: 8, rows: 8, cellW: 4.0, cellH: 3.2 },
  warehouse: { cols: 8, rows: 4, cellW: 4.0, cellH: 4.0 },
  house: { cols: 4, rows: 2, cellW: 4.0, cellH: 3.0 },
};

/** Returns { map, emissive } textures for a facade style. */
export function facadeTextures(style) {
  if (cache.has('facade:' + style)) return cache.get('facade:' + style);
  const { cols, rows } = FACADE_SCALE[style];
  const cw = 64, ch = 64;
  const W = cols * cw, H = rows * ch;
  const day = canvas(W, H), night = canvas(W, H);
  const d = day.getContext('2d'), n = night.getContext('2d');
  const rng = makeRng(style.length * 977);
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  d.fillStyle = '#ffffff'; d.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * ch;
      const lit = rng.chance(style === 'warehouse' ? 0.15 : 0.42);
      const warm = rng.chance(0.75) ? '255,214,140' : '170,220,255';
      if (style === 'glass') {
        const g = d.createLinearGradient(x, y, x + cw, y + ch);
        const tone = rng.range(0.25, 0.5);
        g.addColorStop(0, `rgba(40,70,110,${tone + 0.35})`);
        g.addColorStop(0.55, `rgba(120,170,215,${tone + 0.2})`);
        g.addColorStop(1, `rgba(30,50,80,${tone + 0.4})`);
        d.fillStyle = g; d.fillRect(x + 2, y + 3, cw - 4, ch - 6);
        d.fillStyle = 'rgba(255,255,255,0.75)'; d.fillRect(x, y, cw, 3);
        if (lit) { n.fillStyle = `rgba(${warm},${rng.range(0.5, 0.95)})`; n.fillRect(x + 3, y + 4, cw - 6, ch - 8); }
      } else if (style === 'concrete') {
        d.fillStyle = 'rgba(0,0,0,0.06)'; d.fillRect(x, y + ch - 8, cw, 8);
        d.fillStyle = 'rgba(28,40,58,0.92)'; d.fillRect(x + 10, y + 12, cw - 20, ch - 26);
        d.fillStyle = 'rgba(160,200,230,0.35)'; d.fillRect(x + 10, y + 12, (cw - 20) / 2, ch - 26);
        if (lit) { n.fillStyle = `rgba(${warm},0.9)`; n.fillRect(x + 10, y + 12, cw - 20, ch - 26); }
      } else if (style === 'stucco') {
        d.fillStyle = 'rgba(30,45,60,0.9)'; d.fillRect(x + 14, y + 12, cw - 28, ch - 28);
        d.fillStyle = 'rgba(255,255,255,0.9)'; d.fillRect(x + 11, y + ch - 17, cw - 22, 4);
        d.fillStyle = 'rgba(0,0,0,0.08)'; d.fillRect(x, y + ch - 4, cw, 4);
        if (r % 2 === 0) { d.fillStyle = 'rgba(0,0,0,0.12)'; d.fillRect(x + 8, y + ch - 13, cw - 16, 2); }
        if (lit) { n.fillStyle = `rgba(${warm},0.85)`; n.fillRect(x + 14, y + 12, cw - 28, ch - 28); }
      } else if (style === 'warehouse') {
        for (let k = 0; k < cw; k += 6) { d.fillStyle = 'rgba(0,0,0,0.10)'; d.fillRect(x + k, y, 2, ch); }
        if (r === 0) { d.fillStyle = 'rgba(40,50,60,0.75)'; d.fillRect(x + 8, y + 10, cw - 16, 14); if (lit) { n.fillStyle = `rgba(${warm},0.8)`; n.fillRect(x + 8, y + 10, cw - 16, 14); } }
        if (r === rows - 1 && c % 3 === 1) { d.fillStyle = 'rgba(60,60,60,0.55)'; d.fillRect(x + 4, y + 14, cw - 8, ch - 14); for (let k = 16; k < ch; k += 5) { d.fillStyle = 'rgba(0,0,0,0.2)'; d.fillRect(x + 4, y + k, cw - 8, 1); } }
      } else {
        if ((c + r) % 2 === 0) {
          d.fillStyle = 'rgba(255,255,255,1)'; d.fillRect(x + 14, y + 14, cw - 28, ch - 26);
          d.fillStyle = 'rgba(40,60,80,0.9)'; d.fillRect(x + 17, y + 17, cw - 34, ch - 32);
          if (lit) { n.fillStyle = `rgba(${warm},0.9)`; n.fillRect(x + 17, y + 17, cw - 34, ch - 32); }
        } else if (r === rows - 1 && c === 1) {
          d.fillStyle = 'rgba(110,70,40,0.9)'; d.fillRect(x + 22, y + 22, 20, ch - 22);
        }
      }
    }
  }
  noise(d, W, H, 2500, rng, 0.05);
  const result = { map: toTexture(day), emissive: toTexture(night) };
  cache.set('facade:' + style, result);
  return result;
}

/** A 16 m stretch of two-lane road: asphalt, white edge lines, double yellow centre line. */
export function roadTexture() {
  if (cache.has('road')) return cache.get('road');
  const c = canvas(256, 256), x = c.getContext('2d');
  const rng = makeRng(11);
  x.fillStyle = '#3b3d42'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 6000, rng, 0.09);
  // Tyre wear in each lane.
  x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, 40, 256, 18); x.fillRect(0, 198, 256, 18); x.fillRect(0, 88, 256, 14); x.fillRect(0, 154, 256, 14);
  x.fillStyle = '#e8e4d8'; x.fillRect(0, 12, 256, 4); x.fillRect(0, 240, 256, 4);
  x.fillStyle = '#f2c230'; x.fillRect(0, 122, 256, 4); x.fillRect(0, 130, 256, 4);
  const t = toTexture(c);
  cache.set('road', t);
  return t;
}

/** Intersection: plain asphalt with zebra crossings on every side. */
export function crossingTexture() {
  if (cache.has('crossing')) return cache.get('crossing');
  const c = canvas(256, 256), x = c.getContext('2d');
  const rng = makeRng(12);
  x.fillStyle = '#3b3d42'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 6000, rng, 0.09);
  x.fillStyle = 'rgba(235,232,222,0.9)';
  for (let k = 20; k < 236; k += 22) {
    x.fillRect(k, 2, 12, 26); x.fillRect(k, 228, 12, 26);
    x.fillRect(2, k, 26, 12); x.fillRect(228, k, 26, 12);
  }
  const t = toTexture(c, false);
  cache.set('crossing', t);
  return t;
}

export function sidewalkTexture() {
  if (cache.has('sidewalk')) return cache.get('sidewalk');
  const c = canvas(128, 128), x = c.getContext('2d');
  const rng = makeRng(13);
  x.fillStyle = '#c9c3b6'; x.fillRect(0, 0, 128, 128);
  noise(x, 128, 128, 1500, rng, 0.08);
  x.fillStyle = 'rgba(0,0,0,0.16)';
  for (let k = 0; k < 128; k += 32) { x.fillRect(k, 0, 1, 128); x.fillRect(0, k, 128, 1); }
  const t = toTexture(c);
  cache.set('sidewalk', t);
  return t;
}

export function groundTexture(kind) {
  if (cache.has('ground:' + kind)) return cache.get('ground:' + kind);
  const c = canvas(256, 256), x = c.getContext('2d');
  const rng = makeRng(kind.length * 31);
  const base = { sand: '#e8d3a2', grass: '#ffffff', gravel: '#9a9286', asphalt: '#45474c', dirt: '#b9a57e' }[kind];
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, kind === 'gravel' ? 12000 : 7000, rng, kind === 'grass' ? 0.12 : 0.1);
  if (kind === 'grass') for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(30,${rng.int(60, 120)},20,0.18)`; x.fillRect(rng.int(0, 256), rng.int(0, 256), 1, rng.int(2, 5)); }
  if (kind === 'asphalt') { x.fillStyle = 'rgba(240,240,230,0.85)'; for (let k = 0; k < 256; k += 64) x.fillRect(k, 0, 3, 90); }
  const t = toTexture(c);
  cache.set('ground:' + kind, t);
  return t;
}

/** Neon sign: glowing capitals on a transparent board. */
export function signTexture(text, color) {
  const key = 'sign:' + text + color;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(512, 96), x = c.getContext('2d');
  x.clearRect(0, 0, 512, 96);
  x.font = 'bold 64px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 64;
  while (x.measureText(text).width > 480 && size > 20) { size -= 4; x.font = `bold ${size}px Impact, "Arial Black", sans-serif`; }
  x.shadowColor = color; x.shadowBlur = 18;
  x.fillStyle = color; x.fillText(text, 256, 50);
  x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText(text, 256, 50);
  const t = toTexture(c, false);
  cache.set(key, t);
  return t;
}

/** Soft round sprite used by particles and blob shadows. */
export function softDotTexture() {
  if (cache.has('dot')) return cache.get('dot');
  const c = canvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cache.set('dot', t);
  return t;
}
