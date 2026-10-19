// Áudio 100% sintetizado (WebAudio). Nenhum arquivo de som é necessário.

let ctx = null, master, sfx, amb, noiseBuf, brownBuf;
const A = {};          // camadas de ambiente
let ringTimer = null, flat = null;
let dripT = 0, hddT = 0, heartT = 0;

function mkNoise(seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}
const gain = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
function noise(brown = false) {
  const s = ctx.createBufferSource();
  s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
  return s;
}
function env(g, t, a, hold, r, peak) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
}
// tom simples com envelope
function tone(f, dur, o = {}) {
  const t = ctx.currentTime + (o.at || 0);
  const s = osc(o.type || 'sine', f);
  const g = gain(0, o.dest || sfx);
  s.connect(g);
  env(g, t, o.a ?? 0.005, Math.max(0, dur - (o.a ?? 0.005)), o.r ?? 0.05, o.vol ?? 0.2);
  if (o.slide) s.frequency.exponentialRampToValueAtTime(o.slide, t + dur + (o.r ?? 0.05));
  s.start(t); s.stop(t + dur + (o.r ?? 0.05) + 0.05);
  return s;
}
// rajada de ruído filtrado
function burst(dur, o = {}) {
  const t = ctx.currentTime + (o.at || 0);
  const s = noise(o.brown);
  const f = filt(o.type || 'bandpass', o.f || 1000, o.q ?? 1);
  const g = gain(0, o.dest || sfx);
  s.connect(f); f.connect(g);
  env(g, t, o.a ?? 0.002, Math.max(0, dur - (o.a ?? 0.002)), o.r ?? 0.03, o.vol ?? 0.2);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur + (o.r ?? 0.03));
  s.start(t, Math.random() * 2); s.stop(t + dur + (o.r ?? 0.03) + 0.05);
}
function layer(name, node, level) {
  const g = gain(0, amb);
  node.connect(g);
  A[name] = { g, target: level };
  return g;
}

export const audio = {
  get ready() { return !!ctx; },

  init() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    master = gain(0.9); master.connect(comp); comp.connect(ctx.destination);
    sfx = gain(1, master); amb = gain(1, master);
    noiseBuf = mkNoise(3, false); brownBuf = mkNoise(4, true);

    // chuva: duas camadas de ruído
    { const n = noise(); const lp = filt('lowpass', 2600); const hp = filt('highpass', 400);
      n.connect(hp); hp.connect(lp); layer('chuva', lp, 0); n.start(); }
    { const n = noise(true); const lp = filt('lowpass', 500);
      n.connect(lp); layer('chuvaGrave', lp, 0); n.start(); }
    // tom do quarto
    { const n = noise(true); const lp = filt('lowpass', 160); n.connect(lp); layer('quarto', lp, 0); n.start(); }
    // zumbido elétrico 60 Hz
    { const m = gain(1); const a = osc('sine', 60), b = osc('sine', 120); const gb = gain(0.5);
      a.connect(m); b.connect(gb); gb.connect(m); layer('rede', m, 0); a.start(); b.start(); }
    // ventoinha do PC
    { const n = noise(true); const bp = filt('bandpass', 260, 0.6); const o = osc('triangle', 118); const go = gain(0.04);
      n.connect(bp); o.connect(go); const m = gain(1); bp.connect(m); go.connect(m); layer('pc', m, 0); n.start(); o.start(); }
    // chiado agudo do CRT (15.7 kHz)
    { const o = osc('sine', 15734); layer('crt', o, 0); o.start(); }
    // grilos (verão do prólogo): tons agudos pulsando
    { const m = gain(1); const o = osc('sine', 4300); const am = osc('square', 28); const ag = gain(0.5); am.connect(ag);
      const v = gain(0.5); ag.connect(v.gain); o.connect(v); const lfo = osc('sine', 0.9); const lg = gain(0.5); lfo.connect(lg); const v2 = gain(0.5); lg.connect(v2.gain); v.connect(v2); v2.connect(m);
      const o2 = osc('sine', 3700); const am2 = osc('square', 23); const ag2 = gain(0.5); am2.connect(ag2); const w = gain(0.5); ag2.connect(w.gain); o2.connect(w); w.connect(m);
      layer('grilos', m, 0); [o, am, lfo, o2, am2].forEach((x) => x.start()); }
    // ventilador
    { const n = noise(true); const bp = filt('bandpass', 380, 0.8); const o = osc('triangle', 47); const go = gain(0.05); o.connect(go);
      const m = gain(1); n.connect(bp); bp.connect(m); go.connect(m); layer('ventilador', m, 0); n.start(); o.start(); }
    // chiado de TV (fica abafado quando longe)
    { const n = noise(); const lp = filt('lowpass', 6000); n.connect(lp); this.tvFilter = lp; layer('tv', lp, 0); n.start(); }
    // geladeira
    { const o = osc('sawtooth', 50); const lp = filt('lowpass', 140); o.connect(lp); layer('geladeira', lp, 0); o.start(); }
    // drone de tensão
    { const m = gain(1); const lp = filt('lowpass', 170, 2);
      const a = osc('sawtooth', 55), b = osc('sawtooth', 55.6), c = osc('sine', 41);
      a.connect(lp); b.connect(lp); c.connect(m); lp.connect(m);
      const lfo = osc('sine', 0.07); const lg = gain(70); lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      layer('drone', m, 0); a.start(); b.start(); c.start(); }
    { const m = gain(1); const a = osc('sine', 1318), b = osc('sine', 1324.5);
      a.connect(m); b.connect(m); layer('agudo', m, 0); a.start(); b.start(); }
    // vento/estática distante
    { const n = noise(); const bp = filt('bandpass', 700, 0.4); n.connect(bp); layer('estatica', bp, 0); n.start(); }

    this.heartBpm = 0;
  },

  // define o nível de uma camada de ambiente (transição suave)
  amb(name, level, time = 1.5) {
    if (!ctx || !A[name]) return;
    const g = A[name].g.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + Math.max(0.01, time));
  },

  // perfis prontos
  ambQuarto({ chuva = 1, pc = 0, crt = 0, drone = 0, rede = 1 } = {}) {
    this.amb('chuva', 0.05 * chuva); this.amb('chuvaGrave', 0.07 * chuva);
    this.amb('quarto', 0.12); this.amb('rede', 0.006 * rede);
    this.amb('pc', 0.11 * pc); this.amb('crt', 0.0022 * crt);
    this.amb('drone', 0.09 * drone); this.amb('agudo', 0.006 * Math.max(0, drone - 0.5));
  },

  update(dt, G) {
    if (!ctx) return;
    // gotas na janela
    dripT -= dt;
    if (dripT <= 0 && A.chuva && A.chuva.g.gain.value > 0.01) {
      dripT = 0.05 + Math.random() * 0.4;
      burst(0.01, { f: 2500 + Math.random() * 3000, q: 4, vol: 0.03 + Math.random() * 0.05, dest: amb });
    }
    // HD trabalhando
    if (G.flags.hdd > 0) {
      G.flags.hdd -= dt;
      hddT -= dt;
      if (hddT <= 0) {
        hddT = 0.02 + Math.random() * 0.12;
        burst(0.006, { f: 3200, q: 2, vol: 0.06, type: 'highpass' });
      }
    }
    // passarinhos (manhã) e cachorro latindo longe (madrugada de verão)
    if (this.birds) {
      this._birdT = (this._birdT ?? 1) - dt;
      if (this._birdT <= 0) {
        this._birdT = 0.4 + Math.random() * 2.2;
        const f = 2400 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(f * (1 + Math.random() * 0.15), 0.05, { vol: 0.02, slide: f * 1.4, r: 0.04, at: i * 0.09 });
      }
    }
    if (this.dogs) {
      this._dogT = (this._dogT ?? 6) - dt;
      if (this._dogT <= 0) {
        this._dogT = 9 + Math.random() * 16;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) burst(0.11, { f: 650 + Math.random() * 120, q: 3, vol: 0.05, at: i * 0.32, sweep: 420, dest: amb });
      }
    }
    // coração
    if (this.heartBpm > 0) {
      heartT -= dt;
      if (heartT <= 0) { heartT = 60 / this.heartBpm; this.heartbeat(); }
    }
  },

  // chiado da TV: volume e "abafamento" pela distância (paredes no caminho)
  tvLevel(level, dist = 0) {
    if (!ctx || !A.tv) return;
    A.tv.g.gain.setTargetAtTime(level * 0.09 / (1 + dist * 0.25), ctx.currentTime, 0.1);
    this.tvFilter.frequency.setTargetAtTime(Math.max(350, 6000 / (1 + dist * 1.4)), ctx.currentTime, 0.1);
  },
  paper() { if (!ctx) return; burst(0.18, { f: 3500, type: 'highpass', vol: 0.08, r: 0.1 }); burst(0.12, { f: 2000, q: 0.5, vol: 0.05, at: 0.2 }); },
  pickup() { if (!ctx) return; burst(0.03, { f: 1800, q: 1, vol: 0.12 }); tone(220, 0.04, { vol: 0.08, at: 0.02 }); },

  // ---------- efeitos ----------
  click() { if (!ctx) return; burst(0.006, { f: 4000, type: 'highpass', vol: 0.12 }); },
  key() {
    if (!ctx) return;
    burst(0.025, { f: 2200 + Math.random() * 1200, q: 2, vol: 0.12 });
    tone(160 + Math.random() * 40, 0.02, { vol: 0.08, r: 0.03 });
  },
  step(surface = 'madeira') {
    if (!ctx) return;
    if (surface === 'piso') burst(0.05, { f: 900, q: 1.5, vol: 0.09, r: 0.06 });
    else burst(0.07, { f: 280 + Math.random() * 120, type: 'lowpass', vol: 0.16, brown: true, r: 0.06 });
  },
  watchBeep() {
    if (!ctx) return;
    tone(3150, 0.05, { type: 'square', vol: 0.025 });
    tone(3150, 0.05, { type: 'square', vol: 0.025, at: 0.13 });
  },
  chime() { // mensagem nova
    if (!ctx) return;
    tone(740, 0.09, { vol: 0.12, r: 0.25 });
    tone(1108, 0.12, { vol: 0.12, r: 0.4, at: 0.1 });
    tone(2216, 0.1, { vol: 0.03, r: 0.3, at: 0.1 });
  },
  toastSound() { // contato entrou
    if (!ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.07, { vol: 0.09, r: 0.25, at: i * 0.07 }));
  },
  errorSound() { if (!ctx) return; tone(440, 0.12, { type: 'triangle', vol: 0.12, r: 0.2 }); tone(330, 0.2, { type: 'triangle', vol: 0.12, r: 0.3, at: 0.1 }); },
  startup() {
    if (!ctx) return;
    const ch = [261.6, 329.6, 392, 493.9, 587.3];
    ch.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.12;
      const s = osc('sawtooth', f); const lp = filt('lowpass', 300, 1); const g = gain(0, sfx);
      s.connect(lp); lp.connect(g);
      lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
      env(g, t, 0.3, 0.8, 1.8, 0.035);
      s.start(t); s.stop(t + 3.2);
    });
  },
  degauss() { // CRT ligando
    if (!ctx) return;
    tone(80, 0.25, { vol: 0.5, slide: 30, r: 0.2 });
    const t = ctx.currentTime;
    const s = osc('sawtooth', 60); const lp = filt('lowpass', 400); const g = gain(0, sfx);
    s.connect(lp); lp.connect(g);
    env(g, t, 0.01, 0.1, 1.3, 0.12);
    s.start(t); s.stop(t + 1.6);
    for (let i = 0; i < 6; i++) burst(0.01, { f: 5000, type: 'highpass', vol: 0.08, at: Math.random() * 0.6 });
  },
  crtOff() {
    if (!ctx) return;
    burst(0.02, { f: 3000, type: 'highpass', vol: 0.15 });
    tone(1400, 0.12, { vol: 0.05, slide: 80 });
    for (let i = 0; i < 5; i++) burst(0.008, { f: 6000, type: 'highpass', vol: 0.05, at: 0.05 + Math.random() * 0.5 });
  },
  hdd(sec = 2) { /* ativado via G.flags.hdd */ },
  cdTray() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = osc('sawtooth', 120); const bp = filt('bandpass', 500, 2); const g = gain(0, sfx);
    s.connect(bp); bp.connect(g); env(g, t, 0.05, 0.6, 0.1, 0.07);
    s.frequency.linearRampToValueAtTime(160, t + 0.7);
    s.start(t); s.stop(t + 0.9);
    burst(0.01, { f: 2000, vol: 0.2, at: 0.75 });
    // disco girando
    const o = osc('sine', 120); const go = gain(0, sfx); o.connect(go);
    env(go, t + 1.0, 0.8, 1.5, 0.8, 0.04); o.frequency.setValueAtTime(120, t + 1); o.frequency.exponentialRampToValueAtTime(820, t + 2.5);
    o.start(t + 1); o.stop(t + 4);
    burst(2.5, { f: 1200, q: 0.5, vol: 0.02, at: 1, a: 0.5, r: 0.6 });
  },
  modem(weird = 0) {
    if (!ctx) return 1;
    const t0 = ctx.currentTime + 0.05;
    let t = t0;
    const out = gain(0.3, sfx);
    const hp = filt('highpass', 280), lp = filt('lowpass', 3500);
    hp.connect(lp); lp.connect(out);
    const at = (fn) => fn;
    const T = (f, start, dur, vol) => {
      const s = osc('sine', f); const g = gain(0, hp); s.connect(g);
      env(g, start, 0.005, dur, 0.01, vol); s.start(start); s.stop(start + dur + 0.05);
    };
    // tom de discagem (Brasil: 425 Hz contínuo)
    T(425, t, 1.1, 0.25); t += 1.3;
    const DT = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] };
    for (const d of '30710000') { T(DT[d][0], t, 0.08, 0.16); T(DT[d][1], t, 0.08, 0.16); t += 0.15; }
    t += 0.5;
    T(425, t, 1.0, 0.1); t += 1.9;                  // chamando
    // tom de resposta 2100 Hz com inversões de fase
    { const s = osc('sine', 2100); const g = gain(0, hp); s.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 5; k++) { const a = t + k * 0.45; g.gain.linearRampToValueAtTime(0.14, a + 0.01); g.gain.setValueAtTime(0.14, a + 0.43); g.gain.linearRampToValueAtTime(0.02, a + 0.45); }
      g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
      s.start(t); s.stop(t + 2.4); }
    t += 2.4;
    // V.21 "bing-bong": FSK aleatório
    { const s = osc('sine', 1180); const g = gain(0, hp); s.connect(g);
      env(g, t, 0.01, 0.5, 0.02, 0.13);
      for (let k = 0; k < 150; k++) s.frequency.setValueAtTime(Math.random() < 0.5 ? 980 : 1180, t + k / 300);
      s.start(t); s.stop(t + 0.6); }
    t += 0.65;
    T(1200, t, 0.35, 0.13); T(2400, t, 0.35, 0.06); t += 0.4;
    T(1650, t, 0.25, 0.1); t += 0.3;
    // treinamento: chiados com tons
    const chunks = [0.6, 0.4, 0.8, 0.5, 0.9, 1.3];
    for (const c of chunks) {
      const s = noise(); const bp = filt('bandpass', 1200 + Math.random() * 1400, 0.9); const g = gain(0, hp);
      s.connect(bp); bp.connect(g); env(g, t, 0.01, c, 0.02, 0.35);
      s.start(t, Math.random()); s.stop(t + c + 0.1);
      T(1800 + Math.random() * 300, t, c * 0.6, 0.04);
      t += c + 0.04;
    }
    // camada estranha: algo parecido com uma voz grave por baixo do chiado
    if (weird > 0) {
      const st = t0 + 6.5, len = t - st;
      const s = osc('sawtooth', 92); const f1 = filt('bandpass', 650, 6); const f2 = filt('bandpass', 1100, 7); const g = gain(0, out);
      s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g);
      const vib = osc('sine', 5.5); const vg = gain(4); vib.connect(vg); vg.connect(s.frequency); vib.start(st);
      s.frequency.setValueAtTime(96, st); s.frequency.linearRampToValueAtTime(58, st + len);
      f1.frequency.setValueAtTime(700, st); f1.frequency.linearRampToValueAtTime(400, st + len * 0.5); f1.frequency.linearRampToValueAtTime(750, st + len);
      env(g, st, len * 0.4, len * 0.4, len * 0.2, 0.5 * weird);
      s.start(st); s.stop(t + 0.5); vib.stop(t + 0.5);
    }
    burst(0.02, { f: 2000, vol: 0.12, at: t - t0 });
    return t - t0;
  },
  disconnectClick() { if (!ctx) return; burst(0.015, { f: 1500, vol: 0.25 }); tone(425, 0.4, { vol: 0.03, at: 0.1 }); },
  ringStart() {
    if (!ctx || ringTimer) return;
    const ring = () => {
      const t = ctx.currentTime;
      const m = gain(0, sfx);
      env(m, t, 0.01, 1.0, 0.15, 0.13);
      const am = osc('square', 22); const amg = gain(0.5); am.connect(amg);
      const v = gain(0.5); amg.connect(v.gain); v.connect(m);
      [1180, 1610, 2400].forEach((f, i) => { const s = osc('sine', f); const g = gain([1, 0.6, 0.2][i]); s.connect(g); g.connect(v); s.start(t); s.stop(t + 1.3); });
      am.start(t); am.stop(t + 1.3);
    };
    ring();
    ringTimer = setInterval(ring, 3200);
  },
  ringStop() { clearInterval(ringTimer); ringTimer = null; },
  heartbeat() {
    if (!ctx) return;
    tone(58, 0.09, { vol: 0.45, slide: 38, r: 0.12 });
    tone(52, 0.08, { vol: 0.3, slide: 36, r: 0.12, at: 0.26 });
  },
  breath(vol = 0.08) {
    if (!ctx) return;
    burst(1.4, { f: 600, q: 0.8, vol, a: 1.1, r: 0.3, type: 'bandpass' });
    burst(1.9, { f: 450, q: 0.8, vol: vol * 0.8, a: 0.2, r: 1.4, at: 1.6, type: 'bandpass' });
  },
  whisper(vol = 0.12) {
    if (!ctx) return;
    let at = 0;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const d = 0.12 + Math.random() * 0.25;
      burst(d, { f: 1400 + Math.random() * 1600, q: 3, vol, a: d * 0.4, r: 0.08, at, sweep: 700 + Math.random() * 2000 });
      at += d + 0.05 + Math.random() * 0.15;
    }
  },
  stinger(v = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    [98, 103.8, 196, 207.7, 415.3, 466.2].forEach((f) => {
      const s = osc('sawtooth', f * (1 + (Math.random() - 0.5) * 0.01)); const lp = filt('lowpass', 300, 1); const g = gain(0, sfx);
      s.connect(lp); lp.connect(g);
      lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3500, t + 0.15); lp.frequency.exponentialRampToValueAtTime(400, t + 3);
      env(g, t, 0.02, 0.3, 2.8, 0.06 * v);
      s.start(t); s.stop(t + 3.5);
    });
    burst(2.5, { f: 3000, type: 'highpass', vol: 0.08 * v, a: 0.01, r: 2 });
    tone(2600, 0.6, { vol: 0.03 * v, slide: 1200, r: 1.5 });
  },
  hit(v = 1) {
    if (!ctx) return;
    tone(70, 0.2, { vol: 0.7 * v, slide: 28, r: 0.8 });
    burst(0.3, { f: 1800, q: 0.4, vol: 0.4 * v, r: 0.8 });
  },
  thunder(near = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (near > 0.6) burst(0.25, { f: 900, type: 'highpass', vol: 0.25 * near, r: 0.3 });
    const s = noise(true); const lp = filt('lowpass', 1200, 0.5); const g = gain(0, sfx);
    s.connect(lp); lp.connect(g);
    lp.frequency.setValueAtTime(900 * near + 200, t); lp.frequency.exponentialRampToValueAtTime(70, t + 5);
    env(g, t, 0.08, 0.4, 4.5, 0.9 * near);
    s.start(t, Math.random() * 2); s.stop(t + 6);
  },
  doorCreak() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = osc('sawtooth', 170); const bp = filt('bandpass', 900, 5); const g = gain(0, sfx);
    s.connect(bp); bp.connect(g);
    for (let k = 0; k < 24; k++) s.frequency.setValueAtTime(140 + Math.random() * 160 + k * 6, t + k * 0.07);
    bp.frequency.linearRampToValueAtTime(1500, t + 1.7);
    env(g, t, 0.15, 1.2, 0.4, 0.12);
    s.start(t); s.stop(t + 1.9);
  },
  doorShut() { if (!ctx) return; tone(60, 0.12, { vol: 0.6, slide: 35, r: 0.25 }); burst(0.12, { f: 500, type: 'lowpass', vol: 0.4, brown: true, r: 0.2 }); },
  bulbPop() { if (!ctx) return; burst(0.02, { f: 4000, type: 'highpass', vol: 0.4 }); burst(0.4, { f: 6000, type: 'highpass', vol: 0.04, r: 0.3 }); },
  powerOut() {
    if (!ctx) return;
    tone(90, 0.25, { vol: 0.5, slide: 25, r: 0.4 });
    this.amb('rede', 0, 0.3); this.amb('pc', 0, 1.5);
  },
  staticBurst(d = 0.4, v = 0.15) { if (!ctx) return; burst(d, { f: 2500, q: 0.3, vol: v, r: 0.05 }); },
  flatline(on) {
    if (!ctx) return;
    if (on && !flat) { flat = osc('sine', 1000); const g = gain(0.06, sfx); flat.connect(g); flat.start(); flat._g = g; }
    if (!on && flat) { flat.stop(); flat = null; }
  },
  monitorBeep() { if (!ctx) return; tone(1000, 0.12, { vol: 0.07 }); },
  flashCam() { if (!ctx) return; tone(3000, 0.3, { vol: 0.02, slide: 6000 }); burst(0.03, { f: 3000, vol: 0.2, at: 0.35 }); },
  silenceAll(time = 0.2) { for (const k in A) this.amb(k, 0, time); this.heartBpm = 0; this.ringStop(); this.flatline(false); this.birds = false; this.dogs = false; },
  masterVolume(v, time = 0.5) {
    if (!ctx) return;
    const g = master.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + time);
  },
};
