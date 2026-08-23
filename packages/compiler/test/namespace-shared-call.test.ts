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

// A consumer only ever resolves what the owning module published, so the
// publication itself is the first fact: the definition record its own parts
// resolve, plus the factory node its returned `open` names.
test('the family module publishes its exported definition on its interface', async () => {
	const owner = await compile('src/fam.tsrx', family);

	expect(owner.moduleGraphInterface.sharedDefinitions).toEqual([
		{
			exportName: 'pnl',
			definition: expect.objectContaining({
				id: definitionId,
				name: 'pnl',
				scope: 'widget',
				returnProperties: expect.arrayContaining([
					expect.objectContaining({
						kind: 'graph',
						name: 'open',
						graphNodeId: `${definitionId}/state:s`,
						path: ['open'],
					}),
				]),
			}),
			graphBindings: [
				expect.objectContaining({
					id: `${definitionId}/state:s`,
					sharedDefinitionId: definitionId,
					kind: 'state',
					initialValue: { open: false },
				}),
			],
		},
	]);
});

// The plain named import is the other half of the consumer surface, and it used
// to be claimed by the imported-helper collector before the shared resolver ever
// saw it: the call came back as an unsupported cross-module helper.
test('a named import of the definition resolves to the definition, not a helper refusal', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const consumer = await compile(
		'src/page.tsrx',
		`
import { pnl } from './fam.tsrx';

export default function Report() @{
	const s = pnl();
	<span data-report>{s.open}</span>
}
`,
		{ './fam.tsrx': owner.moduleGraphInterface },
	);

	expect(consumer.semanticGraph.diagnostics.map((item) => item.code)).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

test('an aliased named import resolves to the same definition', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const consumer = await compile(
		'src/page.tsrx',
		`
import { pnl as panel } from './fam.tsrx';

export default function Report() @{
	const s = panel();
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

// The shipped package surface: `export * as fam` on the package barrel over
// `export { pnl as state }` on the family index, read as `ui.fam.state()`.
test('a namespace re-export over an aliased barrel resolves to the same definition', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const familyIndex = await compile(
		'src/fam/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);
	const packageBarrel = await compile('src/ui.ts', `export * as fam from './fam/index.ts';`);
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as ui from './ui.ts';

export default function Report() @{
	const s = ui.fam.state();
	<span data-report>{s.open}</span>
}
`,
		{
			'./ui.ts': packageBarrel.moduleGraphInterface,
			'./fam/index.ts': familyIndex.moduleGraphInterface,
			'./fam.tsrx': owner.moduleGraphInterface,
		},
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

// Identity is the whole point: the consumer's read has to name the node the
// owning module's own part names, or the two modules drive two graphs.
test('the consumer lowers the same graph node the owning module lowers', async () => {
	const owner = await compile('src/fam.tsrx', family);
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

	const ownRead = owner.stateLowering.reads.find((read) => read.source === 's.open');
	const consumerRead = consumer.stateLowering.reads.find((read) => read.source === 's.open');

	expect(ownRead?.graphNodeId).toBe(`${definitionId}/state:s`);
	expect([consumerRead?.graphNodeId, consumerRead?.path]).toEqual([
		ownRead?.graphNodeId,
		ownRead?.path,
	]);
	// The factory's node is the consumer's node, scope and initial value included.
	expect(consumer.semanticGraph.graphBindings).toEqual(
		owner.semanticGraph.graphBindings.filter(
			(binding) => binding.sharedDefinitionId === definitionId,
		),
	);
	expect(
		(consumer.protocolState.sharedDefinitions ?? []).map((item) => [item.id, item.scope]),
	).toEqual([[definitionId, 'widget']]);
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
	const refusal = consumer.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_SHARED_CALL_UNRESOLVED',
	);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('fam.state()');
	expect(refusal?.message).toContain('./unknown-barrel.ts');
});

// The refusal has to teach: a call on a family the build DOES know names what
// that family publishes, so the reader can see the name they meant.
test('a refusal on a known family names the definitions that do resolve', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const barrel = await compile(
		'src/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as fam from './index.ts';

export default function Page() @{
	const s = fam.stat();
	<span data-report>{s.open}</span>
}
`,
		{ './index.ts': barrel.moduleGraphInterface, './fam.tsrx': owner.moduleGraphInterface },
	);

	const refusal = consumer.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_SHARED_CALL_UNRESOLVED',
	);
	expect(consumer.semanticGraph.sharedInstances).toEqual([]);
	expect(refusal?.message).toContain('fam.stat()');
	expect(refusal?.message).toContain('`state`');
});

// The refusal reads a call, not a name: an ordinary imported function called
// through its module namespace is not a shared call and stays untouched.
test('a plain namespace helper call is not refused', async () => {
	const consumer = await compile(
		'src/page.tsrx',
		`
import * as utils from './utils.ts';

export default function Page() @{
	const label = utils.formatLabel();
	<span data-report>{label}</span>
}
`,
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
});
