import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@arcade/protocol';
import type { ProtocolViewPayloadInput } from '../artifacts.ts';

export function createProtocolViewPayload(input: ProtocolViewPayloadInput): ProtocolViewPayload {
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
	const behaviorSymbols = new Map<string, string[]>();
	const asyncRunnerSymbols = new Map<string, string>();

	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = symbol.id;
			eventSymbols.set(key, symbols);
		}

		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				symbol.id,
			);
		}

		if (symbol.kind === 'behavior') {
			const symbols = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			symbols[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, symbols);
		}

		if (symbol.kind === 'async-computed-runner') {
			asyncRunnerSymbols.set(symbol.graphNodeId, symbol.id);
		}
	}

	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: input.payloadArena.view.locators,
		events: input.payloadArena.view.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			syncPolicy: event.syncPolicy,
			symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
		})),
		domUpdates: input.payloadArena.view.domUpdates.map((domUpdate) => ({
			...domUpdate,
			symbolId: domUpdateSymbols.get(
				`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
			),
		})),
		behaviors: input.payloadArena.view.behaviors.map((behavior, index) => ({
			...behavior,
			symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
		})),
		elementHandles: input.payloadArena.view.elementHandles,
		asyncBoundaries: input.payloadArena.view.asyncBoundaries.map((boundary) => ({
			...boundary,
			asyncReads: boundary.asyncReads.map((read) => ({
				...read,
				runnerSymbolId: asyncRunnerSymbols.get(read.graphNodeId),
			})),
		})),
	};
}

function domUpdateTargetKey(
	target: ProtocolViewPayloadInput['payloadArena']['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	return target.kind;
}
