// Chapter Two, "Low Tide": with Kane gone, Inez Calloway of Calloway Shipping moves in on the
// beachfront and Detective Holt changes sides again. Four more missions: tail Holt without being
// seen, rob the Sunwheel cashbox with a helicopter on your back, break up an armoured convoy, and
// run Holt down. They use the same step data as chapter one, plus two new steps written here.
import { step, guards } from './storyMissions.js';
import { LaneDriver } from '../ai/laneDriver.js';
import { PIER } from '../world/cityPlan.js';
import { dist2 } from '../util/mathx.js';

/** Stay between `min` and `max` metres behind a moving car for `seconds`, or lose it. */
function follow(key, text, { min = 14, max = 75, seconds = 55 } = {}) {
  return {
    text,
    target: (g, ctx) => ctx[key]?.pos,
    progress: (g, ctx) => `${Math.min(100, Math.round(((ctx.tailT ?? 0) / seconds) * 100))}%`,
    update: (g, ctx, dt) => {
      const car = ctx[key];
      if (!car || car.dead) return 'fail:Holt’s car was wrecked.';
      const pos = g.player.vehicle ? g.player.vehicle.pos : g.player.pos;
      const d = dist2(pos.x, pos.z, car.pos.x, car.pos.z);
      ctx.hint = null;
      if (d < min) {
        ctx.hint = 'Too close — he will spot you. Drop back.';
        ctx.spotted = (ctx.spotted ?? 0) + dt;
        if (ctx.spotted > 4) return 'fail:Holt spotted you.';
      } else ctx.spotted = Math.max(0, (ctx.spotted ?? 0) - dt);
      if (d > max) {
        ctx.hint = 'You are losing him! Catch up.';
        ctx.lostT = (ctx.lostT ?? 0) + dt;
        if (ctx.lostT > 7) return 'fail:You lost Holt.';
      } else ctx.lostT = Math.max(0, (ctx.lostT ?? 0) - dt);
      if (d >= min && d <= max) ctx.tailT = (ctx.tailT ?? 0) + dt;
      if (ctx.tailT >= seconds) { ctx.hint = null; car.ai.mode = 'park'; return 'done'; }
      return null;
    },
  };
}

/** Wreck every vehicle in ctx[group]; damaged ones bolt for it. */
function destroyAll(group, text, seconds) {
  return {
    text,
    seconds,
    target: (g, ctx) => (ctx[group] ?? []).find((v) => !v.dead)?.pos,
    progress: (g, ctx) => { const all = ctx[group] ?? []; return `${all.filter((v) => v.dead).length}/${all.length}`; },
    update: (g, ctx) => {
      const all = ctx[group] ?? [];
      for (const v of all) {
        if (v.dead) {
          if (!v.paid) {
            v.paid = true;
            for (let i = 0; i < 3; i++) g.events.dropCash(v.pos.x + (i - 1) * 2.4, v.pos.z + 1.5, 300 + i * 120);
          }
          continue;
        }
        if (v.health < v.def.health * 0.95 && v.ai.mode === 'cruise') { v.ai.mode = 'flee'; v.ai.cruise = 23; }
        if (v.ai.mode === 'flee') v.ai.target = { x: g.player.pos.x, z: g.player.pos.z };
      }
      return all.every((v) => v.dead) ? 'done' : null;
    },
  };
}

const at = (g, id) => g.plan.landmarks[id].block;

export const CHAPTER_TWO = [
  {
    id: 'tail', title: 'Quiet Tail', giver: 'garage', reward: 3500,
    intro: [['Benny', 'Chief, a little bird says Holt has been taking meetings. Dockside, after dark, with a new boss.'], ['Sol', 'Inez Calloway. The shipping money behind Kane.'], ['Benny', 'Stay on him, but not too close. That man can smell a tail.']],
    setup: (g, ctx) => {
      const b = at(g, 'police');
      ctx.holt = g.spawnTrafficVehicle('marlin', b.cx + 24, b.z1 + 8, 'route', 0x16191f);
      ctx.holt.ai.target = { x: at(g, 'salvage').cx, z: at(g, 'salvage').z0 - 8 };
      ctx.holt.mission = 'tail';
      ctx.holt.persistent = true;
      ctx.holt.ai.cruise = 13;
      const y = at(g, 'salvage');
      ctx.guards = guards(g, y.cx, y.z0 + 30, [[-14, 0], [12, -4], [0, 10], [-8, 18]]);
    },
    steps: [
      step.goTo((g, ctx) => g.missions.ctx.holt?.pos ?? g.player.pos, 'Find Holt’s black Marlin by PBPD Headquarters.', 32),
      follow('holt', 'Tail Holt’s Marlin. Stay 15 to 75 metres back.', { min: 15, max: 75, seconds: 50 }),
      step.goTo('salvage', 'Holt has parked at Dockside Salvage. Get a look at the yard.', 26),
      step.eliminate('guards', 'The lookouts saw you. Clear the yard.'),
    ],
    outro: [['Sol', 'A signed shipping manifest. Calloway Shipping is moving cash through the Sunwheel booth on the pier.'], ['Benny', 'Then we help ourselves. Come see me.']],
  },
  {
    id: 'sunwheel', title: 'Sunwheel Score', giver: 'garage', reward: 6500,
    intro: [['Benny', 'The pier cashbox: three weeks of Calloway’s ticket money, guarded by six men and a view.'], ['Sol', 'And the cops?'], ['Benny', 'They will come. Probably with a helicopter. Drive like you mean it.']],
    setup: (g, ctx) => {
      const x = PIER.x1 - 96, z = PIER.z;
      ctx.guards = guards(g, x, z, [[-6, -3], [4, 3], [14, -4], [-16, 3], [22, 2], [30, -2]]);
    },
    steps: [
      step.goTo({ x: PIER.x1 - 110, z: PIER.z }, 'Head out along Sunwheel Pier.', 22),
      step.eliminate('guards', 'Take out the guards on the pier.'),
      step.goTo({ x: PIER.x1 - 28, z: PIER.z }, 'Take the cashbox from the Sunwheel ticket booth.', 3.5),
      { text: 'The alarm is ringing. Here comes everything.', update: (g) => { g.police.setLevel(Math.max(3, g.police.level)); return 'done'; } },
      step.loseCops('Lose the cops. A helicopter is up — get under cover.'),
      step.goTo('garage', 'Bring the cash to Benny’s Garage.', 8),
    ],
    outro: [['Benny', 'Beautiful. Four seconds of airtime off the quay would have been prettier, but beautiful.'], ['Benny', 'Rosa wants you. Something about trucks.']],
  },
  {
    id: 'convoy', title: 'Cash Convoy', giver: 'diner', reward: 5500,
    intro: [['Rosa', 'Calloway moves the beach takings in three armoured vans. They loop around Old Harbor.'], ['Sol', 'How would you know that?'], ['Rosa', 'I serve their drivers breakfast. Salt on the eggs, salt on the secrets.']],
    setup: (g, ctx) => {
      ctx.vans = ['garage', 'gunshop', 'spray'].map((id, i) => {
        const b = at(g, id);
        const v = g.spawnTrafficVehicle('tidewater', b.cx + i * 6, b.z1 + 8, 'cruise', 0x3d4a5a);
        v.health = 240;
        v.mission = 'convoy';
        v.persistent = true;
        v.ai.cruise = 14;
        return v;
      });
    },
    steps: [
      step.goTo((g) => g.missions.ctx.vans?.find((v) => !v.dead)?.pos ?? g.player.pos, 'Find Calloway’s armoured vans around Old Harbor.', 55),
      destroyAll('vans', 'Wreck all three armoured vans. Cash spills when they go.', 210),
      { text: 'Somebody called it in. Sirens.', update: (g) => { g.police.setLevel(Math.max(2, g.police.level)); return 'done'; } },
      step.loseCops('Lose the cops with the cash.'),
      step.goTo('diner', 'Bring Rosa her cut.', 7),
    ],
    outro: [['Rosa', 'Three vans! Mija, I said a little trouble, not a parade.'], ['Sol', 'Calloway will come now. Where does Holt sleep?'], ['Rosa', 'Wherever the money is. Dockside.']],
  },
  {
    id: 'lowtide', title: 'Low Tide', giver: 'garage', reward: 15000,
    intro: [['Holt', 'Vega. Pick up the phone next time. I have news and a boat.'], ['Sol', 'I know. Dockside, tonight. You and Calloway.'], ['Holt', 'Then you know how this ends. Come and get me.']],
    setup: (g, ctx) => {
      const y = at(g, 'salvage');
      ctx.guards = guards(g, y.cx, y.z0 + 28, [[0, 8], [-14, 0], [14, 0], [-10, 16], [10, 16], [-20, 8], [20, 8]], {
        boss: true, bossLook: 'holt', bossLine: ['Holt', 'Should have... taken the pension.'],
      });
      ctx.car = g.spawnVehicle('police', y.cx + 20, y.z1 + 8, Math.PI, 0x15181e);
      ctx.car.health = 210;
      ctx.car.persistent = true;
      ctx.car.mission = 'lowtide';
    },
    steps: [
      step.goTo('salvage', 'Go to Dockside Salvage. Buy armour and a heavier gun first.', 22),
      step.eliminate('guards', 'Take down Holt and Calloway’s crew.'),
      {
        text: 'Holt is running in a stolen interceptor! Wreck it.',
        seconds: 150,
        target: (g, ctx) => ctx.car?.pos,
        update: (g, ctx) => {
          const car = ctx.car;
          if (!car.ai) {
            car.ai = new LaneDriver(car, 'flee');
            car.driver = { npc: true };
            car.sirenOn = true;
            car.ai.cruise = 26;
            car.ai.rejoin();
            g.police.setLevel(Math.max(3, g.police.level));
          }
          car.ai.target = { x: g.player.pos.x, z: g.player.pos.z };
          return car.dead ? 'done' : null;
        },
      },
      step.loseCops('Lose the cops. Holt had friends on the force.'),
      step.goTo('safehouse', 'Go home to the bungalow. It is over.', 6),
    ],
    outro: [['Sol', 'Holt is gone. Calloway is gone. The beach belongs to the people who live on it.'], ['Rosa', 'Eat. All of you. Tomás, you wash the dishes.'], ['Sol', 'Palmera Bay. Sun, salt and neon.']],
    credits: true,
  },
];
