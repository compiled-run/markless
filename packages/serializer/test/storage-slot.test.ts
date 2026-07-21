import { expect, test } from 'vitest';
import { STORAGE_SLOT_SYMBOL_KEY, storageSlotEntryKey } from '../src/index.ts';

test('storage slot exports the protocol symbol and definition entry schema', () => {
	expect(STORAGE_SLOT_SYMBOL_KEY).toBe('tsrx.storage/1');
	expect(storageSlotEntryKey('src/App.tsrx', 'theme-mode')).toBe('src/App.tsrx#theme-mode');
});
