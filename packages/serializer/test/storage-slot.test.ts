import { expect, test } from 'vitest';
import {
	STORAGE_SLOT_MODE_DEFERRED,
	STORAGE_SLOT_MODE_IMMEDIATE,
	STORAGE_SLOT_MODE_KEY,
	STORAGE_SLOT_SYMBOL_KEY,
	storageSlotEntryKey,
	storageSlotEntryKeyFromGraphNodeId,
} from '../src/index.ts';

test('storage slot exports the protocol symbol and definition entry schema', () => {
	expect(STORAGE_SLOT_SYMBOL_KEY).toBe('tsrx.storage/1');
	expect(STORAGE_SLOT_MODE_KEY).toBe('::mode');
	expect(STORAGE_SLOT_MODE_IMMEDIATE).toBe('immediate');
	expect(STORAGE_SLOT_MODE_DEFERRED).toBe('deferred');
	expect(storageSlotEntryKey('src/App.tsrx', 'theme-mode')).toBe('src/App.tsrx#theme-mode');
	expect(storageSlotEntryKeyFromGraphNodeId('storage:src/App.tsrx#theme-mode')).toBe(
		'src/App.tsrx#theme-mode',
	);
});
