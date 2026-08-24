import {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	STORAGE_PROTOCOL_VERSION,
	type ProtocolEventActionKind,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from './protocol.ts';

export type EncodedPayloadScripts = {
	readonly stateScript: string;
	readonly viewScript: string;
};

export type DecodedPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type RuntimePayloadType = 'markless/state' | 'markless/view';

export type RuntimePayloadErrorCode =
	| 'MARKLESS_PAYLOAD_INVALID'
	| 'MARKLESS_PROTOCOL_VERSION_MISMATCH';

export type RuntimePayloadDiagnostic = {
	readonly code: RuntimePayloadErrorCode;
	readonly severity: 'error';
	readonly phase: 'payload';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly payloadType: RuntimePayloadType;
	readonly payloadScript: string;
	readonly expectedVersion?: number;
	readonly actualVersion?: unknown;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class RuntimePayloadError extends Error implements RuntimePayloadDiagnostic {
	declare readonly code: RuntimePayloadErrorCode;
	declare readonly severity: 'error';
	declare readonly phase: 'payload';
	declare readonly title: string;
	declare readonly why: string;
	declare readonly payloadType: RuntimePayloadType;
	declare readonly payloadScript: string;
	declare readonly expectedVersion?: number;
	declare readonly actualVersion?: unknown;
	declare readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	declare readonly docsUrl: string;

	constructor(diagnostic: RuntimePayloadDiagnostic) {
		super(diagnostic.message);
		Object.assign(this, { expectedVersion: undefined, actualVersion: undefined }, diagnostic, {
			name: 'RuntimePayloadError',
		});
	}
}

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	return decodePayloadScriptsWithVersion(input, false);
}

export function decodePayloadScriptsWithVersion(
	input: EncodedPayloadScripts,
	allowStorage: boolean,
): DecodedPayloadScripts {
	const state = parseDataScript(input.stateScript, 'markless/state') as ProtocolStatePayload;
	const view = parseDataScript(input.viewScript, 'markless/view') as ProtocolViewPayload;

	assertProtocolStatePayload(state);
	assertProtocolViewPayload(view);
	assertProtocolVersion(state.version, 'markless/state', allowStorage);
	assertProtocolVersion(view.version, 'markless/view');

	return { state, view };
}

function parseDataScript(script: string, type: RuntimePayloadType): unknown {
	const prefix = `<script type="${type}">`;
	const suffix = '</script>';

	if (!script.startsWith(prefix) || !script.endsWith(suffix)) {
		throw payloadInvalidError(
			type,
			`Expected ${type} payload script.`,
			`Browser resume expects the ${type} data to arrive in a canonical ${payloadScriptSelector(type)} script wrapper before decoding the resumability protocol.`,
			[
				{
					message: `Emit the ${type} payload with renderPayloadScripts or an equivalent canonical script wrapper.`,
				},
			],
		);
	}

	try {
		return JSON.parse(script.slice(prefix.length, -suffix.length));
	} catch {
		throw payloadInvalidError(
			type,
			`Invalid ${type} payload JSON.`,
			`The ${type} payload script must contain valid JSON before the runtime can validate the resumability protocol fields.`,
			[
				{
					message: `Emit valid JSON inside the ${payloadScriptSelector(type)} script content.`,
				},
			],
		);
	}
}

export function assertProtocolStatePayload(
	payload: unknown,
): asserts payload is ProtocolStatePayload {
	if (!isRecord(payload)) {
		throw invalidPayloadShapeError(
			'markless/state',
			'Invalid markless/state payload: expected object.',
		);
	}
	if (!('version' in payload)) {
		throw invalidPayloadShapeError(
			'markless/state',
			'Invalid markless/state payload: expected version.',
		);
	}
	const cells = requiredPayloadArrayField(payload, 'cells', 'markless/state');

	for (const [index, cell] of cells.entries()) {
		assertProtocolStateCellPayload(cell, `markless/state cell[${index}]`);
	}

	const computedEntries = requiredPayloadArrayField(payload, 'computed', 'markless/state');

	for (const [index, computed] of computedEntries.entries()) {
		const context = `markless/state computed[${index}]`;
		assertRecordShape(computed, context);
		assertStringField(computed, 'graphNodeId', context);
		assertStringField(computed, 'name', context);
		assertBooleanField(computed, 'async', context);
		assertOptionalComputedDependencies(computed, context);
		assertOptionalAsyncComputedSnapshot(computed, context);
	}

	assertOptionalSharedDefinitions(payload);
}

export function assertProtocolStateCellPayload(
	cell: unknown,
	context: string,
): asserts cell is ProtocolStatePayload['cells'][number] {
	assertRecordShape(cell, context);
	assertStringField(cell, 'graphNodeId', context);
	assertStringField(cell, 'name', context);
	assertStateValueKind(cell, context);
	if ('value' in cell) assertSerializedGraphPayload(cell.value, `${context}.value`);
	// directValue is the live-value channel (CSR mounts): it must never be
	// served. A payload script still carrying one is a host bug — hosts must
	// envelope-encode through serializeRuntimeStateCells before emitting.
	if ('directValue' in cell) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: live directValue cells must be serialized before serving.`,
		);
	}
}

export function assertProtocolViewPayload(
	payload: unknown,
): asserts payload is ProtocolViewPayload {
	if (!isRecord(payload)) {
		throw invalidPayloadShapeError(
			'markless/view',
			'Invalid markless/view payload: expected object.',
		);
	}
	if (!('version' in payload)) {
		throw invalidPayloadShapeError(
			'markless/view',
			'Invalid markless/view payload: expected version.',
		);
	}

	const locators = requiredPayloadArrayField(payload, 'locators', 'markless/view');
	const events = requiredPayloadArrayField(payload, 'events', 'markless/view');
	const domUpdates = requiredPayloadArrayField(payload, 'domUpdates', 'markless/view');
	const behaviors = requiredPayloadArrayField(payload, 'behaviors', 'markless/view');
	const elementHandles = requiredPayloadArrayField(payload, 'elementHandles', 'markless/view');
	const asyncBoundaries = requiredPayloadArrayField(payload, 'asyncBoundaries', 'markless/view');
	assertOptionalStringRecord(payload.asyncRunners, 'markless/view asyncRunners');

	for (const [index, locator] of locators.entries()) {
		const context = `markless/view locator[${index}]`;
		assertRecordShape(locator, context);
		assertStringField(locator, 'hostNodeId', context);
		assertLiteralField(locator, 'strategy', 'dom-order', context);
		assertNonNegativeIntegerField(locator, 'index', context);
		assertStringField(locator, 'tagName', context);
	}

	for (const [index, event] of events.entries()) {
		const context = `markless/view event[${index}]`;
		assertRecordShape(event, context);
		assertStringField(event, 'hostNodeId', context);
		assertStringField(event, 'eventName', context);
		assertStringArrayField(event, 'symbolIds', context);
		assertOptionalEventAction(event.action, `${context}.action`);
		if (event.syncPolicy !== undefined) {
			assertSyncPolicy(event.syncPolicy, `${context}.syncPolicy`);
		}
	}

	for (const [index, domUpdate] of domUpdates.entries()) {
		const context = `markless/view domUpdate[${index}]`;
		assertRecordShape(domUpdate, context);
		assertStringField(domUpdate, 'hostNodeId', context);
		assertStringField(domUpdate, 'source', context);
		assertStringField(domUpdate, 'graphNodeId', context);
		assertStringArrayField(domUpdate, 'path', context);
		assertOptionalDomUpdateTarget(domUpdate.target, `${context}.target`);
		assertOptionalStringField(domUpdate, 'symbolId', context);
	}

	for (const [index, behavior] of behaviors.entries()) {
		const context = `markless/view behavior[${index}]`;
		assertRecordShape(behavior, context);
		assertStringField(behavior, 'hostNodeId', context);
		assertStringField(behavior, 'source', context);
		assertStringField(behavior, 'functionSource', context);
		assertStringArrayField(behavior, 'inputSources', context);
		assertOptionalArrayField(behavior, 'inputValues', context);
		assertOptionalBehaviorInputGraphReads(behavior, context);
		assertOptionalStringField(behavior, 'symbolId', context);
	}

	for (const [index, handle] of elementHandles.entries()) {
		const context = `markless/view elementHandle[${index}]`;
		assertRecordShape(handle, context);
		assertStringField(handle, 'hostNodeId', context);
		assertStringField(handle, 'handleId', context);
		assertStringField(handle, 'name', context);
		assertOptionalBooleanField(handle, 'plural', context);
	}

	for (const [index, boundary] of asyncBoundaries.entries()) {
		const context = `markless/view asyncBoundary[${index}]`;
		assertRecordShape(boundary, context);
		assertStringField(boundary, 'id', context);
		assertNullableStringField(boundary, 'runnerGraphNodeId', context);
		assertAsyncBoundaryArm(boundary.initiallyServedArm, context);
		assertCommentAnchor(boundary.startAnchor, `${context}.startAnchor`);
		assertCommentAnchor(boundary.endAnchor, `${context}.endAnchor`);
		assertAsyncBoundaryReads(boundary.asyncReads, context);
	}

	assertOptionalKeyedRepeats(payload);
	assertOptionalBranches(payload);
}

const EVENT_ACTION_VALIDATORS = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: () => {},
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: (
		action: Record<string, unknown>,
		context: string,
	) => assertStringField(action, 'owner', context),
} satisfies Record<
	ProtocolEventActionKind,
	(action: Record<string, unknown>, context: string) => void
>;

function assertOptionalEventAction(value: unknown, context: string): void {
	if (value === undefined) return;
	assertRecordShape(value, context);
	assertStringField(value, 'kind', context);
	const kind = value.kind as ProtocolEventActionKind;
	const validate = EVENT_ACTION_VALIDATORS[kind];
	if (!validate)
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: unknown event action kind.`,
		);
	validate(value, context);
}

function assertNullableStringField(
	record: Record<string, unknown>,
	field: string,
	context: string,
): void {
	if (record[field] !== null && typeof record[field] !== 'string') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${field} string or null.`,
		);
	}
}

function assertAsyncBoundaryArm(value: unknown, context: string): void {
	if (!Object.values(ASYNC_BOUNDARY_ARM).includes(value as never)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected initiallyServedArm to name a protocol async boundary arm.`,
		);
	}
}

function assertProtocolVersion(
	version: unknown,
	type: RuntimePayloadType,
	allowStorage = false,
): void {
	if (
		version !== ASYNC_PROTOCOL_VERSION &&
		!(allowStorage && type === 'markless/state' && version === STORAGE_PROTOCOL_VERSION)
	) {
		throw protocolVersionMismatchError(type, version);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredPayloadArrayField(
	record: Record<string, unknown>,
	key: string,
	payloadType: RuntimePayloadType,
): ReadonlyArray<unknown> {
	if (!Object.prototype.hasOwnProperty.call(record, key) || !Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			payloadType,
			`Invalid ${payloadType} payload: expected ${key} array.`,
		);
	}

	return record[key];
}

function assertRecordShape(
	value: unknown,
	context: string,
): asserts value is Record<string, unknown> {
	if (!isRecord(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected object.`,
		);
	}
}

function assertStringField(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'string') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} string.`,
		);
	}
}

function assertOptionalStringField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (record[key] !== undefined && typeof record[key] !== 'string') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} string.`,
		);
	}
}

function assertBooleanField(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'boolean') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} boolean.`,
		);
	}
}

function assertLiteralField(
	record: Record<string, unknown>,
	key: string,
	expected: string,
	context: string,
): void {
	if (record[key] !== expected) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} "${expected}".`,
		);
	}
}

function assertStringArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (!Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const value of record[key]) {
		if (typeof value !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected ${key} string array.`,
			);
		}
	}
}

function assertNonNegativeIntegerArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (!Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const value of record[key]) {
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected ${key} non-negative integer array.`,
			);
		}
	}
}

function assertOptionalStringArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (record[key] !== undefined) {
		assertStringArrayField(record, key, context);
	}
}

function assertOptionalArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (record[key] !== undefined && !Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}
}

function assertOptionalKeyedRepeats(record: Record<string, unknown>): void {
	if (record.keyedRepeats === undefined) return;
	if (!Array.isArray(record.keyedRepeats)) {
		throw invalidPayloadShapeError(
			'markless/view',
			'Invalid markless/view payload: expected keyedRepeats array.',
		);
	}

	for (const [index, repeat] of record.keyedRepeats.entries()) {
		const context = `markless/view keyedRepeat[${index}]`;
		assertRecordShape(repeat, context);
		assertStringField(repeat, 'id', context);
		assertStringField(repeat, 'parentHostNodeId', context);
		assertOptionalStringField(repeat, 'collectionGraphNodeId', context);
		assertStringArrayField(repeat, 'collectionPath', context);
		assertStringArrayField(repeat, 'keyPath', context);
		assertStringField(repeat, 'itemName', context);
		assertNonNegativeIntegerField(repeat, 'rowElementCount', context);
		if (repeat.rowStartOffset !== undefined)
			assertNonNegativeIntegerField(repeat, 'rowStartOffset', context);
		assertRowEvents(repeat.rowEvents, `${context}.rowEvents`);
		assertOptionalRowElementHandles(repeat, `${context}.rowElementHandles`);
	}
}

function assertOptionalRowElementHandles(
	record: Record<string, unknown>,
	context: string,
): void {
	const handles = record.rowElementHandles;
	if (handles === undefined) return;
	if (!Array.isArray(handles)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected array.`,
		);
	}
	for (const [index, handle] of handles.entries()) {
		const handleContext = `${context}[${index}]`;
		assertRecordShape(handle, handleContext);
		assertNonNegativeIntegerArrayField(handle, 'hostPath', handleContext);
		assertStringField(handle, 'handleId', handleContext);
		assertStringField(handle, 'name', handleContext);
		assertOptionalBooleanField(handle, 'plural', handleContext);
	}
}

function assertOptionalBooleanField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	const value = record[key];
	if (value === undefined || typeof value === 'boolean') return;
	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected ${key} boolean.`,
	);
}

function assertOptionalBranches(record: Record<string, unknown>): void {
	if (record.branches === undefined) return;
	if (!Array.isArray(record.branches)) {
		throw invalidPayloadShapeError(
			'markless/view',
			'Invalid markless/view payload: expected branches array.',
		);
	}

	for (const [index, branch] of record.branches.entries()) {
		const context = `markless/view branch[${index}]`;
		assertRecordShape(branch, context);
		assertStringField(branch, 'id', context);
		assertCommentAnchor(branch.startAnchor, `${context}.startAnchor`);
		assertCommentAnchor(branch.endAnchor, `${context}.endAnchor`);
		assertOptionalStringField(branch, 'symbolId', context);
		assertOptionalGraphReads(branch, 'testReads', context);
		if (branch.armTests !== undefined && !Array.isArray(branch.armTests)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected armTests array.`,
			);
		}
		assertOptionalBranchArmRecords(branch, context);
	}
}

function assertOptionalBranchArmRecords(record: Record<string, unknown>, context: string): void {
	if (record.armRecords === undefined) return;
	if (!Array.isArray(record.armRecords)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected armRecords array.`,
		);
	}

	for (const [index, arm] of record.armRecords.entries()) {
		const armContext = `${context}.armRecords[${index}]`;
		assertRecordShape(arm, armContext);
		assertRowEvents(arm.events, `${armContext}.events`);
		assertOptionalArrayField(arm, 'domUpdates', armContext);
		assertOptionalArrayField(arm, 'behaviors', armContext);
		assertOptionalArrayField(arm, 'elementHandles', armContext);
	}
}

function assertRowEvents(value: unknown, context: string): void {
	if (!Array.isArray(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected array.`,
		);
	}

	for (const [index, event] of value.entries()) {
		const eventContext = `${context}[${index}]`;
		assertRecordShape(event, eventContext);
		assertNonNegativeIntegerArrayField(event, 'hostPath', eventContext);
		assertStringField(event, 'eventName', eventContext);
		assertStringArrayField(event, 'symbolIds', eventContext);
		if (event.syncPolicy !== undefined) {
			assertSyncPolicy(event.syncPolicy, `${eventContext}.syncPolicy`);
		}
	}
}

function assertOptionalGraphReads(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	const reads = record[key];
	if (reads === undefined) return;
	if (!Array.isArray(reads)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const [index, read] of reads.entries()) {
		const readContext = `${context}.${key}[${index}]`;
		assertRecordShape(read, readContext);
		assertStringField(read, 'source', readContext);
		assertStringField(read, 'graphNodeId', readContext);
		assertStringArrayField(read, 'path', readContext);
	}
}

function assertOptionalBehaviorInputGraphReads(
	record: Record<string, unknown>,
	context: string,
): void {
	if (record.inputGraphReads === undefined) return;
	if (!Array.isArray(record.inputGraphReads)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected inputGraphReads array.`,
		);
	}

	for (const [index, read] of record.inputGraphReads.entries()) {
		const readContext = `${context}.inputGraphReads[${index}]`;
		assertRecordShape(read, readContext);
		assertNonNegativeIntegerField(read, 'inputIndex', readContext);
		assertStringField(read, 'source', readContext);
		assertStringField(read, 'graphNodeId', readContext);
		assertStringArrayField(read, 'path', readContext);
	}
}

function assertOptionalComputedDependencies(
	record: Record<string, unknown>,
	context: string,
): void {
	if (record.dependencies === undefined) return;
	if (!Array.isArray(record.dependencies)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected dependencies array.`,
		);
	}

	for (const [index, dependency] of record.dependencies.entries()) {
		const dependencyContext = `${context}.dependencies[${index}]`;
		assertRecordShape(dependency, dependencyContext);
		assertStringField(dependency, 'graphNodeId', dependencyContext);
		assertStringArrayField(dependency, 'path', dependencyContext);
	}
}

function assertOptionalSharedDefinitions(record: Record<string, unknown>): void {
	if (record.sharedDefinitions === undefined) return;
	if (!Array.isArray(record.sharedDefinitions)) {
		throw invalidPayloadShapeError(
			'markless/state',
			'Invalid markless/state payload: expected sharedDefinitions array.',
		);
	}

	for (const [index, definition] of record.sharedDefinitions.entries()) {
		const context = `markless/state sharedDefinitions[${index}]`;
		assertRecordShape(definition, context);
		assertStringField(definition, 'id', context);
		assertStringField(definition, 'name', context);
		assertStringField(definition, 'exportedName', context);
		assertOptionalSharedScope(definition, context);
		assertNonNegativeIntegerField(definition, 'version', context);
		assertStringArrayField(definition, 'graphNodeIds', context);
		assertOptionalStringArrayField(definition, 'projectionIds', context);
		assertOptionalSharedDependencies(definition, context);
		assertOptionalSharedReturnProperties(definition, context);
	}
}

function assertOptionalSharedScope(record: Record<string, unknown>, context: string): void {
	if (record.scope === undefined) return;
	if (record.scope === 'widget' || record.scope === 'request' || record.scope === 'container' || record.scope === 'page') {
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected scope widget, request, container, or page.`,
	);
}

function assertOptionalSharedDependencies(record: Record<string, unknown>, context: string): void {
	if (record.dependencies === undefined) return;
	if (!Array.isArray(record.dependencies)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected dependencies array.`,
		);
	}

	for (const [index, dependency] of record.dependencies.entries()) {
		const dependencyContext = `${context}.dependencies[${index}]`;
		assertRecordShape(dependency, dependencyContext);
		assertStringField(dependency, 'definitionId', dependencyContext);
		assertStringField(dependency, 'definitionName', dependencyContext);
	}
}

function assertOptionalSharedReturnProperties(
	record: Record<string, unknown>,
	context: string,
): void {
	if (record.returnProperties === undefined) return;
	if (!Array.isArray(record.returnProperties)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected returnProperties array.`,
		);
	}

	for (const [index, property] of record.returnProperties.entries()) {
		const propertyContext = `${context}.returnProperties[${index}]`;
		assertRecordShape(property, propertyContext);
		assertStringField(property, 'kind', propertyContext);
		assertStringField(property, 'name', propertyContext);

		if (property.kind === 'graph') {
			assertStringField(property, 'graphNodeId', propertyContext);
			assertStringArrayField(property, 'path', propertyContext);
			continue;
		}

		if (property.kind === 'method') continue;

		throw invalidPayloadShapeError(
			contextPayloadType(propertyContext),
			`Invalid ${propertyContext}: expected graph or method return property kind.`,
		);
	}
}

function assertOptionalAsyncComputedSnapshot(
	record: Record<string, unknown>,
	context: string,
): void {
	if (record.snapshot === undefined) return;

	const snapshotContext = `${context}.snapshot`;
	assertRecordShape(record.snapshot, snapshotContext);
	assertStringField(record.snapshot, 'status', snapshotContext);
	assertNonNegativeIntegerField(record.snapshot, 'version', snapshotContext);

	if (record.snapshot.status === 'idle') {
		if (record.snapshot.version !== 0) {
			throw invalidPayloadShapeError(
				contextPayloadType(snapshotContext),
				`Invalid ${snapshotContext}: expected idle version 0.`,
			);
		}
		return;
	}

	if (
		record.snapshot.status !== 'pending' &&
		record.snapshot.status !== 'fulfilled' &&
		record.snapshot.status !== 'rejected'
	) {
		throw invalidPayloadShapeError(
			contextPayloadType(snapshotContext),
			`Invalid ${snapshotContext}: expected supported async snapshot status.`,
		);
	}

	if (!('key' in record.snapshot)) {
		throw invalidPayloadShapeError(
			contextPayloadType(snapshotContext),
			`Invalid ${snapshotContext}: expected key.`,
		);
	}
	assertSerializedGraphPayload(record.snapshot.key, `${snapshotContext}.key`);

	if (record.snapshot.status === 'fulfilled' && !('value' in record.snapshot)) {
		throw invalidPayloadShapeError(
			contextPayloadType(snapshotContext),
			`Invalid ${snapshotContext}: expected value.`,
		);
	}
	if (record.snapshot.status === 'fulfilled') {
		assertSerializedGraphPayload(record.snapshot.value, `${snapshotContext}.value`);
	}

	if (record.snapshot.status === 'rejected' && !('error' in record.snapshot)) {
		throw invalidPayloadShapeError(
			contextPayloadType(snapshotContext),
			`Invalid ${snapshotContext}: expected error.`,
		);
	}
	if (record.snapshot.status === 'rejected') {
		assertSerializedGraphPayload(record.snapshot.error, `${snapshotContext}.error`);
	}
}

function assertSerializedGraphPayload(value: unknown, context: string): void {
	assertRecordShape(value, context);
	if (value.version !== 1) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected version 1.`,
		);
	}
	if (!('root' in value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected root.`,
		);
	}
	if (!Array.isArray(value.records)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected records array.`,
		);
	}

	const recordIds = new Set<number>();
	const recordsById = new Map<number, Record<string, unknown>>();
	for (const [index, record] of value.records.entries()) {
		const recordContext = `${context}.records[${index}]`;
		assertSerializedRecord(record, recordContext);
		const recordId = (record as { readonly id: number }).id;
		if (recordIds.has(recordId)) {
			throw invalidPayloadShapeError(
				contextPayloadType(recordContext),
				`Invalid ${recordContext}: duplicate record id ${String(recordId)}.`,
			);
		}
		recordIds.add(recordId);
		recordsById.set(recordId, record as Record<string, unknown>);
	}

	assertSerializedSlot(value.root, `${context}.root`);
	assertSerializedSlotReferences(value.root, `${context}.root`, recordIds);
	for (const [index, record] of value.records.entries()) {
		const recordContext = `${context}.records[${index}]`;
		const recordObject = record as Record<string, unknown>;
		assertSerializedRecordReferences(recordObject, recordContext, recordIds);
		assertArrayBufferViewRecordRange(recordObject, recordContext, recordsById);
	}
}

function assertSerializedRecord(value: unknown, context: string): void {
	assertRecordShape(value, context);
	assertNonNegativeIntegerField(value, 'id', context);
	assertStringField(value, 'type', context);

	if (value.type === 'object') {
		assertSerializedEntries(value, 'fields', context, 'field');
		return;
	}
	if (value.type === 'array') {
		assertSerializedSlotArray(value.items, `${context}.items`);
		return;
	}
	if (value.type === 'map') {
		assertSerializedEntries(value, 'entries', context, 'entry');
		return;
	}
	if (value.type === 'set') {
		assertSerializedSlotArray(value.values, `${context}.values`);
		return;
	}
	if (value.type === 'date' || value.type === 'url') {
		assertStringField(value, 'value', context);
		if (value.type === 'date') assertIsoDateString(value.value, context);
		if (value.type === 'url') assertUrlString(value.value, context);
		return;
	}
	if (value.type === 'regexp') {
		assertStringField(value, 'source', context);
		assertStringField(value, 'flags', context);
		assertRegExpParts(value.source, value.flags, context);
		return;
	}
	if (value.type === 'array-buffer') {
		assertByteArrayField(value, 'bytes', context);
		return;
	}
	if (value.type === 'typed-array') {
		assertStringField(value, 'arrayType', context);
		assertSupportedTypedArrayType(value.arrayType, context);
		assertSerializedSlot(value.buffer, `${context}.buffer`);
		assertNonNegativeIntegerField(value, 'byteOffset', context);
		assertNonNegativeIntegerField(value, 'length', context);
		return;
	}
	if (value.type === 'data-view') {
		assertSerializedSlot(value.buffer, `${context}.buffer`);
		assertNonNegativeIntegerField(value, 'byteOffset', context);
		assertNonNegativeIntegerField(value, 'byteLength', context);
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported serialized record type.`,
	);
}

function assertSupportedTypedArrayType(value: unknown, context: string): void {
	if (
		value === 'Int8Array' ||
		value === 'Uint8Array' ||
		value === 'Uint8ClampedArray' ||
		value === 'Int16Array' ||
		value === 'Uint16Array' ||
		value === 'Int32Array' ||
		value === 'Uint32Array' ||
		value === 'Float32Array' ||
		value === 'Float64Array' ||
		value === 'BigInt64Array' ||
		value === 'BigUint64Array'
	) {
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported typed array type.`,
	);
}

function assertSerializedRecordReferences(
	record: Record<string, unknown>,
	context: string,
	recordIds: ReadonlySet<number>,
): void {
	if (record.type === 'object') {
		assertSerializedEntryReferences(record.fields, `${context}.fields`, recordIds, false);
		return;
	}
	if (record.type === 'array') {
		assertSerializedSlotArrayReferences(record.items, `${context}.items`, recordIds);
		return;
	}
	if (record.type === 'map') {
		assertSerializedEntryReferences(record.entries, `${context}.entries`, recordIds, true);
		return;
	}
	if (record.type === 'set') {
		assertSerializedSlotArrayReferences(record.values, `${context}.values`, recordIds);
		return;
	}
	if (record.type === 'typed-array' || record.type === 'data-view') {
		assertSerializedSlotReferences(record.buffer, `${context}.buffer`, recordIds);
	}
}

function assertSerializedEntryReferences(
	value: unknown,
	context: string,
	recordIds: ReadonlySet<number>,
	keyIsSlot: boolean,
): void {
	if (!Array.isArray(value)) return;

	for (const [index, entry] of value.entries()) {
		if (!Array.isArray(entry) || entry.length !== 2) continue;
		if (keyIsSlot) {
			assertSerializedSlotReferences(entry[0], `${context}[${index}][0]`, recordIds);
		}
		assertSerializedSlotReferences(entry[1], `${context}[${index}][1]`, recordIds);
	}
}

function assertSerializedSlotArrayReferences(
	value: unknown,
	context: string,
	recordIds: ReadonlySet<number>,
): void {
	if (!Array.isArray(value)) return;

	for (const [index, slot] of value.entries()) {
		assertSerializedSlotReferences(slot, `${context}[${index}]`, recordIds);
	}
}

function assertSerializedSlotReferences(
	value: unknown,
	context: string,
	recordIds: ReadonlySet<number>,
): void {
	if (!isRecord(value) || !('$ref' in value) || typeof value.$ref !== 'number') return;
	if (!Number.isInteger(value.$ref) || value.$ref < 0) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected $ref non-negative integer.`,
		);
	}
	if (recordIds.has(value.$ref)) return;

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: unknown record ref ${String(value.$ref)}.`,
	);
}

function assertArrayBufferViewRecordRange(
	record: Record<string, unknown>,
	context: string,
	recordsById: ReadonlyMap<number, Record<string, unknown>>,
): void {
	if (record.type !== 'typed-array' && record.type !== 'data-view') return;

	const bufferRecord = referencedArrayBufferRecord(record.buffer, context, recordsById);
	const bytes = bufferRecord.bytes;
	if (!Array.isArray(bytes)) return;

	const byteOffset = record.byteOffset as number;
	if (record.type === 'typed-array') {
		const elementByteLength = typedArrayElementByteLength(record.arrayType);
		if (byteOffset % elementByteLength !== 0) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: typed-array byteOffset must align to element byte length.`,
			);
		}
		const byteLength = (record.length as number) * elementByteLength;
		if (byteOffset + byteLength > bytes.length) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: typed-array byte range exceeds referenced array-buffer.`,
			);
		}
		return;
	}

	const byteLength = record.byteLength as number;
	if (byteOffset + byteLength > bytes.length) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: data-view byte range exceeds referenced array-buffer.`,
		);
	}
}

function referencedArrayBufferRecord(
	value: unknown,
	context: string,
	recordsById: ReadonlyMap<number, Record<string, unknown>>,
): Record<string, unknown> {
	if (!isRecord(value) || typeof value.$ref !== 'number') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected buffer array-buffer ref.`,
		);
	}

	const record = recordsById.get(value.$ref);
	if (record?.type !== 'array-buffer') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected buffer array-buffer ref.`,
		);
	}

	return record;
}

function typedArrayElementByteLength(value: unknown): number {
	if (value === 'Int8Array' || value === 'Uint8Array' || value === 'Uint8ClampedArray') {
		return 1;
	}
	if (value === 'Int16Array' || value === 'Uint16Array') return 2;
	if (value === 'Int32Array' || value === 'Uint32Array' || value === 'Float32Array') {
		return 4;
	}
	return 8;
}

function assertSerializedEntries(
	record: Record<string, unknown>,
	key: string,
	context: string,
	entryName: string,
): void {
	const entries = record[key];
	if (!Array.isArray(entries)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const [index, entry] of entries.entries()) {
		if (!Array.isArray(entry) || entry.length !== 2) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}.${key}[${index}]: expected ${entryName} pair.`,
			);
		}
		if (key === 'fields' && typeof entry[0] !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}.${key}[${index}]: expected field name string.`,
			);
		} else if (key === 'entries') {
			assertSerializedSlot(entry[0], `${context}.${key}[${index}][0]`);
		}
		assertSerializedSlot(entry[1], `${context}.${key}[${index}][1]`);
	}
}

function assertSerializedSlotArray(value: unknown, context: string): void {
	if (!Array.isArray(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected array.`,
		);
	}

	for (const [index, slot] of value.entries()) {
		assertSerializedSlot(slot, `${context}[${index}]`);
	}
}

function assertByteArrayField(record: Record<string, unknown>, key: string, context: string): void {
	if (!Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const value of record[key]) {
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected ${key} byte array.`,
			);
		}
	}
}

function assertSerializedSlot(value: unknown, context: string): void {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (!isRecord(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected serialized slot.`,
		);
	}
	if ('$ref' in value) {
		assertNonNegativeIntegerField(value, '$ref', context);
		return;
	}
	if (value.$type === 'undefined') return;
	if (value.$type === 'bigint') {
		assertStringField(value, 'value', context);
		assertBigIntString(value.value, context);
		return;
	}
	if (value.$type === 'date' || value.$type === 'url') {
		assertStringField(value, 'value', context);
		if (value.$type === 'date') assertIsoDateString(value.value, context);
		if (value.$type === 'url') assertUrlString(value.value, context);
		return;
	}
	if (value.$type === 'regexp') {
		assertStringField(value, 'source', context);
		assertStringField(value, 'flags', context);
		assertRegExpParts(value.source, value.flags, context);
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected serialized slot.`,
	);
}

function assertNonNegativeIntegerField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (typeof record[key] !== 'number' || !Number.isInteger(record[key]) || record[key] < 0) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} non-negative integer.`,
		);
	}
}

function assertBigIntString(value: unknown, context: string): void {
	if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) return;

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected bigint string.`,
	);
}

function assertIsoDateString(value: unknown, context: string): void {
	if (typeof value === 'string') {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime()) && date.toISOString() === value) return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected ISO date string.`,
	);
}

function assertUrlString(value: unknown, context: string): void {
	if (typeof value === 'string') {
		try {
			new URL(value);
			return;
		} catch {
			// Report as a payload diagnostic below.
		}
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected valid URL string.`,
	);
}

function assertRegExpParts(source: unknown, flags: unknown, context: string): void {
	if (typeof source === 'string' && typeof flags === 'string') {
		try {
			new RegExp(source, flags);
			return;
		} catch {
			// Report as a payload diagnostic below.
		}
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected valid regexp pattern and flags.`,
	);
}

function assertStateValueKind(record: Record<string, unknown>, context: string): void {
	if (
		record.valueKind !== 'scalar' &&
		record.valueKind !== 'object' &&
		record.valueKind !== 'array' &&
		record.valueKind !== 'unknown'
	) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			'Invalid ' + context + ': expected valueKind scalar, object, array, or unknown.',
		);
	}
}

function assertCommentAnchor(value: unknown, context: string): void {
	assertRecordShape(value, context);
	assertLiteralField(value, 'strategy', 'dom-order-comment', context);
	assertNonNegativeIntegerField(value, 'index', context);
}

function assertAsyncBoundaryReads(value: unknown, context: string): void {
	if (!Array.isArray(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected asyncReads array.`,
		);
	}

	for (const [index, read] of value.entries()) {
		const readContext = `${context}.asyncRead[${index}]`;
		assertRecordShape(read, readContext);
		assertStringField(read, 'source', readContext);
		assertStringField(read, 'graphNodeId', readContext);
		assertStringArrayField(read, 'path', readContext);
		assertOptionalStringField(read, 'runnerSymbolId', readContext);
	}
}

function assertOptionalStringRecord(value: unknown, context: string): void {
	if (value === undefined) return;
	assertRecordShape(value, context);
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}.${key}: expected string.`,
			);
		}
	}
}

function assertOptionalDomUpdateTarget(value: unknown, context: string): void {
	if (value === undefined) return;

	assertRecordShape(value, context);
	if (value.kind === 'text') return;
	if (value.kind === 'class') return;
	if (value.kind === 'style') return;
	if (value.kind === 'attribute') {
		if (typeof value.name !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected attribute name string.`,
			);
		}
		return;
	}
	if (value.kind === 'property') {
		if (typeof value.name !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected property name string.`,
			);
		}
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported DOM update target kind.`,
	);
}

function assertSyncPolicy(value: unknown, context: string): void {
	assertRecordShape(value, context);

	if ('branches' in value) {
		if (!Array.isArray(value.branches)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected branches array.`,
			);
		}

		for (const [index, branch] of value.branches.entries()) {
			assertSyncPolicyBranch(branch, `${context}.branch[${index}]`);
		}
		return;
	}

	assertSyncPolicyBranch(value, context);
}

function assertSyncPolicyBranch(value: unknown, context: string): void {
	assertRecordShape(value, context);
	assertSyncPolicyCondition(value.when, `${context}.when`);

	if (!Array.isArray(value.actions)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected actions array.`,
		);
	}

	for (const action of value.actions) {
		if (action !== 'preventDefault' && action !== 'stopPropagation') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected supported sync action.`,
			);
		}
	}
}

function assertSyncPolicyCondition(value: unknown, context: string): void {
	assertRecordShape(value, context);

	if (value.type === 'and' || value.type === 'or') {
		if (!Array.isArray(value.conditions)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected conditions array.`,
			);
		}

		for (const [index, condition] of value.conditions.entries()) {
			assertSyncPolicyCondition(condition, `${context}.condition[${index}]`);
		}
		return;
	}

	if (value.type === 'not') {
		assertSyncPolicyCondition(value.condition, `${context}.condition`);
		return;
	}

	if (value.type === 'graph-truthy') {
		assertStringField(value, 'graphNodeId', context);
		assertOptionalStringArrayField(value, 'path', context);
		return;
	}

	if (value.type === 'constant-truthy') {
		if (!('value' in value)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected value.`,
			);
		}
		return;
	}

	if (value.type === 'event-equals') {
		assertStringField(value, 'field', context);
		if (!('value' in value)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected value.`,
			);
		}
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported condition type.`,
	);
}

export function payloadInvalidError(
	payloadType: RuntimePayloadType,
	message: string,
	why: string,
	suggestions: ReadonlyArray<{ readonly message: string }>,
): RuntimePayloadError {
	return new RuntimePayloadError({
		code: 'MARKLESS_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		message,
		why,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		suggestions,
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
	});
}

export function invalidPayloadShapeError(
	payloadType: RuntimePayloadType,
	message: string,
): RuntimePayloadError {
	return payloadInvalidError(
		payloadType,
		message,
		`The ${payloadType} payload did not match the resumability protocol shape required by this runtime.`,
		[
			{
				message: `Regenerate the ${payloadType} payload with the matching markless compiler/runtime version.`,
			},
		],
	);
}

function protocolVersionMismatchError(
	payloadType: RuntimePayloadType,
	actualVersion: unknown,
): RuntimePayloadError {
	const supportedVersions =
		payloadType === 'markless/state'
			? `${String(ASYNC_PROTOCOL_VERSION)} or ${String(STORAGE_PROTOCOL_VERSION)}`
			: String(ASYNC_PROTOCOL_VERSION);
	return new RuntimePayloadError({
		code: 'MARKLESS_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		message: `Unsupported ${payloadType} protocol version ${String(actualVersion)}.`,
		why: `The ${payloadType} payload was produced for protocol version ${String(actualVersion)}, but this runtime can only decode version ${supportedVersions}.`,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		expectedVersion: ASYNC_PROTOCOL_VERSION,
		actualVersion,
		suggestions: [
			{
				message: 'Use matching markless compiler and runtime package versions.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PROTOCOL_VERSION_MISMATCH',
	});
}

function contextPayloadType(context: string): RuntimePayloadType {
	return context.startsWith('markless/state') ? 'markless/state' : 'markless/view';
}

export function payloadScriptSelector(type: RuntimePayloadType): string {
	return `script[type="${type}"]`;
}
