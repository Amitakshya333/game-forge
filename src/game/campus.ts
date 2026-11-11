// Fictional approximation of the SUIIT Burla campus. Edit zones/exits here to match the real layout.
export const W = 64;
export const H = 40;
export const TILE = 32;

export const T = { GRASS: 0, WALL: 1, FLOOR: 2, DOOR: 3, PATH: 4, EXIT: 5, DESK: 6, TREE: 7, BOUND: 8 } as const;

export type Zone = { id: string; name: string; rect: [number, number, number, number]; type: "building" | "outdoor" };

export const ZONES: Zone[] = [
  { id: "hostel_b", name: "Boys' Hostel", rect: [2, 1, 12, 6], type: "building" },
  { id: "hostel_g", name: "Girls' Hostel", rect: [38, 1, 12, 6], type: "building" },
  { id: "canteen", name: "Canteen / Mess", rect: [3, 9, 11, 6], type: "building" },
  { id: "garden", name: "Garden", rect: [18, 2, 16, 7], type: "outdoor" },
  { id: "playground", name: "Playground", rect: [52, 2, 10, 8], type: "outdoor" },
  { id: "library", name: "Central Library", rect: [3, 17, 11, 7], type: "building" },
  { id: "lawn", name: "Central Lawn", rect: [18, 14, 20, 8], type: "outdoor" },
  { id: "audi", name: "Auditorium", rect: [42, 14, 12, 8], type: "building" },
  { id: "pavilion", name: "Sports Pavilion", rect: [55, 14, 7, 6], type: "building" },
  { id: "lab", name: "Lab / Computer Centre", rect: [2, 26, 11, 6], type: "building" },
  { id: "acad_a", name: "Academic Block A", rect: [16, 25, 11, 7], type: "building" },
  { id: "acad_b", name: "Academic Block B", rect: [29, 25, 10, 7], type: "building" },
  { id: "admin", name: "Admin Block", rect: [42, 24, 13, 8], type: "building" },
  { id: "parking", name: "Parking", rect: [2, 33, 14, 5], type: "outdoor" },
];

export type Exit = { id: string; name: string; tiles: [number, number][] };
export const EXITS: Exit[] = [
  { id: "gate_main", name: "Main Gate", tiles: [[30, 39], [31, 39], [32, 39], [33, 39]] },
  { id: "gate_back", name: "Back Gate", tiles: [[0, 23], [0, 24]] },
  { id: "service", name: "Service Lane", tiles: [[0, 35], [0, 36]] },
  { id: "wall_gap", name: "Wall Gap", tiles: [[63, 11], [63, 12]] },
];

export const TEACHERS = ["Prof. Mishra", "Dr. Panda", "Prof. Sahu", "Dr. Nayak", "Prof. Behera", "Dr. Patnaik", "Prof. Das", "Dr. Mohanty", "Prof. Rath", "Dr. Pradhan"];

// hostile patrol loops (tile coords). Single point = stationary guard.
export const PATROLS: [number, number][][] = [
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

export const blocks = (t: number) => t === T.WALL || t === T.DESK || t === T.TREE || t === T.BOUND;

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function buildGrid(): Uint8Array {
  const g = new Uint8Array(W * H);
  const set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = t; };
  const get = (x: number, y: number) => g[y * W + x];
  // paths
  for (let x = 1; x < W - 1; x++) { set(x, 11, T.PATH); set(x, 12, T.PATH); set(x, 23, T.PATH); set(x, 24, T.PATH); }
  for (let y = 1; y < H - 1; y++) { set(15, y, T.PATH); set(16, y, T.PATH); set(39, y, T.PATH); set(40, y, T.PATH); }
  for (let y = 22; y < H; y++) { set(31, y, T.PATH); set(32, y, T.PATH); }
  for (let x = 17; x < 39; x++) set(x, 13, T.PATH);
  // buildings
  for (const z of ZONES) {
    if (z.type !== "building") continue;
    const [x, y, w, h] = z.rect;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      set(xx, yy, edge ? T.WALL : T.FLOOR);
    }
    const mx = x + Math.floor(w / 2) - 1, my = y + Math.floor(h / 2) - 1;
    set(mx, y + h - 1, T.DOOR); set(mx + 1, y + h - 1, T.DOOR);
    if (y > 1) { set(mx, y, T.DOOR); set(mx + 1, y, T.DOOR); }
    if (x > 1) { set(x, my, T.DOOR); set(x, my + 1, T.DOOR); }
    if (x + w < W - 1) { set(x + w - 1, my, T.DOOR); set(x + w - 1, my + 1, T.DOOR); }
    for (let yy = y + 2; yy <= y + h - 3; yy += 2) for (let xx = x + 2; xx + 1 <= x + w - 3; xx += 3) {
      if (Math.abs(xx - mx) <= 1 || Math.abs(xx + 1 - mx) <= 1 || Math.abs(xx - mx - 1) <= 1) continue;
      if (yy >= my - 1 && yy <= my + 2) continue;
      set(xx, yy, T.DESK); set(xx + 1, yy, T.DESK);
    }
  }
  // trees & benches
  const r = rng(42);
  for (let i = 0; i < 40; i++) {
    const x = 18 + Math.floor(r() * 16), y = 2 + Math.floor(r() * 7);
    if (get(x, y) === T.GRASS) set(x, y, T.TREE);
  }
  for (let i = 0; i < 14; i++) {
    const x = 19 + Math.floor(r() * 18), y = 15 + Math.floor(r() * 6);
    if (get(x, y) === T.GRASS && (x + y) % 3 === 0) set(x, y, T.TREE);
  }
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(r() * 12), y = 34 + Math.floor(r() * 3);
    if (get(x, y) === T.GRASS && x % 3 === 0) set(x, y, T.DESK); // parked cars
  }
  // boundary
  for (let x = 0; x < W; x++) { set(x, 0, T.BOUND); set(x, H - 1, T.BOUND); }
  for (let y = 0; y < H; y++) { set(0, y, T.BOUND); set(W - 1, y, T.BOUND); }
  for (const e of EXITS) for (const [x, y] of e.tiles) set(x, y, T.EXIT);
  return g;
}

export function zoneAt(x: number, y: number): Zone | undefined {
  return ZONES.find((z) => x >= z.rect[0] && y >= z.rect[1] && x < z.rect[0] + z.rect[2] && y < z.rect[1] + z.rect[3]);
}
