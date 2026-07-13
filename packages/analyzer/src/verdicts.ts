import type {
	AnalyzerCanonicalInvariantId,
	AnalyzerCanonicalInvariantResult,
	AnalyzerBenchmarkVerdictReportV2,
	AnalyzerInvariantId,
	AnalyzerInvariantResult,
	AnalyzerVerdictReportV2,
	CreateBenchmarkVerdictReportInput,
	CreateVerdictReportInput,
} from './contracts.ts';

const browserSuffixes = new Set([
	'I1-CONSOLE',
	'I2-NETWORK',
	'I3-BOUNDARY-MISSING',
	'I3-PENDING-TIMEOUT',
	'I3-REJECTED',
	'I4-WIRING-MISSING',
	'I4-UNCLASSIFIED',
	'I5-BOOTSTRAP-BUDGET',
	'I5-ACTION-BUDGET',
]);
const seamIds = new Set([
	'MLA-S1-PRELOAD-INTEGRITY',
	'MLA-S2-PAYLOAD-WIRING',
	'MLA-S3-LOCATOR-RESOLUTION',
	'MLA-S4-STRIP-GUARANTEE',
]);
const externalId = /^MLA-EXT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

const fail = (path: string, message: string): never => {
	throw new Error(`Analyzer verdict schema violation at ${path}: ${message}`);
};
const record = (value: unknown, path: string): Record<string, unknown> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		fail(path, 'must be an object');
	return value as Record<string, unknown>;
};
const nonempty = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value.length === 0) fail(path, 'must be a nonempty string');
	return value;
};

export function normalizeInvariantId(
	id: AnalyzerInvariantId | string,
): AnalyzerCanonicalInvariantId {
	const canonical = id.startsWith('BQA-') ? `MLA-${id.slice(4)}` : id;
	const browserSuffix = canonical.startsWith('MLA-') ? canonical.slice(4) : '';
	if (
		!browserSuffixes.has(browserSuffix) &&
		!seamIds.has(canonical) &&
		!externalId.test(canonical)
	)
		fail('$invariant.id', `unknown invariant ID ${JSON.stringify(id)}`);
	return canonical as AnalyzerCanonicalInvariantId;
}

function readResult(value: unknown, path: string): AnalyzerCanonicalInvariantResult {
	const input = record(value, path);
	const id = nonempty(input.id, `${path}.id`);
	let normalized: AnalyzerCanonicalInvariantId;
	try {
		normalized = normalizeInvariantId(id);
	} catch {
		fail(`${path}.id`, 'must be a canonical MLA ID or supported BQA alias');
	}
	if (!['pass', 'fail', 'not-run'].includes(input.status as string))
		fail(`${path}.status`, 'must be pass, fail, or not-run');
	if (!Array.isArray(input.details) || input.details.some((detail) => typeof detail !== 'string'))
		fail(`${path}.details`, 'must be an array of strings');
	return {
		id: normalized,
		status: input.status as AnalyzerInvariantResult['status'],
		details: [...input.details],
	};
}

export function validateVerdictReport(value: unknown): AnalyzerVerdictReportV2 {
	const input = record(value, '$report');
	const allowed = new Set(['version', 'source', 'lane', 'results', 'passed', 'metadata']);
	for (const key of Object.keys(input))
		if (!allowed.has(key)) fail(`$report.${key}`, 'is not allowed');
	if (input.version !== 2) fail('$report.version', 'must equal 2');
	const source = nonempty(input.source, '$report.source');
	const lane = nonempty(input.lane, '$report.lane');
	if (!Array.isArray(input.results)) fail('$report.results', 'must be an array');
	if (typeof input.passed !== 'boolean') fail('$report.passed', 'must be a boolean');
	if (input.metadata !== undefined) record(input.metadata, '$report.metadata');
	return {
		version: 2,
		source,
		lane,
		results: input.results.map((result, index) =>
			readResult(result, `$report.results[${index}]`),
		),
		passed: input.passed,
		...(input.metadata === undefined
			? {}
			: { metadata: input.metadata as Readonly<Record<string, unknown>> }),
	};
}

export function createVerdictReport(input: CreateVerdictReportInput): AnalyzerVerdictReportV2 {
	const results = (input.results ?? []).map((result, index) =>
		readResult(result, `$report.results[${index}]`),
	);
	return validateVerdictReport({
		version: 2,
		source: input.source,
		lane: input.lane,
		results,
		passed: input.passed ?? results.every((result) => result.status !== 'fail'),
		...(input.metadata === undefined ? {} : { metadata: input.metadata }),
	});
}

export function createBenchmarkVerdictReport(
	input: CreateBenchmarkVerdictReportInput,
): AnalyzerBenchmarkVerdictReportV2 {
	const benchmark = nonempty(input.benchmark, '$report.benchmark');
	const report = createVerdictReport({
		...input,
		lane: benchmark,
	});
	return {
		version: report.version,
		source: report.source,
		benchmark,
		results: report.results,
		passed: report.passed,
		...(report.metadata === undefined ? {} : { metadata: report.metadata }),
	};
}

export function appendInvariantResult(
	report: AnalyzerVerdictReportV2,
	result: AnalyzerInvariantResult,
): AnalyzerVerdictReportV2 {
	const current = validateVerdictReport(report);
	const appended = readResult(result, `$report.results[${current.results.length}]`);
	return validateVerdictReport({
		...current,
		results: [...current.results, appended],
		passed: current.passed && appended.status !== 'fail',
	});
}

export function readVerdictReport(value: unknown): AnalyzerVerdictReportV2 {
	const input = record(value, '$report');
	if (input.version === 2) return validateVerdictReport(input);
	if (input.version !== 1) fail('$report.version', 'must equal 1 or 2');
	if (!Array.isArray(input.actions)) fail('$report.actions', 'must be an array');
	if (typeof input.passed !== 'boolean') fail('$report.passed', 'must be a boolean');
	const results = input.actions.flatMap((action, actionIndex) => {
		const actionRecord = record(action, `$report.actions[${actionIndex}]`);
		if (!Array.isArray(actionRecord.invariants))
			fail(`$report.actions[${actionIndex}].invariants`, 'must be an array');
		return actionRecord.invariants.map((result, resultIndex) =>
			readResult(result, `$report.actions[${actionIndex}].invariants[${resultIndex}]`),
		);
	});
	return validateVerdictReport({
		version: 2,
		source: 'browser-qa',
		lane: 'browser-invariants',
		results,
		passed: input.passed,
	});
}
