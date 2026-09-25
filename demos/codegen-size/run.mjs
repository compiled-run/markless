import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zlibConstants, gzipSync } from 'node:zlib';

import { compileTsrxModule } from '../../packages/compiler/src/index.ts';
import { minifySync } from 'vite';

import { createFailedResult } from '../benchmarks/lib/results.mjs';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const corpusRoot = path.join(benchmarkRoot, 'corpus');
const compiledByteFields = ['raw', 'minified', 'gzip'];

export async function runCodegenSize({ protocol, environment }) {
	try {
		const corpus = readCorpus();
		const compiledFiles = [];
		for (const entry of corpus) {
			const result = await compileTsrxModule({
				filename: entry.file,
				source: entry.source,
				symbols: [],
			});
			const errors = compilerErrors(result);
			if (errors.length > 0) {
				throw new TypeError(`${entry.file} compiler diagnostics: ${errors.join('; ')}`);
			}
			compiledFiles.push(
				measuredFile('client', entry, clientParts(entry.file, result)),
				measuredFile('ssr', entry, { module: [result.publicRenderModule.ssrModuleSource] }),
			);
		}
		const corpusManifest = corpus.map(({ file, sha256 }) => ({ file, sha256 }));
		const cases = ['client', 'ssr'].map((mode) =>
			codegenCase(
				mode,
				corpusManifest,
				compiledFiles.filter((entry) => entry.mode === mode),
			),
		);
		const result = passedResult({ protocol, environment, cases });
		validateCodegenSizeResult(result, corpusManifest);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return {
			result: createFailedResult({
				benchmark: 'codegen-size',
				protocol,
				environment,
				failure,
			}),
			exitCode: 1,
		};
	}
}

export function validateCodegenSizeResult(result, expectedCorpus) {
	if (!Array.isArray(result?.cases) || result.cases.length === 0) {
		throw new TypeError('codegen-size result requires cases');
	}
	const expected = manifestSignature(expectedCorpus);
	for (const benchmarkCase of result.cases) {
		const bytes = benchmarkCase?.metrics?.bytes;
		for (const field of ['raw', 'gzip']) assertByte(bytes?.source?.[field], `source.${field}`);
		for (const field of compiledByteFields)
			assertByte(bytes?.compiled?.[field], `compiled.${field}`);
		const parts = Object.values(bytes?.parts ?? {});
		if (parts.length === 0)
			throw new TypeError(
				`codegen-size ${benchmarkCase?.name ?? 'case'} requires per-part bytes`,
			);
		for (const field of compiledByteFields) {
			if (parts.reduce((sum, part) => sum + part[field], 0) !== bytes.compiled[field])
				throw new TypeError(
					`codegen-size ${benchmarkCase.name} compiled.${field} does not equal its parts`,
				);
		}
		if (manifestSignature(benchmarkCase?.metrics?.corpus) !== expected) {
			throw new TypeError(
				`codegen-size ${benchmarkCase?.name ?? 'case'} corpus hash mismatch`,
			);
		}
		if (
			!Array.isArray(benchmarkCase?.metrics?.files) ||
			benchmarkCase.metrics.files.length !== expectedCorpus.length
		) {
			throw new TypeError(
				`codegen-size ${benchmarkCase?.name ?? 'case'} must list every corpus file`,
			);
		}
	}
	return result;
}

function readCorpus() {
	return fs
		.readdirSync(corpusRoot)
		.filter((file) => file.endsWith('.tsrx'))
		.sort()
		.map((file) => {
			const source = fs.readFileSync(path.join(corpusRoot, file), 'utf8');
			return { file, source, sha256: createHash('sha256').update(source).digest('hex') };
		});
}

function compilerErrors(result) {
	return [
		...result.semanticGraph.diagnostics,
		...result.publicRenderPlan.diagnostics,
		...result.publicRenderModule.diagnostics,
		...result.captureAnalysis.diagnostics,
		...result.symbolModules.diagnostics,
	]
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
}

// Client code is everything the compiler emits for the browser: the render module, its render-data module, and one module per symbol.
function clientParts(file, result) {
	const parts = {
		module: [result.publicRenderModule.moduleSource],
		renderData: [result.publicRenderModule.renderDataModuleSource],
		symbols: result.symbolModules.modules.map((module) => module.source),
	};
	if (Object.values(parts).every((sources) => sources.every((source) => !source))) {
		throw new TypeError(`${file} emitted empty client code`);
	}
	return parts;
}

function measuredFile(mode, entry, parts) {
	const compiled = zeroCompiled();
	const measuredParts = {};
	for (const [part, sources] of Object.entries(parts)) {
		const bytes = zeroCompiled();
		sources.forEach((code, index) => {
			if (!code) return;
			const minified = minifyJavaScript(code, `${entry.file}.${mode}.${part}.${index}.js`);
			addCompiled(bytes, {
				raw: Buffer.byteLength(code),
				minified: Buffer.byteLength(minified),
				gzip: gzipBytes(minified),
			});
		});
		addCompiled(compiled, bytes);
		measuredParts[part] = bytes;
	}
	if (compiled.raw === 0) throw new TypeError(`${entry.file} emitted empty ${mode} code`);
	return {
		mode,
		file: entry.file,
		source: sourceBytes(entry.source),
		compiled,
		parts: measuredParts,
	};
}

function zeroCompiled() {
	return { raw: 0, minified: 0, gzip: 0 };
}

function addCompiled(target, source) {
	for (const field of compiledByteFields) target[field] += source[field];
}

function minifyJavaScript(code, filename) {
	const result = minifySync(filename, code, { module: true, compress: true, mangle: true });
	if (result.errors.length > 0)
		throw new TypeError(`${filename} minification failed: ${result.errors.join('; ')}`);
	return result.code;
}

function codegenCase(mode, corpus, files) {
	const source = { raw: 0, gzip: 0 };
	const compiled = zeroCompiled();
	const parts = {};
	for (const file of files) {
		for (const field of ['raw', 'gzip']) source[field] += file.source[field];
		addCompiled(compiled, file.compiled);
		for (const [part, bytes] of Object.entries(file.parts))
			addCompiled((parts[part] ??= zeroCompiled()), bytes);
	}
	return {
		name: mode,
		gates: {
			passed: true,
			checks: [`${corpus.length} corpus hashes recorded`, 'compiler diagnostics empty'],
		},
		bodyBytes: compiled.raw,
		timing: deterministicTiming(),
		memory: deterministicMemory(),
		metrics: { samples: 1, bytes: { source, compiled, parts }, corpus, files },
	};
}

function sourceBytes(source) {
	return { raw: Buffer.byteLength(source), gzip: gzipBytes(source) };
}

function gzipBytes(value) {
	return gzipSync(Buffer.from(value), { level: zlibConstants.Z_BEST_COMPRESSION, mtime: 0 })
		.byteLength;
}

function manifestSignature(manifest) {
	if (!Array.isArray(manifest)) return '';
	return manifest.map((entry) => `${entry.file}:${entry.sha256}`).join('\n');
}

function assertByte(value, label) {
	if (!Number.isInteger(value) || value < 0)
		throw new TypeError(`codegen-size requires ${label} bytes`);
}

function passedResult({ protocol, environment, cases }) {
	return {
		schemaVersion: 1,
		kind: 'markless-benchmark-result',
		benchmark: 'codegen-size',
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
