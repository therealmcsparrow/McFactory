import { $ } from '../common/dom.js';

// ── view: factory (default), office or dunes. ?view= wins and is remembered; the switch reloads the page
const VIEW = (() => { let v = new URLSearchParams(location.search).get('view'); try { if (v === 'office' || v === 'factory' || v === 'dunes') localStorage.setItem('factory.view', v); else v = localStorage.getItem('factory.view'); } catch (e) { } return v === 'office' || v === 'dunes' ? v : 'factory'; })();
export const OFFICE = VIEW === 'office', DUNES = VIEW === 'dunes';
document.body.classList.add('v-' + VIEW);
// the words for the same data in each view
export const WORD = DUNES
  ? { role: 'robe', model: 'tower cap', effort: 'glow ring', agents: 'farmhands', row: 'condenser row', closed: 'closed session (row gone)', sessCol: 'Session (condenser row)', agentCol: 'Agent (tower)', left: ' · went home', off: ' · no tower', cap: 8, capTxt: ' on the row', total: 'Depot', focusRow: 'Click to fly to the farm', focusAgent: 'Click to look at the tower', idle: 'No farmhand is working right now.' }
  : OFFICE
  ? { role: 'clothes', model: 'desk', effort: 'screen', agents: 'agents', row: 'desk row', closed: 'closed session (board)', sessCol: 'Session (desk row)', agentCol: 'Agent (desk)', left: ' · clocked out', off: ' · no desk', cap: 8, capTxt: ' at desks', total: 'Bank', focusRow: 'Click to open the office', focusAgent: 'Click to look at their screen', idle: 'Nobody is working right now.' }
  : { role: 'base', model: 'lower arm', effort: 'upper arm', agents: 'arms', row: 'session line', closed: 'closed session (info sign)', sessCol: 'Session (line)', agentCol: 'Agent (arm)', left: ' · on line sign', off: ' · off line', cap: 10, capTxt: ' on the line', total: 'Warehouse', focusRow: 'Click to focus the line', focusAgent: 'Click to focus', idle: 'No arm is moving right now.' };
for (const b of document.querySelectorAll<HTMLButtonElement>('#view button')) {
  b.setAttribute('aria-pressed', String(b.dataset.view === VIEW));
  b.addEventListener('click', () => { if (b.dataset.view === VIEW) return; const u = new URL(location.href); u.searchParams.set('view', b.dataset.view!); location.href = u.href; });
}
{ const b = $('#lg-tog')!, lg = $('#legend')!; // the key starts folded; the choice is remembered in this browser
  const set = (open: boolean) => { b.setAttribute('aria-expanded', String(open)); lg.hidden = !open; };
  try { set(localStorage.getItem('cw.keyOpen') === '1'); } catch (e) { }
  b.addEventListener('click', () => { const open = lg.hidden as boolean; set(open); try { localStorage.setItem('cw.keyOpen', open ? '1' : '0'); } catch (e) { } });
}
if (OFFICE) {
  const say = (sel: string, s: string) => { const el = $(sel); if (el && el.firstChild) el.firstChild.nodeValue = s; };
  $('#c')!.setAttribute('aria-label', 'Isometric office park of live Claude Code activity: one office building per project, one desk row per session, each person at a desk is an agent; data lines carry token packets to the server at the dock, and armoured cars take the drives over one-way streets with roundabouts to the gated bank, where they stack as the window total.');
  $('#fallback p')!.innerHTML = 'WebGL is unavailable, so the office park can’t render.<br>The control boards still show live totals.';
  $('.big small')!.innerHTML = 'tokens<br>processed';
  say('#k-running + span', 'at work'); say('#k-done + span', 'clocked out'); say('#k-failed + span', 'failed');
  say('.col.l .board.grow h2', 'Offices '); $('.col.l .board.grow')!.setAttribute('aria-label', 'Offices (projects)');
  say('#lg-tog', 'Key '); say('#lg-tog small', 'person = agent');
  say('.col.r .board h2', 'Models '); say('.col.r .board h2 small', 'desk colour');
  say('.col.r .board.grow h2', 'Agents working '); $('.col.r .board.grow')!.setAttribute('aria-label', 'Agents working');
  $('#empty p')!.innerHTML = 'No Claude Code transcript under <code>~/.claude/projects</code> changed in this window. Widen it, or start a session and the first office lights up.';
}
if (DUNES) {
  const say = (sel: string, s: string) => { const el = $(sel); if (el && el.firstChild) el.firstChild.nodeValue = s; };
  $('#c')!.setAttribute('aria-label', 'Overview of a desert planet with live Claude Code activity: one moisture farm per project, one condenser row per session, each condenser tower with its farmhand is an agent; tokens become water canisters that hover-sleds haul to the depot settlement, where they pile up as the window total. Warden squads patrol and stand guard by any farm that needs you.');
  $('#fallback p')!.innerHTML = 'WebGL is unavailable, so the dunes can’t render.<br>The control boards still show live totals.';
  say('#k-running + span', 'working'); say('#k-done + span', 'went home'); say('#k-failed + span', 'failed');
  say('.col.l .board.grow h2', 'Farms '); $('.col.l .board.grow')!.setAttribute('aria-label', 'Farms (projects)');
  say('#lg-tog', 'Key '); say('#lg-tog small', 'tower = agent');
  say('.col.r .board h2', 'Models '); say('.col.r .board h2 small', 'tower cap colour');
  say('.col.r .board.grow h2', 'Farmhands working '); $('.col.r .board.grow')!.setAttribute('aria-label', 'Farmhands working');
  $('#empty p')!.innerHTML = 'No Claude Code transcript under <code>~/.claude/projects</code> changed in this window. Widen it, or start a session and the first farm rises from the sand.';
}
