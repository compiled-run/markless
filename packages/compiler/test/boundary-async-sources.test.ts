import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function boundaryAsyncSources(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return result.protocolView.asyncBoundaries.map((boundary) => boundary.asyncSources);
}

test('a boundary names the async values each sync computed it shows depends on', async () => {
	const sources = await boundaryAsyncSources(`
import { computed, state } from '@markless/core';

export function Page() @{
	let sort = state('new');
	const posts = computed(async () => {
		const by = sort;
		return [{ id: by }];
	});
	const heading = computed(() => posts.length + ' ' + sort);

	<main>
		@try {
			<>
				<h2>{heading}</h2>
				<ul>
					@for (const post of posts; key post.id) {
						<li>{post.id}</li>
					}
				</ul>
			</>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Broken</p>
		}
	</main>
}
`);
	expect(sources).toEqual([{ 'computed:heading': ['computed:posts'] }]);
});

test('sync hops and attribute expressions resolve to the async value they read', async () => {
	const sources = await boundaryAsyncSources(`
import { computed, state } from '@markless/core';

export function Ledger() @{
	let desk = state(2);
	const quote = computed(async () => {
		const at = desk;
		return { units: at * 3 };
	});
	const doubled = computed(() => quote.units * 2);
	const label = computed(() => 'x' + doubled);

	<section>
		@try {
			<dl>
				<dt class={quote.units > 4 ? 'wide' : 'narrow'}>Units</dt>
				<dd>{label}</dd>
			</dl>
		} @pending {
			<p>Wait</p>
		} @catch {
			<p>Failed</p>
		}
	</section>
}
`);
	expect(sources).toHaveLength(1);
	const entries = Object.entries(sources[0] ?? {});
	expect(
		Object.fromEntries(entries.filter(([id]) => !id.startsWith('computed:templateExpression'))),
	).toEqual({
		'computed:doubled': ['computed:quote'],
		'computed:label': ['computed:quote'],
	});
	expect(
		entries
			.filter(([id]) => id.startsWith('computed:templateExpression'))
			.map(([, reads]) => reads),
	).toEqual([['computed:quote']]);
});

test('a boundary whose bindings read async values directly carries no source map', async () => {
	const sources = await boundaryAsyncSources(`
import { computed, state } from '@markless/core';

export function Card() @{
	let id = state(1);
	const person = computed(async () => {
		const at = id;
		return { name: 'P' + at };
	});

	<article>
		@try {
			<h3>{person.name}</h3>
		} @pending {
			<p>Wait</p>
		} @catch {
			<p>Failed</p>
		}
	</article>
}
`);
	expect(sources).toEqual([undefined]);
});
