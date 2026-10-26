import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../../src/index.ts';

// Every top-level guarded cancel in a handler joins the policy the resumer
// applies before the handler symbol loads. A cancel the compiler cannot place
// there would run after the event finished dispatching, so it is refused with a
// reason and a rewrite, not left silently inert.
function gridModule(handlerBody: string): string {
	return `
import { state } from '@markless/core';

function isLocked(grid: { locked: boolean }): boolean {
	return grid.locked;
}

export function Grid() @{
	const grid = state({ multi: true, locked: false, index: 0 });

	<div
		onKeydown={(event) => {
${handlerBody}
		}}
	/>
}
`;
}

async function graphFor(handlerBody: string) {
	const source = gridModule(handlerBody);
	const semanticGraph = await buildSemanticGraph({ filename: 'src/Grid.tsrx', source });
	return {
		source,
		event: semanticGraph.events[0],
		diagnostics: semanticGraph.diagnostics,
	};
}

const keyIs = (value: string) => ({ type: 'event-equals', field: 'key', value }) as const;

test('two guarded cancel blocks that each write state fold into one policy', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				grid.index = grid.index + 1;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				grid.index = grid.index - 1;
			}
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		when: { type: 'or', conditions: [keyIs('ArrowDown'), keyIs('ArrowUp')] },
		actions: ['preventDefault'],
	});
});

test('three guards with alternate spellings fold the same way', async () => {
	const { event, diagnostics } = await graphFor(`
			if ('Home' === event.key) event.preventDefault();
			if (event.key == 'End') { event.preventDefault(); }
			if (grid.multi && event.key === 'a' && event.ctrlKey) event.preventDefault();
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		when: {
			type: 'or',
			conditions: [
				keyIs('Home'),
				keyIs('End'),
				{
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:grid', path: ['multi'] },
						keyIs('a'),
						{ type: 'event-equals', field: 'ctrlKey', value: true },
					],
				},
			],
		},
		actions: ['preventDefault'],
	});
});

test('an early return narrows every folded guard after it', async () => {
	const { event, diagnostics } = await graphFor(`
			if (grid.locked) return;
			if (event.key === 'ArrowDown') event.preventDefault();
			if (event.key === 'ArrowUp') event.preventDefault();
`);
	const notLocked = {
		type: 'not',
		condition: { type: 'graph-truthy', graphNodeId: 'state:grid', path: ['locked'] },
	};

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		when: {
			type: 'or',
			conditions: [
				{ type: 'and', conditions: [notLocked, keyIs('ArrowDown')] },
				{ type: 'and', conditions: [notLocked, keyIs('ArrowUp')] },
			],
		},
		actions: ['preventDefault'],
	});
});

test('a guard block that always returns narrows the guards after it', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'Escape') {
				event.preventDefault();
				return;
			}
			if (event.shiftKey) event.preventDefault();
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		when: {
			type: 'or',
			conditions: [
				keyIs('Escape'),
				{
					type: 'and',
					conditions: [
						{ type: 'not', condition: keyIs('Escape') },
						{ type: 'event-equals', field: 'shiftKey', value: true },
					],
				},
			],
		},
		actions: ['preventDefault'],
	});
});

test('cancels with different actions become one branch each', async () => {
	const { event, diagnostics } = await graphFor(`
			event.preventDefault();
			if (grid.locked) event.stopPropagation();
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		branches: [
			{ when: { type: 'constant-truthy', value: true }, actions: ['preventDefault'] },
			{
				when: { type: 'graph-truthy', graphNodeId: 'state:grid', path: ['locked'] },
				actions: ['stopPropagation'],
			},
		],
	});
});

test('a cancel in an else arm runs when the guard does not hold', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'Escape') {
				event.preventDefault();
			} else if (event.key === 'Tab') {
				event.preventDefault();
			} else {
				event.stopPropagation();
			}
`);
	const notEscape = { type: 'not', condition: keyIs('Escape') };

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy).toEqual({
		branches: [
			{ when: keyIs('Escape'), actions: ['preventDefault'] },
			{
				when: { type: 'and', conditions: [notEscape, keyIs('Tab')] },
				actions: ['preventDefault'],
			},
			{
				when: {
					type: 'and',
					conditions: [notEscape, { type: 'not', condition: keyIs('Tab') }],
				},
				actions: ['stopPropagation'],
			},
		],
	});
});

test('a guard the policy cannot read is refused with how to rewrite it', async () => {
	const { source, event, diagnostics } = await graphFor(`
			if (isLocked(grid)) event.preventDefault();
			if (event.key === 'Escape') event.preventDefault();
`);
	const first = source.indexOf('event.preventDefault()');

	expect(event?.syncPolicy).toEqual({ when: keyIs('Escape'), actions: ['preventDefault'] });
	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', first]]);
	expect(diagnostics[0]).toMatchObject({
		severity: 'error',
		phase: 'sync-policy',
		passId: 'tsrx-semantic-graph',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_SECOND_CANCEL',
	});
	expect(diagnostics[0]?.message).toContain(
		'not limited to event fields, state, props and constants',
	);
	expect(diagnostics[0]?.suggestions[0]?.message).toContain(
		"if (event.key === 'ArrowDown') event.preventDefault()",
	);
});

test('a guard reading state an earlier statement changes is refused, not folded', async () => {
	const { source, event, diagnostics } = await graphFor(`
			if (event.key === 'a') {
				event.preventDefault();
				grid.multi = !grid.multi;
			}
			if (grid.multi) event.preventDefault();
`);
	const second = source.lastIndexOf('event.preventDefault()');

	expect(event?.syncPolicy).toEqual({ when: keyIs('a'), actions: ['preventDefault'] });
	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', second]]);
	expect(diagnostics[0]?.message).toContain(
		'state that an earlier statement in the handler can change',
	);
	expect(diagnostics[0]?.suggestions[0]?.message).toMatch(/event fields only|move it above/);
});

test('a guard reading state no earlier statement changes still folds', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'a') event.preventDefault();
			if (grid.multi) event.preventDefault();
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy?.when).toEqual({
		type: 'or',
		conditions: [
			keyIs('a'),
			{ type: 'graph-truthy', graphNodeId: 'state:grid', path: ['multi'] },
		],
	});
});

test('a cancel inside a nested callback is refused as not a top-level guard', async () => {
	const { source, diagnostics } = await graphFor(`
			if (event.key === 'Escape') event.preventDefault();
			setTimeout(() => event.stopPropagation(), 0);
`);
	const stray = source.indexOf('event.stopPropagation()');

	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', stray]]);
	expect(diagnostics[0]?.message).toContain('not the body of a top-level `if`');
	expect(diagnostics[0]?.suggestions[0]?.message).toContain(
		'if (condition) event.stopPropagation()',
	);
});

test('the lazy handler keeps none of the cancels the folded policy runs', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Grid.tsrx',
		source: gridModule(`
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				grid.index = grid.index + 1;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				grid.index = grid.index - 1;
			}
`),
		symbols: [],
	});
	const handlers = compiled.symbolModules.modules
		.map((module) => module.source)
		.filter((source) => source.includes('index'));

	expect(handlers.length).toBeGreaterThan(0);
	for (const handler of handlers) expect(handler).not.toContain('preventDefault');
});

test('a callback prop the child spreads onto its element folds the same way', async () => {
	const child = await compileTsrxModule({
		filename: 'src/item.tsrx',
		source: `
export function Item({ ...rest }) @{
	<button {...rest}>item</button>
}
`,
		symbols: [],
	});
	const listSource = (secondGuard: string) => `
import { state } from '@markless/core';
import { Item } from './item.tsrx';

function isMulti(list: { multi: boolean }): boolean {
	return list.multi;
}

export function List() @{
	const list = state({ multi: true });

	<Item
		onKeydown={(event) => {
			if (event.key === 'ArrowDown') event.preventDefault();
			if (${secondGuard}) event.preventDefault();
		}}
	/>
}
`;
	const compileList = (source: string) =>
		compileTsrxModule({
			filename: 'src/list.tsrx',
			source,
			symbols: [],
			importedModuleInterfaces: { './item.tsrx': child.moduleGraphInterface },
		});
	const folded = await compileList(listSource("list.multi && event.key === 'a'"));
	const refusedSource = listSource('isMulti(list)');
	const refused = await compileList(refusedSource);

	expect(folded.semanticGraph.diagnostics).toEqual([]);
	expect(
		refused.semanticGraph.diagnostics.map((diagnostic) => [
			diagnostic.code,
			diagnostic.primarySpan?.start,
		]),
	).toEqual([
		['MARKLESS_SYNC_POLICY_SECOND_CANCEL', refusedSource.lastIndexOf('event.preventDefault()')],
	]);
});
