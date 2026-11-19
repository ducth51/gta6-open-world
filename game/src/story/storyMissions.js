// The five story missions of Salt & Neon, written as data: who gives each one, what they say, and
// the steps (go here, steal that, clear the yard, wreck the van, lose the cops) with their rewards.
import { LOOKS } from '../entities/humanoid.js';
import { dist2 } from '../util/mathx.js';

/** Step factories. Each returns { text, target(game), update(game, ctx, dt) -> 'done' | 'fail:<why>' | null }. */
export const step = {
  enterAnyVehicle: (text = 'Get a car.') => ({ text, update: (g) => (g.player.vehicle ? 'done' : null) }),

  goTo: (where, text, radius = 6, opts = {}) => ({
    text,
    target: (g) => resolve(g, where),
    update: (g) => {
      const p = resolve(g, where);
      const pos = g.player.vehicle ? g.player.vehicle.pos : g.player.pos;
      if (opts.vehicle && !g.player.vehicle) return null;
      if (opts.slow && g.player.vehicle && g.player.vehicle.speed > 8) return null;
      return dist2(pos.x, pos.z, p.x, p.z) < radius ? 'done' : null;
    },
  }),

  stealMarked: (key, text) => ({
    text,
    target: (g, ctx) => ctx[key]?.pos,
    update: (g, ctx) => {
      const v = ctx[key];
      if (!v || v.dead) return 'fail:The car was destroyed.';
      return g.player.vehicle === v ? 'done' : null;
    },
  }),

  deliver: (key, where, text) => ({
    text,
    target: (g) => resolve(g, where),
    update: (g, ctx) => {
      const v = ctx[key];
      if (!v || v.dead) return 'fail:The car was destroyed.';
      const p = resolve(g, where);
      if (g.player.vehicle !== v) { ctx.hint = 'Get back in the car.'; return null; }
      ctx.hint = null;
      return dist2(v.pos.x, v.pos.z, p.x, p.z) < 7 && v.speed < 4 ? 'done' : null;
    },
  }),

  eliminate: (group, text) => ({
    text,
    marker: false,
    target: (g, ctx) => ctx[group]?.find((p) => !p.dead)?.pos,
    progress: (g, ctx) => { const all = ctx[group] ?? []; return `${all.filter((p) => p.dead).length}/${all.length}`; },
    update: (g, ctx) => ((ctx[group] ?? []).every((p) => p.dead) ? 'done' : null),
  }),

  destroy: (key, text) => ({
    text,
    target: (g, ctx) => ctx[key]?.pos,
    update: (g, ctx) => (ctx[key]?.dead ? 'done' : null),
  }),

  loseCops: (text = 'Lose the cops.') => ({ text, update: (g) => (g.police.level === 0 ? 'done' : null) }),

  timed: (inner, seconds) => ({ ...inner, seconds }),
};

function resolve(g, where) {
  if (typeof where === 'function') return where(g);
  if (where.x !== undefined) return where;
  return g.plan.landmarks[where].door;
}

/** Spawns a group of Gilded Hand gunmen around a point and returns them. */
function guards(g, cx, cz, offsets, opts = {}) {
  return offsets.map(([dx, dz], i) => {
    const p = g.peds.spawn(opts.boss && i === 0 ? LOOKS.kane : LOOKS.gang, cx + dx, cz + dz, 'gang');
    p.guardPoint = { x: cx + dx, z: cz + dz };
    p.persistent = true;
    p.mission = true;
    if (opts.boss && i === 0) { p.health = p.maxHealth = 260; p.armor = 100; p.weapon = 'shotgun'; p.accuracy = 0.5; p.isBoss = true; }
    return p;
  });
}

export const STORY = [
  {
    id: 'homecoming', title: 'Homecoming', giver: 'safehouse', reward: 500,
    intro: [['Sol', 'Three years. The bungalow still smells like salt and motor oil.'], ['Sol', "Rosa's going to kill me for not calling. Better grab some wheels."]],
    steps: [
      step.enterAnyVehicle('Get a car. Walk up to one and press F — anyone in it gets pulled out.'),
      step.goTo('diner', "Drive to Rosa's Diner on the beach.", 7),
    ],
    outro: [['Rosa', 'Mija! Look at you. Sit, eat. ...Tomás is in trouble.'], ['Rosa', 'He owes the Gilded Hand forty thousand. They took the deed to this diner as collateral.'], ['Sol', "Then I'll get it back. Who do I see about money in this town?"], ['Rosa', 'Benny Two-Tones still runs the garage in Old Harbor. Go.']],
  },
  {
    id: 'twotone', title: 'Two-Tone Job', giver: 'garage', reward: 1500,
    intro: [['Benny', 'Sol Vega! Chief! I heard you got out. You still drive like a hurricane?'], ['Benny', 'A Vortex GT is sitting in Coral Heights. Owner is a Kane lawyer. Bring it here in one piece.']],
    setup: (g, ctx) => {
      const spot = { x: g.plan.landmarks.safehouse.block.x1 + 10, z: g.plan.landmarks.safehouse.block.z1 + 40 };
      const lot = g.plan.blocks.find((b) => b.bi === 2 && b.bj === 3);
      ctx.car = g.spawnVehicle('vortex', lot ? lot.x0 - 4 : spot.x, lot ? lot.cz : spot.z, Math.PI / 2, 0xff3b5c);
      ctx.car.mission = 'twotone';
      ctx.car.persistent = true;
    },
    steps: [
      step.stealMarked('car', 'Steal the red Vortex GT in Coral Heights.'),
      { text: 'The alarm tripped! Get the car to Benny’s Garage.', update: (g) => { g.police.setLevel(Math.max(1, g.police.level)); return 'done'; } },
      step.deliver('car', 'garage', 'Deliver the Vortex GT to Benny’s Garage in Old Harbor.'),
      step.loseCops('Lose the cops before Benny opens the door.'),
    ],
    outro: [['Benny', 'Not a scratch! Well, a few. Here — a Kestrel 9, on the house. You’ll need it.'], ['Benny', 'The Gilded Hand keeps a cash yard in Saltmarsh. Rosa knows.']],
    onPass: (g) => { g.player.giveWeapon('pistol', 60); g.player.selectWeapon('pistol'); g.notify('Got the Kestrel 9 pistol. Aim with right mouse, fire with left.'); },
  },
  {
    id: 'collection', title: 'Collection Day', giver: 'diner', reward: 2500,
    intro: [['Rosa', 'They collect from every shop on the beach on Fridays and count it in a yard in Saltmarsh.'], ['Rosa', 'Their ledger has every name. Take it, and Kane has nothing on Tomás.'], ['Sol', 'Keep the coffee hot.']],
    setup: (g, ctx) => {
      const b = g.plan.landmarks.stash.block;
      ctx.guards = guards(g, b.cx, b.z0 + 26, [[-12, -8], [10, -6], [-4, 6], [14, 14], [-16, 18], [2, 22]]);
    },
    steps: [
      step.goTo('stash', 'Go to the Gilded Hand yard in Saltmarsh.', 18),
      step.eliminate('guards', 'Take out the Gilded Hand guards.'),
      step.goTo((g) => ({ x: g.plan.landmarks.stash.block.cx, z: g.plan.landmarks.stash.block.z1 - 20 }), 'Grab the ledger from the shed.', 3),
      { text: 'Sirens! Someone called it in.', update: (g) => { g.police.setLevel(2); return 'done'; } },
      step.loseCops('Lose the cops with the ledger.'),
    ],
    outro: [['Sol', 'Names, dates, a lot of zeros... and a cop. Detective Holt takes a cut of everything.'], ['Rosa', 'Holt? He eats here every Tuesday. Pig.']],
  },
  {
    id: 'ledger', title: 'Hot Ledger', giver: 'police', reward: 4000,
    intro: [['Holt', 'Vega. You have something of mine. Relax, I’m not here to arrest you.'], ['Holt', 'Kane’s cutting me loose. His courier van moves tonight’s cash out of the harbor. Wreck it.'], ['Holt', 'You keep half. I keep my pension. Everybody wins.']],
    setup: (g, ctx) => {
      const b = g.plan.landmarks.garage.block;
      ctx.van = g.spawnTrafficVehicle('tidewater', b.cx, b.z1 + 8, 'flee', 0xd4af37);
      ctx.van.health = ctx.van.def.health = 220;
      ctx.van.mission = 'ledger';
      ctx.van.persistent = true;
    },
    steps: [
      step.goTo((g) => ({ x: g.plan.landmarks.garage.block.cx, z: g.plan.landmarks.garage.block.z1 + 8 }), 'Find the gold courier van near the harbor.', 45, { vehicle: false }),
      { text: 'It’s running! Ram it or shoot it until it blows.', target: (g, ctx) => ctx.van?.pos, update: (g, ctx) => { if (ctx.van.ai) { ctx.van.ai.mode = 'flee'; ctx.van.ai.target = g.player.pos; ctx.van.ai.cruise = 22; } if (!ctx.van.dead) return null; ctx.vanWreck = { x: ctx.van.pos.x + 3, z: ctx.van.pos.z }; return 'done'; }, seconds: 150 },
      step.goTo((g, ctx) => g.missions.ctx.vanWreck ?? g.player.pos, 'Grab the cash bag from the wreck.', 4),
      step.loseCops(),
      step.goTo((g) => ({ x: g.plan.landmarks.police.block.cx + 30, z: g.plan.landmarks.police.block.z1 + 8 }), 'Bring Holt his half behind PBPD HQ.', 6),
    ],
    outro: [['Holt', 'Pleasure. Kane will be in his tower tonight, throwing himself a party.'], ['Holt', 'I didn’t tell you that. I was never here.']],
  },
  {
    id: 'finale', title: 'The Gilded Hand', giver: 'diner', reward: 10000,
    intro: [['Rosa', 'Tomás called. Kane has him at the tower. Says the debt is paid when the diner is his.'], ['Sol', 'Debt’s paid tonight. One way or the other.']],
    setup: (g, ctx) => {
      const b = g.plan.landmarks.kane.block;
      ctx.guards = guards(g, b.cx, b.z0 + 12, [[0, 18], [-14, 2], [14, 2], [-20, 14], [20, 14], [-8, 22], [8, 22], [0, 6]], { boss: true });
    },
    steps: [
      step.goTo('kane', 'Go to Kane Tower in Glasswater. Buy a better gun at Bayside Arms first.', 20),
      { text: 'Kane’s security is armed. The cops are already rolling.', update: (g) => { g.police.setLevel(Math.max(2, g.police.level)); return 'done'; } },
      step.eliminate('guards', 'Take down Victor Kane and his security.'),
      { text: 'Tomás is free!', update: (g) => { g.police.setLevel(3); return 'done'; } },
      step.goTo('safehouse', 'Escape to Sol’s Bungalow in Coral Heights.', 6),
    ],
    outro: [['Tomás', 'Sol... I’m sorry. I’m so sorry.'], ['Sol', 'Save it. Rosa’s making breakfast. Everyone eats.']],
    credits: true,
  },
];

export const STORY_BY_ID = Object.fromEntries(STORY.map((m) => [m.id, m]));
