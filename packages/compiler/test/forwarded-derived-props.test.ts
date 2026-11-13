import { expect, test } from 'vitest';
import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	type ModuleGraphInterfaceArtifact,
} from '../src/index.ts';

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

function derivedPropPaths(moduleInterface: ModuleGraphInterfaceArtifact, componentName: string) {
	return moduleInterface.render.components.find(
		(component) => component.componentName === componentName,
	)?.derivedPropPaths;
}

// The paths a derive reads below a prop travel with it, so a composer serves only those fields.
test('the fields a derive reads are published across modules, and a whole read publishes none', async () => {
	const badge = await compile(
		'src/ui/badge.tsrx',
		`import { computed, state } from '@markless/core';
export function Badge({ person, tags }: { readonly person: { readonly first: string; readonly email: string }; readonly tags: ReadonlyArray<string> }) @{
	const seen = state({ n: 0 });
	const text = computed(() => person.first + tags.join(',') + seen.n);
	<i onClick={() => { seen.n++; }}>{text}</i>
}`,
	);
	expect(derivedProps(badge, 'Badge')).toEqual(['person', 'tags']);
	expect(derivedPropPaths(badge, 'Badge')).toEqual({ person: [['first']] });

	const card = await compile(
		'src/ui/card.tsrx',
		`import { Badge } from './badge.tsrx';
export function Card({ owner, labels }: { readonly owner: { readonly profile: { readonly first: string } }; readonly labels: ReadonlyArray<string> }) @{
	<article><Badge person={owner.profile} tags={labels} /></article>
}`,
		{ './badge.tsrx': badge },
	);
	expect(derivedProps(card, 'Card')).toEqual(['owner', 'labels']);
	expect(derivedPropPaths(card, 'Card')).toEqual({ owner: [['profile', 'first']] });
});

test('a component that forwards a field of its prop into itself serves that field whole, without looping', async () => {
	const tree = await compile(
		'src/branch.tsrx',
		`import { computed, state } from '@markless/core';
export function Branch({ node }: { readonly node: { readonly label: string; readonly next: unknown } }) @{
	const open = state({ on: false });
	const label = computed(() => node.label + (open.on ? '!' : ''));
	<div>{label}@if (open.on) {<Branch node={node.next} />}</div>
}`,
	);
	expect(derivedProps(tree, 'Branch')).toEqual(['node']);
	expect(derivedPropPaths(tree, 'Branch')).toEqual({ node: [['label'], ['next']] });
});

test('a forwarded prop named like an Object.prototype member is read whole when no path names it', async () => {
	const leaf = await compile(
		'src/ui/leaf.tsrx',
		`import { computed, state } from '@markless/core';
export function Leaf({ constructor, info }: { readonly constructor: string; readonly info: { readonly id: string } }) @{
	const seen = state({ n: 0 });
	const text = computed(() => constructor + info.id + seen.n);
	<i onClick={() => { seen.n++; }}>{text}</i>
}`,
	);
	expect(derivedPropPaths(leaf, 'Leaf')).toEqual({ info: [['id']] });
	const holder = await compile(
		'src/ui/holder.tsrx',
		`import { Leaf } from './leaf.tsrx';
export function Holder({ kind, data }: { readonly kind: string; readonly data: { readonly id: string } }) @{
	<div><Leaf constructor={kind} info={data} /></div>
}`,
		{ './leaf.tsrx': leaf },
	);
	expect(derivedProps(holder, 'Holder')).toEqual(['kind', 'data']);
	expect(derivedPropPaths(holder, 'Holder')).toEqual({ data: [['id']] });
});

// A child's browser reads of a live-routed prop go to the composer's node, so the composer carries
// every prop the child reads back: what an arm shows as well as what a derive reads.
test('a prop an arm shows and a runner reads is published, and the composer carries it on its own path', async () => {
	const detail = await compile(
		'src/detail.tsrx',
		`import { computed, state } from '@markless/core';
async function fetchNote(slug: string, tab: string, round: number) { return slug + tab + round; }
export function Detail({ slug, place }: { readonly slug: string; readonly place: { readonly search: string } }) @{
	let round = state(1);
	const note = computed(async () => fetchNote(slug, place.search, round));
	<section>
		@try {<p>{note}</p>} @pending {<p>loading {slug}</p>}
		<button onClick={() => round++}>again</button>
	</section>
}`,
	);
	const component = detail.render.components.find((entry) => entry.componentName === 'Detail');
	expect(component?.derivedProps).toEqual(['slug', 'place']);
	expect(component?.derivedPropPaths).toEqual({ place: [['search']] });

	const page = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { Detail } from './detail.tsrx';
export default function Page({ params, url }: { readonly params: { readonly id: string }; readonly url: { readonly search: string; readonly pathname: string } }) @{
	<main><Detail slug={params.id} place={url} /></main>
}`,
		symbols: [],
		importedModuleInterfaces: { './detail.tsrx': detail },
	});
	expect(page.publicRenderModule.ssrModuleSource).toContain(
		'"deriveKeys":["params","url"],"derivePaths":{"params":[["id"]],"url":[["search"]]}',
	);
});

test('an async runner reads a prop it reads only through members along those member paths', async () => {
	const result = await compileTsrxModule({
		filename: 'src/detail.tsrx',
		source: `import { computed } from '@markless/core';
async function fetchNote(tab: string, at: string) { return tab + at; }
export function Detail({ place }: { readonly place: { readonly search: string; readonly pathname: string } }) @{
	const note = computed(async () => fetchNote(new URLSearchParams(place.search).get('tab') ?? '', place.pathname.slice(1)));
	@try {<p>{note}</p>} @pending {<p>loading</p>}
}`,
		symbols: [],
	});
	const runner = result.symbolModules.modules.find((module) => module.kind === 'async-computed-runner');
	expect(runner?.source).toContain('read("prop:props", ["place", "search"])');
	expect(runner?.source).toContain('read("prop:props", ["place", "pathname"])');
	expect(runner?.source).not.toContain('read("prop:props", ["place"])');
	// Where `place` ends in each path is the analyzer's record; it stays out of what the page is served.
	expect(
		result.semanticGraph.graphBindings.find((binding) => binding.name === 'note')?.dependencies?.map((dependency) => dependency.local),
	).toEqual([
		{ name: 'place', members: 1 },
		{ name: 'place', members: 1 },
	]);
	expect(JSON.stringify([result.protocolState, result.protocolView])).not.toContain('"local"');
});

// Same structure, renamed: the name is destructured from a prop of the prop, so its own path is two segments deep.
test('a runner reads a member of a name destructured from a nested prop along the whole path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/report.tsrx',
		source: `import { computed } from '@markless/core';
async function fetchReport(region: string) { return region; }
export function Report({ filters }: { readonly filters: { readonly area: { readonly region: string } } }) @{
	const { area } = filters;
	const report = computed(async () => fetchReport(area.region));
	@try {<p>{report}</p>} @pending {<p>loading</p>}
}`,
		symbols: [],
	});
	const runner = result.symbolModules.modules.find((module) => module.kind === 'async-computed-runner');
	expect(runner?.source).toContain('read("prop:props", ["filters", "area", "region"])');
	expect(runner?.source).not.toContain('read("prop:props", ["filters", "area"])');
});

// A whole-bag read cannot be routed to the page, and the child's own cell drops routed keys, so the build refuses it rather than ship undefined fields.
test('an async value handed the whole props bag, named or spread, is refused at build', async () => {
	for (const [signature, argument] of [
		['props: Props', 'props'],
		['{ ...rest }: Props', '{ ...rest }'],
	]) {
		const result = await compileTsrxModule({
			filename: 'src/detail.tsrx',
			source: `import { computed, state } from '@markless/core';
type Props = { readonly slug: string; readonly place: { readonly search: string } };
async function fetchNote(bag: Props, round: number) { return bag.slug + bag.place.search + round; }
export function Detail(${signature}) @{
	let round = state(1);
	const note = computed(async () => fetchNote(${argument}, round));
	<section>@try {<p>{note}</p>} @pending {<p>loading</p>}<button onClick={() => round++}>again</button></section>
}`,
			symbols: [],
		});
		expect(
			collectTsrxModuleDiagnostics(result)
				.filter((diagnostic) => diagnostic.severity === 'error')
				.map((diagnostic) => diagnostic.code),
		).toEqual(['MARKLESS_CAPTURE_OPAQUE_PROP']);
	}
});

// A gate the compiler mints over a @try's values reads each of them by name, as an authored runner does.
test('a minted boundary gate runner declares every value it waits on', async () => {
	const result = await compileTsrxModule({
		filename: 'src/pair.tsrx',
		source: `import { computed } from '@markless/core';
async function load(name: string) { return name; }
export function Pair() @{
	const left = computed(async () => await load('left'));
	const right = computed(async () => await load('right'));
	@try {
		<div>
			<p>{left} {right}</p>
			<button onClick={async () => await load('save')}>Save</button>
		</div>
	} @pending {
		<p>loading</p>
	} @catch (error) {
		<p>{error.message}</p>
	}
}`,
		symbols: [],
	});
	const gate = result.semanticGraph.graphBindings.find((binding) => binding.name.startsWith('marklessAsyncGate'));
	expect(gate?.dependencies?.map((dependency) => dependency.local)).toEqual([
		{ name: 'left', members: 0 },
		{ name: 'right', members: 0 },
	]);
	const runners = result.symbolModules.modules.filter((module) => module.kind === 'async-computed-runner');
	const gateRunner = runners.find((module) => module.source.includes('[left, right]'));
	expect(gateRunner?.source).toContain('const left = read("computed:left"');
	expect(gateRunner?.source).toContain('const right = read("computed:right"');
});

