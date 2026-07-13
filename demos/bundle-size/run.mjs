import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

import { build } from 'vite';

import { createFailedResult } from '../benchmarks/lib/results.mjs';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(benchmarkRoot, '../..');
const jsfbRoot = path.join(
	repositoryRoot,
	'demos/js-framework-benchmark/frameworks/keyed/markless',
);
const byteFields = ['raw', 'gzip', 'brotli'];
export const bundleSizeDefinitions = [
	{
		name: 'js-framework-benchmark',
		root: jsfbRoot,
		appRoot: path.join(jsfbRoot, 'src'),
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
			result: createFailedResult({ benchmark: 'bundle-size', protocol, environment, failure }),
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
	const appRoot = definition.appRoot ?? definition.root;
	const chunkModules = new Map();
	const provenancePlugin = {
		name: `markless-bundle-size-provenance-${definition.name}`,
		generateBundle(_options, bundle) {
			for (const [fileName, output] of Object.entries(bundle)) {
				if (output.type === 'chunk')
					chunkModules.set(fileName, Object.keys(output.modules).sort());
			}
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
			plugins: [provenancePlugin],
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

	const graphPath = path.join(outputDirectory, 'build', 'bundle-graph.json');
	const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
	if (!Array.isArray(graph) || graph.length === 0) {
		throw new TypeError(`${definition.name} build emitted an empty bundle-graph.json`);
	}

	const buckets = { application: zeroBytes(), framework: zeroBytes() };
	const files = [];
	for (const [fileName, moduleIds] of [...chunkModules].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		if (!/\.(?:m?js)$/.test(fileName)) continue;
		const appModules = moduleIds.filter((id) => isApplicationModule(id, appRoot));
		const frameworkModules = moduleIds.filter(isFrameworkModule);
		if (appModules.length > 0 && frameworkModules.length > 0) {
			throw new TypeError(
				`${definition.name} chunk ${fileName} mixes application and framework provenance: ${moduleIds.join(', ')}`,
			);
		}
		const bucket = appModules.length > 0 ? 'application' : 'framework';
		const measured = measureBuffer(fs.readFileSync(path.join(outputDirectory, fileName)));
		addBytes(buckets[bucket], measured);
		files.push({
			file: fileName,
			bucket,
			modules: moduleIds.map(normalizeModuleId),
			...measured,
		});
	}
	const total = zeroBytes();
	addBytes(total, buckets.application);
	addBytes(total, buckets.framework);
	return sizeCase(definition.name, { total, ...buckets }, files);
}

export function createBundleSizeCodeSplitting() {
	return {
		includeDependenciesRecursively: false,
		groups: [{ name: 'framework', test: isFrameworkModule }],
	};
}

function isApplicationModule(id, appRoot) {
	let clean = id;
	while (clean.startsWith('\0')) clean = clean.slice(1);
	clean = clean.split('?')[0];
	const relative = path.relative(appRoot, clean);
	return (
		relative !== '' &&
		!relative.startsWith('..') &&
		!path.isAbsolute(relative) &&
		/\.(?:ts|tsrx)$/.test(clean)
	);
}

function isFrameworkModule(id) {
	const clean = id.split('?')[0];
	return (
		id.startsWith('\0') ||
		clean.includes(`${path.sep}node_modules${path.sep}`) ||
		clean.includes(`${path.sep}packages${path.sep}`)
	);
}

function normalizeModuleId(id) {
	return id
		.replaceAll(encodeURIComponent(repositoryRoot), '<repo>')
		.replaceAll(repositoryRoot, '<repo>')
		.split(path.sep)
		.join('/');
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
			checks: ['bundle graph present', 'application and framework buckets non-empty'],
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
