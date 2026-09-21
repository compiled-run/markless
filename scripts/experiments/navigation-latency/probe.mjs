import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { LINK_ATTRIBUTE } from '../../../packages/router/src/link-attributes.ts';
import {
	readBuildInventory,
	verifyServedAsset,
	captureApplicationJavaScript,
	isApplicationJavaScript,
} from './production-preview.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const mode = option('--mode', 'dev-fresh'),
	output = resolve(
		option('--output', 'scripts/experiments/navigation-latency/results/t003-current/manual'),
	);
const pairs = {
	accordion: ['select', 'accordion'],
	select: ['accordion', 'select'],
	tsrx: ['select', 'accordion-examples'],
};
const nativeSampling = args.includes('--native');
const selectedBuild = args.includes('--build-dir') ? resolve(option('--build-dir')) : undefined;
if (selectedBuild && !mode.startsWith('production'))
	throw new Error('--build-dir requires production mode');
if (
	mode.startsWith('production') &&
	!nativeSampling &&
	option('--routes', 'accordion') !== 'accordion'
)
	throw new Error('Controlled production admission supports only Accordion');
const diagnostic = args.includes('--diagnostic');
const serverProfile = args.includes('--server-profile');
if (serverProfile && (!diagnostic || mode.startsWith('production')))
	throw new Error('--server-profile requires a dev diagnostic run');
let serverProfileDirectory;
const samples = Number(option('--samples', '1'));
const run = resolve(output, new Date().toISOString().replaceAll(':', '-'));
await mkdir(run, { recursive: true });
const results = {
	mode,
	nativeSampling,
	selectedBuild,
	diagnostic,
	admission: args.includes('--admission'),
	hardware: {
		platform: os.platform(),
		release: os.release(),
		cpu: os.cpus()[0]?.model,
		memory: os.totalmem(),
		node: process.version,
	},
	samples: [],
	blockers: [],
};
const fingerprint = () => {
	const names = execFileSync(
		'/opt/homebrew/bin/git',
		['ls-files', '-co', '--exclude-standard', '--', 'packages', 'website'],
		{ encoding: 'utf8' },
	)
		.trim()
		.split('\n');
	const hash = createHash('sha256');
	for (const path of [...new Set(names)].sort())
		if (!path.endsWith('cold-navigation.box.ts') && existsSync(path) && statSync(path).isFile())
			hash.update(path).update(readFileSync(path));
	return hash.digest('hex');
};
results.fingerprint = fingerprint();
let browser, server, productionGraph, productionManifest, productionInventory;
const production = mode.startsWith('production');
const productionBuild = resolve(output, '..', 'production-build', results.fingerprint);
function artifactClosure(seeds) {
	const byFile = new Map(productionGraph.chunks.map((c) => [c.fileName, c]));
	const seen = new Set();
	const visit = (name) => {
		name = name.replace(productionManifest.base, '');
		if (seen.has(name)) return;
		seen.add(name);
		const chunk = byFile.get(name);
		if (chunk) for (const dependency of chunk.imports) visit(dependency);
	};
	seeds.forEach(visit);
	return [...seen].map((name) => productionManifest.base + name);
}
function coldArtifacts(source) {
	const destination = artifactClosure(
		productionManifest.routes.navigation['pages/markless/ui/accordion.mdx'] ?? [],
	);
	const natural = artifactClosure(productionManifest.routes.ssr[source] ?? []);
	if (!destination.length || !natural.length)
		throw new Error('Missing production route artifact manifest evidence');
	return {
		destination,
		natural,
		exclusive: destination.filter((name) => !natural.includes(name)),
	};
}
async function stopServer() {
	if (!server) return;
	const child = server;
	server = undefined;
	if (child.exitCode !== null) return;
	await new Promise((resolve) => {
		child.once('exit', resolve);
		child.kill('SIGTERM');
		const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
		timeout.unref();
	});
}
async function startServer(folder, buildDir) {
	await mkdir(folder, { recursive: true });
	let log = '';
	serverProfileDirectory = resolve(folder, 'server-cpu');
	server = spawn(
		process.execPath,
		[
			resolve('scripts/experiments/navigation-latency/server.mjs'),
			folder,
			'4496',
			mode.startsWith('production') ? mode : diagnostic ? 'diagnostic' : 'timing',
			...(serverProfile ? ['--server-profile'] : []),
			...(buildDir ? ['--build-dir', buildDir] : []),
		],
		{ cwd: resolve('website'), stdio: ['ignore', 'pipe', 'pipe'] },
	);
	server.stdout.on('data', (chunk) => {
		log += chunk;
	});
	server.stderr.on('data', (chunk) => {
		log += chunk;
	});
	server.on('exit', () => void writeFile(resolve(folder, 'server.log'), log));
	await new Promise((accept, reject) => {
		const timeout = setTimeout(
			() => {
				clearInterval(poll);
				reject(new Error('Server readiness timed out'));
			},
			mode.startsWith('production') ? 600000 : 60000,
		);
		const poll = setInterval(() => {
			if (log.includes('NAVIGATION_SERVER_READY')) {
				clearTimeout(timeout);
				clearInterval(poll);
				accept();
			} else if (server.exitCode !== null) {
				clearTimeout(timeout);
				clearInterval(poll);
				reject(new Error(log));
			}
		}, 100);
	});
}
async function profileCommand(action, window) {
	if (!serverProfile) return;
	await mkdir(serverProfileDirectory, { recursive: true });
	const command = {
		action,
		window,
		id: Date.now() + '-' + action,
		epoch: Date.now(),
		probeMonotonic: performance.now(),
	};
	await writeFile(resolve(serverProfileDirectory, 'control.json'), JSON.stringify(command));
	const deadline = Date.now() + 3000;
	while (Date.now() < deadline) {
		const files = readdirSync(serverProfileDirectory);
		const identities = files
			.filter((f) => f.endsWith('.identity.json'))
			.map((f) => f.replace('.identity.json', ''));
		if (
			identities.length &&
			identities.every((id) =>
				files.includes(
					id +
						'.' +
						window +
						'.' +
						(action === 'start' ? 'started' : 'stopped') +
						'.json',
				),
			)
		)
			return command;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return { ...command, acknowledgementGap: true };
}
async function visit(pair, folder, controlled = false) {
	await mkdir(folder, { recursive: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		serviceWorkers: 'block',
	});
	const page = await context.newPage(),
		client = await context.newCDPSession(page);
	const sample = {
		source: pair[0],
		destination: pair[1],
		errors: [],
		requests: [],
		artifacts: [],
		status: 'failed',
	};
	const bodies = [];
	const javascript = production
		? captureApplicationJavaScript(page, productionInventory)
		: undefined;
	const resourceSnapshot = () =>
		page.evaluate(() => ({
			resources: performance.getEntriesByType('resource').map((r) => r.toJSON()),
			overflow: coldProbe.resourceOverflow,
		}));
	const profileWindow = folder.endsWith('/warmup') ? 'warmup' : 'navigation';
	sample.environment = { epoch: Date.now(), loadAverage: os.loadavg(), freeMemory: os.freemem() };
	await client.send('Network.enable');
	if (mode === 'production-constrained') {
		sample.network = {
			offline: false,
			latency: 150,
			downloadThroughput: 5000000 / 8,
			uploadThroughput: 1000000 / 8,
			connectionType: 'cellular4g',
		};
		sample.cpuRate = 4;
		await client.send('Network.emulateNetworkConditions', sample.network);
		await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	}
	const requests = new Map();
	const pendingScripts = new Set();
	let lastScriptEvent = Date.now();
	client.on('Network.requestWillBeSent', (event) => {
		const record = {
			id: event.requestId,
			url: event.request.url,
			type: event.type,
			timestamp: event.timestamp,
			initiator: event.initiator,
		};
		sample.requests.push(record);
		requests.set(event.requestId, record);
		if (
			event.type === 'Script' ||
			(production && isApplicationJavaScript(event.request.url, event.type))
		) {
			pendingScripts.add(event.requestId);
			lastScriptEvent = Date.now();
		}
	});
	client.on('Network.responseReceived', (event) => {
		Object.assign(requests.get(event.requestId) ?? {}, { response: event.response });
	});
	client.on('Network.loadingFailed', (event) => {
		if (pendingScripts.delete(event.requestId)) lastScriptEvent = Date.now();
		Object.assign(requests.get(event.requestId) ?? {}, { failed: event });
	});
	client.on('Network.loadingFinished', (event) => {
		if (pendingScripts.delete(event.requestId)) lastScriptEvent = Date.now();
		Object.assign(requests.get(event.requestId) ?? {}, {
			encodedDataLength: event.encodedDataLength,
			finish: event.timestamp,
		});
	});
	page.on('pageerror', (error) => sample.errors.push(error.message));
	page.on('response', (response) => {
		if (
			response.url().includes('accordion-practice.tsrx?') &&
			new URL(response.url()).searchParams.has('markless-render-data')
		)
			bodies.push(
				response
					.text()
					.then(async (text) => {
						const filename = `accordion-practice-${sample.artifacts.length}.js`;
						sample.artifacts.push({
							url: response.url(),
							filename,
							indexBarrelTextPresent: text.includes('components/src/index.ts'),
						});
						await writeFile(resolve(folder, filename), text);
					})
					.catch((error) => sample.errors.push(`artifact: ${error.message}`)),
			);
	});
	await page.addInitScript((attribute) => {
		globalThis.coldProbe = {
			nonce: crypto.randomUUID(),
			originalDocument: document,
			marks: {},
			originalURL: location.href,
		};
		performance.setResourceTimingBufferSize(20000);
		coldProbe.resourceOverflow = 0;
		performance.addEventListener(
			'resourcetimingbufferfull',
			() => coldProbe.resourceOverflow++,
		);
		document.addEventListener(
			'click',
			(event) => {
				if (event.target.closest(`a[${attribute}]`))
					coldProbe.marks.click = performance.now();
			},
			true,
		);
		navigation.addEventListener('navigatesuccess', () => {
			coldProbe.marks.settled = performance.now();
		});
		navigation.addEventListener('navigateerror', (event) => {
			coldProbe.navigationError = String(event.message);
		});
		const observer = new MutationObserver(() => {
			if (!coldProbe.marks.click || coldProbe.marks.ready) return;
			const heading = document.querySelector('h1')?.textContent?.trim();
			if (
				location.pathname.endsWith('/' + coldProbe.destination) &&
				(heading?.toLowerCase() === coldProbe.destination ||
					(coldProbe.destination === 'accordion-examples' &&
						document.querySelector('[aria-expanded][aria-controls]')))
			)
				coldProbe.marks.ready = performance.now();
		});
		observer.observe(document, { subtree: true, childList: true, attributes: true });
	}, LINK_ATTRIBUTE);
	let cpuProfileStarted = false,
		coverageStarted = false;
	try {
		if (production)
			sample.buildIdentity = await verifyServedAsset(
				'http://127.0.0.1:4496',
				productionInventory.identityAsset,
			);
		if (diagnostic) {
			await client.send('Profiler.enable');
			await client.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
			coverageStarted = true;
		}
		sample.sourcePath = controlled
			? '/markless/examples/accordion/road-trip?embed=1'
			: `/markless/ui/${pair[0]}`;
		sample.linkKind = controlled
			? 'late-created marked anchor on approved embedded source'
			: 'native sidebar';
		await page.goto(`http://127.0.0.1:4496${sample.sourcePath}`, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		});
		if (controlled)
			await expect(page.locator('button[aria-expanded][aria-controls]').first()).toBeAttached(
				{ timeout: 30000 },
			);
		else
			await expect(page.locator('h1')).toHaveText(
				pair[0] === 'accordion' ? 'Accordion' : pair[0],
				{ timeout: 30000 },
			);
		const start = Date.now();
		while (Date.now() - lastScriptEvent < 500 || pendingScripts.size) {
			if (Date.now() - start > 30000)
				throw new Error('Source did not reach bounded script-idle readiness');
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		if (diagnostic) {
			await writeFile(
				resolve(folder, 'startup-coverage.json'),
				JSON.stringify(await client.send('Profiler.takePreciseCoverage')),
			);
			await client.send('Profiler.start');
			cpuProfileStarted = true;
		}
		if (production) {
			sample.startupValidation = await javascript.finish(resourceSnapshot);
			if (!sample.startupValidation.valid)
				throw new Error(sample.startupValidation.issues.join('\n'));
		}
		sample.startupRequestCount = sample.requests.length;
		sample.startup = await page.evaluate(() => ({
			nonce: coldProbe.nonce,
			resources: performance.getEntriesByType('resource').map((r) => r.toJSON()),
			title: document.title,
			scripts: [...document.scripts].map((s) => ({
				src: s.src,
				linkBridge: s.hasAttribute('data-markless-router-link-resumer'),
			})),
			containers: document.querySelectorAll('[data-async-container]').length,
		}));
		if (production && !controlled) {
			const destination = artifactClosure(
				productionManifest.routes.navigation[
					`pages/markless/ui/${pair[1]}.${pair[1] === 'accordion-examples' ? 'tsrx' : 'mdx'}`
				] ?? [],
			);
			const loaded = new Set(sample.requests.map((r) => new URL(r.url).pathname));
			const source = new Set(
				artifactClosure(
					productionManifest.routes.ssr[`pages/markless/ui/${pair[0]}.mdx`] ?? [],
				),
			);
			const exclusive = destination.filter((path) => !source.has(path));
			sample.nativeAdmission = {
				exclusive,
				loadedExclusive: exclusive.filter((path) => loaded.has(path)),
			};
			sample.preloaded = sample.nativeAdmission.loadedExclusive.length > 0;
			sample.classification = sample.preloaded ? 'native-preloaded' : 'native-observation';
		}
		if (production && controlled) {
			sample.classification = 'controlled-admission';
			sample.artifactAdmission = coldArtifacts(
				controlled
					? 'pages/markless/examples/accordion/[scenario].tsrx'
					: 'pages/markless/ui/select.mdx',
			);
			const loaded = new Set(sample.requests.map((r) => new URL(r.url).pathname));
			sample.artifactAdmission.loadedExclusive = sample.artifactAdmission.exclusive.filter(
				(p) => loaded.has(p),
			);
			if (!sample.artifactAdmission.exclusive.length)
				throw new Error('No destination-exclusive artifacts identified');
			if (sample.artifactAdmission.loadedExclusive.length) {
				sample.preloaded = true;
				throw new Error('Destination-exclusive production artifacts loaded before click');
			}
		}
		const destinationRequests = sample.requests.filter(
			(r) =>
				r.url.includes(`/pages/markless/ui/${pair[1]}.`) ||
				r.url.includes(`/pages/ui/${pair[1]}.`),
		);
		if ((!production || controlled) && destinationRequests.length)
			throw new Error('Destination route already requested before click');
		await page.evaluate(
			({ destination, controlled, attribute }) => {
				coldProbe.destination = destination;
				if (controlled) {
					const link = document.createElement('a');
					link.href = '/markless/ui/' + destination;
					link.setAttribute(attribute, '');
					link.textContent = 'Cold navigation experiment';
					const bridge = document.querySelector(
						'script[data-markless-router-link-resumer]',
					);
					const container = bridge?.closest('[data-async-container]');
					if (!container)
						throw new Error(
							'Approved source has no existing router link-bridge container',
						);
					container.append(link);
				}
			},
			{ destination: pair[1], controlled, attribute: LINK_ATTRIBUTE },
		);
		const link = page.locator(`a[${LINK_ATTRIBUTE}][href="/markless/ui/${pair[1]}"]`).first();
		await expect(link).toBeAttached({ timeout: 5000 });
		sample.preClickRequestCount = sample.requests.length;
		if (production && controlled) {
			const loaded = new Set(sample.requests.map((r) => new URL(r.url).pathname));
			sample.artifactAdmission.loadedExclusiveAtClick =
				sample.artifactAdmission.exclusive.filter((p) => loaded.has(p));
			if (sample.artifactAdmission.loadedExclusiveAtClick.length)
				throw new Error('Destination artifact requested during link setup before click');
			sample.classification = 'controlled-unloaded';
		}
		sample.profileStart = await profileCommand('start', profileWindow);
		sample.clockAlignment = await page.evaluate(() => ({
			epoch: Date.now(),
			timeOrigin: performance.timeOrigin,
			now: performance.now(),
		}));
		sample.clickMechanism =
			'HTMLElement.click() through locator.evaluate; navigation and destination interaction are programmatic';
		await link.evaluate((element) => element.click());
		await page.waitForFunction(() => coldProbe.marks.ready, { timeout: 30000 });
		sample.renderedControls = await page
			.locator('button[aria-expanded]')
			.evaluateAll((elements) =>
				elements.map((e) => ({ text: e.textContent, html: e.outerHTML })),
			);
		if (pair[1] === 'select') {
			const selectTrigger = page.locator(
				'button[aria-haspopup="listbox"]:not(.mode-select-trigger), [role="combobox"]',
			);
			if ((await selectTrigger.count()) === 0)
				throw new Error(
					'Select destination has only the shared documentation-mode select; no destination Select interaction is available',
				);
			throw new Error(
				'Select destination-specific oracle needs actual rendered field mapping',
			);
		}
		const trigger = page
			.locator(
				pair[1] === 'accordion'
					? '.practice-trigger'
					: 'button[aria-expanded][aria-controls]',
			)
			.first();
		await expect(trigger).toBeAttached({ timeout: 5000 });
		const before = await trigger.getAttribute('aria-expanded');
		await trigger.evaluate((element) => {
			const before = element.getAttribute('aria-expanded');
			const observer = new MutationObserver(() => {
				if (element.getAttribute('aria-expanded') !== before) {
					coldProbe.marks.interactionResult = performance.now();
					observer.disconnect();
				}
			});
			observer.observe(element, { attributes: true, attributeFilter: ['aria-expanded'] });
			coldProbe.marks.interactionInput = performance.now();
			element.click();
		});
		await expect(trigger).toHaveAttribute(
			'aria-expanded',
			before === 'true' ? 'false' : 'true',
			{ timeout: 10000 },
		);
		const controlledId = await trigger.getAttribute('aria-controls');
		if (before === 'true')
			await expect(page.locator(`[id="${controlledId}"]`)).toBeHidden({ timeout: 5000 });
		else await expect(page.locator(`[id="${controlledId}"]`)).toBeVisible({ timeout: 5000 });
		await page.waitForFunction(() => coldProbe.marks.settled, { timeout: 10000 });
		sample.status = 'admitted';
	} catch (error) {
		sample.failure = String(error.stack ?? error);
	} finally {
		sample.profileStop = await profileCommand('stop', profileWindow);
		sample.observed = await page
			.evaluate(() => ({
				marks: coldProbe?.marks,
				nonce: coldProbe?.nonce,
				sameDocument: coldProbe?.originalDocument === document,
				url: location.href,
				title: document.title,
				heading: document.querySelector('h1')?.textContent,
				body: document.body?.innerText.slice(0, 12000),
				links: [...document.querySelectorAll('a[aria-current]')].map((a) => ({
					href: a.getAttribute('href'),
					current: a.getAttribute('aria-current'),
				})),
			}))
			.catch((error) => ({ error: String(error) }));
		if (diagnostic && coverageStarted) {
			if (cpuProfileStarted)
				await writeFile(
					resolve(folder, 'navigation.cpuprofile'),
					JSON.stringify(await client.send('Profiler.stop')),
				);
			await writeFile(
				resolve(folder, 'navigation-coverage.json'),
				JSON.stringify(await client.send('Profiler.takePreciseCoverage')),
			);
			await client.send('Profiler.stopPreciseCoverage');
			if (!production) {
				const response = await fetch('http://127.0.0.1:4496/__cold_transforms');
				await writeFile(resolve(folder, 'transforms.json'), await response.text());
			}
		}
		await Promise.all(bodies);
		if (production) {
			sample.resourceEvidence = await resourceSnapshot().catch(() => ({
				resources: [],
				overflow: 0,
			}));
			sample.javascriptValidation = await javascript
				.finish(async () => {
					sample.resourceEvidence = await resourceSnapshot();
					return sample.resourceEvidence;
				})
				.catch((error) => ({ valid: false, issues: [String(error)] }));
			if (
				!sample.javascriptValidation.valid ||
				(sample.status === 'admitted' &&
					(sample.observed.sameDocument !== true ||
						sample.observed.nonce !== sample.startup?.nonce))
			) {
				sample.status = 'invalid';
				sample.failure = [
					sample.failure,
					...(sample.javascriptValidation.issues ?? []),
					'Production identity/completeness or document-lifetime admission failed',
				]
					.filter(Boolean)
					.join('\n');
			}
		}
		await writeFile(resolve(folder, 'sample.json'), JSON.stringify(sample, null, 2));
		await context.close();
	}
	return sample;
}
try {
	if (production) {
		const reuse =
			selectedBuild ??
			(existsSync(resolve(productionBuild, 'build-complete.json'))
				? productionBuild
				: undefined);
		await startServer(reuse ? resolve(run, 'server') : productionBuild, reuse);
		productionInventory = await readBuildInventory(reuse ?? productionBuild);
		productionGraph = productionInventory.graph;
		productionManifest = productionInventory.manifest;
		results.build = {
			buildDir: productionInventory.buildDir,
			digest: productionInventory.digest,
			archived: !!selectedBuild,
			currentSourceFingerprint: results.fingerprint,
		};
	}
	browser = await chromium.launch({ headless: true });
	results.browser = browser.version();
	if (production && args.includes('--admission')) {
		const native = await visit(pairs.accordion, resolve(run, 'native-sidebar'));
		if (native.status !== 'admitted')
			results.blockers.push({ name: 'native-admission', failure: native.failure });
		results.nativeAdmission = {
			status: native.status,
			preloaded: native.preloaded,
			failure: native.failure,
		};
	}
	for (const name of option('--routes', 'accordion').split(',')) {
		if (!pairs[name]) throw new Error(`Unknown route ${name}`);
		for (let index = 0; index < samples; index++) {
			if (fingerprint() !== results.fingerprint)
				throw new Error('Tracked source fingerprint changed');
			const folder = resolve(run, `${name}-${index}`);
			if (!production) await startServer(folder);
			if (mode === 'dev-warm') {
				const warm = resolve(folder, 'warmup');
				await mkdir(warm);
				const admission = await visit(pairs[name], warm);
				if (admission.status !== 'admitted') {
					results.blockers.push({ name, warmup: admission.failure });
					await stopServer();
					break;
				}
			}
			const sample = await visit(pairs[name], folder, production && !nativeSampling);
			results.samples.push({
				name,
				index,
				status: sample.status,
				failure: sample.failure,
				marks: sample.observed.marks,
			});
			if (!production) await stopServer();
			if (fingerprint() !== results.fingerprint)
				throw new Error('Source fingerprint changed during sample');
			if (sample.status !== 'admitted') {
				results.blockers.push({ name, failure: sample.failure });
				break;
			}
		}
	}
} catch (error) {
	results.blockers.push(String(error.stack ?? error));
} finally {
	await stopServer();
	await browser?.close();
	await writeFile(resolve(run, 'summary.json'), JSON.stringify(results, null, 2));
	console.log(
		JSON.stringify({ run, samples: results.samples, blockers: results.blockers }, null, 2),
	);
}
if (results.blockers.length) process.exitCode = 1;
