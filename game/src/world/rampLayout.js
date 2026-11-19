// Where the stunt ramps stand and how high they are under a wheel. Pure data and arithmetic with no
// meshes, so the city plan (which clears props from their path), the cars (which climb them) and the
// stunt system (which scores the jumps) can all read it without importing each other.
import { CITY_SIZE, CELL, ROAD } from '../config.js';

export const RAMP_LEN = 12;
export const RAMP_WIDTH = 6.4;
export const RAMP_RISE = 3.2;

const EAST = Math.PI / 2;
const SOUTH = 0;
const NORTH = Math.PI;
/** The dry sand runs about 35 m east of the city; beach ramps point along it so the jump lands on sand, not in the sea. */
const SAND_X = CITY_SIZE + 24;

/**
 * (x, z) is the middle of the ramp's low edge; yaw is the direction a car climbs it. Each one sits
 * in the right-hand lane of its street, between two junctions, or on the open sand of the beach.
 */
export const RAMPS = [
  { id: 'dune-north', name: 'Dune Kicker', x: SAND_X, z: 60, yaw: SOUTH },
  { id: 'pelican', name: 'Pelican Hop', x: SAND_X, z: 250, yaw: NORTH },
  { id: 'lifeguard', name: 'Lifeguard Launch', x: SAND_X, z: 450, yaw: SOUTH },
  { id: 'southsands', name: 'South Sands Sender', x: SAND_X, z: 700, yaw: NORTH },
  { id: 'harbor-a', name: 'Dockside Dash', x: 6 * CELL + ROAD / 2 - 4, z: 8 * CELL + ROAD + 10, yaw: 0 },
  { id: 'harbor-b', name: 'Crane Alley Jump', x: 2 * CELL + ROAD / 2 + 4, z: 9 * CELL - 14, yaw: Math.PI },
  { id: 'saltmarsh', name: 'Saltmarsh Skip', x: ROAD + 6, z: 5 * CELL + ROAD / 2 + 4, yaw: EAST },
  { id: 'glass-row', name: 'Glass Row Leap', x: 3 * CELL + ROAD + 6, z: 3 * CELL + ROAD / 2 + 4, yaw: EAST },
];

/** Extra height under (x, z) from any ramp; 0 when no ramp is there. */
export function rampHeightAt(x, z) {
  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i];
    const dx = x - r.x, dz = z - r.z;
    if (Math.abs(dx) > RAMP_LEN + 2 || Math.abs(dz) > RAMP_LEN + 2) continue;
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
    const u = dx * fx + dz * fz;
    if (u < 0 || u > RAMP_LEN) continue;
    const s = Math.abs(dx * fz - dz * fx);
    if (s < RAMP_WIDTH / 2) return (RAMP_RISE * u) / RAMP_LEN;
  }
  return 0;
}

/** The point at the top of a ramp, where cars leave it. */
export function rampTop(r) {
  return { x: r.x + Math.sin(r.yaw) * RAMP_LEN, z: r.z + Math.cos(r.yaw) * RAMP_LEN };
}

/** True when (x, z) is on a ramp or in the run-up and landing area `pad` metres around it. */
export function nearRamp(x, z, pad = 9) {
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
    const u = dx * fx + dz * fz;
    const s = Math.abs(dx * fz - dz * fx);
    if (u > -pad * 2 && u < RAMP_LEN + pad * 4 && s < RAMP_WIDTH / 2 + pad) return true;
  }
  return false;
}
