import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { cases as contractCases } from '../../../demos/interaction-benchmark/runner/cases.mjs';
import {
	firstUseSweep,
	isJsUrl,
	openPage,
	runStep,
	waitForExpect,
} from '../../../demos/interaction-benchmark/runner/lib/controls.mjs';
import {
	executedMask,
	lazyInitOffsets,
	orInto,
	scriptLength,
	windowExecution,
} from '../../../demos/interaction-benchmark/runner/lib/coverage.mjs';
import { startTarget } from '../../../demos/interaction-benchmark/runner/lib/serve.mjs';
import {
	attributeFiles,
	readAttribution,
	readDemand,
	runtimeFeatureIndex,
	runtimeModuleSizes,
	undemandedRuntimeModules,
} from './attribution.mjs';
import { measureConstructGlue } from './construct-glue.mjs';
import { LEAN_DISPATCH_MARKER_MODULES } from '../../../packages/compiler/src/lean-dispatch-modules.ts';
import {
	BENCH_APP_DIR,
	BENCH_ROUTE_SOURCES,
	EXECUTION_ACTIONS,
	NAVIGATIONS,
	PORTS,
	ROOT_DIR,
	SAME_TASK_PROBES,
	SITES,
	WEBSITE_DIR,
} from './config.mjs';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const COMPILE_HINT = '//# allFunctionsCalledOnLoad';
const APP_DIRS = { bench: BENCH_APP_DIR, docs: WEBSITE_DIR };

export async function buildSite(site, log = () => {}) {
	log(`building ${site} (${APP_DIRS[site]})`);
	try {
		await exec('pnpm', ['--dir', APP_DIRS[site], 'build'], {
			cwd: ROOT_DIR,
			env: { ...process.env, NODE_ENV: 'production', BENCHMARK_BUILD_ID: 'perf-guard' },
			maxBuffer: 256 * 1024 * 1024,
		});
	} catch (error) {
		throw new Error(
			`${site} build failed:\n${[error.stdout, error.stderr].join('\n').slice(-4000)}`,
		);
	}
}

async function serveSite(site, log) {
	const cwd = APP_DIRS[site];
	const port = PORTS[site];
	const target = {
		name: `perf-guard-${site}`,
		serve: { command: 'node', args: ['.output/server/index.mjs'], cwd, port },
		url: `http://127.0.0.1:${port}`,
	};
	const { stop, spawned } = await startTarget(target, { log });
	if (!spawned) {
		throw new Error(
			`port ${port} already answers; stop that server so the guard serves ${site} from this tree`,
		);
	}
	return { origin: target.url, stop };
}

const MODULEPRELOAD = /<link\b[^>]*\brel=["']?modulepreload["']?[^>]*>/g;
const HREF = /\bhref=["']?([^"'\s>]+)/;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const SRC = /\bsrc=["']?([^"'\s>]+)/;
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const IMPORT_MAP = /<script type="importmap">([\s\S]*?)<\/script>/;

// Chunks import each other by bare specifiers; the page's import map names the file each one loads.
export function importMapOf(html) {
	const body = IMPORT_MAP.exec(html)?.[1];
	return body ? (JSON.parse(body).imports ?? {}) : {};
}

function preloadedPaths(html, origin) {
	const paths = new Set();
	for (const tag of html.match(MODULEPRELOAD) ?? []) {
		const href = HREF.exec(tag)?.[1];
		if (href) paths.add(new URL(href, origin).pathname);
	}
	const inlineModules = [];
	for (const [, attributes, body] of html.matchAll(SCRIPT)) {
		const src = SRC.exec(attributes)?.[1];
		if (src && isJsUrl(src)) paths.add(new URL(src, origin).pathname);
		else if (/\btype=["']?module/.test(attributes)) inlineModules.push(body);
	}
	return { paths: [...paths], inlineModules };
}

function createFileReader(publicDir, base) {
	const cache = new Map();
	return (pathname) => {
		if (!cache.has(pathname)) {
			const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
			const file = join(publicDir, decodeURIComponent(relative));
			const code =
				existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : null;
			cache.set(pathname, code && { code, gzipBytes: gzipSync(code, { level: 9 }).length });
		}
		return cache.get(pathname);
	};
}

function importsOf(code, fromPath, pattern, imports = {}) {
	const base = new URL(fromPath, 'http://x');
	return [...code.matchAll(pattern)].flatMap(([, specifier]) =>
		Object.hasOwn(imports, specifier)
			? [new URL(imports[specifier], base).pathname]
			: /\.m?js$/.test(specifier)
				? [new URL(specifier, base).pathname]
				: [],
	);
}

/**
 * Serial fetch rounds before every boot file is in hand. Preloaded files are all requested in round 1;
 * a static import of a file the page did not preload is found only after its importer arrives.
 */
export function criticalPathRounds(roots, preloaded, staticImports) {
	const listed = new Set(preloaded);
	const round = new Map();
	const chain = new Map();
	const visit = (path, depth, via) => {
		const next = listed.has(path) ? 1 : depth;
		if ((round.get(path) ?? 0) >= next) return;
		round.set(path, next);
		chain.set(path, [...via, path]);
		for (const dep of staticImports(path)) visit(dep, next + 1, [...via, path]);
	};
	for (const root of roots) visit(root, 1, []);
	let worst = { rounds: 1, chain: [] };
	for (const [path, r] of round)
		if (r > worst.rounds) worst = { rounds: r, chain: chain.get(path) };
	const missing = [...round.keys()].filter((path) => !listed.has(path));
	return { ...worst, notPreloaded: missing };
}

async function staticRoute(origin, route, read) {
	const html = await (await fetch(new URL(route, origin))).text();
	const { paths, inlineModules } = preloadedPaths(html, origin);
	const imports = importMapOf(html);
	const roots = [
		...paths,
		...inlineModules.flatMap((body) => importsOf(body, route, STATIC_IMPORT, imports)),
	];
	const staticImports = (path) => {
		const file = read(path);
		return file ? importsOf(file.code, path, STATIC_IMPORT, imports) : [];
	};
	const { rounds, chain, notPreloaded } = criticalPathRounds(roots, paths, staticImports);
	const files = paths.filter((path) => isJsUrl(path));
	const missingFiles = files.filter((path) => !read(path));
	return {
		html,
		files,
		gzipBytes: files.reduce((total, path) => total + (read(path)?.gzipBytes ?? 0), 0),
		rounds,
		chain,
		notPreloaded,
		missingFiles,
	};
}

// A chunk whose bytes name another chunk's hashed file is re-downloaded whenever that file changes.
function chunkNameReferences(publicDir) {
	const buildDir = join(publicDir, 'build');
	const names = readdirSync(buildDir).filter((name) => isJsUrl(name));
	const references = [];
	for (const name of names) {
		const code = readFileSync(join(buildDir, name), 'utf8');
		const named = names.filter((other) => other !== name && code.includes(other));
		if (named.length)
			references.push({
				file: `/build/${name}`,
				names: named.map((other) => `/build/${other}`),
			});
	}
	return references;
}

function compileHints(publicDir, preloadedAnywhere) {
	const buildDir = join(publicDir, 'build');
	const hinted = [];
	for (const name of readdirSync(buildDir)) {
		if (!isJsUrl(name)) continue;
		const head = readFileSync(join(buildDir, name), 'utf8').slice(0, 400);
		if (head.includes(COMPILE_HINT)) hinted.push(`/build/${name}`);
	}
	const preloaded = new Set(preloadedAnywhere);
	return {
		hinted: hinted.sort(),
		hintedNotPreloaded: hinted.filter((path) => !preloaded.has(path)).sort(),
	};
}

function viewPayload(html) {
	const body = /<script type="markless\/view">([\s\S]*?)<\/script>/.exec(html)?.[1];
	return body ? JSON.parse(body) : null;
}

export function actionPath(action) {
	if (action.plan?.kind) return action.plan.kind;
	for (const [path, modules] of Object.entries(LEAN_DISPATCH_MARKER_MODULES))
		if (modules.some((id) => action.runtimeModuleIds.includes(id))) return path;
	return action.runtimeModuleIds.length === 0 ? 'no-runtime' : 'full-resume';
}

async function leanActions(publicDir, served, browser, origin) {
	const demand = JSON.parse(readFileSync(join(publicDir, 'build/execution-demand.json'), 'utf8'));
	const out = {};
	for (const [route, source] of Object.entries(BENCH_ROUTE_SOURCES)) {
		const entry = Object.entries(demand).find(([id]) =>
			id.endsWith(`/${source}?markless-resume`),
		)?.[1];
		if (!entry) throw new Error(`execution-demand.json has no resume entry for ${source}`);
		const view = viewPayload(served[route].html);
		const names = await actionNames(browser, origin, route, view, entry.actions);
		out[route] = Object.fromEntries(
			entry.actions.map((action, i) => [names[i], actionPath(action)]),
		);
	}
	return out;
}

// Stable action names: the host element's data-testid (or tag within the nearest testid'd ancestor).
async function actionNames(browser, origin, route, view, actions) {
	const visit = await openPage(browser);
	try {
		await visit.goto(new URL(route, origin).href);
		return await visit.page.evaluate(
			({ locators, actions }) => {
				const root = document.querySelector('[data-async-container]');
				const census = [root];
				const walker = document.createTreeWalker(root, 1);
				for (let n; (n = walker.nextNode());) census.push(n);
				const byId = new Map(locators.map((l) => [l.hostNodeId, l]));
				const describe = (el) => {
					if (!el) return 'unknown';
					const own = el.getAttribute('data-testid');
					if (own) return own;
					const scope = el.parentElement?.closest('[data-testid]');
					const tag = el.tagName.toLowerCase();
					return scope ? `${scope.getAttribute('data-testid')}>${tag}` : tag;
				};
				return actions.map((action) => {
					const locator = byId.get(action.hostNodeId);
					const el = locator ? census[locator.index] : null;
					const rows = action.recordKind === 'keyed-repeat-row' ? 'rows-of:' : '';
					return `${action.eventName}@${rows}${describe(el)}`;
				});
			},
			{ locators: view?.locators ?? [], actions },
		);
	} finally {
		await visit.close();
	}
}

function wasteForRoute(staticInfo, sweep, read, origin) {
	const masks = new Map();
	for (const control of sweep.controls) {
		for (const script of control.coverage ?? []) {
			const path = new URL(script.url).pathname;
			if (new URL(script.url).origin !== origin) continue;
			const length = scriptLength(script.functions);
			const mask = executedMask(script.functions, length);
			masks.set(path, masks.has(path) ? orInto(masks.get(path), mask) : mask);
		}
	}
	const files = staticInfo.files.map((path) => {
		const file = read(path);
		const length = file?.code.length ?? 0;
		const mask = masks.get(path);
		const executed = mask ? mask.reduce((t, b) => t + b, 0) : 0;
		const neverFraction = length ? Math.max(0, length - executed) / length : 0;
		return {
			file: path,
			gzipBytes: file?.gzipBytes ?? 0,
			neverGzipBytes: Math.round((file?.gzipBytes ?? 0) * neverFraction),
		};
	});
	return {
		gzipBytes: files.reduce((t, f) => t + f.neverGzipBytes, 0),
		files: files.sort((a, b) => b.neverGzipBytes - a.neverGzipBytes),
	};
}

async function executionCost(browser, origin, name, caseId, read) {
	const caseDef = contractCases[caseId];
	if (!caseDef) throw new Error(`unknown contract case ${caseId} for action ${name}`);
	const visit = await openPage(browser, { coverage: true });
	try {
		await visit.goto(new URL(caseDef.route, origin).href);
		await visit.settle();
		for (const step of caseDef.pre) await runStep(visit.page, step);
		await visit.settle();
		await visit.coverage.take();
		visit.state.phase = 'input';
		await runStep(visit.page, caseDef.input);
		await waitForExpect(visit.page, caseDef.expect);
		await visit.settle(300);
		const offsets = (url) =>
			new URL(url).origin === origin
				? lazyInitOffsets(read(new URL(url).pathname)?.code ?? '')
				: new Map();
		const execution = windowExecution(await visit.coverage.take(), offsets);
		return {
			caseId,
			route: caseDef.route,
			executedChars: execution.executedChars,
			functions: execution.functions,
			modules: execution.modules,
			inputJs: visit.state.js.input.map((url) => new URL(url).pathname),
			scripts: execution.perScript.map((s) => ({ ...s, url: new URL(s.url).pathname })),
			errors: [...visit.state.errors],
		};
	} finally {
		await visit.close();
	}
}

async function sameTask(browser, origin, probe) {
	const visit = await openPage(browser);
	const results = [];
	try {
		await visit.goto(new URL(probe.route, origin).href);
		await visit.settle();
		for (const step of probe.start) await runStep(visit.page, step);
		await visit.settle();
		for (const follower of probe.followers) {
			for (const step of follower.before ?? []) await runStep(visit.page, step);
			if (follower.before) await visit.settle(100);
			await visit.page.evaluate(
				([type, until]) => {
					const r = { sawEvent: false, taskFired: false, domBeforeNextTask: null };
					const text =
						until?.textChanges &&
						document.querySelector(until.textChanges)?.textContent;
					const reached = () =>
						!until ||
						(until.textChanges
							? document.querySelector(until.textChanges)?.textContent !== text
							: !!document.querySelector(until.selector) === until.present);
					window.__perfGuardProbe = r;
					const channel = new MessageChannel();
					channel.port1.onmessage = () => (r.taskFired = true);
					const observer = new MutationObserver(() => {
						if (!r.sawEvent || r.domBeforeNextTask !== null || !reached()) return;
						r.domBeforeNextTask = !r.taskFired;
						observer.disconnect();
					});
					observer.observe(document, {
						subtree: true,
						childList: true,
						characterData: true,
						attributes: true,
					});
					addEventListener(
						type,
						() => {
							r.sawEvent = true;
							channel.port2.postMessage(0);
						},
						{ capture: true, once: true },
					);
				},
				[follower.event, follower.until ?? null],
			);
			await runStep(visit.page, follower.step);
			await visit.settle(200);
			const r = await visit.page.evaluate(() => window.__perfGuardProbe);
			results.push({
				route: probe.route,
				name: follower.name,
				event: follower.event,
				sawEvent: r.sawEvent,
				sameTask: r.domBeforeNextTask === true,
				responded: r.domBeforeNextTask !== null,
			});
		}
	} finally {
		await visit.close();
	}
	return results;
}

async function navigationRounds(browser, origin, nav, read) {
	const imports = importMapOf(await (await fetch(new URL(nav.from, origin))).text());
	const visit = await openPage(browser);
	try {
		await visit.goto(new URL(nav.from, origin).href);
		await visit.settle();
		await visit.page.evaluate(() => {
			window.__perfGuardNamed = [];
			new MutationObserver((records) => {
				for (const record of records)
					for (const node of record.addedNodes)
						if (node.nodeName === 'LINK' && node.rel === 'modulepreload')
							window.__perfGuardNamed.push(new URL(node.href).pathname);
			}).observe(document.head, { childList: true });
		});
		visit.state.phase = 'input';
		const link = visit.page.locator(`[data-testid="${nav.link}"]`);
		await link.hover();
		await visit.settle(100);
		await link.click();
		await visit.page.waitForURL((url) => url.pathname === nav.to, { timeout: 10000 });
		await visit.settle(300);
		const named = new Set(await visit.page.evaluate(() => window.__perfGuardNamed));
		const fetched = [...new Set(visit.state.js.input.map((url) => new URL(url).pathname))];
		const references = (path, target) => {
			const code = read(path)?.code ?? '';
			return (
				importsOf(code, path, STATIC_IMPORT, imports).includes(target) ||
				importsOf(code, path, DYNAMIC_IMPORT, imports).includes(target)
			);
		};
		const round = new Map();
		const roundOf = (path, seen = new Set()) => {
			if (round.has(path)) return round.get(path);
			if (named.has(path) || seen.has(path)) return 1;
			seen.add(path);
			const importers = fetched.filter((other) => other !== path && references(other, path));
			const r = importers.length
				? 1 + Math.max(...importers.map((i) => roundOf(i, seen)))
				: 1;
			round.set(path, r);
			return r;
		};
		const perFile = fetched.map((path) => ({
			file: path,
			named: named.has(path),
			round: roundOf(path),
			via: named.has(path)
				? []
				: fetched.filter((other) => other !== path && references(other, path)),
		}));
		return {
			...nav,
			rounds: perFile.reduce((m, f) => Math.max(m, f.round), 1),
			fetched: perFile,
			documents: visit.state.documents,
			errors: [...visit.state.errors],
		};
	} finally {
		await visit.close();
	}
}

export async function measure({ build = true, sites = ['bench', 'docs'], log = () => {} } = {}) {
	const { chromium } = require('@playwright/test');
	const result = { sites: {} };
	for (const site of sites) {
		if (build) await buildSite(site, log);
		const publicDir = join(APP_DIRS[site], '.output/public');
		const read = createFileReader(publicDir, SITES[site].base);
		const attribution = readAttribution(publicDir);
		const demand = readDemand(publicDir);
		if (!attribution)
			throw new Error(
				`${site} build emitted no byte attribution; the framework-overhead guards cannot run`,
			);
		const server = await serveSite(site, log);
		const browser = await chromium.launch();
		try {
			const routes = {};
			for (const route of SITES[site].routes) {
				log(`${site} ${route}: preload + first-use sweep`);
				const staticInfo = await staticRoute(server.origin, route, read);
				const sweep = await firstUseSweep(browser, new URL(route, server.origin).href, {
					coverage: site === 'bench',
				});
				routes[route] = {
					preload: {
						files: staticInfo.files,
						gzipBytes: staticInfo.gzipBytes,
						rounds: staticInfo.rounds,
						chain: staticInfo.chain,
						notPreloaded: staticInfo.notPreloaded,
						missingFiles: staticInfo.missingFiles,
						attribution: attributeFiles(
							staticInfo.files,
							attribution,
							read,
							SITES[site].base,
						).byCategory,
					},
					...(site === 'bench'
						? {
								payPerUse: undemandedRuntimeModules({
									paths: staticInfo.files,
									attribution,
									demand,
									appDir: APP_DIRS[site],
									base: SITES[site].base,
								}),
							}
						: {}),
					controls: sweep.controls.map(({ coverage: _coverage, ...control }) => ({
						...control,
						inputJs: control.inputJs.map((url) => new URL(url).pathname),
					})),
					...(site === 'bench'
						? { waste: wasteForRoute(staticInfo, sweep, read, server.origin) }
						: {}),
				};
				routes[route].html = staticInfo.html;
			}
			const siteResult = { routes, chunkNameReferences: chunkNameReferences(publicDir) };
			if (site === 'bench') {
				siteResult.runtimeModules = runtimeModuleSizes(attribution);
				siteResult.runtimeFeatures = runtimeFeatureIndex(demand);
				const publicPaths = Object.values(routes).flatMap((r) => r.preload.files);
				siteResult.compileHints = compileHints(publicDir, publicPaths);
				log('bench: lean dispatch coverage');
				siteResult.lean = await leanActions(publicDir, routes, browser, server.origin);
				siteResult.execution = {};
				for (const [name, caseId] of Object.entries(EXECUTION_ACTIONS)) {
					log(`bench: execution cost ${name}`);
					siteResult.execution[name] = await executionCost(
						browser,
						server.origin,
						name,
						caseId,
						read,
					);
				}
				siteResult.sameTask = [];
				for (const probe of SAME_TASK_PROBES) {
					log(`bench: same-task dispatch ${probe.route}`);
					siteResult.sameTask.push(...(await sameTask(browser, server.origin, probe)));
				}
				siteResult.navigation = [];
				for (const nav of NAVIGATIONS) {
					log(`bench: navigation ${nav.from} -> ${nav.to}`);
					siteResult.navigation.push(
						await navigationRounds(browser, server.origin, nav, read),
					);
				}
			}
			for (const route of Object.values(routes)) delete route.html;
			result.sites[site] = siteResult;
		} finally {
			await browser.close();
			await server.stop();
		}
	}
	log('construct glue on minimal fixtures');
	result.constructGlue = await measureConstructGlue();
	return result;
}
