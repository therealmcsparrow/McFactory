// Loads still on their way to the store when the page goes: factory crates on belts, docks and robots; office drives on
// the data lines, in the dock piles and in the armoured cars. Switching view reloads the page, so each view hands its
// loads over here on pagehide and the next view, whichever it is, puts them back on that project's dock.
// The contract (v1): project id -> load colours (#rrggbb), in sessionStorage (this tab only), stale after MAX_AGE.
// No imports, so test/ can load the built module on its own.

export type Carry = Map<string, string[]>;
const KEY = 'mcf.carry', MAX_AGE = 60e3, MAX_PER = 120, MAX_PROJ = 200;
const HEX = /^#[0-9a-f]{6}$/i;

/** The text saved for these loads: at most MAX_PER per project, bad entries left out. */
export function encodeCarry(m: Carry, now: number): string {
  const p: [string, string[]][] = [];
  for (const [id, cols] of m) { const c = cols.filter(h => HEX.test(h)).slice(0, MAX_PER); if (id && id.length <= 200 && c.length && p.length < MAX_PROJ) p.push([id, c]); }
  return JSON.stringify({ v: 1, at: now, p });
}

/** The loads in a saved text; empty when it is missing, stale, from another version or not well formed. */
export function decodeCarry(raw: string | null, now: number): Carry {
  const m: Carry = new Map();
  try {
    const o = JSON.parse(raw || 'null');
    if (!o || o.v !== 1 || !Number.isFinite(o.at) || now - o.at > MAX_AGE || now < o.at - 5e3 || !Array.isArray(o.p)) return m;
    for (const e of o.p.slice(0, MAX_PROJ)) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[0] || e[0].length > 200 || !Array.isArray(e[1])) continue;
      const c = e[1].filter((h: unknown): h is string => typeof h === 'string' && HEX.test(h)).slice(0, MAX_PER);
      if (c.length) m.set(e[0], c);
    }
  } catch (e) { }
  return m;
}

/** Saves collect()'s loads when the page goes (a view switch, a reload). */
export function carryOnLeave(collect: () => Carry): void {
  addEventListener('pagehide', () => { try { sessionStorage.setItem(KEY, encodeCarry(collect(), Date.now())); } catch (e) { } });
}

/** The loads the last page handed over, once: they are removed as they are read. */
export function takeCarry(): Carry {
  try { const raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return decodeCarry(raw, Date.now()); } catch (e) { return new Map(); }
}
