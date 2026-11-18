#!/usr/bin/env node
// Fails when a node-project test that reaches a heavy entry (an app build or a browser launch) is missing from heavy-tests.json, or a listed one no longer does,
// and when a router or bundler test builds in its own worker without being named in its "inWorkerBuilds".

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGraph } from '../../packages/analyzer/test-support/project-graph.ts';
import {
	checkPlacement,
	heavyTests,
	loadTestClosure,
} from '../../packages/analyzer/test-support/test-placement.ts';
import { checkInWorkerBuilds, inWorkerBuilds } from './in-worker-builds.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = resolve(repoRoot, 'scripts/ci/heavy-tests.json');
const NODE_PROJECT = 'node';

const USAGE = `usage: node scripts/ci/test-placement.mjs [--write] [--json]

  (no flag)  check scripts/ci/heavy-tests.json against the yuku import graph
  --write    rewrite its "tests" list from the graph, keeping "entries" and "declared"
  --json     print every heavy test with the import chain that makes it heavy`;

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
		return testFiles.map((file) => relative(repoRoot, file)).sort();
	} finally {
		await vitest.close();
	}
}

async function main(args) {
	if (args.includes('--help')) {
		console.log(USAGE);
		return 0;
	}
	const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
	const tests = await nodeProjectTests();
	const closure = await loadTestClosure(repoRoot, tests);
	const heavy = heavyTests(closure, tests, manifest.entries);
	if (args.includes('--json')) {
		console.log(JSON.stringify(Object.fromEntries(heavy), null, '\t'));
		return 0;
	}
	if (args.includes('--write')) {
		const declared = new Set(manifest.declared.map((entry) => entry.test));
		const next = {
			...manifest,
			tests: [...heavy.keys()].filter((test) => !declared.has(test)),
		};
		writeFileSync(MANIFEST, `${JSON.stringify(next, null, '\t')}\n`);
		console.log(
			`${relative(repoRoot, MANIFEST)}: ${next.tests.length} tests reach a heavy entry`,
		);
		return 0;
	}
	const problems = checkPlacement(manifest, heavy, tests, closure.tracked);
	const rule = manifest.inWorkerBuilds;
	const { graph } = await loadProjectGraph(repoRoot);
	const inWorker = inWorkerBuilds(
		graph,
		tests,
		manifest.entries.filter((entry) => entry.inProcess),
		rule.scope,
	);
	const workerProblems = checkInWorkerBuilds(rule, inWorker);
	const summary = `${tests.length} node-project tests, ${heavy.size} reach a heavy entry, ${manifest.declared.length} declared heavy by hand, ${inWorker.size} build in their worker (${closure.edges.size} modules parsed in ${closure.rounds} rounds)`;
	for (const problem of workerProblems)
		console.error(
			problem.kind === 'unlisted'
				? `::error::${problem.path} builds an app inside its test worker (${problem.detail}). Build through buildFixture (packages/router/test/support/fixture-build.ts), which builds in a child process; if the test needs the build in its own process, name it with the reason under "inWorkerBuilds" in scripts/ci/heavy-tests.json.`
				: `::error::${problem.path} is named under "inWorkerBuilds" but ${problem.detail}; remove it.`,
		);
	if (!problems.length && !workerProblems.length) {
		console.log(`test placement: ${summary}; scripts/ci/heavy-tests.json agrees`);
		return 0;
	}
	for (const problem of problems) {
		if (problem.kind === 'missing')
			console.error(
				`::error::${problem.path} builds an app or launches a browser (${problem.detail}) but is not listed in scripts/ci/heavy-tests.json. List it under "tests", or keep the heavy work out of the node project.`,
			);
		else if (problem.kind === 'declared but reached')
			console.error(
				`::error::${problem.path} is declared by hand but the graph reaches a heavy entry (${problem.detail}); move it to "tests".`,
			);
		else console.error(`::error::${problem.kind}: ${problem.path}: ${problem.detail}`);
	}
	console.error(
		`test placement: ${summary}; ${problems.length + workerProblems.length} problem(s). \`node scripts/ci/test-placement.mjs --write\` rewrites "tests" from the graph for review.`,
	);
	return 1;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error) => {
		console.error(error);
		process.exit(2);
	},
);
