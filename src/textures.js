// Gerenciador de texturas.
// Procura cada textura em ./texturas/<nome>.(png|jpg|jpeg|webp|bmp|gif).
// Se não encontrar, gera uma versão procedural no estilo PS2.
// Texturas carregadas são reduzidas para no máximo 256px (padrão PS2) — ajuste em texturas/mapa.json com "_tamanhoMax".
import * as THREE from 'three';

export const T = {};

// nome -> descrição (também usado no LEIA-ME)
export const TEX_INFO = [
  ['parede', 'Paredes do quarto (repete a cada 1 m)'],
  ['parede_corredor', 'Paredes do corredor (repete a cada 1 m)'],
  ['piso', 'Chão do quarto — taco de madeira (repete a cada 1 m)'],
  ['piso_corredor', 'Chão do corredor — piso frio (repete a cada 1 m)'],
  ['teto', 'Teto (esticada no teto inteiro)'],
  ['madeira', 'Móveis: mesa, criado-mudo, estante, cama (repete)'],
  ['guarda_roupa', 'Frente do guarda-roupa (imagem inteira)'],
  ['porta', 'Porta do quarto (imagem inteira, vertical)'],
  ['porta_leo', 'Porta do quarto do Léo, com adesivos (imagem inteira, vertical)'],
  ['plastico', 'Plástico bege amarelado: gabinete, monitor, teclado (repete)'],
  ['cobertor', 'Cobertor da cama (repete)'],
  ['lencol', 'Lençol e travesseiro (repete)'],
  ['cortina', 'Cortina (repete)'],
  ['tapete', 'Tapete (imagem inteira)'],
  ['poster1', 'Pôster da banda acima da cama (vertical)'],
  ['poster2', 'Pôster na parede da porta (vertical)'],
  ['poster_leo', 'Pôster no quarto do Léo (vertical)'],
  ['calendario', 'Calendário julho/2004 (vertical)'],
  ['calendario_leo', 'Calendário dezembro/2003 do Léo (vertical)'],
  ['mural', 'Mural de cortiça com fotos (horizontal)'],
  ['muro', 'Muro/casa do outro lado da rua (repete)'],
  ['camiseta', 'Estampa nas costas da camiseta do Caio'],
  ['foto1', 'Quadro no corredor: família'],
  ['foto2', 'Quadro no corredor: Léo'],
  ['teclado', 'Teclas do teclado (vista de cima)'],
  ['cds', 'Lombadas de CDs (repete)'],
  ['mochila', 'Tecido (nylon) da mochila e das alças (repete)'],
  ['cd_leo', 'Rótulo do CD-R "LÉO — NÃO MEXER" (quadrada)'],
  ['mancha_teto', 'Mancha de infiltração no teto (PNG com transparência)'],
  ['mancha_parede', 'Escorrido sob a janela (PNG com transparência)'],
  ['mancha_corredor', 'Mancha na parede do corredor (PNG com transparência)'],
];

// ---------------------------------------------------------------- utilidades
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function grain(c, amt, seed = 1) {
  const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height); const r = rng(seed); const a = d.data;
  for (let i = 0; i < a.length; i += 4) { const n = (r() - 0.5) * amt; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
  g.putImageData(d, 0, 0);
}
// desenha com repetição nas bordas (textura sem emenda)
function wrapped(g, w, h, x, y, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(x + ox, y + oy); fn(g); g.restore(); }
}
function blotches(g, w, h, n, rgb, rmin, rmax, alpha, r) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin), a = alpha * (0.4 + r() * 0.6);
    wrapped(g, w, h, x, y, (gg) => {
      const gr = gg.createRadialGradient(0, 0, 0, 0, 0, rad);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      gg.fillStyle = gr; gg.fillRect(-rad, -rad, rad * 2, rad * 2);
    });
  }
}
function text(g, s, x, y, font, color, align = 'center') { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); }

// ---------------------------------------------------------------- geradores
const GEN = {
  parede(base = '#a7b4a2', seed = 11) {
    const c = mk(256, 256), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 3) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.02})`; g.fillRect(x, 0, 3, 256); }
    blotches(g, 256, 256, 18, '70,60,40', 8, 46, 0.07, r);
    blotches(g, 256, 256, 6, '255,255,240', 10, 30, 0.05, r);
    // rachaduras finas
    g.strokeStyle = 'rgba(40,35,30,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 2; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 14; y += r() * 9; g.lineTo(x, y); } g.stroke(); }
    grain(c, 16, seed + 1);
    return c;
  },
  parede_corredor() { return GEN.parede('#b8ab88', 23); },
  piso() {
    const c = mk(256, 256), g = c.getContext('2d'), r = rng(5);
    const tones = ['#6e4528', '#7d5030', '#5f3a21', '#86593a', '#734a2b'];
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      const vert = (bx + by) % 2 === 0;
      for (let s = 0; s < 4; s++) {
        const x = bx * 64 + (vert ? s * 16 : 0), y = by * 64 + (vert ? 0 : s * 16);
        const w = vert ? 16 : 64, h = vert ? 64 : 16;
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(30,15,5,0.35)';
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          if (vert) { const gx = x + 2 + r() * 12; g.moveTo(gx, y); g.bezierCurveTo(gx + (r() - 0.5) * 4, y + 20, gx + (r() - 0.5) * 4, y + 44, gx, y + 64); }
          else { const gy = y + 2 + r() * 12; g.moveTo(x, gy); g.bezierCurveTo(x + 20, gy + (r() - 0.5) * 4, x + 44, gy + (r() - 0.5) * 4, x + 64, gy); }
          g.stroke();
        }
        g.strokeStyle = 'rgba(15,8,3,0.8)'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    blotches(g, 256, 256, 10, '200,160,110', 20, 60, 0.08, r);
    blotches(g, 256, 256, 8, '20,10,5', 10, 40, 0.12, r);
    grain(c, 14, 6);
    return c;
  },
  piso_corredor() {
    const c = mk(256, 256), g = c.getContext('2d'), r = rng(9);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 180 + Math.floor(r() * 14);
      g.fillStyle = `rgb(${v},${v - 12},${v - 34})`; g.fillRect(x * 64, y * 64, 64, 64);
      blotches(g, 64, 64, 0, '0,0,0', 1, 2, 0, r);
      g.fillStyle = 'rgba(120,100,70,0.25)'; for (let k = 0; k < 30; k++) g.fillRect(x * 64 + r() * 64, y * 64 + r() * 64, 2, 2);
    }
    g.fillStyle = '#5b5246'; for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 2, 256); g.fillRect(0, i * 64, 256, 2); }
    blotches(g, 256, 256, 8, '60,50,30', 15, 50, 0.1, r);
    grain(c, 10, 10);
    return c;
  },
  teto() {
    const c = mk(256, 256), g = c.getContext('2d'), r = rng(31);
    g.fillStyle = '#c9c5b9'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 10, '90,80,60', 10, 40, 0.06, r);
    // mancha de infiltração
    const gr = g.createRadialGradient(70, 60, 10, 70, 60, 46);
    gr.addColorStop(0, 'rgba(120,95,50,0.05)'); gr.addColorStop(0.8, 'rgba(110,80,40,0.3)'); gr.addColorStop(1, 'rgba(110,80,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
    // mofo no canto (lado da porta)
    blotches(g, 256, 256, 0, '0,0,0', 1, 1, 0, r);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,35,25,${r() * 0.3})`; g.beginPath(); g.arc(236 + r() * 20, 236 + r() * 20, 2 + r() * 8, 0, 7); g.fill(); }
    grain(c, 12, 32);
    return c;
  },
  madeira() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(41);
    g.fillStyle = '#b8936a'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      const y = r() * 128; g.strokeStyle = `rgba(${r() < 0.5 ? '90,55,25' : '220,190,150'},${0.15 + r() * 0.25})`; g.lineWidth = 0.5 + r() * 1.5;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2); g.stroke();
    }
    grain(c, 10, 42);
    return c;
  },
  guarda_roupa() {
    const c = mk(256, 256), g = c.getContext('2d'), r = rng(51);
    g.drawImage(GEN.madeira(), 0, 0, 256, 256);
    g.fillStyle = 'rgba(70,45,25,0.25)'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(25,15,8,0.9)'; g.lineWidth = 2;
    for (const x of [85, 170]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    g.strokeRect(4, 4, 248, 248); g.beginPath(); g.moveTo(0, 210); g.lineTo(256, 210); g.stroke();
    // adesivos antigos
    const st = [['#d33', 'TAZO'], ['#2a6', 'SURF'], ['#e9c21b', '★']];
    st.forEach(([col, s], i) => { g.save(); g.translate(30 + i * 22, 120 + i * 16); g.rotate((r() - 0.5) * 0.6); g.fillStyle = col; g.fillRect(-9, -7, 18, 14); text(g, s, 0, 0, 'bold 7px Arial', '#fff'); g.restore(); });
    grain(c, 10, 52);
    return c;
  },
  porta(leo = false) {
    const c = mk(128, 256), g = c.getContext('2d'), r = rng(leo ? 62 : 61);
    g.fillStyle = leo ? '#c8c0aa' : '#d6d0bf'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(80,70,50,0.5)'; g.lineWidth = 3;
    g.strokeRect(16, 16, 96, 100); g.strokeRect(16, 132, 96, 108);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.strokeRect(19, 19, 90, 94); g.strokeRect(19, 135, 90, 102);
    blotches(g, 128, 256, 5, '60,50,30', 6, 18, 0.25, r); // sujeira perto da maçaneta
    if (leo) {
      g.save(); g.translate(64, 60); g.rotate(-0.08); g.fillStyle = '#b81414'; g.fillRect(-42, -16, 84, 32); text(g, 'PROIBIDO', 0, -5, 'bold 13px Arial', '#fff'); text(g, 'ENTRAR', 0, 9, 'bold 11px Arial', '#fff'); g.restore();
      g.save(); g.translate(40, 160); g.rotate(0.2); g.fillStyle = '#111'; g.fillRect(-18, -12, 36, 24); text(g, '56K', 0, 0, 'bold 13px Impact, Arial', '#7f7'); g.restore();
      g.save(); g.translate(90, 190); g.fillStyle = '#eee'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(-5, -2, 3.5, 0, 7); g.arc(5, -2, 3.5, 0, 7); g.fill(); g.fillRect(-4, 6, 8, 3); g.restore();
      g.save(); g.translate(70, 225); g.rotate(-0.1); g.fillStyle = '#f2c300'; g.fillRect(-30, -8, 60, 16); text(g, 'ABISMO 56K', 0, 0, 'bold 9px Arial', '#000'); g.restore();
    } else {
      g.save(); g.translate(64, 70); g.rotate(0.05); g.fillStyle = '#1b1b1b'; g.fillRect(-30, -10, 60, 20); text(g, 'ABISMO 56K', 0, 0, 'bold 9px Arial', '#e33'); g.restore();
    }
    grain(c, 12, 63);
    return c;
  },
  porta_leo() { return GEN.porta(true); },
  plastico() {
    const c = mk(64, 64), g = c.getContext('2d'), r = rng(71);
    g.fillStyle = '#cbbd96'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,80,50' : '255,250,230'},${r() * 0.15})`; g.fillRect(r() * 64, r() * 64, 1, 1); }
    grain(c, 8, 72);
    return c;
  },
  cobertor() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(81);
    g.fillStyle = '#4e1a20'; g.fillRect(0, 0, 128, 128);
    const band = (col, a, pos, w) => { g.fillStyle = `rgba(${col},${a})`; g.fillRect(pos, 0, w, 128); g.fillRect(0, pos, 128, w); };
    band('20,30,70', 0.6, 10, 26); band('20,30,70', 0.6, 74, 26); band('15,60,35', 0.45, 46, 10); band('15,60,35', 0.45, 110, 10);
    band('220,190,60', 0.35, 40, 2); band('220,190,60', 0.35, 104, 2);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},0.06)`; g.fillRect(r() * 128, r() * 128, 1, 2); }
    grain(c, 14, 82);
    return c;
  },
  lencol() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(91);
    g.fillStyle = '#9db0c2'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) { const x = r() * 128, y = r() * 128; g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 3, y + Math.sin(k * 1.26) * 3, 1.8, 0, 7); g.fill(); } }
    grain(c, 10, 92);
    return c;
  },
  cortina() {
    const c = mk(128, 128), g = c.getContext('2d');
    for (let x = 0; x < 128; x++) { const v = 0.75 + 0.25 * Math.sin(x / 128 * Math.PI * 8); g.fillStyle = `rgb(${Math.floor(176 * v)},${Math.floor(112 * v)},${Math.floor(58 * v)})`; g.fillRect(x, 0, 1, 128); }
    g.fillStyle = 'rgba(255,220,160,0.15)'; for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 2);
    grain(c, 10, 102);
    return c;
  },
  tapete() {
    const c = mk(256, 170), g = c.getContext('2d'), r = rng(111);
    g.fillStyle = '#5a1e1e'; g.fillRect(0, 0, 256, 170);
    g.strokeStyle = '#c9b38a'; g.lineWidth = 6; g.strokeRect(10, 10, 236, 150);
    g.lineWidth = 2; g.strokeRect(22, 22, 212, 126);
    g.fillStyle = 'rgba(200,170,120,0.5)';
    for (let i = 0; i < 6; i++) { g.save(); g.translate(128, 85); g.rotate(i * Math.PI / 3); g.beginPath(); g.ellipse(26, 0, 22, 8, 0, 0, 7); g.fill(); g.restore(); }
    blotches(g, 256, 170, 6, '200,180,150', 20, 50, 0.12, r);
    grain(c, 16, 112);
    return c;
  },
  poster1() {
    const c = mk(192, 272), g = c.getContext('2d'), r = rng(121);
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 192, 272);
    // tela de TV com estática e silhueta
    g.fillStyle = '#ccc'; g.fillRect(36, 70, 120, 92);
    for (let i = 0; i < 1800; i++) { const v = Math.floor(r() * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(36 + r() * 120, 70 + r() * 92, 2, 1); }
    g.fillStyle = '#000'; g.beginPath(); g.arc(96, 104, 13, 0, 7); g.fill(); g.fillRect(80, 116, 32, 46);
    g.strokeStyle = '#555'; g.lineWidth = 6; g.strokeRect(30, 64, 132, 104);
    g.save(); g.translate(96, 34); g.scale(1, 1.3); text(g, 'ABISMO 56K', 0, 0, 'bold 26px Impact, "Arial Black", Arial', '#d61f1f'); g.restore();
    text(g, 'TURNÊ CONEXÃO PERDIDA', 96, 188, 'bold 12px Arial', '#eee');
    text(g, '2003', 96, 204, 'bold 14px Impact, Arial', '#d61f1f');
    ['12/09 PORTO ALEGRE', '14/09 CURITIBA', '20/09 SÃO PAULO', '27/09 BELO HORIZONTE'].forEach((s, i) => text(g, s, 96, 224 + i * 11, '9px Arial', '#999'));
    grain(c, 20, 122);
    return c;
  },
  poster2() {
    const c = mk(192, 272), g = c.getContext('2d'), r = rng(131);
    const gr = g.createLinearGradient(0, 0, 0, 272); gr.addColorStop(0, '#0d7a2c'); gr.addColorStop(1, '#073d17');
    g.fillStyle = gr; g.fillRect(0, 0, 192, 272);
    g.fillStyle = '#f5d000'; g.beginPath(); g.moveTo(96, 20); g.lineTo(176, 136); g.lineTo(96, 252); g.lineTo(16, 136); g.closePath(); g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) { g.save(); g.translate(56 + i * 20, 40); g.fillStyle = '#ffd900'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 3 : 7; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); g.restore(); }
    // taça estilizada
    g.fillStyle = '#e7c13a'; g.beginPath(); g.moveTo(80, 80); g.quadraticCurveTo(70, 130, 92, 150); g.lineTo(88, 180); g.lineTo(104, 180); g.lineTo(100, 150); g.quadraticCurveTo(122, 130, 112, 80); g.closePath(); g.fill();
    g.fillRect(80, 180, 32, 10);
    text(g, 'PENTA', 96, 216, 'bold 36px Impact, "Arial Black", Arial', '#ffd900');
    text(g, 'BRASIL 2002', 96, 246, 'bold 16px Arial', '#fff');
    blotches(g, 192, 272, 6, '255,255,255', 20, 50, 0.08, r);
    grain(c, 14, 132);
    return c;
  },
  poster_leo() {
    const c = mk(192, 272), g = c.getContext('2d'), r = rng(141);
    g.fillStyle = '#101418'; g.fillRect(0, 0, 192, 272);
    g.strokeStyle = '#2f6'; g.lineWidth = 1;
    for (let y = 60; y < 200; y += 6) { g.globalAlpha = 0.25 + r() * 0.5; g.beginPath(); g.moveTo(20, y); for (let x = 20; x < 172; x += 4) g.lineTo(x, y + Math.sin(x * 0.2 + y) * (r() * 4)); g.stroke(); }
    g.globalAlpha = 1;
    text(g, 'CONECTADO', 96, 30, 'bold 24px "Courier New", monospace', '#2f6');
    text(g, '44.000 bps', 96, 220, 'bold 16px "Courier New", monospace', '#2f6');
    text(g, 'não desliga', 96, 248, 'italic 12px "Courier New", monospace', '#888');
    grain(c, 16, 142);
    return c;
  },
  calendario(leo = false) {
    const c = mk(160, 240), g = c.getContext('2d'), r = rng(leo ? 152 : 151);
    g.fillStyle = '#efeadc'; g.fillRect(0, 0, 160, 240);
    // foto do topo (paisagem)
    const sky = g.createLinearGradient(0, 8, 0, 90); sky.addColorStop(0, leo ? '#3b4f6b' : '#5aa0d8'); sky.addColorStop(1, '#cfe6f2');
    g.fillStyle = sky; g.fillRect(8, 8, 144, 82);
    g.fillStyle = leo ? '#2c4a2c' : '#3c8a3c'; g.beginPath(); g.moveTo(8, 90); g.lineTo(50, 50); g.lineTo(90, 78); g.lineTo(120, 44); g.lineTo(152, 90); g.fill();
    text(g, leo ? 'DEZEMBRO 2003' : 'JULHO 2004', 80, 104, 'bold 13px Arial', '#222');
    const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    days.forEach((d, i) => text(g, d, 16 + i * 21, 122, 'bold 9px Arial', i === 0 ? '#b00' : '#333'));
    const start = leo ? 1 : 4, total = 31, upto = leo ? 13 : 11;
    for (let d = 1; d <= total; d++) {
      const idx = start + d - 1, cx = 16 + (idx % 7) * 21, cy = 138 + Math.floor(idx / 7) * 18;
      text(g, String(d), cx, cy, '10px Arial', idx % 7 === 0 ? '#b00' : '#333');
      if (d <= upto) { g.strokeStyle = 'rgba(180,0,0,0.75)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 6, cy - 6); g.lineTo(cx + 6, cy + 6); g.moveTo(cx + 6, cy - 6); g.lineTo(cx - 6, cy + 6); g.stroke(); }
      if (leo && d === 14) { g.strokeStyle = '#c00'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.stroke(); }
      if (!leo && d === 13) { text(g, '★', cx + 6, cy - 6, '8px Arial', '#c00'); }
    }
    grain(c, 10, 153);
    return c;
  },
  calendario_leo() { return GEN.calendario(true); },
  mural() {
    const c = mk(256, 160), g = c.getContext('2d'), r = rng(161);
    g.fillStyle = '#b4895a'; g.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,60,30' : '230,200,150'},0.35)`; g.fillRect(r() * 256, r() * 160, 1, 1); }
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 160);
    const photo = (x, y, rot, scene) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = '#f4f1e8'; g.fillRect(-28, -22, 56, 46);
      scene(g); g.fillStyle = '#c33'; g.beginPath(); g.arc(0, -20, 2.5, 0, 7); g.fill(); g.restore();
    };
    photo(46, 50, -0.1, (g) => { g.fillStyle = '#6ab6e8'; g.fillRect(-24, -18, 48, 18); g.fillStyle = '#e8d08a'; g.fillRect(-24, 0, 48, 18); g.fillStyle = '#222'; g.fillRect(-10, -8, 6, 16); g.fillRect(4, -10, 6, 18); g.fillStyle = '#c98e6a'; g.beginPath(); g.arc(-7, -11, 3.5, 0, 7); g.arc(7, -13, 3.5, 0, 7); g.fill(); });
    photo(120, 46, 0.08, (g) => { g.fillStyle = '#333'; g.fillRect(-24, -18, 48, 36); g.fillStyle = '#c98e6a'; g.beginPath(); g.arc(0, -2, 9, 0, 7); g.fill(); g.fillStyle = '#211'; g.fillRect(-9, -11, 18, 6); g.fillStyle = '#7a1a1a'; g.fillRect(-14, 8, 28, 10); g.strokeStyle = '#000'; g.beginPath(); g.moveTo(-5, -3); g.lineTo(-2, -3); g.moveTo(2, -3); g.lineTo(5, -3); g.stroke(); });
    photo(196, 58, -0.05, (g) => { g.fillStyle = '#1a1a22'; g.fillRect(-24, -18, 48, 36); g.fillStyle = '#d61f1f'; g.fillRect(-20, -14, 40, 8); g.fillStyle = '#ffd'; for (let i = 0; i < 6; i++) g.fillRect(-20 + i * 8, 4, 4, 10); });
    // ingresso + post-it
    g.save(); g.translate(80, 118); g.rotate(0.06); g.fillStyle = '#e8d24a'; g.fillRect(-36, -12, 72, 24); text(g, 'ABISMO 56K', 0, -4, 'bold 9px Arial', '#222'); text(g, 'PISTA - R$ 25,00', 0, 6, '7px Arial', '#222'); g.restore();
    g.save(); g.translate(180, 120); g.rotate(-0.08); g.fillStyle = '#f7ee7a'; g.fillRect(-22, -22, 44, 44); text(g, 'vestibular', 0, -8, '8px "Comic Sans MS", Arial', '#225'); text(g, 'dez/2004', 0, 4, 'bold 8px "Comic Sans MS", Arial', '#225'); text(g, 'FOCO!!', 0, 15, 'bold 8px "Comic Sans MS", Arial', '#c22'); g.restore();
    grain(c, 12, 162);
    return c;
  },
  muro() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(171);
    g.fillStyle = '#6f6d66'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,20,20' : '200,200,190'},${r() * 0.3})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
    blotches(g, 128, 128, 8, '20,25,15', 10, 30, 0.25, r);
    grain(c, 16, 172);
    return c;
  },
  camiseta() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(181);
    g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 0.75;
    g.strokeStyle = '#ddd'; g.lineWidth = 3; g.beginPath(); g.arc(64, 58, 26, 0, 7); g.stroke();
    g.fillStyle = '#ddd'; g.beginPath(); g.arc(64, 52, 8, 0, 7); g.fill(); g.fillRect(56, 60, 16, 18);
    text(g, 'ABISMO', 64, 98, 'bold 18px Impact, Arial', '#c22');
    text(g, '56K', 64, 114, 'bold 13px Impact, Arial', '#ddd');
    g.globalAlpha = 1;
    for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(26,26,28,0.6)'; g.fillRect(r() * 128, r() * 128, 1, 1); } // estampa desgastada
    grain(c, 10, 182);
    return c;
  },
  foto1() {
    const c = mk(128, 160), g = c.getContext('2d');
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#d8c6a0'; g.fillRect(10, 10, 108, 140);
    const gr = g.createLinearGradient(0, 14, 0, 146); gr.addColorStop(0, '#a99b7a'); gr.addColorStop(1, '#6d5f48');
    g.fillStyle = gr; g.fillRect(16, 16, 96, 128);
    [[40, 0.95, '#3c3a5a'], [64, 1.05, '#7a5a3a'], [88, 0.82, '#2a4a3a']].forEach(([x, s, col]) => {
      g.fillStyle = col; g.fillRect(x - 11 * s, 82 - 10 * s, 22 * s, 62 * s);
      g.fillStyle = '#c99a78'; g.beginPath(); g.arc(x, 70 - 14 * s, 9 * s, 0, 7); g.fill();
    });
    grain(c, 22, 191);
    return c;
  },
  foto2() {
    const c = mk(128, 160), g = c.getContext('2d');
    g.fillStyle = '#2a2018'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#e0d5bf'; g.fillRect(10, 10, 108, 140);
    g.fillStyle = '#4f6b80'; g.fillRect(16, 16, 96, 128);
    g.fillStyle = '#8a1c1c'; g.beginPath(); g.moveTo(24, 144); g.quadraticCurveTo(64, 92, 104, 144); g.fill();
    g.fillStyle = '#c99a78'; g.beginPath(); g.ellipse(64, 72, 20, 25, 0, 0, 7); g.fill();
    g.fillStyle = '#1d140e'; g.beginPath(); g.ellipse(64, 54, 22, 12, 0, Math.PI, 0); g.fill();
    g.strokeStyle = '#3a2418'; g.lineWidth = 2; g.beginPath(); g.moveTo(52, 70); g.quadraticCurveTo(56, 73, 60, 70); g.moveTo(68, 70); g.quadraticCurveTo(72, 73, 76, 70); g.stroke(); // olhos fechados
    g.beginPath(); g.moveTo(58, 86); g.quadraticCurveTo(64, 89, 70, 86); g.stroke();
    grain(c, 22, 192);
    return c;
  },
  teclado() {
    const c = mk(256, 96), g = c.getContext('2d');
    g.fillStyle = '#b9ab86'; g.fillRect(0, 0, 256, 96);
    const rows = [14, 14, 13, 12, 8];
    rows.forEach((n, y) => { for (let x = 0; x < n; x++) { const w = y === 4 && x === 3 ? 70 : 14; const px = 8 + x * 16 + (y === 4 && x > 3 ? 56 : 0) + y * 3; if (px + w > 200) continue; g.fillStyle = '#d8ccab'; g.fillRect(px, 8 + y * 16, w, 13); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, 20 + y * 16, w, 1); } });
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { g.fillStyle = '#d8ccab'; g.fillRect(208 + x * 15, 8 + y * 16, 13, 13); }
    grain(c, 8, 201);
    return c;
  },
  cds() {
    const c = mk(64, 128), g = c.getContext('2d'), r = rng(211);
    let y = 0;
    while (y < 128) { const h = 3 + Math.floor(r() * 3); g.fillStyle = `hsl(${Math.floor(r() * 360)},${30 + r() * 50}%,${15 + r() * 40}%)`; g.fillRect(0, y, 64, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(6 + r() * 20, y + 1, 10 + r() * 24, 1); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, y + h - 1, 64, 1); y += h; }
    return c;
  },
  mochila() {
    // nylon grosso azul-marinho: trama em xadrez miúdo, fios mais claros, desbotado de uso
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(221);
    g.fillStyle = '#2d4274'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
      g.fillStyle = ((x + y) / 2) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,10,0.09)'; g.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,170,210,${0.04 + r() * 0.08})`; g.fillRect(Math.floor(r() * 64) * 2, r() * 128, 2, 1); }
    blotches(g, 128, 128, 7, '150,160,180', 10, 34, 0.08, r);   // desbotado
    blotches(g, 128, 128, 6, '10,10,20', 8, 26, 0.12, r);       // encardido
    grain(c, 12, 222);
    return c;
  },
  broche() {
    // bóton da banda preso na mochila (não entra em TEX_INFO: detalhe pequeno)
    const c = mk(64, 64), g = c.getContext('2d');
    g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill();
    g.fillStyle = '#121214'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
    text(g, 'ABISMO', 32, 27, 'bold 13px Impact, "Arial Black", Arial', '#d61f1f');
    text(g, '56K', 32, 41, 'bold 12px Impact, Arial', '#eee');
    grain(c, 10, 231);
    return c;
  },
  postit() {
    // post-it colado no monitor (não entra em TEX_INFO: o texto faz parte da história)
    // quadrado, amarelo-canário, escrito à mão com caneta esferográfica azul
    const S = 256, c = mk(S, S), g = c.getContext('2d'), r = rng(241);
    const pap = g.createLinearGradient(0, 0, 0, S);
    pap.addColorStop(0, '#ffeb73'); pap.addColorStop(0.3, '#fee464'); pap.addColorStop(1, '#f6d850');
    g.fillStyle = pap; g.fillRect(0, 0, S, S);
    // faixa de cola lisa no alto; logo abaixo o papel dobra e descola (a parte de baixo pega menos luz)
    g.fillStyle = 'rgba(255,252,215,0.14)'; g.fillRect(0, 0, S, 42);
    const fold = g.createLinearGradient(0, 38, 0, S);
    fold.addColorStop(0, 'rgba(255,250,210,0.18)'); fold.addColorStop(0.06, 'rgba(140,95,0,0.07)');
    fold.addColorStop(0.5, 'rgba(140,95,0,0.03)'); fold.addColorStop(1, 'rgba(140,95,0,0.16)');
    g.fillStyle = fold; g.fillRect(0, 38, S, S - 38);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,251,215' : '160,118,15'},${0.03 + r() * 0.06})`; g.fillRect(r() * S, r() * S, 1 + r() * 3, 1); }
    // borda cortada do bloco: fio mais escuro e um pouco irregular
    g.strokeStyle = 'rgba(165,120,10,0.4)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    // letra de mão: cada letra com tamanho, inclinação e linha de base um pouco diferentes;
    // a esferográfica falha e engrossa (segunda passada deslocada, tinta mais fraca)
    const hand = '"Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", "Comic Neue", cursive';
    const ink = (a) => `rgba(24,44,165,${a})`;
    g.textBaseline = 'alphabetic'; g.lineCap = 'round'; g.lineJoin = 'round';
    const write = (s, x, y, px, rot, maxW = S - x - 14) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.font = `${px}px ${hand}`;
      const fit = Math.min(1, maxW / g.measureText(s).width); g.scale(fit, 1);
      let cx = 0;
      for (const ch of s) {
        const k = 0.92 + r() * 0.16;
        g.font = `${Math.round(px * k)}px ${hand}`;
        g.save(); g.translate(cx, (r() - 0.5) * px * 0.08); g.rotate((r() - 0.5) * 0.12);
        g.fillStyle = g.strokeStyle = ink(0.82 + r() * 0.18); g.lineWidth = px * 0.045;
        g.strokeText(ch, 0, 0); g.fillText(ch, 0, 0);
        g.fillStyle = ink(0.3 + r() * 0.2); g.fillText(ch, 0.8, 0.5);
        g.restore();
        cx += g.measureText(ch).width * (0.98 + r() * 0.06);
      }
      g.restore();
      return cx * fit;
    };
    // traço de caneta tremido
    const stroke = (pts, w) => {
      g.strokeStyle = ink(0.85); g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + (r() - 0.5) * 1.2, pts[i][1] + (r() - 0.5) * 1.2);
      g.stroke();
    };
    write('LinhaLivre', 16, 44, 38, -0.04);
    write('login: caio_m', 20, 84, 32, -0.015);
    const wv = []; for (let x = 24; x <= 200; x += 6) wv.push([x, 101 + Math.sin(x * 0.35) * 2.5]);
    stroke(wv, 2);
    const wn = write('NÃO', 22, 154, 66, -0.06);
    // NÃO sublinhado duas vezes, rápido, passando do fim da palavra
    for (const [dy, ex] of [[10, 10], [18, 4]]) {
      const pts = []; for (let t = 0; t <= 1.0001; t += 0.1) pts.push([18 + t * (wn + ex), 154 + dy - t * (wn + ex) * 0.06 + Math.sin(t * Math.PI) * 2]);
      stroke(pts, 3);
    }
    write('esquecer', 30, 206, 48, -0.02);
    write('de desligar!', 14, 244, 40, -0.035);
    grain(c, 7, 242);
    return c;
  },
  mancha_teto() {
    const c = mk(128, 128), g = c.getContext('2d'), r = rng(301);
    for (let i = 0; i < 3; i++) {
      const gr = g.createRadialGradient(64, 64, 10 + i * 12, 64, 64, 30 + i * 14);
      gr.addColorStop(0, 'rgba(110,80,40,0)'); gr.addColorStop(0.85, `rgba(100,70,35,${0.35 - i * 0.08})`); gr.addColorStop(1, 'rgba(100,70,35,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(64 + (r() - 0.5) * 8, 64, 60, 52, 0, 0, 7); g.fill();
    }
    return c;
  },
  mancha_parede() {
    const c = mk(64, 128), g = c.getContext('2d'), r = rng(311);
    for (let i = 0; i < 14; i++) {
      const x = 4 + r() * 56, len = 40 + r() * 80, w = 2 + r() * 5;
      const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(25,20,12,0.45)'); gr.addColorStop(1, 'rgba(25,20,12,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
    return c;
  },
  mancha_corredor() { return GEN.mancha_teto(); },
  cd_leo() {
    const c = mk(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, '#e4e4e8'); gr.addColorStop(0.5, '#b8bccc'); gr.addColorStop(0.7, '#d9d0e8'); gr.addColorStop(1, '#a5a9b5');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#555'; g.beginPath(); g.arc(64, 64, 9, 0, 7); g.fill();
    g.save(); g.translate(64, 64); g.rotate(-0.2);
    text(g, 'LÉO', 0, -30, 'bold 22px "Comic Sans MS", "Segoe Print", Arial', '#141414');
    text(g, 'NÃO MEXER', 0, 32, 'bold 15px "Comic Sans MS", "Segoe Print", Arial', '#141414');
    g.restore();
    return c;
  },
};

// ---------------------------------------------------------------- carregamento
function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}
function downscale(img, max) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = mk(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
export function makeTex(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 1;
  return t;
}

export const custom = [];   // nomes das texturas vindas da pasta

// 100% estático (funciona no GitHub Pages): a lista de texturas vem de texturas/mapa.json.
// Formato: { "parede": "minha_parede.jpg", "piso": "taco.png", "_tamanhoMax": 256 }
// Nomes ausentes no mapa usam a textura procedural.
export async function loadTextures(onProgress) {
  let mapa = {};
  try { const r = await fetch('texturas/mapa.json', { cache: 'no-cache' }); if (r.ok) mapa = await r.json(); } catch (e) { /* sem mapa */ }
  const max = mapa._tamanhoMax || 256;
  let i = 0;
  await Promise.all(TEX_INFO.map(async ([name]) => {
    let img = null;
    const file = mapa[name];
    if (file) img = await loadImg('texturas/' + encodeURI(file)).catch(() => { console.warn('Textura não encontrada:', file); return null; });
    const canvas = img ? downscale(img, max) : GEN[name]();
    T[name] = makeTex(canvas);
    if (img) custom.push(name);
    onProgress && onProgress(++i / TEX_INFO.length, name);
  }));
}

export { GEN, mk, rng, grain, text as drawText };
