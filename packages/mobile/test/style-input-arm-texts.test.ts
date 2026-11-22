import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileRungApp } from '../src/harness/rung.ts';

const app = await compileRungApp(join(import.meta.dirname, '..', 'proofs', 's40-arm-texts'));
const input = app.styleInputs[0]!.input;
const text = (id: string) => input.nodes.find((node) => node.id === id);

test('a text in an arm not shown at mount that is only expressions reaches Dragon as a no-break space, which lays out a box the host fills when the arm opens', () => {
	expect(text('h2:text0')).toMatchObject({ kind: 'text', text: '\u00a0' });
});

test('a text in an arm not shown at mount keeps its literals as they are', () => {
	expect(text('h4:text0')).toMatchObject({ kind: 'text', text: 'No note open' });
});
