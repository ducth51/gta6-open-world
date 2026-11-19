// Day and night over Palmera Bay: a gradient sky dome with a sun glow and stars, the sun and
// hemisphere lights, fog, and the colour keyframes for dawn, noon, golden hour, dusk and night.
import * as THREE from 'three';
import { clamp, smoothstep } from '../util/mathx.js';

const KEYS = [
  { h: 0, zenith: 0x060920, horizon: 0x1b1a44, sun: 0x8fa6ff, sunI: 0.35, hemi: 0.42, fog: 0x1c1d3c },
  { h: 5.2, zenith: 0x1a2458, horizon: 0x6a4a7a, sun: 0xff9a70, sunI: 0.4, hemi: 0.5, fog: 0x5a4a6e },
  { h: 6.5, zenith: 0x3a5aa8, horizon: 0xffa679, sun: 0xffb27a, sunI: 1.4, hemi: 0.75, fog: 0xe8a888 },
  { h: 9, zenith: 0x2f7fe0, horizon: 0xbfe2ff, sun: 0xfff1d6, sunI: 2.6, hemi: 1.0, fog: 0xb8d6ec },
  { h: 14, zenith: 0x2a78dc, horizon: 0xcdeaff, sun: 0xffffff, sunI: 2.9, hemi: 1.05, fog: 0xc4dff0 },
  { h: 17, zenith: 0x3a62b8, horizon: 0xffc08a, sun: 0xffc27a, sunI: 2.7, hemi: 0.95, fog: 0xf0c49c },
  { h: 18.4, zenith: 0x3a3f8e, horizon: 0xff8a6a, sun: 0xff9050, sunI: 2.0, hemi: 0.8, fog: 0xe89a86 },
  { h: 19.6, zenith: 0x221f5a, horizon: 0xe2557a, sun: 0xff6a5a, sunI: 0.8, hemi: 0.6, fog: 0x8a4a72 },
  { h: 21, zenith: 0x0a0d2a, horizon: 0x2c2350, sun: 0x8fa6ff, sunI: 0.35, hemi: 0.45, fog: 0x2a2448 },
  { h: 24, zenith: 0x060920, horizon: 0x1b1a44, sun: 0x8fa6ff, sunI: 0.35, hemi: 0.42, fog: 0x1c1d3c },
];

const _a = new THREE.Color(), _b = new THREE.Color();
function mixHex(a, b, t, out) { return out.copy(_a.setHex(a)).lerp(_b.setHex(b), t); }

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, night: { value: 0 },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = max(vDir.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));
          float below = clamp(-vDir.y * 4.0, 0.0, 1.0);
          col = mix(col, horizon * 0.8, below);
          float d = max(dot(vDir, sunDir), 0.0);
          col += sunColor * (pow(d, 900.0) * 3.0 + pow(d, 12.0) * 0.35 + pow(d, 3.0) * 0.12) * (1.0 - night * 0.7);
          vec3 cell = floor(vDir * 300.0);
          float star = step(0.9975, hash(cell)) * night * smoothstep(0.05, 0.3, vDir.y);
          col += vec3(star);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    scene.add(dome);
    this.dome = dome;

    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xf0c49c, 180, 1300);
    this.hour = 17.5;
    this.night = 0;
    this.sunDir = new THREE.Vector3();
  }

  /** Sets lights, fog and sky for `hour` (0..24); `focus` is where the shadow camera follows. */
  update(hour, focus) {
    this.hour = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= this.hour) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const t = clamp((this.hour - k0.h) / (k1.h - k0.h), 0, 1);
    const u = this.uniforms;
    mixHex(k0.zenith, k1.zenith, t, u.zenith.value);
    mixHex(k0.horizon, k1.horizon, t, u.horizon.value);
    mixHex(k0.sun, k1.sun, t, u.sunColor.value);
    const sunI = k0.sunI + (k1.sunI - k0.sunI) * t;
    const hemiI = k0.hemi + (k1.hemi - k0.hemi) * t;
    mixHex(k0.fog, k1.fog, t, this.scene.fog.color);

    // The sun rises over the ocean (east, +x) and sets behind the hills (west).
    const ang = ((this.hour - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), Math.max(elev, -0.2), 0.35).normalize();
    this.night = 1 - smoothstep(-0.12, 0.18, elev);
    u.night.value = this.night;
    u.sunDir.value.copy(this.sunDir);

    // At night the "sun" light becomes a cool moon from high overhead.
    const lightDir = this.night > 0.5 ? new THREE.Vector3(-0.3, 1, 0.5).normalize() : this.sunDir.clone().setY(Math.max(this.sunDir.y, 0.12)).normalize();
    this.sun.color.copy(u.sunColor.value);
    this.sun.intensity = sunI;
    this.hemi.intensity = hemiI;
    this.hemi.color.copy(u.zenith.value).lerp(_a.setHex(0xffffff), 0.45);
    this.hemi.groundColor.setHex(0x7a6a50).multiplyScalar(0.6 + 0.4 * (1 - this.night));
    if (focus) {
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.sun.position.set(focus.x + lightDir.x * 250, lightDir.y * 250, focus.z + lightDir.z * 250);
      this.dome.position.set(focus.x, 0, focus.z);
    }
    this.scene.fog.near = 160 - this.night * 40;
    this.scene.fog.far = 1300 - this.night * 500;
  }
}
