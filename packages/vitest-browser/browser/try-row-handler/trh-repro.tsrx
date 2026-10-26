// Press "more", then click "row 2": a row the re-settled @try added picks its own row.
import { computed, state } from '@markless/core';

const rows = async (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, text: `row ${i}` }));

export default function TryRowHandlerLocal() @{
	let n = state(2);
	let picked = state('');
	const list = computed(async () => {
		const count = n;
		return rows(count);
	});
	<main>
		<button onClick={() => n++}>more</button>
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
