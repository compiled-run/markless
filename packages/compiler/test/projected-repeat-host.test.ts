import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A `@for` written inside a child's `{children}` is markup the consumer renders
// and the child splices into its own element, so the rows belong to an element
// the consumer never wrote. The record has to say so: resume finds the rows by
// looking their parent up, and pointed at the consumer's enclosing element it
// keys no served row and grows the list beside the child instead of into it.
// Independent of minting - it is where a PROJECTED repeat anchors.

const region = `export function Region({ children, ...rest }) @{
	<ol {...rest} ui-region="">{children}</ol>
}`;

async function repeats(page: string, child = region) {
	const [, consumer] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/region.tsrx', source: child, importSource: './region.tsrx' },
		{ filename: 'src/page.tsrx', source: page },
	]);
	expect(
		consumer!.semanticGraph.diagnostics.filter((entry) => entry.severity === 'error'),
	).toEqual([]);
	return consumer!.protocolView.keyedRepeats ?? [];
}

test('a repeat projected into a child anchors on the element the child wraps its hole in', async () => {
	const [repeat] = await repeats(
		`import { Region } from './region.tsrx';
import { state } from '@markless/core';

export function Page() @{
	const box = state({ rows: [{ id: 'a' }] });

	<main>
		<Region>
			@for (const row of box.rows; key row.id) { <li>{row.id}</li> }
		</Region>
	</main>
}`,
	);

	// `c0:` is the first child edge's own host prefix, and `h0` is the `<ol>` in
	// the child's markup: the same element every other record of that child names.
	expect(repeat?.parentHostNodeId).toBe('c0:h0');
	// The consumer's own enclosing element travels with it, because the row render
	// still has to be spelled in the id space of the component that wrote the rows.
	expect(repeat?.ownerHostNodeId).toBe('h0');
	expect(repeat?.rowStartOffset).toBeUndefined();
});

test('a repeat under the consumer’s own element inside the projection keeps that element', async () => {
	const [repeat] = await repeats(
		`import { Region } from './region.tsrx';
import { state } from '@markless/core';

export function Page() @{
	const box = state({ rows: [{ id: 'a' }] });

	<main>
		<Region>
			<ul>@for (const row of box.rows; key row.id) { <li>{row.id}</li> }</ul>
		</Region>
	</main>
}`,
	);

	expect(repeat?.parentHostNodeId).toBe('h1');
	expect(repeat?.ownerHostNodeId).toBeUndefined();
});

test('elements the child renders in front of its hole stand in front of the rows', async () => {
	const [repeat] = await repeats(
		`import { Region } from './region.tsrx';
import { state } from '@markless/core';

export function Page() @{
	const box = state({ rows: [{ id: 'a' }] });

	<main>
		<Region>
			@for (const row of box.rows; key row.id) { <li>{row.id}</li> }
		</Region>
	</main>
}`,
		`export function Region({ children, ...rest }) @{
	<ol {...rest} ui-region=""><li ui-heading="">rows</li>{children}</ol>
}`,
	);

	expect(repeat?.parentHostNodeId).toBe('c0:h0');
	expect(repeat?.rowStartOffset).toBe(1);
});
