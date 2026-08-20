import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const familySource = `
import { shared, state } from '@markless/core';

export const sel = shared(() => {
	const s = state({ open: false });

	return {
		...s,
		toggle() {
			s.open = !s.open;
		},
	};
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = sel();

	<div data-sel-root ui-open={s.open}>{children}</div>
}

export function Trigger() @{
	const s = sel();

	<button type="button" data-sel-trigger onClick={() => s.toggle()}>Toggle</button>
}

export const pop = shared(() => {
	const p = state({ open: false });

	return { ...p };
}, { scope: 'widget' });

export function PopRoot({ children }) @{
	const p = pop();

	<div data-pop-root ui-open={p.open}>{children}</div>
}
`;

const pageSource = `
import * as sel from './sel.tsrx';

export default function SelPage() @{
	<section data-sel-page>
		<sel.Root>
			<sel.Trigger />
		</sel.Root>
		<sel.Root>
			<sel.Trigger />
		</sel.Root>
	</section>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

test('widget is an accepted shared() scope and is recorded on the definition', async () => {
	const compiled = await compile('src/sel.tsrx', familySource);

	expect(
		compiled.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
	expect(
		(compiled.protocolState.sharedDefinitions ?? []).map((definition) => [
			definition.id,
			definition.scope,
		]),
	).toEqual([
		['shared:src/sel.tsrx#sel', 'widget'],
		['shared:src/sel.tsrx#pop', 'widget'],
	]);
});

test('a widget-scoped definition records the component that resolves it', async () => {
	const compiled = await compile('src/sel.tsrx', familySource);

	expect(
		compiled.semanticGraph.sharedInstances.map((instance) => [
			instance.definitionId,
			instance.componentName,
		]),
	).toEqual([
		['shared:src/sel.tsrx#sel', 'Root'],
		['shared:src/sel.tsrx#sel', 'Trigger'],
		['shared:src/sel.tsrx#pop', 'PopRoot'],
	]);
});

// The widget root is the composed instance that OWNS the definition's cells.
// Giving those cells to the module root instead would make one widget of every
// family declared in the module.
test('widget-scoped cells belong to the first component that resolves the definition', async () => {
	const compiled = await compile('src/sel.tsrx', familySource);
	const definitions = compiled.publicRenderModule.componentDefinitions;
	const cellIdsFor = (name: string) => {
		const definition = definitions.find((candidate) => candidate.name === name);
		return (definition?.stateCellIndexes ?? []).map(
			(index) => definition?.state.cells[index]?.graphNodeId,
		);
	};

	expect(cellIdsFor('Root')).toContain('shared:src/sel.tsrx#sel/state:s');
	expect(cellIdsFor('Root')).not.toContain('shared:src/sel.tsrx#pop/state:p');
	expect(cellIdsFor('PopRoot')).toContain('shared:src/sel.tsrx#pop/state:p');
});

test('an unsupported shared scope still fails the compile closed', async () => {
	const compiled = await compile(
		'src/bad-scope.tsrx',
		`
import { shared, state } from '@markless/core';

export const session = shared(() => {
	const data = state({ status: 'anonymous' });
	return { ...data };
}, { scope: 'session' });

export function App() @{
	const currentSession = session();
	<output>{currentSession.status}</output>
}
`,
	);

	expect(
		compiled.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([expect.objectContaining({ code: 'MARKLESS_SHARED_SCOPE_INVALID' })]);
});

// Each rendered widget is one component-edge instance path; the page spells a
// distinct path per widget and per projected piece, and those paths are what
// qualify the widget's shared ids.
test('a page composing two widgets spells one instance path per piece', async () => {
	const compiled = await compile('src/sel-page.tsrx', pageSource);

	expect(compiled.boundSymbolResolver.componentEdgeInstancePaths).toEqual([
		{ componentEdgeId: 'component-edge:0', instancePath: 'c0:' },
		{ componentEdgeId: 'component-edge:1', instancePath: 'c0:p1:' },
		{ componentEdgeId: 'component-edge:2', instancePath: 'c2:' },
		{ componentEdgeId: 'component-edge:3', instancePath: 'c2:p3:' },
	]);
});
