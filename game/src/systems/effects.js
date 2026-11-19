// Visual effects: pooled particles (smoke, fire, sparks, dust, blood, water splash), bullet tracers,
// muzzle flashes and explosion light, each drawn in one call per pool.
import * as THREE from 'three';
import { softDotTexture } from '../world/textures.js';
import { rng } from '../util/mathx.js';

const VERT = `
attribute float size; attribute float alpha; attribute vec3 tint;
varying float vAlpha; varying vec3 vTint;
void main() {
  vAlpha = alpha; vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (520.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; varying float vAlpha; varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.items = [];
    this.free = [];
    for (let i = 0; i < max; i++) { this.items.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, r: 1, g: 1, b: 1, a: 1, drag: 0, lift: 0 }); this.free.push(i); }
    const geo = new THREE.BufferGeometry();
    this.posA = new Float32Array(max * 3);
    this.sizeA = new Float32Array(max);
    this.alphaA = new Float32Array(max);
    this.tintA = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizeA, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaA, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tintA, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(o) {
    const i = this.free.pop();
    if (i === undefined) return;
    Object.assign(this.items[i], { fadeIn: false, gravity: 0, lift: 0, drag: 0 }, o);
    this.items[i].life = o.max;
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { this.free.push(i); continue; }
      p.vy += (p.lift - 9.8 * p.gravity) * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.gravity) { p.y = 0.02; p.vy *= -0.3; }
      p.size += p.grow * dt;
      const t = p.life / p.max;
      this.posA[n * 3] = p.x; this.posA[n * 3 + 1] = p.y; this.posA[n * 3 + 2] = p.z;
      this.sizeA[n] = p.size;
      this.alphaA[n] = p.a * Math.min(1, t * 2.2) * (p.fadeIn ? Math.min(1, (1 - t) * 6) : 1);
      this.tintA[n * 3] = p.r; this.tintA[n * 3 + 1] = p.g; this.tintA[n * 3 + 2] = p.b;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'alpha', 'tint']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticlePool(scene, 1400, true);
    this.soft = new ParticlePool(scene, 1600, false);
    // Tracers: a pool of line segments that fade quickly.
    this.maxTracers = 64;
    this.tracerPos = new Float32Array(this.maxTracers * 6);
    this.tracerCol = new Float32Array(this.maxTracers * 6);
    this.tracers = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo = tg;
    const tl = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    tl.frustumCulled = false;
    scene.add(tl);
    // A few reusable flash lights for muzzle flashes and explosions.
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 18, 1.6);
      scene.add(l);
      this.lights.push({ light: l, t: 0, max: 1, peak: 0 });
    }
    this.flashIndex = 0;
  }

  flash(x, y, z, intensity, dist, time, color = 0xffb060) {
    const f = this.lights[this.flashIndex++ % this.lights.length];
    f.light.position.set(x, y, z);
    f.light.color.setHex(color);
    f.light.distance = dist;
    f.peak = intensity; f.t = time; f.max = time;
  }

  tracer(x0, y0, z0, x1, y1, z1, color = [1, 0.85, 0.5]) {
    this.tracers.push({ a: [x0, y0, z0], b: [x1, y1, z1], t: 0.07, c: color });
    if (this.tracers.length > this.maxTracers) this.tracers.shift();
  }

  muzzle(x, y, z) {
    for (let i = 0; i < 5; i++) this.add.spawn({ x, y, z, vx: rng.range(-1, 1), vy: rng.range(-1, 1), vz: rng.range(-1, 1), size: rng.range(0.3, 0.6), grow: -2, r: 1, g: 0.75, b: 0.3, a: 1, max: 0.06, drag: 0, lift: 0, gravity: 0 });
    this.flash(x, y, z, 6, 12, 0.06);
  }

  sparks(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) this.add.spawn({ x, y, z, vx: rng.range(-6, 6), vy: rng.range(1, 7), vz: rng.range(-6, 6), size: rng.range(0.08, 0.16), grow: 0, r: 1, g: 0.8, b: 0.35, a: 1, max: rng.range(0.25, 0.6), drag: 1.5, lift: 0, gravity: 1 });
  }

  dust(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) this.soft.spawn({ x, y, z, vx: rng.range(-1.5, 1.5), vy: rng.range(0.5, 2), vz: rng.range(-1.5, 1.5), size: rng.range(0.3, 0.6), grow: 1.2, r: 0.75, g: 0.7, b: 0.62, a: 0.6, max: rng.range(0.5, 0.9), drag: 2, lift: 0, gravity: 0 });
  }

  blood(x, y, z) {
    for (let i = 0; i < 8; i++) this.soft.spawn({ x, y, z, vx: rng.range(-2, 2), vy: rng.range(0, 3), vz: rng.range(-2, 2), size: rng.range(0.12, 0.25), grow: 0.2, r: 0.55, g: 0.02, b: 0.03, a: 0.9, max: 0.5, drag: 1, lift: 0, gravity: 1 });
  }

  splash(x, y, z) {
    for (let i = 0; i < 14; i++) this.soft.spawn({ x, y, z, vx: rng.range(-2, 2), vy: rng.range(2, 5), vz: rng.range(-2, 2), size: rng.range(0.2, 0.4), grow: 0.5, r: 0.85, g: 0.95, b: 1, a: 0.8, max: 0.7, drag: 0.5, lift: 0, gravity: 1 });
  }

  smoke(x, y, z, size = 1, shade = 0.4, tyre = false) {
    const c = shade;
    this.soft.spawn({ x: x + rng.range(-0.3, 0.3), y, z: z + rng.range(-0.3, 0.3), vx: rng.range(-0.6, 0.6), vy: tyre ? rng.range(0.2, 0.8) : rng.range(1.5, 3), vz: rng.range(-0.6, 0.6), size: size * rng.range(0.6, 1), grow: tyre ? 2.5 : 1.8, r: c, g: c, b: c * 1.02, a: tyre ? 0.45 : 0.55, max: rng.range(1.4, 2.4), drag: 0.6, lift: 0.3, gravity: 0, fadeIn: true });
  }

  fire(x, y, z) {
    this.add.spawn({ x: x + rng.range(-0.4, 0.4), y, z: z + rng.range(-0.4, 0.4), vx: rng.range(-0.4, 0.4), vy: rng.range(2, 4), vz: rng.range(-0.4, 0.4), size: rng.range(0.8, 1.4), grow: -0.8, r: 1, g: rng.range(0.35, 0.6), b: 0.1, a: 0.9, max: rng.range(0.35, 0.6), drag: 0.5, lift: 1, gravity: 0 });
  }

  explosion(x, y, z) {
    for (let i = 0; i < 60; i++) {
      const a = rng.range(0, Math.PI * 2), s = rng.range(3, 12);
      this.add.spawn({ x, y, z, vx: Math.cos(a) * s, vy: rng.range(2, 10), vz: Math.sin(a) * s, size: rng.range(1.2, 2.6), grow: -1.2, r: 1, g: rng.range(0.4, 0.75), b: 0.15, a: 1, max: rng.range(0.4, 0.9), drag: 3, lift: 2, gravity: 0 });
    }
    for (let i = 0; i < 30; i++) this.soft.spawn({ x: x + rng.range(-1, 1), y: y + rng.range(0, 2), z: z + rng.range(-1, 1), vx: rng.range(-3, 3), vy: rng.range(2, 6), vz: rng.range(-3, 3), size: rng.range(1.5, 3), grow: 3, r: 0.18, g: 0.17, b: 0.16, a: 0.7, max: rng.range(2, 3.5), drag: 1.2, lift: 0.6, gravity: 0, fadeIn: true });
    this.sparks(x, y, z, 30);
    this.flash(x, y + 1, z, 60, 45, 0.5, 0xff8a3a);
  }

  update(dt) {
    this.add.update(dt);
    this.soft.update(dt);
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      if (t.t <= 0) { this.tracers.splice(i, 1); continue; }
    }
    for (const t of this.tracers) {
      const k = t.t / 0.07;
      this.tracerPos.set(t.a, n * 6); this.tracerPos.set(t.b, n * 6 + 3);
      this.tracerCol.set([t.c[0] * k * 0.3, t.c[1] * k * 0.3, t.c[2] * k * 0.3, t.c[0] * k, t.c[1] * k, t.c[2] * k], n * 6);
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
    for (const f of this.lights) {
      if (f.t > 0) { f.t -= dt; f.light.intensity = f.peak * Math.max(0, f.t / f.max) * 10; } else f.light.intensity = 0;
    }
  }
}
