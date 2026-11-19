// An AI behind the wheel: follows lanes through the grid by waypoints, slows for turns, brakes for
// whatever is ahead, honks when blocked, and in pursuit or flight leaves the lanes to chase or run.
import { services } from '../core/services.js';
import { nearestNode, neighbors, laneSegment, turnPoint, randomNext, steerNext, sameNode, nodePos } from './roadGraph.js';
import { clamp, wrapAngle, yawTo, rng, dist2 } from '../util/mathx.js';

export class LaneDriver {
  constructor(vehicle, mode = 'cruise') {
    this.v = vehicle;
    this.mode = mode;          // cruise | pursuit | flee | route | park
    this.points = [];
    this.a = null; this.b = null;
    this.cruise = 11 + rng.range(-1.5, 2);
    this.blockedT = 0;
    this.target = null;        // {x, z} for pursuit/route/flee
    this.direct = false;
    this.panic = 0;
    this.stuckT = 0;
    this.reverseT = 0;
  }

  /** Starts on the edge from node a to node b, at fraction t of the lane. */
  placeOnEdge(a, b, t = 0) {
    this.a = a; this.b = b;
    const seg = laneSegment(a, b);
    const x = seg.start.x + (seg.end.x - seg.start.x) * t, z = seg.start.z + (seg.end.z - seg.start.z) * t;
    this.v.pos.x = x; this.v.pos.z = z;
    this.v.yaw = Math.atan2(seg.dir.x, seg.dir.z);
    this.points = [seg.end];
  }

  /** Re-enters the grid from wherever the car is, heading the way it faces. */
  rejoin() {
    const n = nearestNode(this.v.pos.x, this.v.pos.z);
    const fx = Math.sin(this.v.yaw), fz = Math.cos(this.v.yaw);
    let best = null, bestDot = -Infinity;
    for (const m of neighbors(n)) {
      const dot = (m.i - n.i) * fx + (m.j - n.j) * fz;
      if (dot > bestDot) { bestDot = dot; best = m; }
    }
    this.a = n; this.b = best;
    const seg = laneSegment(n, best);
    this.points = [seg.start, seg.end];
  }

  chooseNext() {
    const t = this.target;
    if (this.mode === 'cruise' || !t) return randomNext(this.a, this.b, rng);
    if (this.mode === 'flee') return steerNext(this.a, this.b, t.x, t.z, true);
    return steerNext(this.a, this.b, t.x, t.z, false);
  }

  planAhead() {
    while (this.points.length < 3) {
      const c = this.chooseNext();
      const tp = turnPoint(this.a, this.b, c);
      if (tp) this.points.push(tp);
      const seg = laneSegment(this.b, c);
      this.points.push(seg.start, seg.end);
      this.a = this.b; this.b = c;
    }
  }

  update(dt) {
    const v = this.v;
    if (v.dead || v.driver === 'player') return;
    const c = v.controls;
    if (this.mode === 'park') { c.throttle = 0; c.steer = 0; c.handbrake = true; return; }
    c.handbrake = false;
    let tx, tz, desired;
    const game = services.game;
    const player = game.player;
    const pursuing = this.mode === 'pursuit' && this.target;
    this.direct = pursuing && dist2(v.pos.x, v.pos.z, this.target.x, this.target.z) < 55;
    if (this.direct) {
      // Leave the lanes and go straight for the target, leading a moving car.
      const pv = player.vehicle;
      const lead = pv ? 0.6 : 0.2;
      tx = this.target.x + (pv ? pv.vx * lead : 0);
      tz = this.target.z + (pv ? pv.vz * lead : 0);
      const d = dist2(v.pos.x, v.pos.z, tx, tz);
      desired = pv ? clamp(d * 1.2, 6, v.def.maxSpeed) : clamp((d - 9) * 1.2, 0, 22);
      this.points.length = 0;
    } else {
      if (!this.points.length || !this.a) this.rejoin();
      this.planAhead();
      let p = this.points[0];
      // Advance past reached waypoints.
      while (this.points.length > 1) {
        const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        if (dx * dx + dz * dz < 16 || (dx * fx + dz * fz < 0 && dx * dx + dz * dz < 100)) { this.points.shift(); this.planAhead(); p = this.points[0]; }
        else break;
      }
      tx = p.x; tz = p.z;
      const base = this.mode === 'pursuit' ? 30 : this.mode === 'flee' ? 26 : this.mode === 'route' ? 15 : this.cruise + this.panic * 6;
      desired = Math.min(base, v.def.maxSpeed * 0.95);
      const turnAhead = this.points.slice(0, 2).find((q) => q.turn);
      if (turnAhead && dist2(v.pos.x, v.pos.z, turnAhead.x, turnAhead.z) < 18 + v.speed * 0.6) desired = Math.min(desired, this.mode === 'cruise' ? 6.5 : 10);
      // Pursuit cars far off just keep heading to the player's junction.
      if (pursuing) this.target = { x: player.pos.x, z: player.pos.z };
    }
    const ang = wrapAngle(yawTo(v.pos.x, v.pos.z, tx, tz) - v.yaw);
    c.steer = clamp(-ang * 2.2, -1, 1);
    if (Math.abs(ang) > 1.2 && v.speed > 6) desired = Math.min(desired, 8);

    // Brake for anything in the way (except when ramming in a chase).
    const ahead = this.mode === 'pursuit' ? 0 : this.obstacleAhead();
    if (ahead) {
      desired = Math.min(desired, Math.max(0, (ahead - 5) * 0.8));
      this.blockedT += dt;
      if (this.blockedT > 2.5 && this.blockedT - dt <= 2.5) services.audio?.horn(v.pos, 0.5);
      if (this.blockedT > 9) { this.blockedT = 0; this.reverseT = 1.5; }
    } else this.blockedT = 0;

    // Unstick: reverse briefly if wedged against something while trying to move.
    if (desired > 3 && v.speed < 0.6) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 2) { this.reverseT = 1.2; this.stuckT = 0; }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      c.throttle = -1; c.steer = -c.steer;
      return;
    }
    const fwd = v.forwardSpeed;
    c.throttle = fwd < desired - 0.5 ? clamp((desired - fwd) * 0.4, 0.25, 1) : fwd > desired + 1.5 ? -clamp((fwd - desired) * 0.25, 0.2, 1) : 0;
  }

  /** Distance to the nearest car or person in a box ahead of the bumper, or 0 when clear. */
  obstacleAhead() {
    const v = this.v, game = services.game;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const look = 7 + v.speed * 0.9;
    let best = 0;
    const test = (x, z, halfW) => {
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > look + v.halfLen) return;
      const side = Math.abs(dx * -fz + dz * fx);
      if (side > halfW + v.halfW + 0.3) return;
      const d = along - v.halfLen;
      if (!best || d < best) best = Math.max(0.01, d);
    };
    for (const o of game.vehicles) if (o !== v && !(o.dead && o.wreckT > 30)) test(o.pos.x, o.pos.z, o.halfW);
    for (const p of game.peds.list) if (!p.dead && !p.vehicle) test(p.pos.x, p.pos.z, 0.4);
    if (!game.player.vehicle && !game.player.dead) test(game.player.pos.x, game.player.pos.z, 0.4);
    return best;
  }
}

export { nodePos, sameNode };
