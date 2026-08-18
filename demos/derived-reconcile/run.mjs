import os from 'node:os';
import { performance } from 'node:perf_hooks';

import { createRuntimeGraph } from '../../packages/runtime/src/graph.ts';

import { createFailedResult } from '../benchmarks/lib/results.mjs';

// This benchmark counts DOM-expression re-checks, never milliseconds. One
// re-check is one run of a `view-dom-update:*` graph subscription, which is
// exactly what `packages/web/src/resume-runtime.ts` registers per DOM update
// record.
//
// Every case writes one field of the state source — a path write such as
// `state.todos[i].completed`, the write a `@for` row's checkbox handler makes —
// re-derives the whole collection from it, and counts how many DOM expressions
// the derived node re-checked. The gate is the scaling law: one field change
// must re-check the same number of DOM expressions at N=100 as at N=1000.
// Before derived reconciliation a recomputed derived node dirtied its whole
// root path, so the count grew with N.

const STATE_NODE_ID = 'state-source';
const DERIVED_NODE_ID = 'derived-view';

export const DERIVED_RECONCILE_SIZES = [100, 1000];

// `expectedReChecks` is recorded as a metric, never as a gate: the gate is the
// scaling law (equal counts at every N), not an absolute number a later change
// could quietly retune.
export const DERIVED_RECONCILE_MODES = [
	{
		name: 'list-keyed',
		expectedReChecks: 1,
		measure: (size) => measureListCase({ size, keyed: true, computeNode: false }),
	},
	{
		name: 'list-identity',
		expectedReChecks: 2,
		measure: (size) => measureListCase({ size, keyed: false, computeNode: false }),
	},
	{
		name: 'object-fields',
		expectedReChecks: 1,
		measure: (size) => measureObjectCase({ size }),
	},
	{
		name: 'list-keyed-compute',
		expectedReChecks: 1,
		measure: (size) => measureListCase({ size, keyed: true, computeNode: true }),
	},
];

export function derivedReconcileProtocol(smoke) {
	return {
		mode: smoke ? 'smoke' : 'full',
		timedSeconds: 0,
		warmupMinimumRenders: 1,
		warmupSeconds: 0,
		maxSamples: 1,
		memoryMaxRenders: 0,
		forcedGc: false,
		sizes: [...DERIVED_RECONCILE_SIZES],
	};
}

export async function runDerivedReconcile({ protocol, environment, smoke = false } = {}) {
	const activeProtocol = protocol ?? derivedReconcileProtocol(smoke);
	const activeEnvironment = environment ?? localEnvironment();
	try {
		const measurements = [];
		for (const mode of DERIVED_RECONCILE_MODES) {
			for (const size of DERIVED_RECONCILE_SIZES) {
				const measured = await mode.measure(size);
				measurements.push({
					mode: mode.name,
					size,
					expectedReChecks: mode.expectedReChecks,
					...measured,
				});
			}
		}

		const evidence = evaluateDerivedReconcileEvidence(measurements);
		const cases = evidence.cases.map((entry) => benchmarkCase(entry));
		const result = evidence.passed
			? passedResult({ protocol: activeProtocol, environment: activeEnvironment, cases })
			: createFailedResult({
					benchmark: 'derived-reconcile',
					protocol: activeProtocol,
					environment: activeEnvironment,
					cases,
					failure: `${evidence.failures.join('; ')} | re-checks per case: ${evidence.summary}`,
				});
		validateDerivedReconcileResultSchema(result);
		return { result, exitCode: evidence.passed ? 0 : 1 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return {
			result: createFailedResult({
				benchmark: 'derived-reconcile',
				protocol: activeProtocol,
				environment: activeEnvironment,
				failure,
			}),
			exitCode: 1,
		};
	}
}

/**
 * Turns raw per-case measurements into correctness and scaling gates.
 *
 * `measurements` is one entry per (mode, size) pair:
 * `{ mode, size, expectedReChecks, reChecks, collectionRuns, changedValueSeen, changeFlushMs }`.
 */
export function evaluateDerivedReconcileEvidence(measurements) {
	if (!Array.isArray(measurements) || measurements.length === 0) {
		throw new TypeError('derived-reconcile evidence requires at least one measurement');
	}

	const byMode = new Map();
	for (const measurement of measurements) {
		assertMeasurement(measurement);
		const siblings = byMode.get(measurement.mode) ?? [];
		siblings.push(measurement);
		byMode.set(measurement.mode, siblings);
	}

	const cases = measurements.map((measurement) => {
		const name = caseName(measurement);
		const failures = [];
		const checks = [];

		if (measurement.changedValueSeen === true) {
			checks.push(`${name} delivered the changed value to its DOM-expression subscription`);
		} else {
			failures.push(`${name} never delivered the changed value to its DOM-expression subscription`);
		}

		const siblings = byMode.get(measurement.mode);
		const divergent = siblings.some((sibling) => sibling.reChecks !== measurement.reChecks);
		if (divergent) {
			failures.push(
				`${name} re-checks scale with N (${siblings.map((sibling) => `N=${sibling.size} reChecks ${sibling.reChecks}`).join(', ')}); one field change must re-check the same number of DOM expressions at every N`,
			);
		} else {
			checks.push(
				`${name} re-checked ${measurement.reChecks} DOM expression(s) after one field change, constant across every N`,
			);
		}

		checks.push(
			`${name} ran its collection subscription ${measurement.collectionRuns} time(s); reconciled target is ${measurement.expectedReChecks} re-check(s)`,
		);

		return { name, measurement, passed: failures.length === 0, failures, checks };
	});

	return {
		passed: cases.every((entry) => entry.passed),
		failures: cases.flatMap((entry) => entry.failures),
		checks: cases.flatMap((entry) => entry.checks),
		cases,
		summary: measurements
			.map((measurement) => `${caseName(measurement)} reChecks ${measurement.reChecks}`)
			.join('; '),
	};
}

export function validateDerivedReconcileResultSchema(result) {
	if (!Array.isArray(result?.cases) || result.cases.length === 0) {
		throw new TypeError('derived-reconcile result requires cases');
	}

	const seen = new Set();
	const reChecksByMode = new Map();
	for (const benchmarkCase of result.cases) {
		const label = benchmarkCase?.name ?? 'case';
		const metrics = benchmarkCase?.metrics;
		if (!metrics || typeof metrics !== 'object') {
			throw new TypeError(`derived-reconcile ${label} requires metrics`);
		}
		if (typeof metrics.mode !== 'string' || metrics.mode.length === 0) {
			throw new TypeError(`derived-reconcile ${label} requires metrics.mode`);
		}
		assertCount(metrics.size, `derived-reconcile ${label} metrics.size`);
		assertCount(metrics.reChecks, `derived-reconcile ${label} metrics.reChecks`);
		assertCount(metrics.collectionRuns, `derived-reconcile ${label} metrics.collectionRuns`);
		assertCount(metrics.expectedReChecks, `derived-reconcile ${label} metrics.expectedReChecks`);
		if (typeof metrics.changedValueSeen !== 'boolean') {
			throw new TypeError(`derived-reconcile ${label} metrics.changedValueSeen must be a boolean`);
		}

		const key = `${metrics.mode}@${metrics.size}`;
		if (seen.has(key)) throw new TypeError(`derived-reconcile reported ${key} twice`);
		seen.add(key);

		const sizes = reChecksByMode.get(metrics.mode) ?? new Map();
		sizes.set(metrics.size, metrics);
		reChecksByMode.set(metrics.mode, sizes);
	}

	for (const [mode, sizes] of reChecksByMode) {
		if (sizes.size < 2) {
			throw new TypeError(`derived-reconcile ${mode} must be measured at two or more sizes`);
		}
		if (result.status !== 'passed') continue;

		const counts = new Set([...sizes.values()].map((metrics) => metrics.reChecks));
		if (counts.size > 1) {
			throw new TypeError(
				`derived-reconcile ${mode} cannot pass while re-checks scale with N (${[...counts].join(' vs ')})`,
			);
		}
		for (const metrics of sizes.values()) {
			if (!metrics.changedValueSeen) {
				throw new TypeError(`derived-reconcile ${mode} cannot pass without changedValueSeen`);
			}
		}
	}

	return result;
}

/**
 * Rows `{ id, title, completed }` behind a derived list. Every row owns two
 * DOM-expression subscriptions (`title` and `completed`), a collection
 * subscription sits on the derived root, and the measured change is a single
 * state-path write to one row's `completed` field.
 *
 * The derive rebuilds the row that write touched and returns every other row
 * unchanged, so exactly one derived element is a fresh object and the rest keep
 * their identity — what a mapped `@for` collection produces.
 *
 * `computeNode: false` mirrors the production cell-backed computed: the derive
 * runs inside a demand subscription on the dependency and commits through
 * `graph.write`. `computeNode: true` mirrors a `compute`-carrying node.
 */
async function measureListCase({ size, keyed, computeNode }) {
	const rows = Array.from({ length: size }, (_, index) => ({
		id: `row-${index}`,
		title: `title-${index}`,
		completed: false,
	}));
	const changedIndex = Math.floor(size / 2);
	let toggledId;
	const derive = (todos) => todos.map((todo) => (todo.id === toggledId ? { ...todo } : todo));

	const counters = createCounters();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE_NODE_ID, value: rows }],
		computed: [
			{
				graphNodeId: DERIVED_NODE_ID,
				dependencies: [{ graphNodeId: STATE_NODE_ID, path: [] }],
				...(computeNode ? { compute: (read) => derive(read(STATE_NODE_ID)) } : {}),
				// Declares the derived root as a keyed array so reconciliation
				// matches rows by `id` instead of by element identity.
				...(keyed ? { reconcile: { keyed: [{ path: [], keyPath: ['id'] }] } } : {}),
			},
		],
	});

	if (!computeNode) subscribeDemand(graph, derive);
	subscribeCollection(graph, counters, 'rows');
	for (let index = 0; index < size; index++) {
		for (const field of ['title', 'completed']) {
			subscribeDomExpression(graph, counters, {
				host: `row-${index}`,
				path: [String(index), field],
				changed: index === changedIndex && field === 'completed',
			});
		}
	}

	await warmMount(graph, rows);
	counters.start();
	// The derive must rebuild exactly the row the write is about to change, so
	// the toggled id is set before the write, not inside it.
	toggledId = rows[changedIndex].id;
	const changeFlushMs = await changeFlush(graph, () => true, [
		String(changedIndex),
		'completed',
	]);

	const committed = graph.read(DERIVED_NODE_ID, [String(changedIndex), 'completed']);
	if (committed !== true) {
		throw new TypeError(`derived list did not commit the toggled row at index ${changedIndex}`);
	}

	return counters.report(true, changeFlushMs);
}

/**
 * A derived record `{ k0..kN }` built from a state array. Every field owns one
 * DOM-expression subscription and exactly one source element changes.
 */
async function measureObjectCase({ size }) {
	const values = Array.from({ length: size }, (_, index) => index);
	const changedIndex = Math.floor(size / 2);
	const changedValue = size + changedIndex;
	const derive = (items) => {
		const record = {};
		for (let index = 0; index < items.length; index++) record[`k${index}`] = items[index];
		return record;
	};

	const counters = createCounters();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE_NODE_ID, value: values }],
		computed: [
			{
				graphNodeId: DERIVED_NODE_ID,
				dependencies: [{ graphNodeId: STATE_NODE_ID, path: [] }],
			},
		],
	});

	subscribeDemand(graph, derive);
	subscribeCollection(graph, counters, 'fields');
	for (let index = 0; index < size; index++) {
		subscribeDomExpression(graph, counters, {
			host: `field-${index}`,
			path: [`k${index}`],
			changed: index === changedIndex,
		});
	}

	await warmMount(graph, values);
	counters.start();
	const changeFlushMs = await changeFlush(
		graph,
		() => changedValue,
		[String(changedIndex)],
	);

	const committed = graph.read(DERIVED_NODE_ID, [`k${changedIndex}`]);
	if (committed !== changedValue) {
		throw new TypeError(`derived record did not commit field k${changedIndex}`);
	}

	return counters.report(changedValue, changeFlushMs);
}

function createCounters() {
	const state = {
		counting: false,
		reChecks: 0,
		collectionRuns: 0,
		changedValue: undefined,
	};
	return {
		state,
		start() {
			state.counting = true;
			state.reChecks = 0;
			state.collectionRuns = 0;
			state.changedValue = undefined;
		},
		report(expectedChangedValue, changeFlushMs) {
			return {
				reChecks: state.reChecks,
				collectionRuns: state.collectionRuns,
				changedValueSeen: state.changedValue === expectedChangedValue,
				changeFlushMs,
			};
		},
	};
}

// One demand subscription per dependency: it runs the derive function and
// commits the derived value onto the derived node, exactly as the resume
// runtime does for a cell-backed computed.
function subscribeDemand(graph, derive) {
	graph.subscribe({
		id: `sync-computed-demand:${DERIVED_NODE_ID}:${STATE_NODE_ID}`,
		graphNodeId: STATE_NODE_ID,
		path: [],
		run: () => {
			graph.write({
				graphNodeId: DERIVED_NODE_ID,
				path: [],
				value: derive(graph.read(STATE_NODE_ID)),
			});
		},
	});
}

function subscribeCollection(graph, counters, label) {
	graph.subscribe({
		id: `keyed-repeat:${label}:${DERIVED_NODE_ID}`,
		graphNodeId: DERIVED_NODE_ID,
		path: [],
		run: () => {
			if (counters.state.counting) counters.state.collectionRuns++;
		},
	});
}

function subscribeDomExpression(graph, counters, { host, path, changed }) {
	graph.subscribe({
		id: `view-dom-update:${host}:${DERIVED_NODE_ID}:${path.join('.')}`,
		graphNodeId: DERIVED_NODE_ID,
		path,
		run: (value) => {
			if (!counters.state.counting) return;
			counters.state.reChecks++;
			if (changed) counters.state.changedValue = value;
		},
	});
}

// Warm mount: commit the whole derived value once and let every DOM-expression
// subscription run, so the measured flush observes steady-state work only.
async function warmMount(graph, source) {
	graph.write({ graphNodeId: STATE_NODE_ID, path: [], value: [...source] });
	await graph.flush();
}

async function changeFlush(graph, nextValue, path = []) {
	const started = performance.now();
	graph.write({ graphNodeId: STATE_NODE_ID, path, value: nextValue() });
	await graph.flush();
	return performance.now() - started;
}

function benchmarkCase(entry) {
	const { measurement } = entry;
	return {
		name: entry.name,
		gates: { passed: entry.passed, checks: entry.passed ? entry.checks : entry.failures },
		...(entry.passed
			? {
					bodyBytes: 0,
					timing: observedTiming(measurement.changeFlushMs),
					memory: deterministicMemory(),
				}
			: {}),
		metrics: {
			samples: 1,
			mode: measurement.mode,
			size: measurement.size,
			reChecks: measurement.reChecks,
			collectionRuns: measurement.collectionRuns,
			expectedReChecks: measurement.expectedReChecks,
			changedValueSeen: measurement.changedValueSeen,
		},
	};
}

function caseName(measurement) {
	return `${measurement.mode}-${measurement.size}`;
}

function assertMeasurement(measurement) {
	if (!measurement || typeof measurement !== 'object') {
		throw new TypeError('derived-reconcile measurement must be an object');
	}
	if (typeof measurement.mode !== 'string' || measurement.mode.length === 0) {
		throw new TypeError('derived-reconcile measurement requires a mode');
	}
	assertCount(measurement.size, 'derived-reconcile measurement.size');
	assertCount(measurement.reChecks, 'derived-reconcile measurement.reChecks');
	assertCount(measurement.collectionRuns, 'derived-reconcile measurement.collectionRuns');
	if (typeof measurement.changedValueSeen !== 'boolean') {
		throw new TypeError('derived-reconcile measurement.changedValueSeen must be a boolean');
	}
}

function assertCount(value, label) {
	if (!Number.isInteger(value) || value < 0) {
		throw new TypeError(`${label} must be a non-negative integer`);
	}
}

function passedResult({ protocol, environment, cases }) {
	return {
		schemaVersion: 1,
		kind: 'markless-benchmark-result',
		benchmark: 'derived-reconcile',
		status: 'passed',
		recordedAt: new Date().toISOString(),
		protocol,
		environment,
		cases,
	};
}

// Observational only. Re-check counts are the oracle; milliseconds are never a
// gate here because time hides the O(N).
function observedTiming(changeFlushMs) {
	const value = Number.isFinite(changeFlushMs) ? changeFlushMs : 0;
	return {
		samples: 1,
		minMs: value,
		p50Ms: value,
		p95Ms: value,
		p99Ms: value,
		meanMs: value,
		opsPerSec: null,
	};
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

function localEnvironment() {
	return {
		os: `${os.platform()} ${os.release()}`,
		arch: os.arch(),
		cpuModel: os.cpus()[0]?.model ?? 'unknown',
		nodeVersion: process.version,
		pnpmVersion: 'unknown',
		gitSha: '0'.repeat(40),
		dirtyTree: false,
	};
}
