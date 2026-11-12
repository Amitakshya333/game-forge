let ctx: AudioContext | null = null;
export function initAudio() {
  if (!ctx && typeof window !== "undefined") ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  ctx?.resume();
}
function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
}
function noise(dur: number, vol: number, freq: number) {
  if (!ctx) return;
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(ctx.destination); s.start();
}
export const sfx = {
  shot: () => noise(0.25, 0.5, 2400),
  enemyShot: () => noise(0.2, 0.25, 1400),
  whistle: () => { tone(1800, 0.12, "sine", 0.08); setTimeout(() => tone(2200, 0.18, "sine", 0.08), 120); },
  thud: () => { tone(120, 0.2, "triangle", 0.3, 50); noise(0.1, 0.2, 600); },
  shatter: () => { noise(0.18, 0.32, 6200); tone(1650, 0.09, "triangle", 0.08, 920); },
  reload: () => { tone(620, 0.05, "square", 0.06); setTimeout(() => tone(920, 0.06, "square", 0.07), 160); },
  chime: () => { tone(880, 0.3, "sine", 0.1); setTimeout(() => tone(1320, 0.4, "sine", 0.1), 110); },
  alert: () => { tone(520, 0.15, "square", 0.06); setTimeout(() => tone(780, 0.2, "square", 0.06), 140); },
  hurt: () => tone(200, 0.25, "sawtooth", 0.12, 80),
  click: () => tone(1200, 0.04, "square", 0.04),
  empty: () => tone(300, 0.05, "square", 0.05),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.5, "triangle", 0.12), i * 160)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.7, "sine", 0.12), i * 260)),
  glitch: () => { noise(0.6, 0.4, 5000); tone(80, 0.6, "sawtooth", 0.2, 40); },
};
