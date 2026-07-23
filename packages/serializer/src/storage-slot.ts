export const STORAGE_SLOT_SYMBOL_KEY = 'tsrx.storage/1';

// The no-flash <html> attribute name for a driver key. Derived keys contain a
// colon (markless:theme) which is not a clean attribute name, so any character
// outside [A-Za-z0-9-] collapses to a hyphen: markless:theme -> data-markless-theme,
// theme -> data-theme. Used identically by the seed script and the storage plane
// so both write the same attribute.
export function storageAttributeName(driverKey: string): string {
	return `data-${driverKey.replace(/[^A-Za-z0-9-]+/g, '-')}`;
}

// A storage key is either an author's verbatim explicit key or a derived
// markless:<identifier>. Permissive but structurally safe: letters, digits, and
// $ _ : . - only (no whitespace, quotes, brackets, or control characters). The
// colon admits the markless: namespace; the resume decoder uses this to reject
// malformed payloads.
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9$_:.-]+$/;

export function isValidStorageKey(value: string): boolean {
	return STORAGE_KEY_PATTERN.test(value);
}

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
