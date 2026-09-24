#!/usr/bin/env node
// Runner selftest against a plain-JS fixture on 4490 (proxied on 4491, shaped listener on 4494), a deliberately broken copy on 4492 (proxied on 4493),
// a copy that ignores early counter clicks on 4484 (proxied on 4485), and two concurrent runs on overridden proxy ports 4481/4482 and 4486/4487.
// The fixture declares entrant "markless" only so records pass the schema's entrant enum; outputs go to a temp dir.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProxy } from '../proxy.mjs';
import { profiles } from '../lib/profiles.mjs';
import { startFixture } from './server.mjs';
import { expectations, measureBrowser, measureNode } from './shaping.mjs';

const runnerDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-runner-selftest-'));
const CASES = 'overview-counter-first,overview-counter-repeat-x10,overview-toggle,overview-filter,records-select,nav-overview-to-records,history-back,settings-derived,settings-submit,settings-submit-error';
const target = ['--targets', 'markless', '--target-upstream', 'markless=http://127.0.0.1:4490', '--proxy-port', 'markless=4491', '--shaped-proxy-port', 'markless=4494'];
const broken = ['--targets', 'markless', '--target-upstream', 'markless=http://127.0.0.1:4492', '--proxy-port', 'markless=4493'];

const run = (script, args) =>
	new Promise((resolve) => {
		console.log(`\n$ node ${script} ${args.join(' ')}`);
		const child = spawn(process.execPath, [path.join(runnerDir, script), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		child.stdout.on('data', (d) => {
			stdout += d;
			process.stdout.write(d);
		});
		child.stderr.on('data', (d) => process.stderr.write(d));
		child.on('exit', (code) => resolve({ code, stdout }));
	});
const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const checks = [];
const check = (name, ok, detail = '') => {
	checks.push({ name, ok });
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const good = await startFixture({ port: 4490 });
const bad = await startFixture({ port: 4492, step: 2 });
const deaf = await startFixture({ port: 4484, ignoreClicksMs: 60000 });
try {
	const network = profiles.constrained.network;
	const expected = expectations(network);
	const within = (name, actual, want) => check(`shaping: ${name} within 15% of model`, Math.abs(actual - want) <= 0.15 * want, `${actual.toFixed(1)} ms vs ${want.toFixed(1)} ms model, ${(((actual - want) / want) * 100).toFixed(1)}%`);
	const shapingProxy = await startProxy({ upstream: 'http://127.0.0.1:4490', port: 4491, shaped: [{ name: 'constrained', port: 4494, network }] });
	try {
		const node = await measureNode(shapingProxy.shapedUrls.constrained);
		within('node TLS handshake (2 RTT: TCP + TLS 1.3)', node.handshakeMs, expected.handshakeMs);
		within('node cold tiny request (handshake + 1 RTT)', node.coldTinyMs, expected.coldTinyMs);
		within('node warm tiny request (1 RTT)', node.tinyMs, expected.tinyMs);
		within(`node ${node.assetBytes}-byte incompressible asset (RTT + size/5 Mbps)`, node.assetMs, expected.assetMs);
		within('node 32 KiB upload (RTT + size/1 Mbps)', node.uploadMs, expected.uploadMs);
		for (const browserName of ['chromium', 'webkit']) {
			const b = await measureBrowser(browserName, shapingProxy.shapedUrls.constrained);
			within(`${browserName} asset fetch over ${b.protocol}`, b.assetMs, expected.assetMs);
			within(`${browserName} warm tiny fetch`, b.tinyMs, expected.tinyMs);
		}
	} finally {
		await shapingProxy.close();
	}

	const correct = await run('correctness.mjs', [...target, '--cases', CASES, '--out', path.join(out, 'correctness.json')]);
	check('correctness passes on the fixture', correct.code === 0, `exit ${correct.code}`);

	const wrong = await run('correctness.mjs', [...broken, '--cases', 'overview-counter-first,overview-counter-repeat-x10', '--phases', 'settled']);
	check('correctness fails on the broken fixture', wrong.code === 1 && /wrong-response/.test(wrong.stdout), `exit ${wrong.code}`);

	const chromiumDir = path.join(out, 'chromium');
	const chromium = await run('run.mjs', [...target, '--cases', CASES, '--visits', '3', '--profiles', 'normal,constrained', '--browsers', 'chromium', '--out', chromiumDir]);
	check('chromium timing run exits 0', chromium.code === 0, `exit ${chromium.code}`);
	const cr = readJsonl(path.join(chromiumDir, 'results.jsonl'));
	const crFailed = cr.filter((r) => r.failure);
	check('chromium: every sample succeeded', crFailed.length === 0, `${cr.length} records, ${crFailed.length} failures ${crFailed.slice(0, 3).map((r) => `${r.caseId}/${r.phase}: ${r.failure.kind} ${r.failure.message}`).join(' | ')}`);
	check('chromium: record count = cells x 3 visits x 2 profiles', cr.length === 3 * 2 * cr.reduce((s, r) => s.add(`${r.caseId}|${r.phase}`), new Set()).size, `${cr.length} records`);
	const run1 = JSON.parse(fs.readFileSync(path.join(chromiumDir, 'run.json'), 'utf8'));
	check('chromium: schema validation clean', run1.validation.checked === cr.length && run1.validation.invalid === 0, JSON.stringify(run1.validation.examples[0] ?? ''));
	check('chromium: proxy served brotli', cr.every((r) => r.deployment.responseEvidence?.contentEncoding === 'br'), run1.targets[0].proxyProtocol);
	const crConstrained = cr.filter((r) => r.profile.cpu.slowdown === 4);
	check('chromium constrained: CPU 4x via CDP, network shaped by the proxy', crConstrained.length > 0 && crConstrained.every((r) => r.profile.network.name.endsWith('@proxy') && /network shaped by proxy/.test(r.deployment.responseEvidence?.transport)), crConstrained[0]?.profile.network.name);
	const constrained = cr.filter((r) => r.profile.cpu.slowdown === 4 && r.caseId === 'overview-counter-first' && r.phase === 'early');
	const normal = cr.filter((r) => r.profile.cpu.slowdown === 1 && r.caseId === 'overview-counter-first' && r.phase === 'early');
	const med = (a) => a.map((r) => r.timings.navToResponseMs).sort((x, y) => x - y)[Math.floor(a.length / 2)];
	check('chromium: constrained early navToResponse slower than normal', med(constrained) > med(normal), `${med(normal)?.toFixed(1)} vs ${med(constrained)?.toFixed(1)} ms`);
	const settings = cr.find((r) => r.caseId === 'settings-submit');
	check('chromium: settings-submit has pendingMs and serverMs >= 300', settings?.timings.pendingMs > 0 && settings?.timings.serverMs >= 300, `pending ${settings?.timings.pendingMs?.toFixed(1)} server ${settings?.timings.serverMs?.toFixed(1)}`);
	const early = cr.find((r) => r.caseId === 'overview-counter-first' && r.phase === 'early' && r.profile.cpu.slowdown === 4);
	const raw = readJsonl(path.join(chromiumDir, 'raw.jsonl')).find((x) => x.order === early?.order);
	check('chromium: early input issued while the slow script was pending', raw?.measured?.pendingRequestsAtInput > 0, `pending at input ${raw?.measured?.pendingRequestsAtInput}`);
	check('chromium: preload hints counted from HTML and Link header', raw?.preloadHints?.html?.modulepreload === 1 && raw?.preloadHints?.header?.modulepreload === 1, JSON.stringify(raw?.preloadHints));
	const errorCase = readJsonl(path.join(chromiumDir, 'raw.jsonl')).find((x) => x.caseId === 'settings-submit-error');
	check('chromium: settings-submit-error passes with the expected 422 console message set aside', cr.filter((r) => r.caseId === 'settings-submit-error').every((r) => r.failure === null) && errorCase?.expectedResourceErrors?.length > 0 && errorCase?.consoleErrors?.length === 0, JSON.stringify(errorCase?.expectedResourceErrors?.[0] ?? null));
	const nav = cr.find((r) => r.caseId === 'nav-overview-to-records');
	check('chromium: client navigation made no document request', nav?.requests.perActionDocument === 0);

	const webkitDir = path.join(out, 'webkit');
	const webkit = await run('run.mjs', [...target, '--cases', CASES, '--visits', '1', '--profiles', 'normal,constrained', '--browsers', 'webkit', '--out', webkitDir, '--skip-correctness']);
	check('webkit timing run exits 0', webkit.code === 0, `exit ${webkit.code}`);
	const wk = readJsonl(path.join(webkitDir, 'results.jsonl'));
	const wkNormal = wk.filter((r) => r.profile.network.latencyMs === null);
	const wkConstrained = wk.filter((r) => r.profile.network.latencyMs !== null);
	const failed = (rs) => rs.filter((r) => r.failure).map((r) => `${r.caseId}/${r.phase}: ${r.failure.kind} ${r.failure.message}`).join(' | ');
	check('webkit normal: every sample succeeded', wkNormal.length > 0 && wkNormal.every((r) => r.failure === null), failed(wkNormal));
	check('webkit constrained: every sample succeeded', wkConstrained.length === wkNormal.length && wkConstrained.every((r) => r.failure === null), `${wkConstrained.length} records ${failed(wkConstrained)}`);
	check('webkit constrained: proxy-shaped network, CPU labeled unthrottled', wkConstrained.every((r) => r.profile.network.name.endsWith('@proxy') && r.profile.cpu.slowdown === 1 && r.profile.cpu.name === 'unthrottled-no-cdp'), JSON.stringify(wkConstrained[0]?.profile));
	const wkRaw = readJsonl(path.join(webkitDir, 'raw.jsonl')).find((x) => x.profile === 'constrained');
	check('webkit constrained: raw record carries the CPU reason', /no CDP/.test(wkRaw?.profileApplied?.cpuNotApplied?.reason ?? ''), wkRaw?.profileApplied?.cpuNotApplied?.reason);
	const wkNav = (rs) => rs.find((r) => r.caseId === 'overview-counter-first' && r.phase === 'early')?.timings.navToResponseMs;
	check('webkit: constrained early navToResponse slower than normal by at least 2 RTT', wkNav(wkConstrained) - wkNav(wkNormal) >= 2 * network.latencyMs, `${wkNav(wkNormal)?.toFixed(1)} vs ${wkNav(wkConstrained)?.toFixed(1)} ms`);

	const cdpDir = path.join(out, 'chromium-cdp');
	const cdpRun = await run('run.mjs', [...target, '--cases', 'overview-counter-first', '--phases', 'early', '--visits', '1', '--profiles', 'constrained', '--browsers', 'chromium', '--network-shaping', 'cdp', '--out', cdpDir, '--skip-correctness']);
	const cdpRecords = readJsonl(path.join(cdpDir, 'results.jsonl'));
	check('chromium --network-shaping cdp: runs and is labeled', cdpRun.code === 0 && cdpRecords.length === 1 && cdpRecords[0].failure === null && cdpRecords[0].profile.network.name.endsWith('@cdp'), cdpRecords[0]?.profile.network.name);
	check('webkit: schema validation clean', JSON.parse(fs.readFileSync(path.join(webkitDir, 'run.json'), 'utf8')).validation.invalid === 0);

	const lostDir = path.join(out, 'input-lost');
	const lostRun = await run('run.mjs', ['--targets', 'markless', '--target-upstream', 'markless=http://127.0.0.1:4484', '--proxy-port', 'markless=4485', '--cases', 'overview-counter-first', '--phases', 'early', '--visits', '1', '--profiles', 'normal', '--browsers', 'chromium', '--action-timeout', '3000', '--skip-correctness', '--out', lostDir]);
	const lost = readJsonl(path.join(lostDir, 'results.jsonl'));
	check('input ignored by the page: failure kind input-lost', lostRun.code === 0 && lost.length === 1 && lost[0].failure?.kind === 'input-lost', `exit ${lostRun.code} ${lost[0]?.failure?.kind}: ${lost[0]?.failure?.message}`);
	const lostRaw = readJsonl(path.join(lostDir, 'raw.jsonl'))[0]?.inputLost;
	const slow = lostRaw?.scripts?.find((sc) => sc.url.endsWith('/slow.js'));
	check('input-lost raw evidence: input time, FCP and script arrival times', lostRaw?.inputMs > 0 && lostRaw?.fcpMs > 0 && slow?.responseEndMs > 0 && lostRaw.inputMs >= lostRaw.fcpMs, JSON.stringify({ inputMs: lostRaw?.inputMs, fcpMs: lostRaw?.fcpMs, slowJs: slow?.responseEndMs }));

	const concurrent = (proxy, shaped, dir) => run('run.mjs', ['--targets', 'markless', '--target-upstream', 'markless=http://127.0.0.1:4490', '--proxy-port', `markless=${proxy}`, '--shaped-proxy-port', `markless=${shaped}`, '--cases', 'overview-counter-first', '--phases', 'early', '--visits', '2', '--profiles', 'constrained', '--browsers', 'chromium', '--skip-correctness', '--out', path.join(out, dir)]);
	const pair = await Promise.all([concurrent(4481, 4482, 'concurrent-a'), concurrent(4486, 4487, 'concurrent-b')]);
	const pairRecords = ['concurrent-a', 'concurrent-b'].flatMap((d) => readJsonl(path.join(out, d, 'results.jsonl')));
	check('two concurrent runs on overridden proxy and shaped ports both succeed', pair.every((p) => p.code === 0) && pairRecords.length === 4 && pairRecords.every((r) => r.failure === null), pairRecords.filter((r) => r.failure).map((r) => `${r.deployment.url}: ${r.failure.kind} ${r.failure.message}`).join(' | '));

	console.log('\n--- chromium summary.md (excerpt) ---');
	console.log(fs.readFileSync(path.join(chromiumDir, 'summary.md'), 'utf8').split('\n').slice(0, 16).join('\n'));
	console.log('--- webkit summary.md (excerpt) ---');
	console.log(fs.readFileSync(path.join(webkitDir, 'summary.md'), 'utf8').split('\n').slice(0, 12).join('\n'));
} finally {
	await good.close();
	await bad.close();
	await deaf.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\nselftest: ${checks.length - failed.length}/${checks.length} checks passed; outputs in ${out}`);
process.exit(failed.length ? 1 : 0);
