// Scrambled, pronounceable nonsense for the speech bubbles (bubbles.ts), e.g. "Blorf zinda mek?!" or "#@%&!".
// Deterministic: the same seed, word count and tone always give the same line. No imports, so test/ can load the
// built module on its own. Tones: 'cop' sounds clipped and official (hard consonants, a "Zorp." statement, the odd
// question), 'driver' sounds whiny and indignant (long vowels, "?!" and "!!", now and then a comic swear like "#@%&!"),
// 'neutral' is in between.

export type Tone = 'cop' | 'driver' | 'neutral';

/** A small seeded random generator (mulberry32): returns numbers in [0, 1). */
export function rng(seed: number | string): () => number {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Flavour { on: string[]; nu: string[]; co: string[]; end: string[]; punct: [string, number][]; grawlix: number; short: string[] }
const FLAVOUR: Record<Tone, Flavour> = {
  cop: {
    on: ['b', 'd', 'g', 'k', 'p', 't', 'z', 'kr', 'tr', 'gr', 'br', 'st', 'sk', 'v'], nu: ['a', 'o', 'e', 'u', 'i', 'ar', 'or'], co: ['k', 't', 'p', 'rk', 'rp', 'nt', 'x', 'g', 'z', ''],
    end: ['', '', 'o', 'en', 'ek', 'ix'], punct: [['.', 5], ['?', 2], ['!', 1]], grawlix: 0, short: ['Hm.', 'Zorp.', 'Krt.', 'Ja.'],
  },
  driver: {
    on: ['bl', 'fl', 'm', 'n', 'w', 'sh', 'l', 'pl', 'gl', 'h', 'b', 'z', 'y'], nu: ['oo', 'ee', 'a', 'ai', 'ow', 'oi', 'u', 'i'], co: ['rf', 'mp', 'nk', 'sh', 'b', 'm', 'ff', 'l', ''],
    end: ['', 'a', 'y', 'o', 'ee'], punct: [['?!', 4], ['!', 3], ['!!', 2], ['?', 2], ['...', 1]], grawlix: .22, short: ['Wha?!', 'Hnnf!', 'Blah!', 'Ooh.'],
  },
  neutral: {
    on: ['b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'bl', 'tr'], nu: ['a', 'e', 'i', 'o', 'u', 'oo', 'ei'], co: ['k', 'n', 'r', 'm', 'f', 'nd', 'rk', ''],
    end: ['', 'a', 'o', 'i'], punct: [['.', 3], ['!', 2], ['?', 2]], grawlix: .05, short: ['Hm.', 'Oh!', 'Mek.'],
  },
};
const SWEAR = ['#', '@', '%', '&', '$', '*']; // the closing "!" is added after

const pick = <T,>(r: () => number, L: readonly T[]) => L[Math.floor(r() * L.length)];
const pickW = (r: () => number, L: [string, number][]) => { let u = r() * L.reduce((n, [, w]) => n + w, 0); for (const [s, w] of L) if ((u -= w) < 0) return s; return L[L.length - 1][0]; };

/** A comic swear: 4 to 6 symbols, no symbol twice in a row, ending in "!" (e.g. "#@%&!"). */
export function grawlix(seed: number | string): string {
  const r = rng('g' + seed), n = 3 + Math.floor(r() * 3); let s = '', last = '';
  for (let i = 0; i < n; i++) { let c = pick(r, SWEAR); if (c === last) c = SWEAR[(SWEAR.indexOf(c) + 1) % SWEAR.length]; s += c; last = c; }
  return s + '!';
}

function word(r: () => number, F: Flavour): string {
  const syl = 1 + (r() < .55 ? 0 : r() < .7 ? 1 : 2); let w = '';
  for (let i = 0; i < syl; i++) { const last = i === syl - 1, co = last || r() < .4 ? pick(r, F.co) : '', on = i === 0 || r() < .6 || /[aeiou]$/.test(w) ? pick(r, F.on) : ''; // no "loooofo"
    w += (/[^aeiouy]$/.test(w) && on.length > 1 ? on[0] : on) + pick(r, F.nu) + (last ? co : co.slice(0, 1)); } // between syllables at most a consonant and a short onset: no "rpbr"
  const e = pick(r, F.end); w += /[aeiou]{2}$/.test(w) && /^[aeiouy]/.test(e) ? '' : e; // no "zooee"
  return w.length > 9 ? w.slice(0, 9) : w;
}

/**
 * One line of nonsense, deterministic per (seed, words, tone). words: how many words (default 2..4, picked from the
 * seed; clamped to 1..8). The first word is capitalised and the line ends in punctuation. A driver's line is now and
 * then a comic swear on its own ("#@%&!") or ends with one ("Blorf zinda #@%!").
 */
export function gibberish(seed: number | string, words?: number, tone: Tone = 'neutral'): string {
  const F = FLAVOUR[tone] || FLAVOUR.neutral, r = rng(tone + ':' + seed);
  const n = Math.max(1, Math.min(8, Math.round(words ?? 2 + Math.floor(r() * 3))));
  if (F.grawlix && r() < F.grawlix) return r() < .5 ? grawlix(seed) : sentence(r, F, Math.max(1, n - 1)).replace(/[.?!]+$/, '') + ' ' + grawlix(seed);
  if (n === 1 && r() < .35) return pick(r, F.short);
  return sentence(r, F, n);
}

function sentence(r: () => number, F: Flavour, n: number): string {
  const W: string[] = []; for (let i = 0; i < n; i++) W.push(word(r, F));
  W[0] = W[0][0].toUpperCase() + W[0].slice(1);
  if (n >= 4 && r() < .35) W[1 + Math.floor(r() * (n - 2))] += ','; // a pause in a longer line
  return W.join(' ') + pickW(r, F.punct);
}
