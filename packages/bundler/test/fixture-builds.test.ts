import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
import { buildInternalFilesInPublicOutput } from '../../../scripts/test-utils/public-build-output.ts';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import { MARKLESS_BUNDLE_GRAPH, MARKLESS_EXECUTION_SIZES } from '../src/build/chunking.ts';
import { runtimeSizeReport } from '../test-support/runtime-size.ts';
import {
	acceptFixtureRuntime,
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
				// The runtime walls price the library by its own chunks, which only an unpacked build keeps apart.
				for (const output of fixture.outputs)
					await rm(resolve(root, output), { force: true, recursive: true });
				await execPnpm(['--filter', fixture.filter, 'build'], {
					MARKLESS_FIXTURE_NATIVE_PACKING: '0',
				});
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
				const accepted = acceptFixtureRuntime(
					fixture.filter,
					runtimeModules,
					emittedReport,
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
				if (!accepted)
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

async function execPnpm(args: string[], env: Record<string, string> = {}) {
	try {
		await exec('pnpm', args, { cwd: root, env: { ...process.env, ...env } });
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
