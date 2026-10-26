import { computed, state } from '@markless/core';

export function KeyedValuesPage() @{
	let scores = state(new Map([[3, { label: 'three', n: 1 }]]));
	let seen = state({ days: new Set([7, 9]), at: new Date('2026-01-02T00:00:00.000Z') });
	const total = computed(() => [...scores.values()].reduce((sum, entry) => sum + entry.n, 0));
	const label = computed(() => scores.get(3)?.label ?? 'missing');
	const days = computed(() => [...seen.days].join('+'));
	<section>
		<span data-total>{total}</span>
		<span data-label>{label}</span>
		<span data-days>{days}</span>
		<span data-year>{seen.at.getUTCFullYear()}</span>
		<button data-put onClick={() => { scores.set(10, { label: 'ten', n: 10 }); }}>put</button>
		<button data-day onClick={() => { seen.days.add(11); }}>day</button>
	</section>
}
