// Static collision for the city: axis-aligned boxes (buildings, crates, trunks) in a spatial hash,
// with circle push-out for walkers and cars, and a 3D ray cast for bullets, sight lines and the camera.

const CELL = 16;

export class ColliderWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this._seen = 0;
  }

  /** Adds a box spanning [minX,maxX] x [0,h] x [minZ,maxZ]; `y0` lifts its floor. */
  addBox(minX, minZ, maxX, maxZ, h, y0 = 0, tag = 'building') {
    const box = { minX, minZ, maxX, maxZ, minY: y0, maxY: y0 + h, tag, mark: 0 };
    this.boxes.push(box);
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const key = gx * 4096 + gz;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  addCentered(x, z, w, d, h, y0 = 0, tag) { return this.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, y0, tag); }

  /** Calls fn for each distinct box overlapping the rectangle. */
  query(minX, minZ, maxX, maxZ, fn) {
    const mark = ++this._seen;
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const list = this.grid.get(gx * 4096 + gz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.mark === mark) continue;
          b.mark = mark;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          fn(b);
        }
      }
    }
  }

  /**
   * Pushes a circle (x, z, r) at height range [y, y+height] out of every box it overlaps.
   * Writes the corrected position into `out` and returns the deepest contact normal, or null.
   */
  resolveCircle(x, z, r, y, height, out) {
    let px = x, pz = z, hit = null, best = 0;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (y + height < b.minY || y > b.maxY - 0.05) return;
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      let dx = px - cx, dz = pz - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      let nx, nz, depth;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; depth = r - d;
      } else {
        // Centre inside the box: leave by the nearest face.
        const l = px - b.minX, rr = b.maxX - px, t = pz - b.minZ, bt = b.maxZ - pz;
        const m = Math.min(l, rr, t, bt);
        if (m === l) { nx = -1; nz = 0; depth = l + r; } else if (m === rr) { nx = 1; nz = 0; depth = rr + r; } else if (m === t) { nx = 0; nz = -1; depth = t + r; } else { nx = 0; nz = 1; depth = bt + r; }
      }
      px += nx * depth; pz += nz * depth;
      if (depth > best) { best = depth; hit = { nx, nz, depth, box: b }; }
    });
    out.x = px; out.z = pz;
    return hit;
  }

  /** Highest box top under (x, z) that is below `maxY` (for standing on crates); 0 when none. */
  floorAt(x, z, maxY) {
    let top = -Infinity;
    this.query(x, z, x, z, (b) => { if (b.maxY <= maxY && b.maxY > top && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) top = b.maxY; });
    return top;
  }

  /**
   * Ray from (ox,oy,oz) along unit (dx,dy,dz) up to maxDist. Returns the distance to the first
   * box hit, or Infinity. Walks the hash cells the ray crosses so long rays stay cheap.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    const mark = ++this._seen;
    const steps = Math.ceil(maxDist / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxDist, s * CELL * 0.5);
      if (t > best + CELL) break;
      const gx = Math.floor((ox + dx * t) / CELL), gz = Math.floor((oz + dz * t) / CELL);
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iz = gz - 1; iz <= gz + 1; iz++) {
        const list = this.grid.get(ix * 4096 + iz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.mark === mark) continue;
          b.mark = mark;
          const hit = rayBox(ox, oy, oz, dx, dy, dz, b);
          if (hit >= 0 && hit < best) best = hit;
        }
      }
    }
    return best < maxDist ? best : Infinity;
  }

  /** True when nothing solid stands between two points. */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) === Infinity;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Ray against a vertical capsule-ish cylinder (actors). Returns the hit distance or -1. */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  return y >= y0 && y <= y1 ? t : -1;
}
