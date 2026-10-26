import type { RuntimePayloadType } from './protocol-client.ts';

/**
 * The record lists a payload script may serve as record templates instead of a plain array. A
 * reader that parses a payload script without decoding it may read only the other lists.
 */
export const PROTOCOL_TEMPLATED_LISTS = {
	'markless/state': ['cells', 'computed', 'sharedSeeds', 'sharedDefinitions', 'sharedRecords'],
	'markless/view': [
		'locators',
		'events',
		'domUpdates',
		'behaviors',
		'elementHandles',
		'keyedRepeats',
	],
} as const satisfies Record<RuntimePayloadType, ReadonlyArray<string>>;
