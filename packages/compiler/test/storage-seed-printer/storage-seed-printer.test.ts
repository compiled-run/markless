import { nonFiniteName } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { jsonSourceWithNonFiniteNumbers } from '../../src/passes/public-render/non-finite-json.ts';
import { renderBodyLines } from '../../src/passes/public-render/render-body.ts';

/**
 * The storage-seed default in `render-body` is the third printer of a folded
 * constant, after the render-data module and the bundler's definitions. JSON has
 * no form for a non-finite number and writes one as `null`, so the emitted line
 * would hand the cell a silently wrong value; the emitted module is JavaScript,
 * where the serializer's own name for that value denotes it exactly.
 */
function storageSeedLines(initialValue: unknown): string[] {
	const storageDeclaration = {
		type: 'VariableDeclaration',
		declarations: [
			{
				type: 'VariableDeclarator',
				id: { type: 'Identifier', name: 'cap' },
				init: { type: 'CallExpression', callee: { type: 'Identifier', name: 'storage' } },
			},
		],
	};
	const root = { type: 'Element' };
	const component = {
		type: 'FunctionDeclaration',
		body: { type: 'BlockStatement', body: [storageDeclaration, root] },
	};
	return renderBodyLines(
		{
			source: { source: '', filename: 'src/App.tsrx' },
			semanticGraph: {
				graphBindings: [
					{
						id: 'storage:src/App.tsrx#cap',
						name: 'cap',
						kind: 'state',
						writable: true,
						initialValue,
						storage: { key: 'cap' },
					},
				],
			},
		} as any,
		{ component, root } as any,
		'stateValue',
		'values',
		'payload',
		['return root;'],
	);
}

test('a finite storage seed prints the bytes JSON already printed', () => {
	expect(storageSeedLines('light')).toEqual([
		'\tlet cap = stateValue(values, payload, "storage:src/App.tsrx#cap", "light");',
		'\treturn root;',
	]);
	expect(storageSeedLines({ span: 3, label: 'rows' })).toEqual([
		'\tlet cap = stateValue(values, payload, "storage:src/App.tsrx#cap", {"span":3,"label":"rows"});',
		'\treturn root;',
	]);
});

test('a non-finite storage seed prints the serializer name, not null', () => {
	expect(storageSeedLines(Number.POSITIVE_INFINITY)).toEqual([
		`\tlet cap = stateValue(values, payload, "storage:src/App.tsrx#cap", ${nonFiniteName(Number.POSITIVE_INFINITY)});`,
		'\treturn root;',
	]);
	expect(storageSeedLines({ cap: Number.POSITIVE_INFINITY, floor: Number.NEGATIVE_INFINITY, missing: Number.NaN, span: 3 })).toEqual([
		`\tlet cap = stateValue(values, payload, "storage:src/App.tsrx#cap", {"cap":${nonFiniteName(Number.POSITIVE_INFINITY)},"floor":${nonFiniteName(Number.NEGATIVE_INFINITY)},"missing":${nonFiniteName(Number.NaN)},"span":3});`,
		'\treturn root;',
	]);
});

test('the printer returns JSON byte for byte when nothing in the payload is non-finite', () => {
	const payload = {
		text: 'a "quoted" line\nwith \\escapes and  ',
		rows: [1, null, -0, 1e308, { nested: [true, false] }],
		empty: {},
	};

	expect(jsonSourceWithNonFiniteNumbers(payload)).toBe(JSON.stringify(payload));
	expect(jsonSourceWithNonFiniteNumbers(undefined)).toBeUndefined();
});

test('a payload spelling the printer marker keeps it as authored text', () => {
	const payload = { note: ' markless-non-finite0', cap: Number.POSITIVE_INFINITY };

	expect(jsonSourceWithNonFiniteNumbers(payload)).toBe(
		`{"note":" markless-non-finite0","cap":${nonFiniteName(Number.POSITIVE_INFINITY)}}`,
	);
});

/**
 * What keeps that printer from meeting a non-finite value today: `storage()`
 * takes a string literal fallback and refuses anything else, so a storage
 * binding's `initialValue` is a string by construction. Lifting that refusal is
 * what would put a number in front of the printer.
 */
test('storage refuses a numeric fallback, so the printer only meets strings from source', async () => {
	const result = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: `import { storage } from '@markless/core';
export let cap = storage('cap', 1e400);
export function App() @{
	<p>{cap}</p>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.graphBindings).toEqual([]);
	expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_STORAGE_KEY_STATIC',
	]);
});
