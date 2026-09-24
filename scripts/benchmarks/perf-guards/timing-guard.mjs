#!/usr/bin/env node
// Optional, non-blocking timing check (nightly/manual): the benchmark app built from this tree against a
// saved baseline build, paired and alternating on the constrained profile. Not part of `pnpm test`.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectCases } from '../../../demos/interaction-benchmark/runner/cases.mjs';
import { parseArgs } from '../../../demos/interaction-benchmark/runner/lib/args.mjs';
import { runVisit } from '../../../demos/interaction-benchmark/runner/lib/measure.mjs';
import { selectProfiles } from '../../../demos/interaction-benchmark/runner/lib/profiles.mjs';
import {
	launch,
	playwrightVersion,
	prepareTargets,
} from '../../../demos/interaction-benchmark/runner/lib/session.mjs';
import { summarize } from '../../../demos/interaction-benchmark/runner/lib/summary.mjs';
import { BENCH_APP_DIR } from './config.mjs';
import { buildSite } from './measure.mjs';

const KEY_CASES = [
	'overview-counter-first',
	'overview-toggle',
	'overview-tab',
	'records-search',
	'records-dialog-open',
	'settings-derived',
	'nav-overview-to-records',
];
const USAGE = `usage:
  pnpm bench:interaction:guard --save-baseline [--no-build]      build this tree and keep it as the baseline
  pnpm bench:interaction:guard [--no-build] [--visits 10] [--cases a,b] [--lock <dir>] [--out <dir>]
options: --baseline <dir> (default ${join(tmpdir(), 'markless-interaction-guard')}), --ratio 0.25, --min-ms 30,
  --ports 4221,4222,4223,4224 (current server, baseline server, current proxy, baseline proxy)`;

function parse(argv) {
	const o = {
		save: false,
		build: true,
		visits: 10,
		cases: KEY_CASES,
		lock: null,
		out: null,
		baseline: join(tmpdir(), 'markless-interaction-guard'),
		ratio: 0.25,
		minMs: 30,
		ports: [4221, 4222, 4223, 4224],
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const v = () => argv[++i];
		if (a === '--save-baseline') o.save = true;
		else if (a === '--no-build') o.build = false;
		else if (a === '--visits') o.visits = Number(v());
		else if (a === '--cases') o.cases = v().split(',');
		else if (a === '--lock') o.lock = v();
		else if (a === '--out') o.out = resolve(v());
		else if (a === '--baseline') o.baseline = resolve(v());
		else if (a === '--ratio') o.ratio = Number(v());
		else if (a === '--min-ms') o.minMs = Number(v());
		else if (a === '--ports') o.ports = v().split(',').map(Number);
		else if (a === '--help' || a === '-h') {
			console.log(USAGE);
			process.exit(0);
		} else throw new Error(`unknown argument ${a}\n${USAGE}`);
	}
	return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (message) => console.error(`[timing-guard] ${message}`);

async function acquire(lock) {
	if (!lock) return () => {};
	while (true) {
		try {
			mkdirSync(lock);
			writeFileSync(
				join(lock, 'owner'),
				`timing-guard ${process.pid} ${new Date().toISOString()}\n`,
			);
			return () => rmSync(lock, { recursive: true, force: true });
		} catch {
			log(`waiting for ${lock}`);
			await sleep(30000);
		}
	}
}

function target(variant, dir, port, proxyPort) {
	return {
		name: `markless-${variant}`,
		entrant: 'markless',
		appDir: dir,
		variant,
		renderMode: 'ssr',
		sourceRevision: variant,
		versions: {},
		serve: { command: 'node', args: ['.output/server/index.mjs'], port, cwd: dir },
		upstream: `http://127.0.0.1:${port}`,
		proxyPort,
		transport: 'proxy',
		host: 'controlled',
	};
}

export function compareCells(cells, { ratio, minMs }) {
	const rows = [];
	const byKey = new Map(cells.map((c) => [`${c.variant}|${c.caseId}|${c.phase}`, c]));
	for (const current of cells.filter((c) => c.variant === 'current')) {
		const base = byKey.get(`baseline|${current.caseId}|${current.phase}`);
		if (!base) continue;
		const b = base.metrics.inputToResponseMs?.median;
		const c = current.metrics.inputToResponseMs?.median;
		const slower = b !== undefined && c !== undefined && c > b * (1 + ratio) && c - b > minMs;
		const lostVisits = current.successes < base.successes;
		rows.push({
			caseId: current.caseId,
			phase: current.phase,
			baselineMs: b ?? null,
			currentMs: c ?? null,
			baselineOk: `${base.successes}/${base.visits}`,
			currentOk: `${current.successes}/${current.visits}`,
			regression: slower || lostVisits,
			why: slower
				? `median ${c.toFixed(1)} ms vs baseline ${b.toFixed(1)} ms (+${(c - b).toFixed(1)} ms, budget +${(ratio * 100).toFixed(0)}% and +${minMs} ms)`
				: lostVisits
					? `successful visits ${current.successes}/${current.visits} vs baseline ${base.successes}/${base.visits}`
					: '',
		});
	}
	return rows;
}

async function main() {
	const o = parse(process.argv.slice(2));
	const baselineOutput = join(o.baseline, '.output');
	if (o.save) {
		if (o.build) await buildSite('bench', log);
		rmSync(o.baseline, { recursive: true, force: true });
		mkdirSync(o.baseline, { recursive: true });
		cpSync(join(BENCH_APP_DIR, '.output'), baselineOutput, { recursive: true });
		writeFileSync(
			join(o.baseline, 'saved.json'),
			JSON.stringify({ savedAt: new Date().toISOString() }),
		);
		log(`baseline saved to ${o.baseline}`);
		return 0;
	}
	if (!existsSync(baselineOutput))
		throw new Error(
			`no baseline at ${o.baseline}; save one first: pnpm bench:interaction:guard --save-baseline`,
		);
	if (o.build) await buildSite('bench', log);
	const currentDir = mkdtempSync(join(tmpdir(), 'markless-interaction-current-'));
	cpSync(join(BENCH_APP_DIR, '.output'), join(currentDir, '.output'), { recursive: true });

	const [currentPort, baselinePort, currentProxy, baselineProxy] = o.ports;
	const targets = [
		target('current', currentDir, currentPort, currentProxy),
		target('baseline', o.baseline, baselinePort, baselineProxy),
	];
	const profiles = selectProfiles(['constrained']);
	const cases = selectCases(o.cases);
	const runnerOpts = parseArgs([], {
		visits: o.visits,
		warmup: 0,
		actionTimeoutMs: 10000,
		navTimeoutMs: 60000,
		settleTimeoutMs: 30000,
		drainTimeoutMs: 15000,
		transport: 'proxy',
	});
	const cleanup = await prepareTargets(targets, log, { profiles });
	const results = [];
	let release = () => {};
	try {
		const notReady = targets.filter((t) => !t.ready);
		if (notReady.length)
			throw new Error(
				`targets not ready: ${notReady.map((t) => `${t.name}: ${t.setupError}`).join('; ')}`,
			);
		release = await acquire(o.lock);
		const browser = await launch('chromium');
		const runId = `timing-guard-${Date.now()}`;
		let order = 0;
		try {
			for (const profile of profiles)
				for (const caseDef of cases)
					for (const phase of caseDef.phases)
						for (let visit = 0; visit < o.visits; visit++)
							for (const t of visit % 2 ? [...targets].reverse() : targets) {
								const { result } = await runVisit({
									browser,
									browserName: 'chromium',
									playwrightVersion,
									target: t,
									caseDef,
									phase,
									profile,
									visitIndex: visit,
									order: order++,
									runId,
									opts: runnerOpts,
								});
								results.push(result);
							}
		} finally {
			await browser.close();
		}
	} finally {
		release();
		await cleanup();
		rmSync(currentDir, { recursive: true, force: true });
	}
	const rows = compareCells(summarize(results), o);
	if (o.out) {
		mkdirSync(o.out, { recursive: true });
		writeFileSync(join(o.out, 'results.json'), JSON.stringify({ rows, results }, null, 1));
	}
	for (const r of rows)
		console.log(
			`${r.regression ? 'SLOWER' : 'ok    '} ${r.caseId} [${r.phase}] baseline ${r.baselineMs?.toFixed(1) ?? '-'} ms (${r.baselineOk}) current ${r.currentMs?.toFixed(1) ?? '-'} ms (${r.currentOk})${r.why ? ` - ${r.why}` : ''}`,
		);
	const regressions = rows.filter((r) => r.regression);
	console.log(
		regressions.length
			? `${regressions.length} case(s) slower than the baseline.`
			: 'No case is meaningfully slower than the baseline.',
	);
	return regressions.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().then(
		(code) => process.exit(code),
		(error) => {
			console.error(error.message ?? error);
			process.exit(1);
		},
	);
}
