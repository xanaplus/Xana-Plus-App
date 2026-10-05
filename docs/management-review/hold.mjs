import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8090';
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${OUT}/profile`, '--no-first-run', 'about:blank',
]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const shot = async (name, path, wait = 4000) => {
  await send('Page.navigate', { url: BASE + path });
  await sleep(wait);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('ok', name);
};

await send('Page.navigate', { url: BASE + '/' }); await sleep(5000);
const session = JSON.stringify({ user: { id: 'u_amina', name: 'Amina Odhiambo', phone: '+254 712 345 678', clubTier: 'Gold', clubPoints: 2480 }, lastSeenAt: Date.now() });
await send('Runtime.evaluate', { expression: `localStorage.setItem('xanaplus.session.v1', ${JSON.stringify(session)}); localStorage.removeItem('xanaplus.orders.v1')` });
await send('Page.navigate', { url: BASE + '/orders/XN-2481' }); await sleep(5000);
await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('div')].find(e=>e.innerText==='Advance status (demo)').click()` });
await sleep(1000);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}/11b-hold.png`, Buffer.from(r.result.data, 'base64'));
console.log('ok hold');
ws.close(); chrome.kill(); process.exit(0);
