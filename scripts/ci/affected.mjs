#!/usr/bin/env node
// Picks the node-project unit tests a change can reach, from the yuku module graph. The pre-commit hook only logs the pick (shadow mode).

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, matchesGlob, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGraph } from '../../packages/analyzer/test-support/project-graph.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE_PROJECT = 'node';
const SHADOW_LOG =
	process.env.MARKLESS_AFFECTED_SHADOW_LOG ?? join(homedir(), '.markless/affected-shadow.jsonl');

const USAGE = `usage: node scripts/ci/affected.mjs (--staged | --files <path>...) [--print | --json]
       node scripts/ci/affected.mjs --shadow-log <selection.json> [--unit-report <vitest.json>]
       node scripts/ci/affected.mjs --history <count> [--rev <ref>] [--durations <vitest.json>] [--durations-root <dir>]

  --staged          select for the staged change (git diff --cached)
  --files <path>... select for these repo-relative paths
  --print           print the selected ${NODE_PROJECT}-project test files, or "ALL: <reason>"
  --json            print the selection as JSON (default)
  --shadow-log      append one line to ${SHADOW_LOG}: the selection, and the unit
                    job's failing files from its JSON report; never fails
  --history <n>     dry run: select for each of the last <n> commits of --rev (default origin/main)
  --durations       a Vitest JSON report whose per-file durations price the dry run
  --durations-root  the checkout that report ran in (default: this one)`;

const git = (...args) =>
	execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });

const lines = (text) => text.split('\n').filter(Boolean);

/** The node project's test files and its include/exclude globs, as Vitest resolves them. */
async function nodeProjectTests() {
	const { createVitest } = await import('vitest/node');
	const vitest = await createVitest(
		'test',
		{ project: [NODE_PROJECT], watch: false, run: true },
		{},
		{ stdout: process.stderr, stderr: process.stderr },
	);
	try {
		const project = vitest.projects.find((candidate) => candidate.name === NODE_PROJECT);
		if (!project) throw new Error(`Vitest has no "${NODE_PROJECT}" project`);
		const { testFiles } = await project.globTestFiles();
		return {
			files: testFiles.map((file) => relative(repoRoot, file)).sort(),
			include: [...project.config.include],
			exclude: [...project.config.exclude],
		};
	} finally {
		await vitest.close();
	}
}

const testsInTree = (paths, { include, exclude }) =>
	paths.filter(
		(path) =>
			include.some((glob) => matchesGlob(path, glob)) &&
			!exclude.some((glob) => matchesGlob(path, glob)),
	);

async function select(changed) {
	const started = performance.now();
	const [{ graph, buildMs, fileCount }, project] = await Promise.all([
		loadProjectGraph(repoRoot),
		nodeProjectTests(),
	]);
	const selection = graph.affectedTests(changed, project.files);
	return {
		changed,
		selected: selection.runAll ? null : selection.tests,
		runAll: selection.runAll,
		total: project.files.length,
		undeclaredTests: graph.testsReachingUndeclaredImports(project.files).length,
		graphMs: Math.round(buildMs),
		totalMs: Math.round(performance.now() - started),
		graphFiles: fileCount,
	};
}

const failedFiles = (reportPath) => {
	if (!reportPath || !existsSync(reportPath)) return null;
	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	return (report.testResults ?? [])
		.filter((result) => result.status === 'failed')
		.map((result) => relative(repoRoot, result.name))
		.sort();
};

function shadowLog(selectionPath, reportPath) {
	const selection = existsSync(selectionPath)
		? JSON.parse(readFileSync(selectionPath, 'utf8'))
		: { error: 'no selection was computed' };
	const failed = failedFiles(reportPath);
	const picked = new Set(selection.selected ?? []);
	const misses = failed && selection.selected ? failed.filter((file) => !picked.has(file)) : [];
	const entry = {
		at: new Date().toISOString(),
		head: git('rev-parse', '--verify', '-q', 'HEAD').trim() || null,
		tree: git('write-tree').trim(),
		branch: git('branch', '--show-current').trim() || null,
		...selection,
		selectedCount: selection.selected?.length ?? null,
		unitRan: failed !== null,
		failed,
		misses,
	};
	mkdirSync(dirname(SHADOW_LOG), { recursive: true });
	appendFileSync(SHADOW_LOG, `${JSON.stringify(entry)}\n`);
}

const mean = (values) =>
	values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;

const percentile = (values, fraction) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
};

async function history(count, rev, durationsPath, durationsRoot = repoRoot) {
	const project = await nodeProjectTests();
	const durations = new Map();
	if (durationsPath) {
		const report = JSON.parse(readFileSync(durationsPath, 'utf8'));
		for (const result of report.testResults ?? [])
			durations.set(relative(durationsRoot, result.name), result.endTime - result.startTime);
	}
	const cost = (files) => files.reduce((sum, file) => sum + (durations.get(file) ?? 0), 0);
	const share = (selection, tests) =>
		durations.size
			? cost(selection.runAll ? tests : selection.tests) / Math.max(1, cost(tests))
			: null;
	const commits = lines(git('rev-list', '--first-parent', `--max-count=${count}`, rev));
	const rows = [];
	for (const sha of commits) {
		const changed = lines(
			git('diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--first-parent', sha),
		);
		const { graph, buildMs } = await loadProjectGraph(repoRoot, { rev: sha });
		const tests = testsInTree(lines(git('ls-tree', '-r', '--name-only', sha)), project);
		const strict = graph.affectedTests(changed, tests);
		// The same change if undeclared fully dynamic imports added no tests, for comparison only.
		const lenient = graph.affectedTests(changed, tests, { ignoreUndeclaredImports: true });
		rows.push({
			sha: sha.slice(0, 10),
			subject: git('log', '-1', '--format=%s', sha).trim(),
			changed: changed.length,
			total: tests.length,
			selected: strict.runAll ? tests.length : strict.tests.length,
			runAll: strict.runAll,
			share: share(strict, tests),
			lenientSelected: lenient.runAll ? tests.length : lenient.tests.length,
			lenientRunAll: lenient.runAll,
			lenientShare: share(lenient, tests),
			undeclaredTests: graph.testsReachingUndeclaredImports(tests).length,
			graphMs: Math.round(buildMs),
		});
		console.error(
			`${sha.slice(0, 10)} ${String(changed.length).padStart(3)} changed -> ${strict.runAll ? `ALL (${strict.runAll})` : `${strict.tests.length}/${tests.length}`}`,
		);
	}
	const reasonCounts = (key) => {
		const counts = {};
		for (const row of rows)
			if (row[key]) {
				const rule = row[key].split(':')[0];
				counts[rule] = (counts[rule] ?? 0) + 1;
			}
		return counts;
	};
	const shares = (key) => rows.map((row) => row[key]).filter((value) => value !== null);
	const selective = rows.filter((row) => !row.runAll);
	return {
		commits: rows.length,
		runAll: rows.length - selective.length,
		runAllReasons: reasonCounts('runAll'),
		selectedP50: percentile(
			rows.map((row) => row.selected),
			0.5,
		),
		selectedP90: percentile(
			rows.map((row) => row.selected),
			0.9,
		),
		selectiveSelectedP50: percentile(
			selective.map((row) => row.selected),
			0.5,
		),
		selectiveSelectedP90: percentile(
			selective.map((row) => row.selected),
			0.9,
		),
		meanCostShare: mean(shares('share')),
		lenientRunAll: rows.filter((row) => row.lenientRunAll).length,
		lenientRunAllReasons: reasonCounts('lenientRunAll'),
		lenientSelectedP50: percentile(
			rows.map((row) => row.lenientSelected),
			0.5,
		),
		lenientSelectedP90: percentile(
			rows.map((row) => row.lenientSelected),
			0.9,
		),
		lenientMeanCostShare: mean(shares('lenientShare')),
		undeclaredTestsAtHead: rows[0]?.undeclaredTests ?? null,
		graphMsP50: percentile(
			rows.map((row) => row.graphMs),
			0.5,
		),
		rows,
	};
}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
	const index = argv.indexOf(name);
	return index === -1 ? undefined : argv[index + 1];
};

if (flag('--help') || flag('-h') || !argv.length) {
	console.log(USAGE);
	process.exit(argv.length ? 0 : 2);
}

if (flag('--shadow-log')) {
	try {
		shadowLog(value('--shadow-log'), value('--unit-report'));
	} catch (error) {
		console.error(
			`affected: shadow log skipped: ${error instanceof Error ? error.message : error}`,
		);
	}
	process.exit(0);
}

if (flag('--history')) {
	const result = await history(
		Number(value('--history')),
		value('--rev') ?? 'origin/main',
		value('--durations'),
		value('--durations-root'),
	);
	console.log(JSON.stringify(result, null, '\t'));
	process.exit(0);
}

let changed;
if (flag('--staged')) changed = lines(git('diff', '--cached', '--name-only', '--no-renames'));
else if (flag('--files')) {
	const start = argv.indexOf('--files') + 1;
	changed = [];
	for (const arg of argv.slice(start)) {
		if (arg.startsWith('--')) break;
		changed.push(arg);
	}
} else {
	console.error(USAGE);
	process.exit(2);
}

const result = await select(changed);
if (flag('--print'))
	console.log(result.runAll ? `ALL: ${result.runAll}` : result.selected.join('\n'));
else console.log(JSON.stringify(result));
