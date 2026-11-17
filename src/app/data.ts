// The live data (window.DashSim from live-data.js) and the small view helpers built on it: status pills, cost cells, the agent index.
import { esc } from '../common/text.js';
import type { Agent, AgentStatus, NeedReason, Project, Task, ModelInfo } from '../common/types.js';

export const DS = window.DashSim, fmt = DS.fmt, MODELS = DS.MODELS;
export const STATUS: Record<AgentStatus, string> = { running: 'Running', waiting: 'Waiting', queued: 'Queued', done: 'Done', failed: 'Failed' };
// arm order on a line (and in the session card): main first, then startedAt ascending (missing last), tie -> id
export const armOrder = (x: Agent, y: Agent) => (((y.kind === 'main') as unknown as number) - ((x.kind === 'main') as unknown as number)) || ((x.startedAt || Infinity) - (y.startedAt || Infinity)) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
export const NEED_TXT: Partial<Record<NeedReason, string>> = { approval: 'approval', question: 'question', 'your reply': 'your reply', input: 'input' };
export const needTxt = (a: Agent) => NEED_TXT[a.needReason!] || a.needReason || 'input';
export const pillOf = (a: Agent) => a.needsHuman ? `<span class="pill st-human">Needs you · ${esc(needTxt(a))}</span>` : `<span class="pill st-${a.status}">${STATUS[a.status] || a.status}</span>`;
export const projById = (id: string): Project | undefined => DS.state.projects.find(p => p.id === id);
export const agentIndex = new Map<string, Agent>();
export function reindex() { agentIndex.clear(); for (const p of DS.state.projects) for (const t of p.tasks) for (const a of t.agents) agentIndex.set(a.id, a); }
export const taskById = (id: string): Task | null => { for (const p of DS.state.projects) for (const t of p.tasks) if (t.id === id) return t; return null; };
export const modelOf = (id: string): ModelInfo => MODELS[id] || DS.ensureModel(id);
export const costTxt = (c: number, known?: boolean) => fmt.cost(c) + (known === false ? '*' : '');
export const costCell = (c: number, known?: boolean) => known === false && !(c > 0) ? '<span title="No list price for this model, so no estimate." aria-label="No estimate: model has no known price">—</span>' : known === false ? `<span title="Partial estimate: some usage is on a model with no known price.">${fmt.cost(c)}*</span>` : fmt.cost(c);
export const pillSm = (needs: boolean, reason: NeedReason | null, status: AgentStatus) => needs ? `<span class="pill sm st-human" title="Needs you · ${esc(NEED_TXT[reason!] || reason || 'input')}">Needs you</span>` : `<span class="pill sm st-${status}">${STATUS[status] || status}</span>`;
export const bandsHTML = (a: Pick<Agent, 'role' | 'model' | 'effort'>) => `<span class="bands" aria-hidden="true" style="--r:${DS.roleColor(a.role)};--m:${modelOf(a.model).color};--e:${DS.effortColor(a.effort)}"><i></i><i></i><i></i></span>`;
export const effLabel = (e?: string | null) => DS.effortInfo(e).label;
