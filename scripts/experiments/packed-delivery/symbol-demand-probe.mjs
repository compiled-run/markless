import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { parseSync } from 'rolldown/experimental';
import { chromium, expect } from '@playwright/test';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const output = process.env.DOCS_COLD_OUTPUT ?? root + '/website/.output';
const directory = await mkdtemp('/private/tmp/markless-symbol-demand-');
const port = await new Promise(resolve => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
});
const origin = `http://127.0.0.1:${port}`;
const sourceCache = new Map();
const sites = [];
async function instrument(path) {
  if (sourceCache.has(path)) return sourceCache.get(path);
  const source = await readFile(output + '/public' + path.replace('/markless/', '/'), 'utf8');
  const tree = parseSync(path, source);
  assert.deepEqual(tree.errors, []);
  const calls = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && !node.optional && !node.callee.computed && !node.callee.optional && node.callee.property?.name === 'loadSymbol') calls.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'comments') continue;
      if (Array.isArray(value)) for (const child of value) visit(child);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree.program);
  let cursor = 0;
  const pieces = [];
  for (const node of calls.sort((a, b) => a.start - b.start)) {
    assert.ok(node.start >= cursor, 'Nested loadSymbol calls need a separate rewrite');
    const site = sites.length;
    sites.push({site, path, offset: node.start, sourceSha256: createHash('sha256').update(source).digest('hex'), expression: source.slice(node.start, node.end), context: source.slice(Math.max(0, node.start - 200), node.end + 200)});
    const receiver = source.slice(node.callee.object.start, node.callee.object.end);
    const args = node.arguments.map(arg => source.slice(arg.start, arg.end)).join(',');
    pieces.push(source.slice(cursor, node.start), `globalThis.__marklessProbeLoad(${site},${receiver}${args ? ',' + args : ''})`);
    cursor = node.end;
  }
  pieces.push(source.slice(cursor));
  const rewritten = pieces.join('');
  assert.deepEqual(parseSync(path, rewritten).errors, []);
  sourceCache.set(path, rewritten);
  return rewritten;
}

const server = spawn(process.execPath, [output + '/server/index.mjs'], {cwd: root + '/website', env: {...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
let browser, serverLog = '';
server.stdout.on('data', bytes => serverLog += bytes);
server.stderr.on('data', bytes => serverLog += bytes);
const records = [];
const persist = () => writeFile(directory + '/results.json', JSON.stringify({output, sites, records, serverLog, limitation: 'Instrumented member loadSymbol calls only, not an exhaustive call graph or latency measurement. Browser interception replaces JS responses and disables HTTP caching.'}, null, 2));
console.log(JSON.stringify({directory, serverPid: server.pid}));
try {
  await expect.poll(async () => {try {return (await fetch(origin + '/markless/theme.js')).status;} catch {return 0;}}, {timeout: 15000}).toBe(200);
  browser = await chromium.launch({channel: 'chrome', headless: true});
  for (const test of [
    {name: 'menu', path: '/markless', selector: '.mode-select-trigger', index: 0},
    {name: 'accordion', path: '/markless/ui/accordion', selector: '.pg[data-family="accordion"] .pg-stage .trigger', index: 1},
  ]) {
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 1000}});
    const record = {name: test.name, phases: [], errors: [], requests: []};
    records.push(record);
    const page = await context.newPage();
    page.on('pageerror', error => record.errors.push(String(error)));
    page.on('request', request => {if (request.resourceType() === 'script') record.requests.push(request.url());});
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await context.addInitScript(() => {
      globalThis.__marklessSymbolCalls = [];
      globalThis.__marklessProbeLoad = (site, receiver, ...args) => {
        const computed = receiver.computed && !Array.isArray(receiver.computed) ? receiver.computed : undefined;
        globalThis.__marklessSymbolCalls.push({site, symbolId: args[0], computed, stack: new Error().stack});
        return receiver.loadSymbol(...args);
      };
    });
    await context.route('**/markless/build/*.js', async route => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const body = await instrument(new URL(route.request().url()).pathname);
      await route.fulfill({response, body, headers: {...response.headers(), 'content-length': String(Buffer.byteLength(body))}});
    });
    try {
      await page.goto(origin + test.path, {waitUntil: 'load'});
      const control = page.locator(test.selector).nth(test.index);
      await expect(control).toBeVisible();
      assert.equal(await page.evaluate(() => globalThis.__marklessSymbolCalls.length), 0);
      for (let action = 0; action < 3; action++) {
        await page.evaluate(() => globalThis.__marklessSymbolCalls = []);
        const before = await control.getAttribute('aria-expanded');
        await control.click();
        await expect(control).toHaveAttribute('aria-expanded', String(before !== 'true'));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const calls = await page.evaluate(() => globalThis.__marklessSymbolCalls);
        assert.ok(calls.length > 0);
        record.phases.push({action: action + 1, calls});
      }
      assert.deepEqual(record.errors, []);
      record.passed = true;
    } finally {
      await context.close();
      await persist();
    }
    console.log(JSON.stringify({name: test.name, phases: record.phases.map(p => ({action: p.action, calls: p.calls.length, computed: p.calls.filter(c => c.computed).length}))}));
  }
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve));}
  await persist();
}
