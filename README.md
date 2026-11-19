# Salt & Neon — a Palmera Bay story

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ducth51/gta6-open-world/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/ducth51/gta6-open-world/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game that runs offline in a desktop browser. Sol Vega walks out of prison into **Palmera Bay** — a sun-soaked coastal city of glass towers, pastel beach hotels, harbour cranes and neon — and finds her family owes the Gilded Hand syndicate. Two chapters, nine missions, and a city full of things to do between them.

![Cover](screenshots/1-chase.jpg)

## Play

```
node serve.ts        # then open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look and aim |
| Shift / Space | Sprint / jump, handbrake in a car |
| F | Enter, steal or leave a car |
| Left / right mouse | Shoot or punch / aim over the shoulder |
| Q E, wheel, 1–4 | Switch weapon · R reloads (radio station in a car) |
| E | Start missions, shop, save, collect, hold up a store |
| V | Take a fare in a cab / take a vigilante call in a patrol car |
| T | Phone: cab, Benny's delivery, skills, garage, wardrobe, business, weather, stats, trophies |
| H horn · G siren · M map (click to set a waypoint) · Esc pause | |

## What's in it

- **City**: five districts (Glasswater downtown, Palmera Beach, Old Harbor, Coral Heights, Saltmarsh), Fountain Park, the beach, the Sunwheel pier, a bay with sailboats and ferries, seagulls, day/night cycle with golden hour and lit windows.
- **Weather**: haze, overcast, rain and thunderstorms with lightning and thunder; roads turn dark and slippery (less grip), pedestrians put up umbrellas.
- **Life**: lane-following AI traffic that obeys **traffic lights** at all 121 junctions, brakes and honks; pedestrians who walk, cross, flee and get run over; parked cars in lots.
- **Cars**: eight original models, arcade physics with handbrake drifts, **ramp jumps**, damage, smoke, fire and explosions; engine, tyre and armour upgrades.
- **Police**: five-star wanted level, dispatched patrol cars and riot vans, **roadblocks**, a **helicopter with a searchlight** that can be shot down, officers who arrest or open fire, BUSTED and WASTED.
- **Story**: nine missions in two chapters — Homecoming, Two-Tone Job, Collection Day, Hot Ledger, The Gilded Hand; then Quiet Tail, Sunwheel Score, Cash Convoy and Low Tide.
- **Activities**: street races, Bay Couriers, Bay Cab fares, vigilante duty, store hold-ups, eight stunt jumps, drift scoring, street events (muggings, armoured trucks, ambushes), turf wars, 15 Sun Tokens.
- **Progression**: four skills that grow with use, three businesses and four turf blocks that earn by the hour, a wardrobe, sixteen trophies.
- **Polish**: rotating minimap with GPS route and waypoints, full map, objectives and timers, subtitles, a phone, synthesised sound effects, engine, sirens, rain, rotors and gulls, three generated radio stations with hosts who react to what is happening, title and pause menus, save/load.

All names, characters, art, sound and music are original; nothing is taken from any commercial game.

## Layout

`game/src/world` builds the city, ramps and bay, `entities` the people, cars and helicopter, `ai` the drivers, `systems` police, combat, weather, traffic lights, missions, activities, jobs, economy, audio and saving, `ui` the HUD, phone and menus, `story` the script. `main.ts` hands the game in for make.fun; `tools/playtest.mjs` drives the game in headless Chrome and `tools/smoke.mjs` checks every system.

Run `node tools/smoke.mjs http://localhost:8080/index.html` with the server up to see PASS or FAIL for twenty-two checks, one per system.

MIT licensed.
