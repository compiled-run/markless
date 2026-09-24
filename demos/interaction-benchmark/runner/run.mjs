#!/usr/bin/env node
// Timing runner: see README.md. Writes results.jsonl (schema records), raw.jsonl, summary.{json,md}, run.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_VERSION, measuredCaseIds, selectCases } from './cases.mjs';
import { parseArgs } from './lib/args.mjs';
import { runCorrectness } from './lib/correctness-core.mjs';
import { labels, runVisit, SCHEMA_VERSION, VIEWPORT } from './lib/measure.mjs';
import { appliedProfile, selectProfiles } from './lib/profiles.mjs';
import { launch, playwrightVersion, prepareTargets } from './lib/session.mjs';
import { markdown, summarize } from './lib/summary.mjs';
import { loadSchema, validate } from './lib/validate.mjs';
import { resolveTargets, targets as registry } from './targets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, '../shared/result.schema.json');

const opts = parseArgs(process.argv.slice(2), {
	visits: 30,
	warmup: 0,
	targets: Object.keys(registry),
	cases: measuredCaseIds,
	phases: ['early', 'settled'],
	profiles: ['normal', 'constrained'],
	browsers: ['chromium', 'webkit'],
	out: null,
	actionTimeoutMs: 10000,
	navTimeoutMs: 60000,
	settleTimeoutMs: 30000,
	drainTimeoutMs: 15000,
	transport: 'proxy',
});
if (opts.help) {
	console.log(fs.readFileSync(path.join(here, 'README.md'), 'utf8'));
	process.exit(0);
}
const bad = opts.cases.filter((id) => !measuredCaseIds.includes(id));
if (bad.length) throw new Error(`not timed cases (correctness only or unknown): ${bad.join(', ')}; use correctness.mjs`);

const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
const outDir = path.resolve(opts.out ?? path.join(here, 'results', runId));
fs.mkdirSync(outDir, { recursive: true });
const resultsFile = path.join(outDir, 'results.jsonl');
const rawFile = path.join(outDir, 'raw.jsonl');
fs.writeFileSync(resultsFile, '');
fs.writeFileSync(rawFile, '');
const log = (msg) => console.error(`[runner] ${msg}`);

const cases = selectCases(opts.cases);
const profiles = selectProfiles(opts.profiles);
const targets = resolveTargets(opts.targets, opts);
const schema = loadSchema(schemaPath);
if (!schema) log(`schema ${schemaPath} not found: records are written unvalidated`);
const validation = { schema: schema ? path.relative(process.cwd(), schemaPath) : null, checked: 0, invalid: 0, examples: [] };
const results = [];
const started = new Date().toISOString();
const browserVersions = {};
let correctness = null;

const cleanup = await prepareTargets(targets, log, { profiles, shapedProxyPorts: opts.shapedProxyPorts });
const emit = (result, raw) => {
	if (schema) {
		const errors = validate(schema, result);
		validation.checked++;
		if (errors.length) {
			validation.invalid++;
			if (validation.examples.length < 10) validation.examples.push({ order: result.order, errors: errors.slice(0, 5) });
			raw.schemaErrors = errors;
		}
	}
	results.push(result);
	fs.appendFileSync(resultsFile, JSON.stringify(result) + '\n');
	fs.appendFileSync(rawFile, JSON.stringify(raw) + '\n');
};
// A cell that cannot run still produces a record, so it is visible in the summary.
const stubRecord = (target, caseDef, phase, profile, browserName, browser, order, kind, message) => {
	const applied = appliedProfile(profile, browserName, opts.networkShaping);
	return {
	schemaVersion: SCHEMA_VERSION,
	runId,
	framework: { entrant: target.entrant, variant: target.variant, renderMode: target.renderMode, versions: target.versions },
	build: { id: target.buildId ?? 'missing', sourceRevision: target.sourceRevision },
	deployment: { url: new URL(caseDef.route, target.url ?? 'http://unavailable.invalid').href, host: target.host, region: null, cacheState: 'cold-browser', responseEvidence: null },
	browser: { name: browserName, version: browser.version(), playwright: playwrightVersion, viewport: VIEWPORT },
	profile: { network: applied.network, cpu: applied.cpu },
	caseId: caseDef.id,
	phase,
	visitIndex: 0,
	order,
	timings: { navToResponseMs: null, inputToResponseMs: null, inputToDomMs: null, eventDurationMs: null, fcp: null, lcp: null, longTasks: { count: null, totalMs: null } },
	bytes: { compressedJs: 0, decodedJs: 0, html: { compressed: 0, decoded: 0 } },
	requests: { initial: 0, perAction: 0 },
	failure: { kind, message },
	timestamp: new Date().toISOString(),
	};
};

try {
	const failedCorrectness = new Map();
	if (!opts.skipCorrectness) {
		log('correctness pre-pass (Chromium, normal profile, every selected case and phase once per target)');
		const browser = await launch('chromium', opts);
		try {
			correctness = await runCorrectness({ browser, targets, cases, phases: opts.phases, runId, opts, playwrightVersion, log });
		} finally {
			await browser.close();
		}
		for (const o of correctness.filter((o) => !o.pass)) failedCorrectness.set(`${o.target}|${o.caseId}`, o.failure);
		fs.writeFileSync(path.join(outDir, 'correctness.json'), JSON.stringify(correctness, null, 2));
	}

	let order = 0;
	for (const browserName of opts.browsers) {
		const browser = await launch(browserName, opts);
		browserVersions[browserName] = browser.version();
		try {
			for (const profile of profiles)
				for (const caseDef of cases)
					for (const phase of caseDef.phases.filter((p) => opts.phases.includes(p))) {
						const blocked = new Set();
						for (let v = 0; v < opts.warmup + opts.visits; v++) {
							const warmup = v < opts.warmup;
							const visitIndex = v - opts.warmup;
							const shift = v % targets.length;
							for (const target of [...targets.slice(shift), ...targets.slice(0, shift)]) {
								const failed = failedCorrectness.get(`${target.name}|${caseDef.id}`);
								const reason = !target.ready ? ['navigation-error', `target not ready: ${target.setupError}`] : failed ? [failed.kind, `failed the correctness pre-pass, not timed: ${failed.message}`] : null;
								if (reason) {
									if (!blocked.has(target.name) && !warmup) {
										blocked.add(target.name);
										emit(stubRecord(target, caseDef, phase, profile, browserName, browser, order++, ...reason), { runId, target: target.name, caseId: caseDef.id, phase, stub: true });
									}
									continue;
								}
								const { result, raw } = await runVisit({ browser, browserName, playwrightVersion, target, caseDef, phase, profile, visitIndex: Math.max(visitIndex, 0), order, runId, opts });
								if (result.failure?.kind === 'unsupported') {
									if (!blocked.has(target.name)) {
										blocked.add(target.name);
										emit(result, raw);
										order++;
									}
									continue;
								}
								if (warmup) {
									fs.appendFileSync(rawFile, JSON.stringify({ ...raw, warmup: true, result }) + '\n');
									continue;
								}
								emit(result, raw);
								order++;
								log(`${browserName} ${profile.name} ${caseDef.id} [${phase}] #${visitIndex} ${target.name}: ${result.failure ? `FAIL ${result.failure.kind}` : `${result.timings.inputToResponseMs.toFixed(1)} ms`}`);
							}
						}
					}
		} finally {
			await browser.close();
		}
	}
} finally {
	await cleanup();
}

const summary = summarize(results);
const meta = {
	runId,
	contractVersion: CONTRACT_VERSION,
	schemaVersion: SCHEMA_VERSION,
	started,
	finished: new Date().toISOString(),
	playwright: playwrightVersion,
	browserVersions,
	config: { visits: opts.visits, warmup: opts.warmup, cases: opts.cases, phases: opts.phases, networkShaping: opts.networkShaping, profiles: profiles.map((p) => ({ name: p.name, network: p.network, cpu: p.cpu, applied: Object.fromEntries(opts.browsers.map((b) => [b, appliedProfile(p, b, opts.networkShaping)])) })), browsers: opts.browsers, actionTimeoutMs: opts.actionTimeoutMs, settleTimeoutMs: opts.settleTimeoutMs, order: 'targets rotate by one position per visit index' },
	targets: targets.map((t) => ({ name: t.name, url: t.url, upstream: t.upstream ?? null, host: t.host, transport: t.transport, proxyProtocol: t.proxyProtocol ?? null, proxyCompression: t.proxyCompression ?? null, proxyStats: t.proxyStats ?? null, shapedUrls: t.shapedUrls ?? null, proxyShaping: t.proxyShaping ?? null, buildId: t.buildId ?? null, sourceRevision: t.sourceRevision, versions: t.versions, ready: t.ready, setupError: t.setupError ?? null })),
	labels,
	validation,
	correctness: correctness ? { passed: correctness.filter((o) => o.pass).length, failed: correctness.filter((o) => !o.pass).length } : 'skipped',
};
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ ...meta, cells: summary }, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.md'), markdown(summary, meta));
log(`wrote ${results.length} records to ${outDir} (schema: ${schema ? `${validation.invalid} invalid of ${validation.checked}` : 'not validated'})`);
if (validation.invalid) process.exitCode = 1;
