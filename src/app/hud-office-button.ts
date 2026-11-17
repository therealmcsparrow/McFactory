{ // office HUD button: stage an armoured car robbery now (like Break down in the factory view); shows the step, re-enabled when it is over
  const b = document.getElementById('rob')!, STEP: Record<string, string> = { drive: 'Bandits on their way…', wait: 'Bandits lying in wait…', cut: 'Van cutting in…', hold: 'Robbery! Police on the way…', swat: 'SWAT on the scene…', arrest: 'Arresting the bandits…', clear: 'Clearing the road…', home: 'Police heading home…' };
  const set = (txt: string, off: boolean, tip: string, busy: boolean) => { if (b.textContent !== txt) b.textContent = txt; b.setAttribute('aria-disabled', off ? 'true' : 'false'); b.dataset.busy = busy ? 'true' : 'false'; b.title = tip;
    b.setAttribute('aria-label', busy ? 'Robbery in progress: ' + txt.replace('…', '') : off ? 'Stage a robbery (' + tip + ')' : 'Stage a robbery'); };
  const upd = () => { const O = window.__office; if (!O || !O.robbery || !document.body.classList.contains('v-office')) return; const r = O.robbery();
    if (r.rm) set('Robbery', true, 'Off while your system asks for reduced motion', false);
    else if (r.ph !== 'idle') set(STEP[r.ph] || 'Robbery…', true, 'A robbery is running', true);
    else if (r.pend) set(r.police ? 'Waiting for the police…' : STEP.drive, true, 'The bandits set off as soon as the police are back at the station', true);
    else if (r.police) set('Robbery', true, 'The police are out: wait until they are back at the station', false);
    else set('Robbery', false, 'Stage an armoured car robbery: watch the police and SWAT arrest the bandits', false); };
  b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true' || !window.__office) return; window.__office.robbery('start'); upd(); });
  setInterval(upd, 250); }

{ // office HUD button next to it: send a speeder now; a patrol car chases it and pulls it over (patrol.ts), re-enabled when the stop is over
  const b = document.getElementById('spd')!, STEP: Record<string, string> = { chase: 'Chasing a speeder…', arrived: 'Pulling over…', out: 'Officer getting out…', talk: 'Talking to the driver…', write: 'Writing a ticket…', hand: 'Handing the ticket…', react: 'Handing the ticket…', back: 'Officer walking back…', in: 'Driving on…', done: 'Driving on…' };
  const set = (txt: string, off: boolean, tip: string, busy: boolean) => { if (b.textContent !== txt) b.textContent = txt; b.setAttribute('aria-disabled', off ? 'true' : 'false'); b.dataset.busy = busy ? 'true' : 'false'; b.title = tip;
    b.setAttribute('aria-label', busy ? 'Traffic stop in progress: ' + txt.replace('…', '') : off ? 'Send a speeder (' + tip + ')' : 'Send a speeder'); };
  const upd = () => { const O = window.__office; if (!O || !O.patrol || !document.body.classList.contains('v-office')) return; const p = O.patrol();
    if (p.stop) set(STEP[p.stop.phase] || 'Traffic stop…', true, 'A patrol car is dealing with a speeder', true);
    else if (p.force) set(p.out ? 'Looking for a speeder…' : 'Patrol car on its way…', true, 'A speeder comes along in front of a patrol car', true);
    else if (!p.want) set('Speeder', true, 'Set Patrol cars above 0 in Settings', false);
    else if (p.busy) set('Speeder', true, 'The police are busy with a robbery or a jam: wait until they are back', false);
    else set('Speeder', false, 'Send a speeder: watch a patrol car pull it over and hand out a ticket', false); };
  b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true' || !window.__office || !window.__office.patrol) return; window.__office.patrol('speed'); upd(); });
  setInterval(upd, 250); }
