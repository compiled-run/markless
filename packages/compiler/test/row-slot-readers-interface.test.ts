import { expect, test } from 'vitest';
import {
	compileTsrxModule,
	importedNestedRepeats,
	importedRowComponentMints,
	importedRowSlotReaders,
	importedRowTemplateMints,
} from '../src/index.ts';

/**
 * A repeat whose rows fill an expression slot is rebuilt through its component's
 * render-data reader, so the page that places that component - however deep the
 * import chain - has to hand its resumed runtime the render-data surface. The
 * module interface is how the page learns it.
 */
const chooserSource = `import { state } from '@markless/core';
export function Chooser() @{
	let picks = state<{ id: string; label: string }[]>([]);
	<ol>@for (const pick of picks; key pick.id) { <li>{\`#\${pick.label}\`}</li> }</ol>
}
`;

test('a component owning an expression-slot repeat says so on its interface', async () => {
	const chooser = await compileTsrxModule({
		filename: 'src/chooser.tsrx',
		source: chooserSource,
		symbols: [],
	});
	expect(chooser.moduleGraphInterface.render.components).toEqual([
		expect.objectContaining({ componentName: 'Chooser', rowSlotReader: true }),
	]);

	const panel = await compileTsrxModule({
		filename: 'src/panel.tsrx',
		source: `import { Chooser } from './chooser.tsrx';
export function Panel() @{
	<section><Chooser /></section>
}
export function Plain() @{
	<p>plain</p>
}
`,
		symbols: [],
		importedModuleInterfaces: { './chooser.tsrx': chooser.moduleGraphInterface },
	});
	const byName = Object.fromEntries(
		panel.moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			component.rowSlotReader,
		]),
	);
	expect(byName).toEqual({ Panel: true, Plain: undefined });
	expect(importedRowSlotReaders({ './panel.tsrx': panel.moduleGraphInterface })).toBe(true);
});

test('an item-only row template leaves the interface as it was', async () => {
	const plain = await compileTsrxModule({
		filename: 'src/plain-rows.tsrx',
		source: chooserSource.replace('{`#${pick.label}`}', '{pick.label}'),
		symbols: [],
	});
	expect(plain.moduleGraphInterface.render.components[0]).not.toHaveProperty('rowSlotReader');
	expect(importedRowSlotReaders({ './plain-rows.tsrx': plain.moduleGraphInterface })).toBe(false);
});

// Resume never evaluates a child module's client code, so the page itself must install the
// component-row mint when any component it places builds rows that render a component.
test('a component owning component rows says so, and so does every page that places it', async () => {
	const list = await compileTsrxModule({
		filename: 'src/list.tsrx',
		source: `type Row = { readonly id: string; readonly title: string };
export function List({ rows }: { readonly rows: readonly Row[] }) @{
	<ul>@for (const row of rows; key row.id) { <Item row={row} /> }</ul>
}
function Item({ row }: { readonly row: Row }) @{
	<li>{row.title}</li>
}
`,
		symbols: [],
	});
	expect(list.moduleGraphInterface.render.components).toContainEqual(
		expect.objectContaining({ componentName: 'List', rowComponentMint: true }),
	);

	const page = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { state } from '@markless/core';
import { List } from './list.tsrx';
export default function Page() @{
	let rows = state([{ id: 'a', title: 'A' }]);
	<main><List rows={rows} /></main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './list.tsrx': list.moduleGraphInterface },
	});
	expect(page.moduleGraphInterface.render.components).toContainEqual(
		expect.objectContaining({ componentName: 'Page', rowComponentMint: true }),
	);
	expect(importedRowComponentMints({ './list.tsrx': list.moduleGraphInterface })).toBe(true);
	expect(
		importedRowComponentMints({
			'./chooser.tsrx': (
				await compileTsrxModule({
					filename: 'src/chooser.tsrx',
					source: chooserSource,
					symbols: [],
				})
			).moduleGraphInterface,
		}),
	).toBe(false);
});

// The plain template mint and nested-row wiring are installed by the module that owns the repeat,
// which resume never evaluates for an imported component, so the placing page installs them.
test('item-only and nested rows reach the page that places their component', async () => {
	const tree = await compileTsrxModule({
		filename: 'src/deep/tree.tsrx',
		source: `export type Field = { readonly name: string; readonly items: readonly string[] };
export function Tree({ fields }: { readonly fields: readonly Field[] }) @{
	<ul>@for (const field of fields; key field.name) { <li>{field.name}<ol>@for (const item of field.items; key item) { <li>{item}</li> }</ol></li> }</ul>
}
`,
		symbols: [],
	});
	expect(tree.moduleGraphInterface.render.components).toEqual([
		expect.objectContaining({
			componentName: 'Tree',
			rowTemplateMint: true,
			nestedRepeats: true,
		}),
	]);
	const page = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { Tree } from './deep/tree.tsrx';
export function Page() @{
	<main><Tree fields={[]} /></main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './deep/tree.tsrx': tree.moduleGraphInterface },
	});
	const interfaces = { './page.tsrx': page.moduleGraphInterface };
	expect(importedRowTemplateMints(interfaces)).toBe(true);
	expect(importedNestedRepeats(interfaces)).toBe(true);
	expect(importedRowTemplateMints({})).toBe(false);
});
