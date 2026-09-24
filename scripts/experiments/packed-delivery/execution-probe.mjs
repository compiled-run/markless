import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { chromium, expect } from '@playwright/test';
import { executedSourceRanges } from './coverage-ranges.ts';
import { isolateMdxPayload, isolateUncheckedMdxPayload } from './payload-scope.ts';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const output = process.env.DOCS_COLD_OUTPUT ?? root + '/website/.output';
const cpu = process.env.DOCS_CPU_PROFILE === '1';
const timeline = process.env.DOCS_TIMELINE === '1';
const timelineCpu = process.env.DOCS_TIMELINE_CPU === '1';
const samples = Number(process.env.DOCS_EXECUTION_SAMPLES ?? 1);
const cpuRate = Number(process.env.DOCS_CPU_RATE ?? 1);
const uncheckedScope = process.env.DOCS_COLD_SCOPE_PROBE === 'owned-records';
const scopeProbe = process.env.DOCS_COLD_SCOPE_PROBE === '1' || uncheckedScope;
const scopePrefix = process.env.DOCS_COLD_SCOPE_PREFIX ?? 'm3:';
const projectScope = html => uncheckedScope ? isolateUncheckedMdxPayload(html, scopePrefix) : isolateMdxPayload(html, scopePrefix);
const selectedCases = process.env.DOCS_EXECUTION_CASES?.split(',');
assert.ok(Number.isSafeInteger(samples) && samples > 0, 'Invalid sample count');
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1, 'Invalid CPU throttle rate');
assert.ok(!(cpu && timeline), 'Select one profiler mode');
assert.ok(!timelineCpu || timeline, 'Timeline CPU samples require timeline mode');
const directory = await mkdtemp('/private/tmp/markless-docs-execution-');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const port = await new Promise(resolve => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => { const {port} = probe.address(); probe.close(() => resolve(port)); });
});
const origin = `http://127.0.0.1:${port}`;
const records = [];
const metadata = {
  output, serverEntrySha256: sha256(await readFile(output + '/server/index.mjs')),
  metric: timeline ? 'Chrome timeline with captured click and expected DOM mutation marks' : cpu ? 'Chrome sampled CPU profile, 100 microsecond requested interval' : 'UTF-8 bytes of disjoint executed source ranges reported by Chrome precise JS coverage, per observation window',
  limitation: 'Profiling changes execution. Samples can miss short calls and the window includes browser automation and idle time. Coverage describes source regions, not CPU time. Do not use these visits for latency comparisons.',
  samples,
  cpuRate,
  timelineCpu,
  scopeProbe,
  uncheckedScope,
  scopePrefix,
  cache: 'fresh context per route, CDP HTTP cache disabled, service workers blocked',
};
const server = spawn(process.execPath, [output + '/server/index.mjs'], {
  cwd: root + '/website', env: {...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port)},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '', browser;
server.stdout.on('data', bytes => serverLog += bytes);
server.stderr.on('data', bytes => serverLog += bytes);
const persist = () => writeFile(directory + '/results.json', JSON.stringify({metadata, records, serverLog}, null, 2));
console.log(JSON.stringify({directory, output, serverPid: server.pid}));
const cases = [
  {name: 'state-counter', route: '/markless/concepts/state', kind: 'counter'},
  {name: 'state-header-then-counter', route: '/markless/concepts/state', kind: 'counter', headerFirst: true},
  {name: 'state-independent-controls', route: '/markless/concepts/state', kind: 'independent'},
  {name: 'computed-total', route: '/markless/concepts/computed', kind: 'computed'},
  {name: 'mode-select', route: '/markless', kind: 'expanded', selector: '.mode-select-trigger'},
  {name: 'accordion', route: '/markless/ui/accordion', kind: 'expanded', selector: '.pg[data-family="accordion"] .pg-stage .trigger', index: 1},
].filter(test => (!scopeProbe || uncheckedScope || test.name === 'state-counter') && (!selectedCases || selectedCases.includes(test.name)));
assert.ok(!uncheckedScope || selectedCases?.length === 1, 'Unchecked scope diagnostic requires one explicitly selected case');
assert.ok(cases.length, 'No execution cases selected');
try {
  await expect.poll(async () => { try { return (await fetch(origin + '/markless/theme.js')).status; } catch { return 0; } }, {timeout: 15000}).toBe(200);
  browser = await chromium.launch({channel: 'chrome', headless: true});
  metadata.browserVersion = browser.version();
  for (let sample = 0; sample < samples; sample++) for (const test of cases) for (const variant of scopeProbe ? ['full', 'isolated'] : ['full']) {
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 1000}});
    if (scopeProbe) await context.route(origin + test.route, async route => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({response, body: variant === 'isolated' ? projectScope(html) : html});
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuRate});
    const record = {test: test.name, sample, variant, phases: [], errors: [], httpCacheHits: []};
    records.push(record);
    page.on('pageerror', error => record.errors.push(String(error)));
    cdp.on('Network.responseReceived', event => {
      if (/^https?:/.test(event.response.url) && (event.response.fromDiskCache || event.response.fromServiceWorker)) record.httpCacheHits.push(event.response.url);
    });
    if (cpu) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', {interval: 100});
    }
    let traceEvents = [];
    if (timeline) cdp.on('Tracing.dataCollected', ({value}) => traceEvents.push(...value));
    const start = () => {
      if (timeline) {
        traceEvents = [];
        return cdp.send('Tracing.start', {categories: 'devtools.timeline,v8,disabled-by-default-v8.compile,blink.user_timing' + (timelineCpu ? ',disabled-by-default-v8.cpu_profiler' : ''), transferMode: 'ReportEvents'});
      }
      return cpu ? cdp.send('Profiler.start') : page.coverage.startJSCoverage({resetOnNavigation: false, reportAnonymousScripts: false});
    };
    const finish = async name => {
      if (timeline) {
        const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        await complete;
        if (timelineCpu) assert.ok(traceEvents.some(event => event.name === 'ProfileChunk' && event.args?.data?.cpuProfile?.samples?.length), 'No V8 CPU samples captured');
        const traceFile = `${directory}/${test.name}-${sample}-${name}.trace.json`;
        await writeFile(traceFile, JSON.stringify({traceEvents}));
        const phase = {name, traceFile, events: traceEvents.length};
        record.phases.push(phase);
        return phase;
      }
      if (cpu) {
        const {profile} = await cdp.send('Profiler.stop');
        const phase = {name, profile};
        record.phases.push(phase);
        return phase;
      }
      const coverage = await page.coverage.stopJSCoverage();
      const scripts = coverage.filter(item => item.url.startsWith(origin + '/markless/build/')).map(item => {
        assert.equal(typeof item.source, 'string', `Coverage omitted source for ${item.url}`);
        const ranges = executedSourceRanges(item.functions.flatMap(fn => fn.ranges));
        return {
          url: item.url.slice(origin.length), sha256: sha256(item.source), sourceBytes: Buffer.byteLength(item.source), ranges, functions: item.functions,
          executedBytes: ranges.reduce((bytes, range) => bytes + Buffer.byteLength(item.source.slice(range.start, range.end)), 0),
        };
      });
      const phase = {name, scripts, executedBytes: scripts.reduce((bytes, script) => bytes + script.executedBytes, 0)};
      record.phases.push(phase);
      return phase;
    };
    try {
      await start();
      await page.goto(origin + test.route, {waitUntil: 'load'});
      const control = test.selector ? page.locator(test.selector).nth(test.index ?? 0)
        : ['counter', 'independent'].includes(test.kind) ? page.getByRole('button', {name: /^Clicked \d+ times$/}).first()
        : page.getByRole('button', {name: 'Add a shirt', exact: true}).first();
      await expect(control).toBeVisible();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const idle = await finish('before-input');
      if (!cpu && !timeline) assert.equal(idle.executedBytes, 0, 'Framework pack code executed before interaction');
      if (test.headerFirst) {
        await start();
        const header = await page.locator('.site-header').boundingBox();
        assert.ok(header);
        const point = {x: header.x + header.width * 0.6, y: header.y + header.height * 0.5};
        assert.equal(await page.evaluate(({x, y}) => !!document.elementFromPoint(x, y).closest('a,button'), point), false);
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(1000);
        const staticInput = await finish('static-header');
        if (!cpu && !timeline) assert.equal(staticInput.executedBytes, 0, 'A closed overlay woke framework code on a static header press');
      }
      for (let action = 0; action < (test.kind === 'independent' ? 4 : 3); action++) {
        if (timeline) {
          const separate = test.kind === 'independent' && action % 2 === 1;
          const target = separate ? page.getByText(/^A watched variable: \d+$/, {exact: true}).first()
            : test.kind === 'computed' ? page.getByText(/^Total: \d+$/, {exact: true}).first() : control;
          const attribute = test.kind === 'expanded' ? 'aria-expanded' : null;
          const expected = attribute ? String(await control.getAttribute(attribute) !== 'true')
            : separate ? `A watched variable: ${(action + 1) / 2}`
            : test.kind === 'computed' ? `Total: ${40 + action * 20}`
            : `Clicked ${test.kind === 'independent' ? action / 2 + 1 : action + 1} times`;
          await page.evaluate(({target, attribute, expected}) => {
            for (const kind of ['pointerover', 'pointerdown']) {
              performance.clearMarks('markless-probe-' + kind);
              document.addEventListener(kind, event => {
                if (event.isTrusted) performance.mark('markless-probe-' + kind);
              }, {once: true, capture: true});
            }
            performance.clearMarks('markless-probe-click');
            performance.clearMarks('markless-probe-mutation');
            document.addEventListener('click', () => performance.mark('markless-probe-click'), {once: true, capture: true});
            const observer = new MutationObserver(() => {
              if ((attribute ? target.getAttribute(attribute) : target.textContent.trim()) !== expected) return;
              performance.mark('markless-probe-mutation');
              observer.disconnect();
            });
            observer.observe(target, {attributes: true, childList: true, characterData: true, subtree: true});
          }, {target: await target.elementHandle(), attribute, expected});
        }
        await start();
        if (test.kind === 'independent') {
          if (action % 2 === 0) {
            await control.click();
            await expect(control).toHaveText(`Clicked ${action / 2 + 1} times`);
          } else {
            await page.getByRole('button', {name: 'Add one to the watched variable', exact: true}).click();
            await expect(page.getByText(`A watched variable: ${(action + 1) / 2}`, {exact: true})).toBeVisible();
          }
        } else if (test.kind === 'counter') {
          await control.click();
          await expect(control).toHaveText(`Clicked ${action + 1} times`);
        } else if (test.kind === 'computed') {
          await control.click();
          await expect(page.getByText(`Total: ${40 + action * 20}`, {exact: true}).first()).toBeVisible();
        } else {
          const before = await control.getAttribute('aria-expanded');
          await control.click();
          await expect(control).toHaveAttribute('aria-expanded', String(before !== 'true'));
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const phase = await finish(test.kind === 'independent'
          ? ['first-action', 'second-control', 'return-first', 'repeat-second'][action]
          : action ? `repeat-${action}` : 'first-action');
        if (!cpu && !timeline) assert.ok(phase.executedBytes > 0, 'No framework execution captured for the observed action');
        if (timeline) assert.equal(await page.evaluate(() => performance.getEntriesByName('markless-probe-mutation').length), 1, 'Missing expected-mutation mark');
        if (test.headerFirst) assert.equal(await control.evaluate(button => !!button.closest('[data-async-container]').__asyncResumeRuntimeStarted), false, 'Static input forced the scalar counter onto full resume');
      }
      assert.deepEqual(record.errors, []);
      assert.deepEqual(record.httpCacheHits, []);
      record.passed = true;
    } catch (error) {
      record.failure = String(error);
      process.exitCode = 1;
    } finally {
      await context.close();
      await persist();
      console.log(JSON.stringify({test: test.name, sample, variant, phases: record.phases.map(({name, executedBytes, profile}) => ({name, executedBytes, cpuSamples: profile?.samples?.length})), failure: record.failure}));
    }
  }
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  await persist();
}
