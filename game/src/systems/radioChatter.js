// The people on the radio. Each of the three stations has a host who breaks into the music every
// minute or two with a line that fits what is happening: the weather, the hour, a police chase,
// Sol's bank balance, her stunts, how far the story has got. Lines show as subtitles at the bottom.
import { services } from '../core/services.js';
import { rng } from '../util/mathx.js';

const HOSTS = [
  {
    host: 'Marlo Reyes, Neon Tide FM',
    general: ['Eighty-eight point one, where the synths never close.', 'Palmera Bay, population: a lot of people in a hurry.', 'That one goes out to everyone stuck behind a Tidewater van.'],
    rain: ['Rain on the glass, neon on the road. Perfect.', 'It is wet out there. Brake early, drive pretty.'],
    storm: ['Thunder on the bay. Stay in, or do not, I am a DJ not your mother.'],
    night: ['Midnight in Palmera Bay and the Sunwheel is still turning.', 'The night shift is out. Wave at the taxis.'],
    wanted: ['Police scanner is chatty tonight. Somebody is having a bad evening.', 'Helicopters over Glasswater. Whoever you are: good luck.'],
    rich: ['Somebody on the road is doing very well for themselves. Wave.'],
    stunt: ['A car left the beach and kept going. Witnesses say it was beautiful.'],
    story: ['Rumour has it the Gilded Hand is not having a good week.'],
  },
  {
    host: 'Lina Okoro, Palm Static',
    general: ['Ninety-seven three. Low and slow, the way the tide intended.', 'Breathe in, breathe out, and please use your indicators.', 'Here is one for the long way home.'],
    rain: ['A soft rain over Coral Heights. Open a window, put the kettle on.', 'Wet roads, soft songs. Stay with me.'],
    storm: ['Lightning over the bay. Count the seconds if it helps.'],
    night: ['Late now. The moon is out and so are we.', 'To the ones still awake: this is for you.'],
    wanted: ['Sirens again. I turn the music up when they come. It helps.'],
    rich: ['Money does not buy happiness, but it buys a lovely fast car.'],
    stunt: ['I saw a red car fly past the lifeguard tower. I am still smiling.'],
    story: ['They say Calloway Shipping is moving in on the beachfront. Watch your wallets.'],
  },
  {
    host: 'Big Dembow Dee, Bassline Bay',
    general: ['One-oh-four five! Bass in the boot, bills in the glovebox!', 'You are listening to the only station with its own subwoofer!', 'Turn it up till the mirrors rattle!'],
    rain: ['Rain? Rain just means the dance floor is bigger!', 'Wet streets, hot beats!'],
    storm: ['Thunder is just the sky doing a drum solo!'],
    night: ['The night is young and so are the speakers!', 'Lights on, windows down, bass up!'],
    wanted: ['I hear sirens. Sounds like a remix!', 'Somebody is outrunning the po-po. Respect.'],
    rich: ['Big money in the building! Drop a coin in the radio!'],
    stunt: ['Somebody flew off the beach in a Vortex. Dee approves!'],
    story: ['Kane? Gone. Holt? Questioned. Palmera Bay just got interesting!'],
  },
];

export class RadioChatter {
  constructor(game) {
    this.game = game;
    this.timer = rng.range(35, 60);
    this.last = '';
    services.radioChatter = this;
  }

  /** Which kinds of line fit the moment. 'general' is always one of them. */
  topics() {
    const g = this.game;
    const topics = ['general'];
    if (g.weather.kind === 'storm') topics.push('storm', 'storm');
    else if (g.weather.raining) topics.push('rain', 'rain');
    if (g.sky.night > 0.6) topics.push('night', 'night');
    if (g.police.level > 0) topics.push('wanted', 'wanted', 'wanted');
    if (g.player.money > 20000) topics.push('rich');
    if (g.stunts.done.size > 0 || g.stunts.bestJump > 20) topics.push('stunt');
    if (g.missions.index >= 3) topics.push('story');
    return topics;
  }

  update(dt) {
    const g = this.game;
    const radio = g.radio;
    if (!g.player.vehicle || !radio.on || g.state !== 'play') return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rng.range(70, 120);
    this.say(radio.station);
  }

  say(station) {
    const host = HOSTS[station] ?? HOSTS[0];
    const topics = this.topics();
    for (let tries = 0; tries < 4; tries++) {
      const lines = host[rng.pick(topics)];
      const line = rng.pick(lines);
      if (line === this.last && tries < 3) continue;
      this.last = line;
      this.game.dialogue.bark(`<b>${host.host}</b>: “${line}”`, 5.5);
      return line;
    }
    return null;
  }
}
