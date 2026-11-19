// Keeps the streets busy around the player: spawns AI cars in lanes out of view, parks cars in the
// lots, and clears both away again once they are far behind.
import { Vehicle } from '../entities/vehicle.js';
import { TRAFFIC_MIX } from '../entities/carModels.js';
import { LaneDriver } from '../ai/laneDriver.js';
import { neighbors } from '../ai/roadGraph.js';
import { services } from '../core/services.js';
import { GRID } from '../config.js';
import { dist2, rng } from '../util/mathx.js';
import { nodePos } from '../ai/roadGraph.js';

export class TrafficManager {
  constructor(plan) {
    this.plan = plan;
    this.density = 24;
    this.parkedLive = new Map();
    this.spawnT = 0;
  }

  /** Adds an AI car on a random lane between radius minD and maxD from (x, z). */
  spawnCar(x, z, minD, maxD, model = null, mode = 'cruise') {
    const game = services.game;
    const cam = services.camera;
    for (let tries = 0; tries < 12; tries++) {
      const i = rng.int(0, GRID), j = rng.int(0, GRID);
      const p = nodePos(i, j);
      const d = dist2(p.x, p.z, x, z);
      if (d < minD || d > maxD) continue;
      // Prefer junctions behind the camera so cars do not pop into view.
      if (cam && d < 150) {
        const fx = Math.sin(game.cameraRig.yaw), fz = Math.cos(game.cameraRig.yaw);
        if ((p.x - cam.position.x) * fx + (p.z - cam.position.z) * fz > 0) continue;
      }
      const a = { i, j };
      const b = rng.pick(neighbors(a));
      const v = new Vehicle(model ?? rng.pick(TRAFFIC_MIX), 0, 0, 0);
      const ai = new LaneDriver(v, mode);
      ai.placeOnEdge(a, b, rng.range(0.1, 0.8));
      if (game.vehicles.some((o) => dist2(o.pos.x, o.pos.z, v.pos.x, v.pos.z) < 9)) { v.dispose(); continue; }
      v.ai = ai;
      v.driver = { npc: true };
      v.syncMesh(0);
      game.vehicles.push(v);
      return v;
    }
    return null;
  }

  update(dt, focus) {
    const game = services.game;
    for (const v of game.vehicles) if (v.ai && v.driver && v.driver !== 'player') v.ai.update(dt);
    // Retire far cars that nobody needs.
    for (let i = game.vehicles.length - 1; i >= 0; i--) {
      const v = game.vehicles[i];
      if (v.driver === 'player' || v.mission || v.persistent) continue;
      const d = dist2(v.pos.x, v.pos.z, focus.x, focus.z);
      if (d > 260 || (v.dead && v.wreckT > 40 && d > 60)) {
        if (v.parkIndex !== undefined) this.parkedLive.delete(v.parkIndex);
        v.dispose();
        game.vehicles.splice(i, 1);
      }
    }
    const moving = game.vehicles.filter((v) => v.ai && v.ai.mode === 'cruise').length;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && moving < this.density) {
      this.spawnT = 0.2;
      this.spawnCar(focus.x, focus.z, 70, 230);
    }
    // Parked cars appear when their lot comes within range.
    this.plan.parking.forEach((spot, index) => {
      if (this.parkedLive.has(index) || spot.taken) return;
      const d = dist2(spot.x, spot.z, focus.x, focus.z);
      if (d > 170 || d < 60) return;
      const v = new Vehicle(spot.model ?? rng.pick(TRAFFIC_MIX), spot.x, spot.z, spot.yaw);
      v.parkIndex = index;
      v.pos.y = 0.18;
      game.vehicles.push(v);
      this.parkedLive.set(index, v);
    });
  }

  /** When the player takes a parked car, its spot stays empty for a while. */
  releaseParked(v) {
    if (v.parkIndex === undefined) return;
    const spot = this.plan.parking[v.parkIndex];
    spot.taken = true;
    setTimeout(() => { spot.taken = false; }, 120000);
    this.parkedLive.delete(v.parkIndex);
    v.parkIndex = undefined;
  }
}
