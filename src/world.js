// O quarto do Caio (e o corredor), móveis, luzes, chuva, a Figura, objetos interativos e colisão.
// Unidades em metros. Quarto: x de -2 a 2, z de -1.75 (janela) a 1.75 (porta), altura 2.6.
import * as THREE from 'three';
import { T, GEN, makeTex } from './textures.js';
import { G, damp, clockStr } from './state.js';
import { audio } from './audio.js';
import { buildCharacter, applyPose } from './character.js';

const H = 2.6;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// UV em coordenadas do mundo (texturas contínuas entre peças)
function worldUV(geo, pos, density = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + pos.x, y = p.getY(i) + pos.y, z = p.getZ(i) + pos.z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x * density, z * density);
    else if (ax > 0.5) uv.setXY(i, z * density, y * density);
    else uv.setXY(i, x * density, y * density);
  }
  uv.needsUpdate = true;
  return geo;
}
// UV de caixa escalado pelo tamanho (repete a cada 1/density metros)
function boxGeo(w, h, d, density = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (density) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * density, uv.getY(i) * dims[f][1] * density); }
  }
  return g;
}
const lam = (o = {}) => new THREE.MeshLambertMaterial(o);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.items = {};          // objetos interativos
    this.enabled = new Set();
    this.obstacles = [];      // retângulos [x0,z0,x1,z1] bloqueados
    this.walkable = [];       // áreas andáveis
    this.flash = 0;           // relâmpago
    this.flashT = 8;
    this.lightningOn = true;
    this.mode = 'noite'; this.dawn = 0;
    this.dynLights = [];
    this.streetFlicker = 0;
    this.lampOn = true; this.lampFlicker = 0;
    this.hallLightOn = true;
    this.power = true;
    this.doorAngle = 0; this.doorTarget = 0;
    this.trayOut = 0; this.trayTarget = 0;
    this.figureMode = 'hidden'; // hidden | always | camera
    this.decor = 'caio';
    this.mats = {};
    this.build();
  }

  add(mesh, parent = this.scene, cast = true, recv = true) {
    mesh.castShadow = cast; mesh.receiveShadow = recv;
    parent.add(mesh);
    return mesh;
  }
  box(w, h, d, mat, x, y, z, parent, density = 0) {
    const m = new THREE.Mesh(boxGeo(w, h, d, density), mat);
    m.position.set(x, y, z);
    return this.add(m, parent);
  }
  wall(x0, x1, y0, y1, z0, z1, mat, density = 1, parent) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const pos = V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const geo = worldUV(new THREE.BoxGeometry(w, h, d), pos, density);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    return this.add(m, parent, true, true);
  }
  dyn(light, x, y, z, cond) { light.position.set(x, y, z); light.userData.base = light.intensity; light.intensity = 0; this.scene.add(light); this.dynLights.push({ light, cond }); return light; }
  item(id, x, y, z, r, label) { this.items[id] = { id, pos: V(x, y, z), r, label }; }

  // ======================================================================== construção
  build() {
    const s = this.scene;
    const M = this.mats;
    M.parede = lam({ map: T.parede });
    M.piso = lam({ map: T.piso });
    M.teto = lam({ map: T.teto });
    M.madeira = lam({ map: T.madeira });
    M.madeiraEsc = lam({ map: T.madeira, color: 0x7a5a42 });
    M.mdf = lam({ map: T.madeira, color: 0xf0e2c8 });
    M.plastico = lam({ map: T.plastico });
    M.plasticoAm = lam({ map: T.plastico, color: 0xf2e2b0 });
    M.preto = lam({ color: 0x1c1c1e });
    M.cinza = lam({ color: 0x5a5a5e });
    M.branco = lam({ color: 0xd8d4c8 });
    M.rodape = lam({ map: T.madeira, color: 0x6a4a32 });

    this.room = new THREE.Group(); s.add(this.room);
    const R = this.room;

    // ---------------- piso, teto, paredes
    const floor = new THREE.Mesh(worldUV(new THREE.BoxGeometry(4.2, 0.1, 3.7), V(0, -0.05, 0), 1), M.piso);
    floor.position.set(0, -0.05, 0); this.add(floor, R, false, true);
    const cg = new THREE.PlaneGeometry(4, 3.5); { const u = cg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i) * 1.75); }
    const ceil = new THREE.Mesh(cg, M.teto);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, 0); this.add(ceil, R, false, true);
    // oeste / leste
    this.wall(-2.1, -2.0, 0, H, -1.85, 1.85, M.parede, 1, R);
    this.wall(2.0, 2.1, 0, H, -1.85, 1.85, M.parede, 1, R);
    // norte com janela (x 0.25..1.35, y 0.95..2.1)
    this.wall(-2.1, 0.25, 0, H, -1.85, -1.75, M.parede, 1, R);
    this.wall(1.35, 2.1, 0, H, -1.85, -1.75, M.parede, 1, R);
    this.wall(0.25, 1.35, 0, 0.95, -1.85, -1.75, M.parede, 1, R);
    this.wall(0.25, 1.35, 2.1, H, -1.85, -1.75, M.parede, 1, R);
    // sul com porta (x 0.4..1.2, y 0..2.1)
    this.wall(-2.1, 0.4, 0, H, 1.75, 1.85, M.parede, 1, R);
    this.wall(1.2, 2.1, 0, H, 1.75, 1.85, M.parede, 1, R);
    this.wall(0.4, 1.2, 2.1, H, 1.75, 1.85, M.parede, 1, R);
    // rodapé
    const rb = (x0, x1, z0, z1) => this.wall(x0, x1, 0, 0.08, z0, z1, M.rodape, 2, R);
    rb(-2.0, -2.0 + 0.015, -1.75, 1.75); rb(2.0 - 0.015, 2.0, -1.75, 1.75);
    rb(-2.0, 2.0, -1.75, -1.735); rb(-2.0, 0.4, 1.735, 1.75); rb(1.2, 2.0, 1.735, 1.75);

    this.buildWindow(R);
    this.buildExterior();
    this.buildDesk(R);
    this.buildBed(R);
    this.buildFurniture(R);
    this.buildDoor(R);
    this.buildLights();
    this.buildHallway();
    this.buildFigure();
    this.buildCable();
    this.buildAtmosphere(R);
    this.buildDecals(R);
    this.buildMomRoom();
    this.buildFan();
    this.buildPages();
    this.buildDigicam();

    // ---------------- interativos
    this.item('pc', -1.0, 0.9, -1.05, 0.95, 'Computador');
    this.item('relogio', -1.77, 0.55, -1.45, 0.75, 'Rádio-relógio');
    this.item('cama', -1.5, 0.5, 0.3, 0.85, 'Cama');
    this.item('janela', 0.8, 1.3, -1.6, 0.95, 'Janela');
    this.item('guardaroupa', 1.4, 1.0, -0.2, 0.75, 'Guarda-roupa');
    this.item('poster', -1.95, 1.55, 0.2, 1.25, 'Pôster');
    this.item('calendario', -1.3, 1.5, -1.74, 0.75, 'Calendário');
    this.item('mural', -0.6, 1.45, -1.74, 0.7, 'Mural de fotos');
    this.item('cds', -0.1, 0.6, -1.55, 0.7, 'Torre de CDs');
    this.item('cds_chao', 0.05, 0.05, -1.05, 0.75, 'CDs no chão');
    this.item('telefone', 0.2, 0.1, -1.5, 0.7, 'Telefone');
    this.item('porta', 0.8, 1.0, 1.7, 0.75, 'Porta');
    this.item('violao', -0.45, 0.6, 1.6, 0.7, 'Violão');
    this.item('canto', 1.75, 1.2, 1.5, 0.7, 'Canto do quarto');
    this.item('mochila', -0.95, 0.2, 1.45, 0.65, 'Mochila');
    this.item('estante', 1.78, 0.8, -1.55, 0.7, 'Estante');
    this.item('poster2', -1.0, 1.55, 1.74, 0.8, 'Pôster');
    this.item('cadeira', -1.0, 0.6, -0.65, 0.8, 'Cadeira');
    // corredor
    this.item('mesinha', -0.3, 0.8, 3.1, 0.8, 'Mesinha do telefone');
    this.item('foto1', -1.6, 1.5, 2.0, 0.8, 'Quadro');
    this.item('foto2', -4.4, 1.5, 2.0, 0.8, 'Quadro');
    this.item('foto3', -7.4, 1.5, 2.0, 0.8, 'Quadro');
    this.item('porta_mae', 2.0, 1.0, 2.65, 0.8, 'Quarto da mãe');
    this.item('banheiro', -3.25, 1.0, 3.3, 0.8, 'Banheiro');
    this.item('porta_leo', -4.6, 1.0, 2.65, 0.9, 'Quarto do Léo');
    this.item('arco', -1.9, 1.0, 3.3, 0.6, 'Sala');
    // sala e cozinha
    this.item('tv', 1.45, 0.85, 4.8, 0.95, 'Televisão');
    this.item('telefone_sala', -0.55, 0.6, 3.75, 0.75, 'Telefone da sala');
    this.item('sofa', -0.45, 0.5, 5.1, 0.85, 'Sofá');
    this.item('cristaleira', -2.15, 1.0, 4.6, 0.8, 'Cristaleira');
    this.item('quadro_ceia', 0.4, 1.6, 3.5, 0.9, 'Quadro');
    this.item('geladeira', 1.62, 1.1, 7.55, 0.85, 'Geladeira');
    this.item('fogao', 0.62, 0.9, 7.65, 0.7, 'Fogão');
    this.item('filtro', -0.35, 1.1, 7.7, 0.7, 'Filtro de barro');
    this.item('mesa_cozinha', -1.1, 0.8, 6.9, 0.95, 'Mesa da cozinha');
    this.item('relogio_parede', -2.5, 1.9, 6.9, 0.9, 'Relógio de parede');
    this.item('janela_cozinha', -1.4, 1.5, 7.7, 0.7, 'Janela');
    this.item('microondas', -2.2, 1.05, 7.75, 0.7, 'Micro-ondas');
    // prólogo (quarto do Léo, dezembro de 2003)
    this.item('ventilador', 1.15, 0.9, 1.2, 0.75, 'Ventilador');
    this.item('camera_digital', -0.3, 0.8, -1.2, 0.65, 'Câmera digital');

    // ---------------- colisão
    this.walkable = [[-2.0, -1.75, 2.0, 1.75]];
    this.obstacles = [
      { r: [-1.56, -1.75, -0.24, -0.92], on: true },               // mesa
      { r: [-1.28, -0.98, -0.72, -0.44], on: true, id: 'cadeira' }, // cadeira
      { r: [-2.0, -0.95, -1.06, 1.15], on: true },                 // cama
      { r: [-2.0, -1.75, -1.56, -1.34], on: true },                // criado-mudo
      { r: [1.4, -0.92, 2.0, 0.52], on: true },                    // guarda-roupa
      { r: [1.55, -1.75, 2.0, -1.33], on: true },                  // estante
      { r: [-0.2, -1.75, 0.0, -1.48], on: true },                  // torre de CDs
      { r: [-0.62, 1.43, -0.3, 1.75], on: true },                  // violão
      { r: [-0.5, 2.9, -0.1, 3.35], on: true, hall: true },        // mesinha do corredor
      { r: [-0.98, 4.1, -0.12, 6.1], on: true, sala: true },       // sofá
      { r: [-0.75, 3.55, -0.35, 3.95], on: true, sala: true },     // mesinha do telefone da sala
      { r: [0.3, 4.5, 0.8, 5.4], on: true, sala: true },           // mesinha de centro
      { r: [1.6, 4.25, 2.1, 5.35], on: true, sala: true },         // rack + TV
      { r: [-2.6, 4.1, -2.17, 5.1], on: true, sala: true },        // cristaleira
      { r: [-2.6, 7.7, 0.0, 8.3], on: true, sala: true },          // balcão
      { r: [0.34, 7.7, 0.9, 8.3], on: true, sala: true },          // fogão
      { r: [1.3, 7.62, 2.1, 8.3], on: true, sala: true },          // geladeira
      { r: [-1.75, 6.45, -0.45, 7.35], on: true, sala: true },     // mesa e cadeiras
      { r: [-1.14, 1.3, -0.76, 1.75], on: true, id: 'mochila' },   // mochila
    ];
  }

  buildWindow(R) {
    const frame = lam({ color: 0x5f7488 });
    const x0 = 0.25, x1 = 1.35, y0 = 0.95, y1 = 2.1, zc = -1.8;
    // batente
    this.box(1.1, 0.05, 0.14, frame, 0.8, y0 + 0.025, zc, R);
    this.box(1.1, 0.05, 0.14, frame, 0.8, y1 - 0.025, zc, R);
    this.box(0.05, 1.15, 0.14, frame, x0 + 0.025, 1.525, zc, R);
    this.box(0.05, 1.15, 0.14, frame, x1 - 0.025, 1.525, zc, R);
    this.box(0.035, 1.1, 0.06, frame, 0.8, 1.525, zc, R);
    this.box(1.0, 0.035, 0.06, frame, 0.8, 1.72, zc, R);
    // peitoril
    this.box(1.2, 0.03, 0.2, lam({ color: 0xb8b2a4 }), 0.8, y0, -1.7, R);
    // vidro
    const glass = new THREE.MeshPhongMaterial({ color: 0x223040, transparent: true, opacity: 0.08, shininess: 90, specular: 0x445566, depthWrite: false });
    const gm = this.windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), glass); gm.position.set(0.8, 1.525, zc - 0.01); this.add(gm, R, false, false);
    // grade (lado de fora) — projeta sombras listradas no chão
    const bar = lam({ color: 0x1e1e1e });
    for (let i = 0; i < 8; i++) this.box(0.014, 1.12, 0.014, bar, 0.33 + i * 0.135, 1.525, -1.9, R);
    for (const y of [1.15, 1.6, 2.02]) this.box(1.08, 0.014, 0.014, bar, 0.8, y, -1.9, R);
    // varão e cortinas
    this.box(1.5, 0.02, 0.02, lam({ color: 0x777777 }), 0.8, 2.2, -1.68, R);
    const curtMat = lam({ map: T.cortina, side: THREE.DoubleSide });
    const curt = (cx, w) => {
      const g = new THREE.PlaneGeometry(w, 1.42, 14, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 40) * 0.025);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, curtMat); m.position.set(cx, 1.48, -1.67);
      return this.add(m, R, true, true);
    };
    this.curtL = curt(0.2, 0.42); this.curtR = curt(1.42, 0.36);
  }

  buildExterior() {
    const s = this.scene;
    const ext = this.exterior = new THREE.Group(); s.add(ext);
    // quintal e rua molhados
    const wet = new THREE.MeshPhongMaterial({ color: 0x45464a, shininess: 60, specular: 0x505860 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), wet); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.15, -11.9); this.add(ground, ext, false, true);
    // muro baixo
    const muro = lam({ map: T.muro });
    const mg = new THREE.Mesh(worldUV(new THREE.BoxGeometry(14, 1.35, 0.18), V(0, 0.55, -4.2), 1), muro); mg.position.set(0, 0.55, -4.2); this.add(mg, ext);
    // casas do outro lado da rua
    const casa = lam({ map: T.muro, color: 0x8a8070 });
    this.wall(-8, -1.5, -0.15, 3.2, -12.5, -12.0, casa, 0.6, ext);
    this.wall(-1.5, 6, -0.15, 4.2, -13.5, -13.0, casa, 0.6, ext);
    const winLit = new THREE.MeshBasicMaterial({ color: 0x3a3424 });
    this.box(0.8, 0.9, 0.02, winLit, -4, 1.8, -11.98, ext);
    this.box(0.6, 0.7, 0.02, new THREE.MeshBasicMaterial({ color: 0x12161a }), 2.5, 2.6, -12.98, ext);
    // céu
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0x0a0e14, fog: false });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), this.skyMat); sky.position.set(0, 10, -30); ext.add(sky);
    // poste
    const poste = lam({ color: 0x4a4a48 });
    this.box(0.16, 4.2, 0.16, poste, 2.4, 1.95, -5.4, ext);
    this.box(0.07, 0.07, 1.05, poste, 2.4, 4.0, -4.9, ext); this.box(0.5, 0.07, 0.07, poste, 2.15, 4.0, -4.4, ext);
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    this.box(0.3, 0.09, 0.2, this.lampHeadMat, 1.9, 3.96, -4.4, ext);
    // halo do poste
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hg = hc.getContext('2d'); const gr = hg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,190,110,0.9)'); gr.addColorStop(0.3, 'rgba(255,150,60,0.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    hg.fillStyle = gr; hg.fillRect(0, 0, 64, 64);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.scale.set(2.2, 2.2, 1); this.halo.position.set(1.9, 3.88, -4.4); ext.add(this.halo);
    // segundo poste, do outro lado da rua: ilumina o fundo para que silhuetas apareçam na janela
    this.box(0.14, 5.0, 0.14, poste, -2.6, 2.35, -10.6, ext);
    this.box(0.3, 0.09, 0.2, this.lampHeadMat, -2.6, 4.82, -10.3, ext);
    this.halo2 = this.halo.clone(); this.halo2.material = this.halo.material; this.halo2.position.set(-2.6, 4.75, -10.3); this.halo2.scale.set(3, 3, 1); ext.add(this.halo2);
    this.farLight = new THREE.PointLight(0xff9a48, 26, 16, 1.6); this.farLight.position.set(-2.6, 4.5, -10.0); ext.add(this.farLight);
    // chuva
    const N = 520, pos = new Float32Array(N * 6);
    this.rainData = [];
    for (let i = 0; i < N; i++) {
      const x = -4 + Math.random() * 10, y = Math.random() * 7, z = -2.1 - Math.random() * 9;
      this.rainData.push([x, y, z]);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8796a8, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    ext.add(this.rain);
  }

  buildDesk(R) {
    const M = this.mats;
    const dg = this.desk = new THREE.Group(); R.add(dg);
    this.box(1.32, 0.025, 0.62, M.mdf, -0.9, 0.74, -1.44, dg, 2);
    this.box(0.025, 0.73, 0.6, M.mdf, -1.545, 0.365, -1.45, dg, 2);
    this.box(0.025, 0.73, 0.6, M.mdf, -0.255, 0.365, -1.45, dg, 2);
    this.box(1.27, 0.42, 0.015, M.mdf, -0.9, 0.48, -1.735, dg, 2);
    this.box(0.8, 0.018, 0.34, M.mdf, -0.95, 0.65, -1.1, dg, 2);           // gaveta do teclado
    this.box(0.025, 0.04, 0.5, M.cinza, -1.34, 0.67, -1.25, dg);
    this.box(0.025, 0.04, 0.5, M.cinza, -0.56, 0.67, -1.25, dg);

    // ---------------- monitor CRT
    const mon = this.monitor = new THREE.Group(); mon.position.set(-0.95, 0.753, -1.45); dg.add(mon);
    const plast = M.plasticoAm;
    this.box(0.24, 0.03, 0.22, plast, 0, 0.015, 0.0, mon);                 // base
    this.box(0.08, 0.04, 0.08, plast, 0, 0.045, 0.0, mon);
    this.box(0.37, 0.345, 0.05, plast, 0, 0.235, 0.17, mon);              // moldura frontal
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.245, 0.3, 4, 1), plast);
    back.rotation.x = -Math.PI / 2; back.rotation.y = Math.PI / 4; back.position.set(0, 0.225, -0.005);
    this.add(back, mon);
    // tela curva
    const sg = new THREE.PlaneGeometry(0.296, 0.222, 12, 9);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / 0.148, y = sp.getY(i) / 0.111; sp.setZ(i, 0.012 * (1 - x * x * 0.6) * (1 - y * y * 0.6)); }
    sg.computeVertexNormals();
    this.screen = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x050505 }));
    this.screen.position.set(0, 0.245, 0.196);
    mon.add(this.screen);
    this.ledMon = new THREE.MeshBasicMaterial({ color: 0x113311 });
    this.box(0.012, 0.008, 0.005, this.ledMon, 0.15, 0.08, 0.196, mon);
    this.box(0.08, 0.012, 0.004, M.cinza, 0, 0.083, 0.196, mon);
    // post-it no monitor
    const pc = document.createElement('canvas'); pc.width = 64; pc.height = 64; const pg = pc.getContext('2d');
    pg.fillStyle = '#f2e96a'; pg.fillRect(0, 0, 64, 64); pg.fillStyle = '#123'; pg.font = 'bold 9px "Comic Sans MS", Arial';
    pg.fillText('linhalivre', 5, 16); pg.fillText('caio_m', 5, 30); pg.fillText('NÃO esquecer', 5, 46); pg.fillText('de desligar!', 5, 58);
    const post = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.055), lam({ map: new THREE.CanvasTexture(pc) }));
    post.position.set(-0.155, 0.37, 0.197); post.rotation.z = 0.12; mon.add(post);
    // webcam bolinha em cima do monitor
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.branco); cam.position.set(0.02, 0.44, 0.13); this.add(cam, mon);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), M.preto); lens.rotation.x = Math.PI / 2; lens.position.set(0.02, 0.44, 0.16); mon.add(lens);
    this.camLedMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    this.box(0.006, 0.006, 0.004, this.camLedMat, 0.045, 0.43, 0.155, mon);

    // ---------------- gabinete
    const tw = this.tower = new THREE.Group(); tw.position.set(-0.45, 0.753, -1.5); dg.add(tw);
    this.box(0.19, 0.42, 0.42, plast, 0, 0.21, 0, tw, 0);
    const bay = lam({ color: 0xc8b88e });
    this.tray = this.box(0.15, 0.04, 0.02, bay, 0, 0.36, 0.205, tw);
    this.box(0.15, 0.04, 0.012, bay, 0, 0.31, 0.21, tw);
    this.box(0.1, 0.025, 0.012, bay, 0, 0.255, 0.21, tw);
    this.box(0.07, 0.004, 0.003, M.preto, 0, 0.255, 0.217, tw);
    this.box(0.03, 0.03, 0.012, bay, 0, 0.12, 0.21, tw);
    this.ledPow = new THREE.MeshBasicMaterial({ color: 0x113311 });
    this.ledHdd = new THREE.MeshBasicMaterial({ color: 0x221100 });
    this.box(0.01, 0.006, 0.004, this.ledPow, -0.03, 0.17, 0.212, tw);
    this.box(0.01, 0.006, 0.004, this.ledHdd, 0.03, 0.17, 0.212, tw);
    // bandeja do CD com o disco
    this.cdDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.002, 20), lam({ map: T.cd_leo }));
    this.cdDisc.position.set(0, 0.025, 0); this.cdDisc.visible = false; this.tray.add(this.cdDisc);

    // ---------------- periféricos
    const kb = new THREE.Mesh(boxGeo(0.45, 0.025, 0.16), [plast, plast, lam({ map: T.teclado }), plast, plast, plast]);
    kb.position.set(-0.98, 0.672, -1.08); this.add(kb, dg);
    this.box(0.24, 0.003, 0.2, lam({ color: 0x1d2a55 }), -0.6, 0.661, -1.08, dg);
    const mouse = this.box(0.055, 0.03, 0.095, plast, -0.6, 0.675, -1.07, dg);
    mouse.scale.set(1, 1, 1);
    this.box(0.085, 0.15, 0.09, M.preto, -1.22, 0.828, -1.4, dg);
    this.box(0.085, 0.15, 0.09, M.preto, -0.68, 0.828, -1.4, dg);
    for (const x of [-1.22, -0.68]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), M.cinza); c.position.set(x, 0.83, -1.354); dg.add(c); }
    // luminária
    const lampG = this.lamp = new THREE.Group(); lampG.position.set(-1.43, 0.753, -1.58); dg.add(lampG);
    this.box(0.12, 0.02, 0.12, M.preto, 0, 0.01, 0, lampG);
    const arm1 = this.box(0.015, 0.32, 0.015, M.preto, 0, 0.17, 0.04, lampG); arm1.rotation.x = 0.25;
    const arm2 = this.box(0.015, 0.25, 0.015, M.preto, 0, 0.38, 0.17, lampG); arm2.rotation.x = 1.0;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10, 1, true), lam({ color: 0x223322, side: THREE.DoubleSide }));
    shade.position.set(0, 0.4, 0.3); shade.rotation.x = -0.6; this.add(shade, lampG);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), this.bulbMat); bulb.position.set(0, 0.37, 0.31); lampG.add(bulb);
    // tubo de CDs
    const sp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 16), new THREE.MeshPhongMaterial({ color: 0xc8d0e0, transparent: true, opacity: 0.55, shininess: 80 }));
    sp2.position.set(-1.43, 0.82, -1.28); this.add(sp2, dg, false, true);
  }

  buildBed(R) {
    const M = this.mats;
    const bed = this.bed = new THREE.Group(); R.add(bed);
    this.box(0.94, 0.22, 2.04, M.madeiraEsc, -1.53, 0.17, 0.1, bed, 2);
    this.box(0.94, 0.8, 0.05, M.madeiraEsc, -1.53, 0.45, -0.93, bed, 2);
    this.box(0.94, 0.42, 0.05, M.madeiraEsc, -1.53, 0.3, 1.13, bed, 2);
    this.box(0.88, 0.18, 1.96, lam({ map: T.lencol }), -1.53, 0.37, 0.1, bed, 2);
    // cobertor amassado
    const bg = new THREE.BoxGeometry(0.98, 0.2, 1.42, 10, 2, 14);
    const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setY(i, y + Math.sin(x * 9 + z * 5) * 0.012 + Math.sin(z * 13) * 0.01 + (y > 0 ? 0.01 * Math.sin(x * 20 + z * 3) : 0));
      if (y < 0) p.setX(i, x * 1.03);
    }
    bg.computeVertexNormals();
    const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2.5);
    this.blanketMat = lam({ map: T.cobertor, side: THREE.DoubleSide });
    const bl = this.blanket = new THREE.Mesh(bg, this.blanketMat); bl.position.set(-1.53, 0.4, 0.38); this.add(bl, bed);
    this.sheetMat = lam({ map: T.lencol, color: 0xe8e4dc, side: THREE.DoubleSide });
    // travesseiro
    const pg = new THREE.BoxGeometry(0.6, 0.12, 0.34, 6, 2, 4);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) / 0.3, z = pp.getZ(i) / 0.17; pp.setY(i, pp.getY(i) * (1 - 0.6 * x * x) * (1 - 0.5 * z * z)); }
    pg.computeVertexNormals();
    const pil = new THREE.Mesh(pg, lam({ map: T.lencol, color: 0xe8e4dc })); pil.position.set(-1.53, 0.5, -0.68); pil.rotation.y = 0.06; this.add(pil, bed);
    // roupas jogadas em cima da cama (quando ele deita, vão para o chão ao lado): [x, y, z, giro]
    this.clothes = new THREE.Group(); bed.add(this.clothes);
    const jeans = this.cloth('calca', 0x34496a, 0.36, 0.46, 0.045, 7);
    jeans.userData = { bed: [-1.36, 0.505, 0.8, 0.5], floor: [-0.86, 0.004, 0.86, 1.25] };
    const shirt = this.cloth('camiseta', 0x7a2020, 0.44, 0.4, 0.04, 19);
    shirt.userData = { bed: [-1.7, 0.505, 0.62, -0.35], floor: [-0.9, 0.004, 0.48, -0.6] };
    for (const c of [jeans, shirt]) { const s = c.userData.bed; c.position.set(s[0], s[1], s[2]); c.rotation.y = s[3]; this.clothes.add(c); }
    // moletom do Léo (aparece no quarto dele)
    this.hoodie = new THREE.Group(); R.add(this.hoodie); this.hoodie.visible = false;
  }

  // roupa largada: recorte da peça (alpha) sobre uma grade amassada que encosta na superfície pelas bordas
  cloth(kind, color, w, d, h, seed) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    let s = seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const col = new THREE.Color(color), css = (k) => `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`;
    g.fillStyle = css(1); g.beginPath();
    if (kind === 'camiseta') {
      // gola, mangas abertas, barra torta
      g.moveTo(44, 12); g.quadraticCurveTo(64, 30, 86, 12); g.lineTo(122, 30); g.lineTo(112, 58); g.lineTo(94, 50);
      g.lineTo(100, 118); g.quadraticCurveTo(62, 126, 26, 114); g.lineTo(34, 50); g.lineTo(16, 62); g.lineTo(5, 32);
    } else {
      // calça: cós em cima, as duas pernas abertas para baixo
      g.moveTo(26, 4); g.lineTo(102, 4); g.lineTo(110, 50); g.lineTo(116, 124); g.lineTo(76, 124); g.lineTo(64, 52);
      g.lineTo(52, 124); g.lineTo(12, 122); g.lineTo(18, 50);
    }
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? css(1.25) : css(0.7); g.globalAlpha = 0.25; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1); }
    g.globalAlpha = 1; g.lineWidth = 2;
    if (kind === 'camiseta') {
      g.strokeStyle = css(0.6); g.beginPath(); g.moveTo(44, 12); g.quadraticCurveTo(64, 30, 86, 12); g.stroke();
      g.strokeStyle = css(1.4); g.lineWidth = 1; g.beginPath(); g.moveTo(52, 70); g.lineTo(78, 64); g.lineTo(82, 84); g.lineTo(56, 90); g.closePath(); g.stroke();
    } else {
      g.strokeStyle = css(0.6); g.beginPath(); g.moveTo(24, 14); g.lineTo(104, 14); g.moveTo(64, 14); g.lineTo(64, 48); g.stroke();
      g.strokeStyle = '#a8742c'; g.lineWidth = 1; g.setLineDash([3, 2]);
      g.beginPath(); g.moveTo(30, 18); g.quadraticCurveTo(36, 34, 50, 32); g.moveTo(98, 18); g.quadraticCurveTo(92, 34, 78, 32); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(w, d, 12, 12); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, waves = [0, 1, 2].map(() => [8 + r() * 14, 8 + r() * 14, r() * 6.3]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), nx = x / (w / 2), nz = z / (d / 2);
      const edge = Math.max(0, 1 - Math.max(Math.abs(nx), Math.abs(nz)) ** 3);
      let y = 0; for (const [a, b, ph] of waves) y += Math.sin(x * a + z * b + ph);
      p.setY(i, h * Math.sqrt(edge) * (0.5 + 0.16 * y));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, lam({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // Cama ocupada: com o Caio deitado, o cobertor liso dá lugar a um moldado pelo corpo
  // e as roupas vão para o chão. Roda todo quadro (e nas fotos, que posam o personagem na hora).
  syncBed(player) {
    const on = player.state === 'bed' && player.root.visible;
    if (on === !!this.cover) return;
    if (on) this.tuck(player);
    else {
      for (const m of this.cover.children) { m.geometry.dispose(); }
      this.bed.remove(this.cover); this.cover = null;
    }
    this.blanket.visible = !on;
    for (const c of this.clothes.children) { const s = c.userData[on ? 'floor' : 'bed']; c.position.set(s[0], s[1], s[2]); c.rotation.y = s[3]; }
  }

  tuck(player) {
    const X0 = -1.53, HW = 0.44, ZF = 1.08, Y0 = 0.478;   // centro da cama, meia largura e pé do colchão, cobertor sobre o colchão
    const B = player.ch.bones, v = new THREE.Vector3();
    player.root.updateMatrixWorld(true);
    const neck = B.neck.getWorldPosition(new THREE.Vector3()), chest = B.chest.getWorldPosition(new THREE.Vector3());
    const Z0 = neck.z + 0.08;                                // borda de cima: na linha do ombro
    const NX = 22, NZ = 36, W = NX + 1, dx = 2 * HW / NX, dz = (ZF - Z0) / NZ;
    // altura do corpo sobre cada ponto da grade, a partir dos vértices já deformados pelo esqueleto
    const raw = new Float32Array(W * (NZ + 1)).fill(Y0);
    player.ch.root.traverse((o) => {
      if (!o.isMesh || !o.visible || o.parent === B.head) return;    // cabelo e óculos ficam para fora
      const pa = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex;
      const bones = o.isSkinnedMesh ? o.skeleton.bones : null;
      for (let i = 0; i < pa.count; i++) {
        if (bones && bones[si.getX(i)] === B.head) continue;
        if (bones) o.getVertexPosition(i, v); else v.fromBufferAttribute(pa, i);
        v.applyMatrix4(o.matrixWorld);
        // cada vértice marca a célula e as vizinhas (a malha do corpo é esparsa)
        const a0 = Math.round((v.x - X0 + HW) / dx), b0 = Math.round((v.z - Z0) / dz);
        for (let b = b0 - 1; b <= b0 + 1; b++) for (let a = a0 - 1; a <= a0 + 1; a++) {
          if (a < 0 || a > NX || b < -1 || b > NZ) continue;
          const k = Math.max(0, b) * W + a;
          if (v.y + 0.03 > raw[k]) raw[k] = v.y + 0.03;
        }
      }
    });
    // o pano não entra nos vãos: cai do alto do corpo com inclinação limitada, depois suaviza
    const hf = new Float32Array(raw.length), SL = 1.1, RC = 8;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      let m = raw[j * W + i];
      for (let b = Math.max(0, j - RC); b <= Math.min(NZ, j + RC); b++) {
        for (let a = Math.max(0, i - RC); a <= Math.min(NX, i + RC); a++) {
          const h = raw[b * W + a] - SL * Math.hypot((a - i) * dx, (b - j) * dz);
          if (h > m) m = h;
        }
      }
      hf[j * W + i] = m;
    }
    const tmp = new Float32Array(hf.length);
    for (let pass = 0; pass < 4; pass++) {
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
        let sum = 0, n = 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(NZ, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(NX, i + 1); a++) { sum += hf[b * W + a]; n++; }
        tmp[j * W + i] = Math.max(sum / n, raw[j * W + i] - 0.012);
      }
      hf.set(tmp);
    }
    const hAt = (i, j) => hf[j * W + i] + 0.006 * Math.sin(i * 1.9 + j * 0.7) * Math.sin(j * 1.3 - i * 0.4);
    // malha: grade em cima do colchão + barra caída nas laterais e no pé
    const xs = [], cols = [];
    xs.push(-1.995, -1.987); cols.push(-1, -2);                       // lado da parede: quase encostado
    for (let i = 0; i <= NX; i++) { xs.push(X0 - HW + i * dx); cols.push(i); }
    xs.push(X0 + HW + 0.035, X0 + HW + 0.055); cols.push(-2, -1);
    const rows = [];
    for (let j = 0; j <= NZ; j++) rows.push([Z0 + j * dz, j]);
    rows.push([ZF + 0.012, -2], [ZF + 0.022, -1]);
    const height = (ci, rj) => {
      const i = cols[ci] < 0 ? (ci < 2 ? 0 : NX) : cols[ci], j = rj[1] < 0 ? NZ : rj[1];
      let y = hAt(i, j);
      if (cols[ci] === -2 || rj[1] === -2) y -= 0.025;
      if (cols[ci] === -1 || rj[1] === -1) y = 0.31;
      return y;
    };
    // colunas c0..c1-1 e as primeiras nRows linhas da grade, erguidas em `lift`
    const build = (nRows, lift, uScale, vScale, c0 = 0, c1 = xs.length) => {
      const cx = xs.slice(c0, c1), NC = cx.length, pos = [], uv = [], idx = [];
      const ys = rows.slice(0, nRows).map((rj) => cx.map((_, ci) => height(ci + c0, rj) + lift));
      // UV pelo comprimento do pano (não estica nas encostas)
      const us = ys.map((row) => { let u = 0; return row.map((y, ci) => (ci ? (u += Math.hypot(cx[ci] - cx[ci - 1], y - row[ci - 1])) : 0)); });
      const vs = cx.map((_, ci) => { let t = 0; return ys.map((row, r) => (r ? (t += Math.hypot(rows[r][0] - rows[r - 1][0], row[ci] - ys[r - 1][ci])) : 0)); });
      for (let r = 0; r < nRows; r++) for (let ci = 0; ci < NC; ci++) {
        pos.push(cx[ci], ys[r][ci], rows[r][0]); uv.push(us[r][ci] * uScale, vs[ci][r] * vScale);
      }
      for (let r = 0; r < nRows - 1; r++) for (let ci = 0; ci < NC - 1; ci++) {
        const a = r * NC + ci, b = a + 1, c2 = a + NC, d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    };
    this.cover = new THREE.Group(); this.bed.add(this.cover);
    this.add(new THREE.Mesh(build(rows.length, 0, 2, 1.8), this.blanketMat), this.cover);
    // dobra do lençol virada por cima do cobertor, na borda de cima (só até a beira do colchão)
    this.add(new THREE.Mesh(build(4, 0.008, 1.5, 1.5, 1, xs.length - 1), this.sheetMat), this.cover);
    // respiração: o pano sobe e desce sobre o peito
    this.coverBreath = this.cover.children.map((m) => {
      const pa = m.geometry.attributes.position, base = Float32Array.from(pa.array), wgt = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) {
        const lift = Math.min(1, Math.max(0, (base[i * 3 + 1] - Y0) / 0.25)), dzc = (base[i * 3 + 2] - chest.z) / 0.32;
        wgt[i] = lift * Math.exp(-dzc * dzc);
      }
      return { pa, base, wgt };
    });
  }

  buildFurniture(R) {
    const M = this.mats;
    // criado-mudo + rádio-relógio
    this.box(0.38, 0.5, 0.36, M.madeira, -1.77, 0.25, -1.55, R, 2);
    this.box(0.3, 0.12, 0.01, M.madeiraEsc, -1.77, 0.38, -1.366, R);
    this.box(0.04, 0.02, 0.02, M.cinza, -1.77, 0.38, -1.355, R);
    this.box(0.2, 0.07, 0.1, M.preto, -1.77, 0.535, -1.52, R);
    this.clockC = document.createElement('canvas'); this.clockC.width = 64; this.clockC.height = 24;
    this.clockTex = new THREE.CanvasTexture(this.clockC);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05), new THREE.MeshBasicMaterial({ map: this.clockTex }));
    face.position.set(-1.77, 0.535, -1.469); R.add(face);
    this.clockLight = new THREE.PointLight(0xff2010, 0.08, 1.2, 2); this.clockLight.position.set(-1.77, 0.56, -1.4); R.add(this.clockLight);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 10), new THREE.MeshPhongMaterial({ color: 0x99aabb, transparent: true, opacity: 0.4, shininess: 90 }));
    glass.position.set(-1.66, 0.55, -1.62); this.add(glass, R, false, true);
    this.flashlightMesh = this.box(0.04, 0.04, 0.16, M.preto, -1.88, 0.52, -1.62, R);

    // guarda-roupa
    const wr = new THREE.Mesh(boxGeo(0.56, 2.05, 1.4), [M.madeira, lam({ map: T.guarda_roupa }), M.madeira, M.madeira, M.madeira, M.madeira]);
    wr.position.set(1.72, 1.025, -0.2); this.add(wr, R);
    for (const z of [-0.47, -0.43, 0.04, 0.08]) this.box(0.02, 0.14, 0.015, M.cinza, 1.435, 1.05, z, R);
    this.box(0.42, 0.14, 0.5, lam({ color: 0x2b3a2b }), 1.74, 2.12, -0.55, R);  // mala em cima

    // estante com som
    this.box(0.4, 1.3, 0.34, M.madeira, 1.78, 0.65, -1.56, R, 2);
    this.box(0.36, 0.18, 0.28, M.preto, 1.78, 1.39, -1.56, R);
    this.box(0.12, 0.2, 0.14, M.preto, 1.66, 1.62, -1.58, R);
    const books = [0x7a2020, 0x204a7a, 0xc8a040, 0x2a5a2a, 0x555555];
    books.forEach((c, i) => this.box(0.05, 0.22, 0.2, lam({ color: c }), 1.64 + i * 0.06, 0.95, -1.5, R));
    this.box(0.3, 0.06, 0.24, lam({ color: 0x151515 }), 1.78, 0.5, -1.5, R);          // videogame
    this.box(0.14, 0.03, 0.08, lam({ color: 0x202020 }), 1.76, 0.545, -1.42, R);       // controle

    // torre de CDs
    this.cdTower = new THREE.Group(); this.cdTower.position.set(-0.1, 0, -1.6); R.add(this.cdTower);
    const cdm = lam({ map: T.cds });
    const tg = new THREE.Mesh(boxGeo(0.15, 1.0, 0.15), [cdm, cdm, M.preto, M.preto, cdm, cdm]); tg.position.y = 0.5; this.add(tg, this.cdTower);
    this.box(0.25, 0.02, 0.22, M.preto, 0, 0.01, 0, this.cdTower);
    // CDs espalhados (noite 2)
    this.cdsFloor = new THREE.Group(); R.add(this.cdsFloor); this.cdsFloor.visible = false;
    for (let i = 0; i < 14; i++) {
      const c = this.box(0.142, 0.01, 0.125, lam({ color: new THREE.Color().setHSL(Math.random(), 0.4, 0.3) }), 0.05 + (Math.random() - 0.5) * 0.7, 0.006 + i * 0.001, -1.05 + (Math.random() - 0.5) * 0.6, this.cdsFloor);
      c.rotation.y = Math.random() * 3;
    }
    this.cdFloorLeo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.003, 20), lam({ map: T.cd_leo }));
    this.cdFloorLeo.position.set(0.15, 0.02, -0.92); this.cdsFloor.add(this.cdFloorLeo);

    // telefone (extensão) no chão
    const ph = this.phone = new THREE.Group(); ph.position.set(0.22, 0, -1.55); R.add(ph);
    const phm = lam({ color: 0xc9c2ae });
    this.box(0.17, 0.06, 0.2, phm, 0, 0.03, 0, ph);
    this.handset = this.box(0.2, 0.035, 0.05, phm, 0, 0.075, 0.0, ph);
    this.handset.rotation.y = Math.PI / 2;

    // tapete, violão, mochila
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), lam({ map: T.tapete }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.25, 0.004, 0.3); rug.rotation.z = 0.05; this.add(rug, R, false, true);
    // encostado na parede sul (z 1.75): borda de trás do bojo no chão, costas da mão tocando a parede
    const gt = this.guitar = new THREE.Group(), gs = Math.sin(0.2), gc = Math.cos(0.2);
    gt.rotation.x = 0.2; gt.position.set(-0.45, -(0.03 * gc - 0.05 * gs), 1.748 - (1.23 * gs + 0.015 * gc)); R.add(gt);
    const wood = lam({ color: 0xb06a2a });
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 14), wood); b1.rotation.x = Math.PI / 2; b1.position.y = 0.22; this.add(b1, gt);
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14), wood); b2.rotation.x = Math.PI / 2; b2.position.y = 0.48; this.add(b2, gt);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), M.preto); hole.position.set(0, 0.42, -0.051); hole.rotation.y = Math.PI; gt.add(hole);
    this.box(0.05, 0.5, 0.03, lam({ color: 0x3a2010 }), 0, 0.85, 0, gt);
    this.box(0.07, 0.14, 0.03, lam({ color: 0x3a2010 }), 0, 1.16, 0, gt);
    this.buildBackpack(R);

    // pôsteres, calendário, mural
    const plane = (tex, w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; this.add(m, R, false, true); return m; };
    this.poster1 = plane(T.poster1, 0.6, 0.85, -1.995, 1.55, 0.2, Math.PI / 2);
    this.poster2 = plane(T.poster2, 0.55, 0.78, -1.0, 1.55, 1.745, Math.PI);
    this.calendar = plane(T.calendario, 0.28, 0.42, -1.3, 1.5, -1.746, 0);
    this.mural = plane(T.mural, 0.55, 0.34, -0.6, 1.45, -1.746, 0);

    // luminária de teto (lâmpada queimada)
    this.box(0.012, 0.25, 0.012, M.preto, 0, H - 0.125, 0.1, R);
    this.ceilBulbMat = lam({ color: 0x8a8a80, emissive: 0x000000 });
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), this.ceilBulbMat); cb.position.set(0, H - 0.28, 0.1); this.add(cb, R);

    // cadeira de escritório
    const ch = this.chair = new THREE.Group(); ch.position.set(-1.0, 0, -0.62); R.add(ch);
    const fab = lam({ color: 0x26262c });
    this.box(0.46, 0.07, 0.44, fab, 0, 0.46, 0, ch);
    this.box(0.42, 0.48, 0.06, fab, 0, 0.8, 0.22, ch);
    this.box(0.03, 0.2, 0.03, M.cinza, 0, 0.56, 0.2, ch);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), M.cinza); pole.position.y = 0.25; this.add(pole, ch);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const leg = this.box(0.04, 0.03, 0.28, M.preto, Math.sin(a) * 0.13, 0.07, Math.cos(a) * 0.13, ch); leg.rotation.y = a;
      const wh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), M.preto); wh.position.set(Math.sin(a) * 0.26, 0.025, Math.cos(a) * 0.26); ch.add(wh);
    }
    // moletom vermelho do Léo pendurado na cadeira
    const hm = lam({ color: 0x7a1414 });
    this.box(0.44, 0.4, 0.04, hm, 0, 0.82, 0.255, this.hoodie);
    this.box(0.1, 0.35, 0.05, hm, -0.2, 0.62, 0.26, this.hoodie);
    this.box(0.1, 0.35, 0.05, hm, 0.2, 0.62, 0.26, this.hoodie);
    this.hoodie.position.copy(ch.position);
  }

  // mochila do cursinho largada no chão, tombada de costas contra a parede da porta.
  // Corpo e bolso são "caixas arredondadas" deformadas a partir de esferas; alças são fitas varridas ao longo de curvas.
  // Coordenadas locais: fundo em y = 0, frente para -z, costas (alças) para +z.
  buildBackpack(R) {
    const M = this.mats, X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
    const bp = this.backpack = new THREE.Group();
    bp.position.set(-0.95, 0.012, 1.52); bp.rotation.set(0.14, -0.32, 0.02, 'YXZ'); R.add(bp);
    const fabric = lam({ map: T.mochila, vertexColors: true });
    const pocketM = lam({ map: T.mochila, color: 0xc8cad8 });
    const strapM = lam({ map: T.mochila, color: 0xe0e0e8 });
    const webbing = lam({ color: 0x16161a });
    const zipM = lam({ color: 0x1e1e22 });
    const metal = new THREE.MeshPhongMaterial({ color: 0x6a6a66, shininess: 60, specular: 0x555550 });

    const pw = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);
    // direção da esfera unitária -> ponto da superfície; expoente < 1 achata as faces e arredonda as quinas
    const shape = (hw, hh, hd, o) => (x, y, z) => {
      const e = o.p + (o.pt - o.p) * Math.max(0, y);           // topo mais redondo que o fundo
      const ny = pw(y, y < 0 ? o.pb : e);
      let nx = pw(x, e), nz = pw(z, e);
      const up = (ny + 1) / 2;
      nx *= 1 - o.taper * up * up;                              // estreita em cima
      nz *= 1 - o.thin * up;                                    // e afina
      if (nz < 0) nz *= 1 + o.bulge * (1 - nx * nx) * (1 - ny * ny);   // frente estufada de apostila
      return V(nx * hw, ny * hh, nz * hd);
    };
    const blobGeo = (f, uvx, uvy, darkBottom) => {
      const g = new THREE.SphereGeometry(1, 20, 14);
      g.rotateY(Math.PI / 2);                                   // emenda da esfera vai para as costas
      const p = g.attributes.position, uv = g.attributes.uv, col = [];
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), v = f(p.getX(i), y, p.getZ(i));
        p.setXYZ(i, v.x, v.y, v.z);
        uv.setXY(i, uv.getX(i) * uvx, uv.getY(i) * uvy);
        const k = darkBottom && y < -0.86 ? 0.42 : 1;           // fundo reforçado, mais escuro
        col.push(k, k, k);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    // ponto e normal da superfície na direção d (relativos ao centro da forma)
    const surf = (f, d, center) => {
      d = d.clone().normalize();
      const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? Y : X).normalize();
      const t2 = new THREE.Vector3().crossVectors(d, t1);
      const at = (v) => f(v.x, v.y, v.z);
      const p0 = at(d);
      const a = at(d.clone().addScaledVector(t1, 0.01).normalize()).sub(p0);
      const b = at(d.clone().addScaledVector(t2, 0.01).normalize()).sub(p0);
      const n = new THREE.Vector3().crossVectors(a, b).normalize();
      if (n.dot(p0) < 0) n.negate();
      return { p: p0.add(center), n };
    };
    // encosta uma peça plana na superfície (z local = normal, y local = "para cima" ao longo da superfície)
    const stick = (m, s, off = 0, spin = 0) => {
      const right = new THREE.Vector3().crossVectors(Y, s.n).normalize(), up = new THREE.Vector3().crossVectors(s.n, right);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, s.n));
      if (spin) m.rotateZ(spin);
      m.position.copy(s.p).addScaledVector(s.n, off);
      return this.add(m, bp);
    };
    // fita com seção retangular ao longo de uma curva; hint(u) = para onde aponta a face larga
    const ribbon = (curve, u0, u1, w, t, hint, mat, segs = 12, parent = bp) => {
      const pos = [], uv = [], idx = [], len = curve.getLength() * (u1 - u0);
      const B = new THREE.Vector3(), N = new THREE.Vector3();
      for (let i = 0; i <= segs; i++) {
        const k = i / segs, u = u0 + (u1 - u0) * k;
        const P = curve.getPointAt(u), Tg = curve.getTangentAt(u);
        B.crossVectors(Tg, hint(k)).normalize(); N.crossVectors(B, Tg);
        const hw = w(k) / 2, ht = t(k) / 2;
        [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]].forEach(([sb, sn], j) => {
          pos.push(P.x + B.x * hw * sb + N.x * ht * sn, P.y + B.y * hw * sb + N.y * ht * sn, P.z + B.z * hw * sb + N.z * ht * sn);
          uv.push(j / 4, k * len * 8);
        });
        if (i < segs) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return this.add(new THREE.Mesh(g, mat), parent);
    };
    const frameAt = (curve, u, hint) => {
      const T0 = curve.getTangentAt(u), B = new THREE.Vector3().crossVectors(T0, hint).normalize();
      return { p: curve.getPointAt(u), t: T0, b: B, n: new THREE.Vector3().crossVectors(B, T0) };
    };
    const orient = (m, f, off = 0) => {
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.b, f.t, f.n));
      m.position.copy(f.p).addScaledVector(f.n, off);
      return m;
    };

    // ---- corpo e bolso da frente
    const bodyC = V(0, 0.21, 0), pocketC = V(0, 0.118, -0.088);
    const fBody = shape(0.15, 0.21, 0.085, { p: 0.4, pt: 0.62, pb: 0.25, taper: 0.14, thin: 0.3, bulge: 0.28 });
    const fPocket = shape(0.115, 0.093, 0.046, { p: 0.36, pt: 0.55, pb: 0.3, taper: 0.22, thin: 0, bulge: 0.18 });
    const body = new THREE.Mesh(blobGeo(fBody, 6, 3, true), fabric); body.position.copy(bodyC); this.add(body, bp);
    const pocket = new THREE.Mesh(blobGeo(fPocket, 4, 2, false), pocketM); pocket.position.copy(pocketC); this.add(pocket, bp);

    // ---- zíperes: seguem a quina da frente (principal) e o alto do bolso
    const zipPath = (f, center, a0, a1, sx, sz, n = 26) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, s = surf(f, V(Math.sin(a) * sx, Math.cos(a) * sx, -sz), center);
        pts.push(s.p.addScaledVector(s.n, 0.002));
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    const mainZip = zipPath(fBody, bodyC, -1.95, 1.95, 0.78, 0.62);
    const pocketZip = zipPath(fPocket, pocketC, -1.45, 1.45, 0.72, 0.69);
    this.add(new THREE.Mesh(new THREE.TubeGeometry(mainZip, 48, 0.0055, 5, false), zipM), bp);
    this.add(new THREE.Mesh(new THREE.TubeGeometry(pocketZip, 32, 0.005, 5, false), zipM), bp);
    // cursor + puxador pendurado
    const pull = (f, center, a, sx, sz, charm) => {
      const s = surf(f, V(Math.sin(a) * sx, Math.cos(a) * sx, -sz), center);
      stick(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.008), metal), s, 0.004);
      const tab = stick(new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.036, 0.003), metal), s, 0.007);
      tab.translateY(-0.024);
      if (charm) {   // chaveirinho de plástico
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0015, 4, 10), metal);
        ring.position.copy(tab.position); ring.quaternion.copy(tab.quaternion); ring.translateY(-0.024); ring.translateZ(0.002); bp.add(ring);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.007), lam({ color: 0xd8a818 }));
        ch.position.copy(ring.position); ch.quaternion.copy(ring.quaternion); ch.translateY(-0.02); ch.translateZ(0.003); ch.rotateZ(0.25); this.add(ch, bp);
      }
    };
    pull(fBody, bodyC, -0.42, 0.78, 0.62);
    pull(fBody, bodyC, 0.62, 0.78, 0.62);
    pull(fPocket, pocketC, 1.0, 0.72, 0.69, true);

    // ---- apostila aparecendo pela abertura do zíper
    const book = this.box(0.165, 0.07, 0.01, lam({ color: 0xe6dfc8 }), 0.02, 0.392, -0.018, bp);
    book.rotation.set(-0.42, 0.05, 0.07);
    this.box(0.165, 0.01, 0.0105, lam({ color: 0xc23a22 }), 0, 0.022, 0, book);   // faixa colorida da capa

    // ---- alça de mão no topo
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 12, Math.PI), webbing);
    handle.scale.set(1, 1, 2.2); handle.position.set(0, 0.405, 0.032); handle.rotation.x = 0.7; this.add(handle, bp);

    // ---- alças acolchoadas nas costas, com fivela e a ponta da fita caída no chão
    bp.updateMatrix();
    for (const sd of [-1, 1]) {
      const strap = new THREE.CatmullRomCurve3([
        V(sd * 0.032, 0.385, 0.03), V(sd * 0.042, 0.36, 0.072), V(sd * 0.062, 0.29, 0.112),
        V(sd * 0.088, 0.19, 0.124), V(sd * 0.108, 0.1, 0.106), V(sd * 0.12, 0.045, 0.078), V(sd * 0.124, 0.022, 0.04),
      ]);
      const out = () => Z;
      ribbon(strap, 0, 0.72, (k) => 0.064 - 0.014 * k, (k) => 0.02 - 0.006 * k, out, strapM, 14);
      ribbon(strap, 0.68, 1, () => 0.026, () => 0.004, out, webbing, 6);
      const buckle = orient(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.009), webbing), frameAt(strap, 0.72, Z), 0.002);
      this.add(buckle, bp);
      // ponta solta: desce da fivela e deita no chão (coordenadas do quarto)
      const f = frameAt(strap, 0.73, Z);
      const toRoom = (v) => v.clone().applyMatrix4(bp.matrix);
      const side = V(sd, 0, 0).applyQuaternion(bp.quaternion), back = Z.clone().applyQuaternion(bp.quaternion);
      const b0 = toRoom(f.p.clone().addScaledVector(f.n, 0.006));
      const tail = new THREE.CatmullRomCurve3([
        b0, b0.clone().addScaledVector(side, 0.012).add(V(0, -0.035, 0)).addScaledVector(back, 0.01),
        V(b0.x, 0.01, b0.z).addScaledVector(side, 0.035).addScaledVector(back, 0.012),
        V(b0.x, 0.003, b0.z).addScaledVector(side, 0.085).addScaledVector(back, -0.005),
        V(b0.x, 0.003, b0.z).addScaledVector(side, 0.13).addScaledVector(back, -0.03),
      ]);
      ribbon(tail, 0, 1, () => 0.026, () => 0.0035, (k) => back.clone().lerp(Y, Math.min(1, k * 1.6)).normalize(), webbing, 12, R);
    }

    // ---- passador de couro em losango e bóton da banda
    const ps = surf(fPocket, V(0, 0.3, -1), pocketC);
    stick(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.004), lam({ color: 0x8a6440 })), ps, 0.002, Math.PI / 4);
    for (const dx of [-0.006, 0.006]) { const sl = stick(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.002), M.preto), ps, 0.0045); sl.translateX(dx); }
    const bs = surf(fBody, V(-0.34, 0.2, -0.92), bodyC);
    stick(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 16).rotateX(Math.PI / 2), metal), bs, 0.002);
    stick(new THREE.Mesh(new THREE.CircleGeometry(0.0205, 16), lam({ map: makeTex(GEN.broche(), false) })), bs, 0.0042, 0.15);
  }

  buildDoor(R) {
    const frame = lam({ map: T.madeira, color: 0xd8d0c0 });
    this.box(0.06, 2.12, 0.14, frame, 0.37, 1.06, 1.8, R);
    this.box(0.06, 2.12, 0.14, frame, 1.23, 1.06, 1.8, R);
    this.box(0.92, 0.06, 0.14, frame, 0.8, 2.13, 1.8, R);
    const pivot = this.doorPivot = new THREE.Group(); pivot.position.set(1.2, 0, 1.78); R.add(pivot);
    this.doorMat = lam({ map: T.porta });
    const door = new THREE.Mesh(boxGeo(0.8, 2.08, 0.04), [this.mats.branco, this.mats.branco, this.mats.branco, this.mats.branco, this.doorMat, this.doorMat]);
    door.position.set(-0.4, 1.05, 0); this.add(door, pivot);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lam({ color: 0xb09040 }));
    knob.position.set(-0.72, 1.0, -0.04); pivot.add(knob);
    const knob2 = knob.clone(); knob2.position.z = 0.04; pivot.add(knob2);
    // fresta de luz sob a porta
    this.gapMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    this.gap = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.012), this.gapMat);
    this.gap.position.set(0.8, 0.006, 1.83); this.gap.rotation.y = Math.PI; R.add(this.gap);
    this.gapLight = new THREE.PointLight(0xffc890, 0.12, 1.2, 2); this.gapLight.position.set(0.8, 0.35, 1.55); R.add(this.gapLight);
  }

  buildLights() {
    const s = this.scene;
    this.ambient = new THREE.HemisphereLight(0x2a3548, 0x14100c, 0.7); s.add(this.ambient);
    // poste através da janela
    const st = this.street = new THREE.SpotLight(0xff9a48, 50, 14, 0.5, 0.45, 2);
    st.position.set(1.9, 3.88, -4.4); st.target.position.set(-0.5, 0, 0.1);
    st.castShadow = true; st.shadow.mapSize.set(1024, 1024); st.shadow.bias = -0.0015; st.shadow.normalBias = 0.02;
    st.shadow.camera.near = 1; st.shadow.camera.far = 14;
    s.add(st); s.add(st.target);
    // luz do CRT
    const cr = this.crt = new THREE.SpotLight(0x88aacc, 0, 6, 1.15, 0.85, 2);
    cr.position.set(-0.95, 1.0, -1.2); cr.target.position.set(-0.95, 0.9, 0.5);
    cr.castShadow = true; cr.shadow.mapSize.set(512, 512); cr.shadow.bias = -0.002; cr.shadow.camera.near = 0.08; cr.shadow.camera.far = 6;
    s.add(cr); s.add(cr.target);
    // luminária: cone de luz com sombra sobre a mesa + preenchimento quente
    const ls = this.lampSpot = new THREE.SpotLight(0xffc27a, 7, 4, 0.95, 0.65, 2);
    ls.position.set(-1.43, 1.1, -1.27); ls.target.position.set(-1.15, 0.74, -1.15);
    ls.castShadow = true; ls.shadow.mapSize.set(512, 512); ls.shadow.bias = -0.002; ls.shadow.camera.near = 0.05; ls.shadow.camera.far = 4;
    s.add(ls); s.add(ls.target);
    this.lampLight = new THREE.PointLight(0xffb060, 1.6, 5.5, 2);
    this.lampLight.position.set(-1.35, 1.25, -1.1); s.add(this.lampLight);
    // relâmpago
    this.flashLight = new THREE.DirectionalLight(0xb8c8ff, 0);
    this.flashLight.position.set(1, 6, -8); this.flashLight.target.position.set(0, 0, 0);
    s.add(this.flashLight); s.add(this.flashLight.target);
    // lanterna
    const fl = this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 10, 0.5, 0.5, 1.5);
    fl.castShadow = true; fl.shadow.mapSize.set(512, 512); fl.shadow.bias = -0.002; fl.shadow.camera.near = 0.1;
    s.add(fl); s.add(fl.target);
    this.flashlightOn = false;
    // flash de câmera (fotos)
    this.camFlash = new THREE.PointLight(0xffffff, 0, 8, 1.5); s.add(this.camFlash);
    // sol do epílogo (no Brasil, o sol do meio-dia vem do norte: entra pela janela)
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 0);
    sun.position.set(1.5, 7, -8); sun.target.position.set(-0.5, 0, 0.5);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.001;
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    s.add(sun); s.add(sun.target);
  }

  // Luz "volumétrica" do poste entrando pela janela, poeira, halos e oclusão falsa nos cantos.
  buildAtmosphere(R) {
    const s = this.scene;
    // ---------------- feixe de luz (casca do tronco de pirâmide janela → chão)
    const L = V(1.9, 3.88, -4.4);
    const win = [V(0.3, 1.0, -1.76), V(1.3, 1.0, -1.76), V(1.3, 2.05, -1.76), V(0.3, 2.05, -1.76)];
    const proj = (c, frac) => { const k = c.y / (L.y - c.y); return c.clone().add(c.clone().sub(L).multiplyScalar(k * frac)); };
    const pos = [], tt = [], side = [];
    const SEG = 8;
    for (let f = 0; f < 4; f++) {
      const a = win[f], b = win[(f + 1) % 4];
      for (let k = 0; k < SEG; k++) {
        const t0 = k / SEG, t1 = (k + 1) / SEG;
        const a0 = proj(a, t0), b0 = proj(b, t0), a1 = proj(a, t1), b1 = proj(b, t1);
        for (const [p, t, sd] of [[a0, t0, 0], [b0, t0, 1], [b1, t1, 1], [a0, t0, 0], [b1, t1, 1], [a1, t1, 0]]) { pos.push(p.x, p.y, p.z); tt.push(t); side.push(sd); }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    sg.setAttribute('aS', new THREE.Float32BufferAttribute(side, 1));
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 1 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0xff9a50) } },
      vertexShader: `attribute float aT; attribute float aS; varying float vT; varying float vS; varying vec3 vW;
        void main(){ vT=aT; vS=aS; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uI; uniform float uTime; uniform vec3 uCol; varying float vT; varying float vS; varying vec3 vW;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){
          float edge = smoothstep(0.0, 0.25, vS) * smoothstep(1.0, 0.75, vS);
          float a = pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.1, vT) * (0.2 + 0.8 * edge);
          float bars = 0.75 + 0.25 * step(0.5, fract(vW.x * 7.4 + vW.z * 0.4));
          float drift = 0.85 + 0.15 * sin(vW.y * 6.0 + uTime * 0.7 + vW.x * 3.0);
          gl_FragColor = vec4(uCol * a * bars * drift * uI * 0.1, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(sg, this.shaftMat); this.shaft.frustumCulled = false; R.add(this.shaft);

    // ---------------- poeira flutuando no feixe
    const N = 70, dp = new Float32Array(N * 3);
    this.dust = [];
    for (let i = 0; i < N; i++) {
      const t = Math.random(), u = Math.random(), v = Math.random();
      const a = proj(win[0].clone().lerp(win[1], u).lerp(win[3].clone().lerp(win[2], u), v), t);
      this.dust.push({ p: a, ph: Math.random() * 10 });
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dustPts = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffc080, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dustPts.frustumCulled = false; R.add(this.dustPts);

    // ---------------- halos (brilho em volta das fontes de luz)
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();
    const glow = (color, size, x, y, z, parent = R) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.set(size, size, 1); sp.position.set(x, y, z); parent.add(sp); return sp;
    };
    this.crtGlow = glow(0x88aacc, 0.75, -0.95, 1.0, -1.18);
    this.lampGlow = glow(0xffc27a, 0.35, -1.43, 1.12, -1.27);
    this.clockGlow = glow(0xff2a10, 0.22, -1.77, 0.535, -1.44);
    this.ledGlow = glow(0x33ff44, 0.05, -0.48, 0.925, -1.28);

    // ---------------- oclusão de ambiente falsa (sombras de contato pintadas)
    const aoTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();
    const edgeTex = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c);
    })();
    const aoMat = (tex, op) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const blob = (x, z, w, d, op = 0.8, parent = R) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat(aoTex, op)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.renderOrder = 1; parent.add(m); return m;
    };
    blob(-1.53, 0.1, 1.35, 2.5, 0.9);          // cama
    blob(-0.9, -1.45, 1.7, 1.0, 0.85);         // mesa
    blob(1.72, -0.2, 0.9, 1.9, 0.9);           // guarda-roupa
    blob(1.78, -1.56, 0.7, 0.6, 0.8);          // estante
    blob(-1.77, -1.55, 0.6, 0.55, 0.8);        // criado-mudo
    this.chairAO = blob(-1.0, -0.62, 0.75, 0.75, 0.6);
    // faixas escuras no encontro parede/chão e parede/teto
    const strip = (x, z, len, ry, y = 0.007, w = 0.35, ceil = false, parent = R) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), aoMat(edgeTex, ceil ? 0.5 : 0.55));
      m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = ceil ? Math.PI / 2 : -Math.PI / 2;
      m.position.set(x, y, z); m.renderOrder = 1; parent.add(m);
      if (ceil) { const p = m.geometry.attributes.uv; for (let i = 0; i < p.count; i++) p.setY(i, 1 - p.getY(i)); } // escuro junto à parede
      return m;
    };
    strip(0, -1.75 + 0.175, 4, 0); strip(0, 1.75 - 0.175, 4, Math.PI);
    strip(-2 + 0.175, 0, 3.5, Math.PI / 2); strip(2 - 0.175, 0, 3.5, -Math.PI / 2);
    strip(0, -1.75 + 0.2, 4, 0, H - 0.007, 0.4, true); strip(0, 1.75 - 0.2, 4, Math.PI, H - 0.007, 0.4, true);
    strip(-2 + 0.2, 0, 3.5, Math.PI / 2, H - 0.007, 0.4, true); strip(2 - 0.2, 0, 3.5, -Math.PI / 2, H - 0.007, 0.4, true);
  }

  // manchas: infiltração no teto, escorrido sob a janela, mofo no corredor
  buildDecals(R) {
    const mat = (tex, op = 1) => lam({ map: tex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const decal = (tex, w, h, x, y, z, rx, ry, parent, op) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(tex, op));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 2; m.receiveShadow = true;
      parent.add(m); return m;
    };
    decal(T.mancha_teto, 1.3, 1.3, -1.25, H - 0.003, 0.5, Math.PI / 2, 0, R, 0.9);
    decal(T.mancha_teto, 0.8, 0.8, 1.55, H - 0.003, 1.35, Math.PI / 2, 0.7, R, 0.8);   // no canto da câmera
    decal(T.mancha_parede, 1.15, 0.9, 0.8, 0.5, -1.747, 0, 0, R, 0.85);              // sob a janela
    decal(T.mancha_parede, 0.7, 0.8, 1.62, 2.2, 1.747, 0, Math.PI, R, 0.7);           // descendo do canto do teto
    decal(T.mancha_corredor, 1.3, 1.3, -5.6, 1.2, 1.953, 0, 0, this.hallFar, 0.9);
    decal(T.mancha_corredor, 1.0, 1.0, -9.8, 1.6, 3.348, 0, Math.PI, this.hallFar, 0.9);
    decal(T.mancha_parede, 0.9, 1.0, -8.2, 2.1, 1.953, 0, 0, this.hallFar, 0.8);
    decal(T.mancha_corredor, 0.9, 0.9, -3.9, 2.0, 1.953, 0, 0, this.hall, 0.7);
  }

  // corredor: comprimento normal (fim em x = -4.75) ou "impossível" (até x = -12) na última noite
  buildHallway() {
    const hw = this.hall = new THREE.Group(); this.scene.add(hw); hw.visible = false;
    const wm = this.mats.paredeCorr = lam({ map: T.parede_corredor });
    const fm = lam({ map: T.piso_corredor });
    const X0 = -12, X1 = 2.1;
    this.wall(X0, X1, -0.1, 0, 1.85, 3.45, fm, 1, hw).castShadow = false;
    this.wall(X0, X1, H, H + 0.1, 1.85, 3.45, lam({ map: T.teto }), 0.5, hw);
    // parede norte (lado do quarto) com o vão da porta
    this.wall(X0, 0.4, 0, H, 1.85, 1.95, wm, 1, hw);
    this.wall(1.2, X1, 0, H, 1.85, 1.95, wm, 1, hw);
    this.wall(0.4, 1.2, 2.1, H, 1.85, 1.95, wm, 1, hw);
    // parede sul: banheiro (x -3.6..-2.9) e arco para a sala (x -2.35..-1.45)
    this.wall(X0, -3.6, 0, H, 3.35, 3.45, wm, 1, hw);
    this.wall(-2.9, -2.35, 0, H, 3.35, 3.45, wm, 1, hw);
    this.wall(-1.45, X1, 0, H, 3.35, 3.45, wm, 1, hw);
    this.wall(-3.6, -2.9, 2.1, H, 3.35, 3.45, wm, 1, hw);
    this.wall(-2.35, -1.45, 2.15, H, 3.35, 3.45, wm, 1, hw);
    this.archWall = this.wall(-2.35, -1.45, 0, 2.15, 3.36, 3.44, wm, 1, hw);   // na última noite a sala "some"
    this.archWall.visible = false;
    this.box(0.7, 2.1, 0.1, new THREE.MeshBasicMaterial({ color: 0x000000 }), -3.25, 1.05, 3.55, hw);
    // ponta leste com a porta da mãe
    this.wall(X1 - 0.1, X1, 0, H, 1.85, 3.45, wm, 1, hw);
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.08), lam({ map: T.porta })); dm.position.set(X1 - 0.11, 1.04, 2.65); dm.rotation.y = -Math.PI / 2; this.add(dm, hw, false, true);
    // ponta oeste móvel com a porta do Léo
    const end = this.hallEnd = new THREE.Group(); hw.add(end);
    this.wall(-0.1, 0, 0, H, 1.85, 3.45, wm, 1, end);
    this.leoDoorMat = lam({ map: T.porta_leo });
    const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.08), this.leoDoorMat); dl.position.set(0.012, 1.04, 2.65); dl.rotation.y = Math.PI / 2; this.add(dl, end, false, true);
    end.position.x = -4.75;
    // mesinha do telefone com toalhinha, lista telefônica e o aparelho
    const mt = lam({ map: T.madeira, color: 0x8a6a4a });
    this.box(0.5, 0.03, 0.36, mt, -0.3, 0.72, 3.15, hw);
    for (const [dx, dz] of [[-0.22, -0.15], [0.22, -0.15], [-0.22, 0.15], [0.22, 0.15]]) this.box(0.03, 0.72, 0.03, mt, -0.3 + dx, 0.36, 3.15 + dz, hw);
    const dol = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lam({ color: 0xe8e4d8 })); dol.rotation.x = -Math.PI / 2; dol.position.set(-0.3, 0.737, 3.15); hw.add(dol);
    this.box(0.2, 0.05, 0.27, lam({ color: 0x8a2a1a }), -0.42, 0.76, 3.12, hw);
    const ph = lam({ color: 0x2a2a2a });
    this.box(0.18, 0.07, 0.2, ph, -0.22, 0.77, 3.15, hw);
    this.hallHandset = this.box(0.05, 0.04, 0.2, ph, -0.22, 0.825, 3.15, hw);
    this.jack = this.box(0.06, 0.08, 0.02, this.mats.branco, -0.3, 0.3, 3.34, hw);
    // quadros
    const frame = lam({ color: 0x3a2818 });
    const pic = (tex, x, parent = hw) => {
      this.box(0.36, 0.44, 0.03, frame, x, 1.5, 1.965, parent);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38), lam({ map: tex })); m.position.set(x, 1.5, 1.982); parent.add(m);
      return m;
    };
    pic(T.foto1, -1.6); pic(T.foto2, -4.1);
    // trecho que só existe quando o corredor fica comprido demais
    const far = this.hallFar = new THREE.Group(); hw.add(far); far.visible = false;
    this.foto3 = pic(T.foto1, -7.4, far);
    for (const x of [-6.0, -9.6]) this.dyn(new THREE.PointLight(0x6a80b0, 0.9, 4.5, 1.6), x, 2.0, 3.0, () => this.hall.visible && this.hallFar.visible);
    this.dyn(new THREE.PointLight(0x6a80b0, 0.7, 4.0, 1.6), -2.2, 2.0, 3.0, () => this.hall.visible);
    this.buildSala();
  }

  // sala e cozinha conjugadas, ao sul do corredor (x -2.6..2.1, z 3.45..8.3)
  buildSala() {
    const s = this.sala = new THREE.Group(); this.scene.add(s); s.visible = false;
    const wm = this.mats.paredeCorr;
    const tile = lam({ map: T.piso_corredor });
    const X0 = -2.6, X1 = 2.1, Z0 = 3.45, Z1 = 8.3;
    this.wall(X0, X1, -0.1, 0, Z0, Z1, tile, 1, s).castShadow = false;
    this.wall(X0, X1, H, H + 0.1, Z0, Z1, lam({ map: T.teto }), 0.5, s);
    this.wall(X0 - 0.1, X0, 0, H, Z0, Z1 + 0.1, wm, 1, s);
    // leste com janela (z 5.8..6.7)
    this.wall(X1, X1 + 0.1, 0, H, Z0, 5.8, wm, 1, s); this.wall(X1, X1 + 0.1, 0, H, 6.7, Z1 + 0.1, wm, 1, s);
    this.wall(X1, X1 + 0.1, 0, 1.0, 5.8, 6.7, wm, 1, s); this.wall(X1, X1 + 0.1, 2.0, H, 5.8, 6.7, wm, 1, s);
    // sul com janela da cozinha (x -1.9..-0.9)
    this.wall(X0, -1.9, 0, H, Z1, Z1 + 0.1, wm, 1, s); this.wall(-0.9, X1, 0, H, Z1, Z1 + 0.1, wm, 1, s);
    this.wall(-1.9, -0.9, 0, 1.15, Z1, Z1 + 0.1, wm, 1, s); this.wall(-1.9, -0.9, 1.9, H, Z1, Z1 + 0.1, wm, 1, s);
    const night = new THREE.MeshBasicMaterial({ color: 0x0a1018 });
    this.box(0.02, 1.0, 0.9, night, X1 + 0.12, 1.5, 6.25, s);
    this.box(1.0, 0.75, 0.02, night, -1.4, 1.525, Z1 + 0.12, s);
    const bar = lam({ color: 0x1e1e1e });
    for (let i = 0; i < 6; i++) this.box(0.014, 0.75, 0.014, bar, -1.82 + i * 0.165, 1.525, Z1 + 0.06, s);
    for (let i = 0; i < 5; i++) this.box(0.014, 1.0, 0.014, bar, X1 + 0.06, 1.5, 5.88 + i * 0.18, s);
    const M = this.mats;
    // ---- sala de estar
    const fab = lam({ map: T.cobertor, color: 0x9a7a60 });
    this.box(0.85, 0.4, 2.0, fab, -0.55, 0.2, 5.1, s);                  // sofá
    this.box(0.22, 0.5, 2.0, fab, -0.9, 0.62, 5.1, s);
    for (const z of [4.02, 6.18]) this.box(0.85, 0.28, 0.16, fab, -0.55, 0.52, z, s);
    for (const z of [4.55, 5.15, 5.75]) this.box(0.62, 0.1, 0.58, fab, -0.48, 0.45, z, s);
    this.box(0.06, 0.55, 0.9, lam({ color: 0x8a7a62 }), -0.78, 0.75, 4.9, s).rotation.z = 0.2;    // manta de crochê
    const wood = lam({ map: T.madeira, color: 0x7a5236 });
    this.box(0.5, 0.04, 0.9, wood, 0.55, 0.4, 4.95, s);                  // mesinha de centro
    for (const [dx, dz] of [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]]) this.box(0.04, 0.38, 0.04, wood, 0.55 + dx, 0.19, 4.95 + dz, s);
    this.box(0.05, 0.02, 0.15, M.preto, 0.5, 0.43, 4.8, s);              // controle remoto
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10), lam({ color: 0x5a7a9a })); vase.position.set(0.6, 0.53, 5.2); this.add(vase, s);
    // rack + TV de tubo 29" + videocassete
    this.box(0.45, 0.55, 1.1, wood, 1.85, 0.275, 4.8, s);
    this.box(0.32, 0.08, 0.36, M.preto, 1.78, 0.42, 4.8, s);
    this.vcrLed = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    this.box(0.01, 0.012, 0.06, this.vcrLed, 1.615, 0.42, 4.75, s);
    const tvb = lam({ color: 0x2a2a2c });
    this.box(0.5, 0.56, 0.68, tvb, 1.83, 0.83, 4.8, s);
    const tvBack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.28, 4, 1), tvb);
    tvBack.rotation.z = -Math.PI / 2; tvBack.rotation.x = Math.PI / 4; tvBack.position.set(2.0, 0.82, 4.8); this.add(tvBack, s);
    this.tvCanvas = document.createElement('canvas'); this.tvCanvas.width = 256; this.tvCanvas.height = 192;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas); this.tvTex.minFilter = THREE.LinearFilter; this.tvTex.generateMipmaps = false;
    const sg = new THREE.PlaneGeometry(0.58, 0.44, 8, 6); const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / 0.29, y = sp.getY(i) / 0.22; sp.setZ(i, 0.015 * (1 - x * x * 0.6) * (1 - y * y * 0.6)); }
    sg.computeVertexNormals();
    this.tvMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tvTex }, power: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float power, time; varying vec2 vUv;
        void main(){ vec2 c = vUv - 0.5; vec2 uv = c * (1.0 + 0.08 * dot(c, c)) + 0.5;
          vec3 glass = vec3(0.03, 0.035, 0.035) + 0.03 * smoothstep(0.3, 0.0, abs(vUv.x * 0.8 - vUv.y + 0.3));
          vec3 col = texture2D(map, uv).rgb * (0.86 + 0.14 * sin(uv.y * 600.0));
          col *= 1.0 - dot(c, c) * 1.3;
          gl_FragColor = vec4(glass + col * power * 1.1, 1.0); }`,
    });
    this.tvScreen = new THREE.Mesh(sg, this.tvMat); this.tvScreen.rotation.y = -Math.PI / 2; this.tvScreen.position.set(1.575, 0.84, 4.8); s.add(this.tvScreen);
    this.tvState = 'off'; this.tvFeed = null; this.tvSource = 'sala'; this.tvLight = new THREE.Color(0, 0, 0);
    const tvs = this.tvSpot = new THREE.SpotLight(0x8899aa, 0, 7, 1.2, 0.8, 2);
    tvs.position.set(1.5, 0.85, 4.8); tvs.target.position.set(-1, 0.8, 4.8);
    tvs.castShadow = true; tvs.shadow.mapSize.set(512, 512); tvs.shadow.bias = -0.002; tvs.shadow.camera.near = 0.1;
    this.scene.add(tvs); this.scene.add(tvs.target);
    this.tvFill = new THREE.PointLight(0x9aa8c0, 0, 4.5, 1.8); this.tvFill.position.set(1.1, 1.0, 4.8); this.scene.add(this.tvFill);
    // telefone da sala e mesinha
    this.box(0.4, 0.6, 0.4, wood, -0.55, 0.3, 3.75, s);
    this.box(0.2, 0.08, 0.22, lam({ color: 0xb8aa88 }), -0.55, 0.64, 3.75, s);
    this.salaHandset = this.box(0.22, 0.045, 0.06, lam({ color: 0xb8aa88 }), -0.55, 0.7, 3.75, s);
    // cristaleira com a louça
    this.box(0.42, 1.9, 1.0, wood, -2.38, 0.95, 4.6, s);
    const glass = new THREE.MeshPhongMaterial({ color: 0x223038, shininess: 90, specular: 0x556677 });
    this.box(0.01, 0.9, 0.9, glass, -2.165, 1.35, 4.6, s);
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), lam({ color: 0xe8e4dc })); p.position.set(-2.2, 1.2 + (i % 2) * 0.35, 4.3 + Math.floor(i / 2) * 0.55); p.rotation.y = Math.PI / 2; s.add(p); }
    // quadro da Santa Ceia
    const ceia = document.createElement('canvas'); ceia.width = 256; ceia.height = 128;
    { const g = ceia.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#3a2a18'); gr.addColorStop(1, '#6a4a28'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#c8a870'; g.fillRect(20, 76, 216, 14); g.fillStyle = '#e8d8b0'; g.fillRect(20, 74, 216, 4);
      for (let i = 0; i < 13; i++) { const x = 30 + i * 16.5; g.fillStyle = ['#7a2a1a', '#2a3a6a', '#5a5a2a', '#6a3a5a'][i % 4]; g.fillRect(x - 6, 50, 12, 28); g.fillStyle = '#c89a70'; g.beginPath(); g.arc(x, 44, 6, 0, 7); g.fill(); if (i === 6) { g.strokeStyle = '#f0d890'; g.lineWidth = 2; g.beginPath(); g.arc(x, 44, 9, 0, 7); g.stroke(); } }
      g.strokeStyle = '#b08840'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 128); }
    const cq = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), lam({ map: new THREE.CanvasTexture(ceia) })); cq.position.set(0.4, 1.65, Z0 + 0.008); s.add(cq);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), lam({ map: T.tapete, color: 0x9a8a7a })); rug.rotation.x = -Math.PI / 2; rug.position.set(0.3, 0.004, 5.0); this.add(rug, s, false, true);
    // ---- cozinha
    const tileW = lam({ color: 0xd8d4c8 });
    const cab = lam({ map: T.madeira, color: 0xd8c8a8 });
    this.box(2.6, 0.86, 0.6, cab, -1.3, 0.43, 8.0, s);                    // balcão
    this.box(2.62, 0.04, 0.62, lam({ color: 0x4a4a4a }), -1.3, 0.88, 8.0, s);   // tampo de granito
    this.box(0.5, 0.05, 0.36, M.preto, -1.4, 0.88, 8.0, s);                // pia
    this.box(0.03, 0.25, 0.03, M.cinza, -1.4, 1.02, 8.22, s);
    this.box(2.6, 0.6, 0.35, cab, -1.3, 2.0, 8.12, s);                     // armário de cima
    this.box(2.6, 0.5, 0.01, tileW, -1.3, 1.15, 8.295, s);                 // azulejo
    // filtro de barro
    const clay = lam({ color: 0xa0522d });
    const f1 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.28, 12), clay); f1.position.set(-0.35, 1.04, 8.0); this.add(f1, s);
    const f2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.28, 12), clay); f2.position.set(-0.35, 1.33, 8.0); this.add(f2, s);
    this.box(0.03, 0.03, 0.06, M.cinza, -0.35, 0.95, 7.86, s);
    // micro-ondas com o relógio piscando
    this.box(0.48, 0.28, 0.36, lam({ color: 0xd0ccc0 }), -2.2, 1.04, 8.02, s);
    this.box(0.3, 0.2, 0.01, M.preto, -2.27, 1.04, 7.835, s);
    this.microCanvas = document.createElement('canvas'); this.microCanvas.width = 32; this.microCanvas.height = 12;
    this.microTex = new THREE.CanvasTexture(this.microCanvas);
    const mf = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.025), new THREE.MeshBasicMaterial({ map: this.microTex })); mf.position.set(-2.03, 1.1, 7.834); mf.rotation.y = Math.PI; s.add(mf);
    // fogão
    this.box(0.56, 0.86, 0.6, lam({ color: 0xe0dcd0 }), 0.62, 0.43, 8.0, s);
    for (const [dx, dz] of [[-0.13, -0.12], [0.13, -0.12], [-0.13, 0.12], [0.13, 0.12]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), M.preto); b.position.set(0.62 + dx, 0.875, 8.0 + dz); s.add(b); }
    // geladeira com ímãs
    this.box(0.72, 1.72, 0.66, lam({ color: 0xe8e4d6 }), 1.66, 0.86, 7.95, s);
    this.box(0.02, 0.35, 0.03, M.cinza, 1.36, 1.05, 7.6, s);
    const mag = (x, y, c) => this.box(0.05, 0.05, 0.015, lam({ color: c }), x, y, 7.605, s);
    mag(1.5, 1.5, 0xd02020); mag(1.85, 1.35, 0x2050c0); mag(1.75, 0.85, 0xf0c020); mag(1.6, 1.33, 0xc81818);
    // mesa da cozinha com toalha xadrez e cadeiras
    const tc = document.createElement('canvas'); tc.width = tc.height = 64;
    { const g = tc.getContext('2d'); g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(190,30,30,0.6)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 8, 64); g.fillRect(0, i, 64, 8); } }
    const tt = new THREE.CanvasTexture(tc); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(3, 2);
    this.box(1.15, 0.03, 0.8, lam({ map: tt }), -1.1, 0.76, 6.9, s);
    this.box(1.17, 0.12, 0.82, lam({ map: tt }), -1.1, 0.7, 6.9, s);
    for (const [dx, dz] of [[-0.5, -0.33], [0.5, -0.33], [-0.5, 0.33], [0.5, 0.33]]) this.box(0.04, 0.64, 0.04, wood, -1.1 + dx, 0.32, 6.9 + dz, s);
    for (const [x, z, r] of [[-1.1, 6.35, 0], [-1.1, 7.45, Math.PI], [-1.85, 6.9, Math.PI / 2], [-0.35, 6.9, -Math.PI / 2]]) {
      const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = r; s.add(ch);
      this.box(0.4, 0.04, 0.4, wood, 0, 0.45, 0, ch); this.box(0.4, 0.45, 0.04, wood, 0, 0.7, -0.19, ch);
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) this.box(0.03, 0.45, 0.03, wood, dx, 0.22, dz, ch);
    }
    // relógio de parede parado em 05:47
    const rc = document.createElement('canvas'); rc.width = rc.height = 64;
    { const g = rc.getContext('2d'); g.fillStyle = '#f0ece0'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#333'; g.fillRect(32 + Math.sin(a) * 25 - 1, 32 - Math.cos(a) * 25 - 1, 2, 3); }
      const hand = (a, l, w) => { g.strokeStyle = '#111'; g.lineWidth = w; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.sin(a) * l, 32 - Math.cos(a) * l); g.stroke(); };
      hand((5 + 47 / 60) / 12 * Math.PI * 2, 15, 3); hand(47 / 60 * Math.PI * 2, 23, 2); }
    const rq = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), lam({ map: new THREE.CanvasTexture(rc) })); rq.position.set(X0 + 0.01, 1.95, 6.9); rq.rotation.y = Math.PI / 2; s.add(rq);
    // luzes: luar pelas janelas, LED verde do micro-ondas
    const sv = () => this.sala.visible;
    this.dyn(new THREE.PointLight(0x6a80b0, 1.1, 5, 1.6), 1.7, 1.6, 6.25, sv);
    this.dyn(new THREE.PointLight(0x6a80b0, 0.9, 4.5, 1.6), -1.4, 1.6, 7.9, sv);
    this.dyn(new THREE.PointLight(0x30ff60, 0.05, 1.2, 2), -2.03, 1.1, 7.75, sv);
  }

  // quarto da mãe: um "set" isolado, visto só numa cena curta pela fresta da porta
  buildMomRoom() {
    const r = this.momRoom = new THREE.Group(); r.position.set(40, 0, 0); this.scene.add(r); r.visible = false;
    const wm = lam({ map: T.parede, color: 0xc8b0b8 });
    this.wall(-1.6, 1.6, -0.1, 0, -1.6, 1.6, lam({ map: T.piso }), 1, r);
    this.wall(-1.7, -1.6, 0, H, -1.6, 1.6, wm, 1, r); this.wall(1.6, 1.7, 0, H, -1.6, 1.6, wm, 1, r);
    this.wall(-1.6, 1.6, 0, H, -1.7, -1.6, wm, 1, r); this.wall(-1.6, 1.6, H, H + 0.1, -1.6, 1.6, wm, 1, r);
    const wood = lam({ map: T.madeira, color: 0x6a4a32 });
    this.box(1.5, 0.3, 2.0, wood, -0.5, 0.2, -0.55, r);
    this.box(1.5, 0.9, 0.06, wood, -0.5, 0.55, -1.57, r);
    this.box(1.42, 0.16, 1.9, lam({ map: T.lencol, color: 0xe0d0d8 }), -0.5, 0.42, -0.55, r);
    const bg = new THREE.BoxGeometry(1.5, 0.3, 1.45, 10, 2, 10); const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 8 + p.getZ(i) * 5) * 0.015 + (p.getY(i) > 0 && Math.abs(p.getX(i) - 0.32) < 0.25 && p.getZ(i) < 0.6 ? 0.12 : 0));
    bg.computeVertexNormals();
    this.momBlanket = new THREE.Mesh(bg, lam({ map: T.cobertor, color: 0x9a7aa0 })); this.momBlanket.position.set(-0.5, 0.55, -0.02); this.add(this.momBlanket, r);
    this.box(0.6, 0.1, 0.34, lam({ map: T.lencol, color: 0xf0eae0 }), -0.18, 0.53, -1.3, r);
    this.box(0.45, 0.55, 0.4, wood, 0.7, 0.275, -1.3, r);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 10, 1, true), lam({ color: 0xe8c890, side: THREE.DoubleSide, emissive: 0x3a2a10 })); lamp.position.set(0.72, 0.8, -1.32); r.add(lamp);
    this.dyn(new THREE.PointLight(0xffa860, 1.1, 3.2, 2), 40.72, 0.75, -1.2, () => this.momRoom.visible);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 10), new THREE.MeshPhongMaterial({ color: 0x99aabb, transparent: true, opacity: 0.4 })); glass.position.set(0.58, 0.6, -1.2); r.add(glass);
    this.box(0.06, 0.005, 0.1, lam({ color: 0xc8c8d0 }), 0.82, 0.555, -1.18, r);   // cartela de remédio

    // a mãe, dormindo de lado no canto da cama de casal
    const mom = this.mom = buildCharacter('mae');
    const holder = new THREE.Group(); holder.position.set(-0.18, 0.6, 0.46); holder.rotation.x = -Math.PI / 2; holder.add(mom.root); r.add(holder);
    applyPose(mom.bones, { hipsY: 0.95, torsoX: 0, torsoY: 0, headX: -0.15, headY: 0.55, shLx: 0, shLz: 0.1, shRx: 0, shRz: -0.1, elL: -0.3, elR: -0.3, hipLx: 0, hipRx: 0, hipLz: 0.03, hipRz: -0.03, knL: 0.08, knR: 0.05, ftL: 1.1, ftR: 1.1 });
  }

  // ventilador de chão (só no verão do prólogo)
  buildFan() {
    const f = this.fan = new THREE.Group(); f.position.set(1.15, 0, 1.2); f.rotation.y = -2.3; this.scene.add(f); f.visible = false;
    const w = lam({ color: 0xd8d4c8 }), d = this.mats.preto;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 16), w); base.position.y = 0.025; this.add(base, f);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.85, 8), w); pole.position.y = 0.45; this.add(pole, f);
    const head = new THREE.Group(); head.position.y = 0.95; f.add(head);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), w); motor.rotation.x = Math.PI / 2; motor.position.z = -0.08; this.add(motor, head);
    this.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.006, 4, 24), d), head);
    this.fanBlades = new THREE.Group(); head.add(this.fanBlades);
    const bm = lam({ color: 0x5a8ab0, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 3; i++) { const g = new THREE.Group(); g.rotation.z = i * Math.PI * 2 / 3; const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.01), bm); b.position.set(0, 0.1, 0.02); g.add(b); this.fanBlades.add(g); }
  }

  // folhas do caderno do Léo (visíveis para quem procura)
  buildPages() {
    const paper = lam({ color: 0xf0ece0, side: THREE.DoubleSide });
    const sheet = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper);
    this.pageMeshes = {};
    const p1 = sheet(0.05, 0.09); p1.position.set(0.015, 0.45, -0.06); p1.rotation.set(0.3, 0.2, 0.4); this.guitar.add(p1); this.pageMeshes[1] = p1;
    const p2 = sheet(0.08, 0.05); p2.position.set(-1.992, 1.12, 0.52); p2.rotation.set(0, Math.PI / 2, 0.35); this.room.add(p2); this.pageMeshes[2] = p2;
    const p3 = sheet(0.15, 0.2); p3.position.set(1.6, 1.22, 7.6); p3.rotation.set(0, Math.PI, 0.06); this.sala.add(p3); this.pageMeshes[3] = p3;
  }
  // câmera digital da mãe, em cima da mesa (só no prólogo)
  buildDigicam() {
    const c = this.digicam = new THREE.Group(); c.position.set(-0.33, 0.775, -1.24); c.rotation.y = 0.5; this.room.add(c); c.visible = false;
    this.box(0.1, 0.06, 0.035, lam({ color: 0xa8acb4 }), 0, 0.03, 0, c);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.025, 12), this.mats.preto); lens.rotation.x = Math.PI / 2; lens.position.set(0.02, 0.03, 0.028); c.add(lens);
  }
  setPageVisible(n, v) { if (this.pageMeshes[n]) this.pageMeshes[n].visible = v; }

  // horário/estação: noite (padrão), verao (madrugada do prólogo), dia (epílogo)
  setMode(mode) {
    this.mode = mode;
    const verao = mode === 'verao', dia = mode === 'dia';
    this.rain.visible = !verao && !dia;
    this.lightningOn = !verao && !dia;
    this.windowGlass.visible = !verao;
    this.fan.visible = verao;
    this.sun.intensity = dia ? 4.5 : 0;
    if (dia) { this.ambient.color.set(0xc8d8f0); this.ambient.groundColor.set(0x6a5a48); this.ambient.intensity = 2.2; }
    else { this.ambient.color.set(0x2a3548); this.ambient.groundColor.set(0x14100c); }
    if (this.scene.fog) { this.scene.fog.color.set(dia ? 0x8a9aa8 : 0x06080b); this.scene.fog.density = dia ? 0.02 : 0.085; }
  }

  buildFigure() {
    const f = this.figure = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x030303 });
    const part = (geo, x, y, z) => { const p = new THREE.Mesh(geo, m); p.position.set(x, y, z); f.add(p); return p; };
    part(new THREE.CapsuleGeometry(0.15, 0.62, 3, 8), 0, 1.3, 0).scale.set(1, 1, 0.65);
    this.figHead = part(new THREE.SphereGeometry(0.105, 10, 8), 0, 1.92, 0.02);
    this.figHead.scale.set(0.9, 1.2, 1);
    part(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), -0.21, 1.22, 0).rotation.z = 0.06;
    part(new THREE.CapsuleGeometry(0.045, 0.8, 2, 6), 0.21, 1.22, 0).rotation.z = -0.06;
    part(new THREE.CapsuleGeometry(0.06, 0.78, 2, 6), -0.08, 0.45, 0);
    part(new THREE.CapsuleGeometry(0.06, 0.78, 2, 6), 0.08, 0.45, 0);
    f.visible = false;
    f.traverse((o) => { o.castShadow = false; });
    this.scene.add(f);
  }
  placeFigure(x, z, ry = 0, mode = 'always') {
    this.figure.position.set(x, 0, z); this.figure.rotation.y = ry;
    this.figureMode = mode;
  }

  buildCable() {
    const mat = lam({ color: 0xd8d4c8, emissive: 0x2a2824 });
    const mk = (pts) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 14, 0.009, 5, false), mat);
      m.castShadow = false; m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    this.cable = mk([[-0.45, 0.9, -1.72], [-0.3, 0.4, -1.74], [-0.12, 0.01, -1.72], [0.15, 0.01, -1.6], [0.35, 0.01, -1.3], [0.55, 0.01, 0.0], [0.7, 0.01, 1.2], [0.8, 0.01, 1.75], [0.85, 0.01, 2.3], [0.4, 0.01, 2.9], [-0.1, 0.01, 3.3], [-0.3, 0.28, 3.33]]);
    // continuação impossível pelo corredor (noite 4)
    this.cable2 = mk([[-0.3, 0.28, 3.32], [-0.6, 0.01, 3.25], [-2.0, 0.01, 2.9], [-4.0, 0.01, 2.5], [-6.0, 0.01, 2.75], [-8.0, 0.01, 2.6], [-10.0, 0.01, 2.7], [-11.6, 0.01, 2.65], [-11.9, 0.01, 2.65]]);
    this.cable2.visible = false;
  }

  // ======================================================================== estados
  setDecor(kind) {
    this.decor = kind;
    const leo = kind === 'leo';
    this.poster1.material.map = leo ? T.poster_leo : T.poster1;
    this.calendar.material.map = leo ? T.calendario_leo : T.calendario;
    this.poster2.visible = !leo;
    this.blanketMat.color.set(leo ? 0x555560 : 0xffffff);
    this.mats.parede.color.set(leo ? 0x9a9aa8 : 0xffffff);
    this.guitar.visible = !leo; this.backpack.visible = !leo; this.clothes.visible = !leo;
    this.obstacles.find((o) => o.id === 'mochila').on = !leo;
    this.hoodie.visible = leo;
    this.doorMat.map = leo ? T.porta_leo : T.porta;
    for (const m of [this.poster1.material, this.calendar.material, this.doorMat]) m.needsUpdate = true;
  }
  setLamp(on) { this.lampOn = on; }
  setPower(on) {
    this.power = on;
    if (!on) { this.lampOn = false; this.hallLightOn = false; }
  }
  setDoor(open) { this.doorTarget = open ? -1.45 : 0; }
  setTray(out) { this.trayTarget = out ? 1 : 0; }
  setChairTurned(turned) { this.chair.rotation.y = turned ? -2.3 : 0; }
  setCDTowerFallen(f) {
    this.cdTower.rotation.z = f ? 1.45 : 0;
    this.cdTower.position.set(f ? 0.35 : -0.1, f ? 0.08 : 0, f ? -1.45 : -1.6);
    this.cdsFloor.visible = f;
    this.obstacles[6].on = !f;
  }
  // corredor visível? comprido (última noite: sem sala, com o trecho impossível)?
  setHall(visible, long = false) {
    this.hall.visible = visible;
    this.longHall = long;
    this.hallEnd.position.x = long ? -12 : -4.75;
    this.items.porta_leo.pos.x = this.hallEnd.position.x + 0.15;
    this.hallFar.visible = long;
    this.archWall.visible = long;
    this.sala.visible = visible && !long;
    if (!visible || !long) this.cable2.visible = false;
  }
  surfaceAt(x, z) { return z > 1.85 ? 'piso' : 'madeira'; }
  // área onde o jogador está (decide quais sombras precisam ser recalculadas)
  areaAt(p) { return p.z > 3.4 ? 'sala' : p.z > 1.85 ? 'corredor' : 'quarto'; }

  // ======================================================================== consultas
  enable(ids) { this.enabled = new Set(ids); }
  bestItem(pos, fwd) {
    let best = null, bs = 1e9;
    for (const id of this.enabled) {
      const it = this.items[id]; if (!it) continue;
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const dot = d > 0.001 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      if (dot < -0.1 && d > 0.45) continue;
      const sc = d - dot * 0.6;
      if (sc < bs) { bs = sc; best = it; }
    }
    return best;
  }
  canStand(x, z, r = 0.22) {
    let inside = false;
    for (const a of this.walkableNow()) if (x >= a[0] + r && x <= a[2] - r && z >= a[1] + r && z <= a[3] - r) { inside = true; break; }
    if (!inside) return false;
    for (const o of this.obstacles) {
      if (!o.on || (o.hall && !this.hall.visible) || (o.sala && !this.sala.visible)) continue;
      const b = o.r;
      const cx = Math.max(b[0], Math.min(x, b[2])), cz = Math.max(b[1], Math.min(z, b[3]));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }
  walkableNow() {
    const l = [[-2.0, -1.75, 2.0, 1.75]];
    if (this.doorAngle < -1.2) { l.push([0.38, 1.2, 1.22, 2.6]); }
    if (this.hall.visible) l.push([this.hallEnd.position.x, 1.95, 2.0, 3.35]);
    if (this.sala.visible) { l.push([-2.35, 2.8, -1.45, 4.1]); l.push([-2.6, 3.45, 2.1, 8.3]); }
    return l;
  }

  // ======================================================================== quadro a quadro
  update(dt, os, player) {
    this.syncBed(player);
    if (this.cover) {
      const k = (player.pose.breath || 0) * 0.28;
      for (const { pa, base, wgt } of this.coverBreath) {
        for (let i = 0; i < pa.count; i++) pa.array[i * 3 + 1] = base[i * 3 + 1] + wgt[i] * k;
        pa.needsUpdate = true;
      }
    }
    // chuva
    const pos = this.rain.geometry.attributes.position.array;
    for (let i = 0; i < this.rainData.length; i++) {
      const d = this.rainData[i];
      d[1] -= dt * 9; d[0] -= dt * 0.8;
      if (d[1] < -0.2) { d[1] = 6.5 + Math.random(); d[0] = -4 + Math.random() * 10; }
      pos[i * 6] = d[0]; pos[i * 6 + 1] = d[1]; pos[i * 6 + 2] = d[2];
      pos[i * 6 + 3] = d[0] + 0.03; pos[i * 6 + 4] = d[1] + 0.28; pos[i * 6 + 5] = d[2];
    }
    this.rain.geometry.attributes.position.needsUpdate = true;

    // relâmpagos
    if (this.lightningOn) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashT = 14 + Math.random() * 22; this.lightning(0.3 + Math.random() * 0.6); }
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(G.t * 60)) : 0;
    this.flashLight.intensity = fl * 4.5;
    const sky = this.mode === 'dia' ? [0.6, 0.76, 0.9] : this.mode === 'verao' ? [0.07 + this.dawn * 0.25, 0.1 + this.dawn * 0.3, 0.2 + this.dawn * 0.35] : [0.04, 0.055, 0.08];
    this.skyMat.color.setRGB(sky[0] + fl * 0.6, sky[1] + fl * 0.65, sky[2] + fl * 0.8);

    // poste (pisca de vez em quando)
    const streetOn = this.power || G.flags.streetOn;
    this.streetFlicker -= dt;
    let sMul = 1;
    if (this.streetFlicker < 0) { if (Math.random() < 0.02) this.streetFlicker = 0.4 + Math.random() * 0.6; }
    else sMul = Math.random() < 0.5 ? 0.25 : 1;
    if (!streetOn) sMul = 0;
    this.street.intensity = 50 * sMul;
    this.lampHeadMat.color.setRGB(sMul > 0.5 ? 1 : 0.25 * sMul + 0.05, sMul > 0.5 ? 0.7 : 0.15 * sMul + 0.04, sMul > 0.5 ? 0.38 : 0.03);
    this.halo.material.opacity = sMul;
    this.farLight.intensity = streetOn ? 26 : 0;
    this.shaftMat.uniforms.uI.value = sMul + fl * 0.8;
    this.shaftMat.uniforms.uTime.value = G.t;
    // poeira
    const dpos = this.dustPts.geometry.attributes.position.array;
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      dpos[i * 3] = d.p.x + Math.sin(G.t * 0.21 + d.ph) * 0.08;
      dpos[i * 3 + 1] = d.p.y + Math.sin(G.t * 0.13 + d.ph * 2) * 0.12;
      dpos[i * 3 + 2] = d.p.z + Math.cos(G.t * 0.17 + d.ph) * 0.08;
    }
    this.dustPts.geometry.attributes.position.needsUpdate = true;
    this.dustPts.material.opacity = 0.32 * sMul;

    // luminária
    let lm = this.lampOn && this.power ? 1 : 0;
    if (lm && this.lampFlicker > 0) { this.lampFlicker -= dt; lm = Math.random() < 0.6 ? 0.15 : 1; }
    this.lampSpot.intensity = 7 * lm;
    this.lampLight.intensity = 1.6 * lm;
    this.lampGlow.material.opacity = lm;
    this.bulbMat.color.setRGB(0.15 + lm * 0.85, 0.13 + lm * 0.75, 0.1 + lm * 0.52);
    this.clockGlow.material.opacity = this.power ? 0.8 : 0;

    // luz do corredor por baixo da porta
    const hl = this.hallLightOn && this.power && this.doorAngle > -0.2 ? 1 : 0;
    this.gapLight.intensity = 0.12 * hl;
    this.gapMat.color.setRGB(0.08 + hl * 0.9, 0.07 + hl * 0.78, 0.05 + hl * 0.58);

    // rádio-relógio
    const txt = this.power ? clockStr() : '';
    if (txt !== this._clockTxt) {
      this._clockTxt = txt;
      const g = this.clockC.getContext('2d');
      g.fillStyle = '#100000'; g.fillRect(0, 0, 64, 24);
      g.font = 'bold 19px "Courier New", monospace'; g.fillStyle = '#ff2a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 32, 13);
      this.clockTex.needsUpdate = true;
    }
    this.clockLight.intensity = this.power ? 0.08 : 0;

    // monitor / gabinete
    const pcOn = os.state !== 'off';
    this.crt.color.copy(os.light);
    this.crt.intensity = pcOn ? 5.5 : 0;
    this.crtGlow.material.color.copy(os.light).multiplyScalar(0.9);
    this.crtGlow.material.opacity = pcOn ? 0.6 : 0;
    this.ledGlow.material.opacity = pcOn ? 0.8 : 0;
    this.ledPow.color.set(pcOn ? 0x33ff44 : 0x0a1a0a);
    this.ledMon.color.set(pcOn ? 0x33ff44 : (this.power ? 0xffaa00 : 0x111111));
    this.ledHdd.color.set(G.flags.hdd > 0 && Math.random() < 0.5 ? 0xffa020 : 0x221100);
    this.camLedMat.color.set(G.flags.camLed ? (Math.floor(G.t * 2) % 2 ? 0xff1010 : 0x550000) : 0x220000);

    // porta e bandeja
    const da = this.doorAngle;
    this.doorAngle = damp(this.doorAngle, this.doorTarget, 3.2, dt);
    this.doorPivot.rotation.y = this.doorAngle;
    if (Math.abs(this.doorAngle - da) < 1e-5) this.doorAngle = this.doorTarget === this.doorAngle ? this.doorAngle : this.doorAngle;
    this.trayOut = damp(this.trayOut, this.trayTarget, 6, dt);
    this.tray.position.z = 0.205 + this.trayOut * 0.16;

    // lanterna
    if (this.flashlightOn && player) {
      // a luz sai da lanterna na mão do Caio; o alvo é suavizado para não tremer com a animação
      const p = this._tp || (this._tp = new THREE.Vector3()), d = this._td || (this._td = new THREE.Vector3());
      player.torchRay(p, d);
      const fwd = player.forward();
      d.lerp(new THREE.Vector3(fwd.x, -0.18, fwd.z).normalize(), 0.45).normalize();
      this.flashlight.intensity = 13 * (0.95 + Math.random() * 0.05);
      this.flashlight.position.copy(p);
      const aim = p.clone().addScaledVector(d, 3);
      if (!this._aim) this._aim = aim.clone(); else this._aim.lerp(aim, 1 - Math.exp(-dt * 10));
      this.flashlight.target.position.copy(this._aim);
    } else { this.flashlight.intensity = 0; this._aim = null; }

    // Figura: respiração lenta e cabeça inclinando
    if (this.figure.visible || this.figureMode !== 'hidden') {
      this.figHead.rotation.z = Math.sin(G.t * 0.4) * 0.15 + 0.2;
      this.figure.position.y = Math.sin(G.t * 23) * 0.002;
    }
    this.figure.visible = this.figureMode === 'always';

    // TV da sala: estática, imagem ao vivo de uma câmera, ou desligada
    if (this.sala.visible) {
      const g = this.tvCanvas.getContext('2d');
      const st = this.tvState;
      if (st === 'static' || (st === 'feed' && !this.tvFeed)) {
        const img = g.createImageData(128, 96), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        const c = this._tvTmp || (this._tvTmp = document.createElement('canvas')); c.width = 128; c.height = 96; c.getContext('2d').putImageData(img, 0, 0);
        g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, 256, 192);
      } else if (st === 'feed') {
        g.imageSmoothingEnabled = false; g.drawImage(this.tvFeed, 0, 0, 256, 192);
        g.fillStyle = 'rgba(255,255,255,0.08)'; const y = (G.t * 60) % 192; g.fillRect(0, y, 256, 6);   // faixa de rolagem
        g.font = 'bold 14px "Courier New", monospace'; g.fillStyle = '#e8e8e8'; g.textAlign = 'left'; g.fillText('AV', 14, 24);
      } else { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 192); }
      this.tvTex.needsUpdate = true;
      const on = st !== 'off';
      this.tvMat.uniforms.power.value = on ? 1 : 0; this.tvMat.uniforms.time.value = G.t;
      this.tvSpot.intensity = on ? (st === 'static' ? 6 + Math.random() * 2.5 : 6.5) : 0;
      this.tvFill.intensity = on ? (st === 'static' ? 0.8 + Math.random() * 0.4 : 0.9) : 0;
      this.tvSpot.color.setRGB(0.62, 0.68, 0.78);
      this.vcrLed.color.set(Math.floor(G.t * 1.5) % 2 ? 0x00ff44 : 0x003311);
      // relógio do micro-ondas piscando 0:00
      const mg = this.microCanvas.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, 32, 12);
      if (Math.floor(G.t * 1.2) % 2) { mg.font = 'bold 10px "Courier New", monospace'; mg.fillStyle = '#3f6'; mg.textAlign = 'center'; mg.fillText('0:00', 16, 10); }
      this.microTex.needsUpdate = true;
    } else { this.tvSpot.intensity = 0; this.tvFill.intensity = 0; }
    for (const d of this.dynLights) d.light.intensity = d.cond() ? d.light.userData.base : 0;
    // ventilador do prólogo
    if (this.fan.visible) this.fanBlades.rotation.z -= dt * 22;
    // respiração da mãe (no ritmo do chiado)
    if (this.momRoom.visible && this.mom) {
      const b = this.mom.bones; const br = Math.sin(G.t * 1.9) * 0.06;
      b.chest.rotation.x = -br; this.momBlanket.position.y = 0.55 + Math.max(0, Math.sin(G.t * 1.9)) * 0.01;
    }
    // sombras: só recalcula as luzes que importam onde o jogador está
    const area = player ? this.areaAt(player.pos) : 'quarto';
    const near = { quarto: area !== 'sala', corredor: true, sala: area !== 'quarto' };
    this.street.shadow.autoUpdate = this.street.intensity > 0 && near.quarto;
    this.crt.shadow.autoUpdate = this.crt.intensity > 0 && near.quarto;
    this.lampSpot.shadow.autoUpdate = this.lampSpot.intensity > 0 && near.quarto;
    this.tvSpot.shadow.autoUpdate = this.tvSpot.intensity > 0 && near.sala;
    this.flashlight.shadow.autoUpdate = this.flashlight.intensity > 0;
    this.sun.shadow.autoUpdate = this.sun.intensity > 0;
  }

  lightning(power = 0.7) {
    this.flash = 1;
    setTimeout(() => { this.flash = Math.max(this.flash, 0.7); }, 120);
    setTimeout(() => audio.thunder(power), 600 + (1 - power) * 2500);
  }
}
