#!/usr/bin/env node
// Correctness-only suite: every case (measured and correctness-only) once per target and phase in Chromium. No timing claims.
import fs from 'node:fs';
import path from 'node:path';
import { cases as allCases, selectCases } from './cases.mjs';
import { parseArgs } from './lib/args.mjs';
import { runCorrectness } from './lib/correctness-core.mjs';
import { launch, playwrightVersion, prepareTargets } from './lib/session.mjs';
import { resolveTargets, targets as registry } from './targets.mjs';

const opts = parseArgs(process.argv.slice(2), {
	targets: Object.keys(registry),
	cases: Object.keys(allCases),
	phases: ['early', 'settled'],
	out: null,
	actionTimeoutMs: 10000,
	navTimeoutMs: 60000,
	settleTimeoutMs: 30000,
	drainTimeoutMs: 15000,
	transport: 'proxy',
});
const targets = resolveTargets(opts.targets, opts);
const runId = `correctness-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const cleanup = await prepareTargets(targets, (m) => console.error(`[correctness] ${m}`));
let outcomes = [];
try {
	const browser = await launch('chromium', opts);
	try {
		outcomes = await runCorrectness({ browser, targets, cases: selectCases(opts.cases), phases: opts.phases, runId, opts, playwrightVersion, log: (m) => console.log(m) });
	} finally {
		await browser.close();
	}
} finally {
	await cleanup();
}
const failed = outcomes.filter((o) => !o.pass);
console.log(`\n${outcomes.length - failed.length} passed, ${failed.length} failed (${targets.length} targets)`);
for (const o of outcomes.filter((o) => o.documentRequestsDuringAction > 0 && /^nav-|history-/.test(o.caseId)))
	console.log(`note: ${o.target} ${o.caseId} [${o.phase}] loaded a new document (no client-side navigation in this configuration)`);
if (opts.out) {
	fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
	fs.writeFileSync(path.resolve(opts.out), JSON.stringify({ runId, outcomes }, null, 2));
}
process.exit(failed.length ? 1 : 0);
