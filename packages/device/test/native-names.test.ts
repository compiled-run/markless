import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PLATFORM_PIECES_PACKAGE } from '@markless/serializer/native-view';

test('the package is the one the native build recognises <native.sheet> by', () => {
	const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string };
	expect(manifest.name).toBe(PLATFORM_PIECES_PACKAGE);
});
