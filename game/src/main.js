// Entry point: builds the game, then shows the title screen, or a screenshot scene when the page
// is opened with ?shot=<name>.
import { Game } from './core/game.js';
import { runShotScene } from './shots.js';

const game = new Game(document.getElementById('viewport'));
window.__game = game;
const shot = new URLSearchParams(location.search).get('shot');
if (shot) runShotScene(game, shot);
else game.showTitle();
game.run();
