// The browser's shared() instances: on the document, or on a container element for `container` scope.
// Plain data any Markless version reads, so separately built containers share them.
export const PROTOCOL_SHARED_INSTANCES_PROPERTY = '__mShared';
export const PROTOCOL_SHARED_INSTANCES_VERSION = 1;

export type ProtocolSharedInstanceListener = {
	readonly root: object;
	// false: the listener's container is gone, so it is dropped.
	readonly apply: (graphNodeId: string, value: unknown) => boolean | void;
};

export type ProtocolSharedInstance = {
	readonly shape: string;
	readonly cells: Record<string, unknown>;
	readonly listeners: ProtocolSharedInstanceListener[];
};

export type ProtocolSharedInstances = {
	readonly version: typeof PROTOCOL_SHARED_INSTANCES_VERSION;
	readonly instances: Record<string, ProtocolSharedInstance>;
	// Server-rendered containers whose runtime has not started; a write wakes the ones that resolve its definition.
	dormant?: object[];
};

// Widget instances are per rendered widget; every other scope outlives the page.
export const hasLiveSharedDefinitions = (
	state: { readonly sharedDefinitions?: ReadonlyArray<{ readonly scope?: string }> } | undefined,
): boolean => !!state?.sharedDefinitions?.some((definition) => definition.scope !== 'widget');
