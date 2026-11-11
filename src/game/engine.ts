import { W, H, TILE, T, ZONES, EXITS, PATROLS, TEACHERS, buildGrid, blocks, zoneAt } from "./campus";
import { sfx } from "./audio";

export type Difficulty = "rookie" | "veteran" | "elite" | "nightmare";
type V = { x: number; y: number };
type HState = "patrol" | "suspicious" | "investigate" | "alert" | "search" | "grab" | "down";
interface Hostile { id: string; x: number; y: number; facing: number; hp: number; state: HState; aw: number; route: V[]; wp: number; path: V[]; pathT: number; pathGoal?: V; target?: V; fireCd: number; searchT: number; grab?: string; sees: boolean; lostT: number }
type CState = "hide" | "follow" | "captured" | "evac";
interface Civ { id: string; kind: "student" | "teacher"; name: string; x: number; y: number; state: CState; leader: string | null; group: string; holder?: string; route?: V[]; planned: boolean; color: string; exitId?: string }
interface Noise { x: number; y: number; r: number; t: number; max: number; color: string }
interface Tracer { x1: number; y1: number; x2: number; y2: number; t: number; color: string }
interface Pickup { x: number; y: number; kind: "ammo" | "med"; amt: number }
interface Float { x: number; y: number; text: string; t: number; color: string }

export interface Snapshot {
  hp: number; stamina: number; focus: number; mag: number; reserve: number; bottles: number; stance: string;
  evac: number; total: number; captured: number; following: number; down: number; hostiles: number;
  alert: number; heat: number; timeLeft: number; mode: "act" | "think"; prompt: string; toast: string; radio: string;
  selected: string | null; plannedGroups: number; slowmo: boolean;
}
export interface Result { win: boolean; path: "clear" | "evac" | "perfect" | "fail"; reason: string; evac: number; total: number; captured: number; down: number; hostiles: number; alerts: number; shots: number; takedowns: number; planned: number; time: number; stars: number; score: number; tips: string[] }

const DIFF = {
  rookie: { hostiles: 9, hp: 80, dmg: 8, acc: 0.6, range: 7.5, fire: 1.1, time: 720, waves: 1 },
  veteran: { hostiles: 11, hp: 100, dmg: 11, acc: 0.75, range: 8.5, fire: 0.95, time: 600, waves: 1 },
  elite: { hostiles: 13, hp: 110, dmg: 14, acc: 0.85, range: 9.5, fire: 0.8, time: 480, waves: 2 },
  nightmare: { hostiles: 13, hp: 130, dmg: 18, acc: 0.95, range: 10.5, fire: 0.7, time: 420, waves: 3 },
};
const FOV = (100 * Math.PI) / 180;
const SHIRTS = ["#e8ecf5", "#ffd27a", "#9fd3ff", "#ff9eb5", "#c9b8ff", "#b6f5d0", "#ffe9a8"];

const C = {
  bg: "#0b1020", grass: "#0f1b22", grass2: "#112028", path: "#1b2540", floor: "#161e36", wall: "#2a3a64", wallTop: "#3d5590",
  desk: "#4a3a1e", tree: "#14382a", treeTop: "#1f5a40", bound: "#070a14", exit: "#4cf2a0", cyan: "#27e0f0", amber: "#ffb020",
  red: "#ff3b5c", mint: "#4cf2a0", white: "#e8ecf5", slate: "#1b2540",
};

export class Engine {
  grid = buildGrid();
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; bg!: HTMLCanvasElement;
  d: (typeof DIFF)["rookie"];
  player = { x: 8.5, y: 12.5, facing: 0, hp: 100, stamina: 100, stance: "walk" as "sneak" | "walk" | "run", mag: 10, reserve: 20, bottles: 5, fireCd: 0, stepT: 0, reloadT: 0 };
  hostiles: Hostile[] = []; civs: Civ[] = []; noises: Noise[] = []; tracers: Tracer[] = []; pickups: Pickup[] = []; floats: Float[] = [];
  mode: "act" | "think" = "think"; focus = 100; slowmo = false; time = 0; timeLeft: number; heat = 0; waves = 0;
  status: "playing" | "won" | "lost" = "playing"; endT = 0; result?: Result;
  keys = new Set<string>(); mouse = { sx: 0, sy: 0, down: false }; cam = { x: 0, y: 0, z: 1 }; dpr = 1;
  selected: string | null = null; risk = new Float32Array(W * H); firstThink = true;
  toastMsg = ""; toastT = 0; radioMsg = ""; radioT = 0;
  stats = { alerts: 0, shots: 0, takedowns: 0 };
  fields = new Map<string, { t: number; d: Int32Array }>();
  raf = 0; last = 0; acc = 0; onEnd: (r: Result) => void; disposed = false;
  totalHostiles = 0;

  constructor(canvas: HTMLCanvasElement, diff: Difficulty, onEnd: (r: Result) => void) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d")!; this.d = DIFF[diff]; this.onEnd = onEnd; this.timeLeft = this.d.time;
    this.spawn();
    this.prerender();
    this.computeRisk();
    this.bind();
    this.resize();
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.radio("Meera: You're awake? This is real. Hostiles at the main gate. Plan first — click a teacher, then an exit.");
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- setup ----------
  spawn() {
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (let i = 0; i < this.d.hostiles; i++) {
      const pts = PATROLS[order[i % PATROLS.length]].map(([x, y]) => this.snap({ x, y }));
      this.hostiles.push(this.mkHostile(`h${i}`, pts[0], pts));
    }
    this.totalHostiles = this.hostiles.length;
    let ti = 0;
    for (const z of ZONES) {
      if (z.type !== "building") continue;
      const [x, y, w, h] = z.rect; const free: V[] = [];
      for (let yy = y + 1; yy < y + h - 1; yy++) for (let xx = x + 1; xx < x + w - 1; xx++) if (this.grid[yy * W + xx] === T.FLOOR) free.push({ x: xx + 0.5, y: yy + 0.5 });
      if (z.id === "canteen") continue; // player's start
      const gid = `t${ti}`; const n = 4 + Math.floor(r() * 4);
      const pick = () => free.splice(Math.floor(r() * free.length), 1)[0];
      const tp = pick();
      this.civs.push({ id: gid, kind: "teacher", name: TEACHERS[ti % TEACHERS.length], ...tp, state: "hide", leader: null, group: gid, planned: false, color: C.mint });
      for (let i = 0; i < n && free.length; i++) this.civs.push({ id: `${gid}s${i}`, kind: "student", name: "Student", ...pick(), state: "hide", leader: null, group: gid, planned: false, color: SHIRTS[Math.floor(r() * SHIRTS.length)] });
      ti++;
      if (r() < 0.5) this.pickups.push({ ...pick(), kind: r() < 0.5 ? "med" : "ammo", amt: 0 });
    }
    // a few friends in the canteen with you
    for (let i = 0; i < 3; i++) this.civs.push({ id: `c${i}`, kind: "student", name: "Student", x: 6.5 + i * 2, y: 13.5, state: "hide", leader: null, group: "none", planned: false, color: SHIRTS[i] });
  }
  mkHostile(id: string, p: V, route: V[]): Hostile {
    return { id, x: p.x, y: p.y, facing: -Math.PI / 2, hp: this.d.hp, state: "patrol", aw: 0, route, wp: 0, path: [], pathT: 0, fireCd: 1, searchT: 0, sees: false, lostT: 0 };
  }
  snap(p: V): V {
    let best = p, bd = 1e9;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!this.walk(x, y)) continue;
      const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    return best;
  }

  // ---------- grid helpers ----------
  tile(x: number, y: number) { return x < 0 || y < 0 || x >= W || y >= H ? T.BOUND : this.grid[y * W + x]; }
  walk(x: number, y: number) { return !blocks(this.tile(x, y)); }
  los(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy), n = Math.ceil(dist / 0.25);
    for (let i = 1; i < n; i++) { const t = i / n; if (blocks(this.tile(Math.floor(ax + dx * t), Math.floor(ay + dy * t)))) return false; }
    return true;
  }
  canSee(h: Hostile, x: number, y: number, range: number) {
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
    if (d > range) return false;
    let a = Math.atan2(dy, dx) - h.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > FOV / 2 && d > 1.2) return false;
    return this.los(h.x, h.y, x, y);
  }
  nbrs(i: number, out: number[]) {
    out.length = 0; const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
      if (!this.walk(nx, ny)) continue;
      if (dx && dy && (!this.walk(x + dx, y) || !this.walk(x, y + dy))) continue;
      out.push(ny * W + nx);
    }
    return out;
  }
  astar(s: V, g: V, useRisk = false): V[] {
    const si = Math.floor(s.y) * W + Math.floor(s.x), gi = Math.floor(g.y) * W + Math.floor(g.x);
    if (!this.walk(gi % W, (gi / W) | 0)) return [];
    const gs = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
    const open: number[] = [si]; gs[si] = 0; const nb: number[] = [];
    const hfn = (i: number) => Math.hypot((i % W) - (gi % W), ((i / W) | 0) - ((gi / W) | 0));
    let iter = 0;
    while (open.length && iter++ < 4000) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) { const f = gs[open[k]] + hfn(open[k]); if (f < bf) { bf = f; bi = k; } }
      const c = open.splice(bi, 1)[0];
      if (c === gi) break;
      closed[c] = 1;
      for (const n of this.nbrs(c, nb)) {
        if (closed[n]) continue;
        const diag = n % W !== c % W && ((n / W) | 0) !== ((c / W) | 0);
        const ng = gs[c] + (diag ? 1.414 : 1) + (useRisk ? this.risk[n] : 0);
        if (ng < gs[n]) { if (gs[n] === Infinity) open.push(n); gs[n] = ng; came[n] = c; }
      }
    }
    if (came[gi] === -1 && si !== gi) return [];
    const path: V[] = []; let c = gi;
    while (c !== si && c !== -1) { path.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5 }); c = came[c]; }
    return path.reverse();
  }
  bfs(starts: number[]) {
    const d = new Int32Array(W * H).fill(-1); const q = [...starts]; for (const s of starts) d[s] = 0; const nb: number[] = [];
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of this.nbrs(c, nb)) if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); } }
    return d;
  }
  field(key: string) {
    const f = this.fields.get(key);
    if (f && (key.startsWith("exit:") || this.time - f.t < 0.35)) return f.d;
    let starts: number[] = [];
    if (key === "player") starts = [Math.floor(this.player.y) * W + Math.floor(this.player.x)];
    else if (key.startsWith("exit:")) starts = EXITS.find((e) => e.id === key.slice(5))!.tiles.map(([x, y]) => y * W + x);
    else { const c = this.civs.find((c) => c.id === key); if (c) starts = [Math.floor(c.y) * W + Math.floor(c.x)]; }
    const d = this.bfs(starts); this.fields.set(key, { t: this.time, d }); return d;
  }
  move(e: { x: number; y: number }, dx: number, dy: number, r = 0.32) {
    const ok = (x: number, y: number) => this.walk(Math.floor(x - r), Math.floor(y - r)) && this.walk(Math.floor(x + r), Math.floor(y - r)) && this.walk(Math.floor(x - r), Math.floor(y + r)) && this.walk(Math.floor(x + r), Math.floor(y + r));
    if (ok(e.x + dx, e.y)) e.x += dx;
    if (ok(e.x, e.y + dy)) e.y += dy;
  }

  // ---------- messaging ----------
  toast(m: string) { this.toastMsg = m; this.toastT = 3; }
  radio(m: string) { this.radioMsg = m; this.radioT = 7; }
  noise(x: number, y: number, r: number, kind: "step" | "shot" | "bottle" | "whistle" | "hshot", color = C.white) {
    this.noises.push({ x, y, r: 0, t: 0, max: r, color });
    if (kind === "hshot" || kind === "whistle") return;
    for (const h of this.hostiles) {
      if (h.state === "down" || h.state === "alert") continue;
      const d = Math.hypot(h.x - x, h.y - y), eff = this.los(h.x, h.y, x, y) ? r : r * 0.55;
      if (d > eff) continue;
      if (kind === "shot") this.alertH(h, { x: this.player.x, y: this.player.y });
      else { h.state = "investigate"; h.target = { x, y }; h.aw = Math.max(h.aw, 40); h.path = []; h.searchT = 0; }
    }
    if (kind === "shot") this.heat += 6;
  }
  alertH(h: Hostile, at: V, radio = true) {
    if (h.state !== "alert") { this.stats.alerts++; this.heat += 8; if (radio) sfx.alert(); }
    h.state = "alert"; h.aw = 100; h.target = { ...at }; h.lostT = 0; h.path = [];
    if (h.grab) h.grab = undefined;
    if (radio) for (const o of this.hostiles) if (o !== h && o.state !== "down" && o.state !== "alert" && Math.hypot(o.x - h.x, o.y - h.y) < 11) this.alertH(o, at, false);
  }

  // ---------- input ----------
  bind() {
    window.addEventListener("keydown", this.kd); window.addEventListener("keyup", this.ku); window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("mousemove", this.mm); this.canvas.addEventListener("mousedown", this.md); window.addEventListener("mouseup", this.mu);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  destroy() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku); window.removeEventListener("resize", this.resize);
    window.removeEventListener("mouseup", this.mu);
  }
  resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * this.dpr; this.canvas.height = r.height * this.dpr;
  };
  kd = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["tab", " ", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (this.status !== "playing") return;
    if (k === "tab") this.toggleThink();
    if (k === "enter" && this.mode === "think") this.toggleThink();
    if (this.mode === "think") return;
    if (k === "c") this.player.stance = this.player.stance === "sneak" ? "walk" : "sneak";
    if (k === "r") this.reload();
    if (k === "e") this.takedown();
    if (k === "q") this.throwBottle();
    if (k === "g") this.whistle();
    if (k === "x") this.release();
  };
  ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  mm = (e: MouseEvent) => { const r = this.canvas.getBoundingClientRect(); this.mouse.sx = (e.clientX - r.left) * this.dpr; this.mouse.sy = (e.clientY - r.top) * this.dpr; };
  md = (e: MouseEvent) => {
    this.mm(e);
    if (this.status !== "playing") return;
    if (this.mode === "think") { this.thinkClick(e.button === 2); return; }
    if (e.button === 0) this.mouse.down = true;
  };
  mu = () => { this.mouse.down = false; };
  world(): V { return { x: (this.mouse.sx - this.canvas.width / 2) / (this.cam.z * TILE) + this.cam.x, y: (this.mouse.sy - this.canvas.height / 2) / (this.cam.z * TILE) + this.cam.y }; }

  // ---------- think mode ----------
  toggleThink() {
    if (this.mode === "think") { this.mode = "act"; this.selected = null; this.firstThink = false; sfx.click(); return; }
    if (!this.firstThink && this.focus < 15) { this.toast("Need 15 Focus to stop and think"); return; }
    if (!this.firstThink) this.focus -= 15;
    this.mode = "think"; this.computeRisk(); sfx.click();
  }
  computeRisk() {
    this.risk.fill(0);
    for (const h of this.hostiles) {
      if (h.state === "down") continue;
      const rg = Math.ceil(this.d.range);
      for (let y = Math.max(0, Math.floor(h.y) - rg); y <= Math.min(H - 1, Math.floor(h.y) + rg); y++)
        for (let x = Math.max(0, Math.floor(h.x) - rg); x <= Math.min(W - 1, Math.floor(h.x) + rg); x++) {
          const d = Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
          if (d < 4) this.risk[y * W + x] += 3;
          if (this.canSee(h, x + 0.5, y + 0.5, this.d.range)) this.risk[y * W + x] += 10;
        }
      for (const p of h.route) for (let y = Math.floor(p.y) - 3; y <= Math.floor(p.y) + 3; y++) for (let x = Math.floor(p.x) - 3; x <= Math.floor(p.x) + 3; x++) if (x >= 0 && y >= 0 && x < W && y < H) this.risk[y * W + x] += 2;
      if (h.route.length > 1) for (let i = 0; i < h.route.length; i++) {
        const a = h.route[i], b = h.route[(i + 1) % h.route.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let k = 0; k <= n; k++) { const x = Math.floor(a.x + ((b.x - a.x) * k) / n), y = Math.floor(a.y + ((b.y - a.y) * k) / n);
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const xx = x + ox, yy = y + oy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) this.risk[yy * W + xx] += 1.5; } }
      }
    }
  }
  thinkClick(right: boolean) {
    const w = this.world();
    if (right) { this.selected = null; return; }
    const t = this.civs.find((c) => c.kind === "teacher" && (c.state === "hide" || c.state === "follow") && Math.hypot(c.x - w.x, c.y - w.y) < 1.4);
    if (t) { this.selected = t.id; sfx.click(); return; }
    if (this.selected) {
      const ex = EXITS.find((e) => e.tiles.some(([x, y]) => Math.hypot(x + 0.5 - w.x, y + 0.5 - w.y) < 2.5));
      if (ex) { this.assign(this.civs.find((c) => c.id === this.selected)!, ex.id); this.selected = null; sfx.chime(); return; }
      this.toast("Click an exit (green glow at the map edge)");
    } else this.toast("Click a teacher (green ring) to plan their group's escape");
  }
  assign(t: Civ, exitId: string) {
    const ex = EXITS.find((e) => e.id === exitId)!; const [tx, ty] = ex.tiles[Math.floor(ex.tiles.length / 2)];
    t.route = this.astar(t, { x: tx + 0.5, y: ty + 0.5 }, true); t.exitId = exitId; t.state = "follow"; t.leader = "route"; t.planned = true;
    for (const c of this.civs) if (c.group === t.id && c.kind === "student" && (c.state === "hide" || (c.state === "follow" && c.leader === t.id))) { c.state = "follow"; c.leader = t.id; c.planned = true; }
  }
  routeRisk(path: V[]) { let r = 0; for (const p of path) r += this.risk[Math.floor(p.y) * W + Math.floor(p.x)]; return r; }
  autoPlan() {
    this.computeRisk();
    for (const t of this.civs) {
      if (t.kind !== "teacher" || t.state !== "hide") continue;
      let best: string | null = null, bc = Infinity;
      for (const ex of EXITS) { const [tx, ty] = ex.tiles[0]; const p = this.astar(t, { x: tx + 0.5, y: ty + 0.5 }, true); if (!p.length) continue; const c = this.routeRisk(p) + p.length * 0.6; if (c < bc) { bc = c; best = ex.id; } }
      if (best) this.assign(t, best);
    }
    sfx.chime(); this.toast("Auto-plan: safest routes assigned. Press Execute.");
  }

  // ---------- player actions ----------
  reload() { const p = this.player; if (p.mag >= 10 || p.reserve <= 0 || p.reloadT > 0) return; p.reloadT = 1.2; sfx.click(); }
  shoot() {
    const p = this.player;
    if (p.fireCd > 0 || p.reloadT > 0) return;
    if (p.mag <= 0) { sfx.empty(); p.fireCd = 0.3; this.reload(); return; }
    p.mag--; p.fireCd = 0.28; this.stats.shots++; sfx.shot();
    const a = p.facing + (Math.random() - 0.5) * (p.stance === "run" ? 0.18 : 0.05);
    const dx = Math.cos(a), dy = Math.sin(a); let ex = p.x, ey = p.y; let hit: Hostile | null = null;
    for (let s = 0.4; s < 18; s += 0.15) {
      ex = p.x + dx * s; ey = p.y + dy * s;
      if (blocks(this.tile(Math.floor(ex), Math.floor(ey)))) break;
      hit = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - ex, h.y - ey) < 0.42) || null;
      if (hit) break;
    }
    this.tracers.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, t: 0.12, color: C.cyan });
    if (hit) { hit.hp -= 38; this.floats.push({ x: hit.x, y: hit.y - 0.6, text: "HIT", t: 0.8, color: C.cyan }); if (hit.hp <= 0) this.down(hit, false); else this.alertH(hit, { x: p.x, y: p.y }); }
    this.noise(p.x, p.y, 14, "shot", C.cyan);
  }
  down(h: Hostile, silent: boolean) {
    h.state = "down"; h.hp = 0; sfx.thud();
    this.floats.push({ x: h.x, y: h.y - 0.6, text: silent ? "SILENT TAKEDOWN" : "NEUTRALIZED", t: 1.4, color: C.mint });
    this.pickups.push({ x: h.x + 0.3, y: h.y + 0.3, kind: "ammo", amt: 8 });
    if (silent) { this.focus = Math.min(100, this.focus + 25); this.stats.takedowns++; }
    for (const c of this.civs) if (c.state === "captured" && c.holder === h.id) { c.state = "hide"; c.leader = null; c.holder = undefined; this.floats.push({ x: c.x, y: c.y - 0.5, text: "FREED", t: 1.2, color: C.mint }); }
    const left = this.hostiles.filter((x) => x.state !== "down").length;
    if (left === 3) this.radio("Meera: Only three of them left. You're actually doing this.");
  }
  takedown() {
    const p = this.player;
    const h = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - p.x, h.y - p.y) < 1.35);
    if (!h) return;
    if (h.state === "alert" && h.sees) { this.toast("They see you — can't take them down quietly!"); return; }
    this.down(h, true);
  }
  throwBottle() {
    const p = this.player; if (p.bottles <= 0) { this.toast("No more bottles"); return; }
    const w = this.world(); const d = Math.hypot(w.x - p.x, w.y - p.y); const k = d > 11 ? 11 / d : 1;
    const tx = p.x + (w.x - p.x) * k, ty = p.y + (w.y - p.y) * k;
    p.bottles--; sfx.thud(); this.noise(tx, ty, 6, "bottle", C.amber); this.floats.push({ x: tx, y: ty, text: "CRASH!", t: 1, color: C.amber });
  }
  whistle() {
    const p = this.player; let n = 0; sfx.whistle(); this.noise(p.x, p.y, 5, "whistle", C.mint);
    for (const c of this.civs) {
      if (c.state === "captured" || c.state === "evac") continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > 5 || !this.los(p.x, p.y, c.x, c.y)) continue;
      if (c.leader === "player") continue;
      c.state = "follow"; c.route = undefined; n++;
      if (c.kind === "teacher") { c.leader = "player"; for (const s of this.civs) if (s.group === c.id && s.state === "hide") { s.state = "follow"; s.leader = c.id; } }
      else c.leader = "player";
    }
    if (n) this.toast(`${n} ${n === 1 ? "person is" : "people are"} following you`);
  }
  release() {
    let n = 0;
    for (const c of this.civs) if (c.state === "follow" && c.leader === "player") { c.state = "hide"; c.leader = null; n++; }
    if (n) this.toast(`${n} told to hide and stay put`);
  }

  // ---------- simulation ----------
  loop = (t: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t;
    this.acc += dt;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.tick(1 / 60); }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };
  tick(rdt: number) {
    if (this.toastT > 0) this.toastT -= rdt; if (this.radioT > 0) this.radioT -= rdt;
    if (this.status !== "playing") {
      this.endT += rdt;
      if (this.endT > 1.6 && this.result) { const r = this.result; this.result = undefined; this.onEnd(r); }
      if (this.endT < 1.6) this.sim(rdt * 0.3);
      return;
    }
    if (this.mode === "think") return;
    this.slowmo = this.keys.has(" ") && this.focus > 0;
    if (this.slowmo) this.focus = Math.max(0, this.focus - 20 * rdt); else this.focus = Math.min(100, this.focus + 8 * rdt);
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
      this.waves++; this.heat = 50;
      for (let i = 0; i < 2; i++) { const h = this.mkHostile(`r${this.waves}${i}`, { x: 31 + i * 2, y: 37.5 }, [this.snap({ x: 31 + i * 2, y: 30 })]); this.hostiles.push(h); this.totalHostiles++; this.alertH(h, { x: this.player.x, y: this.player.y }, false); }
      this.radio("Meera: Reinforcements at the main gate! Too much noise — go quiet!");
    }
    for (const n of this.noises) n.t += dt; this.noises = this.noises.filter((n) => n.t < 0.8);
    for (const t of this.tracers) t.t -= dt; this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const f of this.floats) { f.t -= dt; f.y -= dt * 0.6; } this.floats = this.floats.filter((f) => f.t > 0);
  }
  updatePlayer(dt: number) {
    const p = this.player;
    let mx = 0, my = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) my--; if (this.keys.has("s") || this.keys.has("arrowdown")) my++;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx--; if (this.keys.has("d") || this.keys.has("arrowright")) mx++;
    const running = this.keys.has("shift") && p.stamina > 1 && (mx || my) && p.stance !== "sneak";
    const stance = running ? "run" : p.stance === "run" ? "walk" : p.stance;
    if (p.stance === "run" && !running) p.stance = "walk";
    const speed = running ? 5.5 : stance === "sneak" ? 2 : 3.5;
    if (running) p.stamina = Math.max(0, p.stamina - 22 * dt); else p.stamina = Math.min(100, p.stamina + 14 * dt);
    const l = Math.hypot(mx, my);
    if (l) { this.move(p, (mx / l) * speed * dt, (my / l) * speed * dt); p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.45; const r = running ? 6 : stance === "sneak" ? 0.8 : 2.5; if (r > 1) this.noise(p.x, p.y, r, "step"); } }
    (p as any).moving = !!l; (p as any).curStance = running ? "run" : stance;
    const w = this.world(); p.facing = Math.atan2(w.y - p.y, w.x - p.x);
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { const n = Math.min(10 - p.mag, p.reserve); p.mag += n; p.reserve -= n; } }
    if (this.mouse.down) this.shoot();
    for (const k of this.pickups) if (Math.hypot(k.x - p.x, k.y - p.y) < 0.8) {
      if (k.kind === "med") { if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 45); this.toast("First-aid kit +45"); }
      else { const a = k.amt || 10; p.reserve += a; p.bottles = Math.min(6, p.bottles + 1); this.toast(`Ammo +${a}`); }
      sfx.click(); k.amt = -1;
    }
    this.pickups = this.pickups.filter((k) => k.amt !== -1);
  }
  stepPath(h: { x: number; y: number }, path: V[], speed: number, dt: number) {
    if (!path.length) return false;
    const t = path[0], dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy);
    if (d < 0.15) { path.shift(); return true; }
    const s = Math.min(d, speed * dt); this.move(h, (dx / d) * s, (dy / d) * s, 0.3);
    return true;
  }
  goTo(h: Hostile, goal: V, speed: number, dt: number) {
    if (!h.pathGoal || Math.hypot(h.pathGoal.x - goal.x, h.pathGoal.y - goal.y) > 1 || (this.time - h.pathT > 1.2) || !h.path.length) {
      if (this.time - h.pathT > 0.25 || !h.path.length) { h.path = this.astar(h, goal); h.pathGoal = { ...goal }; h.pathT = this.time; }
    }
    const ox = h.x, oy = h.y;
    this.stepPath(h, h.path, speed, dt);
    if (Math.hypot(h.x - ox, h.y - oy) > 0.001) this.turn(h, Math.atan2(h.y - oy, h.x - ox), dt);
    return Math.hypot(goal.x - h.x, goal.y - h.y) < 0.6;
  }
  turn(h: Hostile, a: number, dt: number, rate = 5) {
    let d = a - h.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
    h.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }
  updateHostile(h: Hostile, dt: number) {
    if (h.state === "down") return;
    const p = this.player; h.fireCd -= dt;
    const st = (p as any).curStance as string;
    const dist = Math.hypot(p.x - h.x, p.y - h.y);
    h.sees = this.canSee(h, p.x, p.y, this.d.range * (st === "sneak" ? 0.75 : 1));
    if (h.sees && h.state !== "alert") {
      const mv = (p as any).moving ? (st === "run" ? 1.7 : st === "sneak" ? 0.45 : 1) : 0.35;
      h.aw += (40 + 160 * (1 - dist / this.d.range)) * mv * dt;
      if (h.aw >= 100) { this.alertH(h, { x: p.x, y: p.y }); this.heat += 10; }
      else if (h.aw > 30 && h.state !== "grab") { h.state = "suspicious"; h.target = { x: p.x, y: p.y }; }
    } else if (!h.sees && h.state !== "alert") h.aw = Math.max(0, h.aw - 12 * dt);

    switch (h.state) {
      case "patrol": {
        if (h.route.length === 1) {
          if (this.goTo(h, h.route[0], 2, dt)) this.turn(h, Math.PI * 1.5 + Math.sin(this.time * 0.6 + h.x) * 1.1, dt, 1.5);
        } else if (this.goTo(h, h.route[h.wp], 2.1, dt)) { h.wp = (h.wp + 1) % h.route.length; h.path = []; }
        this.lookForCivs(h);
        break;
      }
      case "suspicious": {
        if (h.target) this.turn(h, Math.atan2(h.target.y - h.y, h.target.x - h.x), dt, 3);
        if (!h.sees) { h.searchT += dt; if (h.target && h.searchT > 1.2) { h.state = "investigate"; h.searchT = 0; } }
        else h.searchT = 0;
        break;
      }
      case "investigate": {
        if (!h.target) { h.state = "patrol"; break; }
        if (this.goTo(h, h.target, 2.6, dt)) { h.searchT += dt; this.turn(h, h.facing + 2, dt, 2); if (h.searchT > 3) { h.state = "patrol"; h.searchT = 0; h.path = []; } }
        this.lookForCivs(h);
        break;
      }
      case "alert": {
        if (h.sees) { h.target = { x: p.x, y: p.y }; h.lostT = 0; this.turn(h, Math.atan2(p.y - h.y, p.x - h.x), dt, 8);
          if (dist > 6) this.goTo(h, h.target, 2.8, dt);
          if (h.fireCd <= 0) this.hostileShoot(h, dist);
        } else {
          h.lostT += dt;
          if (h.target && this.goTo(h, h.target, 3.2, dt)) { h.state = "search"; h.searchT = 0; }
          if (h.lostT > 14) { h.state = "search"; h.searchT = 0; }
        }
        break;
      }
      case "search": {
        h.searchT += dt; this.turn(h, h.facing + 3, dt, 1.8);
        if (h.searchT > 6) { h.state = "patrol"; h.aw = 25; h.path = []; }
        break;
      }
      case "grab": {
        const c = this.civs.find((c) => c.id === h.grab);
        if (!c || c.state === "captured" || c.state === "evac") { h.state = "patrol"; h.grab = undefined; h.path = []; break; }
        if (this.goTo(h, c, 3, dt) || Math.hypot(c.x - h.x, c.y - h.y) < 1.1) {
          let n = 0;
          for (const o of this.civs) if ((o.state === "follow" || o.state === "hide") && Math.hypot(o.x - c.x, o.y - c.y) < 2.2) { o.state = "captured"; o.holder = h.id; o.leader = null; n++; }
          this.floats.push({ x: c.x, y: c.y - 0.6, text: `${n} CAPTURED`, t: 1.6, color: C.amber }); sfx.alert();
          this.radio("Meera: They grabbed people near " + (zoneAt(c.x, c.y)?.name ?? "the path") + ". Take that one down to free them.");
          h.state = "patrol"; h.grab = undefined; h.path = [];
        }
        break;
      }
    }
  }
  lookForCivs(h: Hostile) {
    for (const c of this.civs) {
      if (c.state !== "follow" && c.state !== "hide") continue;
      const d = Math.hypot(c.x - h.x, c.y - h.y);
      if (c.state === "hide" && d > 3) continue;
      if (this.canSee(h, c.x, c.y, this.d.range * 0.85)) { h.state = "grab"; h.grab = c.id; h.path = []; return; }
    }
  }
  hostileShoot(h: Hostile, dist: number) {
    const p = this.player; h.fireCd = this.d.fire * (0.8 + Math.random() * 0.4); sfx.enemyShot();
    const st = (p as any).curStance;
    const chance = Math.max(0.1, Math.min(0.85, this.d.acc - dist * 0.045 - (st === "run" ? 0.15 : 0) - (st === "sneak" ? 0.08 : 0)));
    const hit = Math.random() < chance;
    const ox = hit ? 0 : (Math.random() - 0.5) * 2, oy = hit ? 0 : (Math.random() - 0.5) * 2;
    this.tracers.push({ x1: h.x, y1: h.y, x2: p.x + ox, y2: p.y + oy, t: 0.1, color: C.red });
    this.noise(h.x, h.y, 8, "hshot", C.red);
    if (hit) { p.hp -= this.d.dmg; sfx.hurt(); this.floats.push({ x: p.x, y: p.y - 0.6, text: `-${this.d.dmg}`, t: 0.8, color: C.red }); }
  }
  updateCiv(c: Civ, dt: number) {
    if (c.state !== "follow") return;
    // near an exit while following player → walk out
    if (c.leader === "player") for (const e of EXITS) if (e.tiles.some(([x, y]) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 4)) { c.leader = `exit:${e.id}`; }
    let speed = c.kind === "teacher" ? 2.6 : 3.2;
    if (c.leader === "route") {
      speed = 2.2;
      const fol = this.civs.filter((s) => s.leader === c.id && s.state === "follow");
      const lag = fol.some((s) => Math.hypot(s.x - c.x, s.y - c.y) > 4);
      if (!lag && c.route) this.stepPath(c, c.route, speed, dt);
      if (!c.route?.length) this.leaderOut(c);
    } else if (c.leader) {
      const lead = c.leader === "player" ? this.player : c.leader.startsWith("exit:") ? null : this.civs.find((o) => o.id === c.leader);
      if (lead && "state" in lead && (lead.state === "captured" || lead.state === "evac" || lead.state === "hide")) {
        if (lead.state === "evac" && lead.exitId) c.leader = `exit:${lead.exitId}`; else { c.state = "hide"; c.leader = null; return; }
      }
      if (lead && Math.hypot(lead.x - c.x, lead.y - c.y) < 1.5) { /* close enough */ }
      else {
        const f = this.field(c.leader); const cx = Math.floor(c.x), cy = Math.floor(c.y); const ci = cy * W + cx; const nb: number[] = [];
        let best = ci, bd = f[ci] < 0 ? 1e9 : f[ci];
        for (const n of this.nbrs(ci, nb)) if (f[n] >= 0 && f[n] < bd) { bd = f[n]; best = n; }
        const tx = (best % W) + 0.5, ty = ((best / W) | 0) + 0.5;
        const target = best === ci && lead ? lead : { x: tx, y: ty };
        const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy);
        if (d > 0.01) { const s = Math.min(d, speed * dt); this.move(c, (dx / d) * s, (dy / d) * s, 0.25); }
      }
    }
    // separation
    for (const o of this.civs) {
      if (o === c || o.state === "evac") continue;
      const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 0.55) this.move(c, (dx / d) * (0.55 - d) * 0.5, (dy / d) * (0.55 - d) * 0.5, 0.25);
    }
    if (this.tile(Math.floor(c.x), Math.floor(c.y)) === T.EXIT) this.evac(c);
  }
  leaderOut(c: Civ) { this.evac(c); }
  evac(c: Civ) {
    if (c.state === "evac") return;
    if (!c.exitId) { const e = EXITS.find((e) => e.tiles.some(([x, y]) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 2)); c.exitId = e?.id; }
    c.state = "evac"; this.floats.push({ x: c.x, y: c.y - 0.5, text: "✓ SAFE", t: 1.2, color: C.mint });
    if (Math.random() < 0.3 || c.kind === "teacher") sfx.chime();
    if (c.kind === "teacher") this.radio(`${c.name}: We're out! Thank you — go get the others.`);
  }
  rules() {
    const total = this.civs.length, ev = this.civs.filter((c) => c.state === "evac").length;
    const down = this.hostiles.filter((h) => h.state === "down").length;
    const clear = down === this.hostiles.length && this.waves >= 0;
    if (this.player.hp <= 0) return this.finish(false, "You went down. Even dream heroes need a plan.");
    if (this.timeLeft <= 0) return this.finish(false, "Time ran out. The response team closed the perimeter with people still inside.");
    if (clear || ev === total) this.finish(true, clear ? "Every hostile neutralized." : "Everyone made it out.");
  }
  finish(win: boolean, reason: string) {
    if (this.status !== "playing") return;
    this.status = win ? "won" : "lost"; this.endT = 0; win ? sfx.win() : sfx.lose();
    const total = this.civs.length, ev = this.civs.filter((c) => c.state === "evac").length, cap = this.civs.filter((c) => c.state === "captured").length;
    const down = this.hostiles.filter((h) => h.state === "down").length;
    const clear = down === this.hostiles.length;
    const safe = clear ? total - cap : ev;
    const planned = this.civs.filter((c) => c.state === "evac" && c.planned).length;
    const path: Result["path"] = !win ? "fail" : clear && ev === total ? "perfect" : clear ? "clear" : "evac";
    let stars = 0;
    if (win) { stars = 1; if (safe / total >= 0.9) stars = 2; if (path === "perfect" || (safe === total && this.stats.alerts <= 2)) stars = 3; }
    const score = Math.max(0, Math.round(ev * 100 + planned * 50 + (this.stats.alerts === 0 ? 500 : 0) + (win ? Math.max(0, this.timeLeft) * 2 : 0) + (path === "perfect" ? 1000 : 0) - cap * 100));
    const tips: string[] = [];
    if (this.stats.alerts > 3) tips.push("You were spotted a lot. Crouch (C) near patrols and throw bottles (Q) to pull guards away.");
    if (cap > 0) tips.push("Some groups walked into vision cones. In Think Mode, routes avoid red zones — check before you Execute.");
    if (planned < ev / 2) tips.push("Teachers can lead their own groups. Plan more routes in Think Mode instead of escorting everyone yourself.");
    if (this.stats.shots > 30) tips.push("Every shot is loud and raises heat. Silent takedowns (E from behind) refill your Focus.");
    if (tips.length < 2) tips.push("Courage wasn't the loudest thing in the room. It was the plan.");
    this.result = { win, path, reason, evac: ev, total, captured: cap, down, hostiles: this.hostiles.length, alerts: this.stats.alerts, shots: this.stats.shots, takedowns: this.stats.takedowns, planned, time: Math.round(this.d.time - this.timeLeft), stars, score, tips: tips.slice(0, 2) };
  }

  snapshot(): Snapshot {
    const p = this.player;
    const near = this.hostiles.find((h) => h.state !== "down" && Math.hypot(h.x - p.x, h.y - p.y) < 1.35);
    let prompt = "";
    if (this.mode === "act") {
      if (near) prompt = near.state === "alert" && near.sees ? "They see you!" : "E — silent takedown";
      else if (this.civs.some((c) => c.state === "hide" && Math.hypot(c.x - p.x, c.y - p.y) < 5 && this.los(p.x, p.y, c.x, c.y))) prompt = "G — whistle: 'follow me'";
      else if (p.reloadT > 0) prompt = "Reloading…";
    }
    const alertMax = Math.max(0, ...this.hostiles.filter((h) => h.state !== "down").map((h) => (h.state === "alert" ? 100 : h.aw)));
    return {
      hp: Math.max(0, Math.round(p.hp)), stamina: p.stamina, focus: this.focus, mag: p.mag, reserve: p.reserve, bottles: p.bottles, stance: (p as any).curStance ?? p.stance,
      evac: this.civs.filter((c) => c.state === "evac").length, total: this.civs.length, captured: this.civs.filter((c) => c.state === "captured").length,
      following: this.civs.filter((c) => c.state === "follow" && c.leader === "player").length,
      down: this.hostiles.filter((h) => h.state === "down").length, hostiles: this.hostiles.length,
      alert: alertMax, heat: this.heat, timeLeft: Math.max(0, this.timeLeft), mode: this.mode, prompt,
      toast: this.toastT > 0 ? this.toastMsg : "", radio: this.radioT > 0 ? this.radioMsg : "",
      selected: this.selected ? this.civs.find((c) => c.id === this.selected)?.name ?? null : null,
      plannedGroups: this.civs.filter((c) => c.kind === "teacher" && c.planned).length, slowmo: this.slowmo,
    };
  }

  // ---------- rendering ----------
  prerender() {
    const b = document.createElement("canvas"); b.width = W * TILE; b.height = H * TILE; const g = b.getContext("2d")!;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.tile(x, y), px = x * TILE, py = y * TILE;
      g.fillStyle = (x + y) % 2 ? C.grass : C.grass2; g.fillRect(px, py, TILE, TILE);
      if (t === T.PATH) { g.fillStyle = C.path; g.fillRect(px, py, TILE, TILE); }
      if (t === T.FLOOR || t === T.DOOR || t === T.DESK) { g.fillStyle = C.floor; g.fillRect(px, py, TILE, TILE); g.strokeStyle = "rgba(255,255,255,0.03)"; g.strokeRect(px, py, TILE, TILE); }
      if (t === T.DOOR) { g.fillStyle = "rgba(255,176,32,0.25)"; g.fillRect(px + 4, py + 4, TILE - 8, TILE - 8); }
      if (t === T.WALL) { g.fillStyle = C.wall; g.fillRect(px, py, TILE, TILE); g.fillStyle = C.wallTop; g.fillRect(px, py, TILE, 6); }
      if (t === T.DESK) { g.fillStyle = C.desk; g.fillRect(px + 3, py + 6, TILE - 6, TILE - 12); }
      if (t === T.TREE) { g.fillStyle = C.tree; g.beginPath(); g.arc(px + 16, py + 16, 15, 0, 7); g.fill(); g.fillStyle = C.treeTop; g.beginPath(); g.arc(px + 13, py + 13, 9, 0, 7); g.fill(); }
      if (t === T.BOUND) { g.fillStyle = C.bound; g.fillRect(px, py, TILE, TILE); g.fillStyle = "rgba(255,59,92,0.12)"; if ((x + y) % 2) g.fillRect(px, py, TILE, TILE); }
      if (t === T.EXIT) { g.fillStyle = "rgba(76,242,160,0.35)"; g.fillRect(px, py, TILE, TILE); }
    }
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const z of ZONES) {
      const [x, y, w, h] = z.rect;
      if (z.type === "outdoor") { g.strokeStyle = "rgba(232,236,245,0.06)"; g.setLineDash([6, 6]); g.strokeRect(x * TILE, y * TILE, w * TILE, h * TILE); g.setLineDash([]); }
      g.font = "600 15px 'Chakra Petch', sans-serif"; g.fillStyle = "rgba(232,236,245,0.28)";
      g.fillText(z.name.toUpperCase(), (x + w / 2) * TILE, (y + h / 2) * TILE);
    }
    g.font = "700 13px 'Chakra Petch', sans-serif"; g.fillStyle = C.mint;
    for (const e of EXITS) { const [x, y] = e.tiles[0]; const lx = Math.min(W - 4, Math.max(4, x)), ly = Math.min(H - 2, Math.max(2, y)); g.fillText("⇥ " + e.name.toUpperCase(), lx * TILE + (x === 0 ? 30 : x === W - 1 ? -30 : 50), ly * TILE + (y === H - 1 ? -6 : 16)); }
    g.font = "700 22px 'Chakra Petch', sans-serif"; g.fillStyle = "rgba(39,224,240,0.15)"; g.fillText("SUIIT · BURLA", 31.5 * TILE, 35 * TILE);
    this.bg = b;
  }
  cone(g: CanvasRenderingContext2D, h: Hostile) {
    const range = this.d.range, n = 28;
    g.beginPath(); g.moveTo(h.x * TILE, h.y * TILE);
    for (let i = 0; i <= n; i++) {
      const a = h.facing - FOV / 2 + (FOV * i) / n; const dx = Math.cos(a), dy = Math.sin(a); let s = 0.3;
      for (; s < range; s += 0.25) if (blocks(this.tile(Math.floor(h.x + dx * s), Math.floor(h.y + dy * s)))) break;
      g.lineTo((h.x + dx * s) * TILE, (h.y + dy * s) * TILE);
    }
    g.closePath();
    const col = h.state === "alert" ? "255,59,92" : h.aw > 30 || h.state === "investigate" || h.state === "grab" ? "255,176,32" : "255,59,92";
    const grd = g.createRadialGradient(h.x * TILE, h.y * TILE, 0, h.x * TILE, h.y * TILE, range * TILE);
    grd.addColorStop(0, `rgba(${col},${h.state === "alert" ? 0.35 : 0.22})`); grd.addColorStop(1, `rgba(${col},0.02)`);
    g.fillStyle = grd; g.fill();
  }
  render() {
    const g = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
    const think = this.mode === "think";
    const fitZ = Math.min(cw / (W * TILE), ch / (H * TILE)) * 0.96;
    const actZ = Math.max(fitZ, Math.min(cw, ch * 1.6) / (26 * TILE));
    const tz = think ? fitZ : actZ, tx = think ? W / 2 : this.player.x, ty = think ? H / 2 : this.player.y;
    this.cam.z += (tz - this.cam.z) * 0.12; this.cam.x += (tx - this.cam.x) * 0.12; this.cam.y += (ty - this.cam.y) * 0.12;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, cw, ch);
    g.setTransform(this.cam.z, 0, 0, this.cam.z, cw / 2 - this.cam.x * TILE * this.cam.z, ch / 2 - this.cam.y * TILE * this.cam.z);
    g.drawImage(this.bg, 0, 0);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + performance.now() / 300);
    // exits glow
    for (const e of EXITS) for (const [x, y] of e.tiles) { g.fillStyle = `rgba(76,242,160,${0.15 + pulse * 0.25})`; g.fillRect(x * TILE, y * TILE, TILE, TILE); }
    if (think) {
      for (let i = 0; i < W * H; i++) if (this.risk[i] > 6) { g.fillStyle = `rgba(255,59,92,${Math.min(0.35, this.risk[i] / 60)})`; g.fillRect((i % W) * TILE, ((i / W) | 0) * TILE, TILE, TILE); }
      for (const h of this.hostiles) if (h.state !== "down" && h.route.length > 1) {
        g.strokeStyle = "rgba(255,59,92,0.5)"; g.setLineDash([4, 6]); g.lineWidth = 2; g.beginPath();
        h.route.forEach((p, i) => (i ? g.lineTo(p.x * TILE, p.y * TILE) : g.moveTo(p.x * TILE, p.y * TILE))); g.closePath(); g.stroke(); g.setLineDash([]);
      }
    }
    for (const k of this.pickups) {
      g.fillStyle = k.kind === "med" ? C.mint : C.amber; g.beginPath(); g.arc(k.x * TILE, k.y * TILE, 7 + pulse * 2, 0, 7); g.fill();
      g.fillStyle = C.bg; g.font = "bold 10px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(k.kind === "med" ? "+" : "▮", k.x * TILE, k.y * TILE + 1);
    }
    for (const n of this.noises) { const t = n.t / 0.8; g.strokeStyle = n.color; g.globalAlpha = (1 - t) * 0.6; g.lineWidth = 2; g.beginPath(); g.arc(n.x * TILE, n.y * TILE, n.max * t * TILE, 0, 7); g.stroke(); g.globalAlpha = 1; }
    for (const h of this.hostiles) if (h.state !== "down") this.cone(g, h);
    // routes
    for (const c of this.civs) if (c.kind === "teacher" && c.route?.length && c.state === "follow") {
      g.strokeStyle = C.mint; g.lineWidth = 3; g.setLineDash([8, 6]); g.lineDashOffset = -performance.now() / 40; g.beginPath(); g.moveTo(c.x * TILE, c.y * TILE);
      for (const p of c.route) g.lineTo(p.x * TILE, p.y * TILE); g.stroke(); g.setLineDash([]);
    }
    // civilians
    for (const c of this.civs) {
      if (c.state === "evac") continue;
      const px = c.x * TILE, py = c.y * TILE;
      const shake = c.state === "captured" ? Math.sin(performance.now() / 40) * 1.5 : 0;
      g.fillStyle = c.color; g.beginPath(); g.arc(px + shake, py, c.kind === "teacher" ? 9 : 7, 0, 7); g.fill();
      if (c.kind === "teacher") { g.strokeStyle = C.mint; g.lineWidth = 3; g.beginPath(); g.arc(px, py, 13, 0, 7); g.stroke(); g.fillStyle = C.bg; g.font = "bold 9px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("T", px, py + 1); }
      if (c.state === "captured") { g.strokeStyle = C.amber; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 11, 0, 7); g.stroke(); }
      if (c.state === "follow" && c.leader === "player") { g.fillStyle = C.cyan; g.beginPath(); g.arc(px, py - 11, 2.5, 0, 7); g.fill(); }
      if (think && this.selected === c.id) { g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 18 + pulse * 3, 0, 7); g.stroke(); }
      if (think && c.kind === "teacher") { g.fillStyle = C.white; g.font = "600 11px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText(c.name, px, py - 20); }
    }
    // hostiles
    for (const h of this.hostiles) {
      const px = h.x * TILE, py = h.y * TILE;
      if (h.state === "down") { g.strokeStyle = "rgba(232,236,245,0.35)"; g.lineWidth = 3; g.beginPath(); g.moveTo(px - 7, py - 7); g.lineTo(px + 7, py + 7); g.moveTo(px + 7, py - 7); g.lineTo(px - 7, py + 7); g.stroke(); continue; }
      g.save(); g.translate(px, py); g.rotate(h.facing);
      g.fillStyle = "#2a0f18"; g.strokeStyle = C.red; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(13, 0); g.lineTo(-9, -10); g.lineTo(-5, 0); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
      g.restore();
      if (h.state !== "patrol") { g.fillStyle = h.state === "alert" ? C.red : C.amber; g.font = "bold 16px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText(h.state === "alert" ? "!" : "?", px, py - 18); }
      if (h.aw > 0 && h.state !== "alert") { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(px - 12, py + 14, 24, 3); g.fillStyle = C.amber; g.fillRect(px - 12, py + 14, (24 * h.aw) / 100, 3); }
    }
    // player
    const p = this.player, ppx = p.x * TILE, ppy = p.y * TILE;
    if (!think) { g.strokeStyle = "rgba(39,224,240,0.25)"; g.lineWidth = 1; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(ppx, ppy); g.lineTo(ppx + Math.cos(p.facing) * 200, ppy + Math.sin(p.facing) * 200); g.stroke(); g.setLineDash([]); }
    g.fillStyle = "rgba(39,224,240,0.18)"; g.beginPath(); g.arc(ppx, ppy, 18 + pulse * 3, 0, 7); g.fill();
    g.save(); g.translate(ppx, ppy); g.rotate(p.facing);
    g.fillStyle = "#0b2a33"; g.strokeStyle = C.cyan; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill(); g.stroke();
    g.fillStyle = C.cyan; g.fillRect(6, -3, 10, 6);
    g.restore();
    if (think) { g.fillStyle = C.cyan; g.font = "700 12px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText("YOU", ppx, ppy - 22); }
    for (const t of this.tracers) { g.strokeStyle = t.color; g.lineWidth = 2; g.globalAlpha = t.t / 0.12; g.beginPath(); g.moveTo(t.x1 * TILE, t.y1 * TILE); g.lineTo(t.x2 * TILE, t.y2 * TILE); g.stroke(); g.globalAlpha = 1; }
    for (const f of this.floats) { g.globalAlpha = Math.min(1, f.t * 2); g.fillStyle = f.color; g.font = "700 12px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillText(f.text, f.x * TILE, f.y * TILE); g.globalAlpha = 1; }

    // screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, this.slowmo ? "rgba(39,224,240,0.25)" : "rgba(0,0,0,0.6)");
    g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
    if (p.hp < 35 && !think) { g.fillStyle = `rgba(255,59,92,${0.08 + pulse * 0.08})`; g.fillRect(0, 0, cw, ch); }
    if (this.status === "lost") { g.fillStyle = `rgba(30,30,40,${Math.min(0.7, this.endT * 0.5)})`; g.fillRect(0, 0, cw, ch); }
    if (!think) this.minimap(g, cw);
  }
  minimap(g: CanvasRenderingContext2D, cw: number) {
    const s = 3.2 * this.dpr, mw = W * s, mh = H * s, ox = cw - mw - 16 * this.dpr, oy = 16 * this.dpr;
    g.globalAlpha = 0.85; g.drawImage(this.bg, ox, oy, mw, mh); g.globalAlpha = 1;
    g.strokeStyle = "rgba(39,224,240,0.5)"; g.lineWidth = 1; g.strokeRect(ox, oy, mw, mh);
    for (const c of this.civs) if (c.state !== "evac") { g.fillStyle = c.state === "captured" ? C.amber : c.kind === "teacher" ? C.mint : C.white; g.fillRect(ox + c.x * s - 1, oy + c.y * s - 1, 2.5, 2.5); }
    for (const h of this.hostiles) if (h.state !== "down") { g.fillStyle = C.red; g.fillRect(ox + h.x * s - 2, oy + h.y * s - 2, 4, 4); }
    g.fillStyle = C.cyan; g.beginPath(); g.arc(ox + this.player.x * s, oy + this.player.y * s, 3.5, 0, 7); g.fill();
  }
}
