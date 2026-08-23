import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The ratified consumer surface is `family.state()`: a namespace-member call on
// a family object that reaches a widget-scoped shared definition through a
// plain barrel. These tests state what that call must mean. They are RED: the
// resolution they describe is not implemented yet (see the receipt for
// U144-namespace-state-call), and the two shapes below are the smallest
// statements of the two halves of it.

const family = `
import { shared, state } from '@markless/core';

export const pnl = shared(() => {
	const s = state({ open: false });
	return { ...s, toggle() { s.open = !s.open; } };
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = pnl();
	<div data-root ui-open={s.open}>{children}</div>
}
`;

async function compile(
	filename: string,
	source: string,
	importedModuleInterfaces?: Record<string, Awaited<
		ReturnType<typeof compileTsrxModule>
	>['moduleGraphInterface']>,
) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
		...(importedModuleInterfaces ? { importedModuleInterfaces } : {}),
	});
}

// The definition's own module is the identity anchor: whatever a consumer
// resolves has to be this exact id, or the two modules build two graphs.
const definitionId = 'shared:src/fam.tsrx#pnl';

test('the family module still owns the definition its own parts resolve', async () => {
	const compiled = await compile('src/fam.tsrx', family);

	expect(
		compiled.semanticGraph.sharedDefinitions.map((definition) => [
			definition.id,
			definition.scope,
		]),
	).toEqual([[definitionId, 'widget']]);
	expect(
		compiled.semanticGraph.sharedInstances.map((instance) => [
			instance.definitionId,
			instance.componentName,
		]),
	).toEqual([[definitionId, 'Root']]);
});

test('a namespace-member call on the owning module resolves to the same definition', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as fam from './fam.tsrx';

export default function Report() @{
	const s = fam.pnl();
	<span data-report>{s.open}</span>
}
`,
		{ './fam.tsrx': owner.moduleGraphInterface },
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

test('an aliased re-export through a barrel resolves to the same definition', async () => {
	const owner = await compile('src/fam.tsrx', family);
	// `export { pnl as state } from './fam.tsrx'` is the family index; the
	// consumer only ever sees the alias.
	const barrel = await compile(
		'src/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as fam from './index.ts';

export default function Report() @{
	const s = fam.state();
	<span data-report>{s.open}</span>
}
`,
		{ './index.ts': barrel.moduleGraphInterface, './fam.tsrx': owner.moduleGraphInterface },
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

// Fail-closed: an indirection the compiler cannot follow to a .tsrx shared
// definition must refuse, not compile a call that silently resolves nothing.
test('a chain that reaches no shared definition is refused', async () => {
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as fam from './unknown-barrel.ts';

export default function Page() @{
	const s = fam.state();
	<span data-report>{s.open}</span>
}
`,
	);

	expect(consumer.semanticGraph.sharedInstances).toEqual([]);
	expect(
		consumer.semanticGraph.diagnostics.some((item) => item.severity === 'error'),
	).toBe(true);
});
