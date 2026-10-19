// Camada de interface em HTML: legendas, objetivo, prompt de interação, cartões de texto e fades.
import { G, wait, waitFor } from './state.js';

const $ = (id) => document.getElementById(id);
let sayId = 0;

export const ui = {
  init() {
    this.el = {
      legenda: $('legenda'), objetivo: $('objetivo'), prompt: $('prompt'), cartao: $('cartao'),
      fade: $('fade'), aviso: $('aviso'),
    };
    this.fadeV = 0; this.fadeTarget = 0; this.fadeSpeed = 1;
  },

  update(dt) {
    if (this.fadeV !== this.fadeTarget) {
      const s = Math.sign(this.fadeTarget - this.fadeV);
      this.fadeV += s * dt * this.fadeSpeed;
      if ((s > 0 && this.fadeV > this.fadeTarget) || (s < 0 && this.fadeV < this.fadeTarget)) this.fadeV = this.fadeTarget;
      this.el.fade.style.opacity = this.fadeV;
    }
  },

  // fala/pensamento na legenda. who: 'Caio' | 'Mãe' | 'voz' | 'telefone' | null
  async say(text, who = 'Caio', dur) {
    const id = ++sayId;
    const L = this.el.legenda;
    const cls = { Caio: 'caio', 'Mãe': 'mae', voz: 'voz', telefone: 'voz' }[who] || 'caio';
    L.className = 'show ' + cls;
    L.innerHTML = (who && who !== 'Caio' && who !== 'Léo' && who !== 'voz' ? `<b>${who}:</b> ` : '') + text;
    const d = dur ?? 1.6 + text.length * 0.05;
    await wait(d);
    if (id === sayId) L.className = '';
  },
  clearSay() { sayId++; this.el.legenda.className = ''; },
  async lines(arr, who = 'Caio') { for (const t of arr) await this.say(t, who); },

  objective(text) {
    const o = this.el.objetivo;
    if (!text) { o.className = ''; return; }
    o.innerHTML = '<span>OBJETIVO</span>' + text;
    o.className = 'show flash';
    setTimeout(() => { if (o.className.includes('flash')) o.className = 'show'; }, 1200);
  },
  prompt(text) {
    const p = this.el.prompt;
    if (!text) { p.className = ''; return; }
    if (p.dataset.t !== text) { p.dataset.t = text; p.innerHTML = '<kbd>E</kbd> ' + text; }
    p.className = 'show';
  },
  aviso(text, dur = 3) {
    const a = this.el.aviso; a.innerHTML = text; a.className = 'show';
    clearTimeout(this._avisoT); this._avisoT = setTimeout(() => { a.className = ''; }, dur * 1000);
  },

  fade(to, secs = 1) {
    this.fadeTarget = to; this.fadeSpeed = 1 / Math.max(0.01, secs);
    return waitFor(() => this.fadeV === this.fadeTarget);
  },
  setFade(v) { this.fadeV = this.fadeTarget = v; this.el.fade.style.opacity = v; },

  // abre o painel de leitura (folha, foto, caderno). Ignora teclas por um instante para que
  // um E apertado logo antes (para "passar" a fala) não feche o que acabou de abrir.
  openPanel(html, res = null) {
    const el = document.getElementById('folha');
    el.innerHTML = html;
    el.className = 'show';
    this.paperOpen = true;
    this.paperT0 = performance.now();
    this._paperRes = res;
    return el;
  },
  // folha do caderno do Léo (fecha com E / Espaço / Enter / Esc / clique)
  paper(n, text) {
    return new Promise((res) => {
      const el = this.openPanel(`<div class="papel"><span class="num">folha ${n} de 5</span><p></p><small>E / clique para guardar</small></div>`, res);
      el.querySelector('p').textContent = text;
    });
  },
  // visor de câmera digital (foto com data laranja no canto)
  photoView(canvas, caption) {
    return new Promise((res) => {
      const el = this.openPanel('<div class="lcd"><div class="lcd-tela"></div><div class="leg"></div><small>E / clique para fechar</small></div>', res);
      const img = document.createElement('canvas'); img.width = canvas.width; img.height = canvas.height; img.getContext('2d').drawImage(canvas, 0, 0);
      el.querySelector('.lcd-tela').appendChild(img);
      el.querySelector('.leg').textContent = caption;
    });
  },
  closePaper() {
    if (!this.paperOpen) return;
    if (performance.now() - this.paperT0 < 900) return;   // tempo mínimo para ler (evita fechar sem querer)
    this.paperOpen = false;
    document.getElementById('folha').className = '';
    // se foi aberto pelo menu de pausa, volta para o menu
    if (G.paused) document.getElementById('pausa').classList.add('show');
    const r = this._paperRes; this._paperRes = null; r && r();
  },

  // cartão de texto em tela preta, linha a linha, efeito máquina de escrever
  async card(lines, { hold = 1.4, speed = 32, cls = '' } = {}) {
    const c = this.el.cartao;
    c.className = 'show ' + cls; c.innerHTML = '';
    this.skipCard = false;
    for (const line of lines) {
      const p = document.createElement('p');
      if (line.startsWith('#')) { p.className = 'grande'; }
      const txt = line.replace(/^#/, '');
      c.appendChild(p);
      for (let i = 1; i <= txt.length; i++) {
        p.textContent = txt.slice(0, i);
        if (!this.skipCard) await wait(1 / speed);
      }
      this.skipCard = false;
      await Promise.race([wait(hold * (txt.length ? 1 : 0.3)), waitFor(() => this.skipCard)]);
      this.skipCard = false;
    }
    await wait(0.6);
    c.className = ''; c.innerHTML = '';
    await wait(0.4);
  },
};
