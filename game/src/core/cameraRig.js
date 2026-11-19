// The third-person camera: an orbit on foot, an over-the-shoulder view while aiming, and a chase
// camera in cars that swings behind on its own, widens with speed and never clips into buildings.
import * as THREE from 'three';
import { services } from './services.js';
import { clamp, damp, dampAngle } from '../util/mathx.js';
import { groundHeight } from '../world/cityPlan.js';

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.2;
    this.dist = 4.6;
    this.shoulder = 0;
    this.fov = 65;
    this.shakeAmt = 0;
    this.freeLookT = 0;
    this.mode = 'foot';
  }

  shake(amount) { this.shakeAmt = Math.min(1.2, this.shakeAmt + amount); }

  /** Forward vector of the view (where the crosshair points). */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt, player, mouse) {
    const cam = this.camera;
    if (mouse.x || mouse.y) this.freeLookT = 1.4;
    this.freeLookT -= dt;
    this.yaw -= mouse.x;
    this.pitch = clamp(this.pitch - mouse.y, -1.25, 0.7);

    let wantDist, wantShoulder, wantFov, height;
    const v = player.vehicle;
    if (v) {
      this.mode = 'car';
      const speed = v.speed;
      if (this.freeLookT <= 0 && speed > 2) {
        const back = v.forwardSpeed < -2 ? v.yaw + Math.PI : v.yaw;
        this.yaw = dampAngle(this.yaw, back, 2.6, dt);
        this.pitch = damp(this.pitch, -0.2, 2, dt);
      }
      wantDist = 5.2 + v.def.len * 0.6 + speed * 0.05;
      wantShoulder = 0;
      wantFov = 64 + clamp(speed * 0.4, 0, 20);
      height = 1.6 + v.def.body * 0.6;
      _target.set(v.pos.x, v.pos.y + height, v.pos.z);
    } else if (player.dead) {
      // Death: drift up and around the body.
      this.mode = 'dead';
      this.yaw += dt * 0.35;
      this.pitch = damp(this.pitch, -0.75, 1.5, dt);
      wantDist = 8; wantShoulder = 0; wantFov = 60;
      _target.set(player.pos.x, player.pos.y + 0.6, player.pos.z);
    } else {
      this.mode = player.aiming ? 'aim' : 'foot';
      wantDist = player.aiming ? 2.3 : 4.4;
      wantShoulder = player.aiming ? 0.62 : 0.35;
      wantFov = player.aiming ? 52 : 65;
      _target.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
    }
    this.dist = damp(this.dist, wantDist, 8, dt);
    this.shoulder = damp(this.shoulder, wantShoulder, 8, dt);
    this.fov = damp(this.fov, wantFov, 6, dt);

    this.forward(_dir);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const ox = _target.x + rx * this.shoulder, oz = _target.z + rz * this.shoulder;
    // Pull in when a building sits between the subject and the camera.
    let dist = this.dist;
    const hit = services.colliders.raycast(ox, _target.y, oz, -_dir.x, -_dir.y, -_dir.z, dist + 0.4);
    if (hit !== Infinity) dist = Math.max(0.8, hit - 0.4);
    cam.position.set(ox - _dir.x * dist, _target.y - _dir.y * dist, oz - _dir.z * dist);
    cam.position.y = Math.max(cam.position.y, groundHeight(cam.position.x, cam.position.z) + 0.35);
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    }
    cam.lookAt(cam.position.x + _dir.x, cam.position.y + _dir.y, cam.position.z + _dir.z);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  /** The title view: out over the bay, looking back at the skyline, drifting slowly. */
  titleView(t) {
    const cam = this.camera;
    const a = -Math.PI / 2 + Math.sin(t * 0.05) * 0.32;
    const cx = 560, cz = 380, r = 520;
    cam.position.set(cx - Math.sin(a) * r, 46 + Math.sin(t * 0.08) * 6, cz - Math.cos(a) * r);
    cam.lookAt(cx, 52, cz);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
    this.yaw = a;
  }
}
