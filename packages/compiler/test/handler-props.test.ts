import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { ModuleGraphInterfaceArtifact } from '../src/artifacts.ts';

// semantic-graph: each component's `handlerProps` on the module interface, and the
// module-constant `@for` lift that reads them for a component its rows render.

async function compile(
	source: string,
	importedModuleInterfaces?: Record<string, ModuleGraphInterfaceArtifact>,
	filename = 'src/page.tsrx',
) {
	return compileTsrxModule({
		filename,
		source,
		symbols: [],
		...(importedModuleInterfaces ? { importedModuleInterfaces } : {}),
	});
}

const handlerProps = (compiled: Awaited<ReturnType<typeof compile>>) =>
	Object.fromEntries(
		compiled.moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			component.handlerProps ?? [],
		]),
	);

const collections = (compiled: Awaited<ReturnType<typeof compile>>) =>
	compiled.semanticGraph.keyedRepeats.map((repeat) => repeat.collectionGraphNodeId ?? null);

test('a handler reading a destructured prop, a props member, or the props object whole', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export function Named({ label, tone }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = label; }}>{tone}</button>
}
export function Member(props) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = props.title; }}>{props.hint}</button>
}
export function Whole(props) @{
	const seen = state({ text: '' });
	const send = () => { seen.text = JSON.stringify(props); };
	<button onClick={send}>go</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Named: ['label'], Member: ['title'], Whole: ['*'] });
});

test('a handler parameter that shadows a prop reads nothing of the props', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export function Shadowed({ value }) @{
	const seen = state({ text: '' });
	<input value={value} onInput={(value) => { seen.text = String(value); }} />
}
`);
	expect(handlerProps(compiled)).toEqual({ Shadowed: [] });
});

test('a prop handed to a child counts when the child reads it in a handler, here or in another module', async () => {
	const leaf = await compile(
		`import { state } from '@markless/core';
export function Leaf({ name, size }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = name; }}>{size}</button>
}
`,
		undefined,
		'src/leaf.tsrx',
	);
	expect(handlerProps(leaf)).toEqual({ Leaf: ['name'] });
	const compiled = await compile(
		`import { Leaf } from './leaf.tsrx';
function Local({ caption }) @{
	<Leaf name={caption} size="s" />
}
export function Outer({ heading, width }) @{
	<section><Local caption={heading} /><Leaf name="fixed" size={width} /></section>
}
`,
		{ './leaf.tsrx': leaf.moduleGraphInterface },
	);
	expect(handlerProps(compiled)).toEqual({ Local: ['caption'], Outer: ['heading'] });
});

const ROW_PAGE = (rowBody: string) => `import { state } from '@markless/core';
const shelves = ['east', 'west'];
function Shelf({ label, tone }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = label; }}>{tone}</button>
}
export default function Page() @{
	<main>
		@for (const shelf of shelves; key shelf) {
			${rowBody}
		}
	</main>
}
`;

test('a module-constant list goes on the graph when a row component reads the row item in a handler', async () => {
	expect(collections(await compile(ROW_PAGE('<Shelf label={shelf} tone="t" />')))).toEqual([
		expect.stringContaining('templateExpression'),
	]);
	expect(
		collections(await compile(ROW_PAGE('<div><Shelf label={shelf.toUpperCase()} tone="t" /></div>'))),
	).toEqual([expect.stringContaining('templateExpression')]);
});

test('a module-constant list stays off the graph when the row item feeds only a prop the child prints', async () => {
	expect(collections(await compile(ROW_PAGE('<Shelf label="fixed" tone={shelf} />')))).toEqual([null]);
});

test('a callback prop handed straight to an event attribute is a prop the handler reads', async () => {
	const compiled = await compile(`export function Pick({ onPick, label }) @{
	<button onClick={onPick}>{label}</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Pick: ['onPick'] });
});

test('a wrapper spreading its props into a child reads what the child\'s handlers read', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
function Leaf({ label, tone }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = label; }}>{tone}</button>
}
export function Spreads(props) @{
	<Leaf {...props} />
}
export function Rests({ tone, ...rest }) @{
	<div data-tone={tone}><Leaf tone={tone} {...rest} /></div>
}
`);
	expect(handlerProps(compiled)).toEqual({ Leaf: ['label'], Spreads: ['label'], Rests: ['label'] });
});

test('a row placing a member tag of a local object lifts its list like the component it names', async () => {
	const compiled = await compile(
		ROW_PAGE('<parts.shelf label={shelf} tone="t" />').replace(
			'export default function Page',
			'const parts = { shelf: Shelf };\nexport default function Page',
		),
	);
	expect(collections(compiled)).toEqual([expect.stringContaining('templateExpression')]);
});

test('a row spreading its item into a child whose handlers read a prop lifts its list', async () => {
	const compiled = await compile(
		ROW_PAGE('<Shelf {...{ label: shelf }} tone="t" />'),
	);
	expect(collections(compiled)).toEqual([expect.stringContaining('templateExpression')]);
});

test('a local destructured out of a prop is a read of that prop', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export function Pair({ item: { name }, pair: [first] }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = name + first; }}>pick</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Pair: ['item', 'pair'] });
});

test('a handler reaching a prop through a body local it calls or reads still reads that prop', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export function Through({ label, tone, size }) @{
	const seen = state({ text: '' });
	const loud = label.toUpperCase();
	function record() { seen.text = loud + tone; }
	<button onClick={() => record()}>{size}</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Through: ['label', 'tone'] });
});

test('a computed destructuring key counts as reading every prop', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
const KEY = 'label';
export function Keyed({ [KEY]: picked }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = picked; }}>pick</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Keyed: ['*'] });
});

test('a prop handed on through a body-local alias still reaches the child it is forwarded to', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
function Leaf({ label }) @{
	const seen = state({ text: '' });
	<button onClick={() => { seen.text = label; }}>go</button>
}
export function Wrapper({ heading }) @{
	const text = heading;
	<Leaf label={text} />
}
`);
	expect(handlerProps(compiled)).toEqual({ Leaf: ['label'], Wrapper: ['heading'] });
});

test('a handler reading state a prop seeded reads the served state, not the prop', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export function Seeded({ value }) @{
	const day = state({ value });
	<button onClick={() => { day.value = day.value + '!'; }}>{day.value}</button>
}
`);
	expect(handlerProps(compiled)).toEqual({ Seeded: [] });
});
