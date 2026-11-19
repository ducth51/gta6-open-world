// Accumulates boxes, quads, prisms and transformed geometries into one BufferGeometry with
// vertex colours and metre-scaled UVs, so the whole city draws in a handful of calls.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.count = 0;
  }

  /** One quad from origin o along u and v; normal = u x v. uv: [u0, v0, u1, v1]. */
  face(ox, oy, oz, ux, uy, uz, vx, vy, vz, color, uv = [0, 0, 1, 1]) {
    _n.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx).normalize();
    const c = colorOf(color);
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const [a, b] of corners) {
      this.pos.push(ox + ux * a + vx * b, oy + uy * a + vy * b, oz + uz * a + vz * b);
      this.nor.push(_n.x, _n.y, _n.z);
      this.uv.push(uv[0] + (uv[2] - uv[0]) * a, uv[1] + (uv[3] - uv[1]) * b);
      this.col.push(c.r, c.g, c.b);
    }
    const i = this.count;
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.count += 4;
  }

  tri(a, b, c, color) {
    _n.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(_v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    const col = colorOf(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(_n.x, _n.y, _n.z); this.uv.push(0, 0); this.col.push(col.r, col.g, col.b);
    }
    this.idx.push(this.count, this.count + 1, this.count + 2);
    this.count += 3;
  }

  /**
   * Box standing on y0, centred on (cx, cz). opts: uScale/vScale (metres per texture repeat),
   * uOff/vOff, top (default true), sides (default true), topColor.
   */
  box(cx, y0, cz, w, h, d, color, opts = {}) {
    const hw = w / 2, hd = d / 2;
    const us = opts.uScale ?? w, vs = opts.vScale ?? h, uo = opts.uOff ?? 0, vo = opts.vOff ?? 0;
    if (opts.sides !== false) {
      const vt = vo + h / vs;
      this.face(cx - hw, y0, cz + hd, w, 0, 0, 0, h, 0, color, [uo, vo, uo + w / us, vt]);
      this.face(cx + hw, y0, cz - hd, -w, 0, 0, 0, h, 0, color, [uo + 0.37, vo, uo + 0.37 + w / us, vt]);
      this.face(cx + hw, y0, cz + hd, 0, 0, -d, 0, h, 0, color, [uo + 0.61, vo, uo + 0.61 + d / us, vt]);
      this.face(cx - hw, y0, cz - hd, 0, 0, d, 0, h, 0, color, [uo + 0.13, vo, uo + 0.13 + d / us, vt]);
    }
    if (opts.top !== false) this.face(cx - hw, y0 + h, cz + hd, w, 0, 0, 0, 0, -d, opts.topColor ?? color, [0, 0, w / (opts.topScale ?? w), d / (opts.topScale ?? d)]);
  }

  /** Flat horizontal rectangle at height y with UVs in metres / scale. */
  flat(x0, z0, x1, z1, y, color, scale = 1, rotateUv = false) {
    const w = x1 - x0, d = z1 - z0;
    if (rotateUv) this.face(x0, y, z1, w, 0, 0, 0, 0, -d, color, [0, 0, w / scale, d / scale]);
    else this.face(x0, y, z1, w, 0, 0, 0, 0, -d, color, [0, 0, w / scale, d / scale]);
  }

  /** Gabled roof over a w x d footprint with its ridge along the longer side. */
  gable(cx, y0, cz, w, d, rise, color) {
    const hw = w / 2, hd = d / 2;
    if (w >= d) {
      const r = [cx - hw, y0 + rise, cz], r2 = [cx + hw, y0 + rise, cz];
      this.tri([cx - hw, y0, cz + hd], [cx + hw, y0, cz + hd], r2, color); this.tri([cx - hw, y0, cz + hd], r2, r, color);
      this.tri([cx + hw, y0, cz - hd], [cx - hw, y0, cz - hd], r, color); this.tri([cx + hw, y0, cz - hd], r, r2, color);
      this.tri([cx - hw, y0, cz - hd], [cx - hw, y0, cz + hd], r, color);
      this.tri([cx + hw, y0, cz + hd], [cx + hw, y0, cz - hd], r2, color);
    } else {
      const r = [cx, y0 + rise, cz - hd], r2 = [cx, y0 + rise, cz + hd];
      this.tri([cx + hw, y0, cz + hd], [cx + hw, y0, cz - hd], r, color); this.tri([cx + hw, y0, cz + hd], r, r2, color);
      this.tri([cx - hw, y0, cz - hd], [cx - hw, y0, cz + hd], r2, color); this.tri([cx - hw, y0, cz - hd], r2, r, color);
      this.tri([cx + hw, y0, cz - hd], [cx - hw, y0, cz - hd], r, color);
      this.tri([cx - hw, y0, cz + hd], [cx + hw, y0, cz + hd], r2, color);
    }
  }

  /** Appends a three.js geometry transformed by a Matrix4, painted one colour. */
  geometry(geom, matrix, color) {
    const p = geom.attributes.position, n = geom.attributes.normal, uv = geom.attributes.uv;
    const c = colorOf(color);
    _m3.getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.col.push(c.r, c.g, c.b);
    }
    if (geom.index) for (let i = 0; i < geom.index.count; i++) this.idx.push(base + geom.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.count += p.count;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const _colors = new Map();
function colorOf(hex) {
  let c = _colors.get(hex);
  if (!c) { c = new THREE.Color(hex); _colors.set(hex, c); }
  return c;
}
