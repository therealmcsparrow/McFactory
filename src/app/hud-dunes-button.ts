{ // dunes HUD buttons: start a blade duel or an abduction now (like Robbery in the office view); each shows the step and is re-enabled when it is over
  const btn = (id: string, name: string, key: 'duel' | 'abduct', STEP: Record<string, string>, idle: string, none?: (e: ReturnType<DunesProbe['events']>) => string) => {
    const b = document.getElementById(id); if (!b) return;
    const set = (txt: string, off: boolean, tip: string, busy: boolean) => { if (b.textContent !== txt) b.textContent = txt; b.setAttribute('aria-disabled', off ? 'true' : 'false'); b.dataset.busy = busy ? 'true' : 'false'; b.title = tip;
      b.setAttribute('aria-label', busy ? name + ' in progress: ' + txt.replace('…', '') : off ? name + ' (' + tip + ')' : name); };
    const upd = () => { const D = window.__dunes; if (!D || !D.events || !document.body.classList.contains('v-dunes')) return; const e = D.events(), ph = e[key], label = b.dataset.label || '';
      if (e.rm) set(label, true, 'Off while your system asks for reduced motion', false);
      else if (ph !== 'idle') set(STEP[ph] || label + '…', true, 'One is running', true);
      else { const why = none ? none(e) : ''; if (why) set(label, true, why, false); else set(label, false, idle, false); } };
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true' || !window.__dunes) return; window.__dunes[key](); upd(); });
    setInterval(upd, 250);
  };
  btn('duel', 'Start a blade duel', 'duel', { walk: 'Fighters walking in…', ignite: 'Blades lit…', fight: 'Duel!', yield: 'One yields…', bow: 'Bowing…', leave: 'Walking off…' },
    'Start a blade duel now: the view flies to the duel ground if none is in sight');
  btn('abd', 'Start an abduction', 'abduct', { in: 'Saucer coming in…', beam: 'Beam on…', lift: 'Abducting…', close: 'Beam off…', out: 'Saucer leaving…' },
    'A saucer lifts an alien out of town now', e => e.aliens ? '' : 'No aliens in town: set Townsfolk above 0 in Settings');
}
