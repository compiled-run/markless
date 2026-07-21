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
