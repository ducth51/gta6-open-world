// The shared handles every system reaches for (scene, colliders, effects, audio, the game itself),
// filled in once by the Game at start-up so modules do not import each other in circles.
export const services = {
  scene: null,
  camera: null,
  colliders: null,
  plan: null,
  effects: null,
  audio: null,
  game: null,
  time: 0,
};
