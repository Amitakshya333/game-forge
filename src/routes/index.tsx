import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Engine, type Difficulty, type Result, type Snapshot } from "@/game/engine";
import { MAPS } from "@/game/maps";
import { HeroPreview3D } from "@/game/preview3d";
import { initAudio, sfx } from "@/game/audio";
import campusNight from "@/assets/campus-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campus Lockdown 3D: The Dream Hero — SUIIT Burla" },
      {
        name: "description",
        content:
          "Think, plan, react in full 3D. A tactical rescue game across SUIIT Burla and multiple campus maps.",
      },
      { property: "og:title", content: "Campus Lockdown 3D: The Dream Hero" },
      {
        property: "og:description",
        content: "Think, plan, react in full 3D. Save every student and teacher across multiple campus maps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});

type Screen = "title" | "intro" | "play" | "end";
const DIFFS: { id: Difficulty; label: string; note: string }[] = [
  { id: "rookie", label: "Rookie", note: "9 hostiles · 12 min" },
  { id: "veteran", label: "Veteran", note: "11 hostiles · 10 min" },
  { id: "elite", label: "Elite", note: "13 hostiles · 8 min" },
  { id: "nightmare", label: "Nightmare", note: "Sharp eyes · 7 min" },
];

function Game() {
  const [screen, setScreen] = useState<Screen>("title");
  const [diff, setDiff] = useState<Difficulty>("rookie");
  const [mapId, setMapId] = useState<string>(MAPS[0]!.id);
  const [result, setResult] = useState<Result | null>(null);
  const [run, setRun] = useState(0);
  return (
    <main className="fixed inset-0 overflow-hidden bg-background font-display text-foreground select-none">
      {screen === "title" && (
        <Title
          diff={diff}
          setDiff={setDiff}
          mapId={mapId}
          setMapId={setMapId}
          onPlay={() => {
            initAudio();
            sfx.click();
            setScreen("intro");
          }}
        />
      )}
      {screen === "intro" && <Intro mapId={mapId} onDone={() => setScreen("play")} />}
      {screen === "play" && (
        <Play
          key={run}
          diff={diff}
          mapId={mapId}
          onEnd={(r) => {
            setResult(r);
            setScreen("end");
          }}
        />
      )}
      {screen === "end" && result && (
        <End
          r={result}
          onRetry={() => {
            setRun((x) => x + 1);
            setScreen("play");
          }}
          onMenu={() => setScreen("title")}
        />
      )}
    </main>
  );
}

function Title({
  diff,
  setDiff,
  mapId,
  setMapId,
  onPlay,
}: {
  diff: Difficulty;
  setDiff: (d: Difficulty) => void;
  mapId: string;
  setMapId: (id: string) => void;
  onPlay: () => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!previewRef.current) return;
    let preview: HeroPreview3D | null = null;
    try {
      preview = new HeroPreview3D(previewRef.current);
    } catch {
      // Fallback safely if WebGL unavailable
    }
    return () => preview?.dispose();
  }, []);

  const selectedMap = MAPS.find((m) => m.id === mapId) ?? MAPS[0]!;

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto px-6 py-8">
      <img
        src={campusNight}
        alt="SUIIT campus at night"
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/35" />
      <div className="absolute inset-0 scanlines" />

      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="animate-rise inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.4em] text-primary">
            <span>3D Tactical Edition</span>
            <span className="text-accent">· SUIIT Burla</span>
          </div>

          <h1
            className="animate-rise mt-3 text-5xl font-bold uppercase leading-none tracking-tight text-primary glow-text md:text-7xl"
            style={{ animationDelay: "0.08s" }}
          >
            Campus Lockdown
          </h1>
          <p
            className="animate-rise mt-2 text-lg uppercase tracking-[0.35em] text-dream dream-text md:text-2xl"
            style={{ animationDelay: "0.14s" }}
          >
            The Dream Hero · 3D
          </p>
          <p className="animate-rise mt-3 max-w-2xl text-sm text-muted-foreground md:text-base" style={{ animationDelay: "0.2s" }}>
            Full 3D campus battlegrounds, articulated 3D characters, smart cutaway interiors, and multi-map rescue ops.
            Think, plan in 3D overhead view, and save everyone.
          </p>

          {/* Map Selection */}
          <div className="animate-rise mt-5 w-full" style={{ animationDelay: "0.26s" }}>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <span>Select 3D Campus Map</span>
              <span className="text-primary">{selectedMap.tag}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {MAPS.map((m) => {
                const active = m.id === mapId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-active={active}
                    onClick={() => {
                      sfx.click();
                      setMapId(m.id);
                    }}
                    className={`hud-panel flex flex-col justify-between p-3 text-left transition-all ${
                      active ? "!border-primary ring-1 ring-primary/60 bg-primary/15" : "hover:border-primary/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-accent">{m.tag}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {m.exits.length} Exits
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-foreground">{m.name}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{m.subtitle}</div>
                    </div>
                    <div className="mt-2 font-mono text-[9px] text-primary/80">
                      {m.zones.filter((z) => z.type === "building").length} Buildings · {m.w}×{m.h} Grid
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{selectedMap.description}</p>
          </div>

          {/* Difficulty Selection */}
          <div className="animate-rise mt-5 w-full" style={{ animationDelay: "0.34s" }}>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Difficulty
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  data-active={diff === d.id}
                  onClick={() => {
                    sfx.click();
                    setDiff(d.id);
                  }}
                  className="btn-ghost-tac flex-col !gap-0.5"
                >
                  <span>{d.label}</span>
                  <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">{d.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="animate-rise mt-6 flex flex-wrap items-center gap-4" style={{ animationDelay: "0.42s" }}>
            <button onClick={onPlay} className="btn-tac !px-10 !py-3.5 !text-base">
              ▶ Start 3D Mission
            </button>
            <p className="max-w-xs font-mono text-[10px] leading-relaxed text-muted-foreground/75">
              Fiction. "Iron Veil" is invented and represents no real group. No gore. Best on desktop with mouse + keyboard.
            </p>
          </div>
        </div>

        {/* Live 3D Hero Showcase */}
        <div
          className="animate-rise hud-panel relative hidden h-[390px] flex-col items-center justify-between overflow-hidden p-4 lg:flex"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Unit · Dream Hero 3D</span>
            <span className="text-success">● Ready</span>
          </div>
          <canvas ref={previewRef} className="h-[290px] w-full" />
          <div className="w-full border-t border-border/60 pt-2.5 text-center font-mono text-[10px] text-muted-foreground">
            Articulated 3D Rig · Suppressed Sidearm · Tactical Visor
          </div>
        </div>
      </div>
    </div>
  );
}

const LINES = [
  "Sitting in the back bench of Academic Block A…",
  "You drift off. The usual daydream begins.",
  "Terrorists storm SUIIT. You alone stand up.",
  "One punch. Two. Twenty. Everyone cheers your name.",
  "You are invincible. You are the hero…",
];

function Intro({ mapId, onDone }: { mapId: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const [wake, setWake] = useState(false);
  const map = MAPS.find((m) => m.id === mapId) ?? MAPS[0]!;

  useEffect(() => {
    if (wake) return;
    const line = LINES[i] ?? "";
    if (chars < line.length) {
      const t = setTimeout(() => setChars((c) => c + 1), 32);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (i < LINES.length - 1) {
        setI(i + 1);
        setChars(0);
      } else {
        setWake(true);
        sfx.glitch();
      }
    }, 900);
    return () => clearTimeout(t);
  }, [i, chars, wake]);

  if (wake) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-background px-6 text-center">
        <div className="absolute inset-0 scanlines" />
        <h2 className="animate-glitch text-6xl font-bold uppercase text-destructive danger-text md:text-8xl">
          Wake up.
        </h2>
        <p className="animate-rise mt-5 max-w-xl text-lg text-foreground" style={{ animationDelay: "0.4s" }}>
          Gunfire. Real gunfire across <span className="text-primary">{map.name}</span>. You are not invincible — one
          wrong move and you're down.
        </p>
        <p className="animate-rise mt-2 max-w-xl text-muted-foreground" style={{ animationDelay: "0.7s" }}>
          Roofs open automatically as you enter buildings. Plan escape routes in 3D Think Mode, then move.
        </p>
        <div
          className="animate-rise mt-7 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-1.5 text-left font-mono text-xs text-muted-foreground md:grid-cols-3"
          style={{ animationDelay: "1.0s" }}
        >
          {[
            ["WASD", "move (camera-aligned)"],
            ["Mouse", "aim 3D laser · click shoot"],
            ["Right-Drag / [ ]", "rotate 3D camera"],
            ["Scroll Wheel", "zoom 3D camera"],
            ["V", "toggle Tactical / Close cam"],
            ["Shift", "run (loud)"],
            ["C", "crouch / sneak"],
            ["E", "silent takedown"],
            ["Q", "throw 3D bottle (distract)"],
            ["G", "whistle: follow me"],
            ["X", "tell followers to hide"],
            ["R", "reload sidearm"],
            ["Space", "hold: Focus slow-mo"],
            ["Tab", "3D Think Mode (plan)"],
          ].map(([k, v]) => (
            <div key={k}>
              <span className="text-primary">{k}</span> — {v}
            </div>
          ))}
        </div>
        <button onClick={onDone} className="btn-tac animate-rise mt-9" style={{ animationDelay: "1.2s" }}>
          Open your eyes
        </button>
      </div>
    );
  }
  return (
    <div
      className="relative flex h-full items-center justify-center px-6"
      onClick={() => {
        setWake(true);
        sfx.glitch();
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-dream/25 via-background to-dream-rose/20 blur-2xl" />
      <div className="relative z-10 max-w-2xl space-y-4 text-center">
        {LINES.slice(0, i + 1).map((l, k) => (
          <p key={k} className={`text-2xl md:text-3xl ${k === i ? "text-dream dream-text" : "text-dream/40"}`}>
            {k === i ? l.slice(0, chars) : l}
            {k === i && <span className="animate-flicker">▍</span>}
          </p>
        ))}
        <p className="pt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">click to skip</p>
      </div>
    </div>
  );
}

function Bar({
  v,
  max = 100,
  tone,
}: {
  v: number;
  max?: number;
  tone: "primary" | "accent" | "destructive" | "success";
}) {
  const cls = { primary: "bg-primary", accent: "bg-accent", destructive: "bg-destructive", success: "bg-success" }[
    tone
  ];
  return (
    <div className="h-1.5 w-full bg-muted">
      <div
        className={`h-full ${cls} transition-all`}
        style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }}
      />
    </div>
  );
}

function Play({ diff, mapId, onEnd }: { diff: Difficulty; mapId: string; onEnd: (r: Result) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const eng = useRef<Engine | null>(null);
  const [s, setS] = useState<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;
    let iv: ReturnType<typeof setInterval> | undefined;
    document.fonts.ready.then(() => {
      if (!alive || !ref.current) return;
      eng.current = new Engine(ref.current, diff, onEnd, mapId, radarRef.current);
      iv = setInterval(() => eng.current && setS(eng.current.snapshot()), 90);
    });
    return () => {
      alive = false;
      clearInterval(iv);
      eng.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, mapId]);

  const mm = s ? `${Math.floor(s.timeLeft / 60)}:${String(Math.floor(s.timeLeft % 60)).padStart(2, "0")}` : "";
  const alertTone = !s ? "success" : s.alert >= 100 ? "destructive" : s.alert > 30 ? "accent" : "success";

  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className={`h-full w-full ${s?.mode === "think" ? "cursor-pointer" : "cursor-crosshair"}`} />

      {/* Screen-space atmosphere vignettes */}
      {s?.slowmo && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 110px rgba(39, 224, 240, 0.32)" }}
        />
      )}
      {s && s.hp < 35 && s.mode === "act" && (
        <div
          className="pointer-events-none absolute inset-0 animate-flicker"
          style={{ boxShadow: "inset 0 0 110px rgba(255, 59, 92, 0.35)" }}
        />
      )}

      {s && (
        <>
          {/* Objectives */}
          <div className="hud-panel pointer-events-none absolute left-4 top-4 w-64 p-3 text-sm">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Objective</span>
              <span className={s.timeLeft < 60 ? "animate-flicker text-destructive" : "text-accent"}>⏱ {mm}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span>Evacuated</span>
              <span className="text-success">
                {s.evac}/{s.total}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Hostiles down</span>
              <span className="text-primary">
                {s.down}/{s.hostiles}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Following you</span>
              <span>{s.following}</span>
            </div>
            {s.captured > 0 && (
              <div className="flex justify-between text-accent">
                <span>Captured</span>
                <span>{s.captured}</span>
              </div>
            )}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Alert</div>
            <Bar v={s.alert} tone={alertTone} />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Heat</div>
            <Bar v={s.heat} tone="destructive" />
          </div>

          {/* 2D Tactical Radar + Location & Camera Controls */}
          {s.mode === "act" && (
            <div className="hud-panel absolute right-4 top-4 flex flex-col gap-2 p-2.5">
              <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-widest">
                <span className="text-primary">{s.zoneName}</span>
                <button
                  type="button"
                  onClick={() => eng.current?.toggleCameraPreset()}
                  className="border border-primary/40 px-1.5 py-0.5 text-[9px] text-foreground hover:border-primary hover:text-primary"
                >
                  V · {s.camPreset === "tactical" ? "Tactical" : "Close"}
                </button>
              </div>
              <canvas
                ref={(el) => {
                  radarRef.current = el;
                  eng.current?.setRadarCanvas(el);
                }}
                width={192}
                height={122}
                className="border border-primary/30 bg-background/80"
              />
              <div className="flex justify-between gap-3 font-mono text-[9px] text-muted-foreground">
                <span className="truncate">{s.mapName}</span>
                <span className="shrink-0">Right-Drag: Orbit</span>
              </div>
            </div>
          )}

          {/* Vitals */}
          {s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute bottom-4 left-4 w-64 space-y-1.5 p-3 font-mono text-[10px] uppercase tracking-widest">
              <div className="flex justify-between">
                <span>Health</span>
                <span>{s.hp}</span>
              </div>
              <Bar v={s.hp} tone={s.hp < 35 ? "destructive" : "success"} />
              <div className="flex justify-between">
                <span>Stamina</span>
              </div>
              <Bar v={s.stamina} tone="accent" />
              <div className="flex justify-between">
                <span>Focus {s.slowmo && "· SLOW-MO"}</span>
                <span>{Math.round(s.focus)}</span>
              </div>
              <Bar v={s.focus} tone="primary" />
              <div className="pt-1 text-muted-foreground">
                Stance: <span className="text-foreground">{s.stance}</span> · Tab: Plan
              </div>
            </div>
          )}

          {s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute bottom-4 right-4 p-3 text-right">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sidearm</div>
              <div className="text-3xl font-bold text-primary">
                {s.mag}
                <span className="text-base text-muted-foreground"> / {s.reserve}</span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-accent">
                3D Bottles × {s.bottles}
              </div>
            </div>
          )}

          {s.prompt && s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 text-sm uppercase tracking-widest text-primary">
              {s.prompt}
            </div>
          )}
          {s.toast && (
            <div className="hud-panel pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 px-4 py-2 text-sm text-accent">
              {s.toast}
            </div>
          )}
          {s.radio && s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute left-1/2 top-16 max-w-lg -translate-x-1/2 border-l-2 !border-l-success px-4 py-2 text-sm">
              📻 {s.radio}
            </div>
          )}

          {s.mode === "think" && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
              <div className="hud-panel flex max-w-3xl flex-col items-center gap-3 px-6 py-4 text-center md:flex-row md:text-left">
                <div className="flex-1">
                  <div className="text-lg font-bold uppercase tracking-[0.3em] text-accent">
                    3D Think Mode · {s.mapName}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.selected ? (
                      <>
                        Selected <span className="text-success">{s.selected}</span> — now click an exit beacon at the map
                        edge.
                      </>
                    ) : (
                      <>
                        Click a <span className="text-success">teacher</span>, then an{" "}
                        <span className="text-success">exit gate</span>. Roofs are transparent so you see inside every
                        building.
                      </>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Routes planned: {s.plannedGroups} · Re-entering Think Mode costs 15 Focus
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost-tac" onClick={() => eng.current?.autoPlan()}>
                    Auto-plan
                  </button>
                  <button className="btn-tac" onClick={() => eng.current?.toggleThink()}>
                    Execute ▶
                  </button>
                </div>
              </div>
            </div>
          )}
          {s.mode === "think" && s.radio && (
            <div className="hud-panel pointer-events-none absolute right-4 top-4 max-w-sm border-l-2 !border-l-success px-4 py-2 text-sm">
              📻 {s.radio}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function End({ r, onRetry, onMenu }: { r: Result; onRetry: () => void; onMenu: () => void }) {
  const title =
    r.path === "perfect"
      ? "No One Left Behind"
      : r.path === "clear"
        ? "Campus Cleared"
        : r.path === "evac"
          ? "Everyone Got Out"
          : "Lost Contact";
  return (
    <div className="grid-bg relative flex h-full items-center justify-center overflow-auto px-6 py-10">
      <div className="absolute inset-0 scanlines" />
      <div className="hud-panel relative z-10 w-full max-w-2xl p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {r.win ? "Mission complete" : "Mission failed"} · {r.mapName}
        </p>
        <h2 className={`mt-2 text-4xl font-bold uppercase md:text-6xl ${r.win ? "glow-text text-primary" : "text-muted-foreground"}`}>
          {title}
        </h2>
        <p className="mt-2 text-muted-foreground">{r.reason}</p>
        <div className="mt-6 flex justify-center gap-4 text-5xl">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`animate-pop ${i < r.stars ? "text-accent" : "text-muted"}`}
              style={{ animationDelay: `${0.3 + i * 0.35}s` }}
            >
              ★
            </span>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left md:grid-cols-4">
          {[
            ["Rescued", `${r.evac}/${r.total}`],
            ["Hostiles down", `${r.down}/${r.hostiles}`],
            ["Captured", r.captured],
            ["Alerts", r.alerts],
            ["Takedowns", r.takedowns],
            ["Shots", r.shots],
            ["Planned escapes", r.planned],
            ["Score", r.score],
          ].map(([k, v]) => (
            <div key={k as string} className="border border-border p-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
              <div className="text-xl font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2 text-left">
          <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Debrief</div>
          {r.tips.map((t) => (
            <p key={t} className="text-sm">
              › {t}
            </p>
          ))}
        </div>
        {r.win && <p className="mt-6 italic text-dream">Real heroes don't just fight. They get everyone home.</p>}
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn-tac" onClick={onRetry}>
            {r.win ? "Play again" : "Retry with a plan"}
          </button>
          <button className="btn-ghost-tac" onClick={onMenu}>
            Change Map / Menu
          </button>
        </div>
      </div>
    </div>
  );
}
