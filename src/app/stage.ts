import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createHUD } from './hud.js';
import { agentIndex, DS, reindex, fmt } from './data.js';
import { webglOK, $, reduced } from '../common/dom.js';
import { easeIO, clamp } from '../common/math.js';
import type { AgentDelta, AgentStatus, AppApi, AppOptions, Pick as PickT, SceneApi, SceneCtx } from '../common/types.js';

export type { AppOptions };
/** A camera flight in progress (intro or focus). */
interface Fly { t: number; dur: number; fromT: THREE.Vector3; fromP: THREE.Vector3; fromZ: number; toT: THREE.Vector3; toP: THREE.Vector3; toZ: number; intro?: boolean }
interface FlyOpts { zoom?: number; dist?: number; toPos?: THREE.Vector3; dur?: number }

export function startApp(buildScene: (ctx: SceneCtx) => SceneApi, o: AppOptions) {
  const api = {} as AppApi; const hud = createHUD(api);
  window.__focus = (k, id) => api.focus(k, id); // chat.js: open a session card from outside
  const prev = new Map<string, { tokens: number; toolCalls: number; status: AgentStatus; needs: boolean }>(), deltas = new Map<string, AgentDelta>();
  function computeDeltas() {
    deltas.clear();
    for (const a of agentIndex.values()) {
      const p = prev.get(a.id);
      deltas.set(a.id, { isNew: !p, dTokens: p ? a.tokens - p.tokens : 0, dTools: p ? a.toolCalls - p.toolCalls : 0, prevStatus: p ? p.status : null, changed: p ? p.status !== a.status : false, prevNeeds: p ? p.needs : false });
      prev.set(a.id, { tokens: a.tokens, toolCalls: a.toolCalls, status: a.status, needs: !!a.needsHuman });
    }
  }
  window.__onWindow = () => { hud.resetFeed(); prev.clear(); first = true; };
  let first = true;
  if (!webglOK()) {
    $('#fallback')!.hidden = false;
    api.focus = (k, id) => hud.openDetail(k, id); api.unfocus = () => hud.closeDetail();
    DS.subscribe((s, ev) => { reindex(); hud.update(ev); });
    let last = performance.now(); (function L(n: number) { hud.frame((n - last) / 1000 || 0.016); last = n; requestAnimationFrame(L); })(last);
    return;
  }
  const canvas = $<HTMLCanvasElement>('#c')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const PR = Math.min(devicePixelRatio || 1, 2);
  let resScale = 1; // adaptive render scale (see loop): drops when the GPU can't hold ~30fps, recovers when it can
  renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = o.envIntensity ?? 1; // TODO(type): not in three 0.160 (added in r163), so this does nothing at runtime yet
  const aspect = innerWidth / innerHeight;
  // near is negative: ortho zoom-out widens the view but the camera stays ~52 units from the target, so a positive
  // near plane sliced off everything nearer than the camera (a hard horizontal cut along the bottom of the screen)
  const f0 = o.frustum; const camera = new THREE.OrthographicCamera(-f0 * aspect / 2, f0 * aspect / 2, f0 / 2, -f0 / 2, -600, 600);
  const home = { target: o.home.target.clone(), pos: o.home.pos.clone(), zoom: o.home.zoom ?? 1 };
  camera.position.copy(home.pos); camera.zoom = home.zoom; camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.target.copy(home.target);
  controls.autoRotate = false; // no idle orbit: the overview stays a fixed isometric view
  controls.minPolarAngle = o.minPolar ?? 0.4; controls.maxPolarAngle = o.maxPolar ?? 1.2;
  controls.minZoom = o.minZoom ?? 0.5; controls.maxZoom = o.maxZoom ?? 5;
  controls.screenSpacePanning = true;
  const sz = new THREE.Vector2(); renderer.getDrawingBufferSize(sz);
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 2 }); // 4x MSAA on a half-float full-res target was the main GPU cost on iGPUs
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), o.bloom?.strength ?? 0.5, o.bloom?.radius ?? 0.4, o.bloom?.threshold ?? 1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = o.vignette?.offset ?? 1.0; vig.uniforms.darkness.value = o.vignette?.darkness ?? 1.0; composer.addPass(vig);
  const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
  labels.domElement.className = 'labels'; document.body.appendChild(labels.domElement);
  function resize() {
    const w = innerWidth, h = innerHeight, a = w / h;
    const f = o.frustum * (a < 1 ? 1.6 : 1); camera.left = -f * a / 2; camera.right = f * a / 2; camera.top = f / 2; camera.bottom = -f / 2;
    camera.updateProjectionMatrix(); renderer.setPixelRatio(PR * resScale); renderer.setSize(w, h); composer.setPixelRatio(PR * resScale); composer.setSize(w, h); labels.setSize(w, h);
    bloom.setSize(w, h); applyShift(); refreshHome(false);
  }
  // shift the projection so the camera target lands in the free gap between the left and right columns
  function applyShift() {
    const w = innerWidth, h = innerHeight; let px = 0;
    if (w >= 820) { const l = document.querySelector('.col.l')?.getBoundingClientRect().right || 0, r = document.querySelector('.col.r')?.getBoundingClientRect().left || w; if (r - l >= 300) px = Math.round((l + r) / 2 - w / 2); }
    camera.userData.vx = px;
    if (px) camera.setViewOffset(w, h, -px, 0, w, h); else camera.clearViewOffset();
  }
  applyShift();
  addEventListener('resize', resize);

  let fly: Fly | null = null, lastInput = -1e9, focused: PickT | null = null;
  function flyTo(target: THREE.Vector3, { zoom, dist, toPos, dur = 1.6 }: FlyOpts = {}) {
    const fromT = controls.target.clone(), fromP = camera.position.clone();
    const d = fromP.clone().sub(fromT); const len = dist ?? d.length();
    const toP = toPos ? toPos.clone() : target.clone().add(d.normalize().multiplyScalar(len));
    fly = { t: 0, dur: reduced ? 0.0001 : dur, fromT, fromP, fromZ: camera.zoom, toT: target.clone(), toP, toZ: zoom ?? camera.zoom };
  }
  function updateFly(dt: number) {
    if (!fly) return; fly.t += dt / fly.dur; const k = easeIO(clamp(fly.t, 0, 1));
    controls.target.lerpVectors(fly.fromT, fly.toT, k); camera.position.lerpVectors(fly.fromP, fly.toP, k);
    camera.zoom = fly.fromZ + (fly.toZ - fly.fromZ) * k; camera.updateProjectionMatrix();
    if (fly.t >= 1) { fly = null; $('#skip')?.classList.remove('on'); }
  }
  controls.addEventListener('start', () => { lastInput = performance.now(); controls.autoRotate = false; if (fly && fly.intro) { finishIntro(); } else fly = null; });
  function finishIntro() { if (!fly) return; controls.target.copy(fly.toT); camera.position.copy(fly.toP); camera.zoom = fly.toZ; camera.updateProjectionMatrix(); fly = null; $('#skip')?.classList.remove('on'); }
  if (!reduced && o.intro) {
    camera.position.copy(o.intro.pos); controls.target.copy(o.intro.target ?? home.target); camera.zoom = o.intro.zoom ?? home.zoom; camera.updateProjectionMatrix();
    flyTo(home.target, { toPos: home.pos, zoom: home.zoom, dur: o.intro.dur ?? 3.4 }); fly!.intro = true;
    $('#skip')?.classList.add('on');
  }
  $('#skip')?.addEventListener('click', finishIntro);

  const pickables: THREE.Object3D[] = [];
  const ctx: SceneCtx = { THREE, scene, camera, renderer, controls, CSS2DObject, reduced, composer, bloom,
    addPickable(m, pick) { m.userData.pick = pick; pickables.push(m); },
    removePickable(m) { const i = pickables.indexOf(m); if (i >= 0) pickables.splice(i, 1); },
    focus: (k, id) => api.focus(k, id), flyTo: (t, f) => flyTo(t, f), flying: () => !!fly, hud };
  const S = buildScene(ctx);
  api.onFloor = id => S.onFloor(id);
  api.lineSlots = id => S.lineSlots(id);

  const flEl = document.createElement('div'); flEl.className = 'focus-label';
  const fl = new CSS2DObject(flEl); fl.visible = false; scene.add(fl);
  api.focus = (kind, id) => {
    focused = { kind, id }; controls.autoRotate = false; hud.openDetail(kind, id); $('#back')?.classList.add('on');
    { const up = S.parentOf?.(kind, id), l = $('#back-l'); if (l) l.textContent = up && S.onFloor(up.id) ? 'Office · Esc' : 'Overview · Esc'; } // the back step goes one level up: desk view → its office
    const f = S.focusOf(kind, id); if (f) flyTo(f.target, { zoom: f.zoom, dist: f.dist, toPos: f.pos, dur: 1.4 }); // pos: a scene may name the camera spot too (office view)
  };
  // overview = one fixed isometric view: back/Esc/idle always fly to exactly home.pos/target/zoom, whatever the orbit was
  const offHome = () => controls.target.distanceTo(home.target) > .05 || camera.position.distanceTo(home.pos) > .05 || Math.abs(camera.zoom - home.zoom) > .005;
  const goHome = (dur = 1.4) => { if (offHome()) flyTo(home.target, { toPos: home.pos, zoom: home.zoom, dur }); };
  function refreshHome(snap: boolean) { // refit the overview (data or viewport changed); follow it when we are sitting on it
    const hm = S?.home?.(); if (!hm) return; const was = !focused && !fly && !offHome();
    home.target.copy(hm.target); home.pos.copy(hm.pos); home.zoom = hm.zoom;
    controls.minZoom = Math.min(hm.zoom * .8, o.maxZoom ?? 5); // max zoom-out: a bit past the whole-site fit, never a speck
    if (fly && fly.intro) { fly.toT.copy(home.target); fly.toP.copy(home.pos); fly.toZ = home.zoom; }
    else if (snap || was) { controls.target.copy(home.target); camera.position.copy(home.pos); camera.zoom = home.zoom; camera.updateProjectionMatrix(); }
  }
  api.unfocus = () => {
    const up = focused && S.parentOf?.(focused.kind, focused.id); // a scene may step back one level (office: desk view → its building)
    if (up && S.onFloor(up.id)) { S.unfocus?.(); hud.closeDetail(); api.focus(up.kind, up.id); lastInput = performance.now(); return; }
    if (focused) { focused = null; S.unfocus?.(); hud.closeDetail(); $('#back')?.classList.remove('on'); fl.visible = false; }
    goHome(); lastInput = performance.now();
  };
  $('#back')?.addEventListener('click', () => api.unfocus());
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (fly && fly.intro) finishIntro(); else api.unfocus(); } });

  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let ptrXY: [number, number] | null = null, dirty = false, hover: PickT | null = null, down: [number, number] | null = null;
  canvas.addEventListener('pointermove', e => { ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ptrXY = [e.clientX, e.clientY]; dirty = true; });
  canvas.addEventListener('pointerleave', () => { ptrXY = null; hover = null; hud.tip(null); S.hover?.(null); canvas.style.cursor = ''; });
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; if (fly && fly.intro) finishIntro(); });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; down = null;
    const p = pickAt(); if (p) api.focus(p.kind, p.id); else S?.clickAt?.(e.clientX, e.clientY);
  });
  // right-click a transport robot: a small menu with "Drive" (nudges a robot out of a jam)
  const rmenu = document.createElement('div'); rmenu.id = 'rmenu'; rmenu.setAttribute('role', 'menu'); rmenu.hidden = true; document.body.append(rmenu);
  const closeMenu = () => { if (!rmenu.hidden) { rmenu.hidden = true; rmenu.textContent = ''; } };
  let rdown: [number, number] | null = null; canvas.addEventListener('pointerdown', e => { if (e.button === 2) rdown = [e.clientX, e.clientY]; });
  canvas.addEventListener('contextmenu', e => {
    const dragged = rdown && Math.hypot(e.clientX - rdown[0], e.clientY - rdown[1]) > 5; rdown = null;
    const r = dragged ? null : S?.robotAt?.(e.clientX, e.clientY); if (!r) { closeMenu(); return; } e.preventDefault(); down = null;
    rmenu.textContent = ''; const t = document.createElement('div'); t.className = 'rm-t'; t.textContent = 'Transport robot ' + r.id; rmenu.append(t);
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = 'Drive';
    if (!r.canDrive) { b.disabled = true; b.title = 'Only a robot that is out on the road can drive'; }
    b.addEventListener('click', () => { S.driveRobot(r.id); closeMenu(); });
    rmenu.append(b); rmenu.hidden = false;
    const w = rmenu.offsetWidth, h = rmenu.offsetHeight; rmenu.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px'; rmenu.style.top = Math.min(e.clientY, innerHeight - h - 8) + 'px';
    if (!b.disabled) b.focus();
  });
  addEventListener('pointerdown', e => { if (!rmenu.contains(e.target as Node | null)) closeMenu(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  addEventListener('wheel', closeMenu, { passive: true }); addEventListener('blur', closeMenu);
  function pickAt(): PickT | null {
    ray.setFromCamera(ptr, camera); ray.ray.origin.addScaledVector(ray.ray.direction, camera.near); // start at the (negative) near plane so foreground stays pickable
    const hits = ray.intersectObjects(pickables, false);
    for (const h of hits) { let ob: THREE.Object3D | null = h.object; while (ob && !ob.userData.pick) ob = ob.parent; if (ob && ob.visible !== false) return ob.userData.pick; }
    return null;
  }
  function doHover() {
    if (!ptrXY) return; const p = pickAt();
    const key = p ? p.kind + p.id : null;
    if (key !== (hover && hover.kind + hover.id)) { hover = p; S.hover?.(p); }
    canvas.style.cursor = p || S?.pointerAt?.(ptrXY[0], ptrXY[1]) ? 'pointer' : S?.robotAt?.(ptrXY[0], ptrXY[1]) ? 'context-menu' : ''; // over a robot: hint that it has a right-click menu
    hud.tip(p, ptrXY[0], ptrXY[1]);
  }

  DS.subscribe((state, events) => {
    reindex(); computeDeltas();
    S.sync(state, events, deltas, first);
    refreshHome(first && !focused && !fly); // scene fits the iso overview to the whole site
    first = false;
    hud.update(events);
    if (ptrXY && hover) hud.tip(hover, ptrXY[0], ptrXY[1]);
  });

  const clock = new THREE.Clock();
  // adaptive render scale: the scene is light, so slow frames are GPU fill-rate (iGPU / shared GPU). Average the frame
  // interval over a window; step the buffer scale down when under ~26fps, back up (rarely) when well over 50fps.
  let aN = 0, aSum = 0, aPrev = 0, aHold = 0, aWarm = 0, aBad = 0;
  function adaptRes(now: number) {
    if (aPrev && !document.hidden) { const d = now - aPrev; if (d < 500 && ++aWarm > 40) { aSum += d; aN++; } }
    aPrev = now;
    if (aN < 12) return;
    const avg = aSum / aN; aN = 0; aSum = 0;
    let ns = resScale;
    if (avg > 38 && resScale > 0.6) { if (++aBad >= 2) { aBad = 0; aHold = now + 8000; ns = Math.max(0.6, resScale * 0.85); } }
    else if (avg <= 38 && (aBad = 0, avg < 22) && now > aHold && resScale < 1) ns = Math.min(1, resScale * 1.25);
    if (Math.abs(ns - resScale) < 1e-3) return;
    resScale = ns; const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(PR * resScale); renderer.setSize(w, h); composer.setPixelRatio(PR * resScale); composer.setSize(w, h); bloom.setSize(w, h); labels.setSize(w, h);
  }
  renderer.setAnimationLoop(() => {
    adaptRes(performance.now());
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    updateFly(dt);
    // no idle return: the camera stays where you left it; only Esc / the back button goes back to the overview
    controls.update(dt);
    S.frame(dt, t);
    if (dirty) { dirty = false; doHover(); }
    if (focused && focused.kind === 'agent' && S.anchorOf) {
      const v = S.anchorOf(focused.id); const a = agentIndex.get(focused.id);
      if (v && a) { fl.visible = true; fl.position.copy(v); const s = `${a.role} · ${fmt.tokens(a.tokens)}`; if (flEl.textContent !== s) flEl.textContent = s; } else fl.visible = false;
    }
    hud.frame(dt);
    composer.render(dt); labels.render(scene, camera); S.layoutLabels();
  });
}
