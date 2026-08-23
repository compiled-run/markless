import { expect, test } from 'vitest';
import type { ModuleGraphInterfaceArtifact } from '../src/artifacts.ts';
import { compileTsrxModule, linkBarrelComponents, moduleLinkResolutionKey } from '../src/index.ts';
import { widgetRootComponents } from '../src/passes/public-render/shared-seed-pass.ts';

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

// A widget-scoped definition is rooted by the module that DECLARES it. A
// consumer that resolves an adopted one is a part of somebody else's widget, so
// the consumer module roots nothing: rooting the read there gave the definition
// a second owner, and the consumer's own component served a second instance of
// the family's cells beside the one it meant to read.
test('the consumer module roots no widget for the definition it adopted', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const barrel = await compile(
		'src/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);
	const throughBarrel = await compile(
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
	const throughNamedImport = await compile(
		'src/named.tsrx',
		`
import { pnl } from './fam.tsrx';

export default function Report() @{
	const s = pnl();
	<span data-report>{s.open}</span>
}
`,
		{ './fam.tsrx': owner.moduleGraphInterface },
	);

	// The declaring module's own root is untouched: it still roots the family.
	expect([...widgetRootComponents(owner as never)]).toEqual([[definitionId, 'Root']]);
	expect([...widgetRootComponents(throughBarrel as never)]).toEqual([]);
	expect([...widgetRootComponents(throughNamedImport as never)]).toEqual([]);
	// Both consumers still resolve the definition — they read it, they just do
	// not start a widget of their own for it.
	expect(
		throughBarrel.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
	expect(
		throughNamedImport.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
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

// A bundler never hands the consumer the barrel's authored interface: it hands
// the one `linkBarrelComponents` synthesizes while walking the barrel, with
// specifiers rebased for the importing module. So the tests above only hold in a
// real build if that synthesis carries the shared re-export chain too — the walk
// used to publish components alone, and every `family.state()` behind a plain
// `.ts` barrel refused.

type FakeModules = Readonly<Record<string, ModuleGraphInterfaceArtifact>>;

/** Runs the barrel walk with resolution and interface reads already answered. */
function walkBarrels(input: {
	readonly parent: string;
	readonly imports: ReadonlyArray<string>;
	/** `specifier` written in `importer` to the module id it names. */
	readonly resolves: ReadonlyArray<readonly [string, string, string]>;
	readonly modules: FakeModules;
}) {
	const resolution = Object.fromEntries(
		input.resolves.map(([specifier, importer, target]) => [
			moduleLinkResolutionKey(specifier, importer),
			target,
		]),
	);
	const artifact = linkBarrelComponents({
		parent: input.parent,
		moduleImports: input.imports.map((source) => ({ source })),
		resolution,
		moduleInterface: (filename) => input.modules[filename] ?? null,
		// Both fixtures keep every module one directory deep, so the specifier the
		// parent would write is the file's own name.
		rebase: (target) => `./${target.slice('src/'.length)}`,
	});
	expect(artifact.pendingResolutions).toEqual([]);
	expect(artifact.pendingInterfaces).toEqual([]);
	expect(artifact.diagnostics).toEqual([]);
	return artifact;
}

test('the barrel walk republishes the aliased shared re-export the consumer calls', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const barrel = await compile(
		'src/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);

	const artifact = walkBarrels({
		parent: 'src/page.tsrx',
		imports: ['./index.ts'],
		resolves: [
			['./index.ts', 'src/page.tsrx', 'src/index.ts'],
			['./fam.tsrx', 'src/index.ts', 'src/fam.tsrx'],
		],
		modules: {
			'src/index.ts': barrel.moduleGraphInterface,
			'src/fam.tsrx': owner.moduleGraphInterface,
		},
	});

	// The chain the shared resolver walks, sources rebased for the consumer.
	expect(artifact.interfaces['./index.ts']?.reexports).toEqual([
		{ exportName: 'state', importedName: 'pnl', source: './fam.tsrx' },
	]);
	// The component half of the same walk is untouched.
	expect(
		artifact.interfaces['./index.ts']?.linkedComponents?.map((component) => component.exportPath),
	).toEqual([['root']]);
	// The owning module is reachable under the specifier the chain names, and is
	// linked as a child once however many exports of it the barrel re-exported.
	expect(artifact.interfaces['./fam.tsrx']).toBe(owner.moduleGraphInterface);
	expect(artifact.children.map((child) => [child.specifier, child.source])).toEqual([
		['./fam.tsrx', 'src/fam.tsrx'],
	]);

	const consumer = await compile(
		'src/page.tsrx',
		`
import * as fam from './index.ts';

export default function Report() @{
	const s = fam.state();
	<span data-report>{s.open}</span>
}
`,
		artifact.interfaces,
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

test('the barrel walk republishes a namespace re-export over a nested barrel', async () => {
	const owner = await compile('src/fam.tsrx', family);
	const familyIndex = await compile(
		'src/fam/index.ts',
		`export { Root as root, pnl as state } from './fam.tsrx';`,
	);
	const packageBarrel = await compile('src/ui.ts', `export * as fam from './fam/index.ts';`);

	const artifact = walkBarrels({
		parent: 'src/page.tsrx',
		imports: ['./ui.ts'],
		resolves: [
			['./ui.ts', 'src/page.tsrx', 'src/ui.ts'],
			['./fam/index.ts', 'src/ui.ts', 'src/fam/index.ts'],
			['./fam.tsrx', 'src/fam/index.ts', 'src/fam.tsrx'],
		],
		modules: {
			'src/ui.ts': packageBarrel.moduleGraphInterface,
			'src/fam/index.ts': familyIndex.moduleGraphInterface,
			'src/fam.tsrx': owner.moduleGraphInterface,
		},
	});

	// The namespace segment is spent on the nested barrel, which is republished
	// under its own rebased specifier rather than flattened into the package one.
	expect(artifact.interfaces['./ui.ts']?.reexports).toEqual([
		{ exportName: 'fam', importedName: '*', source: './fam/index.ts' },
	]);
	expect(artifact.interfaces['./fam/index.ts']?.reexports).toEqual([
		{ exportName: 'state', importedName: 'pnl', source: './fam.tsrx' },
	]);

	const consumer = await compile(
		'src/page.tsrx',
		`
import * as ui from './ui.ts';

export default function Report() @{
	const s = ui.fam.state();
	<span data-report>{s.open}</span>
}
`,
		artifact.interfaces,
	);

	expect(
		consumer.semanticGraph.diagnostics.filter((item) => item.severity === 'error'),
	).toEqual([]);
	expect(
		consumer.semanticGraph.sharedInstances.map((instance) => instance.definitionId),
	).toEqual([definitionId]);
});

// Fail-closed: the walk republishes component and shared re-exports and nothing
// else, so a barrel over a plain helper still resolves to no shared definition.
test('the barrel walk republishes no chain for a re-export that reaches neither', async () => {
	const helper = await compile('src/helper.tsrx', `export function formatLabel() { return 'x'; }`);
	const barrel = await compile('src/index.ts', `export { formatLabel as state } from './helper.tsrx';`);

	const artifact = walkBarrels({
		parent: 'src/page.tsrx',
		imports: ['./index.ts'],
		resolves: [
			['./index.ts', 'src/page.tsrx', 'src/index.ts'],
			['./helper.tsrx', 'src/index.ts', 'src/helper.tsrx'],
		],
		modules: {
			'src/index.ts': barrel.moduleGraphInterface,
			'src/helper.tsrx': helper.moduleGraphInterface,
		},
	});

	expect(artifact.interfaces).toEqual({});
	expect(artifact.children).toEqual([]);
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
