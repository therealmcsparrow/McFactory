// Text helpers shared by the HUD and every scene: escaping, truncation, clock strings.
export const clock = (ts: number) => { const d = new Date(ts), hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); return Date.now() - ts > 20 * 3600e3 ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm : hm; };
export const cut = (s: unknown, n: number): string => (s = String(s ?? '')).length > n ? (s as string).slice(0, n - 1) + '…' : s as string;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
export const setText = (el: Element | null | undefined, s: string) => { if (el && el.textContent !== s) el.textContent = s; };
export const hhmmss = (ts: number) => new Date(ts).toTimeString().slice(0, 8);
