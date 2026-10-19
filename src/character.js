// Personagens low-poly com esqueleto (SkinnedMesh), esculpidos por código no estilo PS2:
// corpo feito de seções elípticas ("lofts"), rosto e roupas pintados em texturas de canvas,
// cabelo em "cards" com pontas recortadas por alpha, acessórios rígidos presos aos ossos.
import * as THREE from 'three';

const TAU = Math.PI * 2;

// osso, pai, posição no mundo na pose de ligação (personagem olhando para +z, braços para baixo)
const SKELETON = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.95, 0]],
  ['spine', 'hips', [0, 1.07, 0]],
  ['chest', 'spine', [0, 1.26, 0]],
  ['neck', 'chest', [0, 1.47, 0]],
  ['head', 'neck', [0, 1.56, 0]],
  ['clavL', 'chest', [0.05, 1.42, 0]], ['armL', 'clavL', [0.17, 1.405, 0]], ['foreL', 'armL', [0.185, 1.15, 0]], ['handL', 'foreL', [0.195, 0.925, 0]],
  ['clavR', 'chest', [-0.05, 1.42, 0]], ['armR', 'clavR', [-0.17, 1.405, 0]], ['foreR', 'armR', [-0.185, 1.15, 0]], ['handR', 'foreR', [-0.195, 0.925, 0]],
  ['thighL', 'hips', [0.095, 0.92, 0]], ['shinL', 'thighL', [0.095, 0.5, 0]], ['footL', 'shinL', [0.095, 0.085, 0]],
  ['thighR', 'hips', [-0.095, 0.92, 0]], ['shinR', 'thighR', [-0.095, 0.5, 0]], ['footR', 'shinR', [-0.095, 0.085, 0]],
];
const BIND = Object.fromEntries(SKELETON.map(([n, , p]) => [n, p]));

// ---------------------------------------------------------------- vetores
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// anel: forma horizontal {y,rx,rz,cx,cz}, frontal {z,rx,ry,cx,cy} (eixo z) ou genérica {c,a,b}
function ring(r) {
  let c, a, b;
  if (r.c) { c = r.c; a = r.a; b = r.b; }
  else if (r.z !== undefined) { c = [r.cx || 0, r.cy || 0, r.z]; a = [r.rx, 0, 0]; b = [0, r.ry, 0]; }
  else {
    c = [r.cx || 0, r.y, r.cz || 0];
    const t = r.tilt || 0;               // inclina o anel: frente mais alta
    a = [r.rx, 0, 0]; b = [0, Math.sin(t) * r.rz, Math.cos(t) * r.rz];
  }
  return { c, a, b, la: len(a), lb: len(b), ah: nrm(a), bh: nrm(b), w: r.w || [['root', 1]], j: r.j || 0 };
}

class Mesher {
  constructor(boneIndex) { this.bi = boneIndex; this.P = []; this.N = []; this.UV = []; this.SI = []; this.SW = []; this.idx = {}; }
  pos(i) { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
  v(p, n, u, v, w) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.UV.push(u, v);
    const ww = w.slice(0, 4), s = ww.reduce((acc, e) => acc + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { const e = ww[k]; this.SI.push(e ? this.bi[e[0]] : 0); this.SW.push(e ? e[1] / s : 0); }
    return this.P.length / 3 - 1;
  }
  tri(m, a, b, c, want) {
    if (want) {
      const n = cross(sub(this.pos(b), this.pos(a)), sub(this.pos(c), this.pos(a)));
      if (dot(n, want) < 0) { const t = b; b = c; c = t; }
    }
    (this.idx[m] ||= []).push(a, b, c);
  }
  // superfície tubular a partir de uma lista de anéis
  loft(m, specs, o = {}) {
    const segs = o.segs || 10, u0 = o.u0 ?? 0, u1 = o.u1 ?? 1, v0 = o.v0 ?? 0, v1 = o.v1 ?? 1;
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? TAU;
    const R = specs.map(ring);
    const rows = R.map((r, k) => {
      const row = [];
      for (let j = 0; j <= segs; j++) {
        const t = t0 + (t1 - t0) * j / segs, c = Math.cos(t), s = Math.sin(t);
        const jit = r.j ? 1 + (hash(j % segs, k) - 0.5) * r.j : 1;
        const p = add(r.c, add(mul(r.a, c * jit), mul(r.b, s * jit)));
        const n = nrm(add(mul(r.ah, c * r.lb), mul(r.bh, s * r.la)));
        row.push(this.v(p, n, u0 + (u1 - u0) * j / segs, R.length > 1 ? v0 + (v1 - v0) * k / (R.length - 1) : v0, r.w));
      }
      return row;
    });
    for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < segs; j++) {
      const a = rows[k][j], b = rows[k + 1][j], c = rows[k][j + 1], d = rows[k + 1][j + 1];
      const out = sub(add(this.pos(a), this.pos(d)), add(R[k].c, R[k + 1].c));
      this.tri(m, a, b, c, out); this.tri(m, c, b, d, out);
    }
    const cap = (k, dir) => {
      const r = R[k], axis = R.length > 1 ? nrm(sub(R[k].c, R[k - dir].c)) : [0, 1, 0];
      const ctr = add(r.c, mul(axis, o.capBulge || 0));
      const ci = this.v(ctr, axis, (u0 + u1) / 2, k === 0 ? v0 : v1, r.w);
      for (let j = 0; j < segs; j++) this.tri(m, ci, rows[k][j], rows[k][j + 1], axis);
    };
    if (o.capA) cap(0, -1);
    if (o.capB) cap(R.length - 1, 1);
    return rows;
  }
  // fita (cards de cabelo, franja): pontos do caminho, larguras, centro de referência para a normal
  ribbon(m, pts, widths, center, w, o = {}) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const tan = nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const out = nrm(sub(pts[i], center));
      const side = nrm(cross(tan, out));
      const hw = widths[i] / 2, v = i / (n - 1);
      const a = this.v(add(pts[i], mul(side, -hw)), out, o.u0 ?? 0, v, w);
      const b = this.v(add(pts[i], mul(side, hw)), out, o.u1 ?? 1, v, w);
      if (i > 0) { const pa = a - 2, pb = b - 2; this.tri(m, pa, a, pb, out); this.tri(m, pb, a, b, out); }
    }
  }
  geometry(order, skinned) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    if (skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    }
    const all = [];
    order.forEach((m, mi) => { const ix = this.idx[m] || []; g.addGroup(all.length, ix.length, mi); all.push(...ix); });
    g.setIndex(all);
    return g;
  }
}

// ---------------------------------------------------------------- texturas pintadas
function tex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (opts.alpha) t.premultiplyAlpha = false;
  return t;
}
function noise(g, w, h, amt, alpha = 0.06) {
  for (let i = 0; i < w * h * amt; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${alpha})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2); }
}
function ell(g, x, y, rx, ry, col, rot = 0) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); }

// rosto: textura 512x256 que dá a volta na cabeça; frente = x 128. Atenção: espelhado (x maior = lado direito do personagem)
function faceTexture(look) {
  const skin = look.skin;
  return tex(512, 256, (g) => {
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    const sh = g.createLinearGradient(0, 0, 0, 256); sh.addColorStop(0, 'rgba(60,30,20,0.25)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,30,20,0.3)');
    g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
    // laterais mais escuras
    for (const x of [0, 256, 512]) { const gr = g.createRadialGradient(x, 140, 10, x, 140, 90); gr.addColorStop(0, 'rgba(70,35,25,0.18)'); gr.addColorStop(1, 'rgba(70,35,25,0)'); g.fillStyle = gr; g.fillRect(x - 90, 50, 180, 200); }
    noise(g, 512, 256, 0.15, 0.035);
    const E = [[95, 1], [161, -1]];      // olhos: esquerdo do personagem (x 95) e direito (x 161)
    // olheiras
    for (const [x] of E) { const gr = g.createRadialGradient(x, 140, 2, x, 140, 20); gr.addColorStop(0, `rgba(80,40,55,${look.tired})`); gr.addColorStop(1, 'rgba(80,40,55,0)'); g.fillStyle = gr; g.fillRect(x - 22, 118, 44, 40); }
    // nariz e boca
    g.fillStyle = 'rgba(90,45,30,0.25)'; g.fillRect(118, 132, 4, 38); g.fillRect(134, 132, 4, 38);
    ell(g, 128, 168, 12, 5, 'rgba(90,45,30,0.3)');
    ell(g, 121, 172, 3, 2, 'rgba(40,15,10,0.7)'); ell(g, 135, 172, 3, 2, 'rgba(40,15,10,0.7)');
    ell(g, 128, 160, 5, 7, 'rgba(255,230,200,0.12)');
    g.strokeStyle = look.lip; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(112, 207); g.quadraticCurveTo(128, 210, 144, 207); g.stroke();
    ell(g, 128, 212, 11, 3, 'rgba(160,80,70,0.35)');
    g.fillStyle = 'rgba(60,30,25,0.18)'; g.fillRect(126, 186, 4, 14);   // filtro labial
    // barba rala / buço
    if (look.stubble) { for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI, r = 30 + Math.random() * 30; const x = 128 + Math.cos(a) * r * 1.4, y = 200 + Math.sin(a) * r * 0.9; if (y < 250) { g.fillStyle = `rgba(30,20,15,${look.stubble})`; g.fillRect(x, y, 1, 1); } } g.fillStyle = `rgba(30,20,15,${look.stubble * 0.8})`; g.fillRect(112, 194, 32, 6); }
    // olhos
    for (const [x, s] of E) {
      if (look.closed) {   // olhos fechados: pálpebra e cílios
        g.strokeStyle = '#2a1810'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, 126, 12, 5, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
        g.strokeStyle = look.brow; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - s * 15, 110); g.quadraticCurveTo(x, 104, x + s * 13, 106); g.stroke();
        continue;
      }
      ell(g, x, 128, 12, 5.5, '#e2d8cb');
      ell(g, x - s * 1, 128, 5, 5, look.iris);
      ell(g, x - s * 1, 128, 2.2, 2.2, '#0a0605');
      ell(g, x - s * 1 - 1.5, 126.5, 1.2, 1.2, 'rgba(255,255,255,0.9)');
      g.strokeStyle = '#1a0e09'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, 129, 13, 7, 0, Math.PI * 1.06, Math.PI * 1.94); g.stroke();
      g.strokeStyle = 'rgba(60,30,20,0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x, 128, 12, 6, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
      g.strokeStyle = 'rgba(60,30,20,0.35)'; g.lineWidth = 1;                // pálpebra
      g.beginPath(); g.ellipse(x, 125, 13, 7, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      // sobrancelha: ponta de dentro mais alta (cara de cansado/preocupado)
      g.strokeStyle = look.brow; g.lineWidth = 4.5; g.lineCap = 'round';
      const inner = x + s * 13, outer = x - s * 15;
      g.beginPath(); g.moveTo(outer, 112); g.quadraticCurveTo(x - s * 2, 104, inner, look.worried ? 103 : 108); g.stroke();
    }
    // orelhas (sombra nas laterais)
    for (const x of [8, 248, 264, 504]) ell(g, x, 135, 8, 16, 'rgba(90,45,30,0.25)');
  });
}
function shirtTexture(look) {
  return tex(256, 256, (g) => {
    g.fillStyle = look.shirt; g.fillRect(0, 0, 256, 256);
    // dobras do tecido
    for (let i = 0; i < 14; i++) { const y = 150 + Math.random() * 100; g.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.2})`; g.lineWidth = 2 + Math.random() * 3; g.beginPath(); g.moveTo(Math.random() * 256, y); g.quadraticCurveTo(Math.random() * 256, y + 8, Math.random() * 256, y + Math.random() * 10); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, 256, 7);      // gola canelada
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 248, 256, 8);          // barra
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 3, 256); g.fillRect(127, 0, 3, 256);   // costuras laterais
    if (look.print === 'abismo') {
      g.save(); g.globalAlpha = 0.78;
      g.strokeStyle = '#d8d4cc'; g.lineWidth = 4; g.beginPath(); g.arc(192, 82, 30, 0, TAU); g.stroke();   // costas
      ell(g, 192, 74, 9, 10, '#d8d4cc'); g.fillStyle = '#d8d4cc'; g.fillRect(182, 84, 20, 22);
      g.font = 'bold 26px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.fillStyle = '#c42020'; g.fillText('ABISMO', 192, 146);
      g.font = 'bold 18px Impact, Arial'; g.fillStyle = '#d8d4cc'; g.fillText('56K', 192, 166);
      g.font = 'bold 9px Arial'; g.fillText('TURNÊ CONEXÃO PERDIDA 2003', 192, 182);
      g.font = 'bold 15px Impact, Arial'; g.fillStyle = '#c42020'; g.fillText('56K', 64, 70);  // frente
      g.restore();
      for (let i = 0; i < 1600; i++) { g.fillStyle = 'rgba(24,24,27,0.55)'; g.fillRect(140 + Math.random() * 104, 40 + Math.random() * 150, 1, 1); }   // estampa gasta
    } else if (look.print === 'moletom') {
      ell(g, 64, 205, 46, 30, 'rgba(0,0,0,0.22)');                       // bolso canguru
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.strokeRect(22, 180, 84, 52);
      g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(56, 6); g.lineTo(54, 60); g.moveTo(72, 6); g.lineTo(74, 56); g.stroke();   // cordão
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 236, 256, 20);    // barra canelada
    }
    noise(g, 256, 256, 0.25, 0.05);
  });
}
function sleeveTexture(look) {
  return tex(64, 128, (g) => {
    if (look.sleeve === 'listra') {
      for (let y = 0; y < 128; y += 10) { g.fillStyle = '#2f2f35'; g.fillRect(0, y, 64, 5); g.fillStyle = '#141416'; g.fillRect(0, y + 5, 64, 5); }
    } else { g.fillStyle = look.shirt; g.fillRect(0, 0, 64, 128); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 118, 64, 10);    // punho
    noise(g, 64, 128, 0.3, 0.06);
  });
}
function jeansTexture(look, pelvis) {
  return tex(128, pelvis ? 64 : 256, (g, w, h) => {
    g.fillStyle = look.pants; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.5; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '10,15,30' : '170,180,200'},0.09)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2); }
    if (pelvis) {
      g.fillStyle = '#2a1c14'; g.fillRect(0, 0, w, 9);                                     // cinto
      g.fillStyle = '#9a9488'; g.fillRect(28, 1, 8, 7);                                    // fivela
      g.strokeStyle = 'rgba(200,170,90,0.55)'; g.lineWidth = 1;
      g.strokeRect(78, 18, 18, 24); g.strokeRect(100, 18, 18, 24);                         // bolsos de trás
      g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 50); g.stroke();                        // zíper
    } else {
      g.strokeStyle = 'rgba(200,170,90,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1, 0); g.lineTo(1, h); g.moveTo(64, 0); g.lineTo(64, h); g.stroke();   // costuras
      const kn = g.createRadialGradient(32, 120, 4, 32, 120, 40); kn.addColorStop(0, 'rgba(200,210,230,0.18)'); kn.addColorStop(1, 'rgba(200,210,230,0)');
      g.fillStyle = kn; g.fillRect(0, 70, 64, 100);                                         // joelho gasto
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 14, w, 14);                       // barra desfiada
      for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(200,200,210,0.3)'; g.fillRect(x, h - 4 - Math.random() * 6, 1, 6); }
    }
  });
}
// meia (em casa, de madrugada ninguém está de tênis)
function shoeTexture(look) {
  return tex(128, 64, (g) => {
    g.fillStyle = look.shoe; g.fillRect(0, 0, 128, 64);
    for (let y = 0; y < 64; y += 3) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, y, 128, 1); }   // tricô
    g.fillStyle = 'rgba(70,55,40,0.45)'; g.fillRect(76, 4, 40, 56);         // sola encardida
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 54, 128, 10);   // calcanhar e ponta
    noise(g, 128, 64, 0.4, 0.06);
  });
}
function hairTexture(look, card) {
  return tex(64, 128, (g) => {
    if (!card) { g.fillStyle = look.hair; g.fillRect(0, 0, 64, 128); }
    for (let x = 0; x < 64; x += 2) {
      const l = card ? 70 + Math.random() * 58 : 128;
      const gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, look.hair); gr.addColorStop(0.7, look.hair); gr.addColorStop(1, card ? 'rgba(0,0,0,0)' : look.hair);
      g.fillStyle = gr; g.fillRect(x, 0, 2, l);
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '0,0,0'},${0.05 + Math.random() * 0.08})`; g.fillRect(x, 0, 1, l * 0.9);
    }
    if (look.grey) for (let x = 0; x < 64; x += 7) { g.fillStyle = 'rgba(200,200,200,0.35)'; g.fillRect(x, 0, 1, 128); }
  });
}

// ---------------------------------------------------------------- visuais
const LOOKS = {
  caio: { skin: '#c48a68', lip: '#6b3a30', iris: '#3a2414', brow: '#1a120c', stubble: 0.12, tired: 0.4, worried: true,
    shirt: '#1a1a1d', print: 'abismo', sleeve: 'listra', pants: '#2b3a58', shoe: '#2c2c31', hair: '#16100c',
    hairStyle: 'emo', headphones: true, watch: true, h: 1 },
  leo: { skin: '#bd8463', lip: '#6b3a30', iris: '#2a1a10', brow: '#1a120c', stubble: 0.22, tired: 0.55, worried: false,
    shirt: '#7a1616', print: 'moletom', sleeve: 'liso', pants: '#2a2f3a', shoe: '#5a5550', hair: '#1b130e',
    hairStyle: 'comprido', glasses: true, hood: true, h: 1.03 },
  mae: { skin: '#c49072', lip: '#7a4040', iris: '#3a2414', brow: '#3a2a20', stubble: 0, tired: 0.35, worried: true,
    shirt: '#8a7a9a', print: '', sleeve: 'liso', pants: '#8a7a9a', shoe: '#c49072', hair: '#3a2a20', grey: true, closed: true,
    hairStyle: 'coque', h: 0.94 },
};

export function buildCharacter(kind = 'caio') {
  const L = LOOKS[kind];
  // ossos
  const bones = {}, list = [];
  for (const [name, parent, p] of SKELETON) {
    const b = new THREE.Bone(); b.name = name;
    const pp = parent ? BIND[parent] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent) bones[parent].add(b);
    bones[name] = b; list.push(b);
  }
  bones.head.rotation.order = 'YXZ'; bones.neck.rotation.order = 'YXZ';
  const bi = Object.fromEntries(list.map((b, i) => [b.name, i]));

  // ---------- corpo deformável
  const M = new Mesher(bi);
  const W = (...e) => e;   // atalho para pesos
  // tronco (camiseta)
  M.loft('shirt', [
    { y: 0.83, rx: 0.168, rz: 0.118, w: W(['hips', 1]) },
    { y: 0.93, rx: 0.163, rz: 0.11, w: W(['hips', 0.7], ['spine', 0.3]) },
    { y: 1.04, rx: 0.152, rz: 0.1, cz: 0.004, w: W(['spine', 1]) },
    { y: 1.15, rx: 0.162, rz: 0.108, cz: 0.008, w: W(['spine', 0.5], ['chest', 0.5]) },
    { y: 1.26, rx: 0.178, rz: 0.118, cz: 0.012, w: W(['chest', 1]) },
    { y: 1.34, rx: 0.178, rz: 0.113, cz: 0.008, w: W(['chest', 1]) },
    { y: 1.395, rx: 0.165, rz: 0.102, cz: 0.002, w: W(['chest', 1]) },
    { y: 1.43, rx: 0.13, rz: 0.086, w: W(['chest', 1]) },
    { y: 1.462, rx: 0.08, rz: 0.064, w: W(['chest', 0.6], ['neck', 0.4]) },
  ], { segs: 14 });
  // quadril (calça) por dentro da camiseta
  M.loft('pelvis', [
    { y: 0.98, rx: 0.142, rz: 0.094, w: W(['hips', 1]) },
    { y: 0.875, rx: 0.155, rz: 0.104, w: W(['hips', 1]) },
    { y: 0.8, rx: 0.15, rz: 0.104, w: W(['hips', 1]) },
    { y: 0.76, rx: 0.1, rz: 0.08, w: W(['hips', 1]) },
  ], { segs: 12, capB: true, v0: 1, v1: 0 });
  // pernas
  for (const s of [1, -1]) {
    const T = s > 0 ? 'thighL' : 'thighR', S = s > 0 ? 'shinL' : 'shinR', F = s > 0 ? 'footL' : 'footR', x = 0.095 * s;
    M.loft('jeans', [
      { y: 0.06, rx: 0.068, rz: 0.074, cx: x, w: W([S, 0.75], [F, 0.25]) },
      { y: 0.13, rx: 0.066, rz: 0.07, cx: x, w: W([S, 1]) },
      { y: 0.27, rx: 0.06, rz: 0.064, cx: x, cz: -0.004, w: W([S, 1]) },
      { y: 0.42, rx: 0.06, rz: 0.066, cx: x, w: W([S, 1]) },
      { y: 0.51, rx: 0.064, rz: 0.068, cx: x, cz: 0.004, w: W([T, 0.5], [S, 0.5]) },
      { y: 0.6, rx: 0.07, rz: 0.075, cx: x, w: W([T, 1]) },
      { y: 0.76, rx: 0.08, rz: 0.086, cx: x * 1.02, w: W([T, 1]) },
      { y: 0.88, rx: 0.088, rz: 0.094, cx: x * 1.05, w: W([T, 0.6], ['hips', 0.4]) },
    ], { segs: 10 });
  }
  // braços: manga longa por baixo + manga curta da camiseta por cima
  for (const s of [1, -1]) {
    const C = s > 0 ? 'clavL' : 'clavR', A = s > 0 ? 'armL' : 'armR', Fo = s > 0 ? 'foreL' : 'foreR', H = s > 0 ? 'handL' : 'handR';
    M.loft('sleeve', [
      { y: 0.935, rx: 0.036, rz: 0.034, cx: 0.194 * s, w: W([Fo, 0.6], [H, 0.4]) },
      { y: 0.97, rx: 0.038, rz: 0.036, cx: 0.193 * s, w: W([Fo, 1]) },
      { y: 1.08, rx: 0.043, rz: 0.045, cx: 0.189 * s, w: W([Fo, 1]) },
      { y: 1.15, rx: 0.045, rz: 0.047, cx: 0.185 * s, w: W([A, 0.5], [Fo, 0.5]) },
      { y: 1.26, rx: 0.048, rz: 0.052, cx: 0.18 * s, w: W([A, 1]) },
      { y: 1.36, rx: 0.052, rz: 0.057, cx: 0.174 * s, w: W([A, 0.85], [C, 0.15]) },
      { y: 1.41, rx: 0.044, rz: 0.05, cx: 0.162 * s, w: W([A, 0.6], [C, 0.4]) },
      { y: 1.43, rx: 0.02, rz: 0.03, cx: 0.148 * s, w: W([C, 1]) },
    ], { segs: 9 });
    if (L.sleeve === 'listra') {
      M.loft('shirt', [
        { y: 1.27, rx: 0.06, rz: 0.064, cx: 0.181 * s, w: W([A, 1]) },
        { y: 1.34, rx: 0.062, rz: 0.067, cx: 0.175 * s, w: W([A, 0.85], [C, 0.15]) },
        { y: 1.395, rx: 0.052, rz: 0.06, cx: 0.163 * s, w: W([A, 0.6], [C, 0.4]) },
        { y: 1.428, rx: 0.026, rz: 0.04, cx: 0.145 * s, w: W([C, 0.7], ['chest', 0.3]) },
      ], { segs: 10, u0: 0.02, u1: 0.12, v0: 0.55, v1: 0.95 });
    }
  }
  // pescoço
  M.loft('skin', [
    { y: 1.44, rx: 0.052, rz: 0.05, w: W(['chest', 1]) },
    { y: 1.5, rx: 0.047, rz: 0.046, cz: 0.004, w: W(['neck', 1]) },
    { y: 1.575, rx: 0.046, rz: 0.048, cz: 0.008, w: W(['neck', 0.3], ['head', 0.7]) },
  ], { segs: 10 });

  const mats = {
    shirt: new THREE.MeshLambertMaterial({ map: shirtTexture(L) }),
    pelvis: new THREE.MeshLambertMaterial({ map: jeansTexture(L, true) }),
    jeans: new THREE.MeshLambertMaterial({ map: jeansTexture(L, false) }),
    sleeve: new THREE.MeshLambertMaterial({ map: sleeveTexture(L) }),
    skin: new THREE.MeshLambertMaterial({ color: L.skin }),
  };
  const order = ['shirt', 'pelvis', 'jeans', 'sleeve', 'skin'];
  const geo = M.geometry(order, true);
  const mesh = new THREE.SkinnedMesh(geo, order.map((k) => mats[k]));
  mesh.add(list[0]);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

  // ---------- partes rígidas presas aos ossos
  const rigid = (bone, build, mat, opts = {}) => {
    const R = new Mesher({ root: 0 });
    build(R);
    const g = R.geometry(['m'], false);
    const b = BIND[bone];
    g.translate(-b[0], -b[1], -b[2]);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = opts.shadow !== false; m.receiveShadow = true;
    bones[bone].add(m);
    return m;
  };
  const face = new THREE.MeshLambertMaterial({ map: faceTexture(L) });
  const skinM = mats.skin;
  // cabeça
  rigid('head', (R) => R.loft('m', [
    { y: 1.565, rx: 0.044, rz: 0.048, cz: 0.022 },
    { y: 1.588, rx: 0.064, rz: 0.074, cz: 0.016 },
    { y: 1.62, rx: 0.074, rz: 0.088, cz: 0.006 },
    { y: 1.66, rx: 0.079, rz: 0.096 },
    { y: 1.70, rx: 0.082, rz: 0.099 },
    { y: 1.74, rx: 0.08, rz: 0.098, cz: -0.002 },
    { y: 1.78, rx: 0.072, rz: 0.09, cz: -0.006 },
    { y: 1.81, rx: 0.056, rz: 0.072, cz: -0.01 },
    { y: 1.835, rx: 0.03, rz: 0.04, cz: -0.012 },
  ], { segs: 16, capA: true, capB: true }), face);
  // nariz e orelhas
  rigid('head', (R) => R.loft('m', [
    { z: 0.08, rx: 0.016, ry: 0.026, cy: 1.67 },
    { z: 0.094, rx: 0.012, ry: 0.016, cy: 1.66 },
    { z: 0.099, rx: 0.006, ry: 0.006, cy: 1.656 },
  ], { segs: 6, capB: true, u0: 0.235, u1: 0.265, v0: 0.42, v1: 0.36 }), face);
  for (const s of [1, -1]) rigid('head', (R) => R.loft('m', [
    { c: [0.074 * s, 1.69, -0.008], a: [0, 0.028, 0], b: [0.004 * s, 0, 0.017] },
    { c: [0.09 * s, 1.692, -0.012], a: [0, 0.026, 0], b: [0, 0, 0.015] },
  ], { segs: 7, capB: true, u0: s > 0 ? 0.0 : 0.5, u1: s > 0 ? 0.03 : 0.53, v0: 0.45, v1: 0.55 }), face);
  // mãos (mitene + polegar)
  for (const s of [1, -1]) {
    const H = s > 0 ? 'handL' : 'handR', x = 0.196 * s;
    rigid(H, (R) => {
      R.loft('m', [
        { y: 0.94, rx: 0.022, rz: 0.032, cx: x },
        { y: 0.9, rx: 0.025, rz: 0.044, cx: x, cz: 0.002 },
        { y: 0.855, rx: 0.021, rz: 0.043, cx: x - 0.002 * s, cz: 0.004 },
        { y: 0.81, rx: 0.018, rz: 0.038, cx: x - 0.005 * s, cz: 0.008 },
        { y: 0.78, rx: 0.013, rz: 0.028, cx: x - 0.008 * s, cz: 0.01 },
      ], { segs: 8, capB: true });
      R.loft('m', [
        { y: 0.915, rx: 0.012, rz: 0.012, cx: x - 0.012 * s, cz: 0.036 },
        { y: 0.88, rx: 0.011, rz: 0.011, cx: x - 0.018 * s, cz: 0.05 },
        { y: 0.855, rx: 0.008, rz: 0.008, cx: x - 0.02 * s, cz: 0.054 },
      ], { segs: 6, capB: true });
    }, skinM);
  }
  // tênis
  const shoeM = new THREE.MeshLambertMaterial({ map: shoeTexture(L) });
  for (const s of [1, -1]) {
    const F = s > 0 ? 'footL' : 'footR', x = 0.096 * s;
    rigid(F, (R) => R.loft('m', [
      { z: -0.07, rx: 0.03, ry: 0.028, cx: x, cy: 0.035 },
      { z: -0.05, rx: 0.04, ry: 0.042, cx: x, cy: 0.045 },
      { z: 0.02, rx: 0.043, ry: 0.04, cx: x, cy: 0.04 },
      { z: 0.1, rx: 0.046, ry: 0.026, cx: x, cy: 0.026 },
      { z: 0.155, rx: 0.038, ry: 0.018, cx: x, cy: 0.019 },
      { z: 0.175, rx: 0.02, ry: 0.011, cx: x, cy: 0.014 },
    ], { segs: 10, capA: true, capB: true }), shoeM);
  }

  // ---------- cabelo
  const hairM = new THREE.MeshLambertMaterial({ map: hairTexture(L, false) });
  const cardM = new THREE.MeshLambertMaterial({ map: hairTexture(L, true), alphaTest: 0.45, side: THREE.DoubleSide });
  const HC = [0, 1.7, 0];
  const capRings = (front) => [
    { y: front ? 1.712 : 1.69, rx: 0.09, rz: 0.113, cz: -0.004, tilt: front ? 0.45 : 0.15, j: 0.08 },
    { y: 1.77, rx: 0.09, rz: 0.108, cz: -0.008, tilt: 0.3, j: 0.2 },
    { y: 1.815, rx: 0.076, rz: 0.094, cz: -0.012, tilt: 0.15, j: 0.24 },
    { y: 1.848, rx: 0.05, rz: 0.064, cz: -0.012, j: 0.2 },
    { y: 1.857, rx: 0.014, rz: 0.02, cz: -0.012 },
  ];
  if (L.hairStyle === 'emo') {
    rigid('head', (R) => R.loft('m', capRings(true), { segs: 16, capB: true }), hairM);
    rigid('head', (R) => {
      // franja emo varrida da direita para cima do olho esquerdo
      R.ribbon('m', [[-0.06, 1.815, 0.06], [-0.032, 1.795, 0.096], [0.0, 1.772, 0.112], [0.03, 1.745, 0.11], [0.056, 1.718, 0.1], [0.07, 1.69, 0.088]], [0.075, 0.08, 0.072, 0.06, 0.042, 0.02], HC, [['root', 1]]);
      R.ribbon('m', [[-0.075, 1.8, 0.035], [-0.05, 1.79, 0.08], [-0.02, 1.765, 0.105], [0.012, 1.735, 0.112], [0.035, 1.71, 0.106]], [0.05, 0.06, 0.055, 0.04, 0.02], HC, [['root', 1]]);
      // mechas laterais e da nuca
      for (const s of [1, -1]) R.ribbon('m', [[0.08 * s, 1.77, 0.02], [0.092 * s, 1.73, 0.03], [0.094 * s, 1.69, 0.035], [0.09 * s, 1.655, 0.03]], [0.05, 0.05, 0.04, 0.02], HC, [['root', 1]]);
      for (const x of [-0.06, -0.025, 0.012, 0.048]) R.ribbon('m', [[x, 1.8, -0.085], [x * 1.05, 1.74, -0.108], [x * 1.1, 1.68, -0.108], [x * 1.12, 1.625, -0.098]], [0.05, 0.05, 0.045, 0.02], HC, [['root', 1]]);
      for (let i = 0; i < 9; i++) { const a = 0.2 + i * 0.36, x = Math.cos(a) * 0.065, z = -Math.sin(a) * 0.055 - 0.005; R.ribbon('m', [[x * 0.3, 1.862, z * 0.3], [x, 1.86, z], [x * 1.45, 1.835, z * 1.6], [x * 1.6, 1.8, z * 1.8]], [0.045, 0.05, 0.035, 0.01], HC, [['root', 1]]); }  // topo arrepiado
    }, cardM);
  } else if (L.hairStyle === 'comprido') {
    rigid('head', (R) => R.loft('m', capRings(true), { segs: 16, capB: true }), hairM);
    rigid('head', (R) => {
      for (const s of [1, -1]) {
        R.ribbon('m', [[0.02 * s, 1.85, 0.06], [0.07 * s, 1.8, 0.09], [0.093 * s, 1.72, 0.07], [0.096 * s, 1.64, 0.055], [0.09 * s, 1.585, 0.05]], [0.06, 0.07, 0.08, 0.07, 0.04], HC, [['root', 1]]);
        R.ribbon('m', [[0.06 * s, 1.83, -0.05], [0.095 * s, 1.75, -0.06], [0.1 * s, 1.66, -0.07], [0.095 * s, 1.57, -0.06]], [0.07, 0.08, 0.08, 0.04], HC, [['root', 1]]);
      }
      for (const x of [-0.05, 0, 0.05]) R.ribbon('m', [[x, 1.81, -0.09], [x, 1.72, -0.112], [x * 1.1, 1.63, -0.105], [x * 1.1, 1.56, -0.085]], [0.07, 0.07, 0.06, 0.03], HC, [['root', 1]]);
    }, cardM);
  } else if (L.hairStyle === 'coque') {
    rigid('head', (R) => R.loft('m', capRings(false), { segs: 16, capB: true }), hairM);
    rigid('head', (R) => R.loft('m', [
      { c: [0, 1.79, -0.1], a: [0.045, 0, 0], b: [0, 0.045, 0] },
      { c: [0, 1.80, -0.14], a: [0.05, 0, 0], b: [0, 0.05, 0] },
      { c: [0, 1.81, -0.17], a: [0.03, 0, 0], b: [0, 0.03, 0] },
    ], { segs: 10, capB: true }), hairM);
  }

  // ---------- acessórios
  const dark = new THREE.MeshLambertMaterial({ color: 0x18181a });
  let phones = null;
  if (L.headphones) {
    // fone grande de PC pendurado no pescoço
    phones = rigid('chest', (R) => {
      const pts = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 + i / 10); pts.push([Math.cos(a) * 0.09, 1.478 - Math.sin(a) * 0.01, Math.sin(a) * 0.08 + 0.012]); }
      R.ribbon('m', pts, pts.map(() => 0.024), [0, 1.3, 0.02], [['root', 1]]);
      for (const s of [1, -1]) R.loft('m', [
        { c: [0.078 * s, 1.462, 0.026], a: [0, 0.036, 0], b: [0, 0, 0.032] },
        { c: [0.104 * s, 1.462, 0.026], a: [0, 0.036, 0], b: [0, 0, 0.032] },
      ], { segs: 10, capA: true, capB: true });
    }, new THREE.MeshLambertMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide }));
  }
  if (L.watch) rigid('foreL', (R) => R.loft('m', [{ y: 0.95, rx: 0.041, rz: 0.039, cx: 0.193 }, { y: 0.97, rx: 0.041, rz: 0.039, cx: 0.193 }], { segs: 10 }), dark);
  if (L.glasses) {
    rigid('head', (R) => {
      for (const s of [1, -1]) R.ribbon('m', [[0.012 * s, 1.715, 0.104], [0.035 * s, 1.722, 0.104], [0.058 * s, 1.712, 0.094], [0.052 * s, 1.692, 0.098], [0.022 * s, 1.69, 0.104], [0.012 * s, 1.705, 0.105]], new Array(6).fill(0.006), HC, [['root', 1]]);
      R.ribbon('m', [[-0.012, 1.712, 0.106], [0, 1.716, 0.11], [0.012, 1.712, 0.106]], [0.006, 0.006, 0.006], HC, [['root', 1]]);
      for (const s of [1, -1]) R.ribbon('m', [[0.06 * s, 1.712, 0.09], [0.083 * s, 1.712, 0.04], [0.088 * s, 1.705, -0.02]], [0.005, 0.005, 0.005], HC, [['root', 1]]);
    }, new THREE.MeshLambertMaterial({ color: 0x0c0c0c, side: THREE.DoubleSide }), { shadow: false });
  }
  if (L.hood) {
    rigid('chest', (R) => R.loft('m', [
      { y: 1.43, rx: 0.13, rz: 0.1, cz: -0.015 },
      { y: 1.475, rx: 0.12, rz: 0.11, cz: -0.035 },
      { y: 1.51, rx: 0.095, rz: 0.09, cz: -0.06 },
      { y: 1.525, rx: 0.06, rz: 0.06, cz: -0.075 },
    ], { segs: 10, t0: Math.PI * 0.92, t1: Math.PI * 2.08 }), new THREE.MeshLambertMaterial({ color: L.shirt, side: THREE.DoubleSide }));
  }

  for (const c of bones.head.children) if (c.isMesh) { c.scale.setScalar(1.08); c.position.y = -0.012; }
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar(L.h);
  // dormindo: olhos fechados e sem o fone no pescoço
  const openMap = face.map;
  let closedMap = null, asleep = false;
  const setAsleep = (on) => {
    if (on === asleep) return;
    asleep = on;
    if (on && !closedMap) closedMap = faceTexture({ ...L, closed: true });
    face.map = on ? closedMap : openMap;
    if (phones) phones.visible = !on;
  };
  return { root, mesh, bones, kind, setAsleep };
}

// aplica um dicionário de pose (ângulos em radianos) aos ossos
export function applyPose(B, p) {
  B.hips.position.set(p.hipsX || 0, p.hipsY, p.hipsZ || 0);
  B.hips.rotation.set(p.hipsRX || 0, p.hipsRY || 0, p.hipsRZ || 0);
  B.spine.rotation.set(p.torsoX * 0.45 + (p.breath || 0) * 0.3, p.torsoY * 0.4, (p.torsoZ || 0) * 0.5);
  B.chest.rotation.set(p.torsoX * 0.55 - (p.breath || 0) * 0.5, p.torsoY * 0.6, (p.torsoZ || 0) * 0.5);
  B.neck.rotation.set(p.headX * 0.35, p.headY * 0.35, 0);
  B.head.rotation.set(p.headX * 0.65, p.headY * 0.65, p.headZ || 0);
  B.clavL.rotation.set(0, 0, p.shrug || 0); B.clavR.rotation.set(0, 0, -(p.shrug || 0));
  B.armL.rotation.set(p.shLx, p.shLy || 0, p.shLz); B.armR.rotation.set(p.shRx, p.shRy || 0, p.shRz);
  B.foreL.rotation.set(p.elL, p.foreLy || 0, 0); B.foreR.rotation.set(p.elR, p.foreRy || 0, 0);
  B.handL.rotation.set(p.wrL || 0, 0, 0); B.handR.rotation.set(p.wrR || 0, 0, 0);
  B.thighL.rotation.set(p.hipLx, 0, p.hipLz); B.thighR.rotation.set(p.hipRx, 0, p.hipRz);
  B.shinL.rotation.x = p.knL; B.shinR.rotation.x = p.knR;
  B.footL.rotation.x = p.ftL || 0; B.footR.rotation.x = p.ftR || 0;
}
