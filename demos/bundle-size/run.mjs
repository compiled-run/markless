import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

import { build } from 'vite';

import { BYTE_CATEGORY } from '../../packages/bundler/src/build/byte-attribution.ts';
import {
	MARKLESS_BUILD_PREFIX,
	MARKLESS_BUNDLE_GRAPH,
	MARKLESS_BYTE_ATTRIBUTION,
} from '../../packages/bundler/src/build/chunking.ts';
import { createFailedResult } from '../benchmarks/lib/results.mjs';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(benchmarkRoot, '../..');
const jsfbRoot = path.join(
	repositoryRoot,
	'demos/js-framework-benchmark/frameworks/keyed/markless',
);
const byteFields = ['raw', 'gzip', 'brotli'];
const frameworkCategories = new Set([BYTE_CATEGORY.runtime, BYTE_CATEGORY.glue]);
export const bundleSizeDefinitions = [
	{
		name: 'js-framework-benchmark',
		root: jsfbRoot,
		configFile: path.join(jsfbRoot, 'vite.config.ts'),
	},
	{ name: 'todomvc', root: path.resolve(benchmarkRoot, '../todomvc/fixture') },
	{ name: 'chat-stream', root: path.resolve(benchmarkRoot, '../chat-stream/fixture') },
];

export async function runBundleSize({ protocol, environment }) {
	try {
		const cases = [];
		for (const definition of bundleSizeDefinitions)
			cases.push(await buildAndMeasure(definition));
		const result = passedResult({ protocol, environment, cases });
		validateBundleSizeResult(result);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return {
			result: createFailedResult({
				benchmark: 'bundle-size',
				protocol,
				environment,
				failure,
			}),
			exitCode: 1,
		};
	}
}

export function validateBundleSizeResult(result) {
	if (!Array.isArray(result?.cases) || result.cases.length === 0) {
		throw new TypeError('bundle-size result requires cases');
	}
	for (const benchmarkCase of result.cases) {
		const bytes = benchmarkCase?.metrics?.bytes;
		for (const bucket of ['total', 'application', 'framework']) {
			for (const field of byteFields) {
				const value = bytes?.[bucket]?.[field];
				if (!Number.isInteger(value) || value < 0) {
					throw new TypeError(
						`bundle-size ${benchmarkCase?.name ?? 'case'} requires ${bucket}.${field} bytes`,
					);
				}
			}
		}
		if (bytes.application.raw === 0)
			throw new TypeError(`${benchmarkCase.name} has an empty application bucket`);
		if (bytes.framework.raw === 0)
			throw new TypeError(`${benchmarkCase.name} has an empty framework bucket`);
		for (const field of byteFields) {
			if (bytes.total[field] !== bytes.application[field] + bytes.framework[field]) {
				throw new TypeError(
					`${benchmarkCase.name} total.${field} does not equal its buckets`,
				);
			}
		}
	}
	return result;
}

async function buildAndMeasure(definition) {
	const outputDirectory = path.join(benchmarkRoot, 'dist', definition.name);
	const chunkFiles = [];
	const writtenNamesPlugin = {
		name: `markless-bundle-size-written-names-${definition.name}`,
		writeBundle(_options, bundle) {
			for (const [fileName, output] of Object.entries(bundle))
				if (output.type === 'chunk') chunkFiles.push(fileName);
		},
	};
	const previousRepositoryRoot = process.env.MARKLESS_REPO_ROOT;
	process.env.MARKLESS_REPO_ROOT = repositoryRoot;
	try {
		await build({
			root: definition.root,
			configFile: definition.configFile ?? path.join(definition.root, 'vite.config.mjs'),
			mode: 'production',
			logLevel: 'warn',
			plugins: [writtenNamesPlugin],
			build: {
				outDir: outputDirectory,
				emptyOutDir: true,
				minify: 'oxc',
				target: 'es2022',
				rollupOptions: {
					output: {
						codeSplitting: createBundleSizeCodeSplitting(),
					},
				},
			},
		});
	} finally {
		if (previousRepositoryRoot === undefined) delete process.env.MARKLESS_REPO_ROOT;
		else process.env.MARKLESS_REPO_ROOT = previousRepositoryRoot;
	}

	const graph = readBuildJson(outputDirectory, MARKLESS_BUNDLE_GRAPH);
	if (!Array.isArray(graph) || graph.length === 0) {
		throw new TypeError(`${definition.name} build emitted an empty bundle-graph.json`);
	}
	const attribution = readBuildJson(outputDirectory, MARKLESS_BYTE_ATTRIBUTION);

	const buckets = { application: zeroBytes(), framework: zeroBytes() };
	const files = [];
	for (const fileName of chunkFiles.sort()) {
		if (!/\.(?:m?js)$/.test(fileName)) continue;
		const chunk = attribution.chunks?.[withoutBuildPrefix(fileName)];
		if (!chunk)
			throw new TypeError(`${definition.name} chunk ${fileName} has no byte attribution`);
		const measured = measureBuffer(fs.readFileSync(path.join(outputDirectory, fileName)));
		const split = splitChunkBytes(measured, chunk.modules);
		addBytes(buckets.application, split.application);
		addBytes(buckets.framework, split.framework);
		files.push({
			file: fileName,
			...measured,
			...split,
			modules: chunk.modules.map(([category, key, bytes]) => ({ category, key, bytes })),
		});
	}
	const total = zeroBytes();
	addBytes(total, buckets.application);
	addBytes(total, buckets.framework);
	return sizeCase(definition.name, { total, ...buckets }, files);
}

function readBuildJson(outputDirectory, fileName) {
	return JSON.parse(fs.readFileSync(path.join(outputDirectory, fileName), 'utf8'));
}

function withoutBuildPrefix(fileName) {
	return fileName.startsWith(MARKLESS_BUILD_PREFIX)
		? fileName.slice(MARKLESS_BUILD_PREFIX.length)
		: fileName;
}

// Packing mixes app and framework modules in one chunk, so each chunk's shipped bytes are split by its attributed rendered bytes.
export function splitChunkBytes(measured, modules) {
	let frameworkWeight = 0;
	let totalWeight = 0;
	for (const [category, , bytes] of modules) {
		totalWeight += bytes;
		if (frameworkCategories.has(category)) frameworkWeight += bytes;
	}
	const framework = zeroBytes();
	const application = zeroBytes();
	for (const field of byteFields) {
		framework[field] =
			totalWeight === 0
				? measured[field]
				: Math.round((measured[field] * frameworkWeight) / totalWeight);
		application[field] = measured[field] - framework[field];
	}
	return { application, framework };
}

export function createBundleSizeCodeSplitting() {
	return {
		includeDependenciesRecursively: false,
		groups: [{ name: 'framework', test: isFrameworkModule }],
	};
}

function isFrameworkModule(id) {
	const clean = id.split('?')[0];
	return (
		id.startsWith('\0') ||
		clean.includes(`${path.sep}node_modules${path.sep}`) ||
		clean.includes(`${path.sep}packages${path.sep}`)
	);
}

function measureBuffer(buffer) {
	return {
		raw: buffer.byteLength,
		gzip: gzipSync(buffer, { level: zlibConstants.Z_BEST_COMPRESSION, mtime: 0 }).byteLength,
		brotli: brotliCompressSync(buffer, {
			params: { [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY },
		}).byteLength,
	};
}

function zeroBytes() {
	return { raw: 0, gzip: 0, brotli: 0 };
}

function addBytes(target, source) {
	for (const field of byteFields) target[field] += source[field];
}

function sizeCase(name, bytes, files) {
	return {
		name,
		gates: {
			passed: true,
			checks: [
				'bundle graph present',
				'every chunk has byte attribution',
				'application and framework buckets non-empty',
			],
		},
		bodyBytes: bytes.total.raw,
		timing: deterministicTiming(),
		memory: deterministicMemory(),
		metrics: { samples: 1, bytes, files },
	};
}

function passedResult({ protocol, environment, cases }) {
	return {
		schemaVersion: 1,
		kind: 'markless-benchmark-result',
		benchmark: 'bundle-size',
		status: 'passed',
		recordedAt: new Date().toISOString(),
		protocol,
		environment,
		cases,
	};
}

function deterministicTiming() {
	return { samples: 1, minMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, opsPerSec: null };
}

function deterministicMemory() {
	return {
		label: 'allocator-growth-observation',
		renders: 0,
		rssGrowthBytes: 0,
		heapGrowthBytes: 0,
		forcedGc: false,
	};
}
