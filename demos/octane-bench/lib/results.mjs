import fs from 'node:fs';
import path from 'node:path';

export const RESULT_SCHEMA_VERSION = 1;

export function createFailedResult({ lane, protocol, environment, failure, cases = [] }) {
	return {
		schemaVersion: RESULT_SCHEMA_VERSION,
		kind: 'markless-benchmark-result',
		lane,
		status: 'failed',
		recordedAt: new Date().toISOString(),
		protocol,
		environment,
		cases,
		failure,
	};
}

export function assertResult(value) {
	assertNoForbiddenMetricNames(value);
	assertObject(value, 'result');
	assertEqual(value.schemaVersion, RESULT_SCHEMA_VERSION, 'result.schemaVersion');
	assertEqual(value.kind, 'markless-benchmark-result', 'result.kind');
	assertString(value.lane, 'result.lane');
	if (value.status !== 'passed' && value.status !== 'failed') {
		throw new TypeError('result.status must be "passed" or "failed"');
	}
	assertString(value.recordedAt, 'result.recordedAt');
	assertProtocol(value.protocol);
	assertEnvironment(value.environment);
	if (!Array.isArray(value.cases)) throw new TypeError('result.cases must be an array');
	for (const [index, benchmarkCase] of value.cases.entries()) {
		assertCase(benchmarkCase, index);
	}
	if (value.status === 'failed') assertString(value.failure, 'result.failure');
	if (value.status === 'passed' && value.cases.some((entry) => !entry.gates.passed)) {
		throw new TypeError('passed result cannot contain a failed correctness gate');
	}
	return value;
}

function assertNoForbiddenMetricNames(value, path = 'result') {
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value)) {
		if (key.toLowerCase().includes(['hyd', 'rate'].join(''))) {
			throw new TypeError(`${path}.${key} uses a forbidden metric name; use resume_first_dispatch_ms`);
		}
		assertNoForbiddenMetricNames(child, `${path}.${key}`);
	}
}

export function assertBaseline(value, expectedLane) {
	assertResult(value);
	if (value.status !== 'passed') throw new TypeError('baseline must contain a passed result');
	if (expectedLane && value.lane !== expectedLane) {
		throw new TypeError(`baseline lane must be ${expectedLane}`);
	}
	if (!/^[0-9a-f]{40}$/.test(value.environment.gitSha)) {
		throw new TypeError('baseline environment.gitSha must be a full Git SHA');
	}
	return value;
}

export function readResult(filePath) {
	return assertResult(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

export function readBaseline(filePath, expectedLane) {
	return assertBaseline(JSON.parse(fs.readFileSync(filePath, 'utf8')), expectedLane);
}

export function writeResult(filePath, result) {
	assertResult(result);
	writeJson(filePath, result);
}

export function writeBaseline(filePath, result) {
	assertBaseline(result, result.lane);
	writeJson(filePath, result);
}

function writeJson(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, '\t')}\n`);
	fs.renameSync(temporaryPath, filePath);
}

function assertProtocol(protocol) {
	assertObject(protocol, 'result.protocol');
	if (protocol.mode !== 'full' && protocol.mode !== 'smoke') {
		throw new TypeError('result.protocol.mode must be "full" or "smoke"');
	}
	for (const field of [
		'timedSeconds',
		'warmupMinimumRenders',
		'warmupSeconds',
		'maxSamples',
		'memoryMaxRenders',
	]) {
		assertFiniteNumber(protocol[field], `result.protocol.${field}`);
	}
	assertEqual(protocol.forcedGc, false, 'result.protocol.forcedGc');
}

function assertEnvironment(environment) {
	assertObject(environment, 'result.environment');
	for (const field of ['os', 'arch', 'cpuModel', 'nodeVersion', 'pnpmVersion', 'gitSha']) {
		assertString(environment[field], `result.environment.${field}`);
	}
	if (typeof environment.dirtyTree !== 'boolean') {
		throw new TypeError('result.environment.dirtyTree must be a boolean');
	}
}

function assertCase(benchmarkCase, index) {
	const label = `result.cases[${index}]`;
	assertObject(benchmarkCase, label);
	assertString(benchmarkCase.name, `${label}.name`);
	assertObject(benchmarkCase.gates, `${label}.gates`);
	if (typeof benchmarkCase.gates.passed !== 'boolean' || !Array.isArray(benchmarkCase.gates.checks)) {
		throw new TypeError(`${label}.gates must contain passed and checks`);
	}
	if (!benchmarkCase.gates.passed && 'timing' in benchmarkCase) {
		throw new TypeError(`${label} must not contain timing when its gates failed`);
	}
	if (benchmarkCase.gates.passed) {
		assertFiniteNumber(benchmarkCase.bodyBytes, `${label}.bodyBytes`);
		assertTiming(benchmarkCase.timing, `${label}.timing`);
		assertMemory(benchmarkCase.memory, `${label}.memory`);
	}
}

function assertTiming(timing, label) {
	assertObject(timing, label);
	for (const field of ['samples', 'minMs', 'p50Ms', 'p95Ms', 'p99Ms', 'meanMs', 'opsPerSec']) {
		assertFiniteNumber(timing[field], `${label}.${field}`);
	}
}

function assertMemory(memory, label) {
	assertObject(memory, label);
	assertEqual(memory.label, 'allocator-growth-observation', `${label}.label`);
	for (const field of ['renders', 'rssGrowthBytes', 'heapGrowthBytes']) {
		assertFiniteNumber(memory[field], `${label}.${field}`, field !== 'renders');
	}
	assertEqual(memory.forcedGc, false, `${label}.forcedGc`);
}

function assertObject(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object`);
	}
}

function assertString(value, label) {
	if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a string`);
}

function assertFiniteNumber(value, label, allowNegative = false) {
	if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
		throw new TypeError(`${label} must be a finite ${allowNegative ? '' : 'non-negative '}number`);
	}
}

function assertEqual(actual, expected, label) {
	if (actual !== expected) throw new TypeError(`${label} must be ${JSON.stringify(expected)}`);
}
