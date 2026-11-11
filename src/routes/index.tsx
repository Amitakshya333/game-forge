import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Engine, type Difficulty, type Result, type Snapshot } from "@/game/engine";
import { initAudio, sfx } from "@/game/audio";
import campusNight from "@/assets/campus-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campus Lockdown: The Dream Hero — SUIIT Burla" },
      { name: "description", content: "Think, plan, react. A tactical rescue game where you save SUIIT Burla from a fictional armed group." },
      { property: "og:title", content: "Campus Lockdown: The Dream Hero" },
      { property: "og:description", content: "Think, plan, react. Save every student and teacher at SUIIT Burla." },
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
  const [result, setResult] = useState<Result | null>(null);
  const [run, setRun] = useState(0);
  return (
    <main className="fixed inset-0 overflow-hidden bg-background font-display text-foreground select-none">
      {screen === "title" && <Title diff={diff} setDiff={setDiff} onPlay={() => { initAudio(); sfx.click(); setScreen("intro"); }} />}
      {screen === "intro" && <Intro onDone={() => setScreen("play")} />}
      {screen === "play" && <Play key={run} diff={diff} onEnd={(r) => { setResult(r); setScreen("end"); }} />}
      {screen === "end" && result && <End r={result} onRetry={() => { setRun((x) => x + 1); setScreen("play"); }} onMenu={() => setScreen("title")} />}
    </main>
  );
}

function Title({ diff, setDiff, onPlay }: { diff: Difficulty; setDiff: (d: Difficulty) => void; onPlay: () => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6">
      <img src={campusNight} alt="SUIIT campus at night" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
      <div className="absolute inset-0 scanlines" />
      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <p className="animate-rise font-mono text-xs uppercase tracking-[0.5em] text-accent">SUIIT · Burla · Sambalpur</p>
        <h1 className="animate-rise mt-4 text-5xl font-bold uppercase leading-none tracking-tight md:text-8xl glow-text text-primary" style={{ animationDelay: "0.1s" }}>
          Campus<br />Lockdown
        </h1>
        <p className="animate-rise mt-3 text-xl uppercase tracking-[0.35em] text-dream dream-text md:text-2xl" style={{ animationDelay: "0.2s" }}>The Dream Hero</p>
        <p className="animate-rise mt-6 max-w-xl text-muted-foreground" style={{ animationDelay: "0.3s" }}>
          Every student has imagined it. Now the alarm is real. Think. Plan. React. Get everyone out — or take them all down.
        </p>
        <div className="animate-rise mt-8 grid grid-cols-2 gap-2 md:grid-cols-4" style={{ animationDelay: "0.4s" }}>
          {DIFFS.map((d) => (
            <button key={d.id} data-active={diff === d.id} onClick={() => { sfx.click(); setDiff(d.id); }} className="btn-ghost-tac flex-col !gap-0.5">
              <span>{d.label}</span>
              <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">{d.note}</span>
            </button>
          ))}
        </div>
        <button onClick={onPlay} className="btn-tac animate-rise mt-8 !px-12 !py-4 !text-base" style={{ animationDelay: "0.5s" }}>▶ Start the dream</button>
        <p className="mt-10 max-w-lg font-mono text-[10px] leading-relaxed text-muted-foreground/70">
          Fiction. The hostile group "Iron Veil" is invented and represents no real group. No gore. Campus layout is an approximation. Best on desktop with keyboard + mouse.
        </p>
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

function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const [wake, setWake] = useState(false);
  useEffect(() => {
    if (wake) return;
    const line = LINES[i];
    if (chars < line.length) { const t = setTimeout(() => setChars((c) => c + 1), 32); return () => clearTimeout(t); }
    const t = setTimeout(() => {
      if (i < LINES.length - 1) { setI(i + 1); setChars(0); } else { setWake(true); sfx.glitch(); }
    }, 900);
    return () => clearTimeout(t);
  }, [i, chars, wake]);
  if (wake) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-background px-6 text-center">
        <div className="absolute inset-0 scanlines" />
        <h2 className="animate-glitch text-6xl font-bold uppercase text-destructive danger-text md:text-9xl">Wake up.</h2>
        <p className="animate-rise mt-6 max-w-xl text-lg text-foreground" style={{ animationDelay: "0.6s" }}>
          Gunfire. Real gunfire. You're in the canteen. You are not invincible — one wrong move and you're down.
        </p>
        <p className="animate-rise mt-2 max-w-xl text-muted-foreground" style={{ animationDelay: "0.9s" }}>
          Students and teachers are hiding across campus. Plan their escape, then go.
        </p>
        <div className="animate-rise mt-8 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-1 text-left font-mono text-xs text-muted-foreground md:grid-cols-3" style={{ animationDelay: "1.2s" }}>
          {[["WASD", "move"], ["Mouse", "aim · click shoot"], ["Shift", "run (loud)"], ["C", "crouch / sneak"], ["E", "silent takedown"], ["Q", "throw bottle (distract)"], ["G", "whistle: follow me"], ["X", "tell followers to hide"], ["R", "reload"], ["Space", "hold: Focus slow-mo"], ["Tab", "Think Mode (plan)"]].map(([k, v]) => (
            <div key={k}><span className="text-primary">{k}</span> — {v}</div>
          ))}
        </div>
        <button onClick={onDone} className="btn-tac animate-rise mt-10" style={{ animationDelay: "1.5s" }}>Open your eyes</button>
      </div>
    );
  }
  return (
    <div className="relative flex h-full items-center justify-center px-6" onClick={() => { setWake(true); sfx.glitch(); }}>
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

function Bar({ v, max = 100, tone }: { v: number; max?: number; tone: "primary" | "accent" | "destructive" | "success" }) {
  const cls = { primary: "bg-primary", accent: "bg-accent", destructive: "bg-destructive", success: "bg-success" }[tone];
  return <div className="h-1.5 w-full bg-muted"><div className={`h-full ${cls} transition-all`} style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} /></div>;
}

function Play({ diff, onEnd }: { diff: Difficulty; onEnd: (r: Result) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eng = useRef<Engine | null>(null);
  const [s, setS] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true; let iv: ReturnType<typeof setInterval> | undefined;
    document.fonts.ready.then(() => {
      if (!alive || !ref.current) return;
      eng.current = new Engine(ref.current, diff, onEnd);
      iv = setInterval(() => eng.current && setS(eng.current.snapshot()), 100);
    });
    return () => { alive = false; clearInterval(iv); eng.current?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);
  const mm = s ? `${Math.floor(s.timeLeft / 60)}:${String(Math.floor(s.timeLeft % 60)).padStart(2, "0")}` : "";
  const alertTone = !s ? "success" : s.alert >= 100 ? "destructive" : s.alert > 30 ? "accent" : "success";
  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className={`h-full w-full ${s?.mode === "think" ? "cursor-pointer" : "cursor-crosshair"}`} />
      {s && (
        <>
          {/* objectives */}
          <div className="hud-panel pointer-events-none absolute left-4 top-4 w-64 p-3 text-sm">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span>Objective</span><span className={s.timeLeft < 60 ? "text-destructive animate-flicker" : "text-accent"}>⏱ {mm}</span></div>
            <div className="mt-2 flex justify-between"><span>Evacuated</span><span className="text-success">{s.evac}/{s.total}</span></div>
            <div className="flex justify-between"><span>Hostiles down</span><span className="text-primary">{s.down}/{s.hostiles}</span></div>
            <div className="flex justify-between"><span>Following you</span><span>{s.following}</span></div>
            {s.captured > 0 && <div className="flex justify-between text-accent"><span>Captured</span><span>{s.captured}</span></div>}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Alert</div>
            <Bar v={s.alert} tone={alertTone} />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Heat</div>
            <Bar v={s.heat} tone="destructive" />
          </div>
          {/* vitals */}
          {s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute bottom-4 left-4 w-64 space-y-1.5 p-3 font-mono text-[10px] uppercase tracking-widest">
              <div className="flex justify-between"><span>Health</span><span>{s.hp}</span></div><Bar v={s.hp} tone={s.hp < 35 ? "destructive" : "success"} />
              <div className="flex justify-between"><span>Stamina</span></div><Bar v={s.stamina} tone="accent" />
              <div className="flex justify-between"><span>Focus {s.slowmo && "· SLOW-MO"}</span><span>{Math.round(s.focus)}</span></div><Bar v={s.focus} tone="primary" />
              <div className="pt-1 text-muted-foreground">Stance: <span className="text-foreground">{s.stance}</span></div>
            </div>
          )}
          {s.mode === "act" && (
            <div className="hud-panel pointer-events-none absolute bottom-4 right-4 p-3 text-right">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sidearm</div>
              <div className="text-3xl font-bold text-primary">{s.mag}<span className="text-base text-muted-foreground"> / {s.reserve}</span></div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Bottles × {s.bottles}</div>
            </div>
          )}
          {s.prompt && s.mode === "act" && <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 hud-panel px-4 py-2 text-sm uppercase tracking-widest text-primary">{s.prompt}</div>}
          {s.toast && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 hud-panel px-4 py-2 text-sm text-accent">{s.toast}</div>}
          {s.radio && s.mode === "act" && <div className="pointer-events-none absolute left-1/2 top-16 max-w-lg -translate-x-1/2 hud-panel border-l-2 !border-l-success px-4 py-2 text-sm">📻 {s.radio}</div>}
          {s.mode === "think" && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
              <div className="hud-panel flex max-w-3xl flex-col items-center gap-3 px-6 py-4 text-center md:flex-row md:text-left">
                <div className="flex-1">
                  <div className="text-lg font-bold uppercase tracking-[0.3em] text-accent">Think Mode · time frozen</div>
                  <p className="text-sm text-muted-foreground">
                    {s.selected ? <>Selected <span className="text-success">{s.selected}</span> — now click an exit at the map edge.</> : <>Click a <span className="text-success">teacher</span>, then an <span className="text-success">exit</span>. Their group follows the safest path. Red = hostile vision & patrols.</>}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">Routes planned: {s.plannedGroups} · Re-entering Think Mode costs 15 Focus</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost-tac" onClick={() => eng.current?.autoPlan()}>Auto-plan</button>
                  <button className="btn-tac" onClick={() => eng.current?.toggleThink()}>Execute ▶</button>
                </div>
              </div>
            </div>
          )}
          {s.mode === "think" && s.radio && <div className="pointer-events-none absolute right-4 top-4 max-w-sm hud-panel border-l-2 !border-l-success px-4 py-2 text-sm">📻 {s.radio}</div>}
        </>
      )}
    </div>
  );
}

function End({ r, onRetry, onMenu }: { r: Result; onRetry: () => void; onMenu: () => void }) {
  const title = r.path === "perfect" ? "No One Left Behind" : r.path === "clear" ? "Campus Cleared" : r.path === "evac" ? "Everyone Got Out" : "Lost Contact";
  return (
    <div className="relative flex h-full items-center justify-center overflow-auto px-6 py-10 grid-bg">
      <div className="absolute inset-0 scanlines" />
      <div className="hud-panel relative z-10 w-full max-w-2xl p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-muted-foreground">{r.win ? "Mission complete" : "Mission failed"}</p>
        <h2 className={`mt-2 text-4xl font-bold uppercase md:text-6xl ${r.win ? "text-primary glow-text" : "text-muted-foreground"}`}>{title}</h2>
        <p className="mt-2 text-muted-foreground">{r.reason}</p>
        <div className="mt-6 flex justify-center gap-4 text-5xl">
          {[0, 1, 2].map((i) => <span key={i} className={`animate-pop ${i < r.stars ? "text-accent" : "text-muted"}`} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>★</span>)}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left md:grid-cols-4">
          {[["Rescued", `${r.evac}/${r.total}`], ["Hostiles down", `${r.down}/${r.hostiles}`], ["Captured", r.captured], ["Alerts", r.alerts], ["Takedowns", r.takedowns], ["Shots", r.shots], ["Planned escapes", r.planned], ["Score", r.score]].map(([k, v]) => (
            <div key={k as string} className="border border-border p-2"><div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div><div className="text-xl font-bold">{v}</div></div>
          ))}
        </div>
        <div className="mt-6 space-y-2 text-left">
          <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Debrief</div>
          {r.tips.map((t) => <p key={t} className="text-sm">› {t}</p>)}
        </div>
        {r.win && <p className="mt-6 italic text-dream">Real heroes don't just fight. They get everyone home.</p>}
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn-tac" onClick={onRetry}>{r.win ? "Play again" : "Retry with a plan"}</button>
          <button className="btn-ghost-tac" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}
