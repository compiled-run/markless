import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../../src/index.ts';

// Only one guarded cancel per handler is lifted into the policy the resumer
// applies before the handler symbol loads. A second cancel statement stays in
// the lazy handler and never reaches the event, so it is refused, not ignored.
function gridModule(handlerBody: string): string {
	return `
import { state } from '@markless/core';

export function Grid() @{
	const grid = state({ multi: true, locked: false });

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

test('a second guarded cancel statement is refused with a folding remedy', async () => {
	const { source, event, diagnostics } = await graphFor(`
			if (event.key === 'ArrowDown') event.preventDefault();
			if (grid.multi && event.key === 'a' && event.ctrlKey === true) event.preventDefault();
`);
	const second = source.lastIndexOf('event.preventDefault()');

	expect(event?.syncPolicy).toEqual({
		when: { type: 'event-equals', field: 'key', value: 'ArrowDown' },
		actions: ['preventDefault'],
	});
	expect(diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SYNC_POLICY_SECOND_CANCEL',
			severity: 'error',
			phase: 'sync-policy',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			primarySpan: {
				filename: 'src/Grid.tsrx',
				start: second,
				end: second + 'event.preventDefault()'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_SECOND_CANCEL',
		}),
	]);
	expect(diagnostics[0]?.message).toContain('preventDefault()');
	expect(diagnostics[0]?.message).toContain('onKeydown');
	expect(diagnostics[0]?.suggestions.map((suggestion) => suggestion.message).join('\n')).toMatch(
		/fold/i,
	);
});

test('the folded guard is the remedy: one `if` over both conditions extracts cleanly', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'ArrowDown' || (grid.multi && event.key === 'a' && event.ctrlKey === true)) {
				event.preventDefault();
			}
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy?.when.type).toBe('or');
});

test('an unconditional cancel followed by a guarded second action is refused', async () => {
	const { source, event, diagnostics } = await graphFor(`
			event.preventDefault();
			if (grid.locked) event.stopPropagation();
`);
	const stray = source.indexOf('event.stopPropagation()');

	expect(event?.syncPolicy?.actions).toEqual(['preventDefault']);
	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', stray]]);
	expect(diagnostics[0]?.message).toContain('stopPropagation()');
});

test('an unextractable first guard skipped in favour of a later one is a second cancel, not silence', async () => {
	const { source, event, diagnostics } = await graphFor(`
			if (isLocked(grid)) event.preventDefault();
			if (event.key === 'Escape') event.preventDefault();
`);
	const first = source.indexOf('event.preventDefault()');

	expect(event?.syncPolicy?.when).toEqual({
		type: 'event-equals',
		field: 'key',
		value: 'Escape',
	});
	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', first]]);
});

test('a cancel in the else arm of the policy statement is a second cancel', async () => {
	const { source, diagnostics } = await graphFor(`
			if (event.key === 'Escape') {
				event.preventDefault();
			} else {
				event.stopPropagation();
			}
`);
	const stray = source.indexOf('event.stopPropagation()');

	expect(
		diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.primarySpan?.start]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', stray]]);
});

test('one guard holding both actions and a later plain handler body is not a second cancel', async () => {
	const { event, diagnostics } = await graphFor(`
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
			}
			grid.locked = true;
`);

	expect(diagnostics).toEqual([]);
	expect(event?.syncPolicy?.actions).toEqual(['preventDefault', 'stopPropagation']);
});

test('a callback prop the child spreads onto its element is refused the same way', async () => {
	const child = await compileTsrxModule({
		filename: 'src/item.tsrx',
		source: `
export function Item({ ...rest }) @{
	<button {...rest}>item</button>
}
`,
		symbols: [],
	});
	const source = `
import { state } from '@markless/core';
import { Item } from './item.tsrx';

export function List() @{
	const list = state({ multi: true });

	<Item
		onKeydown={(event) => {
			if (event.key === 'ArrowDown') event.preventDefault();
			if (list.multi && event.key === 'a') event.preventDefault();
		}}
	/>
}
`;
	const parent = await compileTsrxModule({
		filename: 'src/list.tsrx',
		source,
		symbols: [],
		importedModuleInterfaces: { './item.tsrx': child.moduleGraphInterface },
	});
	const second = source.lastIndexOf('event.preventDefault()');

	expect(
		parent.semanticGraph.diagnostics.map((diagnostic) => [
			diagnostic.code,
			diagnostic.primarySpan?.start,
		]),
	).toEqual([['MARKLESS_SYNC_POLICY_SECOND_CANCEL', second]]);
});
