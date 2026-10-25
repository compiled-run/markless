import { computed, state } from '@markless/core';
import { slow } from '../src/slow.ts';

export default function EmptyArmPage() @{
	let filter = state('');
	const words = computed(async () => (await slow('alpha beta', 100)).text.split(' '));
	const shown = computed(() => {
		const all: string[] = Array.isArray(words) ? words : [];
		const f = filter;
		return all.filter((w) => w.includes(f)).map((w, i) => ({ id: i, w }));
	});

	<main>
		<input data-filter value={filter} onInput={(event) => (filter = (event.target as HTMLInputElement).value)} />
		<ul data-list>
			@try {
				@for (const row of shown; key row.id) {
					<li data-row>{row.w}</li>
				} @empty {
					<li data-none>none</li>
				}
			} @pending {
				<li data-pending>loading</li>
			}
		</ul>
	</main>
}
