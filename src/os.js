// Sistema operacional falso, desenhado num canvas 512x384 e exibido na tela do CRT.
// Interface "modo imediato": tudo é redesenhado a cada quadro e as áreas clicáveis são registradas no desenho.
import * as THREE from 'three';
import { G, wait, waitFor, clockStr } from './state.js';
import { audio } from './audio.js';

export const OS_W = 512, OS_H = 384;
const FONT = '11px Tahoma, Verdana, "MS Sans Serif", Arial, sans-serif';
const FONTB = 'bold 11px Tahoma, Verdana, "MS Sans Serif", Arial, sans-serif';
const MONO = '12px "Lucida Console", "Courier New", monospace';
const TASK_H = 26;

const CRT_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRT_FRAG = `
uniform sampler2D map;
uniform float time, power, collapse, noiseAmt;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 uv = (vUv - 0.5) / 0.93;
  uv *= 1.0 + 0.07 * dot(uv, uv);
  vec2 tuv = uv + 0.5;
  vec3 glass = vec3(0.028, 0.034, 0.031) + 0.018 * (1.0 - vUv.y);
  glass += 0.03 * smoothstep(0.25, 0.0, abs(vUv.x * 0.8 - vUv.y + 0.35));
  vec3 col = vec3(0.0);
  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
    float cy = (tuv.y - 0.5) / max(collapse, 0.004) + 0.5;
    if (cy > 0.0 && cy < 1.0) {
      vec2 s = vec2(tuv.x, cy);
      s.x += (hash(vec2(floor(s.y * 384.0), floor(time * 60.0))) - 0.5) * 0.0012 * (1.0 + noiseAmt * 20.0);
      col = texture2D(map, s).rgb;
      float n = hash(s * vec2(512.0, 384.0) + fract(time) * 91.0);
      col = mix(col, vec3(n), noiseAmt);
      col *= 0.84 + 0.16 * sin(s.y * 384.0 * 3.14159);
      col = col * 0.98 + 0.02;
      vec2 v = tuv - 0.5; col *= 1.0 - dot(v, v) * 1.1;
      col *= 0.97 + 0.03 * sin(time * 377.0);
      col += (1.0 - collapse) * 1.5;
    }
  }
  gl_FragColor = vec4(glass + col * power, 1.0);
}`;

function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(' ')) {
      const test = cur ? cur + ' ' + word : word;
      if (g.measureText(test).width > maxW && cur) { out.push(cur); cur = word; } else cur = test;
    }
    out.push(cur);
  }
  return out;
}

export class OS {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = OS_W; this.canvas.height = OS_H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, time: { value: 0 }, power: { value: 0 }, collapse: { value: 1 }, noiseAmt: { value: 0 } },
      vertexShader: CRT_VERT, fragmentShader: CRT_FRAG,
    });
    this.avg = document.createElement('canvas'); this.avg.width = 4; this.avg.height = 3;
    this.light = new THREE.Color(0, 0, 0);
    this.frame = 0;
    this.on = {};
    this.images = {};
    this.reset('caio');
  }

  reset(mode = 'caio') {
    this.mode = mode;
    this.state = 'off'; this.stateT = 0;
    this.power = 0; this.powerTarget = 0; this.collapse = 1; this.noise = 0;
    this.windows = []; this.toasts = []; this.menu = false; this.selIcon = null;
    this.connected = false; this.connecting = false;
    this.cursor = { x: 330, y: 230 }; this.down = false;
    this.hits = []; this.hoverId = null;
    this.chats = {}; this.typing = {}; this.inputText = {}; this.pending = null; this.typeOut = null;
    this.msnLogged = false; this.msnLoginT = 0;
    this.extraIcons = new Set();
    this.cdInserted = false;
    this.webcamCanvas = null;
    this.customDraw = null;
    this.contacts = [
      { id: 'bia', nick: 'Bia ~ ♪ só o amor constrói ♪', online: false },
      { id: 'rafa', nick: 'Rafa [CS 1.6 hj 22h??]', online: false },
      { id: 'tuta', nick: 'DJ Tuta ~ sábado no Ponto X', online: false },
      { id: 'pri', nick: 'Pri ✿ saudades de tudo', online: false },
      { id: 'leo', nick: 'Léo - volto já', online: false },
      { id: 'tia', nick: 'Tia Neusa', online: false },
    ];
    this.me = { nick: 'Caio ~ sobrevivendo ao cursinho', short: 'Caio', status: 'Online' };
    this.chats.leo = [
      { from: 'sys', text: '— Histórico de 13/12/2003 —' },
      { from: 'leo', text: 'caio' },
      { from: 'leo', text: 'amanha te mostro uma coisa q eu achei. eh bizarro' },
      { from: 'me', text: 'oq?' },
      { from: 'leo', text: 'amanha. agora vo ficar conectado mais um pouco' },
      { from: 'leo', text: 'volto ja' },
    ];
    if (mode === 'prologo') {
      // dezembro de 2003: o PC é do Léo, logado na conta dele
      this.me = { nick: 'Léo :: conectado', short: 'Léo', status: 'Online' };
      this.contacts = [
        { id: 'caio', nick: 'Caio ~ férias!!! \\o/', online: false },
        { id: 'gordo', nick: 'Gordo [CS 1.5 de madruga]', online: false },
        { id: 'fer', nick: 'Fer ♥ formatura dia 20!!', online: false },
        { id: 'vina', nick: 'Vina - vendo cd gravado R$5', online: false },
      ];
      this.chats = { caio: [
        { from: 'sys', text: '— Histórico de 13/12/2003 —' },
        { from: 'me', text: 'caio' },
        { from: 'me', text: 'amanha te mostro uma coisa q eu achei. eh bizarro' },
        { from: 'caio', text: 'oq?' },
        { from: 'me', text: 'amanha. agora vo ficar conectado mais um pouco' },
        { from: 'me', text: 'volto ja' },
      ] };
      this.burned = false;
    }
    this.files = {
      docs: {
        title: 'Meus documentos', items: [
          { name: 'trabalho_quimica.doc', type: 'doc', text: 'TRABALHO DE QUÍMICA — ESTEQUIOMETRIA\nProf. Valdir — Extensivo B\n\n\n\n(não comecei)' },
          { name: 'letra_musica.txt', type: 'txt', text: 'conexão perdida (rascunho)\n\nnão sei mais onde você tá\nmeu pc ainda chama seu nome\no modem grita de madrugada\ne ninguém atende o telefone\n\n(terminar depois. o léo ia saber o resto)' },
          { name: 'FW FW FW leia ate o fim!!!.txt', type: 'txt', text: '-----Mensagem encaminhada-----\nAssunto: FW: FW: FW: FW: NÃO É BRINCADEIRA LEIA ATÉ O FIM!!!\n\nISSO ACONTECEU DE VERDADE COM UM AMIGO DO MEU PRIMO\n\nexiste um numero de telefone que atende sozinho depois da meia noite.\nnao é provedor. nao pede senha. o modem conecta e fica conectado.\na conta vem só UM PULSO, nao importa quanto tempo voce fique.\n\nquem conecta sente que tem alguem olhando.\nquem fica conectado tempo demais nao acorda mais.\n\nSE VOCE NAO REPASSAR ESSE EMAIL PARA 10 PESSOAS EM 1 HORA O NUMERO VAI LIGAR PRA VOCE.\n\no numero começa com 3071.' },
        ],
      },
      cd: {
        title: 'LEO_NAO_MEXER (D:)', items: [
          { name: 'notas.txt', type: 'txt', text: NOTAS },
          { name: 'conta_telefone_dez2003.txt', type: 'txt', text: CONTA },
          { name: 'fotos', type: 'folder', folder: 'fotos' },
        ],
      },
      fotos: { title: 'D:\\fotos', items: [] },
      bin: { title: 'Lixeira', items: [] },
      pc: {
        title: 'Meu computador', items: [
          { name: 'Disquete de 3½ (A:)', type: 'floppy', action: () => this.msg('A:\\', 'A:\\ não está acessível.\n\nO dispositivo não está pronto.', ['Repetir', 'Cancelar'], 'warn') },
          { name: 'Disco local (C:)', type: 'drive', action: () => this.openFolder('docs') },
          { name: 'Unidade de CD (D:)', type: 'cd', action: () => this.openCD() },
        ],
      },
    };
  }

  // ------------------------------------------------------------- energia
  turnOn() {
    if (this.state !== 'off') return;
    this.state = 'boot'; this.stateT = 0; this.powerTarget = 1; this.collapse = 1;
    audio.degauss(); G.flags.hdd = 6;
  }
  wakeDesktop() { // liga direto na área de trabalho
    this.state = 'desk'; this.stateT = 10; this.powerTarget = 1; this.power = Math.max(this.power, 0.01); this.collapse = 1;
    audio.degauss();
  }
  async turnOff() {
    if (this.state === 'off') return;
    audio.crtOff();
    const t0 = G.t;
    await waitFor(() => { this.collapse = Math.max(0, 1 - (G.t - t0) / 0.16); return this.collapse <= 0; });
    this.state = 'off'; this.power = 0; this.powerTarget = 0; this.collapse = 1;
    this.windows = []; this.menu = false; this.toasts = [];
  }
  async shutdown() {
    this.state = 'shutdown'; this.stateT = 0; this.windows = []; this.menu = false;
    G.flags.hdd = 1.5;
    await wait(1.8);
    if (this.connected) this.disconnect(true);
    await this.turnOff();
  }

  // ------------------------------------------------------------- entrada
  move(x, y) { this.cursor.x = Math.max(0, Math.min(OS_W - 1, x)); this.cursor.y = Math.max(0, Math.min(OS_H - 1, y)); }
  click() {
    if (this.state !== 'desk') return;
    audio.click();
    const { x, y } = this.cursor;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) { h.fn && h.fn(); return; }
    }
    this.menu = false; this.selIcon = null;
  }
  wheel(dy) {
    const w = this.windows[this.windows.length - 1];
    if (w && w.scrollable) w.scroll = Math.max(0, Math.min(w.maxScroll || 0, (w.scroll || 0) + Math.sign(dy) * 3));
  }
  hit(x, y, w, h, fn, id) { this.hits.push({ x, y, w, h, fn, id: id || (x + ',' + y) }); }
  isHover(id) { return this.hoverId === id; }

  // ------------------------------------------------------------- janelas
  openWin(def) {
    let w = this.windows.find((o) => o.id === def.id);
    if (w) { this.front(w); return w; }
    w = Object.assign({ closable: true, scroll: 0 }, def);
    this.windows.push(w);
    return w;
  }
  front(w) { const i = this.windows.indexOf(w); if (i >= 0) { this.windows.splice(i, 1); this.windows.push(w); } }
  closeWin(id) {
    const i = this.windows.findIndex((o) => o.id === id);
    if (i >= 0) { const [w] = this.windows.splice(i, 1); w.onClose && w.onClose(); }
  }
  getWin(id) { return this.windows.find((o) => o.id === id); }

  msg(title, text, buttons = ['OK'], icon = 'info') {
    return new Promise((res) => {
      const id = 'msg' + Math.random();
      const g = this.g; g.font = FONT;
      const lines = wrapText(g, text, 250);
      const bw = Math.max(...buttons.map((b) => g.measureText(b).width + 24), 70);
      const w = Math.max(300, buttons.length * (bw + 8) + 30), h = 74 + lines.length * 14;
      this.openWin({
        id, title, modal: true, closable: false, x: (OS_W - w) / 2, y: (OS_H - TASK_H - h) / 2 - 10, w, h,
        draw: (x, y, ww, hh) => {
          this.drawIcon(icon, x + 10, y + 8);
          g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'top';
          lines.forEach((l, i) => g.fillText(l, x + 52, y + 12 + i * 14));
          const total = buttons.length * (bw + 8) - 8;
          buttons.forEach((b, i) => this.button(x + (ww - total) / 2 + i * (bw + 8), y + hh - 30, bw, 22, b, () => { this.closeWin(id); res(i); }, i === 0));
        },
      });
      if (icon === 'warn' || icon === 'error') audio.errorSound();
    });
  }

  // ------------------------------------------------------------- ícones e programas
  iconList() {
    if (this.mode === 'leo') return [['msn', 'Mensageiro'], ['bin', 'Lixeira']];
    if (this.mode === 'prologo') return [['msn', 'Mensageiro'], ['burn', 'Gravador de CD'], ['txt', 'notas.txt'], ['bin', 'Lixeira']];
    const l = [['pc', 'Meu computador'], ['docs', 'Meus documentos'], ['net', 'Conectar à Internet'], ['msn', 'Mensageiro'], ['cd', 'Unidade de CD (D:)'], ['bin', 'Lixeira']];
    if (this.extraIcons.has('webcam')) l.push(['cam', 'WebCam']);
    return l;
  }
  openIcon(id) {
    if (this.on.icon && this.on.icon(id) === false) return;
    if (id === 'pc') this.openFolder('pc');
    else if (id === 'docs') this.openFolder('docs');
    else if (id === 'net') this.openDialer();
    else if (id === 'msn') this.openMessenger();
    else if (id === 'cd') this.openCD();
    else if (id === 'bin') this.openFolder('bin');
    else if (id === 'cam') this.openWebcam();
    else if (id === 'burn') this.openBurner();
    else if (id === 'txt') { const w = this.openNotepad('notas.txt', this.notesText || NOTAS_ANTES, { id: 'notas' }); w.follow = true; }
  }

  openFolder(key) {
    const f = this.files[key];
    this.openWin({
      id: 'folder_' + key, title: f.title, icon: key === 'bin' ? 'bin' : key === 'cd' ? 'cd' : 'folder', x: 60 + Math.random() * 30, y: 40 + Math.random() * 20, w: 300, h: 210, scrollable: true,
      draw: (x, y, w, h, win) => {
        const g = this.g;
        this.sunken(x, y, w, h, '#fff');
        if (!f.items.length) { g.font = FONT; g.fillStyle = '#666'; g.textAlign = 'center'; g.fillText(key === 'bin' ? 'A Lixeira está vazia.' : 'Esta pasta está vazia.', x + w / 2, y + 30); return; }
        f.items.forEach((it, i) => {
          const iy = y + 6 + i * 22;
          const hid = win.id + it.name;
          if (this.isHover(hid)) { g.fillStyle = '#000080'; g.fillRect(x + 4, iy - 2, w - 8, 20); }
          this.drawIcon(it.type === 'folder' ? 'folder' : it.type, x + 8, iy - 1, 0.5);
          g.font = FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillStyle = this.isHover(hid) ? '#fff' : '#000';
          g.fillText(it.name, x + 30, iy + 8);
          if (it.date) { g.fillStyle = this.isHover(hid) ? '#ccd' : '#666'; g.textAlign = 'right'; g.fillText(it.date, x + w - 10, iy + 8); }
          this.hit(x + 4, iy - 2, w - 8, 20, () => this.openFile(it), hid);
        });
      },
    });
  }
  openFile(it) {
    if (this.on.file && this.on.file(it) === false) return;
    if (it.action) return it.action();
    if (it.type === 'folder') return this.openFolder(it.folder);
    if (it.type === 'txt' || it.type === 'doc') return this.openNotepad(it.name, it.text);
    if (it.type === 'img') return this.openImage(it.name);
  }
  openCD() {
    if (this.on.cd && this.on.cd() === false) return;
    if (!this.cdInserted) { this.msg('D:\\', 'D:\\ não está acessível.\n\nO dispositivo não está pronto.\nInsira um disco na unidade D:.', ['Repetir', 'Cancelar'], 'warn'); return; }
    this.openFolder('cd');
  }
  openNotepad(name, text, opts = {}) {
    const w = this.openWin({
      id: opts.id || 'note_' + name, title: name + ' - Bloco de notas', icon: 'txt', x: opts.x ?? 34, y: opts.y ?? 16, w: opts.w || 360, h: opts.h || 300, scrollable: true, text,
      draw: (x, y, ww, hh, win) => {
        const g = this.g;
        g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'top';
        ['Arquivo', 'Editar', 'Pesquisar', 'Ajuda'].forEach((m, i) => g.fillText(m, x + 4 + i * 54, y + 1));
        this.sunken(x, y + 16, ww - 16, hh - 16, '#fff');
        g.save(); g.beginPath(); g.rect(x + 2, y + 18, ww - 20, hh - 20); g.clip();
        g.font = MONO; g.fillStyle = '#000';
        const lines = wrapText(g, win.text, ww - 30);
        const vis = Math.floor((hh - 24) / 14);
        win.maxScroll = Math.max(0, lines.length - vis);
        if (win.follow) win.scroll = win.maxScroll;
        lines.slice(win.scroll, win.scroll + vis + 1).forEach((l, i) => g.fillText(l, x + 6, y + 21 + i * 14));
        g.restore();
        this.scrollbar(x + ww - 16, y + 16, hh - 16, win, lines.length, vis);
      },
    });
    return w;
  }
  openImage(name) {
    const im = this.images[name];
    this.openWin({
      id: 'img_' + name, title: name + ' - Visualizador de imagens', icon: 'img', x: 90, y: 20, w: 300, h: 278,
      draw: (x, y, w, h) => {
        const g = this.g;
        this.sunken(x, y, w, h - 22, '#000');
        if (im) { g.imageSmoothingEnabled = true; g.drawImage(im.canvas, x + 4, y + 4, w - 8, h - 30); }
        g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(name + (im ? '   —   ' + im.date : ''), x + 4, y + h - 10);
      },
    });
  }
  openWebcam() {
    if (this.on.webcam && this.on.webcam() === false) return;
    this.openWin({
      id: 'webcam', title: 'WebCam - Visualizador (ao vivo)', icon: 'cam', x: 150, y: 14, w: 336, h: 290,
      draw: (x, y, w, h) => {
        const g = this.g;
        this.sunken(x, y, w, h - 20, '#000');
        if (this.webcamCanvas) { g.imageSmoothingEnabled = false; g.drawImage(this.webcamCanvas, x + 4, y + 4, w - 8, h - 28); g.imageSmoothingEnabled = true; }
        if (Math.floor(G.t * 2) % 2) { g.fillStyle = '#e00'; g.beginPath(); g.arc(x + 14, y + 14, 4, 0, 7); g.fill(); }
        g.font = FONTB; g.fillStyle = '#e00'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('AO VIVO', x + 22, y + 14);
        g.font = MONO; g.fillStyle = '#ff9a1a'; g.textAlign = 'right'; g.fillText(clockStr() + ':' + String(Math.floor(G.clock.s)).padStart(2, '0'), x + w - 8, y + h - 32);
        g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.fillText('Fonte: Câmera USB (canto)   320x240   15 qps', x + 4, y + h - 9);
      },
    });
  }

  // ------------------------------------------------------------- gravador de CD (prólogo)
  openBurner() {
    const st = this.burn || (this.burn = { p: 0, running: false, done: this.burned });
    this.openWin({
      id: 'burner', title: 'Gravador de CD - Projeto de dados', icon: 'burn', x: 70, y: 40, w: 330, h: 236,
      draw: (x, y, w, h) => {
        const g = this.g;
        g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText('Nome do disco:', x + 6, y + 12); this.sunken(x + 92, y + 3, w - 100, 18, '#fff'); g.fillStyle = '#000'; g.fillText('LEO_NAO_MEXER', x + 96, y + 12);
        this.sunken(x + 4, y + 28, w - 8, 92, '#fff');
        ['notas.txt', 'conta_telefone_dez2003.txt', 'fotos\\DSC00001.JPG'].forEach((n, i) => { this.drawIcon(i < 2 ? 'txt' : 'img', x + 10, y + 34 + i * 26, 0.5); g.fillStyle = '#000'; g.fillText(n, x + 32, y + 42 + i * 26); });
        g.fillText(st.done ? 'Gravação concluída. O CD-R foi ejetado.' : st.running ? 'Gravando faixa 1... (velocidade 8x)' : 'Pronto para gravar. CD-R 700MB na unidade D:', x + 6, y + 134);
        this.sunken(x + 4, y + 146, w - 8, 18, '#fff');
        g.fillStyle = '#000080'; g.fillRect(x + 6, y + 148, (w - 12) * st.p, 14);
        if (!st.done) this.button(x + w - 92, y + h - 34, 84, 24, 'Gravar', () => this.startBurn(), true, st.running);
        else this.button(x + w - 92, y + h - 34, 84, 24, 'OK', () => this.closeWin('burner'), true);
      },
    });
  }
  async startBurn() {
    const st = this.burn; if (st.running || st.done) return;
    st.running = true; audio.cdTray(); G.flags.hdd = 9;
    const t0 = G.t;
    await waitFor(() => { st.p = Math.min(1, (G.t - t0) / 8); return st.p >= 1; });
    st.running = false; st.done = true; this.burned = true;
    audio.cdTray();
    this.on.burned && this.on.burned();
  }

  // ------------------------------------------------------------- discador
  openDialer() {
    if (this.connected) { this.msg('Conexão dial-up', 'Você já está conectado a LinhaLivre.'); return; }
    if (this.connecting) return;
    this.openWin({
      id: 'dialer', title: 'Conectar a', icon: 'net', x: 104, y: 70, w: 304, h: 214,
      draw: (x, y, w, h) => {
        const g = this.g;
        this.drawIcon('net', x + 8, y + 6);
        g.font = FONTB; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('LinhaLivre', x + 50, y + 22);
        const row = (label, val, yy) => { g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.fillText(label, x + 8, yy + 9); this.sunken(x + 118, yy, w - 128, 19, '#fff'); g.fillStyle = '#000'; g.fillText(val, x + 122, yy + 10); };
        row('Nome de usuário:', 'caio_m', y + 48);
        row('Senha:', '••••••••', y + 72);
        g.fillText('☑ Salvar senha', x + 118, y + 103);
        row('Número de telefone:', '3071-0000', y + 116);
        row('Discar de:', 'Nova localização', y + 140);
        this.button(x + 30, y + h - 30, 76, 22, 'Conectar', () => this.connect(), true);
        this.button(x + 112, y + h - 30, 86, 22, 'Propriedades', () => {}, false, true);
        this.button(x + 204, y + h - 30, 70, 22, 'Cancelar', () => this.closeWin('dialer'));
      },
    });
  }
  async connect() {
    if (this.on.connect) {
      const r = await this.on.connect();
      if (r === false) return;
    }
    this.closeWin('dialer');
    this.connecting = true;
    const st = { text: 'Discando...' };
    this.openWin({
      id: 'dialing', title: 'Conectando a LinhaLivre', icon: 'net', x: 120, y: 110, w: 270, h: 110, closable: false,
      draw: (x, y, w, h) => {
        const g = this.g;
        this.drawIcon('net', x + 10, y + 10);
        g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText('Status:  ' + st.text, x + 54, y + 26);
        this.button(x + w / 2 - 38, y + h - 30, 76, 22, 'Cancelar', () => {}, false, true);
      },
    });
    const dur = audio.modem(G.flags.modemWeird || 0);
    await wait(dur * 0.33); st.text = 'Verificando nome de usuário e senha...';
    await wait(dur * 0.37); st.text = 'Registrando o computador na rede...';
    G.flags.hdd = 2;
    await wait(dur * 0.30 + 0.3);
    this.closeWin('dialing');
    this.connecting = false; this.connected = true;
    this.toast('Conectado a LinhaLivre', 'a 44.000 bps', 'net', true);
    this.on.connected && this.on.connected();
  }
  async disconnect(silent = false) {
    if (!this.connected) return;
    if (!silent && this.on.disconnect && (await this.on.disconnect()) === false) return;
    this.connected = false; this.msnLogged = false;
    for (const c of this.contacts) c.online = false;
    this.windows = this.windows.filter((w) => !(w.id === 'msn' || w.id.startsWith('chat_')));
    audio.disconnectClick();
    this.on.disconnected && this.on.disconnected();
  }

  // ------------------------------------------------------------- mensageiro
  openMessenger() {
    if (!this.connected) { this.msg('Mensageiro', 'Não foi possível entrar no serviço.\n\nVerifique se você está conectado à Internet.', ['OK'], 'warn'); return; }
    if (!this.msnLogged && !this.msnLoginT) { this.msnLoginT = G.t; }
    this.openWin({
      id: 'msn', title: 'Mensageiro', icon: 'msn', x: 330, y: 8, w: 176, h: 336, scrollable: false,
      draw: (x, y, w, h) => this.drawMessenger(x, y, w, h),
    });
    if (this.on.messenger) this.on.messenger();
  }
  drawMessenger(x, y, w, h) {
    const g = this.g;
    g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
    if (!this.msnLogged) {
      if (G.t - this.msnLoginT > 1.8) { this.msnLogged = true; this.on.logged && this.on.logged(); }
      this.drawIcon('msn', x + w / 2 - 16, y + 80);
      g.font = FONT; g.fillStyle = '#334'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Entrando...', x + w / 2, y + 130);
      const p = ((G.t * 1.5) % 1) * (w - 40);
      g.fillStyle = '#9bd'; g.fillRect(x + 20, y + 150, w - 40, 6); g.fillStyle = '#25a'; g.fillRect(x + 20 + p * 0.8, y + 150, 24, 6);
      return;
    }
    // cabeçalho
    const grd = g.createLinearGradient(x, y, x, y + 46); grd.addColorStop(0, '#d8e6f8'); grd.addColorStop(1, '#fff');
    g.fillStyle = grd; g.fillRect(x, y, w, 46);
    this.drawIcon('msn', x + 4, y + 6);
    g.font = FONTB; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const nick = wrapText(g, this.me.nick, w - 44);
    nick.slice(0, 2).forEach((l, i) => g.fillText(l, x + 40, y + 14 + i * 12));
    g.font = FONT; g.fillStyle = '#286'; g.fillText('(' + this.me.status + ')', x + 40, y + 38);
    let yy = y + 56;
    const groups = [['Online', this.contacts.filter((c) => c.online)], ['Offline', this.contacts.filter((c) => !c.online)]];
    for (const [name, list] of groups) {
      g.font = FONTB; g.fillStyle = '#245'; g.fillText('▾ ' + name + ' (' + list.length + ')', x + 6, yy); yy += 16;
      for (const c of list) {
        const hid = 'ct_' + c.id;
        if (this.isHover(hid)) { g.fillStyle = '#dde8f8'; g.fillRect(x + 2, yy - 8, w - 4, 16); }
        this.person(x + 12, yy, c.online ? '#2bb24c' : '#c33');
        g.font = FONT; g.fillStyle = c.online ? '#000' : '#888';
        let n = c.nick; while (g.measureText(n).width > w - 34 && n.length > 3) n = n.slice(0, -2);
        if (n !== c.nick) n += '…';
        g.fillText(n, x + 24, yy);
        this.hit(x + 2, yy - 8, w - 4, 16, () => this.openChat(c.id), hid);
        yy += 17;
      }
      yy += 6;
    }
    g.font = FONT; g.fillStyle = '#25a'; g.fillText('＋ Adicionar um contato', x + 8, y + h - 12);
  }
  person(x, y, col) {
    const g = this.g;
    g.fillStyle = col; g.beginPath(); g.arc(x, y - 3, 3, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x, y + 4, 4.5, 3.5, 0, Math.PI, 0); g.fill();
  }
  contact(id) { return this.contacts.find((c) => c.id === id); }
  setOnline(id, on, toast = true) {
    const c = this.contact(id); if (!c || c.online === on) return;
    c.online = on;
    if (toast) this.toast(c.nick, on ? 'acabou de entrar.' : 'saiu.', 'msn', on);
  }
  openChat(id) {
    const c = this.contact(id);
    if (this.on.chat && this.on.chat(id) === false) return;
    if (!this.chats[id]) this.chats[id] = [];
    const w = this.openWin({
      id: 'chat_' + id, title: c.nick + ' - Conversa', icon: 'msn', x: 10, y: 20, w: 312, h: 300, scrollable: true,
      draw: (x, y, ww, hh, win) => this.drawChat(id, x, y, ww, hh, win),
    });
    return w;
  }
  drawChat(id, x, y, w, h, win) {
    const g = this.g, c = this.contact(id);
    g.fillStyle = '#eef3fb'; g.fillRect(x, y, w, h);
    g.font = FONT; g.fillStyle = '#333'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('Para: ' + c.nick, x + 4, y + 8);
    const logH = h - 112;
    this.sunken(x, y + 18, w, logH, '#fff');
    // linhas
    const lines = [];
    g.font = FONT;
    for (const m of this.chats[id] || []) {
      if (m.from === 'sys') { for (const l of wrapText(g, m.text, w - 24)) lines.push({ t: l, c: '#777', i: 4 }); continue; }
      const who = m.from === 'me' ? this.me.short : this.contact(m.from).nick;
      const head = (m.stamp ? '[' + m.stamp + '] ' : '') + who + ' diz:';
      for (const l of wrapText(g, head, w - 24)) lines.push({ t: l, c: '#777', i: 4 });
      for (const l of wrapText(g, m.text, w - 34)) lines.push({ t: l, c: m.from === 'me' ? '#123' : '#000', i: 14, b: true });
    }
    const vis = Math.floor((logH - 8) / 13);
    win.maxScroll = Math.max(0, lines.length - vis);
    if (win.lastLen !== lines.length) { win.scroll = win.maxScroll; win.lastLen = lines.length; }
    g.save(); g.beginPath(); g.rect(x + 2, y + 20, w - 18, logH - 4); g.clip();
    lines.slice(win.scroll, win.scroll + vis).forEach((l, i) => {
      g.font = l.b ? '12px Tahoma, Verdana, Arial' : FONT; g.fillStyle = l.c; g.fillText(l.t, x + l.i, y + 28 + i * 13);
    });
    g.restore();
    this.scrollbar(x + w - 16, y + 18, logH, win, lines.length, vis);
    // digitando
    const ty = y + 18 + logH + 9;
    const iy = y + h - 76;
    g.font = FONT; g.textAlign = 'left';
    if (this.typing[id]) { g.fillStyle = '#555'; g.fillText(c.nick.split(' ')[0] + ' está digitando uma mensagem...', x + 4, ty); }
    else if (this.pending && this.pending.id === id && !this.typeOut) { g.font = FONTB; g.fillStyle = '#245'; g.fillText('Escolha a resposta:', x + 4, ty); }
    this.sunken(x, iy + 8, w - 66, 66, '#fff');
    if (this.pending && this.pending.id === id && !this.typeOut) {
      this.pending.opts.forEach((o, i) => {
        const hid = 'opt_' + i, by = iy + 11 + i * 20;
        g.fillStyle = this.isHover(hid) ? '#b8d4f8' : '#dce9fb'; g.fillRect(x + 3, by, w - 72, 18); g.strokeStyle = '#6a8cc8'; g.lineWidth = 1; g.strokeRect(x + 3.5, by + 0.5, w - 73, 17);
        g.font = FONTB; g.fillStyle = '#123a8a'; g.textAlign = 'left';
        let t = '› ' + o; while (g.measureText(t).width > w - 80 && t.length > 4) t = t.slice(0, -2);
        g.fillText(t, x + 7, by + 10);
        this.hit(x + 3, by, w - 72, 19, () => this.pick(i), hid);
      });
    } else {
      g.font = '12px Tahoma, Verdana, Arial'; g.fillStyle = '#000'; g.textAlign = 'left';
      const txt = this.inputText[id] || '';
      const ls = wrapText(g, txt, w - 80);
      ls.slice(-4).forEach((l, i) => g.fillText(l, x + 6, iy + 20 + i * 14));
      if (this.typeOut && this.typeOut.id === id && Math.floor(G.t * 3) % 2) {
        const last = ls[ls.length - 1] || '';
        g.fillRect(x + 7 + g.measureText(last).width, iy + 13 + (Math.min(ls.length, 4) - 1) * 14, 1, 13);
      }
    }
    this.button(x + w - 62, iy + 8, 60, 66, 'Enviar', () => {}, false, !(this.typeOut && this.typeOut.id === id));
  }
  pick(i) {
    const p = this.pending; if (!p) return;
    this.typeOut = { id: p.id, text: p.opts[i], i: 0, acc: 0, idx: i };
    this.inputText[p.id] = '';
  }
  // contato envia mensagem (com "digitando...")
  async receive(id, text, typingTime = 1.2) {
    if (!this.getWin('chat_' + id)) this.openChat(id);
    this.typing[id] = true;
    await wait(typingTime);
    this.typing[id] = false;
    this.chats[id].push({ from: id, text });
    audio.chime();
    const w = this.getWin('chat_' + id); if (w) this.front(w);
  }
  say(id, text) { (this.chats[id] = this.chats[id] || []).push({ from: 'me', text }); }
  sys(id, text) { (this.chats[id] = this.chats[id] || []).push({ from: 'sys', text }); }
  offlineMsg(id, stamp, text) { (this.chats[id] = this.chats[id] || []).push({ from: id, text, stamp }); }
  choose(id, opts) {
    if (!this.getWin('chat_' + id)) this.openChat(id);
    const w = this.getWin('chat_' + id); this.front(w);
    return new Promise((res) => { this.pending = { id, opts, res }; });
  }

  toast(title, text, icon = 'msn', sound = true) {
    this.toasts.push({ title, text, icon, t: 0 });
    if (sound) audio.toastSound();
  }

  // ------------------------------------------------------------- atualização
  update(dt) {
    this.frame++;
    this.stateT += dt;
    // energia do tubo
    this.power += (this.powerTarget - this.power) * Math.min(1, dt * (this.powerTarget > this.power ? 1.6 : 8));
    if (this.state === 'boot' && this.stateT > 5.6) {
      this.state = 'desk'; this.stateT = 0; audio.startup();
      this.on.booted && this.on.booted();
    }
    // digitação automática da resposta
    const t = this.typeOut;
    if (t) {
      t.acc += dt * 24;
      while (t.acc >= 1 && t.i < t.text.length) { t.acc -= 1; t.i++; if (t.i % 2) audio.key(); }
      this.inputText[t.id] = t.text.slice(0, t.i);
      if (t.i >= t.text.length) {
        t.done = (t.done || 0) + dt;
        if (t.done > 0.4) {
          this.say(t.id, t.text); this.inputText[t.id] = ''; audio.click();
          const p = this.pending; this.pending = null; this.typeOut = null;
          p && p.res(t.idx);
        }
      }
    }
    for (const ts of this.toasts) ts.t += dt;
    this.toasts = this.toasts.filter((ts) => ts.t < 5);
    this.draw();
    const u = this.material.uniforms;
    u.time.value = G.t; u.power.value = this.power; u.collapse.value = this.collapse; u.noiseAmt.value = this.noise;
    // cor média da tela (para a luz que o monitor projeta no quarto)
    if (this.frame % 6 === 0) {
      const a = this.avg.getContext('2d', { willReadFrequently: true });
      a.drawImage(this.canvas, 0, 0, 4, 3);
      const d = a.getImageData(0, 0, 4, 3).data;
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4 * 255;
      this._avg = [r / n, gg / n, b / n];
    }
    const av = this._avg || [0, 0, 0];
    const p = this.state === 'off' ? 0 : this.power * this.collapse;
    this.light.setRGB((av[0] * 0.7 + 0.12) * p, (av[1] * 0.7 + 0.14) * p, (av[2] * 0.7 + 0.18) * p);
  }

  // ------------------------------------------------------------- desenho
  draw() {
    const g = this.g;
    this.hits = [];
    g.save();
    g.textBaseline = 'middle';
    if (this.customDraw) this.customDraw(g, this);
    else if (this.state === 'off') { g.fillStyle = '#000'; g.fillRect(0, 0, OS_W, OS_H); }
    else if (this.state === 'boot') this.drawBoot();
    else if (this.state === 'shutdown') this.drawShutdown();
    else {
      this.drawDesktop();
      const modal = this.windows.some((w) => w.modal);
      for (const w of this.windows) {
        if (w.modal) this.hit(0, 0, OS_W, OS_H, () => audio.errorSound(), 'modalblock');
        this.drawWin(w, w === this.windows[this.windows.length - 1]);
      }
      if (!modal) this.drawTaskbar(); else { const m = this.hits.length; this.drawTaskbar(); this.hits.length = m; }
      if (this.menu) this.drawMenu();
      this.drawToasts();
      if (G.mode === 'pc') this.drawCursor();
    }
    g.restore();
    this.hoverId = null;
    const { x, y } = this.cursor;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) { this.hoverId = h.id; break; }
    }
    this.tex.needsUpdate = true;
  }

  drawBoot() {
    const g = this.g, t = this.stateT;
    g.fillStyle = '#000'; g.fillRect(0, 0, OS_W, OS_H);
    if (t < 0.6) return;
    if (t < 3.0) {
      g.font = MONO; g.fillStyle = '#c8c8c8'; g.textAlign = 'left'; g.textBaseline = 'top';
      const mem = Math.min(131072, Math.floor((t - 0.9) * 120000));
      const L = [
        'BIOS v4.51PG, Copyright (C) 1984-98',
        '',
        'Processador : 400 MHz',
        'Teste de memória : ' + Math.max(0, mem) + 'K' + (mem >= 131072 ? ' OK' : ''),
        '',
        t > 1.9 ? 'Detectando IDE Mestre Primário ... HD 10.2GB' : '',
        t > 2.2 ? 'Detectando IDE Mestre Secundário ... CD-ROM 52X' : '',
        '',
        t > 2.5 ? 'Pressione DEL para entrar no SETUP' : '',
      ];
      L.forEach((l, i) => g.fillText(l, 12, 14 + i * 15));
      g.fillStyle = '#4af'; g.fillText('* ENERGY *', 400, 14);
      return;
    }
    if (t < 5.0) {
      const gr = g.createLinearGradient(0, 0, 0, OS_H); gr.addColorStop(0, '#0a2a6a'); gr.addColorStop(0.7, '#3a7ac8'); gr.addColorStop(1, '#88b8e8');
      g.fillStyle = gr; g.fillRect(0, 0, OS_W, OS_H);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(80 + i * 80, 260 + Math.sin(i) * 30, 70, 18, 0, 0, 7); g.fill(); }
      g.font = 'bold 30px Arial, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Sistema 98', OS_W / 2, 150);
      g.font = '13px Arial'; g.fillText('Iniciando...', OS_W / 2, 182);
      const p = ((t - 3) * 120) % (OS_W + 120) - 120;
      const bar = g.createLinearGradient(p, 0, p + 120, 0); bar.addColorStop(0, 'rgba(255,255,255,0)'); bar.addColorStop(0.5, '#ffffff'); bar.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = '#0a2a6a'; g.fillRect(0, OS_H - 10, OS_W, 10); g.fillStyle = bar; g.fillRect(p, OS_H - 10, 120, 10);
      return;
    }
  }
  drawShutdown() {
    const g = this.g;
    g.fillStyle = '#000'; g.fillRect(0, 0, OS_W, OS_H);
    g.font = 'bold 16px Arial'; g.fillStyle = '#e8a040'; g.textAlign = 'center';
    g.fillText('Aguarde enquanto o computador é desligado.', OS_W / 2, OS_H / 2);
  }
  drawDesktop() {
    const g = this.g;
    g.fillStyle = this.mode === 'leo' ? '#060908' : '#008080';
    g.fillRect(0, 0, OS_W, OS_H);
    if (this.mode === 'leo') {
      g.font = MONO; g.fillStyle = 'rgba(40,200,90,0.25)'; g.textAlign = 'center';
      g.fillText('conectado desde 14/12/2003 00:00', OS_W / 2, OS_H / 2 - 20);
    }
    const icons = this.iconList();
    const appear = this.state === 'desk' ? Math.min(icons.length, Math.floor(this.stateT * 8) + 1) : icons.length;
    icons.slice(0, appear).forEach(([id, label], i) => {
      const col = Math.floor(i / 5), row = i % 5;
      const x = 8 + col * 72, y = 8 + row * 62;
      const hid = 'ic_' + id;
      this.drawIcon(id, x + 20, y + 2);
      g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      const lines = wrapText(g, label, 66);
      lines.forEach((l, k) => {
        const tw = g.measureText(l).width;
        if (this.isHover(hid)) { g.fillStyle = '#000080'; g.fillRect(x + 36 - tw / 2 - 2, y + 38 + k * 12, tw + 4, 12); }
        g.fillStyle = '#fff'; g.fillText(l, x + 36, y + 44 + k * 12);
      });
      this.hit(x + 4, y, 64, 58, () => this.openIcon(id), hid);
    });
  }
  drawWin(w, active) {
    const g = this.g;
    const { x, y } = w; const ww = w.w, hh = w.h;
    this.hit(x, y, ww, hh, () => this.front(w), 'win_' + w.id);
    this.bevel(x, y, ww, hh);
    const tg = g.createLinearGradient(x, 0, x + ww, 0);
    if (active) { tg.addColorStop(0, '#000080'); tg.addColorStop(1, '#1084d0'); } else { tg.addColorStop(0, '#808080'); tg.addColorStop(1, '#b5b5b5'); }
    g.fillStyle = tg; g.fillRect(x + 3, y + 3, ww - 6, 18);
    if (w.icon) this.drawIcon(w.icon, x + 5, y + 4, 0.5);
    g.font = FONTB; g.fillStyle = active ? '#fff' : '#d8d8d8'; g.textAlign = 'left'; g.textBaseline = 'middle';
    let t = w.title; while (g.measureText(t).width > ww - 60 && t.length > 4) t = t.slice(0, -2);
    g.fillText(t !== w.title ? t + '…' : t, x + (w.icon ? 24 : 6), y + 12);
    if (w.closable) {
      const bx = x + ww - 21, by = y + 5;
      this.bevel(bx, by, 16, 14);
      g.fillStyle = '#000'; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.fillText('×', bx + 8, by + 7);
      this.hit(bx, by, 16, 14, () => this.closeWin(w.id), 'close_' + w.id);
    }
    g.save(); g.beginPath(); g.rect(x + 4, y + 23, ww - 8, hh - 27); g.clip();
    w.draw(x + 4, y + 23, ww - 8, hh - 27, w);
    g.restore();
  }
  drawTaskbar() {
    const g = this.g, y = OS_H - TASK_H;
    g.fillStyle = '#c0c0c0'; g.fillRect(0, y, OS_W, TASK_H);
    g.fillStyle = '#fff'; g.fillRect(0, y + 1, OS_W, 1);
    // Iniciar
    this.bevel(2, y + 4, 60, 19, this.menu);
    this.drawIcon('start', 5, y + 6, 0.5);
    g.font = FONTB; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Iniciar', 24, y + 14);
    this.hit(2, y + 4, 60, 19, () => { this.menu = !this.menu; }, 'start');
    // janelas abertas
    const wins = this.windows.filter((w) => !w.modal);
    const bw = Math.min(104, (OS_W - 150) / Math.max(1, wins.length));
    wins.forEach((w, i) => {
      const bx = 68 + i * (bw + 2);
      const act = w === this.windows[this.windows.length - 1];
      this.bevel(bx, y + 4, bw, 19, act);
      g.font = act ? FONTB : FONT; g.fillStyle = '#000';
      let t = w.title; while (g.measureText(t).width > bw - 26 && t.length > 3) t = t.slice(0, -2);
      if (w.icon) this.drawIcon(w.icon, bx + 3, y + 6, 0.5);
      g.fillText(t, bx + 22, y + 14);
      this.hit(bx, y + 4, bw, 19, () => this.front(w), 'tb_' + w.id);
    });
    // bandeja
    const tw = 80; const tx = OS_W - tw - 3;
    this.sunken(tx, y + 4, tw, 19);
    g.font = FONT; g.fillStyle = '#000'; g.textAlign = 'right'; g.fillText(clockStr(), OS_W - 9, y + 14);
    if (this.connected || this.connecting) {
      const blink = this.connected && Math.random() < 0.5;
      g.fillStyle = '#000'; g.fillRect(tx + 6, y + 8, 8, 6); g.fillRect(tx + 11, y + 11, 8, 6);
      g.fillStyle = blink ? '#4cf' : '#06a'; g.fillRect(tx + 7, y + 9, 6, 4);
      g.fillStyle = !blink ? '#4cf' : '#06a'; g.fillRect(tx + 12, y + 12, 6, 4);
      this.hit(tx + 4, y + 5, 18, 17, () => this.askDisconnect(), 'tray_modem');
    }
  }
  async askDisconnect() {
    if (!this.connected) return;
    const r = await this.msg('LinhaLivre', 'Conectado a LinhaLivre a 44.000 bps.\nDuração: ' + (G.flags.connDuration || '00:0' + Math.floor(Math.random() * 9) + ':12') + '\n\nDeseja desconectar?', ['Desconectar', 'Cancelar'], 'net');
    if (r === 0) this.disconnect();
  }
  drawMenu() {
    const g = this.g, h = 186, y = OS_H - TASK_H - h, w = 160;
    this.hit(0, 0, OS_W, OS_H - TASK_H, () => { this.menu = false; }, 'menuout');
    this.bevel(0, y, w, h);
    const sb = g.createLinearGradient(0, y + h, 0, y); sb.addColorStop(0, '#000080'); sb.addColorStop(1, '#1084d0');
    g.fillStyle = sb; g.fillRect(3, y + 3, 20, h - 6);
    g.save(); g.translate(17, y + h - 8); g.rotate(-Math.PI / 2); g.font = 'bold 14px Arial'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('Sistema 98', 0, 0); g.restore();
    const items = [['Programas', '▸'], ['Documentos', '▸'], ['Configurações', '▸'], ['Localizar', '▸'], ['Ajuda', ''], ['Executar...', ''], ['-'], ['Desligar...', '']];
    let yy = y + 6;
    items.forEach(([label, arrow]) => {
      if (label === '-') { g.fillStyle = '#808080'; g.fillRect(26, yy + 3, w - 30, 1); g.fillStyle = '#fff'; g.fillRect(26, yy + 4, w - 30, 1); yy += 8; return; }
      const hid = 'mi_' + label;
      if (this.isHover(hid)) { g.fillStyle = '#000080'; g.fillRect(25, yy, w - 28, 21); }
      g.font = FONT; g.fillStyle = this.isHover(hid) ? '#fff' : '#000'; g.textAlign = 'left'; g.fillText(label, 34, yy + 11);
      if (arrow) { g.textAlign = 'right'; g.fillText(arrow, w - 10, yy + 11); }
      this.hit(25, yy, w - 28, 21, () => {
        this.menu = false;
        if (label === 'Desligar...') this.requestShutdown();
        else if (label === 'Documentos') this.openFolder('docs');
        else if (label === 'Programas') this.openFolder('pc');
      }, hid);
      yy += 21;
    });
  }
  async requestShutdown() {
    if (this.on.shutdown) { const r = await this.on.shutdown(); if (r === false) return; }
    const r = await this.msg('Desligar o Sistema 98', 'Deseja realmente desligar o computador?', ['Sim', 'Não'], 'pc');
    if (r === 0) { this.on.shuttingDown && this.on.shuttingDown(); await this.shutdown(); this.on.off && this.on.off(); }
  }
  drawToasts() {
    const g = this.g;
    this.toasts.forEach((ts, i) => {
      const k = Math.min(1, ts.t * 4, (5 - ts.t) * 3);
      const w = 168, h = 62, x = OS_W - w - 4, y = OS_H - TASK_H - 4 - (h + 4) * (i + 1) + (1 - k) * 40;
      g.globalAlpha = Math.max(0, k);
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#d6e6fa'); gr.addColorStop(1, '#9ec0ea');
      g.fillStyle = gr; g.fillRect(x, y, w, h); g.strokeStyle = '#3a5a8a'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      this.drawIcon(ts.icon, x + 6, y + 14);
      g.font = FONTB; g.fillStyle = '#123'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const l1 = wrapText(g, ts.title, w - 50);
      l1.slice(0, 2).forEach((l, j) => g.fillText(l, x + 44, y + 16 + j * 12));
      g.font = FONT; g.fillStyle = '#123'; g.fillText(ts.text, x + 44, y + 18 + Math.min(2, l1.length) * 12);
      g.globalAlpha = 1;
    });
  }
  drawCursor() {
    const g = this.g, { x, y } = this.cursor;
    g.save(); g.translate(Math.round(x), Math.round(y));
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 15); g.lineTo(4, 11); g.lineTo(7, 17); g.lineTo(9, 16); g.lineTo(6, 10); g.lineTo(11, 10); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------- widgets
  bevel(x, y, w, h, inset = false) {
    const g = this.g;
    g.fillStyle = '#c0c0c0'; g.fillRect(x, y, w, h);
    g.fillStyle = inset ? '#000' : '#fff'; g.fillRect(x, y, w - 1, 1); g.fillRect(x, y, 1, h - 1);
    g.fillStyle = inset ? '#fff' : '#000'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = inset ? '#808080' : '#dfdfdf'; g.fillRect(x + 1, y + 1, w - 3, 1); g.fillRect(x + 1, y + 1, 1, h - 3);
    g.fillStyle = inset ? '#dfdfdf' : '#808080'; g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + w - 2, y + 1, 1, h - 2);
  }
  sunken(x, y, w, h, fill) {
    const g = this.g;
    if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    g.fillStyle = '#808080'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    g.fillStyle = '#fff'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = '#000'; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
  }
  button(x, y, w, h, label, fn, def = false, disabled = false) {
    const g = this.g, id = 'btn_' + label + x + y;
    const pressed = this.isHover(id) && !disabled && this.down;
    if (def) { g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, h + 2); }
    this.bevel(x, y, w, h, pressed);
    g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (disabled) { g.fillStyle = '#fff'; g.fillText(label, x + w / 2 + 1, y + h / 2 + 1); g.fillStyle = '#808080'; }
    else g.fillStyle = this.isHover(id) ? '#000080' : '#000';
    g.fillText(label, x + w / 2 + (pressed ? 1 : 0), y + h / 2 + (pressed ? 1 : 0));
    if (!disabled) this.hit(x, y, w, h, fn, id);
  }
  scrollbar(x, y, h, win, total, vis) {
    const g = this.g;
    g.fillStyle = '#e0e0e0'; g.fillRect(x, y, 16, h);
    this.bevel(x, y, 16, 16); this.bevel(x, y + h - 16, 16, 16);
    g.fillStyle = '#000'; g.font = '8px Arial'; g.textAlign = 'center'; g.fillText('▲', x + 8, y + 8); g.fillText('▼', x + 8, y + h - 8);
    this.hit(x, y, 16, 16, () => { win.scroll = Math.max(0, win.scroll - 3); win.follow = false; }, 'su_' + win.id);
    this.hit(x, y + h - 16, 16, 16, () => { win.scroll = Math.min(win.maxScroll || 0, win.scroll + 3); }, 'sd_' + win.id);
    if (total > vis) {
      const th = Math.max(14, (h - 32) * vis / total), ty = y + 16 + (h - 32 - th) * (win.scroll / Math.max(1, win.maxScroll));
      this.bevel(x, ty, 16, th);
    }
  }

  drawIcon(id, x, y, s = 1) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 1;
    const R = (c, a, b, w, h) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
    const C = (c, a, b, r) => { g.fillStyle = c; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); };
    switch (id) {
      case 'pc': R('#000', 3, 2, 26, 21); R('#d4cba8', 4, 3, 24, 19); R('#000', 7, 6, 18, 13); R('#1a7aa0', 8, 7, 16, 11); R('#d4cba8', 11, 23, 10, 3); R('#000', 6, 26, 20, 4); R('#d4cba8', 7, 26, 18, 3); break;
      case 'docs': case 'folder': R('#7a6020', 2, 7, 28, 22); R('#e8c860', 3, 8, 26, 20); R('#e8c860', 3, 5, 11, 4); R('#f8e090', 5, 12, 24, 16); break;
      case 'net': C('#13459e', 15, 14, 12); C('#2c78e0', 15, 14, 11); R('#3cb043', 8, 7, 7, 5); R('#3cb043', 16, 14, 8, 6); R('#3cb043', 10, 18, 4, 4); R('#222', 4, 24, 24, 6); R('#555', 6, 22, 6, 4); R('#555', 20, 22, 6, 4); break;
      case 'msn': C('#1d8a32', 11, 9, 5); g.fillStyle = '#1d8a32'; g.beginPath(); g.ellipse(11, 24, 9, 8, 0, Math.PI, 0); g.fill(); C('#2a5fc8', 21, 11, 5); g.fillStyle = '#2a5fc8'; g.beginPath(); g.ellipse(21, 26, 9, 8, 0, Math.PI, 0); g.fill(); break;
      case 'cd': C('#888', 16, 16, 13); C('#d8dce8', 16, 16, 12); C('#c9b8e8', 16, 16, 8); C('#e8f0ff', 16, 16, 5); C('#666', 16, 16, 2.5); break;
      case 'bin': R('#444', 8, 6, 16, 3); R('#9aa', 9, 9, 14, 19); g.fillStyle = '#566'; for (let i = 0; i < 3; i++) g.fillRect(11 + i * 4, 11, 2, 15); break;
      case 'cam': C('#222', 16, 12, 10); C('#ddd', 16, 12, 9); C('#111', 16, 12, 5); C('#58f', 15, 11, 2); R('#999', 13, 21, 6, 5); R('#bbb', 8, 26, 16, 3); break;
      case 'txt': case 'doc': R('#000', 6, 2, 21, 28); R('#fff', 7, 3, 19, 26); g.fillStyle = id === 'doc' ? '#2a5fc8' : '#555'; for (let i = 0; i < 6; i++) g.fillRect(10, 8 + i * 3.5, 12 - (i % 3) * 2, 1.5); break;
      case 'img': R('#000', 4, 5, 25, 22); R('#8cf', 5, 6, 23, 20); R('#3a3', 5, 18, 23, 8); C('#ff4', 22, 11, 3); break;
      case 'drive': R('#555', 3, 10, 26, 14); R('#bbb', 4, 11, 24, 12); R('#2c2', 22, 19, 3, 2); break;
      case 'floppy': R('#222', 6, 4, 22, 24); R('#ccc', 10, 4, 12, 9); R('#eee', 9, 17, 16, 11); break;
      case 'info': C('#fff', 16, 16, 14); C('#13d', 16, 16, 13); g.fillStyle = '#fff'; g.font = 'bold 18px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('i', 16, 17); break;
      case 'warn': g.fillStyle = '#ec0'; g.beginPath(); g.moveTo(16, 2); g.lineTo(30, 28); g.lineTo(2, 28); g.closePath(); g.fill(); g.strokeStyle = '#000'; g.stroke(); g.fillStyle = '#000'; g.font = 'bold 16px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 16, 19); break;
      case 'error': C('#a00', 16, 16, 14); C('#e11', 16, 16, 13); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(10, 10); g.lineTo(22, 22); g.moveTo(22, 10); g.lineTo(10, 22); g.stroke(); break;
      case 'burn': C('#888', 15, 17, 12); C('#d8dce8', 15, 17, 11); C('#c9b8e8', 15, 17, 7); C('#666', 15, 17, 2); g.fillStyle = '#ff7a10'; g.beginPath(); g.moveTo(24, 2); g.quadraticCurveTo(32, 12, 26, 18); g.quadraticCurveTo(22, 10, 24, 2); g.fill(); g.fillStyle = '#ffd020'; g.beginPath(); g.moveTo(25, 8); g.quadraticCurveTo(29, 14, 26, 17); g.quadraticCurveTo(23, 12, 25, 8); g.fill(); break;
      case 'start': R('#000', 4, 6, 24, 18); R('#d4cba8', 5, 7, 22, 16); R('#1a7aa0', 8, 10, 16, 10); R('#000', 10, 26, 12, 3); break;
    }
    g.restore();
  }
}

const NOTAS = `11/11/03
a corrente fala de um numero q atende sozinho depois da meia noite. começa com 3071.
liguei. atendeu. handshake normal, 44000bps.
nao pediu senha. nao tem pagina nenhuma.
so a conexao.

19/11/03
a ligacao nao cai. fiquei 5h conectado.
a conta veio 1 pulso.
pulso unico. pra companhia eh uma ligacao so.
desde a primeira vez.

27/11/03
quando to conectado parece q tem alguem no quarto.
sempre no mesmo lugar. no canto, la em cima, perto da porta.
tipo camera de seguranca.

02/12/03
peguei a camera digital da mae e deixei tirando foto sozinha.
nas fotos aparece.
no olho nao.

10/12/03
ele nao entra. ele so olha.
mas olhar eh suficiente.
meu coracao ta batendo junto com o chiado do modem.
tum. tum. tum.

13/12/03
acho q entendi.
ele nao eh uma coisa.
eh ALGUEM. de outro lugar. de outro tempo, talvez.
olhando por uma tela, igual eu olho a minha.
enquanto ele olhar, a linha nao cai.

troquei o numero no discador pra nao esquecer.
amanha conto pro caio.

14/12/03 05:31
o chiado ta mais alto.
meu coracao tambem.`;
const NOTAS_ANTES = NOTAS.slice(0, NOTAS.indexOf('14/12/03 05:31') - 2);
export { NOTAS, NOTAS_ANTES };

const CONTA = `TELEFONICA REGIONAL S.A.
Fatura de dezembro/2003 — Detalhamento de ligações locais

Data        Início   Número      Duração     Pulsos
-------------------------------------------------
02/12/2003  00:00    3071-0000   04:12:55    1
05/12/2003  00:00    3071-0000   05:01:33    1
09/12/2003  00:00    3071-0000   05:39:08    1
12/12/2003  00:00    3071-0000   05:44:20    1
14/12/2003  00:00    3071-0000   05:47:00    1
15/12/2003  00:00    3071-0000   ------      1
16/12/2003  00:00    3071-0000   ------      1
17/12/2003  00:00    3071-0000   ------      1
...

(a ligação continua aberta)`;
