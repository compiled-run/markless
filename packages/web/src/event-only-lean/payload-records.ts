import type { ProtocolStatePayload, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { EventOnlyResumePayloadDocument, EventOnlyResumeRecord } from './types.ts';
import type { RuntimeDemandMap } from './lean-shared.ts';
import { marklessSyncPolicyGraphIds } from '../fns/sync-policy-graph-ids.ts';

type RuntimeDemandAction = NonNullable<RuntimeDemandMap['actions']>[number];

export function readScalarCorePayloadRecordsFromDocument(
	document: EventOnlyResumePayloadDocument,
	input: {
		readonly eventRecord: EventOnlyResumeRecord;
		readonly runtimeDemandMap?: unknown;
		readonly graphNodeIds: ReadonlyArray<string>;
	},
): { readonly state: ProtocolStatePayload; readonly view: ProtocolViewPayload } | null {
	const action = scalarAction(input.eventRecord, input.runtimeDemandMap);
	if (!action?.payloadRecordIds || (action.recordKinds ?? []).some((kind) => kind !== 'event' && kind !== 'dom-update')) return null;
	const recordIds = new Set(action.payloadRecordIds);
	if (!recordIds.has(`event:${input.eventRecord.hostNodeId}:${input.eventRecord.eventName}`)) return null;
	const viewText = readPayloadScriptText(document, 'markless/view');
	const domUpdates = readArrayPropertyRecords<ProtocolViewPayload['domUpdates'][number]>(viewText, 'domUpdates')
		.filter((record) => recordIds.has(`dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`));
	const locatorHostIds = new Set([
		input.eventRecord.hostNodeId,
		...domUpdates.map((record) => record.hostNodeId),
	]);
	const locators = readArrayPropertyRecords<ProtocolViewPayload['locators'][number]>(viewText, 'locators')
		.filter((locator) => locatorHostIds.has(locator.hostNodeId));
	const cellIds = new Set([
		...input.graphNodeIds,
		...domUpdates.map((record) => record.graphNodeId),
	]);
	const stateText = readPayloadScriptText(document, 'markless/state');
	if (readArrayPropertyRecords<unknown>(stateText, 'computed').length > 0) return null;
	const cells = readArrayPropertyRecords<ProtocolStatePayload['cells'][number]>(stateText, 'cells')
		.filter((cell) => cellIds.has(cell.graphNodeId));
	return {
		state: { version: readVersion(stateText), cells, computed: [] },
		view: {
			version: readVersion(viewText),
			locators,
			events: [input.eventRecord],
			domUpdates,
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncBoundaries: [],
		},
	};
}

export function readRowPayloadRecordsFromDocument(
	document: EventOnlyResumePayloadDocument,
	input: {
		readonly eventName: string;
		readonly runtimeDemandMap?: unknown;
	},
): { readonly state: ProtocolStatePayload; readonly view: ProtocolViewPayload } | null {
	const action = rowAction(input.eventName, input.runtimeDemandMap);
	if (!action?.payloadRecordIds || (action.recordKinds ?? []).some((kind) => kind !== 'keyed-repeat' && kind !== 'dom-update')) return null;
	const recordIds = new Set(action.payloadRecordIds);
	const viewText = readPayloadScriptText(document, 'markless/view');
	const keyedRepeats = readArrayPropertyRecords<NonNullable<ProtocolViewPayload['keyedRepeats']>[number]>(viewText, 'keyedRepeats')
		.filter((record) => recordIds.has(`keyed-repeat:${record.id}`));
	if (keyedRepeats.length !== 1) return null;
	const repeat = keyedRepeats[0]!;
	const rowEvent = repeat.rowEvents.find((event) => event.eventName === action.eventName);
	if (!rowEvent) return null;
	const domUpdates = readArrayPropertyRecords<ProtocolViewPayload['domUpdates'][number]>(viewText, 'domUpdates')
		.filter((record) => recordIds.has(`dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`));
	const locatorHostIds = new Set([
		repeat.parentHostNodeId,
		...domUpdates.map((record) => record.hostNodeId),
	]);
	const locators = readArrayPropertyRecords<ProtocolViewPayload['locators'][number]>(viewText, 'locators')
		.filter((locator) => locatorHostIds.has(locator.hostNodeId));
	const cellIds = new Set([
		repeat.collectionGraphNodeId,
		...marklessSyncPolicyGraphIds(rowEvent.syncPolicy),
		...domUpdates.map((record) => record.graphNodeId),
	].filter((id): id is string => !!id));
	const stateText = readPayloadScriptText(document, 'markless/state');
	const cells = readArrayPropertyRecords<ProtocolStatePayload['cells'][number]>(stateText, 'cells')
		.filter((cell) => cellIds.has(cell.graphNodeId));
	return {
		state: { version: readVersion(stateText), cells, computed: [] },
		view: {
			version: readVersion(viewText),
			locators,
			events: [],
			domUpdates,
			behaviors: [],
			elementHandles: [],
			keyedRepeats,
			branches: [],
			asyncBoundaries: [],
		},
	};
}

function scalarAction(eventRecord: EventOnlyResumeRecord, runtimeDemandMap: unknown): RuntimeDemandAction | undefined {
	const demandMap = runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return undefined;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('event') !== true || replaced.get('dom-update') !== true) return undefined;
	return demandMap.actions.find((candidate) =>
		candidate.recordKind === 'event' &&
		candidate.hostNodeId === eventRecord.hostNodeId &&
		candidate.eventName === eventRecord.eventName,
	);
}

function rowAction(eventName: string, runtimeDemandMap: unknown): RuntimeDemandAction | undefined {
	const demandMap = runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return undefined;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('keyed-repeat') !== true || replaced.get('dom-update') !== true) return undefined;
	return demandMap.actions.find((candidate) =>
		candidate.recordKind === 'keyed-repeat-row' &&
		candidate.eventName === eventName,
	);
}

function readArrayPropertyRecords<T>(source: string, property: string): T[] {
	const arrayStart = source.indexOf(`"${property}"`);
	if (arrayStart < 0) return [];
	const open = source.indexOf('[', arrayStart);
	if (open < 0) return [];
	const close = findMatching(source, open, '[', ']');
	if (close < 0) return [];
	const body = source.slice(open + 1, close).trim();
	if (!body) return [];
	return splitTopLevelItems(body).map((item) => JSON.parse(item) as T);
}

function splitTopLevelItems(body: string): string[] {
	const items: string[] = [];
	let start = 0;
	let depth = 0;
	let quote = '';
	for (let index = 0; index < body.length; index++) {
		const char = body[index]!;
		if (quote) {
			if (char === '\\') index++;
			else if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === '{' || char === '[') depth++;
		else if (char === '}' || char === ']') depth--;
		else if (char === ',' && depth === 0) {
			items.push(body.slice(start, index));
			start = index + 1;
		}
	}
	items.push(body.slice(start));
	return items.map((item) => item.trim()).filter(Boolean);
}

function findMatching(source: string, open: number, openChar: string, closeChar: string): number {
	let depth = 0;
	let quote = '';
	for (let index = open; index < source.length; index++) {
		const char = source[index]!;
		if (quote) {
			if (char === '\\') index++;
			else if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === openChar) depth++;
		else if (char === closeChar && --depth === 0) return index;
	}
	return -1;
}

function readVersion(source: string): number {
	return Number(/"version"\s*:\s*(\d+)/.exec(source)?.[1] ?? 1);
}

function readPayloadScriptText(document: EventOnlyResumePayloadDocument, type: 'markless/state' | 'markless/view'): string {
	const element = document.querySelector(`script[type="${type}"]`);
	const text = element?.textContent ?? element?.text ?? element?.innerHTML;
	if (text == null) throw payloadRecordError(type);
	return text;
}

function payloadRecordError(type: string): Error {
	return Object.assign(new Error(`MARKLESS_LEAN_PAYLOAD_MISSING: Missing ${type} payload script.`), {
		code: 'MARKLESS_LEAN_PAYLOAD_MISSING',
		severity: 'error',
		phase: 'payload',
		docsUrl: 'https://markless.dev/errors/MARKLESS_LEAN_PAYLOAD_MISSING',
	});
}
