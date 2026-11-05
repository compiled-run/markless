import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openMergeBaseCheckout } from '../../../scripts/benchmarks/anchor-ledger.mjs';
import { buildInternalFilesInPublicOutput } from '../../../scripts/test-utils/public-build-output.ts';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import {
	MARKLESS_BUNDLE_GRAPH,
	MARKLESS_BYTE_ATTRIBUTION,
	MARKLESS_EXECUTION_SIZES,
} from '../src/build/chunking.ts';
import { runtimeSizeReport } from '../test-support/runtime-size.ts';
import {
	acceptFixtureRuntime,
	acceptingFixtureRuntime,
	assertRuntimeBudget,
	fixtureRuntimeBudget,
	fixtureRuntimeModules,
	readFixtureRuntimeAnchors,
	runtimeModuleOverruns,
} from './fixture-budget.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

const fixtures = [
	{
		filter: '@fixtures/vite-csr',
		outputs: ['packages/bundler/fixtures/vite-csr/dist'],
		clientDir: 'packages/bundler/fixtures/vite-csr/dist',
		symbols: ['symbol:0', 'symbol:1'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-csr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-csr/dist/index.html',
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-library',
		outputs: ['packages/bundler/fixtures/vite-library/dist'],
	},
	{
		filter: '@fixtures/vite-ssr',
		outputs: ['packages/bundler/fixtures/vite-ssr/dist'],
		clientDir: 'packages/bundler/fixtures/vite-ssr/dist',
		symbols: ['symbol:0', 'symbol:1'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-ssr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-ssr/dist/index.html',
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-plus',
		outputs: ['packages/bundler/fixtures/vite-plus/dist'],
		clientDir: 'packages/bundler/fixtures/vite-plus/dist',
		symbols: ['symbol:0'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-plus/dist',
			entryHtml: 'packages/bundler/fixtures/vite-plus/dist/index.html',
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/rolldown-basic',
		outputs: ['packages/bundler/fixtures/rolldown-basic/dist'],
		clientDir: 'packages/bundler/fixtures/rolldown-basic/dist/client',
		// The bare Rolldown plugin defaults the execution log to auto, so its size table stays served.
		executionLogActive: true,
		symbols: ['symbol:0', 'symbol:1'],
	},
] as const;

describe('fixture builds', () => {
	let mergeBase: ReturnType<typeof openMergeBaseCheckout> | undefined;
	beforeAll(() => {
		if (acceptingFixtureRuntime()) mergeBase = openMergeBaseCheckout();
	}, 240_000);
	afterAll(() => mergeBase?.close());

	// No root `pnpm build` here: fixtures resolve @markless deps through the dev
	// exports maps (src .ts), so package dists are not inputs to these builds.
	// Repacking the workspace from inside the suite wiped every packages/*/dist
	// (pack `clean: true`) in parallel with tests that read dist output
	// (scripts/release/publish-shape.test.ts), making the full run flaky.
	for (const fixture of fixtures) {
		test(`${fixture.filter} builds from a clean output directory`, async () => {
			await Promise.all(
				fixture.outputs.map((output) =>
					rm(resolve(root, output), {
						force: true,
						recursive: true,
					}),
				),
			);

			await execPnpm(['--filter', fixture.filter, 'build']);

			for (const output of fixture.outputs)
				await expectNoMachinePathInOutput(resolve(root, output));

			if ('clientDir' in fixture) {
				const clientDir = resolve(root, fixture.clientDir);
				expect(
					await buildInternalFilesInPublicOutput(clientDir, {
						executionLogActive: 'executionLogActive' in fixture,
					}),
				).toEqual([]);
				const graph = JSON.parse(
					await readFile(
						marklessBuildManifestPath(clientDir, MARKLESS_BUNDLE_GRAPH),
						'utf8',
					),
				);
				expect(graph).toEqual(expect.any(Array));
				for (const symbol of fixture.symbols) {
					expect(graph).toContain(symbol);
				}
			}

			if ('runtimeBudget' in fixture) {
				// None of these fixtures has an async value: their planes are never emitted, and busy marks never load.
				const dist = resolve(root, fixture.runtimeBudget.dist);
				expect(
					(await runtimeModulesIn(dist)).filter((id) => ASYNC_PLANES.includes(id)),
				).toEqual([]);
				expect(
					await runtimeModulesIn(dist, resolve(root, fixture.runtimeBudget.entryHtml)),
				).not.toContain('web/resume-refresh-busy');
				await buildUnpacked(root, fixture.filter, fixture.runtimeBudget.dist);
				await expectNoAppChunkStaticallyImportsInstrumentChunk(
					resolve(root, fixture.runtimeBudget.dist),
				);
				// Owner ruling 2026-07-05: no per-page fetch metric — 'emitted = required'
				// assertions arrive with the runtime-stdlib goal. The wall guards bloat.
				const emittedReport = await runtimeSizeReport({
					dist: resolve(root, fixture.runtimeBudget.dist),
				});
				const runtimeModules = fixtureRuntimeModules(
					resolve(root, fixture.runtimeBudget.dist),
				);
				if (mergeBase)
					acceptFixtureRuntime(
						fixture.filter,
						{ modules: runtimeModules, report: emittedReport },
						await measureRuntime(
							mergeBase.root,
							fixture.filter,
							fixture.runtimeBudget.dist,
						),
					);
				const budget = fixtureRuntimeBudget(fixture.filter, {
					forbidVitePreloadHelper: fixture.runtimeBudget.forbidVitePreloadHelper,
				});
				const evidence = process.env.MARKLESS_BUDGET_EVIDENCE_DIR;
				if (evidence) {
					await mkdir(evidence, { recursive: true });
					await writeFile(
						resolve(evidence, fixture.filter.replace(/[^a-zA-Z0-9-]/g, '_') + '.json'),
						JSON.stringify(
							{
								fixture: fixture.filter,
								budget,
								emittedReport,
							},
							null,
							2,
						),
					);
				}
				if (!mergeBase)
					expect(
						runtimeModuleOverruns(
							fixture.filter,
							runtimeModules,
							readFixtureRuntimeAnchors().modules[fixture.filter],
						),
					).toEqual([]);
				assertRuntimeBudget({ budget, emittedReport });
			}
		}, 240_000);
	}
});

// Every id the compiler mints is root-relative, so nothing a build writes - the
// served HTML, a client or server chunk, a stylesheet, or a stylesheet's file
// name - carries the machine's path. Build metadata JSON is tooling keyed by
// resolved ids; a JS chunk named from a symbol id is the router's to relativise.
const fixturesDirectory = resolve(root, 'packages/bundler/fixtures');
const encodedFixturesDirectory = encodeURIComponent(fixturesDirectory).replace(/[^\w$]/g, '_');
const SCANNED_OUTPUT = /\.(?:html|m?js|css)$/;
const NAMED_OUTPUT = /\.(?:html|css)$/;

async function expectNoMachinePathInOutput(directory: string): Promise<void> {
	const leaks: string[] = [];
	for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const path = resolve(entry.parentPath, entry.name);
		// Vite spells an encoded id into a file name with `/` as `_2F` or `_`.
		if (
			NAMED_OUTPUT.test(entry.name) &&
			['_2F', '_'].some((slash) =>
				entry.name.includes(fixturesDirectory.replaceAll('/', slash)),
			)
		)
			leaks.push(`file name: ${path}`);
		if (!SCANNED_OUTPUT.test(entry.name)) continue;
		const text = await readFile(path, 'utf8');
		const occurrences = text.split(fixturesDirectory).length - 1;
		if (occurrences > 0) leaks.push(`${path}: ${occurrences} occurrence(s)`);
		// Packed client chunks name cross-chunk init exports after module ids, as identifiers.
		if (path.includes('/build/') && text.includes(encodedFixturesDirectory))
			leaks.push(`${path}: identifier spelling of the fixtures directory`);
	}
	expect(leaks, `build output must not carry ${fixturesDirectory}`).toEqual([]);
}

const ASYNC_PLANES = [
	'runtime/graph-async',
	'runtime/graph-held',
	'web/fns/async-plane',
	'web/fns/held-inputs-plane',
];

// Runtime modules the build emits, or with `entryHtml` only those in the chunks the page preloads or
// loads as scripts and what those import statically.
async function runtimeModulesIn(dist: string, entryHtml?: string): Promise<string[]> {
	const attribution = JSON.parse(
		await readFile(marklessBuildManifestPath(dist, MARKLESS_BYTE_ATTRIBUTION), 'utf8'),
	) as { chunks: Record<string, { modules: ReadonlyArray<readonly [string, string, number]> }> };
	const runtime = (chunk: { modules: ReadonlyArray<readonly [string, string, number]> }) =>
		chunk.modules.flatMap(([category, id]) => (category === 'runtime' ? [id] : []));
	if (!entryHtml) return Object.values(attribution.chunks).flatMap(runtime);
	const html = await readFile(entryHtml, 'utf8');
	const pending = [
		...html.matchAll(/<link\b[^>]*\brel=["']?modulepreload["']?[^>]*\bhref=["']?([^"'\s>]+)/g),
		...html.matchAll(/<script\b[^>]*\bsrc=["']?([^"'\s>]+)/g),
	].map((match) => resolve(dist, `.${new URL(match[1]!, 'http://x/').pathname}`));
	const loaded = new Set<string>();
	while (pending.length) {
		const file = pending.pop()!;
		if (loaded.has(file) || !file.endsWith('.js')) continue;
		loaded.add(file);
		const code = await readFile(file, 'utf8').catch(() => '');
		for (const match of code.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["'](\.\.?\/[^"']+\.js)["']/g))
			pending.push(resolve(file, '..', match[1]!));
	}
	const names = new Set([...loaded].map((file) => file.split('/').pop()));
	return Object.entries(attribution.chunks).flatMap(([name, chunk]) =>
		names.has(name.split('/').pop()) ? runtime(chunk) : [],
	);
}

// The runtime walls price the library by its own chunks, which only an unpacked build keeps apart.
async function buildUnpacked(checkout: string, filter: string, dist: string) {
	await rm(resolve(checkout, dist), { force: true, recursive: true });
	await execPnpm(
		['--filter', filter, 'build'],
		{ MARKLESS_FIXTURE_NATIVE_PACKING: '0' },
		checkout,
	);
}

async function measureRuntime(checkout: string, filter: string, dist: string) {
	await buildUnpacked(checkout, filter, dist);
	return {
		modules: fixtureRuntimeModules(resolve(checkout, dist)),
		report: await runtimeSizeReport({ dist: resolve(checkout, dist) }),
	};
}

async function execPnpm(args: string[], env: Record<string, string> = {}, cwd = root) {
	try {
		await exec('pnpm', args, { cwd, env: { ...process.env, ...env } });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}

type ExecutionSizeEntry = {
	readonly chunk?: string;
	readonly instrument?: boolean;
};

async function expectNoAppChunkStaticallyImportsInstrumentChunk(dist: string): Promise<void> {
	const sizes = JSON.parse(
		await readFile(marklessBuildManifestPath(dist, MARKLESS_EXECUTION_SIZES), 'utf8'),
	) as Record<string, ExecutionSizeEntry>;
	const instrumentChunks = new Set(
		Object.values(sizes)
			.filter((entry) => entry.instrument && entry.chunk)
			.map((entry) => entry.chunk!),
	);
	const appChunks = new Set(
		Object.values(sizes)
			.filter((entry) => !entry.instrument && entry.chunk)
			.map((entry) => entry.chunk!),
	);
	const forbiddenEdges: string[] = [];
	for (const importer of appChunks) {
		const source = await readFile(resolve(dist, 'build', importer), 'utf8');
		for (const match of source.matchAll(
			/\bimport(?:(?:\s+|[{\w*])[\s\S]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g,
		)) {
			const imported = match[1]!;
			if (instrumentChunks.has(imported)) forbiddenEdges.push(`${importer} -> ${imported}`);
		}
	}

	expect(
		forbiddenEdges,
		'app chunks must not statically import execution-instrument chunks',
	).toEqual([]);
}
