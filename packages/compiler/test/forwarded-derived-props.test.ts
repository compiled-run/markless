import { expect, test } from 'vitest';
import { compileTsrxModule, type ModuleGraphInterfaceArtifact } from '../src/index.ts';

// A component whose computed reads a prop publishes it, and a module forwarding its own prop
// into that component publishes its own prop in turn, so each composer serves the value.

const leaf = `import { computed, state } from '@markless/core';
export function Swatch({ hue, tone, note }: { readonly hue: string; readonly tone: string; readonly note: string }) @{
	const seen = state({ count: 0 });
	const caption = computed(() => tone + ':' + seen.count);
	<i title={hue} onClick={() => { seen.count = note.length; }}>{caption}</i>
}`;

async function compile(
	filename: string,
	source: string,
	imports: Record<string, ModuleGraphInterfaceArtifact> = {},
) {
	const result = await compileTsrxModule({
		filename,
		source,
		symbols: [],
		importedModuleInterfaces: imports,
	});
	return result.moduleGraphInterface;
}

function derivedProps(moduleInterface: ModuleGraphInterfaceArtifact, componentName: string) {
	return moduleInterface.render.components.find(
		(component) => component.componentName === componentName,
	)?.derivedProps;
}

test('a forwarded prop a computed reads is published by every module it passes through', async () => {
	const swatch = await compile('src/ui/swatch.tsrx', leaf);
	expect(derivedProps(swatch, 'Swatch')).toEqual(['tone']);

	const row = await compile(
		'src/ui/row.tsrx',
		`import { Swatch } from './swatch.tsrx';
export function Row({ shade, memo }: { readonly shade: string; readonly memo: string }) @{
	<li><Swatch hue="red" tone={shade} note={memo} /></li>
}`,
		{ './swatch.tsrx': swatch },
	);
	expect(derivedProps(row, 'Row')).toEqual(['shade']);

	const list = await compile(
		'src/ui/list.tsrx',
		`import Row from './row-default.tsrx';
export default function List({ heading }: { readonly heading: string }) @{
	<ul><Row shade={heading} memo="fixed" /></ul>
}`,
		{
			'./row-default.tsrx': {
				...row,
				render: {
					...row.render,
					components: row.render.components.map((component) => ({
						...component,
						exportName: 'default',
					})),
				},
			},
		},
	);
	expect(derivedProps(list, 'List')).toEqual(['heading']);
});

test('forwarding inside one module publishes the outer prop, and a prop only a handler reads is not published', async () => {
	const panel = await compile(
		'src/panel.tsrx',
		`import { computed, state } from '@markless/core';
export function Panel({ title, footer }: { readonly title: string; readonly footer: string }) @{
	<section><Item label={title} extra={footer} /></section>
}
function Item({ label, extra }: { readonly label: string; readonly extra: string }) @{
	const open = state({ on: false });
	const summary = computed(() => (open.on ? '-' : '+') + label);
	<p onClick={() => { open.on = extra !== ''; }}>{summary}</p>
}`,
	);
	expect(derivedProps(panel, 'Item')).toEqual(['label']);
	expect(derivedProps(panel, 'Panel')).toEqual(['title']);
});

test('a component that places itself publishes without looping', async () => {
	const tree = await compile(
		'src/tree.tsrx',
		`import { computed, state } from '@markless/core';
export function Node({ name }: { readonly name: string }) @{
	const open = state({ on: false });
	const label = computed(() => name + (open.on ? '!' : ''));
	<div>{label}@if (open.on) {<Node name={name} />}</div>
}`,
	);
	expect(derivedProps(tree, 'Node')).toEqual(['name']);
});

test('a list a component iterates and forwards to a derive is still published', async () => {
	const counter = await compile(
		'src/count.tsrx',
		`import { computed, state } from '@markless/core';
export function Count({ entries }: { readonly entries: ReadonlyArray<string> }) @{
	const hits = state({ n: 0 });
	const total = computed(() => entries.length + hits.n);
	<b>{total}</b>
}`,
	);
	const listing = await compile(
		'src/listing.tsrx',
		`import { Count } from './count.tsrx';
export function Listing({ rows }: { readonly rows: ReadonlyArray<string> }) @{
	<ol>@for (const row of rows; key row) {<li>{row}</li>}<Count entries={rows} /></ol>
}`,
		{ './count.tsrx': counter },
	);
	expect(derivedProps(listing, 'Listing')).toEqual(['rows']);
});
