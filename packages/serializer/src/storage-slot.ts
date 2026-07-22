export const STORAGE_SLOT_SYMBOL_KEY = 'tsrx.storage/1';
export const STORAGE_SLOT_MODE_KEY = '::mode';
export const STORAGE_SLOT_MODE_IMMEDIATE = 'immediate';
export const STORAGE_SLOT_MODE_DEFERRED = 'deferred';

export type StorageSeedMetadata = {
	readonly slotKey: string;
	readonly driverKey: string;
	readonly fallback: string;
};

export function storageSlotEntryKey(moduleId: string, key: string): string {
	return `${moduleId}#${key}`;
}

export function storageSlotEntryKeyFromGraphNodeId(graphNodeId: string): string {
	return graphNodeId.startsWith('storage:') ? graphNodeId.slice('storage:'.length) : graphNodeId;
}

export function createStorageSeedMetadata(
	moduleId: string,
	driverKey: string,
	fallback: string,
): StorageSeedMetadata {
	return {
		slotKey: storageSlotEntryKey(moduleId, driverKey),
		driverKey,
		fallback,
	};
}

// The seed's slotKey MUST anchor to the same graphNodeId the wake-time override
// (payload-graph-construct) derives its lookup key from — otherwise a warm slot
// is written under one key and read under another, and the component silently
// falls back. Derive it from the graphNodeId so they match by construction.
export function createStorageSeedMetadataFromGraphNodeId(
	graphNodeId: string,
	driverKey: string,
	fallback: string,
): StorageSeedMetadata {
	return {
		slotKey: storageSlotEntryKeyFromGraphNodeId(graphNodeId),
		driverKey,
		fallback,
	};
}
