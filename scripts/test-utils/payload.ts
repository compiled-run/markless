import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';

export type PayloadScriptPair = {
	readonly stateScript: string;
	readonly viewScript: string;
};

export type DecodedPayloadScriptPair = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type ProtocolPayloadSummary = {
	readonly cells: number;
	readonly computed: number;
	readonly locators: number;
	readonly events: number;
	readonly domUpdates: number;
	readonly behaviors: number;
	readonly elementHandles: number;
	readonly asyncBoundaries: number;
};

export type PayloadDebugDump = {
	readonly summary: ProtocolPayloadSummary;
	readonly state: {
		readonly version: ProtocolStatePayload['version'];
		readonly cells: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly name: string;
			readonly valueKind: ProtocolStatePayload['cells'][number]['valueKind'];
		}>;
		readonly computed: ProtocolStatePayload['computed'];
	};
	readonly view: {
		readonly version: ProtocolViewPayload['version'];
		readonly locators: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly index: number;
			readonly tagName: string;
		}>;
		readonly events: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly eventName: string;
			readonly symbolIds: ReadonlyArray<string>;
			readonly hasSyncPolicy: boolean;
		}>;
		readonly domUpdates: ProtocolViewPayload['domUpdates'];
		readonly behaviors: ProtocolViewPayload['behaviors'];
		readonly elementHandles: ProtocolViewPayload['elementHandles'];
		readonly asyncBoundaries: ReadonlyArray<{
			readonly id: string;
			readonly startIndex: number;
			readonly endIndex: number;
			readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
		}>;
	};
};

export function assertPayloadScriptTypes(input: PayloadScriptPair): void {
	assertPayloadScriptWrapper(input.stateScript, 'markless/state');
	assertPayloadScriptWrapper(input.viewScript, 'markless/view');
}

export function decodePayloadScriptPair(input: PayloadScriptPair): DecodedPayloadScriptPair {
	return {
		state: parsePayloadScript(input.stateScript, 'markless/state') as ProtocolStatePayload,
		view: parsePayloadScript(input.viewScript, 'markless/view') as ProtocolViewPayload,
	};
}

export function summarizePayloadScripts(input: PayloadScriptPair): ProtocolPayloadSummary {
	return summarizeProtocolPayload(decodePayloadScriptPair(input));
}

export function createPayloadDebugDump(input: PayloadScriptPair): PayloadDebugDump {
	const decoded = decodePayloadScriptPair(input);

	return {
		summary: summarizeProtocolPayload(decoded),
		state: {
			version: decoded.state.version,
			cells: decoded.state.cells.map((cell) => ({
				graphNodeId: cell.graphNodeId,
				name: cell.name,
				valueKind: cell.valueKind,
			})),
			computed: decoded.state.computed.map((computed) => ({ ...computed })),
		},
		view: {
			version: decoded.view.version,
			locators: decoded.view.locators.map((locator) => ({
				hostNodeId: locator.hostNodeId,
				index: locator.index,
				tagName: locator.tagName,
			})),
			events: decoded.view.events.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				symbolIds: [...event.symbolIds],
				hasSyncPolicy: event.syncPolicy !== undefined,
			})),
			domUpdates: decoded.view.domUpdates.map((domUpdate) => ({
				hostNodeId: domUpdate.hostNodeId,
				source: domUpdate.source,
				graphNodeId: domUpdate.graphNodeId,
				path: [...domUpdate.path],
				...(domUpdate.target ? { target: cloneDomUpdateTarget(domUpdate.target) } : {}),
				symbolId: domUpdate.symbolId,
			})),
			behaviors: decoded.view.behaviors.map((behavior) => ({ ...behavior })),
			elementHandles: decoded.view.elementHandles.map((handle) => ({ ...handle })),
			asyncBoundaries: decoded.view.asyncBoundaries.map((boundary) => ({
				id: boundary.id,
				startIndex: boundary.startAnchor.index,
				endIndex: boundary.endAnchor.index,
				asyncReads: boundary.asyncReads.map((read) => ({
					source: read.source,
					graphNodeId: read.graphNodeId,
					path: [...read.path],
					runnerSymbolId: read.runnerSymbolId,
				})),
			})),
		},
	};
}

export function summarizeProtocolPayload(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
}): ProtocolPayloadSummary {
	return {
		cells: input.state.cells.length,
		computed: input.state.computed.length,
		locators: input.view.locators.length,
		events: input.view.events.length,
		domUpdates: input.view.domUpdates.length,
		behaviors: input.view.behaviors.length,
		elementHandles: input.view.elementHandles.length,
		asyncBoundaries: input.view.asyncBoundaries.length,
	};
}

function parsePayloadScript(script: string, type: 'markless/state' | 'markless/view'): unknown {
	assertPayloadScriptWrapper(script, type);

	try {
		return JSON.parse(script.slice(scriptPrefix(type).length, -scriptSuffix.length));
	} catch {
		throw new Error(`Invalid ${type} payload JSON.`);
	}
}

function cloneDomUpdateTarget(
	target: NonNullable<ProtocolViewPayload['domUpdates'][number]['target']>,
): NonNullable<ProtocolViewPayload['domUpdates'][number]['target']> {
	if (target.kind === 'attribute') return { kind: 'attribute', name: target.name };
	if (target.kind === 'property') return { kind: 'property', name: target.name };
	if (target.kind === 'class') return { kind: 'class' };
	if (target.kind === 'style') return { kind: 'style' };
	return { kind: 'text' };
}

function assertPayloadScriptWrapper(
	script: string,
	type: 'markless/state' | 'markless/view',
): void {
	if (!script.startsWith(scriptPrefix(type)) || !script.endsWith(scriptSuffix)) {
		throw new Error(`Expected ${type} payload script.`);
	}
}

function scriptPrefix(type: 'markless/state' | 'markless/view'): string {
	return `<script type="${type}">`;
}

const scriptSuffix = '</script>';
