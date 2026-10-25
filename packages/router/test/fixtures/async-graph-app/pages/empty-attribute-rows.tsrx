import { computed, state } from '@markless/core';
import { slow } from '../src/slow.ts';

export default function EmptyAttributeRowsPage() @{
	let filter = state('');
	let view = state('{}');
	const words = computed(async () => (await slow('alpha beta', 100)).text.split(' '));
	const shown = computed(() => {
		const all: string[] = Array.isArray(words) ? words : [];
		const f = filter;
		return all.filter((w) => w.includes(f)).map((w, i) => ({ id: i, w, href: `/x?v=${view}` }));
	});

	<main>
		<input data-filter value={filter} onInput={(event) => { filter = (event.target as HTMLInputElement).value; view = JSON.stringify({ f: filter }); }} />
		<ul data-list>
			@try {
				@for (const row of shown; key row.id) {
					<li><a href={row.href}>{row.w}</a></li>
				}
			} @pending {
				<li data-pending>loading</li>
			}
		</ul>
	</main>
}
