// Câmeras fixas estilo survival horror de PS2. A câmera principal fica no canto do quarto, perto do teto...
// e a história sabe disso.
import * as THREE from 'three';
import { G, damp, smooth } from './state.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const CAM_DEFS = {
  canto: { pos: V(1.8, 2.42, 1.6), track: true, fov: 56 },
  noroeste: { pos: V(-0.2, 2.38, -1.52), track: true, fov: 62 },
  mesa: { pos: V(-0.45, 1.45, -0.15), look: V(-0.98, 0.95, -1.35), fov: 50 },
  // fitW: tangente da meia-largura que precisa caber (o post-it ao lado da tela), até maxFov
  pc: { pos: V(-0.95, 0.998, -0.935), look: V(-0.95, 0.998, -1.3), fov: 40, fitW: 0.7, maxFov: 48 },
  cama: { pos: V(-0.4, 1.9, -1.2), look: V(-1.53, 0.55, -0.2), fov: 55 },
  corredor1: { pos: V(1.95, 2.3, 2.15), track: true, fov: 58 },
  corredor2: { pos: V(-1.4, 2.5, 2.65), track: true, fov: 52 },
  corredor3: { pos: V(-5.6, 2.5, 2.65), track: true, fov: 52 },
  sala: { pos: V(-2.45, 2.42, 3.6), track: true, fov: 60 },
  cozinha: { pos: V(1.95, 2.42, 6.45), track: true, fov: 60 },
  mae: { pos: V(40.7, 1.4, 0.3), look: V(39.85, 0.62, -1.1), fov: 52 },
};

export class Cams {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.03, 60);
    this.current = null;
    this.forced = null;           // definição forçada pela história
    this.blend = null;            // transição suave
    this.lookAt = V(0, 1, 0);
    this.creep = 0;               // quanto a câmera do canto "avançou" para dentro do quarto
    this.breath = 0;              // respiração da câmera (quem está olhando)
    this.shake = 0;
    this.cut = false;
    // câmera da webcam/fotos (sempre do canto)
    this.watch = new THREE.PerspectiveCamera(32, 4 / 3, 0.03, 40);
  }

  cornerPos(out = new THREE.Vector3()) {
    const base = CAM_DEFS.canto.pos;
    out.copy(base).lerp(V(0.2, 1.75, 0.2), this.creep);
    const b = this.breath;
    if (b > 0) { out.y += Math.sin(G.t * 1.1) * 0.012 * b; out.x += Math.sin(G.t * 0.53) * 0.008 * b; }
    return out;
  }

  zoneFor(p) {
    if (p.z > 3.4) return p.z < 6.3 ? 'sala' : 'cozinha';
    if (p.z > 1.9 || p.x < -2.05) {
      if (p.x > -3.2) return 'corredor1';
      if (p.x > -7.2) return 'corredor2';
      return 'corredor3';
    }
    if (p.x > -0.3 && p.z > 0.35) return 'noroeste';
    return 'canto';
  }

  force(name, blend = 0, extra = {}) {
    const def = typeof name === 'string' ? Object.assign({}, CAM_DEFS[name], extra, { name }) : Object.assign({ name: 'custom' }, name);
    if (blend > 0) this.blend = { from: this.cam.position.clone(), fromQ: this.cam.quaternion.clone(), fromFov: this.cam.fov, t: 0, dur: blend };
    else this.cut = true;
    this.forced = def;
  }
  release(blend = 0) {
    if (blend > 0) this.blend = { from: this.cam.position.clone(), fromQ: this.cam.quaternion.clone(), fromFov: this.cam.fov, t: 0, dur: blend };
    else this.cut = true;
    this.forced = null; this.current = null;
  }

  update(dt, player) {
    let def = this.forced;
    if (!def) {
      const z = this.zoneFor(player.pos);
      if (z !== this.current) { this.current = z; this.cut = true; }
      def = Object.assign({ name: z }, CAM_DEFS[z]);
    }
    // alvo
    const pos = def.name === 'canto' && !def.pos2 ? this.cornerPos() : (def.pos2 || def.pos).clone();
    let look;
    if (def.track) {
      const p = player.pos;
      const target = player.state === 'bed' ? V(p.x, 0.6, p.z - 0.6) : V(p.x, player.state === 'sit' ? 0.95 : 1.15, p.z);
      if (this.cut) this.lookAt.copy(target); else this.lookAt.lerp(target, 1 - Math.exp(-dt * 3.5));
      look = this.lookAt;
    } else look = def.look;
    let fov = def.fov || 55;
    if (def.fitW) fov = Math.min(def.maxFov, Math.max(fov, THREE.MathUtils.radToDeg(2 * Math.atan(def.fitW / this.cam.aspect))));

    // pose desejada
    const tmp = this._tmp || (this._tmp = new THREE.PerspectiveCamera());
    tmp.position.copy(pos); tmp.rotation.set(0, 0, 0); tmp.lookAt(look);
    if (def.roll) tmp.rotateZ(def.roll);
    if (this.blend) {
      const b = this.blend; b.t += dt;
      const k = smooth(Math.min(1, b.t / b.dur));
      this.cam.position.lerpVectors(b.from, tmp.position, k);
      this.cam.quaternion.slerpQuaternions(b.fromQ, tmp.quaternion, k);
      this.cam.fov = b.fromFov + (fov - b.fromFov) * k;
      if (b.t >= b.dur) this.blend = null;
    } else {
      this.cam.position.copy(tmp.position); this.cam.quaternion.copy(tmp.quaternion); this.cam.fov = fov;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.cam.position.x += (Math.random() - 0.5) * 0.02 * this.shake;
      this.cam.position.y += (Math.random() - 0.5) * 0.02 * this.shake;
    }
    if (def.name === 'canto' && this.breath > 0) this.cam.rotateZ(Math.sin(G.t * 0.7) * 0.004 * this.breath);
    this.cam.updateProjectionMatrix();
    this.cut = false;

    // câmera "do canto" usada pela webcam e pelas fotos
    this.cornerPos(this.watch.position);
  }
}
