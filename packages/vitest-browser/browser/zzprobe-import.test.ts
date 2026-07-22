import { expect, test } from 'vitest';
import StorageFixture from './fixtures/storage.tsrx';

test('PROBE: importing the compiled storage fixture does not hang', () => {
	expect(StorageFixture).toBeDefined();
});
