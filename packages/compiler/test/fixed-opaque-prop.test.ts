import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const child = `
import { computed } from '@markless/core';
export default function Child({ q }) @{
	const found = computed(async () => q.toUpperCase());
	<p>{q} @try {<span>{found}</span>} @pending {<span>…</span>}</p>
}
`;

async function compilePage(source: string, routeRoot: boolean) {
	const compiled = await compileTsrxModule({
		filename: 'src/child.tsrx',
		source: child,
		symbols: [],
	});
	const claims = compiled.captureAnalysis.extractedSymbols.filter(
		(symbol) => symbol.kind === 'async-computed-runner' || symbol.kind === 'dom-update',
	);
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source,
		...(routeRoot ? { routeRoot: true } : {}),
		symbols: claims.map((captureSymbol, at) => ({
			id: `imported:Child:symbol:${at}`,
			chunk: `virtual:markless:symbol:Child:${at}`,
			exportName: `child${at}`,
			componentEdgeId: 'component-edge:0',
			captureSymbol,
		})),
	});
}

const opaque = (result: Awaited<ReturnType<typeof compilePage>>) =>
	result.captureAnalysis.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
	);

const page = `
import Child from './child.tsrx';
export default function Page({ url }) @{
	<Child q={new URLSearchParams(url.search).get('q') ?? ''} />
}
`;

test('a page passing a value worked out from its own url is fixed: the child reads it from its own props', async () => {
	const result = await compilePage(page, true);
	const runner = result.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'async-computed-runner',
	);

	expect(result.semanticGraph.componentEdges[0]!.props[0]).toMatchObject({
		kind: 'opaque',
		fixedValue: true,
	});
	expect(opaque(result)).toEqual([]);
	// The runner reads `q` from its own instance's props, as it does where no caller is known: no slot needs this edge's value.
	expect(runner?.captureSlots).toEqual([]);
});

test('the same component not rendered as a page keeps the refusal, since a caller could pass a changing url', async () => {
	const result = await compilePage(page, false);

	expect(result.semanticGraph.componentEdges[0]!.props[0]).not.toHaveProperty('fixedValue');
	expect(opaque(result).map((diagnostic) => diagnostic.message)).toContain(
		'"Child" reads its prop "q" as `q` in an async computed, which runs in the browser, but this <Child> passes `new URLSearchParams(url.search).get(\'q\') ?? \'\'`: code that runs only while the page renders, with no way for the browser to get its value.',
	);
});

test('a body const over state is not fixed, even on a page', async () => {
	const result = await compilePage(
		`
import { state } from '@markless/core';
import Child from './child.tsrx';
export default function Page() @{
	let count = state(0);
	const search = count > 0 ? '?q=a' : '?q=b';
	<button onClick={() => (count += 1)}>
		<Child q={new URLSearchParams(search).get('q') ?? ''} />
	</button>
}
`,
		true,
	);

	expect(result.semanticGraph.componentEdges[0]!.props[0]).not.toHaveProperty('fixedValue');
});

test('a handler reading the fixed prop still refuses, and says what to write instead', async () => {
	const handlerChild = `
import { state } from '@markless/core';
export default function Child({ q }) @{
	let said = state('');
	<button onClick={() => (said = q)}>{said}</button>
}
`;
	const compiled = await compileTsrxModule({ filename: 'src/child.tsrx', source: handlerChild, symbols: [] });
	const handler = compiled.captureAnalysis.extractedSymbols.find((symbol) => symbol.kind === 'event-handler')!;
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: page,
		routeRoot: true,
		symbols: [
			{
				id: 'imported:Child:symbol:0',
				chunk: 'virtual:markless:symbol:Child:0',
				exportName: 'child0',
				componentEdgeId: 'component-edge:0',
				captureSymbol: handler,
			},
		],
	});
	const [refusal, ...rest] = opaque(result);

	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"Child" reads its prop "q" as `q` in an event handler');
	expect(refusal?.suggestions?.[0]?.message).toBe(
		'Work the value out inside the handler from what the browser has, such as `new URLSearchParams(location.search)` for a value from the page url, or hold it in state() in the component that renders "Child" and pass that.',
	);
});
