import type { ProtocolStatePayload } from '@markless/serializer/protocol';

// Widget instances are per rendered widget; every other scope outlives the page (spec 03).
export const hasLiveSharedDefinitions = (state: ProtocolStatePayload | undefined): boolean =>
	!!state?.sharedDefinitions?.some((definition) => definition.scope !== 'widget');
