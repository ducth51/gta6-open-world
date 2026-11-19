// World layout, tuning numbers and the names of Palmera Bay: every constant the systems share.

export const GAME_TITLE = 'Salt & Neon';
export const CITY_NAME = 'Palmera Bay';

/** City grid: GRID x GRID blocks, each BLOCK metres square, separated by ROAD-wide streets. */
export const BLOCK = 64;
export const ROAD = 16;
export const CELL = BLOCK + ROAD;
export const GRID = 10;
export const CITY_SIZE = GRID * CELL + ROAD;
/** The beach runs east of the city, then the ocean. */
export const BEACH_WIDTH = 70;
export const OCEAN_X = CITY_SIZE + BEACH_WIDTH;
export const SIDEWALK = 4;
/** Lane centres sit this far either side of a road's centre line. */
export const LANE_OFFSET = 4;

export const PHYSICS_STEP = 1 / 60;
export const GRAVITY = 22;

/** One in-game minute per real second: a full day takes 24 minutes. */
export const MINUTES_PER_SECOND = 1;
export const START_HOUR = 17.4;

export const PLAYER_NAME = 'Marisol "Sol" Vega';

export const STREETS_NS = ['Harbor Way', 'Cypress St', 'Orchid Ave', 'Bayfront Blvd', 'Mango St', 'Sunset Ave', 'Coral Rd', 'Pelican St', 'Seabreeze Ave', 'Lagoon St', 'Shoreline Parade'];
export const STREETS_EW = ['Northgate Rd', 'Flamingo St', 'Palma Ave', 'Vesper St', 'Grand Ave', 'Tidewater Rd', 'Salt St', 'Dockside Ave', 'Ferry St', 'Wharf Rd', 'Breakwater Rd'];

export const DISTRICTS = {
  glasswater: { name: 'Glasswater', blurb: 'Downtown towers' },
  beach: { name: 'Palmera Beach', blurb: 'Pastel hotels and neon' },
  harbor: { name: 'Old Harbor', blurb: 'Warehouses and cranes' },
  heights: { name: 'Coral Heights', blurb: 'Bungalows and lawns' },
  saltmarsh: { name: 'Saltmarsh', blurb: 'Yards and trailers' },
  park: { name: 'Fountain Park', blurb: 'Green heart of the city' },
};

/** Weapon tuning; damage is per pellet. */
export const WEAPONS = {
  fists: { name: 'Fists', damage: 18, range: 1.8, rate: 0.45, melee: true, clip: 0, price: 0 },
  pistol: { name: 'Kestrel 9', damage: 26, range: 70, rate: 0.28, spread: 0.012, clip: 12, reload: 1.1, price: 300, ammoPrice: 60, ammoPack: 36 },
  smg: { name: 'Hornet SMG', damage: 15, range: 55, rate: 0.085, spread: 0.035, clip: 30, reload: 1.6, price: 1200, ammoPrice: 120, ammoPack: 90 },
  shotgun: { name: 'Breaker 12', damage: 13, pellets: 8, range: 28, rate: 0.85, spread: 0.08, clip: 6, reload: 2.0, price: 1800, ammoPrice: 150, ammoPack: 18 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

/** Respawn and penalty rules. */
export const HOSPITAL_FEE = 250;
export const BUSTED_FEE = 400;
