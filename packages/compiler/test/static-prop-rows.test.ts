import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Which keyed lists over a prop show rows the browser never reads back, and which
// placements fix that prop: only then does a render drop the list's served data.

async function compile(source: string, importedModuleInterfaces?: Record<string, unknown>) {
	return compileTsrxModule({
		filename: 'src/Lists.tsrx',
		source,
		symbols: [],
		...(importedModuleInterfaces ? { importedModuleInterfaces } : {}),
	} as Parameters<typeof compileTsrxModule>[0]);
}

function staticRowProps(result: Awaited<ReturnType<typeof compile>>, componentName: string) {
	return result.moduleGraphInterface.render.components.find(
		(component) => component.componentName === componentName,
	)?.staticRowProps;
}

// Each placement's stamp, in the order the module places them.
function stamps(result: Awaited<ReturnType<typeof compile>>): string[] {
	return [
		...result.publicRenderModule.ssrModuleSource.matchAll(
			/marklessSsrStaticProps\(marklessSsrRenderContext,marklessSsrPlacedChild,(\{[^)]*\})\)/g,
		),
	].map((match) => match[1]!);
}

const ROWS = `
function Shelf({ books }) @{
	<ol>
		@for (const book of books; key book.isbn) {
			<li data-isbn={book.isbn}>{book.title}</li>
		}
	</ol>
}
`;

test('a list over a prop whose rows only show their item is a static-row list', async () => {
	const result = await compile(`${ROWS}
export default function Library() @{
	<main><Shelf books={[{ isbn: '1', title: 'One' }]} /></main>
}
`);
	expect(staticRowProps(result, 'Shelf')).toEqual(['books']);
	expect(stamps(result)).toEqual(['{"fixed":["books"]}']);
});

test('a module constant, and a prop forwarded one and two components deep, are fixed', async () => {
	const result = await compile(`${ROWS}
const stock = [{ isbn: '2', title: 'Two' }];
function Aisle({ books }) @{
	<section><Shelf books={books} /></section>
}
function Wing({ titles }) @{
	<div><Aisle books={titles} /></div>
}
export default function Library() @{
	<main>
		<Shelf books={stock} />
		<Aisle books={stock} />
		<Wing titles={stock} />
	</main>
}
`);
	expect(staticRowProps(result, 'Aisle')).toEqual(['books']);
	expect(staticRowProps(result, 'Wing')).toEqual(['titles']);
	expect(stamps(result).sort()).toEqual(
		[
			'{"from":[["books","books"]]}',
			'{"from":[["books","titles"]]}',
			'{"fixed":["books"]}',
			'{"fixed":["books"]}',
			'{"fixed":["titles"]}',
		].sort(),
	);
});

test('a changing value, an @if arm, a row and a spread fix nothing', async () => {
	const result = await compile(`${ROWS}
import { state } from '@markless/core';
const stock = [{ isbn: '3', title: 'Three' }];
export default function Library({ rest }) @{
	let picked = state([{ isbn: '4', title: 'Four' }]);
	let open = state(true);
	<main>
		<Shelf books={picked} />
		@if (open) {
			<Shelf books={stock} />
		}
		@for (const group of stock; key group.isbn) {
			<Shelf books={stock} />
		}
		<Shelf books={stock} {...rest} />
		<button onClick={() => { open = !open; picked = []; }}>toggle</button>
	</main>
}
`);
	expect(staticRowProps(result, 'Shelf')).toEqual(['books']);
	expect(stamps(result)).toEqual([]);
});

test('rows the browser reads back keep their list: a handler, an @if, a written collection', async () => {
	const handled = await compile(`
import { state } from '@markless/core';
export default function Picker({ options }) @{
	let chosen = state('');
	<ul>
		@for (const option of options; key option.id) {
			<li onClick={() => (chosen = option.id)}>{option.label}</li>
		}
	</ul>
	<p>{chosen}</p>
}
`);
	expect(staticRowProps(handled, 'Picker')).toBeUndefined();
	const branched = await compile(`
export default function Badges({ badges }) @{
	<ul>
		@for (const badge of badges; key badge.id) {
			<li>
				@if (badge.gold) {
					<b>{badge.label}</b>
				} @else {
					<span>{badge.label}</span>
				}
			</li>
		}
	</ul>
}
`);
	expect(staticRowProps(branched, 'Badges')).toBeUndefined();
	const written = await compile(`
export default function Queue({ jobs }) @{
	<ul>
		@for (const job of jobs; key job.id) {
			<li>{job.name}</li>
		}
	</ul>
	<button onClick={() => jobs.push({ id: String(jobs.length), name: 'new' })}>add</button>
}
`);
	expect(staticRowProps(written, 'Queue')).toBeUndefined();
});

test("an imported child is stamped only when its module's interface names the prop", async () => {
	const source = `
import Shelf from './shelf.tsrx';
const stock = [{ isbn: '5', title: 'Five' }];
export default function Library() @{
	<main><Shelf books={stock} /></main>
}
`;
	const shelfInterface = (staticRowProps?: ReadonlyArray<string>) => ({
		'./shelf.tsrx': {
			render: {
				components: [
					{ componentName: 'Shelf', exportName: 'default', ...(staticRowProps ? { staticRowProps } : {}) },
				],
			},
		},
	});
	expect(stamps(await compile(source, shelfInterface(['books'])))).toEqual(['{"fixed":["books"]}']);
	expect(stamps(await compile(source, shelfInterface()))).toEqual([]);
	expect(stamps(await compile(source))).toEqual([]);
});
