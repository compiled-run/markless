import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { adoptedWidgetDefinitionIds } from '../../src/passes/public-render/shared-seed-pass.ts';

// A widget family a module only imported is rooted where it was declared, so no
// component here may own its payload nodes: a component that owns them composes
// as a second root of the family, and the family's element() rosters then merge
// across sibling widgets on the page. The end-to-end proof is the browser
// witness `enclosing-family-read`; these pin the two build-time halves that
// cannot be read off a rendered page.

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

test('a module’s own widget family is not adopted', async () => {
	const result = await compile(
		'src/bar.tsrx',
		`import { element, shared, state } from '@markless/core';
export const barState = shared(() => { const bar = state({ label: '' }); const itemEls = element(); return { ...bar, itemEls }; }, { scope: 'widget' });
export function Bar({ children }) @{ const bar = barState(); <div role="toolbar" data-label={bar.label}>{children}</div> }`,
	);
	expect(
		adoptedWidgetDefinitionIds({
			semanticGraph: result.semanticGraph,
		} as Parameters<typeof adoptedWidgetDefinitionIds>[0]).size,
	).toBe(0);
});

test('a single-component module that adopts nothing still emits no node partition', async () => {
	// The partition is what excludes an adopted family's nodes, and it costs
	// bytes: a module with nothing to exclude must keep emitting none.
	const result = await compile(
		'src/counter.tsrx',
		`import { state } from '@markless/core';
export function Counter() @{ let count = state(0); <button onClick={() => count++}>{count}</button> }`,
	);
	const definition = result.publicRenderModule.componentDefinitions?.find(
		(candidate) => candidate.name === 'Counter',
	);
	expect(definition?.stateCellIndexes).toBeUndefined();
});
