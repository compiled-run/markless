import {
	ASYNC_BOUNDARY_ARM_MAX,
	ASYNC_BOUNDARY_ARM_MIN,
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	STORAGE_PROTOCOL_VERSION,
} from './protocol-constants.ts';
// Type-only on purpose: taking a runtime value from protocol.ts here drags it
// back into the browser payload closure the event-only-resume wall measures.
import type {
	ProtocolEventActionKind,
	ProtocolStatePayload,
	ProtocolViewPayload,
} from './protocol.ts';
export type EncodedPayloadScripts = { readonly stateScript: string; readonly viewScript: string };
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
	const state = parse(input.stateScript, 'markless/state') as ProtocolStatePayload;
	const view = parse(input.viewScript, 'markless/view') as ProtocolViewPayload;
	baseState(state);
	baseView(view);
	version(state.version, 'markless/state', allowStorage);
	version(view.version, 'markless/view');
	return { state, view };
}
function parse(script: string, type: RuntimePayloadType): unknown {
	const prefix = `<script type="${type}">`;
	if (!script.startsWith(prefix) || !script.endsWith('</script>')) {
		throw payloadInvalidError(type, `Expected ${type} payload script.`);
	}
	try {
		return JSON.parse(script.slice(prefix.length, -9));
	} catch {
		throw payloadInvalidError(type, `Invalid ${type} payload JSON.`);
	}
}
function baseState(value: unknown): asserts value is ProtocolStatePayload {
	const payload = root(value, 'markless/state');
	const cells = arr(payload, 'cells', 'markless/state');
	arr(payload, 'computed', 'markless/state');
	for (const [index, cell] of cells.entries()) {
		const context = `markless/state cell[${index}]`;
		const record = obj(cell, context);
		str(record, 'graphNodeId', context);
		str(record, 'name', context);
		if ('value' in record) serialized(record.value, `${context}.value`);
	}
}
function baseView(value: unknown): asserts value is ProtocolViewPayload {
	const payload = root(value, 'markless/view');
	if ('asyncRunners' in payload) {
		const runners = obj(payload.asyncRunners, 'markless/view asyncRunners');
		for (const [graphNodeId, symbolId] of Object.entries(runners)) {
			if (typeof symbolId !== 'string')
				invalid(`markless/view asyncRunners.${graphNodeId}`, 'expected string.');
		}
	}
	const [locators, events, , , , asyncBoundaries] = (
		[
			'locators',
			'events',
			'domUpdates',
			'behaviors',
			'elementHandles',
			'asyncBoundaries',
		] as const
	).map((key) => arr(payload, key, 'markless/view'));
	for (const [index, locator] of locators.entries()) {
		const context = `markless/view locator[${index}]`;
		const record = obj(locator, context);
		str(record, 'hostNodeId', context);
		str(record, 'tagName', context);
		if (record.strategy !== 'dom-order') invalid(context, 'expected strategy "dom-order".');
		if (!Number.isInteger(record.index) || Number(record.index) < 0)
			invalid(context, 'expected index non-negative integer.');
	}
	for (const [index, event] of events.entries()) {
		const context = `markless/view event[${index}]`;
		const record = obj(event, context);
		str(record, 'hostNodeId', context);
		str(record, 'eventName', context);
		if (!Array.isArray(record.symbolIds)) invalid(context, 'expected symbolIds array.');
		eventAction(record.action, `${context}.action`);
	}
	if (asyncBoundaries.length > 0)
		for (const [index, boundary] of asyncBoundaries.entries()) {
			const context = `markless/view asyncBoundary[${index}]`;
			const record = obj(boundary, context);
			if (record.runnerGraphNodeId !== null && typeof record.runnerGraphNodeId !== 'string')
				invalid(context, 'expected runnerGraphNodeId string or null.');
			if (
				typeof record.initiallyServedArm !== 'number' ||
				!Number.isInteger(record.initiallyServedArm) ||
				record.initiallyServedArm < ASYNC_BOUNDARY_ARM_MIN ||
				record.initiallyServedArm > ASYNC_BOUNDARY_ARM_MAX
			)
				invalid(
					context,
					'expected initiallyServedArm to name a protocol async boundary arm.',
				);
		}
}

const EVENT_ACTION_VALIDATORS = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: () => {},
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: (
		action: Record<string, unknown>,
		context: string,
	) => str(action, 'owner', context),
} satisfies Record<
	ProtocolEventActionKind,
	(action: Record<string, unknown>, context: string) => void
>;

function eventAction(value: unknown, context: string): void {
	if (value === undefined) return;
	const action = obj(value, context);
	str(action, 'kind', context);
	const validate = EVENT_ACTION_VALIDATORS[action.kind as ProtocolEventActionKind];
	if (!validate) invalid(context, 'unknown event action kind.');
	validate(action, context);
}
function root(value: unknown, type: RuntimePayloadType): Record<string, unknown> {
	const record = obj(value, type);
	if (!('version' in record))
		throw payloadInvalidError(type, `Invalid ${type} payload: expected version.`);
	return record;
}
function obj(value: unknown, context: string): Record<string, unknown> {
	if (typeof value === 'object' && value !== null && !Array.isArray(value))
		// TS narrows `unknown` only to `object` here; the index signature is the JS truth.
		return value as Record<string, unknown>;
	throw invalid(context, 'expected object.');
}
function arr(record: Record<string, unknown>, key: string, type: RuntimePayloadType): unknown[] {
	if (Array.isArray(record[key])) return record[key];
	throw payloadInvalidError(type, `Invalid ${type} payload: expected ${key} array.`);
}
function str(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'string') invalid(context, `expected ${key} string.`);
}
function serialized(value: unknown, context: string): void {
	const record = obj(value, context);
	if (record.version !== 1) invalid(context, 'expected version 1.');
	if (!('root' in record)) invalid(context, 'expected root.');
	if (!Array.isArray(record.records)) invalid(context, 'expected records array.');
}
function version(actualVersion: unknown, type: RuntimePayloadType, allowStorage = false): void {
	if (
		actualVersion === ASYNC_PROTOCOL_VERSION ||
		(allowStorage && type === 'markless/state' && actualVersion === STORAGE_PROTOCOL_VERSION)
	)
		return;
	throw new RuntimePayloadError({
		code: 'MARKLESS_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		message: `Unsupported ${type} protocol version ${String(actualVersion)}.`,
		why: `The ${type} payload must use a supported protocol version.`,
		payloadType: type,
		payloadScript: payloadScriptSelector(type),
		expectedVersion: ASYNC_PROTOCOL_VERSION,
		actualVersion,
		suggestions: [{ message: `Serve a ${type} payload generated by this runtime.` }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PROTOCOL_VERSION_MISMATCH',
	});
}
function invalid(context: string, reason: string): never {
	throw payloadInvalidError(
		context.startsWith('markless/view') ? 'markless/view' : 'markless/state',
		`Invalid ${context}: ${reason}`,
	);
}
export function payloadInvalidError(
	type: RuntimePayloadType,
	message: string,
	why = `${type} did not match the required resume payload shape.`,
	suggestions: ReadonlyArray<{ readonly message: string }> = [
		{ message: `Emit a valid ${type} payload script.` },
	],
): RuntimePayloadError {
	return new RuntimePayloadError({
		code: 'MARKLESS_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		message,
		why,
		payloadType: type,
		payloadScript: payloadScriptSelector(type),
		suggestions,
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
	});
}
export function payloadScriptSelector(type: RuntimePayloadType): string {
	return `script[type="${type}"]`;
}
