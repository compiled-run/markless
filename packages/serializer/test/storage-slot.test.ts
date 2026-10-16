import { expect, test } from 'vitest';
import {
	createStorageCookieReader,
	STORAGE_SLOT_SYMBOL_KEY,
	storageCookieAssignment,
	storageCookieName,
	storageSlotEntryKey,
	storageSlotEntryKeyFromGraphNodeId,
} from '../src/index.ts';

test('storage slot exports the protocol symbol and definition entry schema', () => {
	expect(STORAGE_SLOT_SYMBOL_KEY).toBe('tsrx.storage/1');
	expect(storageSlotEntryKey('src/App.tsrx', 'theme-mode')).toBe('src/App.tsrx#theme-mode');
	expect(storageSlotEntryKeyFromGraphNodeId('storage:src/App.tsrx#theme-mode')).toBe(
		'src/App.tsrx#theme-mode',
	);
});

test('storage cookie names keep distinct keys distinct and read back only their own values', () => {
	expect(storageCookieName('theme')).not.toBe(storageCookieName('markless:theme'));
	expect(storageCookieName('markless:theme')).not.toBe(storageCookieName('markless-theme'));

	const read = createStorageCookieReader(
		[
			'theme=ignored',
			`${storageCookieName('theme')}=${encodeURIComponent('dark; "quoted" <b>')}`,
			`${storageCookieName('broken')}=%E0%A4%A`,
			`${storageCookieName('huge')}=${'x'.repeat(5000)}`,
		].join('; '),
	);

	expect(read('theme')).toBe('dark; "quoted" <b>');
	expect(read('broken')).toBeUndefined();
	expect(read('huge')).toBeUndefined();
	expect(read('missing')).toBeUndefined();
	expect(createStorageCookieReader(null)('theme')).toBeUndefined();
});

test('a storage cookie assignment round-trips through the reader and carries its attributes', () => {
	const assignment = storageCookieAssignment('markless:theme', 'dark;x=1', true);
	const [pair, ...attributes] = assignment.split(';');

	expect(createStorageCookieReader(pair)('markless:theme')).toBe('dark;x=1');
	expect(attributes).toEqual(['path=/', expect.stringMatching(/^max-age=\d+$/), 'samesite=lax', 'secure']);
	expect(storageCookieAssignment('theme', 'dark', false)).not.toContain('secure');
});
