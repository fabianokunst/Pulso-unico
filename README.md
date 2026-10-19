# Pulso Único

Terror psicológico em 3D com visual retrô de videogame do começo dos anos 2000. Um prólogo em dezembro de 2003 e cinco noites em julho de 2004: uma casa no interior, um computador de tubo amarelado e uma internet discada que não desconecta. São três finais. O verdadeiro exige achar as cinco folhas do caderno do Léo.
A história completa e o roteiro das noites estão em [HISTORIA.md](HISTORIA.md).

É **100% front-end**: HTML + JavaScript + [Three.js](https://threejs.org) (já incluído em `lib/`). Não tem build, back-end nem arquivos de som (o áudio é sintetizado em tempo real). Pode ser hospedado de graça no **GitHub Pages**.

## Jogar no seu PC

O navegador não carrega módulos JavaScript abrindo o `index.html` direto do disco, então é preciso um servidor local qualquer:

- **Windows:** dois cliques em `JOGAR.bat` (usa o Node.js e abre o navegador em `http://localhost:8090`).
- **Qualquer sistema com Node:** `node servidor-local.cjs --abrir`
- **Alternativas:** `npx serve .`, `python -m http.server 8090` ou a extensão *Live Server* do VS Code.

Use o Chrome, o Edge ou o Firefox atualizados. Jogue de fone e no escuro.

### Controles

| Ação | Teclado / mouse | Controle |
|---|---|---|
| Andar | WASD ou setas | analógico esquerdo |
| Correr | Shift | R1 / R2 |
| Interagir / avançar texto | E, Espaço ou Enter | X / A |
| Usar o computador | mouse sobre a tela do monitor, clique | analógico move o cursor, X / A clica |
| Levantar do computador | Esc ou botão direito | O / B |
| Pausar | Esc | Start |
| Tela cheia | F | — |

Há ajuste de **BRILHO** no título e na pausa. No menu de pausa, **CADERNO DO LÉO** mostra as folhas já encontradas. O progresso (a noite atual e as folhas) fica salvo no navegador.
Atalho para testes: `index.html?noite=3` faz a tela de título oferecer "CONTINUAR — NOITE 3" (de 1 a 5; o prólogo é sempre o começo de um jogo novo).

## Publicar no GitHub Pages

1. Crie um repositório e envie o conteúdo desta pasta (pode deixar a pasta `textures/` de fora, veja abaixo).
2. No repositório, abra **Settings → Pages**, escolha **Deploy from a branch**, a branch `main` e a pasta `/ (root)`, e salve.
3. Em um ou dois minutos o jogo fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

Todos os caminhos são relativos e o arquivo `.nojekyll` já está incluído, então nada precisa ser configurado.

## Texturas

O jogo procura texturas em **`texturas/`**, guiado pelo arquivo **`texturas/mapa.json`**:

```json
{
  "_tamanhoMax": 256,
  "parede": "parede.png",
  "piso": "piso.png"
}
```

- A chave é o **nome da superfície** e o valor é o **arquivo dentro de `texturas/`**. Pode ser qualquer nome de arquivo, em PNG, JPG ou WebP.
- Superfícies que não estão no mapa usam a **textura gerada por código**. Hoje o jogo já roda sem nenhuma imagem.
- As imagens são reduzidas para no máximo `_tamanhoMax` pixels (256 é o padrão "PS2"). Para mais nitidez use 512.

### Superfícies disponíveis

| Nome | Onde aparece |
|---|---|
| `parede` | paredes do quarto (repete a cada 1 m) |
| `parede_corredor` | paredes do corredor |
| `piso` | chão do quarto |
| `piso_corredor` | chão do corredor |
| `teto` | teto (repete a cada 2 m) |
| `madeira` | mesa, criado-mudo, estante, cama (recebe tons diferentes por móvel) |
| `guarda_roupa` | frente do guarda-roupa (imagem inteira) |
| `porta` / `porta_leo` | porta do quarto / do quarto do Léo (imagem vertical inteira) |
| `plastico` | plástico bege do gabinete, monitor e teclado |
| `cobertor`, `lencol`, `cortina`, `tapete` | tecidos |
| `mochila` | nylon da mochila e das alças (repete) |
| `poster1`, `poster2`, `poster_leo` | pôsteres (vertical) |
| `calendario`, `calendario_leo` | calendários de jul/2004 e dez/2003 |
| `mural` | mural de cortiça com fotos |
| `muro` | muro e casas do outro lado da rua |
| `camiseta` | estampa nas costas da camiseta do Caio |
| `foto1`, `foto2` | quadros do corredor |
| `teclado`, `cds`, `cd_leo` | teclas, lombadas de CD, rótulo do CD-R |
| `mancha_teto`, `mancha_parede`, `mancha_corredor` | manchas sobrepostas (PNG **com transparência**) |

### As texturas que já estão em uso

Do material que você colocou em `textures/` (pacotes da **Screaming Brain Studios**, licença **CC0 / domínio público**), foram copiadas para `texturas/`, já em 256 px:

| Superfície | Origem |
|---|---|
| parede | Horror_Wall_13 |
| parede_corredor | Horror_Wall_12 |
| teto | Plaster_20 |
| piso | Wood_06 |
| piso_corredor | Horror_Floor_12 |
| madeira | Wood_08 |
| muro | Horror_Stone_12 |
| mancha_teto | Horror_Stain_05 |
| mancha_parede | Horror_Stain_11 |
| mancha_corredor | Horror_Stain_13 |

A pasta `textures/` original (cerca de 140 MB) não é usada pelo jogo. O `.gitignore` já a exclui do repositório.

## Estrutura

```
index.html, estilo.css     página e interface (legendas, menus, diálogo final)
lib/three.module.js        Three.js r160
src/main.js                inicialização, loop, controles (teclado, mouse, gamepad)
src/render.js              visual "PS2": 448 linhas, cor de 15 bits + dithering, grão, bloom
src/world.js               quarto, corredor, sala/cozinha, quarto da mãe, móveis, luzes, chuva, TV, a Figura, colisão
src/character.js           personagens com esqueleto (Caio, Léo, a mãe): corpo em seções, rosto e roupas pintados
src/player.js              animação procedural (andar, sentar, deitar, gestos, telefone, frio, olhares para a câmera)
src/cameras.js             câmeras fixas de survival horror
src/os.js                  o "Sistema 98" desenhado na tela do CRT (discador, mensageiro, webcam, gravador de CD…)
src/story.js               o prólogo, as cinco noites, as folhas do caderno e os três finais
src/audio.js               todo o som, sintetizado
src/textures.js            carregamento de texturas e geradores procedurais
src/ui.js, src/state.js    interface e estado/agendador
```

## Créditos

- Three.js: licença MIT.
- Texturas: Screaming Brain Studios, CC0.
- Todas as marcas, bandas e empresas do jogo são fictícias.
