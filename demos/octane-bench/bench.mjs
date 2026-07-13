#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build, createBuilder } from 'vite';
import { assertResult, writeBaseline, writeResult } from './lib/results.mjs';
import { runSsrThroughput } from './lanes/ssr-throughput/run.mjs';
import { runStreamingSsr } from './lanes/streaming-ssr/run.mjs';
import { runNews } from './lanes/news/run.mjs';
import { checkGeneratedFixture } from './lanes/signal-favoring/gen.mjs';
import { runSignalFavoring } from './lanes/signal-favoring/run.mjs';

process.env.NODE_ENV = 'production';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((argument) => argument.startsWith('--')));
const lane = args.find((argument) => !argument.startsWith('--'));
const laneDefinitions = {
	'ssr-throughput': { run: runSsrThroughput, protocol: ssrThroughputProtocol },
	'streaming-ssr': { run: runStreamingSsr, protocol: streamingSsrProtocol },
	news: { run: runNews, protocol: newsProtocol },
	'signal-favoring': { run: runSignalFavoring, protocol: signalFavoringProtocol },
};
const laneDefinition = laneDefinitions[lane];

if (!laneDefinition) {
	console.error(
		'usage: node bench.mjs <ssr-throughput|streaming-ssr|news|signal-favoring> [--smoke] [--record] [--build-only] [--ssr-only] [--gen-check]',
	);
	process.exit(2);
}

if (lane === 'signal-favoring' && flags.has('--gen-check')) {
	const summary = checkGeneratedFixture();
	console.log(`signal-favoring generator check passed: ${summary.levels} levels, ${summary.owners.length} owners`);
	process.exit(0);
}

const fixtureRoot = path.join(root, 'lanes', lane, 'fixture');
await buildFixture(fixtureRoot);
if (flags.has('--build-only')) {
	console.log(`built ${lane} production fixture`);
	process.exit(0);
}

const smoke = flags.has('--smoke');
const protocol = laneDefinition.protocol(smoke);
const environment = collectEnvironment();
let fixture;
if (lane !== 'signal-favoring') {
	const entryPath = path.join(
		fixtureRoot,
		'dist',
		...(lane === 'news' ? ['server', 'entry-server.js'] : ['entry-server.js']),
	);
	fixture = await import(`${pathToFileURL(entryPath).href}?built=${Date.now()}`);
}
const outcome = await laneDefinition.run({
	...(fixture ? { fixture } : {}),
	protocol,
	environment,
	ssrOnly: flags.has('--ssr-only'),
	clientDirectory: path.join(fixtureRoot, 'dist', ...(lane === 'signal-favoring' ? [] : ['client'])),
	receiptPath: path.join(root, 'dist', 'results', `${lane}-analyzer-verdict.json`),
});
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
	if (lane === 'signal-favoring') {
		console.error('building signal-favoring production client fixture…');
		execFileSync('pnpm', ['exec', 'vp', 'build'], { cwd: fixtureDirectory, stdio: 'inherit' });
		return;
	}
	if (lane === 'news') {
		console.error('building news production client and SSR fixtures…');
		const builder = await createBuilder({
			root: fixtureDirectory,
			configFile: path.join(fixtureDirectory, 'vite.config.mjs'),
			mode: 'production',
			logLevel: 'warn',
		});
		await builder.buildApp();
		return;
	}
	console.error(`building ${lane} production SSR fixture…`);
	await build({
		root: fixtureDirectory,
		configFile: path.join(fixtureDirectory, 'vite.config.mjs'),
		mode: 'production',
		logLevel: 'warn',
	});
}

function newsProtocol(smoke) {
	return {
		mode: smoke ? 'smoke' : 'full',
		timedSeconds: 0,
		warmupMinimumRenders: 5,
		warmupSeconds: 0,
		maxSamples: 20,
		memoryMaxRenders: 0,
		forcedGc: false,
		ssrWarmups: 5,
		ssrSamples: 20,
		clientWarmups: 5,
		clientSamples: smoke ? 1 : 20,
	};
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

function signalFavoringProtocol(smoke) {
	return {
		mode: smoke ? 'smoke' : 'full',
		timedSeconds: 0,
		warmupMinimumRenders: 5,
		warmupSeconds: 0,
		maxSamples: smoke ? 1 : 20,
		memoryMaxRenders: 0,
		forcedGc: false,
		browserForcedGc: true,
		operationWarmups: 5,
		operationSamples: smoke ? 1 : 20,
		writeRepetitions: 50,
		sweepRepetitions: 25,
		sampleYieldMs: 5,
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
	} else if (result.lane === 'news') {
		const benchmarkCase = result.cases[0];
		console.log(`warm SSR p50: ${benchmarkCase.timing.p50Ms.toFixed(3)} ms (${benchmarkCase.timing.samples} samples)`);
		console.log(`HTML: ${benchmarkCase.bodyBytes} bytes`);
		if (benchmarkCase.metrics) {
			console.log(`resume + first dispatch p50: ${benchmarkCase.metrics.resume_first_dispatch_ms.p50Ms.toFixed(3)} ms`);
			console.log(`preloaded client: ${benchmarkCase.metrics.preloaded_client_bytes} bytes`);
			console.log(`startup executed: ${benchmarkCase.metrics.startup_executed_bytes ?? 'unavailable'} bytes`);
		}
	} else if (result.lane === 'signal-favoring') {
		console.log('operation                 p50 ms    p95 ms   computeds   DOM nodes   batches');
		for (const benchmarkCase of result.cases) {
			const evidence = benchmarkCase.metrics.counterEvidence.actual;
			console.log(
				`${benchmarkCase.name.padEnd(25)} ${benchmarkCase.timing.p50Ms.toFixed(3).padStart(8)} ${benchmarkCase.timing.p95Ms.toFixed(3).padStart(9)} ${String(evidence.recomputations).padStart(11)} ${String(evidence.domMutations).padStart(11)} ${String(evidence.mutationBatches).padStart(9)}`,
			);
		}
		console.log('browser GC is requested before timed samples; timed propagation windows allow zero requests');
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
