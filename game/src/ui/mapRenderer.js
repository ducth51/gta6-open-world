// Draws Palmera Bay as a 2D map once (water, beach, blocks by district, streets, buildings, pier),
// then reuses it for the rotating minimap and the full-screen map with blips and the GPS route.
import { CELL, CITY_SIZE, GRID, ROAD, OCEAN_X } from '../config.js';
import { PIER, QUAY_Z } from '../world/cityPlan.js';
import { nearestNode, nodePos } from '../ai/roadGraph.js';

export const MAP_X0 = -80, MAP_Z0 = -80, MAP_X1 = OCEAN_X + 140, MAP_Z1 = QUAY_Z + 90;
const PX = 1.5;

const DISTRICT_TINT = { glasswater: '#8f9bb0', beach: '#e7b4b8', harbor: '#a8957a', heights: '#9fc58f', saltmarsh: '#b8ad8f', park: '#7fbf6a' };

export const BLIP_STYLE = {
  mission: { color: '#ffd25e', letter: '!' }, target: { color: '#ff3b3b', letter: '' }, guns: { color: '#ff7a1a', letter: 'G' },
  spray: { color: '#2de2c8', letter: 'P' }, save: { color: '#5dff8a', letter: 'H' }, job: { color: '#ff7a1a', letter: 'C' },
  hospital: { color: '#ff5a5a', letter: '+' }, police: { color: '#4fa8ff', letter: '★' }, race: { color: '#b06bff', letter: 'R' },
  cop: { color: '#4f7cff', letter: '' }, enemy: { color: '#ff3b3b', letter: '' }, checkpoint: { color: '#ff4fa0', letter: '' },
  ramp: { color: '#ffffff', letter: 'J' }, property: { color: '#ffa63d', letter: '$' }, owned: { color: '#5dff8a', letter: '$' },
  event: { color: '#ff8a1a', letter: '?' }, car: { color: '#2de2c8', letter: 'C' }, waypoint: { color: '#ff4fa0', letter: '▼' },
  turf: { color: '#d93636', letter: 'T' }, turfOwned: { color: '#5dff8a', letter: 'T' }, mart: { color: '#ff3d8b', letter: 'M' },
};

export function renderCityImage(plan) {
  const c = document.createElement('canvas');
  c.width = Math.ceil((MAP_X1 - MAP_X0) * PX);
  c.height = Math.ceil((MAP_Z1 - MAP_Z0) * PX);
  const x = c.getContext('2d');
  const X = (v) => (v - MAP_X0) * PX, Z = (v) => (v - MAP_Z0) * PX;
  x.fillStyle = '#1f7f99'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#6f8a5a'; x.fillRect(0, 0, X(CITY_SIZE), Z(QUAY_Z));
  x.fillStyle = '#e9d3a0'; x.fillRect(X(CITY_SIZE), 0, X(CITY_SIZE + 38) - X(CITY_SIZE), Z(QUAY_Z));
  x.fillStyle = '#bdb6a8'; x.fillRect(0, Z(CITY_SIZE), X(CITY_SIZE + 6), Z(QUAY_Z) - Z(CITY_SIZE));
  x.fillStyle = '#9b7653'; x.fillRect(X(PIER.x0), Z(PIER.z - PIER.half), X(PIER.x1) - X(PIER.x0), PIER.half * 2 * PX);
  // Streets.
  x.fillStyle = '#3a3d44';
  for (let k = 0; k <= GRID; k++) {
    x.fillRect(X(k * CELL), Z(0), ROAD * PX, CITY_SIZE * PX);
    x.fillRect(X(0), Z(k * CELL), CITY_SIZE * PX, ROAD * PX);
  }
  for (const b of plan.blocks) {
    x.fillStyle = DISTRICT_TINT[b.district]; x.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * PX, (b.z1 - b.z0) * PX);
  }
  x.fillStyle = 'rgba(120,190,100,0.9)';
  for (const l of plan.lawns) x.fillRect(X(l.x0), Z(l.z0), (l.x1 - l.x0) * PX, (l.z1 - l.z0) * PX);
  for (const b of plan.buildings) {
    x.fillStyle = b.landmark ? '#f4efe4' : 'rgba(40,40,52,0.38)';
    x.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * PX, b.d * PX);
  }
  // Centre lines.
  x.strokeStyle = 'rgba(255,210,94,0.35)'; x.lineWidth = 1;
  for (let k = 0; k <= GRID; k++) {
    x.beginPath(); x.moveTo(X(k * CELL + ROAD / 2), Z(0)); x.lineTo(X(k * CELL + ROAD / 2), Z(CITY_SIZE)); x.stroke();
    x.beginPath(); x.moveTo(X(0), Z(k * CELL + ROAD / 2)); x.lineTo(X(CITY_SIZE), Z(k * CELL + ROAD / 2)); x.stroke();
  }
  return { canvas: c, scale: PX };
}

/** Road route from (ax, az) to (bx, bz) through junctions: along x first, then z. */
export function gpsRoute(ax, az, bx, bz) {
  const a = nearestNode(ax, az), b = nearestNode(bx, bz);
  const pts = [{ x: ax, z: az }];
  let i = a.i, j = a.j;
  pts.push(nodePos(i, j));
  // Go the long way first so the line follows real streets.
  while (i !== b.i) { i += Math.sign(b.i - i); }
  pts.push(nodePos(i, j));
  while (j !== b.j) { j += Math.sign(b.j - j); }
  pts.push(nodePos(i, j));
  pts.push({ x: bx, z: bz });
  return pts;
}

export function drawBlip(ctx, x, y, style, size = 7) {
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = style.color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke();
  if (style.letter) {
    ctx.fillStyle = '#111'; ctx.font = `bold ${size + 3}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(style.letter, x, y + 0.5);
  }
}
