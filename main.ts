// Salt & Neon — a Palmera Bay story: the gta6-01 entry (Node 22, standard library only).
// The game is game/: an original open-world crime game in three.js (vendored as
// game/vendor/three.module.min.js), plain static files that run offline from game/index.html.
// Palmera Bay has five districts, weather, traffic that obeys traffic lights, cars to steal, tune and
// jump off ramps, a five-star police response with roadblocks and a helicopter, nine story missions
// in two chapters, races, cab and courier jobs, hold-ups, turf wars, businesses, skills, a phone, a
// HUD with a rotating minimap, synthesised sound and radio, a title screen and save slots.
// This program hands it in: it copies game/ and screenshots/ (1-chase.jpg is the cover) to
// /output and writes /output/dossier.json with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080. `node tools/smoke.mjs <url>`
// plays every system once in headless Chrome and prints PASS or FAIL for each.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
