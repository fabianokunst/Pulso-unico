// Protagonista: modelo com esqueleto (character.js), animação procedural, controle relativo à câmera.
import * as THREE from 'three';
import { G, damp, clamp, waitFor } from './state.js';
import { audio } from './audio.js';
import { buildCharacter, applyPose } from './character.js';

const JOINTS = ['hipsY', 'hipsX', 'hipsZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ', 'shrug', 'breath',
  'shLx', 'shLy', 'shLz', 'shRx', 'shRy', 'shRz', 'elL', 'elR', 'foreLy', 'foreRy', 'wrL', 'wrR',
  'hipLx', 'hipRx', 'hipLz', 'hipRz', 'knL', 'knR', 'ftL', 'ftR'];

export class Player {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.heading = 0; this.speed = 0; this.phase = 0;
    this.state = 'stand';
    this.locked = false; this.typing = false; this.holdLight = false; this.phone = false;
    this.look = null;          // Vector3 para onde a cabeça olha
    this.watcher = null;       // função que devolve a posição da câmera do canto (para os olhares de relance)
    this.gest = null;          // gesto em andamento
    this.idleT = 0; this.fidget = null; this.nextFidget = 6;
    this.pose = {}; this.target = {};
    for (const j of JOINTS) { this.pose[j] = 0; this.target[j] = 0; }
    this.pose.hipsY = this.target.hipsY = 0.95;
    this.lastStepSign = 0;
    this.chars = {};
    this.setLook('caio');
  }

  // troca o modelo (caio | leo)
  setLook(kind) {
    if (!this.chars[kind]) {
      const c = buildCharacter(kind);
      const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.024, 0.17, 8), new THREE.MeshLambertMaterial({ color: 0x141414 }));
      torch.position.set(0, -0.095, 0.012); torch.visible = false; torch.castShadow = true;
      c.bones.handR.add(torch); c.torch = torch;
      this.body.add(c.root); this.chars[kind] = c;
    }
    for (const k in this.chars) this.chars[k].root.visible = k === kind;
    this.ch = this.chars[kind]; this.kind = kind;
  }
  get pos() { return this.root.position; }
  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  headWorld() { return this.ch.bones.head.localToWorld(new THREE.Vector3(0, 0.13, 0.02)); }
  // posição e direção da lanterna (na mão direita)
  torchRay(pos, dir) {
    const t = this.ch.torch; t.updateWorldMatrix(true, false);
    pos.set(0, -0.09, 0).applyMatrix4(t.matrixWorld);
    const q = t.getWorldQuaternion(new THREE.Quaternion());
    dir.set(0, -1, 0).applyQuaternion(q).normalize();
  }

  // ------------------------------------------------------------- estados
  place(x, z, heading = this.heading) {
    this.state = 'stand';
    this.root.position.set(x, 0, z); this.root.rotation.set(0, heading, 0);
    this.heading = heading; this.speed = 0; this.auto = null; this.autoTurn = null;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
  }
  sit(chair) {
    this.state = 'sit'; this.speed = 0; this.auto = null; this.autoTurn = null;
    this.heading = Math.PI;
    this.root.position.set(chair.x, 0, chair.z + 0.05); this.root.rotation.set(0, Math.PI, 0);
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
  }
  // deitado de lado sobre o ombro esquerdo, virado para o quarto, cabeça no travesseiro
  // (o cobertor que cobre o corpo é moldado pelo World.syncBed)
  lie(x = -1.64, z = 0.9) {
    this.state = 'bed'; this.speed = 0; this.auto = null; this.autoTurn = null;
    this.heading = 0;
    this.root.position.set(x, 0.65, z); this.root.rotation.set(0, 0, 0);
    // eixos do corpo: lado esquerdo → baixo, cabeça → -z (cabeceira), frente → +x (quarto)
    this.body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)));
  }
  snap() { this.computeTargets(0); for (const j of JOINTS) this.pose[j] = this.target[j]; this.applyPose(); }

  async walkTo(x, z, speed = 1.1) { this.auto = { x, z, speed }; await waitFor(() => !this.auto); }
  async turnTo(h) { this.autoTurn = h; await waitFor(() => this.autoTurn === null || this.autoTurn === undefined); }

  // gestos curtos: reach | crouch | high | flinch | rub
  gesture(type, dur = 0.9) { this.gest = { type, t: 0, dur }; this.idleT = 0; this.fidget = null; }
  interactWith(item) {
    if (this.state !== 'stand') return;
    const dx = item.pos.x - this.pos.x, dz = item.pos.z - this.pos.z;
    if (Math.hypot(dx, dz) > 0.15) this.autoTurn = Math.atan2(dx, dz);
    const y = item.pos.y;
    this.gesture(y < 0.35 ? 'crouch' : y > 1.4 ? 'high' : 'reach', y < 0.35 ? 1.3 : 0.9);
  }

  // ------------------------------------------------------------- quadro a quadro
  update(dt, input, cams, world) {
    if (this.state === 'stand') {
      let mvx = 0, mvz = 0, want = 0;
      const busy = this.gest && this.gest.type === 'crouch';
      if (this.auto) {
        const dx = this.auto.x - this.root.position.x, dz = this.auto.z - this.root.position.z, d = Math.hypot(dx, dz);
        if (d < 0.05) this.auto = null;
        else { mvx = dx / d; mvz = dz / d; want = Math.min(this.auto.speed, d * 3 + 0.3); }
      } else if (!this.locked && G.mode === 'play' && !busy) {
        const ix = input.x, iy = input.y, l = Math.hypot(ix, iy);
        if (l > 0.15) {
          const raw = Math.atan2(ix, iy);
          if (!this.basis || Math.abs(Math.atan2(Math.sin(raw - this.basis.raw), Math.cos(raw - this.basis.raw))) > 1.0) {
            const f = new THREE.Vector3(); cams.cam.getWorldDirection(f); f.y = 0; f.normalize();
            this.basis = { f, r: new THREE.Vector3(-f.z, 0, f.x), raw };
          }
          const { f, r } = this.basis;
          mvx = f.x * iy + r.x * ix; mvz = f.z * iy + r.z * ix;
          const m = Math.hypot(mvx, mvz); mvx /= m; mvz /= m;
          const tired = G.night >= 4 ? 0.9 : 1;
          want = (input.run ? 2.3 : 1.15 * tired) * Math.min(1, l);
          this.autoTurn = null;
        } else this.basis = null;
      }
      if (want > 0) {
        const th = Math.atan2(mvx, mvz);
        let dh = th - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * 11);
        this.idleT = 0; this.fidget = null;
      }
      this.speed = damp(this.speed, want, want > this.speed ? 8 : 12, dt);
      if (this.speed > 0.01) {
        const sx = Math.sin(this.heading) * this.speed * dt, sz = Math.cos(this.heading) * this.speed * dt;
        const p = this.root.position;
        if (this.auto || world.canStand(p.x + sx, p.z + sz)) { p.x += sx; p.z += sz; }
        else if (world.canStand(p.x + sx, p.z)) p.x += sx;
        else if (world.canStand(p.x, p.z + sz)) p.z += sz;
        else this.speed *= 0.5;
        this.phase += dt * this.speed * 4.6;
        const sg = Math.sign(Math.sin(this.phase));
        if (sg !== this.lastStepSign) { this.lastStepSign = sg; if (this.speed > 0.3) audio.step(world.surfaceAt ? world.surfaceAt(p.x, p.z) : 'madeira'); }
      }
      if (this.autoTurn !== null && this.autoTurn !== undefined) {
        let dh = this.autoTurn - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * 6);
        if (Math.abs(dh) < 0.03) this.autoTurn = null;
      }
      this.root.rotation.y = this.heading;
      // inquietação quando parado
      const idle = this.speed < 0.05 && !this.gest && !this.look && G.mode === 'play' && !this.holdLight && !this.phone;
      if (idle) {
        this.idleT += dt;
        if (!this.fidget && this.idleT > this.nextFidget) {
          const n = G.night || 0;
          const r = Math.random();
          const type = n >= 2 && this.watcher && r < 0.35 + n * 0.08 ? 'glance' : r < 0.6 ? 'look' : 'cold';
          this.fidget = { type, t: 0, dur: type === 'glance' ? 2.2 : type === 'cold' ? 3 : 2.6 };
          this.nextFidget = 7 + Math.random() * 8;
        }
      } else { this.idleT = 0; if (this.fidget && !idle) this.fidget = null; }
    }
    if (this.gest) { this.gest.t += dt; if (this.gest.t > this.gest.dur) this.gest = null; }
    if (this.fidget) { this.fidget.t += dt; if (this.fidget.t > this.fidget.dur) { this.fidget = null; this.idleT = 0; } }
    for (const k in this.chars) this.chars[k].torch.visible = this.holdLight;
    this.computeTargets(dt);
    const k = this.state === 'stand' ? 13 : 6;
    for (const j of JOINTS) this.pose[j] = damp(this.pose[j], this.target[j], k, dt);
    this.applyPose();
  }

  computeTargets() {
    const t = this.target, ph = this.phase, now = G.t;
    for (const j of JOINTS) t[j] = 0;
    t.hipsY = 0.95;
    const tension = clamp(((G.night || 0) - 1) / 4, 0, 1);
    t.breath = Math.sin(now * (1.5 + tension)) * (0.025 + tension * 0.015);
    let lookAt = this.look;

    if (this.state === 'stand') {
      const w = clamp(this.speed / 1.15, 0, 1), run = clamp((this.speed - 1.3) / 1.0, 0, 1);
      const A = 0.46 * w * (1 + run * 0.5), s = Math.sin(ph), c = Math.cos(ph);
      // pernas
      t.hipLx = -s * A; t.hipRx = s * A;
      t.knL = Math.max(0, c) * (0.95 + run * 0.5) * w + 0.05; t.knR = Math.max(0, -c) * (0.95 + run * 0.5) * w + 0.05;
      // braços
      t.shLx = s * 0.4 * w * (1 + run * 0.4); t.shRx = -s * 0.4 * w * (1 + run * 0.4);
      t.shLz = 0.06; t.shRz = -0.06;
      t.elL = -0.14 - 0.3 * w - run * 0.8 - Math.max(0, -s) * 0.15 * w; t.elR = -0.14 - 0.3 * w - run * 0.8 - Math.max(0, s) * 0.15 * w;
      // quadril e tronco
      t.hipsY = 0.95 - 0.018 * w - run * 0.03 + Math.abs(s) * 0.03 * w;
      t.hipsRY = s * 0.09 * w; t.hipsRZ = c * 0.035 * w;
      t.torsoY = -s * 0.12 * w; t.torsoZ = -c * 0.025 * w;
      t.torsoX = 0.03 * w + 0.18 * run;
      t.headY = s * 0.05 * w; t.headX = -0.04 * run;
      // parado: troca de peso, um joelho dobrado
      if (w < 0.2) {
        const sw = Math.sin(now * 0.45);
        t.hipsX = sw * 0.012; t.hipsRZ += sw * 0.035;
        t.hipLz = -sw * 0.03; t.hipRz = -sw * 0.03;
        t.knL += Math.max(0, -sw) * 0.12; t.knR += Math.max(0, sw) * 0.12;
        t.elL = -0.12; t.elR = -0.12; t.shLz = 0.08; t.shRz = -0.08;
        t.headX += Math.sin(now * 0.7) * 0.02;
      }
      // postura tensa nas últimas noites
      t.shrug += 0.05 * tension; t.torsoX += 0.05 * tension; t.headX += 0.04 * tension;
      // inquietações
      const f = this.fidget;
      if (f) {
        const k = Math.min(1, f.t / 0.4, (f.dur - f.t) / 0.4);
        if (f.type === 'glance' && this.watcher) lookAt = this.watcher();
        else if (f.type === 'look') { t.headY += Math.sin(f.t * 2.4) * 0.8 * k; t.headX += 0.1 * k; }
        else if (f.type === 'cold') {
          // braços cruzados, esfregando
          t.shLx = -0.42 * k; t.shRx = -0.42 * k; t.shLy = -1.15 * k; t.shRy = 1.15 * k; t.shLz = 0.02; t.shRz = -0.02;
          t.elL = -1.75 * k; t.elR = -1.75 * k;
          t.shLx += Math.sin(f.t * 9) * 0.07 * k; t.shRx -= Math.sin(f.t * 9) * 0.07 * k;
          t.shrug += 0.12 * k; t.headX += 0.12 * k;
        }
      }
      // gestos
      const g = this.gest;
      if (g) {
        const k = Math.sin(Math.min(1, g.t / g.dur) * Math.PI);
        if (g.type === 'reach') { t.shRx = -1.1 * k; t.elR = -0.3 * k; t.torsoX += 0.12 * k; t.shRz = 0.05; }
        else if (g.type === 'high') { t.shRx = -2.1 * k; t.elR = -0.25 * k; t.headX -= 0.3 * k; }
        else if (g.type === 'crouch') {
          t.hipsY = 0.95 - 0.38 * k; t.hipLx = -1.5 * k; t.hipRx = -0.9 * k; t.knL = 2.1 * k; t.knR = 1.9 * k;
          t.torsoX = 0.55 * k; t.headX = 0.3 * k; t.shRx = -0.9 * k; t.elR = -0.2 * k; t.shLx = -0.3 * k; t.elL = -0.6 * k;
          t.hipsZ = -0.05 * k;
        } else if (g.type === 'flinch') {
          t.torsoX = -0.18 * k; t.shLx = -1.2 * k; t.shRx = -1.2 * k; t.elL = -1.8 * k; t.elR = -1.8 * k; t.shrug = 0.18 * k; t.headX = -0.15 * k;
          t.hipsZ = -0.06 * k; t.knL = 0.25 * k; t.knR = 0.25 * k;
        } else if (g.type === 'rub') {
          t.shRx = -1.35 * k; t.shRz = 0.35 * k; t.elR = -2.3 * k; t.headX = 0.25 * k; t.wrR = Math.sin(g.t * 12) * 0.2 * k;
        }
      }
      if (this.holdLight) { t.shRx = -1.2; t.elR = -0.15; t.shRz = 0.06; t.wrR = 0.1; }
      if (this.phone) { t.shRx = -0.7; t.shRy = 0.6; t.shRz = -0.25; t.elR = -2.45; t.wrR = 0.25; t.headZ = -0.15; t.headX += 0.05; }
      // pés acompanham o chão
      t.ftL = -(t.hipLx + t.knL) * 0.85; t.ftR = -(t.hipRx + t.knR) * 0.85;
    } else if (this.state === 'sit') {
      t.hipsY = 0.52; t.hipsZ = -0.02;
      t.hipLx = t.hipRx = -1.42; t.knL = 1.32; t.knR = 1.42;
      t.hipLz = 0.07; t.hipRz = -0.07;
      t.torsoX = 0.12;
      if (this.typing) {
        // mão esquerda no teclado, direita no mouse
        t.shLx = -0.62; t.shLz = -0.16; t.elL = -0.95 + Math.sin(now * 17) * 0.04;
        t.shRx = -0.58; t.shRz = 0.02; t.elR = -0.92 + Math.sin(now * 3.1) * 0.03; t.foreRy = 0.15;
        t.wrL = 0.25; t.wrR = 0.2;
        t.headX = 0.14;
      } else {
        t.shLx = t.shRx = -0.32; t.elL = t.elR = -0.8; t.shLz = -0.12; t.shRz = 0.12;
        t.headX = 0.08 + Math.sin(now * 0.5) * 0.02;
      }
      t.ftL = -(t.hipLx + t.knL); t.ftR = -(t.hipRx + t.knR);
    } else if (this.state === 'bed') {
      // encolhido de lado: costas um pouco curvas, perna de baixo meio dobrada, a de cima mais à frente
      t.torsoX = 0.3; t.headX = 0.14; t.headZ = 0.05;
      t.hipLx = -0.7; t.knL = 1.05; t.hipRx = -1.15; t.knR = 1.4; t.hipRz = 0.3;
      t.ftL = 0.45; t.ftR = 0.5;
      // braço de baixo dobrado com a mão perto do rosto; o de cima apoiado ao longo do corpo
      t.shLx = -1.3; t.shLz = -0.2; t.elL = -1.95; t.wrL = 0.25;
      t.shRx = -0.35; t.shRz = 0.25; t.elR = -0.5;
      t.breath *= 1.6;
    }
    // olhar para um ponto (cabeça + um pouco do tronco)
    if (lookAt && this.state !== 'bed') {
      const hw = new THREE.Vector3(); this.ch.bones.neck.getWorldPosition(hw); hw.y += 0.1;
      const d = lookAt.clone().sub(hw);
      const inv = -this.root.rotation.y;
      const lx = d.x * Math.cos(inv) + d.z * Math.sin(inv), lz = -d.x * Math.sin(inv) + d.z * Math.cos(inv);
      const yaw = Math.atan2(lx, lz);
      const pitch = -Math.atan2(d.y, Math.hypot(lx, lz));
      t.torsoY += clamp(yaw * 0.35, -0.6, 0.6);
      t.headY = clamp(yaw * 0.65, -1.05, 1.05);
      t.headX = clamp(pitch, -0.75, 0.6);
    }
  }

  applyPose() { applyPose(this.ch.bones, this.pose); this.ch.setAsleep(this.state === 'bed'); }
}
