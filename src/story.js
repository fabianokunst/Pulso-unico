// O roteiro: um prólogo (dezembro de 2003) e cinco noites (julho de 2004).
import * as THREE from 'three';
import { G, wait, waitFor, setClock, clockStr, playTime } from './state.js';
import { audio } from './audio.js';
import { ui } from './ui.js';
import { T, makeTex } from './textures.js';
import { NOTAS_ANTES } from './os.js';

const CHAIR = { x: -1.0, z: -0.62 };
const ROOM_ITEMS = ['pc', 'relogio', 'cama', 'janela', 'guardaroupa', 'poster', 'poster2', 'calendario', 'mural', 'cds', 'telefone', 'porta', 'violao', 'canto', 'mochila', 'estante'];
const HALL_ITEMS = ['mesinha', 'foto1', 'foto2', 'foto3', 'porta_mae', 'banheiro', 'porta_leo', 'porta'];
const SALA_ITEMS = ['arco', 'tv', 'telefone_sala', 'sofa', 'cristaleira', 'quadro_ceia', 'geladeira', 'fogao', 'filtro', 'mesa_cozinha', 'relogio_parede', 'janela_cozinha', 'microondas'];

// as cinco folhas que o Léo arrancou do caderno e escondeu pela casa ("papel ele não vê")
const PAGES = {
  1: 'a linha 3071 era de uma central velha.\ndesativaram em 98, quando trocaram tudo pra digital.\no numero devia dar "este numero de telefone nao existe".\nmas atende.\n— L.',
  2: 'nao sou o primeiro.\nachei gente no irc, num forum, numa comunidade do orkut.\ntodo mundo fala do canto.\ntodo mundo para de postar do nada.\na conta de todos vem 1 pulso.',
  3: 'ele ve por qualquer tela.\nwebcam, tv, a camera da mae, foto.\nse tem uma tela olhando, ele ta atras dela.\npapel ele nao ve.\npor isso to escrevendo aqui e escondendo.',
  4: 'nao adianta tirar da tomada.\nnao adianta arrancar o fio.\na linha so fecha do lado DE LA.\nquem olha eh que tem que desligar.\na gente aqui nao consegue.',
  5: 'se alguem do outro lado ler isso:\na minha linha ta aberta desde 14/12.\nquando desligar a do caio,\ndesliga a minha tambem.\npor favor.\n— L.',
};
const PAGE_AT = { violao: 1, poster: 2, guardaroupa: 4 };

const BASE = {
  relogio: () => [`${clockStr()}. Esse rádio-relógio adianta dois minutos desde 98.`],
  cama: ['Ainda não tô com sono.'],
  janela: ['Chovendo de novo.', 'O poste da frente pisca faz uma semana e ninguém da prefeitura vem arrumar.'],
  guardaroupa: ['Metade das roupas aí dentro era do Léo. A mãe não teve coragem de doar.'],
  poster: ['Abismo 56K. O Léo foi no show em Porto Alegre e me trouxe esse pôster.', 'Eu nunca disse obrigado.'],
  poster2: ['Penta, 2002. A gente gritou tanto que o vizinho chamou a polícia.'],
  calendario: ['Julho de 2004. Vestibular de novo em dezembro.', 'Dia 14 de dezembro vai fazer um ano.'],
  mural: ['Eu e o Léo na praia, em 2001. Ele tá de olho fechado em todas as fotos.', 'Dizia que era de propósito. Que um dia eu ia entender.'],
  cds: ['Uns cinquenta CDs piratas da feira e os que o Léo gravava.', 'Ele escrevia o nome de tudo com caneta de retroprojetor.'],
  telefone: ['A extensão do telefone. O fio vai daqui até a mesinha do corredor.', 'Quinze metros de fio. Foi o Léo que passou.'],
  porta: ['A mãe já foi deitar. Melhor não ficar andando pela casa.'],
  violao: ['Três acordes. É tudo que eu sei. O Léo sabia o resto.'],
  canto: ['...', 'Às vezes dá a impressão de que tem alguém olhando daqui de cima.'],
  mochila: ['Apostila de química do cursinho. Nem abri.'],
  estante: ['O som, uns livros que eu nunca li e o videogame. Destravado, claro.'],
};

export class Story {
  constructor(ctx) {
    Object.assign(this, ctx);   // world, player, cams, os, renderer, scene
    this.busy = false;
    this.handlers = {};
    this.texts = {};
    this.pcLock = false;
    this.hasCD = false;
  }

  // ------------------------------------------------------------------ utilidades
  async think(...lines) { for (const l of lines) await ui.say(l, this.who || 'Caio'); }
  setTexts(over = {}) { this.texts = Object.assign({}, BASE, over); }

  async interact(id) {
    if (this.busy) return;
    this.busy = true;
    try {
      // folhas escondidas nas coisas do Léo (no quarto do Caio)
      const pg = PAGE_AT[id];
      if (pg && G.night >= 1 && this.world.decor === 'caio' && !this.hasPage(pg) && (pg !== 4 || G.night >= 3)) {
        const where = { 1: ['Tem um papel enfiado dentro do violão.'], 2: ['Tem uma folha dobrada atrás do pôster.', 'O pôster que o Léo me deu.'], 4: ['No bolso de uma calça do Léo...', 'Uma folha dobrada em quatro.'] }[pg];
        await this.think(...where);
        await this.collectPage(pg);
        this.busy = false; return;
      }
      const h = this.handlers[id];
      if (h) await h();
      else {
        let t = this.texts[id];
        if (typeof t === 'function') t = t();
        if (t) await this.think(...(Array.isArray(t) ? t : [t]));
      }
    } catch (e) { console.error(e); }
    this.busy = false;
  }

  async enterPC() {
    G.mode = 'cutscene'; ui.prompt(null);
    await ui.fade(1, 0.3);
    this.world.setChairTurned(false);
    this.player.sit(CHAIR); this.player.typing = true; this.player.snap();
    this.cams.force('pc');
    document.body.classList.add('pc');
    await ui.fade(0, 0.35);
    G.mode = 'pc';
    if (!this.pcHint) { this.pcHint = true; ui.aviso('Use o <kbd>mouse</kbd> para clicar na tela · <kbd>Esc</kbd> para levantar', 6); }
  }
  async exitPC(forced = false) {
    if (G.mode !== 'pc') return;
    if (this.pcLock && !forced) { ui.aviso('Agora não dá pra sair do computador.'); return; }
    G.mode = 'cutscene';
    document.body.classList.remove('pc');
    await ui.fade(1, 0.25);
    this.player.place(-0.45, -0.38, 2.6); this.player.typing = false; this.player.snap();
    this.cams.release();
    await ui.fade(0, 0.3);
    G.mode = 'play';
  }
  async toBed() {
    G.mode = 'cutscene'; ui.prompt(null); ui.objective(null);
    await ui.fade(1, 1);
    this.player.lie(); this.player.snap();
    this.cams.force('canto');
  }

  base(n) {
    const w = this.world, os = this.os;
    G.night = n; G.flags = {};
    try { localStorage.setItem('pulso_noite', String(n)); } catch (e) { /* sem armazenamento */ }
    w.setMode('noite'); w.setDecor('caio'); w.setHall(false); w.setDoor(false); w.doorAngle = 0; w.setTray(false); w.cdDisc.visible = false;
    w.tvState = 'off'; w.momRoom.visible = false; w.digicam.visible = false;
    for (const n of [1, 2, 3]) w.setPageVisible(n, !this.hasPage(n));
    w.setPower(true); w.lampOn = true; w.lampFlicker = 0; w.hallLightOn = true; w.lightningOn = true;
    w.flashlightOn = false; w.flashlightMesh.visible = true; this.player.holdLight = false;
    w.setChairTurned(false); w.setCDTowerFallen(false); w.placeFigure(0, 0, 0, 'hidden'); w.figure.traverse((o) => { o.castShadow = false; });
    w.ambient.intensity = 0.7; w.ambient.color.set(0x2a3548); w.camFlash.intensity = 0;
    os.reset('caio'); os.on = {};
    setClock(23, 57); G.clock.running = true;
    this.cams.creep = [0, 0.1, 0.18, 0.26, 0.36][n - 1];
    this.cams.breath = [0, 0.7, 1.1, 1.6, 2.2][n - 1];
    this.cams.release();
    this.player.place(0.8, 1.2, Math.PI); this.player.typing = false; this.player.look = null; this.player.snap();
    this.player.setLook('caio');
    audio.ambQuarto({ chuva: 1, drone: [0, 0.25, 0.4, 0.55, 0.8][n - 1] });
    this.who = 'Caio'; this.player.phone = false;
    audio.heartBpm = 0;
    this.pcLock = false; this.hasCD = false;
    this.handlers = {}; this.setTexts();
    this.world.enable(ROOM_ITEMS);
    document.body.classList.remove('pc');
  }

  // foto tirada "do canto" (com flash) — usada no CD do Léo e no corredor
  photo({ pose = 'sit', figure = null, shirt = null, date = '', look }) {
    const p = this.player, w = this.world, cam = this.cams.watch;
    const saved = { state: p.state, pos: p.root.position.clone(), rot: p.root.rotation.clone(), body: p.body.rotation.clone(), heading: p.heading, typing: p.typing };
    if (pose === 'bed') p.lie(); else if (pose === 'sit') { p.sit(CHAIR); p.typing = true; } else if (pose === 'none') p.root.visible = false;
    p.snap();
    const prevLook = p.kind;
    if (shirt) p.setLook('leo'); else p.setLook('caio');
    w.syncBed(p);
    const chairRot = w.chair.rotation.y; w.setChairTurned(false);
    const figPos = w.figure.position.clone(), figRot = w.figure.rotation.y;
    if (figure) { w.figure.position.set(figure[0], 0, figure[1]); w.figure.rotation.y = figure[2]; w.figure.visible = true; }
    const lampWas = w.lampSpot.intensity; w.lampSpot.intensity = 0; w.lampLight.intensity = 0;
    const flashWas = w.camFlash.intensity;
    w.camFlash.color.set(0xffffff); w.camFlash.position.copy(this.cams.cornerPos()); w.camFlash.intensity = 16;
    cam.position.copy(this.cams.cornerPos()); cam.fov = 52; cam.lookAt(look || new THREE.Vector3(-0.9, 0.7, -0.6));
    const c = this.renderer.snapshot(this.scene, cam, 256, 192);
    w.camFlash.intensity = flashWas; w.lampSpot.intensity = lampWas;
    w.chair.rotation.y = chairRot;
    w.figure.visible = false; w.figure.position.copy(figPos); w.figure.rotation.y = figRot;
    p.root.visible = true;
    p.setLook(prevLook);
    // restaura
    p.state = saved.state; p.root.position.copy(saved.pos); p.root.rotation.copy(saved.rot); p.body.rotation.copy(saved.body);
    p.heading = saved.heading; p.typing = saved.typing; p.snap();
    w.syncBed(p);
    // carimbo laranja de câmera digital
    const g = c.getContext('2d');
    g.font = 'bold 13px "Courier New", monospace'; g.textAlign = 'right'; g.fillStyle = '#ff8a1a';
    g.fillText(date, 248, 182);
    return c;
  }

  // ================================================================== título
  titleScene() {
    const w = this.world, os = this.os;
    w.setMode('noite'); w.setDecor('caio'); w.setPower(true); w.lampOn = false; w.hallLightOn = false;
    for (const n of [1, 2, 3]) w.setPageVisible(n, false);
    os.reset('caio'); os.wakeDesktop(); os.power = 1;
    let fin = null; try { fin = localStorage.getItem('pulso_final'); } catch (e) { /* */ }
    if (fin === 'C') {
      // manhã: sol pela janela, computador desligado, o Caio dormindo em paz
      w.setMode('dia'); w.lampOn = false; os.reset('caio');
      this.player.setLook('caio'); this.player.lie(); this.player.snap(); this.player.root.visible = true;
      this.cams.creep = 0; this.cams.breath = 0; this.cams.force('canto');
      setClock(9, 20); G.clock.running = false;
      audio.ambQuarto({ chuva: 0, pc: 0, crt: 0, drone: 0 }); audio.birds = true;
      return;
    }
    if (fin === 'B') {
      os.connected = true;
      os.contact('leo').nick = 'Caio - volto já';
      setTimeout(() => { if (G.mode === 'title') os.toast('Caio - volto já', 'acabou de entrar.', 'msn', true); }, 4000);
    }
    this.player.sit(CHAIR); this.player.typing = false; this.player.snap();
    this.player.root.visible = fin !== 'B';
    this.cams.creep = 0.05; this.cams.breath = 0.5;
    this.cams.force('canto');
    setClock(3, 12); G.clock.running = false;
    audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.3 });
  }

  // ================================================================== campanha
  async run(start = 0) {
    this.player.root.visible = true;
    G.startReal = Date.now();
    this.loadPages();
    if (start <= 0) { G.pages = new Set(); this.savePages(); }
    audio.birds = false;
    if (start <= 0) await this.prologue();
    if (start <= 1) await this.night1();
    if (start <= 2) await this.night2();
    if (start <= 3) await this.night3();
    if (start <= 4) await this.night4();
    await this.night5();
  }

  // ================================================================== folhas do caderno
  loadPages() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('pulso_folhas') || '[]'); } catch (e) { /* */ }
    G.pages = new Set(arr);
  }
  savePages() { try { localStorage.setItem('pulso_folhas', JSON.stringify([...G.pages])); } catch (e) { /* */ } }
  hasPage(n) { return G.pages && G.pages.has(n); }
  async collectPage(n) {
    const p = this.player, was = p.locked, mode = G.mode;
    p.locked = true; G.mode = 'cutscene';
    audio.paper();
    await ui.paper(n, PAGES[n]);
    G.pages.add(n); this.savePages();
    this.world.setPageVisible(n, false);
    audio.pickup();
    ui.aviso(`Folha guardada no caderno do Léo <b>(${G.pages.size}/5)</b>`, 4);
    p.locked = was; G.mode = mode;
  }
  // caderno (menu de pausa): todas as folhas achadas, uma embaixo da outra
  showCaderno() {
    if (!G.pages) this.loadPages();
    const list = [1, 2, 3, 4, 5].filter((n) => this.hasPage(n));
    document.getElementById('pausa').classList.remove('show');   // o caderno ocupa a tela; o menu volta ao fechar
    const el = ui.openPanel('<div class="caderno"><div class="caderno-lista"></div><small>E / Esc / clique para fechar</small></div>');
    const box = el.querySelector('.caderno-lista');
    if (!list.length) { const d = document.createElement('div'); d.className = 'papel'; d.innerHTML = '<p></p>'; d.querySelector('p').textContent = 'Nenhuma folha encontrada ainda.\n\nO Léo escondeu cinco, nas coisas dele.'; box.appendChild(d); }
    for (const n of list) { const d = document.createElement('div'); d.className = 'papel'; d.innerHTML = `<span class="num">folha ${n} de 5</span><p></p>`; d.querySelector('p').textContent = PAGES[n]; box.appendChild(d); }
  }

  // ================================================================== PRÓLOGO — o Léo, 14/12/2003
  // Sequência curta e guiada: gravar o CD → esconder o CD → tentar desconectar → avisar o Caio.
  async prologue() {
    const w = this.world, os = this.os, p = this.player;
    G.night = 0; G.flags = {};
    try { localStorage.setItem('pulso_noite', '0'); } catch (e) { /* */ }
    this.who = 'Léo';
    w.setMode('verao'); w.setDecor('leo'); w.setHall(false); w.setDoor(false); w.doorAngle = 0; w.setTray(false); w.cdDisc.visible = false;
    w.setPower(true); w.lampOn = true; w.lampFlicker = 0; w.hallLightOn = false; w.flashlightOn = false; w.flashlightMesh.visible = true;
    w.setChairTurned(false); w.setCDTowerFallen(false); w.placeFigure(0, 0, 0, 'hidden'); w.camFlash.intensity = 0;
    w.ambient.intensity = 0.7; w.ambient.color.set(0x2a3548);
    w.hoodie.visible = false; w.guitar.visible = true; w.digicam.visible = false; w.dawn = 0;
    for (const n of [1, 2, 3]) w.setPageVisible(n, false);
    w.tvState = 'off'; w.momRoom.visible = false;
    p.setLook('leo'); p.look = null; p.phone = false; p.holdLight = false;
    this.cams.creep = 0.42; this.cams.breath = 1.6; this.cams.release();
    os.reset('prologo'); os.on = {}; os.wakeDesktop(); os.power = 1; os.connected = true; os.msnLogged = true;
    os.notesText = NOTAS_ANTES;
    setClock(5, 31); G.clock.rate = 2.5; G.clock.running = false;
    this.handlers = {}; this.pcLock = true;
    this.texts = {
      poster: ['"Conectado. 44.000 bps." Mandei fazer na gráfica do centro.', 'Na época achei engraçado.'],
      calendario: ['Dezembro. Hoje é domingo, catorze.'],
      mural: ['Eu e o Caio na praia, em 2001. Eu de olho fechado em todas.'],
      janela: ['Tá clareando. Ninguém acordado na rua.'],
      ventilador: ['Trinta graus de madrugada. O ventilador só espalha o calor.'],
      cama: ['Se eu deitar agora, eu não levanto mais.'],
      relogio: () => [`${clockStr()}. Conectado desde a meia-noite.`],
      canto: ['...', 'Eu sei que você tá aí.'],
      violao: ['Prometi ensinar o resto dos acordes pro Caio.'],
      porta: ['A mãe tá dormindo.'],
      pc: ['Agora não.'],
    };
    this.world.enable(['pc', 'relogio', 'cama', 'janela', 'poster', 'calendario', 'mural', 'cds', 'porta', 'violao', 'canto', 'ventilador']);
    audio.ambQuarto({ chuva: 0, pc: 1, crt: 1, drone: 0.45 });
    audio.amb('grilos', 0.02); audio.amb('ventilador', 0.05); audio.dogs = true;
    os.on.disconnect = async () => false;
    os.on.shutdown = async () => { await os.msg('Sistema 98', 'O sistema não pode ser desligado enquanto houver uma conexão ativa.', ['OK'], 'error'); return false; };

    ui.setFade(1); G.mode = 'cutscene';
    await ui.card(['Domingo, 14 de dezembro de 2003.', 'Cinco e meia da manhã.', 'O Léo está conectado desde a meia-noite.']);
    await ui.card(['#PRÓLOGO', 'Léo'], { cls: 'titulo', hold: 1.4 });

    // ---- 1. no computador: a última anotação se escreve sozinha; depois, gravar o CD
    p.sit(CHAIR); p.typing = true; p.snap();
    this.cams.force('pc'); document.body.classList.add('pc');
    const note = os.openNotepad('notas.txt', NOTAS_ANTES, { id: 'notas', x: 30, y: 20, w: 420, h: 290 });
    note.follow = true;
    G.mode = 'pc'; G.clock.running = true;
    await ui.fade(0, 2);
    await wait(1);
    for (const ch of '\n\n14/12/03 05:31\no chiado ta mais alto.\nmeu coracao tambem.') { note.text += ch; if (ch.trim()) audio.key(); await wait(0.07 + Math.random() * 0.06); }
    os.notesText = note.text;
    await wait(1);
    await this.think('Preciso deixar tudo isso com alguém.', 'Com o Caio. Num CD.');
    os.closeWin('notas');
    os.openBurner();
    ui.objective('Gravar o CD: clique em "Gravar" na tela');
    ui.aviso('Use o <kbd>mouse</kbd> para clicar na tela do computador', 6);
    let burned = false;
    os.on.burned = () => { burned = true; };
    await waitFor(() => burned);
    ui.objective(null);
    w.setTray(true); w.cdDisc.visible = true;
    await wait(1.2);
    await this.think('Pronto. "LÉO, NÃO MEXER."');
    w.cdDisc.visible = false; w.setTray(false); audio.pickup();
    os.closeWin('burner');

    // ---- 2. esconder o CD na torre, logo ao lado da mesa
    this.pcLock = false;
    await this.exitPC(true);
    this.pcLock = true;
    p.place(0.18, -1.15, Math.atan2(-0.28, -0.45)); p.snap();
    ui.objective('Esconder o CD na torre de CDs');
    ui.aviso('<kbd>WASD</kbd> andar · <kbd>E</kbd> interagir', 6);
    let hidden = false;
    this.handlers.cds = async () => {
      if (hidden) { await this.think('Os CDs que eu gravei. Ninguém mexe aqui sem pedir.'); return; }
      hidden = true;
      audio.pickup();
      await this.think('No meio dos piratas da feira.', 'Um dia o Caio acha.');
    };
    await waitFor(() => hidden && !this.busy);
    ui.objective(null);

    // ---- 3. o canto, o coração, tentar desconectar
    G.mode = 'cutscene';
    audio.breath(0.1);
    p.look = this.cams.cornerPos().clone();
    await wait(1.2);
    await this.think('Tá olhando de novo.');
    p.look = null;
    setClock(5, 40);
    audio.heartBpm = 72;
    G.flags.modemWeird = 1;
    await this.think('Meu peito tá apertado.', 'Chega. Vou desconectar essa linha.');
    G.mode = 'play';
    ui.objective('Voltar ao computador e desconectar');
    let sat = false;
    this.handlers.pc = async () => { if (sat) return; sat = true; await this.enterPC(); };
    await waitFor(() => G.mode === 'pc');
    ui.objective('Clique em "Desconectar"');
    await os.msg('LinhaLivre', 'Conectado a LinhaLivre desde 00:00.\nDuração: 05:40:12\n\nDeseja desconectar?', ['Desconectar'], 'net');
    audio.disconnectClick();
    await wait(0.6);
    ui.objective(null);
    await os.msg('LinhaLivre', 'Não foi possível desconectar.\n\nA linha está em uso.', ['OK'], 'error');
    audio.heartBpm = 88;
    await this.think('Não cai.', 'Nunca cai.');
    await this.think('O Caio.', 'Tenho que avisar o Caio.');

    // ---- 4. avisar o Caio (mensagens que ele só vai ler sete meses depois)
    os.openMessenger();
    await wait(0.8);
    os.openChat('caio');
    ui.objective('Avisar o Caio: clique na mensagem para enviar');
    setClock(5, 41);
    await os.choose('caio', ['caio']);
    os.sys('caio', 'Caio ~ férias!!! \\o/ está offline. A mensagem será entregue quando ele entrar.');
    await wait(1.2); setClock(5, 42);
    await os.choose('caio', ['se vc ta lendo isso desliga o pc']);
    await wait(1.0); setClock(5, 44);
    await os.choose('caio', ['nao fica conectado depois da meia noite']);
    ui.objective(null);
    audio.heartBpm = 108;
    await wait(0.8);
    // a mãe não escuta
    await ui.say('MÃE!', 'Léo', 1.8);
    audio.doorShut(); this.cams.shake = 0.5;
    await wait(1.2);
    await this.think('...', 'Ela não escuta.');
    this.renderer.glitch = 0.25; await wait(0.6); this.renderer.glitch = 0;
    setClock(5, 47);
    ui.objective('Mandar a última mensagem');
    await os.choose('caio', ['ele olha pelo canto']);
    ui.objective(null);
    await wait(1.5);

    // ---- 5. o Léo se vira para a câmera
    document.body.classList.remove('pc');
    G.mode = 'cutscene';
    await ui.fade(1, 0.6);
    p.place(-0.75, -0.25, 0.75); p.snap(); p.look = this.cams.cornerPos().clone();
    this.cams.release();
    w.camFlash.color.set(0x8a9ad0); w.camFlash.position.copy(this.cams.cornerPos()); w.camFlash.intensity = 2.2;
    audio.amb('ventilador', 0.02); audio.amb('drone', 0.3);
    await ui.fade(0, 1.2);
    await wait(1.2);
    await ui.say('Você.');
    await ui.say('Eu sei que é você.');
    await ui.say('Não sei de onde você olha. Nem de quando.');
    await ui.say('Mas se um dia o Caio sentar aqui...');
    await ui.say('...desliga. Por ele.', 'Léo', 3);
    for (let bpm = 70; bpm >= 34; bpm -= 6) { audio.heartBpm = bpm; await wait(1.4); }
    await ui.say('Volto já.', 'Léo', 2.5);
    audio.heartBpm = 0;
    audio.flatline(true);
    this.renderer.glitch = 0.3;
    await wait(2.2);
    ui.setFade(1); this.renderer.glitch = 0;
    await wait(2);
    audio.flatline(false); audio.silenceAll(0.05);
    w.camFlash.intensity = 0; p.look = null;
    await ui.card(['Às 05:47, a mãe do Léo acordou com o chiado do modem.', 'A ligação continuava aberta.']);
    await ui.card(['Sete meses depois.'], { hold: 2 });
    this.who = 'Caio'; G.clock.rate = 3;
  }

  // ================================================================== NOITE 3 — a sala (nova)
  async night3() {
    const w = this.world, os = this.os, p = this.player;
    this.base(3);
    ui.setFade(1); G.mode = 'cutscene'; G.clock.running = false;
    setClock(23, 58);
    await ui.card(['#NOITE 3', 'Quarta-feira, 14 de julho de 2004', '23:58'], { cls: 'titulo', hold: 1.2 });
    w.hallLightOn = false;
    G.mode = 'play'; G.clock.running = true;
    ui.fade(0, 2.5);
    await wait(1.2);
    await this.think('A mãe tomou remédio pra dormir.', 'Disse que eu ando com cara de quem não dorme.', 'Hoje eu não chego perto desse computador.');
    ui.objective('Ficar longe do computador');
    this.setTexts({
      canto: ['Não olha pra lá.', 'Não olha pra lá.'],
      porta: ['A mãe tá dormindo. Melhor não andar pela casa.'],
    });
    let phase = 'wait';
    this.handlers.pc = async () => {
      if (phase === 'wait') { await this.think('Desligado. E vai continuar assim.'); return; }
      if (phase === 'unplug') {
        phase = 'unplugged';
        p.gesture('crouch', 1.3); await wait(0.7);
        audio.click(); audio.powerOut(); await os.turnOff();
        audio.ambQuarto({ chuva: 1, pc: 0, crt: 0, drone: 0.4 });
        await this.think('Pronto. Fora da tomada.');
        return;
      }
      if (phase === 'chat') { await this.enterPC(); return; }
      await this.think('Fora da tomada.');
    };
    await waitFor(() => G.clock.h === 0);
    os.turnOn();
    audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.5 });
    await wait(1.5);
    await this.think('Não.', 'Eu vou tirar essa coisa da tomada.');
    phase = 'unplug';
    ui.objective('Tirar o computador da tomada');
    await waitFor(() => phase === 'unplugged' && !this.busy);
    await wait(3);
    // a TV da sala liga sozinha
    w.setHall(true, false); w.tvState = 'static';
    await wait(1.2);
    await this.think('...', 'A TV da sala?', 'Se a mãe acordar com isso...');
    ui.objective('Desligar a TV da sala sem acordar a mãe');
    this.world.enable([...ROOM_ITEMS, ...HALL_ITEMS.filter((x) => x !== 'porta_leo' && x !== 'foto3'), ...SALA_ITEMS]);
    this.setTexts({
      canto: ['Não olha pra lá.'],
      foto1: ['Natal de 98. O ano em que o computador chegou em casa.'],
      foto2: ['A formatura do Léo.', 'De olho fechado.'],
      banheiro: ['...', 'Não.'],
      mesinha: ['A mesinha do telefone. O fio da minha extensão sai daqui.'],
      sofa: ['O sofá onde o Léo dormia vendo filme.', 'A mãe ainda não deixa ninguém sentar no canto dele.'],
      cristaleira: ['A louça de festa da mãe.', 'Ninguém usa desde o Natal de 2002.'],
      quadro_ceia: ['A Santa Ceia da vó.', 'Toda casa tem uma.'],
      fogao: ['Panela de arroz de ontem.'],
      filtro: ['Filtro de barro. A água mais gelada da casa.'],
      mesa_cozinha: ['A mesa da cozinha. Quatro cadeiras. A gente usa três.'],
      relogio_parede: ['O relógio da cozinha.', 'Parado em 05:47.', 'Ninguém teve coragem de trocar a pilha.'],
      janela_cozinha: ['O quintal dos fundos. Tudo escuro.'],
      microondas: ['0:00 piscando. Desde a última queda de luz.'],
      arco: ['A sala.'],
      porta_mae: ['O quarto da mãe.'],
      telefone_sala: ['O telefone da sala. O mesmo número da minha extensão.'],
      geladeira: ['A geladeira, cheia de ímã de pizzaria.'],
      tv: ['A TV.'],
    });
    let doorOpen = false, tvStep = 0, ring = false, answered = false, momSeen = false;
    this.handlers.porta = async () => {
      if (!doorOpen) { doorOpen = true; w.setDoor(true); audio.doorCreak(); await this.think('O corredor tá um breu. Só a luz da TV vindo da sala.'); return; }
      await this.think('O quarto. Eu deixei a porta aberta.');
    };
    this.handlers.tv = async () => {
      if (tvStep === 0) {
        tvStep = 1;
        p.gesture('reach'); audio.click(); w.tvState = 'off';
        await this.think('Pronto.');
        await wait(1.8);
        w.tvSource = 'sala'; w.tvState = 'feed'; audio.staticBurst(0.4, 0.12);
        await wait(1.2);
        await this.think('Ligou de novo.', 'Isso é... a sala.', 'Agora. Vista lá de cima.');
        p.look = new THREE.Vector3(-2.45, 2.42, 3.6);
        await wait(1.8);
        p.look = null;
        ui.objective('Tirar a TV da tomada');
        return;
      }
      if (tvStep === 1) {
        tvStep = 2;
        p.gesture('crouch', 1.3); await wait(0.8); audio.click();
        await this.think('Tirei da tomada.', '...', 'Continua ligada.');
        await wait(1.2);
        ring = true; audio.ringStart(); w.salaHandset.position.y = 0.7;
        await this.think('O telefone!', 'Vai acordar a mãe.');
        ui.objective('Atender o telefone antes que a mãe acorde');
        return;
      }
      await this.think('Fora da tomada. E ligada.');
    };
    this.handlers.telefone_sala = async () => {
      if (!ring) { await this.think(...this.texts.telefone_sala); return; }
      if (answered) { await this.think('Mudo.'); return; }
      answered = true; ring = false; audio.ringStop();
      G.mode = 'cutscene'; p.phone = true; w.salaHandset.visible = false;
      audio.staticBurst(0.8, 0.1);
      await wait(1);
      await ui.say('Caio? Filho... desliga isso.', 'voz', 2.8);
      await ui.say('Mãe...?');
      audio.breath(0.08);
      await wait(1.2);
      await ui.say('...ela tá dormindo, Caio.', 'voz', 2.6);
      await ui.say('...sou eu.', 'voz', 2.2);
      await ui.say('...eu escondi umas folhas do meu caderno. Pra ele não ver.', 'voz', 3.4);
      await ui.say('...papel ele não vê.', 'voz', 2.4);
      await ui.say('...uma tá na geladeira. As outras, nas minhas coisas. No teu quarto.', 'voz', 3.6);
      audio.disconnectClick();
      p.phone = false; w.salaHandset.visible = true;
      await this.think('Léo...');
      G.mode = 'play';
      ui.objective('Ver se a mãe está bem · Procurar a folha na geladeira');
    };
    this.handlers.porta_mae = async () => {
      if (!answered) { await this.think('O quarto da mãe.', 'Melhor não acordar ela.'); return; }
      if (momSeen) { await this.think('Ela continua dormindo.'); return; }
      momSeen = true;
      G.mode = 'cutscene';
      audio.doorCreak();
      await ui.fade(1, 0.6);
      w.momRoom.visible = true; this.cams.force('mae');
      await ui.fade(0, 0.8);
      await wait(1);
      await this.think('Ela tá dormindo.', 'Respirando devagar...');
      audio.tvLevel(1.2, 2);
      await this.think('...no mesmo ritmo do chiado da TV.');
      await ui.fade(1, 0.6);
      w.momRoom.visible = false; this.cams.release();
      await ui.fade(0, 0.6);
      G.mode = 'play';
    };
    this.handlers.geladeira = async () => {
      if (!this.hasPage(3)) {
        await this.think('Presa com o ímã da pizzaria...', 'A letra do Léo.');
        await this.collectPage(3);
        return;
      }
      await this.think(...this.texts.geladeira);
    };
    await waitFor(() => momSeen && this.hasPage(3) && !this.busy && G.mode === 'play');
    // a TV agora mostra o quarto do Caio
    w.tvSource = 'quarto';
    w.placeFigure(-1.0, 0.45, -Math.PI / 2, 'camera');
    audio.staticBurst(0.5, 0.15);
    await wait(1);
    await this.think('A TV...', 'Meu quarto.', 'Tem alguém do lado da minha cama. Esperando.');
    ui.objective('Voltar pro quarto');
    await waitFor(() => p.pos.z < 1.5);
    w.placeFigure(0, 0, 0, 'hidden');
    w.tvState = 'off';
    // o computador fora da tomada liga de novo
    os.turnOn();
    audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.55 });
    await this.think('...Fora da tomada.');
    await waitFor(() => os.state === 'desk');
    os.connected = true; os.msnLogged = true; os.openMessenger(); os.setOnline('leo', true);
    phase = 'chat';
    ui.objective('Ver o computador');
    await waitFor(() => G.mode === 'pc');
    this.pcLock = true;
    await wait(1);
    await os.receive('leo', 'achou?', 1.8);
    await os.choose('leo', ['achei. tava na geladeira', 'que folhas sao essas?']);
    await os.receive('leo', 'sao cinco', 1.6);
    await os.receive('leo', 'tres tao nas minhas coisas. no teu quarto', 2.4);
    await os.receive('leo', 'o violao. o poster q eu te dei. minhas roupas', 2.6);
    await os.receive('leo', 'a ultima ta comigo', 1.8);
    await os.receive('leo', 'amanha a mae pega plantao', 2);
    await os.receive('leo', 'dorme, caio', 1.5);
    os.setOnline('leo', false);
    await wait(1.5);
    await os.turnOff();
    this.pcLock = false;
    await this.exitPC(true);
    audio.ambQuarto({ chuva: 1, pc: 0, crt: 0, drone: 0.4 });
    w.setDoor(false); audio.doorShut();
    phase = 'sleep';
    ui.objective(this.hasPage(1) && this.hasPage(2) ? 'Ir dormir' : 'Procurar as folhas do Léo · Ir dormir');
    this.handlers.cama = async () => { phase = 'end'; };
    await waitFor(() => phase === 'end');
    await this.toBed();
    // última cena: a TV da sala, ligada, mostrando o Caio dormindo
    w.setHall(true, false); w.tvSource = 'quarto'; w.tvState = 'feed';
    await ui.fade(0, 1.5);
    await wait(3);
    await ui.fade(1, 0.8);
    this.cams.force({ name: 'custom', pos: new THREE.Vector3(-0.2, 1.3, 4.9), look: new THREE.Vector3(1.6, 0.84, 4.8), fov: 48 });
    await ui.fade(0, 1);
    this.cams.force({ name: 'custom', pos: new THREE.Vector3(0.7, 1.0, 4.82), look: new THREE.Vector3(1.6, 0.84, 4.8), fov: 48 }, 9);
    audio.tvLevel(0.4, 0);
    await wait(9);
    audio.hit(0.5);
    ui.setFade(1); audio.silenceAll(0.05);
    w.tvState = 'off'; w.setHall(false);
    await wait(2);
  }

  // ------------------------------------------------------------------ NOITE 1
  async night1() {
    const w = this.world, os = this.os, p = this.player;
    this.base(1);
    ui.setFade(1); G.mode = 'cutscene'; G.clock.running = false;
    await ui.card(['Julho de 2004.', 'Faz sete meses que o Léo morreu.', 'O computador dele agora fica no meu quarto.', 'A mãe reclama da conta de telefone.', 'Mas depois da meia-noite é pulso único:', 'dá pra ficar conectado a noite inteira pelo preço de uma ligação.']);
    await ui.card(['#NOITE 1', 'Segunda-feira, 12 de julho de 2004', '23:57'], { cls: 'titulo', hold: 1.2 });
    G.mode = 'play'; G.clock.running = true;
    ui.fade(0, 2.5);
    await wait(1.2);
    await ui.say('Caio? Não vai ficar a madrugada inteira nesse computador, hein. Amanhã tem cursinho.', 'Mãe');
    await ui.say('Tá, mãe. Só vou ver uns e-mails.');
    await ui.say('...Boa noite, filho.', 'Mãe');
    wait(2).then(() => { w.hallLightOn = false; audio.doorShut(); });
    ui.objective('Esperar dar meia-noite');
    ui.aviso('<kbd>WASD</kbd>/<kbd>setas</kbd> andar · <kbd>Shift</kbd> correr · <kbd>E</kbd> interagir', 6);

    let midnight = false, biaDone = false, saw = false;
    this.handlers.pc = async () => {
      if (!midnight) { await this.think(`${clockStr()}. Se eu conectar agora, cobra pulso por pulso.`, 'Melhor esperar dar meia-noite.'); return; }
      await this.enterPC();
      if (os.state === 'off') os.turnOn();
    };
    this.handlers.cama = async () => {
      if (!biaDone) { await this.think(midnight ? 'Primeiro a internet. Depois eu durmo.' : 'Ainda não tô com sono.'); return; }
      endNight();
    };
    await waitFor(() => G.clock.h === 0);
    midnight = true;
    audio.watchBeep();
    await ui.say('Meia-noite. Pulso único.');
    ui.objective('Ligar o computador e conectar à internet');

    os.on.connect = () => true;
    os.on.connected = async () => {
      ui.objective(null);
      this.pcLock = true;
      await wait(1.2);
      os.openMessenger();
    };
    os.on.disconnect = async () => { if (!biaDone) { audio.errorSound(); ui.say('Acabei de conectar. Deixa eu ver quem tá online.'); return false; } return true; };
    os.on.disconnected = () => { ui.objective('Ir dormir'); };
    os.on.off = () => { ui.objective('Ir dormir'); };
    os.on.chat = (id) => {
      if (id === 'leo' && !saw) { saw = true; wait(1.5).then(() => ui.lines(['A última coisa que ele me mandou.', '"Volto já."'])); }
      return true;
    };
    os.on.logged = async () => {
      os.on.logged = null;
      await wait(1.5);
      os.setOnline('rafa', true, false);
      os.setOnline('bia', true);
      await wait(2.5);
      await os.receive('bia', 'oiee sumido', 1.5);
      await os.choose('bia', ['oi bia, td bem?', 'eae']);
      await os.receive('bia', 'td e vc? nao te vi no cursinho hj', 2);
      const r1 = await os.choose('bia', ['nao fui. nao tava a fim', 'tava meio doente']);
      await os.receive('bia', r1 === 0 ? 'hmm' : 'aham sei', 1);
      await os.receive('bia', 'caio... vc ta bem mesmo?', 2.2);
      await os.receive('bia', 'sei q essa epoca eh dificil', 1.8);
      const r2 = await os.choose('bia', ['to bem', 'nao sei']);
      await os.receive('bia', (r2 === 0 ? 'ta bom.' : 'eh normal nao saber.') + ' se precisar conversar eu to aqui ta', 2.4);
      await wait(1.2);
      await os.receive('bia', 'ah, vc viu aquele email q ta todo mundo mandando? do numero q atende sozinho de madrugada', 3);
      await os.receive('bia', 'o rafa disse q eh coisa de um cara daqui da cidade q morreu no computador', 2.5);
      await wait(2);
      await os.receive('bia', '...ai caio desculpa. nao pensei', 2);
      await os.choose('bia', ['tudo bem', '...']);
      await os.receive('bia', 'vo dormi. amanha tem simulado. bjss', 1.8);
      await wait(1);
      os.setOnline('bia', false);
      await wait(1.5);
      await this.think('"Um cara daqui da cidade que morreu no computador."', 'Ela tava falando do Léo.');
      biaDone = true; this.pcLock = false;
      ui.objective('Desconectar e ir dormir');
    };

    let ended = false, finished = false;
    const endNight = async () => {
      if (ended) return; ended = true;
      await this.toBed();
      if (os.state !== 'off') { await this.think('Esqueci o computador ligado.'); os.connected = false; os.state = 'off'; os.power = 0; os.powerTarget = 0; os.windows = []; }
      os.on = {};
      w.setLamp(false);
      audio.ambQuarto({ chuva: 1, drone: 0.15 });
      setClock(0, 47); G.clock.running = true;
      await ui.fade(0, 2.5);
      await wait(5);
      // o computador liga sozinho
      os.turnOn();
      audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.4 });
      await wait(6.5);
      os.connect();
      await wait(4);
      this.cams.force({ name: 'custom', pos: new THREE.Vector3(-0.5, 1.4, 0.2), look: new THREE.Vector3(-0.95, 1.0, -1.25), fov: 46 }, 7);
      await waitFor(() => os.connected);
      await wait(1);
      os.msnLogged = true;
      os.openMessenger();
      await wait(2.5);
      this.cams.force('pc', 1.6);
      await wait(1.4);
      os.setOnline('leo', true);
      audio.stinger(0.8);
      await wait(3.2);
      ui.setFade(1);
      audio.silenceAll(0.05);
      await wait(2);
      finished = true;
    };
    await waitFor(() => finished);
  }

  // ------------------------------------------------------------------ NOITE 2
  async night2() {
    const w = this.world, os = this.os, p = this.player;
    this.base(2);
    ui.setFade(1); G.mode = 'cutscene'; G.clock.running = false;
    setClock(23, 58);
    await ui.card(['#NOITE 2', 'Terça-feira, 13 de julho de 2004', '23:58'], { cls: 'titulo', hold: 1.2 });
    w.setChairTurned(true); w.setCDTowerFallen(true);
    w.placeFigure(0.85, -2.02, 0, 'always');
    w.figure.traverse((o) => { o.castShadow = true; });
    w.flashT = 6;   // um relâmpago logo no começo recorta a silhueta na janela
    this.world.enable([...ROOM_ITEMS, 'cds_chao']);
    G.mode = 'play'; G.clock.running = true;
    ui.fade(0, 2.5);
    await wait(1.2);
    await ui.say('Caio, o telefone ficou ocupado a madrugada inteira. Tu deixou essa internet ligada?', 'Mãe');
    await ui.say('...Não, mãe. Eu desliguei.');
    await ui.say('Pois a conta vai vir. E não sou eu que vou pagar.', 'Mãe');
    wait(2).then(() => { w.hallLightOn = false; audio.doorShut(); });
    await this.think('Hoje de manhã o computador tava desligado. Na tomada.', 'Deve ter sido sonho.');
    ui.objective('Esperar dar meia-noite');

    let midnight = false, chairFixed = false, phase = 'wait', seenPhotos = new Set(), photoDone = false;
    this.setTexts({
      canto: ['Esse canto de novo.', 'O ar parece mais pesado aqui.'],
      cds: ['A torre caiu. Eu não ouvi nada.'],
    });
    this.handlers.janela = async () => {
      await this.think('Só a chuva. E o poste piscando.');
      if (w.figureMode === 'always') wait(6).then(() => { w.lightning(0.9); wait(0.1).then(() => { w.placeFigure(0, 0, 0, 'hidden'); w.figure.traverse((o) => { o.castShadow = false; }); }); });
    };
    this.handlers.cds_chao = async () => {
      if (this.hasCD) { await this.think('O resto é tudo CD pirata.'); return; }
      await this.think('A torre de CDs caiu. Espalhou tudo.');
      await this.think('Esse aqui eu nunca tinha visto.', '"LÉO — NÃO MEXER."');
      this.hasCD = true; w.cdFloorLeo.visible = false;
      ui.aviso('Você pegou: <b>CD-R "LÉO — NÃO MEXER"</b>', 4);
      if (midnight && os.connected) ui.objective('Ver o CD do Léo no computador');
    };
    this.handlers.pc = async () => {
      if (!chairFixed) {
        chairFixed = true;
        await this.think('Eu não deixei a cadeira assim.', 'Virada pro canto.');
        w.setChairTurned(false); audio.doorCreak();
        return;
      }
      if (!midnight) { await this.think(`${clockStr()}. Só mais um pouco.`); return; }
      await this.enterPC();
      if (os.state === 'off') os.turnOn();
    };
    this.handlers.cama = async () => {
      if (phase !== 'sleep') { await this.think('Não consigo dormir assim.'); return; }
      phase = 'end';
    };
    this.handlers.telefone = async () => {
      if (phase !== 'phone') { await this.think(...BASE.telefone); return; }
      phase = 'answered';
    };

    await waitFor(() => G.clock.h === 0);
    midnight = true; audio.watchBeep();
    await ui.say('Meia-noite.');
    ui.objective('Usar o computador');
    G.flags.modemWeird = 0.45;

    os.on.connect = () => true;
    os.on.disconnect = async () => { ui.say('Não. Primeiro eu quero entender isso.'); return false; };
    os.on.shutdown = async () => { ui.say('Não. Primeiro eu quero entender isso.'); return false; };
    os.on.connected = async () => { this.pcLock = true; await wait(1); os.openMessenger(); };
    os.on.logged = async () => {
      os.on.logged = null;
      await wait(1);
      await os.msg('Mensageiro', 'Você tem 4 mensagens offline.', ['OK'], 'msn');
      os.offlineMsg('leo', '14/12/2003 05:41', 'caio');
      os.offlineMsg('leo', '14/12/2003 05:42', 'se vc ta lendo isso desliga o pc');
      os.offlineMsg('leo', '14/12/2003 05:44', 'nao fica conectado depois da meia noite');
      os.offlineMsg('leo', '14/12/2003 05:47', 'ele olha pelo canto');
      os.openChat('leo'); audio.chime();
      await wait(4);
      await this.think('Catorze de dezembro. Cinco e quarenta e sete.', 'Foi a hora que a mãe encontrou ele.');
      await this.think('Isso não tem graça. Alguém tá usando a senha dele.');
      await os.choose('leo', ['quem ta usando essa conta?', 'isso nao tem graça']);
      os.sys('leo', 'Léo - volto já está offline. A mensagem será entregue quando ele entrar.');
      await wait(2);
      os.typing.leo = true;
      await wait(5);
      os.typing.leo = false;
      await this.think('"Está digitando"...', 'Mas ele tá offline.');
      this.pcLock = false;
      phase = 'cd';
      ui.objective(this.hasCD ? 'Ver o CD do Léo no computador' : 'Procurar o que caiu da torre de CDs');
    };
    os.on.cd = () => {
      if (os.cdInserted) return true;
      if (!this.hasCD) return true;
      (async () => {
        this.pcLock = true;
        w.setTray(true); audio.cdTray();
        await wait(0.8); w.cdDisc.visible = true; await wait(0.6); w.setTray(false);
        G.flags.hdd = 3;
        await wait(2.2);
        os.cdInserted = true;
        if (w.figureMode === 'always') { w.placeFigure(0, 0, 0, 'hidden'); w.figure.traverse((o) => { o.castShadow = false; }); }
        // gera as fotos "do canto"
        os.images['DSC00001.JPG'] = { canvas: this.photo({ pose: 'sit', shirt: 0x7a1414, figure: [-0.85, -0.05, Math.PI], date: '02/12/2003 04:31' }), date: '02/12/2003 04:31' };
        os.images['DSC00002.JPG'] = { canvas: this.photo({ pose: 'bed', figure: [-0.85, 0.05, -Math.PI / 2], date: '13/07/2004 03:12', look: new THREE.Vector3(-1.4, 0.45, 0.0) }), date: '13/07/2004 03:12' };
        this.bedPhoto = os.images['DSC00002.JPG'].canvas;
        os.files.fotos.items = [
          { name: 'DSC00001.JPG', type: 'img', date: '02/12/2003' },
          { name: 'DSC00002.JPG', type: 'img', date: '13/07/2004' },
        ];
        os.openFolder('cd');
        this.pcLock = false;
        ui.objective('Ver o que tem no CD');
      })();
      return false;
    };
    os.on.file = (it) => {
      if (it.type !== 'img') return true;
      if (it.name === 'DSC00001.JPG' && !seenPhotos.has(1)) { seenPhotos.add(1); wait(1.5).then(() => this.think('O Léo. No computador dele.', 'Tem alguém em pé atrás dele.', '...Esse é o quarto dele? Parece o meu.')); }
      if (it.name === 'DSC00002.JPG' && !seenPhotos.has(2)) { seenPhotos.add(2); wait(1.5).then(() => this.think('Treze de julho, três e doze da manhã.', 'Sou eu. Dormindo. Ontem.', 'Esse CD foi gravado em dezembro.')); }
      if (seenPhotos.size === 2 && !photoDone) { photoDone = true; wait(9).then(() => newPhoto()); }
      return true;
    };
    const newPhoto = async () => {
      this.pcLock = true;
      G.flags.hdd = 2;
      const now = '13/07/2004 ' + clockStr();
      os.images['DSC00003.JPG'] = { canvas: this.photo({ pose: 'sit', figure: [-0.92, -0.18, Math.PI], date: now }), date: now };
      os.files.fotos.items.push({ name: 'DSC00003.JPG', type: 'img', date: '13/07/2004' });
      await wait(1);
      audio.staticBurst(0.15, 0.08);
      os.openImage('DSC00003.JPG');
      audio.heartBpm = 95;
      await wait(2.5);
      await ui.say('...Essa foto é de agora.');
      audio.stinger(1);
      // vira para trás
      document.body.classList.remove('pc');
      ui.setFade(1);
      p.place(-1.0, -0.3, 0.2); p.snap(); p.look = this.cams.cornerPos().clone();
      this.cams.release();
      G.mode = 'cutscene';
      await wait(0.15);
      ui.setFade(0);
      await wait(1.6);
      await this.think('Não tem ninguém.');
      p.look = null;
      audio.heartBpm = 0;
      await wait(1);
      audio.ringStart();
      await wait(1.6);
      await this.think('O telefone?', 'Mas a linha tá ocupada com a internet...');
      phase = 'phone';
      ui.objective('Atender o telefone');
      G.mode = 'play';
      this.pcLock = false;
    };

    await waitFor(() => phase === 'answered');
    audio.ringStop();
    G.mode = 'cutscene';
    p.look = new THREE.Vector3(0.2, 0.1, -1.5);
    audio.staticBurst(1.2, 0.18);
    await wait(1.4);
    audio.breath(0.12);
    await wait(2.2);
    await ui.say('...desliga...', 'voz', 2.2);
    audio.whisper(0.1);
    await ui.say('...ele tá olhando agora, Caio...', 'voz', 3);
    audio.heartbeat();
    await wait(0.6);
    audio.disconnectClick();
    os.disconnect(true);
    os.msg('LinhaLivre', 'A conexão com LinhaLivre foi perdida.', ['OK'], 'error');
    await wait(1);
    w.lampFlicker = 1.4;
    await wait(1.5);
    audio.bulbPop(); w.setLamp(false);
    p.look = null;
    await wait(1);
    await this.think('Chega.', 'Vou dormir.');
    G.mode = 'play';
    phase = 'sleep';
    ui.objective('Ir dormir');
    await waitFor(() => phase === 'end');
    await this.toBed();
    if (os.state !== 'off') { os.state = 'off'; os.power = 0; os.powerTarget = 0; os.windows = []; }
    audio.ambQuarto({ chuva: 1, drone: 0.6 });
    await ui.fade(0, 2);
    await wait(2);
    // a câmera vai chegando perto da cama...
    this.cams.force({ name: 'custom', pos: new THREE.Vector3(-0.85, 1.75, 0.35), look: new THREE.Vector3(-1.53, 0.6, -0.55), fov: 50 }, 14);
    for (let i = 0; i < 4; i++) { audio.breath(0.06 + i * 0.03); await wait(3.4); }
    audio.hit(0.6);
    ui.setFade(1);
    audio.silenceAll(0.05);
    await wait(2.5);
  }

  // ------------------------------------------------------------------ NOITE 4
  async night4() {
    const w = this.world, os = this.os, p = this.player;
    this.base(4);
    ui.setFade(1); G.mode = 'cutscene'; G.clock.running = false;
    setClock(23, 58);
    await ui.card(['#NOITE 4', 'Quinta-feira, 15 de julho de 2004', '23:58'], { cls: 'titulo', hold: 1.2 });
    w.hallLightOn = false;
    G.mode = 'play'; G.clock.running = true;
    ui.fade(0, 2.5);
    await wait(1.2);
    await this.think('A mãe pegou plantão no hospital. Tô sozinho em casa.', 'Tirei o computador da tomada de novo.', 'Hoje eu não vou conectar.');
    ui.objective('Tentar dormir');
    this.setTexts({
      canto: ['Tem alguma coisa nesse canto.', 'Eu não vejo. Mas sei.'],
      porta: ['A casa tá vazia. Nem quero pensar no corredor escuro.'],
      janela: ['Ninguém na rua. Nenhuma janela acesa na vizinhança.'],
      cama: [],
    });
    let phase = 'wait', inBed = false;
    this.handlers.pc = async () => {
      if (phase === 'wait') { await this.think('Tá desligado. Tirei da tomada.', 'Hoje não.'); return; }
      await this.enterPC();
    };
    this.handlers.cama = async () => {
      if (phase !== 'wait' || inBed) return;
      inBed = true;
      await this.toBed();
      await ui.fade(0, 1.5);
      setClock(23, 59, 52);
    };
    await waitFor(() => G.clock.h === 0);
    phase = 'on';
    // liga sozinho, mesmo fora da tomada
    os.turnOn();
    audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.6 });
    await wait(2);
    if (inBed) {
      await wait(1);
      await ui.fade(1, 0.5);
      p.place(-0.85, 0.2, Math.PI * 0.85); p.snap(); this.cams.release();
      await ui.fade(0, 0.5);
      G.mode = 'play';
    }
    await this.think('Eu tirei da tomada...');
    await waitFor(() => os.state === 'desk');
    os.on.connect = () => true;
    G.flags.modemWeird = 0.9;
    os.connect();
    ui.objective('Desligar o computador');
    os.on.shutdown = async () => { await os.msg('Sistema 98', 'O sistema não pode ser desligado enquanto houver uma conexão ativa.', ['OK'], 'error'); return false; };
    os.on.disconnect = async () => { await os.msg('LinhaLivre', 'Não foi possível desconectar.\n\nA linha está em uso.', ['OK'], 'error'); return false; };
    os.on.connected = async () => { os.msnLogged = true; os.openMessenger(); os.setOnline('leo', true); };

    await waitFor(() => G.mode === 'pc' && os.connected);
    this.pcLock = true;
    await wait(1.5);
    await os.receive('leo', 'caio', 1.5);
    await os.receive('leo', 'nao desliga ainda', 2);
    await os.receive('leo', 'preciso q vc veja uma coisa', 2);
    await os.choose('leo', ['quem é você?', 'léo?']);
    await os.receive('leo', 'abre a camera', 2.5);
    os.extraIcons.add('webcam'); G.flags.camLed = true;
    audio.monitorBeep();
    await this.think('A webcam do Léo?', 'Isso nem funciona desde o ano passado.');
    ui.objective('Abrir a WebCam');
    let camOpen = false;
    os.on.webcam = () => { camOpen = true; return true; };
    await waitFor(() => camOpen);
    ui.objective(null);
    await wait(2.5);
    await this.think('Essa imagem não é da webcam.', 'É do canto do quarto. Lá de cima.');
    await wait(2);
    w.placeFigure(-0.75, -0.1, Math.PI, 'camera');
    audio.heartBpm = 80;
    await wait(2.5);
    audio.stinger(0.7);
    audio.heartBpm = 115;
    await ui.say('Tem alguém atrás de mim.');
    // vira
    document.body.classList.remove('pc');
    G.mode = 'cutscene';
    ui.setFade(1);
    p.place(-1.0, -0.3, 0.3); p.snap(); p.look = this.cams.cornerPos().clone();
    this.cams.release();
    await wait(0.12);
    ui.setFade(0);
    await wait(2);
    await this.think('...', 'Nada. Não tem nada aqui.');
    p.look = null;
    w.placeFigure(0, 0, 0, 'hidden');
    audio.heartBpm = 75;
    await ui.fade(1, 0.4);
    this.cams.creep = 0.55;
    p.sit(CHAIR); p.typing = true; p.snap(); this.cams.force('pc');
    document.body.classList.add('pc');
    await ui.fade(0, 0.4);
    G.mode = 'pc';
    await wait(2.5);
    await this.think('A câmera...', 'Tá mais perto?');
    audio.heartBpm = 0;
    await os.receive('leo', 'viu?', 2);
    await os.receive('leo', 'nao eh uma pessoa', 1.8);
    await os.receive('leo', 'so aparece na camera pq ele EH a camera', 2.6);
    await os.receive('leo', 'eh quem ta olhando', 2);
    await os.choose('leo', ['olhando de onde?', 'não tô entendendo']);
    await os.receive('leo', 'de fora', 2.5);
    await os.receive('leo', 'amanha. vem no meu quarto', 2.2);
    await os.receive('leo', 'segue a linha', 1.8);
    await os.receive('leo', 'volto ja', 1.5);
    os.setOnline('leo', false);
    G.flags.camLed = false;
    os.closeWin('webcam');
    await wait(2);
    // queda de energia
    w.lightning(1);
    await wait(0.4);
    audio.powerOut(); w.setPower(false); G.flags.streetOn = false;
    w.ambient.intensity = 0.65; w.ambient.color.set(0x3a4a68);
    await wait(1.5);
    await this.think('A luz caiu...', 'Mas o computador continua ligado.');
    const note = os.openNotepad('Sem título', '', { id: 'auto', x: 20, y: 20, w: 470, h: 320 });
    note.follow = true;
    for (let i = 0; i < 26; i++) {
      for (const ch of 'volto já ') { note.text += ch; if (ch !== ' ') audio.key(); await wait(0.03 + Math.random() * 0.03); }
      os.noise = Math.min(0.5, i * 0.02);
    }
    audio.staticBurst(0.6, 0.2);
    await wait(0.6);
    os.noise = 0;
    await os.turnOff();
    audio.ambQuarto({ chuva: 1, pc: 0, crt: 0, drone: 0.7, rede: 0 });
    await wait(1.5);
    w.setDoor(true); w.doorTarget = -0.7; audio.doorCreak();
    await wait(2);
    this.pcLock = false;
    await this.exitPC(true);
    w.flashT = 4;
    await this.think('A porta...');
    ui.objective('Fechar a porta');
    let closed = false;
    this.world.enable(['porta']);
    this.handlers.porta = async () => { closed = true; };
    await waitFor(() => closed);
    G.mode = 'cutscene'; ui.objective(null);
    w.setDoor(false); audio.doorShut();
    await wait(1.2);
    w.placeFigure(0.82, 0.62, 0, 'always');
    w.lightning(1);
    await wait(1.2);
    await this.think('Amanhã eu acabo com isso.');
    await p.turnTo(Math.PI);
    await wait(1.4);
    w.lightning(0.8);
    await wait(0.4);
    ui.setFade(1);
    audio.hit(0.8);
    w.placeFigure(0, 0, 0, 'hidden');
    audio.silenceAll(0.05);
    await wait(2.5);
  }

  // ------------------------------------------------------------------ NOITE 5
  async night5() {
    const w = this.world, os = this.os, p = this.player;
    this.base(5);
    ui.setFade(1); G.mode = 'cutscene'; G.clock.running = false;
    setClock(23, 59);
    await ui.card(['#NOITE 5', 'Sexta-feira, 16 de julho de 2004', 'A luz não voltou.'], { cls: 'titulo', hold: 1.2 });
    w.setPower(false); G.flags.streetOn = false; w.hallLightOn = false;
    w.ambient.intensity = 0.65; w.ambient.color.set(0x3a4a68);
    w.flashT = 6;
    audio.ambQuarto({ chuva: 1.2, drone: 0.8, rede: 0 });
    p.place(-0.5, 0.3, Math.PI); p.snap();
    G.mode = 'play';
    ui.fade(0, 2.5);
    await wait(1.2);
    await this.think('A luz não voltou desde ontem. A mãe ainda tá no plantão.', 'Tem uma lanterna na gaveta do criado-mudo.');
    ui.objective('Pegar a lanterna');
    this.setTexts({
      canto: ['Eu sei que você tá aí.'],
      cama: ['Não dá pra dormir. Não hoje.'],
      janela: ['O bairro inteiro tá sem luz.'],
      relogio: ['O rádio-relógio apagou.'],
      porta: ['Ainda não.'],
    });
    let gotLight = false, stage = 'light';
    this.handlers.relogio = async () => {
      if (gotLight) { await this.think('O rádio-relógio apagou.'); return; }
      gotLight = true;
      audio.click(); w.flashlightMesh.visible = false; w.flashlightOn = true; p.holdLight = true;
      ui.aviso('Você pegou: <b>Lanterna</b>', 3);
      await this.think('Pronto.');
    };
    this.handlers.pc = async () => {
      if (stage === 'light' || stage === 'pc') {
        if (os.state === 'off') { await this.think('Sem luz. Sem computador.', 'Pelo menos isso.'); return; }
        await this.enterPC();
        return;
      }
      await this.think('Não vou mais mexer nisso.');
    };
    await waitFor(() => gotLight);
    await wait(2);
    setClock(0, 0);
    os.turnOn();
    audio.ambQuarto({ chuva: 1.2, pc: 1, crt: 1, drone: 0.8, rede: 0 });
    await wait(1);
    await this.think('...Sem luz.', 'Como ele liga sem luz?');
    stage = 'pc';
    ui.objective('Ver o computador');
    await waitFor(() => os.state === 'desk');
    G.flags.modemWeird = 1;
    os.on.connect = () => true;
    os.on.connected = async () => { os.msnLogged = true; os.openMessenger(); os.setOnline('leo', true); };
    os.connect();
    await waitFor(() => G.mode === 'pc' && os.connected && os.msnLogged);
    this.pcLock = true;
    await wait(1.5);
    await os.receive('leo', 'vem', 2);
    await os.receive('leo', 'segue o fio', 2);
    await os.receive('leo', 'to te esperando', 2);
    await wait(1);
    await this.exitPC(true);
    this.pcLock = false;
    await this.think('Chega.', 'Vou arrancar esse fio da parede.');
    stage = 'cable';
    ui.objective('Seguir o fio do telefone');
    this.world.enable([...ROOM_ITEMS, ...HALL_ITEMS]);
    let doorOpen = false, unplugged = false, answered = false, ringing = false, toLeo = false;
    this.handlers.porta = async () => {
      if (!doorOpen) {
        doorOpen = true; w.setHall(true, true); w.setDoor(true); audio.doorCreak();
        await this.think('O corredor tá um breu.');
      } else await this.think('O fio passa por baixo da porta e vai pro corredor.');
    };
    this.handlers.mesinha = async () => {
      if (!unplugged) {
        unplugged = true;
        audio.click(); w.jack.visible = false;
        await this.think('Pronto. Arranquei da tomada.');
        await wait(1);
        audio.modem(0.8);
        await this.think('...', 'Ainda tá conectado.', 'O modem continua chiando lá no quarto.');
        await wait(2);
        ringing = true; audio.ringStart();
        await this.think('O telefone...');
        return;
      }
      if (ringing && !answered) {
        answered = true; ringing = false; audio.ringStop();
        w.hallHandset.position.y += 0.15; w.hallHandset.rotation.x = -0.6;
        G.mode = 'cutscene';
        audio.staticBurst(1.0, 0.12);
        await wait(1.2);
        audio.breath(0.1);
        await wait(1.6);
        await ui.say('...segue o fio, Caio.', 'voz', 2.6);
        await ui.say('...eu tô no meu quarto.', 'voz', 2.6);
        audio.disconnectClick();
        G.mode = 'play';
        w.cable2.visible = true;
        await wait(0.8);
        await this.think('O fio...', 'Continua.');
        ui.objective('Seguir o fio');
        w.placeFigure(-10.9, 2.65, Math.PI / 2, 'always');
        return;
      }
      await this.think('A mesinha do telefone. A lista telefônica de 2001 e o paninho de crochê da vó.');
    };
    this.setTexts(Object.assign({}, this.texts, {
      foto1: ['Natal de 98. O ano em que o computador chegou em casa.'],
      foto2: ['A foto da formatura do Léo.', 'De olho fechado.'],
      porta_mae: ['O quarto da mãe. Trancado.'],
      banheiro: ['...', 'Não.'],
    }));
    this.handlers.foto3 = async () => {
      await this.think('Essa foto não tava aqui.', 'Sou eu. Dormindo. Visto lá de cima.');
    };
    if (this.bedPhoto) { w.foto3.material.map = makeTex(this.bedPhoto, false); w.foto3.material.needsUpdate = true; }
    else { w.foto3.material.map = makeTex(this.photo({ pose: 'bed', figure: [-0.85, 0.05, -Math.PI / 2], date: '13/07/2004 03:12', look: new THREE.Vector3(-1.4, 0.45, 0.0) }), false); w.foto3.material.needsUpdate = true; }
    this.handlers.porta_leo = async () => {
      if (!answered) { await this.think('O quarto do Léo.', 'A mãe nunca mais abriu essa porta.'); return; }
      toLeo = true;
    };
    let longSaid = false;
    await waitFor(() => {
      if (answered && !longSaid && p.pos.x < -3.5) { longSaid = true; this.think('O corredor não era tão comprido.'); }
      if (w.figureMode === 'always' && p.pos.x < -6.2) { w.lightning(1); w.placeFigure(0, 0, 0, 'hidden'); }
      return toLeo;
    });

    // ---------- o quarto do Léo
    G.mode = 'cutscene'; ui.objective(null);
    await this.think('O quarto do Léo.', 'A mãe nunca mais abriu essa porta.');
    audio.doorCreak();
    await ui.fade(1, 1.2);
    w.setHall(false); w.setDecor('leo'); w.setDoor(false); w.doorAngle = 0; w.jack.visible = true; w.setPageVisible(2, false);
    w.setCDTowerFallen(false); w.flashT = 10;
    os.reset('leo'); os.on = {}; os.wakeDesktop(); os.connected = true; os.msnLogged = true;
    os.setOnline('leo', true, false); os.openMessenger();
    this.cams.creep = 0.5; this.cams.breath = 2.5;
    this.cams.release();
    p.place(0.8, 1.25, Math.PI); p.snap();
    audio.ambQuarto({ chuva: 1, pc: 1, crt: 1, drone: 0.9, rede: 0 });
    await ui.fade(0, 1.5);
    await this.think('O quarto dele...', 'É igual ao meu.', 'Sempre foi?');
    G.mode = 'play';
    ui.objective('Usar o computador do Léo');
    this.world.enable(ROOM_ITEMS);
    this.setTexts({
      poster: ['O pôster dele.', '"Não desliga."'],
      poster2: [],
      calendario: ['Dezembro de 2003. Ele riscou os dias até o 13.', 'O 14 tá circulado.'],
      cama: ['A cama dele. Do jeito que a mãe deixou.'],
      guardaroupa: ['As roupas dele.'],
      canto: ['Daqui também.'],
      mural: ['As mesmas fotos.', 'Mas aqui eu também tô de olho fechado.'],
      guardaroupa: ['As roupas dele.'],
      porta: ['Não tem mais pra onde ir.'],
      janela: ['A mesma rua. O mesmo poste apagado.'],
      relogio: ['Parado em 05:47.'],
      violao: [], mochila: [],
    });
    let sat = false;
    this.handlers.pc = async () => { if (!sat) { sat = true; ui.objective(null); await this.enterPC(); } };
    this.handlers.cama = async () => {
      if (!this.hasPage(5)) { await this.think('A cama dele. Do jeito que a mãe deixou.', 'Tem alguma coisa embaixo do travesseiro.'); await this.collectPage(5); return; }
      await this.think('A cama dele. Do jeito que a mãe deixou.');
    };
    await waitFor(() => G.mode === 'pc');
    this.pcLock = true;
    await wait(1.2);
    await os.receive('leo', 'vc veio', 2);
    await os.receive('leo', 'desculpa, caio', 2);
    await os.receive('leo', 'eu fiquei conectado tempo demais', 2.5);
    await os.choose('leo', ['léo... é você mesmo?']);
    await os.receive('leo', 'o q sobrou de mim ta na linha', 3);
    await os.receive('leo', 'escuta', 1.5);
    await os.receive('leo', 'nao tem nada atras de vc. nunca teve', 2.8);
    await os.receive('leo', 'tem alguem do outro lado. olhando por uma tela', 3);
    await os.receive('leo', 'igual vc olha essa', 2);
    await os.choose('leo', ['quem?']);
    await wait(2);
    await os.receive('leo', 'pergunta pra ele', 3);
    await wait(1.5);
    // detalhes reais de quem está jogando
    const now = new Date();
    const fmt = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const start = new Date(G.startReal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const plat = /Win/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : 'Linux';
    os.openWin({
      id: 'det', title: 'Detalhes da conexão', icon: 'net', x: 120, y: 60, w: 300, h: 220, closable: false,
      draw: (x, y, ww) => {
        const g = os.g;
        g.font = '11px Tahoma, Verdana, Arial'; g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
        const rows = [['Linha 1:', 'Caio — desde 12/07/2004'], ['Linha 2:', 'Léo — desde 14/12/2003 (aberta)'], ['Número:', '3071-0000 · tarifa: 1 pulso'], ['Conectado desde:', start + '  (' + playTime() + ')'], ['', ''], ['Terminal remoto:', plat + ' · ' + screen.width + 'x' + screen.height], ['Data remota:', fmt], ['Observando:', 'canto superior, perto da porta']];
        rows.forEach(([a, b], i) => { g.fillStyle = '#000'; g.fillText(a, x + 8, y + 14 + i * 20); g.font = 'bold 11px Tahoma, Verdana, Arial'; g.fillText(b, x + 112, y + 14 + i * 20); g.font = '11px Tahoma, Verdana, Arial'; });
      },
    });
    audio.monitorBeep();
    await wait(3);
    const years = now.getFullYear() - 2004;
    await this.think(now.toLocaleDateString('pt-BR') + '...?', years > 0 ? `Isso é daqui a ${years} anos.` : 'Isso é... agora?');
    await wait(1);
    // Caio se vira para a câmera
    document.body.classList.remove('pc');
    G.mode = 'cutscene';
    await ui.fade(1, 0.6);
    os.closeWin('det');
    p.place(-0.75, -0.2, 0.75); p.snap(); p.look = this.cams.cornerPos().clone();
    this.cams.creep = 0.45; this.cams.release();
    // a lanterna morre; o único brilho no rosto dele vem de onde você está olhando
    w.flashlightOn = false; p.holdLight = false;
    w.camFlash.color.set(0x8a9ad0); w.camFlash.position.copy(this.cams.cornerPos()); w.camFlash.intensity = 2.6;
    audio.ambQuarto({ chuva: 0.6, pc: 1, crt: 1, drone: 0.4, rede: 0 });
    await ui.fade(0, 1.2);
    await wait(1.5);
    await ui.say('Você.');
    await ui.say('Você tá aí desde a primeira noite, né?');
    await ui.say('É por isso que a linha não cai.');
    await ui.say('Enquanto você olhar, ela fica aberta.');
    await wait(0.8);
    await ui.say('Por favor.');
    await ui.say('Desconecta.', 'Caio', 2.5);
    audio.heartBpm = 70;
    const choice = await this.finalDialog(start);
    if (choice === 0) await this.endingA(); else if (choice === 2) await this.endingC(); else await this.endingB();
  }

  finalDialog(start) {
    return new Promise((res) => {
      G.mode = 'final';
      document.body.classList.add('final');
      const d = document.getElementById('dialogo');
      d.innerHTML = `<div class="win98"><div class="tb">LinhaLivre — Conexão ativa</div><div class="bd"><div class="ic"></div><div>
        <p>Você está conectado a <b>LinhaLivre</b> desde as <b>${start}</b>.</p><p>Duração: <b id="dur"></b> · Tarifa: <b>1 pulso</b></p><p>Deseja desconectar?</p></div></div>
        <div class="bt"><button id="bDesc">Desconectar</button>${this.hasPage(1) && this.hasPage(2) && this.hasPage(3) && this.hasPage(4) && this.hasPage(5) ? '<button id="bDuas">Desconectar as duas linhas</button>' : ''}<button id="bCont">Continuar olhando</button></div></div>`;
      d.className = 'show';
      let t = 0, done = false;
      const tick = setInterval(() => {
        if (G.paused) return;
        t += 0.25;
        const el = document.getElementById('dur'); if (el) el.textContent = playTime();
        audio.heartBpm = Math.max(34, 70 - t * 1.4);
        if (t > 30) finish(1);
      }, 250);
      const finish = (i) => { if (done) return; done = true; clearInterval(tick); d.className = ''; d.innerHTML = ''; document.body.classList.remove('final'); res(i); };
      document.getElementById('bDesc').onclick = () => finish(0);
      document.getElementById('bCont').onclick = () => finish(1);
      const duas = document.getElementById('bDuas'); if (duas) duas.onclick = () => finish(2);
    });
  }

  async endingA() {
    G.mode = 'end';
    const dur = playTime();
    audio.disconnectClick();
    this.renderer.glitch = 1;
    audio.staticBurst(0.4, 0.3);
    await wait(0.4);
    ui.setFade(1); this.renderer.glitch = 0;
    audio.silenceAll(0.05);
    try { localStorage.setItem('pulso_final', 'A'); localStorage.removeItem('pulso_noite'); } catch (e) { /* */ }
    await wait(2.5);
    await ui.card(['Na manhã de 16 de julho, a mãe do Caio voltou do plantão.', 'Encontrou o filho dormindo no chão do quarto do Léo.', 'O fio do telefone estava arrancado da parede.', 'A conta de julho veio normal.', '', 'Uma conexão encerrada.', 'A outra continua aberta desde 14 de dezembro de 2003.', `Duração: ${dur}.  Tarifa: 1 pulso.`]);
    await ui.card(['#FIM', 'Obrigado por desligar.'], { cls: 'titulo', hold: 3 });
    location.reload();
  }

  async endingC() {
    G.mode = 'end';
    const dur = playTime();
    const w = this.world, os = this.os, p = this.player;
    audio.heartBpm = 0;
    audio.disconnectClick();
    await wait(1.1);
    audio.disconnectClick();
    // o mensageiro do Léo, na tela
    this.cams.force('pc', 1.2);
    await wait(1.4);
    os.setOnline('leo', false);
    await wait(2.6);
    await ui.say('...Tchau, Léo.', 'Caio', 3);
    await os.turnOff();
    audio.silenceAll(0.4);
    await ui.fade(1, 1.5);
    try { localStorage.setItem('pulso_final', 'C'); localStorage.removeItem('pulso_noite'); } catch (e) { /* */ }
    await ui.card(['Na manhã de 16 de julho, a mãe do Caio voltou do plantão.', 'Encontrou as janelas abertas e o sol entrando nos dois quartos.', 'Naquele dia, os dois abriram juntos o quarto do Léo.', 'O fio do telefone foi enrolado e guardado numa caixa.', '', 'Duas conexões encerradas.', `Duração: 7 meses e ${dur}.  Tarifa: 1 pulso.`]);
    // epílogo: manhã
    w.setMode('dia'); w.setDecor('caio'); w.setHall(false); w.setPower(true); w.lampOn = false; w.setDoor(false); w.doorAngle = 0;
    w.flashlightOn = false; p.holdLight = false; w.camFlash.intensity = 0; w.placeFigure(0, 0, 0, 'hidden');
    os.reset('caio');
    p.setLook('caio'); p.look = null; p.lie(); p.snap();
    this.cams.creep = 0; this.cams.breath = 0; this.cams.force('canto');
    audio.ambQuarto({ chuva: 0, pc: 0, crt: 0, drone: 0 }); audio.birds = true;
    await ui.fade(0, 3);
    await wait(4);
    await ui.say('Caio! O café tá na mesa!', 'Mãe', 3);
    await wait(2.5);
    await ui.fade(1, 2.5);
    audio.birds = false;
    await ui.card(['#FIM', 'Obrigado por desligar.', 'As duas vezes.'], { cls: 'titulo', hold: 3 });
    location.reload();
  }

  async endingB() {
    G.mode = 'end';
    const dur = playTime();
    const p = this.player;
    const head = p.headWorld();
    p.look = this.cams.cam.position;   // ele acompanha a câmera com os olhos
    this.cams.force({ name: 'custom', pos: head.clone().add(new THREE.Vector3(0.45, 0.25, 0.55)), look: head, fov: 38 }, 10);
    for (let bpm = 60; bpm >= 30; bpm -= 6) { audio.heartBpm = bpm; await wait(2); }
    audio.heartBpm = 0;
    for (let i = 0; i < 3; i++) { audio.monitorBeep(); await wait(1.4 + i * 0.4); }
    audio.flatline(true);
    this.renderer.glitch = 0.35;
    await wait(2.5);
    ui.setFade(1); this.renderer.glitch = 0;
    await wait(3);
    audio.flatline(false);
    audio.silenceAll(0.05);
    try { localStorage.setItem('pulso_final', 'B'); localStorage.removeItem('pulso_noite'); } catch (e) { /* */ }
    await ui.card(['Caio Menezes, 19 anos, foi encontrado na manhã de 16 de julho, no quarto do irmão.', 'Parada cardíaca. Assim como o Léo.', 'A conta de julho registrou uma única ligação.', `Duração: ${dur}.  Tarifa: 1 pulso.`]);
    await ui.card(['#FIM', 'A linha continua aberta.'], { cls: 'titulo', hold: 3 });
    location.reload();
  }
}
