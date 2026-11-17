// Window stories: click a lit window of the apartment complex and the camera flies up to it, face on, and a short scene plays in
// that home, seen through the glass. The story (stories.ts, drawn by pen.ts) is painted on a canvas that lies on the window pane
// itself, so the building's wall, the frame and the neighbours' windows stay round it. Curtains open when the camera arrives and
// close at the end. A slim strip under the window carries the captions (read out politely to a screen reader), "Watch again" and
// the way back. Esc, Back or a click elsewhere flies the camera back to where it was. Each lit window has one of the stories for
// the session, dealt at random, so the same window keeps its story until the page reloads.
// The overview camera is orthographic with a far negative near plane (it sits ~52 units from its target), so at the window
// anything across the street behind the camera would cover the view: on the way in the near plane moves up to just in front of
// the glass, and on the way out back again. The orbit limits (tilt, zoom) are lifted while at the window, and the controls are
// off. With reduced motion the flights are instant and the story shows one still per caption.
import * as THREE from 'three';
import { reduced } from '../../common/dom.js';
import type { SceneCtx } from '../../common/types.js';
import type { Apartments } from '../buildings/apartments.js';
import { makePen, W, H, type Story } from './pen.js';
import { STORIES } from './stories.js';

export interface Peek {
  clickAt(x: number, y: number): boolean;
  pointerAt(x: number, y: number): boolean;
  /** Called every scene frame: flights, the near plane, the story clock and the caption strip. */
  frame(): void;
  /** Probe: open window i (lit or not), or the story with this id in the first lit window; seek to t; close; 'where' adds each
   *  lit window's screen point. Returns what is showing. */
  probe(cmd?: 'open' | 'close' | 'seek' | 'where', a?: number | string): { open: boolean; phase: string | null; win: number | null; story: string | null; t: number; stories: number; lit: number; at?: number[][] };
  close(): void;
}

const D = 4, TILT = .12, NEAR = D - 1.4, FAR_NEAR = -600; // camera distance from the glass, its look down (rad), the near plane at the window (things within 1.4 m of the glass stay: frame, sill, balcony)
const OPEN = 1.2, SHUT = 1.5, TAIL = .6;                  // curtains opening, closing; the pause after the end

export function makePeek(OS: { ctx: SceneCtx }, flats: Apartments): Peek {
  const { camera, renderer, scene, controls } = OS.ctx;
  const canvas = renderer.domElement;
  // ── which story behind which window: one shuffle per page load ──
  const perm = [...STORIES.keys()];
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const off = Math.floor(Math.random() * perm.length);
  const storyOf = (w: number): Story => STORIES[perm[(w + off) % perm.length]];

  // ── picking: the first thing the ray meets in the complex must be a lit pane; on a click, nothing else in the scene may be in front ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = (x: number, y: number) => { const r = canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); ray.ray.origin.addScaledVector(ray.ray.direction, camera.near); }; // from the (negative) near plane, as the stage does
  /** A solid mesh that is drawn (it and every parent visible; not a see-through glow). */
  const shows = (o: THREE.Object3D) => { if (!(o as THREE.Mesh).isMesh) return false; const m = (o as THREE.Mesh).material as THREE.Material;
    if (m && !Array.isArray(m) && m.transparent && m.opacity < .5) return false; for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const winUnder = (x: number, y: number, strict: boolean): number | null => {
    if (!flats.group.visible) return null;
    aim(x, y); const h = ray.intersectObject(flats.group, true)[0];
    if (!h || h.object !== flats.winMesh || h.instanceId == null || !flats.isLit(h.instanceId)) return null;
    if (strict) { const first = ray.intersectObjects(scene.children, true).find(o => shows(o.object) && o.object !== glassM);
      if (first && first.object !== flats.winMesh && first.distance < h.distance - .05) return null; }
    return h.instanceId;
  };

  // ── the story on the glass: a canvas texture on a plane the size of the pane, just in front of it ──
  const pg = (flats.winMesh.geometry as THREE.PlaneGeometry).parameters, PW = pg.width, PH = pg.height;
  const cv = document.createElement('canvas'), c = cv.getContext('2d')!, pen = makePen(c);
  const res = () => Math.round(2 * Math.min(1.5, devicePixelRatio || 1)); // texels per story pixel: sharp enough at ~60% of the screen height
  cv.width = W * res(); cv.height = H * res();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // unlit, a touch over 1 to make up for the tone mapping (ACES dims and greys a plain texture), still under the bloom threshold
  const glassM = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.12, 1.12, 1.12), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  glassM.matrixAutoUpdate = false; glassM.visible = false; glassM.renderOrder = 1; scene.add(glassM);

  // ── the caption strip under the window ──
  const el = document.createElement('div'); el.id = 'peek'; el.hidden = true; el.setAttribute('role', 'region'); el.setAttribute('aria-labelledby', 'peek-t');
  el.innerHTML = '<p class="pk-c" aria-live="polite"></p><div class="pk-b"><span id="peek-t" class="pk-t"></span>'
    + '<button type="button" class="pk-again" hidden>Watch again</button><button type="button" class="pk-x">Back · Esc</button></div>';
  document.body.append(el);
  const tEl = el.querySelector('.pk-t') as HTMLElement, cEl = el.querySelector('.pk-c') as HTMLElement, xBtn = el.querySelector('.pk-x') as HTMLButtonElement, again = el.querySelector('.pk-again') as HTMLButtonElement;

  interface View { target: THREE.Vector3; pos: THREE.Vector3; zoom: number }
  interface Cur { w: number; S: Story; t: number; beat: number; phase: 'in' | 'on' | 'out'; at: THREE.Vector3; n: THREE.Vector3; back: View; lim: { maxP: number; minZ: number; maxZ: number; near: number }; d0: number; k0: number; ko: number } // k0: the curtains when it closed, ko: seconds since
  let cur: Cur | null = null, last = 0, swallow = 0;

  /** The zoom at which the pane fills most of the free gap between the side columns (60% of the height at most). */
  function zoomFor() { const w = innerWidth, h = innerHeight;
    const l = w >= 820 ? document.querySelector('.col.l')?.getBoundingClientRect().right || 0 : 0, r = w >= 820 ? document.querySelector('.col.r')?.getBoundingClientRect().left || w : w;
    const gap = r - l >= 300 ? r - l : w, px = Math.min(h * .6, gap * .62 * PH / PW, (h - 150) * .9); // px: the pane's height on screen; room left below it for the strip
    return px * (camera.top - camera.bottom) / (PH * h); }

  // the frame round the story: curtains (k 0 open .. 1 closed), the glass's sheen and a soft shade at the edges
  function curtains(k: number) { if (k <= 0) return; const cw = W / 2 * k + 6;
    for (const s of [0, 1]) { const x0 = s ? W - cw : 0; const g = c.createLinearGradient(x0, 0, x0 + cw, 0);
      g.addColorStop(0, '#7d3b34'); g.addColorStop(.5, '#a24e43'); g.addColorStop(1, '#7d3b34'); c.fillStyle = g; c.fillRect(x0, 0, cw, H);
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5; for (let i = 1; i < 6; i++) { const xx = x0 + cw * i / 6; c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, H); c.stroke(); } }
    c.fillStyle = '#4a2a24'; c.fillRect(0, 0, W, 7); }
  function glass() { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(.35, 'rgba(255,255,255,0)'); g.addColorStop(.62, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.07)'); g.addColorStop(.78, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const v2 = c.createRadialGradient(W / 2, H * .45, H * .35, W / 2, H * .5, H * .78); v2.addColorStop(0, 'rgba(10,12,24,0)'); v2.addColorStop(1, 'rgba(10,12,24,.3)'); c.fillStyle = v2; c.fillRect(0, 0, W, H); }

  /** The time shown for real time t: the same t, or under reduced motion a still per caption (60% into it). */
  function shown(S: Story, t: number) { if (!reduced) return t; const b = S.beats; let i = 0; while (i + 1 < b.length && b[i + 1][0] <= t) i++; const t1 = i + 1 < b.length ? b[i + 1][0] : S.dur - SHUT; return Math.min(S.dur - SHUT, b[i][0] + (t1 - b[i][0]) * .6); }
  function draw() { if (!cur) return; const { S, t } = cur, s = cv.width / W;
    c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, W, H); c.save();
    try { S.draw(pen, Math.max(0, Math.min(S.dur, shown(S, t)))); } catch (e) { c.restore(); c.save(); c.fillStyle = '#1b1e26'; c.fillRect(0, 0, W, H); console.warn('window story ' + S.id, e); }
    c.restore(); c.save(); glass();
    const k = cur.phase === 'in' ? 1 : cur.phase === 'out' ? Math.min(1, cur.k0 + (reduced ? 1 : cur.ko / .5)) : reduced ? (t >= S.dur ? 1 : 0) : t < OPEN ? 1 - pen.ease.io(t / OPEN) : t > S.dur - SHUT ? pen.ease.io(Math.min(1, (t - (S.dur - SHUT)) / SHUT)) : 0;
    curtains(k); c.restore(); tex.needsUpdate = true; if (cur.phase === 'on') cur.k0 = k;
    let bi = 0; while (bi + 1 < S.beats.length && S.beats[bi + 1][0] <= t) bi++;
    if (bi !== cur.beat && cur.phase === 'on') { cur.beat = bi; cEl.textContent = S.beats[bi][1]; }
    const done = t >= S.dur + TAIL; if (again.hidden === done) again.hidden = !done; }

  const v = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  /** Sit the strip centred under the pane's bottom edge on screen, inside the viewport. */
  function place() { if (!cur) return; const r = canvas.getBoundingClientRect(); v.copy(cur.at).addScaledVector(camera.up, -PH / 2).project(camera);
    const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height, w = el.offsetWidth, h = el.offsetHeight, G = 16;
    const x = Math.max(G, Math.min(innerWidth - G - w, sx - w / 2)), y = Math.max(G, Math.min(innerHeight - G - h, sy + 18));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; }

  function open(w: number) {
    if (cur && cur.phase !== 'out') return;
    const p = flats.windowAt(w), at = new THREE.Vector3(p.x, p.y, p.z), n = new THREE.Vector3(p.nx, 0, p.nz).normalize();
    const back: View = cur ? cur.back : { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom };
    const lim = cur ? cur.lim : { maxP: controls.maxPolarAngle, minZ: controls.minZoom, maxZ: controls.maxZoom, near: camera.near };
    flats.winMesh.getMatrixAt(w, m4); m4.premultiply(flats.winMesh.matrixWorld); m4.decompose(v, q, sc); // the pane's place and turn
    glassM.matrix.compose(v.copy(at).addScaledVector(n, .008), q, sc.set(1, 1, 1)); glassM.matrixWorldNeedsUpdate = true; glassM.visible = true;
    cur = { w, S: storyOf(w), t: 0, beat: -1, phase: 'in', at, n, back, lim, d0: Math.max(D + 1, camera.position.distanceTo(at)), k0: 1, ko: 0 };
    controls.enabled = false; controls.maxPolarAngle = Math.PI / 2; controls.maxZoom = 80; controls.minZoom = Math.min(lim.minZ, back.zoom);
    const toPos = at.clone().addScaledVector(n, D * Math.cos(TILT)).add(v.set(0, D * Math.sin(TILT), 0));
    OS.ctx.flyTo(at, { toPos, zoom: zoomFor(), dur: 1.7 });
    tEl.textContent = cur.S.title; cEl.textContent = ''; again.hidden = true; el.hidden = true; document.body.classList.add('peeking'); draw();
  }
  function close() { if (!cur || cur.phase === 'out') return;
    cur.phase = 'out'; cur.ko = 0; el.hidden = true; document.body.classList.remove('peeking'); if (el.contains(document.activeElement)) canvas.focus({ preventScroll: true });
    OS.ctx.flyTo(cur.back.target, { toPos: cur.back.pos, zoom: cur.back.zoom, dur: 1.4 }); }
  /** Landed back: put the limits, the near plane and the controls back as they were. */
  function done() { if (!cur) return; const { lim } = cur; cur = null; glassM.visible = false;
    controls.maxPolarAngle = lim.maxP; controls.minZoom = lim.minZ; controls.maxZoom = lim.maxZ; camera.near = lim.near; camera.updateProjectionMatrix(); controls.enabled = true; }

  function frame() {
    if (!cur) return;
    const now = performance.now(), dt = Math.min(.25, (now - last) / 1000); last = now; // real time; a long stall (a hidden tab) does not skip the story ahead
    // the near plane: far back (the overview's) while away, just in front of the glass at the window, eased by how close the camera is
    const k = Math.min(1, Math.max(0, (camera.position.distanceTo(cur.at) - D) / (cur.d0 - D)));
    camera.near = NEAR + (FAR_NEAR - NEAR) * Math.min(1, k * k * 4); camera.updateProjectionMatrix();
    if (cur.phase === 'in' && !OS.ctx.flying()) { cur.phase = 'on'; cur.t = 0; cur.beat = -1; el.hidden = false; xBtn.focus({ preventScroll: true }); }
    if (cur.phase === 'out' && !OS.ctx.flying()) { done(); return; }
    if (cur.phase === 'on' && cur.t < cur.S.dur + TAIL) cur.t += dt;
    if (cur.phase === 'out') cur.ko += dt;
    draw(); if (cur.phase === 'on') place();
  }

  xBtn.addEventListener('click', close);
  again.addEventListener('click', () => { if (cur && cur.phase === 'on') { cur.t = 0; cur.beat = -1; again.hidden = true; xBtn.focus({ preventScroll: true }); } });
  // Esc closes the story first (before the stage steps back out of a focus); a press elsewhere closes it, and the click it ends
  // in does not open a window again
  addEventListener('keydown', e => { if (e.key === 'Escape' && cur && cur.phase !== 'out') { close(); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  addEventListener('pointerdown', e => { if (cur && cur.phase !== 'out' && !el.contains(e.target as Node | null)) { close(); swallow = performance.now(); } }, true);
  addEventListener('resize', () => { if (cur && cur.phase === 'on') { camera.zoom = zoomFor(); camera.updateProjectionMatrix(); place(); } });

  return {
    clickAt(x, y) { if (performance.now() - swallow < 1500) { swallow = 0; return true; } if (cur) return true;
      const w = winUnder(x, y, true); if (w == null) return false; last = performance.now(); open(w); return true; },
    pointerAt: (x, y) => !cur && winUnder(x, y, false) != null,
    frame, close,
    probe(cmd, a) {
      if (cmd === 'close') close();
      else if (cmd === 'open') { let w: number | null = typeof a === 'number' ? a : null;
        if (typeof a === 'string') { const lit = [...Array(flats.windows).keys()].filter(flats.isLit); const k = STORIES.findIndex(s => s.id === a); w = lit.find(i => storyOf(i).id === a) ?? null;
          if (w == null && k >= 0 && lit.length) { w = lit[0]; const j = perm.indexOf(k), at = ((w + off) % perm.length); [perm[at], perm[j]] = [perm[j], perm[at]]; } }
        if (w != null) { last = performance.now(); open(w); } }
      else if (cmd === 'seek' && cur && typeof a === 'number') { cur.t = a; cur.beat = -1; draw(); }
      else if (cmd === 'where') { const r = canvas.getBoundingClientRect(); return { ...state(), at: [...Array(flats.windows).keys()].filter(flats.isLit).map(i => { const p = flats.windowAt(i); v.set(p.x, p.y, p.z).project(camera);
        return [i, Math.round(r.left + (v.x + 1) / 2 * r.width), Math.round(r.top + (1 - v.y) / 2 * r.height), p.nx * (camera.position.x - p.x) + p.nz * (camera.position.z - p.z) > 0 ? 1 : 0]; })
          .map(([i, x, y, f]) => [i, x, y, f, winUnder(x, y, true) === i ? 1 : 0]) }; } // [window, x, y, faces the camera, clickable there]
      return state();
    },
  };
  function state() {
    return { open: !!cur, phase: cur ? cur.phase : null, win: cur ? cur.w : null, story: cur ? cur.S.id : null, t: cur ? +cur.t.toFixed(2) : 0, stories: STORIES.length, lit: [...Array(flats.windows).keys()].filter(flats.isLit).length };
  }
}
