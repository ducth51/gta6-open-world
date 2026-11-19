// The heads-up display: money, wanted stars, weapon and ammo, clock, health and armour bars, the
// rotating minimap with blips and GPS route, objectives, help prompts, banners and the hit marker.
import { renderCityImage, gpsRoute, drawBlip, BLIP_STYLE, MAP_X0, MAP_Z0 } from './mapRenderer.js';
import { districtAt, districtName, streetNameAt } from '../world/cityPlan.js';
import { formatMoney } from '../util/mathx.js';
import { WEAPONS } from '../config.js';
import { services } from '../core/services.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(plan) {
    this.root = $('hud');
    this.el = {
      money: $('hud-money'), wanted: $('hud-wanted'), clock: $('hud-clock'), weapon: $('hud-weapon-name'), ammo: $('hud-ammo'),
      health: $('hud-health'), armor: $('hud-armor'), location: $('hud-location'), objective: $('hud-objective'), help: $('hud-help'),
      vehicle: $('hud-vehicle'), vehicleName: $('hud-vehicle-name'), speed: $('hud-speed'), radio: $('hud-radio'),
      crosshair: $('hud-crosshair'), hit: $('hud-hitmarker'), subtitle: $('hud-subtitle'), timer: $('hud-timer'),
      damage: $('hud-damage'), banner: $('hud-banner'), bannerTitle: $('hud-banner-title'), bannerSub: $('hud-banner-sub'),
      stunt: $('hud-stunt'), air: $('hud-air'), sky: $('hud-sky'),
    };
    this.mini = $('hud-minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.city = renderCityImage(plan);
    this.helpText = null; this.helpShown = '';
    this.notices = [];
    this.bannerT = 0;
    this.hitT = 0;
    this.lastMoney = -1;
    this.displayMoney = 0;
    this.wantedFlashT = 0;
    this.stars = [];
    for (let i = 0; i < 5; i++) { const s = document.createElement('span'); s.className = 'star'; s.textContent = '★'; this.el.wanted.appendChild(s); this.stars.push(s); }
    this.hurtT = 0;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  help(html) { this.helpText = html; }
  notify(text) { this.notices.push({ text, t: 3.5 }); if (this.notices.length > 3) this.notices.shift(); }
  hitmarker() { this.hitT = 0.15; }
  flashWanted() { this.wantedFlashT = 1.2; }
  hurt() { this.hurtT = 0.6; }

  banner(title, sub, kind, seconds) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerTitle.className = kind === 'fail' ? 'bad' : '';
    this.el.bannerSub.textContent = sub ?? '';
    this.el.banner.classList.remove('hidden');
    this.bannerT = seconds;
  }

  subtitle(html) {
    this.el.subtitle.classList.toggle('hidden', !html);
    if (html) this.el.subtitle.innerHTML = html;
  }

  update(dt, game) {
    const p = game.player;
    // Money ticks up like a cash counter.
    this.displayMoney += (p.money - this.displayMoney) * Math.min(1, dt * 8);
    if (this.instantMoney) this.displayMoney = p.money;
    if (Math.abs(p.money - this.displayMoney) < 1) this.displayMoney = p.money;
    this.el.money.textContent = formatMoney(this.displayMoney);
    const h = game.hour;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.el.sky.textContent = game.weather.kind === 'clear' ? '' : game.weather.label;
    const stunt = game.stunts.hudLine();
    this.el.stunt.classList.toggle('hidden', !stunt);
    if (stunt) this.el.stunt.textContent = stunt;
    this.el.air.classList.toggle('hidden', !game.air.active);
    const level = game.police.level;
    this.stars.forEach((s, i) => s.classList.toggle('on', i < level));
    this.el.wanted.classList.toggle('blink', game.police.searching || this.wantedFlashT > 0);
    this.wantedFlashT -= dt;
    const def = WEAPONS[p.weapon];
    this.el.weapon.textContent = def.name;
    const w = p.weapons[p.weapon];
    this.el.ammo.textContent = def.melee ? '' : p.reloadT > 0 ? 'reloading…' : `${w.clip} / ${w.ammo}`;
    this.el.health.style.width = `${Math.max(0, p.health)}%`;
    this.el.armor.style.width = `${Math.max(0, p.armor)}%`;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    this.el.location.innerHTML = `${streetNameAt(pp.x, pp.z)}<small>${districtName(districtAt(pp.x, pp.z))}</small>`;

    const v = p.vehicle;
    this.el.vehicle.classList.toggle('hidden', !v);
    if (v) {
      this.el.vehicleName.textContent = v.def.name;
      this.el.speed.textContent = Math.round(Math.abs(v.forwardSpeed) * 3.6);
      this.el.radio.textContent = '♫ ' + game.radio.name + '  ·  R to tune';
    }
    this.el.crosshair.classList.toggle('hidden', !!v || p.dead || (!p.aiming && p.weapon === 'fists'));
    this.hitT -= dt;
    this.el.hit.classList.toggle('show', this.hitT > 0);
    this.hurtT -= dt;
    const low = p.health < 30 ? 0.35 : 0;
    this.el.damage.style.boxShadow = `inset 0 0 180px rgba(200,0,0,${Math.max(low, Math.min(0.6, this.hurtT))})`;

    // Objective: mission first, then activities.
    const obj = game.missions.objective() ?? game.activities.objective() ?? game.taxi.objective() ?? game.vigilante.objective() ?? game.events.objective();
    this.el.objective.classList.toggle('hidden', !obj);
    if (obj) this.el.objective.innerHTML = `<div class="mtitle">${obj.title}</div>${obj.text}`;
    const timer = game.missions.timeLeft ?? game.activities.timer() ?? game.taxi.timer() ?? game.vigilante.timer();
    this.el.timer.classList.toggle('hidden', timer === null || timer === undefined);
    if (timer !== null && timer !== undefined) this.el.timer.textContent = `${Math.floor(Math.max(0, timer) / 60)}:${String(Math.floor(Math.max(0, timer) % 60)).padStart(2, '0')}`;

    // Help box: prompts this frame win; otherwise the newest notice.
    for (const n of this.notices) n.t -= dt;
    this.notices = this.notices.filter((n) => n.t > 0);
    const text = this.helpText ?? (this.notices.length ? this.notices.map((n) => n.text).join('<br>') : null);
    if (text !== this.helpShown) {
      this.el.help.classList.toggle('hidden', !text);
      if (text) this.el.help.innerHTML = text;
      this.helpShown = text;
    }
    this.helpText = null;
    this.el.help.style.top = obj ? '108px' : '18px';
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.add('hidden'); }
    this.drawMinimap(game);
  }

  /** The rotating minimap: the city image turned to the camera, blips, route and the player arrow. */
  drawMinimap(game) {
    const ctx = this.miniCtx, W = this.mini.width, H = this.mini.height;
    const p = game.player;
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    const zoom = p.vehicle ? 0.95 + Math.min(0.5, p.vehicle.speed / 60) * -1 : 1.25;
    const s = zoom / this.city.scale * this.city.scale; // pixels per metre on the minimap
    const yaw = game.cameraRig.yaw;
    ctx.save();
    ctx.fillStyle = '#1f7f99'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2 + 20);
    ctx.rotate(yaw + Math.PI);
    ctx.scale(s, s);
    ctx.translate(-pp.x, -pp.z);
    ctx.drawImage(this.city.canvas, MAP_X0, MAP_Z0, this.city.canvas.width / this.city.scale, this.city.canvas.height / this.city.scale);
    // GPS route.
    const target = game.gpsTarget();
    if (target) {
      const route = gpsRoute(pp.x, pp.z, target.x, target.z);
      ctx.strokeStyle = game.missions.active ? '#ffd25e' : '#ff4fa0'; ctx.lineWidth = 5 / s; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); route.forEach((q, i) => (i ? ctx.lineTo(q.x, q.z) : ctx.moveTo(q.x, q.z))); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Blips are drawn upright, clamped to the edge when off-map.
    const toScreen = (x, z) => {
      const dx = (x - pp.x) * s, dz = (z - pp.z) * s;
      const a = yaw + Math.PI, c = Math.cos(a), sn = Math.sin(a);
      return { x: W / 2 + dx * c - dz * sn, y: H / 2 + 20 + dx * sn + dz * c };
    };
    const blip = (x, z, style, size, clampEdge) => {
      let q = toScreen(x, z);
      const m = 10;
      if (q.x < m || q.x > W - m || q.y < m || q.y > H - m) {
        if (!clampEdge) return;
        q = { x: Math.max(m, Math.min(W - m, q.x)), y: Math.max(m, Math.min(H - m, q.y)) };
      }
      drawBlip(ctx, q.x, q.y, style, size);
    };
    for (const b of game.allBlips()) blip(b.x, b.z, BLIP_STYLE[b.icon], 6, false);
    if (!game.missions.active && game.missions.next) { const g = game.missions.giverPos(game.missions.next); blip(g.x, g.z, BLIP_STYLE.mission, 8, true); }
    for (const ped of game.peds.list) {
      if (ped.dead) continue;
      if (ped.team === 'cop' && game.police.level > 0) blip(ped.pos.x, ped.pos.z, BLIP_STYLE.cop, 3.5, false);
      if (ped.team === 'gang' && ped.mission) blip(ped.pos.x, ped.pos.z, BLIP_STYLE.enemy, 4, false);
    }
    for (const v of game.vehicles) if (v.isPolice && v.sirenOn && !v.dead) blip(v.pos.x, v.pos.z, BLIP_STYLE.cop, 5, true);
    if (target) blip(target.x, target.z, game.missions.active ? BLIP_STYLE.target : BLIP_STYLE.checkpoint, 7, true);
    // Player arrow.
    ctx.save();
    ctx.translate(W / 2, H / 2 + 20);
    const facing = (p.vehicle ? p.vehicle.yaw : p.yaw) - yaw;
    ctx.rotate(-facing);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // Wanted: the frame flashes police colours.
    const level = game.police.level;
    this.mini.style.borderColor = level > 0 ? (Math.sin(services.time * 10) > 0 ? '#ff2a2a' : '#2a5bff') : 'rgba(0,0,0,.65)';
  }
}
