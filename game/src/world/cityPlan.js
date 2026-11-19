// The plan of Palmera Bay: which district each block belongs to, every building's footprint and
// height, the landmarks the story uses, parking lots, palms and street furniture. Pure data, built
// from a seed, so the meshes, colliders, minimap and AI all read the same city.
import { BLOCK, CELL, CITY_SIZE, GRID, ROAD, SIDEWALK, OCEAN_X, STREETS_EW, STREETS_NS, DISTRICTS } from '../config.js';
import { makeRng, clamp } from '../util/mathx.js';
import { nearRamp } from './rampLayout.js';

export const PIER = { x0: CITY_SIZE + 18, x1: OCEAN_X + 120, z: 4 * CELL + 8, half: 7, deck: 0.7 };
export const QUAY_Z = CITY_SIZE + 22;

/** Blocks given over to a story location, with the building drawn for each. */
const LANDMARKS = [
  { id: 'safehouse', name: "Sol's Bungalow", bi: 1, bj: 1, w: 18, d: 14, h: 6, style: 'house', color: 0xf2c6a0, blip: 'save' },
  { id: 'diner', name: "Rosa's Diner", bi: 8, bj: 4, w: 30, d: 16, h: 7, style: 'stucco', color: 0x7fe0d0, sign: "ROSA'S", signColor: '#ff4fa0', blip: 'rosa' },
  { id: 'garage', name: "Benny's Garage", bi: 3, bj: 8, w: 36, d: 24, h: 10, style: 'warehouse', color: 0xc9a46a, sign: 'BENNY TWO-TONES', signColor: '#ffd25e', blip: 'benny' },
  { id: 'stash', name: 'Gilded Hand Yard', bi: 1, bj: 7, w: 20, d: 14, h: 9, style: 'warehouse', color: 0x8a8f96, blip: 'stash' },
  { id: 'hospital', name: 'Mercy Shores Hospital', bi: 3, bj: 2, w: 44, d: 30, h: 26, style: 'concrete', color: 0xeef2f5, sign: 'MERCY SHORES', signColor: '#ff3b3b', blip: 'hospital' },
  { id: 'police', name: 'PBPD Headquarters', bi: 6, bj: 1, w: 42, d: 28, h: 20, style: 'concrete', color: 0xb7c3d6, sign: 'PALMERA BAY POLICE', signColor: '#4fa8ff', blip: 'police' },
  { id: 'gunshop', name: 'Bayside Arms', bi: 5, bj: 7, w: 26, d: 18, h: 8, style: 'stucco', color: 0xd9b48f, sign: 'BAYSIDE ARMS', signColor: '#ff7a1a', blip: 'guns' },
  { id: 'spray', name: 'Fresh Coat Garage', bi: 2, bj: 5, w: 28, d: 18, h: 8, style: 'warehouse', color: 0x6fb6e8, sign: 'FRESH COAT', signColor: '#2de2c8', blip: 'spray' },
  { id: 'kane', name: 'Kane Tower', bi: 5, bj: 4, w: 30, d: 30, h: 150, style: 'glass', color: 0xd8c08a, sign: 'KANE', signColor: '#ffd25e', blip: 'kane' },
  { id: 'park', name: 'Fountain Park', bi: 4, bj: 5, park: true },
  // Businesses Sol can buy once she has the cash (see systems/properties.js).
  { id: 'carwash', name: 'Sunbright Car Wash', bi: 7, bj: 8, w: 26, d: 16, h: 6, style: 'stucco', color: 0x9fe3f0, sign: 'SUNBRIGHT CAR WASH', signColor: '#2de2c8', blip: 'property' },
  { id: 'lounge', name: 'Neon Lounge', bi: 8, bj: 7, w: 32, d: 20, h: 13, style: 'stucco', color: 0xd7b8ff, sign: 'NEON LOUNGE', signColor: '#ff3d8b', blip: 'property' },
  { id: 'salvage', name: 'Dockside Salvage', bi: 1, bj: 9, w: 34, d: 22, h: 9, style: 'warehouse', color: 0x8fa6a0, sign: 'DOCKSIDE SALVAGE', signColor: '#ffa63d', blip: 'property' },
  // Corner stores that can be held up (see systems/holdups.js).
  { id: 'mart1', name: 'Palm Mart on Vesper', bi: 6, bj: 3, w: 18, d: 12, h: 5, style: 'stucco', color: 0xffe28a, sign: 'PALM MART', signColor: '#ff3d8b', blip: 'mart' },
  { id: 'mart2', name: 'Palm Mart at the Docks', bi: 2, bj: 8, w: 18, d: 12, h: 5, style: 'stucco', color: 0xffe28a, sign: 'PALM MART', signColor: '#ff3d8b', blip: 'mart' },
  { id: 'mart3', name: 'Palm Mart on the Beach', bi: 9, bj: 2, w: 18, d: 12, h: 5, style: 'stucco', color: 0xffe28a, sign: 'PALM MART', signColor: '#ff3d8b', blip: 'mart' },
];

const PASTELS = [0xffb3c7, 0xa8f0d8, 0xffd6a5, 0xd7b8ff, 0x9fe3f0, 0xfff1c9, 0xff9e8a, 0xbdf2a6];
const TOWER_TINTS = [0x9fc4e6, 0xbfd4e8, 0x8fb0d0, 0xc9d6df, 0xa4e0e6, 0xe3c9a4];
const CONCRETE = [0xd9d4c7, 0xc7c2b8, 0xe6dccb, 0xbfb6a8];
const HOUSE = [0xf6e0b5, 0xf2c6a0, 0xc7e6d2, 0xf7d0d8, 0xdfe7f2, 0xf9f2df];
const HOTEL_SIGNS = ['FLAMINGA', 'CORAL PALMS', 'SEAGLASS', 'MOTEL SOL', 'THE LIDO', 'AZURE', 'PALOMA'];

/** District of block (bi, bj). */
export function districtOfBlock(bi, bj) {
  if (bi === 4 && bj === 5) return 'park';
  if (bi >= 8) return 'beach';
  if (bj >= 8) return 'harbor';
  if (bi <= 2 && bj <= 4) return 'heights';
  if (bi <= 2) return 'saltmarsh';
  return 'glasswater';
}

/** District under a world position (roads take the nearest block's). */
export function districtAt(x, z) {
  if (x > CITY_SIZE - 4) return 'beach';
  if (z > CITY_SIZE - 4) return 'harbor';
  const bi = clamp(Math.floor((x - ROAD / 2) / CELL), 0, GRID - 1);
  const bj = clamp(Math.floor((z - ROAD / 2) / CELL), 0, GRID - 1);
  return districtOfBlock(bi, bj);
}

/** Name of the street nearest a world position, for the HUD. */
export function streetNameAt(x, z) {
  if (x > CITY_SIZE + 8) return x > PIER.x0 && Math.abs(z - PIER.z) < PIER.half ? 'Sunwheel Pier' : 'Palmera Beach';
  if (z > CITY_SIZE + 8) return 'Old Harbor Quay';
  const ni = clamp(Math.round((x - ROAD / 2) / CELL), 0, GRID);
  const nj = clamp(Math.round((z - ROAD / 2) / CELL), 0, GRID);
  const dx = Math.abs(x - (ni * CELL + ROAD / 2));
  const dz = Math.abs(z - (nj * CELL + ROAD / 2));
  return dx < dz ? STREETS_NS[ni] : STREETS_EW[nj];
}

export function districtName(id) { return DISTRICTS[id]?.name ?? 'Palmera Bay'; }

/** Ground height: flat city, a beach sloping to the water, the pier deck over it. */
export function groundHeight(x, z) {
  if (x > PIER.x0 - 6 && Math.abs(z - PIER.z) <= PIER.half) {
    const ramp = clamp((x - (PIER.x0 - 6)) / 6, 0, 1);
    return Math.max(PIER.deck * ramp, beachHeight(x));
  }
  return beachHeight(x);
}
function beachHeight(x) {
  if (x <= CITY_SIZE) return 0;
  return -clamp((x - CITY_SIZE) / (OCEAN_X - CITY_SIZE), 0, 1) * 1.1;
}
export const WATER_LEVEL = -0.55;

/** Keeps a position inside the playable area: the city, the beach, the quay and the pier. */
export function clampToWorld(p) {
  const onPier = Math.abs(p.z - PIER.z) < PIER.half - 0.6 && p.x > CITY_SIZE;
  const maxX = onPier ? PIER.x1 - 2 : OCEAN_X - 6;
  p.x = clamp(p.x, -40, maxX);
  if (p.x > OCEAN_X - 6) p.z = clamp(p.z, PIER.z - PIER.half + 0.8, PIER.z + PIER.half - 0.8);
  p.z = clamp(p.z, -40, QUAY_Z - 3);
}

export function blockBounds(bi, bj) {
  const x0 = bi * CELL + ROAD, z0 = bj * CELL + ROAD;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK, cx: x0 + BLOCK / 2, cz: z0 + BLOCK / 2 };
}

/** Builds the whole city plan from a seed. */
export function buildCityPlan(seed = 7) {
  const rng = makeRng(seed);
  const plan = { blocks: [], buildings: [], landmarks: {}, palms: [], trees: [], lamps: [], parking: [], props: [], signs: [], lawns: [], lots: [] };
  const landmarkAt = new Map(LANDMARKS.map((l) => [l.bi + ',' + l.bj, l]));

  for (let bj = 0; bj < GRID; bj++) {
    for (let bi = 0; bi < GRID; bi++) {
      const b = blockBounds(bi, bj);
      const district = districtOfBlock(bi, bj);
      const block = { bi, bj, ...b, district };
      plan.blocks.push(block);
      const landmark = landmarkAt.get(bi + ',' + bj);
      if (landmark) placeLandmark(plan, block, landmark, rng);
      else placeDistrictBlock(plan, block, rng);
      placeStreetFurniture(plan, block, rng);
    }
  }
  placeBeach(plan, rng);
  placeHarbor(plan, rng);
  return plan;
}

function addBuilding(plan, x, z, w, d, h, style, color, extra = {}) {
  const b = { x, z, w, d, h, style, color, ...extra };
  plan.buildings.push(b);
  return b;
}

function placeLandmark(plan, block, lm, rng) {
  const entry = { id: lm.id, name: lm.name, blip: lm.blip, door: { x: block.cx, z: block.z0 + 1.5 }, block };
  plan.landmarks[lm.id] = entry;
  if (lm.park) {
    plan.lawns.push({ x0: block.x0 + SIDEWALK, z0: block.z0 + SIDEWALK, x1: block.x1 - SIDEWALK, z1: block.z1 - SIDEWALK, color: 0x6fae4f });
    plan.props.push({ type: 'fountain', x: block.cx, z: block.cz, r: 5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 17 + rng.range(-2, 5);
      plan.palms.push({ x: block.cx + Math.cos(a) * r, z: block.cz + Math.sin(a) * r, s: rng.range(0.85, 1.2) });
    }
    entry.door = { x: block.cx, z: block.cz - 9 };
    return;
  }
  // The building sits back from the north street; the door marker is on the north sidewalk.
  const bz = block.z0 + 8 + lm.d / 2;
  const b = addBuilding(plan, block.cx, bz, lm.w, lm.d, lm.h, lm.style, lm.color, { landmark: lm.id });
  if (lm.sign) plan.signs.push({ text: lm.sign, color: lm.signColor, x: block.cx, z: block.z0 + 8 - 0.3, y: Math.min(lm.h - 1.5, 6.5), w: Math.min(lm.w - 4, lm.sign.length * 1.5 + 2), face: 'north' });
  if (lm.id === 'kane') {
    // A podium and a crown on the tallest tower in the city.
    addBuilding(plan, block.cx, block.z1 - 13, 52, 18, 14, 'glass', 0xc9d6df);
    plan.lawns.push({ x0: block.x0 + 6, z0: block.z0 + 4, x1: block.x1 - 6, z1: block.z0 + 7.5, color: 0x5d9e4a });
    entry.door = { x: block.cx, z: block.z0 + 4 };
  }
  if (lm.id === 'stash') {
    // An open yard of crates and containers around the shed: the shootout arena.
    entry.door = { x: block.cx, z: block.z0 + 1.5 };
    b.z = block.z1 - 12; // move shed to the back of the yard
    plan.signs.pop();
    const crates = [[-18, 14], [16, 16], [-6, 22], [20, 30], [-22, 32], [6, 36], [-12, 42], [14, 44]];
    for (const [cx, cz] of crates) plan.props.push({ type: 'crate', x: block.x0 + 32 + cx, z: block.z0 + cz, w: 3, d: 3, h: 2.2 });
    plan.props.push({ type: 'container', x: block.x0 + 10, z: block.z0 + 30, w: 3, d: 12, h: 3, color: 0xc0392b });
    plan.props.push({ type: 'container', x: block.x1 - 10, z: block.z0 + 34, w: 3, d: 12, h: 3, color: 0x2471a3 });
    plan.lots.push({ x0: block.x0 + 4, z0: block.z0 + 4, x1: block.x1 - 4, z1: block.z1 - 4, kind: 'gravel' });
  }
  if (lm.id === 'garage' || lm.id === 'spray' || lm.id === 'police' || lm.id === 'hospital') {
    // Rear lot with parked cars.
    const lot = { x0: block.x0 + 6, z0: block.z1 - 22, x1: block.x1 - 6, z1: block.z1 - 6, kind: 'asphalt' };
    if (lm.d + 8 < BLOCK - 26) { plan.lots.push(lot); addParkingRow(plan, lot, rng, lm.id === 'police' ? 'police' : null); }
  }
  if (lm.id === 'safehouse') {
    plan.lawns.push({ x0: block.x0 + SIDEWALK, z0: block.z0 + SIDEWALK, x1: block.x1 - SIDEWALK, z1: block.z1 - SIDEWALK, color: 0x79b85a });
    entry.door = { x: block.cx, z: block.z0 + 5 };
    plan.parking.push({ x: block.cx + 14, z: block.z0 + 10, yaw: 0, model: 'coupe' });
  }
}

function addParkingRow(plan, lot, rng, model) {
  const n = Math.floor((lot.x1 - lot.x0 - 4) / 4.2);
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.55)) continue;
    plan.parking.push({ x: lot.x0 + 4 + i * 4.2, z: (lot.z0 + lot.z1) / 2, yaw: rng.chance(0.5) ? 0 : Math.PI, model });
  }
}

/** Splits a block's buildable area into lots and raises a building on each. */
function placeDistrictBlock(plan, block, rng) {
  const inner = { x0: block.x0 + SIDEWALK + 1, z0: block.z0 + SIDEWALK + 1, x1: block.x1 - SIDEWALK - 1, z1: block.z1 - SIDEWALK - 1 };
  const w = inner.x1 - inner.x0;
  const d = block.district;
  if (d === 'heights') {
    plan.lawns.push({ x0: block.x0 + SIDEWALK, z0: block.z0 + SIDEWALK, x1: block.x1 - SIDEWALK, z1: block.z1 - SIDEWALK, color: 0x79b85a });
    for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 3; gz++) {
      if (gx === 1 && gz === 1) { plan.props.push({ type: 'pool', x: inner.x0 + w / 2, z: inner.z0 + w / 2, w: 9, d: 6 }); continue; }
      const cx = inner.x0 + (gx + 0.5) * (w / 3) + rng.range(-1, 1);
      const cz = inner.z0 + (gz + 0.5) * (w / 3) + rng.range(-1, 1);
      addBuilding(plan, cx, cz, rng.range(9, 12), rng.range(8, 11), rng.range(4, 6.5), 'house', rng.pick(HOUSE), { roof: 'pitched' });
      if (rng.chance(0.6)) plan.trees.push({ x: cx + rng.range(-7, 7), z: cz + (rng.chance(0.5) ? 7 : -7), s: rng.range(0.8, 1.3) });
    }
    return;
  }
  // Leave some blocks with a car park in one quadrant.
  const parkingQuadrant = (d === 'glasswater' || d === 'beach' || d === 'saltmarsh') && rng.chance(0.3) ? rng.int(0, 3) : -1;
  const splits = d === 'glasswater' ? (rng.chance(0.35) ? 1 : 2) : 2;
  const cell = w / splits;
  for (let gx = 0; gx < splits; gx++) {
    for (let gz = 0; gz < splits; gz++) {
      const lx0 = inner.x0 + gx * cell, lz0 = inner.z0 + gz * cell;
      const q = gx + gz * 2;
      if (q === parkingQuadrant) {
        const lot = { x0: lx0 + 1, z0: lz0 + 1, x1: lx0 + cell - 1, z1: lz0 + cell - 1, kind: 'asphalt' };
        plan.lots.push(lot);
        addParkingRow(plan, { x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z0 + 10 }, rng, null);
        addParkingRow(plan, { x0: lot.x0, z0: lot.z1 - 10, x1: lot.x1, z1: lot.z1 }, rng, null);
        continue;
      }
      const cx = lx0 + cell / 2, cz = lz0 + cell / 2;
      const margin = rng.range(1, 3);
      const bw = cell - margin * 2, bd = cell - margin * 2;
      if (d === 'glasswater') {
        const centre = 1 - Math.min(1, Math.hypot(block.bi - 5, block.bj - 4) / 5);
        const h = 24 + rng.range(10, 30) + centre * rng.range(30, 90);
        const tint = rng.pick(TOWER_TINTS);
        if (h > 55 && bw > 20) {
          addBuilding(plan, cx, cz, bw, bd, 12, 'concrete', rng.pick(CONCRETE));
          addBuilding(plan, cx, cz, bw * 0.7, bd * 0.7, h, 'glass', tint, { crown: rng.chance(0.5) });
        } else addBuilding(plan, cx, cz, bw, bd, h, rng.chance(0.6) ? 'glass' : 'concrete', rng.chance(0.6) ? tint : rng.pick(CONCRETE));
      } else if (d === 'beach') {
        const h = rng.range(10, 34);
        const b = addBuilding(plan, cx, cz, bw, bd, h, 'stucco', rng.pick(PASTELS), { deco: true });
        if (rng.chance(0.6)) {
          const facesEast = gx === splits - 1;
          const text = rng.pick(HOTEL_SIGNS);
          plan.signs.push(facesEast
            ? { text, color: rng.pick(['#ff4fa0', '#2de2c8', '#ffd25e', '#b06bff']), x: cx + bw / 2 + 0.3, z: cz, y: Math.min(h - 2, rng.range(6, 14)), w: text.length * 1.4 + 2, face: 'east' }
            : { text, color: rng.pick(['#ff4fa0', '#2de2c8', '#ffd25e', '#b06bff']), x: cx, z: cz - bd / 2 - 0.3, y: Math.min(h - 2, rng.range(6, 14)), w: text.length * 1.4 + 2, face: 'north' });
        }
        b.vertical = true;
      } else if (d === 'harbor') {
        addBuilding(plan, cx, cz, bw, bd, rng.range(8, 14), 'warehouse', rng.pick([0xb8a07a, 0x9aa5ad, 0xc98c5a, 0x8fa6a0]));
      } else {
        // Saltmarsh: low workshops with yards of trailers.
        if (rng.chance(0.35)) {
          plan.lots.push({ x0: lx0 + 1, z0: lz0 + 1, x1: lx0 + cell - 1, z1: lz0 + cell - 1, kind: 'gravel' });
          for (let t = 0; t < 3; t++) plan.props.push({ type: 'trailer', x: lx0 + 5 + t * 7, z: lz0 + cell / 2 + rng.range(-3, 3), w: 3.2, d: 10, h: 3, color: rng.pick([0xe8e2d0, 0xc8d6c0, 0xd6c6a8]) });
        } else addBuilding(plan, cx, cz, bw, bd, rng.range(5, 11), rng.chance(0.5) ? 'warehouse' : 'concrete', rng.pick([0xa59c8c, 0xc2b49a, 0x8f9a8a, 0xb5a28a]));
      }
    }
  }
}

/** Palms along the kerbs, street lamps at the corners. */
function placeStreetFurniture(plan, block, rng) {
  const palmy = block.district === 'beach' || block.district === 'glasswater' || block.district === 'park';
  for (const [cx, cz] of [[block.x0 + 1.4, block.z0 + 1.4], [block.x1 - 1.4, block.z0 + 1.4], [block.x0 + 1.4, block.z1 - 1.4], [block.x1 - 1.4, block.z1 - 1.4]]) {
    if (rng.chance(0.55)) plan.lamps.push({ x: cx, z: cz });
  }
  if (!palmy && block.district !== 'heights') return;
  const step = palmy ? 16 : 21;
  for (let t = step; t < BLOCK - 4; t += step) {
    for (const side of [0, 1, 2, 3]) {
      if (!rng.chance(palmy ? 0.8 : 0.45)) continue;
      const p = side === 0 ? { x: block.x0 + t, z: block.z0 + 1.6 } : side === 1 ? { x: block.x0 + t, z: block.z1 - 1.6 } : side === 2 ? { x: block.x0 + 1.6, z: block.z0 + t } : { x: block.x1 - 1.6, z: block.z0 + t };
      if (palmy) plan.palms.push({ ...p, s: rng.range(0.85, 1.25) });
      else plan.trees.push({ ...p, s: rng.range(0.7, 1.0) });
    }
  }
}

function placeBeach(plan, rng) {
  for (let z = 10; z < CITY_SIZE; z += rng.range(9, 16)) {
    if (Math.abs(z - PIER.z) < 12) continue;
    // The random numbers are drawn either way, so clearing a ramp's run-up does not reshuffle the beach.
    const palm = { x: CITY_SIZE + rng.range(6, 22), z, s: rng.range(1, 1.4), lean: rng.range(0.1, 0.35) };
    const umbrella = rng.chance(0.5) ? { type: 'umbrella', x: CITY_SIZE + rng.range(20, 30), z: z + rng.range(-3, 3), color: rng.pick([0xff4f7a, 0x2de2c8, 0xffd25e, 0xff8c42]) } : null;
    if (!nearRamp(palm.x, palm.z)) plan.palms.push(palm);
    if (umbrella && !nearRamp(umbrella.x, umbrella.z)) plan.props.push(umbrella);
  }
  plan.props.push({ type: 'lifeguard', x: CITY_SIZE + 30, z: 160 });
  plan.props.push({ type: 'lifeguard', x: CITY_SIZE + 30, z: 560 });
  plan.props.push({ type: 'wheel', x: PIER.x1 - 34, z: PIER.z - 2 });
}

function placeHarbor(plan, rng) {
  for (let x = 30; x < CITY_SIZE - 30; x += rng.range(26, 40)) {
    plan.props.push({ type: 'container', x, z: CITY_SIZE + 10, w: 12, d: 3, h: 3, color: rng.pick([0xc0392b, 0x2471a3, 0xd68910, 0x1e8449, 0x7d3c98]) });
    if (rng.chance(0.5)) plan.props.push({ type: 'container', x, z: CITY_SIZE + 10, w: 12, d: 3, h: 3, y: 3, color: rng.pick([0xc0392b, 0x2471a3, 0xd68910]) });
  }
  plan.props.push({ type: 'crane', x: 150, z: CITY_SIZE + 17 });
  plan.props.push({ type: 'crane', x: 470, z: CITY_SIZE + 17 });
}
