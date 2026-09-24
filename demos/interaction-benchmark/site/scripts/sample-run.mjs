#!/usr/bin/env node
// Produces a SAMPLE run: the real runner against its plain-JS selftest fixture, never against a framework.
// Usage: node demos/interaction-benchmark/site/scripts/sample-run.mjs [--out <dir>] [--visits N]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixture } from '../../runner/selftest/server.mjs';

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runnerDir = path.join(siteDir, '..', 'runner');
const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : fallback;
};
const out = path.resolve(arg('--out', path.join(siteDir, 'sample-runs', 'selftest-fixture')));
const visits = arg('--visits', '5');
const FIXTURE_PORT = 4495;
const PROXY_PORT = 4496;
const CASES = 'overview-counter-first,overview-counter-repeat-x10,overview-toggle,overview-filter,records-select,nav-overview-to-records,history-back,settings-derived,settings-submit';

fs.rmSync(out, { recursive: true, force: true });
const fixture = await startFixture({ port: FIXTURE_PORT });
let code;
try {
	const args = [
		path.join(runnerDir, 'run.mjs'),
		'--targets', 'markless',
		'--target-upstream', `markless=http://127.0.0.1:${FIXTURE_PORT}`,
		'--proxy-port', `markless=${PROXY_PORT}`,
		'--variant', 'markless=selftest-fixture',
		'--source-revision', 'markless=selftest-fixture',
		'--cases', CASES,
		'--visits', visits,
		'--profiles', 'normal,constrained',
		'--browsers', 'chromium,webkit',
		'--out', out,
	];
	code = await new Promise((resolve) => {
		const child = spawn(process.execPath, args, { stdio: 'inherit' });
		child.on('exit', resolve);
	});
} finally {
	await fixture.close();
}
fs.writeFileSync(
	path.join(out, 'SAMPLE.json'),
	JSON.stringify(
		{
			sample: true,
			label: 'SAMPLE: runner selftest fixture',
			note: 'Produced by site/scripts/sample-run.mjs: the benchmark runner measuring its own plain-JS selftest fixture (runner/selftest/fixture.html). The records carry entrant "markless" only because the schema requires an entrant name. These are NOT Markless results and NOT results for any framework. They exist to exercise the site layout.',
		},
		null,
		2,
	) + '\n',
);
console.log(`sample run written to ${out} (runner exit ${code})`);
process.exit(code ?? 1);
