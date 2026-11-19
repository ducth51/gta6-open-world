// Turns the city plan into meshes and colliders: streets, sidewalks, lawns, merged buildings per
// facade style, neon signs, palms and lamps as instanced meshes, the beach, the ocean, the harbour
// cranes and the Sunwheel on the pier.
import * as THREE from 'three';
import { CELL, CITY_SIZE, GRID, ROAD, OCEAN_X } from '../config.js';
import { MeshBuilder } from './meshBuilder.js';
import { facadeTextures, FACADE_SCALE, roadTexture, crossingTexture, sidewalkTexture, groundTexture, signTexture } from './textures.js';
import { PIER, QUAY_Z, WATER_LEVEL, groundHeight } from './cityPlan.js';
import { makeRng } from '../util/mathx.js';

const CURB = 0.18;

export function buildCityMeshes(plan, colliders) {
  const group = new THREE.Group();
  group.name = 'city';
  const nightMaterials = [];
  const animated = [];
  const rng = makeRng(99);

  const add = (geom, mat, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    group.add(m);
    return m;
  };

  // ---- Ground, quay, beach and ocean ----
  const grassTex = groundTexture('grass'); grassTex.repeat.set(1, 1);
  const ground = new MeshBuilder();
  ground.flat(-600, -600, CITY_SIZE, QUAY_Z, -0.02, 0x8d9a62, 12);
  add(ground.build(), new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 1 }));

  const quay = new MeshBuilder();
  quay.flat(-600, CITY_SIZE, CITY_SIZE + 6, QUAY_Z, 0.0, 0xbfb8aa, 4);
  quay.box(CITY_SIZE / 2 - 300, -3, QUAY_Z - 0.5, CITY_SIZE + 612, 3, 1, 0x9a9488, { top: false });
  add(quay.build(), new THREE.MeshStandardMaterial({ map: sidewalkTexture(), vertexColors: true, roughness: 0.95 }));

  const sandGeom = new THREE.PlaneGeometry(OCEAN_X + 60 - CITY_SIZE, QUAY_Z + 600, 24, 1);
  sandGeom.rotateX(-Math.PI / 2);
  sandGeom.translate((CITY_SIZE + OCEAN_X + 60) / 2, 0, (QUAY_Z - 600) / 2);
  const sp = sandGeom.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, groundHeight(sp.getX(i), -999) - 0.01);
  sandGeom.computeVertexNormals();
  const sandTex = groundTexture('sand'); sandTex.repeat.set(10, 60);
  add(sandGeom, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));

  const waterGeom = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  waterGeom.rotateX(-Math.PI / 2);
  const water = add(waterGeom, new THREE.MeshStandardMaterial({ color: 0x1b8fa6, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.92 }));
  water.position.set(CITY_SIZE, WATER_LEVEL, CITY_SIZE);
  const foamGeom = new THREE.PlaneGeometry(8, QUAY_Z + 600);
  foamGeom.rotateX(-Math.PI / 2);
  const foam = add(foamGeom, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  foam.position.set(CITY_SIZE + 35, WATER_LEVEL + 0.03, (QUAY_Z - 600) / 2);
  animated.push((t) => { foam.material.opacity = 0.25 + Math.sin(t * 0.9) * 0.12; foam.position.x = CITY_SIZE + 34 + Math.sin(t * 0.6) * 1.5; });

  // ---- Streets ----
  const roads = new MeshBuilder(), crossings = new MeshBuilder();
  for (let k = 0; k <= GRID; k++) {
    for (let i = 0; i < GRID; i++) {
      const a = i * CELL + ROAD, len = CELL - ROAD;
      roads.face(a, 0.01, k * CELL + ROAD, len, 0, 0, 0, 0, -ROAD, 0xffffff, [0, 0, len / ROAD, 1]);
      roads.face(k * CELL, 0.01, a, 0, 0, len, ROAD, 0, 0, 0xffffff, [0, 0, len / ROAD, 1]);
    }
    for (let j = 0; j <= GRID; j++) crossings.flat(k * CELL, j * CELL, k * CELL + ROAD, j * CELL + ROAD, 0.012, 0xffffff, ROAD);
  }
  add(roads.build(), new THREE.MeshStandardMaterial({ map: roadTexture(), vertexColors: true, roughness: 0.92 }));
  add(crossings.build(), new THREE.MeshStandardMaterial({ map: crossingTexture(), vertexColors: true, roughness: 0.92 }));

  // ---- Sidewalks, lawns and lots ----
  const walks = new MeshBuilder();
  for (const b of plan.blocks) walks.box(b.cx, 0, b.cz, b.x1 - b.x0, CURB, b.z1 - b.z0, 0xffffff, { uScale: 4, vScale: 4, topScale: 4 });
  add(walks.build(), new THREE.MeshStandardMaterial({ map: sidewalkTexture(), vertexColors: true, roughness: 0.95 }));
  const lawns = new MeshBuilder();
  for (const l of plan.lawns) lawns.flat(l.x0, l.z0, l.x1, l.z1, CURB + 0.02, l.color, 10);
  add(lawns.build(), new THREE.MeshStandardMaterial({ map: groundTexture('grass'), vertexColors: true, roughness: 1 }));
  const lotA = new MeshBuilder(), lotG = new MeshBuilder();
  for (const l of plan.lots) (l.kind === 'gravel' ? lotG : lotA).flat(l.x0, l.z0, l.x1, l.z1, CURB + 0.015, 0xffffff, l.kind === 'gravel' ? 8 : 16);
  add(lotA.build(), new THREE.MeshStandardMaterial({ map: groundTexture('asphalt'), vertexColors: true, roughness: 0.9 }));
  add(lotG.build(), new THREE.MeshStandardMaterial({ map: groundTexture('gravel'), vertexColors: true, roughness: 1 }));

  // ---- Buildings ----
  const walls = {};
  for (const style of Object.keys(FACADE_SCALE)) walls[style] = new MeshBuilder();
  const roofs = new MeshBuilder();
  for (const b of plan.buildings) {
    const s = FACADE_SCALE[b.style];
    const y0 = CURB;
    walls[b.style].box(b.x, y0, b.z, b.w, b.h, b.d, b.color, { uScale: s.cols * s.cellW, vScale: s.rows * s.cellH, uOff: rng.next(), top: false });
    colliders.addCentered(b.x, b.z, b.w, b.d, b.h + y0);
    const top = y0 + b.h;
    const roofColor = b.style === 'glass' ? 0x5d6670 : b.style === 'house' ? 0xc0573e : 0x8c8780;
    if (b.roof === 'pitched') {
      roofs.box(b.x, top, b.z, b.w + 0.6, 0.25, b.d + 0.6, 0xe9e4da);
      roofs.gable(b.x, top + 0.25, b.z, b.w + 0.6, b.d + 0.6, Math.min(b.w, b.d) * 0.32, roofColor);
      continue;
    }
    roofs.box(b.x, top, b.z, b.w, 0.12, b.d, roofColor);
    // Parapet band.
    const band = b.deco ? shade(b.color, 0.82) : shade(b.color, 0.7);
    roofs.box(b.x, top, b.z - b.d / 2 + 0.2, b.w, 1.0, 0.4, band, {});
    roofs.box(b.x, top, b.z + b.d / 2 - 0.2, b.w, 1.0, 0.4, band, {});
    roofs.box(b.x - b.w / 2 + 0.2, top, b.z, 0.4, 1.0, b.d, band, {});
    roofs.box(b.x + b.w / 2 - 0.2, top, b.z, 0.4, 1.0, b.d, band, {});
    if (b.deco) {
      // Art-deco fin and a horizontal stripe on the pastel hotels.
      roofs.box(b.x, y0, b.z - b.d / 2 - 0.25, 2.2, b.h + 3, 0.5, 0xfdf6ea);
      roofs.box(b.x, y0 + 3.6, b.z - b.d / 2 - 0.1, b.w, 0.4, 0.2, shade(b.color, 0.75));
    }
    if (b.crown) {
      roofs.box(b.x, top, b.z, b.w * 0.6, 6, b.d * 0.6, shade(b.color, 0.9));
      roofs.box(b.x, top + 6, b.z, 0.4, 12, 0.4, 0xdddddd);
    }
    // Rooftop clutter: air-con boxes and water tanks.
    const units = Math.floor((b.w * b.d) / 160);
    for (let u = 0; u < Math.min(units, 5); u++) {
      roofs.box(b.x + rng.range(-b.w / 3, b.w / 3), top, b.z + rng.range(-b.d / 3, b.d / 3), rng.range(1.5, 3), rng.range(1, 2), rng.range(1.5, 3), 0xb5b2aa);
    }
    if (b.style === 'concrete' && b.h > 14 && rng.chance(0.5)) {
      const tx = b.x + b.w / 4, tz = b.z - b.d / 4;
      roofs.geometry(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10), new THREE.Matrix4().makeTranslation(tx, top + 3.2, tz), 0x7a5a3a);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) roofs.box(tx + lx, top, tz + lz, 0.2, 1.9, 0.2, 0x555555);
    }
  }
  for (const [style, builder] of Object.entries(walls)) {
    if (!builder.count) continue;
    const tex = facadeTextures(style);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
      roughness: style === 'glass' ? 0.25 : 0.85, metalness: style === 'glass' ? 0.45 : 0.02,
    });
    nightMaterials.push(mat);
    add(builder.build(), mat, { cast: true });
  }

  // ---- Props: crates, containers, trailers, pools, beach and harbour pieces ----
  for (const p of plan.props) buildProp(p, roofs, colliders, group, animated, rng);
  add(roofs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), { cast: true });

  // ---- Pier ----
  const pier = new MeshBuilder();
  pier.box((PIER.x0 + PIER.x1) / 2, PIER.deck - 0.4, PIER.z, PIER.x1 - PIER.x0, 0.4, PIER.half * 2, 0x9b7653, { topScale: 2 });
  for (let x = PIER.x0 + 4; x < PIER.x1; x += 8) for (const s of [-1, 1]) pier.box(x, -3, PIER.z + s * (PIER.half - 0.4), 0.5, 3.4, 0.5, 0x6b4f37);
  for (let x = PIER.x0; x < PIER.x1; x += 2.5) for (const s of [-1, 1]) pier.box(x, PIER.deck, PIER.z + s * (PIER.half - 0.15), 0.15, 1.0, 0.15, 0xefe6d6);
  pier.box((PIER.x0 + PIER.x1) / 2, PIER.deck + 0.95, PIER.z - PIER.half + 0.15, PIER.x1 - PIER.x0, 0.1, 0.2, 0xefe6d6);
  pier.box((PIER.x0 + PIER.x1) / 2, PIER.deck + 0.95, PIER.z + PIER.half - 0.15, PIER.x1 - PIER.x0, 0.1, 0.2, 0xefe6d6);
  add(pier.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { cast: true });

  // ---- Neon signs ----
  for (const s of plan.signs) {
    const tex = signTexture(s.text, s.color);
    const h = s.w * (96 / 512);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(s.w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.92, h * 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.6 }));
    const holder = new THREE.Group();
    holder.add(back); holder.add(board);
    board.position.z = 0.06;
    holder.position.set(s.x, s.y + CURB, s.z);
    holder.rotation.y = s.face === 'north' ? Math.PI : s.face === 'east' ? Math.PI / 2 : 0;
    group.add(holder);
  }

  // ---- Palms, trees, lamps (instanced) ----
  buildPalms(plan.palms, group, colliders);
  buildTrees(plan.trees, group, colliders);
  const lampHeads = buildLamps(plan.lamps, group, colliders);
  nightMaterials.push(lampHeads);

  // ---- Distant hills to close the western and northern horizon ----
  const hills = new MeshBuilder();
  const hr = makeRng(5);
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * 0.45 + (i / 40) * Math.PI * 1.15;
    const r = 1300 + hr.range(-100, 200);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(CITY_SIZE / 2 + Math.cos(a) * r, -5, CITY_SIZE / 2 - Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(hr.range(160, 300), hr.range(60, 150), hr.range(160, 300)));
    hills.geometry(new THREE.ConeGeometry(1, 1, 7, 1), m.multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0)), 0x6d8a6a);
  }
  add(hills.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), { receive: false });

  // World edge: invisible walls are in clampToWorld; a low sea wall marks the quay edge.
  colliders.addBox(-600, QUAY_Z - 1, CITY_SIZE + 6, QUAY_Z + 1, 1.2, 0, 'wall');

  return {
    group,
    water,
    update(time, night) {
      for (const m of nightMaterials) m.emissiveIntensity = m === lampHeads ? 0.4 + night * 2.6 : night * 1.15;
      for (const fn of animated) fn(time);
    },
  };
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(f).getHex();
}

function buildProp(p, mb, colliders, group, animated, rng) {
  const y0 = (p.x > CITY_SIZE || p.z > CITY_SIZE) ? (p.z > CITY_SIZE ? 0 : groundHeight(p.x, p.z)) : CURB;
  switch (p.type) {
    case 'crate':
      mb.box(p.x, y0, p.z, p.w, p.h, p.d, 0xa77b45);
      mb.box(p.x, y0 + p.h * 0.45, p.z, p.w + 0.05, 0.25, p.d + 0.05, 0x6e4f2a);
      colliders.addCentered(p.x, p.z, p.w, p.d, p.h + y0, 0, 'crate');
      break;
    case 'container':
    case 'trailer': {
      const y = y0 + (p.y ?? 0);
      mb.box(p.x, y, p.z, p.w, p.h, p.d, p.color);
      const ribs = Math.floor(Math.max(p.w, p.d) / 1.2);
      for (let i = 0; i < ribs; i++) {
        const t = -0.5 + (i + 0.5) / ribs;
        if (p.w > p.d) mb.box(p.x + t * p.w, y + 0.1, p.z, 0.12, p.h - 0.2, p.d + 0.08, shade(p.color, 0.8), { top: false });
        else mb.box(p.x, y + 0.1, p.z + t * p.d, p.w + 0.08, p.h - 0.2, 0.12, shade(p.color, 0.8), { top: false });
      }
      colliders.addCentered(p.x, p.z, p.w, p.d, p.h, y, p.type);
      break;
    }
    case 'pool':
      mb.box(p.x, y0, p.z, p.w + 1, 0.1, p.d + 1, 0xf2efe6);
      mb.box(p.x, y0 + 0.02, p.z, p.w, 0.1, p.d, 0x3fc7e8);
      break;
    case 'fountain': {
      mb.geometry(new THREE.CylinderGeometry(p.r, p.r + 0.3, 0.8, 24), new THREE.Matrix4().makeTranslation(p.x, y0 + 0.4, p.z), 0xe9e1d0);
      mb.geometry(new THREE.CylinderGeometry(p.r - 0.4, p.r - 0.4, 0.1, 24), new THREE.Matrix4().makeTranslation(p.x, y0 + 0.78, p.z), 0x46c6e0);
      mb.geometry(new THREE.CylinderGeometry(0.5, 0.8, 2.6, 10), new THREE.Matrix4().makeTranslation(p.x, y0 + 1.3, p.z), 0xe9e1d0);
      mb.geometry(new THREE.CylinderGeometry(1.6, 1.2, 0.3, 16), new THREE.Matrix4().makeTranslation(p.x, y0 + 2.6, p.z), 0xe9e1d0);
      colliders.addCentered(p.x, p.z, p.r * 1.8, p.r * 1.8, 1.0, 0, 'fountain');
      const spray = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8f4ff, transparent: true, opacity: 0.45, depthWrite: false }));
      spray.position.set(p.x, y0 + 3.9, p.z);
      spray.rotation.x = Math.PI;
      group.add(spray);
      animated.push((t) => { spray.scale.set(1 + Math.sin(t * 6) * 0.05, 1 + Math.sin(t * 4.3) * 0.08, 1 + Math.cos(t * 6) * 0.05); });
      break;
    }
    case 'umbrella': {
      mb.box(p.x, y0, p.z, 0.08, 2.4, 0.08, 0xffffff);
      mb.geometry(new THREE.ConeGeometry(1.6, 0.6, 8), new THREE.Matrix4().makeTranslation(p.x, y0 + 2.5, p.z), p.color);
      mb.box(p.x + 1.2, y0, p.z + 0.4, 0.8, 0.12, 1.9, 0xffffff);
      break;
    }
    case 'lifeguard': {
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.box(p.x + lx, y0 - 0.5, p.z + lz, 0.2, 3.5, 0.2, 0xffffff);
      mb.box(p.x, y0 + 3, p.z, 3, 2.2, 3, 0xff6f61);
      mb.gable(p.x, y0 + 5.2, p.z, 3.6, 3.6, 1.0, 0x2de2c8);
      colliders.addCentered(p.x, p.z, 2.4, 2.4, 6, y0, 'tower');
      break;
    }
    case 'crane': {
      const c = 0xf2b134;
      for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) mb.box(p.x + lx, 0, p.z + lz, 0.8, 26, 0.8, c);
      mb.box(p.x, 26, p.z, 9, 2, 7, c);
      mb.box(p.x, 28, p.z + 14, 2, 2, 50, c);
      mb.box(p.x, 28, p.z - 14, 2, 2, 22, c);
      mb.box(p.x, 30, p.z - 2, 4, 4, 4, 0xd8d8d8);
      colliders.addCentered(p.x - 4, p.z - 3, 0.8, 0.8, 26, 0, 'crane');
      colliders.addCentered(p.x + 4, p.z - 3, 0.8, 0.8, 26, 0, 'crane');
      break;
    }
    case 'wheel': {
      // The Sunwheel: a lit Ferris wheel at the end of the pier.
      const wheel = new THREE.Group();
      const R = 22;
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff4fa0, emissiveIntensity: 0.6, roughness: 0.5 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 6, 48), mat);
      wheel.add(rim);
      const rim2 = rim.clone(); rim2.position.z = 2.2; wheel.add(rim2);
      const spokeGeo = new THREE.BoxGeometry(0.2, R * 2, 0.2);
      const cabinGeo = new THREE.BoxGeometry(2, 2.2, 2);
      const cabinMats = [0xff4fa0, 0x2de2c8, 0xffd25e, 0xb06bff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      const cabins = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        const spoke = new THREE.Mesh(spokeGeo, mat); spoke.rotation.z = a; spoke.position.z = 1.1; wheel.add(spoke);
        const cab = new THREE.Mesh(cabinGeo, cabinMats[i % 4]);
        cabins.push({ mesh: cab, a: (i / 12) * Math.PI * 2 });
        group.add(cab);
      }
      const holder = new THREE.Group();
      holder.position.set(p.x, PIER.deck + R + 3, p.z);
      holder.rotation.y = Math.PI / 2;
      holder.add(wheel);
      group.add(holder);
      const legGeo = new THREE.BoxGeometry(0.8, R + 5, 0.8);
      for (const s of [-1, 1]) for (const zs of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0xdedede }));
        leg.position.set(p.x + zs * 1.6, PIER.deck + (R + 3) / 2, p.z + s * 5);
        leg.rotation.x = s * 0.18;
        group.add(leg);
      }
      const tmp = new THREE.Vector3();
      animated.push((t) => {
        wheel.rotation.z = t * 0.05;
        for (const c of cabins) {
          const a = c.a + t * 0.05;
          tmp.set(Math.cos(a) * R, Math.sin(a) * R - 1.2, 1.1);
          wheel.localToWorld(tmp);
          c.mesh.position.copy(tmp);
        }
      });
      colliders.addCentered(p.x, p.z, 4, 12, R * 2 + 4, PIER.deck, 'wheel');
      break;
    }
    default:
      break;
  }
}

function buildPalms(palms, group, colliders) {
  if (!palms.length) return;
  // Trunk: a tapered, gently curved column. Crown: drooping fronds and coconuts.
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 8, 7, 8);
  trunk.translate(0, 4, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / 8; tp.setX(i, tp.getX(i) + y * y * 0.9); }
  trunk.computeVertexNormals();
  const crown = new MeshBuilder();
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * Math.PI * 2 + (f % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let px = 0.9, py = 8, pz = 0;
    for (let s = 0; s < 3; s++) {
      const len = 1.4, droop = 0.25 + s * 0.45;
      const nx = 0.9 + (s + 1) * len, ny = 8 + 0.3 - droop * (s + 1) * 0.55;
      const w = 0.75 - s * 0.18;
      // Each segment is a leaf quad rotated around the trunk top.
      const p0 = rot(px - 0.9, pz, ca, sa), p1 = rot(nx - 0.9, 0, ca, sa);
      const side = rot(0, w, ca, sa);
      crown.face(p0[0] + 0.9 - side[0], py, p0[1] - side[1], p1[0] - p0[0], ny - py, p1[1] - p0[1], side[0] * 2, 0.15, side[1] * 2, s === 2 ? 0x4f8f2f : 0x3f7f2a);
      px = nx; py = ny; pz = 0;
    }
  }
  for (let k = 0; k < 3; k++) crown.geometry(new THREE.SphereGeometry(0.22, 6, 5), new THREE.Matrix4().makeTranslation(0.9 + Math.cos(k * 2.1) * 0.3, 7.7, Math.sin(k * 2.1) * 0.3), 0x6b4a22);
  const crownGeo = crown.build();
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x9b7b58, roughness: 1 }), palms.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), palms.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const r = makeRng(41);
  palms.forEach((p, i) => {
    e.set(0, r.range(0, Math.PI * 2), p.lean ?? r.range(0, 0.08));
    q.setFromEuler(e);
    const y = p.x > CITY_SIZE ? groundHeight(p.x, p.z) : CURB;
    m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(p.s, p.s * r.range(0.95, 1.3), p.s));
    trunkMesh.setMatrixAt(i, m);
    crownMesh.setMatrixAt(i, m);
    colliders.addCentered(p.x, p.z, 0.5, 0.5, 6, 0, 'palm');
  });
  trunkMesh.castShadow = crownMesh.castShadow = true;
  group.add(trunkMesh, crownMesh);
}

function rot(x, z, c, s) { return [x * c - z * s, x * s + z * c]; }

function buildTrees(trees, group, colliders) {
  if (!trees.length) return;
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6); trunk.translate(0, 1.5, 0);
  const canopy = new THREE.IcosahedronGeometry(2.2, 0); canopy.translate(0, 4.2, 0);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x7a5a3a }), trees.length);
  const cm = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ color: 0x4f9a3a, flatShading: true, roughness: 0.9 }), trees.length);
  const m = new THREE.Matrix4(), r = makeRng(3), c = new THREE.Color();
  trees.forEach((t, i) => {
    m.compose(new THREE.Vector3(t.x, CURB, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.range(0, 6), 0)), new THREE.Vector3(t.s, t.s, t.s));
    tm.setMatrixAt(i, m); cm.setMatrixAt(i, m);
    cm.setColorAt(i, c.setHSL(0.27 + r.range(-0.04, 0.05), 0.5, 0.36 + r.range(-0.06, 0.06)));
    colliders.addCentered(t.x, t.z, 0.6, 0.6, 3, 0, 'tree');
  });
  tm.castShadow = cm.castShadow = true;
  group.add(tm, cm);
}

function buildLamps(lamps, group, colliders) {
  const pole = new MeshBuilder();
  pole.geometry(new THREE.CylinderGeometry(0.09, 0.13, 7, 6), new THREE.Matrix4().makeTranslation(0, 3.5, 0), 0x2f3338);
  pole.box(0.9, 6.9, 0, 1.9, 0.12, 0.12, 0x2f3338);
  const head = new THREE.BoxGeometry(0.8, 0.22, 0.4); head.translate(1.7, 6.8, 0);
  const pm = new THREE.InstancedMesh(pole.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), lamps.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc870, emissiveIntensity: 0.4 });
  const hm = new THREE.InstancedMesh(head, headMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    // Arm points toward the nearest street corner, over the road.
    const bx = ((l.x % CELL) + CELL) % CELL, bz = ((l.z % CELL) + CELL) % CELL;
    const yaw = Math.atan2(bz < CELL / 2 ? 1 : -1, bx < CELL / 2 ? -1 : 1);
    m.compose(new THREE.Vector3(l.x, CURB, l.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -yaw, 0)), new THREE.Vector3(1, 1, 1));
    pm.setMatrixAt(i, m); hm.setMatrixAt(i, m);
    colliders.addCentered(l.x, l.z, 0.35, 0.35, 7, 0, 'lamp');
  });
  pm.castShadow = true;
  group.add(pm, hm);
  return headMat;
}
