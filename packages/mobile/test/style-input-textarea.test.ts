import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileRungApp } from '../src/harness/rung.ts';

const app = await compileRungApp(join(import.meta.dirname, '..', 'proofs', 's53-app-textarea'));
const input = app.styleInputs[0]!.input;
const node = (id: string) => input.nodes.find((one) => one.id === id);

test("a textarea's value reaches Dragon as its text child, not as a value attribute", () => {
	expect(node('h5')).toMatchObject({ kind: 'element', element: 'textarea' });
	expect((node('h5') as { attributes: Record<string, string> }).attributes['value']).toBeUndefined();
	expect(node('h5:text0')).toMatchObject({ kind: 'text', parent: 'h5', text: 'Milk and eggs' });
});

test('an empty textarea still has its text child, so the text the host edits in has a leaf', () => {
	expect(node('h2:text0')).toMatchObject({ kind: 'text', parent: 'h2', text: '' });
});
