import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	type ProtocolViewPayload,
} from '@markless/serializer/protocol';
import type { StructureToken } from '../ssr-data/renderer.ts';

export { PROTOCOL_EVENT_ACTION_KIND };

export function createExternalDelegateView(input: {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly owner: string;
	readonly tagName: string;
}): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{
				hostNodeId: input.hostNodeId,
				strategy: 'dom-order',
				index: 0,
				tagName: input.tagName,
			},
		],
		events: [
			{
				hostNodeId: input.hostNodeId,
				eventName: input.eventName,
				symbolIds: [],
				action: {
					kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
					owner: input.owner,
				},
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

export function createExternalDelegateStructureTokens(input: {
	readonly hostNodeId: string;
	readonly idPrefix?: string;
	readonly tagName: string;
}): ReadonlyArray<StructureToken> {
	return [
		{
			kind: 'element',
			hostNodeId: `${input.idPrefix ?? ''}${input.hostNodeId}`,
			tagName: input.tagName,
		},
	];
}
