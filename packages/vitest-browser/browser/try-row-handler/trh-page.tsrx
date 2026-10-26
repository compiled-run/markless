import { computed, state } from '@markless/core';

const rows = async (order: ReadonlyArray<number>) =>
	order.map((i) => ({ id: `k${i}`, text: `row ${i}` }));

export default function TryRowHandlerPage() @{
	let order = state([0, 1]);
	let picked = state('');
	const list = computed(async () => {
		const current = order;
		return rows(current);
	});
	<main>
		<button type="button" data-more onClick={() => (order = [...order, order.length])}>more</button>
		<button type="button" data-reverse onClick={() => (order = [...order].reverse())}>reverse</button>
		<p data-picked>picked {picked}</p>
		@try {
			@for (const r of list; key r.id) {
				<p data-row onClick={() => (picked = r.text)}>{r.text}</p>
			}
		} @catch {
			<p>failed</p>
		}
	</main>
}
