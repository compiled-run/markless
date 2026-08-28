import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// The render-data module and the SSR static values map are two printers over the
// same folded cell. The map used to go through `JSON.stringify`, which has no
// form for a non-finite number and writes one as `null`, so the server rendered
// from `null` while the client primed from `Infinity`.

const CELL_ID = 'shared:src/seed.tsrx#gate/state:g';

function source(maxWidth: string) {
	return `
import { shared, state } from '@markless/core';
export const gate = shared(() => {
	const g = state({ minWidth: 1, maxWidth: ${maxWidth}, x: 2, label: '' });
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root(props) @{
	const g = gate();
	g.label = props.label;

	<div data-root ui-max={g.maxWidth} ui-x={g.x}>{g.label}</div>
}
`;
}

async function compile(maxWidth: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: source(maxWidth),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const ssr = /\[".*?#gate\/state:g", (\{.*?\})\]/.exec(
		compiled.publicRenderModule.ssrModuleSource ?? '',
	);
	const renderData = /"value":\{"kind":"constant","value":(\{.*?\})\}/.exec(
		compiled.publicRenderModule.renderDataModuleSource ?? '',
	);
	return { ssrStateValue: ssr?.[1], renderDataSeed: renderData?.[1] };
}

function evaluate(printed: string | undefined) {
	return new Function(`return (${String(printed)});`)() as Record<string, unknown>;
}

test('a folded 1e400 seed prints Infinity in both halves of the emitted pair', async () => {
	const { ssrStateValue, renderDataSeed } = await compile('1e400');
	const expected = '{"minWidth":1,"maxWidth":Infinity,"x":2,"label":""}';

	expect(renderDataSeed).toBe(expected);
	expect(ssrStateValue).toBe(expected);
	expect(ssrStateValue).toBe(renderDataSeed);
	expect(evaluate(ssrStateValue)).toEqual({
		minWidth: 1,
		maxWidth: Number.POSITIVE_INFINITY,
		x: 2,
		label: '',
	});
});

test('the SSR static values map keeps the bytes JSON already printed for a finite seed', async () => {
	const { ssrStateValue, renderDataSeed } = await compile('9');
	const expected = JSON.stringify({ minWidth: 1, maxWidth: 9, x: 2, label: '' });

	expect(ssrStateValue).toBe(expected);
	expect(renderDataSeed).toBe(expected);
});

test('the emitted cell id is the one both printers name', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: source('1e400'),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(JSON.stringify(CELL_ID));
	expect(compiled.publicRenderModule.renderDataModuleSource).toContain(JSON.stringify(CELL_ID));
});
