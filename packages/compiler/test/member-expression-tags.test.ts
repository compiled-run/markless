import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A JSX member tag (<checkbox.root />) is a component reference at any case.
// These cover the three import shapes a headless component package ships with,
// plus the fail-closed diagnostic when the object it hangs off is unknown.

async function compile(source: string, filename = 'src/App.tsrx') {
	return compileTsrxModule({ filename, source, symbols: [] });
}

test('a member tag imported by name becomes a component edge, not a dropped subtree', async () => {
	const result = await compile(`import { checkbox } from './checkbox.ts';
export function App() @{
	<div class="field"><checkbox.root checked={true}><checkbox.trigger /></checkbox.root></div>
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(
		result.semanticGraph.componentEdges.map((edge) => ({
			child: edge.childComponentName,
			importSource: edge.importSource,
			importKind: edge.importKind,
			importedName: edge.importedName,
			childCount: edge.children.childCount,
		})),
	).toEqual([
		{
			child: 'checkbox.root',
			importSource: './checkbox.ts',
			importKind: 'named',
			importedName: 'checkbox',
			childCount: 1,
		},
		{
			child: 'checkbox.trigger',
			importSource: './checkbox.ts',
			importKind: 'named',
			importedName: 'checkbox',
			childCount: 0,
		},
	]);

	// Props travel the same route as on <CheckboxRoot checked={true} />.
	expect(result.semanticGraph.componentEdges[0]?.props).toEqual([
		expect.objectContaining({ name: 'checked', kind: 'serializable', value: true }),
	]);

	// The wrapping host element keeps the child anchor instead of rendering empty.
	const statics = result.renderData.chunks.flatMap((chunk) => chunk.statics ?? []);
	expect(statics.join('')).toContain('class="field"');
	const slots = result.renderData.chunks.flatMap((chunk) => chunk.slots ?? []);
	expect(
		slots
			.filter((slot) => slot.kind === 'child-component')
			.map((slot) => (slot as { readonly childComponentName: string }).childComponentName)
			.sort(),
	).toEqual(['checkbox.root', 'checkbox.trigger']);
});

test('a member tag off a namespace import resolves to that module', async () => {
	const result = await compile(`import * as checkbox from './checkbox.tsrx';
export function App() @{
	<div><checkbox.root /></div>
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'checkbox.root',
			importSource: './checkbox.tsrx',
			importKind: 'namespace',
		}),
	]);

	// A compiled .tsrx module publishes no ES named exports, so the SSR module
	// imports its surface and asks that surface for the part the tag named.
	expect(result.publicRenderModule.ssrModuleSource).toMatch(
		/import (\w+) from "\.\/checkbox\.tsrx";/,
	);
	expect(result.publicRenderModule.ssrModuleSource).toMatch(
		/marklessSsrComponentPart\(\w+,"root"\)/,
	);
});

test('a member tag off a re-export barrel resolves through the barrel module', async () => {
	// The barrel is the module the consumer names; `export * as checkbox` is what
	// makes `checkbox` an object of components there.
	const barrel = await compile(
		`export * as checkbox from './checkbox-parts.tsrx';`,
		'src/checkbox-barrel.ts',
	);
	expect(barrel.semanticGraph.diagnostics).toEqual([]);

	const result = await compile(`import { checkbox } from './checkbox-barrel.ts';
export function App() @{
	<checkbox.root />
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'checkbox.root',
			importSource: './checkbox-barrel.ts',
			importKind: 'named',
			importedName: 'checkbox',
		}),
	]);
	expect(result.publicRenderModule.ssrModuleSource).toMatch(
		/import \{ checkbox as (\w+)Holder \} from "\.\/checkbox-barrel\.ts";\nconst \1 = \1Holder\.root;/,
	);
});

test('member tag case is irrelevant: PascalCase and lowercase are both components', async () => {
	const result = await compile(`import * as ui from './ui.tsrx';
import * as Checkbox from './checkbox.tsrx';
export function App() @{
	<div><Checkbox.Root /><ui.row /></div>
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges.map((edge) => edge.childComponentName)).toEqual([
		'Checkbox.Root',
		'ui.row',
	]);
	// Neither tag became a host element.
	expect(result.semanticGraph.hostNodes.map((host) => host.tagName)).toEqual(['div']);
});

test('a nested member tag resolves through its root identifier', async () => {
	const result = await compile(`import * as ui from './ui.tsrx';
export function App() @{
	<ui.forms.field label="Name" />
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'ui.forms.field',
			importSource: './ui.tsrx',
			importKind: 'namespace',
		}),
	]);
	expect(result.semanticGraph.componentEdges[0]?.props).toEqual([
		expect.objectContaining({ name: 'label', kind: 'serializable', value: 'Name' }),
	]);
	// Same surface rule one level deeper: the enclosing segment is read off the
	// module's default export, and the last segment is the part it names.
	expect(result.publicRenderModule.ssrModuleSource).toMatch(
		/import (\w+)Holder from "\.\/ui\.tsrx";\nconst \1 = \1Holder\.forms;/,
	);
	expect(result.publicRenderModule.ssrModuleSource).toMatch(
		/marklessSsrComponentPart\(\w+,"field"\)/,
	);
});

test('an unresolvable member tag is an error, never a silent drop', async () => {
	const result = await compile(`export function App() @{
	const mystery = { thing: 1 };
	<div><mystery.thing /></div>
}`);

	const diagnostic = result.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_COMPONENT_TAG_UNRESOLVED',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('mystery.thing');
	expect(diagnostic?.primarySpan?.filename).toBe('src/App.tsrx');
	// The edge is still recorded, so the subtree is visible to the reader.
	expect(result.semanticGraph.componentEdges.map((edge) => edge.childComponentName)).toEqual([
		'mystery.thing',
	]);
});

test('handler and state props on a member tag bind like they do on an identifier tag', async () => {
	const source = (tag: string, importLine: string) => `import { state } from '@markless/core';
${importLine}
export function App() @{
	let checked = state(false);
	<div><${tag} checked={checked} onToggle={(next) => checked = next} /></div>
}`;

	const member = await compile(
		source('checkbox.root', `import * as checkbox from './checkbox.tsrx';`),
	);
	const identifier = await compile(
		source('CheckboxRoot', `import { CheckboxRoot } from './checkbox.tsrx';`),
	);

	const shape = (edge: (typeof member.semanticGraph.componentEdges)[number]) =>
		edge.props.map((prop) => ({
			name: prop.name,
			kind: prop.kind,
			...('graphNodeId' in prop ? { graphNodeId: prop.graphNodeId } : {}),
			...('parameters' in prop ? { parameters: prop.parameters } : {}),
		}));

	expect(shape(member.semanticGraph.componentEdges[0]!)).toEqual(
		shape(identifier.semanticGraph.componentEdges[0]!),
	);
	expect(shape(member.semanticGraph.componentEdges[0]!)).toEqual([
		{ name: 'checked', kind: 'graph-reference', graphNodeId: 'state:checked' },
		{ name: 'onToggle', kind: 'callback', parameters: ['next'] },
	]);
});

test('a member tag off a local object names the component that object holds', async () => {
	const result = await compile(`import CheckboxRoot from './checkbox-root.tsrx';
const checkbox = { root: CheckboxRoot };
export function App() @{
	<div><checkbox.root /></div>
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	// The edge names the component itself, so every later pass sees the same
	// child an identifier tag would have produced.
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'CheckboxRoot',
			importSource: './checkbox-root.tsrx',
			importKind: 'default',
		}),
	]);
	const slots = result.renderData.chunks.flatMap((chunk) => chunk.slots ?? []);
	expect(
		slots
			.filter((slot) => slot.kind === 'child-component')
			.map((slot) => (slot as { readonly childTemplateId: string }).childTemplateId),
	).toEqual(['template:CheckboxRoot']);
});

test('a same-module component object renders through the same-module child path', async () => {
	const result = await compile(`function Row({ label }) @{
	<li>{label}</li>
}
const list = { row: Row };
export function App() @{
	<ul><list.row label="Alpha" /></ul>
}`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({ childComponentName: 'Row' }),
	]);
	expect(result.semanticGraph.componentEdges[0]).not.toHaveProperty('importSource');
	expect(result.publicRenderModule.componentDefinitions.map((item) => item.name)).toContain(
		'Row',
	);
});

test('a linked barrel interface resolves a member tag to the module that declares it', async () => {
	// The linker answers what the barrel hides: which export of which module a
	// dotted tag names. With that answer the edge points at the `.tsrx` file.
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import * as checkbox from './checkbox/index.ts';
export function App() @{
	<checkbox.root />
}`,
		symbols: [],
		importedModuleInterfaces: {
			'./checkbox/index.ts': {
				passId: 'module-graph-interface',
				filename: '/app/src/checkbox/index.ts',
				exports: [],
				linkedComponents: [
					{
						exportPath: ['root'],
						source: './checkbox/checkbox-root.tsrx',
						importKind: 'default',
						componentName: 'CheckboxRoot',
					},
				],
				render: { version: 1, components: [] },
			},
		},
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'CheckboxRoot',
			importSource: './checkbox/checkbox-root.tsrx',
			importKind: 'default',
		}),
	]);
});

test('an aliased import renders the component name its own module exports', async () => {
	const child = await compile(
		`export function StatusBadge({ label }) @{ <span>{label}</span> }`,
		'src/status-badge.tsrx',
	);
	expect(child.semanticGraph.moduleGraphInterface.render.components).toEqual([
		expect.objectContaining({ componentName: 'StatusBadge', exportName: 'StatusBadge' }),
	]);

	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { StatusBadge as Badge } from './status-badge.tsrx';
export function App() @{
	<Badge label="Ready" />
}`,
		symbols: [],
		importedModuleInterfaces: {
			'./status-badge.tsrx': child.semanticGraph.moduleGraphInterface,
		},
	});

	expect(result.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'StatusBadge',
			importSource: './status-badge.tsrx',
			importedName: 'StatusBadge',
		}),
	]);
});

test('a barrel module reports the re-exports a linker has to follow', async () => {
	const barrel = await compile(
		`export { default as root } from './checkbox-root.tsrx';
export * as forms from './forms/index.ts';`,
		'src/checkbox/index.ts',
	);

	expect(barrel.semanticGraph.moduleGraphInterface.reexports).toEqual([
		{ exportName: 'root', source: './checkbox-root.tsrx', importedName: 'default' },
		{ exportName: 'forms', source: './forms/index.ts', importedName: '*' },
	]);
});
