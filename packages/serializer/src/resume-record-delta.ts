import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';
import type { ResumeRecordSet } from './resume-record-merge.ts';
import { serializeGraphValue } from './value.ts';

export { mergeResumeRecordDelta, type ResumeRecordSet } from './resume-record-merge.ts';

export type ResumeRecordDeltaClassification =
	| { readonly kind: 'empty' }
	| { readonly kind: 'divergent'; readonly delta: ResumeRecordSet };

// Every protocol record is compared independently by its durable value. Props
// are cells, so cells, computed snapshots, and props all follow this one rule.
// The resulting payload contains only request records that are new or changed.
export function classifyResumeRecordDelta(
	baseline: ResumeRecordSet,
	request: ResumeRecordSet,
): ResumeRecordDeltaClassification {
	// Validate the complete inputs before selecting known keyed records. This
	// keeps an unsupported request-only value from being silently discarded.
	durableComparisonValue(baseline, 'build baseline');
	durableComparisonValue(request, 'request records');
	assertMatchingVersion(baseline.state.version, request.state.version, 'state');
	assertMatchingVersion(baseline.view.version, request.view.version, 'view');

	const state = {
		version: request.state.version,
		cells: divergentRecords(baseline.state.cells, request.state.cells, stateCellKey, 'state cell'),
		computed: divergentRecords(
			baseline.state.computed,
			request.state.computed,
			stateComputedKey,
			'computed',
		),
		...optionalRecordDelta(
			baseline.state,
			request.state,
			'sharedDefinitions',
			(record) => record.id,
			'shared definition',
		),
		...optionalRecordDelta(
			baseline.state,
			request.state,
			'storage',
			(record) => record.graphNodeId,
			'storage',
		),
	} satisfies ProtocolStatePayload;
	const view = {
		version: request.view.version,
		...asyncRunnerDelta(baseline.view, request.view),
		locators: divergentRecords(
			baseline.view.locators,
			request.view.locators,
			(record) => record.hostNodeId,
			'view locator',
		),
		events: divergentRecords(
			baseline.view.events,
			request.view.events,
			(record) => `${record.hostNodeId}\0${record.eventName}`,
			'view event',
		),
		domUpdates: divergentRecords(
			baseline.view.domUpdates,
			request.view.domUpdates,
			(record) => `${record.hostNodeId}\0${record.graphNodeId}\0${record.source}`,
			'DOM update',
		),
		behaviors: divergentRecords(
			baseline.view.behaviors,
			request.view.behaviors,
			(record) => `${record.hostNodeId}\0${record.source}`,
			'behavior',
		),
		elementHandles: divergentRecords(
			baseline.view.elementHandles,
			request.view.elementHandles,
			(record) => `${record.hostNodeId}\0${record.handleId}`,
			'element handle',
		),
		...optionalRecordDelta(
			baseline.view,
			request.view,
			'keyedRepeats',
			(record) => record.id,
			'keyed repeat',
		),
		...optionalRecordDelta(
			baseline.view,
			request.view,
			'branches',
			(record) => record.id,
			'branch',
		),
		asyncBoundaries: divergentRecords(
			baseline.view.asyncBoundaries,
			request.view.asyncBoundaries,
			(record) => record.id,
			'async boundary',
		),
	} satisfies ProtocolViewPayload;
	const delta = { state, view };
	return hasDeltaRecords(delta) ? { kind: 'divergent', delta } : { kind: 'empty' };
}

function stateCellKey(record: ProtocolStatePayload['cells'][number]): string {
	return record.graphNodeId;
}

function stateComputedKey(record: ProtocolStatePayload['computed'][number]): string {
	return record.graphNodeId;
}

function divergentRecords<T>(
	baseline: ReadonlyArray<T>,
	request: ReadonlyArray<T>,
	key: (record: T) => string,
	label: string,
): ReadonlyArray<T> {
	const baselineByKey = uniqueRecords(baseline, key, `build baseline ${label}`);
	const requestByKey = uniqueRecords(request, key, `request ${label}`);
	for (const baselineKey of baselineByKey.keys()) {
		if (!requestByKey.has(baselineKey)) {
			throw new Error(`MARKLESS_RESUME_RECORD_DELTA_REMOVAL_UNSUPPORTED: ${label} ${baselineKey}.`);
		}
	}
	return request.filter((record) => {
		const baselineRecord = baselineByKey.get(key(record));
		return (
			baselineRecord === undefined ||
			durableComparisonValue(baselineRecord, `build baseline ${label}`) !==
				durableComparisonValue(record, `request ${label}`)
		);
	});
}

function uniqueRecords<T>(
	records: ReadonlyArray<T>,
	key: (record: T) => string,
	source: string,
): Map<string, T> {
	const result = new Map<string, T>();
	for (const record of records) {
		const recordKey = key(record);
		if (result.has(recordKey)) {
			throw new Error(`MARKLESS_RESUME_RECORD_DELTA_DUPLICATE_KEY: ${source} ${recordKey}.`);
		}
		result.set(recordKey, record);
	}
	return result;
}

function optionalRecordDelta<
	T extends object,
	K extends {
		[P in keyof T]-?: T[P] extends ReadonlyArray<unknown> | undefined ? P : never;
	}[keyof T],
>(
	baseline: T,
	request: T,
	property: K,
	key: (record: NonNullable<T[K]> extends ReadonlyArray<infer R> ? R : never) => string,
	label: string,
): Partial<Pick<T, K>> {
	const baselineRecords = baseline[property] as ReadonlyArray<never> | undefined;
	const requestRecords = request[property] as ReadonlyArray<never> | undefined;
	if (requestRecords === undefined) {
		if (baselineRecords !== undefined)
			throw new Error(`MARKLESS_RESUME_RECORD_DELTA_REMOVAL_UNSUPPORTED: ${label} set.`);
		return {};
	}
	return {
		[property]: divergentRecords(baselineRecords ?? [], requestRecords, key, label),
	} as Partial<Pick<T, K>>;
}

function asyncRunnerDelta(
	baseline: ProtocolViewPayload,
	request: ProtocolViewPayload,
): Pick<ProtocolViewPayload, 'asyncRunners'> | Record<never, never> {
	if (request.asyncRunners === undefined) {
		if (baseline.asyncRunners !== undefined)
			throw new Error('MARKLESS_RESUME_RECORD_DELTA_REMOVAL_UNSUPPORTED: async runner set.');
		return {};
	}
	const delta: Record<string, string> = {};
	for (const key of Object.keys(baseline.asyncRunners ?? {})) {
		if (!(key in request.asyncRunners))
			throw new Error(`MARKLESS_RESUME_RECORD_DELTA_REMOVAL_UNSUPPORTED: async runner ${key}.`);
	}
	for (const [key, value] of Object.entries(request.asyncRunners)) {
		if (baseline.asyncRunners?.[key] !== value) delta[key] = value;
	}
	return { asyncRunners: delta };
}

function hasDeltaRecords(delta: ResumeRecordSet): boolean {
	return (
		delta.state.cells.length > 0 ||
		delta.state.computed.length > 0 ||
		(delta.state.sharedDefinitions?.length ?? 0) > 0 ||
		(delta.state.storage?.length ?? 0) > 0 ||
		Object.keys(delta.view.asyncRunners ?? {}).length > 0 ||
		delta.view.locators.length > 0 ||
		delta.view.events.length > 0 ||
		delta.view.domUpdates.length > 0 ||
		delta.view.behaviors.length > 0 ||
		delta.view.elementHandles.length > 0 ||
		(delta.view.keyedRepeats?.length ?? 0) > 0 ||
		(delta.view.branches?.length ?? 0) > 0 ||
		delta.view.asyncBoundaries.length > 0
	);
}

function assertMatchingVersion(baseline: number, request: number, payload: string): void {
	if (baseline !== request) {
		throw new Error(
			`MARKLESS_RESUME_RECORD_DELTA_VERSION_MISMATCH: ${payload} ${baseline} !== ${request}.`,
		);
	}
}

function durableComparisonValue(value: unknown, source: string): string {
	const result = serializeGraphValue(value);
	if (!result.ok) {
		const diagnostic = result.diagnostics[0];
		throw new Error(
			`MARKLESS_RESUME_RECORD_DIVERGENCE_UNSERIALIZABLE: ${source} contains ` +
				`${diagnostic?.valueKind ?? 'unsupported'} at ${diagnostic?.statePath ?? '<root>'}.`,
		);
	}
	return JSON.stringify(result.payload);
}
