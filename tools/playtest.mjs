// Play-test driver (Node 22+, standard library only): starts headless Chrome, opens the game,
// runs a list of steps over the DevTools protocol and prints console errors.
//
//   node tools/playtest.mjs <url> step step ...
// Steps:
//   wait:<ms>                 let the game run
//   eval:<js>                 evaluate JS in the page and print the result
//   down:<KeyCode> / up:<KeyCode> / tap:<KeyCode>   keyboard
//   click                     left click in the middle of the page
//   shot:<file.jpg|png>[:quality]   capture the viewport (JPEG quality default 82)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9300 + Math.floor(Math.random() * 400);
const [url, ...steps] = process.argv.slice(2);
const W = Number(process.env.SHOT_W ?? 1280), H = Number(process.env.SHOT_H ?? 720);

const profile = join(tmpdir(), 'saltneon-chrome-' + PORT);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(path, method = 'GET') {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method }); return await r.json(); } catch { await sleep(250); }
  }
  throw new Error('Chrome did not start');
}

let ws, seq = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function main() {
  await json('/json/version');
  const targets = await json('/json/list');
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(`EXCEPTION ${d.exception?.description ?? d.text} @${d.url}:${d.lineNumber}`); }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning' || m.params.type === 'log')) errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1500);
  for (const step of steps) {
    const [kind, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (kind === 'wait') await sleep(Number(arg));
    else if (kind === 'eval') {
      const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
      console.log('eval>', r.exceptionDetails ? 'ERROR ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : JSON.stringify(r.result.value));
    } else if (kind === 'down' || kind === 'up' || kind === 'tap') {
      const key = arg.replace(/^Key/, '').toLowerCase();
      if (kind !== 'up') await send('Input.dispatchKeyEvent', { type: 'keyDown', code: arg, key });
      if (kind === 'tap') await sleep(80);
      if (kind !== 'down') await send('Input.dispatchKeyEvent', { type: 'keyUp', code: arg, key });
    } else if (kind === 'click') {
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
    } else if (kind === 'shot') {
      const [file, q] = arg.split(/:(?=\d+$)/);
      const png = file.endsWith('.png');
      const r = await send('Page.captureScreenshot', png ? { format: 'png' } : { format: 'jpeg', quality: Number(q ?? 82) });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('shot>', file, Math.round(Buffer.from(r.data, 'base64').length / 1024) + ' KiB');
    }
  }
  console.log(errors.length ? errors.slice(0, 40).join('\n') : 'no console errors');
}

main().catch((e) => console.error('playtest failed:', e.message)).finally(() => { try { ws?.close(); } catch { /* closed */ } chrome.kill(); setTimeout(() => process.exit(0), 300); });
