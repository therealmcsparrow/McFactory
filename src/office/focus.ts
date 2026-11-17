import { clamp } from '../common/math.js';
import { agentIndex, taskById, DS } from '../app/data.js';
import type { Agent, FocusView, PickKind } from '../common/types.js';
import type { OSAtFocus } from './state.js';
import type { Office, OfficeSeat, Person, Pov, Seat } from './types.js';
import { SHOP_SITE } from './buildings/shops.js';
import { HOME_SITE, HOME_BOX } from './buildings/apartments.js';

export function makeFocus(OS: OSAtFocus) {
  const { HX, HZ, RI, UI, F0, V, ISO, YA, who, bldgs, BKX, refreshVis, people, EX, STZ, PRZ, BH } = OS;
  const { controls, camera } = OS.ctx;
  // ── camera: fit an open building, or look through an agent's eyes ──
  const polar0 = controls.maxPolarAngle;
  function freeArea(screen?: boolean) { // screen: the detail card sits in the middle as the monitor (view from a desk), so it takes no room
    const w = innerWidth, h = innerHeight; let l = 0, r = w, t = 0;
    if (w >= 820) { const cl = document.querySelector<HTMLElement>('.col.l'), d = document.querySelector<HTMLElement>('#detail'), cr = !screen && d && !d.hidden ? d : document.querySelector<HTMLElement>('.col.r'); l = cl ? cl.offsetLeft + cl.offsetWidth : 0; r = cr ? cr.offsetLeft : w; if (r - l < 200) { l = 0; r = w; } }
    const b = document.querySelector('#back'); if (b && b.classList.contains('on')) t = b.getBoundingClientRect().bottom;
    return { l: l + 8, r: r - 8, t: t + 8, b: h - 8 };
  }
  function fit(F: Office): FocusView {
    const w = innerWidth, h = innerHeight, A = freeArea(); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const x of [-HX - .4, HX + .4]) for (const z of [-HZ - .4, HZ + .4]) for (const y of [0, 1.9]) { const u = x * RI.x + z * RI.z, v = x * UI.x + y * UI.y + z * UI.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const top = 78, side = 40, gw = A.r - A.l - 2 * side, gh = A.b - A.t - top - 10, ppu1 = h / F0(), zoom = clamp(Math.min(gw / ((u1 - u0) * ppu1), gh / ((v1 - v0) * ppu1)), .3, 3.2), ppu = ppu1 * zoom;
    const a = ((A.l + A.r) / 2 - w / 2 - (camera.userData.vx || 0)) / ppu, b = (h / 2 - (A.t + top + gh / 2)) / ppu;
    const target = V(F.ox, 0, F.oz).addScaledVector(RI, (u0 + u1) / 2 - a).addScaledVector(UI, (v0 + v1) / 2 - b); target.addScaledVector(ISO, (.5 - target.y) / ISO.y);
    return { target, zoom, pos: target.clone().addScaledVector(ISO, 52) };
  }
  function povOf(P: Person): Pov { // only called for a seat with a desk view (seat.look set; eye and sw come with it)
    const F = P.f, s = P.seat as OfficeSeat & Required<Pick<Seat, 'eye' | 'look' | 'sw'>>, eye =V(F.ox + s.eye[0], s.eye[1], F.oz + s.eye[2]), look = V(F.ox + s.look[0], s.look[1], F.oz + s.look[2]);
    const w = innerWidth, A = freeArea(true), ppu1 = innerHeight / F0(), zoom = clamp((A.r - A.l) * .6 / (s.sw * ppu1), 4, 48);
    const right = look.clone().sub(eye).normalize().cross(YA).normalize().multiplyScalar(-((A.l + A.r) / 2 - w / 2 - (camera.userData.vx || 0)) / (ppu1 * zoom));
    look.add(right); eye.add(right); return { id: P.id, target: look, pos: eye, zoom };
  }
  function focusOf(kind: PickKind, id: string) {
    let F: Office | null = null, res: FocusView | null = null; OS.pov = null; OS.markedTask = null;
    if (kind === 'agent') { const P = who(id), a = agentIndex.get(id);
      if (P && P.seat && P.seat.look) { F = P.f; OS.pov = res = povOf(P); }
      else if (P) { F = P.f; const target = V(F.ox + P.x, 1.1, F.oz + P.z); res = { target, zoom: 4.5, pos: target.clone().addScaledVector(ISO, 52) }; }
      else if (a) { F = bldgs.get(a.projectId) || null; OS.markedTask = a.taskId; res = F && fit(F); } }
    else if (kind === 'task') { const t = taskById(id); F = (t && bldgs.get(t.projectId)) || null; OS.markedTask = id; res = F && fit(F); }
    else if (kind === 'project') { F = bldgs.get(id) || null; res = F && fit(F); }
    else { const target = V(BKX, 1.5, (OS.BBZ + OS.BFZ) / 2 + 2); res = { target, zoom: 1.5, pos: target.clone().addScaledVector(ISO, 52) }; }
    OS.focusF = F; for (const f of bldgs.values()) { f.openT = f === F ? 1 : 0; refreshVis(f); }
    controls.maxPolarAngle = OS.pov ? 1.56 : polar0;
    povMark(OS.pov && (agentIndex.get(id) || people.get(OS.pov.id)?.a));
    return res;
  }
  // body.pov turns the detail card into the monitor the camera is looking at (chat.css); --scr is the screen (effort) colour
  function povMark(a: Agent | null | undefined | false) { document.body.classList.toggle('pov', !!a); if (a) document.body.style.setProperty('--scr', DS.effortInfo(a.effort).id === 'max' ? '#c9ccd4' : DS.effortColor(a.effort)); } // max is black, which vanishes against the dark bezel: use its light text colour instead
  function unfocus() { OS.focusF = null; OS.pov = null; povMark(null); OS.markedTask = null; controls.maxPolarAngle = polar0; for (const f of bldgs.values()) { f.openT = 0; refreshVis(f); } }
  function anchorOf(id: string) { const P = who(id); if (!P || (OS.pov && OS.pov.id === P.id) || P.state === 'car') return null; return V(P.f.ox + P.x, 2, P.f.oz + P.z); }
  const HP = V();
  // fit what is built (offices, roads and roundabouts, the bank, the police station, the shops, the apartments) into the gap
  // between the side columns, classic isometric view. The corners of each box are projected one by one: a single box round everything would
  // count its empty corners, and in the isometric view those make the town look small
  function home() {
    let u0 = 1e9, u1 = -1e9, s0 = 1e9, s1 = -1e9;
    const box = (x0: number, x1: number, z0: number, z1: number, y1: number) => { for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of y1 ? [0, y1] : [0]) { HP.set(x, y, z); const u = HP.dot(RI), s = HP.dot(UI); u0 = Math.min(u0, u); u1 = Math.max(u1, u); s0 = Math.min(s0, s); s1 = Math.max(s1, s); } };
    for (const F of bldgs.values()) box(F.ox - HX - .5, F.ox + HX + .5, F.oz - HZ - .5, F.oz + HZ + .5, BH + 1.5);
    for (const c of OS.net.R) box(c[0] - OS.RT, c[0] + OS.RT, c[1] - OS.RT, c[1] + OS.RT, 0);
    for (const n of OS.net.N.values()) box(n.x - 1.5, n.x + 1.5, n.z - 1.5, n.z + 1.5, 0); // the roads (their nodes, with the lane's width)
    box(OS.BFW - .5, OS.BFX + .5, OS.BBZ - .5, OS.BFZ + .5, BH); // the bank and its yard
    box(OS.POX - 3, OS.PIX + 3, OS.PLZ - 1, PRZ + 3, 5); // the police station
    { const c = Math.cos(SHOP_SITE.rot), s = Math.sin(SHOP_SITE.rot); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; // the shops (local x -45..14, z -8..67, and a little round it)
      for (const x of [-51, 20]) for (const z of [-14, 73]) { const wx = SHOP_SITE.x + x * c + z * s, wz = SHOP_SITE.z - x * s + z * c; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
      box(x0, x1, z0, z1, 6); }
    box(HOME_SITE.x + HOME_BOX.X0, HOME_SITE.x + HOME_BOX.X1, HOME_SITE.z + HOME_BOX.Z1, HOME_SITE.z, 16); // the apartments (Oak House: 6 floors)
    const w = innerWidth, h = innerHeight; let l = 0, r = w;
    if (w >= 820) { l = document.querySelector('.col.l')?.getBoundingClientRect().right || 0; r = document.querySelector('.col.r')?.getBoundingClientRect().left || w; if (r - l < 300) { l = 0; r = w; } }
    const ppu = h / F0(), mx = 20, mt = 64, mb = 20, zoom = clamp(Math.min((r - l - 2 * mx) / (ppu * (u1 - u0)), (h - mt - mb) / (ppu * (s1 - s0))), .04, 1.6), pz = ppu * zoom;
    const a = ((l + r) / 2 - w / 2 - (camera.userData.vx || 0)) / pz; // the gap between the columns is not always in the middle of the screen
    const t = RI.clone().multiplyScalar((u0 + u1) / 2 - a).addScaledVector(UI, (s0 + s1) / 2 + (mt - mb) / 2 / pz); t.addScaledVector(ISO, -t.y / ISO.y);
    return { target: t, pos: t.clone().addScaledVector(ISO, 52), zoom };
  }
  return { focusOf, povMark, unfocus, anchorOf, home };
}
