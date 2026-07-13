#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'vite';
import { assertResult, writeBaseline, writeResult } from './lib/results.mjs';
import { runSsrThroughput } from './lanes/ssr-throughput/run.mjs';
import { runStreamingSsr } from './lanes/streaming-ssr/run.mjs';

process.env.NODE_ENV = 'production';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((argument) => argument.startsWith('--')));
const lane = args.find((argument) => !argument.startsWith('--'));
const laneDefinitions = {
	'ssr-throughput': { run: runSsrThroughput, protocol: ssrThroughputProtocol },
	'streaming-ssr': { run: runStreamingSsr, protocol: streamingSsrProtocol },
};
const laneDefinition = laneDefinitions[lane];

if (!laneDefinition) {
	console.error(
		'usage: node bench.mjs <ssr-throughput|streaming-ssr> [--smoke] [--record] [--build-only]',
	);
	process.exit(2);
}

const fixtureRoot = path.join(root, 'lanes', lane, 'fixture');
await buildFixture(fixtureRoot);
if (flags.has('--build-only')) {
	console.log(`built ${lane} production SSR fixture`);
	process.exit(0);
}

const smoke = flags.has('--smoke');
const protocol = laneDefinition.protocol(smoke);
const environment = collectEnvironment();
const entryPath = path.join(fixtureRoot, 'dist', 'entry-server.js');
const fixture = await import(`${pathToFileURL(entryPath).href}?built=${Date.now()}`);
const outcome = await laneDefinition.run({ fixture, protocol, environment });
assertResult(outcome.result);

const resultPath = process.env.BENCH_JSON
	? path.resolve(process.env.BENCH_JSON)
	: path.join(root, 'dist', 'results', `${lane}.json`);
writeResult(resultPath, outcome.result);
printSummary(outcome.result, resultPath);

if (flags.has('--record')) {
	if (outcome.result.status !== 'passed') {
		console.error('baseline was not recorded because correctness gates failed');
	} else {
		const baselinePath = path.join(root, 'baselines', 'local', `${lane}.json`);
		writeBaseline(baselinePath, outcome.result);
		console.error(`baseline written: ${path.relative(root, baselinePath)}`);
	}
}

process.exitCode = outcome.exitCode;

async function buildFixture(fixtureDirectory) {
	console.error(`building ${lane} production SSR fixture…`);
	await build({
		root: fixtureDirectory,
		configFile: path.join(fixtureDirectory, 'vite.config.mjs'),
		mode: 'production',
		logLevel: 'warn',
	});
}

function ssrThroughputProtocol(smoke) {
	return {
		mode: smoke ? 'smoke' : 'full',
		timedSeconds: smoke ? 1 : 10,
		warmupMinimumRenders: 3,
		warmupSeconds: smoke ? 0.1 : 1,
		maxSamples: 200_000,
		memoryMaxRenders: smoke ? 100 : 5_000,
		forcedGc: false,
	};
}

function streamingSsrProtocol(smoke) {
	return {
		mode: smoke ? 'smoke' : 'full',
		timedSeconds: 0,
		warmupMinimumRenders: smoke ? 1 : 5,
		warmupSeconds: 0,
		maxSamples: smoke ? 3 : 30,
		memoryMaxRenders: 0,
		forcedGc: false,
		warmupRenders: smoke ? 1 : 5,
		timedRenders: smoke ? 3 : 30,
	};
}

function collectEnvironment() {
	return {
		os: `${os.platform()} ${os.release()}`,
		arch: os.arch(),
		cpuModel: os.cpus()[0]?.model ?? 'unknown',
		nodeVersion: process.version,
		pnpmVersion: commandOutput('pnpm', ['--version'], 'unknown'),
		gitSha: commandOutput('git', ['rev-parse', 'HEAD'], '0'.repeat(40)),
		dirtyTree: commandOutput('git', ['status', '--porcelain'], '').length > 0,
	};
}

function commandOutput(command, commandArgs, fallback) {
	try {
		return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8' }).trim();
	} catch {
		return fallback;
	}
}

function printSummary(result, resultPath) {
	console.log(`\n${result.lane} — ${result.status} (${result.protocol.mode})`);
	if (result.status === 'failed') {
		console.log(`correctness gate failed: ${result.failure}`);
	} else if (result.lane === 'streaming-ssr') {
		console.log('scenario       shell p50 ms   total p50 ms   chunks   total bytes   renders/sec');
		for (const benchmarkCase of result.cases) {
			const rendersPerSec = benchmarkCase.metadata.rendersPerSec;
			console.log(
				`${benchmarkCase.name.padEnd(14)} ${benchmarkCase.shellTiming.p50Ms.toFixed(3).padStart(12)} ${benchmarkCase.timing.p50Ms.toFixed(3).padStart(14)} ${String(benchmarkCase.metadata.chunkCount).padStart(8)} ${String(benchmarkCase.metadata.totalBytes).padStart(13)} ${rendersPerSec === undefined ? '—'.padStart(13) : rendersPerSec.toFixed(1).padStart(13)}`,
			);
		}
		console.log('chunk count and total bytes are unnormalized framework-specific metadata');
	} else {
		console.log('case                 ops/sec    p50 ms    p95 ms    p99 ms    min ms   body bytes   rss growth   heap growth');
		for (const benchmarkCase of result.cases) {
			const timing = benchmarkCase.timing;
			console.log(
				`${benchmarkCase.name.padEnd(20)} ${timing.opsPerSec.toFixed(1).padStart(8)} ${timing.p50Ms.toFixed(3).padStart(9)} ${timing.p95Ms.toFixed(3).padStart(9)} ${timing.p99Ms.toFixed(3).padStart(9)} ${timing.minMs.toFixed(3).padStart(9)} ${String(benchmarkCase.bodyBytes).padStart(12)} ${String(benchmarkCase.memory.rssGrowthBytes).padStart(12)} ${String(benchmarkCase.memory.heapGrowthBytes).padStart(13)}`,
			);
		}
		console.log('memory columns are allocator-growth observations; forced GC is never used');
	}
	console.log(`JSON result: ${path.relative(root, resultPath)}`);
}
