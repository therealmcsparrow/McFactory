/* Settings ("fun elements"): per-view toggles and a few numbers, kept in this browser (localStorage 'cw.fun').
 * Contract: window.CWFun = { get(key), set(key, value), on(fn) }; fn(key, value) runs after every change,
 * and window gets a 'cw-fun' CustomEvent with detail {key, value}.
 * Toggles are booleans; unknown keys read as true. Numeric keys (NUM) read as a whole number in their range, their
 * default until set: shopWalkers (shoppers on foot at once, 0..30, 12), shopCars (shop vehicles at once, 0..20, 20),
 * officeMax (offices drawn in the office view, 12..100, 50), patrols (patrol cars cruising the office town, 0..4, 2),
 * dogWalkers (dog walkers on the office town's sidewalks at once, 0..20, 6), kids (kids in the office park's playground at once, 0..16, 12).
 * Plain script in <head>: defined before chat.js, usage.js, the main module and office.js run. */
window.CWFun = (() => {
  'use strict';
  type Val = boolean | number;
  // NUM: [min, max, default]. shopCars' max is the number of spots in use at the shops (SHOP_SPOTS in office/buildings/shops.ts);
  // officeMax's max is the number of cells in the office grid (MAXOFF in office/layout.ts)
  const LSK = 'cw.fun', DEF: Record<string, boolean> = { breakdowns: true, robbery: true, shops: true }, NUM: Record<string, [number, number, number]> = { shopWalkers: [0, 30, 12], shopCars: [0, 20, 20], officeMax: [12, 100, 50], patrols: [0, 4, 2], dogWalkers: [0, 20, 6], kids: [0, 16, 12] };
  const fns: ((key: string, value: Val) => void)[] = [];
  const isNum = (k: string) => Object.prototype.hasOwnProperty.call(NUM, k);
  const fit = (k: string, v: unknown): number => { const [a, b, d] = NUM[k], n = typeof v === 'number' && isFinite(v) ? Math.round(v) : d; return Math.min(b, Math.max(a, n)); };
  const read = () => { let o = null; try { o = JSON.parse(localStorage.getItem(LSK) || 'null'); } catch (e) { } const r: Record<string, Val> = { ...DEF };
    for (const k in NUM) r[k] = NUM[k][2];
    if (o && typeof o === 'object') for (const k in o) { if (isNum(k)) r[k] = fit(k, o[k]); else if (typeof o[k] === 'boolean') r[k] = o[k]; } return r; };
  let cur = read();
  const val = (k: string): Val => isNum(k) ? fit(k, cur[k]) : typeof cur[k] === 'boolean' ? cur[k] : true;
  const mark = (k: string, v: Val) => { if (typeof v === 'boolean') document.documentElement.classList.toggle('fun-off-' + k, !v); }; // CSS hook: .fun-off-breakdowns ...
  for (const k in cur) mark(k, cur[k]);
  function emit(key: string, value: Val) {
    mark(key, value);
    for (const fn of fns.slice()) try { fn(key, value); } catch (e) { console.error(e); }
    try { window.dispatchEvent(new CustomEvent('cw-fun', { detail: { key, value } })); } catch (e) { }
  }
  const api: FunSettings = {
    get: ((key: string) => val(String(key))) as FunSettings['get'],
    set: ((key: string, value: unknown) => { key = String(key); const v: Val = isNum(key) ? fit(key, value) : !!value; if (val(key) === v) return;
      cur[key] = v; try { localStorage.setItem(LSK, JSON.stringify(cur)); } catch (e) { } emit(key, v); }) as FunSettings['set'],
    on(fn) { if (typeof fn === 'function') fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
  };
  window.addEventListener('storage', e => { if (e.key !== LSK && e.key !== null) return; // another tab changed it: follow
    const old = Object.fromEntries([...new Set([...Object.keys(cur), ...Object.keys(NUM)])].map(k => [k, val(k)])); cur = read();
    const keys = new Set([...Object.keys(old), ...Object.keys(cur)]);
    for (const k of keys) { const a = k in old ? old[k] : true, b = val(k); if (a !== b) emit(k, b); } });
  return api;
})();
// Settings dialog: a button next to Usage (in .chat-acts, which chat.js builds) opens a modal <dialog> with one checkbox per toggle
// and a slider per number (shown under the toggle it belongs to, with its current value)
document.addEventListener('DOMContentLoaded', () => {
  const F = window.CWFun, view = document.body.classList.contains('v-office') ? 'office' : 'factory';
  type Row = [string, string] | [string, string, number, number]; // a toggle [key, label], or a number [key, label, min, max]
  const GROUPS: [string, string, Row[]][] = [['factory', 'Factory', [['breakdowns', 'Breakdowns, tow truck and repair shop']]],
    ['office', 'Office', [['officeMax', 'Offices in town, at most', 12, 100], ['robbery', 'Armoured car robberies (police and SWAT respond)'], ['patrols', 'Patrol cars', 0, 4], ['shops', 'Shops and shoppers'],
      ['shopWalkers', 'Shoppers on foot, at most', 0, 30], ['shopCars', 'Shop vehicles (cars and motorcycles), at most', 0, 20], ['dogWalkers', 'Dog walkers, at most', 0, 20], ['kids', 'Kids in the park, at most', 0, 16]]]];
  const SHOPN = ['shopWalkers', 'shopCars']; // the sliders that go with the shops toggle
  const row = (r: Row) => r.length === 2 ? `<label class="cf-t"><input type="checkbox" data-k="${r[0]}"><span>${r[1]}</span></label>`
    : `<div class="cf-n"><label for="cf-${r[0]}">${r[1]}</label><output id="cf-${r[0]}-v" for="cf-${r[0]}" aria-hidden="true"></output>`
      + `<input type="range" id="cf-${r[0]}" data-n="${r[0]}" min="${r[2]}" max="${r[3]}" step="1"></div>`;
  const dlg = document.createElement('dialog'); dlg.className = 'cf'; dlg.setAttribute('aria-labelledby', 'cf-title');
  dlg.innerHTML = '<div class="cf-box"><div class="cf-head"><h2 id="cf-title">Settings</h2><button type="button" class="us-x cf-x" aria-label="Close settings"></button></div>'
    + '<p class="cf-note">Fun elements. Changes apply at once and are saved in this browser only.</p>'
    + GROUPS.map(([v, name, items]) => `<fieldset class="cf-grp" data-view="${v}"><legend>${name}${v === view ? ' <small>this view</small>' : ''}</legend>`
      + items.map(row).join('') + '</fieldset>').join('')
    + '</div>';
  document.body.append(dlg);
  const boxes = [...dlg.querySelectorAll<HTMLInputElement>('input[data-k]')], nums = [...dlg.querySelectorAll<HTMLInputElement>('input[data-n]')];
  const show = (n: HTMLInputElement) => { const v = n.value === '0' ? 'none' : n.value; dlg.querySelector<HTMLOutputElement>(`#cf-${n.dataset.n}-v`)!.value = v; n.setAttribute('aria-valuetext', v); };
  const sync = () => { for (const b of boxes) b.checked = F.get(b.dataset.k!); for (const n of nums) { n.value = String(F.get(n.dataset.n as FunNumKey)); n.disabled = SHOPN.includes(n.dataset.n!) && !F.get('shops'); show(n); } };
  for (const b of boxes) b.addEventListener('change', () => F.set(b.dataset.k!, b.checked));
  for (const n of nums) n.addEventListener('input', () => { show(n); F.set(n.dataset.n as FunNumKey, +n.value); });
  F.on(sync);
  const btn = document.createElement('button');
  btn.id = 'settings-open'; btn.type = 'button'; btn.className = 'chat-new chat-ref'; btn.title = 'Settings: fun elements'; btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = '<span aria-hidden="true"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 3h9M1.5 9h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="4" cy="3" r="1.6" fill="var(--color-raise)" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="9" r="1.6" fill="var(--color-raise)" stroke="currentColor" stroke-width="1.3"/></svg></span><span class="lbl">Settings</span>';
  const acts = document.querySelector('.chat-acts'); (acts || document.querySelector('#win')?.parentNode || document.body).append(btn);
  btn.addEventListener('click', () => { sync(); dlg.showModal(); (dlg.querySelector<HTMLInputElement>(`.cf-grp[data-view="${view}"] input`) || boxes[0]).focus(); });
  dlg.querySelector('.cf-x')!.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // backdrop click
  dlg.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); }); // Esc closes the dialog only, not the focused hall too
  dlg.addEventListener('close', () => btn.focus());
});
