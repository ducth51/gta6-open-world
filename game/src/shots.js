// Screenshot scenes behind ?shot=<name>: each sets up a real moment of play (filled in below).
export function runShotScene(game, name) {
  if (name === 'title') { game.showTitle(); return; }
  game.startGame(null);
}
