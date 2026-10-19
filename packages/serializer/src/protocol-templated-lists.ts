import type { RuntimePayloadType } from './protocol-client.ts';

/**
 * The record lists a payload script may serve as record templates instead of a plain array. The
 * inline resumer reads the others at page load, before any decoder has loaded, so they stay plain.
 */
export const PROTOCOL_TEMPLATED_LISTS = {
	'markless/state': ['computed', 'sharedSeeds', 'sharedDefinitions'],
	'markless/view': ['domUpdates', 'behaviors', 'elementHandles'],
} as const satisfies Record<RuntimePayloadType, ReadonlyArray<string>>;
