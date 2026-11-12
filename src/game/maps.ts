export const T = {
  GRASS: 0,
  WALL: 1,
  FLOOR: 2,
  DOOR: 3,
  PATH: 4,
  EXIT: 5,
  DESK: 6,
  TREE: 7,
  BOUND: 8,
} as const;

export type TileType = (typeof T)[keyof typeof T];

export type ZoneStyle =
  | "hostel"
  | "canteen"
  | "library"
  | "audi"
  | "pavilion"
  | "lab"
  | "acad"
  | "admin"
  | "server"
  | "hangar"
  | "security"
  | "garden"
  | "playground"
  | "lawn"
  | "parking"
  | "plaza"
  | "helipad";

export type Zone = {
  id: string;
  name: string;
  rect: [number, number, number, number];
  type: "building" | "outdoor";
  style: ZoneStyle;
  wallColor?: number | undefined;
  roofColor?: number | undefined;
};

export type Exit = {
  id: string;
  name: string;
  tiles: [number, number][];
};

export type LandmarkKind =
  | "fountain"
  | "flagpole"
  | "helipad_pad"
  | "basketball"
  | "bus"
  | "container"
  | "statue"
  | "lamp";

export type MapLandmark = {
  kind: LandmarkKind;
  x: number;
  y: number;
  rot?: number | undefined;
  color?: number | undefined;
};

export type MapAtmosphere = {
  skyHex: number;
  fogHex: number;
  fogDensity: number;
  ambientHex: number;
  ambientInt: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiInt: number;
  sunHex: number;
  sunInt: number;
  sunPos: [number, number, number];
  groundHex: number;
  groundAltHex: number;
  pathHex: number;
  floorHex: number;
  wallHex: number;
  wallTrimHex: number;
  accentHex: number;
  minimapBg: string;
};

export type MapConfig = {
  id: string;
  name: string;
  subtitle: string;
  tag: string;
  description: string;
  w: number;
  h: number;
  playerStart: [number, number];
  startZoneId: string;
  zones: Zone[];
  exits: Exit[];
  patrols: [number, number][][];
  teachers: string[];
  atmosphere: MapAtmosphere;
  landmarks: MapLandmark[];
  buildGrid: () => Uint8Array;
};

export const blocks = (t: number) => t === T.WALL || t === T.DESK || t === T.TREE || t === T.BOUND;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function createGridWriter(w: number, h: number) {
  const g = new Uint8Array(w * h);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = t;
  };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? (g[y * w + x] ?? 0) : T.BOUND);
  return { g, set, get };
}

function buildBuildingsAndBoundary(
  w: number,
  h: number,
  zones: Zone[],
  exits: Exit[],
  set: (x: number, y: number, t: number) => void,
) {
  for (const z of zones) {
    if (z.type !== "building") continue;
    const [x, y, bw, bh] = z.rect;
    for (let yy = y; yy < y + bh; yy++) {
      for (let xx = x; xx < x + bw; xx++) {
        const edge = xx === x || yy === y || xx === x + bw - 1 || yy === y + bh - 1;
        set(xx, yy, edge ? T.WALL : T.FLOOR);
      }
    }
    const mx = x + Math.floor(bw / 2) - 1;
    const my = y + Math.floor(bh / 2) - 1;
    set(mx, y + bh - 1, T.DOOR);
    set(mx + 1, y + bh - 1, T.DOOR);
    if (y > 1) {
      set(mx, y, T.DOOR);
      set(mx + 1, y, T.DOOR);
    }
    if (x > 1) {
      set(x, my, T.DOOR);
      set(x, my + 1, T.DOOR);
    }
    if (x + bw < w - 1) {
      set(x + bw - 1, my, T.DOOR);
      set(x + bw - 1, my + 1, T.DOOR);
    }
    for (let yy = y + 2; yy <= y + bh - 3; yy += 2) {
      for (let xx = x + 2; xx + 1 <= x + bw - 3; xx += 3) {
        if (Math.abs(xx - mx) <= 1 || Math.abs(xx + 1 - mx) <= 1 || Math.abs(xx - mx - 1) <= 1) continue;
        if (yy >= my - 1 && yy <= my + 2) continue;
        set(xx, yy, T.DESK);
        set(xx + 1, yy, T.DESK);
      }
    }
  }

  for (let x = 0; x < w; x++) {
    set(x, 0, T.BOUND);
    set(x, h - 1, T.BOUND);
  }
  for (let y = 0; y < h; y++) {
    set(0, y, T.BOUND);
    set(w - 1, y, T.BOUND);
  }
  for (const e of exits) {
    for (const [x, y] of e.tiles) set(x, y, T.EXIT);
  }
}

/* ------------------------------------------------------------------
   MAP 1: SUIIT BURLA CAMPUS (Classic Night Lockdown)
   ------------------------------------------------------------------ */
const SUIIT_ZONES: Zone[] = [
  { id: "hostel_b", name: "Boys' Hostel", rect: [2, 1, 12, 6], type: "building", style: "hostel" },
  { id: "hostel_g", name: "Girls' Hostel", rect: [38, 1, 12, 6], type: "building", style: "hostel" },
  { id: "canteen", name: "Canteen / Mess", rect: [3, 9, 11, 6], type: "building", style: "canteen" },
  { id: "garden", name: "Garden", rect: [18, 2, 16, 7], type: "outdoor", style: "garden" },
  { id: "playground", name: "Playground", rect: [52, 2, 10, 8], type: "outdoor", style: "playground" },
  { id: "library", name: "Central Library", rect: [3, 17, 11, 7], type: "building", style: "library" },
  { id: "lawn", name: "Central Lawn", rect: [18, 14, 20, 8], type: "outdoor", style: "lawn" },
  { id: "audi", name: "Auditorium", rect: [42, 14, 12, 8], type: "building", style: "audi" },
  { id: "pavilion", name: "Sports Pavilion", rect: [55, 14, 7, 6], type: "building", style: "pavilion" },
  { id: "lab", name: "Lab / Computer Centre", rect: [2, 26, 11, 6], type: "building", style: "lab" },
  { id: "acad_a", name: "Academic Block A", rect: [16, 25, 11, 7], type: "building", style: "acad" },
  { id: "acad_b", name: "Academic Block B", rect: [29, 25, 10, 7], type: "building", style: "acad" },
  { id: "admin", name: "Admin Block", rect: [42, 24, 13, 8], type: "building", style: "admin" },
  { id: "parking", name: "Parking", rect: [2, 33, 14, 5], type: "outdoor", style: "parking" },
];

const SUIIT_EXITS: Exit[] = [
  { id: "gate_main", name: "Main Gate", tiles: [[30, 39], [31, 39], [32, 39], [33, 39]] },
  { id: "gate_back", name: "Back Gate", tiles: [[0, 23], [0, 24]] },
  { id: "service", name: "Service Lane", tiles: [[0, 35], [0, 36]] },
  { id: "wall_gap", name: "Wall Gap", tiles: [[63, 11], [63, 12]] },
];

const SUIIT_PATROLS: [number, number][][] = [
  [[30.5, 36.5]],
  [[33.5, 36.5]],
  [[19, 14.5], [37, 14.5], [37, 21.5], [19, 21.5]],
  [[16, 11.5], [50, 11.5]],
  [[15, 23.5], [41, 23.5]],
  [[44, 26.5], [53, 30.5], [44, 30.5]],
  [[27.5, 24], [27.5, 34]],
  [[15.5, 15], [15.5, 31]],
  [[44, 16], [52, 20]],
  [[4, 34.5], [14, 37]],
  [[53, 3.5], [60, 9]],
  [[17, 9.5], [36, 9.5], [36, 3], [17, 3]],
  [[56, 21.5], [62, 22.5], [62, 30]],
];

const SUIIT_LANDMARKS: MapLandmark[] = [
  { kind: "fountain", x: 28, y: 18 },
  { kind: "flagpole", x: 31.5, y: 34.5 },
  { kind: "basketball", x: 57, y: 6 },
  { kind: "lamp", x: 15.5, y: 8 },
  { kind: "lamp", x: 15.5, y: 19 },
  { kind: "lamp", x: 15.5, y: 31 },
  { kind: "lamp", x: 39.5, y: 8 },
  { kind: "lamp", x: 39.5, y: 19 },
  { kind: "lamp", x: 39.5, y: 31 },
  { kind: "lamp", x: 26, y: 11.5 },
  { kind: "lamp", x: 26, y: 23.5 },
  { kind: "lamp", x: 49, y: 11.5 },
  { kind: "lamp", x: 49, y: 23.5 },
];

function buildSuiitGrid(): Uint8Array {
  const W = 64;
  const H = 40;
  const { g, set, get } = createGridWriter(W, H);
  for (let x = 1; x < W - 1; x++) {
    set(x, 11, T.PATH);
    set(x, 12, T.PATH);
    set(x, 23, T.PATH);
    set(x, 24, T.PATH);
  }
  for (let y = 1; y < H - 1; y++) {
    set(15, y, T.PATH);
    set(16, y, T.PATH);
    set(39, y, T.PATH);
    set(40, y, T.PATH);
  }
  for (let y = 22; y < H; y++) {
    set(31, y, T.PATH);
    set(32, y, T.PATH);
  }
  for (let x = 17; x < 39; x++) set(x, 13, T.PATH);

  buildBuildingsAndBoundary(W, H, SUIIT_ZONES, SUIIT_EXITS, set);

  const r = rng(42);
  for (let i = 0; i < 40; i++) {
    const x = 18 + Math.floor(r() * 16);
    const y = 2 + Math.floor(r() * 7);
    if (get(x, y) === T.GRASS) set(x, y, T.TREE);
  }
  for (let i = 0; i < 14; i++) {
    const x = 19 + Math.floor(r() * 18);
    const y = 15 + Math.floor(r() * 6);
    if (get(x, y) === T.GRASS && (x + y) % 3 === 0 && Math.hypot(x - 28, y - 18) > 2.5) set(x, y, T.TREE);
  }
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(r() * 12);
    const y = 34 + Math.floor(r() * 3);
    if (get(x, y) === T.GRASS && x % 3 === 0) set(x, y, T.DESK);
  }
  return g;
}

/* ------------------------------------------------------------------
   MAP 2: HOSTEL & COURTYARD QUAD (Midnight Tactical)
   ------------------------------------------------------------------ */
const QUAD_ZONES: Zone[] = [
  { id: "hostel_nw", name: "North Hostel West", rect: [2, 2, 11, 7], type: "building", style: "hostel" },
  { id: "quad_garden", name: "Botanical Quad", rect: [17, 2, 20, 7], type: "outdoor", style: "garden" },
  { id: "hostel_ne", name: "North Hostel East", rect: [42, 2, 12, 7], type: "building", style: "hostel" },
  { id: "mess_hall", name: "Grand Mess Hall", rect: [2, 13, 11, 10], type: "building", style: "canteen" },
  { id: "central_plaza", name: "Central Plaza", rect: [17, 13, 20, 10], type: "outdoor", style: "plaza" },
  { id: "lecture_hall", name: "Lecture Complex", rect: [42, 13, 12, 10], type: "building", style: "audi" },
  { id: "faculty_wing", name: "Faculty Block", rect: [2, 28, 11, 7], type: "building", style: "admin" },
  { id: "science_block", name: "Physics & Chem Lab", rect: [17, 28, 9, 7], type: "building", style: "lab" },
  { id: "study_center", name: "Reading Hall", rect: [30, 28, 8, 7], type: "building", style: "library" },
  { id: "bus_bay", name: "Campus Bus Bay", rect: [42, 28, 12, 8], type: "outdoor", style: "parking" },
];

const QUAD_EXITS: Exit[] = [
  { id: "north_bus_gate", name: "North Bus Gate", tiles: [[26, 0], [27, 0], [28, 0], [29, 0]] },
  { id: "east_faculty", name: "East Faculty Gate", tiles: [[55, 10], [55, 11]] },
  { id: "west_alley", name: "West Utility Alley", tiles: [[0, 25], [0, 26]] },
  { id: "south_breach", name: "South Perimeter Breach", tiles: [[26, 37], [27, 37], [28, 37]] },
];

const QUAD_PATROLS: [number, number][][] = [
  [[27.5, 2.5]],
  [[27.5, 35.5]],
  [[15, 11], [40, 11], [40, 25.5], [15, 25.5]],
  [[14.5, 4], [14.5, 33]],
  [[39.5, 4], [39.5, 33]],
  [[18, 18.5], [36, 18.5]],
  [[44, 15], [52, 21]],
  [[4, 10.5], [12, 10.5]],
  [[43, 25.5], [53, 25.5]],
  [[43, 30], [52, 34]],
  [[27.5, 26], [27.5, 34]],
  [[18, 8.5], [35, 8.5]],
  [[4, 26], [12, 26]],
];

const QUAD_LANDMARKS: MapLandmark[] = [
  { kind: "statue", x: 27.5, y: 18 },
  { kind: "fountain", x: 27, y: 5.5 },
  { kind: "bus", x: 45.5, y: 31.5, rot: 0 },
  { kind: "bus", x: 50.5, y: 33.5, rot: 0 },
  { kind: "lamp", x: 14.5, y: 10.5 },
  { kind: "lamp", x: 39.5, y: 10.5 },
  { kind: "lamp", x: 14.5, y: 25.5 },
  { kind: "lamp", x: 39.5, y: 25.5 },
  { kind: "lamp", x: 27.5, y: 12 },
  { kind: "lamp", x: 27.5, y: 24 },
];

function buildQuadGrid(): Uint8Array {
  const W = 56;
  const H = 38;
  const { g, set, get } = createGridWriter(W, H);
  for (let x = 1; x < W - 1; x++) {
    set(x, 10, T.PATH);
    set(x, 11, T.PATH);
    set(x, 25, T.PATH);
    set(x, 26, T.PATH);
  }
  for (let y = 1; y < H - 1; y++) {
    set(14, y, T.PATH);
    set(15, y, T.PATH);
    set(39, y, T.PATH);
    set(40, y, T.PATH);
  }
  for (let y = 1; y < H - 1; y++) {
    set(27, y, T.PATH);
    set(28, y, T.PATH);
  }
  for (let x = 16; x < 39; x++) set(x, 18, T.PATH);

  buildBuildingsAndBoundary(W, H, QUAD_ZONES, QUAD_EXITS, set);

  const r = rng(99);
  for (let i = 0; i < 32; i++) {
    const x = 18 + Math.floor(r() * 18);
    const y = 2 + Math.floor(r() * 7);
    if (get(x, y) === T.GRASS && Math.hypot(x - 27, y - 5.5) > 2.4) set(x, y, T.TREE);
  }
  for (let i = 0; i < 16; i++) {
    const x = 18 + Math.floor(r() * 18);
    const y = 14 + Math.floor(r() * 8);
    if (get(x, y) === T.GRASS && Math.hypot(x - 27.5, y - 18) > 2.5 && (x + y) % 2 === 0) set(x, y, T.TREE);
  }
  const busTiles: [number, number][] = [
    [45, 31],
    [46, 31],
    [45, 32],
    [46, 32],
    [50, 33],
    [51, 33],
    [50, 34],
    [51, 34],
  ];
  for (const [cx, cy] of busTiles) {
    if (get(cx, cy) === T.GRASS) set(cx, cy, T.DESK);
  }
  return g;
}

/* ------------------------------------------------------------------
   MAP 3: INNOVATION TECH & HELIPAD COMPLEX (Dawn Tactical)
   ------------------------------------------------------------------ */
const TECH_ZONES: Zone[] = [
  { id: "server_vault", name: "AI Server Vault", rect: [2, 2, 13, 8], type: "building", style: "server" },
  { id: "atrium", name: "Glass Atrium", rect: [19, 2, 9, 8], type: "building", style: "admin" },
  { id: "research_wing", name: "Cyber Research Lab", rect: [32, 2, 9, 8], type: "building", style: "lab" },
  { id: "helipad", name: "Helipad Roof Deck", rect: [45, 2, 13, 9], type: "outdoor", style: "helipad" },
  { id: "robotics", name: "Robotics Hangar", rect: [2, 14, 13, 10], type: "building", style: "hangar" },
  { id: "cafeteria", name: "Tech Cafeteria", rect: [19, 14, 9, 10], type: "building", style: "canteen" },
  { id: "innovation_plaza", name: "Innovation Plaza", rect: [32, 14, 9, 10], type: "outdoor", style: "plaza" },
  { id: "conf_audi", name: "Tech Auditorium", rect: [45, 14, 13, 10], type: "building", style: "audi" },
  { id: "archives", name: "Digital Archives", rect: [2, 29, 13, 8], type: "building", style: "library" },
  { id: "maker_lab", name: "Design Studio", rect: [19, 29, 9, 8], type: "building", style: "acad" },
  { id: "command_hub", name: "Security Hub", rect: [32, 29, 9, 8], type: "building", style: "security" },
  { id: "loading_dock", name: "Logistics & Dock", rect: [45, 29, 13, 9], type: "outdoor", style: "parking" },
];

const TECH_EXITS: Exit[] = [
  { id: "helipad_extract", name: "Helipad Extraction", tiles: [[59, 5], [59, 6], [59, 7]] },
  { id: "main_blvd", name: "Main Boulevard", tiles: [[28, 39], [29, 39], [30, 39], [31, 39]] },
  { id: "west_service", name: "West Service Gate", tiles: [[0, 11], [0, 12]] },
  { id: "dock_gate", name: "Loading Dock Gate", tiles: [[59, 32], [59, 33]] },
];

const TECH_PATROLS: [number, number][][] = [
  [[50.5, 6.5]],
  [[29.5, 36.5]],
  [[16.5, 12], [42.5, 12], [42.5, 26.5], [16.5, 26.5]],
  [[29.5, 3], [29.5, 35]],
  [[43, 4], [43, 35]],
  [[16.5, 4], [16.5, 35]],
  [[33, 16], [39, 22]],
  [[47, 16], [56, 22]],
  [[4, 16], [13, 22]],
  [[47, 30], [56, 36]],
  [[3, 11.5], [15, 11.5]],
  [[3, 26.5], [15, 26.5]],
  [[44, 11.5], [57, 11.5]],
];

const TECH_LANDMARKS: MapLandmark[] = [
  { kind: "helipad_pad", x: 51.5, y: 6.5 },
  { kind: "statue", x: 36.5, y: 19 },
  { kind: "container", x: 48, y: 31.5, rot: 0, color: 0xd97706 },
  { kind: "container", x: 53.5, y: 31.5, rot: 0, color: 0x0284c7 },
  { kind: "container", x: 49.5, y: 35.5, rot: Math.PI / 2, color: 0x475569 },
  { kind: "lamp", x: 16.5, y: 11.5 },
  { kind: "lamp", x: 42.5, y: 11.5 },
  { kind: "lamp", x: 16.5, y: 26.5 },
  { kind: "lamp", x: 42.5, y: 26.5 },
  { kind: "lamp", x: 29.5, y: 11.5 },
  { kind: "lamp", x: 29.5, y: 26.5 },
];

function buildTechGrid(): Uint8Array {
  const W = 60;
  const H = 40;
  const { g, set, get } = createGridWriter(W, H);
  for (let x = 1; x < W - 1; x++) {
    set(x, 11, T.PATH);
    set(x, 12, T.PATH);
    set(x, 26, T.PATH);
    set(x, 27, T.PATH);
  }
  for (let y = 1; y < H - 1; y++) {
    set(16, y, T.PATH);
    set(17, y, T.PATH);
    set(42, y, T.PATH);
    set(43, y, T.PATH);
  }
  for (let y = 1; y < H - 1; y++) {
    set(29, y, T.PATH);
    set(30, y, T.PATH);
  }
  // Connect helipad & loading dock cleanly to east perimeter exits
  for (const y of [5, 6, 7, 32, 33]) set(58, y, T.PATH);

  buildBuildingsAndBoundary(W, H, TECH_ZONES, TECH_EXITS, set);

  const r = rng(137);
  for (let i = 0; i < 14; i++) {
    const x = 33 + Math.floor(r() * 7);
    const y = 15 + Math.floor(r() * 8);
    if (get(x, y) === T.GRASS && Math.hypot(x - 36.5, y - 19) > 2.2) set(x, y, T.TREE);
  }
  const containerTiles: [number, number][] = [
    [47, 31],
    [48, 31],
    [49, 31],
    [53, 31],
    [54, 31],
    [49, 35],
    [50, 35],
    [49, 36],
    [50, 36],
  ];
  for (const [cx, cy] of containerTiles) {
    if (get(cx, cy) === T.GRASS) set(cx, cy, T.DESK);
  }
  return g;
}

export const MAPS: MapConfig[] = [
  {
    id: "suiit_campus",
    name: "SUIIT Burla Campus",
    subtitle: "Night Lockdown · Original Grounds",
    tag: "Classic Campus",
    description:
      "Full 3D recreation of SUIIT Burla — hostels, canteen, central library, lawn fountain, computer lab, academic blocks, and perimeter gates under moonlit lockdown.",
    w: 64,
    h: 40,
    playerStart: [8.5, 12.5],
    startZoneId: "canteen",
    zones: SUIIT_ZONES,
    exits: SUIIT_EXITS,
    patrols: SUIIT_PATROLS,
    teachers: [
      "Prof. Mishra",
      "Dr. Panda",
      "Prof. Sahu",
      "Dr. Nayak",
      "Prof. Behera",
      "Dr. Patnaik",
      "Prof. Das",
      "Dr. Mohanty",
      "Prof. Rath",
      "Dr. Pradhan",
    ],
    atmosphere: {
      skyHex: 0x070c18,
      fogHex: 0x091022,
      fogDensity: 0.011,
      ambientHex: 0x7a92c4,
      ambientInt: 1.25,
      hemiSkyHex: 0x84a4eb,
      hemiGroundHex: 0x223347,
      hemiInt: 1.1,
      sunHex: 0xb7d4ff,
      sunInt: 1.55,
      sunPos: [38, 48, 26],
      groundHex: 0x11252a,
      groundAltHex: 0x142c30,
      pathHex: 0x263149,
      floorHex: 0x1d263e,
      wallHex: 0x35476e,
      wallTrimHex: 0x5874ad,
      accentHex: 0x27e0f0,
      minimapBg: "#0b1020",
    },
    landmarks: SUIIT_LANDMARKS,
    buildGrid: buildSuiitGrid,
  },
  {
    id: "hostel_quad",
    name: "Hostel & Courtyard Quad",
    subtitle: "Midnight Raid · Tight Corridors",
    tag: "Close Quarters",
    description:
      "Dense courtyard quad linking both hostels, the Grand Mess Hall, Lecture Complex, and a Campus Bus Bay packed with vehicle cover.",
    w: 56,
    h: 38,
    playerStart: [7.5, 18],
    startZoneId: "mess_hall",
    zones: QUAD_ZONES,
    exits: QUAD_EXITS,
    patrols: QUAD_PATROLS,
    teachers: [
      "Dr. Biswal",
      "Prof. Mohapatra",
      "Dr. Tripathy",
      "Prof. Swain",
      "Dr. Senapati",
      "Prof. Jena",
      "Dr. Kar",
      "Prof. Satpathy",
    ],
    atmosphere: {
      skyHex: 0x080a16,
      fogHex: 0x0d1224,
      fogDensity: 0.013,
      ambientHex: 0x7b8ec4,
      ambientInt: 1.2,
      hemiSkyHex: 0x7ea0e6,
      hemiGroundHex: 0x222940,
      hemiInt: 1.05,
      sunHex: 0x99bfff,
      sunInt: 1.45,
      sunPos: [-25, 45, 22],
      groundHex: 0x102126,
      groundAltHex: 0x13262d,
      pathHex: 0x293044,
      floorHex: 0x212942,
      wallHex: 0x454f74,
      wallTrimHex: 0x7685b8,
      accentHex: 0x38bdf8,
      minimapBg: "#0d1224",
    },
    landmarks: QUAD_LANDMARKS,
    buildGrid: buildQuadGrid,
  },
  {
    id: "tech_park",
    name: "Innovation & Helipad Complex",
    subtitle: "Pre-Dawn Extraction · High-Tech Wing",
    tag: "Helipad Extract",
    description:
      "Modern AI server vaults, robotics hangar, glass atrium, cargo loading dock, and an active rooftop helipad extraction point at pre-dawn.",
    w: 60,
    h: 40,
    playerStart: [23.5, 19],
    startZoneId: "cafeteria",
    zones: TECH_ZONES,
    exits: TECH_EXITS,
    patrols: TECH_PATROLS,
    teachers: [
      "Dr. Nayak",
      "Prof. Sahu",
      "Dr. Parida",
      "Prof. Rout",
      "Dr. Panda",
      "Prof. Sahoo",
      "Dr. Behera",
      "Prof. Mahalik",
      "Dr. Bhoi",
    ],
    atmosphere: {
      skyHex: 0x13192b,
      fogHex: 0x182038,
      fogDensity: 0.009,
      ambientHex: 0x9eb0db,
      ambientInt: 1.3,
      hemiSkyHex: 0xffcfa3,
      hemiGroundHex: 0x25314d,
      hemiInt: 1.1,
      sunHex: 0xffd2a8,
      sunInt: 1.65,
      sunPos: [45, 42, -20],
      groundHex: 0x15252e,
      groundAltHex: 0x182a34,
      pathHex: 0x2b364a,
      floorHex: 0x202c42,
      wallHex: 0x3b4d6b,
      wallTrimHex: 0x6787b3,
      accentHex: 0xf59e0b,
      minimapBg: "#13192b",
    },
    landmarks: TECH_LANDMARKS,
    buildGrid: buildTechGrid,
  },
];

export function getMap(id?: string): MapConfig {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}

export function zoneAt(map: MapConfig, x: number, y: number): Zone | undefined {
  return map.zones.find(
    (z) => x >= z.rect[0] && y >= z.rect[1] && x < z.rect[0] + z.rect[2] && y < z.rect[1] + z.rect[3],
  );
}
