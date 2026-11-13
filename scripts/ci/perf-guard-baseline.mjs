#!/usr/bin/env node
// Writes the G16 baseline for HEAD: per page, the CI measurement it is judged against. Any failure writes no references, which leaves the guard on its anchors.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBaseline, ledgerHistory } from '../benchmarks/perf-guards/baseline.mjs';
import { LOAD_PLATFORM } from '../benchmarks/perf-guards/evaluate.mjs';

const ARTIFACT = 'perf-guards-measurement';
const JOB = 'perf-guards';
// Past this many commits with runs, a page falls back to its anchor rather than spending minutes of API calls.
const MAX_LOOKUPS = 40;
const POLL_MS = 20_000;
const USAGE =
	'usage: node scripts/ci/perf-guard-baseline.mjs --out <file> [--repo owner/name] [--depth <commits>] [--platform linux-x64] [--wait-minutes <n>]';

function flag(args, name, fallback) {
	const i = args.indexOf(name);
	return i < 0 ? fallback : args[i + 1];
}

const gh = (...args) =>
	execFileSync('gh', args, {
		encoding: 'utf8',
		maxBuffer: 1 << 28,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
const json = (path, jq) => JSON.parse(gh('api', path, '--jq', jq));

/** ci.yml runs of merge-queue commits and pushes to main, newest first, by commit. */
function runsByCommit(repo, pages = 3) {
	const bySha = new Map();
	for (const event of ['merge_group', 'push'])
		for (let page = 1; page <= pages; page++) {
			const runs = json(
				`repos/${repo}/actions/workflows/ci.yml/runs?event=${event}&per_page=100&page=${page}`,
				'[.workflow_runs[] | {id, sha: .head_sha}]',
			);
			for (const run of runs) bySha.set(run.sha, [...(bySha.get(run.sha) ?? []), run.id]);
			if (runs.length < 100) break;
		}
	return bySha;
}

/** Whether a run can no longer upload a measurement: it finished, or its perf-guards job did. */
function settled(repo, run) {
	if (json(`repos/${repo}/actions/runs/${run}`, '.status') === 'completed') return true;
	return json(
		`repos/${repo}/actions/runs/${run}/jobs?per_page=100`,
		`[.jobs[] | select(.name == "${JOB}") | .status]`,
	).includes('completed');
}

/**
 * CI's measurement of one commit, from the first of its runs that uploaded one. A run still measuring (the queue
 * entry ahead of this one, which started at about the same time) is waited for until `deadline`.
 */
function measurementOf(repo, runs, scratch, deadline, log) {
	for (const run of runs) {
		for (;;) {
			const artifacts = json(
				`repos/${repo}/actions/runs/${run}/artifacts?name=${ARTIFACT}`,
				'[.artifacts[] | select(.expired | not) | .id]',
			);
			if (artifacts.length > 0) {
				const dir = join(scratch, String(run));
				gh('run', 'download', String(run), '-R', repo, '-n', ARTIFACT, '-D', dir);
				const file = join(dir, 'last-measurement.json');
				if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), run };
				break;
			}
			if (settled(repo, run) || Date.now() > deadline) break;
			log(`waiting for run ${run} to measure the commit this one is judged against`);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
		}
	}
	return undefined;
}

function main(argv) {
	const out = flag(argv, '--out');
	if (!out) throw new Error(USAGE);
	const repo = flag(argv, '--repo', process.env.GITHUB_REPOSITORY);
	const depth = Number(flag(argv, '--depth', '300'));
	const platform = flag(argv, '--platform', LOAD_PLATFORM);
	const deadline = Date.now() + Number(flag(argv, '--wait-minutes', '10')) * 60_000;
	const empty = (reason) => ({ head: null, platform, subjects: {}, fallbacks: {}, reason });
	let baseline;
	const scratch = mkdtempSync(join(tmpdir(), 'perf-guard-baseline-'));
	try {
		if (!repo) throw new Error('no repository: pass --repo or set GITHUB_REPOSITORY');
		const history = ledgerHistory({ depth });
		const runs = runsByCommit(repo);
		const measurements = new Map();
		let lookups = 0;
		const measurementAt = (i) => {
			if (!measurements.has(i)) {
				const commitRuns = runs.get(history.chain[i].sha) ?? [];
				const reachable = commitRuns.length > 0 && lookups++ < MAX_LOOKUPS;
				measurements.set(
					i,
					reachable
						? measurementOf(repo, commitRuns, scratch, deadline, console.log)
						: undefined,
				);
			}
			return measurements.get(i);
		};
		baseline = buildBaseline({ history, platform, measurementAt });
	} catch (error) {
		baseline = empty(String(error.message ?? error).split('\n')[0]);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
	writeFileSync(out, `${JSON.stringify(baseline, null, '\t')}\n`);
	if (baseline.reason)
		console.log(
			`no G16 baseline (${baseline.reason}); the guard judges downloads against the anchors`,
		);
	for (const [subject, reference] of Object.entries(baseline.subjects))
		console.log(
			`G16 ${subject}: ${reference.measured} B measured on ${reference.commit.slice(0, 10)} (run ${reference.run}), anchor there ${reference.anchored} B`,
		);
	for (const [subject, reason] of Object.entries(baseline.fallbacks))
		console.log(`G16 ${subject}: judged against its anchor alone: ${reason}`);
	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
