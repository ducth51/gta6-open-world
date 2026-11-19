// Roadblocks: from three stars, while Sol is in a car and moving, the PBPD throws a line of patrol cars
// across the street ahead of her, with officers crouched behind them. There is a hair's breadth of
// gap at best: slow down and go round the long way, or ram a car out of the line at speed.
import { LaneDriver } from '../ai/laneDriver.js';
import { nearestNode, nodePos } from '../ai/roadGraph.js';
import { LOOKS } from '../entities/humanoid.js';
import { ROAD, AIR_SUPPORT_LEVEL } from '../config.js';
import { services } from '../core/services.js';
import { dist2, rng } from '../util/mathx.js';

const LIFETIME = 75;
const CAR_OFFSETS = [-5.2, 0, 5.2];

export class Roadblocks {
  constructor(game) {
    this.game = game;
    this.blocks = [];
    this.timer = 14;
    services.roadblocks = this;
  }

  get count() { return this.blocks.length; }

  update(dt) {
    const g = this.game, p = g.player, level = g.police.level;
    const v = p.vehicle;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.age += dt;
      const far = dist2(b.x, b.z, p.pos.x, p.pos.z) > 320;
      if (b.age > LIFETIME || far || (level === 0 && b.age > 6)) { this.release(b); this.blocks.splice(i, 1); }
    }
    if (level >= AIR_SUPPORT_LEVEL && v && !p.dead && v.speed > 9) {
      this.timer -= dt;
      if (this.timer <= 0 && this.blocks.length < (level >= 5 ? 3 : 2)) {
        this.timer = rng.range(18, 28);
        this.setUp(v);
      }
    } else this.timer = Math.max(this.timer, 8);
  }

  /** Builds a block on the street segment ahead of the car, just short of a junction. */
  setUp(v) {
    const g = this.game;
    const speed = Math.max(v.speed, 1);
    const fx = v.vx / speed, fz = v.vz / speed;
    const reach = 120 + speed * 2.2;
    const node = nearestNode(v.pos.x + fx * reach, v.pos.z + fz * reach);
    const np = nodePos(node.i, node.j);
    const alongX = Math.abs(fx) > Math.abs(fz);
    const dir = Math.sign(alongX ? fx : fz) || 1;
    const x = alongX ? np.x - dir * (ROAD / 2 + 9) : np.x;
    const z = alongX ? np.z : np.z - dir * (ROAD / 2 + 9);
    const ahead = (x - v.pos.x) * fx + (z - v.pos.z) * fz;
    if (ahead < 60 || ahead > reach + 60) return null;
    if (g.vehicles.some((o) => dist2(o.pos.x, o.pos.z, x, z) < 7)) return null;

    const block = { x, z, age: 0, cars: [], officers: [] };
    const yaw = alongX ? 0 : Math.PI / 2;     // the cars lie across the street
    for (const off of CAR_OFFSETS) {
      const cx = alongX ? x : x + off, cz = alongX ? z + off : z;
      const car = g.spawnVehicle('police', cx, cz, yaw);
      car.driver = { npc: true, cop: true };
      car.ai = new LaneDriver(car, 'park');
      car.sirenOn = true;
      car.mission = 'roadblock';
      car.persistent = true;
      block.cars.push(car);
    }
    for (const off of [-3, 3]) {
      const ox = alongX ? x - dir * 3.2 : x + off, oz = alongX ? z + off : z - dir * 3.2;
      const cop = g.peds.spawn(LOOKS.cop, ox, oz, 'cop');
      cop.persistent = true;
      block.officers.push(cop);
    }
    this.blocks.push(block);
    g.notify('<b>Roadblock ahead!</b> Slow down, or hit it hard.');
    services.audio?.blip();
    return block;
  }

  /** Lets the patrol cars and officers drift back into the ordinary world. */
  release(b) {
    for (const car of b.cars) {
      car.mission = null;
      car.persistent = false;
      car.sirenOn = false;
      if (car.ai) car.ai.mode = 'cruise';
    }
    for (const cop of b.officers) cop.persistent = false;
  }

  clear() {
    for (const b of this.blocks) this.release(b);
    this.blocks.length = 0;
    this.timer = 14;
  }
}
