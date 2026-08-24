import { expect, test } from 'vitest';
import type { ModuleGraphInterfaceArtifact } from '../src/artifacts.ts';
import { compileTsrxModule } from '../src/index.ts';

type RenderComponent = ModuleGraphInterfaceArtifact['render']['components'][number];

// The module-graph interface publishes where a component's `{children}` hole
// sits among the elements beside it, so an importer can place the children it
// passes while compiling. Nothing reads these fields yet: these tests pin the
// facts, and the counts are of ELEMENTS - text never shifts a child position.
async function components(source: string): Promise<ReadonlyArray<RenderComponent>> {
	const result = await compileTsrxModule({ filename: 'src/App.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.moduleGraphInterface.render.components;
}

async function component(source: string, name: string): Promise<RenderComponent> {
	const found = (await components(source)).find((entry) => entry.componentName === name);
	if (!found) throw new Error(`no interface entry for ${name}`);
	return found;
}

test('a navbar that ends in {children} reports nothing after the hole', async () => {
	const navbar = await component(
		`export function Navbar({ children }) @{
	<nav><a href="/">Logo</a>{children}</nav>
}`,
		'Navbar',
	);

	expect(navbar.elementCount).toBe(1);
	expect(navbar.projection).toEqual({
		elementsBeforeProjection: 1,
		elementsAfterProjection: 0,
		projectionInsideConstruct: false,
	});
});

test('static text beside the hole never shifts the projected children', async () => {
	const banner = await component(
		`export function Banner({ children, label }) @{
	<p>hello <b>there</b> {label} {children}</p>
}`,
		'Banner',
	);

	// One element before it - the <b>. The bare text and the `{label}` slot each
	// occupy a child index and render no element.
	expect(banner.projection).toEqual({
		elementsBeforeProjection: 1,
		elementsAfterProjection: 0,
		projectionInsideConstruct: false,
	});
});

test('a component with no {children} publishes an element count and no projection', async () => {
	const card = await component(
		`export function Card() @{
	<article><h2>Title</h2></article>
}`,
		'Card',
	);

	expect(card.elementCount).toBe(1);
	expect(card.projection).toBeUndefined();
});

test('a toaster whose @if arms disagree reports an unknown count after the hole', async () => {
	const toaster = await component(
		`export function Toaster({ children, open }) @{
	<div>
		{children}
		@if (open) { <span>badge</span> }
	</div>
}`,
		'Toaster',
	);

	// The `else` arm is empty, so the site renders one element or none: nothing
	// this module can state, and 'unknown' absorbs the whole side.
	expect(toaster.projection).toEqual({
		elementsBeforeProjection: 0,
		elementsAfterProjection: 'unknown',
		projectionInsideConstruct: false,
	});
	// The arms still publish their own counts.
	expect(
		toaster.childChunks
			.filter((chunk) => chunk.kind === 'branch-arm')
			.map((chunk) => chunk.elementCount),
	).toEqual([1, 0]);
});

test('an @if whose arms agree on one element resolves the count after the hole', async () => {
	const toast = await component(
		`export function Toast({ children, open }) @{
	<div>
		{children}
		@if (open) { <span>a</span> } @else { <em>b</em> }
	</div>
}`,
		'Toast',
	);

	expect(toast.projection).toEqual({
		elementsBeforeProjection: 0,
		elementsAfterProjection: 1,
		projectionInsideConstruct: false,
	});
});

test('a hole inside an @if arm says so and names the arm chunk', async () => {
	const panel = await component(
		`export function Panel({ children, open }) @{
	<div>
		@if (open) { <section><p>a</p>{children}</section> }
	</div>
}`,
		'Panel',
	);

	expect(panel.projection).toEqual({
		elementsBeforeProjection: 1,
		elementsAfterProjection: 0,
		projectionInsideConstruct: true,
		projectionChunkId: 'branch:branch-site:0:arm:0',
	});
});

test('a child component after the hole counts the elements it renders', async () => {
	const panel = await component(
		`function Row() @{ <li>x</li> }
export function Panel({ children }) @{
	<div>{children}<Row /></div>
}`,
		'Panel',
	);

	expect(panel.projection).toEqual({
		elementsBeforeProjection: 0,
		elementsAfterProjection: 1,
		projectionInsideConstruct: false,
	});
});

test('a chain of child edges composes into one element count', async () => {
	const outer = await component(
		`function Inner() @{ <b>i</b> }
function Middle() @{ <Inner /> }
export function Outer({ children }) @{
	<div>{children}<Middle /></div>
}`,
		'Outer',
	);

	// Middle renders Inner renders one element, so the whole chain is one.
	expect(outer.projection).toEqual({
		elementsBeforeProjection: 0,
		elementsAfterProjection: 1,
		projectionInsideConstruct: false,
	});
});

test('a child component from a module this compile never saw absorbs the count', async () => {
	const panel = await component(
		`import { Row } from './row.tsrx';
export function Panel({ children }) @{
	<div>{children}<Row /></div>
}`,
		'Panel',
	);

	expect(panel.projection).toEqual({
		elementsBeforeProjection: 0,
		elementsAfterProjection: 'unknown',
		projectionInsideConstruct: false,
	});
});

test('a repeat after the hole absorbs the count', async () => {
	const feed = await component(
		`export function Feed({ children, rows }) @{
	<div>
		{children}
		@for (const row of rows; key row.id) { <p>{row.id}</p> }
	</div>
}`,
		'Feed',
	);

	expect(feed.projection?.elementsAfterProjection).toBe('unknown');
	// The side the repeat does not touch stays a number.
	expect(feed.projection?.elementsBeforeProjection).toBe(0);
});
