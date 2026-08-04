import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';

export type ResumeRecordSet = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

// Payload records win by key without pulling server-only classification into clients.
export function mergeResumeRecordDelta(
	baseline: ResumeRecordSet,
	delta: ResumeRecordSet,
): ResumeRecordSet {
	assertMatchingVersion(baseline.state.version, delta.state.version, 'state');
	assertMatchingVersion(baseline.view.version, delta.view.version, 'view');
	return {
		state: {
			...baseline.state,
			cells: mergeRecords(baseline.state.cells, delta.state.cells, (record) => record.graphNodeId),
			computed: mergeRecords(
				baseline.state.computed,
				delta.state.computed,
				(record) => record.graphNodeId,
			),
			...mergeOptionalRecords(
				baseline.state,
				delta.state,
				'sharedDefinitions',
				(record) => record.id,
			),
			...mergeOptionalRecords(
				baseline.state,
				delta.state,
				'storage',
				(record) => record.graphNodeId,
			),
		},
		view: {
			...baseline.view,
			...mergeAsyncRunners(baseline.view, delta.view),
			locators: mergeRecords(
				baseline.view.locators,
				delta.view.locators,
				(record) => record.hostNodeId,
			),
			events: mergeRecords(
				baseline.view.events,
				delta.view.events,
				(record) => `${record.hostNodeId}\0${record.eventName}`,
			),
			domUpdates: mergeRecords(
				baseline.view.domUpdates,
				delta.view.domUpdates,
				(record) => `${record.hostNodeId}\0${record.graphNodeId}\0${record.source}`,
			),
			behaviors: mergeRecords(
				baseline.view.behaviors,
				delta.view.behaviors,
				(record) => `${record.hostNodeId}\0${record.source}`,
			),
			elementHandles: mergeRecords(
				baseline.view.elementHandles,
				delta.view.elementHandles,
				(record) => `${record.hostNodeId}\0${record.handleId}`,
			),
			...mergeOptionalRecords(
				baseline.view,
				delta.view,
				'keyedRepeats',
				(record) => record.id,
			),
			...mergeOptionalRecords(
				baseline.view,
				delta.view,
				'branches',
				(record) => record.id,
			),
			asyncBoundaries: mergeRecords(
				baseline.view.asyncBoundaries,
				delta.view.asyncBoundaries,
				(record) => record.id,
			),
		},
	};
}

function mergeRecords<T>(
	baseline: ReadonlyArray<T>,
	delta: ReadonlyArray<T>,
	key: (record: T) => string,
): ReadonlyArray<T> {
	const byKey = uniqueRecords(delta, key, 'payload record');
	const merged = baseline.map((record) => byKey.get(key(record)) ?? record);
	const baselineKeys = new Set(baseline.map(key));
	for (const record of delta) if (!baselineKeys.has(key(record))) merged.push(record);
	return merged;
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

function mergeOptionalRecords<
	T extends object,
	K extends {
		[P in keyof T]-?: T[P] extends ReadonlyArray<unknown> | undefined ? P : never;
	}[keyof T],
>(
	baseline: T,
	delta: T,
	property: K,
	key: (record: NonNullable<T[K]> extends ReadonlyArray<infer R> ? R : never) => string,
): Partial<Pick<T, K>> {
	if (!(property in delta)) return {};
	return {
		[property]: mergeRecords(
			(baseline[property] ?? []) as ReadonlyArray<never>,
			(delta[property] ?? []) as ReadonlyArray<never>,
			key,
		),
	} as Partial<Pick<T, K>>;
}

function mergeAsyncRunners(
	baseline: ProtocolViewPayload,
	delta: ProtocolViewPayload,
): Pick<ProtocolViewPayload, 'asyncRunners'> | Record<never, never> {
	if (!('asyncRunners' in delta)) return {};
	return { asyncRunners: { ...baseline.asyncRunners, ...delta.asyncRunners } };
}

function assertMatchingVersion(baseline: number, delta: number, payload: string): void {
	if (baseline !== delta)
		throw new Error(
			`MARKLESS_RESUME_RECORD_DELTA_VERSION_MISMATCH: ${payload} ${baseline} !== ${delta}.`,
		);
}
