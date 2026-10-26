// Press "more": the rows show inside a wrapper whose attribute reads the async value.
import { computed, state } from '@markless/core';

const rows = async (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, text: `row ${i}` }));

export default function TryWrapperBinding() @{
	let n = state(0);
	const list = computed(async () => {
		const count = n;
		return rows(count);
	});
	<main>
		<button onClick={() => n++}>more</button>
		@try {
			<ul hidden={list.length === 0}>
				@for (const r of list; key r.id) {
					<li>{r.text}</li>
				}
			</ul>
		} @catch {
			<p>failed</p>
		}
	</main>
}
