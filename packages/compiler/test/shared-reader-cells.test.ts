import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A non-root reader carries an app- or container-scoped cell it reads; a subtree-scoped one stays with its widget root, wherever it is declared.

const family = `import { shared, state } from '@markless/core';

export const sel = shared(() => {
	const s = state({ open: false });
	return { ...s };
}, { scope: 'subtree' });

export const desk = shared(() => {
	const value = state({ name: 'oak' });
	return value;
}, { scope: 'container' });

export function Root({ children }) @{
	const s = sel();

	<div ui-open={s.open}>{children}</div>
}
`;

const readers = `import { desk, sel } from './family.tsrx';

export function Label() @{
	<b>widget</b>
}

export function SubtreeReader() @{
	const s = sel();

	<span>{s.open}</span>
}

export function ContainerReader() @{
	const table = desk();

	<span>{table.name}</span>
}
`;

async function readerCells() {
	const defining = await compileTsrxModule({ filename: '/w/src/family.tsrx', source: family, symbols: [] });
	const compiled = await compileTsrxModule({
		filename: '/w/src/readers.tsrx',
		source: readers,
		symbols: [],
		importedModuleInterfaces: { './family.tsrx': defining.moduleGraphInterface },
	});
	const cells = compiled.payloadScripts.state.cells.map((cell) => cell.graphNodeId);
	const carried = (name: string) =>
		(
			compiled.publicRenderModule.componentDefinitions.find(
				(definition: { name: string }) => definition.name === name,
			) as { stateCellIndexes?: number[] }
		).stateCellIndexes?.map((index) => cells[index]) ?? [];
	return { carried };
}

test('a reader of a subtree-scoped value declared in another file carries none of its cells', async () => {
	const { carried } = await readerCells();
	expect(carried('SubtreeReader')).toEqual([]);
});

test('a reader of a container-scoped value declared in another file carries its cell', async () => {
	const { carried } = await readerCells();
	expect(carried('ContainerReader')).toEqual(['shared:/w/src/family.tsrx#desk/state:value']);
});
