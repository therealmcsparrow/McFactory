import { chromium } from 'playwright';
import fs from 'node:fs';
const SP = 'P:/Temp/claude/6f3f9e048af54318/19f138dd-28ab-4442-854b-2cd20bb83707/scratchpad';
const CWD = SP + '/spike';
const BASE = 'http://127.0.0.1:4591';
const errs = [], res = [];
const ok = (name, cond, extra) => { res.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); };
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
const T0 = Date.now(); const left = () => 115000 - (Date.now() - T0);
await p.goto(BASE + '/?hours=24', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.click('#skip').catch(() => {});
ok('new-session button present', await p.locator('#chat-new').count() === 1);
await p.click('#chat-new');
await p.selectOption('#cn-proj', '__other');
await p.fill('#cn-other', CWD.replace(/\//g, '\\'));
await p.selectOption('#cn-model', 'haiku');
await p.fill('#cn-prompt', 'Reply with exactly the word pong and nothing else.');
await p.screenshot({ path: SP + '/chat-dialog.png' });
await p.click('#cn-prompt'); await p.keyboard.press('Control+Enter');
await p.waitForSelector('#chat:not([hidden])', { timeout: 40000 });
const turns = async n => p.waitForFunction(n => document.querySelectorAll('#chat .cl.result').length >= n, n, { timeout: Math.max(5000, left()) });
await turns(1);
ok('turn 1 assistant reply', (await p.locator('#chat .cm.assistant').first().innerText()).toLowerCase().includes('pong'));
await p.screenshot({ path: SP + '/chat-turn1.png' });
// turn 2 via Enter
await p.fill('#chat textarea', 'Now reply with exactly the word ping and nothing else.');
await p.press('#chat textarea', 'Enter');
await turns(2);
const asst = await p.locator('#chat .cm.assistant').allInnerTexts();
ok('turn 2 reply', asst.length >= 2 && asst[1].toLowerCase().includes('ping'), JSON.stringify(asst));
// shift+enter newline
await p.fill('#chat textarea', 'a'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('b');
ok('shift+enter newline', (await p.inputValue('#chat textarea')) === 'a\nb');
await p.fill('#chat textarea', '');
// permission: allow
await p.fill('#chat textarea', 'Use the Write tool to create the file perm-allow.txt in the current directory with the content ok. Then say done.');
await p.press('#chat textarea', 'Enter');
await p.waitForSelector('#chat .cq .cb-btn.allow', { timeout: Math.max(5000, left()) });
ok('permission card has tool name', (await p.locator('#chat .cq h4 .tn').innerText()).includes('Write'));
await p.waitForTimeout(2500); // let the snapshot catch up
ok('KPI needs-you lit', (await p.locator('#kpi-human.on').count()) === 1, await p.locator('#k-needs').innerText());
ok('pill hidden while that chat is open', !(await p.locator('#chat-alert').isVisible()));
await p.screenshot({ path: SP + '/chat-perm.png' });
await p.click('#detail-close'); await p.waitForTimeout(2500);
ok('chat panel gone after closing card', !(await p.locator('#chat').isVisible()));
ok('alert beacon pill visible (card closed)', await p.locator('#chat-alert').isVisible());
await p.screenshot({ path: SP + '/chat-alert.png' });
await p.click('#chat-alert');
await p.waitForSelector('#chat:not([hidden]) .cq .cb-btn.allow', { timeout: 8000 });
await p.waitForTimeout(600);
ok('pill click opens chat and focuses the request', await p.evaluate(() => !!document.activeElement.closest('#chat .cq')), await p.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
await p.screenshot({ path: SP + '/chat-perm-focused.png' });
await p.click('#chat .cq .cb-btn.allow');
await turns(3);
ok('Write allowed -> file exists', fs.existsSync(CWD + '/perm-allow.txt'));
// permission: deny
await p.fill('#chat textarea', 'Use the Write tool to create the file perm-deny.txt in the current directory with the content no. Then say done.');
await p.press('#chat textarea', 'Enter');
await p.waitForSelector('#chat .cq .cb-btn.bad', { timeout: Math.max(5000, left()) });
await p.screenshot({ path: SP + '/chat-perm2.png' });
await p.click('#chat .cq .cb-btn.bad');
await turns(4);
ok('Write denied -> no file', !fs.existsSync(CWD + '/perm-deny.txt'));
// AskUserQuestion
if (left() > 25000) {
  await p.fill('#chat textarea', 'Call the AskUserQuestion tool once with one single-select question "Favourite colour?" (header Colour) and options Red and Blue. Then tell me the answer in one word.');
  await p.press('#chat textarea', 'Enter');
  await p.waitForSelector('#chat .cq input[type=radio]', { timeout: Math.max(5000, left()) });
  ok('question card has Other field', await p.locator('#chat .cq input[type=text]').count() === 1);
  await p.screenshot({ path: SP + '/chat-question.png' });
  await p.locator('#chat .cq .cq-opt', { hasText: 'Blue' }).click();
  await p.click('#chat .cq .cb-btn.allow');
  await turns(5);
  const last = (await p.locator('#chat .cm.assistant').allInnerTexts()).pop() || '';
  ok('question answered (reply mentions Blue)', /blue/i.test(last), last);
  await p.screenshot({ path: SP + '/chat-answered.png' });
} else console.log('SKIP question (time)');
// token-less POST
const code = (await fetch(BASE + '/api/chat/start', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: '{}' })).status;
ok('POST without token -> 403', code === 403, String(code));
// privacy: snapshot has no text
const snap = await (await fetch(BASE + '/api/state')).text();
ok('snapshot has no chat text', !snap.includes('perm-allow.txt'));
// stop
await p.click('#chat .chat-head .cb-btn');
await p.waitForFunction(() => document.querySelector('#chat .chat-head').dataset.s === 'ended', null, { timeout: 15000 });
ok('Stop ends session', true);
ok('input disabled after stop', await p.locator('#chat textarea').isDisabled());
await p.screenshot({ path: SP + '/chat-stopped.png' });
ok('no console errors', errs.length === 0, errs.join(' | '));
console.log('elapsed', Math.round((Date.now() - T0) / 1000) + 's');
console.log(res.filter(r => !r[1]).length ? 'SOME FAILED' : 'ALL PASS');
await b.close();
