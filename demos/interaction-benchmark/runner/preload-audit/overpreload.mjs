#!/usr/bin/env node
// Over-preload report: how many startup bytes each entrant downloads that no control on the route ever
// executes (M1), whether preloading other controls' code delays an early click (M2), and how much of the
// navigation prefetch the destination executes (M3). Chromium only (V8 precise coverage and CDP timing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases as contractCases } from '../cases.mjs';
import { startProxy } from '../proxy.mjs';
import { profiles as benchProfiles } from '../lib/profiles.mjs';
import { detectBuild, launch, playwrightVersion } from '../lib/session.mjs';
import { startTarget } from '../lib/serve.mjs';
import { describe as stats } from '../lib/stats.mjs';
import { resolveSourceRevision, resolveVersions, targets as registry } from '../targets.mjs';
import { startHintFilter } from './lib/hint-filter.mjs';
import { attribute, sourceMapUrl } from './lib/sourcemap.mjs';
import { classify, countOnlyIn, countSet, executedMask, orInto, scriptLength, uncalledFunctions } from './lib/ranges.mjs';
import { isJs, openVisit } from './lib/visit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appsDir = path.join(here, '../../apps');
const ROUTES = ['/', '/records', '/settings'];
const NAV_ID = { '/': 'nav-overview', '/records': 'nav-records', '/settings': 'nav-settings' };
const TITLE = { '/': 'Overview', '/records': 'Records', '/settings': 'Settings' };
const tid = (id) => ({ selector: `[data-testid="${id}"]` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[overpreload] ${m}`);

const HELP = `usage: node runner/preload-audit/overpreload.mjs [options]
  --targets a,b            registry names, or <base>-<variant> with --app-dir (default markless,qwik,qwik-tuned,solidstart,sveltekit,react-router)
  --app-dir name=dir       serve this target from another directory (for example a scratch build of the same app)
  --measures m1,m2,m3      default all
  --m1-reps N              coverage repetitions per route/control (default 2)
  --visits N               M2 visits per (target, case, mode) (default 5)
  --perfect a,b            targets whose M2 also runs with HTML preload hints limited to the control's closure (default: markless targets)
  --m2-cases a,b           early cases for M2 (default all early contract cases except the x10 repeat)
  --port-base N            app servers on N.., proxies on +1000 (default 4241)
  --out dir                output directory
  --lock path              hold this lock directory during M2 timed visits (mkdir-atomic; waits while another owner holds it)`;

function parse(argv) {
	const o = { targets: ['markless', 'qwik', 'qwik-tuned', 'solidstart', 'sveltekit', 'react-router'], appDirs: {}, measures: ['m1', 'm2', 'm3'], m1Reps: 2, visits: 5, perfect: null, m2Cases: null, portBase: 4241, out: null, lock: null };
	const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const v = () => argv[++i];
		if (a === '--targets') o.targets = list(v());
		else if (a === '--app-dir') {
			const [k, d] = v().split('=');
			o.appDirs[k] = path.resolve(d);
		} else if (a === '--measures') o.measures = list(v());
		else if (a === '--m1-reps') o.m1Reps = Number(v());
		else if (a === '--visits') o.visits = Number(v());
		else if (a === '--perfect') o.perfect = list(v());
		else if (a === '--m2-cases') o.m2Cases = list(v());
		else if (a === '--port-base') o.portBase = Number(v());
		else if (a === '--out') o.out = v();
		else if (a === '--lock') o.lock = v();
		else if (a === '--help' || a === '-h') {
			console.log(HELP);
			process.exit(0);
		} else throw new Error(`unknown argument ${a}\n${HELP}`);
	}
	o.perfect ??= o.targets.filter((t) => t.startsWith('markless'));
	return o;
}

const opts = parse(process.argv.slice(2));
const outDir = path.resolve(opts.out ?? path.join(here, '../../results', `overpreload-${new Date().toISOString().slice(0, 10)}`));
fs.mkdirSync(outDir, { recursive: true });

function resolveLocal(name, index) {
	const base = registry[name] ? name : name.replace(/-[^-]+$/, '');
	const reg = registry[base];
	if (!reg) throw new Error(`unknown target ${name}`);
	const cwd = opts.appDirs[name] ?? path.join(appsDir, name);
	if (!fs.existsSync(cwd)) throw new Error(`${name}: app dir ${cwd} missing (pass --app-dir)`);
	const port = opts.portBase + index;
	let serve = { ...reg.serve, cwd, port };
	// vite preview ignores PORT, so the fixed port in the app's script is replaced here.
	if (serve.command === 'pnpm' && serve.args.join(' ') === 'run preview')
		serve = { ...serve, command: 'node', args: ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'] };
	return {
		name,
		entrant: reg.entrant ?? base,
		variant: name === base ? (reg.variant ?? 'default') : name.slice(base.length + 1),
		appDir: cwd,
		serve,
		upstream: `http://127.0.0.1:${port}`,
		proxyPort: port + 1000,
		versions: resolveVersions(base),
		sourceRevision: resolveSourceRevision(base),
	};
}

const targets = opts.targets.map(resolveLocal);
const perfectSet = new Set(opts.perfect);
const cleanups = [];
let filterPort = opts.portBase + targets.length;
for (const t of targets) {
	cleanups.push((await startTarget({ ...t, serve: t.serve }, { log })).stop);
	let upstream = t.upstream;
	if (perfectSet.has(t.name) && opts.measures.includes('m2')) {
		t.filter = await startHintFilter({ upstream: t.upstream, port: filterPort++ });
		cleanups.push(t.filter.close);
		upstream = t.filter.url;
	}
	const proxy = await startProxy({ upstream, port: t.proxyPort, shaped: [{ name: 'constrained', port: 0, network: benchProfiles.constrained.network }] });
	cleanups.push(proxy.close);
	t.url = proxy.url;
	t.shapedUrl = proxy.shapedUrls.constrained;
	t.protocol = proxy.protocol;
	const detected = await detectBuild(t.upstream);
	t.buildId = detected.build;
	log(`${t.name}: ${t.upstream} via ${t.url} (shaped ${t.shapedUrl}); build ${t.buildId}`);
}
const shutdown = async () => {
	for (const c of cleanups.reverse()) await c().catch(() => {});
};

const browser = await launch('chromium');
const keyOf = (url) => {
	const u = new URL(url);
	return u.pathname + u.search;
};

function controlCases(route) {
	const list = [];
	for (const [id, c] of Object.entries(contractCases)) {
		if (c.route !== route) continue;
		const steps = [...c.pre, c.input];
		if (steps.some((s) => s.goBack || (s.click && /nav-/.test(s.click.selector)))) continue;
		list.push({ id, pre: c.pre, input: c.input, expect: c.expect });
	}
	for (const dest of ROUTES) if (dest !== route) list.push({ id: `nav:${route}->${dest}`, pre: [], input: { click: tid(NAV_ID[dest]) }, expect: [{ pathname: dest }, { target: tid('page-title'), text: TITLE[dest] }] });
	return list;
}

function resourceRow(e) {
	return { key: keyOf(e.url), type: e.type, js: isJs(e), linkPreload: e.linkPreload, initiator: e.initiator, startEpoch: e.startEpoch, endEpoch: e.endEpoch, wire: e.wireBytes, decoded: e.decodedBytes, gzip: e.gzipBytes ?? null, status: e.status };
}

async function m1Target(t) {
	const routes = {};
	for (const route of ROUTES) {
		const scripts = new Map();
		const script = (key, length) => {
			let s = scripts.get(key);
			if (!s) scripts.set(key, (s = { key, length, boot: new Uint8Array(length), control: new Uint8Array(length), perControl: {}, functions: null }));
			return s;
		};
		const ingest = (snap, kind, controlId) => {
			for (const sc of snap.scripts) {
				const len = scriptLength(sc.functions);
				const s = script(keyOf(sc.url), len);
				if (len > s.length) continue;
				const mask = executedMask(sc.functions, s.length);
				if (kind === 'boot') orInto(s.boot, mask);
				else {
					orInto(s.control, mask);
					s.perControl[controlId] = orInto(s.perControl[controlId] ?? new Uint8Array(s.length), mask);
				}
				if (!s.functions || sc.functions.length > s.functions.length) s.functions = sc.functions;
			}
		};
		const bootRuns = [];
		const controls = controlCases(route);
		const controlRuns = Object.fromEntries(controls.map((c) => [c.id, []]));
		for (let rep = 0; rep < opts.m1Reps; rep++) {
			const v = await openVisit(browser, { coverage: true, bodies: true });
			try {
				await v.goto(new URL(route, t.url).href, 'load');
				const settle = await v.settle(1000);
				ingest(await v.takeCoverage('boot'), 'boot');
				await v.finishBodies();
				bootRuns.push({ settle, hints: await v.hints(), resources: v.entries.map(resourceRow), texts: new Map(v.entries.filter((e) => e.text).map((e) => [keyOf(e.url), e.text])), errors: v.errors });
			} catch (error) {
				bootRuns.push({ error: String(error.message ?? error) });
			} finally {
				await v.close();
			}
			for (const c of controls) {
				const cv = await openVisit(browser, { coverage: true, bodies: true });
				const run = { ok: false };
				try {
					await cv.goto(new URL(route, t.url).href, 'load');
					await cv.settle(1000);
					ingest(await cv.takeCoverage('boot'), 'boot');
					run.firstInputEpoch = Date.now();
					for (const s of c.pre) await cv.step(s);
					const m = await cv.measure(c.input, c.expect);
					run.inputEpoch = m.inputEpoch;
					await cv.settle(750);
					ingest(await cv.takeCoverage('control'), 'control', c.id);
					await cv.finishBodies();
					run.afterInput = cv.entries.filter((e) => e.startEpoch >= run.firstInputEpoch).map(resourceRow);
					run.ok = true;
				} catch (error) {
					run.error = String(error.message ?? error).slice(0, 300);
				} finally {
					run.errors = cv.errors;
					await cv.close();
				}
				controlRuns[c.id].push(run);
			}
		}
		routes[route] = await summarizeRoute({ scripts, bootRuns, controlRuns, controls, upstream: t.upstream });
		const r = routes[route];
		log(`M1 ${t.name} ${route}: startup JS ${kb(r.startupJs.decoded.total)} decoded; boot ${pct(r.startupJs.decoded.boot / r.startupJs.decoded.total)}, control ${pct(r.startupJs.decoded.control / r.startupJs.decoded.total)}, never ${pct(r.startupJs.decoded.never / r.startupJs.decoded.total)}`);
	}
	return routes;
}

const kb = (b) => `${(b / 1024).toFixed(1)} KiB`;
const pct = (f) => `${(100 * (Number.isFinite(f) ? f : 0)).toFixed(1)}%`;
const sumUnits = () => ({ wire: { boot: 0, control: 0, never: 0, total: 0 }, decoded: { boot: 0, control: 0, never: 0, total: 0 }, gzip: { boot: 0, control: 0, never: 0, total: 0 } });

async function sourceBreakdown(upstream, key, text, s) {
	const ref = text && sourceMapUrl(text);
	if (!ref || !s?.length) return null;
	try {
		const res = await fetch(new URL(ref, new URL(key, upstream)), { signal: AbortSignal.timeout(10000) });
		if (!res.ok) return null;
		const map = await res.json();
		const controlOnly = new Uint8Array(s.length);
		const never = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) {
			if (s.boot[i]) continue;
			if (s.control[i]) controlOnly[i] = 1;
			else never[i] = 1;
		}
		return attribute(text, map, { boot: s.boot, controlOnly, never }, 'never');
	} catch {
		return null;
	}
}

async function summarizeRoute({ scripts, bootRuns, controlRuns, controls, upstream }) {
	const good = bootRuns.filter((r) => r.resources);
	const base = good[0];
	if (!base) return { error: bootRuns[0]?.error ?? 'no boot run' };
	const perRun = good.map((r) => ({ requests: r.resources.length, jsRequests: r.resources.filter((x) => x.js).length, wire: r.resources.reduce((a, x) => a + x.wire, 0), jsWire: r.resources.filter((x) => x.js).reduce((a, x) => a + x.wire, 0) }));
	const startupJs = sumUnits();
	const nonJs = { wire: 0, decoded: 0, gzip: 0, byType: {} };
	const resources = [];
	for (const res of base.resources) {
		if (!res.js) {
			nonJs.wire += res.wire;
			nonJs.decoded += res.decoded;
			nonJs.gzip += res.gzip ?? 0;
			nonJs.byType[res.type] = (nonJs.byType[res.type] ?? 0) + res.wire;
			continue;
		}
		const s = scripts.get(res.key);
		const sizes = { wire: res.wire, decoded: res.decoded, gzip: res.gzip ?? 0 };
		const cls = classify({ length: s?.length ?? 0, boot: s?.boot, control: s?.control, sizes });
		for (const unit of ['wire', 'decoded', 'gzip']) for (const k of ['boot', 'control', 'never', 'total']) startupJs[unit][k] += cls.bytes[unit][k];
		const usedBy = s ? Object.entries(s.perControl).filter(([, m]) => countOnlyIn(m, s.boot) > 0).map(([id]) => id) : [];
		resources.push({
			key: res.key,
			linkPreload: res.linkPreload,
			initiator: res.initiator,
			...sizes,
			evaluated: s ? countSet(s.boot) > 0 || countSet(s.control) > 0 : false,
			evaluatedAtBoot: s ? countSet(s.boot) > 0 : false,
			fractions: cls.fractions,
			neverBytes: { wire: cls.bytes.wire.never, decoded: cls.bytes.decoded.never, gzip: cls.bytes.gzip.never },
			controlOnlyBytes: { decoded: cls.bytes.decoded.control },
			usedByControls: usedBy,
			bySource: (await sourceBreakdown(upstream, res.key, base.texts?.get(res.key), s))?.slice(0, 40) ?? null,
			uncalled: s?.functions ? uncalledFunctions(s.functions, orInto(orInto(new Uint8Array(s.length), s.boot), s.control), 8) : [],
		});
	}
	const bySource = new Map();
	for (const r of resources)
		for (const b of r.bySource ?? []) {
			const agg = bySource.get(b.source) ?? { source: b.source, chars: 0, boot: 0, controlOnly: 0, never: 0, files: [] };
			for (const k of ['chars', 'boot', 'controlOnly', 'never']) agg[k] += b[k];
			agg.files.push(r.key);
			bySource.set(b.source, agg);
		}
	const chunks = { total: resources.length, bootEvaluated: 0, controlOnly: 0, never: 0, neverDecoded: 0, controlOnlyDecoded: 0 };
	for (const r of resources) {
		if (r.evaluatedAtBoot) chunks.bootEvaluated++;
		else if (r.evaluated) {
			chunks.controlOnly++;
			chunks.controlOnlyDecoded += r.decoded;
		} else {
			chunks.never++;
			chunks.neverDecoded += r.decoded;
		}
	}
	const startupKeys = new Set(base.resources.map((r) => r.key));
	const perControl = {};
	for (const c of controls) {
		const runs = controlRuns[c.id];
		const okRuns = runs.filter((r) => r.ok);
		const required = [];
		const newExec = { decoded: 0 };
		const needed = { wire: 0, decoded: 0 };
		for (const s of scripts.values()) {
			const m = s.perControl[c.id];
			const bootHit = countSet(s.boot) > 0;
			const ctlHit = m ? countSet(m) > 0 : false;
			if (bootHit || ctlHit) required.push(s.key);
			const res = base.resources.find((r) => r.key === s.key);
			if (res && s.length && (bootHit || ctlHit)) {
				if (m) newExec.decoded += (res.decoded * countOnlyIn(m, s.boot)) / s.length;
				const share = countSet(m ? orInto(Uint8Array.from(s.boot), m) : s.boot) / s.length;
				needed.wire += res.wire * share;
				needed.decoded += res.decoded * share;
			}
		}
		const after = okRuns[0]?.afterInput ?? [];
		perControl[c.id] = {
			ok: okRuns.length,
			runs: runs.length,
			error: runs.find((r) => !r.ok)?.error ?? null,
			requiredKeys: required,
			requiredStartupJsDecoded: base.resources.filter((r) => r.js && required.includes(r.key)).reduce((a, r) => a + r.decoded, 0),
			newlyExecutedStartupDecoded: newExec.decoded,
			// Startup JS bytes this control (plus boot) executes: what a byte-exact preload of its closure would ship.
			neededStartupJs: needed,
			requiredStartupJsWire: base.resources.filter((r) => r.js && required.includes(r.key)).reduce((a, r) => a + r.wire, 0),
			onDemand: {
				requests: after.length,
				jsRequests: after.filter((r) => r.js && !startupKeys.has(r.key)).length,
				wire: after.reduce((a, r) => a + r.wire, 0),
				jsWire: after.filter((r) => r.js).reduce((a, r) => a + r.wire, 0),
				keys: after.map((r) => `${r.type}:${r.key}`),
			},
		};
	}
	const onDemandJs = new Map();
	for (const runs of Object.values(controlRuns))
		for (const run of runs) for (const r of run.afterInput ?? []) if (r.js && !startupKeys.has(r.key)) onDemandJs.set(r.key, r);
	const onDemand = { scripts: onDemandJs.size, wire: 0, decoded: 0, executedDecoded: 0 };
	for (const r of onDemandJs.values()) {
		onDemand.wire += r.wire;
		onDemand.decoded += r.decoded;
		const s = scripts.get(r.key);
		if (s?.length) onDemand.executedDecoded += (r.decoded * countSet(orInto(orInto(new Uint8Array(s.length), s.boot), s.control))) / s.length;
	}
	return {
		startupRuns: perRun,
		startupRequestsStable: new Set(perRun.map((r) => r.jsRequests)).size === 1,
		settle: good.map((r) => r.settle),
		hints: base.hints,
		startupJs,
		executedBeforeFirstInput: { decoded: startupJs.decoded.boot / startupJs.decoded.total, wire: startupJs.wire.boot / startupJs.wire.total },
		nonJs,
		chunks,
		onDemandAfterInput: onDemand,
		wasteBySource: bySource.size ? [...bySource.values()].sort((a, b) => b.never - a.never).slice(0, 60) : null,
		resources: resources.sort((a, b) => b.neverBytes.decoded - a.neverBytes.decoded),
		perControl,
		errors: [...new Set(good.flatMap((r) => r.errors))],
	};
}

const EARLY = Object.entries(contractCases).filter(([id, c]) => c.phases.includes('early') && !c.correctnessOnly && !/x10/.test(id)).map(([id]) => id);

// The contract's nav case is the same click as M1's synthesized nav session for that link.
function m1ControlId(caseId) {
	const c = contractCases[caseId];
	if (!(c.input.click && /nav-/.test(c.input.click.selector))) return caseId;
	const dest = c.expect.find((p) => p.pathname)?.pathname;
	return `nav:${c.route}->${dest}`;
}

async function withLock(fn) {
	if (!opts.lock) return fn();
	while (!(await fs.promises.mkdir(opts.lock).then(() => true, () => false))) await sleep(30000);
	fs.writeFileSync(path.join(opts.lock, 'owner'), `overpreload ${process.pid} ${new Date().toISOString()}\n`);
	try {
		return await fn();
	} finally {
		fs.rmSync(opts.lock, { recursive: true, force: true });
	}
}

async function m2Visit(t, caseId, required, mode) {
	const c = contractCases[caseId];
	if (t.filter) t.filter.setAllow(mode === 'closure-only' ? (p) => required.has(p) : null);
	const v = await openVisit(browser, { cpu: benchProfiles.constrained.cpu.slowdown });
	const rec = { target: t.name, caseId, mode, ok: false };
	try {
		await v.goto(new URL(c.route, t.shapedUrl).href, 'commit');
		for (const s of c.pre) await v.step(s);
		let m;
		try {
			m = await v.measure(c.input, c.expect);
		} catch (error) {
			if (error.sentAt == null) throw error;
			// A lost input still has a network timeline: when the control's code arrived vs the rest.
			rec.lost = error.message;
			m = { inputEpoch: error.inputEpoch ?? error.sentAt, presentEpoch: null, navOrigin: error.navOrigin ?? error.sentAt };
		}
		await v.settle(500, 20000);
		const nav = m.navOrigin;
		const rows = v.entries.map(resourceRow);
		const js = rows.filter((r) => r.js);
		const req = js.filter((r) => required.has(r.key));
		const reqEnd = req.map((r) => r.endEpoch ?? Infinity);
		const xReady = req.length ? Math.max(...reqEnd) : null;
		const preInput = rows.filter((r) => r.startEpoch < m.inputEpoch);
		const preInputJs = preInput.filter((r) => r.js);
		const endOf = (list) => (list.length ? Math.max(...list.map((r) => r.endEpoch ?? 0)) : null);
		const competing = (limit) => rows.filter((r) => r.js && !required.has(r.key) && r.endEpoch != null && r.endEpoch <= limit);
		const responded = m.presentEpoch != null;
		Object.assign(rec, {
			ok: responded,
			networkOk: true,
			inputMs: m.inputEpoch - nav,
			inputToResponseMs: responded ? m.presentEpoch - m.inputEpoch : null,
			navToResponseMs: responded ? m.presentEpoch - nav : null,
			requiredJsReadyMs: xReady === null ? null : xReady - nav,
			requiredJsAfterInputMs: xReady === null ? null : xReady - m.inputEpoch,
			startupJsDoneMs: endOf(preInputJs) === null ? null : endOf(preInputJs) - nav,
			startupAllDoneMs: endOf(preInput) === null ? null : endOf(preInput) - nav,
			requiredJsWire: req.reduce((a, r) => a + r.wire, 0),
			requiredMissing: [...required].filter((k) => !js.some((r) => r.key === k)).length,
			competingJsWireBeforeRequiredReady: xReady === null ? null : competing(xReady).reduce((a, r) => a + r.wire, 0),
			competingJsWireBeforeResponse: responded ? competing(m.presentEpoch).reduce((a, r) => a + r.wire, 0) : null,
			allWireBeforeResponse: responded ? rows.filter((r) => r.endEpoch != null && r.endEpoch <= m.presentEpoch).reduce((a, r) => a + r.wire, 0) : null,
			startupJsWire: preInputJs.reduce((a, r) => a + r.wire, 0),
			jsRequestsBeforeInput: preInputJs.length,
			errors: v.errors,
		});
	} catch (error) {
		rec.error = String(error.message ?? error).slice(0, 300);
	} finally {
		await v.close();
	}
	return rec;
}

async function m2(m1) {
	const caseIds = opts.m2Cases ?? EARLY;
	const records = [];
	await withLock(async () => {
		for (let visit = 0; visit < opts.visits; visit++)
			for (const caseId of caseIds)
				for (let i = 0; i < targets.length; i++) {
					const t = targets[(i + visit) % targets.length];
					const route = contractCases[caseId].route;
					const ctl = m1?.[t.name]?.[route]?.perControl?.[m1ControlId(caseId)];
					const required = new Set(ctl?.requiredKeys ?? []);
					for (const mode of t.filter ? ['as-built', 'closure-only'] : ['as-built']) {
						const rec = await m2Visit(t, caseId, required, mode);
						rec.visit = visit;
						rec.requiredKnown = !!ctl;
						rec.neededStartupJsWire = ctl?.neededStartupJs?.wire ?? null;
						rec.requiredStartupJsWireM1 = ctl?.requiredStartupJsWire ?? null;
						records.push(rec);
						if (!rec.ok) log(`M2 ${t.name} ${caseId} ${mode} v${visit}: ${rec.lost ?? rec.error}`);
					}
				}
	});
	fs.writeFileSync(path.join(outDir, 'm2-visits.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
	const cells = {};
	for (const r of records) {
		const key = `${r.target}|${r.caseId}|${r.mode}`;
		(cells[key] ??= []).push(r);
	}
	const metrics = ['inputMs', 'inputToResponseMs', 'navToResponseMs', 'requiredJsReadyMs', 'requiredJsAfterInputMs', 'startupJsDoneMs', 'requiredJsWire', 'competingJsWireBeforeRequiredReady', 'competingJsWireBeforeResponse', 'startupJsWire', 'neededStartupJsWire', 'requiredStartupJsWireM1'];
	const summary = [];
	for (const [key, list] of Object.entries(cells)) {
		const [target, caseId, mode] = key.split('|');
		const ok = list.filter((r) => r.ok);
		const withNetwork = list.filter((r) => r.networkOk);
		const row = { target, caseId, mode, visits: list.length, ok: ok.length, lost: list.filter((r) => r.lost).length };
		for (const m of metrics) {
			// Response timings come from answered visits; network timings from every visit that loaded.
			const pool = /Response/.test(m) ? ok : withNetwork;
			const vals = pool.map((r) => r[m]).filter((x) => Number.isFinite(x));
			row[m] = vals.length ? stats(vals).median : null;
		}
		summary.push(row);
	}
	return summary;
}

async function m3Target(t, m1) {
	const out = {};
	for (const dest of ['/records', '/settings']) {
		const reps = [];
		for (let rep = 0; rep < opts.m1Reps; rep++) {
			const v = await openVisit(browser, { coverage: true, bodies: true });
			const r = { ok: false };
			try {
				await v.goto(new URL('/', t.url).href, 'load');
				await v.settle(1000);
				const boot = await v.takeCoverage('boot');
				const hoverAt = Date.now();
				await v.step({ hover: tid(NAV_ID[dest]) });
				await sleep(300);
				await v.settle(300, 5000);
				const clickAt = Date.now();
				await v.measure({ click: tid(NAV_ID[dest]) }, [{ pathname: dest }, { target: tid('page-title'), text: TITLE[dest] }]);
				await v.settle(1000);
				const navCov = await v.takeCoverage('nav');
				await v.finishBodies();
				const masks = new Map();
				const add = (snap, kind) => {
					for (const sc of snap.scripts) {
						const key = keyOf(sc.url);
						const len = scriptLength(sc.functions);
						const m = masks.get(key) ?? { length: len, boot: new Uint8Array(len), nav: new Uint8Array(len) };
						masks.set(key, m);
						if (len <= m.length) orInto(m[kind], executedMask(sc.functions, m.length));
					}
				};
				add(boot, 'boot');
				add(navCov, 'nav');
				const phases = { startup: [], hover: [], click: [] };
				for (const e of v.entries) phases[e.startEpoch < hoverAt ? 'startup' : e.startEpoch < clickAt ? 'hover' : 'click'].push(resourceRow(e));
				const route = m1?.[t.name]?.['/'];
				const phaseOut = {};
				for (const [phase, rows] of Object.entries(phases)) {
					const o = { requests: rows.length, wire: 0, decoded: 0, jsDecoded: 0, jsExecutedOnNavDecoded: 0, jsExecutedAtBootDecoded: 0, jsNeverDecoded: 0, nonJsWire: 0, nonJsByType: {} };
					for (const row of rows) {
						o.wire += row.wire;
						o.decoded += row.decoded;
						if (!row.js) {
							o.nonJsWire += row.wire;
							o.nonJsByType[row.type] = (o.nonJsByType[row.type] ?? 0) + row.wire;
							continue;
						}
						o.jsDecoded += row.decoded;
						const m = masks.get(row.key);
						if (!m?.length) {
							o.jsNeverDecoded += row.decoded;
							continue;
						}
						const bootF = countSet(m.boot) / m.length;
						const navF = countOnlyIn(m.nav, m.boot) / m.length;
						o.jsExecutedAtBootDecoded += row.decoded * bootF;
						o.jsExecutedOnNavDecoded += row.decoded * navF;
						o.jsNeverDecoded += row.decoded * Math.max(0, 1 - bootF - navF);
					}
					phaseOut[phase] = o;
				}
				Object.assign(r, { ok: true, phases: phaseOut, startupUsedOnlyByOtherControls: route ? route.startupJs.decoded.control : null });
			} catch (error) {
				r.error = String(error.message ?? error).slice(0, 300);
			} finally {
				r.errors = v.errors;
				await v.close();
			}
			reps.push(r);
		}
		out[dest] = reps;
		const p = reps.find((x) => x.ok)?.phases;
		if (p) log(`M3 ${t.name} / -> ${dest}: hover ${kb(p.hover.wire)} wire, click ${kb(p.click.wire)} wire; startup JS first run on nav ${kb(p.startup.jsExecutedOnNavDecoded)} decoded`);
	}
	return out;
}

const run = { startedAt: new Date().toISOString(), browser: browser.version(), playwright: playwrightVersion, options: opts, targets: targets.map(({ filter: _filter, serve, ...t }) => ({ ...t, serve: { command: serve.command, args: serve.args, port: serve.port } })) };
let m1 = null;
try {
	if (opts.measures.includes('m1') || opts.measures.includes('m2') || opts.measures.includes('m3')) {
		const m1File = path.join(outDir, 'm1.json');
		if (!opts.measures.includes('m1') && fs.existsSync(m1File)) m1 = JSON.parse(fs.readFileSync(m1File, 'utf8'));
		else {
			m1 = {};
			for (const t of targets) m1[t.name] = await m1Target(t);
			fs.writeFileSync(m1File, JSON.stringify(m1, null, 1));
		}
	}
	if (opts.measures.includes('m3')) {
		const m3 = {};
		for (const t of targets) m3[t.name] = await m3Target(t, m1);
		fs.writeFileSync(path.join(outDir, 'm3.json'), JSON.stringify(m3, null, 1));
	}
	if (opts.measures.includes('m2')) {
		const summary = await m2(m1);
		fs.writeFileSync(path.join(outDir, 'm2-summary.json'), JSON.stringify(summary, null, 1));
		run.hintFilter = Object.fromEntries(targets.filter((t) => t.filter).map((t) => [t.name, { ...t.filter.stats, removedPaths: t.filter.stats.removedPaths.slice(0, 40) }]));
	}
	run.finishedAt = new Date().toISOString();
	fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(run, null, 1));
	log(`wrote ${outDir}`);
} finally {
	await browser.close().catch(() => {});
	await shutdown();
}
