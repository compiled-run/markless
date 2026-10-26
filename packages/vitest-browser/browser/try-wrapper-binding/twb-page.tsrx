import { computed, state } from '@markless/core';

const rows = async (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, text: `row ${i}` }));

export default function TryWrapperBindingPage() @{
	let n = state(0);
	const list = computed(async () => {
		const count = n;
		return rows(count);
	});
	<main>
		<button type="button" data-more onClick={() => n++}>more</button>
		<button type="button" data-clear onClick={() => (n = 0)}>clear</button>
		@try {
			<ul data-list hidden={list.length === 0}>
				@for (const r of list; key r.id) {
					<li>{r.text}</li>
				}
			</ul>
		} @catch {
			<p>failed</p>
		}
	</main>
}
