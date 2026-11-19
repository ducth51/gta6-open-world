// The street grid as a graph: intersections are nodes, streets are edges with one lane each way.
// Gives lane-following waypoints (keep right, turn through the junction) and greedy routing.
import { CELL, GRID, ROAD, LANE_OFFSET } from '../config.js';
import { clamp } from '../util/mathx.js';

export function nodePos(i, j) { return { x: i * CELL + ROAD / 2, z: j * CELL + ROAD / 2 }; }

export function nearestNode(x, z) {
  return { i: clamp(Math.round((x - ROAD / 2) / CELL), 0, GRID), j: clamp(Math.round((z - ROAD / 2) / CELL), 0, GRID) };
}

export function neighbors(n) {
  const out = [];
  if (n.i > 0) out.push({ i: n.i - 1, j: n.j });
  if (n.i < GRID) out.push({ i: n.i + 1, j: n.j });
  if (n.j > 0) out.push({ i: n.i, j: n.j - 1 });
  if (n.j < GRID) out.push({ i: n.i, j: n.j + 1 });
  return out;
}

export const sameNode = (a, b) => a.i === b.i && a.j === b.j;

/** Unit direction from node a to neighbouring node b. */
export function edgeDir(a, b) { return { x: Math.sign(b.i - a.i), z: Math.sign(b.j - a.j) }; }

/** Right-hand side of a direction (for a model facing +z, right is -x). */
export function rightOf(d) { return { x: -d.z, z: d.x }; }

/** Where a car leaves junction a toward b, and where it arrives at b, in the right-hand lane. */
export function laneSegment(a, b) {
  const pa = nodePos(a.i, a.j), pb = nodePos(b.i, b.j);
  const d = edgeDir(a, b), r = rightOf(d);
  const inset = ROAD / 2 + 2;
  return {
    start: { x: pa.x + d.x * inset + r.x * LANE_OFFSET, z: pa.z + d.z * inset + r.z * LANE_OFFSET },
    end: { x: pb.x - d.x * inset + r.x * LANE_OFFSET, z: pb.z - d.z * inset + r.z * LANE_OFFSET },
    dir: d,
  };
}

/** Corner point inside junction b when turning from a->b onto b->c; null when going straight. */
export function turnPoint(a, b, c) {
  const d1 = edgeDir(a, b), d2 = edgeDir(b, c);
  if (d1.x === d2.x && d1.z === d2.z) return null;
  const pb = nodePos(b.i, b.j), r1 = rightOf(d1), r2 = rightOf(d2);
  return { x: pb.x + (r1.x + r2.x) * LANE_OFFSET, z: pb.z + (r1.z + r2.z) * LANE_OFFSET, turn: true };
}

/** Next node from b (having come from a): random, avoiding U-turns unless it is a dead end. */
export function randomNext(a, b, rng) {
  const options = neighbors(b).filter((n) => !sameNode(n, a));
  return options.length ? rng.pick(options) : a;
}

/** Next node from b that most reduces the distance to (tx, tz); `away` maximises it instead. */
export function steerNext(a, b, tx, tz, away = false) {
  let best = null, bestScore = Infinity;
  for (const n of neighbors(b)) {
    const p = nodePos(n.i, n.j);
    let score = Math.hypot(p.x - tx, p.z - tz);
    if (away) score = -score;
    if (a && sameNode(n, a)) score += 60;
    score += Math.random() * 8;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}
