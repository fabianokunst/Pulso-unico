// PULSO ÚNICO — ponto de entrada.
import * as THREE from 'three';
import { G, tick } from './state.js';
import { audio } from './audio.js';
import { loadTextures } from './textures.js';
import { PS2Renderer } from './render.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Cams } from './cameras.js';
import { OS, OS_W, OS_H } from './os.js';
import { ui } from './ui.js';
import { Story } from './story.js';

const $ = (id) => document.getElementById(id);
const canvas = $('tela');
const renderer = new PS2Renderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x06080b, 0.085);
ui.init();
ui.setFade(1);

await loadTextures((p) => { $('barra').style.width = Math.round(p * 100) + '%'; });
const world = new World(scene);
const os = new OS();
world.screen.material = os.material;
const player = new Player(scene);
const cams = new Cams();
const story = new Story({ world, player, cams, os, renderer, scene });
player.watcher = () => cams.cornerPos();
window.__jogo = { G, world, player, cams, os, story, renderer, scene, ui, audio };

// ------------------------------------------------------------------ entrada
const keys = {};
const input = { x: 0, y: 0, run: false };
const pad = { prev: [], cursor: false };

function updateInput() {
  let x = 0, y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y += 1;
  if (keys.KeyS || keys.ArrowDown) y -= 1;
  input.run = !!(keys.ShiftLeft || keys.ShiftRight);
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g) : null;
  if (gp) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const down = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const pressed = (i) => down(i) && !pad.prev[i];
    if (G.mode === 'pc') {
      os.move(os.cursor.x + dz(ax) * 6, os.cursor.y + dz(ay) * 6);
      if (pressed(0)) os.click();
    } else { x += dz(ax); y -= dz(ay); }
    if (down(5) || down(7)) input.run = true;
    if (pressed(0)) action();
    if (pressed(1)) back();
    if (pressed(9)) togglePause();
    pad.prev = gp.buttons.map((b) => b.pressed);
  }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  input.x = x; input.y = y;
}

function action() {
  if (ui.paperOpen) { ui.closePaper(); return; }
  if (G.mode === 'boot') return start();
  if (G.mode === 'title') return newGame(0);
  ui.skipCard = true;
  if (G.paused || G.mode !== 'play' || story.busy) return;
  const it = world.bestItem(player.pos, player.forward());
  if (it) { player.interactWith(it); story.interact(it.id); }
}
function back() {
  if (ui.paperOpen) { ui.closePaper(); return; }
  if (G.mode === 'pc') story.exitPC();
  else if (G.mode === 'play' || G.paused) togglePause();
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.mode === 'boot') { start(); return; }
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { if (G.mode !== 'pc' || ui.paperOpen) action(); else ui.skipCard = true; e.preventDefault(); }
  if (e.code === 'Escape') back();
  if (e.code === 'KeyF' && G.mode !== 'pc') toggleFullscreen();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// mouse no monitor: projeta o ponteiro na tela do CRT
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitP = new THREE.Vector3();
function screenPoint(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cams.cam);
  const s = world.screen;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion()));
  plane.setFromNormalAndCoplanarPoint(n, s.getWorldPosition(new THREE.Vector3()).add(n.clone().multiplyScalar(0.01)));
  if (!ray.ray.intersectPlane(plane, hitP)) return;
  const l = s.worldToLocal(hitP.clone());
  let u = (l.x / 0.296), v = (l.y / 0.222);            // -0.5..0.5
  u /= 0.93; v /= 0.93;
  const k = 1 + 0.07 * (u * u + v * v);
  u = u * k + 0.5; v = v * k + 0.5;
  os.move(u * OS_W, (1 - v) * OS_H);
}
canvas.addEventListener('mousemove', (e) => { if (G.mode === 'pc' && !G.paused) screenPoint(e); });
canvas.addEventListener('mousedown', (e) => {
  if (G.mode === 'boot') { start(); return; }
  if (G.mode === 'pc' && !G.paused) {
    if (e.button === 2) { story.exitPC(); return; }
    screenPoint(e); os.down = true; os.click();
  }
});
addEventListener('mouseup', () => { os.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (G.mode === 'pc') os.wheel(e.deltaY); }, { passive: true });

// ------------------------------------------------------------------ menus
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
}
function togglePause() {
  if (G.mode === 'title' || G.mode === 'boot' || G.mode === 'end') return;
  G.paused = !G.paused;
  if (G.paused) ui.prompt(null);
  $('pausa').classList.toggle('show', G.paused);
  document.body.classList.toggle('pausado', G.paused);
  audio.masterVolume(G.paused ? 0.15 : 0.9, 0.3);
}
// brilho (curva de gama do pós-processo), como o ajuste de brilho dos jogos de PS2
const BRILHO = [0.9, 0.8, 0.72, 0.64, 0.56];
let brilho = 2;
try { const b = parseInt(localStorage.getItem('pulso_brilho'), 10); if (b >= 0 && b < BRILHO.length) brilho = b; } catch (e) { /* */ }
function applyBrilho() {
  if (G.mode !== 'pc') renderer.post.uniforms.gamma.value = BRILHO[brilho];
  const bar = '▮'.repeat(brilho + 1) + '▯'.repeat(BRILHO.length - brilho - 1);
  document.querySelectorAll('.brilho').forEach((b) => { b.textContent = 'BRILHO ' + bar; });
}
function cycleBrilho() {
  brilho = (brilho + 1) % BRILHO.length; applyBrilho();
  try { localStorage.setItem('pulso_brilho', String(brilho)); } catch (e) { /* */ }
}
applyBrilho();
$('mBrilho').onclick = cycleBrilho;
$('pBrilho').onclick = cycleBrilho;
$('pContinuar').onclick = () => togglePause();
$('pTela').onclick = () => toggleFullscreen();
$('pTitulo').onclick = () => location.reload();
$('pCaderno').onclick = () => story.showCaderno();
$('folha').addEventListener('click', () => ui.closePaper());

let saved = null;
try { const v = parseInt(localStorage.getItem('pulso_noite'), 10); if (v >= 0 && v <= 5) saved = v; } catch (e) { /* */ }
{ const q = parseInt(new URLSearchParams(location.search).get('noite'), 10); if (q >= 0 && q <= 5) saved = q; } // atalho: ?noite=3 (0 = prólogo)

function start() {
  if (G.mode !== 'boot') return;
  audio.init();
  $('inicio').classList.remove('show');
  G.mode = 'title';
  story.titleScene();
  $('titulo').classList.add('show');
  ui.fade(0, 3);
  if (saved !== null && saved >= 1) { $('mContinuar').style.display = ''; $('mContinuar').textContent = `CONTINUAR — NOITE ${saved}`; }
}
function newGame(n) {
  if (G.mode !== 'title') return;
  $('titulo').classList.remove('show');
  G.mode = 'cutscene';
  audio.silenceAll(1);
  ui.fade(1, 1).then(() => story.run(n));
}
$('mNovo').onclick = () => newGame(0);
$('mContinuar').onclick = () => newGame(saved ?? 0);
$('mTela').onclick = () => toggleFullscreen();

// ------------------------------------------------------------------ loop
let last = performance.now(), webcamT = 0;
const lookCam = new THREE.Vector3(-0.85, 1.0, -1.0);

function renderWebcam() {
  const wc = cams.watch;
  wc.fov = 30; wc.lookAt(lookCam);
  const prev = world.figure.visible;
  world.figure.visible = world.figureMode === 'camera' || world.figureMode === 'always';
  os.webcamCanvas = renderer.snapshot(scene, wc, 160, 120, os.webcamCanvas);
  world.figure.visible = prev;
}

// imagem ao vivo na TV da sala: a própria sala vista do canto, ou o quarto do Caio
const tvCam = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 40);
let tvT = 0;
function renderTV() {
  if (world.tvSource === 'quarto') { tvCam.position.copy(cams.cornerPos()); tvCam.lookAt(-1.0, 0.6, -0.2); tvCam.fov = 52; }
  else { tvCam.position.set(-2.45, 2.42, 3.6); tvCam.lookAt(player.pos.x, 0.9, player.pos.z); tvCam.fov = 58; }
  const prev = world.figure.visible;
  world.figure.visible = world.figureMode === 'camera' || world.figureMode === 'always';
  world.tvScreen.visible = false;          // evita o túnel infinito na própria TV
  world.tvFeed = renderer.snapshot(scene, tvCam, 128, 96, world.tvFeed);
  world.tvScreen.visible = true;
  world.figure.visible = prev;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.paused) {
    updateInput();
    tick(dt);
    player.update(dt, input, cams, world);
    cams.update(dt, player);
    os.update(dt);
    world.update(dt, os, player);
    audio.update(dt, G);
    ui.update(dt);
    if (G.mode === 'play' && !story.busy) {
      const it = world.bestItem(player.pos, player.forward());
      ui.prompt(it ? it.label : null);
    } else ui.prompt(null);
    if (os.getWin('webcam') && os.state === 'desk') {
      webcamT -= dt;
      if (webcamT <= 0) { webcamT = 1 / 15; renderWebcam(); }
    }
    if (world.sala.visible && world.tvState === 'feed') { tvT -= dt; if (tvT <= 0) { tvT = 1 / 12; renderTV(); } }
    // chiado da TV pela casa: mais alto e mais "aberto" quanto mais perto
    if (world.sala.visible && world.tvState !== 'off') {
      const d = Math.hypot(player.pos.x - 1.5, player.pos.z - 4.8) + (player.pos.z < 1.85 ? (world.doorAngle > -0.5 ? 6 : 2) : 0);
      audio.tvLevel(world.tvState === 'static' ? 1 : 0.35, d);
    } else audio.tvLevel(0, 0);
    document.body.classList.toggle('jogando', G.mode === 'play' || G.mode === 'cutscene');
    // no computador: menos bloom/borrão e gama mais neutra, para o texto da tela ficar legível
    const u = renderer.post.uniforms, pc = G.mode === 'pc' ? 1 : 0, k = 1 - Math.exp(-dt * 6);
    u.bloom.value += ((pc ? 0.025 : 0.11) - u.bloom.value) * k;
    u.smear.value += ((pc ? 0.06 : 0.22) - u.smear.value) * k;
    u.gamma.value += ((pc ? Math.max(BRILHO[brilho], 0.92) : BRILHO[brilho]) - u.gamma.value) * k;
  } else updateInput();
  renderer.render(scene, cams.cam, G.t);
  requestAnimationFrame(frame);
}

// cena de fundo para o título já fica pronta atrás da tela de início
story.titleScene();
G.mode = 'boot';
$('carregando').classList.remove('show');
$('inicio').classList.add('show');
requestAnimationFrame(frame);
