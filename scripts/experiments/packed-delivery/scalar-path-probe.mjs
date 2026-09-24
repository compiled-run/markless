import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, writeFile, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { versions } from 'vite-plus/versions';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const directory = await mkdtemp('/private/tmp/markless-scalar-path-app-');
const directSsr = process.env.SCALAR_PATH_DIRECT_SSR === '1';
await mkdir(directory + '/components');
await mkdir(directory + '/pages');
await mkdir(directory + '/node_modules');
const dependencies = root + '/packages/router/fixtures/router-docs/node_modules';
for (const name of await readdir(dependencies)) {
	if (name.startsWith('.')) continue;
	await symlink(dependencies + '/' + name, directory + '/node_modules/' + name, 'dir');
}
await writeFile(directory + '/package.json', JSON.stringify({ private: true, type: 'module' }));
await writeFile(
	directory + '/vite.config.ts',
	`import {markless} from '@markless/core/vite';import {router} from '@markless/router/vite';export default {plugins:[markless({experimentalNativePacking:true}),router()]};`,
);
await writeFile(
	directory + '/document.tsrx',
	`import type {Children} from '@markless/core';import {Html} from '@markless/core/router';export default function Document({children}:{readonly children?:Children}) @{ <Html><head><title>Scalar propagation</title></head><body>{children}</body></Html> }`,
);
const inner = (stop) =>
	`import {state} from '@markless/core';export default function Inner() @{ let count=state(0); <div><button onClick={${stop ? '(event: MouseEvent) => { event.stopPropagation(); count++; }' : '() => count++'}}><span>Increment child</span></button><output data-child>{count}</output></div> }`;
await writeFile(directory + '/components/Inner.tsrx', inner(false));
await writeFile(directory + '/components/Stopped.tsrx', inner(true));
await writeFile(
	directory + '/components/ComplexStopped.tsrx',
	`import {state} from '@markless/core';export default function Inner() @{ let count=state(0); let extra=state(0); <div><button onClick={(event: MouseEvent) => { event.stopPropagation(); count++; extra++; }}><span>Increment child</span></button><output data-child>{count}</output><output data-child-extra>{extra}</output></div> }`,
);
await writeFile(
	directory + '/components/Unrelated.tsrx',
	`import {state} from '@markless/core';export default function Unrelated() @{ let untouched=state(50); <aside><button onClick={() => untouched++}>Unrelated</button><output data-unrelated>{untouched}</output></aside> }`,
);
for (const [name, tag, stop, complex] of [
	['bubble', 'section', false, false],
	['alternate', 'article', false, false],
	['stop', 'section', true, false],
	['complex', 'section', false, true],
	['complex-stop', 'article', true, false],
]) {
	await writeFile(
		directory + '/components/' + name + '.tsrx',
		`import {state} from '@markless/core';import Inner from './${name === 'complex-stop' ? 'ComplexStopped' : stop ? 'Stopped' : 'Inner'}.tsrx';export default function Outer() @{ let outer=state(10);${complex ? 'let extra=state(0);' : ''}<${tag} onClick={${complex ? '() => { outer++; extra++; }' : '() => outer++'}}><Inner /><output data-parent>{outer}</output>${complex ? '<output data-extra>{extra}</output>' : ''}</${tag}> }`,
	);
	await writeFile(
		directory + '/pages/' + name + '.mdx',
		`import Outer from '../components/${name}.tsrx';\nimport Unrelated from '../components/Unrelated.tsrx';\n\n# ${name}\n\n<Outer />\n\n<Unrelated />\n`,
	);
}
console.log(JSON.stringify({ directory, directSsr, versions }));
try {
	const build = await promisify(execFile)(root + '/node_modules/.bin/vp', ['build'], {
		cwd: directory,
		maxBuffer: 20_000_000,
	});
	await writeFile(directory + '/build.log', build.stdout + build.stderr);
} catch (error) {
	await writeFile(directory + '/build.log', (error.stdout ?? '') + (error.stderr ?? ''));
	throw error;
}
const port = await new Promise((resolve) => {
	const probe = createServer();
	probe.listen(0, '127.0.0.1', () => {
		const { port } = probe.address();
		probe.close(() => resolve(port));
	});
});
const origin = `http://127.0.0.1:${port}`;
if (directSsr)
	await writeFile(
		directory + '/serve-ssr.mjs',
		`
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import entry from './node_modules/.nitro/vite/services/ssr/index.js';
createServer(async (request,response)=>{
  try {
    const url=new URL(request.url,'http://127.0.0.1:'+process.env.NITRO_PORT);
    if(url.pathname.startsWith('/build/')) {
      const bytes=await readFile(new URL('./.output/public'+url.pathname,import.meta.url));
      response.writeHead(200,{'content-type':url.pathname.endsWith('.js')?'text/javascript':'application/octet-stream'});
      response.end(bytes);return;
    }
    const result=await entry.fetch(new Request(url));
    response.writeHead(result.status,Object.fromEntries(result.headers));
    if(result.body)for await (const bytes of result.body)response.write(bytes);
    response.end();
  } catch(error) {console.error(error);response.writeHead(500);response.end(String(error));}
}).listen(Number(process.env.NITRO_PORT),'127.0.0.1');
`,
	);
const server = spawn(
	process.execPath,
	[directory + (directSsr ? '/serve-ssr.mjs' : '/.output/server/index.mjs')],
	{
		cwd: directory,
		env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe'],
	},
);
let serverLog = '',
	browser;
server.stdout.on('data', (bytes) => (serverLog += bytes));
server.stderr.on('data', (bytes) => (serverLog += bytes));
const records = [];
try {
	await expect
		.poll(
			async () => {
				try {
					return (await fetch(origin + '/bubble')).status;
				} catch {
					return 0;
				}
			},
			{ timeout: 15000 },
		)
		.toBe(200);
	browser = await chromium.launch({ channel: 'chrome', headless: true });
	for (const name of ['bubble', 'alternate', 'stop', 'complex', 'complex-stop']) {
		const context = await browser.newContext({ serviceWorkers: 'block' });
		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);
		await cdp.send('Network.enable');
		await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
		const record = { name, errors: [], scripts: [], httpCacheHits: [] };
		records.push(record);
		page.on('pageerror', (error) => record.errors.push(String(error)));
		page.on('response', (response) => {
			if (response.request().resourceType() === 'script')
				record.scripts.push({ url: response.url(), status: response.status() });
		});
		cdp.on('Network.responseReceived', ({ response }) => {
			if (response.fromDiskCache || response.fromServiceWorker)
				record.httpCacheHits.push(response.url);
		});
		try {
			await page.goto(origin + '/' + name);
			for (let count = 1; count <= 3; count++) {
				await page
					.getByRole('button', { name: 'Increment child', exact: true })
					.locator('span')
					.click();
				await expect(page.locator('[data-child]')).toHaveText(String(count));
				await expect(page.locator('[data-parent]')).toHaveText(
					String(name.endsWith('stop') ? 10 : 10 + count),
				);
				await expect(page.locator('[data-unrelated]')).toHaveText('50');
				if (name === 'complex')
					await expect(page.locator('[data-extra]')).toHaveText(String(count));
				if (name === 'complex-stop')
					await expect(page.locator('[data-child-extra]')).toHaveText(String(count));
			}
			record.fullRuntime = await page.evaluate(
				() =>
					!!document.querySelector('[data-async-container]').__asyncResumeRuntimeStarted,
			);
			assert.equal(record.fullRuntime, name.startsWith('complex'));
			assert.ok(record.scripts.length <= 5);
			assert.ok(record.scripts.every((script) => script.status === 200));
			assert.deepEqual(record.errors, []);
			assert.deepEqual(record.httpCacheHits, []);
			record.passed = true;
		} catch (error) {
			record.failure = String(error);
			process.exitCode = 1;
		} finally {
			await context.close();
			console.log(JSON.stringify(record));
		}
	}
} finally {
	if (browser) await browser.close();
	if (server.exitCode === null) {
		server.kill('SIGTERM');
		await new Promise((resolve) => server.once('exit', resolve));
	}
	await writeFile(
		directory + '/results.json',
		JSON.stringify({ directory, directSsr, versions, records, serverLog }, null, 2),
	);
}
