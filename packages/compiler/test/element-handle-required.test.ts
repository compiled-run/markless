import { expect, test, vi } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// `element<T>()` types `clip.play()` without `?.`, so the compiler holds it to
// being on the page whenever its component is; `element<T | undefined>()` opts out.

const header = `import { computed, element, shared, state } from '@markless/core';\n`;

async function graphOf(body: string, importedModuleInterfaces?: Record<string, never>) {
	return await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: header + body,
		...(importedModuleInterfaces ? { importedModuleInterfaces } : {}),
	});
}

const absent = (graph: Awaited<ReturnType<typeof graphOf>>) =>
	graph.diagnostics.filter((diagnostic) => diagnostic.code === 'MARKLESS_ELEMENT_HANDLE_MAYBE_ABSENT');

const regions: ReadonlyArray<readonly [string, string, string]> = [
	['@if', 'let open = state(false);', '@if (open) { <p el={note}>a</p> }'],
	['@if', 'let open = state(false);', '@if (open) { <p>a</p> } @else { <p el={note}>b</p> }'],
	['@switch', "let mode = state('a');", "@switch (mode) { @case 'a': { <p el={note}>a</p> } @default: { <p>b</p> } }"],
	['@try', 'const data = computed(async () => 1);', '@try { <p el={note}>{data}</p> } @pending { <p>wait</p> }'],
	['@pending', 'const data = computed(async () => 1);', '@try { <p>{data}</p> } @pending { <p el={note}>wait</p> }'],
	['@catch', 'const data = computed(async () => 1);', '@try { <p>{data}</p> } @catch (e) { <p el={note}>failed</p> }'],
];

test.each(regions)('a required handle bound inside %s is refused with the fix', async (region, setup, markup) => {
	const graph = await graphOf(`export function App() @{
	${setup}
	const note = element<HTMLParagraphElement>();
	<>${markup}<button onClick={() => note?.focus()}>Go</button></>
}`);

	const [diagnostic, ...rest] = absent(graph);
	expect(rest).toEqual([]);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain(`el={note} on line 5 is inside ${region}`);
	expect(diagnostic?.message).toContain('Declare it element<HTMLParagraphElement | undefined>()');
});

test.each(regions)('the same handle declared | undefined is accepted inside %s', async (_region, setup, markup) => {
	const graph = await graphOf(`export function App() @{
	${setup}
	const note = element<HTMLParagraphElement | undefined>();
	<>${markup}<button onClick={() => note?.focus()}>Go</button></>
}`);

	expect(absent(graph)).toEqual([]);
});

test('a handle bound outside every region is required and accepted', async () => {
	const graph = await graphOf(`export function App() @{
	const clip = element<HTMLVideoElement>();
	<><video el={clip} /><button onClick={() => clip.play()}>Play</button></>
}`);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.graphBindings.find((binding) => binding.name === 'clip')?.optional).toBeUndefined();
	expect(graph.elementHandleBindings[0]?.absentWhen).toBeUndefined();
});

test('a singular handle in a @for row stays the duplicate refusal', async () => {
	const graph = await graphOf(`export function App() @{
	let items = state([1, 2]);
	const row = element<HTMLLIElement>();
	<ul>@for (const item of items; key item) { <li el={row}>{item}</li> }</ul>
}`);

	expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['MARKLESS_ELEMENT_HANDLE_DUPLICATE']);
});

test('children of a component that always renders them are present', async () => {
	const graph = await graphOf(`function Card(props: { children?: unknown }) @{
	<div>{props.children}</div>
}
function Frame(props: { children?: unknown }) @{
	<section><Card>{props.children}</Card></section>
}
export function App() @{
	const clip = element<HTMLVideoElement>();
	<Frame><video el={clip} /></Frame>
}`);

	expect(absent(graph)).toEqual([]);
	expect(graph.moduleGraphInterface.render.components.map((c) => [c.componentName, c.childrenAlwaysRendered])).toEqual([
		['Card', true],
		['Frame', true],
		['App', undefined],
	]);
});

test('children of a component that renders them only sometimes are refused, through a wrapper too', async () => {
	const graph = await graphOf(`function Drawer(props: { open: boolean; children?: unknown }) @{
	<div>@if (props.open) { <>{props.children}</> }</div>
}
function Frame(props: { children?: unknown }) @{
	<section><Drawer open={true}>{props.children}</Drawer></section>
}
export function App() @{
	const clip = element<HTMLVideoElement>();
	<Frame><video el={clip} /></Frame>
}`);

	expect(absent(graph).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('inside children passed to <Frame>, and <Frame> does not always render them'),
	]);
});

test('children of an imported component count as present only when its interface says so', async () => {
	const layout = await buildSemanticGraph({
		filename: 'src/layout.tsrx',
		source: `export function Layout(props: { children?: unknown }) @{ <main>{props.children}</main> }`,
	});
	const app = `import { Layout } from './layout.tsrx';
export function App() @{
	const clip = element<HTMLVideoElement>();
	<Layout><video el={clip} /></Layout>
}`;

	expect(absent(await graphOf(app, { './layout.tsrx': layout.moduleGraphInterface } as never))).toEqual([]);
	expect(absent(await graphOf(app))).toHaveLength(1);
});

test('a handle created in a shared() factory must be declared | undefined', async () => {
	const graph = await graphOf(`const family = shared(() => {
	const triggerEl = element<HTMLButtonElement>();
	const panelEl = element<HTMLDivElement | undefined>();
	return { triggerEl, panelEl };
});
export function Trigger() @{
	const f = family();
	<button el={f.triggerEl}>Open</button>
}`);

	expect(absent(graph).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('"triggerEl" on line 3 is created in a shared() factory'),
	]);
});

test('a factory adopted from another module is checked only where it is written', async () => {
	const factory = await buildSemanticGraph({
		filename: 'src/family.tsrx',
		source: `${header}export const family = shared(() => { const triggerEl = element<HTMLButtonElement>(); return { triggerEl }; });`,
	});
	expect(absent(factory)).toHaveLength(1);

	const consumer = await graphOf(
		`import { family } from './family.tsrx';
export function Trigger() @{
	const f = family();
	<button el={f.triggerEl}>Open</button>
}`,
		{ './family.tsrx': factory.moduleGraphInterface } as never,
	);
	expect(absent(consumer)).toEqual([]);
});

test('a handle bound by another component is refused in the declaring one', async () => {
	const graph = await graphOf(`function Field(props: { field: HTMLInputElement }) @{
	<input el={props.field} />
}
export function App() @{
	const field = element<HTMLInputElement>();
	<><Field field={field} /><button onClick={() => field.focus()}>Go</button></>
}`);

	expect(absent(graph).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('"field" on line 3 is bound by Field, not by App'),
	]);
});

test('a required handle that is never bound is refused', async () => {
	const graph = await graphOf(`export function App() @{
	const clip = element<HTMLVideoElement>();
	<button onClick={() => clip.play()}>Play</button>
}`);

	expect(absent(graph).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('"clip" on line 3 is never bound with el={clip}'),
	]);
});

test('an alias of T | undefined reads as required, like the array spelling', async () => {
	const graph = await graphOf(`type Maybe = HTMLParagraphElement | undefined;
export function App() @{
	let open = state(false);
	const note = element<Maybe>();
	<>@if (open) { <p el={note}>a</p> }</>
}`);

	expect(absent(graph)).toHaveLength(1);
});

test('element<T[] | undefined>() is refused: an array handle is never undefined', async () => {
	const graph = await graphOf(`export function App() @{
	const rows = element<HTMLLIElement[] | undefined>();
	<ul><li el={rows}>a</li></ul>
}`);

	const refusal = graph.diagnostics.find((diagnostic) => diagnostic.code === 'MARKLESS_ELEMENT_HANDLE_ARRAY_OPTIONAL');
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('Declare it element<HTMLLIElement[]>()');
});

async function clickHandler(declaration: string) {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `${header}export function App() @{
	${declaration}
	<><video el={clip} /><button onClick={() => clip?.play()}>Play</button></>
}`,
		symbols: [],
	});
	const module = result.symbolModules.modules.find((candidate) => candidate.kind === 'event-handler');
	const body = module!.source.replace('export function symbol_0', 'return function symbol_0');
	return (dev: boolean, element: { play(): void } | undefined) =>
		new Function('__MARKLESS_DEV_ENABLED__', body)(dev)({ getElementHandle: () => element });
}

test('a required handle whose component is gone does nothing, and warns by name in development', async () => {
	const run = await clickHandler('const clip = element<HTMLVideoElement>();');
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		expect(() => run(true, undefined)).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('"clip" is not on the page');

		warn.mockClear();
		run(false, undefined);
		expect(warn).not.toHaveBeenCalled();

		const play = vi.fn();
		run(true, { play });
		expect(play).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	} finally {
		warn.mockRestore();
	}
});

test('a handle declared | undefined stays quiet when it is missing', async () => {
	const run = await clickHandler('const clip = element<HTMLVideoElement | undefined>();');
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		run(true, undefined);
		expect(warn).not.toHaveBeenCalled();
	} finally {
		warn.mockRestore();
	}
});
