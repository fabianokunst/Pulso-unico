// Renderizador "PS2": cena em baixa resolução (448 linhas), depois um passe de pós-processo
// com cor de 15 bits + dithering, entrelaçamento, grão, vinheta, bloom barato e glitch.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 res;
uniform float time, grain, glitch, frame, vig, bright, sat, gamma, bloom, smear;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 uv = vUv;
  if (glitch > 0.0) {
    float line = floor(uv.y * res.y / 3.0);
    float n = hash(vec2(line, floor(time * 24.0)));
    if (n < glitch * 0.35) uv.x += (hash(vec2(time, line)) - 0.5) * 0.08 * glitch;
    uv.y += (hash(vec2(floor(time * 30.0), 7.0)) - 0.5) * 0.008 * glitch;
  }
  vec2 px = 1.0 / res;
  float ca = (0.5 + glitch * 6.0) * px.x;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
  // borrão horizontal leve (saída composta)
  col = mix(col, texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb, smear);
  // bloom barato
  vec3 bl = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * px;
    bl += max(texture2D(tDiffuse, uv + o * 3.0).rgb - 0.5, 0.0);
    bl += max(texture2D(tDiffuse, uv + o * 7.0).rgb - 0.5, 0.0) * 0.6;
  }
  col += bl * bloom;
  // gradação: preto levemente esverdeado, saturação reduzida
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, sat);
  col = col * vec3(0.97, 1.0, 1.02) + vec3(0.006, 0.009, 0.012);
  vec2 d = vUv - 0.5;
  col *= 1.0 - dot(d, d) * vig;
  col *= bright;
  col = pow(max(col, 0.0), vec3(gamma));
  col += (hash(vUv * res + fract(time) * 97.0) - 0.5) * grain;
  if (mod(gl_FragCoord.y + frame, 2.0) < 1.0) col *= 0.955;
  float dith = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 31.0 + 0.5 + dith) / 31.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class PS2Renderer {
  constructor(canvas) {
    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.setPixelRatio(1);
    this.lines = 448;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture }, res: { value: new THREE.Vector2(4, 4) },
        time: { value: 0 }, grain: { value: 0.055 }, glitch: { value: 0 }, frame: { value: 0 },
        vig: { value: 1.2 }, bright: { value: 1 }, sat: { value: 0.82 }, gamma: { value: 0.72 }, bloom: { value: 0.11 }, smear: { value: 0.22 },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.glitch = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const a = innerWidth / innerHeight;
    this.aspect = a;
    this.h = this.lines; this.w = Math.round(this.lines * a);
    this.gl.setSize(this.w, this.h, false);
    this.rt.setSize(this.w, this.h);
    this.post.uniforms.res.value.set(this.w, this.h);
  }

  render(scene, cam, t) {
    if (Math.abs(cam.aspect - this.aspect) > 1e-4) { cam.aspect = this.aspect; cam.updateProjectionMatrix(); }
    const u = this.post.uniforms;
    u.time.value = t; u.frame.value = (u.frame.value + 1) % 2; u.glitch.value = this.glitch;
    this.gl.setRenderTarget(this.rt);
    this.gl.render(scene, cam);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }

  // Renderiza uma vista para um canvas 2D (webcam, fotos). Lento: use em tamanhos pequenos.
  snapshot(scene, cam, w, h, target) {
    if (!this._snapRT || this._snapRT.width !== w || this._snapRT.height !== h) {
      this._snapRT && this._snapRT.dispose();
      this._snapRT = new THREE.WebGLRenderTarget(w, h);
      this._snapBuf = new Uint8Array(w * h * 4);
    }
    cam.aspect = w / h; cam.updateProjectionMatrix();
    this.gl.setRenderTarget(this._snapRT);
    this.gl.render(scene, cam);
    this.gl.readRenderTargetPixels(this._snapRT, 0, 0, w, h, this._snapBuf);
    this.gl.setRenderTarget(null);
    const c = target || document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const src = this._snapBuf, dst = img.data;
    for (let y = 0; y < h; y++) {
      const sy = (h - 1 - y) * w * 4, dy = y * w * 4;
      for (let i = 0; i < w * 4; i++) dst[dy + i] = src[sy + i];
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
