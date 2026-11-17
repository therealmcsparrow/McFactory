import * as THREE from 'three';
import { clamp } from '../common/math.js';
import { agentIndex } from '../app/data.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { PickKind } from '../common/types.js';
import type { FSAtFocus } from './state.js';
import type { FocusFit, Hall, Line, Rect } from './types.js';

export function makeFocus(FS: FSAtFocus) {
  const { W, camera, HX, XC, facs, whLab, extraLabs, BX0, BX1, BY, arms, dyingArms, ARMDZ, lineIdx, WHX, WHZ, BAYZ, XP, R } = FS;
  const RV = new THREE.Vector3(), UV = new THREE.Vector3(), FV = new THREE.Vector3(), FP = new THREE.Vector3(), LP = new THREE.Vector3();
  // free screen area for an open hall: between the left column and the detail card (or right column), below the Overview button
  function freeArea() {
    const w = innerWidth, h = innerHeight; let l = 0, r = w, t = 0;
    if (w >= 820) { const cl = document.querySelector<HTMLElement>('.col.l'), d = document.querySelector<HTMLElement>('#detail'), cr2 = d && !d.hidden ? d : document.querySelector<HTMLElement>('.col.r'); l = cl ? cl.offsetLeft + cl.offsetWidth : 0; r = cr2 ? cr2.offsetLeft : w; if (r - l < 200) { l = 0; r = w; } } // offsets: the detail card's slide-in transform does not count
    const b = document.querySelector('#back'); if (b && b.classList.contains('on')) t = b.getBoundingClientRect().bottom;
    return { l: l + 8, r: r - 8, t: t + 8, b: h - 8 };
  }
  function fitHall(f: Hall): FocusFit { // zoom + target so the open hall, its line signs and the board above it fit the free area
    const w = innerWidth, h = innerHeight, A = freeArea(), hz = f.D / 2, P0 = W(f, 0, 0, 0);
    RV.set(1, 0, 0).applyQuaternion(camera.quaternion); UV.set(0, 1, 0).applyQuaternion(camera.quaternion); FV.set(0, 0, -1).applyQuaternion(camera.quaternion);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const x of [-HX - .3, XC + .5]) for (const z of [-hz - .3, hz + .3]) for (const y of [0, 1.2]) { W(f, x, y, z, FP).sub(P0); const u = FP.dot(RV), v = FP.dot(UV); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const top = (f.closed.length ? clamp(f.cbLab.element.offsetHeight || 200, 60, 260) : 40) + 14, side = 36; // board (or name sign) above, line signs at the sides
    const gw = A.r - A.l - 2 * side, gh = A.b - A.t - top - 6, ppu1 = h / 30;
    const zoom = clamp(Math.min(gw / ((u1 - u0) * ppu1), gh / ((v1 - v0) * ppu1)), .3, 1.6), ppu = ppu1 * zoom;
    const xd = (A.l + A.r) / 2, yd = A.t + top + gh / 2, a = (xd - w / 2 - (camera.userData.vx || 0)) / ppu, b = (h / 2 - yd) / ppu;
    const target = P0.clone().addScaledVector(RV, (u0 + u1) / 2 - a).addScaledVector(UV, (v0 + v1) / 2 - b);
    if (Math.abs(FV.y) > .05) target.addScaledVector(FV, (.5 - target.y) / FV.y); // slide along the view ray back to the floor (same picture, sane orbit pivot)
    return { target, zoom, fit: true };
  }
  // screen-space label layout while a hall is open: labels stay in the free area, overlapping ones stack by priority,
  // what does not fit hides (+N hint). Priority: focused line > lines > board > hall name > subtotal > rest. Overview: untouched.
  const lmore = document.createElement('div'); lmore.id = 'lmore'; lmore.hidden = true; document.body.appendChild(lmore);
  let layOn = false;
  const labItems = () => { const out: [CSS2DObject, number][] = [];
    for (const f of facs.values()) { out.push([f.nameLab, 50], [f.subLab, 45], [f.cbLab, 60]); for (const l of f.lines) out.push([l.lab, l === markedL ? 100 : 90]); }
    out.push([whLab, 10]); if (FS.offLab) out.push([FS.offLab, 10]); for (const o of extraLabs) out.push([o, 10]); return out; };
  const setOff = (el: HTMLElement, dx: number, dy: number, hide: boolean) => { const tr = dx || dy ? Math.round(dx) + 'px ' + Math.round(dy) + 'px' : ''; if (el.style.translate !== tr) el.style.translate = tr; if (el.classList.contains('lhide') !== hide) el.classList.toggle('lhide', hide); };
  function layoutLabels() {
    if (!FS.focusF) { if (layOn) { layOn = false; for (const [o] of labItems()) { setOff(o.element, 0, 0, false); o.element.classList.remove('lnear'); if (o.element.classList.contains('cb')) o.element.style.maxWidth = ''; } lmore.hidden = true; } return; }
    layOn = true; const w = innerWidth, h = innerHeight, A = freeArea(), placed: Rect[] = [], obs: Rect[] = [], F = facs.get(FS.focusF); let hid = 0;
    const scr = (v: THREE.Vector3, out: { x: number; y: number }) => { v.project(camera); out.x = (v.x + 1) / 2 * w; out.y = (1 - v.y) / 2 * h; return out; }, sp = {} as { x: number; y: number };
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => { const r: Rect = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 }; // screen rect of a hall-local box
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) { scr(W(F!, x, y, z, LP), sp); r.l = Math.min(r.l, sp.x); r.r = Math.max(r.r, sp.x); r.t = Math.min(r.t, sp.y); r.b = Math.max(r.b, sp.y); }
      return r; };
    if (F) { // obstacles: belts (with crates) and every arm's swing envelope (pad to belt, full height); no sign covers them
      for (const l of F.lines) for (let x = BX0; x < BX1; x += 1.1) obs.push(box(x, Math.min(BX1, x + 1.1), 0, BY + .45, l.z - .5, l.z + .5));
      for (const S of [arms, dyingArms]) for (const a of S.values()) { const Ar = a.line ? a : null; if (!Ar || Ar.line.f !== F) continue; const s = Ar.scale || 1;
        obs.push(box(Ar.ax - .6 * s, Ar.ax + .6 * s, 0, 2.35 * s, Ar.line.z + ARMDZ - 1.5 * s, Ar.line.z + .5)); }
    }
    window.__labObs = obs; // read by the headless overlap check
    if (!lmore.hidden) placed.push({ l: A.l, t: A.b - 22, r: A.l + 190, b: A.b });
    const hit = (r: Rect, list: Rect[]) => list.filter(c => r.l < c.r && r.r > c.l && r.t < c.b && r.b > c.t);
    for (const [o, p] of labItems().sort((x, y) => y[1] - x[1])) {
      const el = o.element; if (!el.isConnected) continue;
      if (el.style.display === 'none' || ((el.classList.contains('sub') || el.classList.contains('cb')) && !el.classList.contains('show'))) { setOff(el, 0, 0, false); el.classList.remove('lnear'); continue; }
      if (el.classList.contains('cb')) { const mw = Math.min(370, A.r - A.l) + 'px'; if (el.style.maxWidth !== mw) el.style.maxWidth = mw; } // board never wider than the free gap
      const bw = el.offsetWidth, bh = el.offsetHeight; scr(o.getWorldPosition(LP), sp);
      const x0 = sp.x - o.center.x * bw + el.offsetLeft, y0 = sp.y - o.center.y * bh + el.offsetTop, own = el.dataset.h === FS.focusF;
      if (!own && (x0 < A.l || x0 + bw > A.r || y0 < A.t || y0 + bh > A.b)) { setOff(el, 0, 0, true); continue; } // other halls / warehouse labels: only where fully free
      const xL = own ? A.l : x0, xR = own ? Math.max(A.l, A.r - bw) : x0, xc = clamp(x0, xL, xR), yc = own ? clamp(y0, A.t, Math.max(A.t, A.b - bh)) : y0, up = el.dataset.up === '1' || p < 90;
      const against = placed.concat(obs), cand: [number, number, number][] = [], seen = new Set<string>(); let x = null, y = null; // 2D search: up/down and sideways around arms, belts and placed signs
      const add = (cx: number, cy: number) => { if (cy < A.t - .5 || cy + bh > A.b + .5 || (up && cy > yc + .5) || cx < xL - .5 || cx > xR + .5) return; const key = Math.round(cx) + ',' + Math.round(cy); if (!seen.has(key)) { seen.add(key); cand.push([cx, cy, Math.abs(cx - xc) * 1.2 + Math.abs(cy - yc)]); } };
      add(xc, yc); if (p >= 90 && own) add(clamp(sp.x - (o.center.x > .5 ? -6 : bw + 6), xL, xR), yc); // line sign: just outside the line start, clear of the arm row
      for (let k = 0; k < 160 && cand.length; k++) {
        let bi = 0; for (let i = 1; i < cand.length; i++) if (cand[i][2] < cand[bi][2]) bi = i; const [cx, cy] = cand[bi]; cand[bi] = cand[cand.length - 1]; cand.pop();
        const cs = hit({ l: cx, t: cy, r: cx + bw, b: cy + bh }, against); if (!cs.length) { x = cx; y = cy; break; }
        for (const q of cs) { add(cx, q.t - bh - 4); if (!up) add(cx, q.b + 4); if (own) { add(clamp(q.l - bw - 4, xL, xR), cy); add(clamp(q.r + 4, xL, xR), cy); } }
      }
      if (y === null && own) { let bd = 1e9; // greedy ran dry: coarse scan of the free area, nearest free slot wins
        for (let cy = A.t; cy + bh <= A.b && !(up && cy > yc + .5); cy += 10) for (const cx of [xc, xL, xR, (xL + xR) / 2]) { const d = Math.abs(cx - xc) * 1.2 + Math.abs(cy - yc); if (d < bd && !hit({ l: cx, t: cy, r: cx + bw, b: cy + bh }, against).length) { bd = d; x = cx; y = cy; } } }
      if (y === null) { setOff(el, 0, 0, true); if (own) hid++; continue; }
      setOff(el, x! - x0, y - y0, false); placed.push({ l: x!, t: y, r: x! + bw, b: y + bh });
      const near = obs.some(q => x! - 10 < q.r && x! + bw + 10 > q.l && y - 10 < q.b && y + bh + 10 > q.t); if (el.classList.contains('lnear') !== near) el.classList.toggle('lnear', near); // close to moving parts: see-through
    }
    if (hid) { const s = '+' + hid + ' sign' + (hid === 1 ? '' : 's') + ' hidden · zoom in'; if (lmore.textContent !== s) lmore.textContent = s; lmore.style.left = A.l + 'px'; lmore.style.top = (A.b - 22) + 'px'; }
    lmore.hidden = !hid;
  }
  function framed(f: FocusFit | null) { // move the camera target so the subject lands in the gap between the left column and the detail card
    if (!f || innerWidth < 820) return f;
    const l = document.querySelector('.col.l')?.getBoundingClientRect().right || 0, r = document.querySelector('#detail')?.getBoundingClientRect().left || innerWidth;
    if (r - l < 200) return f;
    const px = (l + r) / 2 - innerWidth / 2 - (camera.userData.vx || 0), ppu = innerHeight / 30 * f.zoom;
    RV.set(1, 0, 0).applyQuaternion(camera.quaternion); RV.y = 0; RV.normalize();
    f.target.addScaledVector(RV, -px / ppu); return f;
  }
  function focusOf(kind: PickKind, id: string) { const f = focusRaw(kind, id); return f && f.fit ? f : framed(f); }
  let markedL: Line | null = null;
  function markLine(l: Line | null) { if (markedL) { markedL.el.classList.remove('on'); markedL.wrap.classList.remove('on'); markedL.finEl.classList.remove('open'); } markedL = l; if (l) { l.el.classList.add('on'); l.wrap.classList.add('on'); l.finEl.classList.add('open'); } } // a focused line shows its finished rows
  function focusRaw(kind: PickKind, id: string): FocusFit | null {
    markLine(null);
    if (kind === 'agent') { const A = arms.get(id);
      if (!A) { const a = agentIndex.get(id), l = a && lineIdx.get(a.taskId); if (!l) return null; FS.focusF = l.f.id; markLine(l); return { target: W(l.f, BX0 + 1, .8, l.z - .6), zoom: 2.2 }; } // finished agent: its line's sign
      FS.focusF = A.line.f.id; return { target: W(A.line.f, A.ax, 1, A.line.z + ARMDZ / 2), zoom: 3 }; }
    if (kind === 'task') { const l = lineIdx.get(id);
      if (!l) { const f = [...facs.values()].find(f => f.closed.some(t => t.id === id)); if (!f) return null; FS.focusF = f.id; return fitHall(f); } // closed session: open its hall, sign board in view
      FS.focusF = l.f.id; markLine(l); return { target: W(l.f, (BX0 + BX1) / 2, .8, l.z - 1.1), zoom: 1.4 }; }
    if (kind === 'project') { const f = facs.get(id); if (!f) return null; FS.focusF = f.id; return fitHall(f); }
    FS.focusF = null; return { target: new THREE.Vector3(0, 1.8, 0), zoom: 1.25 };
  }
  function anchorOf(id: string) { const A = arms.get(id); if (!A) return null; return W(A.line.f, A.ax, 2.3 * (A.scale || 1), A.line.z + ARMDZ); }
  const ISO = new THREE.Vector3(1, 1, 1).normalize(), HR = new THREE.Vector3(), HU = new THREE.Vector3(), HP = new THREE.Vector3();
  function home() { // fit the used grid into the free gap between the columns (projection is shifted there, see applyShift)
    let x0 = -WHX - 4, x1 = WHX + 4, z0 = -WHZ - 3, z1 = BAYZ + 3;
    for (const f of facs.values()) { const ex = f.ox + f.d * (XP + 1.5); x0 = Math.min(x0, f.ox - HX - 1, ex); x1 = Math.max(x1, f.ox + HX + 1, ex); z0 = Math.min(z0, f.oz - f.D / 2 - 1); z1 = Math.max(z1, f.oz + f.D / 2 + 1); }
    const w = innerWidth, h = innerHeight; let l = 0, r = w;
    if (w >= 820) { l = document.querySelector('.col.l')?.getBoundingClientRect().right || 0; r = document.querySelector('.col.r')?.getBoundingClientRect().left || w; if (r - l < 300) { l = 0; r = w; } }
    // classic isometric overview (camera along ISO, ~35.3 deg elevation, 45 deg azimuth): project the site's box corners
    // onto the screen axes of that exact view, then fit + center that projected rectangle in the gap
    const R = HR.set(1, 0, -1).normalize(), U = HU.set(-1, 2, -1).normalize(), YT = 4; // YT: hall roofs, arms, piles
    let u0 = 1e9, u1 = -1e9, s0 = 1e9, s1 = -1e9;
    for (const x of [x0, x1]) for (const y of [0, YT]) for (const z of [z0, z1]) { HP.set(x, y, z); const u = HP.dot(R), s = HP.dot(U); u0 = Math.min(u0, u); u1 = Math.max(u1, u); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const ppu = h / (30 * (w / h < 1 ? 1.6 : 1)), mx = 32, mt = 76, mb = 28; // px margins; top: room for hall signs
    const zoom = clamp(Math.min((r - l - 2 * mx) / (ppu * (u1 - u0)), (h - mt - mb) / (ppu * (s1 - s0))), .2, 1.6);
    const t = R.clone().multiplyScalar((u0 + u1) / 2).addScaledVector(U, (s0 + s1) / 2 + (mt - mb) / 2 / (ppu * zoom));
    t.addScaledVector(ISO, -t.y / ISO.y); // slide along the view ray onto the ground: same picture, orbit pivots on the floor
    return { target: t, pos: t.clone().addScaledVector(ISO, 52), zoom };
  }
  return { layoutLabels, focusOf, markLine, anchorOf, home };
}
