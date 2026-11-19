// Menus: the title screen over a live flyover of the city, the pause menu (resume, map, save, load,
// controls, settings, quit), the full-screen map, the controls card and the end credits.
import { renderCityImage, drawBlip, BLIP_STYLE, MAP_X0, MAP_Z0, MAP_X1, MAP_Z1 } from './mapRenderer.js';
import { CREDITS } from '../story/characters.js';
import { services } from '../core/services.js';

const $ = (id) => document.getElementById(id);

export const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look and aim the camera'], ['Shift', 'Sprint'], ['Space', 'Jump / handbrake'],
  ['F', 'Enter, steal or leave a car'], ['Left mouse', 'Shoot / punch'], ['Right mouse', 'Aim over the shoulder'],
  ['Q / E / wheel / 1-4', 'Switch weapon'], ['R', 'Reload (on foot) / change radio station (in a car)'], ['E', 'Interact: start missions, shop, save'],
  ['H', 'Horn'], ['G', 'Siren (police cars)'], ['M', 'Map'], ['Esc', 'Pause'],
];

export class Menus {
  constructor(game) {
    this.game = game;
    this.title = $('title-screen');
    this.pause = $('pause-screen');
    this.map = $('map-screen');
    this.info = $('info-screen');
    this.mapCanvas = $('map-canvas');
    this.cityImage = renderCityImage(game.plan);
    this.open = null;
  }

  button(parent, label, fn, disabled = false) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', (e) => { e.stopPropagation(); services.audio?.init(); services.audio?.blip(); fn(); });
    parent.appendChild(b);
    return b;
  }

  showTitle() {
    const g = this.game;
    this.open = 'title';
    this.title.classList.remove('hidden');
    const menu = $('title-menu');
    menu.innerHTML = '';
    const latest = g.save.latest();
    this.button(menu, latest ? 'Continue' : 'New Game', () => g.startGame(latest));
    if (latest) this.button(menu, 'New Game', () => g.startGame(null));
    this.button(menu, 'Controls', () => this.showControls());
    this.button(menu, 'About Palmera Bay', () => this.showAbout());
  }

  hideTitle() { this.title.classList.add('hidden'); this.open = null; }

  showPause() {
    const g = this.game;
    this.open = 'pause';
    this.pause.classList.remove('hidden');
    const menu = $('pause-menu');
    menu.innerHTML = '';
    this.button(menu, 'Resume', () => g.resume());
    this.button(menu, 'Map', () => { this.pause.classList.add('hidden'); this.showMap(); });
    this.button(menu, 'Save game', () => { g.save.write(g, 'slot1'); g.notify('Game saved.'); g.resume(); });
    this.button(menu, 'Load last save', () => g.startGame(g.save.latest()), !g.save.latest());
    this.button(menu, 'Controls', () => this.showControls());
    this.button(menu, `Music: ${Math.round(g.settings.music * 100)}%`, () => { g.settings.music = (g.settings.music + 0.25) % 1.25; g.applySettings(); this.showPause(); });
    this.button(menu, `Mouse: ${g.settings.sensitivity.toFixed(2)}×`, () => { g.settings.sensitivity = g.settings.sensitivity >= 2 ? 0.5 : g.settings.sensitivity + 0.25; g.applySettings(); this.showPause(); });
    this.button(menu, 'Quit to title', () => g.quitToTitle());
    const p = g.player;
    $('pause-stats').innerHTML = `Story: ${g.missions.index}/5 missions · Sun Tokens: ${g.activities.tokensFound.size}/15<br>Cars stolen: ${p.stats.carsStolen} · Distance: ${(p.stats.distance / 1000).toFixed(1)} km · Shots: ${p.stats.shots}`;
  }

  hidePause() { this.pause.classList.add('hidden'); this.map.classList.add('hidden'); this.info.classList.add('hidden'); this.open = null; }

  showControls() {
    this.info.classList.remove('hidden');
    $('info-body').innerHTML = `<h2>CONTROLS</h2><table>${CONTROLS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table><p>Click or press Esc to close.</p>`;
    this.info.onclick = () => this.info.classList.add('hidden');
  }

  showAbout() {
    this.info.classList.remove('hidden');
    $('info-body').innerHTML = `<h2>PALMERA BAY</h2>
      <p>A sun-bleached coastal city of glass towers, pastel beach hotels and neon. Sol Vega is home after three years inside — and her family owes the Gilded Hand.</p>
      <p><b>Glasswater</b> — downtown towers and Kane Tower. <b>Palmera Beach</b> — hotels, the Sunwheel pier and Rosa's Diner. <b>Old Harbor</b> — cranes, containers, Benny's Garage. <b>Coral Heights</b> — bungalows and pools. <b>Saltmarsh</b> — yards, trailers and the Gilded Hand's cash.</p>
      <p>Five story missions, two street races, courier runs, fifteen Sun Tokens, a gun counter, a respray shop and a five-star police force.</p><p>Click to close.</p>`;
    this.info.onclick = () => this.info.classList.add('hidden');
  }

  showCredits() {
    this.info.classList.remove('hidden');
    $('info-body').innerHTML = `<h2>THE END</h2>${CREDITS.map((l) => `<p>${l}</p>`).join('')}<p>Click to keep playing.</p>`;
    this.info.onclick = () => this.info.classList.add('hidden');
  }

  showMap() {
    this.open = 'map';
    this.map.classList.remove('hidden');
    this.drawMap();
    $('map-legend').innerHTML = [['mission', 'Story mission'], ['target', 'Objective'], ['race', 'Street race'], ['job', 'Bay Couriers'], ['guns', 'Bayside Arms'], ['spray', 'Fresh Coat respray'], ['save', 'Safehouse / save'], ['hospital', 'Hospital'], ['police', 'PBPD'], ['cop', 'Police']]
      .map(([k, label]) => `<div><span class="dot" style="background:${BLIP_STYLE[k].color}"></span>${label}</div>`).join('') + '<p>Press M or Esc to close</p>';
  }

  drawMap() {
    const g = this.game, c = this.mapCanvas, ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const sx = W / (MAP_X1 - MAP_X0), sz = H / (MAP_Z1 - MAP_Z0);
    ctx.drawImage(this.cityImage.canvas, 0, 0, W, H);
    const P = (x, z) => ({ x: (x - MAP_X0) * sx, y: (z - MAP_Z0) * sz });
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(20,20,30,0.75)';
    for (const [name, x, z] of [['GLASSWATER', 420, 330], ['PALMERA BEACH', 760, 180], ['OLD HARBOR', 380, 760], ['CORAL HEIGHTS', 130, 160], ['SALTMARSH', 130, 560], ['THE BAY', 960, 600]]) { const q = P(x, z); ctx.fillText(name, q.x, q.y); }
    for (const b of g.activities.blips()) { const q = P(b.x, b.z); drawBlip(ctx, q.x, q.y, BLIP_STYLE[b.icon], 9); }
    if (!g.missions.active && g.missions.next) { const m = g.missions.giverPos(g.missions.next); const q = P(m.x, m.z); drawBlip(ctx, q.x, q.y, BLIP_STYLE.mission, 11); }
    const t = g.missions.currentTarget() ?? g.activities.currentTarget();
    if (t) { const q = P(t.x, t.z); drawBlip(ctx, q.x, q.y, BLIP_STYLE.target, 10); }
    const p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos;
    const q = P(pp.x, pp.z);
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(-(p.vehicle ? p.vehicle.yaw : p.yaw) + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }

  hideMap() { this.map.classList.add('hidden'); this.open = null; }
}
