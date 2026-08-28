import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * What a widget family's element() handle read lowers to, held against whether
 * the READING module also binds that handle in its own markup.
 *
 * A handle is not a graph value, so a read that misses the handle record lowers
 * to `graph.read` and answers `undefined` at dispatch. The record is planned
 * from the handles this module BINDS, so a family module that declares a handle,
 * hands it to parts in other modules, and only reads it back in a handler gets
 * no record — which is the whole of the browser witness in
 * `packages/vitest-browser/browser/single-component-family/`.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Dial.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

const FAMILY = `
import { element, shared, state } from '@markless/core';
import { rosterOf } from './report.ts';

export const dial = shared(
	() => {
		const d = state({ roster: '' });
		const markEls = element<HTMLButtonElement[]>();
		return { ...d, markEls };
	},
	{ scope: 'widget' },
);
`;

test('a root that binds the handle it reads lowers the read to the handle registry', async () => {
	const result = await compile(`${FAMILY}
export function Dial() @{
	const d = dial();

	<div>
		<button onClick={() => { d.roster = rosterOf(d.markEls); }}>probe</button>
		<button el={d.markEls}>mark</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('context.getElementHandle('),
	]);
});

test('a root that only reads the handle lowers it to a graph read that answers undefined', async () => {
	const result = await compile(`${FAMILY}
export function Dial({ children }) @{
	const d = dial();

	<div>
		<button onClick={() => { d.roster = rosterOf(d.markEls); }}>probe</button>
		{children}
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('context.getElementHandle('),
	]);
});
