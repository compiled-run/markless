import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
} from '../src/protocol-constants.ts';

test('protocol client keeps only the size-gated raw payload type spellings', () => {
	const source = readFileSync(new URL('../src/protocol-client.ts', import.meta.url), 'utf8');
	const rawPayloadTypes = source.match(/markless\/(?:state|view)/g) ?? [];

	expect(rawPayloadTypes).toHaveLength(15);
	expect(rawPayloadTypes.every((type) =>
		type === MARKLESS_STATE_SCRIPT_TYPE || type === MARKLESS_VIEW_SCRIPT_TYPE,
	)).toBe(true);
});
