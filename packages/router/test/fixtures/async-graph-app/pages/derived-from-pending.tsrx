import { computed } from '@markless/core';
import { slow } from '../src/slow.ts';

export default function DerivedFromPendingPage() @{
	const list = computed(async () => (await slow('alpha beta')).text.split(' '));
	const upper = computed(() => {
		const all: string[] = list;
		return [...all].map((w, i) => ({ id: i, w: w.toUpperCase() }));
	});

	<main>
		<ul data-derived>
			@try {
				@for (const row of upper; key row.id) {
					<li>{row.w}</li>
				}
			} @pending {
				<li data-pending>pending</li>
			}
		</ul>
	</main>
}
