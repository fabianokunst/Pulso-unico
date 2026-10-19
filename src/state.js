// Estado global compartilhado + agendador de eventos.
// O agendador usa o tempo de jogo, então tudo congela quando o jogo está pausado.

export const G = {
  t: 0,               // tempo de jogo em segundos
  paused: false,
  mode: 'boot',       // boot | title | play | pc | cutscene | end
  night: 1,
  flags: {},
  // relógio da história: rate = segundos do relógio por segundo real
  clock: { h: 23, m: 57, s: 0, rate: 3, running: false },
  startReal: Date.now(),
};

const timers = [];

export function tick(dt) {
  G.t += dt;
  for (let i = timers.length - 1; i >= 0; i--) {
    const w = timers[i];
    if (w.pred ? w.pred() : G.t >= w.at) {
      timers.splice(i, 1);
      w.res();
    }
  }
  const c = G.clock;
  if (c.running) {
    c.s += dt * c.rate;
    while (c.s >= 60) { c.s -= 60; c.m++; }
    while (c.m >= 60) { c.m -= 60; c.h = (c.h + 1) % 24; }
  }
}

export const wait = (s) => new Promise((res) => timers.push({ at: G.t + s, res }));
export const waitFor = (pred) => new Promise((res) => timers.push({ pred, res }));

export function clockStr(sep = ':') {
  const c = G.clock;
  return String(c.h).padStart(2, '0') + sep + String(c.m).padStart(2, '0');
}

export function setClock(h, m, s = 0) {
  G.clock.h = h; G.clock.m = m; G.clock.s = s;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const smooth = (t) => t * t * (3 - 2 * t);

export function playTime() {
  const s = Math.floor((Date.now() - G.startReal) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + 'h' : '') + String(m).padStart(2, '0') + 'min' + String(r).padStart(2, '0') + 's';
}
