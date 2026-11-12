// @ts-nocheck -- hot-path simulation grid lookups.
import { sfx } from "./audio";
import { blocks, getMap, T, zoneAt, type MapConfig } from "./maps";
import {
  Renderer3D,
  type RenderBottle,
  type RenderParticle,
} from "./renderer3d";

export type Difficulty = "rookie" | "veteran" | "elite" | "nightmare";
type V = { x: number; y: number };
type HState = "patrol" | "suspicious" | "investigate" | "alert" | "search" | "grab" | "down";
interface Hostile {
  id: string;
  x: number;
  y: number;
  facing: number;
  hp: number;
  state: HState;
  aw: number;
  route: V[];
  wp: number;
  path: V[];
  pathT: number;
  pathGoal?: V;
  target?: V;
  fireCd: number;
  searchT: number;
  grab?: string;
  sees: boolean;
  lostT: number;
  civT: number;
  muzzleT: number;
}
type CState = "hide" | "follow" | "captured" | "evac";
interface Civ {
  id: string;
  kind: "student" | "teacher";
  name: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  state: CState;
  leader: string | null;
  group: string;
  holder?: string;
  route?: V[];
  planned: boolean;
  color: string;
  exitId?: string;
}
interface Noise {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  color: string;
}
interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
}
interface Pickup {
  id: string;
  x: number;
  y: number;
  kind: "ammo" | "med";
  amt: number;
}
interface Float {
  x: number;
  y: number;
  text: string;
  t: number;
  color: string;
}

export interface Snapshot {
  hp: number;
  stamina: number;
  focus: number;
  mag: number;
  reserve: number;
  bottles: number;
  stance: string;
  evac: number;
  total: number;
  captured: number;
  following: number;
  down: number;
  hostiles: number;
  alert: number;
  heat: number;
  timeLeft: number;
  mode: "act" | "think";
  prompt: string;
  toast: string;
  radio: string;
  selected: string | null;
  plannedGroups: number;
  slowmo: boolean;
  mapName: string;
  zoneName: string;
  camPreset: "tactical" | "close";
}

export interface Result {
  win: boolean;
  path: "clear" | "evac" | "perfect" | "fail";
  reason: string;
  evac: number;
  total: number;
  captured: number;
  down: number;
  hostiles: number;
  alerts: number;
  shots: number;
  takedowns: number;
  planned: number;
  time: number;
  stars: number;
  score: number;
  tips: string[];
  mapName: string;
}

const DIFF = {
  rookie: { hostiles: 9, hp: 80, dmg: 8, acc: 0.6, range: 7.5, fire: 1.1, time: 720, waves: 1, grab: 2.2 },
  veteran: { hostiles: 11, hp: 100, dmg: 11, acc: 0.75, range: 8.5, fire: 0.95, time: 600, waves: 1, grab: 1.5 },
  elite: { hostiles: 13, hp: 110, dmg: 14, acc: 0.85, range: 9.5, fire: 0.8, time: 480, waves: 2, grab: 1.1 },
  nightmare: { hostiles: 13, hp: 130, dmg: 18, acc: 0.95, range: 10.5, fire: 0.7, time: 420, waves: 3, grab: 0.9 },
};
const FOV = (100 * Math.PI) / 180;
const SHIRTS = ["#e8ecf5", "#ffd27a", "#9fd3ff", "#ff9eb5", "#c9b8ff", "#b6f5d0", "#ffe9a8"];

const C = {
  cyan: "#27e0f0",
  amber: "#ffb020",
  red: "#ff3b5c",
  mint: "#4cf2a0",
  white: "#e8ecf5",
};

export class Engine {
  map: MapConfig;
  W: number;
  H: number;
  grid: Uint8Array;
  canvas: HTMLCanvasElement;
  radarCanvas: HTMLCanvasElement | null;
  renderer3d: Renderer3D;
  d: (typeof DIFF)["rookie"];

  player: {
    x: number;
    y: number;
    facing: number;
    hp: number;
    stamina: number;
    stance: "sneak" | "walk" | "run";
    mag: number;
    reserve: number;
    bottles: number;
    fireCd: number;
    stepT: number;
    reloadT: number;
    muzzleT: number;
    throwT: number;
    takedownT: number;
    moving: boolean;
    curStance: "sneak" | "walk" | "run";
  };

  hostiles: Hostile[] = [];
  civs: Civ[] = [];
  noises: Noise[] = [];
  tracers: Tracer[] = [];
  bottles: RenderBottle[] = [];
  particles: RenderParticle[] = [];
  pickups: Pickup[] = [];
  floats: Float[] = [];

  mode: "act" | "think" = "think";
  focus = 100;
  slowmo = false;
  time = 0;
  timeLeft: number;
  heat = 0;
  waves = 0;
  status: "playing" | "won" | "lost" = "playing";
  endT = 0;
  result?: Result;

  keys = new Set<string>();
  mouse = { ndcX: 0, ndcY: 0, down: false, rightDown: false, dragDist: 0, lastX: 0, lastY: 0 };
  selected: string | null = null;
  risk: Float32Array;
  firstThink = true;
  toastMsg = "";
  toastT = 0;
  radioMsg = "";
  radioT = 0;
  stats = { alerts: 0, shots: 0, takedowns: 0 };
  fields = new Map<string, { t: number; d: Int32Array }>();
  raf = 0;
  last = 0;
  acc = 0;
  onEnd: (r: Result) => void;
  disposed = false;
  totalHostiles = 0;
  pickupCounter = 0;

  constructor(
    canvas: HTMLCanvasElement,
    diff: Difficulty,
    onEnd: (r: Result) => void,
    mapId = "suiit_campus",
    radarCanvas: HTMLCanvasElement | null = null,
  ) {
    this.canvas = canvas;
    this.radarCanvas = radarCanvas;
    this.map = getMap(mapId);
    this.W = this.map.w;
    this.H = this.map.h;
    this.grid = this.map.buildGrid();
    this.risk = new Float32Array(this.W * this.H);

    this.d = DIFF[diff];
    this.onEnd = onEnd;
    this.timeLeft = this.d.time;

    const [px, py] = this.map.playerStart;
    this.player = {
      x: px,
      y: py,
      facing: 0,
      hp: 100,
      stamina: 100,
      stance: "walk",
      mag: 10,
      reserve: 20,
      bottles: 5,
      fireCd: 0,
      stepT: 0,
      reloadT: 0,
      muzzleT: 0,
      throwT: 0,
      takedownT: 0,
      moving: false,
      curStance: "walk",
    };

    this.spawn();
    this.computeRisk();
    this.renderer3d = new Renderer3D(canvas, this.map, this.grid);
    this.bind();
    this.resize();
    this.radio(
      `Meera: You're awake at ${this.map.name}? Hostiles breached the perimeter. Plan in 3D Think Mode — click a teacher, then an exit.`,
    );
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- setup ----------
  spawn() {
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const patrols = this.map.patrols;
    for (let i = 0; i < this.d.hostiles; i++) {
      const pts = patrols[i % patrols.length].map(([x, y]) => this.snap({ x, y }));
      this.hostiles.push(this.mkHostile(`h${i}`, pts[0], pts));
    }
    this.totalHostiles = this.hostiles.length;

    let ti = 0;
    for (const z of this.map.zones) {
      if (z.type !== "building") continue;
      const [x, y, w, h] = z.rect;
      const free: V[] = [];
      for (let yy = y + 1; yy < y + h - 1; yy++) {
        for (let xx = x + 1; xx < x + w - 1; xx++) {
          if (this.grid[yy * this.W + xx] === T.FLOOR) free.push({ x: xx + 0.5, y: yy + 0.5 });
        }
      }
      if (z.id === this.map.startZoneId || free.length < 3) continue;
      const gid = `t${ti}`;
      const n = 3 + Math.floor(r() * 4);
      const pick = () => free.splice(Math.floor(r() * free.length), 1)[0];
      const tp = pick();
      this.civs.push({
        id: gid,
        kind: "teacher",
        name: this.map.teachers[ti % this.map.teachers.length],
        ...tp,
        facing: r() * Math.PI * 2,
        moving: false,
        state: "hide",
        leader: null,
        group: gid,
        planned: false,
        color: C.mint,
      });
      for (let i = 0; i < n && free.length; i++) {
        this.civs.push({
          id: `${gid}s${i}`,
          kind: "student",
          name: "Student",
          ...pick(),
          facing: r() * Math.PI * 2,
          moving: false,
          state: "hide",
          leader: null,
          group: gid,
          planned: false,
          color: SHIRTS[Math.floor(r() * SHIRTS.length)],
        });
      }
      ti++;
      if (r() < 0.55 && free.length) {
        this.pickups.push({
          id: `pk${this.pickupCounter++}`,
          ...pick(),
          kind: r() < 0.5 ? "med" : "ammo",
          amt: 0,
        });
      }
    }

    // Friends nearby in the starting building
    const [sx, sy] = this.map.playerStart;
    for (let i = 0; i < 3; i++) {
      const sp = this.snap({ x: sx - 1.5 + i * 1.5, y: sy + 1 });
      this.civs.push({
        id: `c${i}`,
        kind: "student",
        name: "Student",
        ...sp,
        facing: 0,
        moving: false,
        state: "hide",
        leader: null,
        group: "none",
        planned: false,
        color: SHIRTS[i],
      });
    }
  }

  mkHostile(id: string, p: V, route: V[]): Hostile {
    return {
      id,
      x: p.x,
      y: p.y,
      facing: -Math.PI / 2,
      hp: this.d.hp,
      state: "patrol",
      aw: 0,
      route,
      wp: 0,
      path: [],
      pathT: 0,
      fireCd: 1,
      searchT: 0,
      sees: false,
      lostT: 0,
      civT: 0,
      muzzleT: 0,
    };
  }

  snap(p: V): V {
    let best = p;
    let bd = 1e9;
    for (let y = 1; y < this.H - 1; y++) {
      for (let x = 1; x < this.W - 1; x++) {
        if (!this.walk(x, y)) continue;
        const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return best;
  }

  // ---------- grid helpers ----------
  tile(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.W || y >= this.H ? T.BOUND : this.grid[y * this.W + x];
  }
  walk(x: number, y: number) {
    return !blocks(this.tile(x, y));
  }
  los(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const n = Math.ceil(dist / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blocks(this.tile(Math.floor(ax + dx * t), Math.floor(ay + dy * t)))) return false;
    }
    return true;
  }
  canSee(h: Hostile, x: number, y: number, range: number) {
    const dx = x - h.x;
    const dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    let a = Math.atan2(dy, dx) - h.facing;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > FOV / 2 && d > 1.2) return false;
    return this.los(h.x, h.y, x, y);
  }
  nbrs(i: number, out: number[]) {
    out.length = 0;
    const x = i % this.W;
    const y = (i / this.W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.walk(nx, ny)) continue;
        if (dx && dy && (!this.walk(x + dx, y) || !this.walk(x, y + dy))) continue;
        out.push(ny * this.W + nx);
      }
    }
    return out;
  }
  astar(s: V, g: V, useRisk = false): V[] {
    const si = Math.floor(s.y) * this.W + Math.floor(s.x);
    const gi = Math.floor(g.y) * this.W + Math.floor(g.x);
    if (!this.walk(gi % this.W, (gi / this.W) | 0)) return [];
    const gs = new Float32Array(this.W * this.H).fill(Infinity);
    const came = new Int32Array(this.W * this.H).fill(-1);
    const closed = new Uint8Array(this.W * this.H);
    const open: number[] = [si];
    gs[si] = 0;
    const nb: number[] = [];
    const hfn = (i: number) => Math.hypot((i % this.W) - (gi % this.W), ((i / this.W) | 0) - ((gi / this.W) | 0));
    let iter = 0;
    while (open.length && iter++ < 4500) {
      let bi = 0;
      let bf = Infinity;
      for (let k = 0; k < open.length; k++) {
        const f = gs[open[k]] + hfn(open[k]);
        if (f < bf) {
          bf = f;
          bi = k;
        }
      }
      const c = open.splice(bi, 1)[0];
      if (c === gi) break;
      closed[c] = 1;
      for (const n of this.nbrs(c, nb)) {
        if (closed[n]) continue;
        const diag = n % this.W !== c % this.W && ((n / this.W) | 0) !== ((c / this.W) | 0);
        const ng = gs[c] + (diag ? 1.414 : 1) + (useRisk ? this.risk[n] : 0);
        if (ng < gs[n]) {
          if (gs[n] === Infinity) open.push(n);
          gs[n] = ng;
          came[n] = c;
        }
      }
    }
    if (came[gi] === -1 && si !== gi) return [];
    const path: V[] = [];
    let c = gi;
    while (c !== si && c !== -1) {
      path.push({ x: (c % this.W) + 0.5, y: ((c / this.W) | 0) + 0.5 });
      c = came[c];
    }
    return path.reverse();
  }
  bfs(starts: number[]) {
    const d = new Int32Array(this.W * this.H).fill(-1);
    const q = [...starts];
    for (const s of starts) d[s] = 0;
    const nb: number[] = [];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const n of this.nbrs(c, nb)) {
        if (d[n] < 0) {
          d[n] = d[c] + 1;
          q.push(n);
        }
      }
    }
    return d;
  }
  field(key: string) {
    const f = this.fields.get(key);
    if (f && (key.startsWith("exit:") || this.time - f.t < 0.35)) return f.d;
    let starts: number[] = [];
    if (key === "player") starts = [Math.floor(this.player.y) * this.W + Math.floor(this.player.x)];
    else if (key.startsWith("exit:")) {
      starts = this.map.exits.find((e) => e.id === key.slice(5))!.tiles.map(([x, y]) => y * this.W + x);
    } else {
      const c = this.civs.find((c) => c.id === key);
      if (c) starts = [Math.floor(c.y) * this.W + Math.floor(c.x)];
    }
    const d = this.bfs(starts);
    this.fields.set(key, { t: this.time, d });
    return d;
  }
  move(e: { x: number; y: number }, dx: number, dy: number, r = 0.32) {
    const ok = (x: number, y: number) =>
      this.walk(Math.floor(x - r), Math.floor(y - r)) &&
      this.walk(Math.floor(x + r), Math.floor(y - r)) &&
      this.walk(Math.floor(x - r), Math.floor(y + r)) &&
      this.walk(Math.floor(x + r), Math.floor(y + r));
    if (ok(e.x + dx, e.y)) e.x += dx;
    if (ok(e.x, e.y + dy)) e.y += dy;
  }

  // ---------- messaging ----------
  toast(m: string) {
    this.toastMsg = m;
    this.toastT = 3;
  }
  radio(m: string) {
    this.radioMsg = m;
    this.radioT = 7;
  }
  noise(x: number, y: number, r: number, kind: "step" | "shot" | "bottle" | "whistle" | "hshot", color = C.white) {
    this.noises.push({ x, y, r: 0, t: 0, max: r, color });
    if (kind === "hshot" || kind === "whistle") return;
    for (const h of this.hostiles) {
      if (h.state === "down" || h.state === "alert") continue;
      const d = Math.hypot(h.x - x, h.y - y);
      const eff = this.los(h.x, h.y, x, y) ? r : r * 0.55;
      if (d > eff) continue;
      if (kind === "shot") this.alertH(h, { x: this.player.x, y: this.player.y });
      else {
        h.state = "investigate";
        h.target = { x, y };
        h.aw = Math.max(h.aw, 40);
        h.path = [];
        h.searchT = 0;
      }
    }
    if (kind === "shot") this.heat += 6;
  }
  alertH(h: Hostile, at: V, radio = true) {
    if (h.state !== "alert") {
      this.stats.alerts++;
      this.heat += 8;
      if (radio) sfx.alert();
    }
    h.state = "alert";
    h.aw = 100;
    h.target = { ...at };
    h.lostT = 0;
    h.path = [];
    if (h.grab) h.grab = undefined;
    if (radio) {
      for (const o of this.hostiles) {
        if (o !== h && o.state !== "down" && o.state !== "alert" && Math.hypot(o.x - h.x, o.y - h.y) < 11) {
          this.alertH(o, at, false);
        }
      }
    }
  }

  // ---------- input ----------
  bind() {
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("mousemove", this.mm);
    this.canvas.addEventListener("mousedown", this.md);
    window.addEventListener("mouseup", this.mu);
    this.canvas.addEventListener("wheel", this.wh, { passive: false });
    this.canvas.addEventListener("contextmenu", this.cm);
  }
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("mousemove", this.mm);
    this.canvas.removeEventListener("mousedown", this.md);
    window.removeEventListener("mouseup", this.mu);
    this.canvas.removeEventListener("wheel", this.wh);
    this.canvas.removeEventListener("contextmenu", this.cm);
    this.renderer3d.dispose();
  }
  cm = (e: MouseEvent) => e.preventDefault();
  resize = () => {
    const r = this.canvas.getBoundingClientRect();
    this.renderer3d.resize(r.width, r.height);
  };
  wh = (e: WheelEvent) => {
    e.preventDefault();
    if (this.mode === "act") this.renderer3d.zoomBy(e.deltaY * 0.008);
  };
  kd = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["tab", " ", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (this.status !== "playing") return;
    if (k === "tab") this.toggleThink();
    if (k === "enter" && this.mode === "think") this.toggleThink();
    if (k === "v" && this.mode === "act") {
      this.renderer3d.togglePreset();
      sfx.click();
    }
    if (this.mode === "think") return;
    if (k === "c") this.player.stance = this.player.stance === "sneak" ? "walk" : "sneak";
    if (k === "r") this.reload();
    if (k === "e") this.takedown();
    if (k === "q") this.throwBottle();
    if (k === "g") this.whistle();
    if (k === "x") this.release();
  };
  ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  mm = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      this.mouse.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
    }
    if (this.mouse.rightDown) {
      const dx = e.clientX - this.mouse.lastX;
      this.mouse.dragDist += Math.abs(dx) + Math.abs(e.clientY - this.mouse.lastY);
      if (this.mode === "act") this.renderer3d.rotateYaw(-dx * 0.008);
    }
    this.mouse.lastX = e.clientX;
    this.mouse.lastY = e.clientY;
  };
  md = (e: MouseEvent) => {
    this.mm(e);
    if (this.status !== "playing") return;
    if (e.button === 2) {
      this.mouse.rightDown = true;
      this.mouse.dragDist = 0;
      this.mouse.lastX = e.clientX;
      this.mouse.lastY = e.clientY;
      return;
    }
    if (this.mode === "think") {
      if (e.button === 0) this.thinkClick(false);
      return;
    }
    if (e.button === 0) this.mouse.down = true;
  };
  mu = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.down = false;
    if (e.button === 2) {
      if (this.mode === "think" && this.mouse.dragDist < 6) this.thinkClick(true);
      this.mouse.rightDown = false;
    }
  };
  world(useGround = false): V {
    return this.renderer3d.screenToWorld(this.mouse.ndcX, this.mouse.ndcY, useGround);
  }
  setRadarCanvas(canvas: HTMLCanvasElement | null) {
    this.radarCanvas = canvas;
  }
  toggleCameraPreset() {
    this.renderer3d.togglePreset();
    sfx.click();
  }

  // ---------- think mode ----------
  toggleThink() {
    if (this.mode === "think") {
      this.mode = "act";
      this.selected = null;
      this.firstThink = false;
      sfx.click();
      return;
    }
    if (!this.firstThink && this.focus < 15) {
      this.toast("Need 15 Focus to stop and think");
      return;
    }
    if (!this.firstThink) this.focus -= 15;
    this.mode = "think";
    this.computeRisk();
    sfx.click();
  }
  computeRisk() {
    this.risk.fill(0);
    for (const h of this.hostiles) {
      if (h.state === "down") continue;
      const rg = Math.ceil(this.d.range);
      for (let y = Math.max(0, Math.floor(h.y) - rg); y <= Math.min(this.H - 1, Math.floor(h.y) + rg); y++) {
        for (let x = Math.max(0, Math.floor(h.x) - rg); x <= Math.min(this.W - 1, Math.floor(h.x) + rg); x++) {
          const d = Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
          if (d < 4) this.risk[y * this.W + x] += 3;
          if (this.canSee(h, x + 0.5, y + 0.5, this.d.range)) this.risk[y * this.W + x] += 25;
        }
      }
      for (const p of h.route) {
        for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++) {
          for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++) {
            if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.risk[y * this.W + x] += 2;
          }
        }
      }
      if (h.route.length > 1) {
        for (let i = 0; i < h.route.length; i++) {
          const a = h.route[i];
          const b = h.route[(i + 1) % h.route.length];
          const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
          for (let k = 0; k <= n; k++) {
            const x = Math.floor(a.x + ((b.x - a.x) * k) / n);
            const y = Math.floor(a.y + ((b.y - a.y) * k) / n);
            for (let oy = -2; oy <= 2; oy++) {
              for (let ox = -2; ox <= 2; ox++) {
                const xx = x + ox;
                const yy = y + oy;
                if (xx >= 0 && yy >= 0 && xx < this.W && yy < this.H) this.risk[yy * this.W + xx] += 1.5;
              }
            }
          }
        }
      }
    }
  }
  thinkClick(right: boolean) {
    if (right) {
      this.selected = null;
      return;
    }
    const wAim = this.world(false);
    const wGround = this.world(true);
    const distTo = (px: number, py: number) =>
      Math.min(Math.hypot(px - wAim.x, py - wAim.y), Math.hypot(px - wGround.x, py - wGround.y));

    const t = this.civs.find(
      (c) => c.kind === "teacher" && (c.state === "hide" || c.state === "follow") && distTo(c.x, c.y) < 1.8,
    );
    if (t) {
      this.selected = t.id;
      sfx.click();
      return;
    }
    if (this.selected) {
      const ex = this.map.exits.find((e) => e.tiles.some(([x, y]) => distTo(x + 0.5, y + 0.5) < 3.2));
      if (ex) {
        this.assign(this.civs.find((c) => c.id === this.selected)!, ex.id);
        this.selected = null;
        sfx.chime();
        return;
      }
      this.toast("Click an exit gate (green beacon at the map edge)");
    } else {
      this.toast("Click a teacher (green ring) to plan their group's escape");
    }
  }
  assign(t: Civ, exitId: string) {
    const ex = this.map.exits.find((e) => e.id === exitId)!;
    const [tx, ty] = ex.tiles[Math.floor(ex.tiles.length / 2)];
    const route = this.astar(t, { x: tx + 0.5, y: ty + 0.5 }, true);
    if (!route.length) {
      this.toast("No path from there to that exit");
      return;
    }
    t.route = route;
    t.exitId = exitId;
    t.state = "follow";
    t.leader = "route";
    t.planned = true;
    for (const c of this.civs) {
      if (c.group === t.id && c.kind === "student" && (c.state === "hide" || (c.state === "follow" && c.leader === t.id))) {
        c.state = "follow";
        c.leader = t.id;
        c.planned = true;
      }
    }
  }
  routeRisk(path: V[]) {
    let r = 0;
    for (const p of path) r += this.risk[Math.floor(p.y) * this.W + Math.floor(p.x)];
    return r;
  }
  autoPlan() {
    this.computeRisk();
    for (const t of this.civs) {
      if (t.kind !== "teacher" || t.state !== "hide") continue;
      let best: string | null = null;
      let bc = Infinity;
      for (const ex of this.map.exits) {
        const [tx, ty] = ex.tiles[0];
        const p = this.astar(t, { x: tx + 0.5, y: ty + 0.5 }, true);
        if (!p.length) continue;
        const c = this.routeRisk(p) + p.length * 0.6;
        if (c < bc) {
          bc = c;
          best = ex.id;
        }
      }
      if (best) this.assign(t, best);
    }
    sfx.chime();
    this.toast("Auto-plan: safest routes assigned. Press Execute.");
  }

  // ---------- particles ----------
  spawnBurst(x: number, y: number, z: number, color: number, count = 8) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(ang) * spd,
        vy: 1.5 + Math.random() * 3,
        vz: Math.sin(ang) * spd,
        t: 0.45,
        maxT: 0.45,
        color,
      });
    }
  }

  // ---------- player actions ----------
  reload() {
    const p = this.player;
    if (p.mag >= 10 || p.reserve <= 0 || p.reloadT > 0) return;
    p.reloadT = 1.2;
    sfx.reload();
  }
  shoot() {
    const p = this.player;
    if (p.fireCd > 0 || p.reloadT > 0) return;
    if (p.mag <= 0) {
      sfx.empty();
      p.fireCd = 0.3;
      this.reload();
      return;
    }
    p.mag--;
    p.fireCd = 0.28;
    p.muzzleT = 0.08;
    this.stats.shots++;
    sfx.shot();
    this.renderer3d.addShake(0.14);

    const a = p.facing + (Math.random() - 0.5) * (p.curStance === "run" ? 0.18 : 0.05);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let ex = p.x;
    let ey = p.y;
    let hit: Hostile | null = null;
    for (let s = 0.4; s < 18; s += 0.15) {
      ex = p.x + dx * s;
      ey = p.y + dy * s;
      if (blocks(this.tile(Math.floor(ex), Math.floor(ey)))) break;
      hit = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - ex, h.y - ey) < 0.46) || null;
      if (hit) break;
    }
    this.tracers.push({ x1: p.x + dx * 0.4, y1: p.y + dy * 0.4, x2: ex, y2: ey, t: 0.12, color: C.cyan });
    if (hit) {
      hit.hp -= 38;
      this.spawnBurst(hit.x, 0.85, hit.y, 0x27e0f0, 7);
      this.floats.push({ x: hit.x, y: hit.y, text: "HIT", t: 0.8, color: C.cyan });
      if (hit.hp <= 0) this.down(hit, false);
      else this.alertH(hit, { x: p.x, y: p.y });
    } else {
      this.spawnBurst(ex, 0.75, ey, 0xfbbf24, 4);
    }
    this.noise(p.x, p.y, 14, "shot", C.cyan);
  }
  down(h: Hostile, silent: boolean) {
    h.state = "down";
    h.hp = 0;
    sfx.thud();
    this.spawnBurst(h.x, 0.7, h.y, 0xff3b5c, 10);
    this.floats.push({ x: h.x, y: h.y, text: silent ? "SILENT TAKEDOWN" : "NEUTRALIZED", t: 1.4, color: C.mint });
    this.pickups.push({ id: `pk${this.pickupCounter++}`, x: h.x + 0.3, y: h.y + 0.3, kind: "ammo", amt: 8 });
    if (silent) {
      this.focus = Math.min(100, this.focus + 25);
      this.stats.takedowns++;
    }
    for (const c of this.civs) {
      if (c.state === "captured" && c.holder === h.id) {
        c.state = "hide";
        c.leader = null;
        c.holder = undefined;
        this.floats.push({ x: c.x, y: c.y, text: "FREED", t: 1.2, color: C.mint });
      }
    }
    const left = this.hostiles.filter((x) => x.state !== "down").length;
    if (left === 3) this.radio("Meera: Only three of them left. You're actually doing this.");
  }
  takedown() {
    const p = this.player;
    const h = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - p.x, h.y - p.y) < 1.4);
    if (!h) return;
    if (h.state === "alert" && h.sees) {
      this.toast("They see you — can't take them down quietly!");
      return;
    }
    p.takedownT = 0.35;
    this.down(h, true);
  }
  throwBottle() {
    const p = this.player;
    if (p.bottles <= 0) {
      this.toast("No more bottles");
      return;
    }
    const w = this.world(true);
    const d = Math.hypot(w.x - p.x, w.y - p.y);
    const k = d > 11 ? 11 / d : 1;
    const tx = Math.max(1.2, Math.min(this.W - 1.2, p.x + (w.x - p.x) * k));
    const ty = Math.max(1.2, Math.min(this.H - 1.2, p.y + (w.y - p.y) * k));
    p.bottles--;
    p.throwT = 0.35;
    sfx.click();
    this.bottles.push({ sx: p.x, sy: p.y, tx, ty, t: 0, dur: 0.32 });
  }
  whistle() {
    const p = this.player;
    let n = 0;
    sfx.whistle();
    this.noise(p.x, p.y, 5, "whistle", C.mint);
    for (const c of this.civs) {
      if (c.state === "captured" || c.state === "evac") continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > 5 || !this.los(p.x, p.y, c.x, c.y)) continue;
      if (c.leader === "player") continue;
      c.state = "follow";
      c.route = undefined;
      n++;
      if (c.kind === "teacher") {
        c.leader = "player";
        for (const s of this.civs) {
          if (s.group === c.id && s.state === "hide") {
            s.state = "follow";
            s.leader = c.id;
          }
        }
      } else {
        c.leader = "player";
      }
    }
    if (n) this.toast(`${n} ${n === 1 ? "person is" : "people are"} following you`);
  }
  release() {
    let n = 0;
    for (const c of this.civs) {
      if (c.state === "follow" && c.leader === "player") {
        c.state = "hide";
        c.leader = null;
        n++;
      }
    }
    if (n) this.toast(`${n} told to hide and stay put`);
  }

  // ---------- simulation ----------
  loop = (t: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.tick(1 / 60);
    }
    this.render(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  tick(rdt: number) {
    if (this.toastT > 0) this.toastT -= rdt;
    if (this.radioT > 0) this.radioT -= rdt;
    if (this.status !== "playing") {
      this.endT += rdt;
      if (this.endT > 1.6 && this.result) {
        const r = this.result;
        this.result = undefined;
        this.onEnd(r);
      }
      if (this.endT < 1.6) this.sim(rdt * 0.3);
      return;
    }
    if (this.mode === "think") return;

    // Camera keyboard orbit support ([ and ])
    if (this.keys.has("[")) this.renderer3d.rotateYaw(-2.0 * rdt);
    if (this.keys.has("]")) this.renderer3d.rotateYaw(2.0 * rdt);

    this.slowmo = this.keys.has(" ") && this.focus > 0;
    if (this.slowmo) this.focus = Math.max(0, this.focus - 20 * rdt);
    else this.focus = Math.min(100, this.focus + 8 * rdt);
    const dt = rdt * (this.slowmo ? 0.25 : 1);
    this.sim(dt);
    this.timeLeft -= dt;
    this.rules();
  }

  sim(dt: number) {
    this.time += dt;
    this.updatePlayer(dt);
    for (const h of this.hostiles) this.updateHostile(h, dt);
    for (const c of this.civs) this.updateCiv(c, dt);
    this.heat = Math.max(0, this.heat - dt * 1.2);
    if (this.heat >= 80 && this.waves < this.d.waves) {
      this.waves++;
      this.heat = 50;
      const mainExit = this.map.exits[0]!;
      const [gx, gy] = mainExit.tiles[0]!;
      const cx = this.W / 2;
      const cy = this.H / 2;
      const basePt = this.snap({
        x: gx + Math.sign(cx - gx) * 2.5,
        y: gy + Math.sign(cy - gy) * 2.5,
      });
      const goalPt = this.snap({
        x: gx + Math.sign(cx - gx) * 8,
        y: gy + Math.sign(cy - gy) * 8,
      });
      for (let i = 0; i < 2; i++) {
        const sp = this.snap({ x: basePt.x + i * 1.5, y: basePt.y });
        const h = this.mkHostile(`r${this.waves}${i}`, sp, [goalPt]);
        this.hostiles.push(h);
        this.totalHostiles++;
        this.alertH(h, { x: this.player.x, y: this.player.y }, false);
      }
      this.radio(`Meera: Reinforcements breached ${mainExit.name}! Too much noise — go quiet!`);
    }

    // Update flying bottles
    const remainingBottles: RenderBottle[] = [];
    for (const b of this.bottles) {
      b.t += dt;
      if (b.t >= b.dur) {
        sfx.shatter();
        this.noise(b.tx, b.ty, 6.5, "bottle", C.amber);
        this.spawnBurst(b.tx, 0.2, b.ty, 0x34d399, 12);
        this.floats.push({ x: b.tx, y: b.ty, text: "CRASH!", t: 1, color: C.amber });
      } else {
        remainingBottles.push(b);
      }
    }
    this.bottles = remainingBottles;

    // Update particles
    for (const pt of this.particles) {
      pt.t -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.vy -= 9.8 * dt;
      if (pt.y < 0.04) {
        pt.y = 0.04;
        pt.vy *= -0.3;
      }
    }
    this.particles = this.particles.filter((p) => p.t > 0);

    for (const n of this.noises) n.t += dt;
    this.noises = this.noises.filter((n) => n.t < 0.8);
    for (const t of this.tracers) t.t -= dt;
    this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const f of this.floats) f.t -= dt;
    this.floats = this.floats.filter((f) => f.t > 0);
  }

  updatePlayer(dt: number) {
    const p = this.player;
    if (p.muzzleT > 0) p.muzzleT = Math.max(0, p.muzzleT - dt);
    if (p.throwT > 0) p.throwT = Math.max(0, p.throwT - dt);
    if (p.takedownT > 0) p.takedownT = Math.max(0, p.takedownT - dt);

    let mx = 0;
    let my = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) my--;
    if (this.keys.has("s") || this.keys.has("arrowdown")) my++;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx--;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx++;

    const running = this.keys.has("shift") && p.stamina > 1 && (mx || my) && p.stance !== "sneak";
    const stance = running ? "run" : p.stance === "run" ? "walk" : p.stance;
    if (p.stance === "run" && !running) p.stance = "walk";
    const speed = running ? 5.5 : stance === "sneak" ? 2 : 3.5;
    if (running) p.stamina = Math.max(0, p.stamina - 22 * dt);
    else p.stamina = Math.min(100, p.stamina + 14 * dt);

    const moved = this.renderer3d.getCameraAlignedMove(mx, my);
    p.moving = !!(mx || my);
    p.curStance = running ? "run" : stance;
    if (p.moving) {
      this.move(p, moved.dx * speed * dt, moved.dy * speed * dt);
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = 0.45;
        const r = running ? 6 : stance === "sneak" ? 0.8 : 2.5;
        if (r > 1) this.noise(p.x, p.y, r, "step");
      }
    }

    const w = this.world(false);
    p.facing = Math.atan2(w.y - p.y, w.x - p.x);

    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const n = Math.min(10 - p.mag, p.reserve);
        p.mag += n;
        p.reserve -= n;
      }
    }
    if (this.mouse.down) this.shoot();

    for (const k of this.pickups) {
      if (Math.hypot(k.x - p.x, k.y - p.y) < 0.85) {
        if (k.kind === "med") {
          if (p.hp >= 100) continue;
          p.hp = Math.min(100, p.hp + 45);
          this.toast("First-aid kit +45");
        } else {
          const a = k.amt || 10;
          p.reserve += a;
          p.bottles = Math.min(6, p.bottles + 1);
          this.toast(`Ammo +${a}`);
        }
        sfx.click();
        k.amt = -1;
      }
    }
    this.pickups = this.pickups.filter((k) => k.amt !== -1);
  }

  stepPath(h: { x: number; y: number }, path: V[], speed: number, dt: number) {
    if (!path.length) return false;
    const t = path[0];
    const dx = t.x - h.x;
    const dy = t.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      path.shift();
      return true;
    }
    const s = Math.min(d, speed * dt);
    this.move(h, (dx / d) * s, (dy / d) * s, 0.3);
    return true;
  }

  goTo(h: Hostile, goal: V, speed: number, dt: number) {
    if (!h.pathGoal || Math.hypot(h.pathGoal.x - goal.x, h.pathGoal.y - goal.y) > 1 || this.time - h.pathT > 1.2 || !h.path.length) {
      if (this.time - h.pathT > 0.25 || !h.path.length) {
        h.path = this.astar(h, goal);
        h.pathGoal = { ...goal };
        h.pathT = this.time;
      }
    }
    const ox = h.x;
    const oy = h.y;
    this.stepPath(h, h.path, speed, dt);
    if (Math.hypot(h.x - ox, h.y - oy) > 0.001) this.turn(h, Math.atan2(h.y - oy, h.x - ox), dt);
    return Math.hypot(goal.x - h.x, goal.y - h.y) < 0.6;
  }

  turn(h: Hostile, a: number, dt: number, rate = 5) {
    let d = a - h.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    h.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  updateHostile(h: Hostile, dt: number) {
    if (h.muzzleT > 0) h.muzzleT = Math.max(0, h.muzzleT - dt);
    if (h.state === "down") return;
    const p = this.player;
    h.fireCd -= dt;
    const st = p.curStance;
    const dist = Math.hypot(p.x - h.x, p.y - h.y);
    h.sees = this.canSee(h, p.x, p.y, this.d.range * (st === "sneak" ? 0.75 : 1));
    if (h.sees && h.state !== "alert") {
      const mv = p.moving ? (st === "run" ? 1.7 : st === "sneak" ? 0.45 : 1) : 0.35;
      h.aw += (40 + 160 * (1 - dist / this.d.range)) * mv * dt;
      if (h.aw >= 100) {
        this.alertH(h, { x: p.x, y: p.y });
        this.heat += 10;
      } else if (h.aw > 30 && h.state !== "grab") {
        h.state = "suspicious";
        h.target = { x: p.x, y: p.y };
      }
    } else if (!h.sees && h.state !== "alert") {
      h.aw = Math.max(0, h.aw - 12 * dt);
    }

    switch (h.state) {
      case "patrol": {
        if (h.route.length === 1) {
          if (this.goTo(h, h.route[0], 2, dt)) {
            this.turn(h, Math.PI * 1.5 + Math.sin(this.time * 0.6 + h.x) * 1.1, dt, 1.5);
          }
        } else if (this.goTo(h, h.route[h.wp], 2.1, dt)) {
          h.wp = (h.wp + 1) % h.route.length;
          h.path = [];
        }
        this.lookForCivs(h);
        break;
      }
      case "suspicious": {
        if (h.target) this.turn(h, Math.atan2(h.target.y - h.y, h.target.x - h.x), dt, 3);
        if (!h.sees) {
          h.searchT += dt;
          if (h.target && h.searchT > 1.2) {
            h.state = "investigate";
            h.searchT = 0;
          }
        } else {
          h.searchT = 0;
        }
        break;
      }
      case "investigate": {
        if (!h.target) {
          h.state = "patrol";
          break;
        }
        if (this.goTo(h, h.target, 2.6, dt)) {
          h.searchT += dt;
          this.turn(h, h.facing + 2, dt, 2);
          if (h.searchT > 3) {
            h.state = "patrol";
            h.searchT = 0;
            h.path = [];
          }
        }
        this.lookForCivs(h);
        break;
      }
      case "alert": {
        if (h.sees) {
          h.target = { x: p.x, y: p.y };
          h.lostT = 0;
          this.turn(h, Math.atan2(p.y - h.y, p.x - h.x), dt, 8);
          if (dist > 6) this.goTo(h, h.target, 2.8, dt);
          if (h.fireCd <= 0) this.hostileShoot(h, dist);
        } else {
          h.lostT += dt;
          if (h.target && this.goTo(h, h.target, 3.2, dt)) {
            h.state = "search";
            h.searchT = 0;
          }
          if (h.lostT > 14) {
            h.state = "search";
            h.searchT = 0;
          }
        }
        break;
      }
      case "search": {
        h.searchT += dt;
        this.turn(h, h.facing + 3, dt, 1.8);
        if (h.searchT > 6) {
          h.state = "patrol";
          h.aw = 25;
          h.path = [];
        }
        break;
      }
      case "grab": {
        const c = this.civs.find((c) => c.id === h.grab);
        if (!c || c.state === "captured" || c.state === "evac") {
          h.state = "patrol";
          h.grab = undefined;
          h.path = [];
          break;
        }
        if (this.goTo(h, c, 3, dt) || Math.hypot(c.x - h.x, c.y - h.y) < 1.1) {
          let n = 0;
          for (const o of this.civs) {
            if (n < 3 && (o.state === "follow" || o.state === "hide") && Math.hypot(o.x - c.x, o.y - c.y) < 1.5) {
              o.state = "captured";
              o.holder = h.id;
              o.leader = null;
              n++;
            }
          }
          this.floats.push({ x: c.x, y: c.y, text: `${n} CAPTURED`, t: 1.6, color: C.amber });
          sfx.alert();
          this.radio(
            "Meera: They grabbed people near " +
              (zoneAt(this.map, c.x, c.y)?.name ?? "the path") +
              ". Take that one down to free them.",
          );
          h.state = "patrol";
          h.grab = undefined;
          h.path = [];
        }
        break;
      }
    }
  }

  lookForCivs(h: Hostile) {
    for (const c of this.civs) {
      if (c.state !== "follow" && c.state !== "hide") continue;
      const d = Math.hypot(c.x - h.x, c.y - h.y);
      if (c.state === "hide" && d > 2) continue;
      if (this.canSee(h, c.x, c.y, this.d.range * 0.65)) {
        h.civT += 1 / 60;
        this.turn(h, Math.atan2(c.y - h.y, c.x - h.x), 1 / 60, 2);
        if (h.civT > this.d.grab) {
          h.state = "grab";
          h.grab = c.id;
          h.path = [];
          h.civT = 0;
        }
        return;
      }
    }
    h.civT = Math.max(0, h.civT - 1 / 60);
  }

  hostileShoot(h: Hostile, dist: number) {
    const p = this.player;
    h.fireCd = this.d.fire * (0.8 + Math.random() * 0.4);
    h.muzzleT = 0.08;
    sfx.enemyShot();
    const st = p.curStance;
    const chance = Math.max(
      0.1,
      Math.min(0.85, this.d.acc - dist * 0.045 - (st === "run" ? 0.15 : 0) - (st === "sneak" ? 0.08 : 0)),
    );
    const hit = Math.random() < chance;
    const ox = hit ? 0 : (Math.random() - 0.5) * 2;
    const oy = hit ? 0 : (Math.random() - 0.5) * 2;
    this.tracers.push({ x1: h.x, y1: h.y, x2: p.x + ox, y2: p.y + oy, t: 0.1, color: C.red });
    this.noise(h.x, h.y, 8, "hshot", C.red);
    if (hit) {
      p.hp -= this.d.dmg;
      sfx.hurt();
      this.renderer3d.addShake(0.28);
      this.spawnBurst(p.x, 0.8, p.y, 0xff3b5c, 8);
      this.floats.push({ x: p.x, y: p.y, text: `-${this.d.dmg}`, t: 0.8, color: C.red });
    }
  }

  updateCiv(c: Civ, dt: number) {
    c.moving = false;
    if (c.state !== "follow") return;
    if (c.leader === "player") {
      for (const e of this.map.exits) {
        if (e.tiles.some(([x, y]) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 4)) {
          c.leader = `exit:${e.id}`;
        }
      }
    }
    let speed = c.kind === "teacher" ? 2.6 : 3.2;
    const ox = c.x;
    const oy = c.y;

    if (c.leader === "route") {
      speed = 2.2;
      const fol = this.civs.filter((s) => s.leader === c.id && s.state === "follow");
      const lag = fol.some((s) => Math.hypot(s.x - c.x, s.y - c.y) > 4);
      const nxt = c.route?.[Math.min(2, c.route.length - 1)];
      const watched = nxt && this.hostiles.some((h) => h.state !== "down" && this.canSee(h, nxt.x, nxt.y, this.d.range * 0.7));
      (c as any).waitT = watched ? ((c as any).waitT ?? 0) + dt : 0;
      if (!lag && c.route && (!watched || (c as any).waitT > 7)) this.stepPath(c, c.route, speed, dt);
      if (!c.route?.length) this.leaderOut(c);
    } else if (c.leader) {
      const lead =
        c.leader === "player"
          ? this.player
          : c.leader.startsWith("exit:")
            ? null
            : this.civs.find((o) => o.id === c.leader);
      if (lead && "state" in lead && (lead.state === "captured" || lead.state === "evac" || lead.state === "hide")) {
        if (lead.state === "evac" && lead.exitId) c.leader = `exit:${lead.exitId}`;
        else {
          c.state = "hide";
          c.leader = null;
          return;
        }
      }
      if (lead && Math.hypot(lead.x - c.x, lead.y - c.y) < 1.5) {
        // close enough
      } else {
        const f = this.field(c.leader);
        const cx = Math.floor(c.x);
        const cy = Math.floor(c.y);
        const ci = cy * this.W + cx;
        const nb: number[] = [];
        let best = ci;
        let bd = f[ci] < 0 ? 1e9 : f[ci];
        for (const n of this.nbrs(ci, nb)) {
          if (f[n] >= 0 && f[n] < bd) {
            bd = f[n];
            best = n;
          }
        }
        const tx = (best % this.W) + 0.5;
        const ty = ((best / this.W) | 0) + 0.5;
        const target = best === ci && lead ? lead : { x: tx, y: ty };
        const dx = target.x - c.x;
        const dy = target.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          const s = Math.min(d, speed * dt);
          this.move(c, (dx / d) * s, (dy / d) * s, 0.25);
        }
      }
    }

    // separation
    for (const o of this.civs) {
      if (o === c || o.state === "evac") continue;
      const dx = c.x - o.x;
      const dy = c.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 0.55) this.move(c, (dx / d) * (0.55 - d) * 0.5, (dy / d) * (0.55 - d) * 0.5, 0.25);
    }

    const mvDist = Math.hypot(c.x - ox, c.y - oy);
    if (mvDist > 0.002) {
      c.moving = true;
      c.facing = Math.atan2(c.y - oy, c.x - ox);
    }
    if (this.tile(Math.floor(c.x), Math.floor(c.y)) === T.EXIT) this.evac(c);
  }

  leaderOut(c: Civ) {
    this.evac(c);
  }
  evac(c: Civ) {
    if (c.state === "evac") return;
    if (!c.exitId) {
      const e = this.map.exits.find((e) => e.tiles.some(([x, y]) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 2));
      c.exitId = e?.id;
    }
    c.state = "evac";
    this.floats.push({ x: c.x, y: c.y, text: "✓ SAFE", t: 1.2, color: C.mint });
    if (Math.random() < 0.3 || c.kind === "teacher") sfx.chime();
    if (c.kind === "teacher") this.radio(`${c.name}: We're out! Thank you — go get the others.`);
  }

  rules() {
    const total = this.civs.length;
    const ev = this.civs.filter((c) => c.state === "evac").length;
    const down = this.hostiles.filter((h) => h.state === "down").length;
    const clear = down === this.hostiles.length && this.waves >= 0;
    if (this.player.hp <= 0) return this.finish(false, "You went down. Even dream heroes need a plan.");
    if (this.timeLeft <= 0) return this.finish(false, "Time ran out. The response team closed the perimeter with people still inside.");
    if (clear || ev === total) this.finish(true, clear ? "Every hostile neutralized." : "Everyone made it out.");
  }

  finish(win: boolean, reason: string) {
    if (this.status !== "playing") return;
    this.status = win ? "won" : "lost";
    this.endT = 0;
    win ? sfx.win() : sfx.lose();
    const total = this.civs.length;
    const ev = this.civs.filter((c) => c.state === "evac").length;
    const cap = this.civs.filter((c) => c.state === "captured").length;
    const down = this.hostiles.filter((h) => h.state === "down").length;
    const clear = down === this.hostiles.length;
    const safe = clear ? total - cap : ev;
    const planned = this.civs.filter((c) => c.state === "evac" && c.planned).length;
    const path: Result["path"] = !win ? "fail" : clear && ev === total ? "perfect" : clear ? "clear" : "evac";
    let stars = 0;
    if (win) {
      stars = 1;
      if (safe / total >= 0.9) stars = 2;
      if (path === "perfect" || (safe === total && this.stats.alerts <= 2)) stars = 3;
    }
    const score = Math.max(
      0,
      Math.round(
        ev * 100 +
          planned * 50 +
          (this.stats.alerts === 0 ? 500 : 0) +
          (win ? Math.max(0, this.timeLeft) * 2 : 0) +
          (path === "perfect" ? 1000 : 0) -
          cap * 100,
      ),
    );
    const tips: string[] = [];
    if (this.stats.alerts > 3) {
      tips.push("You were spotted a lot. Crouch (C) near patrols and throw bottles (Q) to pull guards away.");
    }
    if (cap > 0) {
      tips.push("Some groups walked into vision cones. In Think Mode, routes avoid red zones — check before you Execute.");
    }
    if (planned < ev / 2) {
      tips.push("Teachers can lead their own groups. Plan more routes in Think Mode instead of escorting everyone yourself.");
    }
    if (this.stats.shots > 30) {
      tips.push("Every shot is loud and raises heat. Silent takedowns (E from behind) refill your Focus.");
    }
    if (tips.length < 2) tips.push("Courage wasn't the loudest thing in the room. It was the plan.");

    this.result = {
      win,
      path,
      reason,
      evac: ev,
      total,
      captured: cap,
      down,
      hostiles: this.hostiles.length,
      alerts: this.stats.alerts,
      shots: this.stats.shots,
      takedowns: this.stats.takedowns,
      planned,
      time: Math.round(this.d.time - this.timeLeft),
      stars,
      score,
      tips: tips.slice(0, 2),
      mapName: this.map.name,
    };
  }

  snapshot(): Snapshot {
    const p = this.player;
    const near = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - p.x, h.y - p.y) < 1.4);
    let prompt = "";
    if (this.mode === "act") {
      if (near) prompt = near.state === "alert" && near.sees ? "They see you!" : "E — silent takedown";
      else if (this.civs.some((c) => c.state === "hide" && Math.hypot(c.x - p.x, c.y - p.y) < 5 && this.los(p.x, p.y, c.x, c.y))) {
        prompt = "G — whistle: 'follow me'";
      } else if (p.reloadT > 0) prompt = "Reloading…";
    }
    const alertMax = Math.max(
      0,
      ...this.hostiles.filter((h) => h.state !== "down").map((h) => (h.state === "alert" ? 100 : h.aw)),
    );
    return {
      hp: Math.max(0, Math.round(p.hp)),
      stamina: p.stamina,
      focus: this.focus,
      mag: p.mag,
      reserve: p.reserve,
      bottles: p.bottles,
      stance: p.curStance ?? p.stance,
      evac: this.civs.filter((c) => c.state === "evac").length,
      total: this.civs.length,
      captured: this.civs.filter((c) => c.state === "captured").length,
      following: this.civs.filter((c) => c.state === "follow" && c.leader === "player").length,
      down: this.hostiles.filter((h) => h.state === "down").length,
      hostiles: this.hostiles.length,
      alert: alertMax,
      heat: this.heat,
      timeLeft: Math.max(0, this.timeLeft),
      mode: this.mode,
      prompt,
      toast: this.toastT > 0 ? this.toastMsg : "",
      radio: this.radioT > 0 ? this.radioMsg : "",
      selected: this.selected ? (this.civs.find((c) => c.id === this.selected)?.name ?? null) : null,
      plannedGroups: this.civs.filter((c) => c.kind === "teacher" && c.planned).length,
      slowmo: this.slowmo,
      mapName: this.map.name,
      zoneName: zoneAt(this.map, p.x, p.y)?.name ?? "Campus Grounds",
      camPreset: this.renderer3d.camPreset,
    };
  }

  render(dt: number) {
    const aimWorld = this.world(false);
    const frameState = {
      mode: this.mode,
      time: this.time,
      dt,
      slowmo: this.slowmo,
      status: this.status,
      endT: this.endT,
      selected: this.selected,
      aimWorld,
      fovAngle: FOV,
      hostileRange: this.d.range,
      risk: this.risk,
      player: {
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
        hp: this.player.hp,
        moving: this.player.moving,
        stance: this.player.curStance,
        muzzleT: this.player.muzzleT,
        throwT: this.player.throwT,
        takedownT: this.player.takedownT,
      },
      hostiles: this.hostiles,
      civs: this.civs,
      pickups: this.pickups,
      noises: this.noises,
      tracers: this.tracers,
      bottles: this.bottles,
      particles: this.particles,
      floats: this.floats,
    };

    this.renderer3d.render(frameState);

    if (this.radarCanvas && this.mode === "act") {
      this.renderer3d.drawMinimap(this.radarCanvas, frameState);
    }
  }
}
