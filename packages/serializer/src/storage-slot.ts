export const STORAGE_SLOT_SYMBOL_KEY = 'tsrx.storage/1';

export function storageSlotEntryKey(moduleId: string, key: string): string {
	return `${moduleId}#${key}`;
}
