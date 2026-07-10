import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
	MARKLESS_ARM_SCRIPT_TYPE,
	MARKLESS_STATE_PATCH_SCRIPT_TYPE,
} from '../../serializer/src/protocol-constants.ts';

test('payload resume keeps only the size-gated raw streamed script type spellings', () => {
	const source = readFileSync(new URL('../src/payload-resume.ts', import.meta.url), 'utf8');
	const rawStreamedTypes = source.match(/markless\/(?:arm|state-patch)/g) ?? [];

	expect(rawStreamedTypes).toHaveLength(2);
	expect(rawStreamedTypes).toEqual([
		MARKLESS_ARM_SCRIPT_TYPE,
		MARKLESS_STATE_PATCH_SCRIPT_TYPE,
	]);
});
