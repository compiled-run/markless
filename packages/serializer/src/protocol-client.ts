import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';
import type {
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
} from './protocol-constants.ts';
const ASYNC_PROTOCOL_VERSION = 1;
export type EncodedPayloadScripts = { readonly stateScript: string; readonly viewScript: string };
export type DecodedPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};
export type RuntimePayloadType =
	| typeof MARKLESS_STATE_SCRIPT_TYPE
	| typeof MARKLESS_VIEW_SCRIPT_TYPE;
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
	readonly code: RuntimePayloadErrorCode;
	readonly severity = 'error' as const;
	readonly phase = 'payload' as const;
	readonly title: string;
	readonly why: string;
	readonly payloadType: RuntimePayloadType;
	readonly payloadScript: string;
	readonly expectedVersion?: number;
	readonly actualVersion?: unknown;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
	constructor(d: RuntimePayloadDiagnostic) {
		super(d.message);
		this.name = 'RuntimePayloadError';
		this.code = d.code;
		this.title = d.title;
		this.why = d.why;
		this.payloadType = d.payloadType;
		this.payloadScript = d.payloadScript;
		this.expectedVersion = d.expectedVersion;
		this.actualVersion = d.actualVersion;
		this.suggestions = d.suggestions;
		this.docsUrl = d.docsUrl;
	}
}
export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	const state = parse(input.stateScript, 'markless/state') as ProtocolStatePayload;
	const view = parse(input.viewScript, 'markless/view') as ProtocolViewPayload;
	baseState(state);
	baseView(view);
	version(state.version, 'markless/state');
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
// No runtime reference to the protocol constants folds byte-neutrally in this module;
// permanent gzip walls require raw literals. Keep exemptions tethered by the serializer test.
function baseState(value: unknown): asserts value is ProtocolStatePayload {
	const payload = root(value, 'markless/state');
	arr(payload, 'cells', 'markless/state');
	arr(payload, 'computed', 'markless/state');
	for (const [index, cell] of payload.cells.entries()) {
		const context = `markless/state cell[${index}]`;
		const record = obj(cell, context);
		str(record, 'graphNodeId', context);
		str(record, 'name', context);
		if ('value' in record) serialized(record.value, `${context}.value`);
	}
}
function baseView(value: unknown): asserts value is ProtocolViewPayload {
	const payload = root(value, 'markless/view');
	for (const key of [
		'locators',
		'events',
		'domUpdates',
		'behaviors',
		'elementHandles',
		'asyncBoundaries',
	] as const)
		arr(payload, key, 'markless/view');
	for (const [index, locator] of payload.locators.entries()) {
		const context = `markless/view locator[${index}]`;
		const record = obj(locator, context);
		str(record, 'hostNodeId', context);
		str(record, 'tagName', context);
		if (record.strategy !== 'dom-order') invalid(context, 'expected strategy "dom-order".');
		if (!Number.isInteger(record.index) || Number(record.index) < 0)
			invalid(context, 'expected index non-negative integer.');
	}
	for (const [index, event] of payload.events.entries()) {
		const context = `markless/view event[${index}]`;
		const record = obj(event, context);
		str(record, 'hostNodeId', context);
		str(record, 'eventName', context);
		if (!Array.isArray(record.symbolIds)) invalid(context, 'expected symbolIds array.');
	}
}
function root(value: unknown, type: RuntimePayloadType): Record<string, unknown> {
	const record = obj(value, type);
	if (!('version' in record))
		throw payloadInvalidError(type, `Invalid ${type} payload: expected version.`);
	return record;
}
function obj(value: unknown, context: string): Record<string, unknown> {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
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
function version(actualVersion: unknown, type: RuntimePayloadType): void {
	if (actualVersion === ASYNC_PROTOCOL_VERSION) return;
	throw new RuntimePayloadError({
		code: 'MARKLESS_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		message: `Unsupported ${type} protocol version ${String(actualVersion)}.`,
		why: `The ${type} payload must use version ${ASYNC_PROTOCOL_VERSION}.`,
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
