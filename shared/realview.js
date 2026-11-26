// Calvyrn realview: real 360 photo tours and depth-3D photos for portfolio sites.
// createPano(): a real equirectangular panorama you can drag, zoom, walk between rooms (hotspots), or drive by scroll.
// createDepthPhoto(): a real photograph plus its depth map, rendered as a 3D relief so the camera can move through it.
import * as THREE from 'three';

const D2R = Math.PI / 180;
// yaw 0 = centre of the panorama image, positive = to the right. pitch positive = up.
export function dirFrom(yaw, pitch, r = 1) {
  const y = yaw * D2R, p = pitch * D2R;
  return new THREE.Vector3(-Math.cos(y) * Math.cos(p) * r, Math.sin(p) * r, -Math.sin(y) * Math.cos(p) * r);
}
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPano(host, opts) {
  const { scenes, start, onProgress = () => {}, onReady = () => {}, onScene = () => {}, hotspotLayer, minFov = 35, maxFov = 90 } = opts;
  const mob = innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mob ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 70, 1, .1, 1100);
  const geo = new THREE.SphereGeometry(500, 96, 64); geo.scale(-1, 1, 1);
  const mk = () => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 })); scene.add(m); return m };
  const A = mk(), B = mk(); B.visible = false; B.renderOrder = 1;
  const loader = new THREE.TextureLoader();
  const cache = {};
  const maxTex = renderer.capabilities.maxTextureSize;
  function tex(id) {
    if (cache[id]) return cache[id];
    const s = scenes[id];
    const url = (mob || maxTex < 6144) ? (s.srcMobile || s.src) : s.src;
    cache[id] = new Promise((res, rej) => loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; res(t) }, ev => { if (ev.total) onProgress(id, ev.loaded / ev.total) }, rej));
    return cache[id];
  }
  const st = { yaw: 0, pitch: 0, fov: opts.fov || 70, ty: 0, tp: 0, tf: opts.fov || 70, cur: null, busy: false, auto: opts.auto ?? .02, drag: false, idle: 0, interactive: true };
  // hotspots
  const layer = hotspotLayer || host;
  let spots = [];
  function buildSpots(id) {
    spots.forEach(s => s.el.remove()); spots = [];
    (scenes[id].hotspots || []).forEach(h => {
      const el = document.createElement('button');
      el.className = 'rv-spot' + (h.to ? ' rv-go' : ' rv-info');
      el.type = 'button';
      el.innerHTML = `<i aria-hidden="true"></i><span>${h.label}</span>`;
      el.setAttribute('aria-label', h.to ? `Go to ${h.label}` : h.label);
      el.addEventListener('click', e => { e.stopPropagation(); if (h.to) go(h.to, h.yaw, h.pitch, h.arrive); else if (opts.onInfo) opts.onInfo(h) });
      layer.appendChild(el);
      spots.push({ el, v: dirFrom(h.yaw, h.pitch || 0, 400) });
    });
  }
  async function show(id, yaw) {
    const t = await tex(id);
    A.material.map = t; A.material.needsUpdate = true; A.material.opacity = 1; B.visible = false; B.material.opacity = 0;
    st.cur = id; const s = scenes[id];
    st.yaw = st.ty = yaw ?? s.yaw ?? 0; st.pitch = st.tp = s.pitch ?? 0;
    buildSpots(id); onScene(id);
  }
  async function go(id, viaYaw, viaPitch = 0, arrive) {
    if (st.busy || id === st.cur) return; st.busy = true;
    const p = tex(id);
    const y0 = st.yaw, f0 = st.fov, p0 = st.pitch;
    const yTarget = viaYaw == null ? y0 : y0 + (((viaYaw - y0) % 360) + 540) % 360 - 180;
    const quick = reduceMotion();
    if (!quick) await tween(650, k => { const e = ease(k); st.ty = st.yaw = y0 + (yTarget - y0) * e; st.tp = st.pitch = p0 + (viaPitch * .6 - p0) * e; st.tf = st.fov = f0 + (Math.max(minFov, f0 - 26) - f0) * e });
    const t = await p;
    const s = scenes[id];
    B.material.map = t; B.material.needsUpdate = true; B.material.opacity = 0; B.visible = true;
    const ny = arrive ?? s.yaw ?? 0;
    // rotate the incoming sphere so the swap feels like stepping forward
    B.rotation.y = (ny - st.yaw) * D2R; spots.forEach(s => s.el.style.opacity = 0);
    const fz = st.fov;
    if (!quick) await tween(800, k => { const e = ease(k); B.material.opacity = e; st.fov = st.tf = fz + ((opts.fov || 70) - fz) * e });
    A.material.map = t; A.material.needsUpdate = true; B.visible = false; B.rotation.y = 0; B.material.opacity = 0;
    st.cur = id; st.yaw = st.ty = ny; st.pitch = st.tp = s.pitch ?? 0; st.fov = st.tf = opts.fov || 70;
    buildSpots(id); onScene(id); st.busy = false;
  }
  function tween(ms, f) { return new Promise(r => { const t0 = performance.now(); (function l(n) { const k = Math.min(1, (n - t0) / ms); f(k); k < 1 ? requestAnimationFrame(l) : r() })(t0) }) }
  // input
  const el = renderer.domElement; el.style.touchAction = 'pan-y'; el.style.cursor = 'grab';
  let px = 0, py = 0, pid = null, pinch = null; const pts = new Map();
  el.addEventListener('pointerdown', e => { if (!st.interactive) return; pts.set(e.pointerId, e); if (pts.size === 1) { pid = e.pointerId; px = e.clientX; py = e.clientY; st.drag = true; el.style.cursor = 'grabbing'; el.setPointerCapture(e.pointerId) } });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) st.tf = THREE.MathUtils.clamp(st.tf * pinch / d, minFov, maxFov); pinch = d; return }
    if (e.pointerId !== pid) return;
    const k = st.fov / renderer.domElement.clientHeight;
    st.ty -= (e.clientX - px) * k; st.tp = THREE.MathUtils.clamp(st.tp + (e.clientY - py) * k, -80, 80); px = e.clientX; py = e.clientY; st.idle = 0;
  });
  const up = e => { pts.delete(e.pointerId); pinch = null; if (e.pointerId === pid) { st.drag = false; el.style.cursor = 'grab' } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { if (!st.interactive || !opts.wheelZoom) return; e.preventDefault(); st.tf = THREE.MathUtils.clamp(st.tf + e.deltaY * .04, minFov, maxFov) }, { passive: false });
  el.addEventListener('keydown', e => { const m = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key]; if (m) { st.ty += m[0]; st.tp = THREE.MathUtils.clamp(st.tp + m[1], -80, 80); e.preventDefault() } });
  el.tabIndex = 0; el.setAttribute('role', 'application'); el.setAttribute('aria-label', opts.label || '360 degree photo. Drag or use the arrow keys to look around.');
  function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  new ResizeObserver(resize).observe(host); resize();
  let vis = true; new IntersectionObserver(es => vis = es[0].isIntersecting).observe(host);
  const v = new THREE.Vector3(); const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(.05, clock.getDelta()); if (!vis || !st.cur) return;
    st.idle += dt;
    if (!st.drag && !st.busy && st.auto && st.idle > 2.5 && !reduceMotion() && st.interactive) st.ty += st.auto * 60 * dt;
    const k = 1 - Math.pow(.0008, dt);
    if (!st.busy) { st.yaw += (st.ty - st.yaw) * k; st.pitch += (st.tp - st.pitch) * k; st.fov += (st.tf - st.fov) * k }
    camera.fov = st.fov; camera.updateProjectionMatrix();
    camera.lookAt(dirFrom(st.yaw, st.pitch, 10));
    const w = host.clientWidth, h = host.clientHeight;
    spots.forEach(s => {
      v.copy(s.v).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      s.el.style.transform = `translate(${(v.x * .5 + .5) * w}px,${(-v.y * .5 + .5) * h}px)`;
      s.el.style.opacity = on && !st.busy ? 1 : 0; s.el.style.pointerEvents = on && !st.busy ? 'auto' : 'none';
    });
    renderer.render(scene, camera);
  });
  const ready = show(start, scenes[start].yaw).then(() => { onReady(); Object.keys(scenes).forEach(id => id !== start && setTimeout(() => tex(id), 1500)) });
  return {
    ready, go, show, tex,
    get state() { return st },
    get scene() { return st.cur },
    set(o) { if (o.yaw != null) st.ty = o.yaw; if (o.pitch != null) st.tp = o.pitch; if (o.fov != null) st.tf = o.fov; if (o.instant) { st.yaw = st.ty; st.pitch = st.tp; st.fov = st.tf } st.idle = 0 },
    // blend directly to another scene with progress k (0..1), for scroll-driven crossfades
    async blend(id, k, yaw) {
      const t = await tex(id); if (B.material.map !== t) { B.material.map = t; B.material.needsUpdate = true }
      B.visible = k > 0.001; B.material.opacity = k; B.rotation.y = yaw == null ? 0 : yaw * D2R;
    },
    unblend() { B.visible = false; B.material.opacity = 0 },
    interactive(on) { st.interactive = on; el.style.cursor = on ? 'grab' : 'default'; el.style.touchAction = on ? 'pan-y' : 'auto' },
    renderer, camera
  };
}

export function createDepthPhoto(host, { src, depth, strength = .32, overscan = 1.16, seg = 300, onReady = () => {} }) {
  const mob = innerWidth < 760;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }) } catch (e) { host.classList.add('rv-fallback'); return { set() {}, ready: Promise.resolve() } }
  renderer.setPixelRatio(Math.min(devicePixelRatio, mob ? 1.5 : 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(32, 1, .01, 50);
  const tl = new THREE.TextureLoader();
  const uni = { map: { value: null }, dmap: { value: null }, k: { value: strength } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `uniform sampler2D dmap;uniform float k;varying vec2 vUv;void main(){vUv=uv;float d=texture2D(dmap,uv).r;vec3 p=position;p.z+=(d-.45)*k;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);\n#include <colorspace_fragment>\n}`
  });
  let mesh, aspect = 1.5;
  const st = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, mx: 0, my: 0 };
  const ready = Promise.all([new Promise(r => tl.load(src, r)), new Promise(r => tl.load(depth, r))]).then(([t, d]) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; d.colorSpace = THREE.NoColorSpace;
    uni.map.value = t; uni.dmap.value = d; aspect = t.image.width / t.image.height;
    const s = mob ? Math.round(seg * .7) : seg;
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * aspect, 2, Math.round(s * Math.sqrt(aspect)), Math.round(s / Math.sqrt(aspect))), mat);
    scene.add(mesh); resize(); onReady();
  });
  let D = 3;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const tan = Math.tan(camera.fov * D2R / 2);
    D = Math.min(2 / overscan / (2 * tan), 2 * aspect / overscan / (2 * tan * camera.aspect));
  }
  new ResizeObserver(resize).observe(host);
  let vis = false; new IntersectionObserver(es => vis = es[0].isIntersecting, { rootMargin: '100px' }).observe(host);
  if (!reduceMotion()) host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); st.mx = ((e.clientX - r.left) / r.width - .5); st.my = ((e.clientY - r.top) / r.height - .5) });
  host.addEventListener('pointerleave', () => { st.mx = st.my = 0 });
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(.05, clock.getDelta()); if (!vis || !mesh) return;
    const k = 1 - Math.pow(.004, dt);
    st.x += (st.tx + st.mx * .1 - st.x) * k; st.y += (st.ty - st.my * .07 - st.y) * k; st.z += (st.tz - st.z) * k;
    camera.position.set(st.x, st.y, D - st.z); camera.lookAt(st.x * .25, st.y * .25, 0);
    renderer.render(scene, camera);
  });
  return {
    ready,
    // x,y: lateral camera travel in image heights (about -0.2..0.2); z: dolly toward the photo (0..0.5)
    set(o) { if (reduceMotion()) return; if (o.x != null) st.tx = o.x; if (o.y != null) st.ty = o.y; if (o.z != null) st.tz = o.z }
  };
}

export const panoCSS = `.rv-spot{position:absolute;left:0;top:0;margin:-22px 0 0 -22px;display:flex;align-items:center;gap:10px;border:0;background:none;padding:0;cursor:pointer;transition:opacity .3s;color:#fff;font:600 14px/1 var(--rv-font,system-ui)}
.rv-spot i{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.18);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:inset 0 0 0 2px rgba(255,255,255,.9);position:relative;flex:0 0 auto}
.rv-spot i:after{content:"";position:absolute;inset:14px;border-radius:50%;background:#fff;transition:transform .3s}
.rv-spot.rv-go i:before{content:"";position:absolute;inset:-6px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,255,255,.6);animation:rvp 2.2s infinite}
.rv-spot span{background:rgba(15,15,15,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:8px 12px;border-radius:999px;white-space:nowrap;opacity:.95}
.rv-spot:hover i:after,.rv-spot:focus-visible i:after{transform:scale(1.25)}
.rv-spot:focus-visible{outline:none}.rv-spot:focus-visible span{outline:2px solid #fff}
@keyframes rvp{0%{transform:scale(.8);opacity:1}100%{transform:scale(1.5);opacity:0}}
@media (prefers-reduced-motion:reduce){.rv-spot i:before{animation:none}}
[data-pano]{position:absolute;inset:0}[data-pano] canvas,.rv-depth canvas,.rv-hero canvas{display:block;width:100%!important;height:100%!important}
[data-spots]{position:absolute;inset:0;pointer-events:none;overflow:hidden}
[data-load]{position:absolute;inset:0;display:grid;place-items:center;z-index:2;transition:opacity .6s}[data-load].gone{opacity:0;pointer-events:none}
.rv-depth{position:absolute;inset:0;background-size:cover;background-position:center}.rv-hero{position:absolute;inset:0}`;

// keyframes: [[progress, yaw, pitch, fov], ...] -> [yaw, pitch, fov] at progress p (smoothstep between keys)
export function interpKeys(K, p) {
  if (p <= K[0][0]) return K[0].slice(1);
  for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (p <= b[0]) { let t = (p - a[0]) / (b[0] - a[0] || 1); t = t * t * (3 - 2 * t); return [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * t) } }
  return K[K.length - 1].slice(1);
}
// Drive a pano through several real 360 scenes with scroll progress p (0..1).
// segs: [{id, until, K}], the last segment's until is ignored. Each boundary crossfades over `fade`.
export function scrollDirector(pano, segs, fade = .07) {
  let swapping = false;
  return async function update(p) {
    let i = segs.findIndex((s, k) => k === segs.length - 1 || p < s.until);
    const seg = segs[i];
    const [y, pi, f] = interpKeys(seg.K, p);
    pano.set({ yaw: y, pitch: pi, fov: f });
    if (pano.scene !== seg.id && !swapping) { swapping = true; await pano.show(seg.id, y); pano.set({ yaw: y, pitch: pi, fov: f }); swapping = false }
    if (swapping) return i;
    const nx = segs[i + 1];
    if (nx && p > seg.until - fade) {
      const k = Math.min(1, (p - (seg.until - fade)) / fade);
      const ny = interpKeys(nx.K, seg.until)[0];
      pano.blend(nx.id, k, ny - pano.state.yaw);
    } else pano.unblend();
    return i;
  };
}

// ---------- small site kit shared by the realview portfolio sites ----------
export function boot({ preLabel = 'Loading', lerp = .09 } = {}) {
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; const mob = innerWidth < 680;
  const tb = () => { const t = document.querySelector('.topbar'); if (t) document.documentElement.style.setProperty('--tb', t.offsetHeight + 'px') }; tb(); addEventListener('resize', tb);
  let lenis = null; if (!reduce && window.Lenis) { lenis = new window.Lenis({ lerp }); (function raf(t) { lenis.raf(t); requestAnimationFrame(raf) })(0) }
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const h = a.getAttribute('href'); if (h.length < 2) return; const t = document.querySelector(h); if (!t) return; e.preventDefault(); lenis ? lenis.scrollTo(t, { offset: -70, duration: 1.4 }) : t.scrollIntoView() }));
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  const lazy = (el, fn) => { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { o.disconnect(); fn() } }, { rootMargin: '400px' }); o.observe(el) };
  let pv = 0; const setPre = p => { pv = Math.max(pv, p); const b = $('preBar'), t = $('preTxt'); if (b) b.style.width = Math.round(pv * 100) + '%'; if (t) t.textContent = preLabel + ' · ' + Math.round(pv * 100) + '%' };
  const finish = () => { setPre(1); setTimeout(() => $('pre') && $('pre').classList.add('done'), 250) }; setTimeout(finish, 15000);
  const scrollTo = sel => lenis ? lenis.scrollTo(sel, { offset: -70 }) : document.querySelector(sel).scrollIntoView();
  return { $, reduce, mob, lenis, lazy, setPre, finish, scrollTo };
}
// progress (0..1) of a tall sticky section
export function stickyProgress(el) { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / (el.offsetHeight - innerHeight))) }
// progress (0..1) of an element passing through the viewport
export function passProgress(el) { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))) }
// depth photo created when near, driven by scroll: map(p) -> {x,y,z}
export function depthOnScroll(el, opts, map, prog = passProgress) {
  const o = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return; o.disconnect();
    const d = createDepthPhoto(el, opts); const f = () => d.set(map(prog(el.closest('[data-sticky]') || el))); addEventListener('scroll', f, { passive: true }); f();
  }, { rootMargin: '400px' }); o.observe(el);
}
// interactive 360 tour with room buttons, zoom and fullscreen
export function wireTour({ viewer, scenes, start, names = {}, fov = 75, onScene = () => {}, onInfo }) {
  const q = s => viewer.querySelector(s); const mob = innerWidth < 680;
  const rooms = viewer.parentElement.querySelector('[data-rooms]');
  let tour = null;
  const o = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return; o.disconnect();
    tour = createPano(q('[data-pano]'), { scenes, start, fov: mob ? fov + 10 : fov, hotspotLayer: q('[data-spots]'), auto: .02, onInfo,
      onReady: () => q('[data-load]') && q('[data-load]').classList.add('gone'),
      onScene: id => { if (rooms) rooms.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === id)); if (q('[data-name]') && names[id]) q('[data-name]').textContent = names[id]; onScene(id) } });
  }, { rootMargin: '400px' }); o.observe(viewer);
  if (rooms) rooms.addEventListener('click', e => { const b = e.target.closest('button'); if (b && tour) tour.go(b.dataset.r) });
  const z = (s, d) => { const b = q(s); if (b) b.onclick = () => tour && tour.set({ fov: Math.max(35, Math.min(90, tour.state.tf + d)) }) };
  z('[data-zin]', -12); z('[data-zout]', 12);
  const f = q('[data-fs]'); if (f) f.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (viewer.requestFullscreen) viewer.requestFullscreen() };
  return { get tour() { return tour } };
}
