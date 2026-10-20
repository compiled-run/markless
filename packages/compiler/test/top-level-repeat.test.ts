import { PROTOCOL_CONTAINER_HOST_NODE_ID } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A keyed @for written straight into a component's template has no element of its own: as a page,
// its rows are the container's children, so the record names the container as their parent.

const topLevelRows = (loop: string) => `import { state } from '@markless/core';
export default function Board() @{
	let cards = state([{ id: 'a', title: 'A' }]);
	<>
		<h2>Cards</h2>
		${loop}
		<p>after</p>
	</>
}`;

const keyed = '@for (const card of cards; key card.id) { <article>{card.title}</article> }';

const compile = (filename: string, source: string) =>
	compileTsrxModule({ filename, source, symbols: [] });

const errors = (result: Awaited<ReturnType<typeof compile>>) =>
	result.semanticGraph.diagnostics.filter((entry) => entry.severity === 'error');

test('a top-level keyed @for records the container as its rows parent', async () => {
	const result = await compile('src/board.tsrx', topLevelRows(keyed));
	expect(errors(result)).toEqual([]);
	const [repeat] = result.semanticGraph.keyedRepeats;
	expect(repeat?.parentHostNodeId).toBe(PROTOCOL_CONTAINER_HOST_NODE_ID);
	const [viewRepeat] = result.protocolView.keyedRepeats ?? [];
	expect(viewRepeat?.parentHostNodeId).toBe(PROTOCOL_CONTAINER_HOST_NODE_ID);
	expect(viewRepeat?.rowStartOffset).toBe(1);
	expect(
		result.moduleGraphInterface.render.components.find(
			(component) => component.componentName === 'Board',
		)?.containerRepeat,
	).toBe(true);
});

test('a @for inside an element keeps that element as its parent and publishes no container rows', async () => {
	const result = await compile('src/board.tsrx', topLevelRows(`<section>${keyed}</section>`));
	expect(errors(result)).toEqual([]);
	expect(result.semanticGraph.keyedRepeats[0]?.parentHostNodeId).not.toBe(
		PROTOCOL_CONTAINER_HOST_NODE_ID,
	);
	expect(
		result.moduleGraphInterface.render.components.find(
			(component) => component.componentName === 'Board',
		)?.containerRepeat,
	).toBeUndefined();
});

test('a top-level @for without a key is refused the way one inside an element is', async () => {
	const result = await compile(
		'src/board.tsrx',
		topLevelRows('@for (const card of cards) { <article>{card.title}</article> }'),
	);
	expect(errors(result).map((entry) => entry.code)).toContain('MARKLESS_REPEAT_KEY_REQUIRED');
});

const childRows = `export function Cards({ cards }) @{
	<>
		<li>head</li>
		@for (const card of cards; key card.id) { <li>{card.title}</li> }
	</>
}`;

const consumer = (imports: string, cards: string) => `import { state } from '@markless/core';
${imports}
${cards}
export default function Page() @{
	let cards = state([{ id: 'a', title: 'A' }]);
	<main><ul><Cards cards={cards} /></ul></main>
}`;

test('placing a component with top-level rows inside another component is refused by name', async () => {
	const local = await compile('src/page.tsrx', consumer('', childRows));
	const [imported] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/cards.tsrx', source: childRows, importSource: './cards.tsrx' },
	]);
	const remote = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: consumer("import { Cards } from './cards.tsrx';", ''),
		symbols: [],
		importedModuleInterfaces: { './cards.tsrx': imported!.moduleGraphInterface },
	});
	for (const result of [local, remote]) {
		const refusals = errors(result).filter(
			(entry) => entry.code === 'MARKLESS_CHILD_REPEAT_WITHOUT_ELEMENT',
		);
		expect(refusals).toHaveLength(1);
		expect(refusals[0]?.message).toContain('<Cards>');
		expect(refusals[0]?.primarySpan).toBeDefined();
	}
});
